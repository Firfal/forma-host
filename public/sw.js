/* Service worker : affiche les notifications push (Firebase Cloud Messaging) et ouvre le lien au clic.
   Les messages sont de type « data » : { title, body, link, tag } (voir shared/push.ts). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  try {
    const payload = event.data ? event.data.json() : {};
    return payload.data || payload.notification || {};
  } catch {
    return {};
  }
}

/** Seuls les chemins internes sont ouverts (même règle que safeLink côté serveur). */
function internalUrl(link) {
  const path = typeof link === "string" && /^\/(?![/\\])/.test(link) ? link : "/";
  return new URL(path, self.location.origin).href;
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const title = data.title || "Nouvelle notification";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: internalUrl(data.link) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || internalUrl("/");
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Un onglet de l'app déjà ouvert : on le réutilise.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
