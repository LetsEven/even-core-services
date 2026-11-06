import { Clerk } from "@clerk/clerk-js/headless";
import { isTauri } from "./platform";

// Sesión de Clerk por header en vez de cookies (la webview de Tauri bloquea la cookie de clerk.letseven.io)
const CLIENT_JWT_KEY = "__clerk_client_jwt";

const readJwt = () => {
  try {
    return localStorage.getItem(CLIENT_JWT_KEY);
  } catch {
    return null;
  }
};

const saveJwt = (jwt: string) => {
  try {
    localStorage.setItem(CLIENT_JWT_KEY, jwt);
  } catch {
    /* sin storage: la sesión dura lo que dure la app abierta */
  }
};

// En un navegador normal el Origin lo manda el browser y Clerk rechaza (400) las
// peticiones que además traen Authorization: ahí se usa la sesión estándar (cookies).
export const createNativeClerk = (publishableKey: string) => {
  const clerk = new Clerk(publishableKey);
  if (!isTauri()) return clerk;

  clerk.__unstable__onBeforeRequest(async (request) => {
    request.credentials = "omit";
    request.url?.searchParams.append("_is_native", "1");
    (request.headers as Headers).set("authorization", readJwt() || "");
  });

  clerk.__unstable__onAfterResponse(async (_, response) => {
    const authHeader = response?.headers.get("authorization");
    if (authHeader) saveJwt(authHeader);
  });

  return clerk;
};
