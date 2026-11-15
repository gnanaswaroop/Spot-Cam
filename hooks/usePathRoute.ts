/**
 * @file Tiny path-based router using the History API.
 *
 *   /  or  /home  -> landing
 *   /cam          -> camera (permissions are requested on load)
 *   /gallery      -> gallery
 *   /privacy      -> privacy policy
 *   /settings     -> settings (address cache, saved photos, cache radius)
 *
 * (Paths are relative to Vite's BASE_URL: '/' on the custom domain, '/Spot-Cam/' on a project site.)
 *
 * GitHub Pages is static hosting, so the build emits a real index.html for each of these paths
 * (see the `spaRoutes` plugin in vite.config.ts) and a 404.html that falls back to the landing page.
 */

import { useCallback, useEffect, useState } from 'react';

export type View = 'landing' | 'camera' | 'gallery' | 'privacy' | 'settings';

// BASE_URL is '/' (or e.g. '/Spot-Cam/'); drop its trailing slash so we can slice it off pathnames.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PATHS: Record<View, string> = {
  landing: '/',
  camera: '/cam',
  gallery: '/gallery',
  privacy: '/privacy',
  settings: '/settings',
};

export const parsePath = (pathname: string): View => {
  const route = (pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname).replace(/^\/+|\/+$/g, '');
  if (route === 'cam') return 'camera';
  if (route === 'gallery') return 'gallery';
  if (route === 'privacy') return 'privacy';
  if (route === 'settings') return 'settings';
  return 'landing'; // '', 'home' and anything unknown
};

export function usePathRoute(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setView(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((next: View) => {
    window.history.pushState(null, '', BASE + PATHS[next]);
    setView(next);
  }, []);

  return [view, navigate];
}
