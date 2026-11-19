/**
 * Video: recording the camera with the stamp on every frame, with or without sound, the length limit, keeping videos
 * in the gallery next to the photos (filter, viewer, download, delete, storage meter) and the video settings.
 * The camera and the microphone are synthetic (see helpers.ts); the recording itself is the browser's real MediaRecorder.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, installMocks, grantLocation, mockGeocoder, setUpGrantedCamera, takePhotos } from './helpers';

/** Skips engines whose build cannot record a canvas (Playwright's WebKit on some platforms). */
async function skipIfCannotRecord(page: Page) {
  await page.goto('about:blank');
  const ok = await page.evaluate(() => typeof MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function');
  test.skip(!ok, 'This browser build has no MediaRecorder or canvas.captureStream, so it cannot record video');
}

/** Watches what each recording is made of, so a test can tell whether sound went in. */
async function spyOnRecorder(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __recordings: { audioTracks: number; videoTracks: number }[]; MediaRecorder: typeof MediaRecorder };
    w.__recordings = [];
    const Real = w.MediaRecorder;
    if (typeof Real !== 'function') return;
    w.MediaRecorder = class extends Real {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options);
        w.__recordings.push({ audioTracks: stream.getAudioTracks().length, videoTracks: stream.getVideoTracks().length });
      }
    } as typeof MediaRecorder;
    (w.MediaRecorder as unknown as { isTypeSupported: unknown }).isTypeSupported = Real.isTypeSupported.bind(Real);
  });
}
const recordings = (page: Page) => page.evaluate(() => (window as unknown as { __recordings: { audioTracks: number; videoTracks: number }[] }).__recordings);

/** Opens the camera in Video mode and records for `ms`, then stops. */
async function recordVideo(page: Page, ms = 1500) {
  await page.goto(`${SITE}/cam`);
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  const record = page.getByRole('button', { name: 'Record video' });
  await expect(record).toBeEnabled();
  await record.click();
  await expect(page.getByTestId('recording-timer')).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByRole('button', { name: 'Record video' })).toBeVisible();
}

const openGallery = async (page: Page) => {
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
};
const videoTile = (page: Page) => page.getByRole('button', { name: /^Open video taken/ });
const photoTile = (page: Page) => page.getByRole('button', { name: /^Open photo taken/ });

/** What is stored for the newest item: its record, and the size and type of its data. */
const newestStored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ meta: Record<string, unknown>; fullIsBlob: boolean; fullSize: number; fullType: string }>((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction('keyval').objectStore('keyval');
          const ids = store.get('spotcam-photo-ids');
          ids.onsuccess = () => {
            const id = (ids.result as string[])[0];
            const meta = store.get(`spotcam-photo:${id}`);
            const full = store.get(`spotcam-photo-full:${id}`);
            full.onsuccess = () => {
              const f = full.result as Blob | string;
              resolve({ meta: meta.result, fullIsBlob: f instanceof Blob, fullSize: f instanceof Blob ? f.size : String(f).length, fullType: f instanceof Blob ? f.type : 'string' });
            };
          };
        };
      }),
  );

test.describe('recording a video', () => {
  test('the camera offers Photo and Video, and the shutter follows the mode', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    const mode = page.getByRole('group', { name: 'Camera mode' });
    await expect(mode.getByRole('button', { name: 'Photo' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await mode.getByRole('button', { name: 'Video' }).click();
    await expect(mode.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Record video' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture photo' })).toHaveCount(0);
  });

  test('a recording is saved with its time, place and length, in the browser\'s own format', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await recordVideo(page);
    await openGallery(page);
    await expect(videoTile(page)).toHaveCount(1);
    await expect(page.getByTestId('video-badge')).toHaveText(/^0:0[1-9]$/);

    const stored = await newestStored(page);
    expect(stored.meta.kind).toBe('video');
    expect(String(stored.meta.mimeType)).toMatch(/^video\/(mp4|webm)$/);
    expect(stored.meta.bytes).toBeGreaterThan(0);
    expect(stored.meta.durationMs).toBeGreaterThan(1000);
    expect(stored.meta.location).toMatchObject({ latitude: expect.any(Number) });
    expect(stored.meta.dataUrl).toBeUndefined();
    expect(stored.fullIsBlob).toBe(true);
    expect(stored.fullSize).toBe(stored.meta.bytes);
    expect(stored.fullType).toBe(stored.meta.mimeType);

    await page.reload(); // and it is still there
    await expect(videoTile(page)).toHaveCount(1);
  });

  test('the stamp is drawn on the picture: the first frame in the gallery and a later frame in the video', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await recordVideo(page, 2500);
    await openGallery(page);

    // How much darker the band along the top is than the picture below it (the stamp sits on a dark band).
    const darkness = (src: CanvasImageSource, w: number, h: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(src, 0, 0, w, h);
      const luma = (y: number) => {
        const [r, g, b] = ctx.getImageData(2, y, 1, 1).data;
        return 0.3 * r + 0.6 * g + 0.1 * b;
      };
      return { top: luma(2), below: luma(h - 3) };
    };

    const first = await page.evaluate(async fn => {
      const thumb = document.querySelector<HTMLImageElement>('[data-testid="video-badge"]')!.parentElement!.querySelector('img')!;
      for (let i = 0; i < 100 && !(thumb.complete && thumb.naturalWidth > 0); i++) await new Promise(r => setTimeout(r, 50));
      return (new Function(`return (${fn})`)())(thumb, thumb.naturalWidth, thumb.naturalHeight);
    }, darkness.toString());
    expect(first.top).toBeLessThan(first.below * 0.7);

    // A frame from well into the recording, decoded from the stored video itself.
    const later = await page.evaluate(
      async fn => {
        const open = indexedDB.open('keyval-store');
        const db = await new Promise<IDBDatabase>((res, rej) => ((open.onsuccess = () => res(open.result)), (open.onerror = () => rej(open.error))));
        const store = db.transaction('keyval').objectStore('keyval');
        const ids = await new Promise<string[]>(res => ((store.get('spotcam-photo-ids').onsuccess = e => res((e.target as IDBRequest).result))));
        const blob = await new Promise<Blob>(res => ((store.get(`spotcam-photo-full:${ids[0]}`).onsuccess = e => res((e.target as IDBRequest).result))));
        const video = document.createElement('video');
        video.muted = true;
        video.src = URL.createObjectURL(blob);
        await video.play();
        await new Promise<void>((res, rej) => {
          const t = setTimeout(() => rej(new Error('the video did not play')), 15_000);
          video.ontimeupdate = () => video.currentTime > 1.2 && (clearTimeout(t), res());
        });
        return (new Function(`return (${fn})`)())(video, video.videoWidth, video.videoHeight);
      },
      darkness.toString(),
    );
    expect(later.top).toBeLessThan(later.below * 0.7);
  });
});

test.describe('sound', () => {
  test('a video is recorded with the microphone by default', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await spyOnRecorder(page);
    await setUpGrantedCamera(page, context);
    await recordVideo(page, 1000);
    expect(await recordings(page)).toEqual([{ audioTracks: 1, videoTracks: 1 }]);
    await expect(page.getByRole('status').filter({ hasText: 'without sound' })).toHaveCount(0);
  });

  test('with "Record sound" off the microphone is not asked for, and the video has no sound', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await spyOnRecorder(page);
    await setUpGrantedCamera(page, context);
    await page.addInitScript(() => localStorage.setItem('spotcam-settings', JSON.stringify({ recordSound: false })));
    await recordVideo(page, 1000);
    expect(await recordings(page)).toEqual([{ audioTracks: 0, videoTracks: 1 }]);
    expect(await page.evaluate(() => (window as unknown as { __mock: { asked: string[] } }).__mock.asked)).not.toContain('microphone');
  });

  test('if the microphone is refused the video is still recorded, without sound, and the person is told', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await spyOnRecorder(page);
    await installMocks(page, { camera: 'granted', location: 'granted', mic: 'denied' });
    await grantLocation(context);
    await mockGeocoder(page);
    await recordVideo(page, 1000);
    await expect(page.getByRole('status').filter({ hasText: 'Recording without sound' })).toBeVisible();
    expect(await recordings(page)).toEqual([{ audioTracks: 0, videoTracks: 1 }]);
    await openGallery(page);
    await expect(videoTile(page)).toHaveCount(1);
  });
});

test.describe('length', () => {
  test('the running time shows the limit (5 minutes by default), and the recording stops by itself at it', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await page.clock.install();
    await setUpGrantedCamera(page, context);
    await page.addInitScript(() => localStorage.setItem('spotcam-settings', JSON.stringify({ videoMaxMinutes: 1 })));
    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('button', { name: 'Record video' }).click();
    await expect(page.getByTestId('recording-timer')).toContainText('/ 1:00');
    await page.waitForTimeout(1500); // real time, so the recorder has frames before the limit is reached
    await page.clock.fastForward(61_000);
    await expect(page.getByRole('button', { name: 'Record video' })).toBeVisible();
    await openGallery(page);
    await expect(videoTile(page)).toHaveCount(1);
    expect((await newestStored(page)).meta.durationMs).toBeGreaterThanOrEqual(59_000);
  });

  test('the default limit is 5 minutes', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('button', { name: 'Record video' }).click();
    await expect(page.getByTestId('recording-timer')).toContainText('/ 5:00');
  });
});

test.describe('leaving while recording', () => {
  test('going to the gallery ends the recording and keeps it', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('button', { name: 'Record video' }).click();
    await expect(page.getByTestId('recording-timer')).toBeVisible();
    await page.waitForTimeout(1200);
    await openGallery(page);
    await expect(videoTile(page)).toHaveCount(1, { timeout: 10_000 });
  });
});

test.describe('videos in the gallery', () => {
  async function galleryWithOneOfEach(page: Page, context: Parameters<typeof setUpGrantedCamera>[1]) {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await recordVideo(page, 1200);
    await openGallery(page);
    await expect(photoTile(page)).toHaveCount(1);
    await expect(videoTile(page)).toHaveCount(1);
  }

  test('shows everything by default, and a filter shows only photos or only videos', async ({ page, context }) => {
    await galleryWithOneOfEach(page, context);
    const show = page.getByRole('group', { name: 'Show' });
    await expect(show.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

    await show.getByRole('button', { name: 'Photos' }).click();
    await expect(photoTile(page)).toHaveCount(1);
    await expect(videoTile(page)).toHaveCount(0);

    await show.getByRole('button', { name: 'Videos' }).click();
    await expect(videoTile(page)).toHaveCount(1);
    await expect(photoTile(page)).toHaveCount(0);

    await show.getByRole('button', { name: 'All' }).click();
    await expect(photoTile(page)).toHaveCount(1);
    await expect(videoTile(page)).toHaveCount(1);
  });

  test('the filter says so when there is nothing of that kind', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await openGallery(page);
    await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'Videos' }).click();
    await expect(page.getByText('No videos yet.')).toBeVisible();
  });

  test('the storage meter counts both, with the size of each kind', async ({ page, context }) => {
    await galleryWithOneOfEach(page, context);
    await expect(page.getByTestId('gallery-storage-usage')).toHaveText(/^1 photo, 1 video · \d+(\.\d)? (KB|MB) used \(videos \d+(\.\d)? (KB|MB)\)/);
    await expect(page.getByTestId('gallery-storage-note')).toContainText('photos and videos');
  });

  test('opening a video plays it from storage; Download saves it as a file of the recorded format', async ({ page, context }) => {
    await galleryWithOneOfEach(page, context);
    await videoTile(page).click();
    const dialog = page.getByRole('dialog', { name: 'Video' });
    const player = dialog.locator('video');
    await expect(player).toHaveAttribute('src', /^blob:/);
    await expect(player).toHaveJSProperty('controls', true);
    await expect.poll(() => player.evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download video' }).click();
    expect((await download).suggestedFilename()).toMatch(/^SpotCam_video_\d+\.(mp4|webm)$/);
  });

  test('swiping or the arrows move between a photo and a video', async ({ page, context }) => {
    await galleryWithOneOfEach(page, context);
    await videoTile(page).click();
    await expect(page.getByRole('dialog', { name: 'Video' })).toBeVisible();
    await page.getByRole('button', { name: 'Next photo' }).click();
    await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Previous video' }).click();
    await expect(page.getByRole('dialog', { name: 'Video' })).toBeVisible();
  });

  test('deleting a video asks about a video, and removes it for good', async ({ page, context }) => {
    await galleryWithOneOfEach(page, context);
    await videoTile(page).click();
    await page.getByRole('button', { name: 'Delete video' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm Deletion' })).toContainText('delete this video');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(videoTile(page)).toHaveCount(0);
    await expect(photoTile(page)).toHaveCount(1);
    await page.reload();
    await expect(videoTile(page)).toHaveCount(0);
    await expect(page.getByTestId('gallery-storage-usage')).toContainText('1 photo ·');
    // Its recording is gone from storage too.
    const keys = await page.evaluate(
      () =>
        new Promise<string[]>(res => {
          const open = indexedDB.open('keyval-store');
          open.onsuccess = () => {
            const req = open.result.transaction('keyval').objectStore('keyval').getAllKeys();
            req.onsuccess = () => res(req.result.map(String));
          };
        }),
    );
    expect(keys.filter(k => k.startsWith('spotcam-photo-full:'))).toHaveLength(1);
  });

  test('selecting works across photos and videos, and the question names what is deleted', async ({ page, context }) => {
    await galleryWithOneOfEach(page, context);
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await page.getByRole('button', { name: 'Select all' }).click();
    await page.getByRole('button', { name: 'Delete selected' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm Deletion' })).toContainText('delete these 2 items');
  });
});

test.describe('swiping on the video page', () => {
  test('a swipe over the video moves to the next and previous item, and the controls strip is left to the player', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await recordVideo(page, 1200);
    await openGallery(page);
    await videoTile(page).click(); // newest first: the video is first, the photo second
    const dialog = page.getByRole('dialog', { name: 'Video' });
    await expect(dialog.locator('video')).toHaveAttribute('src', /^blob:/);
    const box = (await dialog.locator('video').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 3;
    const drag = async (dx: number, fromY = y) => {
      await page.mouse.move(x, fromY);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, fromY, { steps: 4 });
      await page.mouse.move(x + dx, fromY, { steps: 4 });
      await page.mouse.up();
    };

    await drag(-150);
    await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible();
    await expect(page.getByText('Photo 2 of 2')).toBeVisible();
    await page.getByRole('dialog', { name: 'Photo' }).locator('img[alt^="Photo taken"]').waitFor();
    // Back to the video by swiping right over the photo, then try the controls strip: it does not swipe.
    const photoBox = (await page.getByRole('dialog', { name: 'Photo' }).locator('img[alt^="Photo taken"]').boundingBox())!;
    await page.mouse.move(photoBox.x + photoBox.width / 2, photoBox.y + photoBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(photoBox.x + photoBox.width / 2 + 75, photoBox.y + photoBox.height / 2, { steps: 4 });
    await page.mouse.move(photoBox.x + photoBox.width / 2 + 150, photoBox.y + photoBox.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Video' })).toBeVisible();
    const videoBox = (await page.getByRole('dialog', { name: 'Video' }).locator('video').boundingBox())!;
    await drag(-150, videoBox.y + videoBox.height - 20);
    await expect(page.getByRole('dialog', { name: 'Video' })).toBeVisible();
  });
});

test.describe('video settings', () => {
  test('are on by default, with a 5 minute limit', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/settings`);
    await expect(page.getByLabel('Record video')).toBeChecked();
    await expect(page.getByLabel('Record sound')).toBeChecked();
    await expect(page.getByLabel('Longest video')).toHaveValue('5');
  });

  test('turning video off takes the Video mode away from the camera, and it stays off after a reload', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/settings`);
    await page.getByLabel('Record video').uncheck();
    await expect(page.getByRole('status').filter({ hasText: 'only take photos' })).toBeVisible();
    await expect(page.getByLabel('Record sound')).toBeDisabled();
    await page.reload();
    await expect(page.getByLabel('Record video')).not.toBeChecked();
    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Camera mode' })).toHaveCount(0);
  });

  test('the sound and the length are saved, and the length is shown while recording', async ({ page, context }) => {
    await skipIfCannotRecord(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/settings`);
    await page.getByLabel('Record sound').uncheck();
    await page.getByLabel('Longest video').selectOption('10');
    await page.reload();
    await expect(page.getByLabel('Record sound')).not.toBeChecked();
    await expect(page.getByLabel('Longest video')).toHaveValue('10');
    await page.goto(`${SITE}/cam`);
    await page.getByRole('button', { name: 'Video', exact: true }).click();
    await page.getByRole('button', { name: 'Record video' }).click();
    await expect(page.getByTestId('recording-timer')).toContainText('/ 10:00');
  });
});

test.describe('a browser that cannot record', () => {
  test('only offers photos, and photos still work', async ({ page, context }) => {
    await page.addInitScript(() => {
      (window as unknown as { MediaRecorder?: unknown }).MediaRecorder = undefined;
    });
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await expect(page.getByRole('group', { name: 'Camera mode' })).toHaveCount(0);
    await openGallery(page);
    await expect(photoTile(page)).toHaveCount(1);
  });
});
