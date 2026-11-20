/**
 * Sharing a photo from the gallery: the share sheet gets the photo, the time and place, and a Google Maps
 * link built from the captured coordinates. The browser's share sheet is replaced by a recorder, and all
 * address services are mocked.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, installMocks, mockGeocoder, grantLocation, paris, skipIfNoCameraFrames, takePhotos } from './helpers';

type Shared = { title?: string; text?: string; files: number };

/** Replaces the share sheet with a recorder (desktop browsers have none, and a real one cannot be tested). */
const recordShares = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __shared: Shared[] };
    w.__shared = [];
    (w as unknown as { __copied: string[] }).__copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => (w as unknown as { __copied: string[] }).__copied.push(t) } });
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
    await skipIfNoCameraFrames(page);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible(); // the photo is taken once the address is known
    await page.getByRole('button', { name: 'Capture photo' }).click();
    await page.waitForTimeout(300);

    await sharePhoto(page);
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    const [share] = await shared(page);
    expect(share.files).toBe(1);
    expect(share.title).toBe('Photo from SpotCam');
    // The same message is copied, to paste as the caption, with a note saying so.
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([share.text]);
    await expect(page.getByRole('status').filter({ hasText: 'Message copied. Paste it as the caption when you share the photo.' })).toBeVisible();
    const lines = share.text!.split('\n');
    expect(lines[0]).toMatch(/^When: .+/);
    expect(lines[1]).toMatch(/^Where: .*Paris, France$/);
    expect(lines[2]).toMatch(/^Map: https:/);
    const link = new URL(lines[2].replace('Map: ', ''));
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
    expect(share.text).toMatch(/^When: .+\nWhere: 48\.8583\d, 2\.2944\d\nMap: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=48\.8583\d+,2\.2944\d+(\n\nStamp the date, time and location [^\n]+\nFree, [^\n]+)?$/); // the end is the optional lines about SpotCam
  });
});

test.describe('choosing the map service for the shared link', () => {
  const expectedStart = {
    Google: 'https://www.google.com/maps/search/?api=1&query=48.8583',
    Apple: 'https://maps.apple.com/?ll=48.8583',
    OpenStreetMap: 'https://www.openstreetmap.org/?mlat=48.8583',
  } as const;

  test('Google Maps is the default, and each choice is saved and used for the link', async ({ page, context }) => {
    await recordShares(page);
    await mockGeocoder(page);
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await takePhotos(page, 1);
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Settings' }).click();
    const group = page.getByRole('group', { name: 'Map service' });
    await expect(group.getByRole('radio', { name: 'Google Maps (default)' })).toBeChecked();

    for (const name of ['Apple', 'OpenStreetMap', 'Google'] as const) {
      await group.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
      await expect(page.getByRole('status').filter({ hasText: 'Shared photos will link to' })).toContainText(name);

      await page.getByRole('button', { name: 'Back to camera' }).click();
      await sharePhoto(page);
      const expectedCount = ['Apple', 'OpenStreetMap', 'Google'].indexOf(name) + 1;
      await expect.poll(async () => (await shared(page)).length).toBe(expectedCount);
      const last = (await shared(page))[expectedCount - 1];
      expect(last.text!.split('\n')[2].startsWith(`Map: ${expectedStart[name]}`), name).toBe(true);
      await page.getByRole('button', { name: 'Close photo view' }).click();
      await page.getByRole('button', { name: 'Back to camera' }).click();
      await page.getByRole('button', { name: 'Settings' }).click();
    }
  });

  test('the choice survives a reload', async ({ page }) => {
    await page.goto(`${SITE}/settings`);
    const group = page.getByRole('group', { name: 'Map service' });
    await group.getByRole('radio', { name: /^Apple/ }).check();
    await page.reload();
    await expect(page.getByRole('group', { name: 'Map service' }).getByRole('radio', { name: /^Apple/ })).toBeChecked();
  });

  test('can be changed with the keyboard', async ({ page }) => {
    await page.goto(`${SITE}/settings`);
    const google = page.getByRole('radio', { name: /^Google Maps/ });
    await google.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: /^Apple/ })).toBeChecked();
  });
});
