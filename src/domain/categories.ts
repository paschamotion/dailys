import type { CategoryId } from './types';

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  icon: string;
  /** CSS-Variable für die Kategoriefarbe */
  color: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'ernaehrung', label: 'Ernährung', icon: '🍲', color: 'var(--cat-ernaehrung)' },
  { id: 'training', label: 'Training', icon: '🏃', color: 'var(--cat-training)' },
  { id: 'haushalt', label: 'Haushalt', icon: '🧺', color: 'var(--cat-haushalt)' },
  { id: 'freizeit', label: 'Freizeit', icon: '🌿', color: 'var(--cat-freizeit)' },
  { id: 'arbeit', label: 'Arbeit & Lernen', icon: '📚', color: 'var(--cat-arbeit)' },
  { id: 'gesundheit', label: 'Gesundheit', icon: '🫶', color: 'var(--cat-gesundheit)' },
  { id: 'sonstiges', label: 'Sonstiges', icon: '✦', color: 'var(--cat-sonstiges)' },
];

export function category(id: CategoryId): CategoryInfo {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
