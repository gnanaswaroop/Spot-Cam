import { describe, expect, it } from 'vitest';
import { INDEXABLE_PATHS, absoluteUrl, buildRobots, buildSitemap } from '../../utils/sitemap';

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

describe('sitemap', () => {
  it('lists the indexable pages as absolute URLs', () => {
    expect(locs(buildSitemap('https://example.com'))).toEqual([
      'https://example.com/',
      'https://example.com/how-it-works/',
      'https://example.com/privacy/',
    ]);
  });

  it('does not list the camera or gallery tools', () => {
    const urls = locs(buildSitemap('https://example.com'));
    expect(urls.some(u => u.includes('/cam') || u.includes('/gallery') || u.includes('/home'))).toBe(false);
  });

  it('has no duplicates and tolerates a trailing slash on the origin', () => {
    const urls = locs(buildSitemap('https://example.com/', ['/', '/', '/privacy/']));
    expect(urls).toEqual(['https://example.com/', 'https://example.com/privacy/']);
  });

  it('is well formed XML with the sitemap namespace', () => {
    const xml = buildSitemap('https://example.com');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });

  it('escapes characters that are special in XML', () => {
    expect(buildSitemap('https://example.com', ['/a?x=1&y=2'])).toContain('/a?x=1&amp;y=2');
  });

  it('joins origin and path without double slashes', () => {
    expect(absoluteUrl('https://example.com/', '/privacy/')).toBe('https://example.com/privacy/');
    expect(absoluteUrl('https://example.com', 'privacy/')).toBe('https://example.com/privacy/');
  });

  it('only lists pages that really exist as routes', () => {
    expect(INDEXABLE_PATHS).toEqual(['/', '/how-it-works/', '/privacy/']);
  });
});

describe('robots.txt', () => {
  it('allows crawling and points at the sitemap', () => {
    const robots = buildRobots('https://example.com');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('names no sitemap when there is no site address', () => {
    expect(buildRobots()).toBe('User-agent: *\nAllow: /\n');
  });
});
