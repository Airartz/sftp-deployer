import { ipcMain, app } from 'electron'
import { execSync } from 'child_process'
import path from 'path'
import type { IpcResponse } from '../../../shared/types'

const REG_KEY_FILE = 'HKCU\\Software\\Classes\\*\\shell\\SFTPDeployer'
const REG_KEY_DIR  = 'HKCU\\Software\\Classes\\Directory\\shell\\SFTPDeployer'
const REG_KEY_BG   = 'HKCU\\Software\\Classes\\Directory\\Background\\shell\\SFTPDeployer'

function getExePath(): string {
  return process.env.NODE_ENV === 'development'
    ? path.join(process.cwd(), 'node_modules', '.bin', 'electron.cmd')
    : process.execPath
}

function regAdd(key: string, value: string): void {
  execSync(`reg add "${key}" /ve /d "${value}" /f`, { stdio: 'ignore' })
}

function regDelete(key: string): void {
  try {
    execSync(`reg delete "${key}" /f`, { stdio: 'ignore' })
  } catch {
    // Key may not exist — that's fine
  }
}

function isRegistered(): boolean {
  try {
    execSync(`reg query "${REG_KEY_FILE}"`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function registerContextMenuHandlers(): void {
  ipcMain.handle('contextmenu:isRegistered', (): IpcResponse<boolean> => {
    return { ok: true, data: isRegistered() }
  })

  ipcMain.handle('contextmenu:register', (): IpcResponse => {
    try {
      const exe = getExePath()
      const label = 'Mit SFTP Deployer hochladen'

      // File context menu
      regAdd(REG_KEY_FILE, label)
      regAdd(`${REG_KEY_FILE}\\command`, `"${exe}" "--upload-path=%1"`)

      // Folder context menu
      regAdd(REG_KEY_DIR, label)
      regAdd(`${REG_KEY_DIR}\\command`, `"${exe}" "--upload-path=%1"`)

      // Folder background context menu (right-click inside folder)
      regAdd(REG_KEY_BG, label)
      regAdd(`${REG_KEY_BG}\\command`, `"${exe}" "--upload-path=%V"`)

      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('contextmenu:unregister', (): IpcResponse => {
    try {
      regDelete(REG_KEY_FILE)
      regDelete(REG_KEY_DIR)
      regDelete(REG_KEY_BG)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
