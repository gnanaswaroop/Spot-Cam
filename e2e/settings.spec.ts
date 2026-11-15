/**
 * Settings: opened from the camera, shows the address cache, clears it, sets the cache radius
 * (saved only when changed), and deletes saved photos. All services are mocked.
 */
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder } from './helpers';

async function openCamera(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
  await page.goto(`${SITE}/cam`);
}

test.describe('settings', () => {
  test('opens from the camera view and returns to it', async ({ page, context }) => {
    await mockGeocoder(page);
    await openCamera(page, context);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByRole('button', { name: 'Back to camera' }).click();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
  });

  test('shows the address cache in use out of the total, and clears it', async ({ page, context }) => {
    await mockGeocoder(page);
    await openCamera(page, context);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('cache-size')).toContainText('1 in use');
    await expect(page.getByTestId('cache-size')).toContainText('/ 200 total');

    await page.getByRole('button', { name: 'Clear address cache' }).click();
    await page.getByRole('button', { name: 'Yes, clear the cache' }).click();
    await expect(page.getByTestId('cache-size')).toContainText('0 in use');
    await expect(page.getByRole('status')).toContainText('Address cache cleared.');
  });

  test('the cache radius shows the default, saves only a change, and can be reset', async ({ page, context }) => {
    await mockGeocoder(page);
    await openCamera(page, context);
    await page.getByRole('button', { name: 'Settings' }).click();

    await expect(page.getByTestId('radius-status')).toHaveText('Default: 50 m');
    const radius = page.getByLabel('Radius in metres');
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled(); // nothing changed yet

    await radius.fill('80');
    await save.click();
    await expect(page.getByTestId('radius-status')).toContainText('Custom: 80 m');
    await expect(page.getByRole('status')).toContainText('Radius saved: 80 m.');

    // Survives a reload.
    await page.reload();
    await expect(page.getByTestId('radius-status')).toContainText('Custom: 80 m');
    await expect(page.getByLabel('Radius in metres')).toHaveValue('80');

    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByTestId('radius-status')).toHaveText('Default: 50 m');
    await expect(page.getByLabel('Radius in metres')).toHaveValue('50');
  });

  test('rejects an out-of-range radius', async ({ page, context }) => {
    await mockGeocoder(page);
    await openCamera(page, context);
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByLabel('Radius in metres').fill('5');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByText('Enter a whole number from 10 to 500.')).toBeVisible();
  });

  test('with no saved photos, deleting them is not offered', async ({ page, context }) => {
    await mockGeocoder(page);
    await openCamera(page, context);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('photo-count')).toHaveText('No photos saved.');
    await expect(page.getByRole('button', { name: 'Delete all saved photos' })).toBeDisabled();
  });
});
