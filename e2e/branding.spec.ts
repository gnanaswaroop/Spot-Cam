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

  test('favicon.svg has a transparent background, so it suits light and dark browser tabs', async ({ page }) => {
    await page.goto(`${SITE}/`);
    const corners = await page.evaluate(async src => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 128, 128);
      const alpha = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
      return { corners: [alpha(1, 1), alpha(126, 1), alpha(1, 126), alpha(126, 126)], centre: alpha(64, 70) };
    }, `${SITE}/favicon.svg`);
    expect(corners.corners).toEqual([0, 0, 0, 0]); // nothing painted in the corners
    expect(corners.centre).toBe(255); // the artwork itself is solid
  });

  test('the app icons are full-bleed soft coral, the centre is the blue camera, and the splash colour matches', async ({ page, request }) => {
    await page.goto(`${SITE}/`);
    for (const file of ['icon-maskable-512.png', 'icon-512.png', 'icon-192.png', 'apple-touch-icon.png']) {
      const px = await page.evaluate(async url => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const at = (x: number, y: number) => [...ctx.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data];
        return { corner: at(0.02, 0.02), edge: at(0.5, 0.97), body: at(0.3, 0.55) };
      }, `${SITE}/${file}`);
      // Coral: strong red, medium green, little blue; fully opaque (the OS crops it into a circle or rounded square).
      for (const p of [px.corner, px.edge]) {
        expect(p[0], file).toBeGreaterThan(235);
        expect(p[1], file).toBeGreaterThan(125);
        expect(p[1], file).toBeLessThan(205);
        expect(p[2], file).toBeLessThan(140);
        expect(p[3], file).toBe(255);
      }
      // The camera body is blue.
      expect(px.body[2], file).toBeGreaterThan(px.body[0] + 60);
    }
    const manifest = await (await request.get(`${SITE}/manifest.webmanifest`)).json();
    expect(manifest.background_color.toLowerCase()).toBe('#fb923c');
  });

  test('the camera stays inside the safe zone of the maskable icon (the central 80% circle that Android keeps)', async ({ page }) => {
    await page.goto(`${SITE}/`);
    const reach = await page.evaluate(async url => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let farthest = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          // Anything that is not the coral background (the blue camera or its white outline).
          const isBackground = data[i] > 235 && data[i + 1] > 125 && data[i + 1] < 205 && data[i + 2] < 140;
          if (!isBackground) farthest = Math.max(farthest, Math.hypot(x - c.width / 2, y - c.height / 2));
        }
      }
      return { farthest, size: c.width };
    }, `${SITE}/icon-maskable-512.png`);
    expect(reach.farthest).toBeGreaterThan(reach.size * 0.25); // something is drawn
    expect(reach.farthest).toBeLessThanOrEqual(reach.size * 0.4);
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
