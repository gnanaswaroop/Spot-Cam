/**
 * Regenerates the README screenshots in docs/screenshots/ from the real, built site.
 *
 *   npm run screenshots
 *
 * Not part of `npm run test:e2e` (see playwright.screenshots.config.ts). The camera feed is mocked
 * with e2e/fixtures/scene.jpg so the shots are deterministic and need no real camera or location.
 */
import { test, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { SITE, installMocks, grantLocation, mockGeocoder, takePhotos } from './helpers';

const OUT = path.resolve(process.cwd(), 'docs/screenshots');
const SCENE = path.resolve(process.cwd(), 'e2e/fixtures/scene.jpg');

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

/** A phone-sized, high-DPI viewport. */
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

/** Camera feed: slowly panning crop of SCENE (portrait), so each photo differs a little. */
async function sceneCamera(page: Page) {
  await page.route('**/__scene.jpg', r => r.fulfill({ path: SCENE, contentType: 'image/jpeg' }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image();
      img.src = '/__scene.jpg';
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 960;
      const ctx = canvas.getContext('2d')!;
      let t = 0;
      const draw = () => {
        t += 0.6;
        const sx = 200 + 120 * Math.sin(t);
        ctx.drawImage(img, sx, 0, 720, 960, 0, 0, 720, 960);
      };
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  });
}

async function setUp(page: Page, context: import('@playwright/test').BrowserContext) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await sceneCamera(page);
  await grantLocation(context);
  await mockGeocoder(page);
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name) });

test('landing', async ({ page }) => {
  await page.goto(`${SITE}/`);
  await page.getByRole('button', { name: 'Start Cam' }).waitFor();
  await shot(page, '01-landing.png');
});

test('sample viewer', async ({ page }) => {
  await page.goto(`${SITE}/`);
  await page.getByRole('button', { name: 'View a sample photo' }).click();
  await page.getByRole('dialog', { name: 'Sample photo' }).waitFor();
  await shot(page, '02-sample.png');
});

test('camera', async ({ page, context }) => {
  await setUp(page, context);
  await page.goto(`${SITE}/cam`);
  await page.getByText('Champ de Mars, Paris, France').waitFor();
  await page.waitForTimeout(600);
  await shot(page, '03-camera.png');
});

test('gallery and photo viewer', async ({ page, context }) => {
  await setUp(page, context);
  await takePhotos(page, 4);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await page.getByRole('button', { name: /^Open photo taken/ }).first().waitFor();
  await shot(page, '04-gallery.png');
  await page.getByRole('button', { name: /^Open photo taken/ }).first().click();
  await page.getByRole('dialog', { name: 'Photo' }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, '05-photo.png');
});

test('permission blocked', async ({ page, context }) => {
  await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
  await grantLocation(context);
  await mockGeocoder(page);
  await page.goto(`${SITE}/cam`);
  await page.getByRole('alert').waitFor();
  await shot(page, '06-permission-blocked.png');
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  test('landing on desktop', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('button', { name: 'Start Cam' }).waitFor();
    await shot(page, '07-landing-desktop.png');
  });
});
