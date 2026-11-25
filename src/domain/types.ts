/** Kalenderdatum in lokaler Zeit, Format YYYY-MM-DD */
export type DateKey = string;
/** Uhrzeit in lokaler Zeit, Format HH:MM */
export type TimeOfDay = string;
/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CategoryId =
  | 'ernaehrung'
  | 'training'
  | 'haushalt'
  | 'freizeit'
  | 'arbeit'
  | 'gesundheit'
  | 'sonstiges';

export type CompletionRule = 'confirm' | 'photo';
export type ActivityStatus = 'planned' | 'started' | 'done' | 'skipped';

/** Gemeinsame Felder, die eine Aktivität beschreiben (Vorlage oder Termin). */
export interface ActivityFields {
  title: string;
  description: string;
  category: CategoryId;
  plannedStart: TimeOfDay;
  plannedDuration: number; // Minuten
  completion: CompletionRule;
}

/**
 * Ein Abschnitt einer wiederkehrenden Routine.
 * Wird eine Serie „ab heute“ geändert, endet der alte Abschnitt (endDate)
 * und ein neuer beginnt mit derselben seriesId. So bleiben vergangene
 * Einträge an ihrer damaligen Definition hängen.
 */
export interface Routine extends ActivityFields {
  id: string;
  seriesId: string;
  weekdays: Weekday[];
  startDate: DateKey;
  endDate: DateKey | null; // inklusive, null = offen
  createdAt: string;
}

export interface Activity extends ActivityFields {
  id: string;
  date: DateKey;
  status: ActivityStatus;
  /** Gesetzt, wenn der Termin aus einer Routine stammt. */
  routineId: string | null;
  seriesId: string | null;
  /** Ursprünglicher Seriendatum – bleibt beim Verschieben erhalten. */
  seriesDate: DateKey | null;
  /** Einzeln geändert → spätere Serienänderungen überschreiben ihn nicht. */
  detached: boolean;
  /** Einzeltermin einer Serie gelöscht (Grabstein, damit er nicht neu entsteht). */
  deleted: boolean;
  actualStart: string | null; // ISO-Zeitstempel
  actualEnd: string | null; // ISO-Zeitstempel
  completedAt: string | null;
  skippedAt: string | null;
  note: string;
  photoId: string | null;
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoRecord {
  id: string;
  activityId: string;
  blob: Blob;
  mime: string;
  createdAt: string;
}

/** XP-Buchung. Schlüssel = activityId → pro Aktivität höchstens einmal. */
export interface XpEntry {
  activityId: string;
  amount: number;
  at: string;
}

export interface DayReview {
  date: DateKey;
  energy: 1 | 2 | 3 | 4 | 5 | null;
  note: string;
  updatedAt: string;
}

export interface FreeDay {
  date: DateKey;
  label: string;
}
