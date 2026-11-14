/**
 * Real browser permission behaviour. Playwright can only grant/deny the camera natively in
 * Chromium (with a fake capture device), so these run in Chromium projects only; the other
 * engines are covered by the in-page mocks in permissions.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { SITE, mockGeocoder, paris } from './helpers';

test.describe('native Chromium permissions', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Camera permission can only be driven in Chromium');

  test('granted: the real fake camera and location work end to end', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  test('camera denied by the browser: shows the blocked notice and disables capture', async ({ page, context }) => {
    // Location granted, camera not: headless Chromium rejects the unanswered camera prompt.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Camera access is blocked');
    await expect(notice.getByRole('button', { name: /Allow access|Reload page/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('location denied by the browser: shows the blocked notice and disables capture', async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Location access is blocked');
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('recovers on its own once the user allows the camera, without a reload', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('alert')).toContainText('Camera access is blocked');

    // The user switches the camera to "Allow" in the browser settings. The browser reports the
    // change, and the page picks it up without the user tapping anything.
    await context.grantPermissions(['camera', 'geolocation']);

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });
});
