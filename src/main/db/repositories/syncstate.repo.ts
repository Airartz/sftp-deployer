import { getDb, persistDb } from '../index'
import type { SyncState } from '../../../../shared/types'

function rowToState(cols: string[], vals: (string | number | null)[]): SyncState {
  const r: Record<string, unknown> = {}
  cols.forEach((c, i) => { r[c] = vals[i] })
  return {
    id: r.id as number,
    serverId: r.server_id as string,
    relativePath: r.relative_path as string,
    localSize: r.local_size as number,
    localMtime: r.local_mtime as number,
    localHash: r.local_hash as string,
    remoteSize: r.remote_size as number,
    remoteMtime: r.remote_mtime as number,
    remoteHash: r.remote_hash as string | null,
    lastSyncedAt: r.last_synced_at as string,
    status: r.status as SyncState['status']
  }
}

export const syncStateRepo = {
  findByServerAndPath(serverId: string, relativePath: string): SyncState | null {
    const db = getDb()
    const res = db.exec(
      'SELECT * FROM sync_states WHERE server_id = ? AND relative_path = ?',
      [serverId, relativePath]
    )
    if (!res.length || !res[0].values.length) return null
    return rowToState(res[0].columns, res[0].values[0] as (string | number | null)[])
  },

  listByServer(serverId: string): SyncState[] {
    const db = getDb()
    const res = db.exec('SELECT * FROM sync_states WHERE server_id = ?', [serverId])
    if (!res.length) return []
    return res[0].values.map((row) => rowToState(res[0].columns, row as (string | number | null)[]))
  },

  upsert(state: Omit<SyncState, 'id'>): void {
    const db = getDb()
    db.run(`
      INSERT INTO sync_states (
        server_id, relative_path, local_size, local_mtime, local_hash,
        remote_size, remote_mtime, remote_hash, last_synced_at, status
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(server_id, relative_path) DO UPDATE SET
        local_size = excluded.local_size,
        local_mtime = excluded.local_mtime,
        local_hash = excluded.local_hash,
        remote_size = excluded.remote_size,
        remote_mtime = excluded.remote_mtime,
        remote_hash = excluded.remote_hash,
        last_synced_at = excluded.last_synced_at,
        status = excluded.status
    `, [
      state.serverId,
      state.relativePath,
      state.localSize,
      state.localMtime,
      state.localHash,
      state.remoteSize,
      state.remoteMtime,
      state.remoteHash ?? null,
      state.lastSyncedAt,
      state.status
    ])
    persistDb()
  },

  deleteByServerAndPath(serverId: string, relativePath: string): void {
    const db = getDb()
    db.run('DELETE FROM sync_states WHERE server_id = ? AND relative_path = ?', [serverId, relativePath])
    persistDb()
  },

  deleteByServer(serverId: string): void {
    const db = getDb()
    db.run('DELETE FROM sync_states WHERE server_id = ?', [serverId])
    persistDb()
  }
}
