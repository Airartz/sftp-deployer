import { ipcMain } from 'electron'
import type { IpcResponse, BackupSession } from '../../../shared/types'
import { backupService } from '../services/backup.service'
import { serverRepo } from '../db/repositories/server.repo'
import { sftpService } from '../services/sftp.service'

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:listSessions', async (_event, serverId: string): Promise<IpcResponse<BackupSession[]>> => {
    try {
      return { ok: true, data: backupService.listSessions(serverId) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'backup:restoreSession',
    async (_event, serverId: string, sessionId: string): Promise<IpcResponse<{ restored: number; failed: string[] }>> => {
      try {
        const server = serverRepo.findById(serverId)
        if (!server) return { ok: false, error: 'Server nicht gefunden' }

        const sessions = backupService.listSessions(serverId)
        const session = sessions.find((s) => s.sessionId === sessionId)
        if (!session) return { ok: false, error: 'Backup-Session nicht gefunden' }

        const conn = await sftpService.getConnection(server)
        const result = await backupService.restoreSession(conn, session, server.remotePath)
        await sftpService.disconnect(serverId)

        return { ok: true, data: result }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('backup:deleteSession', async (_event, serverId: string, sessionId: string): Promise<IpcResponse> => {
    try {
      backupService.deleteSession(serverId, sessionId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
