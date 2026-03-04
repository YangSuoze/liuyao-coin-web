import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CameraPanel } from './components/CameraPanel'
import { CoinTossPanel } from './components/CoinTossPanel'
import type { CoinAnimationConfig } from './components/Coin'
import { HexagramDisplay } from './components/HexagramDisplay'
import { InterpretationPanel } from './components/InterpretationPanel'
import { LineHistory } from './components/LineHistory'
import { TossLabPanel } from './components/TossLabPanel'
import { loadAppConfig } from './config/loadConfig'
import { DEFAULT_APP_CONFIG, type AppConfig } from './config/types'
import { buildInterpretationPrompt } from './llm/prompt'
import { requestInterpretation } from './llm/openaiClient'
import { coinsToLine, createFairPerturbedRng, randomCoinSide, tossThreeCoins } from './logic/coin'
import { computeHexagram } from './logic/hexagram'
import type { CoinSide, TossRecord } from './logic/types'
import {
  useHandGestureToss,
  type GestureControl,
  type GestureEntropySnapshot,
  type GestureTriggerPayload,
} from './vision/useHandGestureToss'

type AppView = 'toss' | 'result'
type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'liuyao-coin-theme'

const INITIAL_COINS: CoinSide[] = ['heads', 'tails', 'heads']
const INITIAL_MANUAL_CONTROL = {
  power: 0.56,
  speed: 0.52,
}

type TossControlInput = Pick<GestureControl, 'power' | 'speed'>

interface TossAnimationProfile {
  coinAnimation: CoinAnimationConfig
  tickIntervalMs: number
  ticks: number
}

interface TossEntropyDebug {
  source: 'manual' | 'gesture'
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

function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') {
      return stored
    }
  } catch {
    return 'dark'
  }

  return 'dark'
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

function randomFaces(): CoinSide[] {
  return Array.from({ length: 3 }, () => randomCoinSide())
}

function normalizeControl(control: TossControlInput): TossControlInput {
  return {
    power: clamp01(control.power),
    speed: clamp01(control.speed),
  }
}

function mixSeed(seed: number, value: number): number {
  let mixed = (seed ^ (value >>> 0)) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0
  return (mixed ^ (mixed >>> 16)) >>> 0
}

function toSeedHex(seed: number): string {
  const normalized = seed >>> 0
  return normalized.toString(16).padStart(8, '0').toUpperCase()
}

function createManualEntropySnapshot(
  control: TossControlInput,
  tossIndex: number,
): TossEntropyDebug {
  const now = Date.now()
  let seed = 0x9e3779b9
  seed = mixSeed(seed, Math.round(control.power * 1_000_000))
  seed = mixSeed(seed, Math.round(control.speed * 1_000_000))
  seed = mixSeed(seed, tossIndex)
  seed = mixSeed(seed, now)

  const normalizedSeed = seed === 0 ? 0x6d2b79f5 : seed
  return {
    source: 'manual',
    seed: normalizedSeed,
    seedHex: toSeedHex(normalizedSeed),
    power: control.power,
    speed: control.speed,
    verticalVelocity: 0,
    velocityEnergy: 0,
    palmSpanMean: 0,
    palmSpanRange: 0,
    sampleCount: 0,
    capturedAt: now,
  }
}

function fromGestureEntropy(
  source: 'manual' | 'gesture',
  fallbackControl: TossControlInput,
  entropy: GestureEntropySnapshot | undefined,
  tossIndex: number,
): TossEntropyDebug {
  if (!entropy) {
    return createManualEntropySnapshot(fallbackControl, tossIndex)
  }

  return {
    source,
    seed: entropy.seed,
    seedHex: entropy.seedHex,
    power: entropy.power,
    speed: entropy.speed,
    verticalVelocity: entropy.verticalVelocity,
    velocityEnergy: entropy.velocityEnergy,
    palmSpanMean: entropy.palmSpanMean,
    palmSpanRange: entropy.palmSpanRange,
    sampleCount: entropy.sampleCount,
    capturedAt: entropy.capturedAt,
  }
}

function buildTossAnimation(control: TossControlInput): TossAnimationProfile {
  const normalized = normalizeControl(control)
  const { power, speed } = normalized

  const launchHeight = Math.round(110 + power * 320)
  const spinDurationMs = Math.round(1480 - speed * 960)
  const rotateEndDeg = Math.round(1280 + power * 1920 + speed * 5520)

  const easing =
    speed > 0.66
      ? 'cubic-bezier(0.13, 0.96, 0.22, 1)'
      : power > 0.68
        ? 'cubic-bezier(0.09, 0.9, 0.24, 1)'
        : 'cubic-bezier(0.16, 0.82, 0.25, 1)'

  const tickIntervalMs = Math.round(52 + (1 - speed) * 38)
  const estimatedFlightMs = Math.round(860 + power * 780 - speed * 140)

  return {
    tickIntervalMs,
    ticks: Math.max(10, Math.round(estimatedFlightMs / tickIntervalMs)),
    coinAnimation: {
      launchHeight,
      spinDurationMs,
      easing,
      rotateMidDeg: Math.round(rotateEndDeg * 0.42),
      rotatePeakDeg: Math.round(rotateEndDeg * 0.84),
      rotateEndDeg,
      wobbleDeg: Math.round(12 + speed * 22 + power * 8),
    },
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('toss')
  const [theme, setTheme] = useState<ThemeMode>(() => readInitialTheme())
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG)
  const [configError, setConfigError] = useState<string>()

  const [question, setQuestion] = useState('')
  const [records, setRecords] = useState<TossRecord[]>([])
  const [coinFaces, setCoinFaces] = useState<CoinSide[]>(INITIAL_COINS)
  const [isAnimating, setIsAnimating] = useState(false)
  const [lastTrigger, setLastTrigger] = useState<'manual' | 'gesture'>()

  const [manualControl, setManualControl] = useState<TossControlInput>(
    INITIAL_MANUAL_CONTROL,
  )
  const [activeTossControl, setActiveTossControl] =
    useState<TossControlInput>(INITIAL_MANUAL_CONTROL)
  const [coinAnimation, setCoinAnimation] = useState<CoinAnimationConfig>(
    buildTossAnimation(INITIAL_MANUAL_CONTROL).coinAnimation,
  )

  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraError, setCameraError] = useState<string>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const spinTimerRef = useRef<number | null>(null)

  const [interpretation, setInterpretation] = useState('')
  const [interpretationError, setInterpretationError] = useState<string>()
  const [loadingInterpretation, setLoadingInterpretation] = useState(false)
  const [lastTossEntropy, setLastTossEntropy] = useState<TossEntropyDebug>()

  const lines = useMemo(() => records.map((record) => record.line), [records])
  const result = useMemo(() => {
    if (lines.length !== 6) {
      return null
    }
    return computeHexagram(lines)
  }, [lines])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore private browsing/localStorage restrictions.
    }
  }, [theme])

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const loaded = await loadAppConfig()
        if (!active) {
          return
        }
        setConfig(loaded)
      } catch (error) {
        if (!active) {
          return
        }
        setConfig(DEFAULT_APP_CONFIG)
        const message =
          error instanceof Error ? error.message : 'Unable to load config.json'
        setConfigError(message)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    if (!cameraEnabled) {
      stopCamera()
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser does not support camera access.')
      setCameraEnabled(false)
      return
    }

    let cancelled = false

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }

        setCameraError(undefined)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Camera permission denied'
        setCameraError(message)
        setCameraEnabled(false)
      }
    }

    void start()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [cameraEnabled, stopCamera])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  useEffect(() => {
    return () => {
      if (spinTimerRef.current !== null) {
        window.clearInterval(spinTimerRef.current)
      }
    }
  }, [])

  const toss = useCallback(
    (
      source: 'manual' | 'gesture',
      controlOverride?: TossControlInput,
      entropyOverride?: GestureEntropySnapshot,
    ) => {
      if (isAnimating || records.length >= 6) {
        return
      }

      const selectedControl = normalizeControl(controlOverride ?? manualControl)
      const animationProfile = buildTossAnimation(selectedControl)
      const tossEntropy = fromGestureEntropy(
        source,
        selectedControl,
        entropyOverride,
        records.length + 1,
      )
      const rng = createFairPerturbedRng(tossEntropy.seed)
      const finalCoins = tossThreeCoins(rng)

      setActiveTossControl(selectedControl)
      setCoinAnimation(animationProfile.coinAnimation)
      setIsAnimating(true)
      setLastTrigger(source)
      setLastTossEntropy(tossEntropy)
      setInterpretation('')
      setInterpretationError(undefined)

      let ticks = 0
      if (spinTimerRef.current !== null) {
        window.clearInterval(spinTimerRef.current)
      }

      spinTimerRef.current = window.setInterval(() => {
        ticks += 1
        setCoinFaces(randomFaces())

        if (ticks < animationProfile.ticks) {
          return
        }

        if (spinTimerRef.current !== null) {
          window.clearInterval(spinTimerRef.current)
          spinTimerRef.current = null
        }

        setCoinFaces(finalCoins.map((coin) => coin.side))

        setRecords((prev) => {
          if (prev.length >= 6) {
            return prev
          }

          const line = coinsToLine(finalCoins, prev.length)
          return [
            ...prev,
            {
              line,
              source,
              timestamp: Date.now(),
            },
          ]
        })

        setIsAnimating(false)
      }, animationProfile.tickIntervalMs)
    },
    [isAnimating, manualControl, records.length],
  )

  const tossRef = useRef(toss)
  useEffect(() => {
    tossRef.current = toss
  }, [toss])

  const onGestureTrigger = useCallback((payload: GestureTriggerPayload) => {
    tossRef.current('gesture', payload.control, payload.entropy)
  }, [])

  const gestureState = useHandGestureToss({
    enabled: cameraEnabled,
    videoRef,
    onGestureTrigger,
    visionConfig: config.vision,
  })

  const updateManualPower = useCallback((power: number) => {
    setManualControl((prev) => ({
      ...prev,
      power: clamp01(power),
    }))
  }, [])

  const updateManualSpeed = useCallback((speed: number) => {
    setManualControl((prev) => ({
      ...prev,
      speed: clamp01(speed),
    }))
  }, [])

  const resetSession = useCallback(() => {
    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current)
      spinTimerRef.current = null
    }

    setIsAnimating(false)
    setRecords([])
    setCoinFaces(INITIAL_COINS)
    setLastTrigger(undefined)
    setLastTossEntropy(undefined)
    setInterpretation('')
    setInterpretationError(undefined)
    setLoadingInterpretation(false)
    setView('toss')
  }, [])

  const openResultView = useCallback(() => {
    setView('result')
  }, [])

  const returnToTossView = useCallback(() => {
    setView('toss')
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const generateInterpretation = useCallback(async () => {
    if (!result || loadingInterpretation) {
      return
    }

    setLoadingInterpretation(true)
    setInterpretationError(undefined)

    try {
      const prompt = buildInterpretationPrompt({
        question,
        result,
        mainContent: config.hexagrams[result.main.binary],
        changedContent: config.hexagrams[result.changed.binary],
        userSuffix: config.prompts?.userSuffix,
      })

      const text = await requestInterpretation(
        config.llm,
        prompt,
        config.prompts?.system,
      )
      setInterpretation(text)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate interpretation'
      setInterpretationError(message)
    } finally {
      setLoadingInterpretation(false)
    }
  }, [config, loadingInterpretation, question, result])

  const mainContent = result ? config.hexagrams[result.main.binary] : undefined
  const changedContent = result ? config.hexagrams[result.changed.binary] : undefined

  return (
    <div className={`app-shell ${view === 'result' ? 'result-mode' : 'toss-mode'}`}>
      <header className="utility-bar">
        <div className="utility-actions">
          {view === 'toss' ? (
            <button type="button" className="ghost-btn" onClick={openResultView}>
              Console
            </button>
          ) : null}
          {view === 'result' ? (
            <button type="button" className="ghost-btn" onClick={returnToTossView}>
              Back to Toss
            </button>
          ) : null}
          <button type="button" className="ghost-btn" onClick={resetSession}>
            Reset
          </button>
          <button
            type="button"
            className="toggle-btn theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className={`app-main ${view === 'result' ? 'result-main' : 'toss-main'}`}>
        {view === 'toss' ? (
          <section className="launch-hero">
            <CoinTossPanel
              coins={coinFaces}
              isAnimating={isAnimating}
              canToss={records.length < 6}
              tossCount={records.length}
              lastTrigger={lastTrigger}
              onToss={() =>
                toss(
                  'manual',
                  cameraEnabled ? gestureState.gestureControl : manualControl,
                )
              }
              tossAnimation={coinAnimation}
              gestureControl={gestureState.gestureControl}
              canOpenResult={Boolean(result)}
              onOpenResult={openResultView}
            />
          </section>
        ) : (
          <section className="result-view">
            <section className="panel result-header-panel">
              <div>
                <p className="eyebrow">Result</p>
                <h2>{result ? `${result.main.name} -> ${result.changed.name}` : 'Toss Console'}</h2>
                <p className="panel-subtitle">
                  {result
                    ? 'Main and changed patterns after six tosses.'
                    : 'Configure camera and fallback controls.'}
                </p>
              </div>
              <button
                type="button"
                className="result-back-btn"
                onClick={returnToTossView}
                aria-label="Back to toss view"
              >
                Toss
              </button>
            </section>

            {result ? (
              <section className="hexagram-grid">
                <HexagramDisplay
                  heading="主卦"
                  name={result.main.name}
                  binary={result.main.binary}
                  description={result.main.description}
                  lines={result.lines.map((line) => ({
                    isYang: line.isYang,
                    isMoving: line.isMoving,
                  }))}
                  content={mainContent}
                />
                <HexagramDisplay
                  heading="变卦"
                  name={result.changed.name}
                  binary={result.changed.binary}
                  description={result.changed.description}
                  lines={result.lines.map((line) => ({
                    isYang: line.isMoving ? !line.isYang : line.isYang,
                  }))}
                  content={changedContent}
                />
              </section>
            ) : (
              <section className="panel">
                <h2>Result Pending</h2>
                <p className="muted">Complete six tosses to display hexagram data.</p>
              </section>
            )}

            <details className="result-drawer">
              <summary className="drawer-summary">
                <span>Toss Controls</span>
                <span className="drawer-meta">Camera, manual sliders, entropy debug</span>
              </summary>
              <div className="drawer-content control-drawer-grid">
                <CameraPanel
                  enabled={cameraEnabled}
                  onToggle={setCameraEnabled}
                  videoRef={videoRef}
                  cameraError={cameraError}
                  gestureState={gestureState}
                />

                <TossLabPanel
                  tossCount={records.length}
                  lastTrigger={lastTrigger}
                  manualControl={manualControl}
                  activeTossControl={activeTossControl}
                  gestureControl={gestureState.gestureControl}
                  cameraEnabled={cameraEnabled}
                  lastTossEntropy={lastTossEntropy}
                  onManualPowerChange={updateManualPower}
                  onManualSpeedChange={updateManualSpeed}
                />

                <section className="panel runtime-panel">
                  <h3>Runtime Status</h3>
                  <p className="muted">LLM model: {config.llm.model}</p>
                  {!config.llm.apiKey ? (
                    <p className="warning-text">
                      `public/config.json` llm.apiKey is empty, so AI interpretation is
                      disabled.
                    </p>
                  ) : (
                    <p className="muted">LLM API key is configured.</p>
                  )}
                  {configError ? (
                    <p className="error-text">config.json load failed: {configError}</p>
                  ) : (
                    <p className="muted">Config loaded from `public/config.json`.</p>
                  )}
                </section>
              </div>
            </details>

            <details className="result-drawer">
              <summary className="drawer-summary">
                <span>Line History</span>
                <span className="drawer-meta">Bottom line to top line records</span>
              </summary>
              <div className="drawer-content">
                <LineHistory records={records} />
              </div>
            </details>

            <details className="result-drawer">
              <summary className="drawer-summary">
                <span>AI Interpretation</span>
                <span className="drawer-meta">Question + generated reading</span>
              </summary>
              <div className="drawer-content">
                <section className="panel question-panel">
                  <label htmlFor="question" className="question-label">
                    Optional question
                  </label>
                  <input
                    id="question"
                    className="question-input"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Example: Is this a good time to switch jobs?"
                  />
                </section>

                <InterpretationPanel
                  canGenerate={Boolean(result)}
                  loading={loadingInterpretation}
                  error={interpretationError}
                  interpretation={interpretation}
                  onGenerate={generateInterpretation}
                />
              </div>
            </details>
          </section>
        )}
      </main>
    </div>
  )
}
