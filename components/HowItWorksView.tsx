/**
 * @file The "How it works" page (/how-it-works): what SpotCam does, what people use it for and a short
 * FAQ. The words live in content/howItWorks.ts, which the build also writes into the page's static HTML.
 */

import React from 'react';
import { FAQ, HOW_IT_WORKS_INTRO, HOW_STEPS, USE_CASES } from '../content/howItWorks';

interface HowItWorksViewProps {
  onBack: () => void;
  onStart: () => void;
}

export const HowItWorksView: React.FC<HowItWorksViewProps> = ({ onBack, onStart }) => (
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
        <span>Back to SpotCam</span>
      </a>

      <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">How SpotCam works</h1>
      <p className="mt-3 text-gray-300">{HOW_IT_WORKS_INTRO}</p>

      <h2 className="mt-8 text-xl font-semibold text-white">Three steps</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-6 text-gray-300">
        {HOW_STEPS.map(s => (
          <li key={s.title}>
            <strong className="text-white">{s.title}.</strong> {s.text}
          </li>
        ))}
      </ol>

      <h2 className="mt-8 text-xl font-semibold text-white">What people use it for</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-gray-300">
        {USE_CASES.map(u => (
          <li key={u.title}>
            <strong className="text-white">{u.title}.</strong> {u.text}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-white">Questions</h2>
      {FAQ.map(f => (
        <React.Fragment key={f.question}>
          <h3 className="mt-5 font-semibold text-white">{f.question}</h3>
          <p className="mt-1 text-gray-300">{f.answer}</p>
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
        Start Cam
      </a>
    </main>
  </div>
);
