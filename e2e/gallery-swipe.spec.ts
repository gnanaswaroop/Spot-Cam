/**
 * The gallery: swipe (or use the arrows or keys) to move between photos without going back to the list, and
 * a heading for each day ("Today", "Yesterday", ...) over the photos taken that day.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Photo' });
const currentImg = (page: Page) => dialog(page).locator('img[alt^="Photo taken"]');
const counter = (page: Page) => dialog(page).getByText(/^Photo \d+ of \d+$/);

async function openGalleryWith(page: Page, context: Parameters<typeof setUpGrantedCamera>[1], count: number) {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, count);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
}

/** Drags across the picture the way a finger swipes: negative dx is a swipe to the left. */
async function swipe(page: Page, dx: number, dy = 0) {
  const box = (await currentImg(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

const openPhoto = (page: Page, n: number) => page.getByRole('button', { name: /^Open photo taken/ }).nth(n).click();

test.describe('swiping between photos', () => {
  test('swipe left for the next photo and right for the previous, without leaving the viewer', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await openPhoto(page, 0);
    await expect(counter(page)).toHaveText('Photo 1 of 3');

    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 2 of 3');
    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 3 of 3');
    await swipe(page, 150);
    await expect(counter(page)).toHaveText('Photo 2 of 3');
    await expect(dialog(page)).toBeVisible();
  });

  test('the photo moves with the finger, the neighbour is already beside it, and it settles back in the middle', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await openPhoto(page, 1);
    await expect(counter(page)).toHaveText('Photo 2 of 3');
    const shown = dialog(page).locator('img[alt^="Photo taken"]');
    const strip = shown.locator('xpath=../..');
    const left = async () => (await shown.boundingBox())!.x;
    const x0 = await left();

    const box = (await shown.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 6 });
    // While the finger is down the photo follows it, one for one, with no animation lagging behind.
    await expect.poll(async () => Math.round(x0 - (await left()))).toBeGreaterThan(80);
    expect(await strip.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
    // The next photo is already there, just off to the side.
    expect(await dialog(page).locator('img').count()).toBe(3);
    await page.mouse.up(); // let go before the swipe distance: it settles back
    await expect(counter(page)).toHaveText('Photo 2 of 3');
    await expect.poll(left).toBeCloseTo(x0, 0);

    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 3 of 3');
    // After the slide the strip is back in the middle, so the new photo sits where the last one did.
    await expect.poll(left).toBeCloseTo(x0, 0);
  });

  test('a short, fast flick is enough to move on', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await openPhoto(page, 0);
    // A 35px touch drag that starts and ends in the same instant: much shorter than a full swipe, but fast.
    await dialog(page).locator('img[alt^="Photo taken"]').evaluate(img => {
      const area = img.parentElement!.parentElement!.parentElement!; // the swipe area around the strip
      const r = img.getBoundingClientRect();
      const fire = (type: string, x: number) =>
        area.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, isPrimary: true }));
      const x = r.left + r.width / 2;
      fire('pointerdown', x);
      fire('pointermove', x - 35);
      fire('pointerup', x - 35);
    });
    await expect(counter(page)).toHaveText('Photo 2 of 2');
  });

  test('the photo details follow the photo that is shown', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    // What the list says each photo is, in list order (newest first).
    const listed = await page.getByRole('button', { name: /^Open photo taken/ }).evaluateAll(buttons =>
      buttons.map(b => (b.getAttribute('aria-label') ?? '').replace('Open photo', 'Photo')),
    );
    await openPhoto(page, 0);
    await expect(currentImg(page)).toHaveAttribute('alt', listed[0]);
    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 2 of 2');
    await expect(currentImg(page)).toHaveAttribute('alt', listed[1]);
  });

  test('there is nothing before the first or after the last photo', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await openPhoto(page, 0);
    await expect(dialog(page).getByRole('button', { name: 'Previous photo' })).toHaveCount(0);
    await swipe(page, 150); // a swipe the wrong way at the start does nothing
    await expect(counter(page)).toHaveText('Photo 1 of 2');
    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 2 of 2');
    await expect(dialog(page).getByRole('button', { name: 'Next photo' })).toHaveCount(0);
    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 2 of 2');
  });

  test('a short drag or a mostly vertical one does not change the photo', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    await openPhoto(page, 0);
    await swipe(page, -20);
    await swipe(page, -60, 150);
    await expect(counter(page)).toHaveText('Photo 1 of 2');
  });

  test('the arrow buttons and the arrow keys work too', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await openPhoto(page, 0);
    await dialog(page).getByRole('button', { name: 'Next photo' }).click();
    await expect(counter(page)).toHaveText('Photo 2 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('Photo 3 of 3');
    await page.keyboard.press('ArrowLeft');
    await expect(counter(page)).toHaveText('Photo 2 of 3');
    await dialog(page).getByRole('button', { name: 'Previous photo' }).click();
    await expect(counter(page)).toHaveText('Photo 1 of 3');
  });

  test('one Back closes the viewer however many photos were swiped through', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await openPhoto(page, 0);
    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 2 of 3'); // wait for the slide to finish
    await swipe(page, -150);
    await expect(counter(page)).toHaveText('Photo 3 of 3');
    await page.goBack();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
  });

  test('a single photo has no counter and no arrows', async ({ page, context }) => {
    await openGalleryWith(page, context, 1);
    await openPhoto(page, 0);
    await expect(counter(page)).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: /Next photo|Previous photo/ })).toHaveCount(0);
    await swipe(page, -150);
    await expect(dialog(page)).toBeVisible();
  });

  test('deleting from the viewer still works after swiping', async ({ page, context }) => {
    await openGalleryWith(page, context, 3);
    await openPhoto(page, 0);
    await swipe(page, -150);
    await dialog(page).getByRole('button', { name: 'Delete photo' }).click();
    await page.getByRole('dialog', { name: 'Confirm Deletion' }).getByRole('button', { name: 'Delete' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Open photo taken/ })).toHaveCount(2);
  });
});

test.describe('a heading for each day', () => {
  test('photos taken today are under "Today" with the date, and the viewer says so too', async ({ page, context }) => {
    await openGalleryWith(page, context, 2);
    const heading = page.getByRole('heading', { name: /^Today/, level: 2 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toContainText(/\d/); // the date follows the name
    await openPhoto(page, 0);
    await expect(dialog(page).getByText('Today')).toBeVisible();
  });

  test('the next day they are under "Yesterday"', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 2);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expect(page.getByRole('heading', { name: /^Today/, level: 2 })).toBeVisible();
    // Move the phone's clock a day on and look again.
    await page.clock.install({ time: Date.now() + 24 * 60 * 60 * 1000 });
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByRole('heading', { name: /^Yesterday/, level: 2 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /^Today/, level: 2 })).toHaveCount(0);
  });
});
