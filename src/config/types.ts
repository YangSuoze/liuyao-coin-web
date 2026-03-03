export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface HexagramContent {
  title?: string
  text?: string
}

export type HexagramContentMap = Record<string, HexagramContent>

export interface AppConfig {
  llm: LlmConfig
  hexagrams: HexagramContentMap
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  llm: {
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  hexagrams: {},
}
