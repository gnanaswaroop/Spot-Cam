/**
 * @file Defines the core data structures and types used throughout the SpotCam application.
 */

/**
 * Represents geolocation data, including coordinates and a human-readable address.
 */
export interface GeolocationData {
  /** The latitude coordinate. */
  latitude: number;
  /** The longitude coordinate. */
  longitude: number;
  /** The reverse-geocoded address string (e.g., "123 Main St, Anytown, USA"). Optional. */
  address?: string;
}

/**
 * Represents a single photo captured by the user.
 */
export interface CapturedPhoto {
  /** A unique identifier for the photo, typically generated from a timestamp. */
  id: string;
  /** The image data encoded as a Base64 data URL. */
  dataUrl: string;
  /** The Unix timestamp (in milliseconds) of when the photo was taken. */
  timestamp: number;
  /** The geolocation data at the time of capture. Can be null if location is unavailable. */
  location: GeolocationData | null;
}
