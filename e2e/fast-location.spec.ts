/**
 * Opening the camera should show where you are quickly: the last address found is remembered on the device
 * and shown as soon as the first GPS fix arrives close to it, and a recent GPS fix may answer first.
 * It must never show an address for somewhere else. All address services are mocked (see fixtures.ts).
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder, paris, type MockController } from './helpers';

const PARIS_ADDRESS = 'Champ de Mars, Paris, France';
const KEY = 'spotcam.lastAddress';

function countGeocoderRequests(page: Page) {
  const counts = { total: 0 };
  page.on('request', req => {
    const host = new URL(req.url()).hostname;
    if (['photon.komoot.io', 'api.bigdatacloud.net', 'nominatim.openstreetmap.org'].includes(host)) counts.total++;
  });
  return counts;
}

async function setUp(page: Page, context: Parameters<typeof grantLocation>[0]) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
  await mockGeocoder(page);
}

const forgetCachedAddresses = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>(resolve => {
        const req = indexedDB.deleteDatabase('keyval-store');
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
  );

test.describe('fast location', () => {
  test('the first GPS fix may be a recent one, and later updates stay high accuracy', async ({ page, context }) => {
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible();
    const [opts] = (await page.evaluate(() => (window as unknown as { __mock: MockController }).__mock.watchOptions)) as Array<{
      enableHighAccuracy: boolean;
      maximumAge: number;
    }>;
    expect(opts.enableHighAccuracy).toBe(true);
    expect(opts.maximumAge).toBeGreaterThan(0);
    expect(opts.maximumAge).toBeLessThanOrEqual(60000);
  });

  test('the address found is remembered for the next visit', async ({ page, context }) => {
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible();
    const saved = JSON.parse((await page.evaluate(k => localStorage.getItem(k), KEY)) ?? 'null');
    expect(saved.address).toBe(PARIS_ADDRESS);
    expect(saved.latitude).toBeCloseTo(paris.latitude, 3);
  });

  test('opening the camera again at the same place shows the address with no new lookup', async ({ page, context }) => {
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible();

    // Forget the lookup cache, so only the remembered address can answer.
    await forgetCachedAddresses(page);
    const counts = countGeocoderRequests(page);
    await page.reload();
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(500);
    expect(counts.total).toBe(0);
  });

  test('a remembered address from somewhere else is never shown', async ({ page, context }) => {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [KEY, JSON.stringify({ latitude: 35.6586, longitude: 139.7454, address: 'Tokyo Tower, Tokyo, Japan' })] as const,
    );
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible();
    await expect(page.getByText('Tokyo Tower')).toHaveCount(0);
  });

  test('clearing the address cache in Settings also forgets the remembered address', async ({ page, context }) => {
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible();
    expect(await page.evaluate(k => localStorage.getItem(k), KEY)).not.toBeNull();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Clear address cache' }).click();
    await page.getByRole('button', { name: 'Yes, clear the cache' }).click();
    await expect(page.getByRole('status')).toContainText('Address cache cleared.');
    expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBeNull();
  });

  test('damaged saved data is ignored', async ({ page, context }) => {
    await page.addInitScript(k => localStorage.setItem(k, '{not json'), KEY);
    await setUp(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText(PARIS_ADDRESS)).toBeVisible();
  });
});
