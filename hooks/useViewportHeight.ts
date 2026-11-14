/**
 * @file Keeps a CSS variable (--app-height) in sync with the *visible* viewport height.
 *
 * On phones, `100vh` is the tall viewport (browser bars hidden), so full-screen layouts overflow
 * and controls at the bottom end up under the browser toolbar or Android's navigation bar.
 * `window.innerHeight` tracks what is really visible. It is not affected by pinch-zoom (unlike
 * visualViewport.height). CSS falls back to `100dvh` until this runs (see `.app-h` in index.css).
 */

import { useEffect } from 'react';

export function useViewportHeight() {
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
}
