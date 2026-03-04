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
  manualControl: {
    power: number
    speed: number
  }
  activeTossControl: {
    power: number
    speed: number
  }
  gestureControl: GestureControl
  cameraEnabled: boolean
  onManualPowerChange: (power: number) => void
  onManualSpeedChange: (speed: number) => void
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
  manualControl,
  activeTossControl,
  gestureControl,
  cameraEnabled,
  onManualPowerChange,
  onManualSpeedChange,
  canOpenResult,
  onOpenResult,
}: CoinTossPanelProps) {
  const manualPower = Math.round(manualControl.power * 100)
  const manualSpeed = Math.round(manualControl.speed * 100)
  const activePower = Math.round(activeTossControl.power * 100)
  const activeSpeed = Math.round(activeTossControl.speed * 100)
  const livePower = Math.round(gestureControl.power * 100)
  const liveSpeed = Math.round(gestureControl.speed * 100)

  const stageStyle = {
    '--stage-parallax-x': `${((0.5 - gestureControl.power) * 5.4).toFixed(2)}deg`,
    '--stage-parallax-y': `${((gestureControl.speed - 0.5) * 9).toFixed(2)}deg`,
    '--stage-glow-opacity': (0.12 + gestureControl.speed * 0.24).toFixed(3),
  } as CSSProperties

  return (
    <section className="panel coin-panel">
      <div className="coin-panel-head">
        <p className="eyebrow">Liuyao Toss</p>
        <h2>三枚铜钱 · 3D</h2>
        <p className="panel-subtitle">Power 控制高度，Speed 控制旋转。</p>
      </div>

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

      <div className="toss-actions">
        <button
          type="button"
          className="action-btn"
          disabled={!canToss || isAnimating}
          onClick={onToss}
        >
          {isAnimating ? 'Tossing...' : 'Toss'}
        </button>
        <span className="muted">
          已抛掷 {tossCount}/6
          {lastTrigger ? ` · 最近: ${lastTrigger === 'manual' ? '手动' : '手势'}` : ''}
        </span>

        {canOpenResult ? (
          <button type="button" className="result-arrow-btn" onClick={onOpenResult}>
            <span aria-hidden="true">→</span>
            <span>查看卦象</span>
          </button>
        ) : null}
      </div>

      <div className="control-badges" aria-live="polite">
        <span className="control-badge">本次高度 {activePower}%</span>
        <span className="control-badge">本次速度 {activeSpeed}%</span>
        <span className="control-badge">
          {cameraEnabled
            ? `实时手势 高度 ${livePower}% / 速度 ${liveSpeed}%`
            : '摄像头关闭，使用手动参数'}
        </span>
      </div>

      <div className="slider-grid">
        <label className="slider-card" htmlFor="manual-power">
          <span className="slider-label">手动高度 (回退)</span>
          <span className="slider-value">{manualPower}%</span>
          <input
            id="manual-power"
            type="range"
            min={0}
            max={100}
            value={manualPower}
            onChange={(event) => onManualPowerChange(Number(event.target.value) / 100)}
          />
        </label>

        <label className="slider-card" htmlFor="manual-speed">
          <span className="slider-label">手动速度 (回退)</span>
          <span className="slider-value">{manualSpeed}%</span>
          <input
            id="manual-speed"
            type="range"
            min={0}
            max={100}
            value={manualSpeed}
            onChange={(event) => onManualSpeedChange(Number(event.target.value) / 100)}
          />
        </label>
      </div>
    </section>
  )
}
