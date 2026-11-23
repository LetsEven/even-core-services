import { ImageResponse } from "next/og";
import { brandColors } from "@even/ui";

export interface OpengraphImageOptions {
  /**
   * Contenido del SVG del asterisco Even. Cada app lo lee con un
   * `readFileSync(join(process.cwd(), "public", ...))` literal en su propio
   * archivo, para que el trazado de archivos de Vercel (NFT) lo incluya en la
   * función; por eso no se lee aquí.
   */
  asteriskSvg: string;
  /** Si se indica, reemplaza el `viewBox` del SVG (recorta el asterisco). */
  viewBox?: string;
  /** Mismo `size` que exporta la app (`export const size`). */
  size: { width: number; height: number };
}

/**
 * `default export` de `opengraph-image.tsx`: asterisco Even centrado sobre
 * fondo evergreen. Los exports de segmento (`runtime`, `alt`, `size`,
 * `contentType`) deben quedarse literales en el archivo de la app: Next los
 * lee estáticamente.
 */
export function createOpengraphImage({ asteriskSvg, viewBox, size }: OpengraphImageOptions) {
  const svg = viewBox
    ? asteriskSvg.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
    : asteriskSvg;
  const asteriskDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return function OpengraphImage() {
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: brandColors.evergreen,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asteriskDataUri} width={340} height={340} alt="" />
        </div>
      ),
      { ...size },
    );
  };
}
