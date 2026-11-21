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
  { code: 'hi', name: 'हिन्दी' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const isLanguage = (value: unknown): value is LanguageCode => LANGUAGES.some(l => l.code === value);

/**
 * The language to use when the person has not chosen one: the first of the browser's preferred languages that SpotCam has
 * ("hi-IN" counts as Hindi). English when the list is empty or holds nothing SpotCam has.
 */
export function detectLanguage(preferred: readonly string[] | undefined): LanguageCode {
  for (const tag of preferred ?? []) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
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
  if (typeof document !== 'undefined') document.documentElement.lang = code;
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
