/**
 * Unit tests for the address lookup. The network is never touched: `fetchFn` and the clock are fakes,
 * so running these cannot get anyone's IP address rate limited.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AddressProvider,
  AddressStore,
  CacheEntry,
  bigDataCloudProvider,
  createGeocoder,
  joinAddress,
  nominatimProvider,
  photonProvider,
} from '../../utils/geocoder';
import { distanceMeters } from '../../utils/geo';

type Reply = { ok?: boolean; json?: unknown } | Error | 'hang';

/** Fake providers named a, b, c; each parses `{ address }`. */
const fakeProvider = (name: string): AddressProvider => ({
  name,
  url: (lat, lon) => `https://${name}.test/?lat=${lat}&lon=${lon}`,
  parse: data => ((data as { address?: string })?.address ?? null),
});

/** A scripted fetch: replies are looked up by host name, and every call is recorded. */
function scriptedFetch(script: Record<string, Reply[] | Reply>) {
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string, init: { signal: AbortSignal }) => {
    const host = new URL(url).hostname.replace('.test', '');
    calls.push(host);
    const entry = script[host];
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry;
    if (reply === 'hang') {
      return new Promise<never>((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (reply instanceof Error) throw reply;
    return { ok: reply?.ok ?? true, json: async () => reply?.json };
  });
  return { fetchFn, calls };
}

function setup(script: Record<string, Reply[] | Reply>, extra: Parameters<typeof createGeocoder>[0] = {}) {
  let clock = 1_000_000;
  const { fetchFn, calls } = scriptedFetch(script);
  const geocoder = createGeocoder({
    providers: [fakeProvider('a'), fakeProvider('b'), fakeProvider('c')],
    fetchFn,
    now: () => clock,
    random: () => 0.5, // no jitter
    ...extra,
  });
  return { geocoder, calls, fetchFn, advance: (ms: number) => (clock += ms), time: () => clock };
}

const good = (address: string): Reply => ({ json: { address } });
const rateLimited = new TypeError('Failed to fetch'); // what a CORS-hidden 429 looks like in a browser

describe('provider parsing', () => {
  it('Photon: builds a street address and skips duplicates', () => {
    const data = {
      features: [
        { properties: { housenumber: '5', street: 'Avenue Anatole France', postcode: '75007', city: 'Paris', state: 'Paris', country: 'France' } },
      ],
    };
    expect(photonProvider.parse(data)).toBe('5 Avenue Anatole France, Paris, 75007, France');
  });

  it('Photon: uses the place name for landmarks', () => {
    const data = { features: [{ properties: { name: 'Eiffel Tower', street: 'Avenue Gustave Eiffel', city: 'Paris', country: 'France' } }] };
    expect(photonProvider.parse(data)).toBe('Eiffel Tower, Avenue Gustave Eiffel, Paris, France');
  });

  it('Photon: no features means no address', () => {
    expect(photonProvider.parse({ features: [] })).toBeNull();
    expect(photonProvider.parse({})).toBeNull();
    expect(photonProvider.parse(null)).toBeNull();
  });

  it('BigDataCloud: locality level address', () => {
    const data = { locality: 'Gros-Caillou', city: 'Paris', principalSubdivision: 'Île-de-France', postcode: '75007', countryName: 'France' };
    expect(bigDataCloudProvider.parse(data)).toBe('Gros-Caillou, Paris, Île-de-France, 75007, France');
    expect(bigDataCloudProvider.parse({})).toBeNull();
  });

  it('Nominatim: uses display_name, and treats an error body as no address', () => {
    expect(nominatimProvider.parse({ display_name: ' Champ de Mars, Paris ' })).toBe('Champ de Mars, Paris');
    expect(nominatimProvider.parse({ error: 'Unable to geocode' })).toBeNull();
    expect(nominatimProvider.parse('nope')).toBeNull();
  });

  it('joinAddress drops empties and case-insensitive repeats', () => {
    expect(joinAddress(['Paris', '', null, undefined, 'paris', 75007, 'France'])).toBe('Paris, 75007, France');
    expect(joinAddress([null, ''])).toBeNull();
  });

  it('request URLs point at the expected services and carry the coordinates', () => {
    expect(photonProvider.url(48.8584, 2.2945)).toContain('https://photon.komoot.io/reverse?lat=48.8584&lon=2.2945');
    expect(bigDataCloudProvider.url(48.8584, 2.2945)).toContain('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=48.8584&longitude=2.2945');
    expect(nominatimProvider.url(48.8584, 2.2945)).toContain('https://nominatim.openstreetmap.org/reverse?format=json&lat=48.8584&lon=2.2945');
  });
});

describe('geocoder', () => {
  it('returns the first provider that answers, and asks only that one', async () => {
    const { geocoder, calls } = setup({ a: good('A St'), b: good('B St'), c: good('C St') });
    expect(await geocoder.lookup(1, 2)).toMatchObject({ status: 'ok', address: 'A St', provider: 'a', cached: false });
    expect(calls).toEqual(['a']);
  });

  it('falls through to the next provider when one fails the way a rate limit looks in a browser', async () => {
    const { geocoder, calls } = setup({ a: rateLimited, b: good('B St') });
    expect(await geocoder.lookup(1, 2)).toMatchObject({ status: 'ok', address: 'B St', provider: 'b' });
    expect(calls).toEqual(['a', 'b']);
  });

  it.each([
    ['HTTP 500', { ok: false }],
    ['malformed JSON / no address', { json: { nothing: true } }],
    ['network error', new Error('boom')],
  ] as Array<[string, Reply]>)('treats %s as a failure and moves on', async (_name, reply) => {
    const { geocoder } = setup({ a: reply, b: good('B St') });
    expect(await geocoder.lookup(1, 2)).toMatchObject({ status: 'ok', address: 'B St' });
  });

  it('times out a hanging provider and moves on', async () => {
    vi.useFakeTimers();
    try {
      const { geocoder } = setup({ a: 'hang', b: good('B St') }, { timeoutMs: 8000 });
      const pending = geocoder.lookup(1, 2);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await pending).toMatchObject({ status: 'ok', address: 'B St' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips a failed provider during its cool-down (no request storm), then retries it', async () => {
    const { geocoder, calls, advance } = setup({ a: [rateLimited, good('A St')], b: good('B St') }, { minIntervalMs: 0 });
    await geocoder.lookup(1, 2); // a fails, b answers
    expect(calls).toEqual(['a', 'b']);

    calls.length = 0;
    advance(1000);
    await geocoder.lookup(3, 4); // a is cooling down: only b is asked
    expect(calls).toEqual(['b']);

    calls.length = 0;
    advance(5000); // cool-down (5 s base) is over
    expect(await geocoder.lookup(5, 6)).toMatchObject({ status: 'ok', address: 'A St', provider: 'a' });
    expect(calls).toEqual(['a']);
  });

  it('backs off exponentially with a cap, and resets after a success', async () => {
    const { geocoder, calls, advance, time } = setup(
      { a: [rateLimited, rateLimited, rateLimited, rateLimited, rateLimited, rateLimited, rateLimited, rateLimited, good('A')] },
      { providers: [fakeProvider('a')], minIntervalMs: 0, baseCooldownMs: 5000, maxCooldownMs: 60_000 },
    );
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await geocoder.lookup(i, i);
      if (res.status !== 'failed') throw new Error('expected failure');
      waits.push(res.retryAt - time());
      advance(res.retryAt - time());
    }
    expect(waits).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000]); // doubles, then capped at 60 s

    calls.length = 0;
    // Two more failures remain in the script; burn them, then the success clears the breaker.
    for (let i = 0; i < 2; i++) {
      const res = await geocoder.lookup(10 + i, 10 + i);
      advance(res.status === 'failed' ? res.retryAt - time() : 0);
    }
    expect(await geocoder.lookup(20, 20)).toMatchObject({ status: 'ok', address: 'A' });
    const next = await geocoder.lookup(21, 21); // would be blocked if the breaker had not reset
    expect(next.status).toBe('ok');
  });

  it('adds jitter to the cool-down', async () => {
    const low = setup({ a: rateLimited }, { providers: [fakeProvider('a')], random: () => 0, minIntervalMs: 0 });
    const high = setup({ a: rateLimited }, { providers: [fakeProvider('a')], random: () => 1, minIntervalMs: 0 });
    const lo = await low.geocoder.lookup(1, 2);
    const hi = await high.geocoder.lookup(1, 2);
    if (lo.status !== 'failed' || hi.status !== 'failed') throw new Error('expected failures');
    expect(lo.retryAt - low.time()).toBe(4000); // 5000 * 0.8
    expect(hi.retryAt - high.time()).toBe(6000); // 5000 * 1.2
  });

  it('reports a retry time when every provider is down, and makes no requests until then', async () => {
    const { geocoder, calls, advance, time } = setup({ a: rateLimited, b: rateLimited, c: rateLimited }, { minIntervalMs: 0 });
    const first = await geocoder.lookup(1, 2);
    expect(first).toMatchObject({ status: 'failed', reason: 'unavailable' });
    expect(calls).toEqual(['a', 'b', 'c']);

    calls.length = 0;
    advance(1000);
    const second = await geocoder.lookup(1, 2);
    expect(second).toMatchObject({ status: 'failed' });
    if (second.status === 'failed') expect(second.retryAt).toBeGreaterThan(time());
    expect(calls).toEqual([]); // all breakers open: nothing is sent
  });

  it('reuses an address for a point within the cache radius, without a request', async () => {
    const { geocoder, calls, advance } = setup({ a: good('Cached St') }, { minIntervalMs: 0 });
    await geocoder.lookup(48.85841, 2.29451);
    advance(10_000);
    const again = await geocoder.lookup(48.858412, 2.294508); // about 20 cm away
    expect(again).toMatchObject({ status: 'ok', address: 'Cached St', cached: true });
    expect(calls).toEqual(['a']);
  });

  it('asks again for a point outside the cache radius', async () => {
    const { geocoder, calls, advance } = setup({ a: [good('Near St'), good('Far St')] }, { minIntervalMs: 0 });
    await geocoder.lookup(48.85841, 2.29451);
    advance(10_000);
    const far = await geocoder.lookup(48.8590, 2.2950); // about 75 m away
    expect(far).toMatchObject({ status: 'ok', address: 'Far St', cached: false });
    expect(calls).toEqual(['a', 'a']);
  });

  it('keeps the cache between visits when a store is given, so a reload makes no request', async () => {
    const saved: CacheEntry[] = [];
    const store: AddressStore = {
      load: async () => [...saved],
      save: async entries => {
        saved.splice(0, saved.length, ...entries);
      },
    };
    const first = setup({ a: good('Saved St') }, { minIntervalMs: 0, store });
    await first.geocoder.lookup(48.85841, 2.29451);

    const second = setup({ a: good('Should not be used') }, { minIntervalMs: 0, store });
    const r = await second.geocoder.lookup(48.85841, 2.29451);
    expect(r).toMatchObject({ status: 'ok', address: 'Saved St', cached: true });
    expect(second.calls).toEqual([]);
  });

  it('ignores cached entries older than the TTL', async () => {
    const { geocoder, calls, advance } = setup({ a: [good('Old St'), good('New St')] }, { minIntervalMs: 0, cacheTtlMs: 1000 });
    await geocoder.lookup(48.85841, 2.29451);
    advance(2000);
    const r = await geocoder.lookup(48.85841, 2.29451);
    expect(r).toMatchObject({ address: 'New St', cached: false });
    expect(calls).toEqual(['a', 'a']);
  });

  it('evicts the least recently used entry once the size limit is reached', async () => {
    const { geocoder, calls, advance } = setup(
      { a: [good('P1'), good('P2'), good('P3'), good('P1 again')] },
      { minIntervalMs: 0, cacheMaxEntries: 2 },
    );
    await geocoder.lookup(10, 10);
    advance(1);
    await geocoder.lookup(20, 20);
    advance(1);
    await geocoder.lookup(30, 30); // evicts the oldest, (10, 10)
    const r = await geocoder.lookup(10, 10);
    expect(r).toMatchObject({ address: 'P1 again', cached: false });
    expect(calls).toHaveLength(4);
  });

  it('keeps working from memory when the store fails to load or save', async () => {
    const store: AddressStore = {
      load: async () => {
        throw new Error('no IndexedDB');
      },
      save: async () => {
        throw new Error('no IndexedDB');
      },
    };
    const { geocoder, calls } = setup({ a: good('Memory St') }, { minIntervalMs: 0, store });
    expect(await geocoder.lookup(48.85841, 2.29451)).toMatchObject({ status: 'ok', address: 'Memory St' });
    expect(await geocoder.lookup(48.85841, 2.29451)).toMatchObject({ status: 'ok', cached: true });
    expect(calls).toEqual(['a']);
  });

  it('spaces lookups: a second new location inside the minimum interval is not sent', async () => {
    const { geocoder, calls, advance } = setup({ a: good('A St') }, { minIntervalMs: 1000 });
    await geocoder.lookup(1, 1);
    advance(200);
    const early = await geocoder.lookup(2, 2);
    expect(early).toMatchObject({ status: 'failed', reason: 'throttled' });
    expect(calls).toEqual(['a']);
    advance(1000);
    expect((await geocoder.lookup(2, 2)).status).toBe('ok');
  });

  it('never has two requests in flight at once', async () => {
    let active = 0;
    let maxActive = 0;
    const fetchFn = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return { ok: true, json: async () => ({ address: 'X' }) };
    });
    const geocoder = createGeocoder({ providers: [fakeProvider('a')], fetchFn, minIntervalMs: 0 });
    await Promise.all([geocoder.lookup(1, 1), geocoder.lookup(2, 2), geocoder.lookup(3, 3)]);
    expect(maxActive).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('reset() clears breakers and spacing for a user-initiated retry', async () => {
    const { geocoder, calls, advance } = setup({ a: [rateLimited, good('A St')] }, { providers: [fakeProvider('a')] });
    expect((await geocoder.lookup(1, 1)).status).toBe('failed');
    advance(50);
    geocoder.reset();
    expect(await geocoder.lookup(1, 1)).toMatchObject({ status: 'ok', address: 'A St' });
    expect(calls).toEqual(['a', 'a']);
  });
});

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(10, 20, 10, 20)).toBe(0);
  });
  it('matches known distances closely', () => {
    // One degree of latitude is about 111.2 km.
    expect(distanceMeters(0, 0, 1, 0)).toBeGreaterThan(111_000);
    expect(distanceMeters(0, 0, 1, 0)).toBeLessThan(111_400);
    // 0.0001 degrees of latitude is about 11 m.
    expect(distanceMeters(48.8584, 2.2945, 48.8585, 2.2945)).toBeCloseTo(11.1, 0);
  });
});
