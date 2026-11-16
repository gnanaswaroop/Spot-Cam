/** Unit tests for the remembered address. Runs in Node with a fake localStorage. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_ADDRESS_KEY, forgetLastAddress, loadLastAddress, resetLastAddress, saveLastAddress } from '../../utils/lastAddress';

const place = { latitude: 48.85, longitude: 2.29, address: 'Champ de Mars, Paris, France' };

const data = new Map<string, string>();
let blocked = false;
const storage = {
  removeItem: (k: string) => void data.delete(k),
  getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (blocked) throw new Error('blocked');
    data.set(k, v);
  },
};

beforeEach(() => {
  data.clear();
  blocked = false;
  vi.stubGlobal('localStorage', storage);
  resetLastAddress();
});

describe('last address', () => {
  it('starts empty', () => {
    expect(loadLastAddress()).toBeNull();
  });

  it('is remembered in memory and in storage', () => {
    saveLastAddress(place);
    expect(loadLastAddress()).toEqual(place);
    resetLastAddress();
    expect(loadLastAddress()).toEqual(place); // read back from storage
  });

  it('ignores damaged or incomplete saved data', () => {
    for (const bad of ['{not json', '"text"', '{"address":"x"}', '{"latitude":1,"longitude":2,"address":""}', '{"latitude":"1","longitude":2,"address":"x"}']) {
      data.set(LAST_ADDRESS_KEY, bad);
      resetLastAddress();
      expect(loadLastAddress()).toBeNull();
    }
  });

  it('is forgotten everywhere on request', () => {
    saveLastAddress(place);
    forgetLastAddress();
    expect(loadLastAddress()).toBeNull();
    expect(data.has(LAST_ADDRESS_KEY)).toBe(false);
  });

  it('still works when storage is blocked', () => {
    blocked = true;
    expect(() => saveLastAddress(place)).not.toThrow();
    expect(loadLastAddress()).toEqual(place);
  });
});
