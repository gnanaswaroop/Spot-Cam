/**
 * @file Pinch to zoom, drag to pan and scroll-wheel zoom for the photo and video viewer.
 *
 * The caller spreads `handlers` onto the element that receives the pointers (the same one that swipes), and puts
 * `paneRef` on the element that is transformed (the picture). At 1x, one finger does nothing here, so the swipe to the
 * next photo still works. Once zoomed, or with two fingers down, the gesture belongs to the zoom. The swipe hook is
 * turned off while zoomed (see `useSwipe`'s `enabled`) so the two never act together.
 */
import { PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FIT, View, ZOOM_STEP, clampPan, zoomAbout } from '../utils/zoom';

/** How much a scroll-wheel notch changes the zoom: each pixel of wheel travel scales it by about 0.2%. */
const WHEEL_SENSITIVITY = 0.002;

interface Gesture {
  /** The view when this gesture began (the finger count last changed). */
  view: View;
  /** Where the fingers were, in screen pixels and relative to the picture's centre. */
  midClient: { x: number; y: number };
  mid: { x: number; y: number };
  /** Distance between the two fingers (0 with one finger). */
  dist: number;
}

export function useZoom() {
  const [view, setView] = useState<View>(FIT);
  const viewRef = useRef<View>(FIT);
  const paneRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const apply = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  /** The middle of the picture as it sits on screen with no zoom or shift (the transform's origin). */
  const centre = useCallback(() => {
    const el = paneRef.current;
    if (!el) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2 - viewRef.current.x, y: box.top + box.height / 2 - viewRef.current.y };
  }, []);

  /** The untransformed size of the picture box (offset sizes ignore transforms). */
  const size = useCallback(() => ({ width: paneRef.current?.offsetWidth ?? 0, height: paneRef.current?.offsetHeight ?? 0 }), []);

  /** Starts a new gesture from the fingers down now, so a finger that lifts does not make the picture jump. */
  const rebase = () => {
    const points = [...pointers.current.values()];
    if (points.length === 0) {
      gesture.current = null;
      return;
    }
    const [first, second] = points;
    // A copy: `first` is the stored point, which moves with the finger; the gesture must keep where it started.
    const midClient = second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : { x: first.x, y: first.y };
    const c = centre();
    gesture.current = {
      view: viewRef.current,
      midClient,
      mid: { x: midClient.x - c.x, y: midClient.y - c.y },
      dist: second ? Math.hypot(first.x - second.x, first.y - second.y) : 0,
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase();
    // Once zoomed or pinching, keep every finger's moves here even when the finger leaves the element.
    if (pointers.current.size >= 2 || viewRef.current.scale > 1) {
      for (const id of pointers.current.keys()) e.currentTarget.setPointerCapture?.(id);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const point = pointers.current.get(e.pointerId);
    if (!point) return;
    point.x = e.clientX;
    point.y = e.clientY;
    const g = gesture.current;
    if (!g) return;
    const [first, second] = [...pointers.current.values()];
    if (second) {
      if (g.dist === 0) return;
      const dist = Math.hypot(first.x - second.x, first.y - second.y);
      const mid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      // Zoom about where the fingers were, then follow the fingers' movement across the screen.
      const scaled = zoomAbout(g.view, g.view.scale * (dist / g.dist), g.mid.x, g.mid.y);
      apply(clampPan({ ...scaled, x: scaled.x + mid.x - g.midClient.x, y: scaled.y + mid.y - g.midClient.y }, size().width, size().height));
      return;
    }
    if (g.view.scale <= 1) return; // one finger at 1x is a swipe, not a pan
    apply(clampPan({ scale: g.view.scale, x: g.view.x + e.clientX - g.midClient.x, y: g.view.y + e.clientY - g.midClient.y }, size().width, size().height));
  };

  const onPointerEnd = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    rebase();
  };

  const zoomBy = useCallback(
    (factor: number) => {
      const { width, height } = size();
      apply(clampPan(zoomAbout(viewRef.current, viewRef.current.scale * factor, 0, 0), width, height));
    },
    [apply, size],
  );

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  const reset = useCallback(() => apply(FIT), [apply]);

  // A scroll wheel zooms about the cursor. It is a native listener so it can stop the page from scrolling.
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const c = centre();
      const next = zoomAbout(viewRef.current, viewRef.current.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY), e.clientX - c.x, e.clientY - c.y);
      apply(clampPan(next, size().width, size().height));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // A two-finger move is the zoom, so the browser must not also pinch-zoom the whole page with it (some phone browsers do
    // that unless the touch is cancelled here). A one-finger move is cancelled only while zoomed, where it pans.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 || viewRef.current.scale > 1) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [apply, centre, size]);

  return {
    view,
    paneRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
    zoomIn,
    zoomOut,
    reset,
  };
}
