import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { VisionConfig } from '../config/types'

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
  visionConfig?: VisionConfig
}

const ENV_WASM_BASE_URL = 'VITE_GESTURE_WASM_BASE_URL'
const ENV_MODEL_ASSET_URL = 'VITE_GESTURE_MODEL_ASSET_URL'
const DEFAULT_LOCAL_WASM_BASE = '/mediapipe-wasm/'
const DEFAULT_CDN_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm/'
const DEFAULT_MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
type VisionRunningMode = 'IMAGE' | 'VIDEO'
const RUNNING_MODE: VisionRunningMode = 'VIDEO'

const DEFAULT_COOLDOWN_MS = 2000
const DEFAULT_ARM_TIMEOUT_MS = 2800

type VisionEnvKey = typeof ENV_WASM_BASE_URL | typeof ENV_MODEL_ASSET_URL

interface ResolvedVisionAssetConfig {
  wasmBaseCandidates: string[]
  modelAssetCandidates: string[]
  warnings: string[]
}

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

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return 'Unknown error'
}

function readStringEnv(name: VisionEnvKey): string | undefined {
  const value = import.meta.env[name]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function addUnique(values: string[], next: string): void {
  if (!values.includes(next)) {
    values.push(next)
  }
}

function normalizeAssetReference(
  rawReference: string,
  label: string,
  isBasePath: boolean,
): string {
  const trimmed = rawReference.trim()
  if (!trimmed) {
    throw new Error(`${label} is empty`)
  }

  const parsed = new URL(trimmed, window.location.origin)
  const isCrossOrigin = parsed.origin !== window.location.origin

  if (isCrossOrigin && parsed.protocol !== 'https:') {
    throw new Error(
      `${label} must use HTTPS for cross-origin fetches: ${parsed.toString()}`,
    )
  }

  if (isBasePath) {
    if (parsed.search.length > 0 || parsed.hash.length > 0) {
      throw new Error(`${label} must not include query or hash fragments`)
    }
    parsed.pathname = ensureTrailingSlash(parsed.pathname)
  }

  if (!isCrossOrigin) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  }

  return parsed.toString()
}

function resolveVisionAssetConfig(
  visionConfig?: VisionConfig,
): ResolvedVisionAssetConfig {
  const warnings: string[] = []
  const wasmBaseCandidates: string[] = []
  const modelAssetCandidates: string[] = []

  const addCandidate = (
    list: string[],
    rawValue: string | undefined,
    label: string,
    isBasePath: boolean,
  ): void => {
    if (!rawValue) {
      return
    }

    try {
      addUnique(list, normalizeAssetReference(rawValue, label, isBasePath))
    } catch (error) {
      warnings.push(formatError(error))
    }
  }

  addCandidate(
    wasmBaseCandidates,
    readStringEnv(ENV_WASM_BASE_URL),
    `Env ${ENV_WASM_BASE_URL}`,
    true,
  )
  addCandidate(
    wasmBaseCandidates,
    visionConfig?.wasmBaseUrl,
    'config vision.wasmBaseUrl',
    true,
  )
  addCandidate(
    wasmBaseCandidates,
    DEFAULT_LOCAL_WASM_BASE,
    'default local wasm path',
    true,
  )
  addCandidate(
    wasmBaseCandidates,
    DEFAULT_CDN_WASM_BASE,
    'default CDN wasm path',
    true,
  )

  addCandidate(
    modelAssetCandidates,
    readStringEnv(ENV_MODEL_ASSET_URL),
    `Env ${ENV_MODEL_ASSET_URL}`,
    false,
  )
  addCandidate(
    modelAssetCandidates,
    visionConfig?.modelAssetUrl,
    'config vision.modelAssetUrl',
    false,
  )
  addCandidate(
    modelAssetCandidates,
    DEFAULT_MODEL_ASSET_URL,
    'default model path',
    false,
  )

  return {
    wasmBaseCandidates,
    modelAssetCandidates,
    warnings,
  }
}

function toAbsoluteUrl(reference: string): URL {
  return new URL(reference, window.location.origin)
}

function resolveFetchMode(target: URL): RequestMode {
  return target.origin === window.location.origin ? 'same-origin' : 'cors'
}

async function probeFetchableAsset(
  assetUrl: string,
  label: string,
): Promise<void> {
  const target = toAbsoluteUrl(assetUrl)

  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      mode: resolveFetchMode(target),
      credentials: 'omit',
      cache: 'no-store',
    })

    if (response.body) {
      await response.body.cancel().catch(() => undefined)
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch (error) {
    const message = formatError(error)
    if (message.includes('Failed to fetch')) {
      throw new Error(
        `${label} fetch failed at ${target.toString()} (possible HTTPS/CORS/network issue).`,
      )
    }
    throw new Error(
      `${label} probe failed at ${target.toString()}: ${message}`,
    )
  }
}

async function probeWasmBase(wasmBasePath: string): Promise<void> {
  const baseUrl = toAbsoluteUrl(ensureTrailingSlash(wasmBasePath))
  const probeUrl = new URL('vision_wasm_internal.js', baseUrl).toString()
  await probeFetchableAsset(probeUrl, 'MediaPipe WASM asset')
}

function buildInitFailureMessage(
  warnings: string[],
  attemptErrors: string[],
): string {
  const parts: string[] = ['Failed to initialize MediaPipe gesture detector.']
  if (warnings.length > 0) {
    parts.push(`Config warnings: ${warnings.join(' | ')}`)
  }
  if (attemptErrors.length > 0) {
    parts.push(`Attempts: ${attemptErrors.join(' | ')}`)
  }
  parts.push(
    `Override URLs via config.json vision.wasmBaseUrl/vision.modelAssetUrl or env ${ENV_WASM_BASE_URL}/${ENV_MODEL_ASSET_URL}.`,
  )
  return parts.join(' ')
}

export function useHandGestureToss({
  enabled,
  videoRef,
  onGestureTrigger,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  armTimeoutMs = DEFAULT_ARM_TIMEOUT_MS,
  visionConfig,
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
        const resolvedAssets = resolveVisionAssetConfig(visionConfig)
        const attemptErrors: string[] = []

        for (const wasmBasePath of resolvedAssets.wasmBaseCandidates) {
          if (cancelled) {
            return
          }

          pushState({
            phase: 'loading',
            statusText: `Loading MediaPipe runtime from ${wasmBasePath}`,
          })

          try {
            await probeWasmBase(wasmBasePath)
            const fileset = await FilesetResolver.forVisionTasks(
              ensureTrailingSlash(wasmBasePath),
            )

            for (const modelAssetUrl of resolvedAssets.modelAssetCandidates) {
              if (cancelled) {
                return
              }

              pushState({
                phase: 'loading',
                statusText: `Loading hand model from ${modelAssetUrl}`,
              })

              try {
                await probeFetchableAsset(modelAssetUrl, 'MediaPipe model asset')

                handLandmarker = await HandLandmarker.createFromOptions(
                  fileset,
                  {
                    baseOptions: {
                      modelAssetPath: modelAssetUrl,
                    },
                    runningMode: RUNNING_MODE,
                    numHands: 1,
                    minHandDetectionConfidence: 0.7,
                    minHandPresenceConfidence: 0.6,
                    minTrackingConfidence: 0.6,
                  },
                )

                if (cancelled) {
                  handLandmarker.close()
                  return
                }

                pushState({
                  phase: 'ready',
                  statusText: 'Gesture control ready. Show open palm.',
                })

                detect()
                return
              } catch (error) {
                attemptErrors.push(
                  `model ${modelAssetUrl} (wasm ${wasmBasePath}): ${formatError(error)}`,
                )
              }
            }
          } catch (error) {
            attemptErrors.push(
              `wasm ${wasmBasePath}: ${formatError(error)}`,
            )
          }
        }

        throw new Error(
          buildInitFailureMessage(resolvedAssets.warnings, attemptErrors),
        )
      } catch (error) {
        const message = formatError(error)

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
  }, [enabled, onGestureTrigger, videoRef, cooldownMs, armTimeoutMs, visionConfig])

  return state
}
