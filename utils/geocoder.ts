/**
 * @file Reverse geocoding (coordinates -> street address) that is gentle on free public services.
 *
 * Why this exists: the public Nominatim server answers HTTP 429 ("too many requests") when a client
 * looks up an address on every GPS update, and browsers hide that status behind a CORS error. So:
 *  - a looked-up address is kept in a persistent cache (IndexedDB on the device) and reused for any
 *    point within a radius of where it was found, so a known place costs no request, even after a
 *    reload; only the address text is reused, never the coordinates;
 *  - only one request is ever in flight;
 *  - lookups are spaced out (`minIntervalMs`);
 *  - providers are tried in order, and one that fails is skipped for a cool-down that grows with
 *    each consecutive failure (jittered exponential backoff, capped) - a circuit breaker;
 *  - any failure is treated as a possible rate limit, because the real status is not readable.
 *
 * Everything with side effects (fetch, clock, randomness) is injectable so it can be unit tested
 * without touching the network.
 */

import { get, set } from 'idb-keyval';
import { distanceMeters } from './geo';

/** One successful lookup: where it was made, the address found, and when it was made and last used. */
export interface CacheEntry {
  latitude: number;
  longitude: number;
  address: string;
  at: number;
  used: number;
}

/** Where the cache is kept between visits. Tests pass a fake; the app uses IndexedDB. */
export interface AddressStore {
  load(): Promise<CacheEntry[]>;
  save(entries: CacheEntry[]): Promise<void>;
}

/** IndexedDB (via idb-keyval) on this device only. Failures are swallowed: the cache then lives in memory. */
export function idbAddressStore(key = 'address-cache-v1'): AddressStore {
  return {
    async load() {
      try {
        const saved = await get<CacheEntry[]>(key);
        return Array.isArray(saved) ? saved : [];
      } catch {
        return [];
      }
    },
    async save(entries) {
      try {
        await set(key, entries);
      } catch {
        // IndexedDB unavailable (for example some private modes): keep working from memory.
      }
    },
  };
}

export interface AddressProvider {
  /** Short name, also used as the key for its circuit breaker. */
  name: string;
  /** Request URL for a coordinate. */
  url(lat: number, lon: number): string;
  /** Turns the JSON response into an address line, or null if it holds no usable address. */
  parse(data: unknown): string | null;
}

export type LookupResult =
  | { status: 'ok'; address: string; provider: string; cached: boolean }
  /**
   * No address now. `retryAt` (epoch ms) is the earliest time another attempt is worthwhile.
   * `throttled` only means "too soon after the last lookup"; `unavailable` means the services failed.
   */
  | { status: 'failed'; retryAt: number; reason: 'throttled' | 'unavailable' };

export interface GeocoderOptions {
  providers: AddressProvider[];
  fetchFn: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  now: () => number;
  random: () => number;
  timeoutMs: number;
  /** Minimum gap between the starts of two lookups. */
  minIntervalMs: number;
  /** First cool-down after a provider fails; doubles on each consecutive failure. */
  baseCooldownMs: number;
  maxCooldownMs: number;
  /** A cached address is reused for any point within this many metres of where it was looked up. */
  cacheRadiusM: number;
  /** Least recently used entries are dropped past this count (about 200 entries is roughly 40 KB). */
  cacheMaxEntries: number;
  /** Entries older than this are ignored, so renamed streets and new buildings are picked up eventually. */
  cacheTtlMs: number;
  /** Where the cache is kept between visits. Omitted: memory only. */
  store?: AddressStore;
}

/** Joins the non-empty parts, dropping repeats (case-insensitive), e.g. a city named the same as its state. */
export function joinAddress(parts: unknown[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = typeof part === 'string' || typeof part === 'number' ? String(part).trim() : '';
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out.length ? out.join(', ') : null;
}

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

/** Photon (komoot.io), OpenStreetMap data, street-level detail. */
export const photonProvider: AddressProvider = {
  name: 'photon',
  url: (lat, lon) => `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`,
  parse(data) {
    const features = asObject(data)?.features;
    const props = Array.isArray(features) ? asObject(asObject(features[0])?.properties) : null;
    if (!props) return null;
    const street = props.street ? [props.housenumber, props.street].filter(Boolean).join(' ') : null;
    return joinAddress([props.name, street, props.district, props.city, props.state, props.postcode, props.country]);
  },
};

/** BigDataCloud client-side reverse geocoding: free, no key, but only down to locality level. */
export const bigDataCloudProvider: AddressProvider = {
  name: 'bigdatacloud',
  url: (lat, lon) =>
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
  parse(data) {
    const d = asObject(data);
    if (!d) return null;
    return joinAddress([d.locality, d.city, d.principalSubdivision, d.postcode, d.countryName]);
  },
};

/** OpenStreetMap Nominatim: the most detailed, but strictly rate limited, so it is the last resort. */
export const nominatimProvider: AddressProvider = {
  name: 'nominatim',
  url: (lat, lon) => `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
  parse(data) {
    const name = asObject(data)?.display_name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  },
};

export const DEFAULT_PROVIDERS: AddressProvider[] = [photonProvider, bigDataCloudProvider, nominatimProvider];

export function createGeocoder(overrides: Partial<GeocoderOptions> = {}) {
  const o: GeocoderOptions = {
    providers: DEFAULT_PROVIDERS,
    fetchFn: (url, init) => fetch(url, init),
    now: () => Date.now(),
    random: Math.random,
    timeoutMs: 8000,
    minIntervalMs: 1000,
    baseCooldownMs: 5000,
    maxCooldownMs: 60_000,
    cacheRadiusM: 50,
    cacheMaxEntries: 200,
    cacheTtlMs: 30 * 24 * 60 * 60 * 1000,
    ...overrides,
  };

  // Persistent, location-aware cache: entries are kept most recently used first.
  let entries: CacheEntry[] = [];
  const isFresh = (e: CacheEntry) => o.now() - e.at <= o.cacheTtlMs;
  const ready: Promise<void> = o.store
    ? o.store
        .load()
        .catch((): CacheEntry[] => [])
        .then(saved => {
          entries = saved.filter(isFresh).sort((a, b) => b.used - a.used).slice(0, o.cacheMaxEntries);
        })
    : Promise.resolve();
  const persist = () => {
    o.store?.save(entries).catch(() => undefined); // a failed save only means the next visit starts colder
  };

  const findNearby = (lat: number, lon: number): CacheEntry | undefined => {
    let best: CacheEntry | undefined;
    let bestDistance = Infinity;
    for (const e of entries) {
      if (!isFresh(e)) continue;
      const d = distanceMeters(lat, lon, e.latitude, e.longitude);
      if (d <= o.cacheRadiusM && d < bestDistance) {
        best = e;
        bestDistance = d;
      }
    }
    return best;
  };

  const remember = (lat: number, lon: number, address: string) => {
    const t = o.now();
    entries = [{ latitude: lat, longitude: lon, address, at: t, used: t }, ...entries.filter(isFresh)]
      .sort((a, b) => b.used - a.used)
      .slice(0, o.cacheMaxEntries);
    persist();
  };

  const breakers = new Map<string, { failures: number; until: number }>();
  let nextAllowedAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const cooldown = (failures: number) => {
    const base = Math.min(o.maxCooldownMs, o.baseCooldownMs * 2 ** (failures - 1));
    return Math.round(base * (0.8 + o.random() * 0.4)); // +/-20% jitter so devices don't retry in lockstep
  };

  async function askProvider(provider: AddressProvider, lat: number, lon: number): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs);
    try {
      const response = await o.fetchFn(provider.url(lat, lon), { signal: controller.signal });
      if (!response.ok) return null;
      return provider.parse(await response.json());
    } finally {
      clearTimeout(timer);
    }
  }

  async function run(lat: number, lon: number): Promise<LookupResult> {
    await ready;
    const nearby = findNearby(lat, lon);
    if (nearby) {
      nearby.used = o.now(); // keeps frequently visited places from being evicted
      persist();
      return { status: 'ok', address: nearby.address, provider: 'cache', cached: true };
    }

    let t = o.now();
    if (t < nextAllowedAt) return { status: 'failed', retryAt: nextAllowedAt, reason: 'throttled' };

    const available = o.providers.filter(p => (breakers.get(p.name)?.until ?? 0) <= t);
    if (available.length === 0) {
      const soonest = Math.min(...o.providers.map(p => breakers.get(p.name)?.until ?? t));
      return { status: 'failed', retryAt: soonest, reason: 'unavailable' };
    }

    nextAllowedAt = t + o.minIntervalMs;
    for (const provider of available) {
      let address: string | null = null;
      try {
        address = await askProvider(provider, lat, lon);
      } catch {
        // Network error, timeout, or a CORS-hidden 429: all handled the same way.
      }
      t = o.now();
      if (address) {
        breakers.delete(provider.name);
        remember(lat, lon, address);
        return { status: 'ok', address, provider: provider.name, cached: false };
      }
      const failures = (breakers.get(provider.name)?.failures ?? 0) + 1;
      breakers.set(provider.name, { failures, until: t + cooldown(failures) });
    }
    const retryAt = Math.min(...o.providers.map(p => breakers.get(p.name)?.until ?? t));
    return { status: 'failed', retryAt: Math.max(retryAt, nextAllowedAt), reason: 'unavailable' };
  }

  return {
    /** Looks up an address. Calls are queued, so at most one network request is ever in flight. */
    lookup(lat: number, lon: number): Promise<LookupResult> {
      const result = queue.then(() => run(lat, lon));
      queue = result.catch(() => undefined);
      return result;
    },
    /** Forget failures and spacing (for a user-initiated retry). The cache is kept. */
    reset() {
      breakers.clear();
      nextAllowedAt = 0;
    },
  };
}

/** One shared instance, so the cache and circuit breakers survive switching between views. */
export const geocoder = createGeocoder({ store: idbAddressStore() });
