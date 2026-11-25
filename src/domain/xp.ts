import type { ActivityFields } from './types';

/**
 * XP-Regel (bewusst einfach und nachvollziehbar):
 *   bis 15 Min.  → 10 XP
 *   bis 45 Min.  → 20 XP
 *   bis 90 Min.  → 30 XP
 *   länger       → 40 XP
 *   + 5 XP, wenn ein Foto als Nachweis verlangt ist
 * Der Wert wird beim Abschluss festgeschrieben und genau einmal gebucht.
 */
export const XP_TIERS: { maxMinutes: number; xp: number; label: string }[] = [
  { maxMinutes: 15, xp: 10, label: 'bis 15 Min.' },
  { maxMinutes: 45, xp: 20, label: 'bis 45 Min.' },
  { maxMinutes: 90, xp: 30, label: 'bis 90 Min.' },
  { maxMinutes: Infinity, xp: 40, label: 'länger' },
];
export const PHOTO_BONUS = 5;

export function xpFor(a: Pick<ActivityFields, 'plannedDuration' | 'completion'>): number {
  const tier = XP_TIERS.find((t) => a.plannedDuration <= t.maxMinutes)!;
  return tier.xp + (a.completion === 'photo' ? PHOTO_BONUS : 0);
}

/**
 * Levelkurve: Von Level n zu Level n+1 braucht man n × 100 XP.
 * Gesamt-XP für Level L = 50 · L · (L − 1)  → L2: 100, L3: 300, L4: 600, L5: 1000 …
 */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  intoLevel: number; // XP innerhalb des aktuellen Levels
  levelSpan: number; // XP, die das aktuelle Level umfasst
  toNext: number;
  progress: number; // 0..1
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  const into = totalXp - base;
  return {
    level,
    totalXp,
    intoLevel: into,
    levelSpan: span,
    toNext: span - into,
    progress: span ? into / span : 0,
  };
}
