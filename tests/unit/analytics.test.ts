import { describe, expect, it } from 'vitest';
import { EVENTS, cleanLocation, parseConfig, readConsent, trackingOptOut, writeConsent } from '../../utils/analytics';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('parseConfig', () => {
  it('accepts a Google Tag Manager container ID', () => {
    expect(parseConfig({ provider: 'gtm', id: 'GTM-ABCD123' })).toEqual({ provider: 'gtm', id: 'GTM-ABCD123' });
  });

  it('defaults the provider to gtm', () => {
    expect(parseConfig({ id: 'GTM-ABCD123' })).toEqual({ provider: 'gtm', id: 'GTM-ABCD123' });
  });

  it.each([
    ['null', null],
    ['a string', 'GTM-ABCD123'],
    ['no id', { provider: 'gtm' }],
    ['a lower-case id', { id: 'gtm-abcd123' }],
    ['a GA4 measurement ID', { provider: 'gtm', id: 'G-ABCD1234' }],
    ['an old UA id', { id: 'UA-12345-1' }],
    ['an id with a quote', { id: 'GTM-ABCD"123' }],
    ['a script URL', { id: 'GTM-ABCD123&x=<script>' }],
    ['another provider', { provider: 'ga4', id: 'GTM-ABCD123' }],
    ['a number', { id: 12345 }],
  ])('rejects %s, so analytics stays off', (_name, value) => {
    expect(parseConfig(value)).toBeNull();
  });
});

describe('cleanLocation', () => {
  it('drops the query string and fragment', () => {
    expect(cleanLocation('https://example.com/privacy?a=1&b=2#top')).toBe('https://example.com/privacy');
  });

  it('keeps the origin and path', () => {
    expect(cleanLocation('https://example.com/')).toBe('https://example.com/');
  });
});

describe('trackingOptOut', () => {
  it('honours Do Not Track', () => {
    expect(trackingOptOut({ doNotTrack: '1' })).toBe(true);
  });

  it('honours Global Privacy Control', () => {
    expect(trackingOptOut({ doNotTrack: null, globalPrivacyControl: true })).toBe(true);
  });

  it('is false when the browser says nothing', () => {
    expect(trackingOptOut({ doNotTrack: null })).toBe(false);
    expect(trackingOptOut({ doNotTrack: '0' })).toBe(false);
  });
});

describe('consent storage', () => {
  it('starts undecided', () => {
    expect(readConsent(memory())).toBeUndefined();
  });

  it('remembers both choices', () => {
    const store = memory();
    writeConsent('granted', store);
    expect(readConsent(store)).toBe('granted');
    writeConsent('denied', store);
    expect(readConsent(store)).toBe('denied');
  });

  it('treats junk as undecided', () => {
    expect(readConsent({ getItem: () => 'maybe' })).toBeUndefined();
  });

  it('survives storage that throws', () => {
    expect(
      readConsent({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBeUndefined();
    expect(() =>
      writeConsent('granted', {
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});

describe('events', () => {
  it('are a short fixed list with only coarse options', () => {
    expect(Object.keys(EVENTS)).toEqual([
      'start_cam',
      'photo_captured',
      'video_recorded',
      'share_used',
      'download_used',
      'photos_deleted',
      'permission_blocked',
      'pwa_installed',
      'language_changed',
      'map_service_changed',
      'share_signature_changed',
      'keep_photos_changed',
    ]);
    // Every event name is a plain snake_case word, so GTM triggers match it exactly.
    for (const name of Object.keys(EVENTS)) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    expect(EVENTS.permission_blocked).toEqual(['camera', 'location']);
    expect(EVENTS.map_service_changed).toEqual(['google', 'apple', 'osm']);
    expect(EVENTS.keep_photos_changed).toEqual(['forever', 'hour', 'day', 'week', 'month']);
    for (const name of ['start_cam', 'photo_captured', 'video_recorded', 'share_used', 'download_used', 'photos_deleted', 'pwa_installed', 'language_changed'] as const) {
      expect(EVENTS[name]).toEqual([]);
    }
  });
});
