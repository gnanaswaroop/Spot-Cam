/**
 * @file Asks once whether SpotCam may count visits. Shown only when the site has analytics configured,
 * the browser has not opted out of tracking and no choice has been made. Declining is exactly as easy
 * as accepting, and nothing is sent before a choice.
 */
import React from 'react';
import { useAnalytics } from '../hooks/useAnalytics';

const button = 'min-h-11 flex-1 rounded-full px-4 text-sm font-semibold transition-colors';

export const ConsentBanner: React.FC<{ onPrivacy: () => void }> = ({ onPrivacy }) => {
  const { needsChoice, accept, decline } = useAnalytics();
  if (!needsChoice) return null;
  return (
    <section
      aria-label="Usage statistics"
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-gray-900/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-lg backdrop-blur"
    >
      <p className="mx-auto max-w-2xl text-sm text-gray-200">
        May SpotCam count visits to improve the site? It never includes your photos or location.{' '}
        <a
          href={`${import.meta.env.BASE_URL}privacy`}
          onClick={e => {
            e.preventDefault();
            onPrivacy();
          }}
          className="text-blue-300 underline"
        >
          Details
        </a>
      </p>
      <div className="mx-auto mt-2 flex max-w-2xl gap-3">
        <button type="button" onClick={decline} className={`${button} border border-white/30 text-white hover:bg-white/10`}>
          No thanks
        </button>
        <button type="button" onClick={accept} className={`${button} border border-white/30 text-white hover:bg-white/10`}>
          Yes, count my visits
        </button>
      </div>
    </section>
  );
};
