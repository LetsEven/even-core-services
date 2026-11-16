# Even Crew

App de operación del restaurante (mesas, cocina, caja, impresión) para tablet, móvil y escritorio. Vite + React 19 + Tailwind 4 + React Router, empaquetada con Tauri (Windows/Android) y también como web. Usa `@even/ui` para los componentes base (`Modal`, `Button`, `Input`, ...).

## Estructura

```
src/
  app/            Shell: router, TopBar, NavBar/NavRail, sesión (SessionProvider), páginas por ruta
  features/       Lógica por dominio: caja, comanda, cuenta, cocina (tablero), impresion
  routes/         Pantallas con ruta propia: mesas/ (cuenta, comanda), caja/
  pages/          Vistas heredadas: Kitchen, Historial, Comprobantes, Printers
  components/     Piezas compartidas: SpatialGrid (croquis), OrderCard, modales de cobro/ticket/mesero
  hooks/          Sockets, impresión, órdenes de cocina, sesión de mesero
  services/       Clientes de API (api.ts, printApi.ts, comandaApi.ts) y registro de servicios
  lib/auth/       Autenticación intercambiable (interfaz, roles/permisos, adaptadores clerk, local y demo)
  utils/, lib/    Utilidades (folio, comisión Flex Bill, plataforma, push)
src-tauri/        Shell nativo (Rust) y configuración de Tauri
```

Los tests (`*.test.ts`) viven junto al código. Un solo `Modal` de `@even/ui` cubre todos los diálogos.

## Cómo correr

Desde la raíz del monorepo:

```bash
npm install
npm run dev -w @even/crew          # Vite en modo web
npm run tauri:dev -w @even/crew    # app nativa (requiere Rust y toolchain de Tauri)
npm run tauri:build -w @even/crew  # instalador / APK
```

Antes de un PR: `npx turbo run typecheck lint test build --filter=@even/crew`.

## Variables de entorno (`VITE_*`)

| Variable | Uso |
|---|---|
| `VITE_API_BASE_URL` | URL base del backend (REST y sockets). Obligatoria. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clave pública de Clerk para el login del restaurante. |
| `VITE_CREW_SOCKET_SECRET` | Secreto del socket de Crew (si falta usa un valor por defecto de desarrollo). |
| `VITE_APP_LABEL` | Nombre mostrado en la vista de Cocina (por defecto "Even Crew"). |
| `VITE_AUTH_PROVIDER` | Autenticación: `clerk` (por defecto), `local` (servicio `crew-auth`, PIN por persona) o `demo`. Ver "Autenticación". |
| `VITE_CREW_AUTH_URL` | URL base del servicio `crew-auth`. Obligatoria con `VITE_AUTH_PROVIDER=local`. |
| `VITE_DEMO_MODE` | `true` activa el **modo demo** (datos ficticios, sin backend ni Clerk). Solo para revisar la UI en dev; nunca activo por defecto. Ver "Modo demo". |
| `VITE_ENABLE_REPRINT` | Habilita la reimpresión de comandas desde la cuenta. Dejar apagada hasta que exista el endpoint (ver pendientes). |

## Modo demo

Para revisar la UI sin acceso a Clerk dev ni al backend (el backend exige un JWT de Clerk en cada request, así que no se puede simular solo el login). Todo ocurre en el frontend y se pierde al recargar.

- **Activar**: construir con `VITE_DEMO_MODE=true` (build-time, como el resto de `VITE_*`). En Railway/Docker es el `ARG VITE_DEMO_MODE` del `Dockerfile`. En local: `VITE_DEMO_MODE=true npm run dev -w @even/crew`. No hace falta `VITE_CLERK_PUBLISHABLE_KEY`.
- **Seguridad**: se niega a activarse (pantalla de error y mensaje en consola) si `VITE_API_BASE_URL` contiene `api.letseven.io` o `even-backend-production`. Nunca está activo si la variable falta o vale otra cosa. No usar en el despliegue de producción.
- **Qué se ve**: banner permanente "MODO DEMO: datos ficticios", login con el botón "Entrar al modo demo" y el restaurante "Mariscos Mazatlán" (id 26, una sucursal con Flex Bill y Tap Order & Pay), 12 mesas, órdenes en distintos estados, menú con extras y un platillo agotado, tres meseros con contraseña vacía (basta elegir el nombre), impresoras (cocina, barra, pagos), historial y comprobantes (PDF ficticio).
- **Cómo funciona**: un wrapper de `window.fetch` (instalado solo en demo) responde todo lo que va a `/api/...` desde un store en memoria; las mutaciones (abrir mesa, comanda, estado de platillo, cobro, mesero, reordenar, impresoras) actualizan ese store. Un endpoint sin fixture responde 404 y avisa en consola `demo: endpoint sin fixture`. El socket es un stub sin red y la impresión es un no-op ("Impresión simulada" + ticket en consola; la TopBar muestra "Imprime aquí (demo)").
- **Código**: todo en `src/demo/**` (fixtures, store, handlers, fetch, socket, impresión), cargado con `import()` dinámico solo si el demo está activo. Los componentes no importan Clerk directo: usan `useAuth()` de `src/lib/auth`, y en demo el adaptador devuelve una sesión falsa con rol `super`.
- **Tests**: `src/demo/*.test.ts` y `src/lib/demoMode.test.ts` (se niega con API de producción).

## Autenticación

El acceso a Crew es **intercambiable**: se elige en build con `VITE_AUTH_PROVIDER`. Todo el código de la app usa solo `useAuth()` (`src/lib/auth`), que expone `status` (`loading | signedOut | signedIn`), `user` (`{id, name, role, permissions}`), `getToken()`, `signOut()`, `hasPermission(p)` y `kind` (adaptador activo). Los adaptadores se cargan con `import()` dinámico: un build no incluye el código de los que no usa (con `local` no se descarga Clerk).

| Provider | Qué es | Rol del usuario |
|---|---|---|
| `clerk` (default) | Login de Clerk, comportamiento de siempre. | `publicMetadata.crewRole` de la cuenta; **sin valor es `super`**, así las cuentas actuales no pierden acceso. Un valor inválido cae a `cocina` (solo lectura), nunca a `super`. |
| `local` | Servicio propio `apps/crew-auth`: el dispositivo se empareja con un código y cada persona entra con su PIN. No usa Clerk. | Claims del JWT de acceso (`role`, `permissions`). |
| `demo` | Sesión falsa, sin red (ver "Modo demo"). Equivale a `VITE_DEMO_MODE=true`, con las mismas salvaguardas. | `super` |

`VITE_DEMO_MODE=true` sigue forzando demo sobre cualquier otro valor. Un `VITE_AUTH_PROVIDER` desconocido es un error de configuración (no se adivina).

### Roles y permisos

| Permiso | super | cajero | mesero | cocina |
|---|:-:|:-:|:-:|:-:|
| `mesas.ver` | sí | sí | sí | |
| `comanda.crear` | sí | sí | sí | |
| `cuenta.ver` | sí | sí | sí | |
| `cuenta.cobrar` | sí | sí | sí | |
| `cocina.ver` | sí | | | sí |
| `cocina.operar` | sí | | | opcional por usuario |
| `caja.ver` | sí | sí | | |
| `caja.resumen` | sí | sí | | |
| `ajustes.ver` | sí | | | |
| `ajustes.impresoras` | sí | | | |
| `usuarios.administrar` | sí | | | |

Fuente de verdad: `src/lib/auth/roles.ts` (mismo contrato que `crew-auth` y el backend; el front solo oculta y protege la UI, el backend es quien autoriza). En `local`, `cocina.operar` llega en los claims cuando el usuario lo tiene.

Rutas protegidas con `RequirePermission` (pantalla "Sin acceso"): `/mesas` → `mesas.ver`; `/mesas/:unidad` → `cuenta.ver`; `/mesas/:unidad/comanda` → `comanda.crear`; `/cocina` → `cocina.ver`; `/caja` y `/caja/comprobantes` → `caja.ver`; `/caja/resumen` → `caja.resumen`; `/ajustes` → `ajustes.ver`; `/ajustes/impresoras` y `/ajustes/dispositivos` → `ajustes.impresoras`. La barra de navegación solo muestra lo permitido; "Cobrar" / "Registrar pago" exige `cuenta.cobrar`; en Cocina, sin `cocina.operar`, los controles de estado quedan deshabilitados (solo lectura). `/` va a la primera vista permitida del rol (cocina → `/cocina`).

### Provider `local` (crew-auth)

- **Primera vez en el dispositivo**: pantalla de código de emparejamiento (lo genera un `super` en Ajustes → Usuarios, vale 10 min y es de un uso). El token del dispositivo queda en `localStorage`.
- **Uso diario**: selector de empleados y teclado numérico grande para el PIN (4 a 8 dígitos). Errores genéricos ("Usuario o PIN incorrecto"); bloqueo con cuenta regresiva (429 del servicio con `Retry-After`, o 5 fallos seguidos, 15 min; el lockout por PIN del servicio responde 401 genérico, igual que un PIN malo). Tocar el usuario en la barra superior cierra la sesión y vuelve al selector.
- **Tokens**: el access token (15 min) vive solo en memoria; el refresh token (rotativo, 12 h) en `localStorage` (con `try/catch`: sin storage la sesión dura lo que la pestaña). Se refresca solo ~1 min antes de expirar (una petición a la vez) y `signOut` lo revoca en el servicio. Al recargar con sesión guardada y sin red se reintenta el refresh con backoff (0,5 → 8 s) antes de pedir PIN; un 401 pide PIN de inmediato. Entre pestañas, cada refresh corre bajo `navigator.locks` (o un lease en `localStorage` si no existe), parte siempre del refresh token guardado y difunde el access token nuevo por `BroadcastChannel`; el servicio revoca la sesión anterior al rotar, así que las demás pestañas lo adoptan en vez de usar el suyo.
- **Administración** (Ajustes, solo con provider local y `usuarios.administrar`): listar, crear, cambiar rol, activar/desactivar, resetear PIN y generar código de emparejamiento.
- El cliente tipado está en `src/lib/auth/localClient.ts`, alineado con las rutas reales de `apps/crew-auth` (token de dispositivo en `X-Device-Token`, access token en `Authorization: Bearer`). La prueba de integración `apps/crew-auth/test/local.integration.test.ts` levanta el servicio real y ejercita el flujo completo con este cliente.

### Cambiar entre clerk y local

Es una variable de build (`VITE_*` se incrusta al compilar):

```bash
# Clerk (default; no hace falta VITE_AUTH_PROVIDER)
VITE_CLERK_PUBLISHABLE_KEY=pk_... npm run dev -w @even/crew

# Servicio local
VITE_AUTH_PROVIDER=local VITE_CREW_AUTH_URL=https://crew-auth.example npm run dev -w @even/crew
```

En Railway/Docker son los `ARG` `VITE_AUTH_PROVIDER` y `VITE_CREW_AUTH_URL` del `Dockerfile`. Con `local`, el backend debe aceptar los tokens de `crew-auth` (`CREW_AUTH_JWKS_URL`) y el servicio debe permitir el origen de la app (`CREW_AUTH_ORIGINS`). Volver a Clerk es quitar `VITE_AUTH_PROVIDER` (o ponerlo en `clerk`) y recompilar; nada de la sesión local se mezcla con Clerk.

## Pendientes de backend

Crew ya tiene el cliente y la UI preparados; falta que el backend exponga:

1. **Reimpresión**: `POST /api/kitchen/orders/:type/:id/reprint`. El cliente (`services/printApi.ts`) ya apunta a esa ruta.
2. **Modo "POS Even" sin servicio contratado**: cuentas abiertas y comandas que no dependan de Tap & Pay / Flex Bill, para que el POS de Crew funcione 100% independiente.
3. **`orderNotes` en `dishes/bulk`**: hoy las notas de la orden no viajan al crear platillos en lote; la UI ya las muestra cuando llegan (`OrderCard`).
4. **Estado del bridge de impresión** (Raspberry Pi): REST o evento de socket. `features/impresion/bridgeStatus.ts` es un stub que devuelve "desconocido"; al conectarlo, `getPrintingStatus` y la TopBar lo reflejan sin más cambios.
5. **Ticket de cuenta por cola**: imprimir el ticket de cuenta (con QR de pago) vía la cola de impresión del bridge en vez de solo desde el dispositivo (`PrintTicketModal` imprime hoy con `printTapPayTicket` local).

## Deuda conocida

- `AddDishModal` sigue en uso por `OrderCard` ("Agregar"); se retirará cuando la comanda unificada cubra agregar platillos a una cuenta existente.
- La columna "Entregado" de Cocina solo muestra lo que el hook conserva (hoy Flex Bill con saldo pendiente); el resto sale al entregarse.
- 42 warnings de lint preexistentes (`no-explicit-any`, `react-hooks`); ninguna regla se ha bajado.
