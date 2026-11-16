/**
 * @file Implements a custom React hook for tracking the user's geolocation and street address.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GeolocationData } from '../types';
import { geocoder } from '../utils/geocoder';
import { distanceMeters } from '../utils/geo';
import { getCacheRadiusM } from '../utils/settings';
import { loadLastAddress, saveLastAddress } from '../utils/lastAddress';

/** An address older than this distance is no longer shown: it would describe somewhere else. */
export const ADDRESS_STALE_DISTANCE_M = 200;

/**
 * State of the address lookup, kept apart from the address text so that a status message
 * can never be mistaken for (or stamped as) an address.
 *  - `loading`: no address yet, a lookup is pending or running
 *  - `ok`: `location.address` holds a real address
 *  - `failed`: every service failed; retrying automatically with a growing delay
 *  - `offline`: the device has no connection; resumes when it comes back
 */
export type AddressStatus = 'loading' | 'ok' | 'failed' | 'offline';

/**
 * Provides real-time geolocation data via `navigator.geolocation.watchPosition`, plus a human-readable
 * address from `utils/geocoder`. The address is looked up sparingly (only after moving, never on every
 * GPS update) and `location.address` only ever contains a real address.
 */
export function useGeolocation() {
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [addressStatus, setAddressStatus] = useState<AddressStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // True when the user (or browser policy) denied location access.
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Bump to restart the position watch (e.g. after the user re-enables permission).
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Latest GPS fix, and the place the current address was found for.
  const position = useRef<{ latitude: number; longitude: number } | null>(null);
  // Starts from the last address found (this visit or an earlier one), so a fix close to it shows it at once.
  const resolved = useRef<{ latitude: number; longitude: number; address: string } | null>(loadLastAddress());
  const inFlight = useRef(false);
  const notBefore = useRef(0); // earliest time the next automatic attempt may start
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const lookupRef = useRef<(force?: boolean) => void>(() => {});

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const lookup = useCallback((force = false) => {
    const pos = position.current;
    if (!pos || !mounted.current || inFlight.current) return;
    if (typeof document !== 'undefined' && document.hidden) return; // resumes on visibilitychange
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setAddressStatus('offline');
      return;
    }

    const known = resolved.current;
    const moved = known ? distanceMeters(pos.latitude, pos.longitude, known.latitude, known.longitude) : Infinity;
    // Look up a new address only after moving beyond the cache radius, so both agree on "the same place".
    if (!force && moved < getCacheRadiusM()) return; // still at the spot we already have an address for
    if (!force && Date.now() < notBefore.current) return; // backing off after a failure

    inFlight.current = true;
    clearTimer();
    if (!known) setAddressStatus('loading');

    geocoder.lookup(pos.latitude, pos.longitude).then(result => {
      inFlight.current = false;
      if (!mounted.current) return;
      if (result.status === 'ok') {
        resolved.current = { latitude: pos.latitude, longitude: pos.longitude, address: result.address };
        saveLastAddress(resolved.current);
        notBefore.current = 0;
        setLocation(prev => (prev ? { ...prev, address: result.address } : prev));
        setAddressStatus('ok');
        lookupRef.current(); // the user may have moved while we were waiting
      } else {
        notBefore.current = result.retryAt;
        if (result.reason === 'unavailable') setAddressStatus(navigator.onLine === false ? 'offline' : 'failed');
        // Try again on our own once the back-off is over; the address then simply appears.
        timer.current = setTimeout(() => lookupRef.current(), Math.max(1000, result.retryAt - Date.now()));
      }
    });
  }, []);
  lookupRef.current = lookup;

  useEffect(() => {
    mounted.current = true;

    const handlePositionSuccess = (pos: GeolocationPosition) => {
      if (!mounted.current) return;
      const { latitude, longitude } = pos.coords;
      position.current = { latitude, longitude };

      // Show the coordinates straight away. Keep the last good address only while it is still close.
      const known = resolved.current;
      const keep = known && distanceMeters(latitude, longitude, known.latitude, known.longitude) <= ADDRESS_STALE_DISTANCE_M;
      setLocation({ latitude, longitude, address: keep ? known.address : undefined });
      if (known && !keep) setAddressStatus(s => (s === 'ok' ? 'loading' : s));
      else if (keep) setAddressStatus(s => (s === 'loading' ? 'ok' : s)); // the remembered address already fits
      setError(null);
      setPermissionDenied(false);

      lookupRef.current();
    };

    const handlePositionError = (err: GeolocationPositionError) => {
      if (!mounted.current) return;
      setError(err.message);
      setPermissionDenied(err.code === err.PERMISSION_DENIED);
    };

    // Resume lookups when the page comes back to the foreground or the connection returns.
    const resume = () => {
      notBefore.current = 0;
      lookupRef.current();
    };
    const onVisibility = () => {
      if (!document.hidden) resume();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', onVisibility);

    let watchId: number | undefined;
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
    } else {
      watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, {
        enableHighAccuracy: true, // Request the most accurate position possible.
        timeout: 10000, // Time (in ms) before the error callback is invoked.
        // A fix up to 30 s old may answer first (a camera opened from another page gets its position at once);
        // every update after it is fresh.
        maximumAge: 30000,
      });
    }

    return () => {
      mounted.current = false;
      clearTimer();
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', onVisibility);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [retryTrigger]); // Re-runs only when retry() is called.

  const retry = () => {
    setError(null);
    setPermissionDenied(false);
    setRetryTrigger(c => c + 1);
  };

  /** User tapped "Retry" on the address: forget the back-off and try right away. */
  const retryAddress = useCallback(() => {
    geocoder.reset();
    notBefore.current = 0;
    lookupRef.current(true);
  }, []);

  return { location, addressStatus, error, permissionDenied, retry, retryAddress };
}
