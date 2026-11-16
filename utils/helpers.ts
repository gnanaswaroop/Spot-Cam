/**
 * @file Contains miscellaneous helper functions used across the application.
 */
import type { CapturedPhoto } from '../types';

/**
 * Formats a Unix timestamp into a human-readable, locale-specific date and time string.
 * @param timestamp - The Unix timestamp in milliseconds.
 * @returns A formatted date-time string (e.g., "7/25/2024, 10:30:00 AM").
 */
export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

/**
 * A Google Maps link that opens the given point (the documented "search" URL form, which opens the
 * Maps app on phones and the website elsewhere).
 * @param latitude - Degrees north.
 * @param longitude - Degrees east.
 */
export const mapsUrl = (latitude: number, longitude: number): string =>
  `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

/**
 * The text shared with a photo: when and where it was taken, plus a Google Maps link to the exact
 * spot when the position is known.
 */
export const shareText = (photo: Pick<CapturedPhoto, 'timestamp' | 'location'>): string => {
  const { location } = photo;
  const line = `Captured on ${formatDateTime(photo.timestamp)} at ${location?.address || 'an unknown location'}.`;
  return location ? `${line}
${mapsUrl(location.latitude, location.longitude)}` : line;
};

/**
 * Converts a data URL string into a File object.
 * This is useful for working with APIs that require a File, like the Web Share API.
 * @param dataUrl - The data URL string to convert (e.g., "data:image/jpeg;base64,...").
 * @param filename - The desired filename for the output File.
 * @returns A Promise that resolves to a File object.
 */
export const dataURLtoFile = async (dataUrl: string, filename: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};
