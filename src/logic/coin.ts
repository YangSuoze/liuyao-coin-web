import type { CoinOutcome, CoinSide, LineKind, LineValue, YaoLine } from './types'

export function sideToValue(side: CoinSide): 2 | 3 {
  return side === 'heads' ? 3 : 2
}

export function randomCoinSide(rng: () => number = Math.random): CoinSide {
  return rng() >= 0.5 ? 'heads' : 'tails'
}

export function tossThreeCoins(rng: () => number = Math.random): CoinOutcome[] {
  return Array.from({ length: 3 }, () => {
    const side = randomCoinSide(rng)
    return {
      side,
      value: sideToValue(side),
    }
  })
}

function sumToLineValue(sum: number): LineValue {
  if (sum === 6 || sum === 7 || sum === 8 || sum === 9) {
    return sum
  }
  throw new Error(`Invalid coin sum: ${sum}`)
}

function lineValueToKind(value: LineValue): LineKind {
  switch (value) {
    case 6:
      return 'old_yin'
    case 7:
      return 'young_yang'
    case 8:
      return 'young_yin'
    case 9:
      return 'old_yang'
    default:
      throw new Error(`Unsupported line value: ${value}`)
  }
}

export function coinsToLine(coins: CoinOutcome[], index: number): YaoLine {
  if (coins.length !== 3) {
    throw new Error('Each toss requires exactly 3 coins')
  }

  const sum = coins.reduce((acc, coin) => acc + coin.value, 0)
  const value = sumToLineValue(sum)
  const kind = lineValueToKind(value)
  const isYang = value === 7 || value === 9
  const isMoving = value === 6 || value === 9

  return {
    index,
    value,
    kind,
    isYang,
    isMoving,
    coins,
  }
}
