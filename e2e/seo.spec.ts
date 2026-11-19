/**
 * What a crawler or link preview sees: the raw HTML of each page, read without running any JavaScript.
 * (The build is made with a placeholder SITE_URL, see playwright.config.ts.)
 */
import { test, expect } from './fixtures';
import { SITE } from './helpers';

const PUBLIC_PAGES = [
  { path: '/', h1: 'SpotCam: free timestamp camera', canonical: '/' },
  { path: '/how-it-works/', h1: 'How SpotCam works', canonical: '/how-it-works/' },
  { path: '/privacy/', h1: 'Privacy Policy', canonical: '/privacy/' },
];

const meta = (html: string, attr: string, name: string) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];

test.describe('initial HTML, no JavaScript needed', () => {
  const html: Record<string, string> = {};
  test.beforeAll(async ({ request }) => {
    for (const path of ['/', '/home/', '/how-it-works/', '/privacy/', '/cam/', '/gallery/', '/settings/', '/does-not-exist']) {
      html[path] = await (await request.get(`${SITE}${path}`)).text();
    }
  });

  for (const { path, h1, canonical } of PUBLIC_PAGES) {
    test(`${path} has its own title, description, canonical and content`, () => {
      const page = html[path];
      expect(page).toContain(`<h1>${h1}`);
      expect(page).toMatch(/<title>[^<]{10,}<\/title>/);
      expect(meta(page, 'name', 'description')!.length).toBeGreaterThan(50);
      expect(page).toContain(`<link rel="canonical" href="https://example.test${canonical}" />`);
      expect(meta(page, 'name', 'robots')).toBe('index,follow');
    });
  }

  test('titles and descriptions differ between the public pages', () => {
    const titles = PUBLIC_PAGES.map(p => html[p.path].match(/<title>([^<]*)/)![1]);
    const descriptions = PUBLIC_PAGES.map(p => meta(html[p.path], 'name', 'description'));
    expect(new Set(titles).size).toBe(PUBLIC_PAGES.length);
    expect(new Set(descriptions).size).toBe(PUBLIC_PAGES.length);
  });

  test('/home names / as its original', () => {
    expect(html['/home/']).toContain('<link rel="canonical" href="https://example.test/" />');
  });

  test('the camera, gallery and settings are noindex, and unknown addresses are too', () => {
    for (const path of ['/cam/', '/gallery/', '/settings/', '/does-not-exist']) {
      expect(meta(html[path], 'name', 'robots'), path).toBe('noindex,follow');
    }
  });

  test('the landing page links to the camera, privacy and how-it-works pages with real links', () => {
    for (const href of ['/cam', '/privacy/', '/how-it-works/']) {
      expect(html['/'], href).toContain(`href="${href}"`);
    }
  });

  test('link previews get a large card image and structured data', () => {
    expect(meta(html['/'], 'property', 'og:image')).toBe('https://example.test/social-card.png');
    expect(meta(html['/'], 'name', 'twitter:card')).toBe('summary_large_image');
    expect(html['/']).toContain('"@type":"WebApplication"');
    expect(html['/how-it-works/']).toContain('"@type":"FAQPage"');
  });

  test('the social card is a 1200x630 PNG', async ({ request }) => {
    const res = await request.get(`${SITE}/social-card.png`);
    expect(res.status()).toBe(200);
    const png = await res.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});

test.describe('in the browser', () => {
  test('Start Cam is a real link to the camera', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('link', { name: 'Start Cam' })).toHaveAttribute('href', '/cam');
  });

  test('the how-it-works page opens from the landing page and the title follows', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: 'How it works' }).click();
    await expect(page).toHaveURL(`${SITE}/how-it-works`);
    await expect(page.getByRole('heading', { name: 'How SpotCam works', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/How SpotCam works/);
    await page.getByRole('link', { name: 'Start Cam' }).click();
    await expect(page).toHaveURL(`${SITE}/cam`);
  });

  test('the app replaces the static content without duplicating it', async ({ page }) => {
    await page.goto(`${SITE}/how-it-works/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
  });
});
