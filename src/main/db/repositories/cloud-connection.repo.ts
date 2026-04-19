import { getDb, persistDb } from '../index'
import { v4 as uuidv4 } from 'uuid'
import type { CloudConnection } from '../../../../shared/types'

function rowToConn(cols: string[], vals: (string | number | null)[]): CloudConnection & {
  encryptedWebdavPassword?: string
  encryptedClientSecret?: string
  encryptedAccessToken?: string
  encryptedRefreshToken?: string
} {
  const r: Record<string, unknown> = {}
  cols.forEach((c, i) => { r[c] = vals[i] })
  return {
    id: r.id as string,
    type: r.type as CloudConnection['type'],
    name: r.name as string,
    webdavUrl: r.webdav_url as string | undefined ?? undefined,
    webdavUsername: r.webdav_username as string | undefined ?? undefined,
    encryptedWebdavPassword: r.encrypted_webdav_password as string | undefined ?? undefined,
    clientId: r.client_id as string | undefined ?? undefined,
    encryptedClientSecret: r.encrypted_client_secret as string | undefined ?? undefined,
    encryptedAccessToken: r.encrypted_access_token as string | undefined ?? undefined,
    encryptedRefreshToken: r.encrypted_refresh_token as string | undefined ?? undefined,
    tokenExpiresAt: r.token_expires_at as number | undefined ?? undefined,
    hasTokens: !!(r.encrypted_access_token),
    createdAt: r.created_at as string,
  }
}

export const cloudConnectionRepo = {
  list() {
    const db = getDb()
    const res = db.exec('SELECT * FROM cloud_connections ORDER BY created_at ASC')
    if (!res.length) return []
    return res[0].values.map(row => rowToConn(res[0].columns, row as (string | number | null)[]))
  },

  findById(id: string) {
    const db = getDb()
    const res = db.exec('SELECT * FROM cloud_connections WHERE id = ?', [id])
    if (!res.length || !res[0].values.length) return null
    return rowToConn(res[0].columns, res[0].values[0] as (string | number | null)[])
  },

  create(data: {
    type: string; name: string; webdavUrl?: string; webdavUsername?: string
    encryptedWebdavPassword?: string; clientId?: string; encryptedClientSecret?: string
  }) {
    const db = getDb()
    const id = uuidv4()
    const now = new Date().toISOString()
    db.run(`INSERT INTO cloud_connections
      (id, type, name, webdav_url, webdav_username, encrypted_webdav_password, client_id, encrypted_client_secret, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, data.type, data.name, data.webdavUrl ?? null, data.webdavUsername ?? null,
       data.encryptedWebdavPassword ?? null, data.clientId ?? null, data.encryptedClientSecret ?? null, now])
    persistDb()
    return this.findById(id)!
  },

  update(id: string, data: {
    name?: string; webdavUrl?: string; webdavUsername?: string
    encryptedWebdavPassword?: string; clientId?: string; encryptedClientSecret?: string
  }) {
    const db = getDb()
    const fields: string[] = []
    const vals: (string | null)[] = []
    if (data.name !== undefined)                    { fields.push('name = ?');                          vals.push(data.name) }
    if (data.webdavUrl !== undefined)               { fields.push('webdav_url = ?');                    vals.push(data.webdavUrl ?? null) }
    if (data.webdavUsername !== undefined)          { fields.push('webdav_username = ?');               vals.push(data.webdavUsername ?? null) }
    if (data.encryptedWebdavPassword !== undefined) { fields.push('encrypted_webdav_password = ?');     vals.push(data.encryptedWebdavPassword ?? null) }
    if (data.clientId !== undefined)                { fields.push('client_id = ?');                     vals.push(data.clientId ?? null) }
    if (data.encryptedClientSecret !== undefined)   { fields.push('encrypted_client_secret = ?');       vals.push(data.encryptedClientSecret ?? null) }
    if (!fields.length) return this.findById(id)
    db.run(`UPDATE cloud_connections SET ${fields.join(', ')} WHERE id = ?`, [...vals, id])
    persistDb()
    return this.findById(id)
  },

  updateTokens(id: string, accessToken: string, refreshToken?: string, expiresAt?: number) {
    const db = getDb()
    db.run(`UPDATE cloud_connections SET encrypted_access_token = ?, encrypted_refresh_token = ?, token_expires_at = ? WHERE id = ?`,
      [accessToken, refreshToken ?? null, expiresAt ?? null, id])
    persistDb()
  },

  delete(id: string) {
    const db = getDb()
    db.run('DELETE FROM cloud_connections WHERE id = ?', [id])
    persistDb()
  }
}
