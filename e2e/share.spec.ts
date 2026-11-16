/**
 * Sharing a photo from the gallery: the share sheet gets the photo, the time and place, and a Google Maps
 * link built from the captured coordinates. The browser's share sheet is replaced by a recorder, and all
 * address services are mocked.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, installMocks, mockGeocoder, grantLocation, paris, takePhotos } from './helpers';

type Shared = { title?: string; text?: string; files: number };

/** Replaces the share sheet with a recorder (desktop browsers have none, and a real one cannot be tested). */
const recordShares = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __shared: Shared[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { title?: string; text?: string; files?: File[] }) => {
        w.__shared.push({ title: data.title, text: data.text, files: data.files?.length ?? 0 });
      },
    });
  });

const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared);

async function sharePhoto(page: Page) {
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: /^Open photo taken/ }).first().click();
  await page.getByRole('dialog', { name: 'Photo' }).getByRole('button', { name: 'Share photo' }).click();
}

test.describe('sharing a photo', () => {
  test('includes the time, the address and a Google Maps link to the captured position', async ({ page, context }) => {
    await recordShares(page);
    await mockGeocoder(page);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await takePhotos(page, 1);
    await page.waitForTimeout(300);

    await sharePhoto(page);
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    const [share] = await shared(page);
    expect(share.files).toBe(1);
    expect(share.title).toBe('Photo from SpotCam');
    const lines = share.text!.split('\n');
    expect(lines[0]).toMatch(/^Captured on .+ at .*Paris, France\.$/);
    const link = new URL(lines[1]);
    expect(link.origin + link.pathname).toBe('https://www.google.com/maps/search/');
    expect(link.searchParams.get('api')).toBe('1');
    const [lat, lon] = link.searchParams.get('query')!.split(',').map(Number);
    expect(lat).toBeCloseTo(paris.latitude, 5);
    expect(lon).toBeCloseTo(paris.longitude, 5);
  });

  test('shares the link even when no address could be found', async ({ page, context }) => {
    await recordShares(page);
    await page.route('**/*', route => (route.request().url().startsWith(SITE) || !/^https?:/.test(route.request().url()) ? route.fallback() : route.abort()));
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await takePhotos(page, 1);
    await page.waitForTimeout(300);

    await sharePhoto(page);
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    const [share] = await shared(page);
    expect(share.text).toMatch(/at an unknown location\.\nhttps:\/\/www\.google\.com\/maps\/search\/\?api=1&query=48\.8583\d+,2\.2944\d+$/);
  });
});
