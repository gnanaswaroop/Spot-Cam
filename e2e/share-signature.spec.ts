/**
 * The line "Captured with <this site>" at the end of a shared photo's message: on by default, and switched off in
 * Settings. It is text in the message, not drawn on the photo.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, setUpGrantedCamera, takePhotos } from './helpers';

type Shared = { text?: string; files: number };

const recordShares = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __shared: Shared[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { text?: string; files?: File[] }) => {
        w.__shared.push({ text: data.text, files: data.files?.length ?? 0 });
      },
    });
  });

const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared);
const toggle = (page: Page) => page.getByRole('checkbox', { name: /to the message of a shared photo/ });
const hostOf = (page: Page) => page.evaluate(() => window.location.host);

async function sharePhoto(page: Page) {
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: /^Open photo taken/ }).first().click();
  await page.getByRole('dialog', { name: 'Photo' }).getByRole('button', { name: 'Share photo' }).click();
}

test.describe('"Captured with" line when sharing', () => {
  test.beforeEach(async ({ page, context }) => {
    await recordShares(page);
    await setUpGrantedCamera(page, context);
  });

  test('is added by default, as the last line, with the address the app is opened from', async ({ page }) => {
    await takePhotos(page, 1);
    await sharePhoto(page);
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    const [share] = await shared(page);
    const lines = share.text!.split('\n');
    expect(lines.at(-1)).toBe(`Captured with ${await hostOf(page)}`);
    expect(lines.at(-2)).toBe(''); // a blank line sets it apart
    expect(lines[0]).toMatch(/^Captured on /); // the usual message is still first
  });

  test('can be switched off in Settings, and then is not in the message', async ({ page }) => {
    await page.goto(`${SITE}/settings`);
    await expect(toggle(page)).toBeChecked();
    await expect(page.getByText(`Captured with ${await hostOf(page)}`)).toBeVisible(); // Settings shows what will be added
    await toggle(page).uncheck();
    await expect(page.getByRole('status').first()).toHaveText('Shared photos will no longer mention SpotCam.');

    await takePhotos(page, 1);
    await sharePhoto(page);
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    const [share] = await shared(page);
    expect(share.text).not.toContain('Captured with');
    expect(share.text).not.toContain(await hostOf(page));
  });

  test('the choice is remembered, and can be switched back on', async ({ page }) => {
    await page.goto(`${SITE}/settings`);
    await toggle(page).uncheck();
    await page.reload();
    await expect(toggle(page)).not.toBeChecked();
    await toggle(page).check();
    await expect(page.getByRole('status').first()).toHaveText('Shared photos will say where they were captured with.');
    await page.reload();
    await expect(toggle(page)).toBeChecked();
  });

  test('does not change the photo itself', async ({ page }) => {
    await takePhotos(page, 1);
    await sharePhoto(page);
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    expect((await shared(page))[0].files).toBe(1);
  });
});
