/**
 * @file This component handles the camera functionality, including the live view,
 * data overlay, and photo capture.
 */
import React, { useRef, useEffect, useState } from 'react';
import { CapturedPhoto, GeolocationData } from '../types';
import { useGeolocation } from '../hooks/useGeolocation';
import { GalleryIcon, SwitchCameraIcon } from './icons';
import { FONT_FAMILY_MONO } from '../utils/constants';

/** Props for the CameraView component. */
interface CameraViewProps {
  /** Callback function to execute when a photo is captured. */
  onCapture: (photo: CapturedPhoto) => void;
  /** Callback function to switch to the gallery view. */
  onSwitchView: () => void;
}

/**
 * A component that displays real-time data (date, time, location) as an overlay on the camera view.
 */
const Overlay = ({ location, dateTime }: { location: GeolocationData | null; dateTime: string }) => (
    <div className="absolute top-0 left-0 right-0 p-2 text-white text-center text-xs font-mono bg-black bg-opacity-50 backdrop-blur-sm" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
        <p>{dateTime}</p>
        {location ? (
            <>
                <p>Lat: {location.latitude.toFixed(5)}, Lon: {location.longitude.toFixed(5)}</p>
                <p className="px-2 break-words">{location.address || 'Locating...'}</p>
            </>
        ) : (
            <p>Locating...</p>
        )}
    </div>
);

/**
 * The main component for the camera interface.
 */
export const CameraView: React.FC<CameraViewProps> = ({ onCapture, onSwitchView }) => {
  // Refs for video and canvas elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for camera stream and errors
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Custom hook for geolocation data
  const { location, error: geoError } = useGeolocation();
  
  // State for UI elements and effects
  const [dateTime, setDateTime] = useState(new Date().toLocaleString());
  const [isFlashing, setIsFlashing] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0); // Used to re-trigger camera initialization
  
  // State for camera controls (facing mode, zoom)
  const [currentFacingMode, setCurrentFacingMode] = useState<'environment' | 'user'>('environment');
  const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

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
            // Request camera access from the user
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode },
                audio: false,
            });
            activeStream = newStream;
            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            setError(null);

            // Check for zoom capabilities on the video track
            const track = newStream.getVideoTracks()[0];
            if (track) {
                const capabilities = track.getCapabilities();
                // 'zoom' is a non-standard capability, so check for its existence
                if ('zoom' in capabilities && capabilities.zoom) {
                    const zoomCapability = capabilities.zoom as { min: number; max: number; step: number; };
                    setZoomCapabilities({
                        min: zoomCapability.min,
                        max: zoomCapability.max,
                        step: zoomCapability.step,
                    });
                    setCurrentZoom(1);
                    track.applyConstraints({ advanced: [{ zoom: 1 } as any] });
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
            setError('Could not access camera. Please grant permission.');
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
        const overlayText3 = location?.address || '';
        
        // Style and draw the overlay text onto the canvas
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.shadowColor = 'black';
        context.shadowBlur = 7;

        const textYStart = 50;
        context.font = `bold ${Math.round(videoWidth / 40)}px ${FONT_FAMILY_MONO}`;
        context.fillText(overlayText1, canvas.width / 2, textYStart);
        context.fillText(overlayText2, canvas.width / 2, textYStart + (videoWidth / 35));
        
        // Handle multi-line text wrapping for the address
        if (overlayText3) {
            context.font = `${Math.round(videoWidth / 45)}px ${FONT_FAMILY_MONO}`;
            const maxLineWidth = canvas.width * 0.95;
            const words = overlayText3.split(' ');
            let line = '';
            let y = textYStart + (videoWidth / 35) * 2;
            const lineHeight = videoWidth / 40;
            
            for(let n = 0; n < words.length; n++) {
                let testLine = line + words[n] + ' ';
                let metrics = context.measureText(testLine);
                let testWidth = metrics.width;
                if (testWidth > maxLineWidth && n > 0) {
                    context.fillText(line, canvas.width / 2, y);
                    line = words[n] + ' ';
                    y += lineHeight;
                } else {
                    line = testLine;
                }
            }
            context.fillText(line, canvas.width / 2, y);
        }
        
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
    }
  };

  /** Toggles between 'user' and 'environment' (front/back) cameras. */
  const handleSwitchCamera = () => {
    setZoomCapabilities(null); // Reset zoom when switching cameras
    setCurrentFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  /** Handles changes from the zoom slider input. */
  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const zoomValue = parseFloat(e.target.value);
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
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
      {/* Flash effect overlay */}
      {isFlashing && <div className="absolute inset-0 bg-white opacity-80 z-20"></div>}
      {/* Hidden canvas used for capturing and processing images */}
      <canvas ref={canvasRef} className="hidden" />
      
      {error ? (
        <div className="text-center text-red-400 p-4">
          <p>{error}</p>
          <button onClick={() => setRetryTrigger(c => c + 1)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Retry Camera
          </button>
        </div>
      ) : (
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
      )}

      {/* Live data overlay */}
      <Overlay location={location} dateTime={dateTime} />
      
      {/* Geolocation error message */}
      {geoError && <p className="absolute bottom-24 text-red-500 text-xs bg-black bg-opacity-50 p-1 rounded">{geoError}</p>}
      
      {/* Zoom control slider */}
      {zoomCapabilities && (
        <div className="absolute bottom-32 left-0 right-0 px-6 z-10">
            <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-full p-2 flex items-center space-x-3">
                <span className="text-white text-xs font-mono pl-2">ZOOM</span>
                <input 
                    type="range" 
                    min={zoomCapabilities.min}
                    max={zoomCapabilities.max}
                    step={zoomCapabilities.step}
                    value={currentZoom}
                    onChange={handleZoomChange}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer range-sm"
                    aria-label="Zoom control"
                />
            </div>
        </div>
      )}
      
      {/* Bottom control bar */}
      <div className="absolute bottom-0 left-0 right-0 h-28 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-around">
        <button onClick={onSwitchView} className="text-white p-3 rounded-full hover:bg-gray-700 transition-colors" aria-label="Open gallery">
          <GalleryIcon className="w-8 h-8" />
        </button>
        <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white bg-transparent flex items-center justify-center group" aria-label="Capture photo">
            <div className="w-16 h-16 rounded-full bg-white group-hover:bg-gray-300 transition-colors"></div>
        </button>
        <button onClick={handleSwitchCamera} disabled={!hasMultipleCameras} className="text-white p-3 rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Switch camera">
            <SwitchCameraIcon className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
};
