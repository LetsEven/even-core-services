// SW de la PWA. Sin caché a propósito: crew necesita red y así cada deploy llega al instante.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Push de FCM: iOS exige mostrar una notificación por cada push o revoca el permiso
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    /* payload no JSON */
  }
  const n = payload.notification || {};
  event.waitUntil(
    self.registration
      .showNotification(n.title || "Even Crew", {
        body: n.body || "Ha llegado una nueva orden",
        icon: "/pwa/icon-192.png",
        badge: "/pwa/icon-192.png",
        data: { url: "/" },
      })
      .then(updateBadge),
  );
});

// Contador del ícono = notificaciones sin abrir (el SW no guarda estado entre pushes)
async function updateBadge() {
  try {
    const pending = await self.registration.getNotifications();
    if ("setAppBadge" in self.navigator) await self.navigator.setAppBadge(pending.length);
  } catch {
    /* Badging API no soportada */
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((w) => "focus" in w);
        return open ? open.focus() : self.clients.openWindow("/");
      }),
  );
});
