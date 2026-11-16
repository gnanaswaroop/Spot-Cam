/**
 * @file Brings the camera preview back after the phone suspended it.
 *
 * When the app sits in the background, the phone may pause the camera or end its track. Coming back, the preview
 * shows the last frame and stays stuck: the camera is only opened when the screen loads or the camera is switched.
 * This watches for the app coming back (and for the track ending) and, if the camera is no longer delivering
 * frames, asks for it to be opened again. A camera that is fine is left alone.
 */
import { RefObject, useEffect } from 'react';

/** How long after coming back to wait before judging that frames have stopped. */
export const RESUME_CHECK_MS = 1200;

/**
 * @param stream The current camera stream (null while none is open).
 * @param videoRef The preview element showing it.
 * @param restart Called to open the camera again.
 */
export function useCameraRecovery(stream: MediaStream | null, videoRef: RefObject<HTMLVideoElement | null>, restart: () => void) {
  useEffect(() => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    let requested = false; // one restart per stream is enough
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reopen = () => {
      if (requested) return;
      requested = true;
      restart();
    };

    const check = () => {
      if (document.hidden || requested) return;
      if (!track || track.readyState === 'ended') return reopen();
      const video = videoRef.current;
      if (video?.paused) video.play().catch(() => undefined);
      // Still "live" but is the picture moving? Compare the playback time a moment apart.
      const before = video?.currentTime ?? 0;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.hidden || requested) return;
        if (track.readyState === 'ended') return reopen();
        if (video && video.currentTime === before) reopen();
      }, RESUME_CHECK_MS);
    };

    // The track ended while we were away: reopen when we are back (at once if we are already looking at it).
    const onEnded = () => check();

    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check); // restored from the back/forward cache
    track?.addEventListener('ended', onEnded);
    track?.addEventListener('unmute', check);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      track?.removeEventListener('ended', onEnded);
      track?.removeEventListener('unmute', check);
    };
  }, [stream, videoRef, restart]);
}
