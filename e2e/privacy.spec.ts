import { test, expect } from './fixtures';
import { SITE } from './helpers';

test.describe('privacy policy', () => {
  test('/privacy opens directly (a real page on static hosting)', async ({ page }) => {
    await page.goto(`${SITE}/privacy`);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await expect(page).toHaveTitle('Privacy Policy | SpotCam');
    await expect(page.getByText('Last updated:')).toBeVisible();
  });

  test('says what really happens to camera, location and photos', async ({ page }) => {
    await page.goto(`${SITE}/privacy`);
    // The policy must match the app: coordinates go to the address lookup services (Photon, BigDataCloud, Nominatim), photos stay on the device.
    await expect(page.getByText('Address lookup services.')).toBeVisible();
    for (const name of ['Photon', 'BigDataCloud', 'OpenStreetMap Nominatim']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Photos are not uploaded to us or to anyone else.')).toBeVisible();
    // The offline copy of the app is disclosed, and it is clear that it holds no photos or location data.
    await expect(page.getByText('Working offline.')).toBeVisible();
    await expect(page.getByText('This copy holds no photos and no location data', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What we don\'t do' })).toBeVisible();
    // No contact details are published on the page.
    await expect(page.getByRole('heading', { name: 'Contact' })).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  });

  test('is linked from the landing page and Back to SpotCam returns there', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(new RegExp(`${SITE}/privacy/?$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to SpotCam' }).click();
    await expect(page).toHaveURL(new RegExp(`${SITE}/$`));
    await expect(page.getByRole('link', { name: 'Start Cam' })).toBeVisible();
    await expect(page).toHaveTitle(/SpotCam/);
  });

  test('the browser Back button returns from the policy to the landing page', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('link', { name: 'Start Cam' })).toBeVisible();
  });

  test('the whole policy is reachable by scrolling (the app shell never scrolls, the page does)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${SITE}/privacy`);
    // The last section of the policy must be reachable by scrolling the page.
    const last = page.getByRole('heading', { name: 'Changes to this policy' });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  test('the landing page still fits on one screen with the Privacy link (360x640)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeInViewport();
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  });
});
