/**
 * @file User settings kept on this device (browser localStorage). The cache radius, the map service and how long photos are kept are customisable.
 * Nothing here is sent anywhere. Reads and writes never throw: if storage is blocked, the defaults apply.
 */

import { DEFAULT_MAP_SERVICE, isMapService, type MapService } from './maps';
import { isValidTtl } from './photoExpiry';

const STORAGE_KEY = 'spotcam-settings';

/** Addresses are reused within this many metres of where they were looked up (see utils/geocoder.ts). */
export const DEFAULT_CACHE_RADIUS_M = 50;
export const CACHE_RADIUS_MIN_M = 10;
export const CACHE_RADIUS_MAX_M = 500;

interface StoredSettings {
  cacheRadiusM?: number;
  mapService?: MapService;
  /** How long photos stay in the gallery (ms). Missing means until they are deleted by hand. */
  photoTtlMs?: number;
  /** false when the person turned off the "Captured with ..." line in shared messages. Missing means on. */
  shareSignature?: boolean;
}

/** Fired on the window when a setting that other parts of the app react to has changed. */
export const SETTINGS_CHANGED_EVENT = 'spotcam:settings-changed';

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

/** The map service used for the link in shared text: the saved choice, otherwise the default (Google Maps). */
export function getMapService(): MapService {
  const saved = readStored().mapService;
  return isMapService(saved) ? saved : DEFAULT_MAP_SERVICE;
}

/** Saves the map service. Choosing the default removes the stored value, so the default keeps applying. */
export function setMapService(service: MapService) {
  if (!isMapService(service)) return;
  const settings = readStored();
  if (service === DEFAULT_MAP_SERVICE) {
    delete settings.mapService;
  } else {
    settings.mapService = service;
  }
  writeStored(settings);
}

/** How long photos are kept in the gallery (ms), or null to keep them until they are deleted by hand (the default). */
export function getPhotoTtlMs(): number | null {
  const saved = readStored().photoTtlMs;
  return isValidTtl(saved) ? saved : null;
}

/** Saves how long photos are kept. null (keep until deleted) removes the stored value, so that default keeps applying. */
export function setPhotoTtlMs(ms: number | null) {
  if (ms !== null && !isValidTtl(ms)) return;
  const settings = readStored();
  if (ms === null) delete settings.photoTtlMs;
  else settings.photoTtlMs = ms;
  writeStored(settings);
  try {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  } catch {
    // No window (tests): nobody is listening anyway.
  }
}

/** Whether the line "Captured with spotcam.in" is added to the message when a photo is shared. On by default. */
export function getShareSignature(): boolean {
  return readStored().shareSignature !== false;
}

/** Turns the line on or off. Turning it on removes the stored value, so the default keeps applying. */
export function setShareSignature(on: boolean) {
  const settings = readStored();
  if (on) delete settings.shareSignature;
  else settings.shareSignature = false;
  writeStored(settings);
}
