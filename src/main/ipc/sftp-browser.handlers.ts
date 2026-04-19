import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { IpcResponse, SftpEntry, LocalEntry, Server } from '../../../shared/types'
import { serverRepo } from '../db/repositories/server.repo'
import { sftpService } from '../services/sftp.service'
import { cryptoService } from '../services/crypto.service'

// In-memory map for temporary (unsaved) direct connections
const tempServers = new Map<string, Server>()

async function getConn(serverId: string) {
  const server = tempServers.get(serverId) ?? serverRepo.findById(serverId)
  if (!server) throw new Error('Server nicht gefunden')
  return sftpService.getConnection(server)
}

export function registerSftpBrowserHandlers(): void {

  ipcMain.handle('sftpbrowser:list', async (_e, serverId: string, remotePath: string): Promise<IpcResponse<SftpEntry[]>> => {
    try {
      const conn = await getConn(serverId)
      const items = await conn.client.list(remotePath)
      const entries: SftpEntry[] = items
        .filter(i => i.name !== '.' && i.name !== '..')
        .sort((a, b) => {
          if ((a.type === 'd') !== (b.type === 'd')) return a.type === 'd' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map(i => ({
          name: i.name,
          fullPath: remotePath.replace(/\/$/, '') + '/' + i.name,
          isDirectory: i.type === 'd',
          size: i.size,
          mtime: Math.floor((i.modifyTime ?? 0) / 1000),
          permissions: i.rights ? (
            ((i.rights.user.includes('r') ? 4 : 0) + (i.rights.user.includes('w') ? 2 : 0) + (i.rights.user.includes('x') ? 1 : 0)) * 64 +
            ((i.rights.group.includes('r') ? 4 : 0) + (i.rights.group.includes('w') ? 2 : 0) + (i.rights.group.includes('x') ? 1 : 0)) * 8 +
            ((i.rights.other.includes('r') ? 4 : 0) + (i.rights.other.includes('w') ? 2 : 0) + (i.rights.other.includes('x') ? 1 : 0))
          ) : 0o644
        }))
      return { ok: true, data: entries }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:listLocal', async (_e, localPath: string): Promise<IpcResponse<LocalEntry[]>> => {
    try {
      const items = fs.readdirSync(localPath, { withFileTypes: true })
      const entries: LocalEntry[] = items
        .filter(i => i.name !== 'Thumbs.db')
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map(i => {
          const full = path.join(localPath, i.name)
          let size = 0, mtime = 0
          try { const s = fs.statSync(full); size = s.size; mtime = Math.floor(s.mtimeMs / 1000) } catch {}
          return { name: i.name, fullPath: full, isDirectory: i.isDirectory(), size, mtime }
        })
      return { ok: true, data: entries }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:upload', async (_e, serverId: string, localPath: string, remotePath: string): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      await conn.put(localPath, remotePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:uploadFolder', async (_e, serverId: string, localPath: string, remotePath: string): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      async function uploadDir(local: string, remote: string) {
        await conn.client.mkdir(remote, true)
        const items = fs.readdirSync(local, { withFileTypes: true })
        for (const item of items) {
          const lp = path.join(local, item.name)
          const rp = remote.replace(/\/$/, '') + '/' + item.name
          if (item.isDirectory()) await uploadDir(lp, rp)
          else await conn.put(lp, rp)
        }
      }
      await uploadDir(localPath, remotePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:download', async (_e, serverId: string, remotePath: string, localPath: string): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      await conn.get(remotePath, localPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:deleteRemote', async (_e, serverId: string, remotePath: string, isDirectory: boolean): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      if (isDirectory) await conn.client.rmdir(remotePath, true)
      else await conn.delete(remotePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:rename', async (_e, serverId: string, oldPath: string, newPath: string): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      await conn.client.rename(oldPath, newPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:mkdir', async (_e, serverId: string, remotePath: string): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      await conn.mkdir(remotePath, true)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:readFile', async (_e, serverId: string, remotePath: string): Promise<IpcResponse<string>> => {
    try {
      const conn = await getConn(serverId)
      const buf = await conn.client.get(remotePath) as Buffer
      return { ok: true, data: buf.toString('utf8') }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:writeFile', async (_e, serverId: string, remotePath: string, content: string): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      const buf = Buffer.from(content, 'utf8')
      await conn.client.put(buf, remotePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:chmod', async (_e, serverId: string, remotePath: string, mode: number): Promise<IpcResponse> => {
    try {
      const conn = await getConn(serverId)
      await conn.client.chmod(remotePath, mode)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sftpbrowser:pickLocalFolder', async (event): Promise<IpcResponse<string>> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths.length) return { ok: false, error: 'Abgebrochen' }
    return { ok: true, data: res.filePaths[0] }
  })

  ipcMain.handle('sftpbrowser:openLocalFolder', async (_e, localPath: string): Promise<IpcResponse> => {
    await shell.openPath(localPath)
    return { ok: true }
  })

  ipcMain.handle('sftpbrowser:connectDirect', async (_e, config: {
    host: string; port: number; username: string; password?: string; authType: 'password' | 'key'
  }): Promise<IpcResponse<string>> => {
    try {
      const id = 'temp_' + uuidv4()
      const now = new Date().toISOString()
      const server: Server = {
        id, name: `${config.username}@${config.host}`,
        projectName: '', host: config.host, port: config.port,
        username: config.username, authType: config.authType,
        encryptedPassword: config.password ? cryptoService.encrypt(config.password) : undefined,
        localPath: '', remotePath: '/', ignorePatterns: [],
        autoWatch: false, deleteOrphans: false, backup: false,
        createdAt: now, updatedAt: now
      }
      tempServers.set(id, server)
      // Test connection immediately
      await sftpService.getConnection(server)
      return { ok: true, data: id }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('sftpbrowser:removeTemp', async (_e, id: string): Promise<IpcResponse> => {
    tempServers.delete(id)
    return { ok: true }
  })
}
