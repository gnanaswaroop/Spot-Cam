/**
 * @file Landing page shown first. Explains what SpotCam is and offers a one-tap start.
 */

import React, { useState } from 'react';
import { CloseIcon, ShareIcon } from './icons';
import { dataURLtoFile } from '../utils/helpers';

// Bundled sample photo (public/sample.jpg). BASE_URL keeps it working under /Spot-Cam/ on GitHub Pages.
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample.jpg`;
const SAMPLE_CAPTION = 'Taken on 14/11/2026, 18:42:10 at Champ de Mars, Paris, France (sample location).';

/** Shares the sample image like a captured photo; falls back to a download where sharing isn't supported. */
const shareSample = async () => {
  try {
    const file = await dataURLtoFile(SAMPLE_URL, 'SpotCam_sample.jpg');
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sample photo from SpotCam', text: SAMPLE_CAPTION });
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
}

const FEATURES = ['Date & time', 'GPS & address', 'Stays on your device'];

export const LandingView: React.FC<LandingViewProps> = ({ onStart }) => {
  const [showSample, setShowSample] = useState(false);
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-gray-950 text-white">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />

      <main className="relative mx-auto flex h-full max-w-5xl flex-col justify-center gap-5 px-6 py-5 md:flex-row md:items-center md:gap-14 md:py-10">
        {/* Intro */}
        <section className="flex flex-col items-center text-center md:flex-1 md:items-start md:text-left">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-11 w-11 md:h-14 md:w-14" />
            <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">SpotCam</h1>
          </div>
          <p className="mt-3 max-w-sm text-balance text-base text-gray-300 md:mt-6 md:text-xl">
            A camera that stamps the <span className="text-white">date, time and location</span> onto every photo.
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2 md:mt-6 md:justify-start">
            {FEATURES.map(f => (
              <li key={f} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300 backdrop-blur md:text-sm">
                {f}
              </li>
            ))}
          </ul>

          {/* Desktop call to action (mobile one sits under the sample) */}
          <div className="hidden md:mt-10 md:block md:w-72">
            <StartButton onStart={onStart} />
          </div>
        </section>

        {/* Sample photo: scales to the space left, so the page never scrolls */}
        <section className="flex min-h-0 justify-center md:flex-1 md:max-h-full">
          <button
            onClick={() => setShowSample(true)}
            className="group relative inline-flex max-w-full"
            aria-label="View a sample photo"
          >
            <img
              src={SAMPLE_URL}
              alt="Sample SpotCam photo with date, time and location stamped on it"
              className="max-h-[36dvh] max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl shadow-blue-900/30 transition group-hover:border-blue-400/60 md:max-h-[75dvh]"
            />
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs text-white backdrop-blur transition group-hover:bg-blue-600">
              Tap to view sample
            </span>
          </button>
        </section>

        {/* Mobile call to action */}
        <div className="shrink-0 md:hidden">
          <StartButton onStart={onStart} />
        </div>
      </main>

      {showSample && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Sample photo">
          <button onClick={() => setShowSample(false)} className="absolute right-4 top-4 rounded-full bg-gray-800 p-2 text-white hover:bg-gray-700" aria-label="Close sample">
            <CloseIcon className="h-6 w-6" />
          </button>
          <div className="flex max-h-[65vh] w-full max-w-4xl items-center justify-center">
            <img src={SAMPLE_URL} alt="Sample SpotCam photo" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
          </div>
          <div className="mt-4 max-w-xl text-center text-sm text-gray-300">
            <p>14/11/2026, 18:42:10</p>
            <p>Lat: 48.85837, Lon: 2.29448</p>
            <p className="mt-1 text-gray-400">Champ de Mars, Paris, France (sample location)</p>
            <p className="mt-3 text-gray-500">This is what your photos will look like. Try sharing it.</p>
          </div>
          <button onClick={shareSample} className="mt-5 flex flex-col items-center text-white transition-colors hover:text-blue-400" aria-label="Share sample photo">
            <ShareIcon className="h-8 w-8" />
            <span className="mt-1 text-xs">Share</span>
          </button>
        </div>
      )}
    </div>
  );
};

const StartButton = ({ onStart }: { onStart: () => void }) => (
  <div className="text-center">
    <button
      onClick={onStart}
      className="w-full rounded-full bg-blue-600 py-3.5 text-lg font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 active:scale-[0.98]"
    >
      Start Cam
    </button>
    <p className="mt-2 text-xs text-gray-500">Camera and location access required</p>
  </div>
);
