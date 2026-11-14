/**
 * Post-deploy smoke tests: is the deployed site actually working for a visitor?
 * Catches the failures that would hurt most: a blank page, a JavaScript error on load, a missing
 * script or stylesheet, a broken route, or an old build still being served.
 */
import { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { grantLocation, installMocks, mockGeocoder } from '../helpers';

/** Fails the test on any uncaught page error or failed first-party request. */
function watchForProblems(page: Page, origin: string) {
  const problems: string[] = [];
  page.on('pageerror', err => problems.push(`page error: ${err.message}`));
  page.on('requestfailed', req => {
    if (req.url().startsWith(origin)) problems.push(`request failed: ${req.url()}`);
  });
  page.on('response', res => {
    if (res.url().startsWith(origin) && res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
      problems.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });
  return problems;
}

test.describe('deployed site', () => {
  test('serves the commit that was just deployed', async ({ request }) => {
    test.skip(!process.env.EXPECTED_SHA, 'EXPECTED_SHA not set');
    const res = await request.get(`/version.txt?cb=${Date.now()}`);
    expect(res.status()).toBe(200);
    expect((await res.text()).trim()).toBe(process.env.EXPECTED_SHA);
  });

  test('every page answers, and an unknown address is a proper 404', async ({ request }) => {
    for (const path of ['/', '/cam/', '/gallery/', '/privacy/']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain('text/html');
    }
    expect((await request.get('/this-page-does-not-exist')).status()).toBe(404);
  });

  test('the script and stylesheet referenced by the page exist and are not empty', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
    expect(assets.some(a => a.endsWith('.js')), 'a JS bundle is referenced').toBe(true);
    expect(assets.some(a => a.endsWith('.css')), 'a stylesheet is referenced').toBe(true);
    for (const asset of assets) {
      const res = await request.get(asset);
      expect(res.status(), asset).toBe(200);
      expect((await res.body()).length, asset).toBeGreaterThan(500);
    }
  });

  test('the landing page renders without errors', async ({ page, baseURL }) => {
    const problems = watchForProblems(page, new URL(baseURL!).origin);
    await page.goto('/');
    await expect(page.getByText('Spot it. Snap it. Stamp it.')).toBeVisible();
    await expect(page.getByRole('button', { name: /start cam/i })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('the camera page loads and is ready to take a photo', async ({ page, context, baseURL }) => {
    const problems = watchForProblems(page, new URL(baseURL!).origin);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await mockGeocoder(page);
    await page.goto('/cam/');
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
    expect(problems).toEqual([]);
  });

  test('the gallery and privacy pages render', async ({ page, baseURL }) => {
    const problems = watchForProblems(page, new URL(baseURL!).origin);
    await page.goto('/gallery/');
    await expect(page.getByRole('heading', { name: /gallery/i }).first()).toBeVisible();
    await page.goto('/privacy/');
    await expect(page.getByText('Last updated:')).toBeVisible();
    expect(problems).toEqual([]);
  });
});
