/**
 * Regression: on phones the Share/Delete buttons in the photo viewer were pushed below the visible
 * area (the image was sized with 70vh, which ignores browser toolbars and Android's navigation bar).
 * The buttons must stay fully visible however short the visible viewport is.
 */
import { test, expect, Page } from '@playwright/test';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

const VIEWPORTS = [
  { name: 'tall Android phone', width: 412, height: 915 },
  { name: 'Android with a persistent 3-button nav bar and toolbar', width: 412, height: 700 },
  { name: 'small Android phone', width: 360, height: 560 },
  { name: 'very small / split-screen', width: 320, height: 480 },
  { name: 'phone in landscape', width: 800, height: 360 },
  { name: 'iPhone SE', width: 375, height: 560 },
];

async function expectControlsVisible(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Photo' });
  await expect(dialog).toBeVisible();
  for (const name of ['Share photo', 'Delete photo', 'Close photo view']) {
    await expect(dialog.getByRole('button', { name })).toBeInViewport({ ratio: 1 });
  }
  // The viewer itself must fit the visible area exactly (no overflow below the fold).
  const { bottom, innerHeight } = await dialog.evaluate(el => ({
    bottom: el.getBoundingClientRect().bottom,
    innerHeight: window.innerHeight,
  }));
  expect(bottom).toBeLessThanOrEqual(innerHeight + 1);
}

test.describe('gallery photo viewer', () => {
  for (const vp of VIEWPORTS) {
    test(`Share and Delete stay visible: ${vp.name} (${vp.width}x${vp.height})`, async ({ page, context }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setUpGrantedCamera(page, context);
      await takePhotos(page, 1);
      await page.getByRole('button', { name: 'Open gallery' }).click();

      await page.getByRole('img', { name: /Captured at/ }).first().click();
      await expectControlsVisible(page);
    });
  }

  test('still visible after the browser bars show or hide (viewport height changes while open)', async ({ page, context }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await page.getByRole('img', { name: /Captured at/ }).first().click();
    await expectControlsVisible(page);

    // Toolbar and navigation bar appear: the visible area shrinks.
    await page.setViewportSize({ width: 412, height: 640 });
    await expectControlsVisible(page);

    // Rotate to landscape.
    await page.setViewportSize({ width: 800, height: 360 });
    await expectControlsVisible(page);
  });

  test('Delete asks for confirmation and removes the photo', async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 560 });
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await page.getByRole('img', { name: /Captured at/ }).first().click();

    await page.getByRole('button', { name: 'Delete photo' }).click();
    const confirm = page.getByRole('dialog', { name: /Confirm Deletion|Are you sure/ }).or(page.getByRole('dialog').filter({ hasText: 'Confirm Deletion' }));
    await expect(confirm.getByRole('button', { name: 'Delete', exact: true })).toBeInViewport({ ratio: 1 });
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('No photos yet.')).toBeVisible();
  });
});
