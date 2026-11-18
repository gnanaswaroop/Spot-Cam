/**
 * @file Persists the photo gallery in IndexedDB (via idb-keyval).
 * IndexedDB has far more headroom than localStorage (~5 MB), which fills up after a few photos.
 *
 * Photos older than the "keep photos for" setting are removed: when the app opens, when it comes back to the foreground,
 * when the setting changes, and at the moment the oldest photo reaches the limit while the app is open.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GalleryPhoto } from '../types';
import { SETTINGS_CHANGED_EVENT, getPhotoTtlMs } from '../utils/settings';
import { expiredCount, isExpired, nextExpiryDelayMs } from '../utils/photoExpiry';
import { loadAll, writeChanges } from '../utils/photoStore';

/** Browsers cap a timer at about 24.8 days; a longer wait is simply re-armed. */
const MAX_TIMER_MS = 2_000_000_000;

type Updater = GalleryPhoto[] | ((prev: GalleryPhoto[]) => GalleryPhoto[]);

/** Returns the photos, a setter, whether loading has finished, and whether the last save failed (usually: no space left). */
export function usePersistedPhotos(): [GalleryPhoto[], (value: Updater) => void, boolean, boolean] {
  const [photos, setPhotosState] = useState<GalleryPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Mirrors state so successive updates never act on stale data.
  const latest = useRef<GalleryPhoto[]>([]);
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
        const gone = persisted.current.filter(id => !want.has(id));
        await writeChanges(target.filter(p => !have.has(p.id)), target.map(p => p.id), gone);
        persisted.current = target.map(p => p.id);
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
      let stored: GalleryPhoto[] = [];
      try {
        stored = await loadAll();
        persisted.current = stored.map(p => p.id);
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
