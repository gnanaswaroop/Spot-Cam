/**
 * @file Horizontal swipe detection for the photo viewer, using pointer events so touch, pen and mouse all work.
 *
 * The element should have `touch-action: pan-y` so the browser keeps vertical scrolling and hands horizontal drags to us.
 * While the finger is down, `offset` follows it (so the picture moves with the finger); on release a long enough,
 * mostly sideways drag calls `onNext` (swipe left) or `onPrevious` (swipe right). At either end the picture only
 * gives a little, so it is clear there is nothing further. A short but quick flick counts as a swipe too.
 */
import { PointerEvent, useEffect, useRef, useState } from 'react';

/** How far (px) a drag must go to count as a swipe. */
export const SWIPE_DISTANCE_PX = 50;
/** A flick shorter than that still counts when it is at least this fast (px per ms) and at least FLICK_DISTANCE_PX long. */
export const FLICK_SPEED = 0.4;
export const FLICK_DISTANCE_PX = 24;

/**
 * `enabled: false` turns swiping off (a zoomed photo is panned instead). Any drag in progress is dropped when it turns off.
 */
export function useSwipe({ onNext, onPrevious, enabled = true }: { onNext?: () => void; onPrevious?: () => void; enabled?: boolean }) {
  const start = useRef<{ x: number; y: number; id: number; at: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setOffset(0);
  };

  useEffect(() => {
    if (!enabled) {
      start.current = null;
      setDragging(false);
      setOffset(0);
    }
  }, [enabled]);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, at: performance.now() };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!dragging && Math.abs(dx) < 8) return; // a tap or a tiny wobble is not a drag
      if (Math.abs(dy) > Math.abs(dx) * 1.5) return; // mostly vertical: leave it alone
      if (!dragging) {
        setDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      const canGo = dx < 0 ? !!onNext : !!onPrevious;
      setOffset(canGo ? dx : dx / 4);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const speed = Math.abs(dx) / Math.max(performance.now() - s.at, 1);
      reset();
      const farEnough = Math.abs(dx) >= SWIPE_DISTANCE_PX || (Math.abs(dx) >= FLICK_DISTANCE_PX && speed >= FLICK_SPEED);
      if (!farEnough || Math.abs(dy) > Math.abs(dx) * 1.5) return;
      if (dx < 0) onNext?.();
      else onPrevious?.();
    },
    onPointerCancel: reset,
  };

  return { handlers, offset, dragging };
}
