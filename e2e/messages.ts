/**
 * The words the tests expect, taken from the app's own message catalogs (locales/) so that no label is written twice:
 * a changed or added translation changes what the tests look for, and a language added to the app is covered by the
 * language tests without touching them.
 */
import { en } from '../locales/en';
import { ar } from '../locales/ar';
import { bn } from '../locales/bn';
import { de } from '../locales/de';
import { es } from '../locales/es';
import { fr } from '../locales/fr';
import { hi } from '../locales/hi';
import { id } from '../locales/id';
import { ja } from '../locales/ja';
import { kn } from '../locales/kn';
import { ko } from '../locales/ko';
import { mr } from '../locales/mr';
import { pt } from '../locales/pt';
import { ru } from '../locales/ru';
import { ta } from '../locales/ta';
import { te } from '../locales/te';
import { tr } from '../locales/tr';
import { ur } from '../locales/ur';
import { vi } from '../locales/vi';
import { zh } from '../locales/zh';
import { LANGUAGES, directionOf, format, type LanguageCode } from '../utils/i18n';

type Catalog = Record<string, string>;

/** Every language's messages. Adding a language to the app makes this fail to compile until it is listed here. */
const CATALOGS: Record<LanguageCode, Catalog> = { en, zh, hi, es, fr, ar, bn, pt, ru, ur, id, de, ja, mr, te, tr, ta, vi, ko, kn };

/** A browser language tag that asks for each language, as a phone set to that language would send. */
export const BROWSER_LOCALE: Record<LanguageCode, string> = {
  en: 'en-US', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR', ar: 'ar-EG', bn: 'bn-BD', pt: 'pt-BR', ru: 'ru-RU', ur: 'ur-PK',
  id: 'id-ID', de: 'de-DE', ja: 'ja-JP', mr: 'mr-IN', te: 'te-IN', tr: 'tr-TR', ta: 'ta-IN', vi: 'vi-VN', ko: 'ko-KR', kn: 'kn-IN',
};

/** A language the app does not have, for "the browser asks for something else". */
export const UNSUPPORTED_BROWSER_LOCALE = 'it-IT';

export const ENGLISH: LanguageCode = 'en';

/** The languages other than English, with the name each one is shown by in the picker. */
export const OTHER_LANGUAGES = LANGUAGES.filter(l => l.code !== ENGLISH);
export const ALL_LANGUAGE_NAMES = LANGUAGES.map(l => l.name);

/** The message `key` in a language, with `{placeholders}` filled in. */
export const say = (language: LanguageCode, key: keyof typeof en, params?: Record<string, string | number>): string =>
  format(CATALOGS[language][key], params);

/** The heading of the privacy policy, which stays in English in every language (it is taken from the page title). */
export const PRIVACY_POLICY_HEADING = say(ENGLISH, 'title.privacy').split(' | ')[0];

/** A message that depends on a count (`key.one`, `key.other`), picked the way the app picks it, with `{count}` filled in. */
export const sayCount = (language: LanguageCode, key: string, count: number, params?: Record<string, string | number>): string => {
  const table = CATALOGS[language];
  const category = new Intl.PluralRules(language).select(count);
  return format(table[`${key}.${category}`] ?? table[`${key}.other`], { count, ...params });
};

/** The direction a language is written in, as the page should declare it. */
export const DIRECTION = (language: LanguageCode): 'ltr' | 'rtl' => directionOf(language);

/** A message with its <b>highlight</b> marks taken out, as it reads on the page. */
export const plain = (text: string): string => text.replace(/<\/?b>/g, '');
