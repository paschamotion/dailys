import { addDays, todayKey } from '../domain/dates';
import { isUntouchedInstance, missingInstances } from '../domain/recurrence';
import type {
  Activity,
  ActivityFields,
  DateKey,
  DayReview,
  FreeDay,
  PhotoRecord,
  Routine,
  Weekday,
  XpEntry,
} from '../domain/types';
import { xpFor } from '../domain/xp';
import { uid, type DB } from './db';

export type RepoErrorCode =
  | 'PHOTO_REQUIRED'
  | 'PHOTO_SAVE_FAILED'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'STORAGE_FULL'
  | 'STORAGE_UNAVAILABLE';

export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) {
    super(message);
    this.name = 'RepoError';
  }
}

/** Zum Testen von Fehlerfällen (Entwicklermodus / Tests). */
export const faults = { failPhotoSave: false };

/** Wie weit im Voraus Routinetermine als Einzeltermine angelegt werden. */
export const GENERATE_AHEAD_DAYS = 14;

export interface AppData {
  activities: Activity[];
  routines: Routine[];
  xp: XpEntry[];
  xpTotal: number;
  reviews: DayReview[];
  freeDays: FreeDay[];
}

export interface CompleteInput {
  photoId?: string | null;
  note?: string;
  actualStart?: string | null;
  actualEnd?: string | null;
}

export interface CompleteResult {
  activity: Activity;
  awarded: number; // neu gebuchte XP (0, wenn schon erledigt)
  alreadyDone: boolean;
}

function mapStorageError(e: unknown): never {
  if (e instanceof RepoError) throw e;
  const name = (e as { name?: string })?.name;
  if (name === 'QuotaExceededError') {
    throw new RepoError('STORAGE_FULL', 'Der Gerätespeicher für diese App ist voll. Lösche alte Fotos oder sichere und bereinige deine Daten.');
  }
  throw e;
}

export type Repo = ReturnType<typeof createRepo>;

export function createRepo(dbPromise: Promise<DB>, clock: () => Date = () => new Date()) {
  const nowIso = () => clock().toISOString();
  const today = () => todayKey(clock());

  async function db(): Promise<DB> {
    try {
      return await dbPromise;
    } catch {
      throw new RepoError(
        'STORAGE_UNAVAILABLE',
        'Der lokale Speicher ist nicht verfügbar. Im privaten Modus von Safari können keine Daten gespeichert werden.',
      );
    }
  }

  async function loadAll(): Promise<AppData> {
    const d = await db();
    const [activities, routines, xp, reviews, freeDays] = await Promise.all([
      d.getAll('activities'),
      d.getAll('routines'),
      d.getAll('xp'),
      d.getAll('reviews'),
      d.getAll('freeDays'),
    ]);
    return { activities, routines, xp, xpTotal: xp.reduce((s, e) => s + e.amount, 0), reviews, freeDays };
  }

  /** Legt fehlende Routinetermine an – nie rückwirkend, nie doppelt. */
  async function ensureInstances(from: DateKey, to: DateKey): Promise<number> {
    const start = from < today() ? today() : from;
    if (start > to) return 0;
    const d = await db();
    const tx = d.transaction(['routines', 'activities', 'freeDays'], 'readwrite');
    const routines = await tx.objectStore('routines').getAll();
    const free = new Set(await tx.objectStore('freeDays').getAllKeys());
    const acts = tx.objectStore('activities');
    let created = 0;
    for (const inst of missingInstances(routines, new Set(), free, start, to, nowIso())) {
      if ((await acts.getKey(inst.id)) === undefined) {
        await acts.add(inst);
        created++;
      }
    }
    await tx.done;
    return created;
  }

  async function ensureDefaultWindow() {
    return ensureInstances(today(), addDays(today(), GENERATE_AHEAD_DAYS));
  }

  async function mutateActivity(id: string, fn: (a: Activity) => Activity): Promise<Activity> {
    const d = await db();
    const tx = d.transaction('activities', 'readwrite');
    try {
      const a = await tx.store.get(id);
      if (!a || a.deleted) throw new RepoError('NOT_FOUND', 'Diese Aktivität gibt es nicht mehr.');
      const next = { ...fn(a), updatedAt: nowIso() };
      await tx.store.put(next);
      await tx.done;
      return next;
    } catch (e) {
      safeAbort(tx);
      return mapStorageError(e);
    }
  }

  function validateFields(f: ActivityFields) {
    if (!f.title.trim()) throw new RepoError('INVALID', 'Bitte gib einen Titel ein.');
    if (!/^\d{2}:\d{2}$/.test(f.plannedStart)) throw new RepoError('INVALID', 'Bitte gib eine gültige Startzeit ein.');
    if (!(f.plannedDuration >= 5 && f.plannedDuration <= 24 * 60)) {
      throw new RepoError('INVALID', 'Die Dauer muss zwischen 5 Minuten und 24 Stunden liegen.');
    }
  }

  const clean = (f: ActivityFields): ActivityFields => ({
    title: f.title.trim(),
    description: f.description.trim(),
    category: f.category,
    plannedStart: f.plannedStart,
    plannedDuration: Math.round(f.plannedDuration),
    completion: f.completion,
  });

  /** Neue Aktivität. Mit Wochentagen entsteht eine Routine ab `date`. */
  async function createActivity(fields: ActivityFields, date: DateKey, weekdays: Weekday[] = []) {
    validateFields(fields);
    const f = clean(fields);
    const d = await db();
    const now = nowIso();
    if (weekdays.length > 0) {
      const routine: Routine = {
        ...f,
        id: uid(),
        seriesId: uid(),
        weekdays: [...new Set(weekdays)].sort() as Weekday[],
        startDate: date,
        endDate: null,
        createdAt: now,
      };
      await d.put('routines', routine).catch(mapStorageError);
      await ensureInstances(date, addDays(date > today() ? date : today(), GENERATE_AHEAD_DAYS));
      return { routine };
    }
    const activity: Activity = {
      ...f,
      id: uid(),
      date,
      status: 'planned',
      routineId: null,
      seriesId: null,
      seriesDate: null,
      detached: false,
      deleted: false,
      actualStart: null,
      actualEnd: null,
      completedAt: null,
      skippedAt: null,
      note: '',
      photoId: null,
      xpAwarded: 0,
      createdAt: now,
      updatedAt: now,
    };
    await d.put('activities', activity).catch(mapStorageError);
    return { activity };
  }

  function startActivity(id: string) {
    return mutateActivity(id, (a) => {
      if (a.status === 'done') throw new RepoError('INVALID', 'Diese Aktivität ist bereits erledigt.');
      if (a.status === 'started') return a;
      return { ...a, status: 'started', actualStart: nowIso(), skippedAt: null };
    });
  }

  function skipActivity(id: string) {
    return mutateActivity(id, (a) => {
      if (a.status === 'done') throw new RepoError('INVALID', 'Erledigte Aktivitäten können nicht übersprungen werden.');
      return { ...a, status: 'skipped', skippedAt: nowIso() };
    });
  }

  function reopenActivity(id: string) {
    return mutateActivity(id, (a) => {
      if (a.status !== 'skipped') return a;
      return { ...a, status: a.actualStart ? 'started' : 'planned', skippedAt: null };
    });
  }

  function rescheduleActivity(id: string, date: DateKey, time: string) {
    return mutateActivity(id, (a) => {
      if (a.status === 'done') throw new RepoError('INVALID', 'Erledigte Aktivitäten können nicht verschoben werden.');
      return {
        ...a,
        date,
        plannedStart: time,
        status: 'planned',
        actualStart: null,
        skippedAt: null,
        detached: a.seriesId ? true : a.detached,
      };
    });
  }

  /** Ändert nur diesen einen Termin. */
  function updateSingle(id: string, fields: ActivityFields, date: DateKey) {
    validateFields(fields);
    const f = clean(fields);
    return mutateActivity(id, (a) => {
      if (a.status === 'done') throw new RepoError('INVALID', 'Erledigte Aktivitäten können nicht mehr geändert werden.');
      return { ...a, ...f, date, detached: a.seriesId ? true : false };
    });
  }

  /**
   * Ändert die Serie ab `fromDate`. Vergangene Termine und ihr Abschnitt
   * der Routine bleiben unverändert; zukünftige unberührte Termine werden
   * neu erzeugt. Einzeln geänderte oder bereits begonnene Termine bleiben.
   */
  async function updateSeriesFrom(
    seriesId: string,
    fromDate: DateKey,
    fields: ActivityFields,
    weekdays: Weekday[],
  ) {
    validateFields(fields);
    if (weekdays.length === 0) throw new RepoError('INVALID', 'Bitte wähle mindestens einen Wochentag.');
    const f = clean(fields);
    const d = await db();
    const tx = d.transaction(['routines', 'activities'], 'readwrite');
    try {
      const rStore = tx.objectStore('routines');
      const segs = (await rStore.index('bySeries').getAll(seriesId)).sort((a, b) => a.startDate.localeCompare(b.startDate));
      if (segs.length === 0) throw new RepoError('NOT_FOUND', 'Diese Routine gibt es nicht mehr.');
      const base = [...segs].reverse().find((s) => s.startDate <= fromDate) ?? segs[0];
      const wd = [...new Set(weekdays)].sort() as Weekday[];
      for (const s of segs) if (s.startDate > fromDate) await rStore.delete(s.id);
      if (base.startDate >= fromDate) {
        await rStore.put({ ...base, ...f, weekdays: wd, endDate: null });
      } else {
        await rStore.put({ ...base, endDate: addDays(fromDate, -1) });
        await rStore.put({ ...f, id: uid(), seriesId, weekdays: wd, startDate: fromDate, endDate: null, createdAt: nowIso() });
      }
      await deleteUntouchedFrom(tx.objectStore('activities'), seriesId, fromDate);
      await tx.done;
    } catch (e) {
      safeAbort(tx);
      mapStorageError(e);
    }
    await ensureInstances(fromDate, addDays(fromDate > today() ? fromDate : today(), GENERATE_AHEAD_DAYS));
  }

  /** Beendet die Serie ab `fromDate` (inklusive). Vergangenes bleibt erhalten. */
  async function endSeriesFrom(seriesId: string, fromDate: DateKey) {
    const d = await db();
    const tx = d.transaction(['routines', 'activities'], 'readwrite');
    const rStore = tx.objectStore('routines');
    for (const s of await rStore.index('bySeries').getAll(seriesId)) {
      if (s.startDate >= fromDate) {
        await rStore.put({ ...s, endDate: addDays(s.startDate, -1) });
      } else if (!s.endDate || s.endDate >= fromDate) {
        await rStore.put({ ...s, endDate: addDays(fromDate, -1) });
      }
    }
    await deleteUntouchedFrom(tx.objectStore('activities'), seriesId, fromDate);
    await tx.done;
  }

  async function deleteUntouchedFrom(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: any,
    seriesId: string,
    fromDate: DateKey,
  ) {
    const list: Activity[] = await store.index('bySeries').getAll(seriesId);
    for (const a of list) {
      if (a.seriesDate && a.seriesDate >= fromDate && isUntouchedInstance(a)) await store.delete(a.id);
    }
  }

  /** Löscht einen Termin. Serientermine bleiben als Grabstein, damit sie nicht neu entstehen. */
  async function deleteActivity(id: string) {
    const d = await db();
    const tx = d.transaction(['activities', 'photos'], 'readwrite');
    try {
      const a = await tx.objectStore('activities').get(id);
      if (!a) throw new RepoError('NOT_FOUND', 'Diese Aktivität gibt es nicht mehr.');
      if (a.status === 'done') throw new RepoError('INVALID', 'Erledigte Aktivitäten bleiben im Verlauf erhalten.');
      if (a.seriesId) {
        await tx.objectStore('activities').put({ ...a, deleted: true, updatedAt: nowIso() });
      } else {
        await tx.objectStore('activities').delete(id);
      }
      for (const p of await tx.objectStore('photos').index('byActivity').getAll(id)) {
        await tx.objectStore('photos').delete(p.id);
      }
      await tx.done;
    } catch (e) {
      safeAbort(tx);
      mapStorageError(e);
    }
  }

  /**
   * Schritt 1 des Fotoabschlusses: Foto dauerhaft speichern.
   * Ältere, nicht verknüpfte Entwürfe derselben Aktivität werden ersetzt.
   */
  async function savePhoto(activityId: string, blob: Blob): Promise<PhotoRecord> {
    if (faults.failPhotoSave) {
      throw new RepoError('PHOTO_SAVE_FAILED', 'Das Foto konnte nicht gespeichert werden.');
    }
    const d = await db();
    const tx = d.transaction(['activities', 'photos'], 'readwrite');
    try {
      const a = await tx.objectStore('activities').get(activityId);
      if (!a || a.deleted) throw new RepoError('NOT_FOUND', 'Diese Aktivität gibt es nicht mehr.');
      if (a.status === 'done') throw new RepoError('INVALID', 'Die Aktivität ist bereits abgeschlossen.');
      const photos = tx.objectStore('photos');
      for (const p of await photos.index('byActivity').getAll(activityId)) {
        if (p.id !== a.photoId) await photos.delete(p.id);
      }
      const rec: PhotoRecord = { id: uid(), activityId, blob, mime: blob.type || 'image/jpeg', createdAt: nowIso() };
      await photos.add(rec);
      await tx.done;
      return rec;
    } catch (e) {
      safeAbort(tx);
      if (e instanceof RepoError) throw e;
      if ((e as { name?: string })?.name === 'QuotaExceededError') mapStorageError(e);
      throw new RepoError('PHOTO_SAVE_FAILED', 'Das Foto konnte nicht gespeichert werden.');
    }
  }

  /**
   * Schritt 2: Abschließen. Läuft in einer Transaktion über Aktivität, Foto
   * und XP-Buch. XP werden pro Aktivität genau einmal gebucht – mehrfaches
   * Tippen oder Neuladen erzeugt keine weiteren XP.
   */
  async function completeActivity(id: string, input: CompleteInput = {}): Promise<CompleteResult> {
    const d = await db();
    const tx = d.transaction(['activities', 'photos', 'xp'], 'readwrite');
    try {
      const acts = tx.objectStore('activities');
      const a = await acts.get(id);
      if (!a || a.deleted) throw new RepoError('NOT_FOUND', 'Diese Aktivität gibt es nicht mehr.');
      if (a.status === 'done') {
        await tx.done;
        return { activity: a, awarded: 0, alreadyDone: true };
      }
      const photoId = input.photoId ?? a.photoId;
      if (a.completion === 'photo') {
        const photo = photoId ? await tx.objectStore('photos').get(photoId) : undefined;
        if (!photo || photo.activityId !== id) {
          throw new RepoError('PHOTO_REQUIRED', 'Für diese Aktivität ist ein gespeichertes Foto erforderlich.');
        }
      }
      const xpStore = tx.objectStore('xp');
      const existing = await xpStore.get(id);
      const amount = existing ? existing.amount : xpFor(a);
      const now = nowIso();
      const updated: Activity = {
        ...a,
        status: 'done',
        completedAt: now,
        actualStart: input.actualStart !== undefined ? input.actualStart : a.actualStart,
        actualEnd: input.actualEnd ?? now,
        note: (input.note ?? a.note).trim(),
        photoId: photoId ?? null,
        skippedAt: null,
        xpAwarded: amount,
        updatedAt: now,
      };
      await acts.put(updated);
      if (!existing) await xpStore.add({ activityId: id, amount, at: now });
      await tx.done;
      return { activity: updated, awarded: existing ? 0 : amount, alreadyDone: false };
    } catch (e) {
      safeAbort(tx);
      return mapStorageError(e);
    }
  }

  async function updateNote(id: string, note: string) {
    return mutateActivity(id, (a) => ({ ...a, note: note.trim() }));
  }

  async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
    return (await db()).get('photos', id);
  }

  async function setFreeDay(date: DateKey, free: boolean, label = 'Freier Tag') {
    const d = await db();
    if (free) {
      const tx = d.transaction(['freeDays', 'activities'], 'readwrite');
      await tx.objectStore('freeDays').put({ date, label });
      for (const a of await tx.objectStore('activities').index('byDate').getAll(date)) {
        if (isUntouchedInstance(a)) await tx.objectStore('activities').delete(a.id);
      }
      await tx.done;
    } else {
      await d.delete('freeDays', date);
      await ensureInstances(date, date);
    }
  }

  async function saveReview(date: DateKey, energy: DayReview['energy'], note: string) {
    const rec: DayReview = { date, energy, note: note.trim(), updatedAt: nowIso() };
    await (await db()).put('reviews', rec).catch(mapStorageError);
    return rec;
  }

  // ---------- Sicherung ----------

  async function exportBackup(): Promise<string> {
    const d = await db();
    const data = await loadAll();
    const photos = await d.getAll('photos');
    const photoData = await Promise.all(
      photos.map(async (p) => ({ ...p, blob: undefined, data: await blobToBase64(p.blob) })),
    );
    return JSON.stringify({ app: 'tagwerk', version: 1, exportedAt: nowIso(), ...data, xpTotal: undefined, photos: photoData });
  }

  async function importBackup(json: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new RepoError('INVALID', 'Die Datei ist keine gültige Sicherung.');
    }
    if (parsed?.app !== 'tagwerk' || parsed.version !== 1) {
      throw new RepoError('INVALID', 'Die Datei ist keine Sicherung dieser App.');
    }
    const d = await db();
    const stores = ['activities', 'routines', 'photos', 'xp', 'reviews', 'freeDays'] as const;
    const tx = d.transaction([...stores], 'readwrite');
    try {
      for (const s of stores) await tx.objectStore(s).clear();
      for (const a of parsed.activities ?? []) await tx.objectStore('activities').put(a);
      for (const r of parsed.routines ?? []) await tx.objectStore('routines').put(r);
      for (const x of parsed.xp ?? []) await tx.objectStore('xp').put(x);
      for (const r of parsed.reviews ?? []) await tx.objectStore('reviews').put(r);
      for (const f of parsed.freeDays ?? []) await tx.objectStore('freeDays').put(f);
      for (const p of parsed.photos ?? []) {
        const { data, ...rest } = p;
        await tx.objectStore('photos').put({ ...rest, blob: base64ToBlob(data, p.mime) });
      }
      await tx.done;
    } catch (e) {
      safeAbort(tx);
      mapStorageError(e);
    }
  }

  return {
    loadAll,
    ensureInstances,
    ensureDefaultWindow,
    createActivity,
    startActivity,
    skipActivity,
    reopenActivity,
    rescheduleActivity,
    updateSingle,
    updateSeriesFrom,
    endSeriesFrom,
    deleteActivity,
    savePhoto,
    completeActivity,
    updateNote,
    getPhoto,
    setFreeDay,
    saveReview,
    exportBackup,
    importBackup,
  };
}

function safeAbort(tx: { abort(): void; done: Promise<void> }) {
  tx.done.catch(() => undefined);
  try {
    tx.abort();
  } catch {
    /* bereits beendet */
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
