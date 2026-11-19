/**
 * Gallery: press and hold to start selecting, small thumbnails in the grid (the full photo is read only when opened),
 * and downloading photos.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

async function openGalleryWith(page: Page, context: Parameters<typeof setUpGrantedCamera>[1], count: number) {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, count);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
}

const tile = (page: Page, n: number) => page.getByRole('button', { name: /^(Open|Select) photo taken/ }).nth(n);
const status = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('status');

/** A finger held down on `n`-th tile for `ms`, then lifted. `move` is how far it drifts while down. */
async function hold(page: Page, n: number, ms: number, move = 0) {
  const box = (await tile(page, n).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (move) await page.mouse.move(x + move, y, { steps: 3 });
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test.describe('press and hold to select', () => {
  test('holding a photo starts selecting with that photo ticked, and does not open it', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await hold(page, 1, 750);
    await expect(status(page)).toHaveText('1 selected');
    await expect(tile(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tile(page, 0)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('dialog', { name: 'Photo' })).toHaveCount(0);

    // From here a tap toggles, as with the Select button.
    await tile(page, 2).click();
    await expect(status(page)).toHaveText('2 selected');
  });

  test('a quick tap still opens the photo', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await hold(page, 0, 80);
    await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Selection actions' })).toHaveCount(0);
  });

  test('moving the finger (scrolling) is not a hold', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await hold(page, 0, 750, 40);
    await expect(page.getByRole('toolbar', { name: 'Selection actions' })).toHaveCount(0);
  });

  test('the phone\'s own menu for a held image is blocked on the photos', async ({ page, context }) => {
    await openGalleryWith(page, context, 1);
    const prevented = await tile(page, 0).evaluate(el => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });

  test('the Select button still works for people who cannot hold', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await tile(page, 0).click();
    await expect(status(page)).toHaveText('1 selected');
  });
});

test.describe('thumbnails', () => {
  test('the grid shows a small copy, and the viewer swaps in the full photo', async ({ page, context }) => {
    await openGalleryWith(page, context, 1);
    const grid = tile(page, 0).locator('img');
    const thumbSrc = (await grid.getAttribute('src'))!;
    expect(thumbSrc).toMatch(/^data:image\/jpeg/);
    const thumbSize = await grid.evaluate(img => Math.max((img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight));
    expect(thumbSize).toBeLessThanOrEqual(320);

    await tile(page, 0).click();
    const viewer = page.getByRole('dialog', { name: 'Photo' }).locator('img[alt^="Photo taken"]');
    // The full photo is read from storage, so its data is larger than the thumbnail's.
    await expect.poll(async () => ((await viewer.getAttribute('src')) ?? '').length).toBeGreaterThan(thumbSrc.length);
  });

  test('the record in storage holds the thumbnail only; the full photo has its own entry', async ({ page, context }) => {
    await openGalleryWith(page, context, 1);
    const stored = await page.evaluate(
      () =>
        new Promise<{ meta: Record<string, unknown>; full: unknown }>((resolve, reject) => {
          const open = indexedDB.open('keyval-store');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const store = open.result.transaction('keyval').objectStore('keyval');
            const ids = store.get('spotcam-photo-ids');
            ids.onsuccess = () => {
              const id = (ids.result as string[])[0];
              const meta = store.get(`spotcam-photo:${id}`);
              const full = store.get(`spotcam-photo-full:${id}`);
              full.onsuccess = () => resolve({ meta: meta.result, full: full.result });
            };
          };
        }),
    );
    expect(stored.meta.dataUrl).toBeUndefined();
    expect(String(stored.meta.thumbUrl)).toMatch(/^data:image\/jpeg/);
    expect(stored.meta.bytes).toBeGreaterThan(0);
    expect(String(stored.full)).toMatch(/^data:image\/jpeg/);
    expect(String(stored.full).length).toBeGreaterThan(String(stored.meta.thumbUrl).length);
  });

  test('photos saved by the previous version (full photo inside the record) are split into thumbnail and full photo', async ({ page, context }) => {
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
      const now = Date.now();
      store.put(['prev-1', 'prev-2'], 'spotcam-photo-ids');
      ['prev-1', 'prev-2'].forEach((id, i) => store.put({ id, dataUrl: png, timestamp: now - i * 1000, location: null }, `spotcam-photo:${id}`));
      await new Promise(done => (store.transaction.oncomplete = done));
    }, png);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(2);
    await expect(page.getByTestId('gallery-storage-usage')).toContainText('2 photos use');

    const migrated = await page.evaluate(
      () =>
        new Promise<{ meta: Record<string, unknown>; full: unknown }>((resolve, reject) => {
          const open = indexedDB.open('keyval-store');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const store = open.result.transaction('keyval').objectStore('keyval');
            const meta = store.get('spotcam-photo:prev-1');
            const full = store.get('spotcam-photo-full:prev-1');
            full.onsuccess = () => resolve({ meta: meta.result, full: full.result });
          };
        }),
    );
    expect(migrated.meta.dataUrl).toBeUndefined();
    expect(String(migrated.meta.thumbUrl)).toMatch(/^data:image\//);
    expect(String(migrated.full)).toMatch(/^data:image\/png/);

    // The migrated photo still opens in full.
    await tile(page, 0).click();
    await expect(page.getByRole('dialog', { name: 'Photo' }).locator('img[alt^="Photo taken"]')).toHaveAttribute('src', /^data:image\/png/);
  });
});

test.describe('downloading', () => {
  test('the Download button in the viewer saves the photo as a JPEG file', async ({ page, context }) => {
    await openGalleryWith(page, context, 1);
    await tile(page, 0).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download photo' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^SpotCam_photo_\d+\.jpg$/);
    const path = await file.path();
    expect(path).toBeTruthy();
  });

  test('Download selected saves each selected photo', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download selected' })).toBeDisabled();
    await tile(page, 0).click();
    await tile(page, 2).click();

    const names: string[] = [];
    page.on('download', d => names.push(d.suggestedFilename()));
    await page.getByRole('button', { name: 'Download selected' }).click();
    await expect.poll(() => names.length, { timeout: 10_000 }).toBe(2);
    expect(new Set(names).size).toBe(2);
    await expect(status(page)).toHaveText('2 selected'); // downloading does not leave select mode
  });
});
