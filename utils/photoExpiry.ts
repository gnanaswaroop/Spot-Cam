/**
 * @file How long a photo stays in the gallery ("keep photos for ..."). Photos older than the chosen time are
 * removed from this device. The default is to keep them until the person deletes them.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface TtlOption {
  /** How long a photo is kept (ms); null keeps photos until they are deleted by hand. */
  ms: number | null;
  /** The choice as the person reads it in Settings (English; the app shows the message called `key` in the chosen language). */
  label: string;
  /** The name of the message with this choice's words (see locales/en.ts). */
  key: string;
}

/** The choices offered in Settings. The first is the default. */
export const PHOTO_TTL_OPTIONS: readonly TtlOption[] = [
  { ms: null, label: 'Until I delete them', key: 'ttl.forever' },
  { ms: HOUR_MS, label: '1 hour', key: 'ttl.hour' },
  { ms: DAY_MS, label: '1 day', key: 'ttl.day' },
  { ms: 7 * DAY_MS, label: '7 days', key: 'ttl.week' },
  { ms: 30 * DAY_MS, label: '30 days', key: 'ttl.month' },
];

export const isValidTtl = (ms: unknown): ms is number => PHOTO_TTL_OPTIONS.some(option => option.ms !== null && option.ms === ms);

/** True when a photo taken at `takenAt` is older than the time it may be kept. */
export const isExpired = (takenAt: number, ttlMs: number | null, now: number = Date.now()): boolean =>
  ttlMs !== null && now - takenAt >= ttlMs;

/** How many of these photos (given by when they were taken) a time limit would remove right now. */
export const expiredCount = (takenAt: readonly number[], ttlMs: number | null, now: number = Date.now()): number =>
  takenAt.filter(t => isExpired(t, ttlMs, now)).length;

/** Milliseconds until the oldest photo reaches the limit, or null when nothing will ever expire. */
export function nextExpiryDelayMs(takenAt: readonly number[], ttlMs: number | null, now: number = Date.now()): number | null {
  if (ttlMs === null || takenAt.length === 0) return null;
  return Math.max(Math.min(...takenAt) + ttlMs - now, 0);
}

/** "1 day", "7 days": the label for a stored limit, for sentences such as "Photos are removed after 7 days". */
export const ttlLabel = (ttlMs: number | null): string => PHOTO_TTL_OPTIONS.find(option => option.ms === ttlMs)?.label ?? '';
