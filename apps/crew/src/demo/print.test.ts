// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PRINT_TOAST_TEXT, simulateNativeInvoke, ticketToText } from "./print";

describe("demo: impresion simulada", () => {
  it("registra el ticket en consola y muestra el toast, sin imprimir", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const bytes = [0x1b, 0x40, ...Array.from("MESA 05\n2 TACO\n", (c) => c.charCodeAt(0)), 0x1d, 0x56, 0x00];
    await simulateNativeInvoke("print_raw", { ip: "192.168.1.50", port: 9100, data: bytes });

    expect(info).toHaveBeenCalledWith(expect.stringContaining("2 TACO"));
    expect(document.body.textContent).toContain(PRINT_TOAST_TEXT);
    info.mockRestore();
  });

  it("ticketToText descarta comandos de control", () => {
    expect(ticketToText([0x1b, 0x40, 0x41, 0x42, 0x0a, 0x1d, 0x56, 0x00])).toBe("AB");
    // QR: GS ( k pL pH ...datos con letras que no deben salir
    const qr = [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00];
    expect(ticketToText([0x4f, ...qr, 0x4b])).toBe("OK");
  });

  it("scan de impresoras devuelve las simuladas", async () => {
    const found = (await simulateNativeInvoke("scan_printers")) as { ip: string }[];
    expect(found.map((p) => p.ip)).toContain("192.168.1.50");
  });
});
