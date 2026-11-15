import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { saveFcmToken, deleteFcmToken } from "../services/api";
import { isTauri } from "./platform";

// Config pública de la app web "Even Crew Web" (proyecto Firebase even-crew)
const firebaseConfig = {
  apiKey: "AIzaSyB1-3T63a0jEZrcJZkfpwr4IsgOnQRaOmo",
  authDomain: "even-crew.firebaseapp.com",
  projectId: "even-crew",
  storageBucket: "even-crew.firebasestorage.app",
  messagingSenderId: "605872536685",
  appId: "1:605872536685:web:232135dfe92a392ecbd364",
};
const VAPID_KEY =
  "BHpj6smYHxyDAvf-y-_Uklq7ybil-aM7MoQ1C9ben5vBvvEiM7uWH5EqttjQxcdP1P6sVE99t-DauAJ9pA27kj0";
const TOKEN_KEY = "crew_web_push_token";

export type WebPushStatus =
  | "unsupported" // navegador sin push (en iOS: Safari sin instalar la PWA)
  | "denied"
  | "default"
  | "granted";

export async function getWebPushStatus(): Promise<WebPushStatus> {
  // El SW solo se registra en build de producción (ver main.tsx)
  if (
    isTauri() ||
    !import.meta.env.PROD ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  )
    return "unsupported";
  try {
    if (!(await isSupported())) return "unsupported";
  } catch {
    return "unsupported";
  }
  return Notification.permission as WebPushStatus;
}

async function fetchToken(): Promise<string | null> {
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(initializeApp(firebaseConfig));
  return (
    (await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })) || null
  );
}

async function register(authToken: string): Promise<void> {
  const fcmToken = await fetchToken();
  if (!fcmToken) return;
  const previous = localStorage.getItem(TOKEN_KEY);
  await saveFcmToken(authToken, fcmToken, "web");
  if (previous && previous !== fcmToken) {
    await deleteFcmToken(authToken, previous).catch(() => {});
  }
  localStorage.setItem(TOKEN_KEY, fcmToken);
}

// Debe llamarse desde un toque: iOS ignora requestPermission fuera de un gesto
export async function enableWebPush(authToken: string): Promise<WebPushStatus> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await register(authToken);
  return permission as WebPushStatus;
}

// Al abrir la app con permiso ya dado: refresca el token por si FCM lo rotó
export async function syncWebPushToken(authToken: string): Promise<void> {
  if ((await getWebPushStatus()) !== "granted") return;
  try {
    await register(authToken);
  } catch (err) {
    console.warn("[PUSH] No se pudo sincronizar el token web:", err);
  }
}

export async function removeWebPushToken(authToken: string): Promise<void> {
  const fcmToken = localStorage.getItem(TOKEN_KEY);
  if (!fcmToken) return;
  await deleteFcmToken(authToken, fcmToken).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
}
