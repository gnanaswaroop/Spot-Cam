/**
 * @file The arithmetic for zooming and panning a photo or video in the viewer. Pure functions, so they can be unit tested.
 *
 * A view is a scale plus a shift, applied as `translate(x, y) scale(scale)` around the centre of the picture box.
 * Coordinates are measured from that centre, in CSS pixels.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
/** How much one tap of the zoom buttons changes the scale. */
export const ZOOM_STEP = 1.25;

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const FIT: View = { scale: 1, x: 0, y: 0 };

export const clampScale = (scale: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

/**
 * Keeps the zoomed picture covering the box as far as it can be panned: at most the part that sticks out past each edge.
 * At 1x there is nothing to pan, so the view is FIT.
 */
export function clampPan(view: View, width: number, height: number): View {
  if (view.scale <= MIN_ZOOM) return FIT;
  const maxX = ((view.scale - 1) * width) / 2;
  const maxY = ((view.scale - 1) * height) / 2;
  return {
    scale: view.scale,
    x: Math.min(maxX, Math.max(-maxX, view.x)),
    y: Math.min(maxY, Math.max(-maxY, view.y)),
  };
}

/**
 * Changes the scale to `scale`, keeping the point (fx, fy) under the same spot of the picture. That is how a pinch or
 * a scroll wheel zooms towards the fingers or the cursor instead of the centre.
 */
export function zoomAbout(view: View, scale: number, fx: number, fy: number): View {
  const next = clampScale(scale);
  const k = next / view.scale;
  return { scale: next, x: fx - k * (fx - view.x), y: fy - k * (fy - view.y) };
}
