import { ipcMain } from 'electron'
import type { IpcResponse, LogEntry, DeployStats } from '../../../shared/types'
import { logRepo } from '../db/repositories/log.repo'
import { serverRepo } from '../db/repositories/server.repo'

export function registerLogHandlers(): void {
  ipcMain.handle('logs:getHistory', async (_event, serverId: string, limit = 500): Promise<IpcResponse<LogEntry[]>> => {
    try {
      return { ok: true, data: logRepo.getByServer(serverId, limit) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('logs:clearHistory', async (_event, serverId: string): Promise<IpcResponse> => {
    try {
      logRepo.clearByServer(serverId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('logs:getStats', async (): Promise<IpcResponse<DeployStats>> => {
    try {
      const servers = serverRepo.list()
      const nameMap: Record<string, string> = {}
      servers.forEach((s) => { nameMap[s.id] = s.name })
      return { ok: true, data: logRepo.getStats(nameMap) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
