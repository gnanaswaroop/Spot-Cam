/**
 * @file This component displays the gallery of captured photos, allowing users
 * to view, share, and delete them.
 */

import React from 'react';
import { CapturedPhoto } from '../types';
import { useHistoryOverlay, hasOverlayEntry } from '../hooks/useHistoryOverlay';
import { dataURLtoFile, formatDateTime } from '../utils/helpers';
import { ShareIcon, DeleteIcon, CloseIcon, GalleryIcon } from './icons';
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

/**
 * A modal component to display a selected photo in full view with actions.
 */
const PhotoModal = ({ photo, onClose, onDelete, onShare }: { photo: CapturedPhoto, onClose: () => void, onDelete: (id: string) => void, onShare: (photo: CapturedPhoto) => void }) => {
    // Layout is a flex column sized to the *visible* viewport: the image takes whatever space is left,
    // while the details and the Share/Delete buttons are pinned and can never be pushed off-screen.
    return (
        <div className="app-h fixed inset-x-0 top-0 z-40 flex flex-col items-center bg-black/90 px-4 pt-14 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-in" role="dialog" aria-modal="true" aria-label="Photo">
            {/* Close Button */}
            <button onClick={onClose} className="absolute top-3 right-4 text-white p-2 rounded-full bg-gray-800 hover:bg-gray-700" aria-label="Close photo view">
                <CloseIcon className="w-6 h-6" />
            </button>
            {/* Image Container: fills the remaining height */}
            <div className="flex min-h-0 w-full max-w-4xl flex-1 items-center justify-center">
                <img src={photo.dataUrl} alt={`Captured at ${formatDateTime(photo.timestamp)}`} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
            </div>
            {/* Photo Metadata (location lines are hidden on very short screens, e.g. landscape phones) */}
            <div className="mt-3 max-w-xl shrink-0 text-center text-sm text-gray-300">
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
                <button onClick={() => onShare(photo)} className="flex flex-col items-center text-white hover:text-blue-400 transition-colors" aria-label="Share photo">
                    <ShareIcon className="w-8 h-8" />
                    <span className="text-xs mt-1">Share</span>
                </button>
                <button onClick={() => onDelete(photo.id)} className="flex flex-col items-center text-white hover:text-red-400 transition-colors" aria-label="Delete photo">
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
    return (
        <div className="app-h fixed inset-x-0 top-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" aria-modal="true" role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
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
  const [selectedPhoto, openPhoto, closePhoto] = useHistoryOverlay<CapturedPhoto>('photoViewer');
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
          text: `Captured on ${formatDateTime(photo.timestamp)} at ${photo.location?.address || 'an unknown location'}.`,
        });
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

  return (
    <div className="app-h w-full bg-gray-900 text-white flex flex-col">
      <AppHeader onBack={onSwitchView} />
      <h1 className="px-4 pt-4 text-xl font-bold">Gallery</h1>
      {photos.length === 0 ? (
        // Display a message when the gallery is empty
        <div className="flex-grow flex flex-col items-center justify-center text-gray-500">
          <GalleryIcon className="w-16 h-16 mb-4" />
          <p>No photos yet.</p>
          <p>Go back to the camera to take some!</p>
        </div>
      ) : (
        // Display the grid of photos
        <div className="flex-grow overflow-y-auto p-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {sortedPhotos.map((photo) => (
              <div key={photo.id} className="aspect-square bg-gray-700 rounded-lg overflow-hidden cursor-pointer transform hover:scale-105 transition-transform" onClick={() => openPhoto(photo)}>
                <img src={photo.dataUrl} alt={`Captured at ${formatDateTime(photo.timestamp)}`} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Modals are rendered conditionally based on state */}
      {selectedPhoto && <PhotoModal photo={selectedPhoto} onClose={closePhoto} onDelete={requestDelete} onShare={handleShare} />}
      {photoIdToDelete && <ConfirmationDialog onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />}
    </div>
  );
};
