import { describe, expect, it } from "vitest";
import { buildRootMetadata, evenAsteriskIcons } from "./metadata";

describe("buildRootMetadata", () => {
  it("arma título, descripción y Open Graph de sitio", () => {
    expect(
      buildRootMetadata({
        metadataBase: "https://x.letseven.io",
        siteName: "Even X",
        title: "T",
        description: "D",
      }),
    ).toEqual({
      metadataBase: new URL("https://x.letseven.io"),
      title: "T",
      description: "D",
      openGraph: { type: "website", siteName: "Even X", url: "/", title: "T", description: "D" },
    });
  });

  it("incluye icons solo si se pasan", () => {
    const base = { metadataBase: "https://x.io", siteName: "S", title: "T", description: "D" };
    expect(buildRootMetadata(base)).not.toHaveProperty("icons");
    expect(buildRootMetadata({ ...base, icons: evenAsteriskIcons })).toHaveProperty("icons", evenAsteriskIcons);
  });
});
