import { timeToMinutes } from './dates';
import type { Activity, DateKey } from './types';

export const isOpen = (a: Activity) => !a.deleted && (a.status === 'planned' || a.status === 'started');
export const visible = (a: Activity) => !a.deleted;

export function sortByTime(list: Activity[]): Activity[] {
  return [...list].sort(
    (a, b) => a.date.localeCompare(b.date) || a.plannedStart.localeCompare(b.plannedStart) || a.title.localeCompare(b.title),
  );
}

/** Überfällig: offen und das geplante Ende liegt in der Vergangenheit. */
export function isOverdue(a: Activity, today: DateKey, nowMin: number): boolean {
  if (!isOpen(a) || a.status === 'started') return false;
  if (a.date < today) return true;
  if (a.date > today) return false;
  return timeToMinutes(a.plannedStart) + a.plannedDuration <= nowMin;
}

export interface TodayView {
  current: Activity | null; // gestartet oder jetzt im Zeitfenster
  next: Activity | null;
  rest: Activity[]; // spätere offene Aktivitäten heute
  overdue: Activity[]; // offene aus der Vergangenheit (inkl. heute verpasster)
  finished: Activity[]; // heute erledigt oder übersprungen
  doneCount: number;
  totalCount: number; // heute ohne übersprungene
  earnedXpToday: number;
}

export function buildTodayView(all: Activity[], today: DateKey, nowMin: number): TodayView {
  const todays = sortByTime(all.filter((a) => a.date === today && visible(a)));
  const overdue = sortByTime(all.filter((a) => isOverdue(a, today, nowMin)));
  const overdueIds = new Set(overdue.map((a) => a.id));
  const open = todays.filter((a) => isOpen(a) && !overdueIds.has(a.id));

  const started = sortByTime(all.filter((a) => !a.deleted && a.status === 'started'));
  let current: Activity | null = started[0] ?? null;
  if (!current) {
    current =
      open.find((a) => {
        const s = timeToMinutes(a.plannedStart);
        return s <= nowMin && nowMin < s + a.plannedDuration;
      }) ?? null;
  }
  const upcoming = open.filter((a) => a.id !== current?.id && a.status !== 'started');
  const next = upcoming[0] ?? null;
  const rest = upcoming.slice(1);
  const finished = todays.filter((a) => a.status === 'done' || a.status === 'skipped');
  const doneToday = all.filter((a) => a.status === 'done' && a.completedAt && a.date === today);

  return {
    current,
    next,
    rest,
    overdue,
    finished,
    doneCount: todays.filter((a) => a.status === 'done').length,
    totalCount: todays.filter((a) => a.status !== 'skipped').length,
    earnedXpToday: doneToday.reduce((s, a) => s + a.xpAwarded, 0),
  };
}
