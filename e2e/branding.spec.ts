/**
 * Branding assets: the favicon and the PNG icons are present, correctly sized, linked from the page
 * and the manifest, and actually rendered by the app.
 */
import { test, expect } from './fixtures';
import { SITE } from './helpers';

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (body: Buffer) => ({ width: body.readUInt32BE(16), height: body.readUInt32BE(20) });

test.describe('branding', () => {
  test('favicon.svg is the V2 logo (white border, location pin, clock and 00:00 stamp)', async ({ request }) => {
    const res = await request.get(`${SITE}/favicon.svg`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('svg');
    const svg = await res.text();
    expect(svg).toContain('Outer White Border Silhouette');
    expect(svg).toContain('Central Location Pin');
    expect(svg).toContain('Digital Timestamp');
    // Static artwork only: no scripts and no external references.
    expect(svg).not.toMatch(/<script|href="https?:|xlink:href/i);
  });

  for (const [file, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ] as const) {
    test(`${file} is a ${size}x${size} PNG`, async ({ request }) => {
      const res = await request.get(`${SITE}/${file}`);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
      expect(pngSize(await res.body())).toEqual({ width: size, height: size });
    });
  }

  test('the page and the manifest point at icons that exist', async ({ page, request }) => {
    await page.goto(`${SITE}/`);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => (l as HTMLLinkElement).href),
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);

    const manifestHref = await page.evaluate(() => (document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null)?.href);
    expect(manifestHref).toBeTruthy();
    const manifest = await (await request.get(manifestHref!)).json();
    for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
      const res = await request.get(new URL(icon.src, manifestHref!).href);
      expect(res.status(), icon.src).toBe(200);
      const { width } = pngSize(await res.body());
      expect(`${width}x${width}`).toBe(icon.sizes);
    }
  });

  test('the logo renders on the landing and privacy pages', async ({ page }) => {
    for (const path of ['/', '/privacy']) {
      await page.goto(`${SITE}${path}`);
      const loaded = await page.locator('img[src$="favicon.svg"]').first().evaluate((img: HTMLImageElement) => img.decode().then(() => img.naturalWidth > 0));
      expect(loaded, path).toBe(true);
    }
  });
});
