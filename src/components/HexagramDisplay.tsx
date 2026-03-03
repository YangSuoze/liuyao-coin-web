import type { HexagramContent } from '../config/types'

export interface HexagramLineView {
  isYang: boolean
  isMoving?: boolean
}

interface HexagramDisplayProps {
  heading: string
  name: string
  binary: string
  description: string
  lines: HexagramLineView[]
  content?: HexagramContent
}

function MovingMarker({ isMoving, isYang }: { isMoving?: boolean; isYang: boolean }) {
  if (!isMoving) {
    return <span className="moving-mark" aria-hidden="true"></span>
  }

  return (
    <span className="moving-mark" aria-hidden="true">
      {isYang ? '○' : '×'}
    </span>
  )
}

export function HexagramDisplay({
  heading,
  name,
  binary,
  description,
  lines,
  content,
}: HexagramDisplayProps) {
  const displayLines = [...lines].reverse()

  return (
    <section className="panel hexagram-card">
      <h3>{heading}</h3>
      <p className="hexagram-name">{name}</p>
      <p className="muted">{description}</p>
      <p className="hexagram-binary">{binary}</p>

      <div className="hexagram-lines" aria-label={`${heading} lines`}>
        {displayLines.map((line, idx) => (
          <div className="hex-line" key={`${heading}-${idx}`}>
            <MovingMarker isMoving={line.isMoving} isYang={line.isYang} />
            {line.isYang ? (
              <div className="line-solid" />
            ) : (
              <div className="line-broken">
                <span />
                <span />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hexagram-text">
        <p className="hexagram-content-title">{content?.title?.trim() || ''}</p>
        <p>{content?.text?.trim() || ''}</p>
      </div>
    </section>
  )
}
