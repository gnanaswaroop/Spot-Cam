import { describe, expect, it } from 'vitest';
import { HEAD_END, HEAD_START, headTags, indexablePaths, renderPage, seoPages } from '../../utils/seo';
import { INDEXABLE_PATHS } from '../../utils/sitemap';

const template = `<head>\n    ${HEAD_START}\n    <title>x</title>\n    ${HEAD_END}\n  </head><body><div id="root"></div></body>`;
const page = (dir: string) => seoPages().find(p => p.dir === dir)!;

describe('seo pages', () => {
  it('gives every page its own title and canonical, except /home which points at /', () => {
    const pages = seoPages();
    const titles = pages.filter(p => p.dir !== 'home').map(p => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(page('home').canonical).toBe('/');
    const canonicals = pages.filter(p => p.dir !== 'home').map(p => p.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it('keeps titles and descriptions within search-result length', () => {
    for (const p of seoPages()) {
      expect(p.title.length, p.dir).toBeLessThanOrEqual(65);
      expect(p.description.length, p.dir).toBeLessThanOrEqual(165);
    }
  });

  it('indexes the content pages and keeps the tools out', () => {
    const indexed = seoPages().filter(p => p.index && p.dir !== 'home').map(p => p.dir);
    expect(indexed).toEqual(['', 'how-it-works', 'privacy']);
    expect(page('gallery').index).toBe(false);
    expect(page('cam').index).toBe(false);
  });

  it('lists the same pages in the sitemap', () => {
    expect(indexablePaths()).toEqual(INDEXABLE_PATHS);
  });

  it('has a heading and crawlable links on the pages with content', () => {
    for (const dir of ['', 'how-it-works', 'privacy']) {
      expect(page(dir).body, dir).toMatch(/<h1>/);
    }
    expect(page('').body).toContain('href="/cam"');
    expect(page('').body).toContain('href="/privacy/"');
  });
});

describe('head tags', () => {
  it('writes canonical, Open Graph and robots tags with the site origin', () => {
    const tags = headTags(page('privacy'), 'https://example.com');
    expect(tags).toContain('<link rel="canonical" href="https://example.com/privacy/" />');
    expect(tags).toContain('<meta property="og:url" content="https://example.com/privacy/" />');
    expect(tags).toContain('<meta property="og:image" content="https://example.com/social-card.png" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).toContain('content="index,follow"');
  });

  it('marks the tools noindex', () => {
    expect(headTags(page('gallery'), 'https://example.com')).toContain('content="noindex,follow"');
  });

  it('names no domain and no canonical when there is no site origin', () => {
    const tags = headTags(page(''), undefined);
    expect(tags).not.toContain('canonical');
    expect(tags).not.toContain('http://');
    expect(tags).not.toContain('og:image"');
    expect(tags).toContain('<meta name="twitter:card" content="summary" />');
  });

  it('adds structured data to the landing page and the FAQ', () => {
    expect(headTags(page(''), undefined)).toContain('"@type":"WebApplication"');
    expect(headTags(page('how-it-works'), undefined)).toContain('"@type":"FAQPage"');
    expect(headTags(page('privacy'), undefined)).not.toContain('ld+json');
  });
});

describe('renderPage', () => {
  it('replaces the placeholder head and fills the root', () => {
    const html = renderPage(template, page('privacy'), 'https://example.com');
    expect(html).toContain('<title>Privacy Policy | SpotCam</title>');
    expect(html).not.toContain('<title>x</title>');
    expect(html).toMatch(/<div id="root"><main><h1>Privacy Policy<\/h1>/);
  });

  it('fails loudly if the markers are missing', () => {
    expect(() => renderPage('<head></head>', page(''), undefined)).toThrow(/seo:start/);
  });
});
