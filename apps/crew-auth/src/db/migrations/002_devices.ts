import type { Migration } from './index.js'

const DAY_MS = 86_400_000

// Revocacion y expiracion de dispositivos. Los existentes reciben 90 dias desde la migracion
// y el restaurante de los usuarios de su sucursal (NULL si la sucursal no tiene usuarios).
export const migration002: Migration = {
  version: 2,
  name: 'devices_revocation',
  sql: `
  ALTER TABLE devices ADD COLUMN restaurant_id TEXT;
  ALTER TABLE devices ADD COLUMN expires_at INTEGER;
  ALTER TABLE devices ADD COLUMN revoked_at INTEGER;
  UPDATE devices SET
    restaurant_id = (SELECT u.restaurant_id FROM users u WHERE u.branch_id = devices.branch_id AND u.deleted_at IS NULL LIMIT 1),
    expires_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 90 * ${DAY_MS};
  CREATE INDEX idx_devices_restaurant ON devices (restaurant_id);

  ALTER TABLE pairing_codes ADD COLUMN restaurant_id TEXT;
  UPDATE pairing_codes SET restaurant_id = (SELECT u.restaurant_id FROM users u WHERE u.id = pairing_codes.created_by);
  CREATE INDEX idx_sessions_device ON sessions (device_id);
  `,
}
