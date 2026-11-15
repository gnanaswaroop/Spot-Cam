/**
 * @file Registers the service worker (production builds only) and reports when a new version is
 * waiting, so the app can offer a "Reload" button instead of swapping versions under the user.
 *
 * Update flow: the browser fetches sw.js on every visit (and we ask again when the tab comes back and
 * once an hour). A changed sw.js installs in the background and waits. `applyUpdate()` tells it to take
 * over; when it does, the page reloads once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const HOUR_MS = 60 * 60 * 1000;

export function useServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    // Dev server: no sw.js is built, and a worker would only get in the way of hot reloading.
    if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let timer: number | undefined;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => registration?.update().catch(() => undefined); // offline: try again later
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onControllerChange = () => {
      if (reloading.current) window.location.reload(); // only after the user asked for the update
    };

    // A worker that finished installing while an older one still controls the page is an update.
    const watch = (worker: ServiceWorker) =>
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
      });

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(reg => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        if (reg.installing) watch(reg.installing);
        reg.addEventListener('updatefound', () => reg.installing && watch(reg.installing));
        timer = window.setInterval(check, HOUR_MS);
      })
      .catch(() => undefined); // the app works without a service worker, just not offline

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    reloading.current = true;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  }, [waiting]);

  return { updateReady: waiting !== null, applyUpdate };
}
