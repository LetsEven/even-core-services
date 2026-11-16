import { describe, expect, it } from 'vitest'
import { runBootstrap } from './bootstrap.js'
import { openDb } from './db/index.js'

const base = {
  restaurantId: '26',
  branchId: 'suc-1',
  users: [
    { name: 'Super', role: 'super', pin: '123456' },
    { name: 'Mesero', role: 'mesero', pin: '1111' },
  ],
  pairingCodeMinutes: 30,
}

describe('bootstrap', () => {
  it('crea usuarios y codigo de vinculacion, y es idempotente', async () => {
    const db = openDb(':memory:')
    const r1 = await runBootstrap(db, JSON.stringify(base), 'p'.repeat(32))
    expect(r1.created).toHaveLength(2)
    expect(r1.pairingCode?.code).toHaveLength(8)
    const r2 = await runBootstrap(db, JSON.stringify(base), 'p'.repeat(32))
    expect(r2.created).toHaveLength(0)
    expect(r2.skipped).toHaveLength(2)
    expect((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(2)
  })

  it('rechaza PIN de super corto y JSON invalido', async () => {
    const db = openDb(':memory:')
    const bad = { ...base, users: [{ name: 'S', role: 'super', pin: '1234' }] }
    await expect(runBootstrap(db, JSON.stringify(bad), 'p'.repeat(32))).rejects.toThrow(/PIN invalido/)
    await expect(runBootstrap(db, '{', 'p'.repeat(32))).rejects.toThrow(/JSON/)
  })
})
