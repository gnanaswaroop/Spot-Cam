/**
 * @file Implements a custom React hook for tracking the user's geolocation.
 */

import { useState, useEffect } from 'react';
import { GeolocationData } from '../types';

/**
 * A custom hook that provides real-time geolocation data.
 * It uses `navigator.geolocation.watchPosition` for continuous updates and
 * fetches a human-readable address using the OpenStreetMap Nominatim API.
 * @returns {{location: GeolocationData | null, error: string | null}} An object containing the current location and any potential error message.
 */
export function useGeolocation() {
  const [location, setLocation] = useState<GeolocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True when the user (or browser policy) denied location access.
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Bump to restart the position watch (e.g. after the user re-enables permission).
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    // A flag to prevent state updates after the component has unmounted.
    let isMounted = true;

    /**
     * Success callback for `watchPosition`. Handles updating the location state.
     * @param {GeolocationPosition} position - The position object from the Geolocation API.
     */
    const handlePositionSuccess = async (position: GeolocationPosition) => {
      if (!isMounted) return;

      const { latitude, longitude } = position.coords;

      // STEP 1: Immediately update coordinates for responsiveness.
      // Preserve the old address if it exists to avoid UI flicker.
      setLocation(prev => ({
          latitude, 
          longitude, 
          address: prev?.address || 'Fetching address...'
      }));
      setError(null);
      setPermissionDenied(false);

      // STEP 2: Asynchronously fetch the reverse-geocoded address.
      // TODO: Fetch to a better hosted Reverse Geo-coding endpoint
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        if (!response.ok) throw new Error('Failed to fetch address');
        const data = await response.json();
        
        if (isMounted) {
          setLocation({
            latitude,
            longitude,
            address: data.display_name || 'Address not found',
          });
        }
      } catch (err) {
        console.error('Reverse geocoding error:', err);
        // If address lookup fails, update the state to reflect that.
        if (isMounted) {
          setLocation(prev => prev ? { ...prev, address: 'Address lookup failed.' } : null);
        }
      }
    };
    
    /**
     * Error callback for `watchPosition`. Handles updating the error state.
     * @param {GeolocationPositionError} err - The error object from the Geolocation API.
     */
    const handlePositionError = (err: GeolocationPositionError) => {
      if (!isMounted) return;
      setError(err.message);
      setPermissionDenied(err.code === err.PERMISSION_DENIED);
    };

    // Check if the Geolocation API is supported by the browser.
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    // Start watching the user's position.
    const watchId = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true, // Request the most accurate position possible.
        timeout: 10000,          // Time (in ms) before the error callback is invoked.
        maximumAge: 0,           // Don't use a cached position.
      }
    );

    // Cleanup function: runs when the component unmounts.
    return () => {
      isMounted = false;
      // Stop watching the position to save battery and resources.
      navigator.geolocation.clearWatch(watchId);
    };
  }, [retryTrigger]); // Re-runs only when retry() is called.

  const retry = () => {
    setError(null);
    setPermissionDenied(false);
    setRetryTrigger(c => c + 1);
  };

  return { location, error, permissionDenied, retry };
}
