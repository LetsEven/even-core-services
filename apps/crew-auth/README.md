# @even/crew-auth

Servicio de autenticacion de Crew (roles y PIN por persona), independiente de Clerk. Hono + SQLite (better-sqlite3, WAL) + `jose` (JWT EdDSA) + scrypt de `node:crypto`. Node >= 22.

Contrato: `crew-auth-spec.md` (Crew Auth independiente e intercambiable). Los permisos por rol viven en un unico archivo: `src/auth/roles.ts`.

## Correr en local

```bash
npm install                                   # en la raiz del monorepo
cp apps/crew-auth/.env.example apps/crew-auth/.env   # opcional; exporta las variables en tu shell
npm run dev -w @even/crew-auth                # tsx watch, puerto 8787
npm run test -w @even/crew-auth               # vitest, SQLite en memoria
npx turbo run typecheck lint test build --filter=@even/crew-auth
```

Produccion: `npm run build -w @even/crew-auth && npm run start -w @even/crew-auth` (compila a `dist/`).

## Variables de entorno

| Variable | Default | Descripcion |
| --- | --- | --- |
| `PORT` | `8787` | Puerto HTTP (la imagen Docker usa `8080`). |
| `DATA_DIR` | `./data` | Directorio de datos. SQLite en `DATA_DIR/crew-auth.db`. |
| `CREW_AUTH_ORIGINS` | vacio | Origenes CORS permitidos, separados por coma. Vacio = ningun origen de navegador. |
| `CREW_AUTH_PRIVATE_KEY` | generada | Clave privada Ed25519 en PEM PKCS8. Si falta se genera y se guarda en `DATA_DIR/crew-auth-private-key.pem` con permisos 600. Se aceptan `\n` literales. |
| `CREW_AUTH_ISSUER` | `crew-auth` | Claim `iss` de los tokens. Los verificadores deben usar el mismo valor. |
| `CREW_AUTH_TRUST_PROXY` | `0` | Con `1` la IP del cliente sale de `X-Forwarded-For` (poner en `1` detras de Railway o un proxy; nunca si el servicio es accesible directamente). |
| `CREW_AUTH_SUPER_PIN` | | Solo para `create-super`: PIN sin interaccion. |

Generar una clave: `node -e "const c=require('node:crypto');console.log(c.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))"`.

## Bootstrap del primer super

Sin un dispositivo vinculado nadie puede iniciar sesion, y para vincular hace falta un super. `create-super` rompe el circulo: crea el super y, con `--pairing-code`, imprime un primer codigo de vinculacion (un uso, 10 min).

```bash
npm run create-super -w @even/crew-auth -- --branch <branchId> --name "Dueno" --pairing-code
# PIN: se pide sin eco, o por stdin / CREW_AUTH_SUPER_PIN
echo 123456 | npm run create-super -w @even/crew-auth -- --branch suc-1 --name Dueno --pairing-code
```

`--restaurant <id>` fija el restaurante (por defecto, el id de la sucursal). Los PINs y tokens nunca se imprimen ni se registran. En la imagen Docker: `node dist/cli/createSuper.js ...` (no incluye `tsx`).

El mismo comando con otro `--name` crea un super adicional (util para recuperar el acceso si se pierden todos los dispositivos).

## Endpoints (v1)

Auth: `Authorization: Bearer <accessToken>` (JWT) y/o `X-Device-Token: <deviceToken>`.

| Metodo y ruta | Auth | Descripcion |
| --- | --- | --- |
| `GET /health` | - | `{status:"ok"}` |
| `GET /.well-known/jwks.json` | - | Clave publica EdDSA para verificar los JWT. |
| `POST /v1/devices/pairing-codes` | super | `{branchId?, deviceName?}` -> `{pairingCode, branchId, expiresAt}`. 10 min, un uso. |
| `POST /v1/devices/pair` | - (rate limit por IP) | `{pairingCode, deviceName?}` -> `{deviceToken, branchId}`. |
| `GET /v1/users?branchId=` | dispositivo | Selector: `{users:[{id,name,role}]}`. Nunca hashes. Solo la sucursal del dispositivo. |
| `POST /v1/login` | dispositivo | `{userId, pin}` -> `{accessToken, refreshToken, expiresIn, user}`. Lockout a los 5 fallos (15 min), rate limit por IP y dispositivo (429). Error generico `invalid_credentials`. |
| `POST /v1/refresh` | - | `{refreshToken}` -> tokens nuevos. Rotativo (12 h); reusar uno viejo cierra las sesiones del dispositivo. |
| `POST /v1/logout` | - | `{refreshToken}` -> `{ok:true}`. Revoca la sesion (y su access token). |
| `POST /v1/users` | super | `{name, role, pin, branchId?, cocinaOperar?, id?}` |
| `PATCH /v1/users/:id` | super | `{name?, role?, active?, cocinaOperar?, branchId?}` |
| `POST /v1/users/:id/reset-pin` | super | `{pin}` (desbloquea y cierra sesiones) |
| `DELETE /v1/users/:id` | super | Baja logica. |
| `GET /v1/admin/users` | super | Listado completo (activos e inactivos) sin hashes. Extension al contrato. |
| `GET /v1/audit?limit=&before=&action=` | super | Eventos recientes primero. |

JWT de acceso (EdDSA, 15 min): `iss`, `aud=even-crew`, `sub`, `role`, `permissions[]`, `branchId`, `restaurantId`, `deviceId`, y `sid` (id de sesion). El servicio valida ademas que la sesion siga vigente en cada llamada admin; otros verificadores (p. ej. el backend con JWKS) solo ven la firma y la expiracion, por lo que un logout corta el access token en este servicio pero no en otros hasta que vence (max. 15 min).

PIN: 4 a 8 digitos, scrypt con sal unica, comparacion en tiempo constante. Errores de validacion: `400 {error:"invalid_request"}`.

## Despliegue en Railway (con volumen)

1. Servicio nuevo desde este repo con `apps/crew-auth/railway.json` (Dockerfile, contexto raiz del monorepo).
2. Volumen montado en `/data` (SQLite y, si no se define la clave, la clave privada viven ahi).
3. Variables: `CREW_AUTH_ORIGINS`, `CREW_AUTH_TRUST_PROXY=1`, y preferiblemente `CREW_AUTH_PRIVATE_KEY` (asi la clave no depende del volumen). Railway inyecta `PORT`.
4. Un solo replica: SQLite y el rate limit en memoria no son compartidos.
5. Los volumenes de Railway se montan como root; si el proceso (usuario `node`) no puede escribir en `/data`, definir `RAILWAY_RUN_UID=0` en el servicio.
6. Bootstrap: `railway ssh` (o shell del servicio) y `node dist/cli/createSuper.js --branch <id> --name <n> --pairing-code`.

## Correr en la Pi

```bash
git clone <repo> && cd even-core-services && npm ci   # Node 22; better-sqlite3 compila si no hay binario (apt install build-essential python3)
npm run build -w @even/crew-auth
export DATA_DIR=/var/lib/crew-auth CREW_AUTH_ORIGINS=http://<host-crew>
npm run create-super -w @even/crew-auth -- --branch <id> --name Dueno --pairing-code
npm run start -w @even/crew-auth
```

O con Docker: `docker build -f apps/crew-auth/Dockerfile -t crew-auth . && docker run -d -p 8080:8080 -v crew-auth-data:/data -e CREW_AUTH_ORIGINS=... crew-auth`. Para correrlo como servicio, un unit de systemd con `WorkingDirectory=apps/crew-auth` y `ExecStart=node dist/server.js`.

## Respaldo

Copiar `DATA_DIR` (usar `sqlite3 crew-auth.db ".backup out.db"` con el servicio en marcha por el modo WAL).
