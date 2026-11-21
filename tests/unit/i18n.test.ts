import { describe, expect, it } from 'vitest';
import { en } from '../../locales/en';
import { hi } from '../../locales/hi';
import { LANGUAGES, activateLanguage, currentLanguage, detectLanguage, format, translate, translatePlural } from '../../utils/i18n';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const tags = (text: string) => (text.match(/<\/?b>/g) ?? []).length;

describe('choosing a language from the browser', () => {
  it('uses the first preferred language SpotCam has', () => {
    expect(detectLanguage(['hi'])).toBe('hi');
    expect(detectLanguage(['hi-IN', 'en-US'])).toBe('hi');
    expect(detectLanguage(['HI-in'])).toBe('hi');
    expect(detectLanguage(['fr-FR', 'hi'])).toBe('hi');
    expect(detectLanguage(['en-GB', 'hi'])).toBe('en');
  });

  it('means English when nothing is clear: no list, an empty list, or only languages SpotCam does not have', () => {
    expect(detectLanguage(undefined)).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(['fr', 'de-DE', 'ja'])).toBe('en');
    expect(detectLanguage(['', 'und', 'x-klingon'])).toBe('en');
  });
});

describe('messages', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(format('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(format('no placeholders')).toBe('no placeholders');
  });

  it('picks the plural form the language uses', async () => {
    await activateLanguage('en');
    expect(translatePlural('gallery.photos', 1)).toBe('1 photo');
    expect(translatePlural('gallery.photos', 3)).toBe('3 photos');
    await activateLanguage('hi');
    expect(translatePlural('gallery.selected', 2)).toBe('2 चुने गए');
    await activateLanguage('en');
  });

  it('switches language, and falls back to English for a message a language lacks', async () => {
    await activateLanguage('hi');
    expect(currentLanguage()).toBe('hi');
    expect(translate('common.cancel')).toBe(hi['common.cancel']);
    expect(translate('nope' as 'common.cancel')).toBe('nope');
    await activateLanguage('en');
    expect(translate('common.cancel')).toBe('Cancel');
  });
});

describe('every language is complete and consistent with English', () => {
  const catalogs = { hi } as Record<string, Record<string, string>>;

  it('lists each language once, with its own name', () => {
    expect(new Set(LANGUAGES.map(l => l.code)).size).toBe(LANGUAGES.length);
    expect(LANGUAGES[0].code).toBe('en');
  });

  for (const [code, messages] of Object.entries(catalogs)) {
    it(`${code}: has every English key and nothing else`, () => {
      const english = Object.keys(en);
      expect(english.filter(key => !(key in messages))).toEqual([]);
      expect(Object.keys(messages).filter(key => !(key in en))).toEqual([]);
    });

    it(`${code}: every message keeps the same {placeholders} and <b> marks as English, and none is empty`, () => {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(messages[key].trim(), key).not.toBe('');
        // A plural form may drop {count} ("One photo"), so compare what English has with what the translation has, in that direction only.
        const wanted = placeholders(en[key]).filter(p => p !== 'count');
        const got = placeholders(messages[key]).filter(p => p !== 'count');
        expect(got, key).toEqual(wanted);
        expect(tags(messages[key]), key).toBe(tags(en[key]));
      }
    });
  }
});
