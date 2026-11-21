/**
 * @file A small notice shown when a new version of SpotCam has been downloaded and is waiting.
 * It never reloads by itself: the person taps Reload when it suits them.
 */
import React from 'react';
import { useT } from '../utils/i18n';

export const UpdateToast: React.FC<{ onReload: () => void }> = ({ onReload }) => {
  const { t } = useT();
  return (
  <div
    role="status"
    className="fixed left-1/2 top-3 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-white/15 bg-gray-800 px-4 py-2 text-sm text-white shadow-xl"
  >
    <span>{t('update.message')}</span>
    <button type="button" onClick={onReload} className="h-11 shrink-0 rounded-full bg-blue-600 px-4 font-semibold hover:bg-blue-500">
      {t('update.reload')}
    </button>
  </div>
  );
};
