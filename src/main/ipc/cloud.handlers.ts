import { ipcMain } from 'electron'
import { cloudConnectionRepo } from '../db/repositories/cloud-connection.repo'
import { cryptoService } from '../services/crypto.service'
import { getCloudProvider, startOAuth } from '../services/cloud/cloud.service'
import type { IpcResponse, CloudConnection, CloudConnectionFormData, CloudFile } from '../../../shared/types'

function toPublic(conn: ReturnType<typeof cloudConnectionRepo.findById>): CloudConnection {
  if (!conn) throw new Error('nicht gefunden')
  return {
    id: conn.id, type: conn.type, name: conn.name,
    webdavUrl: conn.webdavUrl, webdavUsername: conn.webdavUsername,
    clientId: conn.clientId, hasTokens: conn.hasTokens, createdAt: conn.createdAt
  }
}

export function registerCloudHandlers(): void {

  ipcMain.handle('cloud:list', async (): Promise<IpcResponse<CloudConnection[]>> => {
    try {
      return { ok: true, data: cloudConnectionRepo.list().map(toPublic) }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:create', async (_, data: CloudConnectionFormData): Promise<IpcResponse<CloudConnection>> => {
    try {
      const created = cloudConnectionRepo.create({
        type: data.type, name: data.name,
        webdavUrl: data.webdavUrl, webdavUsername: data.webdavUsername,
        encryptedWebdavPassword: data.webdavPassword ? cryptoService.encrypt(data.webdavPassword) : undefined,
        clientId: data.clientId,
        encryptedClientSecret: data.clientSecret ? cryptoService.encrypt(data.clientSecret) : undefined
      })
      return { ok: true, data: toPublic(created) }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:update', async (_, id: string, data: Partial<CloudConnectionFormData>): Promise<IpcResponse<CloudConnection>> => {
    try {
      const updated = cloudConnectionRepo.update(id, {
        name: data.name, webdavUrl: data.webdavUrl, webdavUsername: data.webdavUsername,
        encryptedWebdavPassword: data.webdavPassword ? cryptoService.encrypt(data.webdavPassword) : undefined,
        clientId: data.clientId,
        encryptedClientSecret: data.clientSecret ? cryptoService.encrypt(data.clientSecret) : undefined
      })
      return { ok: true, data: toPublic(updated) }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:delete', async (_, id: string): Promise<IpcResponse> => {
    try { cloudConnectionRepo.delete(id); return { ok: true } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:startAuth', async (_, id: string): Promise<IpcResponse> => {
    try { await startOAuth(id); return { ok: true } }
    catch (e) { return { ok: false, error: String(e) } }
  })

  // ── Browser operations ────────────────────────────────────────────────────

  ipcMain.handle('cloud:browser:list', async (_, id: string, remotePath: string): Promise<IpcResponse<CloudFile[]>> => {
    try {
      const provider = await getCloudProvider(id)
      return { ok: true, data: await provider.list(remotePath) }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:browser:upload', async (_, id: string, localPath: string, remotePath: string): Promise<IpcResponse> => {
    try {
      const provider = await getCloudProvider(id)
      await provider.upload(localPath, remotePath)
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:browser:download', async (_, id: string, remotePath: string, localPath: string): Promise<IpcResponse> => {
    try {
      const provider = await getCloudProvider(id)
      await provider.download(remotePath, localPath)
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:browser:delete', async (_, id: string, remotePath: string, isDir: boolean): Promise<IpcResponse> => {
    try {
      const provider = await getCloudProvider(id)
      await provider.delete(remotePath, isDir)
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:browser:rename', async (_, id: string, from: string, to: string): Promise<IpcResponse> => {
    try {
      const provider = await getCloudProvider(id)
      await provider.rename(from, to)
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e) } }
  })

  ipcMain.handle('cloud:browser:mkdir', async (_, id: string, remotePath: string): Promise<IpcResponse> => {
    try {
      const provider = await getCloudProvider(id)
      await provider.mkdir(remotePath)
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e) } }
  })
}
