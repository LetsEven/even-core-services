import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOpengraphImage } from "@even/next-config/opengraph";

export const runtime = "nodejs";
export const alt = "Even Pick & Go — Ordena, paga y recoge. Tu comida lista cuando llegues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asteriskSvg = readFileSync(
  join(process.cwd(), "public", "even", "even-asterisk-grass.svg"),
  "utf-8",
);

export default createOpengraphImage({
  asteriskSvg,
  size,
});
