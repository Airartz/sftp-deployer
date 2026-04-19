import type { Database, SqlJsStatic } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { CREATE_TABLES, SCHEMA_VERSION } from './schema'

let db: Database | null = null
const DB_PATH = (): string => path.join(app.getPath('userData'), 'data.db')

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

export async function initDb(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic> = require('sql.js')

  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')

  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  const dbPath = DB_PATH()
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath)
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  // exec() supports multiple statements; run() only handles one
  db.run('PRAGMA foreign_keys = ON;')
  db.exec(CREATE_TABLES)

  const versionRes = db.exec('SELECT version FROM schema_version LIMIT 1')
  if (versionRes.length === 0 || versionRes[0].values.length === 0) {
    db.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION])
  } else {
    const v = versionRes[0].values[0][0] as number
    if (v < 3) {
      try { db.run('ALTER TABLE servers ADD COLUMN backup INTEGER NOT NULL DEFAULT 0') } catch { /* already exists */ }
    }
    if (v < 4) {
      // Migration v3 → v4: add cloud_connections table
      try {
        db.run(`CREATE TABLE IF NOT EXISTS cloud_connections (
          id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
          webdav_url TEXT, webdav_username TEXT, encrypted_webdav_password TEXT,
          client_id TEXT, encrypted_client_secret TEXT,
          encrypted_access_token TEXT, encrypted_refresh_token TEXT,
          token_expires_at INTEGER, created_at TEXT NOT NULL
        )`)
      } catch { /* already exists */ }
    }
    if (v < 5) {
      try { db.run('ALTER TABLE servers ADD COLUMN post_deploy_command TEXT') } catch { /* already exists */ }
    }
    if (v < SCHEMA_VERSION) {
      db.run('UPDATE schema_version SET version = ?', [SCHEMA_VERSION])
    }
  }

  persistDb()
}

export function persistDb(): void {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(DB_PATH(), Buffer.from(data))
}

export function closeDb(): void {
  if (db) {
    persistDb()
    db.close()
    db = null
  }
}
