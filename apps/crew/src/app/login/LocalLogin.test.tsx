// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalAuthProvider } from "../../lib/auth/local";
import { DEVICE_KEY } from "../../lib/auth/localSession";
import { jsonResponse } from "../../lib/auth/testUtils";
import LocalLogin from "./LocalLogin";
import { appendDigit, formatCountdown, isValidPin } from "./loginLogic";

const users = [
  { id: "u1", name: "Ana", role: "mesero" },
  { id: "u2", name: "Luis", role: "cocina" },
];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <LocalAuthProvider baseUrl="https://auth.test">
      <LocalLogin />
    </LocalAuthProvider>,
  );
const pair = () =>
  localStorage.setItem(DEVICE_KEY, JSON.stringify({ deviceToken: "dev", branchId: "b1" }));
const tapPin = (pin: string) => {
  for (const d of pin) fireEvent.click(screen.getByRole("button", { name: d }));
};

describe("login local", () => {
  it("sin emparejar pide el codigo y empareja", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Código de emparejamiento"), { target: { value: "ABC123" } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ deviceToken: "dev", branchId: "b1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ users }));
    fireEvent.click(screen.getByRole("button", { name: "Emparejar" }));
    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(screen.getByText("Luis")).toBeTruthy();
  });

  it("codigo invalido: mensaje generico", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Código de emparejamiento"), { target: { value: "MAL" } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "no existe" }, 404));
    fireEvent.click(screen.getByRole("button", { name: "Emparejar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Código inválido o vencido/);
  });

  it("PIN incorrecto: mensaje generico y el PIN se limpia", async () => {
    pair();
    fetchMock.mockResolvedValueOnce(jsonResponse({ users }));
    mount();
    fireEvent.click(await screen.findByText("Ana"));
    tapPin("1234");
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "pin" }, 401));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Usuario o PIN incorrecto.");
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("0 dígitos ingresados");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ userId: "u1", pin: "1234" });
  });

  it("lockout del servicio: avisa con cuenta regresiva y deshabilita el teclado", async () => {
    pair();
    fetchMock.mockResolvedValueOnce(jsonResponse({ users }));
    mount();
    fireEvent.click(await screen.findByText("Ana"));
    tapPin("9999");
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 423, { "Retry-After": "900" }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Espera 15:00/));
    expect((screen.getByRole("button", { name: "5" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("5 fallos seguidos bloquean aunque el servicio no lo avise", async () => {
    pair();
    fetchMock.mockResolvedValueOnce(jsonResponse({ users }));
    mount();
    fireEvent.click(await screen.findByText("Ana"));
    for (let i = 0; i < 5; i++) {
      tapPin("1111");
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    }
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Demasiados intentos/));
  });

  it("Cambiar usuario vuelve al selector", async () => {
    pair();
    fetchMock.mockImplementation(async () => jsonResponse({ users }));
    mount();
    fireEvent.click(await screen.findByText("Luis"));
    fireEvent.click(screen.getByRole("button", { name: /Cambiar usuario/ }));
    expect(await screen.findByText("Ana")).toBeTruthy();
  });
});

describe("logica del PIN", () => {
  it("solo digitos, maximo 8, minimo 4", () => {
    expect(appendDigit("123", "4")).toBe("1234");
    expect(appendDigit("1234", "x")).toBe("1234");
    expect(appendDigit("12345678", "9")).toBe("12345678");
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });
  it("cuenta regresiva", () => {
    expect(formatCountdown(900)).toBe("15:00");
    expect(formatCountdown(61.2)).toBe("1:02");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});
