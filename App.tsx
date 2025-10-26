/**
 * @file This is the root component of the SpotCam application.
 * It manages the current view (camera or gallery) and the state of captured photos.
 */

import React, { useState } from 'react';
import { CameraView } from './components/CameraView';
import { GalleryView } from './components/GalleryView';
import { CapturedPhoto } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';

// Define the possible views the application can be in.
type View = 'camera' | 'gallery';

/**
 * The main App component.
 * It acts as a controller, switching between the CameraView and GalleryView
 * and passing down photo data and event handlers.
 */
const App: React.FC = () => {
  // State to manage the current active view. Defaults to 'camera'.
  const [view, setView] = useState<View>('camera');
  
  // Custom hook to manage the photos array, persisting it to localStorage.
  // 'spotcam-photos' is the key used in localStorage.
  const [photos, setPhotos] = useLocalStorage<CapturedPhoto[]>('spotcam-photos', []);

  /**
   * Adds a new photo to the beginning of the photos array.
   * @param {CapturedPhoto} photo The new photo object to add.
   */
  const handleCapture = (photo: CapturedPhoto) => {
    setPhotos(prevPhotos => [photo, ...prevPhotos]);
  };

  /**
   * Removes a photo from the photos array by its ID.
   * @param {string} id The ID of the photo to delete.
   */
  const handleDelete = (id: string) => {
    setPhotos(prevPhotos => prevPhotos.filter(p => p.id !== id));
  };

  /**
   * Switches the application view.
   * @param {View} targetView The view to switch to ('camera' or 'gallery').
   */
  const switchView = (targetView: View) => {
    setView(targetView);
  };

  return (
    <div className="w-full h-full bg-gray-900">
      {/* Conditionally render the CameraView */}
      {view === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          onSwitchView={() => switchView('gallery')}
        />
      )}
      {/* Conditionally render the GalleryView */}
      {view === 'gallery' && (
        <GalleryView
          photos={photos}
          onDelete={handleDelete}
          onSwitchView={() => switchView('camera')}
        />
      )}
    </div>
  );
};

export default App;
