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
/** How long Reload waits for the new version to take over before it reloads regardless. */
const RELOAD_FALLBACK_MS = 4000;

export function useServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

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

    // On a first visit the page has no worker yet, and the one that installs now is the app itself, not an
    // update (some browsers report it as "installed" only after it has taken control, so the controller
    // check below cannot tell the two apart).
    const controlledAtStart = navigator.serviceWorker.controller !== null;
    let firstInstallPending = !controlledAtStart;

    // A worker that finished installing while an older one still controls the page is an update.
    const watch = (worker: ServiceWorker) =>
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
      });

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(reg => {
        registration = reg;
        registrationRef.current = reg;
        if (reg.waiting && controlledAtStart) setWaiting(reg.waiting);
        if (reg.installing && controlledAtStart) watch(reg.installing);
        reg.addEventListener('updatefound', () => {
          if (firstInstallPending) {
            firstInstallPending = false; // that was the first install, not an update
            return;
          }
          if (reg.installing) watch(reg.installing);
        });
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
    // Never leave the button doing nothing: if the new version has not taken over shortly, reload anyway
    // (the pages are fetched from the network first, so this still shows the newest version).
    window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);

    // Act on the version that is waiting *now*: another release may have replaced the one the notice was
    // first shown for, and a replaced worker ignores the message.
    const registration = registrationRef.current;
    const activate = (worker: ServiceWorker) => worker.postMessage({ type: 'SKIP_WAITING' });
    const current = registration?.waiting ?? waiting;
    const installing = registration?.installing;
    if (registration?.waiting) {
      activate(registration.waiting);
    } else if (installing) {
      // A newer release is still being downloaded: take it over as soon as it is ready.
      installing.addEventListener('statechange', () => installing.state === 'installed' && activate(installing));
    } else if (current) {
      activate(current);
    } else {
      window.location.reload();
    }
  }, [waiting]);

  return { updateReady: waiting !== null, applyUpdate };
}
