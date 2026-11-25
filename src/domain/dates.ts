import type { DateKey, TimeOfDay, Weekday } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0); // Mittag: robust gegen Zeitumstellung
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function weekdayOf(key: DateKey): Weekday {
  const js = parseDateKey(key).getDay(); // 0 = Sonntag
  return (js === 0 ? 7 : js) as Weekday;
}

export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, 1 - weekdayOf(key));
}

export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function timeToMinutes(t: TimeOfDay): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): TimeOfDay {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function combine(date: DateKey, time: TimeOfDay): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function isoToTime(iso: string): TimeOfDay {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function endTime(start: TimeOfDay, duration: number): TimeOfDay {
  return minutesToTime(timeToMinutes(start) + duration);
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So',
};

const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

export function formatDayLong(key: DateKey): string {
  return dayFmt.format(parseDateKey(key));
}

export function formatDayShort(key: DateKey): string {
  return shortFmt.format(parseDateKey(key));
}

export function relativeDayLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Heute';
  if (key === addDays(today, 1)) return 'Morgen';
  if (key === addDays(today, -1)) return 'Gestern';
  return formatDayShort(key);
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}
