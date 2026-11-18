/**
 * @file State for a full-screen layer (photo viewer, dialog) that is tied to browser history.
 *
 * Without this, the phone's Back gesture can't close the layer: it navigates away from the page
 * instead, and the browser later restores the page (back/forward cache) with the layer still open.
 *
 *  - open()  pushes a history entry, so Back closes the layer and nothing else.
 *  - close() removes that entry (history.back()), so closing with the X button leaves no stale
 *    entry behind that a later Forward/Back could reopen.
 *  - change() swaps what the open layer shows (the next photo) without touching history, so one Back still closes it.
 *  - Layers can nest (a confirm dialog over a viewer): each adds its own key to history.state.
 */

import { useCallback, useEffect, useState } from 'react';

export function useHistoryOverlay<T>(key: string) {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    // Back/Forward: the layer is open only while its key is present in the current entry's state.
    const onPopState = () => {
      if (!window.history.state?.[key]) setValue(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [key]);

  const open = useCallback(
    (next: T) => {
      window.history.pushState({ ...window.history.state, [key]: true }, '');
      setValue(next);
    },
    [key],
  );

  const close = useCallback(() => {
    if (window.history.state?.[key]) window.history.back(); // popstate then clears the value
    else setValue(null);
  }, [key]);

  /** Shows something else in the already open layer. No new history entry. */
  const change = useCallback((next: T) => setValue(next), []);

  return [value, open, close, change] as const;
}

/** True if the given layer currently owns the active history entry. */
export const hasOverlayEntry = (key: string) => Boolean(window.history.state?.[key]);
