import { test, expect, Page } from '@playwright/test';

const SITE = '/Spot-Cam';
const paris = { latitude: 48.85837, longitude: 2.29448 };

/** Stub reverse geocoding so tests never hit the network. */
const mockGeocoder = (page: Page) =>
  page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { display_name: 'Champ de Mars, Paris, France' } }),
  );

test.describe('routing', () => {
  for (const url of [`${SITE}/`, `${SITE}/home`, `${SITE}/home/`, `${SITE}/does-not-exist`]) {
    test(`${url} shows the landing page`, async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'SpotCam' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
    });
  }

  test('/cam opens the camera directly, skipping the landing page', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Cam' })).toHaveCount(0);
  });

  test('/gallery opens the gallery directly', async ({ page }) => {
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByText('No photos yet.')).toBeVisible();
  });

  test('Start Cam navigates to /cam and the back button returns to the landing page', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'Start Cam' }).click();
    await expect(page).toHaveURL(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
  });

  test('the SpotCam badge on the camera page goes home', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'SpotCam home' }).click();
    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.getByRole('button', { name: 'Start Cam' })).toBeVisible();
  });
});

test.describe('landing page layout', () => {
  test('fits the screen without vertical scrolling', async ({ page }) => {
    await page.goto(`${SITE}/`);
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  });

  test('the sample photo opens with its stamp details and a share button', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'View a sample photo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sample photo' });
    await expect(dialog.getByText('Lat: 48.85837, Lon: 2.29448')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Share sample photo' })).toBeVisible();
  });
});

test.describe('permissions on /cam', () => {
  test('granted: live stamp with address, and capturing saves a photo', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Lat: 48.85837, Lon: 2.29448')).toBeVisible();
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();

    const capture = page.getByRole('button', { name: 'Capture photo' });
    await expect(capture).toBeEnabled();
    await capture.click();

    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(page).toHaveURL(`${SITE}/gallery`);
    await expect(page.getByText('No photos yet.')).toHaveCount(0);
  });

  test('camera denied: explains it is required, offers a way back, and disables capture', async ({ page, context }) => {
    // Location granted, camera not: headless Chromium rejects the unanswered camera prompt.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Camera access is blocked');
    await expect(notice.getByRole('button', { name: /Allow access|Reload page/ }).first()).toBeVisible();
    await expect(notice.locator('summary')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('location denied: explains it is required, offers a way back, and disables capture', async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Location access is blocked');
    await expect(notice.getByRole('button', { name: /Allow access|Reload page/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('recovers on its own once the user allows the camera, without a reload', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('alert')).toContainText('Camera access is blocked');

    // The user switches the camera to "Allow" in their browser settings. The browser reports the
    // change, and the page picks it up without the user tapping anything.
    await context.grantPermissions(['camera', 'geolocation']);

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  test('shows Android-specific steps for turning the camera back on', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(paris);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await notice.locator('details').evaluate((d: HTMLDetailsElement) => (d.open = true));
    await expect(notice.getByText('Tap "Permissions".')).toBeVisible();
    await expect(notice.getByText('Switch Camera to "Allow".')).toBeVisible();
  });

  test.describe('on iPhone Safari', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    });

    test('shows iOS-specific steps for turning location back on', async ({ page, context }) => {
      await context.grantPermissions(['camera']);
      await mockGeocoder(page);

      await page.goto(`${SITE}/cam`);
      const notice = page.getByRole('alert');
      await notice.locator('details').evaluate((d: HTMLDetailsElement) => (d.open = true));
      await expect(notice.getByText('Tap the "aA" icon in the address bar.')).toBeVisible();
      await expect(notice.getByText('Set Location to "Allow".')).toBeVisible();
    });
  });

  test('requests permissions when they have not been granted', async ({ page }) => {
    // Record that the page actually asks for both permissions on load.
    await page.addInitScript(() => {
      const w = window as unknown as { __asked: string[] };
      w.__asked = [];
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = c => {
        w.__asked.push('camera');
        return gum(c);
      };
      const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.watchPosition = (...args) => {
        w.__asked.push('geolocation');
        return watch(...args);
      };
    });

    await page.goto(`${SITE}/cam`);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __asked: string[] }).__asked.slice().sort()))
      .toEqual(['camera', 'geolocation']);
  });
});
