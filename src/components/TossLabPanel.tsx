import type { GestureControl } from '../vision/useHandGestureToss'

interface TossLabPanelProps {
  tossCount: number
  lastTrigger?: 'manual' | 'gesture'
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
  lastTossEntropy?: {
    source: 'manual' | 'gesture'
    seedHex: string
    power: number
    speed: number
    verticalVelocity: number
    velocityEnergy: number
    palmSpanMean: number
    palmSpanRange: number
    sampleCount: number
  }
  onManualPowerChange: (power: number) => void
  onManualSpeedChange: (speed: number) => void
}

export function TossLabPanel({
  tossCount,
  lastTrigger,
  manualControl,
  activeTossControl,
  gestureControl,
  cameraEnabled,
  lastTossEntropy,
  onManualPowerChange,
  onManualSpeedChange,
}: TossLabPanelProps) {
  const manualPower = Math.round(manualControl.power * 100)
  const manualSpeed = Math.round(manualControl.speed * 100)
  const activePower = Math.round(activeTossControl.power * 100)
  const activeSpeed = Math.round(activeTossControl.speed * 100)
  const livePower = Math.round(gestureControl.power * 100)
  const liveSpeed = Math.round(gestureControl.speed * 100)

  return (
    <section className="panel toss-lab-panel">
      <div className="toss-lab-head">
        <h3>Toss Lab</h3>
        <p className="panel-subtitle">Manual fallback controls and entropy diagnostics.</p>
      </div>

      <p className="muted">
        Tosses {tossCount}/6
        {lastTrigger ? ` · latest trigger: ${lastTrigger}` : ''}
      </p>

      <div className="control-badges" aria-live="polite">
        <span className="control-badge">Active height {activePower}%</span>
        <span className="control-badge">Active speed {activeSpeed}%</span>
        <span className="control-badge">
          {cameraEnabled
            ? `Live gesture ${livePower}% / ${liveSpeed}%`
            : 'Camera off, using manual fallback'}
        </span>
      </div>

      {lastTossEntropy ? (
        <section className="debug-panel" aria-live="polite">
          <p className="debug-title">Entropy Debug</p>
          <p className="debug-line">
            seed: <code>{lastTossEntropy.seedHex}</code> · source: {lastTossEntropy.source}
          </p>
          <p className="debug-line">
            power/speed: {Math.round(lastTossEntropy.power * 100)}% /{' '}
            {Math.round(lastTossEntropy.speed * 100)}%
          </p>
          <p className="debug-line">
            velocity: {lastTossEntropy.verticalVelocity.toFixed(4)} · energy:{' '}
            {lastTossEntropy.velocityEnergy.toFixed(4)}
          </p>
          <p className="debug-line">
            palmSpan mean/range: {lastTossEntropy.palmSpanMean.toFixed(4)} /{' '}
            {lastTossEntropy.palmSpanRange.toFixed(4)} · samples: {lastTossEntropy.sampleCount}
          </p>
        </section>
      ) : null}

      <div className="slider-grid">
        <label className="slider-card" htmlFor="manual-power">
          <span className="slider-label">Manual Height</span>
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
          <span className="slider-label">Manual Speed</span>
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
