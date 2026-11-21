/**
 * Every screen shows its words in every language the app has: the landing page, How it works, Settings, the camera
 * (with the camera allowed and with it blocked), the gallery (empty and with photos) and the privacy page.
 * The expected words come from the message catalogs (see messages.ts), never from this file, so a changed or added
 * translation changes what is looked for, and a new language is covered with no edit here.
 */
import { test, expect } from './fixtures';
import { SITE, grantLocation, installMocks, mockGeocoder, setUpGrantedCamera, skipIfNoCameraFrames } from './helpers';
import { BROWSER_LOCALE, DIRECTION, PRIVACY_POLICY_HEADING, plain, say, sayCount } from './messages';
import { LANGUAGES, type LanguageCode } from '../utils/i18n';

const SETTINGS_KEY = 'spotcam-settings';

/** The first copy of something that is on screen (the landing page has a desktop and a phone copy of its buttons, one of them hidden). */
const shown = (locator: import('@playwright/test').Locator) => locator.locator('visible=true').first();

/** Starts the page with the language already chosen in Settings, as a returning visitor would have it. */
const chooseLanguage = (page: import('@playwright/test').Page, code: LanguageCode) =>
  page.addInitScript(([key, lang]) => localStorage.setItem(key, JSON.stringify({ language: lang })), [SETTINGS_KEY, code]);

/** The page declares its language and direction (right to left for Arabic and Urdu). */
const expectDeclared = async (page: import('@playwright/test').Page, code: LanguageCode) => {
  await expect(page.locator('html')).toHaveAttribute('lang', code);
  await expect(page.locator('html')).toHaveAttribute('dir', DIRECTION(code));
};

for (const { code, name } of LANGUAGES) {
  test.describe(`${name} (${code})`, () => {
    test.use({ locale: BROWSER_LOCALE[code] });

    test('the landing page', async ({ page }) => {
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/`);
      await expectDeclared(page, code);
      await expect(page).toHaveTitle(say(code, 'title.landing'));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(plain(say(code, 'landing.hero')));
      await expect(page.getByText(say(code, 'tagline'), { exact: true })).toBeVisible();
      for (const key of ['landing.feature1', 'landing.feature2', 'landing.feature3'] as const) {
        await expect(page.getByText(say(code, key), { exact: true }).first()).toBeVisible();
      }
      await expect(shown(page.getByText(say(code, 'landing.needs'), { exact: true }))).toBeVisible();
      for (const key of ['landing.start', 'landing.privacy', 'landing.how', 'landing.language'] as const) {
        await expect(shown(page.getByRole('link', { name: say(code, key) }))).toBeVisible();
      }
      await expect(shown(page.getByRole('button', { name: say(code, 'landing.shareSite') }))).toBeVisible();
      await expect(page.getByRole('link', { name: say(code, 'camera.settings') })).toBeVisible();
    });

    test('longer words do not break a small phone screen (360 x 640): Start is on screen, and no page is wider than the screen', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/`);
      await expect(shown(page.getByRole('link', { name: say(code, 'landing.start') }))).toBeInViewport({ ratio: 1 });
      for (const path of ['/', '/how-it-works/', '/settings/', '/gallery/', '/cam', '/privacy/']) {
        await page.goto(`${SITE}${path}`);
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
        expect(scrollWidth, `${path} is wider than the screen`).toBeLessThanOrEqual(innerWidth);
      }
    });

    test('the sample photo', async ({ page }) => {
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/`);
      await page.getByRole('button', { name: say(code, 'landing.viewSample') }).click();
      const dialog = page.getByRole('dialog', { name: say(code, 'sample.dialog') });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(say(code, 'sample.place'), { exact: true })).toBeVisible();
      await expect(dialog.getByText(say(code, 'sample.hint'), { exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: say(code, 'sample.share') })).toBeVisible();
      await expect(dialog.getByRole('button', { name: say(code, 'sample.close') })).toBeVisible();
    });

    test('How it works', async ({ page }) => {
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/how-it-works/`);
      await expectDeclared(page, code);
      await expect(page).toHaveTitle(say(code, 'title.howItWorks'));
      await expect(page.getByRole('heading', { name: say(code, 'how.title'), level: 1 })).toBeVisible();
      await expect(page.getByText(say(code, 'how.intro'), { exact: true })).toBeVisible();
      for (const key of ['how.stepsHeading', 'how.useHeading', 'how.faqHeading'] as const) {
        await expect(page.getByRole('heading', { name: say(code, key), exact: true })).toBeVisible();
      }
      // A step or a use is shown as a bold title and its text in one list item.
      for (const n of [1, 2, 3] as const) {
        await expect(page.getByRole('listitem').filter({ hasText: say(code, `how.step${n}.title`) }).filter({ hasText: say(code, `how.step${n}.text`) })).toBeVisible();
      }
      for (const n of [1, 2, 3, 4] as const) {
        await expect(page.getByRole('listitem').filter({ hasText: say(code, `how.use${n}.title`) }).filter({ hasText: say(code, `how.use${n}.text`) })).toBeVisible();
      }
      for (const n of [1, 2, 3, 4, 5] as const) {
        await expect(page.getByText(say(code, `how.faq${n}.q`), { exact: true })).toBeVisible();
        await expect(page.getByText(say(code, `how.faq${n}.a`), { exact: true })).toBeVisible();
      }
      await expect(page.getByRole('link', { name: say(code, 'how.back') })).toBeVisible();
      await expect(page.getByRole('link', { name: say(code, 'landing.start') })).toBeVisible();
    });

    test('Settings', async ({ page }) => {
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/settings/`);
      await expectDeclared(page, code);
      await expect(page).toHaveTitle(say(code, 'title.settings'));
      await expect(page.getByRole('heading', { name: say(code, 'settings.title'), level: 1, exact: true })).toBeVisible();
      for (const key of [
        'settings.language.heading',
        'settings.cache.heading',
        'settings.radius.heading',
        'settings.maps.heading',
        'settings.signature.heading',
        'settings.video.heading',
        'settings.keep.heading',
        'settings.photos.heading',
      ] as const) {
        await expect(page.getByRole('heading', { name: say(code, key), level: 2, exact: true })).toBeVisible();
      }
      for (const key of [
        'settings.language.text',
        'settings.cache.text',
        'settings.radius.text',
        'settings.maps.text',
        'settings.keep.text',
        'settings.photos.none',
      ] as const) {
        await expect(page.getByText(say(code, key), { exact: true })).toBeVisible();
      }
      await expect(page.getByRole('combobox', { name: say(code, 'settings.language.label'), exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: say(code, 'settings.cache.clear') })).toBeVisible();
      await expect(page.getByRole('button', { name: say(code, 'settings.radius.save'), exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: say(code, 'header.back') }).or(page.getByRole('button', { name: say(code, 'header.back') })).first()).toBeVisible();
    });

    test('the privacy page keeps its English text and says so in this language', async ({ page }) => {
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/privacy/`);
      await expect(page.getByRole('heading', { name: PRIVACY_POLICY_HEADING, level: 1 })).toBeVisible();
      await expect(page.locator('main')).toHaveAttribute('dir', 'ltr');
      if (code === 'en') await expect(page.getByText(say(code, 'privacy.englishOnly'))).toHaveCount(0);
      else await expect(page.getByText(say(code, 'privacy.englishOnly'), { exact: true })).toBeVisible();
    });

    test('the camera when the camera is blocked, with the steps to turn it back on', async ({ page, context }) => {
      await installMocks(page, { camera: 'denied', location: 'granted', permissionStates: { camera: 'denied' } });
      await grantLocation(context);
      await mockGeocoder(page);
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/cam`);
      await expectDeclared(page, code);
      await expect(page).toHaveTitle(say(code, 'title.camera'));
      const notice = page.getByRole('alert');
      await expect(notice).toContainText(say(code, 'camera.issue.denied.title'));
      await expect(notice.getByText(say(code, 'camera.issue.denied.textBlocked'), { exact: true })).toBeVisible();
      await expect(notice.getByRole('button', { name: say(code, 'common.reloadPage') })).toBeVisible();
      await expect(notice.getByText(say(code, 'perm.howToCamera'), { exact: true })).toBeVisible();
    });

    test('the camera when it works: its buttons and what it says about the place', async ({ page, context }) => {
      await skipIfNoCameraFrames(page);
      await setUpGrantedCamera(page, context);
      await chooseLanguage(page, code);
      await page.goto(`${SITE}/cam`);
      await expectDeclared(page, code);
      await expect(page.getByRole('button', { name: say(code, 'camera.capture') })).toBeEnabled();
      await expect(page.getByRole('button', { name: say(code, 'camera.openGallery') })).toBeVisible();
      await expect(page.getByRole('button', { name: say(code, 'camera.settings') })).toBeVisible();
      await expect(page.getByRole('button', { name: say(code, 'camera.home') })).toBeVisible();
    });

    test('the gallery when it is empty, and with photos', async ({ page, context }) => {
      await skipIfNoCameraFrames(page);
      await setUpGrantedCamera(page, context);
      await chooseLanguage(page, code);

      await page.goto(`${SITE}/gallery/`);
      await expectDeclared(page, code);
      await expect(page).toHaveTitle(say(code, 'title.gallery'));
      await expect(page.getByRole('heading', { name: say(code, 'gallery.title'), level: 1 })).toBeVisible();
      await expect(page.getByText(say(code, 'gallery.empty'), { exact: true })).toBeVisible();
      await expect(page.getByText(say(code, 'gallery.emptyHint'), { exact: true })).toBeVisible();

      await page.goto(`${SITE}/cam`);
      const capture = page.getByRole('button', { name: say(code, 'camera.capture') });
      await expect(capture).toBeEnabled();
      for (let i = 0; i < 2; i++) {
        await capture.click();
        await page.waitForTimeout(250);
      }
      await page.getByRole('button', { name: say(code, 'camera.openGallery') }).click();
      await expect(page.getByRole('heading', { name: say(code, 'gallery.title'), level: 1 })).toBeVisible();
      await expect(page.getByText(sayCount(code, 'gallery.photos', 2), { exact: false }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: say(code, 'gallery.select'), exact: true })).toBeVisible();
      await expect(page.getByText(say(code, 'gallery.where.photos'), { exact: true })).toBeVisible();

      // Open the first photo: its controls are labelled in this language.
      await page.getByRole('button').filter({ has: page.locator('img') }).first().click();
      const viewer = page.getByRole('dialog', { name: say(code, 'viewer.dialog.photo') });
      await expect(viewer).toBeVisible();
      await expect(viewer.getByRole('button', { name: say(code, 'viewer.share.photo') })).toBeVisible();
      await expect(viewer.getByRole('button', { name: say(code, 'viewer.download.photo') })).toBeVisible();
      await expect(viewer.getByRole('button', { name: say(code, 'viewer.delete.photo') })).toBeVisible();
      await expect(viewer.getByRole('button', { name: say(code, 'viewer.close.photo') })).toBeVisible();

      // Deleting asks in this language.
      await viewer.getByRole('button', { name: say(code, 'viewer.delete.photo') }).click();
      await expect(page.getByText(say(code, 'confirm.title'), { exact: true })).toBeVisible();
      await expect(page.getByText(say(code, 'confirm.photo'), { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: say(code, 'common.cancel'), exact: true })).toBeVisible();
    });
  });
}
