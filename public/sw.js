/*
 * Mohuddle service worker: shows notifications pushed by the server, even when the app is closed,
 * and opens the right page when one is tapped. It does not cache pages or data.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Mohuddle", body: event.data ? event.data.text() : "" };
  }
  const urgent = data.tone === "bad";
  event.waitUntil(
    self.registration.showNotification(data.title || "Mohuddle", {
      body: data.body || "",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      vibrate: urgent ? [200, 100, 200, 100, 200] : [150, 80, 150],
      requireInteraction: urgent,
      data: { href: data.href || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || "/app", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(href);
          return;
        }
      }
      await self.clients.openWindow(href);
    })(),
  );
});
