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

interface CoinProps {
  side: CoinSide
  spinning: boolean
  index: number
  animation: CoinAnimationConfig
}

export function Coin({ side, spinning, index, animation }: CoinProps) {
  const style = {
    animationDelay: `${index * 74}ms`,
    '--coin-launch-height': `${animation.launchHeight}px`,
    '--coin-spin-duration': `${animation.spinDurationMs}ms`,
    '--coin-spin-easing': animation.easing,
    '--coin-rotate-mid': `${animation.rotateMidDeg}deg`,
    '--coin-rotate-peak': `${animation.rotatePeakDeg}deg`,
    '--coin-rotate-end': `${animation.rotateEndDeg}deg`,
    '--coin-wobble': `${animation.wobbleDeg}deg`,
  } as CSSProperties

  return (
    <div
      className={`coin ${spinning ? 'spinning' : ''}`}
      style={style}
      aria-label={`Coin ${index + 1}: ${side}`}
    >
      <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
        <defs>
          <radialGradient id={`coin-grad-core-${index}`} cx="35%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#fffbe8" />
            <stop offset="42%" stopColor="#f4d17a" />
            <stop offset="100%" stopColor="#9c6d1a" />
          </radialGradient>
          <linearGradient id={`coin-rim-${index}`} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#ffe8ad" />
            <stop offset="46%" stopColor="#bd8732" />
            <stop offset="100%" stopColor="#7c520f" />
          </linearGradient>
        </defs>

        <circle cx="60" cy="60" r="56" fill={`url(#coin-rim-${index})`} />
        <circle cx="60" cy="60" r="48" fill={`url(#coin-grad-core-${index})`} />
        <circle cx="60" cy="60" r="42" fill="none" stroke="#fff2c7" strokeWidth="1.8" />

        <text x="60" y="58" textAnchor="middle" dominantBaseline="central" className="coin-symbol">
          {side === 'heads' ? '阳' : '阴'}
        </text>
        <text x="60" y="81" textAnchor="middle" className="coin-mark">
          {side === 'heads' ? 'HEADS' : 'TAILS'}
        </text>
      </svg>
    </div>
  )
}
