/**
 * @file Shares the analytics choice between the consent banner, Settings and the privacy page, and
 * starts analytics when (and only when) the site has it configured and the visitor has agreed.
 * See utils/analytics.ts for the rules.
 */
import { useSyncExternalStore } from 'react';
import {
  AnalyticsConfig,
  Consent,
  loadConfig,
  readConsent,
  startAnalytics,
  stopAnalytics,
  trackingOptOut,
  writeConsent,
} from '../utils/analytics';

interface State {
  /** undefined until the config file has been looked for. */
  config: AnalyticsConfig | null | undefined;
  consent: Consent;
}

let state: State = { config: undefined, consent: undefined };
const listeners = new Set<() => void>();
let loading = false;

const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach(l => l());
};

/** Looks for the config once, and starts analytics if the visitor already agreed on an earlier visit. */
function init() {
  if (loading || state.config !== undefined) return;
  loading = true;
  const optOut = trackingOptOut();
  loadConfig().then(config => {
    const consent = readConsent();
    // Start before publishing the state, so the first page view finds analytics ready.
    if (config && !optOut && consent === 'granted') startAnalytics(config);
    set({ config, consent: optOut ? 'denied' : consent });
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  init();
  return () => listeners.delete(listener);
};
const snapshot = () => state;

export function useAnalytics() {
  const { config, consent } = useSyncExternalStore(subscribe, snapshot);
  const optOut = typeof navigator !== 'undefined' && trackingOptOut();
  return {
    /** The site has analytics configured (and the browser has not opted out of tracking). */
    available: !!config && !optOut,
    /** The browser asked not to be tracked, so analytics stays off and there is nothing to choose. */
    browserOptOut: optOut,
    consent,
    /** Show the banner: configured, allowed, and no choice made yet. */
    needsChoice: !!config && !optOut && consent === undefined,
    accept: () => {
      if (!state.config) return;
      writeConsent('granted');
      startAnalytics(state.config);
      set({ consent: 'granted' });
    },
    decline: () => {
      writeConsent('denied');
      set({ consent: 'denied' });
      stopAnalytics();
    },
  };
}
