/**
 * @file Tracks a browser permission ('camera' | 'geolocation') via the Permissions API.
 * Returns 'unknown' where the API or that permission name isn't supported (e.g. Safari for camera);
 * callers should also treat real errors from getUserMedia / geolocation as the source of truth.
 */

import { useEffect, useState } from 'react';

export type PermState = PermissionState | 'unknown';

export function usePermissionState(name: 'camera' | 'geolocation'): PermState {
  const [state, setState] = useState<PermState>('unknown');

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => status && !cancelled && setState(status.state);

    navigator.permissions
      ?.query({ name: name as PermissionName })
      .then(s => {
        if (cancelled) return;
        status = s;
        setState(s.state);
        s.addEventListener('change', onChange);
      })
      .catch(() => setState('unknown'));

    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [name]);

  return state;
}
