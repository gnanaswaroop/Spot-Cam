import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataUrlBytes, estimateFreeBytes, formatBytes, isLowOnSpace, requestPersistentStorage } from '../../utils/storageUsage';

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

describe('estimateFreeBytes and requestPersistentStorage', () => {
  const withStorage = (storage: unknown) => vi.stubGlobal('navigator', { storage });
  afterEach(() => vi.unstubAllGlobals());

  it('is the quota minus the usage', async () => {
    withStorage({ estimate: async () => ({ usage: 400, quota: 1000 }) });
    expect(await estimateFreeBytes()).toBe(600);
  });

  it('is never negative', async () => {
    withStorage({ estimate: async () => ({ usage: 1200, quota: 1000 }) });
    expect(await estimateFreeBytes()).toBe(0);
  });

  it('is null when the browser cannot say', async () => {
    withStorage(undefined);
    expect(await estimateFreeBytes()).toBeNull();
    withStorage({});
    expect(await estimateFreeBytes()).toBeNull();
    withStorage({ estimate: async () => ({}) });
    expect(await estimateFreeBytes()).toBeNull();
    withStorage({ estimate: async () => ({ usage: 1, quota: 0 }) });
    expect(await estimateFreeBytes()).toBeNull();
    withStorage({ estimate: async () => { throw new Error('nope'); } });
    expect(await estimateFreeBytes()).toBeNull();
  });

  it('asks the browser for persistent storage, and shrugs when it cannot', async () => {
    const persist = vi.fn(async () => true);
    withStorage({ persist });
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledOnce();

    withStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
    withStorage({ persist: async () => { throw new Error('denied'); } });
    await expect(requestPersistentStorage()).resolves.toBeUndefined();
  });
});
