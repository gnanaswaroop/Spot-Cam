/**
 * Pinch on the live camera picture changes the camera's own zoom (the zoom sent to the track), not a stretch of the preview.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, installMocks, grantLocation, mockGeocoder, skipIfNoCameraFrames, type MockController } from './helpers';

async function openCameraWithZoom(page: Page, context: Parameters<typeof grantLocation>[0]) {
  await skipIfNoCameraFrames(page);
  await installMocks(page, { camera: 'granted', location: 'granted', zoom: { min: 1, max: 5, step: 0.1, initial: 1 } });
  await grantLocation(context);
  await mockGeocoder(page);
  await page.goto(`${SITE}/cam`);
  await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
}

const applied = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mock: MockController }).__mock.applied as Array<{ advanced?: Array<{ zoom?: number }> }>);

test('spreading two fingers on the picture zooms the camera, and the slider follows', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
  await openCameraWithZoom(page, context);
  const video = page.locator('video[aria-label]').first();
  const box = (await video.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: spread ? [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }] : [],
    });

  await touch('touchStart', 30);
  for (let spread = 40; spread <= 60; spread += 10) await touch('touchMove', spread);
  await touch('touchEnd', 0);

  // 60 px apart to 120 px apart: twice as far, so the camera's zoom goes from 1x to 2x.
  await expect.poll(async () => (await applied(page)).at(-1)?.advanced?.[0]?.zoom ?? 0).toBeCloseTo(2, 5);
  await expect(page.getByRole('slider', { name: 'ZOOM' })).toHaveValue('2');
});

test('closing two fingers zooms back out, and never below the camera\'s 1x', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'two-finger touch is sent through the Chromium DevTools protocol');
  await openCameraWithZoom(page, context);
  const video = page.locator('video[aria-label]').first();
  const box = (await video.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: spread ? [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }] : [],
    });

  await touch('touchStart', 60);
  for (let spread = 50; spread >= 10; spread -= 10) await touch('touchMove', spread);
  await touch('touchEnd', 0);

  await expect.poll(async () => (await applied(page)).at(-1)?.advanced?.[0]?.zoom ?? 0).toBeCloseTo(1, 5);
  await expect(page.getByRole('slider', { name: 'ZOOM' })).toHaveValue('1');
});

test('one finger on the picture does not zoom', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'one-finger touch is sent through the Chromium DevTools protocol');
  await openCameraWithZoom(page, context);
  const before = (await applied(page)).length;
  const video = page.locator('video[aria-label]').first();
  const box = (await video.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 80, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  expect((await applied(page)).length).toBe(before);
});
