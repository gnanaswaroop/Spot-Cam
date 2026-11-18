/**
 * @file Persists the photo gallery in IndexedDB (via idb-keyval).
 * IndexedDB has far more headroom than localStorage (~5 MB), which fills up after a few photos.
 *
 * Photos older than the "keep photos for" setting are removed: when the app opens, when it comes back to the foreground,
 * when the setting changes, and at the moment the oldest photo reaches the limit while the app is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { CapturedPhoto } from '../types';
import { SETTINGS_CHANGED_EVENT, getPhotoTtlMs } from '../utils/settings';
import { expiredCount, isExpired, nextExpiryDelayMs } from '../utils/photoExpiry';

const DB_KEY = 'spotcam-photos';
const LEGACY_LOCALSTORAGE_KEY = 'spotcam-photos';
const MAX_PHOTOS = 12;
/** Browsers cap a timer at about 24.8 days; a longer wait is simply re-armed. */
const MAX_TIMER_MS = 2_000_000_000;

type Updater = CapturedPhoto[] | ((prev: CapturedPhoto[]) => CapturedPhoto[]);

export function usePersistedPhotos(): [CapturedPhoto[], (value: Updater) => void, boolean] {
  const [photos, setPhotosState] = useState<CapturedPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Mirrors state so successive updates never act on stale data.
  const latest = useRef<CapturedPhoto[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: CapturedPhoto[] = [];
      try {
        stored = (await get<CapturedPhoto[]>(DB_KEY)) ?? [];
        // One-time migration from the old localStorage storage.
        if (stored.length === 0) {
          const legacy = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
          if (legacy) {
            stored = JSON.parse(legacy);
            await set(DB_KEY, stored);
            window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('Failed to load photos:', error);
      }
      if (cancelled) return;
      // Keep anything captured while loading.
      latest.current = [...latest.current, ...stored].slice(0, MAX_PHOTOS);
      setPhotosState(latest.current);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPhotos = useCallback((value: Updater) => {
    // Newest photos are first, so keep the head of the list and drop the oldest.
    const next = (value instanceof Function ? value(latest.current) : value).slice(0, MAX_PHOTOS);
    latest.current = next;
    setPhotosState(next);
    set(DB_KEY, next).catch(error => console.error('Failed to save photos:', error));
  }, []);

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

  return [photos, setPhotos, loaded];
}
