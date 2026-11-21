/**
 * @file The English text of the "How it works" page as plain data, for the build-time static HTML (what crawlers and link
 * previews see). The words live in locales/en.ts, where the page takes them from too, so both are always the same.
 */
import { en } from '../locales/en';

export const HOW_IT_WORKS_INTRO: string = en['how.intro'];

export const HOW_STEPS = [
  { title: en['how.step1.title'], text: en['how.step1.text'] },
  { title: en['how.step2.title'], text: en['how.step2.text'] },
  { title: en['how.step3.title'], text: en['how.step3.text'] },
];

export const USE_CASES = [
  { title: en['how.use1.title'], text: en['how.use1.text'] },
  { title: en['how.use2.title'], text: en['how.use2.text'] },
  { title: en['how.use3.title'], text: en['how.use3.text'] },
  { title: en['how.use4.title'], text: en['how.use4.text'] },
];

export const FAQ = [
  { question: en['how.faq1.q'], answer: en['how.faq1.a'] },
  { question: en['how.faq2.q'], answer: en['how.faq2.a'] },
  { question: en['how.faq3.q'], answer: en['how.faq3.a'] },
  { question: en['how.faq4.q'], answer: en['how.faq4.a'] },
  { question: en['how.faq5.q'], answer: en['how.faq5.a'] },
];
