/** Unit tests for the build-time service worker helpers. No build or browser involved. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cacheVersion, isLanguageChunk, listPrecacheUrls, renderServiceWorker } from '../../utils/precache';

const built = [
  'index.html',
  'cam/index.html',
  'gallery/index.html',
  'assets/index-abc123.js',
  'assets/index-def456.css',
  'assets/hi-abc123.js',
  'assets/jsx-runtime-abc123.js',
  'favicon.svg',
  'manifest.webmanifest',
  'sample.jpg',
  '404.html',
  'sitemap.xml',
  'robots.txt',
  'version.txt',
  'sw.js',
  'screenshots/camera.png',
  'analytics.config.json',
];

describe('listPrecacheUrls', () => {
  it('maps pages to the URLs they are requested by, and keeps the app files', () => {
    expect(listPrecacheUrls(built)).toEqual([
      '/',
      '/assets/index-abc123.js',
      '/assets/index-def456.css',
      '/assets/jsx-runtime-abc123.js',
      '/cam/',
      '/favicon.svg',
      '/gallery/',
      '/manifest.webmanifest',
      '/sample.jpg',
    ]);
  });

  it('leaves the words of each language out (they are kept the first time they are used), but keeps other scripts', () => {
    const urls = listPrecacheUrls(built);
    expect(urls).not.toContain('/assets/hi-abc123.js');
    expect(urls).toContain('/assets/jsx-runtime-abc123.js');
    expect(isLanguageChunk('assets/hi-abc123.js')).toBe(true);
    expect(isLanguageChunk('assets/zh-A_b-1.js')).toBe(true);
    expect(isLanguageChunk('assets/index-abc123.js')).toBe(false);
    expect(isLanguageChunk('assets/jsx-runtime-abc123.js')).toBe(false);
  });

  it('never caches the version marker, the SEO files, the 404 page, the worker itself or the screenshots', () => {
    const urls = listPrecacheUrls(built).join(' ');
    for (const excluded of ['version.txt', 'sitemap.xml', 'robots.txt', '404.html', 'sw.js', 'screenshots', 'analytics.config.json']) {
      expect(urls).not.toContain(excluded);
    }
  });

  it('works under a sub-path base such as a GitHub project site', () => {
    const urls = listPrecacheUrls(built, '/Spot-Cam/');
    expect(urls).toContain('/Spot-Cam/');
    expect(urls).toContain('/Spot-Cam/cam/');
    expect(urls).toContain('/Spot-Cam/assets/index-abc123.js');
    expect(listPrecacheUrls(built, '/Spot-Cam')).toEqual(urls); // a missing trailing slash makes no difference
  });
});

describe('cacheVersion', () => {
  const entries = [
    { url: '/', content: '<html>a</html>' },
    { url: '/assets/x.js', content: 'console.log(1)' },
  ];

  it('is stable for the same content, whatever the order', () => {
    expect(cacheVersion(entries)).toBe(cacheVersion([...entries].reverse()));
    expect(cacheVersion(entries)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('changes when any file changes, so every release gets a fresh cache', () => {
    const changed = [entries[0], { ...entries[1], content: 'console.log(2)' }];
    expect(cacheVersion(changed)).not.toBe(cacheVersion(entries));
  });

  it('changes when a file is added or renamed', () => {
    expect(cacheVersion([...entries, { url: '/new.png', content: '' }])).not.toBe(cacheVersion(entries));
    expect(cacheVersion([{ ...entries[0], url: '/home/' }, entries[1]])).not.toBe(cacheVersion(entries));
  });
});

describe('renderServiceWorker', () => {
  const template = "const VERSION = '__VERSION__'; const BASE = '__BASE__'; const PRECACHE = __PRECACHE__;";

  it('fills in the version, base and file list as valid JavaScript', () => {
    const js = renderServiceWorker(template, { version: 'abc', urls: ['/', '/cam/'], base: '/' });
    expect(js).toContain("VERSION = 'abc'");
    expect(js).toContain("BASE = '/'");
    // The injected list parses back to exactly what was given.
    const list = js.slice(js.indexOf('PRECACHE = ') + 'PRECACHE = '.length, js.lastIndexOf(';'));
    expect(JSON.parse(list)).toEqual(['/', '/cam/']);
  });

  it('refuses to produce a worker with a placeholder left in it', () => {
    expect(() => renderServiceWorker(`${template} const X = '__MISSING__';`, { version: 'a', urls: [], base: '/' })).toThrow(/placeholders/);
  });
});

describe('the real service worker template', () => {
  const real = readFileSync(new URL('../../sw/sw.template.js', import.meta.url), 'utf8');

  it('fills the precache from the network, not from the browser\'s HTTP cache (a stale page next to new scripts opens blank offline)', () => {
    expect(real).toMatch(/new Request\(url, \{ cache: 'reload' \}\)/);
  });

  it('answers a page from the cache when the network fails', () => {
    expect(real).toMatch(/fallback\(\)/);
  });
});
