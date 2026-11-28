/**
 * @file Settings: the address cache (size and clearing), video (on or off, sound, longest length), saved photos (delete all, and how long they are kept), the cache radius, and the map service used for the link in shared text.
 * Everything here is stored on this device only.
 */

import React, { useEffect, useState } from 'react';
import { geocoder } from '../utils/geocoder';
import { forgetLastAddress } from '../utils/lastAddress';
import {
  CACHE_RADIUS_MAX_M,
  CACHE_RADIUS_MIN_M,
  DEFAULT_CACHE_RADIUS_M,
  DEFAULT_VIDEO_MAX_MINUTES,
  VIDEO_MAX_MINUTES_OPTIONS,
  getCacheRadiusM,
  getLanguage,
  getMapService,
  getPhotoTtlMs,
  getRecordSound,
  getShareSignature,
  getVideoEnabled,
  getVideoMaxMinutes,
  isCacheRadiusCustomised,
  setCacheRadiusM,
  setLanguage,
  setMapService,
  setPhotoTtlMs,
  setRecordSound,
  setShareSignature,
  setVideoEnabled,
  setVideoMaxMinutes,
} from '../utils/settings';
import { PHOTO_TTL_OPTIONS, expiredCount } from '../utils/photoExpiry';
import { MAP_SERVICES, shareSignature, type MapService } from '../utils/maps';
import { AppHeader } from './AppHeader';
import { LANGUAGES, activateLanguage, isLanguage, useT } from '../utils/i18n';

interface SettingsViewProps {
  /** How many photos are saved in the gallery. */
  photoCount: number;
  /** When each saved photo was taken (ms), to tell how many a shorter "keep photos for" time would remove. */
  photoTimestamps: number[];
  /** Deletes every saved photo. */
  onDeleteAllPhotos: () => void;
  /** Returns to the camera. */
  onBack: () => void;
}

const buttonClass =
  'px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const dangerButtonClass =
  'px-4 py-2 rounded-md bg-red-700 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-3">
    <h2 id={id} className="text-lg font-semibold">
      {title}
    </h2>
    {children}
  </section>
);

/** Two-step action: the first press asks, the second press does it. Avoids accidental deletion. */
const ConfirmAction = ({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) => {
  const [asking, setAsking] = useState(false);
  const { t } = useT();
  if (!asking) {
    return (
      <button type="button" className={dangerButtonClass} onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-300">{question}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className={buttonClass} onClick={() => setAsking(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({ photoCount, photoTimestamps, onDeleteAllPhotos, onBack }) => {
  const [status, setStatus] = useState('');
  const { t, tn, lang } = useT();
  const minutesLabel = (minutes: number) => tn('video.minutes', minutes);
  const ttlLabel = (ms: number | null) => t(PHOTO_TTL_OPTIONS.find(option => option.ms === ms)!.key as 'ttl.hour');
  // The language: applied (its words load first) and kept as soon as it is chosen.
  const chooseLanguage = async (code: string) => {
    if (!isLanguage(code)) return;
    setLanguage(code);
    await activateLanguage(code);
    setStatus(t('settings.language.saved', { name: LANGUAGES.find(l => l.code === code)!.name }));
  };

  // Address cache: how many saved addresses are in use, out of how many can be kept.
  const [cache, setCache] = useState<{ count: number; max: number } | null>(null);
  const refreshCache = () => {
    geocoder.cacheStats().then(setCache);
  };
  useEffect(refreshCache, []);

  // Cache radius: the value in use, the text in the box, and whether the user has customised it.
  const [savedRadius, setSavedRadius] = useState(getCacheRadiusM);
  const [customised, setCustomised] = useState(isCacheRadiusCustomised);
  const [draft, setDraft] = useState(String(savedRadius));
  const draftNumber = Number(draft);
  const draftValid =
    draft.trim() !== '' && Number.isInteger(draftNumber) && draftNumber >= CACHE_RADIUS_MIN_M && draftNumber <= CACHE_RADIUS_MAX_M;
  const radiusChanged = draftValid && draftNumber !== savedRadius;

  const applyRadius = (metres: number) => {
    setCacheRadiusM(metres); // the default removes the customisation, so the default keeps applying
    geocoder.setCacheRadius(metres);
    setSavedRadius(metres);
    setDraft(String(metres));
    setCustomised(isCacheRadiusCustomised());
  };

  // Map service for the link added when a photo is shared; saved as soon as one is chosen.
  const [mapService, setMapServiceState] = useState<MapService>(getMapService);
  const chooseMapService = (service: MapService) => {
    setMapService(service);
    setMapServiceState(service);
    setStatus(t('settings.maps.saved', { name: MAP_SERVICES.find(s => s.id === service)!.label }));
  };

  // The line about SpotCam (what it is and the link) at the end of a shared photo's message; saved as soon as it is switched.
  const [signature, setSignatureState] = useState(getShareSignature);
  const chooseSignature = (on: boolean) => {
    setShareSignature(on);
    setSignatureState(on);
    setStatus(on ? t('settings.signature.on') : t('settings.signature.off'));
  };

  // Video: whether the camera offers it, whether it records sound, and how long a video may be. Saved as soon as they change.
  const [videoOn, setVideoOn] = useState(getVideoEnabled);
  const [sound, setSound] = useState(getRecordSound);
  const [videoMinutes, setVideoMinutes] = useState(getVideoMaxMinutes);
  const chooseVideoOn = (on: boolean) => {
    setVideoEnabled(on);
    setVideoOn(on);
    setStatus(on ? t('settings.video.on') : t('settings.video.off'));
  };
  const chooseSound = (on: boolean) => {
    setRecordSound(on);
    setSound(on);
    setStatus(on ? t('settings.video.soundOn') : t('settings.video.soundOff'));
  };
  const chooseVideoMinutes = (minutes: number) => {
    setVideoMaxMinutes(minutes);
    setVideoMinutes(minutes);
    setStatus(t('settings.video.stops', { time: minutesLabel(minutes) }));
  };

  // How long photos are kept. A choice that would remove photos that are already saved asks first.
  const [keepFor, setKeepFor] = useState<number | null>(getPhotoTtlMs);
  const [pendingKeepFor, setPendingKeepFor] = useState<{ ms: number } | null>(null);
  const applyKeepFor = (ms: number | null) => {
    setPhotoTtlMs(ms); // the app removes any expired photos as soon as it hears about the change
    setKeepFor(ms);
    setPendingKeepFor(null);
    setStatus(ms === null ? t('settings.keep.forever') : t('settings.keep.after', { time: ttlLabel(ms) }));
  };
  const chooseKeepFor = (ms: number | null) => {
    if (ms !== null && expiredCount(photoTimestamps, ms) > 0) setPendingKeepFor({ ms });
    else applyKeepFor(ms);
  };
  const wouldRemove = pendingKeepFor ? expiredCount(photoTimestamps, pendingKeepFor.ms) : 0;

  return (
    <div className="app-h w-full bg-gray-900 text-white flex flex-col">
      <AppHeader onBack={onBack} />
      <h1 className="px-4 pt-4 text-xl font-bold">{t('settings.title')}</h1>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 w-full max-w-xl mx-auto">
        <p role="status" aria-live="polite" className="min-h-[1.5em] text-sm text-green-300">
          {status}
        </p>

        <Section id="language-heading" title={t('settings.language.heading')}>
          <p className="text-sm text-gray-300">{t('settings.language.text')}</p>
          <label htmlFor="language" className="block text-base">{t('settings.language.label')}</label>
          <select
            id="language"
            value={lang}
            onChange={e => void chooseLanguage(e.target.value)}
            className="mt-1 min-h-11 rounded-md border border-gray-600 bg-gray-700 px-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {LANGUAGES.map(language => (
              <option key={language.code} value={language.code} lang={language.code}>
                {language.name}
              </option>
            ))}
          </select>
        </Section>

        <Section id="cache-heading" title={t('settings.cache.heading')}>
          <p className="text-sm text-gray-300">
            {t('settings.cache.text')}
          </p>
          <p data-testid="cache-size" className="text-base">
            {cache ? (
              <>
                <span className="font-semibold">{cache.count}</span> {t('settings.cache.inUse')} <span className="text-gray-400">{t('settings.cache.total', { max: cache.max })}</span>
              </>
            ) : (
              t('common.loading')
            )}
          </p>
          <ConfirmAction
            label={t('settings.cache.clear')}
            question={t('settings.cache.question')}
            confirmLabel={t('settings.cache.confirm')}
            onConfirm={() => {
              geocoder.clearCache().then(() => {
                forgetLastAddress();
                refreshCache();
                setStatus(t('settings.cache.cleared'));
              });
            }}
            disabled={cache?.count === 0}
          />
        </Section>

        <Section id="radius-heading" title={t('settings.radius.heading')}>
          <p className="text-sm text-gray-300">
            {t('settings.radius.text')}
          </p>
          <p className="text-sm text-gray-400" data-testid="radius-status">
            {customised ? t('settings.radius.custom', { value: savedRadius }) : t('settings.radius.default', { value: DEFAULT_CACHE_RADIUS_M })}
            {customised && (
              <button
                type="button"
                className="ms-3 underline text-blue-300 hover:text-blue-200"
                onClick={() => {
                  applyRadius(DEFAULT_CACHE_RADIUS_M);
                  setStatus(t('settings.radius.resetDone', { value: DEFAULT_CACHE_RADIUS_M }));
                }}
              >
                {t('settings.radius.reset')}
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-sm">
              <span className="mb-1">{t('settings.radius.label')}</span>
              <input
                id="cache-radius"
                type="number"
                inputMode="numeric"
                min={CACHE_RADIUS_MIN_M}
                max={CACHE_RADIUS_MAX_M}
                step={1}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                aria-invalid={!draftValid}
                aria-describedby="radius-help"
                className="w-28 rounded-md bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={!radiusChanged}
              onClick={() => {
                applyRadius(draftNumber);
                setStatus(t('settings.radius.saved', { value: draftNumber }));
              }}
            >
              {t('settings.radius.save')}
            </button>
          </div>
          <p id="radius-help" className={`text-xs ${draftValid || draft === '' ? 'text-gray-400' : 'text-red-300'}`}>
            {draftValid || draft === ''
              ? t('settings.radius.help', { min: CACHE_RADIUS_MIN_M, max: CACHE_RADIUS_MAX_M })
              : t('settings.radius.invalid', { min: CACHE_RADIUS_MIN_M, max: CACHE_RADIUS_MAX_M })}
          </p>
        </Section>

        <Section id="maps-heading" title={t('settings.maps.heading')}>
          <p className="text-sm text-gray-300">
            {t('settings.maps.text')}
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('settings.maps.legend')}</legend>
            {MAP_SERVICES.map(service => (
              <label key={service.id} className="flex min-h-11 items-center gap-3 text-base">
                <input
                  type="radio"
                  name="map-service"
                  value={service.id}
                  checked={mapService === service.id}
                  onChange={() => chooseMapService(service.id)}
                  className="h-5 w-5 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <span>
                  {service.label}
                  {service.id === 'google' && <span className="text-gray-400"> {t('common.default')}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        </Section>

        <Section id="signature-heading" title={t('settings.signature.heading')}>
          <label className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={signature}
              onChange={e => chooseSignature(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span>
              {t('settings.signature.label')}
              <span className="block text-sm text-gray-400">
                {t('settings.signature.help', { text: shareSignature(window.location.origin).replace(/\n/g, ' ') })}
              </span>
            </span>
          </label>
        </Section>

        <Section id="video-heading" title={t('settings.video.heading')}>
          <label className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={videoOn}
              onChange={e => chooseVideoOn(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span>
              {t('settings.video.record')}
              <span className="block text-sm text-gray-400">
                {t('settings.video.recordHelp')}
              </span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={sound}
              disabled={!videoOn}
              onChange={e => chooseSound(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40"
            />
            <span className={videoOn ? '' : 'opacity-40'}>
              {t('settings.video.sound')}
              <span className="block text-sm text-gray-400">
                {t('settings.video.soundHelp')}
              </span>
            </span>
          </label>
          <div className={videoOn ? '' : 'opacity-40'}>
            <label htmlFor="video-length" className="block text-base">{t('settings.video.longest')}</label>
            <select
              id="video-length"
              value={videoMinutes}
              disabled={!videoOn}
              onChange={e => chooseVideoMinutes(Number(e.target.value))}
              className="mt-1 min-h-11 rounded-md border border-gray-600 bg-gray-700 px-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {VIDEO_MAX_MINUTES_OPTIONS.map(minutes => (
                <option key={minutes} value={minutes}>
                  {minutesLabel(minutes)}
                  {minutes === DEFAULT_VIDEO_MAX_MINUTES ? ` ${t('common.default')}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-400">{t('settings.video.longestHelp')}</p>
          </div>
        </Section>

        <Section id="keep-heading" title={t('settings.keep.heading')}>
          <p className="text-sm text-gray-300">
            {t('settings.keep.text')}
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('settings.keep.legend')}</legend>
            {PHOTO_TTL_OPTIONS.map(option => (
              <label key={option.label} className="flex min-h-11 items-center gap-3 text-base">
                <input
                  type="radio"
                  name="keep-photos-for"
                  value={option.ms ?? 'forever'}
                  checked={(pendingKeepFor ? pendingKeepFor.ms : keepFor) === option.ms}
                  onChange={() => chooseKeepFor(option.ms)}
                  className="h-5 w-5 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <span>
                  {t(option.key as 'ttl.hour')}
                  {option.ms === null && <span className="text-gray-400"> {t('common.default')}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          {pendingKeepFor && (
            <div role="alertdialog" aria-label={t('settings.keep.confirmLabel')} className="space-y-2 rounded-md border border-red-500/40 bg-red-950/30 p-3">
              <p className="text-sm text-gray-200">
                {tn('settings.keep.warn', wouldRemove, { time: ttlLabel(pendingKeepFor.ms) })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={dangerButtonClass} onClick={() => applyKeepFor(pendingKeepFor.ms)}>
                  {tn('settings.keep.yes', wouldRemove)}
                </button>
                <button type="button" className={buttonClass} onClick={() => setPendingKeepFor(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section id="photos-heading" title={t('settings.photos.heading')}>
          <p className="text-sm text-gray-300" data-testid="photo-count">
            {photoCount === 0 ? t('settings.photos.none') : tn('settings.photos.count', photoCount)}
          </p>
          <ConfirmAction
            label={t('settings.photos.delete')}
            question={tn('settings.photos.question', photoCount)}
            confirmLabel={t('settings.photos.confirm')}
            onConfirm={() => {
              onDeleteAllPhotos();
              setStatus(t('settings.photos.deleted'));
            }}
            disabled={photoCount === 0}
          />
        </Section>
      </main>
    </div>
  );
};
