/** Keyboard and screen-reader behaviour that automated axe checks cannot see. */
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, skipIfNoCameraFrames, takePhotos } from './helpers';

test.describe('page titles', () => {
  for (const [path, title] of [
    ['/', 'Free Online Timestamp Camera with GPS Location | SpotCam'],
    ['/cam', 'Camera | SpotCam'],
    ['/gallery', 'Gallery | SpotCam'],
    ['/privacy', 'Privacy Policy | SpotCam'],
    ['/settings', 'Settings | SpotCam'],
    ['/how-it-works', /How SpotCam works/],
  ] as const) {
    test(`${path} has its own title`, async ({ page }) => {
      await page.goto(`${SITE}${path}`);
      await expect(page).toHaveTitle(title);
    });
  }

  test('the title follows in-app navigation', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveTitle('Privacy Policy | SpotCam');
  });
});

test.describe('landing sample viewer with the keyboard', () => {
  test('opens with focus inside, traps Tab, closes on Esc and returns focus to the trigger', async ({ page }) => {
    await page.goto(`${SITE}/`);
    const trigger = page.getByRole('button', { name: 'View a sample photo' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Sample photo' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close sample' })).toBeFocused();

    // Tab cycles between the buttons and never leaves the dialog.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('gallery with the keyboard', () => {
  test('thumbnails are buttons; the viewer and delete dialog trap focus, close on Esc and restore focus', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 2);
    await page.getByRole('button', { name: 'Open gallery' }).click();

    const thumbs = page.getByRole('button', { name: /^Open photo taken/ });
    await expect(thumbs).toHaveCount(2);
    // The name carries the date and place, because the stamp is drawn into the pixels.
    await expect(thumbs.first()).toHaveAccessibleName(/Champ de Mars, Paris, France/);

    await thumbs.first().focus();
    await page.keyboard.press('Enter');
    const viewer = page.getByRole('dialog', { name: 'Photo' });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Close photo view' })).toBeFocused();

    // Delete confirmation opens on top; Esc cancels it only, and focus goes back to the Delete button.
    await viewer.getByRole('button', { name: 'Delete photo' }).focus();
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('dialog', { name: 'Confirm Deletion' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[aria-labelledby="dialog-title"]'))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Delete photo' })).toBeFocused();

    // Esc closes the viewer and focus returns to the thumbnail that opened it.
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await expect(thumbs.first()).toBeFocused();
  });

  test('the photo in the viewer has a text description with date and place', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await page.getByRole('button', { name: /^Open photo taken/ }).click();
    await expect(page.getByRole('dialog', { name: 'Photo' }).getByRole('img')).toHaveAccessibleName(/Photo taken .* at Champ de Mars, Paris, France/);
  });
});

test.describe('camera page for screen readers', () => {
  test('has a main landmark, a labelled preview and announces the address and each saved photo', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('video')).toHaveAttribute('aria-label', 'Live camera preview');

    const status = page.getByRole('status');
    await expect(status).toHaveText('Address found');
    await page.getByRole('button', { name: 'Capture photo' }).click();
    await expect(status).toHaveText('Photo saved to the gallery');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Capture photo' }).click();
    // Different text each time, so a second photo is announced again.
    await expect(status).toHaveText('Photo saved to the gallery.');
  });

  test('controls are reachable with Tab and show a visible focus ring', async ({ page, context }) => {
    await skipIfNoCameraFrames(page);
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    const capture = page.getByRole('button', { name: 'Capture photo' });
    await expect(capture).toBeEnabled();
    await page.getByRole('button', { name: 'SpotCam home' }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
      }));
      await page.keyboard.press('Tab');
    }
    expect(seen).toContain('Open gallery');
    expect(seen).toContain('Capture photo');

    await capture.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // keyboard navigation, so :focus-visible applies
    await expect(capture).toBeFocused();
    const ring = await capture.evaluate(el => ({ style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });
});

test.describe('reduced motion', () => {
  test('transitions are switched off when the user asks for it', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setUpGrantedCamera(page, context);
    await page.goto(`${SITE}/cam`);
    const duration = await page.getByRole('button', { name: 'Open gallery' }).evaluate(el => getComputedStyle(el).transitionDuration);
    expect(Math.max(...duration.split(',').map(parseFloat))).toBeLessThan(0.001);
  });
});

test.describe('touch targets', () => {
  test('gallery and viewer controls are at least 44x44 px', async ({ page, context }) => {
    await setUpGrantedCamera(page, context);
    await takePhotos(page, 1);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    const back = (await page.getByRole('button', { name: 'Back to camera' }).boundingBox())!;
    expect(Math.min(back.width, back.height)).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: /^Open photo taken/ }).click();
    for (const name of ['Close photo view', 'Share photo', 'Delete photo']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!;
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('reflow and large text', () => {
  // 320 CSS px wide is what a 1280 px window looks like at 400% zoom (WCAG 1.4.10); 200% text on a phone is similar.
  test('the landing page keeps its main actions reachable at 320x256', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await page.goto(`${SITE}/`);
    // The page may scroll vertically at this size (nothing may be clipped out of reach), never sideways.
    for (const target of [page.getByRole('heading', { name: 'SpotCam' }), page.getByRole('link', { name: /start cam/i })]) {
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the privacy page scrolls vertically only at 320 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${SITE}/privacy`);
    await expect(page.getByText('Last updated:')).toBeVisible();
    expect(await page.evaluate(() => {
      const el = document.querySelector('main')!.parentElement!;
      return el.scrollWidth <= el.clientWidth + 1;
    })).toBe(true);
  });

  test('headings are in order on every page', async ({ page }) => {
    for (const path of ['/', '/privacy', '/gallery', '/how-it-works']) {
      await page.goto(`${SITE}${path}`);
      await expect(page.locator('h1').first()).toBeVisible();
      const levels = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map(h => Number(h.tagName[1])));
      expect(levels[0], path).toBe(1);
      expect(levels.filter(l => l === 1).length, path).toBe(1);
      levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1], path).toBeLessThanOrEqual(1); });
    }
  });
});
