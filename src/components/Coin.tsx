import type { CSSProperties } from 'react'
import type { CoinSide } from '../logic/types'

interface CoinProps {
  side: CoinSide
  spinning: boolean
  index: number
}

export function Coin({ side, spinning, index }: CoinProps) {
  const style: CSSProperties = {
    animationDelay: `${index * 80}ms`,
  }

  return (
    <div
      className={`coin ${spinning ? 'spinning' : ''}`}
      style={style}
      aria-label={`Coin ${index + 1}: ${side}`}
    >
      <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
        <defs>
          <radialGradient id={`coin-grad-${index}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fff6db" />
            <stop offset="60%" stopColor="#d9ac45" />
            <stop offset="100%" stopColor="#986a16" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="54" fill={`url(#coin-grad-${index})`} />
        <circle cx="60" cy="60" r="44" fill="none" stroke="#fbebbc" strokeWidth="2" />
        <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="coin-symbol">
          {side === 'heads' ? '阳' : '阴'}
        </text>
        <text x="60" y="83" textAnchor="middle" className="coin-mark">
          {side === 'heads' ? 'HEADS' : 'TAILS'}
        </text>
      </svg>
    </div>
  )
}
