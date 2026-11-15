/**
 * @file User settings kept on this device (browser localStorage). Only the cache radius is customisable.
 * Nothing here is sent anywhere. Reads and writes never throw: if storage is blocked, the defaults apply.
 */

const STORAGE_KEY = 'spotcam-settings';

/** Addresses are reused within this many metres of where they were looked up (see utils/geocoder.ts). */
export const DEFAULT_CACHE_RADIUS_M = 50;
export const CACHE_RADIUS_MIN_M = 10;
export const CACHE_RADIUS_MAX_M = 500;

interface StoredSettings {
  cacheRadiusM?: number;
}

const isValidRadius = (m: unknown): m is number =>
  typeof m === 'number' && Number.isInteger(m) && m >= CACHE_RADIUS_MIN_M && m <= CACHE_RADIUS_MAX_M;

function readStored(): StoredSettings {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as StoredSettings) : {};
  } catch {
    return {};
  }
}

function writeStored(settings: StoredSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked or full: the setting simply won't survive a reload.
  }
}

/** The cache radius in use: the saved value if one was customised, otherwise the default. */
export function getCacheRadiusM(): number {
  const saved = readStored().cacheRadiusM;
  return isValidRadius(saved) ? saved : DEFAULT_CACHE_RADIUS_M;
}

/** True only when the user has saved a radius different from the default. */
export function isCacheRadiusCustomised(): boolean {
  return isValidRadius(readStored().cacheRadiusM);
}

/**
 * Saves a radius. Saving the default (or null) removes the customisation, so the default
 * keeps applying if the default is ever changed in code.
 */
export function setCacheRadiusM(metres: number | null) {
  const settings = readStored();
  if (metres === null || metres === DEFAULT_CACHE_RADIUS_M) {
    delete settings.cacheRadiusM;
  } else if (isValidRadius(metres)) {
    settings.cacheRadiusM = metres;
  } else {
    return;
  }
  writeStored(settings);
}
