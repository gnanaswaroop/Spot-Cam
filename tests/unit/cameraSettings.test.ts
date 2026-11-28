import { describe, expect, it } from 'vitest';
import { VIDEO_QUALITY, backLensOf, continuousModes, openingZoom, pickWideLens, videoRequests, worthAskingAgain } from '../../utils/cameraSettings';

describe('VIDEO_QUALITY', () => {
  it('asks for a large 4:3 picture at 30 fps, as ideals so no camera is refused', () => {
    expect(VIDEO_QUALITY.width.ideal).toBeGreaterThanOrEqual(1920);
    expect(VIDEO_QUALITY.height.ideal).toBeGreaterThanOrEqual(1440);
    expect(VIDEO_QUALITY.width.ideal / VIDEO_QUALITY.height.ideal).toBeCloseTo(4 / 3, 2);
    expect(VIDEO_QUALITY.aspectRatio.ideal).toBeCloseTo(4 / 3, 5);
    expect(VIDEO_QUALITY.frameRate.ideal).toBe(30);
    // Never "exact" or "min": those make getUserMedia fail on a camera that cannot comply.
    expect(JSON.stringify(VIDEO_QUALITY)).not.toMatch(/exact|min/);
  });
});

describe('openingZoom', () => {
  it('is 1x when the camera allows it', () => {
    expect(openingZoom({ min: 1, max: 5 })).toBe(1);
    expect(openingZoom({ min: 0.5, max: 10 })).toBe(1);
  });

  it('is the lowest zoom when the camera cannot go down to 1x', () => {
    expect(openingZoom({ min: 1.5, max: 6 })).toBe(1.5);
  });

  it('is the highest zoom when the camera cannot reach 1x from below', () => {
    expect(openingZoom({ min: 0.3, max: 0.6 })).toBe(0.6);
  });
});

describe('continuousModes', () => {
  it('asks for automatic focus, exposure and white balance when the camera has them', () => {
    expect(
      continuousModes({
        focusMode: ['manual', 'continuous'],
        exposureMode: ['manual', 'continuous'],
        whiteBalanceMode: ['manual', 'continuous'],
      }),
    ).toEqual([{ focusMode: 'continuous' }, { exposureMode: 'continuous' }, { whiteBalanceMode: 'continuous' }]);
  });

  it('asks only for what is supported', () => {
    expect(continuousModes({ focusMode: ['continuous'], exposureMode: ['manual'] })).toEqual([{ focusMode: 'continuous' }]);
  });

  it('asks for nothing when the camera reports nothing (Firefox, Safari)', () => {
    expect(continuousModes({})).toEqual([]);
    expect(continuousModes({ focusMode: 'continuous' })).toEqual([]);
  });
});

describe('videoRequests', () => {
  it('starts with the chosen camera as exact plus the size wishes, then asks for less each time', () => {
    const [best, ...rest] = videoRequests('environment');
    expect(best.facingMode).toEqual({ exact: 'environment' });
    expect(best).toMatchObject({ width: { ideal: VIDEO_QUALITY.width.ideal } });
    expect(rest.map(r => r.facingMode)).toEqual([{ exact: 'environment' }, 'environment', 'environment']);
    expect(Object.keys(rest[0])).toEqual(['facingMode']); // exact camera, no size wishes
    expect(Object.keys(rest[2])).toEqual(['facingMode']); // the plain request, as before the size wishes
  });

  it('asks for the front camera the same way', () => {
    expect(videoRequests('user')[0].facingMode).toEqual({ exact: 'user' });
  });

  it('asks for a named camera first, then falls back to the facing requests', () => {
    const requests = videoRequests('environment', 'ultra-id');
    expect(requests[0].deviceId).toEqual({ exact: 'ultra-id' });
    expect(requests[0]).toMatchObject({ width: { ideal: VIDEO_QUALITY.width.ideal } });
    expect(requests[1]).toEqual({ deviceId: { exact: 'ultra-id' } });
    expect(requests.slice(2).map(r => r.facingMode)).toEqual([{ exact: 'environment' }, { exact: 'environment' }, 'environment', 'environment']);
  });
});

describe('backLensOf', () => {
  it('reads the lens from the camera name', () => {
    expect(backLensOf('Back Ultra Wide Camera')).toBe('ultra-wide');
    expect(backLensOf('camera2 2, facing back, ultrawide')).toBe('ultra-wide');
    expect(backLensOf('Back Wide Angle Camera')).toBe('wide');
    expect(backLensOf('Back Telephoto Camera')).toBe('telephoto');
    expect(backLensOf('Back Camera')).toBe('main');
    expect(backLensOf('camera2 0, facing back')).toBe('main');
  });
});

describe('pickWideLens', () => {
  const cam = (deviceId: string, label: string, kind = 'videoinput') => ({ deviceId, label, kind });

  it('picks the ultra-wide rear camera over the main one and the telephoto one', () => {
    expect(pickWideLens([cam('main', 'Back Camera'), cam('tele', 'Back Telephoto Camera'), cam('uw', 'Back Ultra Wide Camera')])).toBe('uw');
  });

  it('picks the wide-angle one when there is no ultra-wide', () => {
    expect(pickWideLens([cam('main', 'Back Camera'), cam('wide', 'Back Wide Angle Camera')])).toBe('wide');
  });

  it('never picks a front camera', () => {
    expect(pickWideLens([cam('front-uw', 'Front Ultra Wide Camera'), cam('main', 'Back Camera')])).toBeNull();
  });

  it('is null when the names say nothing (labels are hidden before the camera is allowed)', () => {
    expect(pickWideLens([cam('', ''), cam('', '')])).toBeNull();
    expect(pickWideLens([cam('main', 'Back Camera')])).toBeNull();
  });

  it('ignores microphones and other devices', () => {
    expect(pickWideLens([cam('mic', 'Ultra Wide Microphone', 'audioinput')])).toBeNull();
  });
});

describe('worthAskingAgain', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name });
  it('is true when the camera could not do the request, so a simpler one may work', () => {
    for (const name of ['OverconstrainedError', 'NotFoundError', 'NotReadableError', 'AbortError']) {
      expect(worthAskingAgain(named(name))).toBe(true);
    }
  });
  it('is false for a refused permission, which asking again cannot fix', () => {
    expect(worthAskingAgain(named('NotAllowedError'))).toBe(false);
    expect(worthAskingAgain(named('SecurityError'))).toBe(false);
  });
});
