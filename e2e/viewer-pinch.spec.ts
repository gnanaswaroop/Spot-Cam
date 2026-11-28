/**
 * Pinching in the photo viewer: spreading two fingers zooms in, closing them zooms out again, down to 1x and no further.
 * Two-finger touch is sent through the Chromium DevTools protocol, so these run on Chromium only.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

async function openFirstPhoto(page: Page, context: Parameters<typeof setUpGrantedCamera>[1]) {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, 2);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Open photo taken/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible();
}

const viewer = (page: Page) => page.getByRole('dialog', { name: 'Photo' });
const pane = (page: Page) => viewer(page).locator('img[alt^="Photo taken"]').locator('xpath=..');

async function scaleOf(page: Page) {
  const style = (await pane(page).getAttribute('style')) ?? '';
  const m = style.match(/scale\(([\d.]+)\)/);
  if (!m) throw new Error(`no scale in "${style}"`);
  return Number(m[1]);
}

/** Two fingers, `from` px apart from the middle of the picture, moved to `to` px apart in steps. */
async function pinch(page: Page, context: Parameters<typeof setUpGrantedCamera>[1], from: number, to: number) {
  const box = (await viewer(page).locator('img[alt^="Photo taken"]').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: spread ? [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }] : [],
    });
  await send('touchStart', from / 2);
  const steps = 5;
  for (let i = 1; i <= steps; i++) await send('touchMove', (from + ((to - from) * i) / steps) / 2);
  await send('touchEnd', 0);
}

test.describe('pinch in the photo viewer', () => {
  test('spreading two fingers zooms in', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
    await openFirstPhoto(page, context);
    await pinch(page, context, 60, 120);
    await expect.poll(() => scaleOf(page)).toBeCloseTo(2, 1);
  });

  test('closing two fingers while zoomed zooms back out to 1x', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
    await openFirstPhoto(page, context);
    await pinch(page, context, 60, 180); // 3x
    await expect.poll(() => scaleOf(page)).toBeCloseTo(3, 1);
    await pinch(page, context, 180, 60); // back to 1x
    await expect.poll(() => scaleOf(page)).toBeCloseTo(1, 5);
  });

  test('closing two fingers from a partial zoom zooms out, and does not go below 1x', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
    await openFirstPhoto(page, context);
    await pinch(page, context, 60, 90); // 1.5x
    await expect.poll(() => scaleOf(page)).toBeCloseTo(1.5, 1);
    await pinch(page, context, 90, 40);
    await expect.poll(() => scaleOf(page)).toBeCloseTo(1, 5);
  });

  test('the zoom percentage follows the pinch', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
    await openFirstPhoto(page, context);
    await pinch(page, context, 60, 120);
    await expect(viewer(page).getByRole('button', { name: 'Reset zoom' })).toContainText('200%');
    await pinch(page, context, 120, 60);
    await expect(viewer(page).getByRole('button', { name: 'Reset zoom' })).toContainText('100%');
  });
});

test.describe('the browser does not zoom the page instead', () => {
  test('a two-finger move in the viewer is cancelled, so the browser cannot pinch-zoom the page', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
    await openFirstPhoto(page, context);
    // Record, for each two-finger move that reaches the document, whether the viewer cancelled it.
    await page.evaluate(() => {
      const w = window as unknown as { __cancelled: boolean[] };
      w.__cancelled = [];
      document.addEventListener('touchmove', e => { if (e.touches.length >= 2) w.__cancelled.push(e.defaultPrevented); }, { passive: true });
    });
    await pinch(page, context, 60, 120);
    const cancelled = await page.evaluate(() => (window as unknown as { __cancelled: boolean[] }).__cancelled);
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every(Boolean)).toBe(true);
  });
});
