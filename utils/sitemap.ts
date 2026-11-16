/** Pages that belong in search results. The camera and gallery are tools, not content. */
export const INDEXABLE_PATHS = ['/', '/how-it-works/', '/privacy/'];

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Joins the site origin and a path into an absolute URL (no double slashes). */
export const absoluteUrl = (origin: string, pagePath: string) =>
  `${origin.replace(/\/+$/, '')}/${pagePath.replace(/^\/+/, '')}`;

export const buildSitemap = (origin: string, paths: string[] = INDEXABLE_PATHS): string => {
  const urls = [...new Set(paths.map(p => absoluteUrl(origin, p)))];
  const items = urls.map(u => `  <url><loc>${escapeXml(u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
};

/** Without an origin there is no absolute sitemap address to name, so the Sitemap line is left out. */
export const buildRobots = (origin?: string): string =>
  `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${absoluteUrl(origin, '/sitemap.xml')}\n` : ''}`;
