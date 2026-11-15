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

  // The app has one dark theme whatever the system setting is. The icon must stay readable either way:
  // it follows the button's text colour (light) and sits on a dark control bar.
  for (const scheme of ['light', 'dark'] as const) {
    test(`the icon stays readable with the system set to ${scheme} mode`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await installMocks(page, { camera: 'granted', location: 'granted' });
      await grantLocation(context);
      await mockGeocoder(page);
      await page.goto(`${SITE}/cam`);
      await expect(page.getByText('Champ de Mars, Paris, France')).toBeVisible();

      const button = page.getByRole('button', { name: 'Switch camera' });
      const [stroke, bar] = await Promise.all([
        button.locator('svg').evaluate(el => getComputedStyle(el).stroke),
        page.getByTestId('control-bar').evaluate(el => getComputedStyle(el).backgroundColor),
      ]);
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      // Blend the translucent bar over the dark page behind it (#111827).
      const barRgb = rgb(bar);
      const alpha = Number((bar.match(/[\d.]+/g) ?? [])[3] ?? 1);
      const behind = [17, 24, 39];
      const blended = barRgb.map((v, i) => v * alpha + behind[i] * (1 - alpha));
      const [l1, l2] = [lum(rgb(stroke)), lum(blended)].sort((a, b) => b - a);
      expect((l1 + 0.05) / (l2 + 0.05)).toBeGreaterThanOrEqual(3); // WCAG 1.4.11: 3:1 for UI graphics
    });
  }
});
