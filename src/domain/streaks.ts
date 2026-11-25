import { addDays } from './dates';
import { instanceId, scheduledDates } from './recurrence';
import type { Activity, DateKey, Routine } from './types';

/**
 * Bewertung eines vorgesehenen Routinetermins:
 *  hit     – erledigt
 *  miss    – übersprungen oder (in der Vergangenheit) nicht erledigt
 *  neutral – heute noch offen, oder bewusst als Einzeltermin gestrichen
 * Tage, die laut Wiederholung nicht vorgesehen sind, und freie Tage
 * tauchen gar nicht erst auf und unterbrechen deshalb keine Serie.
 */
export type Outcome = 'hit' | 'miss' | 'neutral';

export interface StreakResult {
  current: number;
  best: number;
}

export interface SeriesStreak extends StreakResult {
  seriesId: string;
  title: string;
  hits: number;
}

export interface StreakInput {
  routines: Routine[];
  activities: Activity[];
  freeDays: ReadonlySet<DateKey>;
  today: DateKey;
}

function outcome(a: Activity | undefined, date: DateKey, today: DateKey): Outcome {
  if (a?.deleted) return 'neutral';
  if (a?.status === 'done') return 'hit';
  if (a?.status === 'skipped') return 'miss';
  return date >= today ? 'neutral' : 'miss';
}

function fold(outcomes: Outcome[]): StreakResult {
  let current = 0;
  let best = 0;
  for (const o of outcomes) {
    if (o === 'hit') {
      current++;
      best = Math.max(best, current);
    } else if (o === 'miss') current = 0;
  }
  return { current, best };
}

/** Alle vorgesehenen (Serie, Datum)-Paare bis einschließlich heute. */
function scheduleUntilToday(input: StreakInput): Map<DateKey, { seriesId: string; outcome: Outcome }[]> {
  const byId = new Map(input.activities.map((a) => [a.id, a]));
  const map = new Map<DateKey, { seriesId: string; outcome: Outcome }[]>();
  for (const r of input.routines) {
    for (const d of scheduledDates(r, r.startDate, input.today, input.freeDays)) {
      const a = byId.get(instanceId(r.seriesId, d));
      const list = map.get(d) ?? [];
      list.push({ seriesId: r.seriesId, outcome: outcome(a, d, input.today) });
      map.set(d, list);
    }
  }
  return map;
}

export function seriesStreaks(input: StreakInput): SeriesStreak[] {
  const schedule = scheduleUntilToday(input);
  const dates = [...schedule.keys()].sort();
  const latest = new Map<string, Routine>();
  for (const r of [...input.routines].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    latest.set(r.seriesId, r);
  }
  const result: SeriesStreak[] = [];
  for (const [seriesId, r] of latest) {
    const outcomes = dates.flatMap((d) =>
      schedule.get(d)!.filter((e) => e.seriesId === seriesId).map((e) => e.outcome),
    );
    result.push({
      seriesId,
      title: r.title,
      hits: outcomes.filter((o) => o === 'hit').length,
      ...fold(outcomes),
    });
  }
  return result;
}

/**
 * Routinetage: Ein Tag ist „erfüllt“, wenn alle an diesem Tag vorgesehenen
 * Routinetermine erledigt sind. Tage ohne vorgesehene Routine sind neutral.
 */
export function routineDays(input: StreakInput): StreakResult & { fulfilledDays: number; perDay: Map<DateKey, Outcome> } {
  const schedule = scheduleUntilToday(input);
  const perDay = new Map<DateKey, Outcome>();
  for (const [d, entries] of schedule) {
    const relevant = entries.filter((e) => e.outcome !== 'neutral' || d === input.today);
    const counted = entries.filter((e) => e.outcome !== 'neutral');
    let o: Outcome;
    if (counted.some((e) => e.outcome === 'miss')) o = 'miss';
    else if (relevant.length > 0 && relevant.every((e) => e.outcome === 'hit')) o = 'hit';
    else o = 'neutral';
    perDay.set(d, o);
  }
  const dates = [...perDay.keys()].sort();
  const res = fold(dates.map((d) => perDay.get(d)!));
  return { ...res, fulfilledDays: dates.filter((d) => perDay.get(d) === 'hit').length, perDay };
}

/** Hilfsfunktion für Tests/Anzeige: Datum n Tage vor heute. */
export const daysAgo = (today: DateKey, n: number) => addDays(today, -n);
