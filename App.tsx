/**
 * @file This is the root component of the SpotCam application.
 * It manages the current view (landing, camera or gallery; chosen by the URL path) and the state of captured photos.
 */

import React from 'react';
import { CameraView } from './components/CameraView';
import { GalleryView } from './components/GalleryView';
import { LandingView } from './components/LandingView';
import { CapturedPhoto } from './types';
import { usePersistedPhotos } from './hooks/usePersistedPhotos';
import { usePathRoute } from './hooks/usePathRoute';

/**
 * The main App component.
 * It acts as a controller, switching between the CameraView and GalleryView
 * and passing down photo data and event handlers.
 */
const App: React.FC = () => {
  // Current view comes from the URL path (/, /cam, /gallery), so each page is bookmarkable.
  const [view, switchView] = usePathRoute();
  
  // Custom hook to manage the photos array, persisting it to IndexedDB.
  const [photos, setPhotos] = usePersistedPhotos();

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

  return (
    <div className="w-full h-full bg-gray-900">
      {view === 'landing' && <LandingView onStart={() => switchView('camera')} />}
      {/* Conditionally render the CameraView */}
      {view === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          onSwitchView={() => switchView('gallery')}
          onHome={() => switchView('landing')}
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
