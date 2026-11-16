import { describe, it, expect } from 'vitest';
import { MAP_SERVICES, isMapService, mapsUrl, shareText } from '../../utils/maps';

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

describe('other map services', () => {
  it('Apple Maps: a point on the map, labelled', () => {
    expect(mapsUrl(48.85837, 2.29448, 'apple')).toBe('https://maps.apple.com/?ll=48.858370,2.294480&q=Photo%20location');
  });

  it('OpenStreetMap: a marker, with the map centred on it', () => {
    expect(mapsUrl(48.85837, 2.29448, 'osm')).toBe('https://www.openstreetmap.org/?mlat=48.858370&mlon=2.294480#map=17/48.858370/2.294480');
  });

  it('every service keeps the sign of southern and western coordinates', () => {
    for (const { id } of MAP_SERVICES) {
      const url = mapsUrl(-33.8688, -151.2093, id);
      expect(url, id).toContain('-33.868800');
      expect(url, id).toContain('-151.209300');
    }
  });

  it('share text uses the chosen service, and defaults to Google Maps', () => {
    const photo = { timestamp: when, location: { latitude: 1, longitude: 2, address: 'Somewhere' } };
    expect(shareText(photo, 'apple').split('\n')[1]).toBe(mapsUrl(1, 2, 'apple'));
    expect(shareText(photo, 'osm').split('\n')[1]).toBe(mapsUrl(1, 2, 'osm'));
    expect(shareText(photo).split('\n')[1]).toBe(mapsUrl(1, 2, 'google'));
  });

  it('no service adds a link without a position', () => {
    for (const { id } of MAP_SERVICES) expect(shareText({ timestamp: when, location: null }, id)).not.toContain('http');
  });

  it('knows which values are services', () => {
    expect(isMapService('osm')).toBe(true);
    expect(isMapService('bing')).toBe(false);
    expect(isMapService(undefined)).toBe(false);
  });
});
