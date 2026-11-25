import { useState } from 'react';
import { errorText, useStore } from '../../data/store';
import { category } from '../../domain/categories';
import { addDays, endTime, formatDayLong, formatDuration, isoToTime, minutesToTime, nowMinutes, relativeDayLabel } from '../../domain/dates';
import type { Activity, DateKey, DayReview } from '../../domain/types';
import { xpFor } from '../../domain/xp';
import { Banner, Icon, Sheet, Spinner, usePhotoUrl } from '../components/ui';

// ---------- Verschieben / neu einplanen ----------
export function RescheduleSheet({ activity, onClose, onDone }: { activity: Activity; onClose: () => void; onDone: (msg: string) => void }) {
  const { run, today } = useStore();
  const [date, setDate] = useState<DateKey>(activity.date < today ? today : activity.date);
  const [time, setTime] = useState(activity.plannedStart);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rounded = Math.ceil((nowMinutes() + 5) / 15) * 15;
  const quick: { label: string; date: DateKey; time: string }[] = [];
  if (rounded < 24 * 60) quick.push({ label: `Gleich (${minutesToTime(rounded)})`, date: today, time: minutesToTime(rounded) });
  if (rounded + 60 < 24 * 60) quick.push({ label: `In 1 Std. (${minutesToTime(rounded + 60)})`, date: today, time: minutesToTime(rounded + 60) });
  if (nowMinutes() < 19 * 60) quick.push({ label: 'Heute 20:00', date: today, time: '20:00' });
  quick.push({ label: `Morgen ${activity.plannedStart}`, date: addDays(today, 1), time: activity.plannedStart });

  async function save(d: DateKey, t: string) {
    setBusy(true);
    setError(null);
    try {
      await run((r) => r.rescheduleActivity(activity.id, d, t));
      onDone(`Verschoben auf ${relativeDayLabel(d, today)}, ${t}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title={activity.date < today ? 'Neu einplanen' : 'Verschieben'} onClose={onClose}>
      <p className="small" style={{ marginTop: -6 }}>{activity.title} · bisher {relativeDayLabel(activity.date, today)}, {activity.plannedStart}</p>
      <div className="stack">
        {quick.map((q) => (
          <button key={q.label} className="btn block lg" disabled={busy} onClick={() => save(q.date, q.time)}>{q.label}</button>
        ))}
      </div>
      <div className="section-title">Eigener Termin</div>
      <div className="grid2">
        <label className="field"><span>Datum</span><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label className="field"><span>Uhrzeit</span><input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} /></label>
      </div>
      {activity.seriesId && <p className="hint" style={{ marginTop: -8, marginBottom: 12 }}>Betrifft nur diesen Termin, nicht die Routine.</p>}
      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}
      <button className="btn block lg primary" disabled={busy} onClick={() => save(date, time)}>{busy ? <Spinner label="Speichern…" /> : 'Übernehmen'}</button>
    </Sheet>
  );
}

// ---------- Tagesabschluss ----------
export function ReviewSheet({ date, onClose, onDone }: { date: DateKey; onClose: () => void; onDone: (msg: string) => void }) {
  const { run, data } = useStore();
  const existing = data.reviews.find((r) => r.date === date);
  const [energy, setEnergy] = useState<DayReview['energy']>(existing?.energy ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = ['erschöpft', 'müde', 'okay', 'gut', 'voller Energie'];

  async function save() {
    setBusy(true);
    try {
      await run((r) => r.saveReview(date, energy, note));
      onDone('Tagesabschluss gespeichert');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Tagesabschluss" onClose={onClose}>
      <p className="small" style={{ marginTop: -6 }}>{formatDayLong(date)}</p>
      <div className="field">
        <span className="field-label">Wie war deine Energie?</span>
        <div className="energy">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={energy === n} aria-label={`${n} – ${labels[n - 1]}`} onClick={() => setEnergy(energy === n ? null : (n as DayReview['energy']))}>{n}</button>
          ))}
        </div>
        <p className="hint">{energy ? labels[energy - 1] : '1 = erschöpft · 5 = voller Energie'}</p>
      </div>
      <label className="field">
        <span>Notiz</span>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Was war heute gut? Was nimmst du mit?" maxLength={1000} />
      </label>
      {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}
      <button className="btn block lg primary" disabled={busy || (!energy && !note.trim())} onClick={save}>{busy ? <Spinner label="Speichern…" /> : 'Speichern'}</button>
    </Sheet>
  );
}

// ---------- Details & Aktionen ----------
export interface DetailActions {
  start: (a: Activity) => void;
  complete: (a: Activity) => void;
  reschedule: (a: Activity) => void;
  skip: (a: Activity) => void;
  reopen: (a: Activity) => void;
  edit: (a: Activity) => void;
}

export function DetailSheet({ activity, onClose, actions }: { activity: Activity; onClose: () => void; actions: DetailActions }) {
  const { today, run } = useStore();
  const { url, state } = usePhotoUrl(activity.photoId);
  const cat = category(activity.category);
  const [note, setNote] = useState(activity.note);
  const [saved, setSaved] = useState(false);
  const open = activity.status === 'planned' || activity.status === 'started';
  const go = (fn: (a: Activity) => void) => () => { onClose(); fn(activity); };

  return (
    <Sheet title={activity.title} onClose={onClose}>
      <div className="row wrap" style={{ gap: 6, marginTop: -6, marginBottom: 14 }}>
        <span className="chip">{cat.icon} {cat.label}</span>
        {activity.seriesId && <span className="chip"><Icon name="repeat" size={12} />Routine</span>}
        {activity.completion === 'photo' && <span className="chip warn"><Icon name="camera" size={12} />Foto Pflicht</span>}
        {activity.status === 'done' ? <span className="chip xp">+{activity.xpAwarded} XP</span> : <span className="chip xp">{xpFor(activity)} XP</span>}
        {activity.status === 'skipped' && <span className="chip">übersprungen</span>}
      </div>

      {activity.photoId && (
        <div style={{ marginBottom: 14 }}>
          {state === 'ready' && url ? <img className="photo-full" src={url} alt={`Foto zu ${activity.title}`} />
            : state === 'missing' ? <Banner kind="warn">Das Foto konnte nicht geladen werden.</Banner>
            : <div className="center" style={{ minHeight: 160 }}><Spinner label="Foto wird geladen…" /></div>}
        </div>
      )}

      {activity.description && <p style={{ marginTop: 0, color: 'var(--ink-2)' }}>{activity.description}</p>}

      <div className="card" style={{ marginBottom: 14 }}>
        <dl className="kv">
          <dt>Tag</dt><dd>{relativeDayLabel(activity.date, today)}{activity.seriesDate && activity.seriesDate !== activity.date ? ` (verschoben von ${relativeDayLabel(activity.seriesDate, today)})` : ''}</dd>
          <dt>Geplant</dt><dd>{activity.plannedStart}–{endTime(activity.plannedStart, activity.plannedDuration)} · {formatDuration(activity.plannedDuration)}</dd>
          {(activity.actualStart || activity.actualEnd) && (
            <><dt>Tatsächlich</dt><dd>{activity.actualStart ? isoToTime(activity.actualStart) : '–'}–{activity.actualEnd ? isoToTime(activity.actualEnd) : 'läuft'}</dd></>
          )}
          {activity.completedAt && <><dt>Abgeschlossen</dt><dd>{new Date(activity.completedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</dd></>}
        </dl>
      </div>

      {open && (
        <div className="stack">
          <button className="btn block lg primary" onClick={go(actions.complete)}>
            {activity.completion === 'photo' ? <><Icon name="camera" size={20} />Mit Foto abschließen</> : <><Icon name="check" size={20} />Abschließen</>}
          </button>
          <div className="row">
            {activity.status === 'planned' && <button className="btn" onClick={go(actions.start)}><Icon name="play" size={18} />Starten</button>}
            <button className="btn" onClick={go(actions.reschedule)}><Icon name="clock" size={18} />Verschieben</button>
          </div>
          <div className="row">
            <button className="btn" onClick={go(actions.skip)}><Icon name="skip" size={18} />Überspringen</button>
            <button className="btn" onClick={go(actions.edit)}><Icon name="edit" size={18} />Bearbeiten</button>
          </div>
        </div>
      )}
      {activity.status === 'skipped' && (
        <div className="row">
          <button className="btn" onClick={go(actions.reopen)}>Wieder öffnen</button>
          <button className="btn" onClick={go(actions.reschedule)}>Neu einplanen</button>
        </div>
      )}
      {activity.status === 'done' && (
        <>
          <label className="field">
            <span>Notiz</span>
            <textarea className="input" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} maxLength={1000} />
          </label>
          {note !== activity.note && !saved && (
            <button className="btn block" onClick={async () => { await run((r) => r.updateNote(activity.id, note)); setSaved(true); }}>Notiz speichern</button>
          )}
          {saved && <p className="hint">Notiz gespeichert.</p>}
        </>
      )}
    </Sheet>
  );
}
