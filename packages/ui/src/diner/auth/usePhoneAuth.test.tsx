import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePhoneAuth, type PhoneAuthOptions } from "./usePhoneAuth";

// Los textos no importan aquí: el mock devuelve la clave.
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const ok = { success: true };

function setup(overrides: Partial<PhoneAuthOptions> = {}) {
  const options: PhoneAuthOptions = {
    sendOtp: vi.fn().mockResolvedValue(ok),
    verifyOtp: vi.fn().mockResolvedValue(ok),
    saveProfile: vi.fn().mockResolvedValue(ok),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    onAuthenticated: vi.fn(),
    ...overrides,
  };
  const hook = renderHook((props: PhoneAuthOptions) => usePhoneAuth(props), { initialProps: options });
  return { ...hook, options };
}

/** Captura número y manda el código: deja el hook en el paso "verify". */
async function sendCode(result: ReturnType<typeof setup>["result"]) {
  act(() => result.current.changePhone("55 1234 5678"));
  await act(async () => {
    await result.current.sendCode();
  });
}

describe("usePhoneAuth", () => {
  it("manda el SMS con la lada, pasa al código y arranca la cuenta atrás", async () => {
    const { result, options } = setup();
    await sendCode(result);
    expect(options.sendOtp).toHaveBeenCalledWith("+525512345678");
    expect(result.current.step).toBe("verify");
    expect(result.current.phoneDisplay).toBe("551 234 5678");
    expect(result.current.countdown).toBe(60);
  });

  it("si el envío falla vuelve al teléfono con el error", async () => {
    const { result } = setup({ sendOtp: vi.fn().mockResolvedValue({ success: false, error: "Sin saldo" }) });
    await sendCode(result);
    expect(result.current.step).toBe("phone");
    expect(result.current.error).toBe("Sin saldo");
  });

  it("no verifica un código incompleto", async () => {
    const { result, options } = setup();
    await sendCode(result);
    act(() => result.current.setOtp("123"));
    await act(async () => {
      await result.current.verifyCode();
    });
    expect(options.verifyOtp).not.toHaveBeenCalled();
    expect(result.current.error).toBe("errorInvalidCodeLength");
  });

  it("con perfil completo (hasProfile) recarga el perfil y termina", async () => {
    const { result, options } = setup({ hasProfile: vi.fn().mockResolvedValue({ firstName: "Ana", lastName: "P" }) });
    await sendCode(result);
    act(() => result.current.setOtp("12-34-56"));
    await act(async () => {
      await result.current.verifyCode();
    });
    expect(options.verifyOtp).toHaveBeenCalledWith("+525512345678", "123456");
    expect(options.refreshProfile).toHaveBeenCalled();
    expect(options.onAuthenticated).toHaveBeenCalledWith({ firstName: "Ana", lastName: "P" });
  });

  it("sin perfil (hasProfile) pide el perfil y lo guarda con la fecha de nacimiento", async () => {
    const { result, options } = setup({ hasProfile: vi.fn().mockResolvedValue(false) });
    await sendCode(result);
    act(() => result.current.setOtp("123456"));
    await act(async () => {
      await result.current.verifyCode();
    });
    expect(result.current.step).toBe("profile");
    expect(options.onAuthenticated).not.toHaveBeenCalled();

    act(() => {
      result.current.setFirstName("Ana");
      result.current.setAge(30);
      result.current.setAcceptedTerms(true);
    });
    await act(async () => {
      await result.current.submitProfile();
    });
    const saved = vi.mocked(options.saveProfile).mock.calls[0][0];
    expect(saved).toMatchObject({ firstName: "Ana", lastName: "", acceptedTerms: true });
    expect(saved.birthDate).toMatch(/^\d{4}-01-01$/);
    expect(options.onAuthenticated).toHaveBeenCalledWith({ firstName: "Ana", lastName: "" });
  });

  it("código inválido: muestra el error y se queda en el paso", async () => {
    const { result } = setup({ verifyOtp: vi.fn().mockResolvedValue({ success: false, error: "Código vencido" }) });
    await sendCode(result);
    act(() => result.current.setOtp("123456"));
    await act(async () => {
      await result.current.verifyCode();
    });
    expect(result.current.step).toBe("verify");
    expect(result.current.error).toBe("Código vencido");
  });

  it("cambiar número vuelve al teléfono y limpia el código", async () => {
    const { result } = setup();
    await sendCode(result);
    act(() => result.current.setOtp("123"));
    act(() => result.current.changeNumber());
    expect(result.current.step).toBe("phone");
    expect(result.current.otp).toBe("");
  });

  describe("session (el contexto decide)", () => {
    const session = { isAuthenticated: true, isLoading: false };

    it("con sesión y perfil incompleto salta al perfil precargado", async () => {
      const { result } = setup({ session: { ...session, profile: { firstName: "Ana", birthDate: null } } });
      await waitFor(() => expect(result.current.step).toBe("profile"));
      expect(result.current.firstName).toBe("Ana");
    });

    it("con sesión y perfil completo solo termina si skipIfComplete", async () => {
      const profile = { firstName: "Ana", birthDate: "1996-01-01" };
      const stay = setup({ session: { ...session, profile } });
      expect(stay.result.current.step).toBe("phone");
      expect(stay.options.onAuthenticated).not.toHaveBeenCalled();

      const skip = setup({ session: { ...session, profile, skipIfComplete: true } });
      await waitFor(() => expect(skip.options.onAuthenticated).toHaveBeenCalledTimes(1));
    });

    it("tras verificar el código termina cuando el contexto trae el perfil completo (una sola vez)", async () => {
      const { result, rerender, options } = setup({ session: { isAuthenticated: false, isLoading: false } });
      await sendCode(result);
      expect(options.onAuthenticated).not.toHaveBeenCalled();
      rerender({
        ...options,
        session: { isAuthenticated: true, isLoading: false, profile: { firstName: "Ana", birthDate: "1996-01-01" } },
      });
      await waitFor(() => expect(options.onAuthenticated).toHaveBeenCalledTimes(1));
      rerender({
        ...options,
        session: { isAuthenticated: true, isLoading: false, profile: { firstName: "Ana", birthDate: "1996-01-01" } },
      });
      expect(options.onAuthenticated).toHaveBeenCalledTimes(1);
    });

    it("requireBirthDate:false termina tras el código con solo el nombre; por defecto lo pide", async () => {
      const onlyName = { firstName: "Ana", birthDate: null };
      for (const [requireBirthDate, finishes] of [[false, true], [undefined, false]] as const) {
        const { result, rerender, options } = setup({ session: { isAuthenticated: false, isLoading: false, requireBirthDate } });
        await sendCode(result);
        rerender({ ...options, session: { isAuthenticated: true, isLoading: false, profile: onlyName, requireBirthDate } });
        if (finishes) {
          await waitFor(() => expect(options.onAuthenticated).toHaveBeenCalledTimes(1));
          expect(result.current.step).toBe("verify");
        } else {
          await waitFor(() => expect(result.current.step).toBe("profile"));
          expect(options.onAuthenticated).not.toHaveBeenCalled();
        }
      }
    });

    it("decideAfterVerify:false deja decidir a hasProfile tras el código", async () => {
      const { result, rerender, options } = setup({
        session: { isAuthenticated: false, isLoading: false, decideAfterVerify: false },
      });
      await sendCode(result);
      // El contexto aún trae un perfil incompleto mientras hasProfile decide: no debe saltar al perfil.
      rerender({ ...options, session: { isAuthenticated: true, isLoading: false, profile: null, decideAfterVerify: false } });
      expect(result.current.step).toBe("verify");
    });
  });
});
