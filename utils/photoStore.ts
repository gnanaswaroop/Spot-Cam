/**
 * Where the photos live in IndexedDB. Each photo has two entries so the gallery can stay light:
 *  - `spotcam-photo:<id>`      the small record: time, place, a thumbnail and the size of the photo
 *  - `spotcam-photo-full:<id>` the full-size photo (a data URL) or the video (a Blob), read only when it is opened, shared or downloaded
 * and `spotcam-photo-ids` lists the ids, newest first.
 */
import { del, delMany, get, getMany, set, setMany } from 'idb-keyval';
import type { CapturedPhoto, CapturedVideo, GalleryPhoto } from '../types';
import { dataUrlBytes } from './storageUsage';
import { thumbnailFromDataUrl } from './thumbnail';

const INDEX_KEY = 'spotcam-photo-ids';
const metaKey = (id: string) => `spotcam-photo:${id}`;
const fullKey = (id: string) => `spotcam-photo-full:${id}`;
/** Older versions kept the whole list under this one key (and before that in localStorage). */
const LEGACY_LIST_KEY = 'spotcam-photos';
const LEGACY_LOCALSTORAGE_KEY = 'spotcam-photos';

/** Photos taken but not yet written: their full-size data stays here, so they open at once and the write can use it. */
const pendingFull = new Map<string, string | Blob>();

/** Remembers a new photo's full-size data until it is written. */
export const holdFull = (id: string, data: string | Blob) => void pendingFull.set(id, data);

const readStored = async (id: string): Promise<string | Blob | undefined> => pendingFull.get(id) ?? (await get<string | Blob>(fullKey(id)));

/** The full-size photo: from memory when it was just taken, otherwise from the database. */
export const readFull = async (id: string): Promise<string | undefined> => {
  const stored = await readStored(id);
  return typeof stored === 'string' ? stored : undefined;
};

/** A saved video's recording. */
export const readVideo = async (id: string): Promise<Blob | undefined> => {
  const stored = await readStored(id);
  return typeof stored === 'string' ? undefined : stored;
};

/** The record for a video that was just recorded (its data goes in with `holdFull`). */
export const metaForVideo = (video: CapturedVideo): GalleryPhoto => ({
  id: video.id,
  thumbUrl: video.thumbUrl,
  bytes: video.blob.size,
  timestamp: video.timestamp,
  location: video.location,
  kind: 'video',
  mimeType: video.mimeType,
  durationMs: video.durationMs,
});

/** The record for a photo that was just taken (the full-size data goes in with `holdFull`). */
export const metaFor = (photo: CapturedPhoto): GalleryPhoto => ({
  id: photo.id,
  thumbUrl: photo.thumbUrl ?? photo.dataUrl,
  bytes: dataUrlBytes(photo.dataUrl),
  timestamp: photo.timestamp,
  location: photo.location,
});

/** A record from an older version (the photo's data inside it) turned into the current layout, writing the full photo on the way. */
type StoredItem = Partial<CapturedPhoto> & Partial<GalleryPhoto> & { id: string };
const upgrade = async (item: StoredItem): Promise<GalleryPhoto> => {
  if (!item.dataUrl) return item as GalleryPhoto;
  await set(fullKey(item.id), item.dataUrl);
  return {
    id: item.id,
    thumbUrl: item.thumbUrl ?? (await thumbnailFromDataUrl(item.dataUrl)),
    bytes: dataUrlBytes(item.dataUrl),
    timestamp: item.timestamp ?? Date.now(),
    location: item.location ?? null,
  };
};

/** Every saved photo's record, newest first, carrying over anything an older version saved. */
export const loadAll = async (): Promise<GalleryPhoto[]> => {
  const ids = await get<string[]>(INDEX_KEY);
  if (ids) {
    const items = (await getMany<StoredItem>(ids.map(metaKey))).filter((x): x is StoredItem => !!x);
    const upgraded = await Promise.all(items.map(upgrade));
    // Rewrite the records that changed layout, so this only happens once.
    const changed = upgraded.filter((p, i) => items[i].dataUrl);
    if (changed.length > 0) await setMany(changed.map(p => [metaKey(p.id), p] as [string, GalleryPhoto]));
    return upgraded;
  }
  // The single list from an older version, or the even older localStorage copy.
  let legacy = (await get<CapturedPhoto[]>(LEGACY_LIST_KEY)) ?? [];
  let fromLocalStorage = false;
  if (legacy.length === 0) {
    const raw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (raw) {
      legacy = JSON.parse(raw);
      fromLocalStorage = true;
    }
  }
  if (legacy.length === 0) return [];
  const upgraded = await Promise.all(legacy.map(upgrade));
  await setMany(upgraded.map(p => [metaKey(p.id), p] as [string, GalleryPhoto]));
  await set(INDEX_KEY, upgraded.map(p => p.id));
  await del(LEGACY_LIST_KEY);
  if (fromLocalStorage) window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  return upgraded;
};

/** Writes the new photos (record and full-size data), then the order, then removes the ones that went. */
export const writeChanges = async (added: GalleryPhoto[], order: string[], removed: string[]): Promise<void> => {
  const entries: [string, unknown][] = [];
  for (const meta of added) {
    const full = pendingFull.get(meta.id);
    if (full) entries.push([fullKey(meta.id), full]);
    entries.push([metaKey(meta.id), meta]);
  }
  await setMany(entries);
  await set(INDEX_KEY, order);
  for (const meta of added) pendingFull.delete(meta.id);
  for (const id of removed) pendingFull.delete(id);
  if (removed.length > 0) await delMany(removed.flatMap(id => [metaKey(id), fullKey(id)]));
};
