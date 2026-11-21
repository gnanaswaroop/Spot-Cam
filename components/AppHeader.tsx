/**
 * @file The top bar for the gallery and settings pages: the SpotCam logo on the left, and a clear
 * "Back to camera" button on the right. The page title (an h1) sits under it.
 */
import React from 'react';
import { BackArrowIcon } from './icons';
import { useT } from '../utils/i18n';

interface AppHeaderProps {
  /** Return to the camera view. */
  onBack: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onBack }) => {
  const { t } = useT();
  return (
  <header className="w-full flex items-center justify-between gap-3 bg-gray-800 px-4 py-3 shadow-md z-10">
    <div className="flex min-w-0 items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8 shrink-0 rounded-[22%]" />
      <span className="truncate text-base font-semibold tracking-tight">SpotCam</span>
    </div>
    <button
      type="button"
      onClick={onBack}
      aria-label={t('header.back')}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
    >
      <BackArrowIcon className="h-5 w-5" />
      <span>{t('header.back')}</span>
    </button>
  </header>
  );
};
