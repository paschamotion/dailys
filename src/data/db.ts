import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Activity, DayReview, FreeDay, PhotoRecord, Routine, XpEntry } from '../domain/types';

export interface RoutineDB extends DBSchema {
  activities: { key: string; value: Activity; indexes: { byDate: string; bySeries: string } };
  routines: { key: string; value: Routine; indexes: { bySeries: string } };
  photos: { key: string; value: PhotoRecord; indexes: { byActivity: string } };
  xp: { key: string; value: XpEntry };
  reviews: { key: string; value: DayReview };
  freeDays: { key: string; value: FreeDay };
}

export type DB = IDBPDatabase<RoutineDB>;

export const DB_NAME = 'tagwerk';

export function openRoutineDb(name: string = DB_NAME): Promise<DB> {
  return openDB<RoutineDB>(name, 1, {
    upgrade(db) {
      const acts = db.createObjectStore('activities', { keyPath: 'id' });
      acts.createIndex('byDate', 'date');
      acts.createIndex('bySeries', 'seriesId');
      const routines = db.createObjectStore('routines', { keyPath: 'id' });
      routines.createIndex('bySeries', 'seriesId');
      const photos = db.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('byActivity', 'activityId');
      db.createObjectStore('xp', { keyPath: 'activityId' });
      db.createObjectStore('reviews', { keyPath: 'date' });
      db.createObjectStore('freeDays', { keyPath: 'date' });
    },
  });
}

/** Funktioniert auch ohne „secure context“ (z. B. iPhone im WLAN über http). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* Fallback unten */
    }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
