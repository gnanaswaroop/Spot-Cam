/**
 * @file Optional website analytics, switched on only by deploy-time configuration.
 *
 * The repository names no analytics account, domain or vendor ID. At startup the app asks for
 * `analytics.config.json` next to the page. That file does not exist in the repository, in local
 * builds, in tests or in forks; the deploy workflow writes it from repository variables. With no
 * file, nothing here does anything: no banner, no script, no network request.
 *
 * With a file, the Google Tag Manager container is added only AFTER the visitor accepts, and never when
 * the browser sends Do Not Track or Global Privacy Control. The site only pushes event names to the
 * data layer; which tags (Google Analytics, others) run on them is decided in the GTM container.
 * Nothing from a photo or the stamp (coordinates, address, image) is ever pushed, and page views carry
 * the path without any query string.
 */

export interface AnalyticsConfig {
  provider: 'gtm';
  /** The Google Tag Manager container ID, like GTM-XXXXXX. It is visible in any page that uses GTM by design. */
  id: string;
}

export type Consent = 'granted' | 'denied' | undefined;

/**
 * The events the site can send, and the only option each may carry. To add an event: list it here,
 * call `track()` where it happens, then add a trigger for it in the GTM container.
 */
export const EVENTS = {
  start_cam: [],
  photo_captured: [],
  share_used: [],
  permission_blocked: ['camera', 'location'],
  pwa_installed: [],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENTS;

const CONSENT_KEY = 'spotcam.analytics';
const CONTAINER_ID = /^GTM-[A-Z0-9]{4,20}$/;

/** Checks an untrusted config file. Anything unexpected means analytics stays off. */
export function parseConfig(data: unknown): AnalyticsConfig | null {
  if (typeof data !== 'object' || data === null) return null;
  const { provider, id } = data as Record<string, unknown>;
  if ((provider ?? 'gtm') !== 'gtm') return null;
  if (typeof id !== 'string' || !CONTAINER_ID.test(id)) return null;
  return { provider: 'gtm', id };
}

/** The address of the page without a query string or fragment. */
export const cleanLocation = (href: string): string => {
  const url = new URL(href);
  return `${url.origin}${url.pathname}`;
};

/** True when the browser asks not to be tracked (Do Not Track or Global Privacy Control). */
export function trackingOptOut(nav: Pick<Navigator, 'doNotTrack'> & { globalPrivacyControl?: boolean } = navigator): boolean {
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

export function readConsent(storage: Pick<Storage, 'getItem'> = localStorage): Consent {
  try {
    const value = storage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : undefined;
  } catch {
    return undefined; // storage blocked: ask again next time
  }
}

export function writeConsent(value: 'granted' | 'denied', storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(CONSENT_KEY, value);
  } catch {
    /* the choice just won't be remembered */
  }
}

/** Fetches the deploy-time config; null (and no side effects) when the site has none. */
export async function loadConfig(baseUrl = import.meta.env.BASE_URL): Promise<AnalyticsConfig | null> {
  try {
    const res = await fetch(`${baseUrl}analytics.config.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseConfig(await res.json());
  } catch {
    return null; // offline, a 404 page, or not JSON
  }
}

type DataLayerWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

let started: AnalyticsConfig | null = null;

/**
 * Events that happen while the config is still loading or the visitor has not chosen yet. They stay in
 * memory only, are sent after an Accept, and are thrown away on a Decline or when the page closes.
 */
const waiting: [EventName, string | undefined][] = [];
const MAX_WAITING = 20;

/**
 * Adds the Google Tag Manager container. Called only after consent. Safe to call more than once.
 * Consent commands use the gtag form (the `arguments` object), which GTM reads as consent settings;
 * everything else is a plain object on the data layer.
 */
export function startAnalytics(config: AnalyticsConfig): void {
  if (started) return;
  started = config;
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  // Consent defaults must be set before the container loads, so its tags wait for the choice below.
  w.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  // The visitor said yes to analytics, and only to analytics.
  w.gtag('consent', 'update', { analytics_storage: 'granted' });

  // The same start the standard Tag Manager snippet makes, then the container's own loader.
  w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(config.id)}`;
  document.head.appendChild(script);
  for (const [name, option] of waiting.splice(0)) send(name, option);
}

/** Stops sending (the page keeps working) and clears Google's cookies for this site. */
export function stopAnalytics(): void {
  waiting.length = 0;
  const w = window as DataLayerWindow;
  if (started) w.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  for (const name of document.cookie.split(';').map(c => c.split('=')[0].trim())) {
    if (name === '_ga' || name.startsWith('_ga_')) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** Pushes a page view. Does nothing until analytics has been started. */
export function pageView(pathname: string): void {
  const w = window as DataLayerWindow;
  if (!started || !w.dataLayer) return;
  w.dataLayer.push({
    event: 'page_view',
    page_location: cleanLocation(window.location.href),
    page_path: pathname,
    page_title: document.title,
  });
}

const send = (name: EventName, option: string | undefined) => {
  const w = window as DataLayerWindow;
  if (!w.dataLayer) return;
  w.dataLayer.push(option !== undefined ? { event: name, option } : { event: name });
};

/** Pushes one of the known events to the data layer. Anything else is dropped. */
export function track<E extends EventName>(name: E, option?: (typeof EVENTS)[E][number]): void {
  if (!(name in EVENTS)) return;
  const allowed: readonly string[] = EVENTS[name];
  if (option !== undefined && !allowed.includes(option)) return;
  if (started) send(name, option);
  else if (waiting.length < MAX_WAITING) waiting.push([name, option]);
}
