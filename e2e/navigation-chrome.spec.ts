/**
 * The gallery and settings pages share one top bar: the SpotCam logo on the left and a clear
 * "Back to camera" button on the right. Pressing it returns to the camera view.
 */
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder } from './helpers';

for (const [path, title] of [
  ['/gallery', 'Gallery'],
  ['/settings', 'Settings'],
] as const) {
  test.describe(`${path} top bar`, () => {
    test('shows the SpotCam logo, the page title and a labelled back button', async ({ page }) => {
      await page.goto(`${SITE}${path}`);
      const header = page.getByRole('banner');
      await expect(header.getByText('SpotCam', { exact: true })).toBeVisible();
      await expect(header.locator('img[src$="favicon.svg"]')).toBeVisible();
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Back to camera' })).toBeVisible();
    });

    test('the back button returns to the camera view', async ({ page, context }) => {
      await installMocks(page, { camera: 'granted', location: 'granted' });
      await grantLocation(context);
      await mockGeocoder(page);
      await page.goto(`${SITE}${path}`);
      await page.getByRole('button', { name: 'Back to camera' }).click();
      await expect(page).toHaveURL(new RegExp(`${SITE.replace(/\//g, '\/')}/cam/?$`));
      await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    });
  });
}
