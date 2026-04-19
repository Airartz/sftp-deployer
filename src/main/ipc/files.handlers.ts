import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import type { IpcResponse } from '../../../shared/types'

const isDev = process.env.NODE_ENV === 'development'

export function registerFilesHandlers(): void {
  ipcMain.handle('files:createWindow', async (): Promise<IpcResponse<{ windowId: number }>> => {
    try {
      const win = new BrowserWindow({
        width: 1300,
        height: 800,
        minWidth: 800,
        minHeight: 500,
        backgroundColor: '#0d1117',
        title: 'SFTP Dateien',
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      })
      if (isDev) {
        win.loadURL((process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173') + '/#files')
      } else {
        win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'files' })
      }
      return { ok: true, data: { windowId: win.id } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
