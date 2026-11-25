import { useMemo, useState } from 'react';
import type { Repo } from '../../data/repo';
import { errorText, useStore } from '../../data/store';
import { CATEGORIES } from '../../domain/categories';
import { WEEKDAY_SHORT, formatDayShort, weekdayOf } from '../../domain/dates';
import type { Activity, ActivityFields, CategoryId, CompletionRule, DateKey, Weekday } from '../../domain/types';
import { xpFor } from '../../domain/xp';
import { Banner, Icon, Sheet, Spinner } from '../components/ui';

const DURATIONS = [10, 15, 30, 45, 60, 90];
const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export type FormTarget =
  | { mode: 'create'; date: DateKey }
  | { mode: 'edit'; activity: Activity }
  | { mode: 'series'; seriesId: string; fromDate: DateKey };

export function ActivityForm({ target, onClose, onDone }: { target: FormTarget; onClose: () => void; onDone: (msg: string) => void }) {
  const { data, run, today } = useStore();

  const routine = useMemo(() => {
    if (target.mode === 'edit' && target.activity.routineId) return data.routines.find((r) => r.id === target.activity.routineId) ?? null;
    if (target.mode === 'series') {
      const segs = data.routines.filter((r) => r.seriesId === target.seriesId).sort((a, b) => b.startDate.localeCompare(a.startDate));
      return segs[0] ?? null;
    }
    return null;
  }, [data.routines, target]);

  const src: ActivityFields | null = target.mode === 'edit' ? target.activity : routine;
  const [title, setTitle] = useState(src?.title ?? '');
  const [description, setDescription] = useState(src?.description ?? '');
  const [cat, setCat] = useState<CategoryId>(src?.category ?? 'ernaehrung');
  const [date, setDate] = useState<DateKey>(target.mode === 'create' ? target.date : target.mode === 'edit' ? target.activity.date : target.fromDate);
  const [start, setStart] = useState(src?.plannedStart ?? '18:00');
  const [duration, setDuration] = useState(src?.plannedDuration ?? 30);
  const [completion, setCompletion] = useState<CompletionRule>(src?.completion ?? 'confirm');
  const initialDays = routine?.weekdays ?? [];
  const [weekdays, setWeekdays] = useState<Weekday[]>(initialDays);
  const [step, setStep] = useState<'form' | 'scope' | 'delete'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSeriesEdit = target.mode === 'edit' && !!target.activity.seriesId;
  const daysChanged = weekdays.slice().sort().join() !== initialDays.slice().sort().join();
  const fields: ActivityFields = { title, description, category: cat, plannedStart: start, plannedDuration: duration, completion };
  const sheetTitle = target.mode === 'create' ? 'Neue Aktivität' : target.mode === 'series' ? 'Routine bearbeiten' : 'Aktivität bearbeiten';

  async function act(fn: (r: Repo) => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await run(fn);
      onDone(msg);
    } catch (e) {
      setError(errorText(e));
      setStep('form');
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!title.trim()) return setError('Bitte gib einen Titel ein.');
    if (target.mode === 'create') {
      return act((r) => r.createActivity(fields, date, weekdays), weekdays.length ? 'Routine angelegt' : 'Aktivität geplant');
    }
    if (target.mode === 'series') {
      if (!weekdays.length) return setError('Bitte wähle mindestens einen Wochentag.');
      return act((r) => r.updateSeriesFrom(target.seriesId, target.fromDate, fields, weekdays), 'Routine ab ' + formatDayShort(target.fromDate) + ' geändert');
    }
    if (isSeriesEdit) return setStep('scope');
    return act((r) => r.updateSingle(target.activity.id, fields, date), 'Gespeichert');
  }

  const toggleDay = (d: Weekday) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  if (step === 'scope' && target.mode === 'edit') {
    const a = target.activity;
    return (
      <Sheet title="Was soll sich ändern?" onClose={onClose}>
        <p className="small" style={{ marginTop: 0 }}>„{a.title}“ gehört zu einer Routine. Vergangene Einträge bleiben in jedem Fall unverändert.</p>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="stack">
          <button className="btn block lg" disabled={busy || daysChanged}
            onClick={() => act((r) => r.updateSingle(a.id, fields, date), 'Nur dieser Termin geändert')}>
            Nur dieser Termin
          </button>
          {daysChanged && <p className="hint">Geänderte Wochentage betreffen immer die Serie.</p>}
          <button className="btn block lg primary" disabled={busy}
            onClick={() => act((r) => r.updateSeriesFrom(a.seriesId!, a.seriesDate ?? a.date, fields, weekdays.length ? weekdays : initialDays), 'Dieser und alle folgenden Termine geändert')}>
            {busy ? <Spinner label="Speichern…" /> : 'Dieser und alle folgenden'}
          </button>
          <button className="btn block ghost" onClick={() => setStep('form')}>Zurück</button>
        </div>
      </Sheet>
    );
  }

  if (step === 'delete') {
    const a = target.mode === 'edit' ? target.activity : null;
    const seriesId = a?.seriesId ?? (target.mode === 'series' ? target.seriesId : null);
    const from = a ? a.seriesDate ?? a.date : target.mode === 'series' ? target.fromDate : today;
    return (
      <Sheet title={seriesId ? 'Was soll entfernt werden?' : 'Aktivität löschen?'} onClose={onClose}>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="stack">
          {a && (
            <button className="btn block lg danger" disabled={busy} onClick={() => act((r) => r.deleteActivity(a.id), 'Termin gelöscht')}>
              {seriesId ? 'Nur diesen Termin' : 'Löschen'}
            </button>
          )}
          {seriesId && (
            <button className="btn block lg danger" disabled={busy} onClick={() => act((r) => r.endSeriesFrom(seriesId, from), 'Routine beendet')}>
              {a ? 'Diesen und alle folgenden' : `Routine ab ${formatDayShort(from)} beenden`}
            </button>
          )}
          <p className="hint">Erledigte Einträge und verdiente XP bleiben im Verlauf erhalten.</p>
          <button className="btn block ghost" onClick={() => setStep('form')}>Abbrechen</button>
        </div>
      </Sheet>
    );
  }

  const canDelete = target.mode === 'series' || (target.mode === 'edit' && target.activity.status !== 'done');

  return (
    <Sheet title={sheetTitle} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="field">
          <span>Titel</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Kochen & Essen" autoFocus={target.mode === 'create'} enterKeyHint="next" maxLength={80} />
        </label>
        <label className="field">
          <span>Beschreibung (optional)</span>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
        </label>

        <div className="field">
          <span className="field-label">Kategorie</span>
          <div className="choices">
            {CATEGORIES.map((c) => (
              <button type="button" key={c.id} className="choice" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                <span aria-hidden="true">{c.icon}</span>{c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid2">
          {target.mode !== 'series' && (
            <label className="field">
              <span>{weekdays.length && target.mode === 'create' ? 'Beginnt am' : 'Datum'}</span>
              <input className="input" type="date" value={date} min={target.mode === 'create' ? today : undefined} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Startzeit</span>
            <input className="input" type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
        </div>

        <div className="field">
          <span className="field-label">Dauer</span>
          <div className="choices">
            {DURATIONS.map((d) => (
              <button type="button" key={d} className="choice" aria-pressed={duration === d} onClick={() => setDuration(d)}>{d < 60 ? `${d} Min.` : `${d / 60} Std.`.replace('1.5', '1,5')}</button>
            ))}
            <input className="input" style={{ width: 96, minHeight: 42, borderRadius: 21 }} type="number" inputMode="numeric" min={5} max={720} step={5}
              aria-label="Dauer in Minuten" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
          </div>
        </div>

        {(target.mode !== 'edit' || isSeriesEdit) && (
          <div className="field">
            <span className="field-label">Wiederholen</span>
            <div className="choices">
              {ALL_DAYS.map((d) => (
                <button type="button" key={d} className="choice round" aria-pressed={weekdays.includes(d)} onClick={() => toggleDay(d)}>{WEEKDAY_SHORT[d]}</button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn sm" onClick={() => setWeekdays([...ALL_DAYS])}>Täglich</button>
              <button type="button" className="btn sm" onClick={() => setWeekdays([1, 2, 3, 4, 5])}>Mo–Fr</button>
              {target.mode === 'create' && <button type="button" className="btn sm" onClick={() => setWeekdays([])}>Einmalig</button>}
            </div>
            <p className="hint">
              {weekdays.length === 0
                ? 'Einmalige Aktivität.'
                : `Routine: erzeugt jeden ${[...weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(', ')} einen eigenen Termin.`}
              {target.mode === 'create' && weekdays.length > 0 && !weekdays.includes(weekdayOf(date)) && ' Am gewählten Startdatum selbst ist kein Termin vorgesehen.'}
            </p>
          </div>
        )}

        <div className="field">
          <span className="field-label">Abschluss</span>
          <div className="segmented">
            <button type="button" aria-pressed={completion === 'confirm'} onClick={() => setCompletion('confirm')}>Bestätigen</button>
            <button type="button" aria-pressed={completion === 'photo'} onClick={() => setCompletion('photo')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="camera" size={16} />Foto Pflicht</span>
            </button>
          </div>
          <p className="hint">{completion === 'photo' ? 'Abschluss erst nach gespeichertem Foto möglich.' : 'Mit einem Tipp abhaken.'} Ergibt <b style={{ color: 'var(--gold)' }}>{xpFor(fields)} XP</b>.</p>
        </div>

        {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}
        <button className="btn block lg primary" type="submit" disabled={busy}>
          {busy ? <Spinner label="Speichern…" /> : target.mode === 'create' ? 'Planen' : 'Speichern'}
        </button>
        {canDelete && (
          <button type="button" className="btn block ghost danger" style={{ marginTop: 8 }} onClick={() => setStep('delete')}>
            {target.mode === 'series' ? 'Routine beenden' : 'Löschen'}
          </button>
        )}
      </form>
    </Sheet>
  );
}
