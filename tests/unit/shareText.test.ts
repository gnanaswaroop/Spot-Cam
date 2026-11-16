import { describe, it, expect } from 'vitest';
import { mapsUrl, shareText } from '../../utils/helpers';

const when = new Date(2026, 10, 14, 18, 42, 10).getTime();

describe('mapsUrl', () => {
  it('builds a Google Maps search link from the coordinates', () => {
    expect(mapsUrl(48.85837, 2.29448)).toBe('https://www.google.com/maps/search/?api=1&query=48.858370,2.294480');
  });

  it('keeps the sign for the southern and western hemispheres', () => {
    expect(mapsUrl(-33.8688, -151.2093)).toBe('https://www.google.com/maps/search/?api=1&query=-33.868800,-151.209300');
  });

  it('is exact at the poles, the equator and the date line', () => {
    expect(mapsUrl(0, 0)).toContain('query=0.000000,0.000000');
    expect(mapsUrl(90, 180)).toContain('query=90.000000,180.000000');
  });
});

describe('shareText', () => {
  it('names the time and the address, then the map link on its own line', () => {
    const text = shareText({ timestamp: when, location: { latitude: 48.85837, longitude: 2.29448, address: 'Champ de Mars, Paris, France' } });
    const [first, second, ...rest] = text.split('\n');
    expect(first).toBe(`Captured on ${new Date(when).toLocaleString()} at Champ de Mars, Paris, France.`);
    expect(second).toBe('https://www.google.com/maps/search/?api=1&query=48.858370,2.294480');
    expect(rest).toEqual([]);
  });

  it('still shares the link when the address could not be found', () => {
    const text = shareText({ timestamp: when, location: { latitude: 10, longitude: 20 } });
    expect(text).toContain('at an unknown location.');
    expect(text).toContain('query=10.000000,20.000000');
  });

  it('has no link when the position is unknown', () => {
    const text = shareText({ timestamp: when, location: null });
    expect(text).toBe(`Captured on ${new Date(when).toLocaleString()} at an unknown location.`);
    expect(text).not.toContain('http');
  });
});
