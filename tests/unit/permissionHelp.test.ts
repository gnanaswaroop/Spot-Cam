import { describe, expect, it } from 'vitest';
import { detectBrowser, getEnableSteps } from '../../utils/permissionHelp';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
};

describe('detectBrowser', () => {
  it('classifies common user agents', () => {
    expect(detectBrowser(UA.iphone)).toBe('ios');
    expect(detectBrowser(UA.iosChrome)).toBe('ios');
    expect(detectBrowser(UA.android)).toBe('android');
    expect(detectBrowser(UA.firefox)).toBe('firefox');
    expect(detectBrowser(UA.edge)).toBe('desktop-chromium');
    expect(detectBrowser(UA.safariMac)).toBe('safari-mac');
    expect(detectBrowser('curl/8')).toBe('other');
  });
});

describe('getEnableSteps', () => {
  it('names the permission and ends with the reload step', () => {
    for (const ua of Object.values(UA)) {
      const steps = getEnableSteps('Camera', ua);
      expect(steps.length).toBeGreaterThan(1);
      expect(steps.join(' ')).toContain('Camera');
      expect(steps[steps.length - 1]).toContain('Reload page');
    }
  });

  it('leads with the menu on Android', () => {
    expect(getEnableSteps('Location', UA.android)[0]).toContain('⋮');
  });
});
