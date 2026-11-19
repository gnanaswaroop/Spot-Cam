/**
 * The installed app with no connection: every page opens, moving between them inside the app works, and the photos
 * and videos kept on the device are still there in the gallery. (Same rules as pwa.spec.ts: the service worker is on.)
 */
import { Page } from '@playwright/test';
import { test, expect, GEOCODER_HOSTS } from './fixtures';
import { SITE, grantLocation, installMocks, skipIfNoCameraFrames } from './helpers';

test.use({ serviceWorkers: 'allow' });

// Route mocks do not apply to a page a service worker controls in Firefox and WebKit, so these tests never let a page
// ask for an address while it is online, and this guard proves it (see pwa.spec.ts).
test.beforeEach(({ page }) => {
  const seen: string[] = [];
  page.on('request', req => {
    if (GEOCODER_HOSTS.test(req.url())) seen.push(req.url());
  });
  (page as unknown as { __geocoderSeen: string[] }).__geocoderSeen = seen;
});
test.afterEach(({ page, browserName }) => {
  if (browserName === 'chromium') return;
  expect((page as unknown as { __geocoderSeen: string[] }).__geocoderSeen).toEqual([]);
});

const FIREFOX_OFFLINE = "Playwright's offline mode in Firefox refuses the navigation before the service worker can answer it";

/** Loads the landing page and waits until the service worker controls the page: the app is "installed". */
async function install(page: Page) {
  await page.goto(`${SITE}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const photoTile = (page: Page) => page.getByRole('button', { name: /^Open photo taken/ });
const videoTile = (page: Page) => page.getByRole('button', { name: /^Open video taken/ });

async function setUp(page: Page, context: Parameters<typeof grantLocation>[0]) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
  await install(page);
}

/** Opens the camera while offline and takes `count` photos. */
async function takePhotosOffline(page: Page, count: number) {
  await page.goto(`${SITE}/cam/`);
  const capture = page.getByRole('button', { name: 'Capture photo' });
  await expect(capture).toBeEnabled();
  for (let i = 0; i < count; i++) {
    await capture.click();
    await page.waitForTimeout(250);
  }
}

test.describe('installed app, no connection', () => {
  test('the gallery opens from the camera inside the app, shows the photos, and opens one in full', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await skipIfNoCameraFrames(page);
    await setUp(page, context);
    await context.setOffline(true);

    await takePhotosOffline(page, 2);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(page).toHaveURL(/\/gallery\/?$/);
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
    await expect(photoTile(page)).toHaveCount(2);
    await expect(page.getByTestId('gallery-storage-usage')).toContainText('2 photos use');

    await photoTile(page).first().click();
    const viewer = page.getByRole('dialog', { name: 'Photo' });
    await expect(viewer.locator('img[alt^="Photo taken"]')).toHaveAttribute('src', /^data:image\/jpeg/);
    await viewer.getByRole('button', { name: 'Close photo view' }).click();
    await expect(viewer).toHaveCount(0);
  });

  test('reloading the gallery with no connection keeps the photos (they are on the device, not on the network)', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await skipIfNoCameraFrames(page);
    await setUp(page, context);
    await context.setOffline(true);

    await takePhotosOffline(page, 1);
    await page.goto(`${SITE}/gallery/`);
    await expect(photoTile(page)).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
    await expect(photoTile(page)).toHaveCount(1);
    // The address without a trailing slash (a bookmark) too.
    await page.goto(`${SITE}/gallery`);
    await expect(photoTile(page)).toHaveCount(1);
  });

  test('moving around inside the app works offline: camera, gallery, settings, and back', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await skipIfNoCameraFrames(page);
    await setUp(page, context);
    await context.setOffline(true);

    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Longest video')).toBeVisible();
    await page.getByRole('button', { name: 'Back to camera' }).click();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
  });

  test('every page opens, with photos already saved on the device', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await skipIfNoCameraFrames(page);
    await setUp(page, context);
    await context.setOffline(true);
    await takePhotosOffline(page, 1);

    const pages: [string, () => Promise<void>][] = [
      ['/', () => expect(page.getByText('Spot it. Snap it. Stamp it.')).toBeVisible()],
      ['/how-it-works/', () => expect(page.getByRole('heading', { level: 1 })).toBeVisible()],
      ['/privacy/', () => expect(page.getByText('Last updated:')).toBeVisible()],
      ['/settings/', () => expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()],
      ['/gallery/', () => expect(photoTile(page)).toHaveCount(1)],
      ['/cam/', () => expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible()],
    ];
    for (const [path, check] of pages) {
      await page.goto(`${SITE}${path}`);
      await check();
    }
  });

  test('photos kept by the previous version are readable in the gallery with no connection', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await install(page);
    // Online, open the gallery once (it creates the storage), then leave photos the way the previous version saved them.
    await page.goto(`${SITE}/gallery/`);
    await expect(page.getByText('No photos yet.')).toBeVisible();
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.evaluate(async png => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('keyval-store');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const store = db.transaction('keyval', 'readwrite').objectStore('keyval');
      const now = Date.now();
      store.put(['old-1', 'old-2'], 'spotcam-photo-ids');
      ['old-1', 'old-2'].forEach((id, i) => store.put({ id, dataUrl: png, timestamp: now - i * 1000, location: null }, `spotcam-photo:${id}`));
      await new Promise(done => (store.transaction.oncomplete = done));
    }, png);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
    await expect(photoTile(page)).toHaveCount(2);
    await photoTile(page).first().click();
    await expect(page.getByRole('dialog', { name: 'Photo' }).locator('img[alt^="Photo taken"]')).toHaveAttribute('src', /^data:image\/png/);
  });

  test('a video recorded offline is in the gallery and plays', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await skipIfNoCameraFrames(page);
    const canRecord = await page.evaluate(() => typeof MediaRecorder === 'function');
    test.skip(!canRecord, 'This browser build has no MediaRecorder');
    await setUp(page, context);
    await context.setOffline(true);

    await page.goto(`${SITE}/cam/`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    const record = page.getByRole('button', { name: 'Record video' });
    await expect(record).toBeEnabled();
    await record.click();
    await expect(page.getByTestId('recording-timer')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByRole('button', { name: 'Record video' })).toBeVisible();

    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(videoTile(page)).toHaveCount(1);
    await page.reload();
    await videoTile(page).click();
    await expect(page.getByRole('dialog', { name: 'Video' }).locator('video')).toHaveAttribute('src', /^blob:/);
  });
});

test.describe('installed app: reopening and updates', () => {
  test('closing the app and opening it again with no connection starts on the camera (its start page)', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await skipIfNoCameraFrames(page);
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await page.close(); // the app is closed

    await context.setOffline(true);
    const reopened = await context.newPage();
    await installMocks(reopened, { camera: 'granted', location: 'granted' });
    await reopened.goto(`${SITE}/cam`); // what the home screen icon opens (the manifest's start_url)
    await expect(reopened.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await reopened.getByRole('button', { name: 'Open gallery' }).click();
    await expect(reopened.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
  });

  test('with a new version downloaded but not yet applied, the app still opens with no connection', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium lets a test rewrite the worker script request');
    // The first visit gets an "old" worker; the real script then plays the new release (as in pwa.spec.ts).
    await context.route('**/sw.js', async route => {
      const response = await route.fetch();
      const script = (await response.text()).replace(/const VERSION = '[^']+'/, "const VERSION = 'oldrelease'");
      await route.fulfill({ response, body: script });
    });
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await install(page);
    await context.unroute('**/sw.js');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(reg => reg!.update()));
    await expect(page.getByRole('status').filter({ hasText: 'A new version of SpotCam is available.' })).toBeVisible();

    await context.setOffline(true);
    for (const [path, heading] of [['/gallery/', 'Gallery'], ['/settings/', 'Settings']] as const) {
      await page.goto(`${SITE}${path}`);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }
    await page.goto(`${SITE}/`);
    await expect(page.getByText('Spot it. Snap it. Stamp it.')).toBeVisible();
  });

  test('every file the pages need is in the cache: no page asks the network for a script or style while offline', async ({ page, context, browserName }) => {
    test.skip(browserName === 'firefox', FIREFOX_OFFLINE);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await install(page);
    await context.setOffline(true);
    const failed: string[] = [];
    page.on('requestfailed', req => {
      const url = new URL(req.url());
      // Only this site's own files matter (the analytics config is optional and is allowed to fail).
      if (url.origin === new URL(page.url()).origin && !url.pathname.endsWith('analytics.config.json')) failed.push(url.pathname);
    });
    for (const path of ['/', '/cam/', '/gallery/', '/settings/', '/privacy/', '/how-it-works/']) {
      await page.goto(`${SITE}${path}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(500);
    }
    expect(failed).toEqual([]);
  });
});

