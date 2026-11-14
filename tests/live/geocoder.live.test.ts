/**
 * LIVE smoke test: checks that the real address services still answer in the shape our parsers expect.
 *
 * It is NOT part of `npm test` or CI, because it talks to free public servers. Run it by hand, rarely:
 *   npm run test:live
 *
 * It makes exactly ONE request per provider (3 in total, spaced out),
 * using the coordinates of a public landmark (the Eiffel Tower), never anyone's real location.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDERS } from '../../utils/geocoder';

const EIFFEL = { lat: 48.8584, lon: 2.2945 };
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('live address providers (one request each)', () => {
  for (const [index, provider] of DEFAULT_PROVIDERS.entries()) {
    it(`${provider.name} returns a parseable address for the Eiffel Tower`, async () => {
      if (index > 0) await pause(1500); // be polite: never two requests close together
      // Browsers always send a Referer; Nominatim's policy rejects anonymous clients without one.
      const response = await fetch(provider.url(EIFFEL.lat, EIFFEL.lon), { headers: { Referer: 'https://spotcam.in/' } });
      if (provider.name === 'nominatim' && (response.status === 403 || response.status === 429)) {
        // The last-resort service is reachable but limiting this IP right now. Do not retry; that only makes it worse.
        console.warn(`nominatim answered HTTP ${response.status} (limiting this IP): not treated as a failure`);
        return;
      }
      // For the others, a 429 means this IP is being limited right now; do not retry, just report it.
      expect(response.status, `${provider.name} answered HTTP ${response.status}`).toBe(200);
      const address = provider.parse(await response.json());
      expect(address, `${provider.name} gave no address`).toBeTruthy();
      expect(address!.toLowerCase()).toMatch(/paris|france/);
    }, 20_000);
  }
});
