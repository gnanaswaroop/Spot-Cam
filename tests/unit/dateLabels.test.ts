import { describe, expect, it } from 'vitest';
import { dayLabel, timeOfDay } from '../../utils/dateLabels';

// Local times throughout: the labels follow the device's calendar.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 11, 17, 9, 30); // Tuesday 17 Nov 2026
const label = (ts: number, now = NOW) => dayLabel(ts, now, 'en-GB');

describe('dayLabel', () => {
  it('calls the same day Today, even late at night', () => {
    expect(label(at(2026, 11, 17, 0, 5)).label).toBe('Today');
    expect(label(at(2026, 11, 17, 9, 29)).label).toBe('Today');
    expect(label(at(2026, 11, 17, 23, 59), at(2026, 11, 17, 23, 59)).label).toBe('Today');
  });

  it('counts calendar days, not 24-hour blocks: 23:50 last night is Yesterday at 00:10', () => {
    expect(label(at(2026, 11, 16, 23, 50), at(2026, 11, 17, 0, 10)).label).toBe('Yesterday');
    expect(label(at(2026, 11, 16, 0, 1)).label).toBe('Yesterday');
  });

  it('calls the next day Tomorrow (a phone clock that was set back)', () => {
    expect(label(at(2026, 11, 18, 8)).label).toBe('Tomorrow');
  });

  it('uses the weekday for the days before that, up to six days back', () => {
    expect(label(at(2026, 11, 15)).label).toBe('Sunday');
    expect(label(at(2026, 11, 11)).label).toBe('Wednesday');
  });

  it('uses the date from a week back, with the year only when it is not this year', () => {
    expect(label(at(2026, 11, 10))).toMatchObject({ label: '10 Nov', date: '10 Nov' });
    expect(label(at(2025, 12, 31)).label).toBe('31 Dec 2025');
  });

  it('always carries the date, so "Today" can show it next to the name', () => {
    expect(label(at(2026, 11, 17)).date).toBe('17 Nov');
  });

  it('gives photos from the same day the same key, and different days different keys', () => {
    expect(label(at(2026, 11, 17, 1)).key).toBe(label(at(2026, 11, 17, 23)).key);
    expect(label(at(2026, 11, 17)).key).not.toBe(label(at(2026, 11, 16)).key);
    expect(label(at(2026, 11, 17)).key).not.toBe(label(at(2025, 11, 17)).key);
  });
});

describe('timeOfDay', () => {
  it('shows hours and minutes', () => {
    expect(timeOfDay(at(2026, 11, 17, 18, 42), 'en-GB')).toBe('18:42');
  });
});
