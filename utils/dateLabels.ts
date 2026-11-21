/**
 * @file Friendly day names for the gallery: "Today", "Yesterday", a weekday for the last few days, then the date.
 * Days are counted on the device's calendar (not 24-hour blocks), so a photo from 23:50 last night is "Yesterday"
 * at 00:10, and a clock change cannot shift a photo into the wrong day.
 */

export interface DayLabel {
  /** A stable key for the calendar day (the device's own), used to group photos. */
  key: string;
  /** "Today", "Yesterday", "Tomorrow", a weekday ("Thursday"), or the date for anything older. */
  label: string;
  /** The date itself ("12 Nov 2026"); the year is left out for days in the current year. */
  date: string;
  /** Set for "Today", "Yesterday" and "Tomorrow", so the app can show those words in its own language. */
  relative?: 'today' | 'yesterday' | 'tomorrow';
}

/** Whole calendar days from a to b on the device's calendar. */
const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

/**
 * @param timestamp When the photo was taken (ms).
 * @param now The current time (ms), passed in so it can be tested.
 * @param locale Language for weekday and month names (the device's by default).
 */
export function dayLabel(timestamp: number, now: number = Date.now(), locale?: string): DayLabel {
  const taken = new Date(timestamp);
  const today = new Date(now);
  const daysAgo = dayNumber(today) - dayNumber(taken);
  const sameYear = taken.getFullYear() === today.getFullYear();
  const date = taken.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  const key = `${taken.getFullYear()}-${taken.getMonth() + 1}-${taken.getDate()}`;

  let label = date;
  let relative: DayLabel['relative'];
  if (daysAgo === 0) [label, relative] = ['Today', 'today'];
  else if (daysAgo === 1) [label, relative] = ['Yesterday', 'yesterday'];
  else if (daysAgo === -1) [label, relative] = ['Tomorrow', 'tomorrow']; // only if the phone's clock was set back
  else if (daysAgo > 1 && daysAgo < 7) label = taken.toLocaleDateString(locale, { weekday: 'long' });
  return { key, label, date, ...(relative ? { relative } : {}) };
}

/** The time of day, such as "18:42" (in the device's own style). */
export const timeOfDay = (timestamp: number, locale?: string): string =>
  new Date(timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
