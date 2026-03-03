import type { CoinSide } from '../logic/types'
import { Coin } from './Coin'

interface CoinTossPanelProps {
  coins: CoinSide[]
  isAnimating: boolean
  canToss: boolean
  tossCount: number
  lastTrigger?: 'manual' | 'gesture'
  onToss: () => void
}

export function CoinTossPanel({
  coins,
  isAnimating,
  canToss,
  tossCount,
  lastTrigger,
  onToss,
}: CoinTossPanelProps) {
  return (
    <section className="panel coin-panel">
      <h2>三枚铜钱</h2>
      <p className="panel-subtitle">每次抛掷生成一爻，累计六次成卦</p>

      <div className="coin-row" role="group" aria-label="Three coins">
        {coins.map((coin, idx) => (
          <Coin key={idx} side={coin} spinning={isAnimating} index={idx} />
        ))}
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
    </section>
  )
}
