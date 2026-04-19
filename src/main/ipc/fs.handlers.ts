import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { IpcResponse } from '../../../shared/types'

export interface FileEntry {
  relativePath: string
  isDirectory: boolean
  children?: FileEntry[]
}

export function registerFsHandlers(): void {
  ipcMain.handle('fs:pickFolder', async (event): Promise<IpcResponse<string>> => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await dialog.showOpenDialog(win!, {
      title: 'Lokalen Projektordner wählen',
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'Abgebrochen' }
    }

    return { ok: true, data: result.filePaths[0] }
  })

  ipcMain.handle('fs:pickKeyFile', async (event): Promise<IpcResponse<string>> => {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await dialog.showOpenDialog(win!, {
      title: 'SSH Private Key wählen',
      properties: ['openFile'],
      filters: [
        { name: 'SSH Keys', extensions: ['pem', 'ppk', 'key', 'rsa', 'ed25519'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: 'Abgebrochen' }
    }

    return { ok: true, data: result.filePaths[0] }
  })

  ipcMain.handle('fs:listFiles', async (_event, folderPath: string): Promise<IpcResponse<FileEntry[]>> => {
    try {
      function readDir(currentPath: string, base: string): FileEntry[] {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true })
        return entries
          .filter((e) => !e.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
            return a.name.localeCompare(b.name)
          })
          .map((e) => {
            const abs = path.join(currentPath, e.name)
            const rel = path.relative(base, abs).replace(/\\/g, '/')
            if (e.isDirectory()) {
              return { relativePath: rel, isDirectory: true, children: readDir(abs, base) }
            }
            return { relativePath: rel, isDirectory: false }
          })
      }
      return { ok: true, data: readDir(folderPath, folderPath) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('fs:getTempDir', async (): Promise<IpcResponse<string>> => {
    try {
      const dir = path.join(os.tmpdir(), 'sftp-deployer-transfer')
      fs.mkdirSync(dir, { recursive: true })
      return { ok: true, data: dir }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('fs:readKeyFile', async (_event, filePath: string): Promise<IpcResponse<string>> => {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const { isPPKFormat, convertPPKToOpenSSH } = await import('../utils/ppk-convert')
      if (isPPKFormat(content)) {
        const converted = convertPPKToOpenSSH(content)
        return { ok: true, data: converted }
      }
      return { ok: true, data: content }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
