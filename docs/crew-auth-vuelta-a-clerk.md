# Crew: `crew-auth` temporal y vuelta a Clerk

> **Estado: temporal.** `apps/crew-auth` y el provider `local` de Crew existen para **sustituir a Clerk por ahora** (pruebas y staging). La intención es **volver a Clerk** y **sacar `crew-auth` del repo** cuando llegue el momento. Este documento es la guía para hacerlo sin tener que reconstruir el contexto.
>
> Mientras tanto Clerk sigue siendo el **default** del código y el **único proveedor de los releases de producción** (ver "Qué sigue siendo Clerk hoy").

## 1. Qué se hizo y por qué

Crew (POS de meseros, Vite + Tauri) autenticaba solo con Clerk. Se necesitaba poder probar el flujo completo sin depender de la cuenta/entorno de Clerk y con login por persona (PIN) en un dispositivo compartido. Se hizo en tres piezas, todas **aditivas** (Clerk no se tocó ni se borró):

| Pieza | Qué es | Dónde |
|---|---|---|
| **Seam de auth** | Interfaz única `useAuth()` + adaptadores intercambiables, elegidos en build con `VITE_AUTH_PROVIDER` (`clerk` default, `local`, `demo`). | `apps/crew/src/lib/auth/` |
| **Provider `local`** | Cliente, sesión y UI de login por PIN contra `crew-auth`. | `apps/crew/src/lib/auth/local*.ts*`, `src/app/login/`, `src/app/ajustes/Local*` |
| **Servicio `crew-auth`** | Hono + SQLite + JWT EdDSA. Emparejamiento de dispositivos, usuarios con PIN (scrypt + pepper), roles, lockout, audit. Publica JWKS. | `apps/crew-auth/` |

Historial (todo en `redesign`, 15–20 nov 2026): refactor del seam `9487f63`, adaptadores `cf20024`, servicio `7c4b622`, y endurecimiento posterior (lockout, dispositivos, pepper, sid estable). `git log -- apps/crew-auth` lo lista completo.

## 2. Qué sigue siendo Clerk hoy

- **Default**: sin `VITE_AUTH_PROVIDER`, el build usa Clerk (`select.ts`). Nada cambia para quien no lo configure.
- **Releases de producción (Tauri)**: `apps/crew/scripts/release.mjs` **exige** `VITE_CLERK_PUBLISHABLE_KEY` `pk_live_…`. Un release no puede salir con `local`. `crew-auth` es solo dev/staging.
- **Socket legado**: `VITE_CREW_SOCKET_SECRET` solo se envía con `clerk` (`crewSocket.ts`), nunca con `local`.

## 3. Cómo se comportan distinto `clerk` y `local`

| Aspecto | `clerk` | `local` (crew-auth) |
|---|---|---|
| Identidad | Cuenta Clerk del restaurante. | Dispositivo emparejado (código 10 min, un uso) + persona con PIN (4–8 dígitos; super 6–8). |
| Rol | `publicMetadata.crewRole`; **sin valor = `super`**; valor inválido = `cocina`. | Claims del JWT (`role`, `permissions`). |
| Token al backend | JWT de Clerk (`getToken()`). | JWT EdDSA de crew-auth, 15 min, refresh rotativo 12 h con tope 7 días. |
| Sucursal | Libre: `crew_branch_id` en localStorage. | **Fija** a la del dispositivo; solo `super` cambia, y dentro de su restaurante (`branchScope.ts`). |
| Socket | `auth.token` (+ secreto legado opcional); sucursal elegida. | `auth.token`; sucursal del dispositivo. |
| Administración de usuarios | En Clerk (fuera de Crew). | En Crew: Ajustes → Usuarios y Equipos vinculados. |
| CSP | Permite el host de Clerk. | Permite `VITE_CREW_AUTH_URL`. |
| Backend | Valida JWT de Clerk. | Debe validar por JWKS de crew-auth (`CREW_AUTH_JWKS_URL`, **configuración del backend**, otro repo). |

No confundir con el **login de mesero de Soft Restaurant** (`WaiterLoginModal`, `useWaiterSession`): es otra cosa (quién atiende en el dispositivo), funciona con ambos providers y **se queda**.

## 4. Dependencias externas a este repo

Para que `local` funcione (y por tanto lo que hay que desmontar al salir):

1. **Backend (`even-backend`)**: acepta los tokens de crew-auth vía JWKS (`CREW_AUTH_JWKS_URL`) y valida `iss`/`aud=even-crew`. El contrato del lado backend está en su `crew-auth-backend.md` (no vive aquí). Al volver a Clerk esta configuración debe quedar fuera o ser inofensiva.
2. **Railway**: un servicio `crew-auth` (Dockerfile `apps/crew-auth/Dockerfile`, **volumen en `/data`**, una sola réplica) con `CREW_AUTH_PRIVATE_KEY`, `CREW_AUTH_PIN_PEPPER`, `CREW_AUTH_ORIGINS`, `CREW_AUTH_TRUST_PROXY=1`, `DATA_DIR=/data`, `RAILWAY_RUN_UID=0` (y opcionalmente `CREW_AUTH_BOOTSTRAP_JSON`, solo dev).
3. **Servicio `crew` en Railway**: `ARG`s `VITE_AUTH_PROVIDER=local` y `VITE_CREW_AUTH_URL`.
4. **Datos**: usuarios, PIN y dispositivos viven **solo** en la SQLite de crew-auth. **No hay migración a Clerk**: al volver, las personas se dan de alta en Clerk (con `crewRole`) y los PIN dejan de existir.

## 5. Plan de regreso a Clerk

Se hace en dos fases independientes. La A es reversible y no toca código; la B es limpieza.

### Fase A — Volver a Clerk (solo configuración)

1. Dar de alta las cuentas en Clerk con `publicMetadata.crewRole` (`super | cajero | mesero | cocina`; `cocina.operar` no existe en Clerk: hoy una cuenta `cocina` de Clerk queda en solo lectura). Cuentas sin `crewRole` entran como `super`: **revisar antes** que nadie quede con más permisos de los debidos.
2. Servicio `crew` en Railway: quitar `VITE_AUTH_PROVIDER` (o `clerk`) y `VITE_CREW_AUTH_URL`; poner `VITE_CLERK_PUBLISHABLE_KEY`; **recompilar** (las `VITE_*` se incrustan en build).
3. Backend: dejar de requerir JWKS de crew-auth y volver a validar solo Clerk.
4. Verificar en un build de staging: login Clerk, sucursales (selector libre), socket conectado, roles en la barra y rutas.
5. Parar el servicio `crew-auth` en Railway (**no borrar el volumen** hasta cerrar la Fase B; es el único respaldo de usuarios/auditoría).

### Fase B — Retirar `crew-auth` del repo

Un solo PR, con `npx turbo run typecheck lint test build` en verde (regla del repo, sin `ignoreBuildErrors`). Hacerlo **después** de la A.

**Borrar**

- `apps/crew-auth/` completo (servicio, tests, Dockerfile, `railway.json`).
- `apps/crew/src/lib/auth/`: `local.tsx`, `localClient.ts(+test)`, `localContext.ts`, `localSession.ts(+test)`, `jwt.ts` (solo lo usa `localSession`).
- `apps/crew/src/app/login/`: `LocalLogin.tsx(+test)`, `PinPad.tsx`, `loginLogic.ts` (los usan solo LocalLogin y LocalUsersAdmin).
- `apps/crew/src/app/ajustes/`: `LocalUsersAdmin.tsx(+test)`, `LocalDevicesAdmin.tsx(+test)`.
- `apps/crew/src/app/session/branchScope.ts(+test)`.

**Editar** (quitar las ramas `kind === "local"` / `localMode`)

- `main.tsx`: eliminar `startLocal`.
- `lib/auth/select.ts` y `types.ts`: quitar `"local"` de `KINDS`/`AuthKind` y `VITE_CREW_AUTH_URL`; actualizar `select.test.ts`, `adapters.test.tsx`.
- `app/LoginPage.tsx`, `app/TopBar.tsx` (cierre de sesión por usuario), `app/AjustesPage.tsx` (`showUsersAdmin`, lazy imports).
- `app/session/SessionProvider.tsx`: `LocalAuthContext`, `localMode`, `deviceBranchId`, `branchFixed`; la sucursal vuelve a depender solo de `crew_branch_id`.
- `hooks/useSocket.ts` (`handshakeBranchId`, `LocalAuthContext`) y `hooks/crewSocket.ts` (la condición `kind !== "clerk"` puede simplificarse).
- `lib/csp.ts(+test)`, `vite-env.d.ts`, `Dockerfile` (`ARG VITE_AUTH_PROVIDER` se queda si se conserva `demo`; `VITE_CREW_AUTH_URL` se va), `src-tauri/tauri.conf.json` (sin cambios requeridos), `README.md` de Crew.
- Raíz: `npm install` para regenerar `package-lock.json` (arrastra `better-sqlite3`, `hono`, `jose`, `@hono/node-server`); `README.md` raíz si lista la app; `packages/next-config/src/transpile-packages.test.ts` (comentario que menciona crew-auth).

**Se queda** (no es de crew-auth)

- El seam `useAuth()` y `types.ts`; `roles.ts` (matriz de permisos y `roleFromClerkMetadata`); `RequirePermission` y los guards del router.
- Adaptadores `clerk` y `demo`, y todo `src/demo/**`.
- `/ajustes/dispositivos` (`DevicesPage`): son equipos/impresoras de Crew, no los dispositivos emparejados de crew-auth.
- Login de mesero por dispositivo (`WaiterLoginModal`, `useWaiterSession`).

Se puede dejar el provider `local` y quitar solo el servicio, pero sin servicio queda código muerto que además mantiene `VITE_CREW_AUTH_URL` en la CSP: se recomienda borrarlo completo.

**Cierre**: etiquetar el último commit con `crew-auth` (p. ej. `git tag crew-auth-final`) antes de borrar, para poder recuperarlo, y eliminar después el servicio y el volumen en Railway.

## 6. Qué se pierde al volver (decisión consciente)

Capacidades que **solo** existen con `crew-auth`; si se quieren conservar sobre Clerk habrá que rediseñarlas:

- PIN por persona en un dispositivo compartido (Clerk es una cuenta por restaurante).
- Sucursal fija por dispositivo y roles por persona.
- Vinculación/revocación de dispositivos, lockout con backoff y auditoría.
- Administración de usuarios dentro de Crew.

## 7. Notas de documentación pendientes

- El README de `crew-auth` citaba `crew-auth-spec.md`, que **no está en el repo**; la referencia se retiró y el contrato vigente es ese README.
- `crew-auth-backend.md` (retiro del secreto legado del socket y JWKS) vive en el repo del backend.
