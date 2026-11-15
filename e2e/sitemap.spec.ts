import { test, expect } from './fixtures';
import { SITE } from './helpers';

// Runs against the production build on the Pages-like static server.
test.describe('sitemap and robots.txt', () => {
  test('sitemap.xml is served as XML and lists only real, indexable pages', async ({ request }) => {
    const res = await request.get(`${SITE}/sitemap.xml`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, 'absolute https URL').toMatch(/^https:\/\//);
      const pagePath = new URL(url).pathname;
      expect((await request.get(`${SITE}${pagePath}`)).status(), pagePath).toBe(200);
    }
    expect(urls.some(u => /\/(cam|gallery|home)\/?$/.test(u))).toBe(false);
  });

  test('robots.txt allows crawling and names the sitemap', async ({ request }) => {
    const res = await request.get(`${SITE}/robots.txt`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('Allow: /');
    expect(body).toMatch(/Sitemap: https:\/\/\S+\/sitemap\.xml/);
  });
});
