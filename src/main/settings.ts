import { ipcMain } from 'electron'
import { loadConfig, saveConfig, type AppConfig } from './config'

// Load settings from config file on startup
export const settings: AppSettings = {
  ...loadConfig(),
  opacity: 0.8
}

ipcMain.handle('getAppSettings', () => {
  return settings
})

// Known mutable fields that the renderer is allowed to set
const MUTABLE_FIELDS: (keyof AppSettings)[] = [
  'apiProvider', 'apiBaseURL', 'apiKey', 'extraHeaders', 'model',
  'codeLanguage', 'customPrompt', 'proxyUrl', 'autoCheckUpdate',
  'screenshotMode', 'screenshotRegion', 'opacity'
]

/** Build an AppConfig snapshot from the current in-memory settings and persist to disk. */
export function persistConfig(): void {
  const configFields: AppConfig = {
    apiProvider: settings.apiProvider,
    apiBaseURL: settings.apiBaseURL,
    apiKey: settings.apiKey,
    extraHeaders: settings.extraHeaders,
    model: settings.model,
    codeLanguage: settings.codeLanguage,
    customPrompt: settings.customPrompt,
    proxyUrl: settings.proxyUrl,
    autoCheckUpdate: settings.autoCheckUpdate,
    screenshotMode: settings.screenshotMode,
    screenshotRegion: settings.screenshotRegion
  }
  saveConfig(configFields)
}

ipcMain.handle('updateAppSettings', (_event, _settings: Record<string, unknown>) => {
  // Only copy known fields — prevent arbitrary property injection
  const filtered: Partial<AppSettings> = {}
  for (const key of MUTABLE_FIELDS) {
    if (key in _settings) {
      ;(filtered as Record<string, unknown>)[key] = _settings[key]
    }
  }
  Object.assign(settings, filtered)
  persistConfig()
})

export type AppSettings = AppConfig & {
  opacity: number
}
