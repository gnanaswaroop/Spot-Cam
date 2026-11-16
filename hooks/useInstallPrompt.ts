/**
 * @file "Install app" support. Chrome and Edge announce that SpotCam can be installed with a
 * `beforeinstallprompt` event, which we keep so a button on the landing page can trigger it. iOS Safari
 * never sends that event: there, people install from the Share menu, so we show those steps instead.
 */
import { useCallback, useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

import { track } from '../utils/analytics';

/** True when the page is already running as an installed app. */
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** iPhone or iPad (iPadOS 13+ reports itself as a Mac with a touch screen). */
const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button instead of the browser's mini bar
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      track('pwa_installed');
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null); // the browser only allows one prompt per event
  }, [event]);

  const standalone = typeof window !== 'undefined' && isStandalone();
  return {
    /** Show an "Install app" button. */
    canInstall: event !== null && !installed && !standalone,
    install,
    /** Show the "Share, then Add to Home Screen" steps. */
    showIosSteps: typeof navigator !== 'undefined' && isIos() && !installed && !standalone,
  };
}
