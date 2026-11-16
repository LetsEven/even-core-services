import type { Migration } from './index.js'

// Lockout: contador por usuario (global, no se reinicia al bloquear: solo con login exitoso o unlock)
// y por (usuario, dispositivo). `lock_count` alimenta el backoff exponencial.
export const migration003: Migration = {
  version: 3,
  name: 'lockout',
  sql: `
  ALTER TABLE users ADD COLUMN lock_count INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE user_device_attempts (
    user_id TEXT NOT NULL REFERENCES users (id),
    device_id TEXT NOT NULL REFERENCES devices (id),
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    lock_count INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, device_id)
  );

  CREATE INDEX idx_audit_action_at ON audit_log (action, at);
  `,
}
