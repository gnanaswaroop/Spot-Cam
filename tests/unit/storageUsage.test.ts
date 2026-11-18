import { describe, expect, it } from 'vitest';
import { dataUrlBytes, formatBytes, isLowOnSpace } from '../../utils/storageUsage';

describe('dataUrlBytes', () => {
  it('counts the bytes behind the base64, without the header or padding', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,QUJD')).toBe(3); // "ABC"
    expect(dataUrlBytes('data:image/jpeg;base64,QUI=')).toBe(2); // "AB"
    expect(dataUrlBytes('data:image/jpeg;base64,QQ==')).toBe(1); // "A"
    expect(dataUrlBytes('data:image/jpeg;base64,')).toBe(0);
  });
});

describe('formatBytes', () => {
  it('uses KB, MB and GB', () => {
    expect(formatBytes(0)).toBe('1 KB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(24.3 * 1024 * 1024)).toBe('24.3 MB');
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });
});

describe('isLowOnSpace', () => {
  it('is low under 100 MB, and never when the browser cannot say', () => {
    expect(isLowOnSpace(50 * 1024 * 1024)).toBe(true);
    expect(isLowOnSpace(500 * 1024 * 1024)).toBe(false);
    expect(isLowOnSpace(null)).toBe(false);
  });
});
