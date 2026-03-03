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
}: CoinTossPanelProps) {
  const manualPower = Math.round(manualControl.power * 100)
  const manualSpeed = Math.round(manualControl.speed * 100)
  const activePower = Math.round(activeTossControl.power * 100)
  const activeSpeed = Math.round(activeTossControl.speed * 100)
  const livePower = Math.round(gestureControl.power * 100)
  const liveSpeed = Math.round(gestureControl.speed * 100)

  return (
    <section className="panel coin-panel">
      <div className="coin-panel-head">
        <p className="eyebrow">Premium Toss Deck</p>
        <h2>三枚铜钱</h2>
        <p className="panel-subtitle">上抬手势提升抛掷高度，下压手势提升旋转速度。</p>
      </div>

      <div className="coin-stage">
        <div className="coin-row" role="group" aria-label="Three coins">
          {coins.map((coin, idx) => (
            <Coin
              key={idx}
              side={coin}
              spinning={isAnimating}
              index={idx}
              animation={tossAnimation}
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
          {lastTrigger ? ` · 最近触发: ${lastTrigger === 'manual' ? '手动' : '手势'}` : ''}
        </span>
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
