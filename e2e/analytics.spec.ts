/**
 * Optional analytics (see utils/analytics.ts). The real Google hosts are blocked for every test by the
 * shared fixture; these tests register a fake tag script and read what the page would have sent.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, skipIfNoCameraFrames } from './helpers';
import { EVENTS } from '../utils/analytics';

const TEST_ID = 'GTM-TEST1234';

/** Serves a deploy-time config (or none) and a fake Tag Manager container, and counts requests for it. */
async function setUpAnalytics(page: Page, config: object | null) {
  const tagRequests: string[] = [];
  await page.route('**/analytics.config.json', route =>
    config ? route.fulfill({ json: config }) : route.fulfill({ status: 404, body: 'not found' }),
  );
  await page.route(/googletagmanager\.com\/gtm\.js/, route => {
    tagRequests.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: '/* fake container */' });
  });
  return tagRequests;
}

/**
 * The data layer as the calls a gtag-style array would make: consent commands (pushed as `arguments`)
 * stay as they are, and each plain { event, option } push becomes ['event', name, rest]. The
 * container's own 'gtm.js' start entry is left out.
 */
const layerCalls = (page: Page) =>
  page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
    if (!layer) return null;
    return layer.flatMap(entry => {
      if (Object.prototype.toString.call(entry) === '[object Arguments]') return [Array.from(entry as ArrayLike<unknown>)];
      const { event, ...rest } = entry as { event?: string };
      if (event === 'gtm.js') return [];
      return [['event', event, rest]];
    });
  });

const banner = (page: Page) => page.getByRole('region', { name: 'Usage statistics' });

test.describe('with no analytics config (a fork, a local build, plain tests)', () => {
  for (const path of ['/', '/privacy', '/settings']) {
    test(`${path}: no banner, no tag, no request`, async ({ page }) => {
      const tagRequests = await setUpAnalytics(page, null);
      const googleRequests: string[] = [];
      page.on('request', r => /google(tagmanager|-analytics)|analytics\.google/.test(r.url()) && googleRequests.push(r.url()));
      await page.goto(`${SITE}${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);
      await expect(banner(page)).toHaveCount(0);
      expect(tagRequests).toEqual([]);
      expect(googleRequests).toEqual([]);
      expect(await layerCalls(page)).toBeNull();
    });
  }

  test('Settings has no usage statistics section', async ({ page }) => {
    await setUpAnalytics(page, null);
    await page.goto(`${SITE}/settings`);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Usage statistics' })).toHaveCount(0);
  });

  test('an invalid config is ignored', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: 'not-an-id' });
    await page.goto(`${SITE}/`);
    await page.waitForTimeout(500);
    await expect(banner(page)).toHaveCount(0);
    expect(tagRequests).toEqual([]);
  });
});

test.describe('with a config', () => {
  test('asks first and sends nothing before the visitor chooses', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await expect(banner(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(tagRequests).toEqual([]);
    expect(await layerCalls(page)).toBeNull();
  });

  test('Accept loads the container once, with consent denied until Yes, and counts the page', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'Yes, allow' }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect.poll(() => tagRequests.length).toBe(1);
    expect(tagRequests[0]).toContain(`id=${TEST_ID}`);

    const calls = (await layerCalls(page))!;
    // The site sends no GA4 config itself: that lives in the container.
    expect(calls.find(c => c[0] === 'config')).toBeUndefined();
    expect(calls.find(c => c[0] === 'consent' && c[1] === 'default')![2]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied' });
    expect(calls.find(c => c[0] === 'consent' && c[1] === 'update')![2]).toEqual({ analytics_storage: 'granted' });
    const views = calls.filter(c => c[0] === 'event' && c[1] === 'page_view');
    expect(views).toHaveLength(1);
    expect((views[0][2] as { page_path: string }).page_path).toBe('/');
  });

  test('the choice is remembered: Accept starts the tag on the next visit with no banner', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'Yes, allow' }).click();
    await expect.poll(() => tagRequests.length).toBe(1);
    await page.reload();
    await expect.poll(() => tagRequests.length).toBe(2);
    await expect(banner(page)).toHaveCount(0);
  });

  test('Decline never loads the tag, and is remembered', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'SpotCam', level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(banner(page)).toHaveCount(0);
    expect(tagRequests).toEqual([]);
    expect(await layerCalls(page)).toBeNull();
  });

  test('declining is as easy as accepting: both buttons are the same size and style', async ({ page }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await expect(banner(page)).toBeVisible();
    const sizes = await banner(page).getByRole('button').evaluateAll(buttons =>
      buttons.map(b => {
        const r = b.getBoundingClientRect();
        const s = getComputedStyle(b);
        return { w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, color: s.color, weight: s.fontWeight };
      }),
    );
    expect(sizes).toHaveLength(2);
    expect(sizes[0].h).toBeGreaterThanOrEqual(44);
    expect(sizes[0]).toEqual(sizes[1]);
  });

  test('Do Not Track means no banner, no tag and nothing sent', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }));
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('heading', { name: 'SpotCam', level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(banner(page)).toHaveCount(0);
    expect(tagRequests).toEqual([]);
  });

  test('Do Not Track overrides an earlier Accept', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.addInitScript(() => localStorage.setItem('spotcam.analytics', 'granted'));
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }));
    await page.goto(`${SITE}/`);
    await page.waitForTimeout(500);
    expect(tagRequests).toEqual([]);
  });

  test('each route change is one page view, with the path only', async ({ page }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'Yes, allow' }).click();
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(`${SITE}/privacy/`);
    await page.getByRole('link', { name: 'Back to SpotCam' }).click();
    await expect(page).toHaveURL(`${SITE}/`);

    const views = (await layerCalls(page))!.filter(c => c[0] === 'event' && c[1] === 'page_view').map(c => c[2] as { page_path: string; page_location: string });
    expect(views.map(v => v.page_path)).toEqual(['/', '/privacy/', '/']);
    for (const v of views) expect(v.page_location).not.toMatch(/[?#]/);
  });

  test('the privacy page describes the analytics, and Settings can change the choice', async ({ page }) => {
    const tagRequests = await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/privacy`);
    await expect(page.getByRole('heading', { name: 'Visit statistics (Google Analytics)' })).toBeVisible();
    await expect(page.getByText('Never sent:')).toBeVisible();

    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    await page.goto(`${SITE}/settings`);
    const yes = page.getByRole('radio', { name: 'Yes, allow' });
    await expect(yes).not.toBeChecked();
    await yes.check();
    await expect(page.getByRole('status')).toHaveText('Visit counting is on.');
    await expect.poll(() => tagRequests.length).toBe(1);
    await page.getByRole('radio', { name: 'No thanks' }).check();
    await expect(page.getByRole('status')).toHaveText('Visit counting is off.');
    const updates = (await layerCalls(page))!.filter(c => c[0] === 'consent' && c[1] === 'update');
    expect(updates[updates.length - 1][2]).toEqual({ analytics_storage: 'denied' });
  });

  test('after a No in the same visit nothing is sent, and a later Yes counts again', async ({ page }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'Yes, allow' }).click();
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'No thanks' }).check();
    const declinedAt = (await layerCalls(page))!.length;

    await page.goBack();
    await page.getByRole('link', { name: 'Start Cam' }).click();
    await expect(page).toHaveURL(`${SITE}/cam/`);
    expect((await layerCalls(page))!.slice(declinedAt)).toEqual([]);

    await page.goBack();
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Yes, allow' }).check();
    await page.goBack();
    await page.getByRole('link', { name: 'Start Cam' }).click();
    await expect(page).toHaveURL(`${SITE}/cam/`);
    const after = (await layerCalls(page))!.slice(declinedAt);
    expect(after.some(c => c[0] === 'consent' && c[1] === 'update' && (c[2] as { analytics_storage: string }).analytics_storage === 'granted')).toBe(true);
    expect(after.map(c => c[1])).toEqual(expect.arrayContaining(['page_view', 'start_cam']));
  });

  test('events carry no coordinates, address or photo data', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('button', { name: 'Yes, allow' }).click();
    await page.getByRole('link', { name: 'Start Cam' }).click();
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
    await page.getByRole('button', { name: 'Capture photo' }).click();
    await expect(page.getByRole('status')).toHaveText('Photo saved to the gallery');

    const calls = (await layerCalls(page))!;
    const events = calls.filter(c => c[0] === 'event').map(c => c[1]);
    expect(events).toEqual(expect.arrayContaining(['page_view', 'start_cam', 'photo_captured']));
    const everything = JSON.stringify(calls);
    for (const secret of ['48.85', '2.29', 'Champ de Mars', 'Paris', 'data:image', 'dataUrl', 'latitude', 'longitude']) {
      expect(everything, secret).not.toContain(secret);
    }
    // Every event is one of the known names, with at most a coarse option.
    for (const c of calls.filter(c => c[0] === 'event' && c[1] !== 'page_view')) {
      expect(Object.keys(EVENTS)).toContain(c[1]);
      expect(Object.keys((c[2] ?? {}) as object).filter(k => k !== 'option')).toEqual([]);
    }
  });

  test('a blocked camera reports which permission, and nothing else', async ({ page, context }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.addInitScript(() => localStorage.setItem('spotcam.analytics', 'granted'));
    const { installMocks, grantLocation } = await import('./helpers');
    await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
    await grantLocation(context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Camera access is blocked')).toBeVisible();
    await expect.poll(async () => (await layerCalls(page))?.some(c => c[1] === 'permission_blocked')).toBe(true);
    const blocked = (await layerCalls(page))!.find(c => c[1] === 'permission_blocked')!;
    expect(blocked[2]).toEqual({ option: 'camera' });
  });

  test('the banner does not break the landing page on a small phone: both buttons and Start Cam are reachable', async ({ page }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${SITE}/`);
    await expect(banner(page)).toBeVisible();
    for (const button of ['No thanks', 'Yes, allow']) {
      await expect(banner(page).getByRole('button', { name: button })).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    await expect(page.getByRole('link', { name: 'Start Cam' })).toBeInViewport();
  });

  test('the banner sits above the page and pushes it down: it never covers the heading or the bottom links', async ({ page }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    for (const size of [{ width: 360, height: 640 }, { width: 412, height: 915 }]) {
      await page.setViewportSize(size);
      await page.goto(`${SITE}/`);
      await expect(banner(page)).toBeVisible();
      const bannerBottom = await banner(page).evaluate(el => el.getBoundingClientRect().bottom);
      const headingTop = await page.getByRole('heading', { name: 'SpotCam', level: 1 }).evaluate(el => el.getBoundingClientRect().top);
      expect(headingTop).toBeGreaterThanOrEqual(bannerBottom);
      await expect(page.getByRole('link', { name: 'Start Cam' })).toBeVisible();
    }
    await banner(page).getByRole('button', { name: 'No thanks' }).click();
    // With the banner gone the page gets all of its height back.
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--banner-height'))).toBe('');
  });

  test('Details opens the privacy page without the banner covering its heading, and the banner is back on the landing page', async ({ page }) => {
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${SITE}/`);
    await banner(page).getByRole('link', { name: 'Details' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await page.goto(`${SITE}/how-it-works`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await page.goto(`${SITE}/`);
    await expect(banner(page)).toBeVisible(); // no choice was made, so it asks again here
  });

  test('the banner has no serious accessibility violations', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    await setUpAnalytics(page, { provider: 'gtm', id: TEST_ID });
    await page.goto(`${SITE}/`);
    await expect(banner(page)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
});
