/**
 * Languages: the app follows the browser only when its preferred language is clear, the person can choose a language in
 * Settings (kept on this device, and winning over the browser), and the words load for every page.
 * Every expected label comes from the message catalogs (see messages.ts), and each test runs for every language the app has.
 */
import { test, expect } from './fixtures';
import { SITE } from './helpers';
import { ALL_LANGUAGE_NAMES, BROWSER_LOCALE, ENGLISH, OTHER_LANGUAGES, PRIVACY_POLICY_HEADING, UNSUPPORTED_BROWSER_LOCALE, say } from './messages';

const SETTINGS_KEY = 'spotcam-settings';

for (const { code, name } of OTHER_LANGUAGES) {
  test.describe(`the browser asks for ${name}`, () => {
    test.use({ locale: BROWSER_LOCALE[code] });

    test('with no choice made, the page is in that language', async ({ page }) => {
      await page.goto(`${SITE}/`);
      await expect(page.getByRole('link', { name: say(code, 'landing.start') })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page).toHaveTitle(say(code, 'title.landing'));
    });

    test('a language chosen in Settings wins over the browser, and stays after a reload', async ({ page }) => {
      await page.goto(`${SITE}/settings/`);
      await expect(page.getByRole('heading', { name: say(code, 'settings.title'), level: 1 })).toBeVisible();
      await page.getByRole('combobox', { name: say(code, 'settings.language.label') }).selectOption(ENGLISH);
      await expect(page.getByRole('heading', { name: say(ENGLISH, 'settings.title'), level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', ENGLISH);
      await page.reload();
      await expect(page.getByRole('heading', { name: say(ENGLISH, 'settings.title'), level: 1 })).toBeVisible();
    });
  });
}

test.describe('the browser asks for a language SpotCam does not have', () => {
  test.use({ locale: UNSUPPORTED_BROWSER_LOCALE });

  test('the page is in English', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('link', { name: say(ENGLISH, 'landing.start') })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', ENGLISH);
  });
});

test.describe('the browser asks for English', () => {
  test.use({ locale: BROWSER_LOCALE[ENGLISH] });

  test('Settings offers every language by its own name, starting on the current one', async ({ page }) => {
    await page.goto(`${SITE}/settings/`);
    const language = page.getByRole('combobox', { name: say(ENGLISH, 'settings.language.label') });
    await expect(language.locator('option')).toHaveText(ALL_LANGUAGE_NAMES);
    await expect(language).toHaveValue(ENGLISH);
  });

  for (const { code, name } of OTHER_LANGUAGES) {
    test(`choosing ${name} changes the page at once, is kept, and every page follows`, async ({ page }) => {
      await page.goto(`${SITE}/settings/`);
      await page.getByRole('combobox', { name: say(ENGLISH, 'settings.language.label') }).selectOption(code);
      await expect(page.getByRole('heading', { name: say(code, 'settings.title'), level: 1 })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: say(code, 'settings.language.saved', { name }) })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page).toHaveTitle(say(code, 'title.settings'));

      await page.reload();
      await expect(page.getByRole('heading', { name: say(code, 'settings.title'), level: 1 })).toBeVisible();

      await page.goto(`${SITE}/`);
      await expect(page.getByRole('link', { name: say(code, 'landing.start') })).toBeVisible();
      await page.goto(`${SITE}/how-it-works/`);
      await expect(page.getByRole('heading', { name: say(code, 'how.title'), level: 1 })).toBeVisible();
      await page.goto(`${SITE}/gallery/`);
      await expect(page.getByRole('heading', { name: say(code, 'gallery.title'), level: 1 })).toBeVisible();
      await expect(page.getByText(say(code, 'gallery.empty'))).toBeVisible();
    });

    test(`the privacy policy stays in English, and says so in ${name}`, async ({ page }) => {
      await page.addInitScript(([key, lang]) => localStorage.setItem(key, JSON.stringify({ language: lang })), [SETTINGS_KEY, code]);
      await page.goto(`${SITE}/privacy/`);
      await expect(page.getByRole('heading', { name: PRIVACY_POLICY_HEADING, level: 1 })).toBeVisible();
      await expect(page.getByText(say(code, 'privacy.englishOnly'))).toBeVisible();
    });
  }

  test('the settings gear on the landing page opens Settings', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: say(ENGLISH, 'camera.settings') }).click();
    await expect(page.getByRole('heading', { name: say(ENGLISH, 'settings.title'), level: 1 })).toBeVisible();
  });

  test('the landing page links to the language setting', async ({ page }) => {
    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: say(ENGLISH, 'landing.language') }).click();
    await expect(page.getByRole('heading', { name: say(ENGLISH, 'settings.title'), level: 1 })).toBeVisible();
    await expect(page.getByRole('combobox', { name: say(ENGLISH, 'settings.language.label') })).toBeVisible();
  });

  for (const { code } of OTHER_LANGUAGES) {
    test(`the landing page's language link is in ${code} when that language is chosen`, async ({ page }) => {
      await page.addInitScript(([key, lang]) => localStorage.setItem(key, JSON.stringify({ language: lang })), [SETTINGS_KEY, code]);
      await page.goto(`${SITE}/`);
      await page.getByRole('link', { name: say(code, 'landing.language') }).click();
      await expect(page.getByRole('heading', { name: say(code, 'settings.title'), level: 1 })).toBeVisible();
    });
  }

  test('an unknown saved language is ignored', async ({ page }) => {
    await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ language: 'tlh' })), SETTINGS_KEY);
    await page.goto(`${SITE}/`);
    await expect(page.getByRole('link', { name: say(ENGLISH, 'landing.start') })).toBeVisible();
  });
});
