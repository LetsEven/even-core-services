import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { DEFAULTS, loadConfig } from './config.js'
import { PAIR_FAIL_MAX_ROWS } from './db/audit.js'
import { clientIp } from './http.js'
import { MAX_BUCKETS, RateLimiter } from './middleware/rateLimit.js'
import { makeHarness } from './test/helpers.js'

const ipOf = async (hops: number, xff?: string) => {
  const app = new Hono().get('/ip', (c) => c.text(clientIp(c, hops)))
  const res = await app.request('/ip', { headers: xff === undefined ? {} : { 'x-forwarded-for': xff } })
  return res.text()
}

describe('IP del cliente', () => {
  it('sin proxy de confianza ignora X-Forwarded-For', async () => {
    expect(await ipOf(0, '6.6.6.6')).toBe('unknown')
  })

  it('con 1 salto toma la entrada de la derecha; lo que el cliente antepone no cuenta', async () => {
    expect(await ipOf(1, '6.6.6.6, 1.1.1.1, 2.2.2.2')).toBe('2.2.2.2')
    expect(await ipOf(1, '2.2.2.2')).toBe('2.2.2.2')
    expect(await ipOf(1, '6.6.6.6,   2.2.2.2  ')).toBe('2.2.2.2')
  })

  it('con N saltos toma la N-esima desde la derecha', async () => {
    expect(await ipOf(2, '6.6.6.6, 1.1.1.1, 2.2.2.2')).toBe('1.1.1.1')
    expect(await ipOf(3, '6.6.6.6, 1.1.1.1, 2.2.2.2')).toBe('6.6.6.6')
  })

  it('si faltan entradas o no es una IP valida cae a la del socket, no a un valor del cliente', async () => {
    expect(await ipOf(2, '1.1.1.1')).toBe('unknown')
    expect(await ipOf(1, undefined)).toBe('unknown')
    expect(await ipOf(1, '1.1.1.1, <script>')).toBe('unknown')
    expect(await ipOf(1, '1.1.1.1, 999.1.1.1')).toBe('unknown')
  })

  it('normaliza puertos e IPv6', async () => {
    expect(await ipOf(1, '1.1.1.1, 2.2.2.2:4433')).toBe('2.2.2.2')
    expect(await ipOf(1, '[2001:DB8::1]:443')).toBe('2001:db8::1')
    expect(await ipOf(1, '2001:db8::2')).toBe('2001:db8::2')
  })

  it('CREW_AUTH_TRUST_PROXY=1 equivale a 1 salto; CREW_AUTH_TRUST_PROXY_HOPS manda', () => {
    expect(loadConfig({}).trustProxyHops).toBe(0)
    expect(loadConfig({ CREW_AUTH_TRUST_PROXY: '1' }).trustProxyHops).toBe(1)
    expect(loadConfig({ CREW_AUTH_TRUST_PROXY: '1', CREW_AUTH_TRUST_PROXY_HOPS: '2' }).trustProxyHops).toBe(2)
    expect(loadConfig({ CREW_AUTH_TRUST_PROXY_HOPS: '0', CREW_AUTH_TRUST_PROXY: '1' }).trustProxyHops).toBe(0)
    expect(() => loadConfig({ CREW_AUTH_TRUST_PROXY_HOPS: 'x' })).toThrow(/HOPS/)
    expect(() => loadConfig({ CREW_AUTH_TRUST_PROXY_HOPS: '-1' })).toThrow(/HOPS/)
  })
})

describe('RateLimiter', () => {
  const clock = { t: 0 }
  const make = (maxBuckets?: number) => new RateLimiter({ windowMs: 1000, now: () => clock.t, maxBuckets })

  it('cuenta por ventana y devuelve el tiempo que falta', () => {
    clock.t = 0
    const l = make()
    expect(l.hit('a', 2)).toBe(0)
    expect(l.hit('a', 2)).toBe(0)
    clock.t = 400
    expect(l.hit('a', 2)).toBe(600)
    clock.t = 1000
    expect(l.hit('a', 2)).toBe(0)
  })

  it('desaloja la clave menos usada al llegar al tope', () => {
    clock.t = 0
    const l = make(3)
    l.hit('a', 1)
    l.hit('b', 1)
    l.hit('c', 1)
    l.hit('a', 1) // a pasa a ser la mas reciente (y ya excede)
    l.hit('d', 1) // desaloja b
    expect(l.size).toBe(3)
    expect(l.hit('a', 1)).toBeGreaterThan(0) // a sigue contando
    expect(l.hit('b', 1)).toBe(0) // b se desalojo: empieza de cero
  })

  it('nunca pasa del tope y no barre el mapa por peticion', () => {
    clock.t = 0
    const l = make()
    const start = performance.now()
    for (let i = 0; i < 60_000; i++) l.hit(`ip:${i}`, 5)
    expect(l.size).toBe(MAX_BUCKETS)
    expect(performance.now() - start).toBeLessThan(2000)
  })
})

describe('rate limit en el login', () => {
  it('evalua primero la IP y corta ahi; la de dispositivo cuenta solo lo que paso la IP', async () => {
    const h = await makeHarness({
      trustProxyHops: 1,
      rateLimit: { ...DEFAULTS.rateLimit, loginPerIp: 2, loginPerDevice: 3 },
    })
    const device = await h.pair()
    const login = (ip: string) =>
      h.req('POST', '/v1/login', { device, body: { userId: h.superId, pin: '000000' }, headers: { 'x-forwarded-for': ip } })

    expect((await login('7.7.7.7')).status).toBe(401) // dispositivo: 1
    expect((await login('7.7.7.7')).status).toBe(401) // dispositivo: 2
    expect((await login('7.7.7.7')).status).toBe(429) // corta en la IP: el dispositivo no cuenta
    expect((await login('7.7.7.7')).status).toBe(429)
    expect((await login('8.8.8.8')).status).toBe(401) // dispositivo: 3
    expect((await login('9.9.9.9')).status).toBe(429) // ahora si, por dispositivo
  })

  it('anteponer IPs falsas a X-Forwarded-For no evade el limite por IP', async () => {
    const h = await makeHarness({ trustProxyHops: 1, rateLimit: { ...DEFAULTS.rateLimit, loginPerIp: 3 } })
    const device = await h.pair()
    const codes: number[] = []
    for (let i = 0; i < 5; i++) {
      const res = await h.req('POST', '/v1/login', {
        device,
        body: { userId: h.superId, pin: '000000' },
        headers: { 'x-forwarded-for': `10.0.0.${i}, 5.5.5.5` },
      })
      codes.push(res.status)
    }
    expect(codes).toEqual([401, 401, 401, 429, 429])
  })

  it('sin proxy de confianza, X-Forwarded-For no cambia la clave', async () => {
    const h = await makeHarness({ trustProxyHops: 0, rateLimit: { ...DEFAULTS.rateLimit, loginPerIp: 2 } })
    const device = await h.pair()
    const codes: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = await h.req('POST', '/v1/login', {
        device,
        body: { userId: h.superId, pin: '000000' },
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
      })
      codes.push(res.status)
    }
    expect(codes).toEqual([401, 401, 429])
  })

  it('tokens de dispositivo inventados no crean buckets por dispositivo', async () => {
    const h = await makeHarness({ rateLimit: { ...DEFAULTS.rateLimit, loginPerDevice: 1, loginPerIp: 1000 } })
    for (let i = 0; i < 20; i++) {
      const res = await h.req('POST', '/v1/login', { device: `falso-${i}`, body: { userId: h.superId, pin: '000000' } })
      expect(res.status).toBe(401)
    }
  })
})

describe('audit de pair_fail', () => {
  const fail = (h: Awaited<ReturnType<typeof makeHarness>>, ip: string) =>
    h.req('POST', '/v1/devices/pair', { body: { pairingCode: 'ZZZZZZZZ' }, headers: { 'x-forwarded-for': ip } })
  const rows = (h: Awaited<ReturnType<typeof makeHarness>>) =>
    h.db.prepare("SELECT ip, meta_json FROM audit_log WHERE action = 'device.pair_fail' ORDER BY rowid").all() as {
      ip: string
      meta_json: string
    }[]

  it('agrega los fallos de una misma IP en una fila con contador', async () => {
    const h = await makeHarness({ trustProxyHops: 1 })
    for (let i = 0; i < 30; i++) expect((await fail(h, '4.4.4.4')).status).toBe(401)
    const r = rows(h)
    expect(r).toHaveLength(1)
    expect(JSON.parse(r[0]!.meta_json)).toMatchObject({ count: 30 })
    // Pasada la ventana (1 h) arranca otra fila.
    h.clock.t += 61 * 60_000
    await fail(h, '4.4.4.4')
    expect(rows(h)).toHaveLength(2)
  })

  it('acota las filas cuando llegan de muchas IPs distintas y no pierde la cuenta', async () => {
    const h = await makeHarness({ trustProxyHops: 1 })
    const total = PAIR_FAIL_MAX_ROWS + 40
    for (let i = 0; i < total; i++) await fail(h, `10.1.${Math.floor(i / 200)}.${i % 200}`)
    const r = rows(h)
    expect(r.length).toBeLessThanOrEqual(PAIR_FAIL_MAX_ROWS + 1)
    const sum = r.reduce((n, x) => n + (JSON.parse(x.meta_json) as { count: number }).count, 0)
    expect(sum).toBe(total)
    expect(r.at(-1)?.ip).toBe('*')
  })
})
