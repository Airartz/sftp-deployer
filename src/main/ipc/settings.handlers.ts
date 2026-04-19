import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { IpcResponse, AppSettings } from '../../../shared/types'

const SETTINGS_PATH = (): string => path.join(app.getPath('userData'), 'settings.json')

const BASE_DEFAULTS = {
  theme: 'dark' as const,
  defaultPort: 22,
  logRetentionDays: 30,
  maxConcurrentUploads: 3,
  hashLargeFileThresholdMB: 10
}

function readSettings(): AppSettings {
  const p = SETTINGS_PATH()
  if (!fs.existsSync(p)) {
    const fresh: AppSettings = {
      encryptionSalt: crypto.randomBytes(32).toString('hex'),
      ...BASE_DEFAULTS
    }
    fs.writeFileSync(p, JSON.stringify(fresh, null, 2))
    return fresh
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<AppSettings>
    // Preserve existing encryptionSalt — never regenerate it for an existing install
    return { encryptionSalt: '', ...BASE_DEFAULTS, ...raw } as AppSettings
  } catch {
    // File corrupt — return base defaults; salt is empty which cryptoService must handle
    return { encryptionSalt: '', ...BASE_DEFAULTS }
  }
}

function writeSettings(settings: AppSettings): void {
  fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2))
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async (): Promise<IpcResponse<AppSettings>> => {
    try {
      return { ok: true, data: readSettings() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('settings:update', async (_event, data: Partial<AppSettings>): Promise<IpcResponse<AppSettings>> => {
    try {
      const current = readSettings()
      const updated = { ...current, ...data }
      writeSettings(updated)
      return { ok: true, data: updated }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}

export function getSettings(): AppSettings {
  return readSettings()
}
