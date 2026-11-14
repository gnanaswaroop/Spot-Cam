/**
 * @file Persists the photo gallery in IndexedDB (via idb-keyval).
 * IndexedDB has far more headroom than localStorage (~5 MB), which fills up after a few photos.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { CapturedPhoto } from '../types';

const DB_KEY = 'spotcam-photos';
const LEGACY_LOCALSTORAGE_KEY = 'spotcam-photos';
const MAX_PHOTOS = 12;

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

  return [photos, setPhotos, loaded];
}
