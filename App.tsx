/**
 * @file This is the root component of the SpotCam application.
 * It manages the current view (landing, camera or gallery; chosen by the URL path) and the state of captured photos.
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { LandingView } from './components/LandingView';
import { useT } from './utils/i18n';
import { CapturedPhoto, CapturedVideo } from './types';
import { holdFull, metaFor, metaForVideo } from './utils/photoStore';
import { usePersistedPhotos } from './hooks/usePersistedPhotos';
import { usePathRoute } from './hooks/usePathRoute';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useServiceWorkerUpdate } from './hooks/useServiceWorker';
import { UpdateToast } from './components/UpdateToast';
import { requestPersistentStorage } from './utils/storageUsage';

// The pages that are not the first screen load when they are opened (and are kept for offline use by the service worker),
// so the first load downloads less.
const GalleryView = lazy(() => import('./components/GalleryView').then(m => ({ default: m.GalleryView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const PrivacyView = lazy(() => import('./components/PrivacyView').then(m => ({ default: m.PrivacyView })));
const HowItWorksView = lazy(() => import('./components/HowItWorksView').then(m => ({ default: m.HowItWorksView })));

/**
 * The main App component.
 * It acts as a controller, switching between the CameraView and GalleryView
 * and passing down photo data and event handlers.
 */
const App: React.FC = () => {
  const { t, lang } = useT();
  // Track the visible viewport height so bottom controls are never hidden behind browser/system bars.
  useViewportHeight();
  // Offline support: a new version waits until the person taps Reload.
  const { updateReady, applyUpdate } = useServiceWorkerUpdate();
  // Current view comes from the URL path (/, /cam, /gallery), so each page is bookmarkable.
  const [view, switchView] = usePathRoute();
  
  // A meaningful <title> per page: it is what a screen reader announces when the page changes.
  useEffect(() => {
    document.title = t(`title.${view}` as const);
  }, [view, t, lang]);

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
  };

  /** Adds a video that was just recorded, next to the photos. */
  const handleVideo = (video: CapturedVideo) => {
    void requestPersistentStorage();
    holdFull(video.id, video.blob); // the recording waits here until it is written
    setPhotos(prevPhotos => [metaForVideo(video), ...prevPhotos]);
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
          {t('app.saveFailed')}
        </div>
      )}
      {/* Only on the landing page: on the other pages the fixed banner would sit on top of their headings. */}
      {view === 'landing' && <LandingView onStart={() => switchView('camera')} onPrivacy={() => switchView('privacy')} onHowItWorks={() => switchView('howItWorks')} onSettings={() => switchView('settings')} />}
      <Suspense fallback={null}>
      {view === 'howItWorks' && <HowItWorksView onBack={() => switchView('landing')} onStart={() => switchView('camera')} />}
      {view === 'privacy' && <PrivacyView onBack={() => switchView('landing')} />}
      {/* Conditionally render the CameraView */}
      {view === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          onVideo={handleVideo}
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
      </Suspense>
    </div>
  );
};

export default App;
