import { getDb, persistDb } from '../index'
import type { LogEntry, LogLevel } from '../../../../shared/types'

function rowToLog(cols: string[], vals: (string | number | null)[]): LogEntry {
  const r: Record<string, unknown> = {}
  cols.forEach((c, i) => { r[c] = vals[i] })
  return {
    id: r.id as number,
    serverId: r.server_id as string,
    sessionId: r.session_id as string,
    level: r.level as LogLevel,
    message: r.message as string,
    filePath: r.file_path as string | undefined ?? undefined,
    bytesTransferred: r.bytes_transferred as number | undefined ?? undefined,
    timestamp: r.timestamp as string
  }
}

export const logRepo = {
  insert(entry: Omit<LogEntry, 'id'>): void {
    const db = getDb()
    db.run(`
      INSERT INTO log_entries (server_id, session_id, level, message, file_path, bytes_transferred, timestamp)
      VALUES (?,?,?,?,?,?,?)
    `, [
      entry.serverId,
      entry.sessionId,
      entry.level,
      entry.message,
      entry.filePath ?? null,
      entry.bytesTransferred ?? null,
      entry.timestamp
    ])
    // Don't persist on every log line — caller can batch
  },

  getByServer(serverId: string, limit = 500): LogEntry[] {
    const db = getDb()
    const res = db.exec(
      'SELECT * FROM log_entries WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?',
      [serverId, limit]
    )
    if (!res.length) return []
    return res[0].values.map((row) => rowToLog(res[0].columns, row as (string | number | null)[]))
  },

  getBySession(sessionId: string): LogEntry[] {
    const db = getDb()
    const res = db.exec(
      'SELECT * FROM log_entries WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    )
    if (!res.length) return []
    return res[0].values.map((row) => rowToLog(res[0].columns, row as (string | number | null)[]))
  },

  clearByServer(serverId: string): void {
    const db = getDb()
    db.run('DELETE FROM log_entries WHERE server_id = ?', [serverId])
    persistDb()
  },

  pruneOlderThan(days: number): void {
    const db = getDb()
    const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString()
    db.run('DELETE FROM log_entries WHERE timestamp < ?', [cutoff])
    persistDb()
  }
}
