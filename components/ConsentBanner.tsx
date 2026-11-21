/**
 * @file Asks once whether SpotCam may count visits. Shown only when the site has analytics configured,
 * the browser has not opted out of tracking and no choice has been made. Declining is exactly as easy
 * as accepting, and nothing is sent before a choice.
 */
import React, { useEffect, useRef } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { useT } from '../utils/i18n';

const button = 'min-h-11 flex-1 rounded-full px-4 text-sm font-semibold transition-colors';

export const ConsentBanner: React.FC<{ onPrivacy: () => void }> = ({ onPrivacy }) => {
  const { needsChoice, accept, decline } = useAnalytics();
  const { t } = useT();
  const ref = useRef<HTMLElement>(null);

  // Tell the page how tall the banner is (--banner-height), so the page below is made shorter by that much instead of
  // being covered. It is back to 0 when the banner goes away.
  useEffect(() => {
    const el = ref.current;
    if (!needsChoice || !el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--banner-height', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--banner-height');
    };
  }, [needsChoice]);

  if (!needsChoice) return null;
  return (
    <section
      ref={ref}
      aria-label={t('consent.label')}
      className="relative z-50 border-b border-white/10 bg-gray-900 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-lg"
    >
      <p className="mx-auto max-w-2xl text-sm text-gray-200">
        {t('consent.text')}{' '}
        <a
          href={`${import.meta.env.BASE_URL}privacy`}
          onClick={e => {
            e.preventDefault();
            onPrivacy();
          }}
          className="text-blue-300 underline"
        >
          {t('consent.details')}
        </a>
      </p>
      <div className="mx-auto mt-2 flex max-w-2xl gap-3">
        <button type="button" onClick={decline} className={`${button} border border-white/30 text-white hover:bg-white/10`}>
          {t('consent.no')}
        </button>
        <button type="button" onClick={accept} className={`${button} border border-white/30 text-white hover:bg-white/10`}>
          {t('consent.yes')}
        </button>
      </div>
    </section>
  );
};
