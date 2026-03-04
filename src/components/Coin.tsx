import type { CSSProperties } from 'react'
import type { CoinSide } from '../logic/types'

export interface CoinAnimationConfig {
  launchHeight: number
  spinDurationMs: number
  easing: string
  rotateMidDeg: number
  rotatePeakDeg: number
  rotateEndDeg: number
  wobbleDeg: number
}

export interface CoinMotionControl {
  power: number
  speed: number
}

interface CoinProps {
  side: CoinSide
  spinning: boolean
  index: number
  animation: CoinAnimationConfig
  motionControl: CoinMotionControl
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

export function Coin({ side, spinning, index, animation, motionControl }: CoinProps) {
  const power = clamp01(motionControl.power)
  const speed = clamp01(motionControl.speed)
  const indexOffset = index - 1

  const tiltX = 5 - power * 10 + indexOffset * 1.6
  const tiltY = -8 + speed * 16 + indexOffset * 3.1
  const depthPx = Math.round(10 + speed * 10)
  const glintX = `${Math.round(26 + speed * 44 + indexOffset * 4)}%`
  const glintY = `${Math.round(20 + (1 - power) * 52)}%`
  const restLift = `${Math.round((0.5 - power) * 12 - Math.abs(indexOffset) * 2)}px`
  const restRotationDeg = side === 'heads' ? 0 : 180
  const restRotation = `${restRotationDeg}deg`
  const spinBaseRotation = `${(restRotationDeg + tiltY).toFixed(2)}deg`

  const style = {
    animationDelay: `${index * 74}ms`,
    '--coin-launch-height': `${animation.launchHeight}px`,
    '--coin-spin-duration': `${animation.spinDurationMs}ms`,
    '--coin-spin-easing': animation.easing,
    '--coin-rotate-mid': `${animation.rotateMidDeg}deg`,
    '--coin-rotate-peak': `${animation.rotatePeakDeg}deg`,
    '--coin-rotate-end': `${animation.rotateEndDeg}deg`,
    '--coin-wobble': `${animation.wobbleDeg}deg`,
    '--coin-tilt-x': `${tiltX.toFixed(2)}deg`,
    '--coin-tilt-y': `${tiltY.toFixed(2)}deg`,
    '--coin-depth': `${depthPx}px`,
    '--coin-glint-x': glintX,
    '--coin-glint-y': glintY,
    '--coin-rest-lift': restLift,
    '--coin-rest-rotation': restRotation,
    '--coin-spin-base': spinBaseRotation,
    '--coin-wobble-neg': `${-animation.wobbleDeg}deg`,
    '--coin-wobble-soft': `${Math.round(animation.wobbleDeg * 0.36)}deg`,
    '--coin-glint-opacity': (0.28 + speed * 0.42).toFixed(3),
  } as CSSProperties

  return (
    <div
      className={`coin ${spinning ? 'spinning' : ''}`}
      style={style}
      aria-label={`Coin ${index + 1}: ${side}`}
    >
      <div className="coin-body">
        <div className="coin-face coin-face-front" aria-hidden="true">
          <span className="coin-symbol">阳</span>
          <span className="coin-mark">HEADS</span>
        </div>

        <div className="coin-face coin-face-back" aria-hidden="true">
          <span className="coin-symbol">阴</span>
          <span className="coin-mark">TAILS</span>
        </div>

        <div className="coin-rim" aria-hidden="true"></div>
        <div className="coin-specular" aria-hidden="true"></div>
      </div>
    </div>
  )
}
