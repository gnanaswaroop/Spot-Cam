/**
 * Permission handling on /cam. Camera and permission outcomes are mocked in the page, so these
 * run identically in Chromium, Firefox and WebKit. Real Chromium prompts: chromium-native.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { SITE, askedFor, installMocks, mockGeocoder, grantLocation, setMock, setUpGrantedCamera, skipIfNoCameraFrames } from './helpers';

test.describe('granted', () => {
  test('live stamp shows the address, and capturing saves a photo', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await setUpGrantedCamera(page, context);
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

  test('asks for both permissions as soon as /cam loads', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect.poll(() => askedFor(page)).toEqual(['camera', 'geolocation']);
  });
});

test.describe('camera blocked', () => {
  test('soft block: explains it, offers "Allow access", and disables capture', async ({ page, context }) => {
    await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'prompt' } });
    await grantLocation(context);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Camera access is blocked');
    await expect(notice.getByRole('button', { name: 'Allow access' })).toBeVisible();
    await expect(notice.locator('summary')).toContainText('Enable it manually');
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('hard block: shows the steps up front and a "Reload page" button', async ({ page, context }) => {
    await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
    await grantLocation(context);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText("won't ask again on its own");
    await expect(notice.getByRole('button', { name: 'Reload page' })).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Allow access' })).toHaveCount(0);
    await expect(notice.locator('details')).toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('recovers when the user taps "Allow access" after enabling the camera', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'prompt' } });
    await grantLocation(context);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('alert')).toContainText('Camera access is blocked');

    await setMock(page, { camera: 'granted' }); // the user allowed it
    await page.getByRole('alert').getByRole('button', { name: 'Allow access' }).click();

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  test('no camera on the device: says so without blaming permissions', async ({ page, context }) => {
    await installMocks(page, { camera: 'notfound', location: 'granted' });
    await grantLocation(context);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('alert')).toContainText('No camera found');
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });
});

test.describe('browser without camera support', () => {
  test('says the browser is unsupported (not "secure connection required") on a secure page', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    });
    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Camera not supported');
    await expect(notice).not.toContainText('Secure connection required');
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });
});

test.describe('location blocked', () => {
  test('soft block: explains why it is required, and disables capture', async ({ page }) => {
    await skipIfNoCameraFrames(page); // the location notice only shows once the camera itself works
    await installMocks(page, { camera: 'granted', location: 'denied', permissionStates: { geolocation: 'prompt' } });
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText('Location access is blocked');
    await expect(notice).toContainText('stamps your location onto every photo');
    await expect(notice.getByRole('button', { name: 'Allow access' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('hard block: shows the steps up front and a "Reload page" button', async ({ page }) => {
    await skipIfNoCameraFrames(page);
    await installMocks(page, { camera: 'granted', location: 'denied', permissionStates: { geolocation: 'denied' } });
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    const notice = page.getByRole('alert');
    await expect(notice).toContainText("won't ask again on its own");
    await expect(notice.getByRole('button', { name: 'Reload page' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeDisabled();
  });

  test('recovers when the user taps "Allow access" after enabling location', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await installMocks(page, { camera: 'granted', location: 'denied', permissionStates: { geolocation: 'prompt' } });
    await grantLocation(context);
    await mockGeocoder(page);

    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('alert')).toContainText('Location access is blocked');

    await setMock(page, { location: 'granted' });
    await page.getByRole('alert').getByRole('button', { name: 'Allow access' }).click();

    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });
});

/** The recovery steps depend on the browser, detected from the user agent. */
const BROWSERS = [
  {
    name: 'Android Chrome',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    steps: [/Tap the ⋮ menu \(top right\)/, 'Tap "Permissions".', 'Switch Camera to "Allow".', /Settings > Apps > your browser > Permissions/],
  },
  {
    name: 'iPhone Safari',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    steps: ['Tap the "aA" icon in the address bar.', 'Tap "Website Settings".', 'Set Camera to "Allow".'],
  },
  {
    name: 'iPhone Chrome',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1',
    steps: ['Tap the "aA" icon in the address bar.'],
  },
  {
    name: 'Firefox (desktop)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    steps: ['Click the permissions icon at the left of the address bar.', 'Next to Camera, remove the "Blocked" setting.'],
  },
  {
    name: 'Chrome (desktop)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    steps: ['Click the lock (or settings) icon at the left of the address bar.'],
  },
  {
    name: 'Edge (desktop)',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    steps: ['Click the lock (or settings) icon at the left of the address bar.'],
  },
  {
    name: 'Safari (macOS)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    steps: ['In the Safari menu, choose "Settings for This Website…".', 'Set Camera to "Allow".'],
  },
];

test.describe('recovery steps per browser', () => {
  for (const browser of BROWSERS) {
    test.describe(browser.name, () => {
      test.use({ userAgent: browser.ua });

      test('shows the right steps for turning the camera back on', async ({ page, context }) => {
        await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
        await grantLocation(context);
        await mockGeocoder(page);

        await page.goto(`${SITE}/cam`);
        const notice = page.getByRole('alert');
        await expect(notice).toContainText('Camera access is blocked');
        for (const step of browser.steps) {
          await expect(notice.getByText(step)).toBeVisible();
        }
      });
    });
  }
});
