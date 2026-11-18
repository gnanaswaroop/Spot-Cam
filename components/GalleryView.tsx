/**
 * @file This component displays the gallery of captured photos, allowing users
 * to view, share, and delete them.
 */

import React, { useEffect } from 'react';
import { CapturedPhoto } from '../types';
import { useHistoryOverlay, hasOverlayEntry } from '../hooks/useHistoryOverlay';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useSwipe } from '../hooks/useSwipe';
import { SLIDE_MS, prefersReducedMotion, useSlide } from '../hooks/useSlide';
import { dataURLtoFile, formatDateTime } from '../utils/helpers';
import { dayLabel } from '../utils/dateLabels';
import { shareText } from '../utils/maps';
import { getMapService } from '../utils/settings';
import { track } from '../utils/analytics';
import { ShareIcon, DeleteIcon, CloseIcon, GalleryIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { AppHeader } from './AppHeader';

/** Props for the GalleryView component. */
interface GalleryViewProps {
  /** An array of captured photo objects. */
  photos: CapturedPhoto[];
  /** Callback function to delete a photo by its ID. */
  onDelete: (id: string) => void;
  /** Callback function to switch to the camera view. */
  onSwitchView: () => void;
}

/** "14/11/2026, 18:42:10 at Champ de Mars, Paris": the text a screen reader needs, since the stamp is drawn into the pixels. */
const photoDescription = (photo: CapturedPhoto) => {
  const where = photo.location?.address ?? (photo.location ? `${photo.location.latitude.toFixed(5)}, ${photo.location.longitude.toFixed(5)}` : '');
  return where ? `${formatDateTime(photo.timestamp)} at ${where}` : formatDateTime(photo.timestamp);
};

/**
 * A modal component to display a selected photo in full view with actions.
 */
const PhotoModal = ({ photo, before, after, position, total, onPrevious, onNext, onClose, onDelete, onShare }: { photo: CapturedPhoto, before?: CapturedPhoto, after?: CapturedPhoto, position: number, total: number, onPrevious?: () => void, onNext?: () => void, onClose: () => void, onDelete: (id: string) => void, onShare: (photo: CapturedPhoto) => void }) => {
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
    const slot = (shown: CapturedPhoto | undefined, current: boolean) => (
        <div className="flex h-full w-full shrink-0 items-center justify-center" aria-hidden={current ? undefined : true}>
            {shown && (
                <img
                    src={shown.dataUrl}
                    alt={current ? `Photo taken ${photoDescription(shown)}` : ''}
                    draggable={false}
                    className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                />
            )}
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
const ConfirmationDialog = ({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void; }) => {
    const ref = useDialogFocus<HTMLDivElement>(onCancel);
    return (
        <div ref={ref} tabIndex={-1} className="focus:outline-none app-h fixed inset-x-0 top-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" aria-modal="true" role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
            <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl border border-gray-700">
                <h3 className="text-white text-lg font-semibold mb-4" id="dialog-title">Confirm Deletion</h3>
                <p className="text-gray-300 mb-6" id="dialog-description">Are you sure you want to delete this photo?</p>
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
export const GalleryView: React.FC<GalleryViewProps> = ({ photos, onDelete, onSwitchView }) => {
  // Both layers own a history entry, so the Back gesture closes the top one instead of leaving the page.
  const [selectedPhoto, openPhoto, closePhoto, showPhoto] = useHistoryOverlay<CapturedPhoto>('photoViewer');
  const [photoIdToDelete, openDeleteConfirm, closeDeleteConfirm] = useHistoryOverlay<string>('deleteConfirm');

  /**
   * Handles sharing a photo using the Web Share API.
   * @param {CapturedPhoto} photo The photo to be shared.
   */
  const handleShare = async (photo: CapturedPhoto) => {
    // Convert the data URL to a File object, which is required by the Web Share API for files.
    const file = await dataURLtoFile(photo.dataUrl, `SpotCam_${photo.id}.jpg`);
    
    // Check if the browser supports sharing files.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Photo from SpotCam`,
          text: shareText(photo, getMapService()),
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

  /** Cancels the deletion process. */
  const handleCancelDelete = () => {
    closeDeleteConfirm();
  };

  // Create a sorted copy of the photos array to display the newest ones first.
  const sortedPhotos = [...photos].sort((a, b) => b.timestamp - a.timestamp);

  // The same photos in groups by calendar day ("Today", "Yesterday", ...), still newest first.
  const now = Date.now();
  const days: { key: string; label: string; date: string; photos: CapturedPhoto[] }[] = [];
  for (const photo of sortedPhotos) {
    const day = dayLabel(photo.timestamp, now);
    const last = days[days.length - 1];
    if (last && last.key === day.key) last.photos.push(photo);
    else days.push({ ...day, photos: [photo] });
  }

  // Where the open photo sits in that order, for the swipe and the arrows.
  const viewedIndex = selectedPhoto ? sortedPhotos.findIndex(p => p.id === selectedPhoto.id) : -1;
  const previous = viewedIndex > 0 ? () => showPhoto(sortedPhotos[viewedIndex - 1]) : undefined;
  const next = viewedIndex >= 0 && viewedIndex < sortedPhotos.length - 1 ? () => showPhoto(sortedPhotos[viewedIndex + 1]) : undefined;

  return (
    <div className="app-h w-full bg-gray-900 text-white flex flex-col">
      <AppHeader onBack={onSwitchView} />
      <main className="flex min-h-0 flex-grow flex-col">
      <h1 className="px-4 pt-4 text-xl font-bold">Gallery</h1>
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
                  <button key={photo.id} type="button" className="aspect-square bg-gray-700 rounded-lg overflow-hidden cursor-pointer transform hover:scale-105 motion-reduce:transform-none transition-transform" onClick={() => openPhoto(photo)} aria-label={`Open photo taken ${photoDescription(photo)}`}>
                    <img src={photo.dataUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      </main>
      {/* Modals are rendered conditionally based on state */}
      {selectedPhoto && <PhotoModal photo={selectedPhoto} before={sortedPhotos[viewedIndex - 1]} after={sortedPhotos[viewedIndex + 1]} position={viewedIndex + 1} total={sortedPhotos.length} onPrevious={previous} onNext={next} onClose={closePhoto} onDelete={requestDelete} onShare={handleShare} />}
      {photoIdToDelete && <ConfirmationDialog onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />}
    </div>
  );
};
