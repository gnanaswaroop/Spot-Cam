/**
 * @file Optional website analytics, switched on only by deploy-time configuration.
 *
 * The repository names no analytics account, domain or vendor ID. At startup the app asks for
 * `analytics.config.json` next to the page. That file does not exist in the repository, in local
 * builds, in tests or in forks; the deploy workflow writes it from repository variables. With no
 * file, nothing here does anything: no banner, no script, no network request.
 *
 * With a file, the provider's script is added only AFTER the visitor accepts, and never when the
 * browser sends Do Not Track or Global Privacy Control. Only a short list of event names is ever
 * sent, with at most one coarse option each. Nothing from a photo or the stamp (coordinates, address,
 * image) goes to analytics, and page views carry the path without any query string.
 */

export interface AnalyticsConfig {
  provider: 'ga4';
  /** The GA4 measurement ID, like G-XXXXXXXXXX. It is visible in any page that uses GA4 by design. */
  id: string;
}

export type Consent = 'granted' | 'denied' | undefined;

/** The only events that can be sent, and the only option each may carry. */
export const EVENTS = {
  start_cam: [],
  photo_captured: [],
  share_used: [],
  permission_blocked: ['camera', 'location'],
  pwa_installed: [],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENTS;

const CONSENT_KEY = 'spotcam.analytics';
const GA_ID = /^G-[A-Z0-9]{4,20}$/;

/** Checks an untrusted config file. Anything unexpected means analytics stays off. */
export function parseConfig(data: unknown): AnalyticsConfig | null {
  if (typeof data !== 'object' || data === null) return null;
  const { provider, id } = data as Record<string, unknown>;
  if ((provider ?? 'ga4') !== 'ga4') return null;
  if (typeof id !== 'string' || !GA_ID.test(id)) return null;
  return { provider: 'ga4', id };
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

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

let started: AnalyticsConfig | null = null;

/**
 * Events that happen while the config is still loading or the visitor has not chosen yet. They stay in
 * memory only, are sent after an Accept, and are thrown away on a Decline or when the page closes.
 */
const waiting: [EventName, string | undefined][] = [];
const MAX_WAITING = 20;

/** Adds the Google tag. Called only after consent. Safe to call more than once. */
export function startAnalytics(config: AnalyticsConfig): void {
  if (started) return;
  started = config;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  // gtag must push the `arguments` object itself, which is what the Google tag reads.
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  w.gtag('js', new Date());
  w.gtag('config', config.id, {
    send_page_view: false, // we send them ourselves on every route change
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: cleanLocation(window.location.href),
  });
  // The visitor said yes to analytics, and only to analytics.
  w.gtag('consent', 'update', { analytics_storage: 'granted' });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.id)}`;
  document.head.appendChild(script);
  for (const [name, option] of waiting.splice(0)) send(name, option);
}

/** Stops sending (the page keeps working) and clears Google's cookies for this site. */
export function stopAnalytics(): void {
  waiting.length = 0;
  const w = window as unknown as GtagWindow & Record<string, unknown>;
  if (started) {
    w[`ga-disable-${started.id}`] = true;
    w.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  }
  for (const name of document.cookie.split(';').map(c => c.split('=')[0].trim())) {
    if (name === '_ga' || name.startsWith('_ga_')) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** Counts a page view. Does nothing until analytics has been started. */
export function pageView(pathname: string): void {
  const w = window as GtagWindow;
  if (!started || !w.gtag) return;
  w.gtag('event', 'page_view', {
    page_location: cleanLocation(window.location.href),
    page_path: pathname,
    page_title: document.title,
  });
}

const send = (name: EventName, option: string | undefined) => {
  (window as GtagWindow).gtag?.('event', name, option !== undefined ? { option } : {});
};

/** Counts one of the known events. Anything else is dropped. */
export function track<E extends EventName>(name: E, option?: (typeof EVENTS)[E][number]): void {
  if (!(name in EVENTS)) return;
  const allowed: readonly string[] = EVENTS[name];
  if (option !== undefined && !allowed.includes(option)) return;
  if (started) send(name, option);
  else if (waiting.length < MAX_WAITING) waiting.push([name, option]);
}
