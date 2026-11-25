import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openRoutineDb } from '../src/data/db';
import { createRepo, faults, RepoError } from '../src/data/repo';
import { addDays, weekdayOf } from '../src/domain/dates';
import { instanceId } from '../src/domain/recurrence';
import { routineDays, seriesStreaks } from '../src/domain/streaks';
import type { ActivityFields, Weekday } from '../src/domain/types';
import { levelInfo, xpFor } from '../src/domain/xp';

let n = 0;
let now = new Date(2026, 10, 25, 17, 30); // Mi, 25.11.2026
const clock = () => now;
const setNow = (d: Date) => (now = d);

function freshRepo() {
  setNow(new Date(2026, 10, 25, 17, 30));
  return createRepo(openRoutineDb(`test-${++n}`), clock);
}

const kochen: ActivityFields = {
  title: 'Kochen & Essen',
  description: 'Frisch kochen',
  category: 'ernaehrung',
  plannedStart: '18:00',
  plannedDuration: 60,
  completion: 'photo',
};
const lesen: ActivityFields = { ...kochen, title: 'Lesen', category: 'freizeit', plannedDuration: 15, completion: 'confirm' };
const photoBlob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
const TODAY = '2026-11-25';

beforeEach(() => {
  faults.failPhotoSave = false;
});

describe('Kompletter Ablauf: planen → starten → Foto → abschließen → XP → Verlauf', () => {
  it('funktioniert und speichert Foto, Notiz, Zeiten und XP zusammen', async () => {
    const repo = freshRepo();
    const { activity } = await repo.createActivity(kochen, TODAY);
    await repo.startActivity(activity!.id);

    const photo = await repo.savePhoto(activity!.id, photoBlob());
    const res = await repo.completeActivity(activity!.id, { photoId: photo.id, note: 'Gemüsecurry' });

    expect(res.awarded).toBe(35); // 30 (≤90 Min.) + 5 Foto
    const data = await repo.loadAll();
    const a = data.activities.find((x) => x.id === activity!.id)!;
    expect(a.status).toBe('done');
    expect(a.photoId).toBe(photo.id);
    expect(a.note).toBe('Gemüsecurry');
    expect(a.plannedStart).toBe('18:00'); // geplant bleibt erhalten
    expect(a.actualStart).not.toBeNull(); // tatsächlich getrennt gespeichert
    expect(a.actualEnd).not.toBeNull();
    expect(data.xpTotal).toBe(35);
    const stored = await repo.getPhoto(photo.id);
    expect(stored?.activityId).toBe(activity!.id);
  });

  it('kann ohne vorheriges Starten (ohne Stoppuhr) abgeschlossen werden', async () => {
    const repo = freshRepo();
    const { activity } = await repo.createActivity(lesen, TODAY);
    const res = await repo.completeActivity(activity!.id, { actualStart: null });
    expect(res.awarded).toBe(10);
  });
});

describe('Foto-Pflicht', () => {
  it('verweigert den Abschluss ohne Foto', async () => {
    const repo = freshRepo();
    const { activity } = await repo.createActivity(kochen, TODAY);
    await expect(repo.completeActivity(activity!.id, { note: 'x' })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
    const data = await repo.loadAll();
    expect(data.activities[0].status).toBe('planned');
    expect(data.xpTotal).toBe(0);
  });

  it('verweigert ein ausgedachtes oder fremdes Foto', async () => {
    const repo = freshRepo();
    const a = (await repo.createActivity(kochen, TODAY)).activity!;
    const b = (await repo.createActivity(kochen, TODAY)).activity!;
    const photoOfB = await repo.savePhoto(b.id, photoBlob());
    await expect(repo.completeActivity(a.id, { photoId: 'gibt-es-nicht' })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
    await expect(repo.completeActivity(a.id, { photoId: photoOfB.id })).rejects.toMatchObject({ code: 'PHOTO_REQUIRED' });
  });

  it('Uploadfehler: nichts wird abgeschlossen, erneuter Versuch klappt', async () => {
    const repo = freshRepo();
    const { activity } = await repo.createActivity(kochen, TODAY);
    faults.failPhotoSave = true;
    await expect(repo.savePhoto(activity!.id, photoBlob())).rejects.toBeInstanceOf(RepoError);
    let data = await repo.loadAll();
    expect(data.activities[0].status).toBe('planned');

    faults.failPhotoSave = false;
    const photo = await repo.savePhoto(activity!.id, photoBlob());
    const res = await repo.completeActivity(activity!.id, { photoId: photo.id });
    expect(res.awarded).toBe(35);
    data = await repo.loadAll();
    expect(data.activities[0].status).toBe('done');
  });

  it('Foto ersetzen vor dem Abschluss entfernt den alten Entwurf', async () => {
    const repo = freshRepo();
    const { activity } = await repo.createActivity(kochen, TODAY);
    const first = await repo.savePhoto(activity!.id, photoBlob());
    const second = await repo.savePhoto(activity!.id, photoBlob());
    expect(await repo.getPhoto(first.id)).toBeUndefined();
    await repo.completeActivity(activity!.id, { photoId: second.id });
    await expect(repo.savePhoto(activity!.id, photoBlob())).rejects.toMatchObject({ code: 'INVALID' });
  });
});

describe('Keine doppelten XP', () => {
  it('mehrfaches Abschließen bucht nur einmal', async () => {
    const repo = freshRepo();
    const { activity } = await repo.createActivity(lesen, TODAY);
    const results = await Promise.all([
      repo.completeActivity(activity!.id),
      repo.completeActivity(activity!.id),
      repo.completeActivity(activity!.id),
    ]);
    expect(results.filter((r) => r.awarded > 0)).toHaveLength(1);
    const again = await repo.completeActivity(activity!.id);
    expect(again.alreadyDone).toBe(true);
    expect((await repo.loadAll()).xpTotal).toBe(10);
  });

  it('Neuladen (neue Repo-Instanz auf gleicher DB) ändert nichts', async () => {
    const name = `reload-${++n}`;
    const repo1 = createRepo(openRoutineDb(name), clock);
    const { activity } = await repo1.createActivity(lesen, TODAY);
    await repo1.completeActivity(activity!.id);
    const repo2 = createRepo(openRoutineDb(name), clock);
    await repo2.ensureDefaultWindow();
    await repo2.completeActivity(activity!.id);
    expect((await repo2.loadAll()).xpTotal).toBe(10);
  });

  it('Überspringen zieht keine XP ab und erledigte lassen sich nicht überspringen', async () => {
    const repo = freshRepo();
    const a = (await repo.createActivity(lesen, TODAY)).activity!;
    const b = (await repo.createActivity(lesen, TODAY)).activity!;
    await repo.completeActivity(a.id);
    await repo.skipActivity(b.id);
    await expect(repo.skipActivity(a.id)).rejects.toMatchObject({ code: 'INVALID' });
    expect((await repo.loadAll()).xpTotal).toBe(10);
  });
});

describe('XP und Level', () => {
  it('kleine Aufgaben geben weniger XP als große', () => {
    expect(xpFor({ plannedDuration: 10, completion: 'confirm' })).toBe(10);
    expect(xpFor({ plannedDuration: 30, completion: 'confirm' })).toBe(20);
    expect(xpFor({ plannedDuration: 60, completion: 'confirm' })).toBe(30);
    expect(xpFor({ plannedDuration: 120, completion: 'photo' })).toBe(45);
  });
  it('Levelkurve: n × 100 XP pro Stufe', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(299).level).toBe(2);
    expect(levelInfo(300)).toMatchObject({ level: 3, intoLevel: 0, levelSpan: 300 });
  });
});

describe('Wiederholungen', () => {
  const weekdaysAll: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

  it('erzeugt Einzeltermine nur an gewählten Wochentagen und nie doppelt', async () => {
    const repo = freshRepo();
    await repo.createActivity(kochen, TODAY, [1, 3, 5]); // Mo, Mi, Fr
    await repo.ensureDefaultWindow();
    await repo.ensureDefaultWindow();
    const acts = (await repo.loadAll()).activities;
    expect(acts.every((a) => [1, 3, 5].includes(weekdayOf(a.date)))).toBe(true);
    expect(new Set(acts.map((a) => a.id)).size).toBe(acts.length);
    expect(acts.map((a) => a.date)).toContain(TODAY);
    expect(acts.some((a) => a.date < TODAY)).toBe(false); // nicht rückwirkend
  });

  it('Einzeltermin ändern betrifft nicht die Serie', async () => {
    const repo = freshRepo();
    await repo.createActivity(kochen, TODAY, weekdaysAll);
    const id = instanceId((await repo.loadAll()).routines[0].seriesId, TODAY);
    await repo.updateSingle(id, { ...kochen, plannedStart: '19:30' }, TODAY);
    const acts = (await repo.loadAll()).activities;
    expect(acts.find((a) => a.id === id)!.plannedStart).toBe('19:30');
    expect(acts.find((a) => a.date === addDays(TODAY, 1))!.plannedStart).toBe('18:00');
  });

  it('Serie ab Datum ändern: Vergangenes bleibt, Zukunft wird angepasst, Einzeländerungen bleiben', async () => {
    const repo = freshRepo();
    await repo.createActivity(kochen, TODAY, weekdaysAll);
    const seriesId = (await repo.loadAll()).routines[0].seriesId;
    // heute erledigt
    const photo = await repo.savePhoto(instanceId(seriesId, TODAY), photoBlob());
    await repo.completeActivity(instanceId(seriesId, TODAY), { photoId: photo.id });
    // Termin in 3 Tagen einzeln geändert
    const d3 = addDays(TODAY, 3);
    await repo.updateSingle(instanceId(seriesId, d3), { ...kochen, title: 'Essen bei Oma' }, d3);

    // einen Tag später: Serie ab morgen auf 18:30 und nur noch Mo–Fr
    setNow(new Date(2026, 10, 26, 8, 0));
    const from = '2026-11-26';
    await repo.updateSeriesFrom(seriesId, from, { ...kochen, plannedStart: '18:30' }, [1, 2, 3, 4, 5]);

    const data = await repo.loadAll();
    const past = data.activities.find((a) => a.id === instanceId(seriesId, TODAY))!;
    expect(past.status).toBe('done');
    expect(past.plannedStart).toBe('18:00');
    expect(data.routines).toHaveLength(2);
    expect(data.routines.find((r) => r.endDate === TODAY)).toBeDefined();
    const future = data.activities.filter((a) => a.seriesId === seriesId && a.date >= from && !a.detached);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((a) => a.plannedStart === '18:30')).toBe(true);
    expect(future.every((a) => weekdayOf(a.date) <= 5)).toBe(true);
    expect(data.activities.find((a) => a.id === instanceId(seriesId, d3))!.title).toBe('Essen bei Oma');
    expect(data.xpTotal).toBe(35);
  });

  it('verschobener Termin entsteht am Ursprungsdatum nicht neu', async () => {
    const repo = freshRepo();
    await repo.createActivity(lesen, TODAY, weekdaysAll);
    const seriesId = (await repo.loadAll()).routines[0].seriesId;
    const tomorrow = addDays(TODAY, 1);
    await repo.rescheduleActivity(instanceId(seriesId, tomorrow), addDays(TODAY, 2), '08:00');
    await repo.ensureDefaultWindow();
    const acts = (await repo.loadAll()).activities;
    expect(acts.filter((a) => a.date === tomorrow)).toHaveLength(0);
    expect(acts.filter((a) => a.date === addDays(TODAY, 2))).toHaveLength(2);
  });

  it('gelöschter Einzeltermin und freier Tag entstehen nicht neu', async () => {
    const repo = freshRepo();
    await repo.createActivity(lesen, TODAY, weekdaysAll);
    const seriesId = (await repo.loadAll()).routines[0].seriesId;
    await repo.deleteActivity(instanceId(seriesId, addDays(TODAY, 1)));
    await repo.setFreeDay(addDays(TODAY, 2), true);
    await repo.ensureDefaultWindow();
    const acts = (await repo.loadAll()).activities.filter((a) => !a.deleted);
    expect(acts.some((a) => a.date === addDays(TODAY, 1))).toBe(false);
    expect(acts.some((a) => a.date === addDays(TODAY, 2))).toBe(false);
    await repo.setFreeDay(addDays(TODAY, 2), false);
    expect((await repo.loadAll()).activities.some((a) => a.date === addDays(TODAY, 2))).toBe(true);
  });

  it('Serie beenden lässt erledigte Einträge bestehen', async () => {
    const repo = freshRepo();
    await repo.createActivity(lesen, TODAY, weekdaysAll);
    const seriesId = (await repo.loadAll()).routines[0].seriesId;
    await repo.completeActivity(instanceId(seriesId, TODAY));
    await repo.endSeriesFrom(seriesId, addDays(TODAY, 1));
    await repo.ensureDefaultWindow();
    const acts = (await repo.loadAll()).activities;
    expect(acts).toHaveLength(1);
    expect(acts[0].status).toBe('done');
  });
});

describe('Streaks', () => {
  it('nicht vorgesehene Wochentage und freie Tage unterbrechen nicht, Verpasstes schon', async () => {
    // Routine Mo/Mi/Fr ab Mo 16.11.2026
    setNow(new Date(2026, 10, 16, 7, 0));
    const repo = createRepo(openRoutineDb(`streak-${++n}`), clock);
    await repo.createActivity(lesen, '2026-11-16', [1, 3, 5]);
    const seriesId = (await repo.loadAll()).routines[0].seriesId;
    const doDay = async (date: string, h = 20) => {
      setNow(new Date(`${date}T${h}:00:00`));
      await repo.ensureDefaultWindow();
      await repo.completeActivity(instanceId(seriesId, date));
    };
    await doDay('2026-11-16'); // Mo
    await doDay('2026-11-18'); // Mi
    await repo.setFreeDay('2026-11-20', true); // Fr frei
    await doDay('2026-11-23'); // Mo
    setNow(new Date(2026, 10, 25, 9, 0)); // Mi, heute noch offen
    let data = await repo.loadAll();
    const input = () => ({
      routines: data.routines,
      activities: data.activities,
      freeDays: new Set(data.freeDays.map((f) => f.date)),
      today: '2026-11-25',
    });
    expect(seriesStreaks(input())[0]).toMatchObject({ current: 3, best: 3, hits: 3 });
    expect(routineDays(input())).toMatchObject({ current: 3, fulfilledDays: 3 });

    // Mittwoch verpasst → am Freitag ist die Serie gebrochen
    setNow(new Date(2026, 10, 27, 9, 0));
    data = await repo.loadAll();
    const res = seriesStreaks({ ...input(), today: '2026-11-27' })[0];
    expect(res.current).toBe(0);
    expect(res.best).toBe(3);
    // XP bleiben erhalten
    expect(data.xpTotal).toBe(30);
  });
});
