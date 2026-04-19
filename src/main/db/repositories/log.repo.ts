import { getDb, persistDb } from '../index'
import type { LogEntry, LogLevel, DeployStats, DailyStats } from '../../../../shared/types'

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
  },

  getStats(serverNames: Record<string, string>): DeployStats {
    const db = getDb()

    const syncsRes = db.exec(`SELECT COUNT(DISTINCT session_id) as c FROM log_entries`)
    const totalSyncs = (syncsRes[0]?.values[0]?.[0] as number) ?? 0

    const uploadsRes = db.exec(`SELECT COUNT(*) as c FROM log_entries WHERE message LIKE 'Uploaded:%'`)
    const totalUploads = (uploadsRes[0]?.values[0]?.[0] as number) ?? 0

    const errorsRes = db.exec(`SELECT COUNT(*) as c FROM log_entries WHERE level = 'error'`)
    const totalErrors = (errorsRes[0]?.values[0]?.[0] as number) ?? 0

    const bytesRes = db.exec(`SELECT COALESCE(SUM(bytes_transferred),0) FROM log_entries`)
    const totalBytesTransferred = (bytesRes[0]?.values[0]?.[0] as number) ?? 0

    const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
    const dailyRes = db.exec(`
      SELECT
        substr(timestamp,1,10) as day,
        SUM(CASE WHEN message LIKE 'Uploaded:%' THEN 1 ELSE 0 END) as uploads,
        SUM(CASE WHEN level='error' THEN 1 ELSE 0 END) as errors,
        COALESCE(SUM(bytes_transferred),0) as bytes
      FROM log_entries
      WHERE timestamp >= ?
      GROUP BY day
      ORDER BY day ASC
    `, [cutoff])

    const last30Days: DailyStats[] = (dailyRes[0]?.values ?? []).map((row) => ({
      date: row[0] as string,
      uploads: row[1] as number,
      errors: row[2] as number,
      bytesTransferred: row[3] as number
    }))

    const topRes = db.exec(`
      SELECT server_id, COUNT(DISTINCT session_id) as syncs
      FROM log_entries
      GROUP BY server_id
      ORDER BY syncs DESC
      LIMIT 5
    `)

    const topServers = (topRes[0]?.values ?? []).map((row) => ({
      serverId: row[0] as string,
      name: serverNames[row[0] as string] ?? row[0] as string,
      syncs: row[1] as number
    }))

    return { totalSyncs, totalUploads, totalErrors, totalBytesTransferred, last30Days, topServers }
  }
}
