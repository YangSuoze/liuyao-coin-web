import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CameraPanel } from './components/CameraPanel'
import { CoinTossPanel } from './components/CoinTossPanel'
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
import { useHandGestureToss } from './vision/useHandGestureToss'

const INITIAL_COINS: CoinSide[] = ['heads', 'tails', 'heads']

function randomFaces(): CoinSide[] {
  return Array.from({ length: 3 }, () => randomCoinSide())
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG)
  const [configError, setConfigError] = useState<string>()

  const [question, setQuestion] = useState('')
  const [records, setRecords] = useState<TossRecord[]>([])
  const [coinFaces, setCoinFaces] = useState<CoinSide[]>(INITIAL_COINS)
  const [isAnimating, setIsAnimating] = useState(false)
  const [lastTrigger, setLastTrigger] = useState<'manual' | 'gesture'>()

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
    (source: 'manual' | 'gesture') => {
      if (isAnimating || records.length >= 6) {
        return
      }

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

        if (ticks < 10) {
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
      }, 90)
    },
    [isAnimating, records.length],
  )

  const tossRef = useRef(toss)
  useEffect(() => {
    tossRef.current = toss
  }, [toss])

  const onGestureTrigger = useCallback(() => {
    tossRef.current('gesture')
  }, [])

  const gestureState = useHandGestureToss({
    enabled: cameraEnabled,
    videoRef,
    onGestureTrigger,
  })

  const resetSession = useCallback(() => {
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
      })

      const text = await requestInterpretation(config.llm, prompt)
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
          使用三枚铜钱抛掷六次生成主卦与变卦，可通过手势或手动按钮触发 Toss。
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

      <main className="main-grid">
        <div className="column">
          <CoinTossPanel
            coins={coinFaces}
            isAnimating={isAnimating}
            canToss={records.length < 6}
            tossCount={records.length}
            lastTrigger={lastTrigger}
            onToss={() => toss('manual')}
          />

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
      </main>
    </div>
  )
}
