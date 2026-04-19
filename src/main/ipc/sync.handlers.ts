import { ipcMain, BrowserWindow } from 'electron'
import type { IpcResponse } from '../../../shared/types'
import { serverRepo } from '../db/repositories/server.repo'
import { startSync, cancelSync } from '../services/sync.service'

export function registerSyncHandlers(): void {
  ipcMain.handle(
    'sync:start',
    async (event, serverId: string, options?: { isDryRun?: boolean }): Promise<IpcResponse<{ sessionId: string }>> => {
      try {
        const server = serverRepo.findById(serverId)
        if (!server) return { ok: false, error: 'Server nicht gefunden' }

        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return { ok: false, error: 'Kein Fenster gefunden' }

        const sessionId = await startSync(win, server, options ?? {})
        return { ok: true, data: { sessionId } }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('sync:cancel', async (_event, sessionId: string): Promise<IpcResponse> => {
    const cancelled = cancelSync(sessionId)
    return cancelled ? { ok: true } : { ok: false, error: 'Session nicht gefunden' }
  })
}
