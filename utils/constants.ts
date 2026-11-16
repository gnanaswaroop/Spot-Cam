/**
 * @file Contains shared constants used throughout the application.
 */

/**
 * Bold sans-serif used for the date/location stamp on photos and the live overlay.
 * System fonts only, so canvas drawing needs no font loading and works offline.
 */
export const FONT_FAMILY_OVERLAY = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const TAGLINE = 'Spot it. Snap it. Stamp it.';

/** The document title for each page (see the matching entries in index.html and the static route files). */
export const PAGE_TITLES = {
  landing: 'SpotCam | Spot it. Snap it. Stamp it.',
  camera: 'Camera | SpotCam',
  gallery: 'Gallery | SpotCam',
  privacy: 'Privacy Policy | SpotCam',
  settings: 'Settings | SpotCam',
  howItWorks: 'How SpotCam works: timestamp and GPS camera | SpotCam',
} as const;
