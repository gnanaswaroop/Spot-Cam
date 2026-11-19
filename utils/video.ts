/**
 * @file Pure helpers for video: which format the browser records, file names, durations and sizes.
 * SpotCam keeps a video in whatever format the browser itself records (no conversion).
 */

/** Formats to try, best first. MP4 plays almost everywhere (including phone galleries); WebM is what Chrome and Firefox fall back to. */
export const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

/** The same without an audio codec, for a recording with no sound (some browsers wait for audio that never comes if one is named). */
export const SILENT_VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

/** The first format the browser can record, or undefined to let it choose its own default. */
export const pickVideoMime = (isSupported: (type: string) => boolean, withSound = true): string | undefined =>
  (withSound ? VIDEO_MIME_CANDIDATES : SILENT_VIDEO_MIME_CANDIDATES).find(type => {
    try {
      return isSupported(type);
    } catch {
      return false;
    }
  });

/** "video/mp4;codecs=avc1" becomes "video/mp4". */
export const baseMime = (mime: string): string => mime.split(';')[0].trim().toLowerCase();

/** The file extension for a recorded type: "mp4", "webm" (anything else keeps its subtype). */
export const videoExtension = (mime: string): string => {
  const subtype = baseMime(mime).split('/')[1] ?? 'webm';
  return subtype === 'quicktime' ? 'mov' : subtype.replace(/[^a-z0-9]/g, '') || 'webm';
};

/** "0:07", "1:05", "12:30": a length for people. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** "1 minute", "5 minutes". */
export const minutesLabel = (minutes: number): string => (minutes === 1 ? '1 minute' : `${minutes} minutes`);

/** The size to record at: the longest side is at most `max` pixels (a phone encodes 1280 smoothly; 1920x1440 often stutters). Sides stay even. */
export const recordingSize = (width: number, height: number, max = 1280): { width: number; height: number } => {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
};

/** Can this browser record the camera with the stamp drawn on every frame? (A canvas that can be captured, and MediaRecorder.) */
export const canRecordVideo = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder === 'function' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function';
