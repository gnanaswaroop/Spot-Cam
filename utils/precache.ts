/**
 * @file Build-time helpers for the service worker (see sw/sw.template.js and the `serviceWorker`
 * plugin in vite.config.ts). Pure functions, so they can be unit tested without a build.
 */
import { createHash } from 'node:crypto';

/** Files that must never be cached by the service worker. */
const NEVER_PRECACHE = new Set(['sw.js', 'version.txt', 'sitemap.xml', 'robots.txt', '404.html']);

/** Folders that are not needed to run the app offline (for example install-dialog screenshots). */
const SKIPPED_FOLDERS = ['screenshots/'];

/**
 * Turns the list of built files (paths relative to dist/, with forward slashes) into the URLs the
 * service worker precaches, relative to the site base ("/" or e.g. "/Spot-Cam/").
 *  - `cam/index.html` becomes `/cam/` (that is how the pages are requested), `index.html` becomes `/`;
 *  - the marker and SEO files, the 404 page and the screenshots are left out.
 */
export function listPrecacheUrls(files: string[], base = '/'): string[] {
  const root = base.endsWith('/') ? base : `${base}/`;
  const urls = new Set<string>();
  for (const file of files) {
    if (NEVER_PRECACHE.has(file)) continue;
    if (SKIPPED_FOLDERS.some(folder => file.startsWith(folder))) continue;
    if (file === 'index.html') urls.add(root);
    else if (file.endsWith('/index.html')) urls.add(`${root}${file.slice(0, -'index.html'.length)}`);
    else urls.add(`${root}${file}`);
  }
  return [...urls].sort();
}

/**
 * A short fingerprint of the precached files' contents. It names the cache, so every deploy that
 * changes anything gets a fresh cache, and an unchanged build keeps the same one.
 */
export function cacheVersion(entries: { url: string; content: Uint8Array | string }[]): string {
  const hash = createHash('sha256');
  for (const { url, content } of [...entries].sort((a, b) => a.url.localeCompare(b.url))) {
    hash.update(url).update('\0').update(content).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Fills the placeholders in the service worker template. */
export function renderServiceWorker(template: string, values: { version: string; urls: string[]; base: string }): string {
  const rendered = template
    .replace(/__VERSION__/g, values.version)
    .replace('__PRECACHE__', JSON.stringify(values.urls, null, 2))
    .replace(/__BASE__/g, values.base);
  if (/__[A-Z_]+__/.test(rendered)) throw new Error('The service worker template still has unfilled placeholders.');
  return rendered;
}
