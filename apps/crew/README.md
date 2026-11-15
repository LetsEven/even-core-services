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
| `VITE_ENABLE_REPRINT` | Habilita la reimpresión de comandas desde la cuenta. Dejar apagada hasta que exista el endpoint (ver pendientes). |

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
