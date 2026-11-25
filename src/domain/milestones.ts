import type { Activity, DayReview } from './types';

export interface MilestoneStats {
  done: Activity[];
  fulfilledRoutineDays: number;
  bestRoutineDayStreak: number;
  level: number;
  reviews: DayReview[];
}

export interface Milestone {
  id: string;
  icon: string;
  title: string;
  description: string;
  target: number;
  value: (s: MilestoneStats) => number;
}

const count = (s: MilestoneStats, pred: (a: Activity) => boolean) => s.done.filter(pred).length;

export const MILESTONES: Milestone[] = [
  { id: 'first', icon: '✦', title: 'Erster Schritt', description: 'Erste Aktivität abgeschlossen', target: 1, value: (s) => s.done.length },
  { id: 'meals10', icon: '🍲', title: '10 Mahlzeiten', description: '10 Ernährungs-Aktivitäten abgeschlossen', target: 10, value: (s) => count(s, (a) => a.category === 'ernaehrung') },
  { id: 'training10', icon: '🏃', title: '10 Trainings', description: '10 Trainingseinheiten abgeschlossen', target: 10, value: (s) => count(s, (a) => a.category === 'training') },
  { id: 'routineDays7', icon: '🗓', title: '7 Routinetage', description: '7 Tage mit allen Routinen erfüllt', target: 7, value: (s) => s.fulfilledRoutineDays },
  { id: 'streak7', icon: '🔥', title: 'Eine Woche am Stück', description: '7 erfüllte Routinetage in Folge', target: 7, value: (s) => s.bestRoutineDayStreak },
  { id: 'photos10', icon: '📷', title: '10 Fotobelege', description: '10 Aktivitäten mit Foto dokumentiert', target: 10, value: (s) => count(s, (a) => !!a.photoId) },
  { id: 'reviews5', icon: '🌙', title: 'Reflektiert', description: '5 Tagesabschlüsse geschrieben', target: 5, value: (s) => s.reviews.filter((r) => r.energy !== null || r.note.trim()).length },
  { id: 'done50', icon: '⛰', title: '50 Aktivitäten', description: '50 Aktivitäten abgeschlossen', target: 50, value: (s) => s.done.length },
  { id: 'level5', icon: '★', title: 'Level 5', description: 'Level 5 erreicht', target: 5, value: (s) => s.level },
];

export interface MilestoneState {
  milestone: Milestone;
  value: number;
  achieved: boolean;
}

export function evaluateMilestones(s: MilestoneStats): MilestoneState[] {
  return MILESTONES.map((m) => {
    const v = m.value(s);
    return { milestone: m, value: Math.min(v, m.target), achieved: v >= m.target };
  });
}
