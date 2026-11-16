/**
 * @file This is the root component of the SpotCam application.
 * It manages the current view (landing, camera or gallery; chosen by the URL path) and the state of captured photos.
 */

import React, { useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { GalleryView } from './components/GalleryView';
import { LandingView } from './components/LandingView';
import { PrivacyView } from './components/PrivacyView';
import { HowItWorksView } from './components/HowItWorksView';
import { SettingsView } from './components/SettingsView';
import { PAGE_TITLES } from './utils/constants';
import { CapturedPhoto } from './types';
import { usePersistedPhotos } from './hooks/usePersistedPhotos';
import { usePathRoute } from './hooks/usePathRoute';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useServiceWorkerUpdate } from './hooks/useServiceWorker';
import { UpdateToast } from './components/UpdateToast';

/**
 * The main App component.
 * It acts as a controller, switching between the CameraView and GalleryView
 * and passing down photo data and event handlers.
 */
const App: React.FC = () => {
  // Track the visible viewport height so bottom controls are never hidden behind browser/system bars.
  useViewportHeight();
  // Offline support: a new version waits until the person taps Reload.
  const { updateReady, applyUpdate } = useServiceWorkerUpdate();
  // Current view comes from the URL path (/, /cam, /gallery), so each page is bookmarkable.
  const [view, switchView] = usePathRoute();
  
  // A meaningful <title> per page: it is what a screen reader announces when the page changes.
  useEffect(() => {
    document.title = PAGE_TITLES[view];
  }, [view]);

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
      {updateReady && <UpdateToast onReload={applyUpdate} />}
      {view === 'landing' && <LandingView onStart={() => switchView('camera')} onPrivacy={() => switchView('privacy')} onHowItWorks={() => switchView('howItWorks')} />}
      {view === 'howItWorks' && <HowItWorksView onBack={() => switchView('landing')} onStart={() => switchView('camera')} />}
      {view === 'privacy' && <PrivacyView onBack={() => switchView('landing')} />}
      {/* Conditionally render the CameraView */}
      {view === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          onSwitchView={() => switchView('gallery')}
          onHome={() => switchView('landing')}
          onOpenSettings={() => switchView('settings')}
        />
      )}
      {view === 'settings' && (
        <SettingsView
          photoCount={photos.length}
          onDeleteAllPhotos={() => setPhotos([])}
          onBack={() => switchView('camera')}
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
