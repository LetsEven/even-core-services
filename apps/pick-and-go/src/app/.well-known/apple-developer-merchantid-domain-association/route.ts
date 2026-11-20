import { readFileSync } from "fs";
import { join } from "path";
import { createTextFileRoute } from "@even/next-config/well-known";

// OJO: el archivo en public/.well-known se llama "...association.txt" y esta ruta
// busca el nombre sin extensión, así que hoy responde 500. Se conserva tal cual
// (refactor sin cambio de comportamiento); corregir en un PR aparte.
export const GET = createTextFileRoute(() =>
  readFileSync(
    join(
      process.cwd(),
      "public",
      ".well-known",
      "apple-developer-merchantid-domain-association",
    ),
    "utf-8",
  ),
);
