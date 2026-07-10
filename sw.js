// Color Stash service worker — cache-first, fully offline-capable.
// IMPORTANT: bump CACHE_NAME on every deploy so clients pick up new assets.
const CACHE_NAME = "colorstash-v4";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/css/styles.css",
  "./src/js/main.js",
  "./src/js/export-pack.js",
  "./src/js/image-palette.js",
  "./src/js/hexle.js",
  "./src/assets/fonts/jetbrains-mono-latin.woff2",
  "./src/assets/icons/icon-192.png",
  "./src/assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests; let everything else hit the network.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigations: serve the cached shell so the app opens offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./")))
    );
    return;
  }

  // Static assets: cache-first, fall back to network and cache the result.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
