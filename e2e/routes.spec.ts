import { test, expect } from '@playwright/test';
import { SITE, setUpGrantedCamera } from './helpers';

test.describe('routing', () => {
  for (const url of [`${SITE}/`, `${SITE}/home`, `${SITE}/home/`, `${SITE}/does-not-exist`]) {
    test(`${url} shows the landing page`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'SpotCam' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
    });
  }

  test('/cam opens the camera directly, skipping the landing page', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Cam' })).toHaveCount(0);
  });

  test('/gallery opens the gallery directly', async ({ page }) => {
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByText('No photos yet.')).toBeVisible();
  });

  test('Start Cam navigates to /cam and the back button returns to the landing page', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'Start Cam' }).click();
    await expect(page).toHaveURL(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
  });

  test('the SpotCam badge on the camera page goes home', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'SpotCam home' }).click();
    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
  });
});

test.describe('landing page', () => {
  test('fits the screen without vertical scrolling', async ({ page }) => {
    await page.goto(`${SITE}/`);
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  });

  test('still fits without scrolling on a small 360x640 phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeInViewport();
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  });

  test('shows the tagline', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.getByText('Spot it. Snap it. Stamp it.')).toBeVisible();
  });

  test('the sample photo opens with its stamp details and a share button', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'View a sample photo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sample photo' });
    await expect(dialog.getByText('Lat: 48.85837, Lon: 2.29448')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Share sample photo' })).toBeInViewport({ ratio: 1 });
  });
});
