/**
 * @file Contains shared constants used throughout the application.
 */
import { en } from '../locales/en';

/**
 * Bold sans-serif used for the date/location stamp on photos and the live overlay.
 * System fonts only, so canvas drawing needs no font loading and works offline.
 */
export const FONT_FAMILY_OVERLAY = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const TAGLINE = en['tagline'];

/** The document title for each page (see the matching entries in index.html and the static route files). */
export const PAGE_TITLES = {
  landing: en['title.landing'],
  camera: en['title.camera'],
  gallery: en['title.gallery'],
  privacy: en['title.privacy'],
  settings: en['title.settings'],
  howItWorks: en['title.howItWorks'],
} as const;
