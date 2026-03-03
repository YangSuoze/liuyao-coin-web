import type { LlmConfig } from '../config/types'

interface ChatCompletionPayload {
  model: string
  messages: Array<{ role: 'system' | 'user'; content: string }>
  temperature: number
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

const DEFAULT_SYSTEM_PROMPT =
  '你是严谨的《易经》解读助手。请结合用户问题、主卦、变卦与爻象给出结构化分析，避免绝对化结论，并给出可执行建议。'

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export async function requestInterpretation(
  config: LlmConfig,
  userPrompt: string,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.baseUrl || !config.model) {
    throw new Error('Missing llm.baseUrl or llm.model in config.json')
  }

  if (!config.apiKey) {
    throw new Error('Missing llm.apiKey in config.json')
  }

  const requestBody: ChatCompletionPayload = {
    model: config.model,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }

  const response = await fetch(
    `${trimTrailingSlash(config.baseUrl)}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    },
  )

  const payload = (await response.json().catch(() => null)) as
    | OpenAIChatCompletionResponse
    | null

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `LLM request failed with status ${response.status}`,
    )
  }

  const content = payload?.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('LLM response did not include any text content')
  }

  return content
}
