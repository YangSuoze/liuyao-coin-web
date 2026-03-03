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

export interface PromptTemplates {
  system?: string
  userSuffix?: string
}

export interface AppConfig {
  llm: LlmConfig
  hexagrams: HexagramContentMap
  prompts?: PromptTemplates
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  llm: {
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  hexagrams: {},
  prompts: {
    system: "你是严谨的《易经》解读助手。请结合用户问题、主卦、变卦与爻象给出结构化分析，避免绝对化结论，并给出可执行建议。",
    userSuffix: "",
  },
}
