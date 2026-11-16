/**
 * @file How SpotCam asks the camera for its picture. Pure functions, so they can be unit tested.
 *
 * Asking for only a facing mode gets the browser's default stream, which is often a small 640x480 picture:
 * it looks soft and noisy once it is stretched across a phone screen, and it is a different shape from
 * the 4:3 view a camera app shows. So we ask for a large 4:3 picture. The values are "ideal", not exact:
 * a camera that cannot do it gives the closest it has instead of failing.
 */

export const VIDEO_QUALITY = {
  width: { ideal: 2560 },
  height: { ideal: 1920 },
  aspectRatio: { ideal: 4 / 3 },
  frameRate: { ideal: 30 },
} as const;

interface ZoomRange {
  min: number;
  max: number;
}

/** The zoom to open at: 1x, or the nearest value the camera allows when 1x is out of its range. */
export function openingZoom({ min, max }: ZoomRange): number {
  return Math.min(max, Math.max(min, 1));
}

type Capabilities = Record<string, unknown>;

const supports = (capabilities: Capabilities, name: string, mode: string): boolean => {
  const modes = capabilities[name];
  return Array.isArray(modes) && modes.includes(mode);
};

/**
 * Constraints that put focus, exposure and white balance on automatic ('continuous'), for the ones the
 * camera reports it can do. A camera app keeps adjusting all three; a bare web stream may not.
 */
export function continuousModes(capabilities: Capabilities): Record<string, string>[] {
  return ['focusMode', 'exposureMode', 'whiteBalanceMode']
    .filter(name => supports(capabilities, name, 'continuous'))
    .map(name => ({ [name]: 'continuous' }));
}
