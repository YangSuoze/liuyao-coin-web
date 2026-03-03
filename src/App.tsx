import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CameraPanel } from './components/CameraPanel'
import { CoinTossPanel } from './components/CoinTossPanel'
import type { CoinAnimationConfig } from './components/Coin'
import { HexagramDisplay } from './components/HexagramDisplay'
import { InterpretationPanel } from './components/InterpretationPanel'
import { LineHistory } from './components/LineHistory'
import { loadAppConfig } from './config/loadConfig'
import { DEFAULT_APP_CONFIG, type AppConfig } from './config/types'
import { buildInterpretationPrompt } from './llm/prompt'
import { requestInterpretation } from './llm/openaiClient'
import { coinsToLine, randomCoinSide, tossThreeCoins } from './logic/coin'
import { computeHexagram } from './logic/hexagram'
import type { CoinSide, TossRecord } from './logic/types'
import { useHandGestureToss, type GestureControl } from './vision/useHandGestureToss'

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

function buildTossAnimation(control: TossControlInput): TossAnimationProfile {
  const normalized = normalizeControl(control)
  const { power, speed } = normalized

  const launchHeight = Math.round(82 + power * 138)
  const spinDurationMs = Math.round(980 - speed * 540)
  const rotateEndDeg = Math.round(1040 + speed * 1860)

  const easing =
    speed > 0.66
      ? 'cubic-bezier(0.16, 0.92, 0.26, 1)'
      : power > 0.68
        ? 'cubic-bezier(0.14, 0.86, 0.24, 1)'
        : 'cubic-bezier(0.2, 0.8, 0.28, 1)'

  const tickIntervalMs = Math.round(58 + (1 - speed) * 52)
  const estimatedFlightMs = Math.round(700 + power * 430 - speed * 120)

  return {
    tickIntervalMs,
    ticks: Math.max(7, Math.round(estimatedFlightMs / tickIntervalMs)),
    coinAnimation: {
      launchHeight,
      spinDurationMs,
      easing,
      rotateMidDeg: Math.round(rotateEndDeg * 0.44),
      rotatePeakDeg: Math.round(rotateEndDeg * 0.78),
      rotateEndDeg,
      wobbleDeg: Math.round(9 + speed * 17),
    },
  }
}

export default function App() {
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

  const lines = useMemo(() => records.map((record) => record.line), [records])
  const result = useMemo(() => {
    if (lines.length !== 6) {
      return null
    }
    return computeHexagram(lines)
  }, [lines])

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
    (source: 'manual' | 'gesture', controlOverride?: TossControlInput) => {
      if (isAnimating || records.length >= 6) {
        return
      }

      const selectedControl = normalizeControl(controlOverride ?? manualControl)
      const animationProfile = buildTossAnimation(selectedControl)

      setActiveTossControl(selectedControl)
      setCoinAnimation(animationProfile.coinAnimation)
      setIsAnimating(true)
      setLastTrigger(source)
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

        const finalCoins = tossThreeCoins()
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

  const onGestureTrigger = useCallback((control: GestureControl) => {
    tossRef.current('gesture', control)
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
    setInterpretation('')
    setInterpretationError(undefined)
    setLoadingInterpretation(false)
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
    <div className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Liuyao Coin Toss</p>
        <h1>六爻 · 铜钱起卦</h1>
        <p className="intro">
          三枚铜钱抛掷六次生成主卦与变卦。手势模式支持动态设置抛掷高度与旋转速度。
        </p>

        <label htmlFor="question" className="question-label">
          所问何事
        </label>
        <input
          id="question"
          className="question-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：近期是否适合换工作？"
        />

        <div className="header-meta">
          {configError ? <span className="error-text">配置加载失败: {configError}</span> : null}
          {!config.llm.apiKey ? (
            <span className="warning-text">`public/config.json` 的 llm.apiKey 为空，AI 解读将不可用。</span>
          ) : (
            <span className="muted">LLM model: {config.llm.model}</span>
          )}
        </div>
      </header>

      <main className="app-main">
        <section className="hero-stage">
          <CoinTossPanel
            coins={coinFaces}
            isAnimating={isAnimating}
            canToss={records.length < 6}
            tossCount={records.length}
            lastTrigger={lastTrigger}
            onToss={() => toss('manual')}
            tossAnimation={coinAnimation}
            manualControl={manualControl}
            activeTossControl={activeTossControl}
            gestureControl={gestureState.gestureControl}
            cameraEnabled={cameraEnabled}
            onManualPowerChange={updateManualPower}
            onManualSpeedChange={updateManualSpeed}
          />
        </section>

        <section className="main-grid">
          <div className="column">
            <CameraPanel
              enabled={cameraEnabled}
              onToggle={setCameraEnabled}
              videoRef={videoRef}
              cameraError={cameraError}
              gestureState={gestureState}
            />

            <section className="panel session-panel">
              <button type="button" className="ghost-btn" onClick={resetSession}>
                重置本轮
              </button>
              <p className="muted">抛掷满六次后自动计算卦象。</p>
            </section>
          </div>

          <div className="column">
            <LineHistory records={records} />

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
                <h2>卦象结果</h2>
                <p className="muted">完成六次 Toss 后显示主卦、变卦与动爻。</p>
              </section>
            )}

            <InterpretationPanel
              canGenerate={Boolean(result)}
              loading={loadingInterpretation}
              error={interpretationError}
              interpretation={interpretation}
              onGenerate={generateInterpretation}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
