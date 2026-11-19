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
import { holdFull, metaFor } from './utils/photoStore';
import { usePersistedPhotos } from './hooks/usePersistedPhotos';
import { usePathRoute } from './hooks/usePathRoute';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useServiceWorkerUpdate } from './hooks/useServiceWorker';
import { UpdateToast } from './components/UpdateToast';
import { ConsentBanner } from './components/ConsentBanner';
import { useAnalytics } from './hooks/useAnalytics';
import { pageView, track } from './utils/analytics';
import { requestPersistentStorage } from './utils/storageUsage';

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

  // Analytics (only when the site is configured for it and the visitor agreed): one page view per route.
  const { consent } = useAnalytics();
  useEffect(() => {
    if (consent === 'granted') pageView(window.location.pathname);
  }, [view, consent]);

  // Custom hook to manage the photos array, persisting it to IndexedDB.
  const [photos, setPhotos, , saveFailed] = usePersistedPhotos();

  /**
   * Adds a new photo to the beginning of the photos array.
   * @param {CapturedPhoto} photo The new photo object to add.
   */
  const handleCapture = (photo: CapturedPhoto) => {
    void requestPersistentStorage(); // asks the browser to keep the photos even when space runs low
    holdFull(photo.id, photo.dataUrl); // the full-size photo waits here until it is written; the gallery only keeps the small record
    setPhotos(prevPhotos => [metaFor(photo), ...prevPhotos]);
    track('photo_captured');
  };

  /**
   * Removes a photo from the photos array by its ID.
   * @param {string} id The ID of the photo to delete.
   */
  const handleDelete = (id: string) => {
    setPhotos(prevPhotos => prevPhotos.filter(p => p.id !== id));
  };

  /** Removes several photos at once (the gallery's multi-select). */
  const handleDeleteMany = (ids: string[]) => {
    const gone = new Set(ids);
    setPhotos(prevPhotos => prevPhotos.filter(p => !gone.has(p.id)));
  };

  return (
    <div className="w-full h-full bg-gray-900">
      {updateReady && <UpdateToast onReload={applyUpdate} />}
      {saveFailed && (
        <div role="alert" className="relative z-50 bg-red-700 px-4 py-2 text-sm text-white">
          Your latest photo could not be saved because this device is out of space for SpotCam. Delete some photos in the gallery to make room.
        </div>
      )}
      {/* Only on the landing page: on the other pages the fixed banner would sit on top of their headings. */}
      {view === 'landing' && <ConsentBanner onPrivacy={() => switchView('privacy')} />}
      {view === 'landing' && <LandingView onStart={() => { track('start_cam'); switchView('camera'); }} onPrivacy={() => switchView('privacy')} onHowItWorks={() => switchView('howItWorks')} />}
      {view === 'howItWorks' && <HowItWorksView onBack={() => switchView('landing')} onStart={() => switchView('camera')} />}
      {view === 'privacy' && <PrivacyView onBack={() => switchView('landing')} />}
      {/* Conditionally render the CameraView */}
      {view === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          onSwitchView={() => switchView('gallery')}
          lastPhotoUrl={photos.length > 0 ? photos.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).thumbUrl : undefined}
          onHome={() => switchView('landing')}
          onOpenSettings={() => switchView('settings')}
        />
      )}
      {view === 'settings' && (
        <SettingsView
          photoCount={photos.length}
          photoTimestamps={photos.map(p => p.timestamp)}
          onDeleteAllPhotos={() => setPhotos([])}
          onBack={() => switchView('camera')}
        />
      )}
      {/* Conditionally render the GalleryView */}
      {view === 'gallery' && (
        <GalleryView
          photos={photos}
          onDelete={handleDelete}
          onDeleteMany={handleDeleteMany}
          onSwitchView={() => switchView('camera')}
        />
      )}
    </div>
  );
};

export default App;
