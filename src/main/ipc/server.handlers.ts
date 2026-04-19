import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { IpcResponse, Server, ServerFormData } from '../../../shared/types'
import { serverRepo } from '../db/repositories/server.repo'
import { sftpService } from '../services/sftp.service'
import { SftpConnection } from '../services/sftp.service'
import { watcherService } from '../services/watcher.service'
import { cryptoService } from '../services/crypto.service'
import { pingHost } from '../services/ping.service'

export function registerServerHandlers(): void {
  ipcMain.handle('servers:list', async (): Promise<IpcResponse<Server[]>> => {
    try {
      return { ok: true, data: serverRepo.list() }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('servers:create', async (_event, data: ServerFormData): Promise<IpcResponse<Server>> => {
    try {
      const server = serverRepo.create(data)
      watcherService.syncWithServer(server)
      return { ok: true, data: server }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('servers:update', async (_event, id: string, data: Partial<ServerFormData>): Promise<IpcResponse<Server>> => {
    try {
      const server = serverRepo.update(id, data)
      if (!server) return { ok: false, error: 'Server nicht gefunden' }
      // Sync watcher state with new autoWatch setting
      watcherService.syncWithServer(server)
      return { ok: true, data: server }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('servers:delete', async (_event, id: string): Promise<IpcResponse> => {
    try {
      watcherService.stop(id)
      await sftpService.disconnect(id)
      const deleted = serverRepo.delete(id)
      if (!deleted) return { ok: false, error: 'Server nicht gefunden' }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('servers:testConnection', async (_event, id: string): Promise<IpcResponse<{ ms: number }>> => {
    try {
      const server = serverRepo.findById(id)
      if (!server) return { ok: false, error: 'Server nicht gefunden' }

      const start = Date.now()
      const conn = await sftpService.getConnection(server)
      const ms = await conn.ping()
      await sftpService.disconnect(id)

      return { ok: true, data: { ms } }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Test connection with unsaved form data (before the server has an ID)
  ipcMain.handle('servers:testNewConnection', async (_event, data: ServerFormData): Promise<IpcResponse<{ ms: number }>> => {
    const tempServer: Server = {
      id: uuidv4(),
      name: data.name,
      projectName: data.projectName,
      host: data.host,
      port: data.port,
      username: data.username,
      authType: data.authType,
      encryptedPassword: data.password ? cryptoService.encrypt(data.password) : undefined,
      encryptedPrivateKey: data.privateKey ? cryptoService.encrypt(data.privateKey) : undefined,
      encryptedPassphrase: data.passphrase ? cryptoService.encrypt(data.passphrase) : undefined,
      localPath: data.localPath,
      remotePath: data.remotePath,
      ignorePatterns: data.ignorePatterns,
      autoWatch: data.autoWatch,
      deleteOrphans: data.deleteOrphans,
      backup: data.backup ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    try {
      const conn = new SftpConnection()
      await conn.connect(tempServer)
      const start = Date.now()
      await conn.ping()
      const ms = Date.now() - start
      await conn.disconnect()
      return { ok: true, data: { ms } }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // TCP ping — fast reachability check without full SFTP auth
  ipcMain.handle('servers:ping', async (_event, id: string): Promise<IpcResponse<{ ms: number }>> => {
    try {
      const server = serverRepo.findById(id)
      if (!server) return { ok: false, error: 'Server nicht gefunden' }
      const result = await pingHost(server.host, server.port)
      if (!result.ok) return { ok: false, error: 'Nicht erreichbar' }
      return { ok: true, data: { ms: result.ms } }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // Toggle watcher for a server from UI
  ipcMain.handle('servers:setWatch', async (_event, id: string, active: boolean): Promise<IpcResponse> => {
    try {
      const server = serverRepo.update(id, { autoWatch: active })
      if (!server) return { ok: false, error: 'Server nicht gefunden' }
      watcherService.syncWithServer(server)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('serverConfig:export', async (): Promise<IpcResponse<string>> => {
    try {
      const servers = serverRepo.list()
      const exportData = servers.map((s) => ({
        name: s.name,
        projectName: s.projectName,
        host: s.host,
        port: s.port,
        username: s.username,
        authType: s.authType,
        localPath: s.localPath,
        remotePath: s.remotePath,
        ignorePatterns: s.ignorePatterns,
        autoWatch: s.autoWatch,
        deleteOrphans: s.deleteOrphans,
        backup: s.backup,
        postDeployCommand: s.postDeployCommand ?? ''
      }))
      return { ok: true, data: JSON.stringify(exportData, null, 2) }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('serverConfig:import', async (_event, json: string): Promise<IpcResponse<{ imported: number; skipped: number }>> => {
    try {
      const list = JSON.parse(json) as ServerFormData[]
      if (!Array.isArray(list)) return { ok: false, error: 'Ungültiges Format' }

      const existing = serverRepo.list().map((s) => `${s.host}:${s.port}:${s.username}`)
      let imported = 0
      let skipped = 0

      for (const entry of list) {
        const key = `${entry.host}:${entry.port}:${entry.username}`
        if (existing.includes(key)) { skipped++; continue }
        serverRepo.create(entry)
        imported++
      }

      return { ok: true, data: { imported, skipped } }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })
}
