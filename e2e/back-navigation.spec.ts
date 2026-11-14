/**
 * Regression: on a phone, tapping "view sample" and then using the Back swipe took the user back
 * to the landing page with the sample open again. The viewer was only in-memory state with no
 * history entry, so Back left the page and the browser later restored it with the viewer open.
 * Full-screen layers now own a history entry: Back closes the top layer and nothing else.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

const sampleViewer = (page: Page) => page.getByRole('dialog', { name: 'Sample photo' });
const openSample = (page: Page) => page.getByRole('button', { name: 'View a sample photo' }).click();

/** Start from another page so there is a real "previous page" to go back to, like a phone browser. */
async function visitLanding(page: Page) {
  await page.goto('about:blank');
  await page.goto(`${SITE}/`);
}

test.describe('sample viewer and the Back gesture', () => {
  test('Back closes the viewer and stays on the landing page', async ({ page }) => {
    await visitLanding(page);
    await openSample(page);
    await expect(sampleViewer(page)).toBeVisible();

    await page.goBack();

    await expect(sampleViewer(page)).toHaveCount(0);
    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
  });

  test('after visiting the camera, Back closes the viewer instead of jumping to the camera', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await visitLanding(page);
    await page.getByRole('button', { name: 'Start Cam' }).click();
    await page.getByRole('button', { name: 'SpotCam home' }).click();
    await openSample(page);

    await page.goBack();

    await expect(page).toHaveURL(`${SITE}/`);
    await expect(sampleViewer(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toHaveCount(0);
  });

  test('leaving the site and coming back does not reopen the sample', async ({ page }) => {
    await visitLanding(page);
    await openSample(page);

    await page.goBack(); // closes the viewer
    await page.goBack(); // leaves the site
    await expect(page).toHaveURL('about:blank');
    await page.goForward(); // returns to the landing page

    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
    await expect(sampleViewer(page)).toHaveCount(0);
  });

  test('closing with the X button leaves no stale history entry behind', async ({ page }) => {
    await visitLanding(page);
    await openSample(page);
    await sampleViewer(page).getByRole('button', { name: 'Close sample' }).click();
    await expect(sampleViewer(page)).toHaveCount(0);

    // One Back must now leave the page entirely (no hidden "viewer open" entry to land on).
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('can be opened and closed repeatedly without piling up history', async ({ page }) => {
    await visitLanding(page);
    for (let i = 0; i < 3; i++) {
      await openSample(page);
      await expect(sampleViewer(page)).toBeVisible();
      await page.goBack();
      await expect(sampleViewer(page)).toHaveCount(0);
    }
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });
});

test.describe('gallery layers and the Back gesture', () => {
  async function openGalleryWithOnePhoto(page: Page, context: import('@playwright/test').BrowserContext) {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(page).toHaveURL(`${SITE}/gallery`);
  }

  const photoViewer = (page: Page) => page.getByRole('dialog', { name: 'Photo' });
  const confirmDialog = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Confirm Deletion' });

  test('Back closes the photo viewer and stays in the gallery', async ({ page, context }) => {
    await openGalleryWithOnePhoto(page, context);
    await page.getByRole('img', { name: /Captured at/ }).first().click();
    await expect(photoViewer(page)).toBeVisible();

    await page.goBack();

    await expect(photoViewer(page)).toHaveCount(0);
    await expect(page).toHaveURL(`${SITE}/gallery`);
    await expect(page.getByRole('img', { name: /Captured at/ }).first()).toBeVisible();
  });

  test('Back closes the delete confirmation first, then the viewer', async ({ page, context }) => {
    await openGalleryWithOnePhoto(page, context);
    await page.getByRole('img', { name: /Captured at/ }).first().click();
    await page.getByRole('button', { name: 'Delete photo' }).click();
    await expect(confirmDialog(page)).toBeVisible();

    await page.goBack();
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(photoViewer(page)).toBeVisible(); // the photo is still there

    await page.goBack();
    await expect(photoViewer(page)).toHaveCount(0);
    await expect(page).toHaveURL(`${SITE}/gallery`);
  });

  test('confirming a delete closes both layers, and Back then leaves the gallery cleanly', async ({ page, context }) => {
    await openGalleryWithOnePhoto(page, context);
    await page.getByRole('img', { name: /Captured at/ }).first().click();
    await page.getByRole('button', { name: 'Delete photo' }).click();
    await confirmDialog(page).getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText('No photos yet.')).toBeVisible();
    await expect(photoViewer(page)).toHaveCount(0);
    await expect(confirmDialog(page)).toHaveCount(0);

    // History is back to normal: Back goes to the previous page (the camera), not to a ghost viewer.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${SITE}/cam/?$`)); // Pages redirects /cam to /cam/
    await expect(photoViewer(page)).toHaveCount(0);
  });
});
