/**
 * @file Search-engine and link-preview metadata for every page, and the build step that writes it into
 * each page's HTML. The app is a single-page app, so without this every route would ship the same
 * `<head>` and an empty `<div id="root">`.
 *
 * Nothing here knows the live domain: the origin comes from the SITE_URL build variable. Without it
 * the pages simply have no canonical or absolute social-card URLs.
 */
import { FAQ, HOW_IT_WORKS_INTRO, HOW_STEPS, USE_CASES } from '../content/howItWorks';
import { TAGLINE } from './constants';
import { absoluteUrl } from './sitemap';

export interface SeoPage {
  /** Folder in dist/ ('' for the home page). */
  dir: string;
  title: string;
  description: string;
  /** Whether the page belongs in search results. The camera and gallery are tools, not content. */
  index: boolean;
  /** The address search engines should treat as the original of this page. */
  canonical: string;
  /** Static content placed in #root, for crawlers and previews. React replaces it as soon as it runs. */
  body: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DESCRIPTION = 'Free online timestamp camera. Stamps the date, time, GPS location and address onto every photo. Private: photos never leave your device.';
const LANDING_TITLE = 'SpotCam: Free Timestamp Camera with GPS Location';
const LANDING_DESCRIPTION =
  'Free timestamp camera in your browser. Photos with the date, time, GPS location and address stamped on. No app, no sign-up, and photos stay on your device.';

const nav = (base: string) =>
  `<nav aria-label="Pages"><a href="${base}cam">Start Cam</a> \u00b7 <a href="${base}how-it-works/">How it works</a> \u00b7 <a href="${base}privacy/">Privacy</a></nav>`;

const landingBody = (base: string) =>
  `<main><h1>SpotCam</h1><p>${TAGLINE}</p>` +
  `<p>A free timestamp camera that stamps the date, time and GPS location onto every photo.</p>` +
  `<ul><li>Date &amp; time</li><li>GPS &amp; address</li><li>Stays on your device</li></ul>${nav(base)}</main>`;

const howBody = (base: string) =>
  `<main><h1>How SpotCam works</h1><p>${esc(HOW_IT_WORKS_INTRO)}</p>` +
  `<h2>Three steps</h2><ol>${HOW_STEPS.map(s => `<li><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`).join('')}</ol>` +
  `<h2>What people use it for</h2><ul>${USE_CASES.map(u => `<li><strong>${esc(u.title)}.</strong> ${esc(u.text)}</li>`).join('')}</ul>` +
  `<h2>Questions</h2>${FAQ.map(f => `<h3>${esc(f.question)}</h3><p>${esc(f.answer)}</p>`).join('')}${nav(base)}</main>`;

const privacyBody = (base: string) =>
  `<main><h1>Privacy Policy</h1><p>SpotCam has no accounts, no ads and no servers that receive your photos. ` +
  `Your photos are made and kept on your own device. The one thing that leaves it is your location, sent to a public map service to look up the street address.</p>${nav(base)}</main>`;

const toolBody = (title: string, base: string) => `<main><h1>${esc(title)}</h1><p>Open <a href="${base}">SpotCam</a> to use the camera.</p></main>`;

/** All pages. `base` is Vite's base path ('/' on the custom domain). */
export const seoPages = (base = '/'): SeoPage[] => [
  { dir: '', title: LANDING_TITLE, description: LANDING_DESCRIPTION, index: true, canonical: '/', body: landingBody(base) },
  // /home is the landing page under another name; its canonical points at /.
  { dir: 'home', title: LANDING_TITLE, description: LANDING_DESCRIPTION, index: true, canonical: '/', body: landingBody(base) },
  {
    dir: 'how-it-works',
    title: 'How SpotCam works: timestamp and GPS camera | SpotCam',
    description: 'How to take photos with the date, time, GPS location and address stamped on them, what it is used for, and answers to common questions.',
    index: true,
    canonical: '/how-it-works/',
    body: howBody(base),
  },
  {
    dir: 'privacy',
    title: 'Privacy Policy | SpotCam',
    description: 'SpotCam has no accounts and no ads, and photos stay on your device. What the camera, location and address lookup use, and why.',
    index: true,
    canonical: '/privacy/',
    body: privacyBody(base),
  },
  { dir: 'cam', title: 'Camera | SpotCam', description: DESCRIPTION, index: false, canonical: '/cam/', body: toolBody('Camera', base) },
  { dir: 'gallery', title: 'Gallery | SpotCam', description: DESCRIPTION, index: false, canonical: '/gallery/', body: toolBody('Gallery', base) },
  { dir: 'settings', title: 'Settings | SpotCam', description: DESCRIPTION, index: false, canonical: '/settings/', body: toolBody('Settings', base) },
];

/** The paths that belong in the sitemap. */
export const indexablePaths = (): string[] => seoPages().filter(p => p.index && p.dir !== 'home').map(p => (p.dir ? `/${p.dir}/` : '/'));

const jsonLd = (page: SeoPage, origin: string | undefined): object[] => {
  const data: object[] = [];
  if (page.dir === '') {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'SpotCam',
      description: LANDING_DESCRIPTION,
      featureList: ['Date and time on every photo', 'GPS coordinates and street address', 'Works offline', 'Photos stay on your device', 'Share with a map link'],
      applicationCategory: 'PhotographyApplication',
      operatingSystem: 'Any (runs in the browser)',
      browserRequirements: 'Requires a camera and JavaScript',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      ...(origin ? { url: absoluteUrl(origin, '/') } : {}),
    });
  }
  if (page.dir === 'how-it-works') {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
    });
  }
  return data;
};

/** The `<head>` tags that differ per page (everything shared stays in index.html). */
export const headTags = (page: SeoPage, origin: string | undefined): string => {
  const url = origin ? absoluteUrl(origin, page.canonical) : undefined;
  const image = origin ? absoluteUrl(origin, '/social-card.png') : undefined;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${page.index ? 'index,follow' : 'noindex,follow'}" />`,
    ...(url ? [`<link rel="canonical" href="${esc(url)}" />`, `<meta property="og:url" content="${esc(url)}" />`] : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="SpotCam" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    ...(image
      ? [
          `<meta property="og:image" content="${esc(image)}" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta property="og:image:alt" content="SpotCam: a photo with the date, time and location stamped on it" />`,
          `<meta name="twitter:image" content="${esc(image)}" />`,
        ]
      : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    ...jsonLd(page, origin).map(d => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ];
  return tags.map(t => `    ${t}`).join('\n');
};

/** Between these markers index.html holds placeholder tags that the build replaces. */
export const HEAD_START = '<!--seo:start-->';
export const HEAD_END = '<!--seo:end-->';

/** Fills the template (the built index.html) with one page's tags and static content. */
export const renderPage = (template: string, page: SeoPage, origin: string | undefined): string => {
  const head = new RegExp(`${HEAD_START}[\\s\\S]*?${HEAD_END}`);
  if (!head.test(template)) throw new Error('index.html is missing the seo:start/seo:end markers');
  return template
    .replace(head, () => `${HEAD_START}\n${headTags(page, origin)}\n    ${HEAD_END}`)
    .replace('<div id="root"></div>', () => `<div id="root">${page.body}</div>`);
};
