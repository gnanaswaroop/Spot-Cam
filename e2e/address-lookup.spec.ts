/**
 * Address lookup behaviour: sparing requests, fallbacks, and never stamping a failure message.
 * All address services are mocked (see fixtures.ts); no test sends a real request.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder, paris, skipIfNoCameraFrames } from './helpers';

const photonReply = (name: string) => ({
  json: { features: [{ properties: { name, city: 'Paris', country: 'France' } }] },
});

/** Records which service was asked how many times. */
function countRequests(page: Page) {
  const counts = { photon: 0, bigdata: 0, nominatim: 0 };
  page.on('request', req => {
    const url = req.url();
    if (url.includes('photon.komoot.io')) counts.photon++;
    else if (url.includes('bigdatacloud')) counts.bigdata++;
    else if (url.includes('nominatim')) counts.nominatim++;
  });
  return counts;
}

async function openCamera(page: Page, context: import('@playwright/test').BrowserContext) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
}

test.describe('address lookup', () => {
  test('standing still triggers one lookup, however many GPS updates arrive', async ({ page, context }) => {
    const counts = countRequests(page);
    await mockGeocoder(page);
    await openCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();

    // Several fresh GPS fixes a metre or two apart: the old behaviour sent a request for each one.
    for (let i = 1; i <= 5; i++) {
      await context.setGeolocation({ latitude: paris.latitude + i * 0.00001, longitude: paris.longitude });
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    expect(counts.photon).toBe(1);
    expect(counts.bigdata + counts.nominatim).toBe(0);
  });

  test('moving a long way looks up the new place', async ({ page, context }) => {
    await page.route('**/photon.komoot.io/**', route => {
      const lat = Number(new URL(route.request().url()).searchParams.get('lat'));
      return route.fulfill(photonReply(lat > 48.87 ? 'Gare du Nord' : 'Champ de Mars'));
    });
    await openCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();

    await context.setGeolocation({ latitude: 48.8809, longitude: 2.3553 }); // about 3 km north
    await expect(page.getByText('Gare du Nord, Paris, France')).toBeVisible();
  });

  test('falls back to the next service when the first one is blocked', async ({ page, context }) => {
    const counts = countRequests(page);
    // Photon is blocked by the safety net (aborted, which is how a rate limit looks in a browser).
    await page.route('**/api.bigdatacloud.net/**', route =>
      route.fulfill({ json: { locality: 'Gros-Caillou', city: 'Paris', countryName: 'France' } }),
    );
    await openCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Gros-Caillou, Paris, France')).toBeVisible();
    expect(counts.photon).toBe(1);
    expect(counts.bigdata).toBe(1);
  });

  test('when every service fails: says so, offers Retry, and recovers when one works', async ({ page, context }) => {
    await openCamera(page, context);
    await page.goto(`${SITE}/cam`);

    await expect(page.getByText('Address unavailable.')).toBeVisible();
    await expect(page.getByText(/lookup failed|Fetching address/i)).toHaveCount(0);

    // A service comes back; the user taps Retry.
    await mockGeocoder(page);
    await page.getByRole('button', { name: 'Retry address lookup' }).click();
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
    await expect(page.getByText('Address unavailable.')).toHaveCount(0);
  });

  test('a photo taken without an address never carries a failure message', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await openCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Address unavailable.')).toBeVisible();

    const capture = page.getByRole('button', { name: 'Capture photo' });
    await expect(capture).toBeEnabled(); // an address is not required to take a photo
    await capture.click();
    await page.waitForTimeout(400);

    const stored = await page.evaluate(
      () =>
        new Promise<Array<{ location: { address?: string } | null }>>((resolve, reject) => {
          const open = indexedDB.open('keyval-store');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const req = open.result.transaction('keyval').objectStore('keyval').get('spotcam-photos');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          };
        }),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].location?.address).toBeUndefined();
  });

  test('the first lookup is retried automatically after a short wait', async ({ page, context }) => {
    // First attempt fails everywhere; after that Photon works. The address should appear without any tap.
    let allow = false;
    await page.route('**/photon.komoot.io/**', route => (allow ? route.fulfill(photonReply('Champ de Mars')) : route.abort('failed')));
    await openCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Address unavailable.')).toBeVisible();
    allow = true;
    // The back-off is about 5 s (jittered +/-20%) for the first failure.
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible({ timeout: 15_000 });
  });
});
