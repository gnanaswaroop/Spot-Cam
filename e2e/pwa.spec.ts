/**
 * Progressive web app behaviour: the service worker precaches the app so it opens offline, never
 * caches what it should not, offers new versions without forcing them, and the install prompt works.
 * Every other spec blocks the service worker (playwright.config.ts) so it cannot hide their mocks;
 * this one turns it on. All address services are mocked.
 */
import { Page } from '@playwright/test';
import { test, expect, GEOCODER_HOSTS } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder, skipIfNoCameraFrames } from './helpers';

test.use({ serviceWorkers: 'allow' });

// Playwright's WebKit and Firefox builds do not intercept requests made by a page that a service worker
// controls, so route mocks (and the block on the real address services) would not apply there. This
// spec therefore never opens a page that asks for an address in those engines, and this guard proves it.
test.beforeEach(({ page, browserName }) => {
  const seen: string[] = [];
  page.on('request', req => {
    if (GEOCODER_HOSTS.test(req.url())) seen.push(req.url());
  });
  test.info().annotations.push({ type: 'geocoder-requests', description: browserName });
  (page as unknown as { __geocoderSeen: string[] }).__geocoderSeen = seen;
});
test.afterEach(({ page, browserName }) => {
  if (browserName === 'chromium') return; // there the routes do apply, and the address test mocks the services
  expect((page as unknown as { __geocoderSeen: string[] }).__geocoderSeen).toEqual([]);
});

/** Loads the landing page and waits until the service worker has installed and controls the page. */
async function loadWithWorker(page: Page) {
  await page.goto(`${SITE}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Cache names; while the page is reloading (the evaluate is cut off) this reports "none yet". */
const cacheNames = (page: Page) => page.evaluate(() => caches.keys()).catch((): string[] => []);
const cachedPaths = (page: Page) =>
  page.evaluate(async () => {
    const [name] = await caches.keys();
    const keys = await (await caches.open(name)).keys();
    return keys.map(request => new URL(request.url).pathname);
  });

test.describe('service worker: what it caches', () => {
  test('precaches the pages and app files, and nothing else', async ({ page }) => {
    await loadWithWorker(page);
    const names = await cacheNames(page);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^spotcam-[0-9a-f]{12}$/);

    const paths = await cachedPaths(page);
    for (const expected of ['/', '/cam/', '/gallery/', '/privacy/', '/settings/', '/manifest.webmanifest', '/favicon.svg', '/sample.jpg']) {
      expect(paths, expected).toContain(expected);
    }
    expect(paths.some(p => p.startsWith('/assets/') && p.endsWith('.js'))).toBe(true);
    expect(paths.some(p => p.startsWith('/assets/') && p.endsWith('.css'))).toBe(true);
    // Left out on purpose: the release marker, the search-engine files and the install screenshots.
    for (const excluded of ['/version.txt', '/sitemap.xml', '/robots.txt', '/404.html', '/sw.js']) {
      expect(paths, excluded).not.toContain(excluded);
    }
    expect(paths.some(p => p.startsWith('/screenshots/'))).toBe(false);
  });

  test('address lookups are never intercepted or cached: they still reach the network', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Route mocks do not apply to a page a service worker controls in this engine (see the note at the top)');
    const asked: string[] = [];
    page.on('request', req => {
      if (req.url().includes('photon.komoot.io')) asked.push(req.url());
    });
    await mockGeocoder(page);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await loadWithWorker(page);
    await page.goto(`${SITE}/cam/`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
    expect(asked.length).toBeGreaterThanOrEqual(1);
    const cachedHosts = await page.evaluate(async () => {
      const [name] = await caches.keys();
      return (await (await caches.open(name)).keys()).map(request => new URL(request.url).host);
    });
    expect(new Set(cachedHosts)).toEqual(new Set([new URL(page.url()).host]));
  });
});

test.describe('service worker: offline', () => {
  test('every page opens with no connection', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', "Playwright's offline mode in Firefox refuses the navigation before the service worker can answer it");
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await loadWithWorker(page);
    await context.setOffline(true);

    await page.goto(`${SITE}/`);
    await expect(page.getByText('Spot it. Snap it. Stamp it.')).toBeVisible();
    await page.goto(`${SITE}/privacy/`);
    await expect(page.getByText('Last updated:')).toBeVisible();
    await page.goto(`${SITE}/gallery/`);
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
    await page.goto(`${SITE}/settings/`);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    // The address without a trailing slash (a bookmark, or the installed app's start page) works too.
    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
  });

  test('a photo can still be taken and saved offline, with the coordinates but no address', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', "Playwright's offline mode in Firefox refuses the navigation before the service worker can answer it");
    await skipIfNoCameraFrames(page);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await loadWithWorker(page);
    await context.setOffline(true);

    await page.goto(`${SITE}/cam/`);
    await expect(page.getByText(/^Lat: 48\.85/)).toBeVisible();
    await expect(page.getByText('Offline: the address will appear when you are back online')).toBeVisible();
    const capture = page.getByRole('button', { name: 'Capture photo' });
    await expect(capture).toBeEnabled();
    await capture.click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Open gallery' }).click();
    // (A thumbnail is an image on this branch and a button once the accessibility work lands: accept either.)
    await expect(page.locator('img[alt^="Captured at"], button[aria-label^="Open photo taken"]')).toHaveCount(1);
  });

  test('the release marker and search-engine files are never served from the cache', async ({ page, context }) => {
    await loadWithWorker(page);
    await context.setOffline(true);
    for (const file of ['/version.txt', '/sitemap.xml', '/robots.txt']) {
      const outcome = await page.evaluate(path => fetch(path).then(() => 'served', () => 'network error'), file);
      expect(outcome, file).toBe('network error');
    }
  });
});

test.describe('service worker: updates', () => {
  test('a new version waits for the user: Reload swaps it in and removes the old cache', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium lets a test rewrite the worker script request');
    // The first visit gets an "old" worker (a rewritten version name); the real script then plays the new release.
    await context.route('**/sw.js', async route => {
      const response = await route.fetch();
      const script = (await response.text()).replace(/const VERSION = '[^']+'/, "const VERSION = 'oldrelease'");
      await route.fulfill({ response, body: script });
    });
    await loadWithWorker(page);
    expect(await cacheNames(page)).toEqual(['spotcam-oldrelease']);
    await context.unroute('**/sw.js');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(reg => reg!.update()));

    // The notice appears and the new files are downloaded, but the old version stays in charge until the user agrees.
    const notice = page.getByRole('status').filter({ hasText: 'A new version of SpotCam is available.' });
    await expect(notice).toBeVisible();
    await expect.poll(() => cacheNames(page)).toHaveLength(2);
    expect(await cacheNames(page)).toContain('spotcam-oldrelease');

    await page.getByRole('button', { name: 'Reload' }).click();
    await expect.poll(async () => (await cacheNames(page)).length).toBe(1); // the old cache is deleted
    const [current] = await cacheNames(page);
    expect(current).toMatch(/^spotcam-[0-9a-f]{12}$/);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(notice).toHaveCount(0);
  });

  test('no notice is shown when nothing has changed', async ({ page }) => {
    await loadWithWorker(page);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(reg => reg!.update()));
    await page.waitForTimeout(500);
    await expect(page.getByText('A new version of SpotCam is available.')).toHaveCount(0);
  });
});

test.describe('install', () => {
  test('Chrome-style install prompt: the button appears, asks once, then goes away', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0);

    await page.evaluate(() => {
      const w = window as unknown as { __promptCalls: number };
      w.__promptCalls = 0;
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          w.__promptCalls++;
        },
        userChoice: Promise.resolve({ outcome: 'accepted' as const }),
      });
      window.dispatchEvent(event);
    });
    const install = page.getByRole('button', { name: 'Install app' }).locator('visible=true');
    await expect(install).toHaveCount(1);
    await install.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __promptCalls: number }).__promptCalls)).toBe(1);
    await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0);
  });

  test('iPhone Safari: shows the Share, Add to Home Screen steps instead of a button', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      });
    });
    await page.goto(`${SITE}/`);
    // The page holds two copies of the start area (phone and desktop layouts); one is hidden by CSS.
    await expect(page.getByText('To install: tap Share, then Add to Home Screen.').locator('visible=true')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0);
  });

  test('on Android or desktop the iPhone steps are not shown', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'The WebKit project emulates an iPhone');
    await page.goto(`${SITE}/`);
    await expect(page.getByText('To install: tap Share')).toHaveCount(0);
  });
});

test.describe('web app manifest', () => {
  test('describes an installable app with any and maskable icons, and screenshots that exist', async ({ request }) => {
    const manifest = await (await request.get(`${SITE}/manifest.webmanifest`)).json();
    expect(manifest).toMatchObject({ id: './', name: 'SpotCam', short_name: 'SpotCam', display: 'standalone', start_url: './cam', scope: '.' });
    expect(manifest.categories).toEqual(expect.arrayContaining(['photo']));

    const icons = manifest.icons as { src: string; sizes: string; purpose?: string }[];
    expect(icons.find(i => i.sizes === '192x192' && i.purpose === 'any')).toBeTruthy();
    expect(icons.find(i => i.sizes === '512x512' && i.purpose === 'any')).toBeTruthy();
    expect(icons.find(i => i.sizes === '512x512' && i.purpose === 'maskable')).toBeTruthy();

    const files = [...icons.map(i => i.src), ...(manifest.screenshots as { src: string }[]).map(s => s.src)];
    expect(manifest.screenshots.length).toBeGreaterThanOrEqual(2);
    for (const src of files) {
      const res = await request.get(`${SITE}/${src}`);
      expect(res.status(), src).toBe(200);
      expect((await res.body()).length, src).toBeGreaterThan(1000);
    }
  });
});
