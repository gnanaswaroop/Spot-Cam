/** The switch-camera button: named for assistive tech, drawn with the flip-camera icon, enabled only with 2+ cameras. */
import { test, expect } from './fixtures';
import { SITE, installMocks, mockGeocoder, grantLocation } from './helpers';

test.describe('switch camera button', () => {
  test('has an accessible name and an inline flip-camera icon that follows the text colour', async ({ page, context }) => {
    await installMocks(page, { camera: 'granted', location: 'granted' });
    await grantLocation(context);
    await mockGeocoder(page);
    await page.goto(`${SITE}/cam`);
    await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();

    const button = page.getByRole('button', { name: 'Switch camera' });
    await expect(button).toBeVisible();
    const icon = button.locator('svg[data-icon="switch-camera"]');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).toHaveAttribute('stroke', 'currentColor');
    // Big enough to read and to tap.
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
