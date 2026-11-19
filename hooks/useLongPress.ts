import { useRef } from 'react';
import type React from 'react';

const HOLD_MS = 500;
/** A finger that moves further than this is scrolling, not holding. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Press and hold on an item (about half a second) to act on it, the way the phone's own gallery starts selecting.
 * Returns a function that gives the event handlers for one item. The tap that follows a hold is swallowed so it does not
 * also open the item, and the phone's own menu for a held image is switched off.
 */
export function useLongPress(onLongPress: (id: string) => void) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    origin.current = null;
  };

  return (id: string, enabled = true) => ({
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false; // a new press always starts clean
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        origin.current = null;
        navigator.vibrate?.(15); // a short buzz where the phone allows it
        onLongPress(id);
        // The layout may shift under the finger (the selection bar appears), so the release can land on another element:
        // clear the flag from the window as well.
        const clear = () => window.setTimeout(() => (fired.current = false), 0);
        window.addEventListener('pointerup', clear, { once: true });
        window.addEventListener('pointercancel', clear, { once: true });
      }, HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const start = origin.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: () => {
      cancel();
      // The click that ends a hold arrives right after this; afterwards the flag must not linger (a keyboard press is not a hold).
      window.setTimeout(() => (fired.current = false), 0);
    },
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });
}
