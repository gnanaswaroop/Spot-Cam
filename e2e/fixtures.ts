/**
 * Shared test fixtures. Import `test` and `expect` from here instead of '@playwright/test'.
 *
 * Safety net: every test blocks the real address services (Photon, BigDataCloud, Nominatim) by default,
 * so a test that forgets to mock them can never send requests from the developer's IP address and get
 * it rate limited. Tests that need an answer register their own routes, which take precedence.
 */
import { test as base, expect } from '@playwright/test';

export const GEOCODER_HOSTS = /(photon\.komoot\.io|api\.bigdatacloud\.net|nominatim\.openstreetmap\.org)/;

export const test = base.extend<{ blockRealGeocoders: void }>({
  blockRealGeocoders: [
    async ({ context }, use) => {
      await context.route(GEOCODER_HOSTS, route => route.abort('failed'));
      await use();
    },
    { auto: true },
  ],
});

export { expect };
