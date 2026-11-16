import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { superPinSchema } from '../auth/pin.js'
import { loadConfig } from '../config.js'
import { writeAudit } from '../db/audit.js'
import { openDb } from '../db/index.js'
import { insertPairingCode } from '../db/pairing.js'
import type { Db } from '../db/index.js'
import { insertUser } from '../db/users.js'

export async function createSuperUser(
  db: Db,
  input: { branchId: string; restaurantId?: string; name: string; pin: string },
  now = Date.now(),
): Promise<{ id: string; branchId: string }> {
  const pin = superPinSchema.safeParse(input.pin)
  if (!pin.success) throw new Error('El PIN de un super debe tener de 6 a 8 digitos')
  const user = await insertUser(db, now, {
    branchId: input.branchId,
    restaurantId: input.restaurantId ?? input.branchId,
    name: input.name,
    role: 'super',
    pin: input.pin,
  })
  writeAudit(db, now, { actorId: null, action: 'user.create_super', target: user.id, meta: { branchId: input.branchId } })
  return { id: user.id, branchId: user.branch_id }
}

async function readPin(): Promise<string> {
  const fromEnv = process.env.CREW_AUTH_SUPER_PIN
  if (fromEnv) return fromEnv
  const stdin = process.stdin
  if (stdin.isTTY) {
    process.stderr.write('PIN (6-8 digitos, no se muestra): ')
    return new Promise((resolve) => {
      let buf = ''
      stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding('utf8')
      const onData = (ch: string) => {
        for (const c of ch) {
          if (c === '\r' || c === '\n' || c === '\u0004') {
            stdin.setRawMode(false)
            stdin.pause()
            stdin.off('data', onData)
            process.stderr.write('\n')
            resolve(buf)
            return
          }
          if (c === '\u0003') process.exit(130)
          if (c === '\u007f') buf = buf.slice(0, -1)
          else buf += c
        }
      }
      stdin.on('data', onData)
    })
  }
  let data = ''
  for await (const chunk of stdin) data += String(chunk)
  return data.split(/\r?\n/)[0]?.trim() ?? ''
}

async function main() {
  const { values } = parseArgs({
    options: {
      branch: { type: 'string' },
      restaurant: { type: 'string' },
      name: { type: 'string' },
      'pairing-code': { type: 'boolean', default: false },
    },
  })
  if (!values.branch || !values.name) {
    console.error('Uso: npm run create-super -w @even/crew-auth -- --branch <id> --name <nombre> [--restaurant <id>] [--pairing-code]')
    console.error('PIN por stdin o variable CREW_AUTH_SUPER_PIN. Si falta --restaurant se usa el id de la sucursal.')
    process.exit(2)
  }
  const pin = await readPin()
  const config = loadConfig()
  const db = openDb(config.dbPath)
  try {
    const created = await createSuperUser(db, {
      branchId: values.branch,
      restaurantId: values.restaurant,
      name: values.name,
      pin,
    })
    console.log(`Super creado: ${created.id}`)
    if (values['pairing-code']) {
      // Arranque: sin un primer dispositivo vinculado el super no puede iniciar sesion.
      const now = Date.now()
      const pc = insertPairingCode(db, now, config.pairingTtlMs, {
        branchId: created.branchId,
        deviceName: 'Primer dispositivo',
        createdBy: created.id,
      })
      console.log(`Codigo de vinculacion (un uso, ${Math.round(config.pairingTtlMs / 60000)} min): ${pc.code}`)
    }
  } finally {
    db.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : 'Error')
    process.exit(1)
  })
}
