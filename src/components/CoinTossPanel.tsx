import type { CSSProperties } from 'react'
import type { CoinSide } from '../logic/types'
import type { GestureControl } from '../vision/useHandGestureToss'
import { Coin, type CoinAnimationConfig } from './Coin'

interface CoinTossPanelProps {
  coins: CoinSide[]
  isAnimating: boolean
  canToss: boolean
  tossCount: number
  lastTrigger?: 'manual' | 'gesture'
  onToss: () => void
  tossAnimation: CoinAnimationConfig
  gestureControl: GestureControl
  canOpenResult: boolean
  onOpenResult: () => void
}

export function CoinTossPanel({
  coins,
  isAnimating,
  canToss,
  tossCount,
  lastTrigger,
  onToss,
  tossAnimation,
  gestureControl,
  canOpenResult,
  onOpenResult,
}: CoinTossPanelProps) {
  const stageStyle = {
    '--stage-parallax-x': `${((0.5 - gestureControl.power) * 5.4).toFixed(2)}deg`,
    '--stage-parallax-y': `${((gestureControl.speed - 0.5) * 9).toFixed(2)}deg`,
    '--stage-glow-opacity': (0.12 + gestureControl.speed * 0.24).toFixed(3),
  } as CSSProperties

  return (
    <section className="coin-hero" aria-label="Toss stage">
      <div className="coin-stage" style={stageStyle}>
        <div className="coin-row" role="group" aria-label="Three coins">
          {coins.map((coin, idx) => (
            <Coin
              key={idx}
              side={coin}
              spinning={isAnimating}
              index={idx}
              animation={tossAnimation}
              motionControl={gestureControl}
            />
          ))}
        </div>
      </div>

      <div className="toss-actions hero-actions">
        <button
          type="button"
          className="action-btn hero-toss-btn"
          disabled={!canToss || isAnimating}
          onClick={onToss}
        >
          {isAnimating ? 'Tossing...' : 'Toss'}
        </button>

        {canOpenResult ? (
          <button type="button" className="result-arrow-btn" onClick={onOpenResult}>
            <span>Result</span>
            <span aria-hidden="true">{'->'}</span>
          </button>
        ) : null}

        <span className="progress-pill">
          {tossCount}/6
          {lastTrigger ? ` · ${lastTrigger}` : ''}
        </span>
      </div>

      <p className="gesture-hint">
        <span className="hint-dot" aria-hidden="true"></span>
        Open palm -&gt; fist to toss
      </p>
    </section>
  )
}
