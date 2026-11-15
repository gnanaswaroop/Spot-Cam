/**
 * Unit tests for the IndexedDB adapter behind the address cache. IndexedDB is replaced by a mock,
 * so these run in Node and never touch a real database or network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('idb-keyval', () => idb);

import { CacheEntry, idbAddressStore } from '../../utils/geocoder';

const entry: CacheEntry = { latitude: 48.85841, longitude: 2.29451, address: 'Champ de Mars', at: 1, used: 1 };

describe('idbAddressStore', () => {
  beforeEach(() => {
    idb.get.mockReset();
    idb.set.mockReset();
  });

  it('loads the saved entries from its own key', async () => {
    idb.get.mockResolvedValue([entry]);
    expect(await idbAddressStore('test-key').load()).toEqual([entry]);
    expect(idb.get).toHaveBeenCalledWith('test-key');
  });

  it('starts empty when nothing is saved, or when the saved value is not a list', async () => {
    idb.get.mockResolvedValue(undefined);
    expect(await idbAddressStore().load()).toEqual([]);
    idb.get.mockResolvedValue({ corrupted: true });
    expect(await idbAddressStore().load()).toEqual([]);
  });

  it('starts empty, without throwing, when IndexedDB fails to open (for example in some private modes)', async () => {
    idb.get.mockRejectedValue(new Error('IndexedDB blocked'));
    await expect(idbAddressStore().load()).resolves.toEqual([]);
  });

  it('saves the whole list under its key', async () => {
    idb.set.mockResolvedValue(undefined);
    await idbAddressStore('test-key').save([entry]);
    expect(idb.set).toHaveBeenCalledWith('test-key', [entry]);
  });

  it('a failed save is swallowed: the cache simply keeps working from memory', async () => {
    idb.set.mockRejectedValue(new Error('QuotaExceededError'));
    await expect(idbAddressStore().save([entry])).resolves.toBeUndefined();
  });
});
