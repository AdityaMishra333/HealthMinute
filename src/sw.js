/// <reference lib="webworker" />

// HealthMinute service worker.
//
// Built by vite-plugin-pwa with `strategies: 'injectManifest'`, so the plugin
// replaces self.__WB_MANIFEST with the build output and leaves the routing
// below alone. Nothing from Firestore, Firebase Auth/Storage, Gemini or Google
// Maps is ever cached or even observed here — see shouldBypass().

const MANIFEST = self.__WB_MANIFEST || [];

// Derived from the precache manifest, so the cache names change on any build
// whose output changed, and stay identical on a rebuild that did not.
const BUILD_ID = (() => {
  let hash = 5381;
  for (const entry of MANIFEST) {
    const key = `${entry.url}|${entry.revision ?? ''}`;
    for (let i = 0; i < key.length; i += 1) {
      hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
    }
  }
  return hash.toString(36);
})();

const CACHE_PREFIX = 'healthminute';
const PRECACHE = `${CACHE_PREFIX}-precache-${BUILD_ID}`;
const STATIC_CACHE = `${CACHE_PREFIX}-static-${BUILD_ID}`;
const CURRENT_CACHES = [PRECACHE, STATIC_CACHE];

const OFFLINE_URL = '/offline.html';

// What a failed navigation falls back to. Point this at '/index.html' instead
// if you ever want the React shell to boot offline — today every screen needs
// Firestore, so the offline page is the honest answer.
const NAVIGATION_FALLBACK = OFFLINE_URL;

// Never handled by the service worker. `/__/` is Firebase Hosting's reserved
// namespace (auth redirect handler, SDK shims) and must always be live.
const BYPASS_PATHS = [/^\/api\//, /^\/socket\.io\//, /^\/__\//];

// Cache-first destinations. Vite fingerprints these filenames, so a cached hit
// is always the right answer for that build.
const STATIC_DESTINATIONS = new Set([
  'script',
  'style',
  'font',
  'image',
  'manifest',
]);

// Deduplicated against the resolved URL: cache.addAll() rejects outright if
// two entries resolve to the same address, and manifest URLs are relative.
const PRECACHE_URLS = [
  ...new Set(
    [...MANIFEST.map((entry) => entry.url), OFFLINE_URL].map(
      (url) => new URL(url, self.location.href).href,
    ),
  ),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // `reload` keeps the HTTP cache from handing us a stale app shell.
      await cache.addAll(
        PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }

      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith(`${CACHE_PREFIX}-`) &&
              !CURRENT_CACHES.includes(name),
          )
          .map((name) => caches.delete(name)),
      );

      await self.clients.claim();
    })(),
  );
});

// The page asks for the update; we never skip waiting on our own, or an open
// tab could swap its JS out from under a report in progress.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function shouldBypass(request) {
  // Anything that mutates state, and every auth/upload round trip.
  if (request.method !== 'GET') return true;

  // WebSocket and EventSource handshakes.
  if (request.mode === 'websocket') return true;
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return true;
  }
  if (request.destination === 'ws') return true;
  if (request.headers.get('accept')?.includes('text/event-stream')) return true;

  // Explicitly opted out of caching by the caller.
  if (request.cache === 'no-store') return true;

  // Range requests: a partial response is not a cacheable whole.
  if (request.headers.has('range')) return true;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return true;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  // Everything third-party: Firestore listeners (long-polling and WebChannel),
  // Firebase Auth token refresh, Firebase Storage, Gemini, the Google Maps JS
  // SDK and its tiles. All of it is realtime, authenticated or self-versioning.
  if (url.origin !== self.location.origin) return true;

  return BYPASS_PATHS.some((pattern) => pattern.test(url.pathname));
}

async function fromPrecache(request) {
  const cache = await caches.open(PRECACHE);
  return cache.match(request, { ignoreSearch: true });
}

async function networkFirst(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const cache = await caches.open(PRECACHE);
    const fallback = await cache.match(NAVIGATION_FALLBACK);
    if (fallback) return fallback;

    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function cacheFirst(request) {
  const precached = await fromPrecache(request);
  if (precached) return precached;

  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Opaque responses are cross-origin and already bypassed; this guards
  // against caching a 404 page as if it were the asset.
  if (response.ok && response.type === 'basic') {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (shouldBypass(request)) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(event));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Anything else same-origin (fetch/XHR without a static destination) goes
  // straight to the network, uncached.
});
