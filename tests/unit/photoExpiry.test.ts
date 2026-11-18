import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_TTL_OPTIONS, expiredCount, isExpired, isValidTtl, nextExpiryDelayMs, ttlLabel } from '../../utils/photoExpiry';
import { getPhotoTtlMs, setPhotoTtlMs } from '../../utils/settings';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

describe('isExpired', () => {
  it('never expires anything when photos are kept until deleted', () => {
    expect(isExpired(NOW - 400 * DAY, null, NOW)).toBe(false);
  });

  it('expires a photo once it is as old as the limit, and not before', () => {
    expect(isExpired(NOW - DAY + 1, DAY, NOW)).toBe(false);
    expect(isExpired(NOW - DAY, DAY, NOW)).toBe(true);
    expect(isExpired(NOW - 2 * DAY, DAY, NOW)).toBe(true);
  });

  it('keeps a photo whose time is in the future (a phone clock that was set back)', () => {
    expect(isExpired(NOW + HOUR, HOUR, NOW)).toBe(false);
  });
});

describe('expiredCount', () => {
  it('counts what a limit would remove right now', () => {
    const taken = [NOW - 10 * 60_000, NOW - 3 * HOUR, NOW - 2 * DAY, NOW - 40 * DAY];
    expect(expiredCount(taken, null, NOW)).toBe(0);
    expect(expiredCount(taken, HOUR, NOW)).toBe(3);
    expect(expiredCount(taken, DAY, NOW)).toBe(2);
    expect(expiredCount(taken, 30 * DAY, NOW)).toBe(1);
    expect(expiredCount([], HOUR, NOW)).toBe(0);
  });
});

describe('nextExpiryDelayMs', () => {
  it('is the wait until the oldest photo reaches the limit', () => {
    expect(nextExpiryDelayMs([NOW - 10 * 60_000, NOW - 30 * 60_000], HOUR, NOW)).toBe(30 * 60_000);
  });

  it('is zero for a photo that is already past it', () => {
    expect(nextExpiryDelayMs([NOW - 2 * HOUR], HOUR, NOW)).toBe(0);
  });

  it('is null when nothing will ever expire', () => {
    expect(nextExpiryDelayMs([NOW], null, NOW)).toBeNull();
    expect(nextExpiryDelayMs([], HOUR, NOW)).toBeNull();
  });
});

describe('the choices', () => {
  it('start with keeping photos until deleted, as the default', () => {
    expect(PHOTO_TTL_OPTIONS[0].ms).toBeNull();
  });

  it('only accept the offered times', () => {
    expect(isValidTtl(DAY)).toBe(true);
    expect(isValidTtl(5 * 60_000)).toBe(false);
    expect(isValidTtl(null)).toBe(false);
    expect(isValidTtl('86400000')).toBe(false);
  });

  it('can be named in a sentence', () => {
    expect(ttlLabel(7 * DAY)).toBe('7 days');
    expect(ttlLabel(null)).toBe('Until I delete them');
  });
});

describe('the saved "keep photos for" setting', () => {
  let store: Map<string, string>;
  let events: number;

  beforeEach(() => {
    store = new Map();
    events = 0;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      dispatchEvent: () => {
        events++;
        return true;
      },
    });
  });

  it('keeps photos until deleted when nothing is saved', () => {
    expect(getPhotoTtlMs()).toBeNull();
  });

  it('saves a time and reads it back, and tells the app it changed', () => {
    setPhotoTtlMs(7 * DAY);
    expect(getPhotoTtlMs()).toBe(7 * DAY);
    expect(events).toBe(1);
  });

  it('removes the stored value when set back to the default', () => {
    setPhotoTtlMs(DAY);
    setPhotoTtlMs(null);
    expect(getPhotoTtlMs()).toBeNull();
    expect(store.get('spotcam-settings')).toBe('{}');
  });

  it('ignores a time that is not one of the choices, whether being saved or already stored', () => {
    setPhotoTtlMs(12345);
    expect(getPhotoTtlMs()).toBeNull();
    store.set('spotcam-settings', JSON.stringify({ photoTtlMs: 12345 }));
    expect(getPhotoTtlMs()).toBeNull();
  });

  it('leaves the other settings alone', () => {
    store.set('spotcam-settings', JSON.stringify({ cacheRadiusM: 120 }));
    setPhotoTtlMs(DAY);
    expect(JSON.parse(store.get('spotcam-settings')!)).toEqual({ cacheRadiusM: 120, photoTtlMs: DAY });
  });
});
