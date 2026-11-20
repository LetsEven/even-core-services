import type { Metadata } from "next";

export interface RootMetadataOptions {
  /** Origen público de la app, p. ej. `https://tp.letseven.io`. */
  metadataBase: string;
  /** `openGraph.siteName`, p. ej. "Even Tap & Pay". */
  siteName: string;
  title: string;
  description: string;
  icons?: Metadata["icons"];
}

/** Íconos de pestaña (asterisco Even) claro/oscuro. */
export const evenAsteriskIcons: NonNullable<Metadata["icons"]> = {
  icon: [
    {
      url: "/even/even-asterisk-evergreen.svg",
      media: "(prefers-color-scheme: light)",
    },
    {
      url: "/even/even-asterisk-grass.svg",
      media: "(prefers-color-scheme: dark)",
    },
  ],
};

/** Metadata raíz común: título/descripción traducidos + Open Graph de sitio. */
export function buildRootMetadata({
  metadataBase,
  siteName,
  title,
  description,
  icons,
}: RootMetadataOptions): Metadata {
  return {
    metadataBase: new URL(metadataBase),
    title,
    description,
    openGraph: {
      type: "website",
      siteName,
      url: "/",
      title,
      description,
    },
    ...(icons ? { icons } : {}),
  };
}
