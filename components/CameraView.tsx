/**
 * @file This component handles the camera functionality, including the live view,
 * data overlay, and photo capture.
 */
import React, { useRef, useEffect, useState } from 'react';
import { CapturedPhoto, GeolocationData } from '../types';
import { useGeolocation, AddressStatus } from '../hooks/useGeolocation';
import { usePermissionState } from '../hooks/usePermissionState';
import { PermissionNotice } from './PermissionNotice';
import { GalleryIcon, SettingsIcon, SwitchCameraIcon } from './icons';
import { FONT_FAMILY_OVERLAY } from '../utils/constants';
import { VIDEO_QUALITY, continuousModes, openingZoom } from '../utils/cameraSettings';

/** Props for the CameraView component. */
interface CameraViewProps {
  /** Callback function to execute when a photo is captured. */
  onCapture: (photo: CapturedPhoto) => void;
  /** Callback function to switch to the gallery view. */
  onSwitchView: () => void;
  /** Callback to return to the landing page. */
  onHome: () => void;
  /** Callback to open the settings view. */
  onOpenSettings: () => void;
}

/**
 * A component that displays real-time data (date, time, location) as an overlay on the camera view.
 */
const AddressLine = ({ location, status, onRetry }: { location: GeolocationData; status: AddressStatus; onRetry: () => void }) => {
    // aria-live: the address is read out when it arrives ("Looking up address..." turns into the street).
    if (location.address) return <p className="px-2 break-words" aria-live="polite">{location.address}</p>;
    if (status === 'offline') return <p className="px-2">Offline: the address will appear when you are back online</p>;
    if (status === 'failed') {
        return (
            <p className="px-2">
                Address unavailable.{' '}
                <button onClick={onRetry} className="inline-block min-h-6 px-1 underline underline-offset-2" aria-label="Retry address lookup">Retry</button>
            </p>
        );
    }
    return <p className="px-2">Looking up address...</p>;
};

const Overlay = ({ location, addressStatus, dateTime, onHome, onRetryAddress, onOpenSettings }: { location: GeolocationData | null; addressStatus: AddressStatus; dateTime: string; onHome: () => void; onRetryAddress: () => void; onOpenSettings: () => void }) => (
    <div data-testid="stamp-overlay" className="absolute top-0 left-0 right-0 px-3 py-2 text-white text-center text-sm font-semibold bg-black bg-opacity-55 backdrop-blur-sm short:right-24 short:py-1 short:pl-12 short:text-xs short:leading-tight" style={{ fontFamily: FONT_FAMILY_OVERLAY, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
        {/* Brand badge: lives inside the existing band so it costs no vertical space. Tap to go home. */}
        <button onClick={onHome} className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-white/10 p-1 pr-1 hover:bg-white/20 sm:pr-2.5" aria-label="SpotCam home">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6 rounded-[22%]" />
            <span className="hidden text-xs font-semibold tracking-tight sm:inline">SpotCam</span>
        </button>
        <button onClick={onOpenSettings} className="absolute right-2 top-2 rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Settings">
            <SettingsIcon className="h-5 w-5" />
        </button>
        <p>{dateTime}</p>
        {location ? (
            <>
                <p>Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}</p>
                <AddressLine location={location} status={addressStatus} onRetry={onRetryAddress} />
            </>
        ) : (
            <p>Locating...</p>
        )}
    </div>
);

/**
 * The main component for the camera interface.
 */
export const CameraView: React.FC<CameraViewProps> = ({ onCapture, onSwitchView, onHome, onOpenSettings }) => {
  // Refs for video and canvas elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for camera stream and errors
  const [stream, setStream] = useState<MediaStream | null>(null);
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

  // Spoken status for screen readers (an aria-live region): location found, address found, photo saved.
  const [announcement, setAnnouncement] = useState('');
  const hasLocation = location !== null;
  const address = location?.address;
  useEffect(() => { if (hasLocation) setAnnouncement('Location found'); }, [hasLocation]);
  useEffect(() => { if (address) setAnnouncement('Address found'); }, [address]);

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
    
    const initializeCamera = async () => {
        try {
            // getUserMedia only exists in secure contexts (HTTPS or localhost), and in browsers that support it.
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraIssue(window.isSecureContext ? 'unsupported' : 'insecure');
                setError('Camera is unavailable.');
                return;
            }
            // Request camera access from the user
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode, ...VIDEO_QUALITY },
                audio: false,
            });
            activeStream = newStream;
            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            setError(null);
            setCameraIssue(null);

            // Check for zoom capabilities on the video track
            const track = newStream.getVideoTracks()[0];
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
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setHasMultipleCameras(videoDevices.length > 1);

        } catch (err) {
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
        if (activeStream) {
            activeStream.getTracks().forEach(track => track.stop());
        }
    };
  }, [currentFacingMode, retryTrigger]); // Re-initialize if facing mode or retry trigger changes

  /**
   * Handles the photo capture process.
   */
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
        
        // Set canvas dimensions to match the video stream
        const { videoWidth, videoHeight } = video;
        canvas.width = videoWidth;
        canvas.height = videoHeight;
        
        // Draw the current video frame onto the canvas
        context.drawImage(video, 0, 0, videoWidth, videoHeight);
        
        // Prepare overlay text
        const overlayText1 = dateTime;
        const overlayText2 = location ? `Lat: ${location.latitude.toFixed(5)}, Lon: ${location.longitude.toFixed(5)}` : 'Location not available';
        // Only a real address is ever stamped. If none was found, the stamp carries the coordinates alone.
        const overlayText3 = location?.address || '';
        
        // Draw the stamp: bold sans text on a translucent dark band so it stays readable on any photo.
        const pad = Math.round(videoWidth / 50);
        const headSize = Math.round(videoWidth / 32);
        const addrSize = Math.round(videoWidth / 38);
        const headLine = Math.round(headSize * 1.35);
        const addrLine = Math.round(addrSize * 1.35);
        const maxLineWidth = canvas.width * 0.92;

        // Wrap the address into lines that fit the image width.
        context.font = `600 ${addrSize}px ${FONT_FAMILY_OVERLAY}`;
        const addrLines: string[] = [];
        let line = '';
        for (const word of overlayText3.split(' ').filter(Boolean)) {
            const test = line ? `${line} ${word}` : word;
            if (line && context.measureText(test).width > maxLineWidth) {
                addrLines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) addrLines.push(line);

        const bandHeight = pad * 2 + headLine * 2 + addrLines.length * addrLine;
        context.fillStyle = 'rgba(0, 0, 0, 0.55)';
        context.fillRect(0, 0, canvas.width, bandHeight);

        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        context.shadowColor = 'rgba(0, 0, 0, 0.9)';
        context.shadowBlur = 4;

        let y = pad + headSize;
        context.font = `700 ${headSize}px ${FONT_FAMILY_OVERLAY}`;
        context.fillText(overlayText1, canvas.width / 2, y);
        y += headLine;
        context.fillText(overlayText2, canvas.width / 2, y);
        y += addrLine;
        context.font = `600 ${addrSize}px ${FONT_FAMILY_OVERLAY}`;
        for (const l of addrLines) {
            context.fillText(l, canvas.width / 2, y);
            y += addrLine;
        }
        context.shadowBlur = 0;

        // Generate the final image as a data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const newPhoto: CapturedPhoto = {
            id: `photo_${Date.now()}`,
            dataUrl,
            timestamp: Date.now(),
            location,
        };
        // Pass the captured photo data to the parent component
        onCapture(newPhoto);
        // The trailing dot alternates so a second photo is announced again (identical text is not re-read).
        setAnnouncement(prev => (prev === 'Photo saved to the gallery' ? 'Photo saved to the gallery.' : 'Photo saved to the gallery'));
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

  const canCapture = !error && !cameraBlocked && !locationBlocked;

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
    if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track && zoomCapabilities) {
            // Apply zoom constraints to the video track
            track.applyConstraints({ advanced: [{ zoom: zoomValue } as any] }).catch(err => console.error('Zoom not applied:', err));
        }
    }
  };


  return (
    <main className="relative w-full h-full flex flex-col items-center justify-center bg-black">
      <h1 className="sr-only">SpotCam camera</h1>
      {/* Spoken updates for screen readers */}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {/* Flash effect overlay (much dimmer when the user asks for reduced motion, for photosensitive users) */}
      {isFlashing && <div className="absolute inset-0 bg-white opacity-80 motion-reduce:opacity-20 z-20" aria-hidden="true"></div>}
      {/* Hidden canvas used for capturing and processing images */}
      <canvas ref={canvasRef} className="hidden" />
      
      {error ? (
        <PermissionNotice
          title={
            cameraIssue === 'insecure' ? 'Secure connection required'
            : cameraIssue === 'unsupported' ? 'Camera not supported'
            : cameraIssue === 'notfound' ? 'No camera found'
            : cameraIssue === 'denied' ? 'Camera access is blocked'
            : 'Camera unavailable'
          }
          message={
            cameraIssue === 'insecure' ? 'Browsers only allow camera and location on HTTPS pages. Open this site using an https:// address.'
            : cameraIssue === 'unsupported' ? "This browser can't open the camera. Try the latest version of Chrome, Safari, Firefox or Edge."
            : cameraIssue === 'notfound' ? 'We could not find a usable camera on this device.'
            : cameraIssue === 'denied'
              ? (cameraPerm === 'denied'
                  ? "Your browser has blocked the camera for this site, so it won't ask again on its own. SpotCam can't work without it. Turn it back on and we'll pick up from there."
                  : 'SpotCam needs the camera to take photos. Tap "Allow access" and choose Allow when your browser asks.')
            : 'Something went wrong starting the camera. Make sure no other app is using it, then try again.'
          }
          what={cameraIssue === 'denied' ? 'Camera' : undefined}
          hardBlocked={cameraIssue === 'denied' && cameraPerm === 'denied'}
          onRetry={handleRetryPermissions}
        />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" className="w-full h-full object-cover"></video>
      )}

      {/* Live data overlay */}
      <Overlay location={location} addressStatus={addressStatus} dateTime={dateTime} onHome={onHome} onRetryAddress={retryAddress} onOpenSettings={onOpenSettings} />
      
      {/* Location permission is required: the stamp is the whole point of the app */}
      {locationBlocked && !error && (
        <div className="absolute inset-x-0 top-0 bottom-28 z-30 bg-black bg-opacity-85 flex items-center justify-center overflow-y-auto short:bottom-0 short:right-24">
          <PermissionNotice
            title="Location access is blocked"
            message={
              geoPerm === 'denied'
                ? "Your browser has blocked location for this site, so it won't ask again on its own. SpotCam cannot stamp your photos without it, so capture is disabled."
                : 'SpotCam stamps your location onto every photo, so capture is disabled until you allow it. Tap "Allow access" and choose Allow when your browser asks.'
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
        <div className="absolute bottom-32 left-0 right-0 px-6 z-10 short:bottom-2 short:right-24 short:px-3">
            <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-full p-1 flex items-center space-x-2">
                <button type="button" onClick={() => nudgeZoom(-1)} disabled={currentZoom <= zoomCapabilities.min} className="h-11 w-11 shrink-0 rounded-full text-xl font-bold text-white hover:bg-white/20 disabled:opacity-40" aria-label="Zoom out">-</button>
                <label htmlFor="zoom-slider" className="text-white text-xs font-mono">ZOOM</label>
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
                <button type="button" onClick={() => nudgeZoom(1)} disabled={currentZoom >= zoomCapabilities.max} className="h-11 w-11 shrink-0 rounded-full text-xl font-bold text-white hover:bg-white/20 disabled:opacity-40" aria-label="Zoom in">+</button>
            </div>
        </div>
      )}
      
      {/* Bottom control bar */}
      <div data-testid="control-bar" className="absolute bottom-0 left-0 right-0 h-28 bg-gray-950/70 border-t border-white/10 backdrop-blur-md flex items-center justify-around short:top-0 short:left-auto short:h-auto short:w-24 short:flex-col short:border-t-0 short:border-l">
        <button onClick={onSwitchView} className="text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors" aria-label="Open gallery">
          <GalleryIcon className="w-8 h-8" />
        </button>
        <button onClick={handleCapture} disabled={!canCapture} className="disabled:opacity-40 disabled:cursor-not-allowed w-20 h-20 rounded-full border-4 border-white bg-transparent flex items-center justify-center group" aria-label="Capture photo">
            <div className="w-16 h-16 rounded-full bg-white group-hover:bg-blue-200 group-active:scale-95 transition"></div>
        </button>
        <button onClick={handleSwitchCamera} disabled={!hasMultipleCameras} className="text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Switch camera">
            <SwitchCameraIcon className="w-8 h-8" />
        </button>
      </div>
    </main>
  );
};
