export const SCHEMA_VERSION = 4

// sql.js db.exec() supports multiple statements in one call
export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL CHECK(auth_type IN ('password','key')),
    encrypted_password TEXT,
    encrypted_private_key TEXT,
    encrypted_passphrase TEXT,
    local_path TEXT NOT NULL,
    remote_path TEXT NOT NULL,
    ignore_patterns TEXT NOT NULL DEFAULT '[]',
    auto_watch INTEGER NOT NULL DEFAULT 0,
    delete_orphans INTEGER NOT NULL DEFAULT 0,
    backup INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    local_size INTEGER NOT NULL,
    local_mtime INTEGER NOT NULL,
    local_hash TEXT NOT NULL,
    remote_size INTEGER NOT NULL DEFAULT 0,
    remote_mtime INTEGER NOT NULL DEFAULT 0,
    remote_hash TEXT,
    last_synced_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'synced',
    UNIQUE(server_id, relative_path)
  );

  CREATE TABLE IF NOT EXISTS log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    file_path TEXT,
    bytes_transferred INTEGER,
    timestamp TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sync_states_server ON sync_states(server_id);
  CREATE INDEX IF NOT EXISTS idx_log_entries_server ON log_entries(server_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_log_entries_session ON log_entries(session_id);

  CREATE TABLE IF NOT EXISTS cloud_connections (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    webdav_url TEXT,
    webdav_username TEXT,
    encrypted_webdav_password TEXT,
    client_id TEXT,
    encrypted_client_secret TEXT,
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT,
    token_expires_at INTEGER,
    created_at TEXT NOT NULL
  );
`
