/**
 * Coming back to the app after it sat in the background: the phone may have paused the camera or ended its
 * track, which used to leave a frozen preview until the camera was switched. The camera must open again by
 * itself, and must be left alone when it is fine. The fake camera records every open (see helpers.ts).
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder, skipIfNoCameraFrames, type MockController } from './helpers';

async function openCamera(page: Page, context: Parameters<typeof grantLocation>[0]) {
  await skipIfNoCameraFrames(page);
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
  await mockGeocoder(page);
  await page.goto(`${SITE}/cam`);
  await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
}

const opens = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mock: MockController }).__mock.constraints.length);
const liveTracks = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __fakeTracks?: MediaStreamTrack[] }).__fakeTracks ?? []).filter(t => t.readyState === 'live').length);

/** What a phone does to a camera in the background: the track ends (stop() does not fire the event itself). */
const endTrack = (page: Page) =>
  page.evaluate(() => {
    const tracks = (window as unknown as { __fakeTracks: MediaStreamTrack[] }).__fakeTracks;
    const track = tracks[tracks.length - 1];
    track.stop();
    track.dispatchEvent(new Event('ended'));
  });

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

test.describe('camera after the app was in the background', () => {
  test('opens again by itself when the camera ended while we were looking at it', async ({ page, context }) => {
    await openCamera(page, context);
    expect(await opens(page)).toBe(1);
    await endTrack(page);
    await expect.poll(() => opens(page)).toBe(2);
    await expect.poll(() => liveTracks(page)).toBe(1); // the new camera is live, the old one is gone
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  test('waits while the app is hidden, then opens again as soon as it comes back', async ({ page, context }) => {
    await openCamera(page, context);
    await setHidden(page, true);
    await endTrack(page);
    await page.waitForTimeout(600);
    expect(await opens(page)).toBe(1); // no camera is opened behind the user's back
    await setHidden(page, false);
    await expect.poll(() => opens(page)).toBe(2);
    await expect.poll(() => liveTracks(page)).toBe(1);
  });

  test('a camera that is still fine is left alone', async ({ page, context }) => {
    await openCamera(page, context);
    await setHidden(page, true);
    await setHidden(page, false);
    await page.waitForTimeout(2000); // longer than the check delay
    expect(await opens(page)).toBe(1);
    expect(await liveTracks(page)).toBe(1);
  });

  test('a paused preview is started again without reopening the camera', async ({ page, context }) => {
    await openCamera(page, context);
    await page.evaluate(() => document.querySelector('video')!.pause());
    await setHidden(page, true);
    await setHidden(page, false);
    await expect.poll(() => page.evaluate(() => document.querySelector('video')!.paused)).toBe(false);
    await page.waitForTimeout(1800);
    expect(await opens(page)).toBe(1);
  });

  test('a picture that stopped moving (frozen frame) is reopened', async ({ page, context }) => {
    await openCamera(page, context);
    // The preview reports the same playback time every time it is asked: no new frames are arriving.
    await page.evaluate(() => Object.defineProperty(document.querySelector('video')!, 'currentTime', { configurable: true, get: () => 5 }));
    await setHidden(page, true);
    await setHidden(page, false);
    await expect.poll(() => opens(page), { timeout: 5000 }).toBe(2);
    await expect.poll(() => liveTracks(page)).toBe(1);
  });

  test('coming back several times quickly opens the camera once', async ({ page, context }) => {
    await openCamera(page, context);
    await endTrack(page);
    await setHidden(page, true);
    await setHidden(page, false);
    await setHidden(page, true);
    await setHidden(page, false);
    await expect.poll(() => opens(page)).toBe(2);
    await page.waitForTimeout(1800);
    expect(await opens(page)).toBe(2);
  });
});
