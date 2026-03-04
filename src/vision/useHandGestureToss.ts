import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
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
  gestureControl: GestureControl
  error?: string
}

export interface GestureControl {
  power: number
  speed: number
  lastSampleAt: number
  verticalVelocity: number
  palmSpan: number
}

export interface GestureEntropySnapshot {
  seed: number
  seedHex: string
  power: number
  speed: number
  verticalVelocity: number
  velocityEnergy: number
  palmSpanMean: number
  palmSpanRange: number
  sampleCount: number
  capturedAt: number
}

export interface GestureTriggerPayload {
  control: GestureControl
  entropy: GestureEntropySnapshot
}

interface UseHandGestureTossOptions {
  enabled: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onGestureTrigger: (payload: GestureTriggerPayload) => void
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
const DEFAULT_GESTURE_CONTROL: GestureControl = {
  power: 0.55,
  speed: 0.5,
  lastSampleAt: 0,
  verticalVelocity: 0,
  palmSpan: 0.17,
}

type VisionEnvKey = typeof ENV_WASM_BASE_URL | typeof ENV_MODEL_ASSET_URL

interface ResolvedVisionAssetConfig {
  wasmBaseCandidates: string[]
  modelAssetCandidates: string[]
  warnings: string[]
}

interface MotionSample {
  palmCenterY: number
  palmSpan: number
  at: number
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

function clamp01(value: number): number {
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}

function measureMotionSample(
  landmarks: NormalizedLandmark[],
  at: number,
): MotionSample {
  return {
    palmCenterY: (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3,
    palmSpan: distance(landmarks[5], landmarks[17]),
    at,
  }
}

function updateGestureControl(
  previousSample: MotionSample | null,
  nextSample: MotionSample,
  currentControl: GestureControl,
): GestureControl {
  const proximity = clamp01((nextSample.palmSpan - 0.09) / 0.16)
  let verticalVelocity = 0

  let rawPower = clamp01(0.34 + proximity * 0.46)
  let rawSpeed = clamp01(0.32 + proximity * 0.36)

  if (previousSample) {
    const dt = Math.max(1, nextSample.at - previousSample.at)
    verticalVelocity = (previousSample.palmCenterY - nextSample.palmCenterY) / dt
    const upward = clamp01(Math.max(0, verticalVelocity) * 220)
    const downward = clamp01(Math.max(0, -verticalVelocity) * 220)
    const movementEnergy = clamp01((upward + downward) * 0.5)

    rawPower = clamp01(upward * 0.74 + proximity * 0.26)
    rawSpeed = clamp01(downward * 0.74 + movementEnergy * 0.16 + proximity * 0.1)
  }

  const alpha = previousSample ? 0.32 : 0.55

  return {
    power: clamp01(lerp(currentControl.power, rawPower, alpha)),
    speed: clamp01(lerp(currentControl.speed, rawSpeed, alpha)),
    lastSampleAt: Date.now(),
    verticalVelocity: lerp(currentControl.verticalVelocity, verticalVelocity, 0.34),
    palmSpan: lerp(currentControl.palmSpan, nextSample.palmSpan, 0.34),
  }
}

function mixSeed(seed: number, value: number): number {
  let mixed = (seed ^ (value >>> 0)) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0
  return (mixed ^ (mixed >>> 16)) >>> 0
}

function quantize(value: number, scale: number): number {
  return Math.round(value * scale) | 0
}

function deriveGestureEntropySnapshot(
  control: GestureControl,
  history: MotionSample[],
): GestureEntropySnapshot {
  const samples = history.slice(-48)
  const velocities: number[] = []

  for (let idx = 1; idx < samples.length; idx += 1) {
    const previous = samples[idx - 1]
    const current = samples[idx]
    const dt = Math.max(1, current.at - previous.at)
    velocities.push((previous.palmCenterY - current.palmCenterY) / dt)
  }

  const palmSpanMean =
    samples.length > 0
      ? samples.reduce((sum, sample) => sum + sample.palmSpan, 0) / samples.length
      : control.palmSpan

  const palmSpanMin = samples.reduce(
    (min, sample) => Math.min(min, sample.palmSpan),
    Number.POSITIVE_INFINITY,
  )
  const palmSpanMax = samples.reduce(
    (max, sample) => Math.max(max, sample.palmSpan),
    Number.NEGATIVE_INFINITY,
  )

  const palmSpanRange =
    Number.isFinite(palmSpanMin) && Number.isFinite(palmSpanMax)
      ? palmSpanMax - palmSpanMin
      : 0

  const latestVelocity =
    velocities.length > 0 ? velocities[velocities.length - 1] : control.verticalVelocity
  const velocityEnergy =
    velocities.length > 0
      ? velocities.reduce((sum, velocity) => sum + Math.abs(velocity), 0) /
        velocities.length
      : Math.abs(control.verticalVelocity)

  let seed = 0x811c9dc5
  seed = mixSeed(seed, quantize(control.power, 1_000_000))
  seed = mixSeed(seed, quantize(control.speed, 1_000_000))
  seed = mixSeed(seed, quantize(latestVelocity, 1_000_000_000))
  seed = mixSeed(seed, quantize(velocityEnergy, 1_000_000_000))
  seed = mixSeed(seed, quantize(palmSpanMean, 1_000_000))
  seed = mixSeed(seed, quantize(palmSpanRange, 1_000_000))
  seed = mixSeed(seed, samples.length)

  for (let idx = 0; idx < samples.length; idx += 1) {
    const sample = samples[idx]
    seed = mixSeed(seed, quantize(sample.palmCenterY, 1_000_000))
    seed = mixSeed(seed, quantize(sample.palmSpan, 1_000_000))
    if (idx > 0) {
      const delta = sample.at - samples[idx - 1].at
      seed = mixSeed(seed, quantize(delta, 1_000))
    }
  }

  const normalizedSeed = seed === 0 ? 0x6d2b79f5 : seed
  return {
    seed: normalizedSeed,
    seedHex: normalizedSeed.toString(16).padStart(8, '0').toUpperCase(),
    power: control.power,
    speed: control.speed,
    verticalVelocity: latestVelocity,
    velocityEnergy,
    palmSpanMean,
    palmSpanRange,
    sampleCount: samples.length,
    capturedAt: Date.now(),
  }
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
    gestureControl: DEFAULT_GESTURE_CONTROL,
  })

  const lastStateRef = useRef<GestureState>(state)

  const pushState = useCallback((next: GestureState): void => {
    const prev = lastStateRef.current
    const sameControl =
      Math.abs(prev.gestureControl.power - next.gestureControl.power) < 0.003 &&
      Math.abs(prev.gestureControl.speed - next.gestureControl.speed) < 0.003 &&
      Math.abs(
        prev.gestureControl.verticalVelocity - next.gestureControl.verticalVelocity,
      ) < 0.00008 &&
      Math.abs(prev.gestureControl.palmSpan - next.gestureControl.palmSpan) < 0.0005 &&
      prev.gestureControl.lastSampleAt === next.gestureControl.lastSampleAt

    if (
      prev.phase === next.phase &&
      prev.statusText === next.statusText &&
      prev.error === next.error &&
      sameControl
    ) {
      return
    }

    lastStateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    if (!enabled) {
      pushState({
        phase: 'disabled',
        statusText: 'Camera is off. Use manual toss.',
        gestureControl: lastStateRef.current.gestureControl,
      })
      return
    }

    let cancelled = false
    let rafId: number | undefined
    let handLandmarker: HandLandmarker | null = null

    let stage: 'await_open' | 'await_fist' = 'await_open'
    let armedAt = 0
    let cooldownUntil = 0
    let liveControl = lastStateRef.current.gestureControl
    let previousSample: MotionSample | null = null
    let motionHistory: MotionSample[] = []

    // simple debounce: require pose to be stable for a few consecutive frames
    let lastPose: HandPose = 'unknown'
    let stableCount = 0
    const requireStableFrames = 3

    const publish = (
      phase: GesturePhase,
      statusText: string,
      error?: string,
    ): void => {
      pushState({
        phase,
        statusText,
        error,
        gestureControl: liveControl,
      })
    }

    const resetSampling = (): void => {
      previousSample = null
      motionHistory = []
    }

    const sampleControl = (
      landmarks: NormalizedLandmark[],
      at: number,
    ): void => {
      const nextSample = measureMotionSample(landmarks, at)
      liveControl = updateGestureControl(previousSample, nextSample, liveControl)
      previousSample = nextSample
      motionHistory.push(nextSample)
      if (motionHistory.length > 64) {
        motionHistory = motionHistory.slice(-64)
      }
    }

    const detect = (): void => {
      if (cancelled) {
        return
      }

      const video = videoRef.current
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        publish('ready', 'Waiting for camera frames...')
        rafId = window.requestAnimationFrame(detect)
        return
      }

      const now = performance.now()

      if (now < cooldownUntil) {
        publish('cooldown', 'Gesture accepted. Cooldown...')
        rafId = window.requestAnimationFrame(detect)
        return
      }

      const result = handLandmarker?.detectForVideo(video, now)
      const landmarks = result?.landmarks?.[0]

      if (!landmarks) {
        resetSampling()
        if (stage === 'await_fist') {
          if (now - armedAt > armTimeoutMs) {
            stage = 'await_open'
            publish('ready', 'Gesture timed out. Show open palm again.')
          } else {
            publish('armed', 'Hand lost. Keep your hand in frame, then close fist.')
          }
        } else {
          publish('ready', 'No hand detected. Show open palm.')
        }
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
          sampleControl(landmarks, now)
          publish(
            'armed',
            'Open palm captured. Move hand for power/speed, then close fist.',
          )
        } else {
          resetSampling()
          publish('ready', 'Show open palm to arm gesture toss.')
        }
        rafId = window.requestAnimationFrame(detect)
        return
      }

      if (pose === 'fist' && isStable) {
        stage = 'await_open'
        cooldownUntil = now + cooldownMs
        const entropy = deriveGestureEntropySnapshot(liveControl, motionHistory)
        resetSampling()
        publish('cooldown', 'Fist detected. Toss triggered.')
        onGestureTrigger({
          control: { ...liveControl },
          entropy,
        })
      } else if (now - armedAt > armTimeoutMs) {
        stage = 'await_open'
        resetSampling()
        publish('ready', 'Gesture timed out. Show open palm again.')
      } else {
        sampleControl(landmarks, now)
        publish(
          'armed',
          'Move hand up for height, down for spin speed, then close fist.',
        )
      }

      rafId = window.requestAnimationFrame(detect)
    }

    const init = async (): Promise<void> => {
      publish('loading', 'Loading MediaPipe hand model...')

      try {
        const resolvedAssets = resolveVisionAssetConfig(visionConfig)
        const attemptErrors: string[] = []

        for (const wasmBasePath of resolvedAssets.wasmBaseCandidates) {
          if (cancelled) {
            return
          }

          publish('loading', `Loading MediaPipe runtime from ${wasmBasePath}`)

          try {
            await probeWasmBase(wasmBasePath)
            const fileset = await FilesetResolver.forVisionTasks(
              ensureTrailingSlash(wasmBasePath),
            )

            for (const modelAssetUrl of resolvedAssets.modelAssetCandidates) {
              if (cancelled) {
                return
              }

              publish('loading', `Loading hand model from ${modelAssetUrl}`)

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

                publish('ready', 'Gesture control ready. Show open palm.')

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

        publish('error', 'Gesture detector unavailable.', message)
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
  }, [enabled, onGestureTrigger, videoRef, cooldownMs, armTimeoutMs, visionConfig, pushState])

  return state
}
