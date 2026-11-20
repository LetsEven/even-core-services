import { readFileSync } from "fs";
import { join } from "path";
import { createTextFileRoute } from "@even/next-config/well-known";

export const GET = createTextFileRoute(() =>
  readFileSync(
    join(
      process.cwd(),
      "public",
      ".well-known",
      "apple-developer-merchantid-domain-association.txt",
    ),
    "utf-8",
  ),
);
