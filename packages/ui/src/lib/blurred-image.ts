"use client";

import { useEffect, useState } from "react";

/**
 * Versión diminuta (64 px de ancho) de una imagen, lista para estirarse como
 * fondo difuminado. Evita decodificar y desenfocar con CSS la imagen original
 * (miles de píxeles) en cada vista: se genera una vez con un canvas y queda en
 * memoria y en sessionStorage como data URL de ~2 KB.
 *
 * Necesita que el servidor de la imagen mande CORS; si no (o sin canvas), la
 * promesa se rechaza y quien llama usa la imagen original.
 */

const WIDTH = 64;
const STORAGE_PREFIX = "even-blur:";

const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function readStored(url: string): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + url);
  } catch {
    return null;
  }
}

function writeStored(url: string, value: string) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + url, value);
  } catch {
    // Sin sessionStorage (modo privado, cuota): se queda solo en memoria.
  }
}

/** Devuelve el desenfoque ya calculado, sin esperar, o null. */
export function peekBlurredImage(url: string): string | null {
  if (typeof window === "undefined") return null;
  const cached = memory.get(url) ?? readStored(url);
  if (cached) memory.set(url, cached);
  return cached;
}

export function getBlurredImage(url: string): Promise<string> {
  const cached = peekBlurredImage(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const height = Math.max(1, Math.round((WIDTH * image.naturalHeight) / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas no disponible");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, WIDTH, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        memory.set(url, dataUrl);
        writeStored(url, dataUrl);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("no se pudo cargar la imagen"));
    image.src = url;
  }).finally(() => inflight.delete(url));

  inflight.set(url, promise);
  return promise;
}

/**
 * La imagen desenfocada de `url`: `undefined` mientras se calcula, `null` si no
 * se pudo (usar la original) y el data URL cuando está lista.
 */
export function useBlurredImage(url: string | null | undefined): string | null | undefined {
  const [state, setState] = useState<{ url: string; value: string | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    getBlurredImage(url)
      .then((value) => !cancelled && setState({ url, value }))
      .catch(() => !cancelled && setState({ url, value: null }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;
  // Lectura síncrona del caché para no parpadear al volver a montar.
  const cached = peekBlurredImage(url);
  if (cached) return cached;
  return state?.url === url ? state.value : undefined;
}
