/**
 * @file Languages: which ones the app has, which one is in use, and how a message is looked up.
 *
 * The choice is made in Settings and kept on this device. Until the person has chosen, the language follows the browser's own
 * list of preferred languages, but only when that is clear: the first language in the list that SpotCam has. Anything else
 * (an empty list, languages SpotCam does not have) means English. Nothing is sent anywhere.
 *
 * English is built into the app. The other languages are separate files, loaded when needed, so a visitor never downloads
 * the ones they do not use. A message that a language lacks falls back to the English one.
 */
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { en, type MessageKey } from '../locales/en';

export type Messages = Record<MessageKey, string> & Record<string, string>;

/** The languages, with each one's name written in itself (what the picker shows). */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文（简体）' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'ur', name: 'اردو', dir: 'rtl' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
  { code: 'mr', name: 'मराठी' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'ko', name: '한국어' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const isLanguage = (value: unknown): value is LanguageCode => LANGUAGES.some(l => l.code === value);

/** Which way a language is written: Arabic and Urdu run right to left. */
export const directionOf = (code: LanguageCode): 'ltr' | 'rtl' => (LANGUAGES.find(l => l.code === code) as { dir?: 'rtl' } | undefined)?.dir ?? 'ltr';

/** Old tags some browsers still send ("in" is Indonesian), and the Chinese tags that are not Simplified (SpotCam has only Simplified). */
const OLD_TAGS: Record<string, string> = { in: 'id' };
const NOT_SIMPLIFIED = /^zh-(hant|tw|hk|mo)(-|$)/;

/**
 * The language to use when the person has not chosen one: the first of the browser's preferred languages that SpotCam has
 * ("hi-IN" counts as Hindi). English when the list is empty or holds nothing SpotCam has.
 */
export function detectLanguage(preferred: readonly string[] | undefined): LanguageCode {
  for (const tag of preferred ?? []) {
    const lower = String(tag).toLowerCase();
    if (NOT_SIMPLIFIED.test(lower)) continue;
    const primary = lower.split('-')[0];
    const code = OLD_TAGS[primary] ?? primary;
    if (isLanguage(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

/** Fills `{name}` placeholders. A placeholder with no value is left as it is. */
export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

const loaders: Record<LanguageCode, () => Promise<Messages>> = {
  en: async () => en as Messages,
  hi: () => import('../locales/hi').then(m => m.hi),
  zh: () => import('../locales/zh').then(m => m.zh),
  es: () => import('../locales/es').then(m => m.es),
  fr: () => import('../locales/fr').then(m => m.fr),
  ar: () => import('../locales/ar').then(m => m.ar),
  bn: () => import('../locales/bn').then(m => m.bn),
  pt: () => import('../locales/pt').then(m => m.pt),
  ru: () => import('../locales/ru').then(m => m.ru),
  ur: () => import('../locales/ur').then(m => m.ur),
  id: () => import('../locales/id').then(m => m.id),
  de: () => import('../locales/de').then(m => m.de),
  ja: () => import('../locales/ja').then(m => m.ja),
  mr: () => import('../locales/mr').then(m => m.mr),
  te: () => import('../locales/te').then(m => m.te),
  tr: () => import('../locales/tr').then(m => m.tr),
  ta: () => import('../locales/ta').then(m => m.ta),
  vi: () => import('../locales/vi').then(m => m.vi),
  ko: () => import('../locales/ko').then(m => m.ko),
  kn: () => import('../locales/kn').then(m => m.kn),
};

let current: LanguageCode = DEFAULT_LANGUAGE;
let catalog: Messages = en as Messages;
const listeners = new Set<() => void>();

/** Makes `code` the language in use: loads its messages first, so the page never shows a mix. Falls back to English on failure. */
export async function activateLanguage(code: LanguageCode): Promise<void> {
  let loaded: Messages;
  try {
    loaded = await loaders[code]();
  } catch {
    code = DEFAULT_LANGUAGE;
    loaded = en as Messages;
  }
  current = code;
  catalog = loaded;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = directionOf(code);
  }
  listeners.forEach(listener => listener());
}

export const currentLanguage = (): LanguageCode => current;

/** Looks a message up in the language in use, then in English. */
export function translate(key: MessageKey, params?: Record<string, string | number>): string {
  return format(catalog[key] ?? (en as Record<string, string>)[key] ?? key, params);
}

/** A message that depends on a count: `key.one`, `key.few` and so on, as the language's plural rules say; `key.other` otherwise. */
export function translatePlural(key: string, count: number, params?: Record<string, string | number>): string {
  const category = new Intl.PluralRules(current).select(count);
  const table = catalog as Record<string, string>;
  const english = en as Record<string, string>;
  const template = table[`${key}.${category}`] ?? table[`${key}.other`] ?? english[`${key}.${category}`] ?? english[`${key}.other`] ?? key;
  return format(template, { count, ...params });
}

/** Turns `<b>text</b>` in a message into highlighted text (`wrap` makes the element, so the page decides how it looks). */
export function rich(text: string, wrap: (inner: string, index: number) => ReactNode): ReactNode {
  const parts = text.split(/<b>(.*?)<\/b>/g);
  return createElement(Fragment, null, ...parts.map((part, i) => (i % 2 === 1 ? wrap(part, i) : part)));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The language in use. Components that show text call this (or useT) so they redraw when it changes. */
export const useLanguage = (): LanguageCode => useSyncExternalStore(subscribe, currentLanguage, currentLanguage);

/** `t` for a message, `tn` for one that depends on a count. */
export function useT() {
  const lang = useLanguage();
  return { lang, t: translate, tn: translatePlural };
}
