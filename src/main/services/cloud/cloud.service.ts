import fs from 'fs'
import path from 'path'
import { createClient as createWebDAVClient } from 'webdav'
import { cryptoService } from '../crypto.service'
import { cloudConnectionRepo } from '../../db/repositories/cloud-connection.repo'
import { refreshToken, REDIRECT_URI, doOAuthFlow, exchangeCode } from './oauth.service'
import type { CloudFile } from '../../../../shared/types'

// ─── Unified interface ────────────────────────────────────────────────────────

export interface CloudProvider {
  list(path: string): Promise<CloudFile[]>
  upload(localPath: string, remotePath: string): Promise<void>
  download(remotePath: string, localPath: string): Promise<void>
  delete(remotePath: string, isDir: boolean): Promise<void>
  rename(from: string, to: string): Promise<void>
  mkdir(remotePath: string): Promise<void>
}

// ─── WebDAV ───────────────────────────────────────────────────────────────────

class WebDAVProvider implements CloudProvider {
  private client: ReturnType<typeof createWebDAVClient>

  constructor(url: string, username: string, password: string) {
    this.client = createWebDAVClient(url, { username, password })
  }

  async list(remotePath: string): Promise<CloudFile[]> {
    const items = await this.client.getDirectoryContents(remotePath)
    const arr = Array.isArray(items) ? items : (items as { data: unknown[] }).data as ReturnType<typeof createWebDAVClient> extends { getDirectoryContents: (...a: unknown[]) => Promise<infer R> } ? R extends unknown[] ? R : never[] : never[]
    return (arr as Array<{ basename: string; filename: string; type: string; size?: number; lastmod?: string }>).map(item => ({
      name: item.basename,
      fullPath: item.filename,
      isDirectory: item.type === 'directory',
      size: item.size ?? 0,
      mtime: item.lastmod ? Math.floor(new Date(item.lastmod).getTime() / 1000) : 0
    }))
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const data = fs.createReadStream(localPath)
    await this.client.putFileContents(remotePath, data, { overwrite: true })
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const buffer = await this.client.getFileContents(remotePath) as Buffer
    fs.writeFileSync(localPath, buffer)
  }

  async delete(remotePath: string, isDir: boolean): Promise<void> {
    if (isDir) await this.client.deleteFile(remotePath)
    else await this.client.deleteFile(remotePath)
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.moveFile(from, to)
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.client.createDirectory(remotePath, { recursive: true })
  }
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

const GDRIVE_API    = 'https://www.googleapis.com/drive/v3'
const GDRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

class GDriveProvider implements CloudProvider {
  constructor(private token: string) {}

  private h(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra }
  }

  async list(folderId: string): Promise<CloudFile[]> {
    const id = !folderId || folderId === '/' ? 'root' : folderId
    const q  = encodeURIComponent(`'${id}' in parents and trashed=false`)
    const fields = 'files(id,name,mimeType,size,modifiedTime)'
    const res = await fetch(`${GDRIVE_API}/files?q=${q}&fields=${fields}&pageSize=1000`, { headers: this.h() })
    if (!res.ok) throw new Error(`Google Drive: ${await res.text()}`)
    const data = await res.json() as { files: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }> }
    return data.files.map(f => ({
      name: f.name,
      fullPath: f.id,
      isDirectory: f.mimeType === 'application/vnd.google-apps.folder',
      size: parseInt(f.size ?? '0') || 0,
      mtime: f.modifiedTime ? Math.floor(new Date(f.modifiedTime).getTime() / 1000) : 0
    }))
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const fileName = path.basename(localPath)
    const parentId = remotePath || 'root'
    const content  = fs.readFileSync(localPath)
    const meta     = JSON.stringify({ name: fileName, parents: [parentId] })
    const boundary = '---uploadBoundary---'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--`)
    ])
    const res = await fetch(`${GDRIVE_UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    })
    if (!res.ok) throw new Error(`Google Drive upload: ${await res.text()}`)
  }

  async download(fileId: string, localPath: string): Promise<void> {
    const res = await fetch(`${GDRIVE_API}/files/${fileId}?alt=media`, { headers: this.h() })
    if (!res.ok) throw new Error(`Google Drive download: ${await res.text()}`)
    fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()))
  }

  async delete(fileId: string, _isDir: boolean): Promise<void> {
    const res = await fetch(`${GDRIVE_API}/files/${fileId}`, { method: 'DELETE', headers: this.h() })
    if (!res.ok && res.status !== 204) throw new Error(`Google Drive delete: ${res.status}`)
  }

  async rename(fileId: string, newName: string): Promise<void> {
    const res = await fetch(`${GDRIVE_API}/files/${fileId}`, {
      method: 'PATCH',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })
    if (!res.ok) throw new Error(`Google Drive rename: ${await res.text()}`)
  }

  async mkdir(parentId: string, name?: string): Promise<void> {
    const folderName = name ?? 'Neuer Ordner'
    const parent     = parentId || 'root'
    const res = await fetch(`${GDRIVE_API}/files`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parent] })
    })
    if (!res.ok) throw new Error(`Google Drive mkdir: ${await res.text()}`)
  }
}

// ─── Dropbox ──────────────────────────────────────────────────────────────────

const DBX_API     = 'https://api.dropboxapi.com/2'
const DBX_CONTENT = 'https://content.dropboxapi.com/2'

class DropboxProvider implements CloudProvider {
  constructor(private token: string) {}

  private h(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra }
  }

  async list(remotePath: string): Promise<CloudFile[]> {
    const p = remotePath === '/' || !remotePath ? '' : remotePath
    const res = await fetch(`${DBX_API}/files/list_folder`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p, include_deleted: false })
    })
    if (!res.ok) throw new Error(`Dropbox: ${await res.text()}`)
    const data = await res.json() as { entries: Array<{ '.tag': string; name: string; path_display: string; size?: number; server_modified?: string }> }
    return data.entries.map(e => ({
      name: e.name,
      fullPath: e.path_display,
      isDirectory: e['.tag'] === 'folder',
      size: e.size ?? 0,
      mtime: e.server_modified ? Math.floor(new Date(e.server_modified).getTime() / 1000) : 0
    }))
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const content = fs.readFileSync(localPath)
    const dest    = remotePath.startsWith('/') ? remotePath : `/${remotePath}`
    const res = await fetch(`${DBX_CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        ...this.h(),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path: dest, mode: 'overwrite' })
      },
      body: content
    })
    if (!res.ok) throw new Error(`Dropbox upload: ${await res.text()}`)
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const res = await fetch(`${DBX_CONTENT}/files/download`, {
      method: 'POST',
      headers: { ...this.h(), 'Dropbox-API-Arg': JSON.stringify({ path: remotePath }) }
    })
    if (!res.ok) throw new Error(`Dropbox download: ${await res.text()}`)
    fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()))
  }

  async delete(remotePath: string, _isDir: boolean): Promise<void> {
    const res = await fetch(`${DBX_API}/files/delete_v2`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: remotePath })
    })
    if (!res.ok) throw new Error(`Dropbox delete: ${await res.text()}`)
  }

  async rename(from: string, to: string): Promise<void> {
    const res = await fetch(`${DBX_API}/files/move_v2`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_path: from, to_path: to })
    })
    if (!res.ok) throw new Error(`Dropbox move: ${await res.text()}`)
  }

  async mkdir(remotePath: string): Promise<void> {
    const res = await fetch(`${DBX_API}/files/create_folder_v2`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: remotePath })
    })
    if (!res.ok) throw new Error(`Dropbox mkdir: ${await res.text()}`)
  }
}

// ─── OneDrive ─────────────────────────────────────────────────────────────────

const OD_API = 'https://graph.microsoft.com/v1.0/me/drive'

class OneDriveProvider implements CloudProvider {
  constructor(private token: string) {}

  private h(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra }
  }

  async list(remotePath: string): Promise<CloudFile[]> {
    const endpoint = !remotePath || remotePath === '/' ? '/root/children' : `/root:${remotePath}:/children`
    const res = await fetch(`${OD_API}${endpoint}?$top=500`, { headers: this.h() })
    if (!res.ok) throw new Error(`OneDrive: ${await res.text()}`)
    const data = await res.json() as { value: Array<{ name: string; folder?: unknown; size?: number; lastModifiedDateTime?: string }> }
    return (data.value ?? []).map(item => ({
      name: item.name,
      fullPath: !remotePath || remotePath === '/' ? `/${item.name}` : `${remotePath}/${item.name}`,
      isDirectory: !!item.folder,
      size: item.size ?? 0,
      mtime: item.lastModifiedDateTime ? Math.floor(new Date(item.lastModifiedDateTime).getTime() / 1000) : 0
    }))
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    const content = fs.readFileSync(localPath)
    const endpoint = `/root:${remotePath.startsWith('/') ? remotePath : '/' + remotePath}:/content`
    const res = await fetch(`${OD_API}${endpoint}`, {
      method: 'PUT',
      headers: { ...this.h(), 'Content-Type': 'application/octet-stream' },
      body: content
    })
    if (!res.ok) throw new Error(`OneDrive upload: ${await res.text()}`)
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const res = await fetch(`${OD_API}/root:${remotePath}:/content`, { headers: this.h() })
    if (!res.ok) throw new Error(`OneDrive download: ${await res.text()}`)
    fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()))
  }

  async delete(remotePath: string, _isDir: boolean): Promise<void> {
    const res = await fetch(`${OD_API}/root:${remotePath}`, { method: 'DELETE', headers: this.h() })
    if (!res.ok && res.status !== 204) throw new Error(`OneDrive delete: ${res.status}`)
  }

  async rename(from: string, to: string): Promise<void> {
    const newName = to.split('/').pop()!
    const res = await fetch(`${OD_API}/root:${from}`, {
      method: 'PATCH',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })
    if (!res.ok) throw new Error(`OneDrive rename: ${await res.text()}`)
  }

  async mkdir(remotePath: string): Promise<void> {
    const name   = remotePath.split('/').pop()!
    const parent = remotePath.substring(0, remotePath.lastIndexOf('/')) || '/'
    const ep     = parent === '/' ? '/root/children' : `/root:${parent}:/children`
    const res = await fetch(`${OD_API}${ep}`, {
      method: 'POST',
      headers: { ...this.h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
    })
    if (!res.ok) throw new Error(`OneDrive mkdir: ${await res.text()}`)
  }
}

// ─── OAuth constants ──────────────────────────────────────────────────────────

export const OAUTH_CONFIG = {
  gdrive: {
    authUrl:    'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:   'https://oauth2.googleapis.com/token',
    scope:      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
    extraParams: { access_type: 'offline', prompt: 'consent' } as Record<string, string>
  },
  dropbox: {
    authUrl:    'https://www.dropbox.com/oauth2/authorize',
    tokenUrl:   'https://api.dropboxapi.com/oauth2/token',
    scope:      '',
    extraParams: { token_access_type: 'offline' } as Record<string, string>
  },
  onedrive: {
    authUrl:    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl:   'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope:      'Files.ReadWrite offline_access',
    extraParams: {} as Record<string, string>
  }
} as const

// ─── Factory ──────────────────────────────────────────────────────────────────

async function getValidAccessToken(connectionId: string): Promise<string> {
  const conn = cloudConnectionRepo.findById(connectionId)
  if (!conn) throw new Error('Cloud-Verbindung nicht gefunden')
  if (conn.type === 'webdav') throw new Error('WebDAV braucht keinen Access Token')

  if (!conn.encryptedAccessToken) throw new Error('Keine Authentifizierung vorhanden. Bitte zuerst authentifizieren.')

  const now        = Date.now()
  const expiresAt  = conn.tokenExpiresAt ?? 0
  const accessToken = cryptoService.decrypt(conn.encryptedAccessToken)

  // Token still valid (with 60s buffer)
  if (expiresAt === 0 || now < expiresAt - 60_000) return accessToken

  // Refresh
  if (!conn.encryptedRefreshToken) throw new Error('Access Token abgelaufen. Bitte erneut authentifizieren.')
  const refreshTok    = cryptoService.decrypt(conn.encryptedRefreshToken)
  const clientId      = conn.clientId ?? ''
  const clientSecret  = conn.encryptedClientSecret ? cryptoService.decrypt(conn.encryptedClientSecret) : ''
  const cfg           = OAUTH_CONFIG[conn.type as keyof typeof OAUTH_CONFIG]
  const tokens        = await refreshToken(cfg.tokenUrl, refreshTok, clientId, clientSecret)
  const newExpiry     = tokens.expires_in ? now + tokens.expires_in * 1000 : 0
  cloudConnectionRepo.updateTokens(connectionId, cryptoService.encrypt(tokens.access_token), conn.encryptedRefreshToken, newExpiry)
  return tokens.access_token
}

export async function getCloudProvider(connectionId: string): Promise<CloudProvider> {
  const conn = cloudConnectionRepo.findById(connectionId)
  if (!conn) throw new Error('Cloud-Verbindung nicht gefunden')

  if (conn.type === 'webdav') {
    const url      = conn.webdavUrl ?? ''
    const username = conn.webdavUsername ?? ''
    const password = conn.encryptedWebdavPassword ? cryptoService.decrypt(conn.encryptedWebdavPassword) : ''
    return new WebDAVProvider(url, username, password)
  }

  const token = await getValidAccessToken(connectionId)
  if (conn.type === 'gdrive')   return new GDriveProvider(token)
  if (conn.type === 'dropbox')  return new DropboxProvider(token)
  if (conn.type === 'onedrive') return new OneDriveProvider(token)
  throw new Error(`Unbekannter Provider: ${conn.type}`)
}

export async function startOAuth(connectionId: string): Promise<void> {
  const conn = cloudConnectionRepo.findById(connectionId)
  if (!conn) throw new Error('Cloud-Verbindung nicht gefunden')
  if (conn.type === 'webdav') throw new Error('WebDAV verwendet kein OAuth')

  const cfg          = OAUTH_CONFIG[conn.type as keyof typeof OAUTH_CONFIG]
  const clientId     = conn.clientId ?? ''
  const clientSecret = conn.encryptedClientSecret ? cryptoService.decrypt(conn.encryptedClientSecret) : ''

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    ...(cfg.scope ? { scope: cfg.scope } : {}),
    ...cfg.extraParams
  })

  const code   = await doOAuthFlow(`${cfg.authUrl}?${params.toString()}`)
  const tokens = await exchangeCode(cfg.tokenUrl, code, clientId, clientSecret)
  const expiry = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0

  cloudConnectionRepo.updateTokens(
    connectionId,
    cryptoService.encrypt(tokens.access_token),
    tokens.refresh_token ? cryptoService.encrypt(tokens.refresh_token) : undefined,
    expiry
  )
}
