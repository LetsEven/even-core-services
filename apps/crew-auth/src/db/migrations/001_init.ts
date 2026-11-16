import type { Migration } from './index.js'

// Todas las tablas llevan id (UUID), created_at, updated_at, deleted_at y sync_state.
// Tiempos en milisegundos epoch (INTEGER).
const COMMON = `
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    sync_state TEXT NOT NULL DEFAULT 'local' CHECK (sync_state IN ('local', 'pending', 'synced'))`

export const migration001: Migration = {
  version: 1,
  name: 'init',
  sql: `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super', 'cajero', 'mesero', 'cocina')),
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    cocina_operar INTEGER NOT NULL DEFAULT 0 CHECK (cocina_operar IN (0, 1)),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,${COMMON}
  );
  CREATE INDEX idx_users_branch ON users (branch_id);
  CREATE INDEX idx_users_restaurant ON users (restaurant_id);

  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    last_seen_at INTEGER,${COMMON}
  );

  CREATE TABLE pairing_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users (id),
    expires_at INTEGER NOT NULL,
    used_at INTEGER,${COMMON}
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id),
    device_id TEXT NOT NULL REFERENCES devices (id),
    refresh_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,${COMMON}
  );
  CREATE INDEX idx_sessions_user ON sessions (user_id);

  CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    target TEXT,
    ip TEXT,
    meta_json TEXT,${COMMON}
  );
  CREATE INDEX idx_audit_at ON audit_log (at);
  `,
}
