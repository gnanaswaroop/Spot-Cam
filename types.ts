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
  /** A small copy for the gallery grid, made when the photo is taken. */
  thumbUrl?: string;
  /** The Unix timestamp (in milliseconds) of when the photo was taken. */
  timestamp: number;
  /** The geolocation data at the time of capture. Can be null if location is unavailable. */
  location: GeolocationData | null;
}

/**
 * What the gallery holds for each photo: everything but the full-size image, which is read from storage only when needed.
 * This keeps the gallery light however many photos there are.
 */
export interface GalleryPhoto {
  id: string;
  /** A small JPEG data URL, enough for the grid and as a stand-in while the full photo loads. */
  thumbUrl: string;
  /** The size of the full-size photo in bytes, for the "space used" line. */
  bytes: number;
  timestamp: number;
  location: GeolocationData | null;
  /** Absent for a photo. */
  kind?: 'video';
  /** A video's type without parameters, e.g. "video/mp4" (the format the browser recorded). */
  mimeType?: string;
  /** A video's length in milliseconds. */
  durationMs?: number;
}

/** A video that was just recorded, before it is saved. */
export interface CapturedVideo {
  id: string;
  /** The recording, in whatever format the browser records. */
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** A small picture of the first frame. */
  thumbUrl: string;
  timestamp: number;
  location: GeolocationData | null;
}
