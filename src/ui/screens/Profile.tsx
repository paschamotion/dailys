import { useEffect, useRef, useState } from 'react';
import { faults } from '../../data/repo';
import { errorText, useStore } from '../../data/store';
import { todayKey } from '../../domain/dates';
import { PHOTO_BONUS, XP_TIERS, xpForLevel } from '../../domain/xp';
import { Banner, Icon, Spinner, XpBar, useToast } from '../components/ui';

export function ProfileScreen() {
  const { data, derived, run, repo } = useStore();
  const toast = useToast();
  const lvl = derived.level;
  const done = data.activities.filter((a) => a.status === 'done' && !a.deleted);
  const photos = done.filter((a) => a.photoId).length;
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [simulate, setSimulate] = useState(faults.failPhotoSave);
  const fileRef = useRef<HTMLInputElement>(null);
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB belegt`);
    }).catch(() => undefined);
  }, [data]);

  async function doExport() {
    setBusy('export');
    try {
      const json = await repo.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const name = `tagwerk-sicherung-${todayKey()}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Tagwerk-Sicherung' }).catch(() => undefined);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e) {
      toast({ text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function doImport(f: File | undefined) {
    if (!f) return;
    if (!confirm('Sicherung einspielen? Alle aktuellen Daten auf diesem Gerät werden ersetzt.')) return;
    setBusy('import');
    try {
      const text = await f.text();
      await run((r) => r.importBackup(text));
      await repo.ensureDefaultWindow();
      toast({ text: 'Sicherung eingespielt' });
    } catch (e) {
      toast({ text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen">
      <header className="head"><div><div className="eyebrow">Profil</div><h1>Dein Fortschritt</h1></div></header>

      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="level-badge" style={{ width: 56, height: 56, fontSize: 26, borderRadius: 16 }}>{lvl.level}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>Level {lvl.level}</div>
            <div className="small">{lvl.totalXp} XP gesamt · noch {lvl.toNext} XP bis Level {lvl.level + 1}</div>
          </div>
        </div>
        <XpBar progress={lvl.progress} />
        <div className="small" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>{xpForLevel(lvl.level)} XP</span><span>{xpForLevel(lvl.level + 1)} XP</span>
        </div>
      </section>

      <div className="statgrid" style={{ marginTop: 10 }}>
        <div className="stat"><b>{done.length}</b><span>Aktivitäten</span></div>
        <div className="stat"><b>{derived.routineDayStreak.current}</b><span>Serie (Tage)</span></div>
        <div className="stat"><b>{photos}</b><span>Fotobelege</span></div>
      </div>

      <div className="section-title">Serien</div>
      <div className="card">
        <ul className="list-plain">
          <li><span>Erfüllte Routinetage in Folge</span><b>{derived.routineDayStreak.current} <span className="small">(Bestwert {derived.routineDayStreak.best})</span></b></li>
          {derived.series.map((s) => (
            <li key={s.seriesId}><span>{s.title}</span><b><Icon name="flame" size={14} /> {s.current} <span className="small">(Bestwert {s.best})</span></b></li>
          ))}
        </ul>
        <p className="hint">Serien zählen nur die vorgesehenen Wiederholungstage. Freie Tage und nicht vorgesehene Wochentage unterbrechen nichts. Überspringen oder Verpassen beendet die Serie – verdiente XP bleiben.</p>
      </div>

      <div className="section-title">Meilensteine · {derived.milestones.filter((m) => m.achieved).length}/{derived.milestones.length}</div>
      <div className="milestones">
        {derived.milestones.map(({ milestone: m, value, achieved }) => (
          <div key={m.id} className={`milestone ${achieved ? 'on' : ''}`}>
            <div className="ic" aria-hidden="true">{m.icon}</div>
            <b>{m.title}</b>
            <span>{m.description}</span>
            <div className="mini" aria-label={`${value} von ${m.target}`}><i style={{ width: `${(value / m.target) * 100}%` }} /></div>
            <span>{achieved ? 'erreicht' : `${value} / ${m.target}`}</span>
          </div>
        ))}
      </div>

      <div className="section-title">So entstehen XP</div>
      <div className="card">
        <ul className="list-plain">
          {XP_TIERS.map((t) => <li key={t.label}><span>Geplante Dauer {t.label}</span><b>{t.xp} XP</b></li>)}
          <li><span>Foto als Nachweis verlangt</span><b>+{PHOTO_BONUS} XP</b></li>
          <li><span>Von Level n zu n + 1</span><b>n × 100 XP</b></li>
        </ul>
        <p className="hint">Jede Aktivität gibt ihre XP genau einmal. Verpasste Aufgaben ziehen nichts ab.</p>
      </div>

      <div className="section-title">Daten</div>
      <div className="card stack">
        <Banner kind="info" title="Nur auf diesem Gerät gespeichert">
          Aktivitäten, Fotos und Fortschritt liegen privat im Speicher dieses Browsers – nichts wird hochgeladen. Sichere regelmäßig, um Datenverlust zu vermeiden.
        </Banner>
        {persisted === false && (
          <Banner kind="warn" title="Speicher nicht dauerhaft geschützt">
            Füge die App über „Teilen → Zum Home-Bildschirm“ hinzu. Sonst kann Safari die Daten nach längerer Nichtnutzung löschen.
          </Banner>
        )}
        <div className="small">{data.activities.length} Einträge · {data.routines.length} Routine-Abschnitte{usage ? ` · ${usage}` : ''}{persisted ? ' · dauerhaft gespeichert' : ''}</div>
        <div className="row">
          <button className="btn" onClick={doExport} disabled={!!busy}>{busy === 'export' ? <Spinner /> : 'Sichern'}</button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === 'import' ? <Spinner /> : 'Wiederherstellen'}</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {debug && (
        <>
          <div className="section-title">Test</div>
          <div className="card">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
              <span>Fehler beim Foto-Speichern simulieren</span>
              <input type="checkbox" checked={simulate} style={{ width: 24, height: 24 }}
                onChange={(e) => { faults.failPhotoSave = e.target.checked; setSimulate(e.target.checked); }} />
            </label>
          </div>
        </>
      )}
      <p className="small" style={{ textAlign: 'center', margin: '24px 0 8px' }}>Tagwerk · Version 0.1 · lokal & privat</p>
    </div>
  );
}
