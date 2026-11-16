// Sirve la app de Pick & Go por HTTPS para los e2e: Apple Pay solo se pinta en un
// documento seguro. Levanta `next start` en el puerto interno y un proxy TLS con un
// certificado autofirmado (Playwright usa `ignoreHTTPSErrors`) en el puerto público.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.E2E_HTTPS_PORT);
const innerPort = Number(process.env.E2E_INNER_PORT);

const dir = mkdtempSync(join(tmpdir(), "even-e2e-"));
const key = join(dir, "key.pem");
const cert = join(dir, "cert.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });

const next = spawn("npx", ["next", "start", "--port", String(innerPort)], { stdio: "inherit" });
const stop = () => next.kill();
process.on("exit", stop);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
next.on("exit", (code) => process.exit(code ?? 1));

https
  .createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const upstream = http.request(
      { host: "127.0.0.1", port: innerPort, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(port);
