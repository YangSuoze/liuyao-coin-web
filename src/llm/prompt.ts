import type { HexagramContent } from '../config/types'
import { lineKindLabel } from '../logic/hexagram'
import type { HexagramComputation } from '../logic/types'

interface BuildPromptOptions {
  question: string
  result: HexagramComputation
  mainContent?: HexagramContent
  changedContent?: HexagramContent
}

function formatContent(label: string, content?: HexagramContent): string {
  if (!content) {
    return `${label}: （配置中无内容）`
  }

  const title = content.title?.trim() ?? ''
  const text = content.text?.trim() ?? ''
  const resolvedTitle = title.length > 0 ? title : '（无标题）'
  const resolvedText = text.length > 0 ? text : '（空）'
  return `${label}: ${resolvedTitle}\n${resolvedText}`
}

export function buildInterpretationPrompt({
  question,
  result,
  mainContent,
  changedContent,
}: BuildPromptOptions): string {
  const lines = [...result.lines]
    .sort((a, b) => a.index - b.index)
    .map(
      (line) =>
        `第${line.index + 1}爻（自下而上）: 值=${line.value}, ${lineKindLabel(line.kind)}`,
    )
    .join('\n')

  const movingLines =
    result.movingLineNumbers.length > 0
      ? result.movingLineNumbers.join('、')
      : '无动爻'

  return [
    `所问何事：${question.trim() || '（用户未填写）'}`,
    '',
    `主卦：${result.main.name} (${result.main.binary})`,
    `主卦说明：${result.main.description}`,
    `变卦：${result.changed.name} (${result.changed.binary})`,
    `变卦说明：${result.changed.description}`,
    `动爻：${movingLines}`,
    '',
    '六爻详情：',
    lines,
    '',
    formatContent('主卦文本', mainContent),
    '',
    formatContent('变卦文本', changedContent),
    '',
    '请输出：',
    '1) 卦象总述（简明）',
    '2) 关键矛盾与趋势',
    '3) 对用户问题的判断（含不确定性）',
    '4) 3条可执行建议',
  ].join('\n')
}
