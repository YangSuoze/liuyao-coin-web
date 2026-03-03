import { DEFAULT_APP_CONFIG, type AppConfig, type HexagramContentMap, type PromptTemplates } from './types'

const CONFIG_PATH = '/config.json'

function sanitizeHexagramMap(raw: unknown): HexagramContentMap {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const out: HexagramContentMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || !/^([01]{6})$/.test(key)) {
      continue
    }

    if (typeof value === 'string') {
      out[key] = { text: value }
      continue
    }

    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      out[key] = {
        title: typeof v.title === 'string' ? v.title : undefined,
        text: typeof v.text === 'string' ? v.text : undefined,
      }
    }
  }

  return out
}

function normalizeConfig(raw: unknown): AppConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_APP_CONFIG
  }

  const root = raw as Record<string, unknown>
  const llmRoot =
    root.llm && typeof root.llm === 'object'
      ? (root.llm as Record<string, unknown>)
      : {}



  const promptsRoot =
    root.prompts && typeof root.prompts === 'object'
      ? (root.prompts as Record<string, unknown>)
      : {}

  const prompts: PromptTemplates = {
    system:
      typeof promptsRoot.system === 'string' && promptsRoot.system.trim().length > 0
        ? promptsRoot.system.trim()
        : DEFAULT_APP_CONFIG.prompts?.system,
    userSuffix:
      typeof promptsRoot.userSuffix === 'string'
        ? promptsRoot.userSuffix
        : DEFAULT_APP_CONFIG.prompts?.userSuffix,
  }

  return {
    llm: {
      baseUrl:
        typeof llmRoot.baseUrl === 'string' && llmRoot.baseUrl.trim().length > 0
          ? llmRoot.baseUrl.trim()
          : DEFAULT_APP_CONFIG.llm.baseUrl,
      apiKey: typeof llmRoot.apiKey === 'string' ? llmRoot.apiKey.trim() : '',
      model:
        typeof llmRoot.model === 'string' && llmRoot.model.trim().length > 0
          ? llmRoot.model.trim()
          : DEFAULT_APP_CONFIG.llm.model,
    },
    hexagrams: sanitizeHexagramMap(root.hexagrams),
    prompts,
  }
}

export async function loadAppConfig(): Promise<AppConfig> {
  const response = await fetch(CONFIG_PATH, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load ${CONFIG_PATH}: HTTP ${response.status}`)
  }

  const raw = (await response.json()) as unknown
  return normalizeConfig(raw)
}
