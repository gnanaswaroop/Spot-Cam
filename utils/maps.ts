/**
 * @file The map link added to the text shared with a photo. The user picks the service in Settings;
 * Google Maps is the default. Each service has one documented "show this point" link form.
 */
import type { CapturedPhoto } from '../types';
import { formatDateTime } from './helpers';

export type MapService = 'google' | 'apple' | 'osm';

export const DEFAULT_MAP_SERVICE: MapService = 'google';

/** The services offered in Settings, in the order shown. */
export const MAP_SERVICES: readonly { id: MapService; label: string }[] = [
  { id: 'google', label: 'Google Maps' },
  { id: 'apple', label: 'Apple Maps' },
  { id: 'osm', label: 'OpenStreetMap' },
];

export const isMapService = (value: unknown): value is MapService => MAP_SERVICES.some(service => service.id === value);

/**
 * A link that opens the given point in the chosen service.
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 */
export const mapsUrl = (latitude: number, longitude: number, service: MapService = DEFAULT_MAP_SERVICE): string => {
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  switch (service) {
    case 'apple':
      // Opens the Maps app on iPhone and Mac, and Apple Maps on the web elsewhere.
      return `https://maps.apple.com/?ll=${lat},${lon}&q=Photo%20location`;
    case 'osm':
      return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
    default:
      // The documented "search" form: opens the Maps app on phones and the website elsewhere.
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }
};

/**
 * The text shared with a photo: when and where it was taken, plus a map link to the exact spot when
 * the position is known. `signature`, when given, is added as a last line of its own (see shareSignature).
 */
export const shareText = (
  photo: Pick<CapturedPhoto, 'timestamp' | 'location'>,
  service: MapService = DEFAULT_MAP_SERVICE,
  signature?: string | null,
): string => {
  const { location } = photo;
  const line = `Captured on ${formatDateTime(photo.timestamp)} at ${location?.address || 'an unknown location'}.`;
  const message = location ? `${line}
${mapsUrl(location.latitude, location.longitude, service)}` : line;
  return signature ? `${message}\n\n${signature}` : message;
};

/** The line that says where a shared photo came from: "Captured with spotcam.in", using the address the app is opened from. */
export const shareSignature = (host: string): string => `Captured with ${host}`;
