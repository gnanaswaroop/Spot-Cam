import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapsUrl, shareSignature, shareText } from '../../utils/maps';
import { getShareSignature, setShareSignature } from '../../utils/settings';

const photo = {
  timestamp: new Date(2026, 10, 17, 18, 42, 10).getTime(),
  location: { latitude: 48.85837, longitude: 2.29448, address: 'Champ de Mars, Paris, France' },
};

describe('shareSignature', () => {
  it('names the address the app is opened from, so it is right on any domain', () => {
    expect(shareSignature('spotcam.in')).toBe('Captured with spotcam.in');
    expect(shareSignature('localhost:4173')).toBe('Captured with localhost:4173');
  });
});

describe('shareText with a signature', () => {
  it('adds it as a last line of its own, after a blank line, below the map link', () => {
    const lines = shareText(photo, 'google', 'Captured with spotcam.in').split('\n');
    expect(lines[1]).toBe(mapsUrl(48.85837, 2.29448, 'google'));
    expect(lines.slice(2)).toEqual(['', 'Captured with spotcam.in']);
  });

  it('adds it to a photo with no position too', () => {
    expect(shareText({ ...photo, location: null }, 'google', 'Captured with spotcam.in').split('\n').slice(1)).toEqual(['', 'Captured with spotcam.in']);
  });

  it('leaves the message as it was when there is no signature', () => {
    const plain = shareText(photo);
    expect(shareText(photo, 'google', null)).toBe(plain);
    expect(shareText(photo, 'google', undefined)).toBe(plain);
    expect(shareText(photo, 'google', '')).toBe(plain);
    expect(plain).not.toContain('spotcam');
  });
});

describe('the saved "mention SpotCam" setting', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });

  it('is on when nothing is saved', () => {
    expect(getShareSignature()).toBe(true);
  });

  it('can be turned off, and the choice is remembered', () => {
    setShareSignature(false);
    expect(getShareSignature()).toBe(false);
  });

  it('removes the stored value when turned back on, so the default keeps applying', () => {
    setShareSignature(false);
    setShareSignature(true);
    expect(getShareSignature()).toBe(true);
    expect(store.get('spotcam-settings')).toBe('{}');
  });

  it('leaves the other settings alone', () => {
    store.set('spotcam-settings', JSON.stringify({ cacheRadiusM: 120 }));
    setShareSignature(false);
    expect(JSON.parse(store.get('spotcam-settings')!)).toEqual({ cacheRadiusM: 120, shareSignature: false });
  });
});
