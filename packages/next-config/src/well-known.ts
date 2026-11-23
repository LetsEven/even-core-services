import { NextResponse } from "next/server";

/**
 * `GET` de una ruta `.well-known` que sirve un archivo de texto plano (p. ej.
 * `apple-developer-merchantid-domain-association` de Apple Pay). `read` lo
 * lee de `public/` en cada petición; el `readFileSync(join(process.cwd(), ...))`
 * se queda literal en la ruta de la app para que el trazado de archivos de
 * Vercel (NFT) incluya el archivo. Si `read` lanza, la ruta responde 500.
 */
export function createTextFileRoute(read: () => string) {
  return async function GET() {
    return new NextResponse(read(), {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  };
}
