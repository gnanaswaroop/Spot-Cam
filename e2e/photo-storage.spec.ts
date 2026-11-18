/** Photos are not capped, the gallery shows the space they use, and photos from older versions are carried over. */
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

test('more than 12 photos are kept, and the gallery shows how much space they use', async ({ page, context }) => {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, 14);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(14);
  await expect(page.getByTestId('gallery-storage-usage')).toHaveText(/^14 photos use \d+(\.\d)? (KB|MB) on this device/);

  await page.reload();
  await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(14); // and they survive a reload
});

test('photos kept by an older version (one list under one key) are carried over', async ({ page, context }) => {
  await setUpGrantedCamera(page, context);
  await page.goto(`${SITE}/gallery`);
  await expect(page.getByText('No photos yet.')).toBeVisible();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.evaluate(async png => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const store = db.transaction('keyval', 'readwrite').objectStore('keyval');
    store.delete('spotcam-photo-ids');
    const now = Date.now();
    store.put([1, 2, 3].map(n => ({ id: `old-${n}`, dataUrl: png, timestamp: now - n * 1000, location: null })), 'spotcam-photos');
    await new Promise(done => (store.transaction.oncomplete = done));
  }, png);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(3);
  await page.reload(); // now read back from the new layout
  await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(3);
});

test('deleting a photo removes it for good', async ({ page, context }) => {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, 3);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: /^Open photo taken/ }).first().click();
  await page.getByRole('button', { name: 'Delete photo' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(2);
});

/** Makes the browser report this much storage use and quota (or fail to report). */
const reportStorage = (page: import('@playwright/test').Page, usage: number, quota: number | 'unavailable') =>
  page.addInitScript(([u, q]) => {
    Object.defineProperty(StorageManager.prototype, 'estimate', {
      configurable: true,
      value: () => (q === 'unavailable' ? Promise.reject(new Error('no estimate')) : Promise.resolve({ usage: u, quota: q })),
    });
  }, [usage, quota] as const);

const usageLine = (page: import('@playwright/test').Page) => page.getByTestId('gallery-storage-usage');
const openGallery = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
};

test.describe('the space the photos use', () => {
  test('says "1 photo" for one, and the count follows deletes', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 2);
    await openGallery(page);
    await expect(usageLine(page)).toContainText('2 photos use');
    await page.getByRole('button', { name: /^Open photo taken/ }).first().click();
    await page.getByRole('button', { name: 'Delete photo' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(usageLine(page)).toContainText('1 photo use');
  });

  test('shows how much room the browser says is left', async ({ page, context }) => {
    await reportStorage(page, 1_000_000, 5_000_000_000);
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await openGallery(page);
    await expect(usageLine(page)).toContainText('about 4.7 GB still free');
    await expect(usageLine(page)).not.toContainText('running low');
  });

  test('warns when little room is left', async ({ page, context }) => {
    await reportStorage(page, 950_000_000, 1_000_000_000); // 50 MB free
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await openGallery(page);
    await expect(usageLine(page)).toContainText('still free');
    await expect(usageLine(page)).toContainText('Space is running low');
  });

  test('leaves out the free space when the browser cannot say', async ({ page, context }) => {
    await reportStorage(page, 0, 'unavailable');
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await openGallery(page);
    await expect(usageLine(page)).toContainText('use');
    await expect(usageLine(page)).not.toContainText('still free');
    await expect(usageLine(page)).not.toContainText('running low');
  });
});

test.describe('when storage cannot be written', () => {
  test('a notice appears, and goes away once saving works again', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await expect(page.getByRole('alert').filter({ hasText: 'could not be saved' })).toHaveCount(0);

    // From now on every write is refused, the way a full disk refuses it.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      (window as unknown as { __failWrites: boolean }).__failWrites = true;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
        if ((window as unknown as { __failWrites: boolean }).__failWrites) throw new DOMException('full', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    await page.getByRole('button', { name: 'Capture photo' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not be saved' })).toBeVisible();

    await page.evaluate(() => ((window as unknown as { __failWrites: boolean }).__failWrites = false));
    await page.waitForTimeout(1200); // the capture button needs a moment between photos
    await page.getByRole('button', { name: 'Capture photo' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not be saved' })).toHaveCount(0);
  });
});

test('taking a photo asks the browser to keep the photos', async ({ page, context }) => {
  await page.addInitScript(() => {
    (window as unknown as { __persist: number }).__persist = 0;
    Object.defineProperty(StorageManager.prototype, 'persist', {
      configurable: true,
      value: () => {
        (window as unknown as { __persist: number }).__persist++;
        return Promise.resolve(true);
      },
    });
  });
  await setUpGrantedCamera(page, context);
  await takePhotos(page, 1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __persist: number }).__persist)).toBeGreaterThan(0);
});
