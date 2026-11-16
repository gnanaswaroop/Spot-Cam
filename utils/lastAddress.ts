/**
 * @file The last address SpotCam found, remembered on this device so the camera can show it as soon as the
 * first GPS fix arrives instead of waiting for a lookup. Kept in memory for the current visit and in
 * localStorage between visits. It is only ever reused for a fix close to where it was found
 * (see ADDRESS_STALE_DISTANCE_M in the geolocation hook), so it can never describe somewhere else.
 */

export interface LastAddress {
  latitude: number;
  longitude: number;
  address: string;
}

export const LAST_ADDRESS_KEY = 'spotcam.lastAddress';

let inMemory: LastAddress | null = null;

const isLastAddress = (v: unknown): v is LastAddress => {
  const o = v as Partial<LastAddress> | null;
  return (
    !!o &&
    typeof o.address === 'string' &&
    o.address.trim() !== '' &&
    typeof o.latitude === 'number' &&
    Number.isFinite(o.latitude) &&
    typeof o.longitude === 'number' &&
    Number.isFinite(o.longitude)
  );
};

export function loadLastAddress(): LastAddress | null {
  if (inMemory) return inMemory;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAST_ADDRESS_KEY) ?? 'null');
    if (isLastAddress(parsed)) inMemory = parsed;
  } catch {
    /* storage blocked or damaged: start without one */
  }
  return inMemory;
}

export function saveLastAddress(value: LastAddress): void {
  inMemory = value;
  try {
    localStorage.setItem(LAST_ADDRESS_KEY, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the in-memory copy still serves this visit */
  }
}

/** Forget it everywhere (used when the address cache is cleared, and by tests for the in-memory copy). */
export function resetLastAddress(): void {
  inMemory = null;
}

export function forgetLastAddress(): void {
  resetLastAddress();
  try {
    localStorage.removeItem(LAST_ADDRESS_KEY);
  } catch {
    /* nothing more to do */
  }
}
