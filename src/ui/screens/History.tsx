import { useState } from 'react';
import { useStore } from '../../data/store';
import { WEEKDAY_SHORT, addDays, formatDayLong, formatDayShort, isoToTime, startOfWeek } from '../../domain/dates';
import { instanceId, routineCoversDate } from '../../domain/recurrence';
import { sortByTime } from '../../domain/today';
import type { Activity, DateKey, Routine, Weekday } from '../../domain/types';
import { useActions } from '../actions';
import { catStyle } from '../components/ActivityItem';
import { Empty, Icon, PhotoThumb } from '../components/ui';

export function HistoryScreen() {
  const { today } = useStore();
  const [tab, setTab] = useState<'day' | 'week'>('day');
  const [date, setDate] = useState<DateKey>(today);
  return (
    <div className="screen">
      <header className="head"><div><div className="eyebrow">Verlauf</div><h1>{tab === 'day' ? 'Tagesrückblick' : 'Wochenübersicht'}</h1></div></header>
      <div className="segmented" role="group" aria-label="Ansicht">
        <button aria-pressed={tab === 'day'} onClick={() => setTab('day')}>Tag</button>
        <button aria-pressed={tab === 'week'} onClick={() => setTab('week')}>Woche</button>
      </div>
      {tab === 'day' ? <DayReviewView date={date} setDate={setDate} /> : <WeekView date={date} setDate={setDate} onPickDay={(d) => { setDate(d); setTab('day'); }} />}
    </div>
  );
}

function Stepper({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 4px' }}>
      <button className="icon-btn" onClick={onPrev} aria-label="Zurück"><Icon name="chevL" /></button>
      <div style={{ fontWeight: 600, fontSize: 17 }}>{label}</div>
      <button className="icon-btn" onClick={onNext} disabled={nextDisabled} aria-label="Weiter" style={{ opacity: nextDisabled ? 0.35 : 1 }}><Icon name="chevR" /></button>
    </div>
  );
}

function DayReviewView({ date, setDate }: { date: DateKey; setDate: (d: DateKey) => void }) {
  const { data, today } = useStore();
  const act = useActions();
  const list = sortByTime(data.activities.filter((a) => a.date === date && !a.deleted));
  const done = list.filter((a) => a.status === 'done');
  const skipped = list.filter((a) => a.status === 'skipped');
  const open = list.filter((a) => a.status === 'planned' || a.status === 'started');
  const xp = done.reduce((s, a) => s + a.xpAwarded, 0);
  const review = data.reviews.find((r) => r.date === date);

  return (
    <>
      <Stepper label={date === today ? 'Heute' : formatDayLong(date)} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} nextDisabled={date >= today} />
      <div className="statgrid" style={{ marginTop: 10 }}>
        <div className="stat"><b>{done.length}</b><span>erledigt</span></div>
        <div className="stat"><b>{skipped.length}</b><span>übersprungen</span></div>
        <div className="stat"><b style={{ color: 'var(--gold)' }}>+{xp}</b><span>XP</span></div>
      </div>

      <div className="section-title">Tagesabschluss</div>
      <button className="item" onClick={() => act.review(date)}>
        <div className="body">
          {review && (review.energy || review.note) ? (
            <>
              <div className="title">{review.energy ? `Energie ${review.energy}/5` : 'Notiz'}</div>
              {review.note && <div className="sub" style={{ whiteSpace: 'normal' }}>{review.note}</div>}
            </>
          ) : (
            <><div className="title">Noch kein Tagesabschluss</div><div className="sub">Energie und Notiz festhalten · optional</div></>
          )}
        </div>
        <Icon name="edit" size={18} />
      </button>

      {list.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}><Empty glyph="◌" title="Keine Einträge" text="An diesem Tag wurden keine Aktivitäten geplant oder dokumentiert." /></div>
      )}

      {done.length > 0 && <div className="section-title">Erledigt</div>}
      {done.map((a) => <HistoryEntry key={a.id} a={a} onClick={() => act.detail(a)} />)}

      {skipped.length > 0 && <div className="section-title">Übersprungen</div>}
      {skipped.map((a) => <HistoryEntry key={a.id} a={a} onClick={() => act.detail(a)} />)}

      {open.length > 0 && <div className="section-title">{date < today ? 'Nicht erledigt' : 'Noch offen'}</div>}
      {open.map((a) => <HistoryEntry key={a.id} a={a} onClick={() => act.detail(a)} />)}
    </>
  );
}

function HistoryEntry({ a, onClick }: { a: Activity; onClick: () => void }) {
  return (
    <button className={`item ${a.status === 'skipped' ? 'dim skipped' : ''}`} style={{ ...catStyle(a), alignItems: 'flex-start' }} onClick={onClick}>
      <div className="bar" />
      <div className="body">
        <div className="title">{a.title}</div>
        <div className="sub">
          <span>geplant {a.plannedStart}</span>
          {a.status === 'done' && <span>· tatsächlich {a.actualStart ? isoToTime(a.actualStart) : '–'}–{a.actualEnd ? isoToTime(a.actualEnd) : '–'}</span>}
          {a.status === 'done' && <span className="chip xp">+{a.xpAwarded} XP</span>}
        </div>
        {a.note && <div style={{ marginTop: 6, fontSize: 14, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>„{a.note}“</div>}
      </div>
      {a.photoId && <PhotoThumb photoId={a.photoId} size={64} />}
    </button>
  );
}

function WeekView({ date, setDate, onPickDay }: { date: DateKey; setDate: (d: DateKey) => void; onPickDay: (d: DateKey) => void }) {
  const { data, derived, today } = useStore();
  const week = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byId = new Map(data.activities.map((a) => [a.id, a]));

  const perDay = days.map((d) => {
    const l = data.activities.filter((a) => a.date === d && !a.deleted);
    const done = l.filter((a) => a.status === 'done');
    return { d, total: l.filter((a) => a.status !== 'skipped').length, done: done.length, xp: done.reduce((s, a) => s + a.xpAwarded, 0) };
  });
  const weekXp = perDay.reduce((s, x) => s + x.xp, 0);
  const weekDone = perDay.reduce((s, x) => s + x.done, 0);
  const fulfilled = days.filter((d) => derived.routineDayStreak.perDay.get(d) === 'hit').length;
  const max = Math.max(1, ...perDay.map((x) => x.total));

  // Routinen, die in dieser Woche vorgesehen waren
  const segs = data.routines.filter((r) => r.startDate <= days[6] && (!r.endDate || r.endDate >= days[0]));
  const series = new Map<string, Routine[]>();
  for (const r of segs) series.set(r.seriesId, [...(series.get(r.seriesId) ?? []), r]);

  const cellFor = (seriesId: string, rs: Routine[], d: DateKey) => {
    if (derived.freeDaySet.has(d) && rs.some((r) => routineCoversDate(r, d))) return { cls: 'free', txt: 'frei' };
    if (!rs.some((r) => routineCoversDate(r, d))) return { cls: 'none', txt: '·' };
    const a = byId.get(instanceId(seriesId, d));
    if (a?.deleted) return { cls: 'none', txt: '–' };
    if (a?.status === 'done') return { cls: 'hit', txt: '✓' };
    if (a?.status === 'skipped' || d < today) return { cls: 'miss', txt: '✕' };
    return { cls: 'open', txt: '' };
  };
  const energy = (d: DateKey) => data.reviews.find((r) => r.date === d)?.energy ?? null;

  return (
    <>
      <Stepper label={`${formatDayShort(days[0])} – ${formatDayShort(days[6])}`} onPrev={() => setDate(addDays(date, -7))} onNext={() => setDate(addDays(date, 7))} nextDisabled={days[6] >= today} />
      <div className="statgrid" style={{ marginTop: 10 }}>
        <div className="stat"><b>{weekDone}</b><span>erledigt</span></div>
        <div className="stat"><b>{fulfilled}</b><span>Routinetage erfüllt</span></div>
        <div className="stat"><b style={{ color: 'var(--gold)' }}>+{weekXp}</b><span>XP</span></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="bars" aria-label="Erledigte Aktivitäten pro Tag">
          {perDay.map((x, i) => (
            <button key={x.d} className="col" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => onPickDay(x.d)} aria-label={`${formatDayLong(x.d)}: ${x.done} von ${x.total} erledigt`}>
              <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{x.total ? `${x.done}/${x.total}` : ''}</span>
              <div className="track" style={{ maxHeight: `${(Math.max(x.total, 0.3) / max) * 100}%` }}>
                <div className="fill" style={{ height: x.total ? `${(x.done / x.total) * 100}%` : 0 }} />
              </div>
              <span className={`lbl ${x.d === today ? 'today' : ''}`}>{WEEKDAY_SHORT[(i + 1) as Weekday]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Routinen</div>
      {series.size === 0 ? (
        <div className="card"><Empty glyph="↻" title="Keine Routinen in dieser Woche" text="Lege in der Planung eine Routine an, um hier deine Serien zu sehen." /></div>
      ) : (
        <div className="card">
          <div className="weekgrid">
            <div />
            {days.map((d, i) => <div key={d} className="h">{WEEKDAY_SHORT[(i + 1) as Weekday]}</div>)}
            {[...series.entries()].map(([sid, rs]) => (
              <Row key={sid} name={rs[rs.length - 1].title} cells={days.map((d) => cellFor(sid, rs, d))} />
            ))}
            <div className="name" style={{ color: 'var(--muted)' }}>Energie</div>
            {days.map((d) => <div key={d} className="cell" style={{ color: 'var(--muted)', fontWeight: 700 }}>{energy(d) ?? ''}</div>)}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>✓ erledigt · ✕ verpasst/übersprungen · ○ offen · frei = freier Tag · Punkt = nicht vorgesehen</p>
        </div>
      )}
    </>
  );
}

function Row({ name, cells }: { name: string; cells: { cls: string; txt: string }[] }) {
  return (
    <>
      <div className="name">{name}</div>
      {cells.map((c, i) => <div key={i} className={`cell ${c.cls}`}>{c.txt}</div>)}
    </>
  );
}
