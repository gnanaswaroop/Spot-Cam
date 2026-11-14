/**
 * @file Browser-specific instructions for re-enabling a blocked permission.
 * Once a user blocks (or repeatedly dismisses) a permission prompt, browsers will not show it
 * again and pages cannot reset it. The only way back is the browser's site settings.
 */

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

/** Step-by-step instructions for turning a blocked permission back on. */
export const getEnableSteps = (what: PermissionName, ua?: string): string[] => {
  const reload = 'Come back here and tap "Reload page".';
  switch (detectBrowser(ua)) {
    case 'ios':
      return [
        'Tap the "aA" icon in the address bar.',
        'Tap "Website Settings".',
        `Set ${what} to "Allow".`,
        ...(what === 'Location'
          ? ['Still blocked? Open Settings > Privacy & Security > Location Services > Safari Websites and choose "While Using the App".']
          : []),
        reload,
      ];
    case 'android':
      return [
        'Tap the lock (or settings) icon at the left of the address bar.',
        'Tap "Permissions".',
        `Switch ${what} to "Allow".`,
        reload,
      ];
    case 'firefox':
      return [
        'Click the permissions icon at the left of the address bar.',
        `Next to ${what}, remove the "Blocked" setting.`,
        reload,
      ];
    case 'safari-mac':
      return [
        'In the Safari menu, choose "Settings for This Website…".',
        `Set ${what} to "Allow".`,
        reload,
      ];
    case 'desktop-chromium':
      return [
        'Click the lock (or settings) icon at the left of the address bar.',
        `Switch ${what} to "Allow" (or open "Site settings" and set it there).`,
        reload,
      ];
    default:
      return [
        "Open this site's settings from your browser's address bar or menu.",
        `Set ${what} to "Allow".`,
        reload,
      ];
  }
};
