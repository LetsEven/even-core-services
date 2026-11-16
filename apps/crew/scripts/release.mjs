#!/usr/bin/env node
// Construye Even Crew (Windows + Android), lo sube al bucket de Supabase y actualiza releases.json.
// También crea el tag vX.Y.Z y el Release en GitHub con los instaladores adjuntos.
// Uso: npm run release [-- --dry-run] [-- --skip-build] [-- --force] [-- --only=win|apk] [-- --no-github]
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, execFileSync } from "child_process";
import { loadEnv } from "vite";
import * as tus from "tus-js-client";

const PROJECT_REF = "lpddleurgayjgstywysr";
const BUCKET = "Agente & Crew";
const MANIFEST = "releases.json";
const API = `https://${PROJECT_REF}.supabase.co/storage/v1`;
const TUS_ENDPOINT = `https://${PROJECT_REF}.storage.supabase.co/storage/v1/upload/resumable`;
const PROD_API_URLS = [
  "https://api.letseven.io",
  "https://even-backend-production.up.railway.app",
];

const argv = process.argv.slice(2);
const args = new Set(argv);
const only = argv.find((a) => a.startsWith("--only="))?.split("=")[1];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tauriConf = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargoVersion = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8").match(
  /^version = "(.+)"/m,
)[1];
const version = tauriConf.version;

const ARTEFACTOS = [
  {
    clave: "even_crew_win",
    platform: "Windows",
    filename: `Even Crew ${version}.exe`,
    path: resolve(root, `src-tauri/target/release/Even Crew ${version}.exe`),
    contentType: "application/vnd.microsoft.portable-executable",
    // --no-bundle: sin .msi ni NSIS, al bucket solo va el .exe.
    build: "npm run tauri -- build --no-bundle && node scripts/rename-artifact.mjs",
  },
  {
    clave: "even_crew_apk",
    platform: "Android",
    filename: `Even Crew ${version}.apk`,
    path: resolve(
      root,
      `src-tauri/gen/android/app/build/outputs/apk/universal/release/Even Crew ${version}.apk`,
    ),
    contentType: "application/vnd.android.package-archive",
    build: "npm run tauri android build",
  },
].filter((a) => !only || (only === "win" ? a.platform === "Windows" : a.platform === "Android"));

const TAG = `v${version}`;
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

// El tag y el Release tienen que corresponder a lo que está en origin/main.
function validarRepo() {
  if (args.has("--no-github")) return;
  if (git("status", "--porcelain")) {
    throw new Error("Hay cambios sin commit: publica desde un árbol limpio.");
  }
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") {
    throw new Error("Publica desde main (git switch main).");
  }
  git("fetch", "-q", "origin", "main", "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new Error("Tu main no está al día con origin/main (git pull).");
  }
  if (git("tag", "-l", TAG)) {
    throw new Error(`El tag ${TAG} ya existe. Sube la versión o usa --no-github.`);
  }
}

function publicarEnGitHub(titulo, archivos, enlaces) {
  if (args.has("--no-github")) return;
  git("tag", "-a", TAG, "-m", titulo);
  git("push", "-q", "origin", TAG);
  const notas = ["## Descargas", ...enlaces.map((u) => `- ${u}`)].join("\n");
  execFileSync(
    "gh",
    ["release", "create", TAG, ...archivos, "--title", titulo, "--notes", notas, "--generate-notes", "--verify-tag"],
    { cwd: root, stdio: "inherit" },
  );
}

const objectUrl = (name, visibility = "") =>
  `${API}/object/${visibility}${encodeURIComponent(BUCKET)}/${encodeURIComponent(name)}`;

// Vite mete estas variables en la app al construir: nunca publicar un build de DEV.
function validarEnv() {
  if (version !== cargoVersion) {
    throw new Error(`tauri.conf.json (${version}) y Cargo.toml (${cargoVersion}) no coinciden`);
  }
  const env = loadEnv("production", root, "VITE_");
  const problemas = [];
  if (!PROD_API_URLS.includes(env.VITE_API_BASE_URL)) {
    problemas.push(`VITE_API_BASE_URL=${env.VITE_API_BASE_URL}`);
  }
  if (!env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
    problemas.push("VITE_CLERK_PUBLISHABLE_KEY no es pk_live_");
  }
  if ((env.VITE_APP_LABEL || "Even Crew") !== "Even Crew") {
    problemas.push(`VITE_APP_LABEL=${env.VITE_APP_LABEL}`);
  }
  if (problemas.length) {
    throw new Error(`El .env no es de producción: ${problemas.join(", ")}`);
  }
}

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Requiere la CLI con sesión iniciada (npx supabase login).
  // --remote en la CLI v3+; --project-ref en versiones viejas.
  const correr = (flag) =>
    execSync(`npx supabase projects api-keys ${flag} -o json`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  let out;
  try {
    out = correr(`--remote=${PROJECT_REF}`);
  } catch {
    out = correr(`--project-ref ${PROJECT_REF}`);
  }
  const key = JSON.parse(out).find((k) => k.name === "service_role")?.api_key;
  if (!key) throw new Error("No se encontró la llave service_role");
  return key;
}

async function existe(name, key) {
  const res = await fetch(objectUrl(name, "info/"), {
    headers: { authorization: `Bearer ${key}` },
  });
  return res.ok;
}

function subir(artefacto, key) {
  const buffer = readFileSync(artefacto.path);
  return new Promise((resolvePromise, reject) => {
    const upload = new tus.Upload(buffer, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${key}`,
        "x-upsert": args.has("--force") ? "true" : "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Supabase exige trozos de exactamente 6 MB.
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: BUCKET,
        objectName: artefacto.filename,
        contentType: artefacto.contentType,
        cacheControl: "31536000",
      },
      onProgress: (subidos, total) => {
        const pct = ((subidos / total) * 100).toFixed(0);
        process.stdout.write(`\r  Subiendo ${artefacto.filename}: ${pct}%   `);
      },
      onError: reject,
      onSuccess: () => {
        process.stdout.write("\n");
        resolvePromise();
      },
    });
    upload.start();
  });
}

async function actualizarManifiesto(key, publicados) {
  const res = await fetch(objectUrl(MANIFEST, "authenticated/"), {
    headers: { authorization: `Bearer ${key}` },
  });
  const manifiesto = res.ok ? await res.json() : {};

  for (const a of publicados) {
    manifiesto[a.clave] = {
      name: "Even Crew",
      platform: a.platform,
      version,
      filename: a.filename,
      url: objectUrl(a.filename, "public/"),
      released_at: new Date().toISOString(),
    };
  }

  const put = await fetch(objectUrl(MANIFEST), {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "cache-control": "max-age=60",
      "x-upsert": "true",
    },
    body: JSON.stringify(manifiesto, null, 2),
  });
  if (!put.ok) {
    throw new Error(`No se pudo escribir ${MANIFEST}: HTTP ${put.status} ${await put.text()}`);
  }
}

async function main() {
  validarEnv();
  // Un Release parcial (--only) no tendría ambos instaladores.
  if (only && !args.has("--no-github")) {
    throw new Error("Con --only usa también --no-github.");
  }
  validarRepo();
  const key = serviceKey();

  // Antes de construir, para no esperar el build y luego descubrir que ya existe.
  if (!args.has("--force")) {
    for (const a of ARTEFACTOS) {
      if (await existe(a.filename, key)) {
        throw new Error(`${a.filename} ya está en el bucket. Sube la versión o usa --force.`);
      }
    }
  }
  if (args.has("--dry-run")) {
    console.log(`✔ Listo para publicar Even Crew ${version}: ${ARTEFACTOS.map((a) => a.filename).join(", ")}`);
    return;
  }

  for (const a of ARTEFACTOS) {
    if (!args.has("--skip-build")) {
      console.log(`> ${a.build}`);
      execSync(a.build, { cwd: root, stdio: "inherit" });
    }
    if (!existsSync(a.path)) throw new Error(`No existe ${a.path}`);
  }

  for (const a of ARTEFACTOS) await subir(a, key);
  await actualizarManifiesto(key, ARTEFACTOS);

  const urls = ARTEFACTOS.map((a) => objectUrl(a.filename, "public/"));
  console.log(`✔ Publicado Even Crew ${version}`);
  for (const u of urls) console.log(`  ${u}`);
  console.log("  El admin-portal lo mostrará en máximo 5 minutos.");

  try {
    publicarEnGitHub(`Even Crew ${version}`, ARTEFACTOS.map((a) => a.path), urls);
    console.log(`✔ Release ${TAG} creado en GitHub`);
  } catch (err) {
    // Los instaladores ya están publicados; solo falta el Release.
    console.error(`✖ No se pudo crear el Release en GitHub: ${err.message}`);
    console.error(`  Créalo a mano: gh release create ${TAG} <archivos> --generate-notes`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
