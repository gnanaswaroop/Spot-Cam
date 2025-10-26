/**
 * @file This component displays the gallery of captured photos, allowing users
 * to view, share, and delete them.
 */

import React, { useState } from 'react';
import { CapturedPhoto } from '../types';
import { dataURLtoFile, formatDateTime } from '../utils/helpers';
import { CameraIcon, ShareIcon, DeleteIcon, CloseIcon, GalleryIcon } from './icons';

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
    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-40 p-4 animate-fade-in">
            {/* Close Button */}
            <button onClick={onClose} className="absolute top-4 right-4 text-white p-2 rounded-full bg-gray-800 hover:bg-gray-700" aria-label="Close photo view">
                <CloseIcon className="w-6 h-6" />
            </button>
            {/* Image Container */}
            <div className="w-full max-w-4xl max-h-[70vh] flex items-center justify-center">
                <img src={photo.dataUrl} alt={`Captured at ${formatDateTime(photo.timestamp)}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
            </div>
            {/* Photo Metadata */}
            <div className="text-center text-gray-300 mt-4 text-sm max-w-xl">
                <p>{formatDateTime(photo.timestamp)}</p>
                {photo.location && (
                    <>
                        <p>Lat: {photo.location.latitude.toFixed(5)}, Lon: {photo.location.longitude.toFixed(5)}</p>
                        {photo.location.address && <p className="mt-1 text-gray-400">{photo.location.address}</p>}
                    </>
                )}
            </div>
            {/* Action Buttons */}
            <div className="flex items-center space-x-6 mt-6">
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in" aria-modal="true" role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
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
  const [selectedPhoto, setSelectedPhoto] = useState<CapturedPhoto | null>(null);
  const [photoIdToDelete, setPhotoIdToDelete] = useState<string | null>(null);

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
    setPhotoIdToDelete(id);
  };
  
  /** Confirms and executes the deletion of a photo. */
  const handleConfirmDelete = () => {
    if (photoIdToDelete) {
      onDelete(photoIdToDelete);
      setSelectedPhoto(null); // Close modal if the deleted photo was selected
      setPhotoIdToDelete(null); // Close confirmation dialog
    }
  };

  /** Cancels the deletion process. */
  const handleCancelDelete = () => {
    setPhotoIdToDelete(null);
  };

  // Create a sorted copy of the photos array to display the newest ones first.
  const sortedPhotos = [...photos].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="w-full h-full bg-gray-900 text-white flex flex-col">
      <header className="w-full p-4 bg-gray-800 shadow-md flex items-center justify-between z-10">
        <h1 className="text-xl font-bold">Gallery</h1>
        <button onClick={onSwitchView} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Go to camera view">
          <CameraIcon className="w-7 h-7" />
        </button>
      </header>
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
              <div key={photo.id} className="aspect-square bg-gray-700 rounded-lg overflow-hidden cursor-pointer transform hover:scale-105 transition-transform" onClick={() => setSelectedPhoto(photo)}>
                <img src={photo.dataUrl} alt={`Captured at ${formatDateTime(photo.timestamp)}`} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Modals are rendered conditionally based on state */}
      {selectedPhoto && <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} onDelete={requestDelete} onShare={handleShare} />}
      {photoIdToDelete && <ConfirmationDialog onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />}
    </div>
  );
};
