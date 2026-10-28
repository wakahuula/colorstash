// Color Stash service worker: cache-first, fully offline-capable.
//
// Deploy checklist: bump CACHE_NAME whenever any precached file changes, or
// returning visitors keep running the previous build from cache.
const CACHE_NAME = "colorstash-v13";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/css/styles.css",
  "./src/js/color.js",
  "./src/js/main.js",
  "./src/js/export-pack.js",
  "./src/js/image-palette.js",
  "./src/js/hexle.js",
  "./src/assets/fonts/jetbrains-mono-latin.woff2",
  "./src/assets/icons/apple-touch-icon.png",
  "./src/assets/icons/icon-192.png",
  "./src/assets/icons/icon-512.png",
];

// cache.addAll is all-or-nothing: one 404 anywhere and the install fails, which
// costs the app offline support entirely. Cache each entry on its own instead
// and log the ones that missed, so a renamed asset degrades one entry rather
// than the whole feature.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((error) => {
            console.warn("[sw] precache miss:", url, error);
          })
        )
      )
    )
  );
  // No skipWaiting(). With cache-first assets and network-first navigation,
  // taking over mid-session mixes old HTML with new scripts, a blank screen
  // the moment the markup and the JS disagree. The new worker waits until every
  // tab is closed, which is the only point where a swap is safe.
});

// Share target: the browser POSTs the shared image to a URL that does not exist.
// The service worker intercepts that POST, parks the file in a cache and bounces
// the user back to the app, which picks it up on load. There is no server involved.
const SHARE_CACHE = "colorstash-share";
const SHARE_IMAGE_KEY = "/__shared-image";

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      // SHARE_CACHE is app data, not a build artifact: dropping it here would
      // lose an image shared while a new worker was activating.
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE)
          .map((key) => caches.delete(key))
      ))
  );
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("media");
    if (file && typeof file.arrayBuffer === "function") {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(SHARE_IMAGE_KEY, new Response(file, {
        headers: { "Content-Type": file.type || "image/png" },
      }));
    }
  } catch {
    // Nothing usable shared; fall through to the app anyway.
  }
  return Response.redirect("./", 303);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Must run before the GET guard: this is the one request we handle that is not a GET.
  if (request.method === "POST" && new URL(request.url).pathname.endsWith("__share-target")) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  // Only handle same-origin GET requests; let everything else hit the network.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navigations: network-first so a deploy is picked up, cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the shell only on success. A 404 or an error page must not
          // replace the offline fallback.
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)));
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./")))
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
          // waitUntil, or the worker can be torn down before the write lands.
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});