/**
 * @file This component displays the gallery of captured photos, allowing users
 * to view, share, and delete them.
 */

import React, { useEffect, useState } from 'react';
import { GalleryPhoto } from '../types';
import { useHistoryOverlay, hasOverlayEntry } from '../hooks/useHistoryOverlay';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useSwipe } from '../hooks/useSwipe';
import { SLIDE_MS, prefersReducedMotion, useSlide } from '../hooks/useSlide';
import { dataURLtoFile, downloadFile, formatDateTime } from '../utils/helpers';
import { readFull } from '../utils/photoStore';
import { useLongPress } from '../hooks/useLongPress';
import { dayLabel } from '../utils/dateLabels';
import { ttlLabel } from '../utils/photoExpiry';
import { shareSignature, shareText } from '../utils/maps';
import { getMapService, getPhotoTtlMs, getShareSignature } from '../utils/settings';
import { track } from '../utils/analytics';
import { estimateFreeBytes, formatBytes, isLowOnSpace } from '../utils/storageUsage';
import { ShareIcon, DeleteIcon, DownloadIcon, CloseIcon, GalleryIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { AppHeader } from './AppHeader';

/** Props for the GalleryView component. */
interface GalleryViewProps {
  /** An array of captured photo objects. */
  photos: GalleryPhoto[];
  /** Callback function to delete a photo by its ID. */
  onDelete: (id: string) => void;
  /** Callback function to delete several photos at once. */
  onDeleteMany: (ids: string[]) => void;
  /** Callback function to switch to the camera view. */
  onSwitchView: () => void;
}

/** "14/11/2026, 18:42:10 at Champ de Mars, Paris": the text a screen reader needs, since the stamp is drawn into the pixels. */
const photoDescription = (photo: GalleryPhoto) => {
  const where = photo.location?.address ?? (photo.location ? `${photo.location.latitude.toFixed(5)}, ${photo.location.longitude.toFixed(5)}` : '');
  return where ? `${formatDateTime(photo.timestamp)} at ${where}` : formatDateTime(photo.timestamp);
};

/**
 * A modal component to display a selected photo in full view with actions.
 */
/** The full-size photo, with the small copy showing until it has been read from storage. */
const FullPhoto = ({ photo, alt }: { photo: GalleryPhoto; alt: string }) => {
    const [full, setFull] = useState<string | undefined>(undefined);
    useEffect(() => {
        let cancelled = false;
        setFull(undefined);
        readFull(photo.id).then(url => !cancelled && setFull(url));
        return () => {
            cancelled = true;
        };
    }, [photo.id]);
    return <img src={full ?? photo.thumbUrl} alt={alt} draggable={false} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />;
};

const PhotoModal = ({ photo, before, after, position, total, onPrevious, onNext, onClose, onDelete, onShare, onDownload }: { photo: GalleryPhoto, before?: GalleryPhoto, after?: GalleryPhoto, position: number, total: number, onPrevious?: () => void, onNext?: () => void, onClose: () => void, onDelete: (id: string) => void, onShare: (photo: GalleryPhoto) => void, onDownload: (photo: GalleryPhoto) => void }) => {
    // Layout is a flex column sized to the *visible* viewport: the image takes whatever space is left,
    // while the details and the Share/Delete buttons are pinned and can never be pushed off-screen.
    const ref = useDialogFocus<HTMLDivElement>(onClose);
    // The photos before and after this one sit beside it, so they glide in as the finger moves.
    const { go, settling, instant } = useSlide({ onNext, onPrevious });
    const { handlers, offset, dragging } = useSwipe({ onNext: onNext && (() => go('next')), onPrevious: onPrevious && (() => go('previous')) });
    const day = dayLabel(photo.timestamp);
    const glide = !dragging && !instant && !prefersReducedMotion();
    const strip = settling === 'next' ? 'translateX(-200%)' : settling === 'previous' ? 'translateX(0%)' : `translateX(calc(-100% + ${offset}px))`;

    // Left and right arrow keys move between photos (a keyboard or a tablet with one).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') go('next');
            else if (e.key === 'ArrowLeft') go('previous');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go]);

    /** One photo's place in the strip. The neighbours are only for looking at while sliding. */
    const slot = (shown: GalleryPhoto | undefined, current: boolean) => (
        <div className="flex h-full w-full shrink-0 items-center justify-center" aria-hidden={current ? undefined : true}>
            {shown && <FullPhoto photo={shown} alt={current ? `Photo taken ${photoDescription(shown)}` : ''} />}
        </div>
    );

    return (
        <div ref={ref} tabIndex={-1} className="app-h fixed inset-x-0 top-0 z-40 flex flex-col items-center bg-black/90 px-4 pt-14 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-in focus:outline-none" role="dialog" aria-modal="true" aria-label="Photo">
            {/* Close Button */}
            <button onClick={onClose} className="absolute top-3 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700" aria-label="Close photo view">
                <CloseIcon className="w-6 h-6" />
            </button>
            {/* Which photo this is, out of how many */}
            {total > 1 && (
                <p className="absolute left-4 top-3 flex h-11 items-center rounded-full bg-gray-800 px-4 text-sm text-gray-200" aria-live="polite">
                    <span className="sr-only">{`Photo ${position} of ${total}`}</span>
                    <span aria-hidden="true">{position} / {total}</span>
                </p>
            )}
            {/* Image Container: fills the remaining height. Swipe sideways for the next or previous photo. */}
            <div className="relative min-h-0 w-full max-w-4xl flex-1 touch-pan-y select-none overflow-hidden" {...handlers}>
                <div
                    className="flex h-full w-full will-change-transform"
                    style={{ transform: strip, transition: glide ? `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none' }}
                >
                    {slot(before, false)}
                    {slot(photo, true)}
                    {slot(after, false)}
                </div>
                {onPrevious && (
                    <button onClick={() => go('previous')} className="absolute left-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-gray-900/70 text-white hover:bg-gray-700" aria-label="Previous photo">
                        <ChevronLeftIcon className="h-6 w-6" />
                    </button>
                )}
                {onNext && (
                    <button onClick={() => go('next')} className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-gray-900/70 text-white hover:bg-gray-700" aria-label="Next photo">
                        <ChevronRightIcon className="h-6 w-6" />
                    </button>
                )}
            </div>
            {/* Photo Metadata (location lines are hidden on very short screens, e.g. landscape phones) */}
            <div className="mt-3 max-w-xl shrink-0 text-center text-sm text-gray-300">
                <p className="font-semibold text-white">
                    {day.label}
                    {day.label !== day.date && <span className="font-normal text-gray-400"> · {day.date}</span>}
                </p>
                <p>{formatDateTime(photo.timestamp)}</p>
                {photo.location && (
                    <div className="[@media(max-height:480px)]:hidden">
                        <p>Lat: {photo.location.latitude.toFixed(5)}, Lon: {photo.location.longitude.toFixed(5)}</p>
                        {photo.location.address && <p className="mt-1 text-gray-400">{photo.location.address}</p>}
                    </div>
                )}
            </div>
            {/* Action Buttons: always visible */}
            <div className="mt-4 flex shrink-0 items-center space-x-8">
                <button onClick={() => onShare(photo)} className="flex min-h-11 min-w-11 flex-col items-center text-white hover:text-blue-400 transition-colors" aria-label="Share photo">
                    <ShareIcon className="w-8 h-8" />
                    <span className="text-xs mt-1">Share</span>
                </button>
                <button onClick={() => onDownload(photo)} className="flex min-h-11 min-w-11 flex-col items-center text-white hover:text-blue-400 transition-colors" aria-label="Download photo">
                    <DownloadIcon className="w-8 h-8" />
                    <span className="text-xs mt-1">Download</span>
                </button>
                <button onClick={() => onDelete(photo.id)} className="flex min-h-11 min-w-11 flex-col items-center text-white hover:text-red-400 transition-colors" aria-label="Delete photo">
                    <DeleteIcon className="w-8 h-8" />
                    <span className="text-xs mt-1">Delete</span>
                </button>
            </div>
        </div>
    );
};

/**
 * A modal dialog to confirm a destructive action, such as deleting a photo.
 */
const ConfirmationDialog = ({ count = 1, onConfirm, onCancel }: { count?: number; onConfirm: () => void; onCancel: () => void; }) => {
    const ref = useDialogFocus<HTMLDivElement>(onCancel);
    return (
        <div ref={ref} tabIndex={-1} className="focus:outline-none app-h fixed inset-x-0 top-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" aria-modal="true" role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
            <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-700">
                <h3 className="text-white text-lg font-semibold mb-4" id="dialog-title">Confirm Deletion</h3>
                <p className="text-gray-300 mb-6" id="dialog-description">{count === 1 ? 'Are you sure you want to delete this photo?' : `Are you sure you want to delete these ${count} photos?`}</p>
                <div className="flex justify-end space-x-4">
                    <button 
                        onClick={onCancel} 
                        className="px-4 py-2 rounded-md bg-gray-600 text-white hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * The main component for the gallery interface.
 */
export const GalleryView: React.FC<GalleryViewProps> = ({ photos, onDelete, onDeleteMany, onSwitchView }) => {
  // Both layers own a history entry, so the Back gesture closes the top one instead of leaving the page.
  const [selectedPhoto, openPhoto, closePhoto, showPhoto] = useHistoryOverlay<GalleryPhoto>('photoViewer');
  const [photoIdToDelete, openDeleteConfirm, closeDeleteConfirm] = useHistoryOverlay<string>('deleteConfirm');
  const [idsToDelete, openDeleteMany, closeDeleteMany] = useHistoryOverlay<string[]>('deleteManyConfirm');
  // How much room the photos take, and what the browser still has (an estimate; null when it cannot say).
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    estimateFreeBytes().then(free => !cancelled && setFreeBytes(free));
    return () => {
      cancelled = true;
    };
  }, [photos.length]);
  // Holding a photo starts selecting with that photo ticked.
  const longPress = useLongPress((id: string) => setSelection(new Set([id])));
  // Multi-select: `null` means normal browsing, a set means selecting.
  const [selection, setSelection] = useState<Set<string> | null>(null);

  /**
   * Handles sharing a photo using the Web Share API.
   * @param {GalleryPhoto} photo The photo to be shared.
   */
  const handleShare = async (photo: GalleryPhoto) => {
    // Convert the data URL to a File object, which is required by the Web Share API for files.
    const file = await photoFile(photo);
    if (!file) return alert('Could not read the photo.');
    
    // Check if the browser supports sharing files.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Photo from SpotCam`,
          text: shareText(photo, getMapService(), getShareSignature() ? shareSignature(window.location.origin) : null),
        });
        track('share_used');
      } catch (error) {
        // Handle cases where the user cancels the share dialog or an error occurs.
        console.error('Error sharing:', error);
        alert('Could not share the photo.');
      }
    } else {
      // Fallback for browsers that do not support the Web Share API.
      alert('Sharing is not supported on this browser.');
    }
  };
  
  /** The full-size photo as a file, read from storage (null if it is missing). */
  const photoFile = async (photo: GalleryPhoto) => {
    const dataUrl = await readFull(photo.id);
    return dataUrl ? dataURLtoFile(dataUrl, `SpotCam_${photo.id}.jpg`) : null;
  };

  /** Saves a photo to the device's downloads. */
  const handleDownload = async (photo: GalleryPhoto) => {
    const file = await photoFile(photo);
    if (file) downloadFile(file);
    else alert('Could not read the photo.');
  };

  /** Downloads every selected photo, one after another (browsers ignore downloads that arrive all in the same instant). */
  const handleDownloadSelected = async () => {
    for (const id of selectedIds) {
      const photo = photos.find(p => p.id === id);
      if (photo) await handleDownload(photo);
      await new Promise(done => setTimeout(done, 350));
    }
  };

  /** Sets the ID of the photo to be deleted, triggering the confirmation dialog. */
  const requestDelete = (id: string) => {
    openDeleteConfirm(id);
  };
  
  /** Confirms and executes the deletion of a photo. */
  const handleConfirmDelete = () => {
    if (photoIdToDelete) {
      onDelete(photoIdToDelete);
      // Close the confirm dialog and the viewer together: both history entries go in one step.
      if (hasOverlayEntry('deleteConfirm') && hasOverlayEntry('photoViewer')) {
        window.history.go(-2);
      } else {
        closeDeleteConfirm();
        closePhoto();
      }
    }
  };

  /** Deletes the selected photos and leaves select mode. */
  const handleConfirmDeleteMany = () => {
    if (idsToDelete) onDeleteMany(idsToDelete);
    closeDeleteMany();
    setSelection(null);
  };

  const toggleSelected = (id: string) => setSelection(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  /** Cancels the deletion process. */
  const handleCancelDelete = () => {
    closeDeleteConfirm();
  };

  // Create a sorted copy of the photos array to display the newest ones first.
  const sortedPhotos = [...photos].sort((a, b) => b.timestamp - a.timestamp);

  // The same photos in groups by calendar day ("Today", "Yesterday", ...), still newest first.
  const now = Date.now();
  const days: { key: string; label: string; date: string; photos: GalleryPhoto[] }[] = [];
  for (const photo of sortedPhotos) {
    const day = dayLabel(photo.timestamp, now);
    const last = days[days.length - 1];
    if (last && last.key === day.key) last.photos.push(photo);
    else days.push({ ...day, photos: [photo] });
  }

  // Where the open photo sits in that order, for the swipe and the arrows.
  const viewedIndex = selectedPhoto ? sortedPhotos.findIndex(p => p.id === selectedPhoto.id) : -1;
  // If the photo being looked at expires (see "Keep photos for" in Settings), close the viewer instead of showing a deleted photo.
  // (While a delete is being confirmed, the delete flow closes the viewer itself.)
  useEffect(() => {
    if (selectedPhoto && viewedIndex === -1 && !photoIdToDelete) closePhoto();
  }, [selectedPhoto, viewedIndex, photoIdToDelete, closePhoto]);

  // Only photos that still exist count (one may have expired while selecting).
  const selectedIds = selection ? sortedPhotos.filter(p => selection.has(p.id)).map(p => p.id) : [];
  const allSelected = selection !== null && sortedPhotos.length > 0 && selectedIds.length === sortedPhotos.length;
  // Leave select mode when the gallery empties.
  useEffect(() => {
    if (selection && photos.length === 0) setSelection(null);
  }, [selection, photos.length]);

  const previous = viewedIndex > 0 ? () => showPhoto(sortedPhotos[viewedIndex - 1]) : undefined;
  const next = viewedIndex >= 0 && viewedIndex < sortedPhotos.length - 1 ? () => showPhoto(sortedPhotos[viewedIndex + 1]) : undefined;

  return (
    <div className="app-h w-full bg-gray-900 text-white flex flex-col">
      <AppHeader onBack={onSwitchView} />
      <main className="flex min-h-0 flex-grow flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h1 className="text-xl font-bold">Gallery</h1>
        {photos.length > 0 && !selection && (
          <button type="button" onClick={() => setSelection(new Set())} className="min-h-11 rounded-md px-3 text-sm font-semibold text-blue-300 hover:text-blue-200">
            Select
          </button>
        )}
      </div>
      {selection && (
        <div role="toolbar" aria-label="Selection actions" className="flex flex-wrap items-center gap-2 px-4 pt-2">
          <span role="status" className="mr-auto text-sm text-gray-300">{selectedIds.length} selected</span>
          <button type="button" onClick={() => setSelection(allSelected ? new Set() : new Set(sortedPhotos.map(p => p.id)))} className="min-h-11 rounded-md bg-gray-700 px-3 text-sm hover:bg-gray-600">
            {allSelected ? 'Clear selection' : 'Select all'}
          </button>
          <button type="button" disabled={selectedIds.length === 0} onClick={handleDownloadSelected} className="min-h-11 rounded-md bg-gray-700 px-3 text-sm hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700">
            Download selected
          </button>
          <button type="button" disabled={selectedIds.length === 0} onClick={() => openDeleteMany(selectedIds)} className="min-h-11 rounded-md bg-red-600 px-3 text-sm font-semibold hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600">
            Delete selected
          </button>
          <button type="button" onClick={() => setSelection(null)} className="min-h-11 rounded-md px-3 text-sm hover:bg-gray-700">
            Cancel
          </button>
        </div>
      )}
      {photos.length > 0 && (
        <p className="px-4 pt-1 text-sm text-gray-400" data-testid="gallery-storage-note">
          These photos live inside SpotCam, not in your phone&rsquo;s Photos or Gallery app. To keep one, open it and tap Share, then save it to your phone.
        </p>
      )}
      {photos.length > 0 && (
        <p className="px-4 pt-1 text-sm text-gray-400" data-testid="gallery-storage-usage">
          {photos.length === 1 ? '1 photo' : `${photos.length} photos`} use {formatBytes(photos.reduce((sum, p) => sum + p.bytes, 0))} on this device
          {freeBytes !== null && <> &middot; about {formatBytes(freeBytes)} still free</>}.
          {isLowOnSpace(freeBytes) && <span className="font-semibold text-amber-300"> Space is running low: delete some photos to make room.</span>}
        </p>
      )}
      {photos.length > 0 && getPhotoTtlMs() !== null && (
        <p className="px-4 pt-1 text-sm text-gray-400">Photos are removed after {ttlLabel(getPhotoTtlMs())}. You can change this in Settings.</p>
      )}
      {photos.length === 0 ? (
        // Display a message when the gallery is empty
        <div role="status" className="flex-grow flex flex-col items-center justify-center text-gray-400">
          <GalleryIcon className="w-16 h-16 mb-4" />
          <p>No photos yet.</p>
          <p>Go back to the camera to take some!</p>
        </div>
      ) : (
        // Display the photos, a heading for each day
        <div className="flex-grow overflow-y-auto p-2">
          {days.map(day => (
            <section key={day.key} aria-labelledby={`day-${day.key}`} className="mb-4">
              <h2 id={`day-${day.key}`} className="px-1 pb-2 pt-1 text-base font-semibold">
                {day.label}
                {day.label !== day.date && <span className="font-normal text-gray-400"> · {day.date}</span>}
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {day.photos.map((photo) => (
                  <button key={photo.id} type="button" {...longPress(photo.id, !selection)} className={`relative aspect-square select-none [-webkit-touch-callout:none] bg-gray-700 rounded-lg overflow-hidden cursor-pointer ${selection?.has(photo.id) ? 'ring-4 ring-blue-500' : ''} transform hover:scale-105 motion-reduce:transform-none transition-transform`} onClick={() => (selection ? toggleSelected(photo.id) : openPhoto(photo))} aria-pressed={selection ? selection.has(photo.id) : undefined} aria-label={`${selection ? 'Select' : 'Open'} photo taken ${photoDescription(photo)}`}>
                    <img src={photo.thumbUrl} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" loading="lazy" />
                    {selection && (
                      <span aria-hidden="true" className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 text-sm font-bold ${selection.has(photo.id) ? 'border-blue-500 bg-blue-500 text-white' : 'border-white bg-black/30'}`}>
                        {selection.has(photo.id) ? '✓' : ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      </main>
      {/* Modals are rendered conditionally based on state */}
      {selectedPhoto && <PhotoModal photo={selectedPhoto} before={sortedPhotos[viewedIndex - 1]} after={sortedPhotos[viewedIndex + 1]} position={viewedIndex + 1} total={sortedPhotos.length} onPrevious={previous} onNext={next} onClose={closePhoto} onDelete={requestDelete} onShare={handleShare} onDownload={handleDownload} />}
      {idsToDelete && <ConfirmationDialog count={idsToDelete.length} onConfirm={handleConfirmDeleteMany} onCancel={closeDeleteMany} />}
      {photoIdToDelete && <ConfirmationDialog onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />}
    </div>
  );
};
