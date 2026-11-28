/**
 * @file This component handles the camera functionality, including the live view,
 * data overlay, and photo capture.
 */
import React, { useCallback, useRef, useEffect, useState } from 'react';
import { CapturedPhoto, CapturedVideo, GeolocationData } from '../types';
import { useGeolocation, AddressStatus } from '../hooks/useGeolocation';
import { usePermissionState } from '../hooks/usePermissionState';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { PermissionNotice } from './PermissionNotice';
import { GalleryIcon, SettingsIcon, SwitchCameraIcon } from './icons';
import { FONT_FAMILY_OVERLAY } from '../utils/constants';
import { drawStamp, type StampText } from '../utils/stamp';
import { startRecording, type Recording } from '../utils/videoRecorder';
import { canRecordVideo, formatDuration } from '../utils/video';
import { getRecordSound, getVideoEnabled, getVideoMaxMinutes } from '../utils/settings';
import { makeThumbnail } from '../utils/thumbnail';
import { useCameraRecovery } from '../hooks/useCameraRecovery';
import { continuousModes, openingZoom, pickWideLens, videoRequests, worthAskingAgain } from '../utils/cameraSettings';
import { translate, useT } from '../utils/i18n';

/** Props for the CameraView component. */
interface CameraViewProps {
  /** Callback function to execute when a photo is captured. */
  onCapture: (photo: CapturedPhoto) => void;
  /** Callback function to execute when a video has been recorded. */
  onVideo: (video: CapturedVideo) => void;
  /** Callback function to switch to the gallery view. */
  onSwitchView: () => void;
  /** The newest photo's image, shown as a small preview on the gallery button (the gallery icon when there is none). */
  lastPhotoUrl?: string;
  /** Callback to return to the landing page. */
  onHome: () => void;
  /** Callback to open the settings view. */
  onOpenSettings: () => void;
}

/**
 * A component that displays real-time data (date, time, location) as an overlay on the camera view.
 */
const AddressLine = ({ location, status, onRetry }: { location: GeolocationData; status: AddressStatus; onRetry: () => void }) => {
    const { t } = useT();
    // aria-live: the address is read out when it arrives ("Looking up address..." turns into the street).
    if (location.address) return <p className="px-2 break-words" aria-live="polite">{location.address}</p>;
    if (status === 'offline') return <p className="px-2">{t('camera.offlineAddress')}</p>;
    if (status === 'failed') {
        return (
            <p className="px-2">
                {t('camera.addressUnavailable')}{' '}
                <button onClick={onRetry} className="inline-block min-h-6 px-1 underline underline-offset-2" aria-label={t('camera.retryAddress')}>{t('common.retry')}</button>
            </p>
        );
    }
    return <p className="px-2">{t('camera.lookingUp')}</p>;
};

const Overlay = ({ location, addressStatus, dateTime, onHome, onRetryAddress, onOpenSettings }: { location: GeolocationData | null; addressStatus: AddressStatus; dateTime: string; onHome: () => void; onRetryAddress: () => void; onOpenSettings: () => void }) => {
  const { t } = useT();
  return (
    <div data-testid="stamp-overlay" className="absolute top-0 left-0 right-0 px-3 py-2 text-white text-center text-sm font-semibold bg-black/70 short:right-24 short:py-1 short:pl-12 short:text-xs short:leading-tight" style={{ fontFamily: FONT_FAMILY_OVERLAY, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
        {/* Brand badge: lives inside the existing band so it costs no vertical space. Tap to go home. */}
        <button onClick={onHome} className="absolute left-2 top-2 flex flex-col items-center gap-0.5 rounded-xl bg-white/10 p-1 hover:bg-white/20 min-[390px]:flex-row min-[390px]:gap-1.5 min-[390px]:rounded-full min-[390px]:pe-2.5" aria-label={t('camera.home')}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6 rounded-[22%]" />
            <span className="text-[9px] font-semibold leading-none tracking-tight min-[390px]:text-xs">SpotCam</span>
        </button>
        <button onClick={onOpenSettings} className="absolute right-2 top-2 rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label={t('camera.settings')}>
            <SettingsIcon className="h-5 w-5" />
        </button>
        <p>{dateTime}</p>
        {location ? (
            <>
                <p>Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}</p>
                <AddressLine location={location} status={addressStatus} onRetry={onRetryAddress} />
            </>
        ) : (
            <p>{t('camera.locating')}</p>
        )}
    </div>
  );
};

/**
 * The main component for the camera interface.
 */
/** Opens the camera, asking for less each time a request fails (see videoRequests); gives the last error if none works. */
async function openCamera(facing: 'environment' | 'user', deviceId?: string): Promise<MediaStream> {
  let lastError: unknown;
  for (const video of videoRequests(facing, deviceId)) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      lastError = err;
      if (!worthAskingAgain(err)) break;
    }
  }
  throw lastError;
}

/** The widest rear lens the phone names (see pickWideLens), or null when the names are not known yet. */
async function widestBackLensId(): Promise<string | null> {
  try {
    return pickWideLens(await navigator.mediaDevices.enumerateDevices());
  } catch {
    return null;
  }
}

/**
 * Opens the camera for this facing. The rear camera is opened on its widest lens when the phone names one
 * (ultra-wide, else wide-angle): the browser's default rear camera is usually the main lens. Names are hidden
 * until the camera is allowed, so on a first visit the camera is opened first and the lens is looked for after.
 */
async function openPreferredCamera(facing: 'environment' | 'user'): Promise<MediaStream> {
  if (facing === 'user') return openCamera(facing);
  const named = await widestBackLensId();
  if (named) return openCamera(facing, named);
  const stream = await openCamera(facing);
  const later = await widestBackLensId();
  if (later && later !== stream.getVideoTracks()[0]?.getSettings().deviceId) {
    try {
      const wider = await openCamera(facing, later);
      stream.getTracks().forEach(track => track.stop());
      return wider;
    } catch {
      // The camera that already opens is kept.
    }
  }
  return stream;
}

export const CameraView: React.FC<CameraViewProps> = ({ onCapture, onVideo, onSwitchView, lastPhotoUrl, onHome, onOpenSettings }) => {
  const { t } = useT();
  // Refs for video and canvas elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for camera stream and errors
  const [stream, setStream] = useState<MediaStream | null>(null);
  /** True once the live picture has a size; before that a capture would be a blank image. */
  const [videoReady, setVideoReady] = useState(false);
  // The camera's video track, held directly so zoom changes always reach the same track that was opened.
  const videoTrack = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Why the camera failed: lets us show a specific, actionable message.
  const [cameraIssue, setCameraIssue] = useState<'denied' | 'insecure' | 'unsupported' | 'notfound' | 'other' | null>(null);

  // Custom hook for geolocation data
  const { location, addressStatus, error: geoError, permissionDenied: geoDenied, retry: retryGeo, retryAddress } = useGeolocation();

  // Permissions API state (where supported); real API errors above are the fallback signal.
  const cameraPerm = usePermissionState('camera');
  const geoPerm = usePermissionState('geolocation');
  const cameraBlocked = cameraIssue === 'denied' || cameraPerm === 'denied';
  const locationBlocked = geoDenied || geoPerm === 'denied';
  
  // State for UI elements and effects
  const [dateTime, setDateTime] = useState(new Date().toLocaleString());
  const [isFlashing, setIsFlashing] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0); // Used to re-trigger camera initialization
  
  // State for camera controls (facing mode, zoom)
  const [currentFacingMode, setCurrentFacingMode] = useState<'environment' | 'user'>('environment');
  const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Video: offered when it is turned on in Settings and the browser can record the camera with the stamp drawn on every frame.
  const [videoEnabled] = useState(() => getVideoEnabled() && canRecordVideo());
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordNote, setRecordNote] = useState('');
  const recordingRef = useRef<Recording | null>(null);
  const starting = useRef(false);
  const recordedAt = useRef(0);
  // Recording callbacks outlive a render: they read the latest place and the latest onVideo from here.
  const latestRef = useRef({ location, onVideo });
  latestRef.current = { location, onVideo };

  // Spoken status for screen readers (an aria-live region): location found, address found, photo saved.
  const [announcement, setAnnouncement] = useState('');
  const hasLocation = location !== null;
  const address = location?.address;
  useEffect(() => { if (hasLocation) setAnnouncement(translate('camera.said.location')); }, [hasLocation]);
  useEffect(() => { if (address) setAnnouncement(translate('camera.said.address')); }, [address]);

  // Effect to update the date and time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Effect to initialize and manage the camera stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let cancelled = false;

    const initializeCamera = async () => {
        try {
            // getUserMedia only exists in secure contexts (HTTPS or localhost), and in browsers that support it.
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraIssue(window.isSecureContext ? 'unsupported' : 'insecure');
                setError('Camera is unavailable.');
                return;
            }
            // Request camera access from the user
            // Ask for exactly the chosen camera first. Without "exact" a phone may open the front camera because it
            // fits the requested size better. A device with no camera facing that way (a laptop) is asked again.
            // If the camera will not open with the size wishes (or at all with "exact"), the next simpler request is tried.
            // A refused permission is never asked again.
            const newStream = await openPreferredCamera(currentFacingMode);
            // The page moved on (camera switched, retry pressed, left the page) while the camera was opening:
            // let this one go, or it would keep the camera busy and could replace the one now wanted.
            if (cancelled) {
                newStream.getTracks().forEach(track => track.stop());
                return;
            }
            activeStream = newStream;
            setStream(newStream);
            if (videoRef.current) {
                setVideoReady(false); // the new picture is not there until the video reports its size
                videoRef.current.srcObject = newStream;
            }
            setError(null);
            setCameraIssue(null);

            // Check for zoom capabilities on the video track
            const track = newStream.getVideoTracks()[0];
            videoTrack.current = track ?? null;
            if (track) {
                const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & Record<string, unknown>; // not available in every browser
                // Let the camera keep adjusting focus, exposure and white balance by itself, as a camera app does.
                const automatic = continuousModes(capabilities);
                if (automatic.length > 0) track.applyConstraints({ advanced: automatic as MediaTrackConstraintSet[] }).catch(() => undefined);
                // 'zoom' is a non-standard capability, so check for its existence
                if ('zoom' in capabilities && capabilities.zoom) {
                    const zoomCapability = capabilities.zoom as { min: number; max: number; step: number; };
                    setZoomCapabilities({
                        min: zoomCapability.min,
                        max: zoomCapability.max,
                        step: zoomCapability.step,
                    });
                    // Always open at 1x (or the closest the camera allows), whatever zoom it started at.
                    const start = openingZoom(zoomCapability);
                    setCurrentZoom(start);
                    track.applyConstraints({ advanced: [{ zoom: start } as any] }).catch(() => undefined);
                } else {
                    setZoomCapabilities(null);
                }
            } else {
                setZoomCapabilities(null);
            }

            // Check if multiple cameras are available
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (cancelled) return;
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setHasMultipleCameras(videoDevices.length > 1);

        } catch (err) {
            if (cancelled) return;
            console.error(err);
            const name = (err as DOMException)?.name;
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                setCameraIssue('denied');
            } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                setCameraIssue('notfound');
            } else {
                setCameraIssue('other');
            }
            setError('Could not access camera.');
            setHasMultipleCameras(false);
            setZoomCapabilities(null);
        }
    };

    initializeCamera();

    // Cleanup function: stop the stream when the component unmounts or dependencies change
    return () => {
        cancelled = true;
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
        }
    };
  }, [currentFacingMode, retryTrigger]); // Re-initialize if facing mode or retry trigger changes

  // After the phone suspended the camera in the background, open it again instead of leaving a frozen picture.
  const restartCamera = useCallback(() => setRetryTrigger(c => c + 1), []);
  useCameraRecovery(stream, videoRef, restartCamera);

  /**
   * Handles the photo capture process.
   */
  // The preview element only exists while the camera works, so attach the stream whenever both are there
  // (for example after the camera comes back once the person allows it).
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream && video.srcObject !== stream) video.srcObject = stream;
  });

  /** The words stamped on a picture right now. */
  const stampText = (when: string): StampText => {
    const where = latestRef.current.location;
    return {
      dateTime: when,
      coordinates: where ? `Lat: ${where.latitude.toFixed(5)}, Lon: ${where.longitude.toFixed(5)}` : 'Location not available', // the stamp itself stays in English
      address: where?.address || '',
    };
  };

  /** Starts a video, with the microphone when Settings says so (and without it, saying why, when it is refused). */
  const startVideo = async () => {
    const video = videoRef.current;
    if (!canCapture || !video || recordingRef.current || starting.current) return;
    starting.current = true;
    setRecordNote('');
    let audioTracks: MediaStreamTrack[] = [];
    if (getRecordSound()) {
      try {
        audioTracks = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks();
      } catch {
        setRecordNote(translate('camera.note.noSound'));
      }
    }
    starting.current = false;
    if (!video.videoWidth) {
      audioTracks.forEach(track => track.stop());
      return;
    }
    const startedAt = Date.now();
    const where = latestRef.current.location;
    let recorder: Recording;
    try {
      recorder = startRecording({ video, audioTracks, stamp: () => stampText(new Date().toLocaleString()), maxMs: getVideoMaxMinutes() * 60_000 });
    } catch (err) {
      console.error(err);
      audioTracks.forEach(track => track.stop());
      setRecordNote(translate('camera.note.cannotRecord'));
      return;
    }
    recordingRef.current = recorder;
    recordedAt.current = startedAt;
    setElapsedMs(0);
    setRecording(true);
    setAnnouncement(translate('camera.said.recording'));
    recorder.done
      .then(result => {
        latestRef.current.onVideo({ id: `video_${startedAt}`, blob: result.blob, mimeType: result.mimeType, durationMs: result.durationMs, thumbUrl: result.thumbUrl, timestamp: startedAt, location: where });
        setAnnouncement(translate('camera.said.videoSaved'));
      })
      .catch(err => {
        console.error(err);
        setRecordNote(translate('camera.note.cannotSave'));
      })
      .finally(() => {
        recordingRef.current = null;
        setRecording(false);
      });
  };

  const stopVideo = () => recordingRef.current?.stop();

  // The running time; and a recording still running when the person leaves the page is ended and saved.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - recordedAt.current), 250);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => () => recordingRef.current?.stop(), []);

  const handleCapture = () => {
    if (!canCapture) return;
    if (videoRef.current && canvasRef.current) {
        // Trigger a flash effect for user feedback
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 150);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        // No picture yet: a photo now would be blank.
        if (!video.videoWidth || !video.videoHeight) return;
        
        // Set canvas dimensions to match the video stream
        const { videoWidth, videoHeight } = video;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        
        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, videoWidth, videoHeight);
        
        // Draw the stamp over the photo (a real address is the only address ever stamped; without one it carries the coordinates alone).
        drawStamp(context, videoWidth, stampText(dateTime));

        // Generate the final image as a data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const newPhoto: CapturedPhoto = {
            id: `photo_${Date.now()}`,
            dataUrl,
            thumbUrl: makeThumbnail(canvas, canvas.width, canvas.height),
            timestamp: Date.now(),
            location,
        };
        // Pass the captured photo data to the parent component
        onCapture(newPhoto);
        // The trailing dot alternates so a second photo is announced again (identical text is not re-read).
        setAnnouncement(prev => (prev === translate('camera.said.photoSaved') ? `${translate('camera.said.photoSaved')}.` : translate('camera.said.photoSaved')));
    }
  };

  /** Re-requests both permissions (works if the user just enabled them in browser settings). */
  const handleRetryPermissions = () => {
    setCameraIssue(null);
    setRetryTrigger(c => c + 1);
    retryGeo();
  };

  // Auto-retry when the browser reports a permission was switched to 'granted'.
  useEffect(() => {
    if (cameraPerm === 'granted' && error) setRetryTrigger(c => c + 1);
  }, [cameraPerm]);
  useEffect(() => {
    if (geoPerm === 'granted' && geoError) retryGeo();
  }, [geoPerm]);

  const canCapture = !error && !cameraBlocked && !locationBlocked && videoReady;

  /** Toggles between 'user' and 'environment' (front/back) cameras. */
  const handleSwitchCamera = () => {
    setZoomCapabilities(null); // Reset zoom when switching cameras
    setCurrentZoom(1);
    setCurrentFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  /** Handles changes from the zoom slider input. */
  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => applyZoom(parseFloat(e.target.value));

  /** Zoom in or out by one slider step (for people who cannot drag the slider precisely). */
  const nudgeZoom = (direction: 1 | -1) => {
    if (!zoomCapabilities) return;
    const step = zoomCapabilities.step || 0.1;
    applyZoom(Math.min(zoomCapabilities.max, Math.max(zoomCapabilities.min, currentZoom + direction * step)));
  };

  const applyZoom = (zoomValue: number) => {
    setCurrentZoom(zoomValue);
    const track = videoTrack.current;
    if (track && zoomCapabilities) {
        // Apply zoom constraints to the video track
        track.applyConstraints({ advanced: [{ zoom: zoomValue } as any] }).catch(err => console.error('Zoom not applied:', err));
    }
  };

  // Two fingers on the picture change the camera's own zoom, the same as the slider (only where the camera can zoom).
  const pinch = usePinchZoom(zoomCapabilities, currentZoom, applyZoom);


  return (
    <main className="relative w-full h-full flex flex-col items-center justify-center bg-black">
      <h1 className="sr-only">{t('camera.heading')}</h1>
      {/* Spoken updates for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {/* Flash effect overlay (much dimmer when the user asks for reduced motion, for photosensitive users) */}
      {isFlashing && <div className="absolute inset-0 bg-white opacity-80 motion-reduce:opacity-20 z-20" aria-hidden="true"></div>}
      {/* Hidden canvas used for capturing and processing images */}
      <canvas ref={canvasRef} className="hidden" />
      
      {error ? (
        <PermissionNotice
          title={
            cameraIssue === 'insecure' ? t('camera.issue.insecure.title')
            : cameraIssue === 'unsupported' ? t('camera.issue.unsupported.title')
            : cameraIssue === 'notfound' ? t('camera.issue.notfound.title')
            : cameraIssue === 'denied' ? t('camera.issue.denied.title')
            : t('camera.issue.other.title')
          }
          message={
            cameraIssue === 'insecure' ? t('camera.issue.insecure.text')
            : cameraIssue === 'unsupported' ? t('camera.issue.unsupported.text')
            : cameraIssue === 'notfound' ? t('camera.issue.notfound.text')
            : cameraIssue === 'denied'
              ? (cameraPerm === 'denied'
                  ? t('camera.issue.denied.textBlocked')
                  : t('camera.issue.denied.textAsk'))
            : t('camera.issue.other.text')
          }
          what={cameraIssue === 'denied' ? 'Camera' : undefined}
          hardBlocked={cameraIssue === 'denied' && cameraPerm === 'denied'}
          onRetry={handleRetryPermissions}
        />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={e => setVideoReady(e.currentTarget.videoWidth > 0)} onResize={e => setVideoReady(e.currentTarget.videoWidth > 0)} aria-label={t('camera.live')} className="w-full h-full object-cover touch-none" onPointerDown={pinch.onPointerDown} onPointerMove={pinch.onPointerMove} onPointerUp={pinch.onPointerUp} onPointerCancel={pinch.onPointerCancel}></video>
      )}

      {/* Live data overlay */}
      <Overlay location={location} addressStatus={addressStatus} dateTime={dateTime} onHome={onHome} onRetryAddress={retryAddress} onOpenSettings={onOpenSettings} />
      
      {/* Location permission is required: the stamp is the whole point of the app */}
      {locationBlocked && !error && (
        <div className="absolute inset-x-0 top-0 bottom-28 z-30 bg-black bg-opacity-85 flex items-center justify-center overflow-y-auto short:bottom-0 short:right-24">
          <PermissionNotice
            title={t('camera.location.title')}
            message={
              geoPerm === 'denied'
                ? t('camera.location.textBlocked')
                : t('camera.location.textAsk')
            }
            what="Location"
            hardBlocked={geoPerm === 'denied'}
            onRetry={handleRetryPermissions}
          />
        </div>
      )}

      {/* Geolocation error message (non-permission problems, e.g. timeout) */}
      {geoError && !locationBlocked && <p role="alert" className="absolute bottom-24 text-red-400 text-xs bg-black bg-opacity-60 p-1 rounded short:bottom-2 short:left-2">{geoError}</p>}
      
      {/* Zoom control slider */}
      {zoomCapabilities && (
        <div className={`absolute left-0 right-0 px-6 z-10 short:right-24 short:px-3 ${videoEnabled ? 'bottom-44 short:bottom-14' : 'bottom-32 short:bottom-2'}`}>
            <div className="bg-black/60 rounded-full p-1 flex items-center space-x-2">
                <button type="button" onClick={() => nudgeZoom(-1)} disabled={currentZoom <= zoomCapabilities.min} className="h-11 w-11 shrink-0 rounded-full text-xl font-bold text-white hover:bg-white/20 disabled:opacity-40" aria-label={t('camera.zoomOut')}>-</button>
                <label htmlFor="zoom-slider" className="text-white text-xs font-mono">{t('camera.zoom')}</label>
                <input 
                    id="zoom-slider"
                    type="range" 
                    min={zoomCapabilities.min}
                    max={zoomCapabilities.max}
                    step={zoomCapabilities.step}
                    value={currentZoom}
                    onChange={handleZoomChange}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer range-sm"
                    aria-valuetext={`${currentZoom.toFixed(1)}x`}
                />
                <span className="w-10 shrink-0 text-center text-xs font-mono text-white" aria-hidden="true">{currentZoom.toFixed(1)}x</span>
                <button type="button" onClick={() => nudgeZoom(1)} disabled={currentZoom >= zoomCapabilities.max} className="h-11 w-11 shrink-0 rounded-full text-xl font-bold text-white hover:bg-white/20 disabled:opacity-40" aria-label={t('camera.zoomIn')}>+</button>
            </div>
        </div>
      )}
      
      {/* What the shutter does (Photo or Video), or while recording the running time */}
      {videoEnabled && (
        <div className="absolute bottom-[7.25rem] left-0 right-0 z-10 flex justify-center short:bottom-2 short:left-2 short:right-24 short:justify-start">
          {recording ? (
            <p role="timer" data-testid="recording-timer" className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-white">
              <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none"></span>
              <span className="sr-only">{t('camera.recordingSr')}</span>
              {formatDuration(elapsedMs)} / {formatDuration(getVideoMaxMinutes() * 60_000)}
            </p>
          ) : (
            <div role="group" aria-label={t('camera.mode')} className="flex rounded-full bg-black/60 p-0.5 text-sm font-semibold text-white">
              {([['photo', t('common.photo')], ['video', t('common.video')]] as const).map(([m, label]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`min-h-9 rounded-full px-4 ${mode === m ? 'bg-white text-gray-900' : 'hover:bg-white/20'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {recordNote && <p role="status" className="absolute bottom-[10.25rem] z-10 mx-4 rounded bg-black/70 p-1 text-center text-xs text-amber-300 short:bottom-auto short:right-28 short:top-24">{recordNote}</p>}

      {/* Bottom control bar */}
      <div data-testid="control-bar" className="absolute bottom-0 left-0 right-0 h-28 bg-gray-950/85 border-t border-white/10 flex items-center justify-around short:top-0 short:left-auto short:h-auto short:w-24 short:flex-col short:border-t-0 short:border-l">
        {lastPhotoUrl ? (
          <button onClick={onSwitchView} className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white bg-gray-700 transition hover:opacity-90" aria-label={t('camera.openGallery')} data-testid="last-photo">
            <img src={lastPhotoUrl} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <button onClick={onSwitchView} className="text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors" aria-label={t('camera.openGallery')}>
            <GalleryIcon className="w-8 h-8" />
          </button>
        )}
        {mode === 'video' ? (
          <button onClick={recording ? stopVideo : startVideo} disabled={!canCapture && !recording} className="disabled:opacity-40 disabled:cursor-not-allowed w-20 h-20 rounded-full border-4 border-white bg-transparent flex items-center justify-center group" aria-label={recording ? t('camera.stop') : t('camera.record')}>
              <div className={`bg-red-600 transition-all group-active:scale-95 ${recording ? 'h-8 w-8 rounded-md' : 'h-16 w-16 rounded-full'}`}></div>
          </button>
        ) : (
          <button onClick={handleCapture} disabled={!canCapture} className="disabled:opacity-40 disabled:cursor-not-allowed w-20 h-20 rounded-full border-4 border-white bg-transparent flex items-center justify-center group" aria-label={t('camera.capture')}>
              <div className="w-16 h-16 rounded-full bg-white group-hover:bg-blue-200 group-active:scale-95 transition"></div>
          </button>
        )}
        <button onClick={handleSwitchCamera} disabled={!hasMultipleCameras || recording} className="text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label={t('camera.switch')}>
            <SwitchCameraIcon className="w-8 h-8" />
        </button>
      </div>
    </main>
  );
};
