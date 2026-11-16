import type { Migration } from './index.js'

const DAY_MS = 86_400_000

// Sesiones con `sid` estable entre rotaciones: la fila se reutiliza y guarda el hash del refresh
// anterior (para detectar reuso y para la ventana de gracia) y un tope absoluto de vida.
export const migration004: Migration = {
  version: 4,
  name: 'sessions_rotation',
  sql: `
  ALTER TABLE sessions ADD COLUMN absolute_expires_at INTEGER;
  ALTER TABLE sessions ADD COLUMN prev_refresh_hash TEXT;
  ALTER TABLE sessions ADD COLUMN rotated_at INTEGER;
  UPDATE sessions SET absolute_expires_at = created_at + 7 * ${DAY_MS};
  CREATE INDEX idx_sessions_prev_refresh ON sessions (prev_refresh_hash);
  `,
}
