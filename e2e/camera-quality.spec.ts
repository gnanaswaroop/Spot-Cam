/**
 * How the camera is asked for its picture: a large 4:3 stream (a small default stream looks noisy once
 * stretched over a phone screen), automatic focus and exposure, and always opening at 1x zoom.
 * The fake camera reports a zoom range and records every constraint the page applies.
 */
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder, skipIfNoCameraFrames, type MockController } from './helpers';

type Zoom = NonNullable<Parameters<typeof installMocks>[1]['zoom']>;

async function openCamera(page: Page, context: Parameters<typeof grantLocation>[0], zoom?: Zoom, noFacingMode = false, cameras = 1) {
  await skipIfNoCameraFrames(page);
  await installMocks(page, { camera: 'granted', location: 'granted', zoom, noFacingMode, cameras });
  await grantLocation(context);
  await mockGeocoder(page);
  await page.goto(`${SITE}/cam`);
  await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
}

const mock = <K extends keyof MockController>(page: Page, key: K) =>
  page.evaluate(k => (window as unknown as { __mock: MockController }).__mock[k], key);

test.describe('camera stream', () => {
  test('asks for a large 4:3 picture at 30 fps, with the chosen camera and no audio', async ({ page, context }) => {
    await openCamera(page, context);
    const [first] = (await mock(page, 'constraints')) as Array<{ video: Record<string, any>; audio: boolean }>;
    expect(first.audio).toBe(false);
    expect(first.video.facingMode).toEqual({ exact: 'environment' });
    expect(first.video.width.ideal).toBeGreaterThanOrEqual(1920);
    expect(first.video.height.ideal).toBeGreaterThanOrEqual(1440);
    expect(first.video.aspectRatio.ideal).toBeCloseTo(4 / 3, 3);
    expect(first.video.frameRate.ideal).toBe(30);
    // The size and shape are ideals only: an "exact" size would make cameras that cannot do it fail to open.
    expect(JSON.stringify({ ...first.video, facingMode: undefined })).not.toMatch(/exact/);
  });

  test('asks for the rear camera exactly, so the front camera is never picked for fitting the size better', async ({ page, context }) => {
    await openCamera(page, context);
    const constraints = (await mock(page, 'constraints')) as Array<{ video: Record<string, any> }>;
    expect(constraints).toHaveLength(1);
    expect(constraints[0].video.facingMode).toEqual({ exact: 'environment' });
  });

  test('the switch button asks for the front camera exactly, and back again for the rear one', async ({ page, context }) => {
    await openCamera(page, context, undefined, false, 2);
    const toggle = page.getByRole('button', { name: /switch camera/i });
    await toggle.click();
    await expect.poll(async () => ((await mock(page, 'constraints')) as unknown[]).length).toBe(2);
    await toggle.click();
    await expect.poll(async () => ((await mock(page, 'constraints')) as unknown[]).length).toBe(3);
    const facings = ((await mock(page, 'constraints')) as Array<{ video: { facingMode: unknown } }>).map(c => c.video.facingMode);
    expect(facings).toEqual([{ exact: 'environment' }, { exact: 'user' }, { exact: 'environment' }]);
  });

  test('a device with no camera facing that way (a laptop) still opens, by asking again without "exact"', async ({ page, context }) => {
    await openCamera(page, context, undefined, true);
    const constraints = (await mock(page, 'constraints')) as Array<{ video: { facingMode: unknown } }>;
    expect(constraints.map(c => c.video.facingMode)).toEqual([{ exact: 'environment' }, 'environment']);
    await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled();
  });

  test('turns on automatic focus, exposure and white balance when the camera supports them', async ({ page, context }) => {
    await openCamera(page, context, { min: 1, max: 5, step: 0.1, initial: 1 });
    await expect.poll(async () => JSON.stringify(await mock(page, 'applied'))).toContain('continuous');
    const applied = JSON.stringify(await mock(page, 'applied'));
    for (const mode of ['focusMode', 'exposureMode', 'whiteBalanceMode']) expect(applied).toContain(mode);
  });

  test('asks for no focus or exposure changes when the camera reports none', async ({ page, context }) => {
    await openCamera(page, context);
    await page.waitForTimeout(300);
    expect(JSON.stringify(await mock(page, 'applied'))).not.toContain('continuous');
  });
});

test.describe('zoom opens at 1x', () => {
  const slider = (page: Page) => page.getByRole('slider', { name: 'ZOOM' });

  test('even when the camera starts at a different zoom', async ({ page, context }) => {
    await openCamera(page, context, { min: 0.6, max: 8, step: 0.1, initial: 2 });
    await expect(slider(page)).toHaveValue('1');
    await expect(page.getByText('1.0x', { exact: true })).toBeVisible();
    await expect.poll(async () => JSON.stringify(await mock(page, 'applied'))).toContain('{"advanced":[{"zoom":1}]}');
  });

  test('at the closest value when the camera cannot go down to 1x', async ({ page, context }) => {
    await openCamera(page, context, { min: 1.5, max: 6, step: 0.1, initial: 3 });
    await expect(slider(page)).toHaveValue('1.5');
    await expect(page.getByText('1.5x', { exact: true })).toBeVisible();
    await expect.poll(async () => JSON.stringify(await mock(page, 'applied'))).toContain('{"advanced":[{"zoom":1.5}]}');
  });

  test('the plus and minus buttons move one step from 1x', async ({ page, context }) => {
    await openCamera(page, context, { min: 1, max: 5, step: 0.5, initial: 2 });
    await expect(slider(page)).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(slider(page)).toHaveValue('1.5');
    await expect.poll(async () => JSON.stringify(await mock(page, 'applied'))).toContain('{"advanced":[{"zoom":1.5}]}');
  });

  test('no zoom control when the camera cannot zoom', async ({ page, context }) => {
    await openCamera(page, context);
    await expect(slider(page)).toHaveCount(0);
  });
});
