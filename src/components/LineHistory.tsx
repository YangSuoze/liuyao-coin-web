import { lineKindLabel } from '../logic/hexagram'
import type { TossRecord } from '../logic/types'

interface LineHistoryProps {
  records: TossRecord[]
}

export function LineHistory({ records }: LineHistoryProps) {
  if (records.length === 0) {
    return (
      <section className="panel">
        <h2>六爻记录</h2>
        <p className="panel-subtitle">顺序为自下而上</p>
        <p className="muted">尚未抛掷，请先进行 Toss。</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>六爻记录</h2>
      <p className="panel-subtitle">顺序为自下而上</p>

      <ol className="line-history">
        {records.map((record) => {
          const sum = record.line.coins.reduce((acc, c) => acc + c.value, 0)
          const coinText = record.line.coins
            .map((coin) => `${coin.side === 'heads' ? '正' : '反'}(${coin.value})`)
            .join(' + ')

          return (
            <li key={`${record.line.index}-${record.timestamp}`}>
              <span className="line-title">第{record.line.index + 1}爻</span>
              <span>{lineKindLabel(record.line.kind)}</span>
              <span className="muted">{coinText} = {sum}</span>
              <span className="muted">触发: {record.source === 'manual' ? '手动' : '手势'}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
