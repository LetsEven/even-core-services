import type { Migration } from './index.js'

// El audit pasa a filtrarse por restaurante: antes los eventos sin actor (fallos de login de usuarios
// desconocidos, etc.) se veian desde cualquier restaurante. Relleno: restaurante del actor y, si no hay
// actor, el del dispositivo (meta.deviceId). Lo que no se puede atribuir queda NULL y no lo ve ningun super.
export const migration005: Migration = {
  version: 5,
  name: 'audit_restaurant',
  sql: `
  ALTER TABLE audit_log ADD COLUMN restaurant_id TEXT;
  UPDATE audit_log SET restaurant_id = (SELECT u.restaurant_id FROM users u WHERE u.id = audit_log.actor_id)
    WHERE actor_id IS NOT NULL;
  UPDATE audit_log SET restaurant_id = (SELECT d.restaurant_id FROM devices d WHERE d.id = json_extract(audit_log.meta_json, '$.deviceId'))
    WHERE restaurant_id IS NULL AND meta_json IS NOT NULL AND json_valid(meta_json);
  CREATE INDEX idx_audit_restaurant_at ON audit_log (restaurant_id, at);
  `,
}
