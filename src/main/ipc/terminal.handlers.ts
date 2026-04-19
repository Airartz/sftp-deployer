import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { IpcResponse, TerminalConnectConfig, TerminalSessionInfo } from '../../../shared/types'
import { serverRepo } from '../db/repositories/server.repo'
import { terminalService, setSessionsChangedCallback } from '../services/terminal.service'

const isDev = process.env.NODE_ENV === 'development'

function getWin(event?: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  if (event) {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) return win
  }
  return BrowserWindow.getAllWindows()[0] ?? null
}

function broadcastSessionsUpdated(): void {
  const sessions = terminalService.getSessionInfos()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:sessionsUpdated', sessions)
    }
  }
}

export function registerTerminalHandlers(): void {
  setSessionsChangedCallback(broadcastSessionsUpdated)

  ipcMain.handle('terminal:open', async (event, serverId: string): Promise<IpcResponse<{ sessionId: string }>> => {
    try {
      const server = serverRepo.findById(serverId)
      if (!server) return { ok: false, error: 'Server nicht gefunden' }
      const win = getWin(event)
      if (!win) return { ok: false, error: 'Kein Fenster verfügbar' }
      const sessionId = uuidv4()
      const label = `${server.username}@${server.host}`
      await terminalService.open(win, server, sessionId, label)
      return { ok: true, data: { sessionId } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('terminal:openDirect', async (event, config: TerminalConnectConfig, label?: string): Promise<IpcResponse<{ sessionId: string }>> => {
    try {
      const win = getWin(event)
      if (!win) return { ok: false, error: 'Kein Fenster verfügbar' }
      const sessionId = uuidv4()
      await terminalService.openDirect(win, config, sessionId, label ?? `${config.username}@${config.host}`)
      return { ok: true, data: { sessionId } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('terminal:createWindow', async (): Promise<IpcResponse<{ windowId: number }>> => {
    try {
      const win = new BrowserWindow({
        width: 960,
        height: 600,
        minWidth: 640,
        minHeight: 400,
        backgroundColor: '#0d1117',
        title: 'Terminal',
        webPreferences: {
          preload: path.join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false
        }
      })
      if (isDev) {
        win.loadURL((process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173') + '/#terminal')
      } else {
        win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'terminal' })
      }
      return { ok: true, data: { windowId: win.id } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('terminal:getSessions', async (): Promise<IpcResponse<TerminalSessionInfo[]>> => {
    return { ok: true, data: terminalService.getSessionInfos() }
  })

  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
    terminalService.write(sessionId, data)
  })

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    terminalService.resize(sessionId, cols, rows)
  })

  ipcMain.on('terminal:close', (_event, sessionId: string) => {
    terminalService.close(sessionId)
  })
}
