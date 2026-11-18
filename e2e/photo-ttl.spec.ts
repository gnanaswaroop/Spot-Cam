/**
 * "Keep photos for" in Settings: photos older than the chosen time are removed from the gallery.
 * The page's clock is moved forward to age the photos.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

const keepFor = (page: Page, label: string) => page.getByRole('radio', { name: label, exact: false });
const status = (page: Page) => page.getByRole('status').first();
const photoCount = (page: Page) => page.getByTestId('photo-count');

/** Takes photos, then opens the page again with the clock `ageMs` later (so those photos are that much older). */
async function takePhotosThenAge(page: Page, context: Parameters<typeof setUpGrantedCamera>[1], count: number, ageMs: number, path: string) {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, count);
  await page.clock.install({ time: Date.now() + ageMs });
  await page.goto(`${SITE}${path}`);
}

test.describe('keep photos for', () => {
  test('keeps photos until they are deleted, by default', async ({ page, context }) => {
    await takePhotosThenAge(page, context, 2, 400 * DAY, '/settings');
    await expect(keepFor(page, 'Until I delete them')).toBeChecked();
    await expect(photoCount(page)).toHaveText('2 photos saved on this device.');
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(2);
  });

  test('a limit with nothing old enough to remove applies at once and says so', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 2);
    await page.getByRole('button', { name: 'Settings' }).click();
    await keepFor(page, '7 days').check();
    await expect(status(page)).toHaveText('Photos will be removed after 7 days.');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(photoCount(page)).toHaveText('2 photos saved on this device.');
  });

  test('the choice is remembered', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/settings`);
    await keepFor(page, '30 days').check();
    await page.reload();
    await expect(keepFor(page, '30 days')).toBeChecked();
  });

  test('photos older than the limit are removed when the app opens', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 2);
    await page.goto(`${SITE}/settings`);
    await keepFor(page, '1 day').check();
    await page.clock.install({ time: Date.now() + 2 * DAY });
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByText('No photos yet.')).toBeVisible();
  });

  test('a photo is removed at the moment it expires, even if the app stays open', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.clock.install(); // time can be moved forward from the start, so the app's own timer is the one that fires
    await takePhotos(page, 1);
    await page.goto(`${SITE}/settings`);
    await keepFor(page, '1 hour').check();
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(1);
    await page.clock.fastForward('00:30:00');
    await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(1); // not yet
    await page.clock.fastForward('00:31:00');
    await expect(page.getByText('No photos yet.')).toBeVisible();
  });

  test('a limit that would remove saved photos asks first, and Cancel keeps them', async ({ page, context }) => {
    await takePhotosThenAge(page, context, 2, 2 * DAY, '/settings');
    await keepFor(page, '1 day').check();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removing photos' });
    await expect(confirm).toContainText('2 saved photos are older than 1 day and will be permanently deleted now');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(keepFor(page, 'Until I delete them')).toBeChecked();
    await expect(photoCount(page)).toHaveText('2 photos saved on this device.');
  });

  test('confirming removes them and keeps the limit', async ({ page, context }) => {
    await takePhotosThenAge(page, context, 2, 2 * DAY, '/settings');
    await keepFor(page, '1 day').check();
    await page.getByRole('alertdialog').getByRole('button', { name: /^Yes, delete/ }).click();
    await expect(status(page)).toHaveText('Photos will be removed after 1 day.');
    await expect(photoCount(page)).toHaveText('No photos saved.');
    await page.reload();
    await expect(keepFor(page, '1 day')).toBeChecked();
  });

  test('only the photos that are too old are removed', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1); // this one will be 2 days old
    await page.clock.install({ time: Date.now() + 2 * DAY });
    await page.goto(`${SITE}/cam`);
    const capture = page.getByRole('button', { name: 'Capture photo' });
    await expect(capture).toBeEnabled();
    await capture.click(); // and this one is new
    await page.waitForTimeout(300);
    await page.goto(`${SITE}/settings`);
    await expect(photoCount(page)).toHaveText('2 photos saved on this device.');
    await keepFor(page, '1 day').check();
    await expect(page.getByRole('alertdialog')).toContainText('1 saved photo is older than 1 day');
    await page.getByRole('alertdialog').getByRole('button', { name: /^Yes, delete/ }).click();
    await expect(photoCount(page)).toHaveText('1 photo saved on this device.');
  });

  test('the gallery says how long photos are kept, and nothing when they are kept until deleted', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(page.getByText(/Photos are removed after/)).toHaveCount(0);
    await page.goto(`${SITE}/settings`);
    await keepFor(page, '7 days').check();
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByText('Photos are removed after 7 days. You can change this in Settings.')).toBeVisible();
  });
});
