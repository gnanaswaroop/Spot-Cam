/** The gallery's multi-select: pick photos (or all of them) and delete them together. */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { setUpGrantedCamera, takePhotos } from './helpers';

async function openGalleryWith(page: Page, context: Parameters<typeof setUpGrantedCamera>[1], count: number) {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, count);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
}

const tiles = (page: Page) => page.getByRole('button', { name: /^(Open|Select) photo taken/ });
const status = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('status');

test.describe('selecting several photos', () => {
  test('select some photos and delete only those', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(status(page)).toHaveText('0 selected');
    await expect(page.getByRole('button', { name: 'Delete selected' })).toBeDisabled();

    await tiles(page).nth(0).click();
    await tiles(page).nth(2).click();
    await expect(status(page)).toHaveText('2 selected');
    await expect(tiles(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(tiles(page).nth(1)).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Delete selected' }).click();
    await expect(page.getByText('Are you sure you want to delete these 2 photos?')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(tiles(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Select', exact: true })).toBeVisible(); // back to normal browsing
  });

  test('Select all, then Clear selection; Cancel keeps every photo', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Select all' }).click();
    await expect(status(page)).toHaveText('3 selected');
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(status(page)).toHaveText('0 selected');
    await page.getByRole('button', { name: 'Select all' }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(tiles(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(3);
  });

  test('deleting everything with Select all empties the gallery; Cancel in the confirm keeps the photos', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Select all' }).click();
    await page.getByRole('button', { name: 'Delete selected' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(tiles(page)).toHaveCount(2);
    await expect(status(page)).toHaveText('2 selected');

    await page.getByRole('button', { name: 'Delete selected' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('No photos yet.')).toBeVisible();
  });
});
