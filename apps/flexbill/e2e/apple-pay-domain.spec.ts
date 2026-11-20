import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Apple Pay valida el dominio pidiendo este archivo SIN extensión.
const FILE = path.resolve("public/.well-known/apple-developer-merchantid-domain-association.txt");

test("sirve el archivo de dominio de Apple Pay sin extensión", async ({ request }) => {
  const res = await request.get("/.well-known/apple-developer-merchantid-domain-association");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(await res.text()).toBe(readFileSync(FILE, "utf8"));
});
