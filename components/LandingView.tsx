/**
 * @file Landing page shown first. Explains what SpotCam is and offers a one-tap start.
 */

import React from 'react';
import { CloseIcon, ShareIcon } from './icons';
import { dataURLtoFile } from '../utils/helpers';
import { rich, translate, useT } from '../utils/i18n';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useHistoryOverlay } from '../hooks/useHistoryOverlay';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { shareWebsite, type ShareSiteResult } from '../utils/shareSite';

// Bundled sample photo (public/sample.jpg). BASE_URL keeps it working whatever path the site is served from.
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample.jpg`;

/** Shares the sample image like a captured photo; falls back to a download where sharing isn't supported. */
const shareSample = async () => {
  try {
    const file = await dataURLtoFile(SAMPLE_URL, 'SpotCam_sample.jpg');
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: translate('sample.shareTitle'), text: translate('sample.caption') });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (error) {
    // The user cancelling the share sheet also lands here; nothing to report.
    console.error('Error sharing sample:', error);
  }
};

interface LandingViewProps {
  onStart: () => void;
  onPrivacy: () => void;
  onHowItWorks: () => void;
}


const FEATURES = ['landing.feature1', 'landing.feature2', 'landing.feature3'] as const;

export const LandingView: React.FC<LandingViewProps> = ({ onStart, onPrivacy, onHowItWorks }) => {
  const installProps = useInstallPrompt();
  const { t } = useT();
  // The sample viewer owns a history entry, so the Back gesture closes it instead of leaving the page.
  const [sample, openSample, closeSample] = useHistoryOverlay<true>('sample');
  const showSample = sample !== null;
  return (
    <div className="app-h relative w-full overflow-hidden bg-gray-950 text-white">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />

      <main className="relative mx-auto flex h-full max-w-5xl flex-col justify-center-safe overflow-y-auto gap-5 px-6 py-5 md:flex-row md:items-center md:gap-14 md:py-10">
        {/* Intro */}
        <section className="flex flex-col items-center text-center md:flex-1 md:items-start md:text-left">
          {/* The page's one heading says what the app is (the words people search for), with the name first. */}
          <h1 className="flex flex-col items-center md:items-start">
            <span className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-11 w-11 rounded-[22%] md:h-14 md:w-14" />
              <span className="text-2xl font-semibold tracking-tight md:text-4xl">SpotCam</span>
            </span>
            <span className="mt-2 max-w-sm text-balance text-base font-normal text-gray-300 md:mt-4 md:text-xl">
              <span className="sr-only">: </span>{rich(t('landing.hero'), (inner, i) => <span key={i} className="text-white">{inner}</span>)}
            </span>
          </h1>
          <p className="mt-2 text-sm font-semibold tracking-wide text-blue-400 md:mt-3 md:text-lg">{t('tagline')}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2 md:mt-6 md:justify-start">
            {FEATURES.map(f => (
              <li key={f} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 backdrop-blur md:text-sm">
                {t(f)}
              </li>
            ))}
          </ul>

          {/* Desktop call to action (mobile one sits under the sample) */}
          <div className="hidden md:mt-10 md:block md:w-72">
            <StartButton onStart={onStart} onPrivacy={onPrivacy} onHowItWorks={onHowItWorks} {...installProps} />
          </div>
        </section>

        {/* Sample photo: scales to the space left, so the page never scrolls */}
        <section className="flex min-h-0 justify-center md:flex-1 md:max-h-full">
          <button
            onClick={() => openSample(true)}
            className="group relative inline-flex max-w-full"
          >
            <img
              src={SAMPLE_URL}
              alt={t('landing.sampleAlt')}
              className="max-h-[36dvh] max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl shadow-blue-900/30 transition group-hover:border-blue-400/60 md:max-h-[75dvh]"
            />
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur transition group-hover:bg-blue-600">
              {t('landing.viewSample')}
            </span>
          </button>
        </section>

        {/* Mobile call to action */}
        <div className="shrink-0 md:hidden">
          <StartButton onStart={onStart} onPrivacy={onPrivacy} onHowItWorks={onHowItWorks} {...installProps} />
        </div>
      </main>

      {showSample && <SampleViewer onClose={closeSample} onShare={shareSample} />}
    </div>
  );
};

/** Full-screen view of the sample photo, with focus handling so it works from the keyboard. */
const SampleViewer = ({ onClose, onShare }: { onClose: () => void; onShare: () => void }) => {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const { t } = useT();
  return (
      <div ref={ref} tabIndex={-1} className="focus:outline-none app-h fixed inset-x-0 top-0 z-40 flex flex-col items-center bg-black/90 px-4 pt-14 pb-[max(1rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label={t('sample.dialog')}>
        <button onClick={onClose} className="absolute right-4 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700" aria-label={t('sample.close')}>
          <CloseIcon className="h-6 w-6" />
        </button>
        <div className="flex min-h-0 w-full max-w-4xl flex-1 items-center justify-center">
          <img src={SAMPLE_URL} alt={t('sample.alt')} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
        <div className="mt-3 max-w-xl shrink-0 text-center text-sm text-gray-300">
          <p>14/11/2026, 18:42:10</p>
          <div className="[@media(max-height:480px)]:hidden">
            <p>Lat: 48.85837, Lon: 2.29448</p>
            <p className="mt-1 text-gray-400">{t('sample.place')}</p>
            <p className="mt-3 text-gray-400">{t('sample.hint')}</p>
          </div>
        </div>
        <button onClick={onShare} className="mt-4 flex min-h-11 min-w-11 shrink-0 flex-col items-center text-white transition-colors hover:text-blue-400" aria-label={t('sample.share')}>
          <ShareIcon className="h-8 w-8" />
          <span className="mt-1 text-xs">{t('common.share')}</span>
        </button>
      </div>
  );
};

const SHARE_SITE_MESSAGE: Record<ShareSiteResult, 'landing.linkCopied' | 'landing.linkFailed' | null> = {
  shared: null,
  cancelled: null,
  copied: 'landing.linkCopied',
  failed: 'landing.linkFailed',
};

const StartButton = ({
  onStart,
  onPrivacy,
  onHowItWorks,
  canInstall,
  install,
  showIosSteps,
}: {
  onStart: () => void;
  onPrivacy: () => void;
  onHowItWorks: () => void;
  canInstall: boolean;
  install: () => void;
  showIosSteps: boolean;
}) => {
  const { t } = useT();
  const [shareMessage, setShareMessage] = React.useState<'landing.linkCopied' | 'landing.linkFailed' | null>(null);
  const shareSite = async () => {
    // The site's own address, whatever host and path it is served from.
    const url = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const result = await shareWebsite({ share: navigator.share?.bind(navigator), clipboard: navigator.clipboard }, url, t('share.website'));
    setShareMessage(SHARE_SITE_MESSAGE[result]);
  };
  return (
  <div className="text-center">
    {/* A real link, so search engines can find the camera page; it still opens in place. */}
    <a
      href={`${import.meta.env.BASE_URL}cam`}
      onClick={e => {
        e.preventDefault();
        onStart();
      }}
      className="block w-full rounded-full bg-blue-600 py-3.5 text-lg font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 active:scale-[0.98]"
    >
      {t('landing.start')}
    </a>
    <p className="mt-2 text-xs text-gray-400">{t('landing.needs')}</p>
    <p className="mt-1 text-xs text-gray-400">
      <a
        href={`${import.meta.env.BASE_URL}privacy`}
        onClick={e => {
          e.preventDefault();
          onPrivacy();
        }}
        className="underline hover:text-gray-200"
      >
        {t('landing.privacy')}
      </a>
      <span aria-hidden="true"> · </span>
      <a
        href={`${import.meta.env.BASE_URL}how-it-works/`}
        onClick={e => {
          e.preventDefault();
          onHowItWorks();
        }}
        className="underline hover:text-gray-200"
      >
        {t('landing.how')}
      </a>
      <span aria-hidden="true"> · </span>
      <button type="button" onClick={shareSite} className="underline hover:text-gray-200">
        {t('landing.shareSite')}
      </button>
    </p>
    <p role="status" className="text-xs text-gray-300">{shareMessage ? t(shareMessage) : ''}</p>
    {canInstall && (
      <button type="button" onClick={install} className="mt-2 min-h-11 rounded-full px-4 text-sm font-semibold text-blue-300 underline underline-offset-4 hover:text-blue-200">
        {t('landing.install')}
      </button>
    )}
    {showIosSteps && (
      <p className="mt-1 text-xs text-gray-400">{t('landing.iosSteps')}</p>
    )}
  </div>
  );
};
