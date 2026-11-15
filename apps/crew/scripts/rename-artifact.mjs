import { readFileSync, renameSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const version = cargo.match(/^version = "(.+)"/m)[1];

const src = resolve(root, "src-tauri/target/release/even-crew.exe");
const dst = resolve(root, `src-tauri/target/release/Even Crew ${version}.exe`);

if (existsSync(src)) {
  renameSync(src, dst);
  console.log(`Renamed to: Even Crew ${version}.exe`);
} else {
  console.warn("even-crew.exe not found, skipping rename.");
}
