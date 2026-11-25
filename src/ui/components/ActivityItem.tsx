import type { CSSProperties } from 'react';
import { category } from '../../domain/categories';
import { endTime, formatDuration, isoToTime, relativeDayLabel } from '../../domain/dates';
import type { Activity, DateKey } from '../../domain/types';
import { xpFor } from '../../domain/xp';
import { Icon, PhotoThumb } from './ui';

export function catStyle(a: { category: Activity['category'] }): CSSProperties {
  return { ['--cat' as string]: category(a.category).color };
}

export function StatusMark({ a }: { a: Activity }) {
  if (a.status === 'done') return <span className="check done" aria-label="Erledigt"><Icon name="check" size={18} stroke={2.6} /></span>;
  if (a.status === 'skipped') return <span className="check skip" aria-label="Übersprungen"><Icon name="skip" size={14} /></span>;
  if (a.status === 'started') return <span className="chip ok"><span className="pulse" />läuft</span>;
  return null;
}

export function ActivityItem({
  a, today, onClick, showDate, overdue,
}: { a: Activity; today: DateKey; onClick?: () => void; showDate?: boolean; overdue?: boolean }) {
  const cat = category(a.category);
  const finished = a.status === 'done' || a.status === 'skipped';
  return (
    <button className={`item ${finished ? 'dim' : ''} ${a.status === 'skipped' ? 'skipped' : ''}`} style={catStyle(a)} onClick={onClick}>
      <div className="time">
        {a.plannedStart}
        <small>{showDate ? relativeDayLabel(a.date, today) : endTime(a.plannedStart, a.plannedDuration)}</small>
      </div>
      <div className="bar" />
      <div className="body">
        <div className="title">{a.title}</div>
        <div className="sub">
          <span>{cat.icon} {cat.label}</span>
          <span>· {formatDuration(a.plannedDuration)}</span>
          {a.seriesId && <span aria-label="Routine"><Icon name="repeat" size={13} /></span>}
          {a.completion === 'photo' && a.status !== 'done' && <span className="chip warn"><Icon name="camera" size={12} />Foto</span>}
          {a.status === 'done' && a.actualEnd && <span>· erledigt {isoToTime(a.actualEnd)}</span>}
          {overdue && <span className="chip danger">überfällig</span>}
        </div>
      </div>
      <div className="trail">
        {a.status === 'done' && a.photoId && <PhotoThumb photoId={a.photoId} size={40} />}
        {a.status === 'done' ? <span className="chip xp">+{a.xpAwarded}</span> : !finished && <span className="chip xp">{xpFor(a)} XP</span>}
        <StatusMark a={a} />
      </div>
    </button>
  );
}
