/**
 * @file Records the camera to a video with the stamp drawn into every frame.
 *
 * The live picture is copied onto a canvas about 30 times a second, the stamp is drawn over it (with the time of that very
 * moment), and the canvas is recorded together with the microphone (when there is one) by the browser's own MediaRecorder.
 * The result stays in whatever format the browser records.
 */
import { drawStamp, type StampText } from './stamp';
import { makeThumbnail } from './thumbnail';
import { baseMime, pickVideoMime, recordingSize } from './video';

const FRAMES_PER_SECOND = 30;
const VIDEO_BITS_PER_SECOND = 3_000_000;

export interface RecordedVideo {
  blob: Blob;
  /** The recorded type without parameters, e.g. "video/mp4". */
  mimeType: string;
  durationMs: number;
  /** A small picture of the first frame, stamp included. */
  thumbUrl: string;
}

export interface Recording {
  /** Ends the recording (it also ends by itself at the length limit). */
  stop: () => void;
  /** Settles when the recording has ended and its data is complete. */
  done: Promise<RecordedVideo>;
}

interface Options {
  /** The live camera picture. */
  video: HTMLVideoElement;
  /** Microphone tracks to record along with the picture; empty records without sound. */
  audioTracks: MediaStreamTrack[];
  /** What the stamp says right now, asked for on every frame so the clock keeps running. */
  stamp: () => StampText;
  /** The recording ends by itself after this long. */
  maxMs: number;
}

/** Starts recording. Throws if the browser cannot (the caller checks `canRecordVideo` first). */
export function startRecording({ video, audioTracks, stamp, maxMs }: Options): Recording {
  const { width, height } = recordingSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to record with');

  const drawFrame = () => {
    context.drawImage(video, 0, 0, width, height);
    drawStamp(context, width, stamp());
  };
  drawFrame();
  const thumbUrl = makeThumbnail(canvas, width, height);
  const timer = window.setInterval(drawFrame, 1000 / FRAMES_PER_SECOND);

  const canvasStream = canvas.captureStream(FRAMES_PER_SECOND);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
  const mime = pickVideoMime(type => MediaRecorder.isTypeSupported(type));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
  } catch (error) {
    window.clearInterval(timer);
    throw error;
  }

  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let limit = 0;
  const release = () => {
    window.clearInterval(timer);
    window.clearTimeout(limit);
    stream.getTracks().forEach(track => track.stop()); // the canvas and the microphone (the camera itself is not touched)
  };

  const done = new Promise<RecordedVideo>((resolve, reject) => {
    recorder.ondataavailable = event => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      release();
      reject(new Error('The recording failed'));
    };
    recorder.onstop = () => {
      release();
      const type = baseMime(recorder.mimeType || mime || 'video/webm');
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) reject(new Error('The recording is empty'));
      else resolve({ blob, mimeType: type, durationMs: Date.now() - startedAt, thumbUrl });
    };
  });

  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.start(1000); // data arrives every second, so it is never held back for the very end
  limit = window.setTimeout(stop, maxMs);
  return { stop, done };
}
