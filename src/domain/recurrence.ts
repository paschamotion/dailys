import { dateRange, weekdayOf } from './dates';
import type { Activity, DateKey, Routine } from './types';

/** Deterministische ID: pro Serie und Seriendatum gibt es genau einen Termin. */
export function instanceId(seriesId: string, date: DateKey): string {
  return `s_${seriesId}_${date}`;
}

export function routineCoversDate(r: Routine, date: DateKey): boolean {
  if (date < r.startDate) return false;
  if (r.endDate && date > r.endDate) return false;
  return r.weekdays.includes(weekdayOf(date));
}

/** Alle geplanten Seriendaten eines Routine-Abschnitts im Zeitraum, ohne freie Tage. */
export function scheduledDates(
  r: Routine,
  from: DateKey,
  to: DateKey,
  freeDays: ReadonlySet<DateKey>,
): DateKey[] {
  const start = from > r.startDate ? from : r.startDate;
  const end = r.endDate && r.endDate < to ? r.endDate : to;
  if (start > end) return [];
  return dateRange(start, end).filter((d) => !freeDays.has(d) && routineCoversDate(r, d));
}

export function buildInstance(r: Routine, date: DateKey, nowIso: string): Activity {
  return {
    id: instanceId(r.seriesId, date),
    date,
    status: 'planned',
    routineId: r.id,
    seriesId: r.seriesId,
    seriesDate: date,
    detached: false,
    deleted: false,
    title: r.title,
    description: r.description,
    category: r.category,
    plannedStart: r.plannedStart,
    plannedDuration: r.plannedDuration,
    completion: r.completion,
    actualStart: null,
    actualEnd: null,
    completedAt: null,
    skippedAt: null,
    note: '',
    photoId: null,
    xpAwarded: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Liefert die Termine, die im Zeitraum noch fehlen. Bereits vorhandene
 * (auch verschobene, erledigte oder gelöschte) werden nie doppelt erzeugt,
 * weil die ID aus Serie + Seriendatum besteht.
 */
export function missingInstances(
  routines: Routine[],
  existingIds: ReadonlySet<string>,
  freeDays: ReadonlySet<DateKey>,
  from: DateKey,
  to: DateKey,
  nowIso: string,
): Activity[] {
  const out: Activity[] = [];
  for (const r of routines) {
    for (const d of scheduledDates(r, from, to, freeDays)) {
      const id = instanceId(r.seriesId, d);
      if (!existingIds.has(id)) out.push(buildInstance(r, d, nowIso));
    }
  }
  return out;
}

/** Ein Termin gilt als „unberührt“, wenn er noch exakt der Serie folgt. */
export function isUntouchedInstance(a: Activity): boolean {
  return a.seriesId !== null && a.status === 'planned' && !a.detached && !a.deleted;
}
