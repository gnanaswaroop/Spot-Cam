/**
 * @file How SpotCam asks the camera for its picture. Pure functions, so they can be unit tested.
 *
 * Asking for only a facing mode gets the browser's default stream, which is often a small 640x480 picture:
 * it looks soft and noisy once it is stretched across a phone screen, and it is a different shape from
 * the 4:3 view a camera app shows. So we ask for a large 4:3 picture. The values are "ideal", not exact:
 * a camera that cannot do it gives the closest it has instead of failing.
 *
 * Not larger than 1920x1440: every frame of the live preview is decoded and drawn, and bigger frames add delay
 * between the real scene and the screen (the preview lags behind a camera app's, which uses a small viewfinder).
 */

export const VIDEO_QUALITY = {
  width: { ideal: 1920 },
  height: { ideal: 1440 },
  aspectRatio: { ideal: 4 / 3 },
  frameRate: { ideal: 30 },
} as const;

/**
 * The video requests to try, in order, for one camera. The first is the best: the chosen camera as a hard
 * requirement ("exact"), so the size wishes only rank cameras that face the right way (as a plain wish, a phone
 * can open the front camera because it fits the size better). Each later one asks for less, so a camera that
 * cannot do the first (a laptop with no rear camera, a phone that fails at a large picture) still opens.
 */
export function videoRequests(facing: 'environment' | 'user') {
  return [
    { facingMode: { exact: facing }, ...VIDEO_QUALITY },
    { facingMode: { exact: facing } },
    { facingMode: facing, ...VIDEO_QUALITY },
    { facingMode: facing },
  ];
}

/** A refused permission cannot be fixed by asking for less, and asking again would only nag. */
export const worthAskingAgain = (err: unknown): boolean =>
  !(err instanceof Error) || (err.name !== 'NotAllowedError' && err.name !== 'SecurityError');

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
