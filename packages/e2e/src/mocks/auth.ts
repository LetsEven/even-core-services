import type { Page } from "@playwright/test";
import { E2E_API_URL } from "../config";
import type { MockResponse } from "./payments";

export interface AuthApiOptions {
  apiUrl?: string;
  /** Perfil que devuelve el backend al iniciar sesión; `null` = cuenta nueva sin perfil (la app pide nombre y edad). */
  profile?: { firstName: string; lastName?: string; birthDate: string } | null;
  /** Endpoints propios de la app que se disparan al terminar el acceso (p. ej. unirse a la mesa): `[método, ruta, respuesta]`. */
  extra?: Array<[string, RegExp, MockResponse]>;
}

/**
 * Mock del inicio de sesión por SMS que comparten las apps de comensal: enviar y verificar el código, perfil y
 * registro de invitado. Se llama DESPUÉS del mock principal de la app: tiene prioridad y lo que no sea de auth
 * sigue a los demás mocks (y al guard de red).
 */
export async function mockAuthApi(page: Page, { apiUrl = E2E_API_URL, profile = null, extra = [] }: AuthApiOptions = {}) {
  const apiPath = new URL(apiUrl).pathname.replace(/\/$/, "");
  const session = { access_token: "tok_e2e", refresh_token: "ref_e2e", expires_at: 4_102_444_800 };
  const user = { id: "user_e2e", phone: "+525500000000", accountType: "customer" };
  const created = { profile: { firstName: "Ana", lastName: "", birthDate: "1996-01-01" } };
  const ok: MockResponse = { success: true, data: {} };

  const responses: Array<[string, RegExp, MockResponse]> = [
    ["POST", /^\/auth\/customer\/send-otp$/, ok],
    ["POST", /^\/auth\/customer\/verify-otp$/, { success: true, data: { user, session, profile } }],
    ["GET", /^\/profiles\/me$/, { success: true, data: { profile } }],
    ["POST", /^\/profiles$/, { success: true, data: created }],
    ["POST", /^\/guests$/, ok],
    // Al iniciar sesión se pasan las tarjetas y los pedidos del invitado a la cuenta.
    ["POST", /^\/payment-methods\/migrate-from-guest$/, ok],
    ["PUT", /^\/orders\/link-user$/, ok],
    ...extra,
  ];

  await page.route(`${apiUrl}/**`, (route, request) => {
    const path = new URL(request.url()).pathname.slice(apiPath.length) || "/";
    const match = responses.find(([method, re]) => method === request.method() && re.test(path));
    if (!match) return route.fallback();
    const response = match[2];
    const { status, body } =
      typeof response.status === "number" && typeof response.body === "object"
        ? (response as { status: number; body: Record<string, unknown> })
        : { status: 200, body: response as Record<string, unknown> };
    return route.fulfill({ status, json: body });
  });
}
