import { useEffect, useState } from 'react';
import { errorText, useStore } from '../../data/store';
import { category } from '../../domain/categories';
import { WEEKDAY_SHORT, addDays, formatDayLong, parseDateKey, startOfWeek } from '../../domain/dates';
import { sortByTime } from '../../domain/today';
import type { DateKey, Routine } from '../../domain/types';
import { xpFor } from '../../domain/xp';
import { useActions } from '../actions';
import { ActivityItem } from '../components/ActivityItem';
import { Empty, Icon, useToast } from '../components/ui';

export function PlanScreen() {
  const [tab, setTab] = useState<'days' | 'routines'>('days');
  return (
    <div className="screen">
      <header className="head"><div><div className="eyebrow">Planung</div><h1>{tab === 'days' ? 'Dein Plan' : 'Routinen'}</h1></div></header>
      <div className="segmented" role="group" aria-label="Ansicht">
        <button aria-pressed={tab === 'days'} onClick={() => setTab('days')}>Tage</button>
        <button aria-pressed={tab === 'routines'} onClick={() => setTab('routines')}>Routinen</button>
      </div>
      {tab === 'days' ? <DaysView /> : <RoutinesView />}
    </div>
  );
}

export function WeekStrip({ selected, onSelect, today, dotFor }: {
  selected: DateKey; onSelect: (d: DateKey) => void; today: DateKey; dotFor?: (d: DateKey) => 'has' | 'full' | '' ;
}) {
  const { derived } = useStore();
  const week = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return (
    <div className="weekstrip" style={{ marginTop: 14 }}>
      <button className="nav" aria-label="Vorherige Woche" onClick={() => onSelect(addDays(selected, -7))}><Icon name="chevL" /></button>
      {days.map((d, i) => (
        <button key={d} className={`day-pill ${d === today ? 'today' : ''} ${derived.freeDaySet.has(d) ? 'free' : ''}`} aria-pressed={d === selected} onClick={() => onSelect(d)}
          aria-label={formatDayLong(d)}>
          <span className="wd">{WEEKDAY_SHORT[(i + 1) as 1]}</span>
          <span className="num">{parseDateKey(d).getDate()}</span>
          <span className={`dot ${dotFor?.(d) ?? ''}`} />
        </button>
      ))}
      <button className="nav" aria-label="Nächste Woche" onClick={() => onSelect(addDays(selected, 7))}><Icon name="chevR" /></button>
    </div>
  );
}

function DaysView() {
  const { data, derived, today, repo, refresh, run } = useStore();
  const act = useActions();
  const toast = useToast();
  const [selected, setSelected] = useState<DateKey>(today);
  const [loading, setLoading] = useState(false);

  // Zukünftige Wochen: fehlende Routinetermine bei Bedarf anlegen
  useEffect(() => {
    const end = addDays(startOfWeek(selected), 6);
    if (end < today) return;
    let alive = true;
    setLoading(true);
    repo.ensureInstances(startOfWeek(selected), end).then((n) => (n ? refresh() : undefined)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [selected, repo, refresh, today]);

  const list = sortByTime(data.activities.filter((a) => a.date === selected && !a.deleted));
  const isFree = derived.freeDaySet.has(selected);
  const dotFor = (d: DateKey) => {
    const l = data.activities.filter((a) => a.date === d && !a.deleted && a.status !== 'skipped');
    if (!l.length) return '';
    return l.every((a) => a.status === 'done') ? 'full' : 'has';
  };

  async function toggleFree() {
    try {
      await run((r) => r.setFreeDay(selected, !isFree));
      toast({ text: isFree ? 'Wieder ein normaler Tag' : 'Als freier Tag markiert – Serien laufen weiter' });
    } catch (e) {
      toast({ text: errorText(e) });
    }
  }

  return (
    <>
      <WeekStrip selected={selected} onSelect={setSelected} today={today} dotFor={dotFor} />
      <div className="section-title">
        <span>{formatDayLong(selected)}{loading ? ' · lädt…' : ''}</span>
        {selected >= today && <button className="btn ghost sm" onClick={toggleFree}>{isFree ? 'Freier Tag ✓' : 'Als frei markieren'}</button>}
      </div>
      {isFree && <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>Freier Tag: Routinen pausieren, ohne deine Serien zu unterbrechen.</p>}
      {list.length === 0 ? (
        <div className="card">
          <Empty glyph="◌" title={isFree ? 'Freier Tag' : 'Nichts geplant'} text={selected < today ? 'An diesem Tag gab es keine Aktivitäten.' : 'Füge eine einmalige Aktivität oder eine Routine hinzu.'}
            action={selected >= today ? <button className="btn primary" onClick={() => act.create(selected)}><Icon name="plus" size={18} />Aktivität planen</button> : undefined} />
        </div>
      ) : (
        <>
          {list.map((a) => <ActivityItem key={a.id} a={a} today={today} onClick={() => (a.status === 'done' ? act.detail(a) : act.edit(a))} />)}
          {selected >= today && (
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => act.create(selected)}><Icon name="plus" size={18} />Weitere Aktivität</button>
          )}
        </>
      )}
    </>
  );
}

function RoutinesView() {
  const { data, derived, today } = useStore();
  const act = useActions();
  const bySeries = new Map<string, Routine>();
  for (const r of [...data.routines].sort((a, b) => a.startDate.localeCompare(b.startDate))) bySeries.set(r.seriesId, r);
  const all = [...bySeries.values()];
  const active = all.filter((r) => !r.endDate || r.endDate >= today).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const ended = all.filter((r) => r.endDate && r.endDate < today);

  if (!all.length) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <Empty glyph="↻" title="Noch keine Routinen" text="Routinen wiederholen sich an ausgewählten Wochentagen und erzeugen dafür jeweils einen eigenen Termin."
          action={<button className="btn primary" onClick={() => act.create(today)}><Icon name="plus" size={18} />Routine anlegen</button>} />
      </div>
    );
  }

  const row = (r: Routine, ended = false) => {
    const s = derived.series.find((x) => x.seriesId === r.seriesId);
    const cat = category(r.category);
    return (
      <button key={r.seriesId} className={`item ${ended ? 'dim' : ''}`} style={{ ['--cat' as string]: cat.color }}
        onClick={() => !ended && act.editSeries(r.seriesId, today > r.startDate ? today : r.startDate)}>
        <div className="time">{r.plannedStart}</div>
        <div className="bar" />
        <div className="body">
          <div className="title">{r.title}</div>
          <div className="sub">
            <span>{r.weekdays.length === 7 ? 'täglich' : r.weekdays.map((d) => WEEKDAY_SHORT[d]).join(' ')}</span>
            {r.completion === 'photo' && <span className="chip warn"><Icon name="camera" size={12} />Foto</span>}
            <span className="chip xp">{xpFor(r)} XP</span>
            {ended && <span>beendet</span>}
          </div>
        </div>
        {s && (
          <div className="trail" title="Aktuelle Serie / Bestwert">
            <span className="chip xp"><Icon name="flame" size={12} />{s.current}</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      <div className="section-title"><span>Aktiv · {active.length}</span><button className="btn ghost sm" onClick={() => act.create(today)}>+ Neu</button></div>
      {active.map((r) => row(r))}
      <p className="hint">Änderungen an einer Routine gelten ab heute. Vergangene Einträge bleiben erhalten. Einzelne Termine änderst du im Tagesplan.</p>
      {ended.length > 0 && (
        <>
          <div className="section-title">Beendet</div>
          {ended.map((r) => row(r, true))}
        </>
      )}
    </>
  );
}
