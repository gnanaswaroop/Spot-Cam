/**
 * Automated accessibility checks (axe-core, WCAG 2.2 A/AA rules) on every page and state.
 * Serious and critical violations fail the build. Automated checks catch only part of the problem;
 * the keyboard and screen-reader behaviour is covered by e2e/a11y-behaviour.spec.ts.
 */
import AxeBuilder from '@axe-core/playwright';
import { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { SITE, skipIfNoCameraFrames, installMocks, mockGeocoder, grantLocation, setUpGrantedCamera, takePhotos } from './helpers';

async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).join(' | ')})`), label).toEqual([]);
}

test.describe('axe accessibility checks', () => {
  test('landing page and the sample photo viewer', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('button', { name: /start cam/i })).toBeVisible();
    await expectNoSeriousViolations(page, 'landing');
    await page.getByRole('button', { name: /sample photo/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousViolations(page, 'sample viewer');
  });

  test('privacy page', async ({ page }) => {
    await page.goto(`${SITE}/privacy`);
    await expect(page.getByText('Last updated:')).toBeVisible();
    await expectNoSeriousViolations(page, 'privacy');
  });

  test('camera page, everything allowed', async ({ page, context }) => {
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await mockGeocoder(page);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();
    await expectNoSeriousViolations(page, 'camera');
  });

  test('camera page, camera blocked', async ({ page, context }) => {
    await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
    await grantLocation(context);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Camera access is blocked')).toBeVisible();
    await expectNoSeriousViolations(page, 'camera blocked');
  });

  test('camera page, location blocked', async ({ page, context }) => {
    await skipIfNoCameraFrames(page); // the location notice only shows once the camera itself works
    await installMocks(page, { camera: 'granted', location: 'denied', permissionStates: { geolocation: 'denied' } });
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Location access is blocked')).toBeVisible();
    await expectNoSeriousViolations(page, 'location blocked');
  });

  test('gallery: empty, grid, viewer and delete dialog', async ({ page, context }) => {
    await page.goto(`${SITE}/gallery`);
    await expect(page.getByText('No photos yet.')).toBeVisible();
    await expectNoSeriousViolations(page, 'gallery empty');

    await setUpGrantedCamera(page, context);
    await takePhotos(page, 2);
    await page.getByRole('button', { name: 'Open gallery' }).click();
    await expectNoSeriousViolations(page, 'gallery grid');
    await page.getByRole('button', { name: /open photo/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible();
    await expectNoSeriousViolations(page, 'photo viewer');
    await page.getByRole('button', { name: 'Delete photo' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm Deletion' })).toBeVisible();
    await expectNoSeriousViolations(page, 'delete dialog');
  });
});
