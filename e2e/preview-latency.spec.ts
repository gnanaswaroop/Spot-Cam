/**
 * The live preview should show the scene with as little delay as the phone can manage. A blurred, see-through
 * panel over a playing video makes the phone blur that area again for every frame, which adds delay, so the
 * panels on the camera screen use plain translucent colour instead. The picture size is capped for the same reason.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder } from './helpers';

async function openCamera(page: Page, context: Parameters<typeof grantLocation>[0]) {
  await installMocks(page, { camera: 'granted', location: 'granted', zoom: { min: 1, max: 5, step: 0.1, initial: 1 } });
  await grantLocation(context);
  await mockGeocoder(page);
  await page.goto(`${SITE}/cam`);
  await expect(page.getByTestId('control-bar')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'ZOOM' })).toBeVisible();
}

test.describe('live preview delay', () => {
  test('nothing over the live video is blurred (stamp bar, zoom bar, control bar)', async ({ page, context }) => {
    await openCamera(page, context);
    const blurred = await page.evaluate(() => {
      const video = document.querySelector('video')!;
      const root = video.closest('[class*="relative"], div')!.parentElement!;
      return Array.from(root.querySelectorAll<HTMLElement>('*'))
        .filter(el => {
          const s = getComputedStyle(el);
          const filter = (s as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || s.backdropFilter;
          return !!filter && filter !== 'none';
        })
        .map(el => el.getAttribute('data-testid') ?? el.className);
    });
    expect(blurred).toEqual([]);
  });

  test('the panels are still readable over the video (not left fully transparent)', async ({ page, context }) => {
    await openCamera(page, context);
    for (const id of ['stamp-overlay', 'control-bar']) {
      const alpha = await page.getByTestId(id).evaluate(el => {
        const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
        return m.length === 4 ? m[3] : 1;
      });
      expect(alpha, id).toBeGreaterThanOrEqual(0.6);
    }
  });

  test('the requested picture is no larger than 1920x1440', async ({ page, context }) => {
    await openCamera(page, context);
    const [first] = (await page.evaluate(() => (window as unknown as { __mock: { constraints: unknown[] } }).__mock.constraints)) as Array<{
      video: { width: { ideal: number }; height: { ideal: number } };
    }>;
    expect(first.video.width.ideal).toBeLessThanOrEqual(1920);
    expect(first.video.height.ideal).toBeLessThanOrEqual(1440);
  });
});
