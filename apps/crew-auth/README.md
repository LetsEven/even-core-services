# @even/crew-auth

Servicio de autenticacion de Crew (roles y PIN por persona), independiente de Clerk. Hono + SQLite (better-sqlite3, WAL) + `jose` (JWT EdDSA) + scrypt de `node:crypto`. Node >= 22.

Contrato: `crew-auth-spec.md` (Crew Auth independiente e intercambiable). Los permisos por rol viven en un unico archivo: `src/auth/roles.ts`.

## Correr en local

```bash
npm install                                   # en la raiz del monorepo
cp apps/crew-auth/.env.example apps/crew-auth/.env   # opcional; exporta las variables en tu shell
npm run dev -w @even/crew-auth                # tsx watch, puerto 8787
npm run test -w @even/crew-auth               # vitest, SQLite en memoria (incluye test/: integracion con el cliente real de apps/crew)
npx turbo run typecheck lint test build --filter=@even/crew-auth
```

Produccion: `npm run build -w @even/crew-auth && npm run start -w @even/crew-auth` (compila a `dist/`).

## Variables de entorno

| Variable | Default | Descripcion |
| --- | --- | --- |
| `PORT` | `8787` | Puerto HTTP (la imagen Docker usa `8080`). |
| `DATA_DIR` | `./data` | Directorio de datos. SQLite en `DATA_DIR/crew-auth.db`. |
| `CREW_AUTH_ORIGINS` | vacio | Origenes CORS permitidos, separados por coma. Vacio = ningun origen de navegador. |
| `NODE_ENV` | | Con `production` (la imagen Docker ya lo fija) la clave privada es **obligatoria** y no se autogenera. |
| `CREW_AUTH_PRIVATE_KEY` | generada (solo fuera de produccion) | Clave privada Ed25519 en PEM PKCS8. **Obligatoria con `NODE_ENV=production`**: el servicio no arranca sin ella. Fuera de produccion, si falta se genera y se guarda en `DATA_DIR/crew-auth-private-key.pem` con permisos 600. Se aceptan `\n` literales. |
| `CREW_AUTH_ISSUER` | `crew-auth` | Claim `iss` de los tokens. Los verificadores deben usar el mismo valor. |
| `CREW_AUTH_TRUST_PROXY` | `0` | Con `1` hay un proxy de confianza delante (Railway): la IP del cliente es la entrada **mas a la derecha** de `X-Forwarded-For` (la que agrego el proxy; lo de la izquierda lo controla el cliente). Nunca activarlo si el servicio es accesible directamente. |
| `CREW_AUTH_TRUST_PROXY_HOPS` | | N proxies de confianza en cadena: la IP es la N-esima desde la derecha. Manda sobre `CREW_AUTH_TRUST_PROXY` (`0` lo desactiva). Si la cabecera trae menos de N entradas o no es una IP valida, se usa la del socket. |
| `CREW_AUTH_SUPER_PIN` | | Solo para `create-super`: PIN sin interaccion. |

Generar una clave: `node -e "const c=require('node:crypto');console.log(c.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))"`.

## Bootstrap del primer super

Sin un dispositivo vinculado nadie puede iniciar sesion, y para vincular hace falta un super. `create-super` rompe el circulo: crea el super y, con `--pairing-code`, imprime un primer codigo de vinculacion (un uso, 10 min).

```bash
npm run create-super -w @even/crew-auth -- --restaurant <restaurantId> --branch <branchId> --name "Dueno" --pairing-code
# PIN: se pide sin eco, o por stdin / CREW_AUTH_SUPER_PIN
echo 123456 | npm run create-super -w @even/crew-auth -- --restaurant rest-1 --branch suc-1 --name Dueno --pairing-code
```

`--restaurant <id>` es **obligatorio** (no hay default a la sucursal: un super administra todo ese restaurante, asi que el id debe ser deliberado). El PIN del super: 6 a 8 digitos. Los PINs y tokens nunca se imprimen ni se registran. En la imagen Docker: `node dist/cli/createSuper.js ...` (no incluye `tsx`).

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
| `POST /v1/login` | dispositivo | `{userId, pin}` -> `{accessToken, refreshToken, expiresIn, user}`. Lockout (ver abajo), rate limit por IP y dispositivo (429). Error generico `invalid_credentials`. Un login exitoso renueva la vigencia del token de dispositivo. |
| `POST /v1/refresh` | dispositivo | `{refreshToken}` -> tokens nuevos. Rotativo (ventana deslizante de 12 h, tope absoluto de 7 dias desde el login). Exige `X-Device-Token` y que sea el dispositivo de la sesion. Reusar uno ya rotado cierra las sesiones del usuario en el dispositivo, salvo dentro de la ventana de gracia (ver abajo). |
| `POST /v1/logout` | dispositivo | `{refreshToken}` -> `{ok:true}`. Revoca la sesion (y todos sus access tokens). Mismas exigencias de dispositivo. |
| `POST /v1/users` | super | `{name, role, pin, branchId?, cocinaOperar?, id?}` |
| `PATCH /v1/users/:id` | super | `{name?, role?, active?, cocinaOperar?, branchId?}` |
| `POST /v1/users/:id/reset-pin` | super | `{pin}` (desbloquea y cierra sesiones) |
| `POST /v1/users/:id/unlock` | super | Quita el bloqueo (global y de todos los dispositivos) sin cambiar el PIN. |
| `GET /v1/devices` | super | Dispositivos vigentes del restaurante: `{devices:[{id,name,branchId,lastSeenAt,expiresAt,createdAt,current}]}`. Nunca el token. |
| `DELETE /v1/devices/:id` | super | Revoca el dispositivo (solo de su restaurante) y todas sus sesiones. |
| `DELETE /v1/users/:id` | super | Baja logica. |
| `GET /v1/admin/users` | super | Listado completo (activos e inactivos) sin hashes. Extension al contrato. |
| `GET /v1/audit?limit=&before=&action=` | super | Eventos recientes primero, solo del propio restaurante (`audit_log.restaurant_id`). Los eventos no atribuibles a un restaurante (p. ej. fallos de emparejamiento anonimos) no los ve ningun super. |

JWT de acceso (EdDSA, 15 min): `iss`, `aud=even-crew`, `sub`, `role`, `permissions[]`, `branchId`, `restaurantId`, `deviceId`, y `sid` (id de sesion). El servicio valida ademas que la sesion siga vigente en cada llamada admin; otros verificadores (p. ej. el backend con JWKS) solo ven la firma y la expiracion, por lo que un logout corta el access token en este servicio pero no en otros hasta que vence (max. 15 min).

El lockout por PIN responde 401 `invalid_credentials`, no 423.

### Refresh: sid estable y ventana de gracia

- **`sid` estable.** Rotar el refresh token cambia el token de la *misma* sesion (la fila guarda el hash del anterior); el `sid` del access token no cambia. Decision: antes cada rotacion revocaba el `sid` anterior y las demas pestanas recibian 401 hasta adoptar el token difundido; ahora el access token en poder de otra pestana sigue valiendo hasta vencer (15 min) y solo se corta por logout, reuso detectado, reset/baja del usuario o revocacion del dispositivo (todo por `sid`). El difundir el token entre pestanas (cliente de Crew) queda como optimizacion, ya no como requisito de correccion. De paso la tabla `sessions` ya no crece una fila por rotacion.
- **Tope absoluto.** `absolute_expires_at` = login + 7 dias; la ventana deslizante de 12 h nunca lo sobrepasa. Pasado el tope (aunque el access token no haya vencido) la sesion deja de valer y hay que pedir PIN.
- **Ventana de gracia (10 s).** Si el refresh recien rotado se vuelve a presentar dentro de los 10 s siguientes a la rotacion (respuesta perdida, dos pestanas) desde el mismo dispositivo y la sesion sigue viva, se devuelve **la misma respuesta** (mismos tokens). La respuesta se guarda solo en memoria (nunca tokens en claro en la base): si el proceso se reinicia dentro de esos 10 s, el reintento se trata como reuso. Pasada la ventana, reusar un refresh rotado sigue siendo robo: 401, se revocan las sesiones del usuario en ese dispositivo y queda `refresh.reuse` en el audit. Un refresh token presentado desde otro dispositivo se rechaza (401, `refresh.device_mismatch`) sin tocar la sesion legitima.

Pruebas: `test/local.integration.test.ts` arranca esta app en un puerto efimero y la usa con `apps/crew/src/lib/auth/localClient.ts` y `localSession.ts`; `test/tsconfig.json` las tipa con resolucion `bundler` (el cliente usa imports sin extension).

PIN: 4 a 8 digitos (6 a 8 para el rol `super`), scrypt con sal unica, comparacion en tiempo constante. Errores de validacion: `400 {error:"invalid_request"}`. Al promover un usuario a super (`PATCH` con `role: "super"`) hay que enviar tambien un `pin` de 6+ digitos (no se conoce la longitud del actual).

### Dispositivos

El token de dispositivo vence a los 90 dias y se renueva con cada login exitoso en ese dispositivo (los que no se usan se caen solos). Un super puede revocar cualquier dispositivo de su restaurante: el token deja de valer y todas sus sesiones se cierran al instante (el access token tambien, por `sid`). Si un equipo se pierde o lo roban: Ajustes > Equipos vinculados > Revocar.

### Rate limit

Ventana fija de 60 s en memoria (una sola instancia). En login se evalua primero la regla por IP (60/min) y si excede se responde 429 sin mas; la de dispositivo (20/min) corre despues de autenticar el dispositivo, con su id real (un token inventado no crea buckets). Los buckets viven en un mapa LRU de maximo 10 000 claves, sin barrido por peticion. Los fallos de `POST /v1/devices/pair` se agregan en el audit por (IP, hora) con un contador (`meta.count`) y, con mas de 100 IPs distintas en la hora, en una fila comun (`ip: "*"`).

### Lockout

La reserva del intento es atomica y ocurre **antes** de verificar el PIN (con peticiones en paralelo no se prueban mas PIN de los permitidos): si el ciclo esta agotado o hay un bloqueo vigente se responde 401 generico sin verificar. Dos contadores:

- por (usuario, dispositivo): 5 fallos por ciclo. Un dispositivo no bloquea al usuario en los demas.
- por usuario (todos los dispositivos): 15 fallos por ciclo, contra el ataque repartido.

Al agotar el ciclo se bloquea con backoff exponencial: 15 min, 30 min, 1 h, ... hasta 24 h. Los contadores **no se reinician al bloquear**: solo con un login exitoso (el del usuario y el de ese dispositivo), un reset de PIN o `unlock`. Cada bloqueo queda en el audit (`user.locked`, con `scope: device|user`, `until`, `lockCount`); los intentos contra un bloqueo vigente, como `login.blocked` (a lo mas uno por minuto y usuario). Limitacion conocida: un dispositivo hostil ya vinculado puede, tras tres ciclos (~45 min), agotar el umbral global del usuario; el super lo desbloquea (`unlock`).

## Despliegue en Railway (con volumen)

1. Servicio nuevo desde este repo con `apps/crew-auth/railway.json` (Dockerfile, contexto raiz del monorepo).
2. Volumen montado en `/data` (SQLite y, si no se define la clave, la clave privada viven ahi).
3. Variables: `CREW_AUTH_ORIGINS`, `CREW_AUTH_TRUST_PROXY=1` y **`CREW_AUTH_PRIVATE_KEY`** (obligatoria: la imagen fija `NODE_ENV=production`, y sin la clave el servicio no arranca). Railway inyecta `PORT`.
   - *Despliegue existente que usaba la clave autogenerada*: antes de subir esta version, copiar la clave actual a la variable para que los tokens vigentes sigan verificandose: `railway ssh` y `cat /data/crew-auth-private-key.pem`, pegar el contenido (con saltos de linea o `\n`) en `CREW_AUTH_PRIVATE_KEY`. Despues se puede borrar el archivo del volumen.
4. Un solo replica: SQLite y el rate limit en memoria no son compartidos.
5. Volumen y usuario: ver "Archivos, permisos y root".
6. Bootstrap: `railway ssh` (o shell del servicio) y `node dist/cli/createSuper.js --restaurant <id> --branch <id> --name <n> --pairing-code`.

## Correr en la Pi

```bash
git clone <repo> && cd even-core-services && npm ci   # Node 22; better-sqlite3 compila si no hay binario (apt install build-essential python3)
npm run build -w @even/crew-auth
export DATA_DIR=/var/lib/crew-auth CREW_AUTH_ORIGINS=http://<host-crew>
npm run create-super -w @even/crew-auth -- --restaurant <id> --branch <id> --name Dueno --pairing-code
npm run start -w @even/crew-auth
```

O con Docker: `docker build -f apps/crew-auth/Dockerfile -t crew-auth . && docker run -d -p 8080:8080 -v crew-auth-data:/data -e CREW_AUTH_ORIGINS=... crew-auth`. Para correrlo como servicio, un unit de systemd con `WorkingDirectory=apps/crew-auth` y `ExecStart=node dist/server.js`.

## Archivos, permisos y root

- Al arrancar (servicio y CLI) se fija `umask 077`, `DATA_DIR` queda en `0700` y la base (`crew-auth.db`, `-wal`, `-shm`) en `0600`; la clave autogenerada (solo fuera de produccion) en `0600`. Si no se puede (el directorio es de otro usuario, sistema de archivos sin permisos POSIX) el proceso **no arranca** y el error nombra `DATA_DIR`.
- **No correr como root.** No hace falta, y con root un fallo del servicio tendria alcance de root sobre el volumen; si detecta uid 0 avisa en el log. La imagen Docker ya usa el usuario `node`.
- **Volumen de Railway:** se monta como root, asi que el usuario `node` no puede escribir ni hacer `chmod` en `/data` y el servicio no arranca (error de `DATA_DIR`). Opciones: (1) lo recomendable: que el contenedor arranque como root solo para `chown -R node:node /data` y baje privilegios a `node` antes de ejecutar el servicio (entrypoint con `su-exec`); no esta incluido en esta imagen. (2) Si no, `RAILWAY_RUN_UID=0` ejecuta todo como root: funciona, los archivos quedan 0700/0600 de root y el servicio avisa; es el riesgo aceptado hasta tener (1). No dejar el volumen con permisos abiertos para "arreglarlo".
- La clave privada y el pepper de PIN van por variables de entorno (secretos del proveedor), no en el volumen ni en el repo.

## Respaldo

Copiar `DATA_DIR` (usar `sqlite3 crew-auth.db ".backup out.db"` con el servicio en marcha por el modo WAL).
