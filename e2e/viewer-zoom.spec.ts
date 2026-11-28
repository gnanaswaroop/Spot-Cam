/**
 * Viewing a photo or video: zoom in and out with the buttons or the + and - keys, pan a zoomed picture by dragging,
 * and leave the swipe to the next photo for when the picture is back at 1x.
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
/** The element that is zoomed: the picture's wrapper, whose style holds the transform. */
const pane = (page: Page) => viewer(page).locator('img[alt^="Photo taken"]').locator('xpath=..');
const zoomLevel = (page: Page) => viewer(page).getByRole('button', { name: 'Reset zoom' });

/** The shift and scale the zoomed picture is drawn with, read back from its transform. */
async function transformOf(page: Page) {
  const style = (await pane(page).getAttribute('style')) ?? '';
  // Some browsers write "translate(0px)" when y is 0, so the y part is optional.
  const m = style.match(/translate\(([-\d.]+)px(?:, ([-\d.]+)px)?\) scale\(([\d.]+)\)/);
  if (!m) throw new Error(`no transform in "${style}"`);
  return { x: Number(m[1]), y: Number(m[2] ?? 0), scale: Number(m[3]) };
}

test.describe('zooming a photo', () => {
  test('the + and - buttons zoom in and out, and the percentage resets it', async ({ page, context }) => {
    await openFirstPhoto(page, context);
    await expect(zoomLevel(page)).toContainText('100%');
    await expect(viewer(page).getByRole('button', { name: 'Zoom out' })).toBeDisabled();

    await viewer(page).getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLevel(page)).toContainText('125%');
    await expect.poll(async () => (await transformOf(page)).scale).toBeCloseTo(1.25, 5);

    await viewer(page).getByRole('button', { name: 'Zoom in' }).click();
    await viewer(page).getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(async () => (await transformOf(page)).scale).toBeCloseTo(1.25, 5);

    await zoomLevel(page).click();
    await expect(zoomLevel(page)).toContainText('100%');
    await expect.poll(async () => (await transformOf(page)).scale).toBe(1);
  });

  test('the + and - keys zoom, and 0 resets', async ({ page, context }) => {
    await openFirstPhoto(page, context);
    await page.keyboard.press('+');
    await expect(zoomLevel(page)).toContainText('125%');
    await page.keyboard.press('-');
    await expect(zoomLevel(page)).toContainText('100%');
    await page.keyboard.press('+');
    await page.keyboard.press('0');
    await expect(zoomLevel(page)).toContainText('100%');
  });

  test('a zoomed picture can be dragged to see the part that is out of view', async ({ page, context }) => {
    await openFirstPhoto(page, context);
    await viewer(page).getByRole('button', { name: 'Zoom in' }).click();
    await viewer(page).getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoomLevel(page)).toContainText('156%');

    const box = (await viewer(page).locator('img[alt^="Photo taken"]').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 20, y, { steps: 4 });
    await page.mouse.up();

    const shifted = await transformOf(page);
    expect(shifted.x).toBeCloseTo(-20, 0);
    expect(shifted.y).toBeCloseTo(0, 0);
  });

  test('a saved video zooms the same way', async ({ page, context }) => {
    await page.goto('about:blank');
    const canRecord = await page.evaluate(() => typeof MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function');
    test.skip(!canRecord, 'This browser build has no MediaRecorder or canvas.captureStream, so it cannot record video');
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    const record = page.getByRole('button', { name: 'Record video' });
    await expect(record).toBeEnabled();
    await record.click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(record).toBeVisible();

    await page.getByRole('button', { name: 'Open gallery' }).click();
    await page.getByRole('button', { name: /^Open video taken/ }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Video' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Zoom in' }).click();
    await expect(dialog.getByRole('button', { name: 'Reset zoom' })).toContainText('125%');
    await expect(dialog.locator('video').locator('xpath=ancestor::div[contains(@style, "scale(")][1]')).toHaveAttribute('style', /scale\(1\.25\)/);
  });

  test('pinching with two fingers zooms about the fingers', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
    await openFirstPhoto(page, context);
    const box = (await viewer(page).locator('img[alt^="Photo taken"]').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: spread ? [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }] : [],
      });

    await touch('touchStart', 30);
    for (let spread = 40; spread <= 90; spread += 10) await touch('touchMove', spread);
    await touch('touchEnd', 0);

    // The fingers went from 60 px apart to 180 px apart: three times as far.
    await expect(zoomLevel(page)).toContainText('300%');
    expect((await transformOf(page)).scale).toBeCloseTo(3, 5);
  });

  test('while zoomed, the arrow keys do not move to the next photo; back at 100% they do', async ({ page, context }) => {
    await openFirstPhoto(page, context);
    await expect(viewer(page).getByText('Photo 1 of 2', { exact: true })).toBeAttached();

    await page.keyboard.press('+');
    await page.keyboard.press('ArrowRight');
    await expect(viewer(page).getByText('Photo 1 of 2', { exact: true })).toBeAttached();

    await page.keyboard.press('0');
    await page.keyboard.press('ArrowRight');
    await expect(viewer(page).getByText('Photo 2 of 2', { exact: true })).toBeAttached();
    await expect(zoomLevel(page)).toContainText('100%');
  });
});
