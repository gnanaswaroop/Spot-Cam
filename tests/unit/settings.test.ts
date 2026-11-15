/**
 * Unit tests for the on-device settings (cache radius). Runs in Node with a fake localStorage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_RADIUS_MAX_M,
  CACHE_RADIUS_MIN_M,
  DEFAULT_CACHE_RADIUS_M,
  getCacheRadiusM,
  isCacheRadiusCustomised,
  setCacheRadiusM,
} from '../../utils/settings';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('cache radius setting', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  it('uses the default when nothing is saved', () => {
    expect(getCacheRadiusM()).toBe(DEFAULT_CACHE_RADIUS_M);
    expect(isCacheRadiusCustomised()).toBe(false);
  });

  it('saves a customised radius and reads it back', () => {
    setCacheRadiusM(120);
    expect(getCacheRadiusM()).toBe(120);
    expect(isCacheRadiusCustomised()).toBe(true);
  });

  it('saving the default removes the customisation', () => {
    setCacheRadiusM(120);
    setCacheRadiusM(DEFAULT_CACHE_RADIUS_M);
    expect(isCacheRadiusCustomised()).toBe(false);
    expect(getCacheRadiusM()).toBe(DEFAULT_CACHE_RADIUS_M);
  });

  it('null also resets to the default', () => {
    setCacheRadiusM(300);
    setCacheRadiusM(null);
    expect(getCacheRadiusM()).toBe(DEFAULT_CACHE_RADIUS_M);
  });

  it('rejects values outside the allowed range, and non-integers', () => {
    setCacheRadiusM(CACHE_RADIUS_MIN_M - 1);
    expect(isCacheRadiusCustomised()).toBe(false);
    setCacheRadiusM(CACHE_RADIUS_MAX_M + 1);
    expect(isCacheRadiusCustomised()).toBe(false);
    setCacheRadiusM(12.5);
    expect(isCacheRadiusCustomised()).toBe(false);
  });

  it('ignores a corrupted saved value and falls back to the default', () => {
    storage.setItem('spotcam-settings', '{not json');
    expect(getCacheRadiusM()).toBe(DEFAULT_CACHE_RADIUS_M);
    storage.setItem('spotcam-settings', JSON.stringify({ cacheRadiusM: 'big' }));
    expect(getCacheRadiusM()).toBe(DEFAULT_CACHE_RADIUS_M);
  });

  it('works when storage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => setCacheRadiusM(80)).not.toThrow();
    expect(getCacheRadiusM()).toBe(DEFAULT_CACHE_RADIUS_M);
  });
});
