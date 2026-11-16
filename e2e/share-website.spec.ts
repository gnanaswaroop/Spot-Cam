/**
 * "Share this website": a link beside "How it works" that opens the system share window with one short
 * sentence and the site's address (a photo's own share message does not advertise the site).
 * Where sharing is not available it copies the link instead.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE } from './helpers';

type Shared = { title?: string; text?: string; url?: string; files?: unknown };

/** Replaces navigator.share (or removes it) and the clipboard, recording what the page sends. */
async function fakeSharing(page: Page, mode: 'works' | 'cancelled' | 'missing') {
  await page.addInitScript((m: string) => {
    const w = window as unknown as { __shared: Shared[]; __copied: string[] };
    w.__shared = [];
    w.__copied = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value:
        m === 'missing'
          ? undefined
          : async (data: Shared) => {
              w.__shared.push(data);
              if (m === 'cancelled') throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
            },
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void w.__copied.push(t) } });
  }, mode);
}

const recorded = <K extends '__shared' | '__copied'>(page: Page, key: K) =>
  page.evaluate(k => (window as unknown as Record<string, unknown[]>)[k], key);

test.describe('share this website', () => {
  test('is a button beside "How it works", on one line, at phone and desktop sizes', async ({ page }) => {
    for (const size of [{ width: 360, height: 640 }, { width: 320, height: 568 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(size);
      await page.goto(`${SITE}/`);
      const how = page.getByRole('link', { name: 'How it works' }).locator('visible=true');
      const share = page.getByRole('button', { name: 'Share this website' }).locator('visible=true');
      await expect(share).toHaveCount(1);
      const [h, s] = await Promise.all([how.boundingBox(), share.boundingBox()]);
      const label = `${size.width}x${size.height}`;
      expect(Math.abs(h!.y - s!.y), `${label}: same line as How it works`).toBeLessThan(4);
      expect(s!.x, label).toBeGreaterThan(h!.x);
      expect(s!.x + s!.width, label).toBeLessThanOrEqual(size.width);
    }
  });

  test('opens the share window with one short sentence and the site address, and no photo', async ({ page }) => {
    await fakeSharing(page, 'works');
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'Share this website' }).locator('visible=true').click();
    const [data] = (await recorded(page, '__shared')) as Shared[];
    expect(data.title).toBe('SpotCam');
    expect(data.text!.length).toBeLessThanOrEqual(100);
    expect(data.text).toMatch(/SpotCam/);
    expect(data.url).toBe(new URL('/', page.url()).href);
    expect(data.files).toBeUndefined();
    await expect(page.getByRole('status')).toHaveText('');
  });

  test('closing the share window is not an error', async ({ page }) => {
    await fakeSharing(page, 'cancelled');
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'Share this website' }).locator('visible=true').click();
    await expect.poll(async () => ((await recorded(page, '__shared')) as unknown[]).length).toBe(1);
    await expect(page.getByRole('status')).toHaveText('');
    expect(await recorded(page, '__copied')).toEqual([]);
  });

  test('copies the link and says so when the browser cannot share', async ({ page }) => {
    await fakeSharing(page, 'missing');
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'Share this website' }).locator('visible=true').click();
    await expect(page.getByRole('status')).toHaveText('Link copied');
    expect(await recorded(page, '__copied')).toEqual([new URL('/', page.url()).href]);
  });
});
