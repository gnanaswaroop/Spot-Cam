/**
 * The words the tests expect, taken from the app's own message catalogs (locales/) so that no label is written twice:
 * a changed or added translation changes what the tests look for, and a language added to the app is covered by the
 * language tests without touching them.
 */
import { en } from '../locales/en';
import { hi } from '../locales/hi';
import { LANGUAGES, format, type LanguageCode } from '../utils/i18n';

type Catalog = Record<string, string>;

/** Every language's messages. Adding a language to the app makes this fail to compile until it is listed here. */
const CATALOGS: Record<LanguageCode, Catalog> = { en, hi };

/** A browser language tag that asks for each language, as a phone set to that language would send. */
export const BROWSER_LOCALE: Record<LanguageCode, string> = { en: 'en-US', hi: 'hi-IN' };

/** A language the app does not have, for "the browser asks for something else". */
export const UNSUPPORTED_BROWSER_LOCALE = 'fr-FR';

export const ENGLISH: LanguageCode = 'en';

/** The languages other than English, with the name each one is shown by in the picker. */
export const OTHER_LANGUAGES = LANGUAGES.filter(l => l.code !== ENGLISH);
export const ALL_LANGUAGE_NAMES = LANGUAGES.map(l => l.name);

/** The message `key` in a language, with `{placeholders}` filled in. */
export const say = (language: LanguageCode, key: keyof typeof en, params?: Record<string, string | number>): string =>
  format(CATALOGS[language][key], params);

/** The heading of the privacy policy, which stays in English in every language (it is taken from the page title). */
export const PRIVACY_POLICY_HEADING = say(ENGLISH, 'title.privacy').split(' | ')[0];
