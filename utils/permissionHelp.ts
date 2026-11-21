/**
 * @file Browser-specific instructions for re-enabling a blocked permission.
 * Once a user blocks (or repeatedly dismisses) a permission prompt, browsers will not show it
 * again and pages cannot reset it. The only way back is the browser's site settings.
 */

import { translate } from './i18n';

export type PermissionName = 'Camera' | 'Location';

type BrowserKind = 'ios' | 'android' | 'firefox' | 'safari-mac' | 'desktop-chromium' | 'other';

export const detectBrowser = (ua: string = navigator.userAgent): BrowserKind => {
  // All iOS browsers (including Chrome/CriOS) use WebKit and share Safari's settings.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Edg|Chrome|Chromium/i.test(ua)) return 'desktop-chromium';
  if (/Safari/i.test(ua)) return 'safari-mac';
  return 'other';
};

/** Step-by-step instructions for turning a blocked permission back on, in the chosen language. */
export const getEnableSteps = (what: PermissionName, ua?: string): string[] => {
  const name = translate(`perm.name.${what}`);
  const set = translate('step.set', { what: name });
  const reload = translate('step.reload');
  switch (detectBrowser(ua)) {
    case 'ios':
      return [
        translate('step.ios.aA'),
        translate('step.ios.website'),
        set,
        ...(what === 'Location' ? [translate('step.ios.locationServices')] : []),
        reload,
      ];
    case 'android':
      // The site-info icon is not always shown at the left of the address bar, so lead with the menu.
      return [
        translate('step.android.menu'),
        translate('step.android.permissions'),
        translate('step.switch', { what: name }),
        translate('step.android.phone', { what: name }),
        reload,
      ];
    case 'firefox':
      return [translate('step.firefox.icon'), translate('step.firefox.remove', { what: name }), reload];
    case 'safari-mac':
      return [translate('step.safari.menu'), set, reload];
    case 'desktop-chromium':
      return [translate('step.chromium.icon'), translate('step.chromium.switch', { what: name }), reload];
    default:
      return [translate('step.other.open'), set, reload];
  }
};
