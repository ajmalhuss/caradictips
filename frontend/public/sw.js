/* Cardiac Care Tips — service worker.
 *
 * Goal: the tip library keeps working with no connection, which is the whole point
 * of installing this app (a patient reading guidance shouldn't need signal).
 *
 * Strategy per resource class:
 *   - Hashed build output (/assets/*)   -> cache-first. Content-hashed by Vite, so a
 *                                          cached copy can never be stale.
 *   - Read-only API (tips, categories,  -> stale-while-revalidate. Shows the last known
 *     today, config)                       good answer instantly, refreshes behind it.
 *   - Favourites (GET)                  -> network-first, cache fallback.
 *   - Favourites (POST/DELETE)          -> never cached. A queued write would look like
 *                                          it succeeded when it hadn't; offline toggles
 *                                          simply fail and the UI rolls back.
 *   - Navigations                       -> network-first, fall back to the cached shell.
 *   - /health                           -> untouched (must always hit the network).
 */

const VERSION = "v1";
const SHELL_CACHE = `cct-shell-${VERSION}`;
const ASSET_CACHE = `cct-assets-${VERSION}`;
const API_CACHE = `cct-api-${VERSION}`;

const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest"];

// Read-only API paths that are safe to serve from cache when offline.
const CACHEABLE_API = /^\/api\/(tips|categories|today|config)(\?|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll rejects the whole install if any single URL fails; add individually
      // so one bad entry cannot block the worker from activating.
      await Promise.all(
        SHELL_URLS.map((u) => cache.add(u).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("cct-") && !keep.has(n))
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;          // never intercept writes

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // third-party: leave alone

  // Health probes must always be live.
  if (url.pathname === "/health") return;

  // Navigations: fresh HTML when online, cached shell when not.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put("/index.html", fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match("/index.html")) ||
            (await cache.match("/")) ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }
      })()
    );
    return;
  }

  // Read-only API: stale-while-revalidate.
  if (CACHEABLE_API.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        // Cache first for an instant answer, network result for the next load.
        return cached || (await network) || offlineJson();
      })()
    );
    return;
  }

  // Favourites read: prefer live (so a toggle is reflected), fall back to cache.
  if (url.pathname === "/api/favourites") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(API_CACHE);
          return (await cache.match(req)) || offlineJson();
        }
      })()
    );
    return;
  }

  // Hashed build output: cache-first.
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|woff2?|css|js)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return cached || new Response("", { status: 504 });
        }
      })()
    );
  }
});

function offlineJson() {
  return new Response(
    JSON.stringify({ tips: [], total: 0, note: "You're offline — showing saved content only." }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// Let the page ask the worker to drop its API cache (used by the Update flow).
self.addEventListener("message", (event) => {
  if (event.data === "clear-api-cache") {
    event.waitUntil(caches.delete(API_CACHE));
  }
});