/**
 * @file The "How it works" page (/how-it-works): what SpotCam does, what people use it for and a short
 * FAQ. The words live in locales/en.ts (and the other languages), which the build also writes into the page's static HTML.
 */

import React from 'react';
import { useT } from '../utils/i18n';

interface HowItWorksViewProps {
  onBack: () => void;
  onStart: () => void;
}

export const HowItWorksView: React.FC<HowItWorksViewProps> = ({ onBack, onStart }) => {
  const { t } = useT();
  return (
  <div className="app-h w-full overflow-y-auto bg-gray-950 text-gray-200">
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-6 leading-relaxed">
      <a
        href={import.meta.env.BASE_URL}
        onClick={e => {
          e.preventDefault();
          onBack();
        }}
        className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
      >
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7 rounded-[22%]" />
        <span>{t('how.back')}</span>
      </a>

      <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">{t('how.title')}</h1>
      <p className="mt-3 text-gray-300">{t('how.intro')}</p>

      <h2 className="mt-8 text-xl font-semibold text-white">{t('how.stepsHeading')}</h2>
      <ol className="mt-3 list-decimal space-y-2 ps-6 text-gray-300">
        {([1, 2, 3] as const).map(n => (
          <li key={n}>
            <strong className="text-white">{t(`how.step${n}.title`)}.</strong> {t(`how.step${n}.text`)}
          </li>
        ))}
      </ol>

      <h2 className="mt-8 text-xl font-semibold text-white">{t('how.useHeading')}</h2>
      <ul className="mt-3 list-disc space-y-2 ps-6 text-gray-300">
        {([1, 2, 3, 4] as const).map(n => (
          <li key={n}>
            <strong className="text-white">{t(`how.use${n}.title`)}.</strong> {t(`how.use${n}.text`)}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-white">{t('how.faqHeading')}</h2>
      {([1, 2, 3, 4, 5] as const).map(n => (
        <React.Fragment key={n}>
          <h3 className="mt-5 font-semibold text-white">{t(`how.faq${n}.q`)}</h3>
          <p className="mt-1 text-gray-300">{t(`how.faq${n}.a`)}</p>
        </React.Fragment>
      ))}

      <a
        href={`${import.meta.env.BASE_URL}cam`}
        onClick={e => {
          e.preventDefault();
          onStart();
        }}
        className="mt-10 inline-flex min-h-11 items-center rounded-full bg-blue-600 px-6 font-semibold text-white hover:bg-blue-500"
      >
        {t('landing.start')}
      </a>
    </main>
  </div>
  );
};
