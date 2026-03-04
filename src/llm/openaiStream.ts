import type { LlmConfig } from '../config/types'

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string
    }
  }>
}

export async function requestInterpretationStream(params: {
  config: LlmConfig
  userPrompt: string
  systemPrompt: string
  onToken: (chunk: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const { config, userPrompt, systemPrompt, onToken, signal } = params

  const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`

  const requestBody = {
    model: config.model,
    temperature: 0.7,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `LLM request failed: ${response.status} ${response.statusText} ${text}`.trim(),
    )
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming unavailable: response body is null')
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE events are separated by a blank line.
    const events = buffer.split(/\n\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      const lines = event
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') return

        let parsed: ChatCompletionStreamChunk | null = null
        try {
          parsed = JSON.parse(data) as ChatCompletionStreamChunk
        } catch {
          parsed = null
        }

        const delta = parsed?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          onToken(delta)
        }
      }
    }
  }
}
