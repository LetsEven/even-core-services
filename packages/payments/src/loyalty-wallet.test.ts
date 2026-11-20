import { describe, expect, it, vi } from "vitest";
import { createWalletCardService } from "./loyalty-wallet";

describe("createWalletCardService", () => {
  it("consulta la disponibilidad sin el prefijo /api", async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { puede: true } });
    const service = createWalletCardService(request);
    await expect(service.disponibilidad(29)).resolves.toEqual({ puede: true });
    expect(request).toHaveBeenCalledWith(
      "/loyalty/wallet/disponibilidad?restaurant_id=29",
      { method: "GET" },
    );
  });

  it("un fallo de disponibilidad devuelve null", async () => {
    const request = vi.fn().mockResolvedValue({ success: false });
    await expect(createWalletCardService(request).disponibilidad(1)).resolves.toBeNull();
  });

  it("emitir propaga el mensaje y el código del backend", async () => {
    const request = vi.fn().mockResolvedValue({
      success: false,
      message: "Regístrate",
      code: "requiere_cuenta",
    });
    const error = await createWalletCardService(request)
      .emitir(1)
      .catch((e: Error & { code?: string }) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Regístrate");
    expect((error as Error & { code?: string }).code).toBe("requiere_cuenta");
    expect(request.mock.calls[0][0]).toBe("/loyalty/wallet/pase");
  });
});
