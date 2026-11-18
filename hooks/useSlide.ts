/**
 * @file Makes the photo viewer glide from one photo to the next instead of jumping.
 *
 * The viewer lays the previous, current and next photo side by side. After a swipe (or an arrow tap) `go` slides that
 * strip one photo over, and only when the slide has finished does it tell the viewer which photo is now current.
 * The strip is then put back in the middle without animation, which looks the same because the neighbour that slid in
 * is now the current photo. Anything asked for while a slide is running is ignored.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the glide takes (ms). */
export const SLIDE_MS = 260;

export type Direction = 'next' | 'previous';

/** People who asked their phone for less motion get the change at once, with no glide. */
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useSlide({ onPrevious, onNext }: { onPrevious?: () => void; onNext?: () => void }) {
  const [settling, setSettling] = useState<Direction | null>(null);
  const [instant, setInstant] = useState(false); // true for the moment the strip is put back in the middle
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Turn the glide back on after the strip has been put back (one frame later, so that put-back is not animated).
  useEffect(() => {
    if (!instant) return;
    const frame = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(frame);
  }, [instant]);

  const go = useCallback(
    (direction: Direction) => {
      const change = direction === 'next' ? onNext : onPrevious;
      if (!change || settling) return;
      if (prefersReducedMotion()) {
        change();
        return;
      }
      setSettling(direction);
      timer.current = setTimeout(() => {
        setInstant(true);
        setSettling(null);
        change();
      }, SLIDE_MS);
    },
    [onNext, onPrevious, settling],
  );

  return { go, settling, instant };
}
