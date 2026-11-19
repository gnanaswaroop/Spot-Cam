import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseMime, formatDuration, minutesLabel, pickVideoMime, recordingSize, videoExtension } from '../../utils/video';
import { wrapWords } from '../../utils/stamp';
import {
  DEFAULT_VIDEO_MAX_MINUTES,
  getRecordSound,
  getVideoEnabled,
  getVideoMaxMinutes,
  setRecordSound,
  setVideoEnabled,
  setVideoMaxMinutes,
} from '../../utils/settings';
import { metaForVideo } from '../../utils/photoStore';

describe('pickVideoMime', () => {
  it('takes MP4 when the browser can record it (Safari, recent Chrome)', () => {
    expect(pickVideoMime(() => true)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
    expect(pickVideoMime(t => t.startsWith('video/mp4') && !t.includes('codecs'))).toBe('video/mp4');
  });

  it('falls back to WebM (Firefox, older Chrome)', () => {
    expect(pickVideoMime(t => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickVideoMime(t => t === 'video/webm')).toBe('video/webm');
  });

  it('gives nothing when no type is supported, so the browser picks its own', () => {
    expect(pickVideoMime(() => false)).toBeUndefined();
  });

  it('treats a browser that throws as "not supported"', () => {
    expect(pickVideoMime(() => { throw new Error('nope'); })).toBeUndefined();
  });
});

describe('video file helpers', () => {
  it('strips parameters from a type', () => {
    expect(baseMime('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(baseMime('VIDEO/MP4')).toBe('video/mp4');
  });

  it('names the file by the recorded format', () => {
    expect(videoExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(videoExtension('video/webm')).toBe('webm');
    expect(videoExtension('video/quicktime')).toBe('mov');
    expect(videoExtension('')).toBe('webm');
  });

  it('formats a length', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7_400)).toBe('0:07');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(5 * 60_000)).toBe('5:00');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('words minutes', () => {
    expect(minutesLabel(1)).toBe('1 minute');
    expect(minutesLabel(5)).toBe('5 minutes');
  });
});

describe('recordingSize', () => {
  it('keeps small pictures as they are', () => {
    expect(recordingSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('scales a large picture down to 1280 on the long side, keeping its shape and even sides', () => {
    expect(recordingSize(1920, 1440)).toEqual({ width: 1280, height: 960 });
    expect(recordingSize(1440, 1920)).toEqual({ width: 960, height: 1280 });
    const odd = recordingSize(1921, 1081);
    expect(odd.width % 2).toBe(0);
    expect(odd.height % 2).toBe(0);
    expect(Math.max(odd.width, odd.height)).toBeLessThanOrEqual(1280);
  });
});

describe('wrapWords', () => {
  const measure = (t: string) => t.length * 10;
  it('wraps between words only', () => {
    expect(wrapWords('aaa bbb ccc ddd', 70, measure)).toEqual(['aaa bbb', 'ccc ddd']);
  });
  it('keeps a word longer than the line whole', () => {
    expect(wrapWords('abcdefghijkl x', 50, measure)).toEqual(['abcdefghijkl', 'x']);
  });
  it('gives no lines for no text', () => {
    expect(wrapWords('', 100, measure)).toEqual([]);
  });
});

describe('video settings', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
  });

  it('are all on, with a 5 minute limit, by default', () => {
    expect(getVideoEnabled()).toBe(true);
    expect(getRecordSound()).toBe(true);
    expect(getVideoMaxMinutes()).toBe(5);
    expect(DEFAULT_VIDEO_MAX_MINUTES).toBe(5);
  });

  it('remember being turned off, and on again', () => {
    setVideoEnabled(false);
    setRecordSound(false);
    expect(getVideoEnabled()).toBe(false);
    expect(getRecordSound()).toBe(false);
    setVideoEnabled(true);
    setRecordSound(true);
    expect(getVideoEnabled()).toBe(true);
    expect(getRecordSound()).toBe(true);
  });

  it('remember the length, and ignore lengths that are not offered', () => {
    setVideoMaxMinutes(10);
    expect(getVideoMaxMinutes()).toBe(10);
    setVideoMaxMinutes(7);
    expect(getVideoMaxMinutes()).toBe(10);
    setVideoMaxMinutes(5);
    expect(getVideoMaxMinutes()).toBe(5);
  });
});

describe('metaForVideo', () => {
  it('records the size of the recording and what kind of item it is', () => {
    const meta = metaForVideo({
      id: 'video_1',
      blob: new Blob([new Uint8Array(2048)], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      durationMs: 4_000,
      thumbUrl: 'data:image/jpeg;base64,AAAA',
      timestamp: 123,
      location: null,
    });
    expect(meta).toMatchObject({ id: 'video_1', kind: 'video', bytes: 2048, mimeType: 'video/mp4', durationMs: 4_000, timestamp: 123 });
  });
});
