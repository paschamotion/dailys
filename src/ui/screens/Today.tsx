import { useStore } from '../../data/store';
import { category } from '../../domain/categories';
import { endTime, formatDayLong, formatDuration, isoToTime, timeToMinutes } from '../../domain/dates';
import { buildTodayView } from '../../domain/today';
import type { Activity } from '../../domain/types';
import { xpFor } from '../../domain/xp';
import { useActions } from '../actions';
import { ActivityItem, catStyle } from '../components/ActivityItem';
import { Empty, Icon, ProgressRing, XpBar } from '../components/ui';

function greeting(min: number) {
  if (min < 11 * 60) return 'Guten Morgen';
  if (min < 17 * 60) return 'Guten Tag';
  return 'Guten Abend';
}

function untilText(a: Activity, nowMin: number) {
  const diff = timeToMinutes(a.plannedStart) - nowMin;
  if (diff <= 0) return 'jetzt';
  if (diff < 60) return `in ${diff} Min.`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `in ${h} Std.${m ? ` ${m} Min.` : ''}`;
}

export function TodayScreen() {
  const { data, derived, today, nowMin } = useStore();
  const act = useActions();
  const view = buildTodayView(data.activities, today, nowMin);
  const lvl = derived.level;
  const review = data.reviews.find((r) => r.date === today);
  const nothingToday = view.totalCount === 0 && view.finished.length === 0 && !view.current && view.overdue.length === 0;
  const hero = view.current ?? view.next;
  const heroIsCurrent = !!view.current;
  const following = heroIsCurrent ? view.next : view.rest[0] ?? null;
  const rest = heroIsCurrent ? view.rest : view.rest.slice(1);
  const showReview = !review && (nowMin >= 18 * 60 || (view.totalCount > 0 && view.doneCount === view.totalCount));

  return (
    <div className="screen">
      <header className="head">
        <div>
          <div className="eyebrow">{formatDayLong(today)}</div>
          <h1>{greeting(nowMin)}</h1>
        </div>
        <button className="icon-btn accent" aria-label="Aktivität planen" onClick={() => act.create(today)}><Icon name="plus" /></button>
      </header>

      <section className="card summary" aria-label="Tagesfortschritt">
        <ProgressRing value={view.totalCount ? view.doneCount / view.totalCount : 0}>
          {view.doneCount}/{view.totalCount}
        </ProgressRing>
        <div className="stats">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="level-badge" aria-label={`Level ${lvl.level}`}>{lvl.level}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Level {lvl.level}</div>
              <div className="small">{lvl.intoLevel} / {lvl.levelSpan} XP · heute +{view.earnedXpToday}</div>
            </div>
            {derived.routineDayStreak.current > 0 && (
              <span className="chip xp" title="Erfüllte Routinetage in Folge"><Icon name="flame" size={13} />{derived.routineDayStreak.current}</span>
            )}
          </div>
          <XpBar progress={lvl.progress} />
        </div>
      </section>

      {view.overdue.length > 0 && (
        <section>
          <div className="section-title">
            <span>Überfällig · {view.overdue.length}</span>
            {view.overdue.length > 1 && <button className="btn ghost sm" onClick={() => act.skipMany(view.overdue)}>Alle überspringen</button>}
          </div>
          {view.overdue.map((a) => (
            <div key={a.id} className="card" style={{ ...catStyle(a), padding: 12 }}>
              <ActivityItem a={a} today={today} showDate={a.date !== today} overdue onClick={() => act.detail(a)} />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={() => act.reschedule(a)}>Neu einplanen</button>
                <button className="btn sm" onClick={() => act.complete(a)}>Erledigt</button>
                <button className="btn sm" onClick={() => act.skip(a)}>Überspringen</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {hero && (
        <section aria-label={heroIsCurrent ? 'Aktuelle Aktivität' : 'Nächste Aktivität'}>
          <div className="section-title">{heroIsCurrent ? 'Jetzt' : 'Als Nächstes'}</div>
          <HeroCard a={hero} isCurrent={heroIsCurrent} nowMin={nowMin} />
        </section>
      )}

      {following && (
        <section>
          <div className="section-title">Danach</div>
          <ActivityItem a={following} today={today} onClick={() => act.detail(following)} />
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <div className="section-title">Restlicher Tag</div>
          {rest.map((a) => <ActivityItem key={a.id} a={a} today={today} onClick={() => act.detail(a)} />)}
        </section>
      )}

      {!hero && !nothingToday && view.totalCount > 0 && view.doneCount === view.totalCount && (
        <div className="card" style={{ marginTop: 16 }}>
          <Empty glyph="✓" title="Alles geschafft" text="Für heute ist nichts mehr offen. Gönn dir eine Pause." />
        </div>
      )}

      {nothingToday && (
        <div className="card" style={{ marginTop: 16 }}>
          <Empty glyph="☼" title="Noch nichts geplant" text="Plane deine erste Aktivität für heute – zum Beispiel eine Mahlzeit, ein Training oder eine kleine Haushaltsaufgabe."
            action={<button className="btn primary" onClick={() => act.create(today)}><Icon name="plus" size={18} />Aktivität planen</button>} />
        </div>
      )}

      {showReview && (
        <section>
          <div className="section-title">Tagesabschluss</div>
          <button className="item" onClick={() => act.review(today)}>
            <div className="body">
              <div className="title">Wie war dein Tag?</div>
              <div className="sub">Energie 1–5 und eine kurze Notiz · optional</div>
            </div>
            <Icon name="chevR" size={20} />
          </button>
        </section>
      )}

      {view.finished.length > 0 && (
        <section>
          <div className="section-title">Erledigt & übersprungen · {view.finished.length}</div>
          {view.finished.map((a) => <ActivityItem key={a.id} a={a} today={today} onClick={() => act.detail(a)} />)}
        </section>
      )}
    </div>
  );
}

function HeroCard({ a, isCurrent, nowMin }: { a: Activity; isCurrent: boolean; nowMin: number }) {
  const act = useActions();
  const cat = category(a.category);
  const started = a.status === 'started';
  return (
    <article className="card hero" style={catStyle(a)}>
      <div className="label">
        {started ? <><span className="pulse" />Läuft seit {a.actualStart ? isoToTime(a.actualStart) : '–'}</> : isCurrent ? <>{cat.icon} {cat.label} · jetzt</> : <>{cat.icon} {cat.label} · {untilText(a, nowMin)}</>}
      </div>
      <h2>{a.title}</h2>
      <div className="meta">
        <span>{a.plannedStart}–{endTime(a.plannedStart, a.plannedDuration)}</span>
        <span>{formatDuration(a.plannedDuration)}</span>
        <span className="chip xp">{xpFor(a)} XP</span>
        {a.completion === 'photo' && <span className="chip warn"><Icon name="camera" size={12} />Foto Pflicht</span>}
      </div>
      {a.description && <p className="desc">{a.description}</p>}
      <div className="actions stack">
        <div className="row">
          {!started && <button className="btn lg" onClick={() => act.start(a)}><Icon name="play" size={18} />Starten</button>}
          <button className="btn lg primary" onClick={() => act.complete(a)}>
            {a.completion === 'photo' ? <><Icon name="camera" size={20} />Foto & fertig</> : <><Icon name="check" size={20} />Erledigt</>}
          </button>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => act.reschedule(a)}><Icon name="clock" size={16} />Verschieben</button>
          <button className="btn sm" onClick={() => act.skip(a)}><Icon name="skip" size={16} />Überspringen</button>
          <button className="btn sm" onClick={() => act.edit(a)} aria-label="Bearbeiten"><Icon name="edit" size={16} /></button>
        </div>
      </div>
    </article>
  );
}
