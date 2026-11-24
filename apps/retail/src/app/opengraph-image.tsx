import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOpengraphImage } from "@even/next-config/opengraph";

export const runtime = "nodejs";
export const alt = "Even Retail — Paga tu compra desde tu celular";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asteriskSvg = readFileSync(
  join(process.cwd(), "public", "even", "even-asterisk-grass.svg"),
  "utf-8",
);

export default createOpengraphImage({
  asteriskSvg,
  viewBox: "350 350 300 300",
  size,
});
