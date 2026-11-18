/**
 * @file Persists the photo gallery in IndexedDB (via idb-keyval).
 * IndexedDB has far more headroom than localStorage (~5 MB), which fills up after a few photos.
 *
 * Photos older than the "keep photos for" setting are removed: when the app opens, when it comes back to the foreground,
 * when the setting changes, and at the moment the oldest photo reaches the limit while the app is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { del, delMany, get, getMany, set, setMany } from 'idb-keyval';
import { CapturedPhoto } from '../types';
import { SETTINGS_CHANGED_EVENT, getPhotoTtlMs } from '../utils/settings';
import { expiredCount, isExpired, nextExpiryDelayMs } from '../utils/photoExpiry';

/** Each photo is its own entry, so taking or deleting one never rewrites the others; the index keeps them in order (newest first). */
const INDEX_KEY = 'spotcam-photo-ids';
const photoKey = (id: string) => `spotcam-photo:${id}`;
/** Older versions kept the whole list under this one key (and before that in localStorage). */
const LEGACY_LIST_KEY = 'spotcam-photos';
const LEGACY_LOCALSTORAGE_KEY = 'spotcam-photos';
/** Browsers cap a timer at about 24.8 days; a longer wait is simply re-armed. */
const MAX_TIMER_MS = 2_000_000_000;

type Updater = CapturedPhoto[] | ((prev: CapturedPhoto[]) => CapturedPhoto[]);

/** Returns the photos, a setter, whether loading has finished, and whether the last save failed (usually: no space left). */
export function usePersistedPhotos(): [CapturedPhoto[], (value: Updater) => void, boolean, boolean] {
  const [photos, setPhotosState] = useState<CapturedPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Mirrors state so successive updates never act on stale data.
  const latest = useRef<CapturedPhoto[]>([]);
  // The ids that are in the database right now, and a queue so saves run one after another (the first one is the load).
  const persisted = useRef<string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  /** Writes whatever the list is by the time it runs: new photos first, then the index, then the removals. */
  const save = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const target = latest.current;
      const have = new Set(persisted.current);
      const want = new Set(target.map(p => p.id));
      try {
        await setMany(target.filter(p => !have.has(p.id)).map(p => [photoKey(p.id), p] as [string, CapturedPhoto]));
        await set(INDEX_KEY, target.map(p => p.id));
        const gone = persisted.current.filter(id => !want.has(id));
        persisted.current = target.map(p => p.id);
        if (gone.length > 0) await delMany(gone.map(photoKey));
        setSaveFailed(false);
      } catch (error) {
        console.error('Failed to save photos:', error);
        setSaveFailed(true);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Saves wait for this, so a photo taken while loading can't overwrite the stored list.
    queue.current = queue.current.then(async () => {
      let stored: CapturedPhoto[] = [];
      try {
        const ids = await get<string[]>(INDEX_KEY);
        if (ids) {
          stored = (await getMany<CapturedPhoto>(ids.map(photoKey))).filter((p): p is CapturedPhoto => !!p);
          persisted.current = stored.map(p => p.id);
        } else {
          // One-time migration from the single list (or the even older localStorage copy) to one entry per photo.
          let legacy = (await get<CapturedPhoto[]>(LEGACY_LIST_KEY)) ?? [];
          let fromLocalStorage = false;
          if (legacy.length === 0) {
            const raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
            if (raw) {
              legacy = JSON.parse(raw);
              fromLocalStorage = true;
            }
          }
          if (legacy.length > 0) {
            await setMany(legacy.map(p => [photoKey(p.id), p] as [string, CapturedPhoto]));
            await set(INDEX_KEY, legacy.map(p => p.id));
            persisted.current = legacy.map(p => p.id);
            stored = legacy;
            await del(LEGACY_LIST_KEY);
            if (fromLocalStorage) window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('Failed to load photos:', error);
      }
      if (cancelled) return;
      // Keep anything captured while loading.
      const during = latest.current;
      latest.current = [...during, ...stored];
      setPhotosState(latest.current);
      setLoaded(true);
      if (during.length > 0) save();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPhotos = useCallback((value: Updater) => {
    // Newest photos are first; there is no limit on how many are kept.
    const next = value instanceof Function ? value(latest.current) : value;
    latest.current = next;
    setPhotosState(next);
    save();
  }, [save]);

  // Removes the photos that have outlived the "keep photos for" setting.
  const removeExpired = useCallback(() => {
    const ttl = getPhotoTtlMs();
    const now = Date.now();
    if (expiredCount(latest.current.map(p => p.timestamp), ttl, now) > 0) {
      setPhotos(prev => prev.filter(p => !isExpired(p.timestamp, ttl, now)));
    }
  }, [setPhotos]);

  // Look again when the setting changes or the app comes back to the foreground (a phone may have slept for days).
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    const again = () => setRecheck(n => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && again();
    window.addEventListener(SETTINGS_CHANGED_EVENT, again);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, again);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Remove what has expired now, then wait for the moment the oldest remaining photo will.
  useEffect(() => {
    if (!loaded) return;
    removeExpired();
    const delay = nextExpiryDelayMs(latest.current.map(p => p.timestamp), getPhotoTtlMs());
    if (delay === null) return;
    const timer = setTimeout(() => setRecheck(n => n + 1), Math.min(delay + 250, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [loaded, photos, recheck, removeExpired]);

  return [photos, setPhotos, loaded, saveFailed];
}
