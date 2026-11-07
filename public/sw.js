const VERSION = "sg-chargers-4";
const SHELL = ["", "styles.css", "app.js", "format.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"].map(
  (path) => new URL(path || "./", self.registration.scope).href,
);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    if (!response.ok) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        source: "unavailable",
        fetchedAt: null,
        ltaUpdatedAt: null,
        sites: [],
        connectorCount: 0,
        warning: "The LTA feed did not load.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
}


