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
