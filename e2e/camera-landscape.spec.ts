/**
 * The camera page on a phone held sideways. The stamp and the control bar used to cover about half
 * of a 800x360 screen; now the controls sit in a side column and the stamp is compact.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, installMocks, mockGeocoder, grantLocation } from './helpers';

const SIZES = [
  { name: 'phone landscape', width: 800, height: 360 },
  { name: 'iPhone SE landscape', width: 667, height: 375 },
  { name: 'small phone landscape', width: 568, height: 320 },
];

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

async function openCamera(page: Page, context: import('@playwright/test').BrowserContext) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
  await mockGeocoder(page);
  await page.goto(`${SITE}/cam`);
  await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
}

test.describe('camera page in landscape', () => {
  for (const size of SIZES) {
    test(`${size.name} (${size.width}x${size.height}): controls and stamp leave most of the preview free`, async ({ page, context }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openCamera(page, context);

      const stamp = (await page.getByTestId('stamp-overlay').boundingBox())!;
      const bar = (await page.getByTestId('control-bar').boundingBox())!;
      const view = { x: 0, y: 0, width: size.width, height: size.height };

      // The controls moved to a side column on the right, full height.
      expect(bar.x).toBeGreaterThan(size.width / 2);
      expect(bar.height).toBeGreaterThanOrEqual(size.height - 1);
      // The stamp and the controls never cover each other.
      expect(overlap(stamp, bar)).toBe(0);
      // The stamp is compact: well under a third of the height.
      expect(stamp.height).toBeLessThanOrEqual(size.height * 0.34);

      // At least 65% of the screen remains free preview (it was 48% before).
      const covered = stamp.width * stamp.height + bar.width * bar.height;
      expect(1 - covered / (view.width * view.height)).toBeGreaterThanOrEqual(0.65);

      // Every button is fully on screen and tappable.
      for (const name of ['Open gallery', 'Capture photo', 'Switch camera']) {
        const box = (await page.getByRole('button', { name }).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }

      // The page itself does not scroll.
      const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
      expect(scrolls).toBe(false);
    });
  }

  test('portrait keeps the controls along the bottom', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openCamera(page, context);
    const bar = (await page.getByTestId('control-bar').boundingBox())!;
    expect(bar.y).toBeGreaterThan(400);
    expect(bar.width).toBeGreaterThanOrEqual(389);
  });

  test('rotating the phone switches the layout without a reload', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openCamera(page, context);
    await page.setViewportSize({ width: 800, height: 390 });
    await expect.poll(async () => (await page.getByTestId('control-bar').boundingBox())!.x).toBeGreaterThan(400);
    await page.setViewportSize({ width: 390, height: 800 });
    await expect.poll(async () => (await page.getByTestId('control-bar').boundingBox())!.y).toBeGreaterThan(400);
  });

  test('a blocked-permission message is fully reachable in landscape', async ({ page, context }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
    await grantLocation(context);
    await mockGeocoder(page);
    await page.goto(`${SITE}/cam`);

    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Camera access is blocked');
    const action = notice.getByRole('button').first();
    await action.scrollIntoViewIfNeeded();
    const box = (await action.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(320);
  });

  test('the "Address unavailable" line and its Retry button stay inside the compact stamp', async ({ page, context }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context); // address services are blocked by default (fixtures.ts), so the lookup fails
    await page.goto(`${SITE}/cam`);

    const retry = page.getByRole('button', { name: 'Retry address lookup' });
    await expect(retry).toBeVisible();
    const stamp = (await page.getByTestId('stamp-overlay').boundingBox())!;
    const box = (await retry.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(stamp.y + stamp.height + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(stamp.x + stamp.width);
    expect(stamp.height).toBeLessThanOrEqual(320 * 0.34);
  });
});
