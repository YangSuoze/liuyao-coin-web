import type { Hexagram, HexagramComputation, YaoLine } from './types'

interface TrigramMeta {
  nameCn: string
  nameEn: string
  symbol: string
}

const TRIGRAMS: Record<string, TrigramMeta> = {
  '111': { nameCn: '乾', nameEn: 'Heaven', symbol: '☰' },
  '110': { nameCn: '兑', nameEn: 'Lake', symbol: '☱' },
  '101': { nameCn: '离', nameEn: 'Fire', symbol: '☲' },
  '100': { nameCn: '震', nameEn: 'Thunder', symbol: '☳' },
  '011': { nameCn: '巽', nameEn: 'Wind', symbol: '☴' },
  '010': { nameCn: '坎', nameEn: 'Water', symbol: '☵' },
  '001': { nameCn: '艮', nameEn: 'Mountain', symbol: '☶' },
  '000': { nameCn: '坤', nameEn: 'Earth', symbol: '☷' },
}

export function linesToMainBinary(lines: YaoLine[]): string {
  if (lines.length !== 6) {
    throw new Error('Hexagram requires exactly 6 lines')
  }
  return lines.map((line) => (line.isYang ? '1' : '0')).join('')
}

export function linesToChangedBinary(lines: YaoLine[]): string {
  if (lines.length !== 6) {
    throw new Error('Hexagram requires exactly 6 lines')
  }
  return lines
    .map((line) => {
      const bit = line.isYang ? '1' : '0'
      if (!line.isMoving) {
        return bit
      }
      return bit === '1' ? '0' : '1'
    })
    .join('')
}

function describeHexagram(binary: string): Hexagram {
  const lower = TRIGRAMS[binary.slice(0, 3)]
  const upper = TRIGRAMS[binary.slice(3, 6)]

  if (!lower || !upper) {
    return {
      binary,
      name: '未定义卦象',
      description: 'Unknown hexagram',
    }
  }

  return {
    binary,
    name: `${upper.nameCn}${lower.nameCn}`,
    description: `${upper.symbol}${lower.symbol} · ${upper.nameEn} over ${lower.nameEn}`,
  }
}

export function computeHexagram(lines: YaoLine[]): HexagramComputation {
  const mainBinary = linesToMainBinary(lines)
  const changedBinary = linesToChangedBinary(lines)
  const movingLineNumbers = lines
    .filter((line) => line.isMoving)
    .map((line) => line.index + 1)

  return {
    lines,
    main: describeHexagram(mainBinary),
    changed: describeHexagram(changedBinary),
    movingLineNumbers,
  }
}

export function lineKindLabel(kind: YaoLine['kind']): string {
  switch (kind) {
    case 'old_yin':
      return '老阴 (6, 变爻)'
    case 'young_yang':
      return '少阳 (7)'
    case 'young_yin':
      return '少阴 (8)'
    case 'old_yang':
      return '老阳 (9, 变爻)'
    default:
      return kind
  }
}
