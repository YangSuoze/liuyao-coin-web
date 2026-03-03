import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type RefObject } from 'react'

export type GesturePhase =
  | 'disabled'
  | 'loading'
  | 'ready'
  | 'armed'
  | 'cooldown'
  | 'error'

export interface GestureState {
  phase: GesturePhase
  statusText: string
  error?: string
}

interface UseHandGestureTossOptions {
  enabled: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onGestureTrigger: () => void
  cooldownMs?: number
  armTimeoutMs?: number
}

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const DEFAULT_COOLDOWN_MS = 2000
const DEFAULT_ARM_TIMEOUT_MS = 2800

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function isFingerExtended(
  landmarks: NormalizedLandmark[],
  tip: number,
  pip: number,
  mcp: number,
): boolean {
  return landmarks[tip].y < landmarks[pip].y && landmarks[pip].y < landmarks[mcp].y
}

type HandPose = 'open' | 'fist' | 'unknown'

function classifyHandPose(landmarks: NormalizedLandmark[]): HandPose {
  const wrist = landmarks[0]
  const fingerDefs: Array<[number, number, number]> = [
    [8, 6, 5],
    [12, 10, 9],
    [16, 14, 13],
    [20, 18, 17],
  ]

  const extendedCount = fingerDefs.reduce((count, [tip, pip, mcp]) => {
    return count + (isFingerExtended(landmarks, tip, pip, mcp) ? 1 : 0)
  }, 0)

  const thumbTipDistance = distance(landmarks[4], wrist)
  const thumbIpDistance = distance(landmarks[3], wrist)
  const thumbExtended = thumbTipDistance > thumbIpDistance * 1.2

  const averageTipDistance = [4, 8, 12, 16, 20].reduce((sum, tipIdx) => {
    return sum + distance(landmarks[tipIdx], wrist)
  }, 0)

  const normalizedTipDistance = averageTipDistance / 5
  const totalExtended = extendedCount + (thumbExtended ? 1 : 0)

  if (totalExtended >= 4 && normalizedTipDistance > 0.24) {
    return 'open'
  }

  if (totalExtended <= 1 && normalizedTipDistance < 0.18) {
    return 'fist'
  }

  return 'unknown'
}

export function useHandGestureToss({
  enabled,
  videoRef,
  onGestureTrigger,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  armTimeoutMs = DEFAULT_ARM_TIMEOUT_MS,
}: UseHandGestureTossOptions): GestureState {
  const [state, setState] = useState<GestureState>({
    phase: 'disabled',
    statusText: 'Camera is off. Use manual toss.',
  })

  const lastStateRef = useRef<GestureState>(state)

  const pushState = (next: GestureState): void => {
    const prev = lastStateRef.current
    if (
      prev.phase === next.phase &&
      prev.statusText === next.statusText &&
      prev.error === next.error
    ) {
      return
    }

    lastStateRef.current = next
    setState(next)
  }

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    let rafId: number | undefined
    let handLandmarker: HandLandmarker | null = null

    let stage: 'await_open' | 'await_fist' = 'await_open'
    let armedAt = 0
    let cooldownUntil = 0

    // simple debounce: require pose to be stable for a few consecutive frames
    let lastPose: HandPose = 'unknown'
    let stableCount = 0
    const requireStableFrames = 3

    const detect = (): void => {
      if (cancelled) {
        return
      }

      const video = videoRef.current
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        pushState({
          phase: 'ready',
          statusText: 'Waiting for camera frames...',
        })
        rafId = window.requestAnimationFrame(detect)
        return
      }

      const now = performance.now()

      if (now < cooldownUntil) {
        pushState({
          phase: 'cooldown',
          statusText: 'Gesture accepted. Cooldown...',
        })
        rafId = window.requestAnimationFrame(detect)
        return
      }

      const result = handLandmarker?.detectForVideo(video, now)
      const landmarks = result?.landmarks?.[0]

      if (!landmarks) {
        pushState({
          phase: 'ready',
          statusText: 'No hand detected. Show open palm.',
        })
        rafId = window.requestAnimationFrame(detect)
        return
      }

      const pose = classifyHandPose(landmarks)

      if (pose === lastPose) {
        stableCount += 1
      } else {
        lastPose = pose
        stableCount = 1
      }

      const isStable = stableCount >= requireStableFrames

      if (stage === 'await_open') {
        if (pose === 'open' && isStable) {
          stage = 'await_fist'
          armedAt = now
          pushState({
            phase: 'armed',
            statusText: 'Open palm captured. Close fist to toss.',
          })
        } else {
          pushState({
            phase: 'ready',
            statusText: 'Show open palm to arm gesture toss.',
          })
        }
        rafId = window.requestAnimationFrame(detect)
        return
      }

      if (pose === 'fist' && isStable) {
        stage = 'await_open'
        cooldownUntil = now + cooldownMs
        pushState({
          phase: 'cooldown',
          statusText: 'Fist detected. Toss triggered.',
        })
        onGestureTrigger()
      } else if (now - armedAt > armTimeoutMs) {
        stage = 'await_open'
        pushState({
          phase: 'ready',
          statusText: 'Gesture timed out. Show open palm again.',
        })
      } else {
        pushState({
          phase: 'armed',
          statusText: 'Now close your fist to confirm toss.',
        })
      }

      rafId = window.requestAnimationFrame(detect)
    }

    const init = async (): Promise<void> => {
      pushState({
        phase: 'loading',
        statusText: 'Loading MediaPipe hand model...',
      })

      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
        if (cancelled) {
          return
        }

        handLandmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_PATH,
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })

        if (cancelled) {
          handLandmarker.close()
          return
        }

        pushState({
          phase: 'ready',
          statusText: 'Gesture control ready. Show open palm.',
        })

        detect()
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown gesture init error'

        pushState({
          phase: 'error',
          statusText: 'Gesture detector unavailable.',
          error: message,
        })
      }
    }

    void init()

    return () => {
      cancelled = true
      if (typeof rafId === 'number') {
        window.cancelAnimationFrame(rafId)
      }
      handLandmarker?.close()
    }
  }, [enabled, onGestureTrigger, videoRef])

  return state
}
