export type CoinSide = 'heads' | 'tails'

export interface CoinOutcome {
  side: CoinSide
  value: 2 | 3
}

export type LineValue = 6 | 7 | 8 | 9

export type LineKind = 'old_yin' | 'young_yang' | 'young_yin' | 'old_yang'

export interface YaoLine {
  index: number
  value: LineValue
  kind: LineKind
  isYang: boolean
  isMoving: boolean
  coins: CoinOutcome[]
}

export interface Hexagram {
  binary: string
  name: string
  description: string
}

export interface HexagramComputation {
  lines: YaoLine[]
  main: Hexagram
  changed: Hexagram
  movingLineNumbers: number[]
}

export interface TossRecord {
  line: YaoLine
  source: 'manual' | 'gesture'
  timestamp: number
}
