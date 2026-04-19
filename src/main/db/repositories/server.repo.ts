import { v4 as uuidv4 } from 'uuid'
import { getDb, persistDb } from '../index'
import type { Server, ServerFormData } from '../../../../shared/types'
import { cryptoService } from '../../services/crypto.service'

// sql.js returns rows as [col1, col2, ...] arrays — map to objects manually
function rowToServer(cols: string[], vals: (string | number | null)[]): Server {
  const r: Record<string, unknown> = {}
  cols.forEach((c, i) => { r[c] = vals[i] })
  return {
    id: r.id as string,
    name: r.name as string,
    projectName: r.project_name as string,
    host: r.host as string,
    port: r.port as number,
    username: r.username as string,
    authType: r.auth_type as 'password' | 'key',
    encryptedPassword: r.encrypted_password as string | undefined ?? undefined,
    encryptedPrivateKey: r.encrypted_private_key as string | undefined ?? undefined,
    encryptedPassphrase: r.encrypted_passphrase as string | undefined ?? undefined,
    localPath: r.local_path as string,
    remotePath: r.remote_path as string,
    ignorePatterns: JSON.parse(r.ignore_patterns as string ?? '[]'),
    autoWatch: r.auto_watch === 1,
    deleteOrphans: r.delete_orphans === 1,
    backup: r.backup === 1,
    postDeployCommand: (r.post_deploy_command as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string
  }
}

export const serverRepo = {
  list(): Server[] {
    const db = getDb()
    const res = db.exec('SELECT * FROM servers ORDER BY created_at DESC')
    if (!res.length) return []
    return res[0].values.map((row) => rowToServer(res[0].columns, row as (string | number | null)[]))
  },

  findById(id: string): Server | null {
    const db = getDb()
    const res = db.exec('SELECT * FROM servers WHERE id = ?', [id])
    if (!res.length || !res[0].values.length) return null
    return rowToServer(res[0].columns, res[0].values[0] as (string | number | null)[])
  },

  create(data: ServerFormData): Server {
    const db = getDb()
    const now = new Date().toISOString()
    const id = uuidv4()

    const encPass = data.password ? cryptoService.encrypt(data.password) : null
    const encKey = data.privateKey ? cryptoService.encrypt(data.privateKey) : null
    const encPhrase = data.passphrase ? cryptoService.encrypt(data.passphrase) : null

    db.run(`
      INSERT INTO servers (
        id, name, project_name, host, port, username, auth_type,
        encrypted_password, encrypted_private_key, encrypted_passphrase,
        local_path, remote_path, ignore_patterns, auto_watch, delete_orphans, backup,
        post_deploy_command, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      id, data.name, data.projectName, data.host, data.port, data.username, data.authType,
      encPass, encKey, encPhrase,
      data.localPath, data.remotePath,
      JSON.stringify(data.ignorePatterns ?? []),
      data.autoWatch ? 1 : 0,
      data.deleteOrphans ? 1 : 0,
      data.backup ? 1 : 0,
      data.postDeployCommand ?? null,
      now, now
    ])

    persistDb()
    return this.findById(id)!
  },

  update(id: string, data: Partial<ServerFormData>): Server | null {
    const db = getDb()
    if (!this.findById(id)) return null

    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = ?']
    const vals: (string | number | null)[] = [now]

    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name) }
    if (data.projectName !== undefined) { sets.push('project_name = ?'); vals.push(data.projectName) }
    if (data.host !== undefined) { sets.push('host = ?'); vals.push(data.host) }
    if (data.port !== undefined) { sets.push('port = ?'); vals.push(data.port) }
    if (data.username !== undefined) { sets.push('username = ?'); vals.push(data.username) }
    if (data.authType !== undefined) { sets.push('auth_type = ?'); vals.push(data.authType) }
    if (data.password !== undefined && data.password !== '') {
      sets.push('encrypted_password = ?')
      vals.push(cryptoService.encrypt(data.password))
    }
    if (data.privateKey !== undefined && data.privateKey !== '') {
      sets.push('encrypted_private_key = ?')
      vals.push(cryptoService.encrypt(data.privateKey))
    }
    if (data.passphrase !== undefined && data.passphrase !== '') {
      sets.push('encrypted_passphrase = ?')
      vals.push(cryptoService.encrypt(data.passphrase))
    }
    if (data.localPath !== undefined) { sets.push('local_path = ?'); vals.push(data.localPath) }
    if (data.remotePath !== undefined) { sets.push('remote_path = ?'); vals.push(data.remotePath) }
    if (data.ignorePatterns !== undefined) {
      sets.push('ignore_patterns = ?'); vals.push(JSON.stringify(data.ignorePatterns))
    }
    if (data.autoWatch !== undefined) { sets.push('auto_watch = ?'); vals.push(data.autoWatch ? 1 : 0) }
    if (data.deleteOrphans !== undefined) { sets.push('delete_orphans = ?'); vals.push(data.deleteOrphans ? 1 : 0) }
    if (data.backup !== undefined) { sets.push('backup = ?'); vals.push(data.backup ? 1 : 0) }
    if (data.postDeployCommand !== undefined) {
      sets.push('post_deploy_command = ?')
      vals.push(data.postDeployCommand || null)
    }

    vals.push(id)
    db.run(`UPDATE servers SET ${sets.join(', ')} WHERE id = ?`, vals)
    persistDb()
    return this.findById(id)
  },

  delete(id: string): boolean {
    const db = getDb()
    db.run('DELETE FROM servers WHERE id = ?', [id])
    persistDb()
    return true
  }
}
