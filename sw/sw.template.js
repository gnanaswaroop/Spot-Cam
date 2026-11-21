/**
 * SpotCam service worker. Generated into dist/sw.js at build time (vite.config.ts fills in the
 * placeholders), so it is never served from the dev server.
 *
 * What it does:
 *  - precaches the built app (pages, scripts, styles, icons, sample photo) so the app opens offline;
 *  - pages: network first, falling back to the cached copy when offline or slow, so a deploy shows up
 *    straight away for people who are online;
 *  - scripts, styles and images: cache first (their file names carry a content hash);
 *  - the words of each language are not precached; each is kept the first time it is used, so a language used online also opens offline;
 *  - never touches anything it did not precache: other sites (the address services), version.txt,
 *    sitemap.xml and robots.txt all go straight to the network;
 *  - a new version waits until the person taps "Reload" in the app (SKIP_WAITING), so nobody has the
 *    page swapped under them half way through taking a photo.
 */
const VERSION = '__VERSION__';
const CACHE = `spotcam-${VERSION}`;
const BASE = '__BASE__';
const PRECACHE = __PRECACHE__;
const PRECACHED = new Set(PRECACHE);
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  // Always from the network, never from the browser's own HTTP cache: that copy can be up to 10 minutes old, and a page from
  // the previous release stored next to the scripts of this one would open blank when there is no connection.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('spotcam-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** "/cam" and "/cam/" both mean the cam page. */
function pageKey(pathname) {
  return /\.[a-z0-9]+$/i.test(pathname) || pathname.endsWith('/') ? pathname : `${pathname}/`;
}

async function pageResponse(request) {
  const cache = await caches.open(CACHE);
  const fallback = async () => (await cache.match(pageKey(new URL(request.url).pathname))) || (await cache.match(BASE));
  try {
    const network = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NETWORK_TIMEOUT_MS)),
    ]);
    return network;
  } catch {
    return (await fallback()) || fetch(request);
  }
}

/** A language's words (assets/hi-<hash>.js): kept the first time they are used, then served from the cache (names carry a hash). */
const isLanguageChunk = pathname => pathname.startsWith(`${BASE}assets/`) && /\/[a-z]{2}-[\w-]+\.js$/.test(pathname);

async function languageResponse(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function assetResponse(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request)) || fetch(request);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // other sites (address lookups) are never intercepted

  if (request.mode === 'navigate') {
    if (PRECACHED.has(pageKey(url.pathname))) event.respondWith(pageResponse(request));
    return;
  }
  if (PRECACHED.has(url.pathname)) event.respondWith(assetResponse(request));
  else if (isLanguageChunk(url.pathname)) event.respondWith(languageResponse(request));
});
