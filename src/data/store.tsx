import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nowMinutes, todayKey } from '../domain/dates';
import { evaluateMilestones, type MilestoneState } from '../domain/milestones';
import { routineDays, seriesStreaks, type SeriesStreak } from '../domain/streaks';
import type { DateKey } from '../domain/types';
import { levelInfo, type LevelInfo } from '../domain/xp';
import { openRoutineDb } from './db';
import { createRepo, RepoError, type AppData, type Repo } from './repo';

export interface Derived {
  level: LevelInfo;
  freeDaySet: Set<DateKey>;
  series: SeriesStreak[];
  routineDayStreak: { current: number; best: number; fulfilledDays: number; perDay: Map<DateKey, 'hit' | 'miss' | 'neutral'> };
  milestones: MilestoneState[];
}

interface StoreValue {
  repo: Repo;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: AppData;
  derived: Derived;
  today: DateKey;
  nowMin: number;
  refresh: () => Promise<void>;
  /** Führt eine Änderung aus und lädt danach neu. Fehler werden als Text zurückgegeben. */
  run: <T>(fn: (repo: Repo) => Promise<T>) => Promise<T>;
}

const EMPTY: AppData = { activities: [], routines: [], xp: [], xpTotal: 0, reviews: [], freeDays: [] };
const Ctx = createContext<StoreValue | null>(null);

export function errorText(e: unknown): string {
  if (e instanceof RepoError) return e.message;
  if ((e as { name?: string })?.name === 'QuotaExceededError') return 'Der Speicher ist voll.';
  return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
}

export function computeDerived(data: AppData, today: DateKey): Derived {
  const freeDaySet = new Set(data.freeDays.map((f) => f.date));
  const input = { routines: data.routines, activities: data.activities, freeDays: freeDaySet, today };
  const level = levelInfo(data.xpTotal);
  const rd = routineDays(input);
  const series = seriesStreaks(input);
  const done = data.activities.filter((a) => a.status === 'done' && !a.deleted);
  const milestones = evaluateMilestones({
    done,
    fulfilledRoutineDays: rd.fulfilledDays,
    bestRoutineDayStreak: rd.best,
    level: level.level,
    reviews: data.reviews,
  });
  return { level, freeDaySet, series, routineDayStreak: rd, milestones };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => createRepo(openRoutineDb()), []);
  const [status, setStatus] = useState<StoreValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const [clock, setClock] = useState(() => new Date());
  const today = todayKey(clock);
  const lastEnsured = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await repo.loadAll());
  }, [repo]);

  // Start + Tageswechsel: fehlende Routinetermine anlegen, dann laden.
  useEffect(() => {
    if (lastEnsured.current === today) return;
    lastEnsured.current = today;
    (async () => {
      try {
        await repo.ensureDefaultWindow();
        await refresh();
        setStatus('ready');
        if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);
      } catch (e) {
        setError(errorText(e));
        setStatus('error');
      }
    })();
  }, [repo, refresh, today]);

  useEffect(() => {
    const tick = () => setClock(new Date());
    const id = window.setInterval(tick, 30_000);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const run = useCallback(
    async <T,>(fn: (r: Repo) => Promise<T>): Promise<T> => {
      try {
        return await fn(repo);
      } finally {
        await refresh().catch(() => undefined);
      }
    },
    [repo, refresh],
  );

  const derived = useMemo(() => computeDerived(data, today), [data, today]);

  const value: StoreValue = { repo, status, error, data, derived, today, nowMin: nowMinutes(clock), refresh, run };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider fehlt');
  return v;
}
