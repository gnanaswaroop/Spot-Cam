/**
 * @file Pinch to zoom on the live camera picture, using the camera's own zoom (not a stretch of the picture).
 *
 * Two fingers on the picture set the zoom to the value the pinch asks for: spreading the fingers zooms in, closing them zooms out,
 * always within the camera's zoom range. The caller applies the value to the camera, so the image the camera captures is zoomed,
 * not just the preview. Updates are sent at most once a frame, because each one is an asynchronous request to the camera.
 * With one finger nothing happens here.
 */
import { PointerEvent, useCallback, useEffect, useRef } from 'react';

export interface ZoomRange {
  min: number;
  max: number;
}

interface Latest {
  range: ZoomRange | null;
  current: number;
  onZoom: (zoom: number) => void;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function usePinchZoom(range: ZoomRange | null, current: number, onZoom: (zoom: number) => void) {
  const points = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ dist: number; zoom: number } | null>(null);
  const pending = useRef<number | null>(null);
  const frame = useRef(0);
  const latest = useRef<Latest>({ range, current, onZoom });

  useEffect(() => {
    latest.current = { range, current, onZoom };
  }, [range, current, onZoom]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.current.size === 2) {
      const [a, b] = [...points.current.values()];
      const dist = distance(a, b);
      start.current = dist > 0 ? { dist, zoom: latest.current.current } : null;
      // Keep both fingers' moves here, even when a finger leaves the picture.
      for (const id of points.current.keys()) e.currentTarget.setPointerCapture?.(id);
    }
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const point = points.current.get(e.pointerId);
    if (!point) return;
    point.x = e.clientX;
    point.y = e.clientY;
    const s = start.current;
    const { range: r } = latest.current;
    if (points.current.size < 2 || !s || !r) return;
    const [a, b] = [...points.current.values()];
    const zoom = Math.min(r.max, Math.max(r.min, s.zoom * (distance(a, b) / s.dist)));
    pending.current = zoom;
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (pending.current !== null) latest.current.onZoom(pending.current);
        pending.current = null;
      });
    }
  }, []);

  const onPointerEnd = useCallback((e: PointerEvent<HTMLElement>) => {
    points.current.delete(e.pointerId);
    if (points.current.size < 2) start.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
