// Impresion simulada: nada sale a ninguna impresora. Se registra el ticket en
// consola y se avisa con un toast.
import { demoToast } from "./toast";

export const PRINT_TOAST_TEXT = "Impresión simulada";

// Decodifica los bytes ESC/POS a texto legible: salta los comandos de control
// (ESC/GS), sus parametros y los bloques binarios (imagen raster, QR).
export function ticketToText(data: number[]): string {
  let out = "";
  let i = 0;
  while (i < data.length) {
    const b = data[i];
    if (b === 0x1b) {
      // ESC @ (2 bytes); el resto (a, !, E, J, ...) lleva 1 parametro
      i += data[i + 1] === 0x40 ? 2 : 3;
    } else if (b === 0x1d) {
      const c = data[i + 1];
      if (c === 0x76) {
        // GS v 0 m xL xH yL yH + bitmap
        const w = data[i + 4] + data[i + 5] * 256;
        const h = data[i + 6] + data[i + 7] * 256;
        i += 8 + w * h;
      } else if (c === 0x28) {
        // GS ( k pL pH + datos (QR)
        i += 5 + data[i + 3] + data[i + 4] * 256;
      } else {
        i += 3; // GS ! n, GS V n
      }
    } else {
      if (b === 0x0a) out += "\n";
      else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
      i += 1;
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function logSimulatedTicket(label: string, data: number[]): void {
  console.info(`[DEMO:PRINT] ${label}\n${ticketToText(data)}`);
  demoToast(PRINT_TOAST_TEXT);
}

// Comandos de Tauri que usa Crew para imprimir y buscar impresoras.
export async function simulateNativeInvoke(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  switch (cmd) {
    case "print_raw":
      logSimulatedTicket(`WiFi ${String(args.ip)}:${String(args.port)}`, (args.data as number[]) ?? []);
      return undefined;
    case "print_raw_usb":
      logSimulatedTicket(`USB ${String(args.printerName)}`, (args.data as number[]) ?? []);
      return undefined;
    case "print_test":
    case "print_test_usb":
      console.info(`[DEMO:PRINT] Prueba de impresion (${cmd})`);
      demoToast(PRINT_TOAST_TEXT);
      return undefined;
    case "scan_printers":
      return [
        { ip: "192.168.1.50", port: 9100 },
        { ip: "192.168.1.51", port: 9100 },
        { ip: "192.168.1.52", port: 9100 },
      ];
    case "list_usb_printers":
      return [];
    default:
      console.warn(`demo: comando nativo sin simulacion — ${cmd}`);
      return undefined;
  }
}
