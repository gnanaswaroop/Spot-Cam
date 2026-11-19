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
  getMapService,
  getPhotoTtlMs,
  getRecordSound,
  getShareSignature,
  getVideoEnabled,
  getVideoMaxMinutes,
  isCacheRadiusCustomised,
  setCacheRadiusM,
  setMapService,
  setPhotoTtlMs,
  setRecordSound,
  setShareSignature,
  setVideoEnabled,
  setVideoMaxMinutes,
} from '../utils/settings';
import { PHOTO_TTL_OPTIONS, expiredCount, ttlLabel } from '../utils/photoExpiry';
import { minutesLabel } from '../utils/video';
import { MAP_SERVICES, shareSignature, type MapService } from '../utils/maps';
import { AppHeader } from './AppHeader';
import { useAnalytics } from '../hooks/useAnalytics';

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
          Cancel
        </button>
      </div>
    </div>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({ photoCount, photoTimestamps, onDeleteAllPhotos, onBack }) => {
  const [status, setStatus] = useState('');
  const analytics = useAnalytics();

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
    setStatus(`Shared photos will link to ${MAP_SERVICES.find(s => s.id === service)!.label}.`);
  };

  // The line about SpotCam (what it is and the link) at the end of a shared photo's message; saved as soon as it is switched.
  const [signature, setSignatureState] = useState(getShareSignature);
  const chooseSignature = (on: boolean) => {
    setShareSignature(on);
    setSignatureState(on);
    setStatus(on ? 'Shared photos will include a line about SpotCam.' : 'Shared photos will no longer mention SpotCam.');
  };

  // Video: whether the camera offers it, whether it records sound, and how long a video may be. Saved as soon as they change.
  const [videoOn, setVideoOn] = useState(getVideoEnabled);
  const [sound, setSound] = useState(getRecordSound);
  const [videoMinutes, setVideoMinutes] = useState(getVideoMaxMinutes);
  const chooseVideoOn = (on: boolean) => {
    setVideoEnabled(on);
    setVideoOn(on);
    setStatus(on ? 'The camera will offer video.' : 'The camera will only take photos.');
  };
  const chooseSound = (on: boolean) => {
    setRecordSound(on);
    setSound(on);
    setStatus(on ? 'Videos will be recorded with sound.' : 'Videos will be recorded without sound.');
  };
  const chooseVideoMinutes = (minutes: number) => {
    setVideoMaxMinutes(minutes);
    setVideoMinutes(minutes);
    setStatus(`A video will stop after ${minutesLabel(minutes)}.`);
  };

  // How long photos are kept. A choice that would remove photos that are already saved asks first.
  const [keepFor, setKeepFor] = useState<number | null>(getPhotoTtlMs);
  const [pendingKeepFor, setPendingKeepFor] = useState<{ ms: number } | null>(null);
  const applyKeepFor = (ms: number | null) => {
    setPhotoTtlMs(ms); // the app removes any expired photos as soon as it hears about the change
    setKeepFor(ms);
    setPendingKeepFor(null);
    setStatus(ms === null ? 'Photos will be kept until you delete them.' : `Photos will be removed after ${ttlLabel(ms)}.`);
  };
  const chooseKeepFor = (ms: number | null) => {
    if (ms !== null && expiredCount(photoTimestamps, ms) > 0) setPendingKeepFor({ ms });
    else applyKeepFor(ms);
  };
  const wouldRemove = pendingKeepFor ? expiredCount(photoTimestamps, pendingKeepFor.ms) : 0;

  return (
    <div className="app-h w-full bg-gray-900 text-white flex flex-col">
      <AppHeader onBack={onBack} />
      <h1 className="px-4 pt-4 text-xl font-bold">Settings</h1>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 w-full max-w-xl mx-auto">
        <p role="status" aria-live="polite" className="min-h-[1.5em] text-sm text-green-300">
          {status}
        </p>

        <Section id="cache-heading" title="Address cache">
          <p className="text-sm text-gray-300">
            Addresses already looked up are kept on this device, so visiting a known place needs no new lookup.
          </p>
          <p data-testid="cache-size" className="text-base">
            {cache ? (
              <>
                <span className="font-semibold">{cache.count}</span> in use <span className="text-gray-400">/ {cache.max} total</span>
              </>
            ) : (
              'Loading...'
            )}
          </p>
          <ConfirmAction
            label="Clear address cache"
            question="Delete every saved address? Lookups will start again the next time you move."
            confirmLabel="Yes, clear the cache"
            onConfirm={() => {
              geocoder.clearCache().then(() => {
                forgetLastAddress();
                refreshCache();
                setStatus('Address cache cleared.');
              });
            }}
            disabled={cache?.count === 0}
          />
        </Section>

        <Section id="radius-heading" title="Address reuse radius">
          <p className="text-sm text-gray-300">
            A saved address is reused for any spot within this distance of where it was found. Your coordinates are always live.
          </p>
          <p className="text-sm text-gray-400" data-testid="radius-status">
            {customised ? `Custom: ${savedRadius} m` : `Default: ${DEFAULT_CACHE_RADIUS_M} m`}
            {customised && (
              <button
                type="button"
                className="ml-3 underline text-blue-300 hover:text-blue-200"
                onClick={() => {
                  applyRadius(DEFAULT_CACHE_RADIUS_M);
                  setStatus(`Radius reset to the default (${DEFAULT_CACHE_RADIUS_M} m).`);
                }}
              >
                Reset to default
              </button>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-sm">
              <span className="mb-1">Radius in metres</span>
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
                setStatus(`Radius saved: ${draftNumber} m.`);
              }}
            >
              Save
            </button>
          </div>
          <p id="radius-help" className={`text-xs ${draftValid || draft === '' ? 'text-gray-400' : 'text-red-300'}`}>
            {draftValid || draft === ''
              ? `Whole number from ${CACHE_RADIUS_MIN_M} to ${CACHE_RADIUS_MAX_M} m.`
              : `Enter a whole number from ${CACHE_RADIUS_MIN_M} to ${CACHE_RADIUS_MAX_M}.`}
          </p>
        </Section>

        <Section id="maps-heading" title="Map link when sharing">
          <p className="text-sm text-gray-300">
            Shared photos include a link to the spot where they were taken. Choose which map opens when someone taps it.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Map service</legend>
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
                  {service.id === 'google' && <span className="text-gray-400"> (default)</span>}
                </span>
              </label>
            ))}
          </fieldset>
        </Section>

        {analytics.available && (
          <Section id="stats-heading" title="Usage statistics">
            <p className="text-sm text-gray-300">
              SpotCam can count visits to improve the site. It never includes your photos, location or address. Your choice is kept on this device.
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Count my visits</legend>
              {([['granted', 'Yes, allow'], ['denied', 'No thanks']] as const).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-3 text-base">
                  <input
                    type="radio"
                    name="usage-statistics"
                    checked={analytics.consent === value}
                    onChange={() => {
                      if (value === 'granted') analytics.accept();
                      else analytics.decline();
                      setStatus(value === 'granted' ? 'Visit counting is on.' : 'Visit counting is off.');
                    }}
                    className="h-5 w-5 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          </Section>
        )}

        <Section id="signature-heading" title="Mention SpotCam when sharing">
          <label className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={signature}
              onChange={e => chooseSignature(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span>
              Add a line about SpotCam to the message of a shared photo
              <span className="block text-sm text-gray-400">
                It reads: &ldquo;{shareSignature(window.location.origin).replace(/\n/g, ' ')}&rdquo;. It is text in the message, not drawn on the photo. On by default.
              </span>
            </span>
          </label>
        </Section>

        <Section id="video-heading" title="Video">
          <label className="flex min-h-11 items-start gap-3 text-base">
            <input
              type="checkbox"
              checked={videoOn}
              onChange={e => chooseVideoOn(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span>
              Record video
              <span className="block text-sm text-gray-400">
                Adds a Video mode to the camera. The date, time and place are drawn on every frame. On by default.
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
              Record sound
              <span className="block text-sm text-gray-400">
                Uses the microphone while a video is recorded. Your browser asks for permission the first time. On by default.
              </span>
            </span>
          </label>
          <div className={videoOn ? '' : 'opacity-40'}>
            <label htmlFor="video-length" className="block text-base">Longest video</label>
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
                  {minutes === DEFAULT_VIDEO_MAX_MINUTES ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-400">A video stops by itself at this length. Videos are saved in the format your browser records, and take much more space than photos.</p>
          </div>
        </Section>

        <Section id="keep-heading" title="Keep photos for">
          <p className="text-sm text-gray-300">
            Photos older than this are removed from the gallery automatically. They are saved only on this device, so share or save a
            photo first if you want to keep it.
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">How long to keep photos</legend>
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
                  {option.label}
                  {option.ms === null && <span className="text-gray-400"> (default)</span>}
                </span>
              </label>
            ))}
          </fieldset>
          {pendingKeepFor && (
            <div role="alertdialog" aria-label="Confirm removing photos" className="space-y-2 rounded-md border border-red-500/40 bg-red-950/30 p-3">
              <p className="text-sm text-gray-200">
                {`${wouldRemove} saved ${wouldRemove === 1 ? 'photo is' : 'photos are'} older than ${ttlLabel(pendingKeepFor.ms)} and will be permanently deleted now. This cannot be undone.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={dangerButtonClass} onClick={() => applyKeepFor(pendingKeepFor.ms)}>
                  {`Yes, delete ${wouldRemove === 1 ? 'it' : `these ${wouldRemove}`}`}
                </button>
                <button type="button" className={buttonClass} onClick={() => setPendingKeepFor(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section id="photos-heading" title="Saved photos">
          <p className="text-sm text-gray-300" data-testid="photo-count">
            {photoCount === 0 ? 'No photos saved.' : `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} saved on this device.`}
          </p>
          <ConfirmAction
            label="Delete all saved photos"
            question={`Permanently delete ${photoCount === 1 ? 'the 1 saved photo' : `all ${photoCount} saved photos`}? This cannot be undone.`}
            confirmLabel="Yes, delete all photos"
            onConfirm={() => {
              onDeleteAllPhotos();
              setStatus('All saved photos deleted.');
            }}
            disabled={photoCount === 0}
          />
        </Section>
      </main>
    </div>
  );
};
