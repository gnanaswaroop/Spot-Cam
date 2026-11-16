import { describe, expect, it } from 'vitest';
import { VIDEO_QUALITY, continuousModes, openingZoom } from '../../utils/cameraSettings';

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
