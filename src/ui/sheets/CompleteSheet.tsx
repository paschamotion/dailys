import { useEffect, useRef, useState } from 'react';
import { computeDerived, errorText, useStore } from '../../data/store';
import { combine, isoToTime, minutesToTime, nowMinutes, timeToMinutes, todayKey } from '../../domain/dates';
import type { Activity } from '../../domain/types';
import { xpFor } from '../../domain/xp';
import { Banner, Icon, Sheet, Spinner } from '../components/ui';
import { compressImage } from '../image';

type Phase = 'idle' | 'uploading' | 'completing';

export interface CompletionFeedback {
  awarded: number;
  title: string;
  levelUp: number | null;
  milestones: string[];
}

export function CompleteSheet({ activity, onClose, onDone }: { activity: Activity; onClose: () => void; onDone: (f: CompletionFeedback) => void }) {
  const { run, repo, derived } = useStore();
  const required = activity.completion === 'photo';
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedPhotoId, setSavedPhotoId] = useState<string | null>(null);
  const [note, setNote] = useState(activity.note);
  const today = todayKey();
  const defaultStart = activity.actualStart
    ? isoToTime(activity.actualStart)
    : activity.date === today && timeToMinutes(activity.plannedStart) <= nowMinutes()
      ? activity.plannedStart
      : minutesToTime(nowMinutes() - activity.plannedDuration);
  const [startT, setStartT] = useState(defaultStart);
  const [endT, setEndT] = useState(minutesToTime(nowMinutes()));
  const [editTimes, setEditTimes] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.type && !f.type.startsWith('image/')) {
      setError({ title: 'Kein Bild', text: 'Bitte wähle ein Foto aus.' });
      return;
    }
    setError(null);
    setFile(f);
    setSavedPhotoId(null); // ersetztes Foto muss neu gespeichert werden
    setPreview(URL.createObjectURL(f));
  }

  const busy = phase !== 'idle';
  const hasPhoto = !!file || !!savedPhotoId;
  const canSubmit = !busy && (!required || hasPhoto);

  async function submit() {
    if (required && !hasPhoto) {
      setError({ title: 'Foto fehlt', text: 'Für diese Aktivität ist ein Foto erforderlich.' });
      return;
    }
    if (editTimes && timeToMinutes(startT) > timeToMinutes(endT)) {
      setError({ title: 'Zeiten prüfen', text: 'Der Beginn liegt nach dem Ende.' });
      return;
    }
    setError(null);
    let photoId = savedPhotoId;
    // Schritt 1: Foto speichern (nur, falls noch nicht geschehen)
    if (file && !photoId) {
      setPhase('uploading');
      try {
        const blob = await compressImage(file);
        const rec = await repo.savePhoto(activity.id, blob);
        photoId = rec.id;
        setSavedPhotoId(rec.id);
      } catch (e) {
        setPhase('idle');
        setError({ title: 'Foto nicht gespeichert', text: `${errorText(e)} Deine Eingaben bleiben erhalten – versuche es erneut.` });
        return;
      }
    }
    // Schritt 2: Abschließen (prüft serverseitig/lokal erneut, ob das Foto existiert)
    setPhase('completing');
    try {
      const day = todayKey();
      const res = await run((r) =>
        r.completeActivity(activity.id, {
          photoId,
          note,
          // Ohne Start und ohne Angabe bleibt der tatsächliche Beginn leer (keine Stoppuhr nötig).
          actualStart: editTimes ? combine(day, startT).toISOString() : activity.actualStart,
          actualEnd: combine(day, endT).toISOString(),
        }),
      );
      const after = computeDerived(await repo.loadAll(), day);
      const before = new Set(derived.milestones.filter((m) => m.achieved).map((m) => m.milestone.id));
      onDone({
        awarded: res.awarded,
        title: activity.title,
        levelUp: after.level.level > derived.level.level ? after.level.level : null,
        milestones: after.milestones.filter((m) => m.achieved && !before.has(m.milestone.id)).map((m) => m.milestone.title),
      });
    } catch (e) {
      setPhase('idle');
      setError({ title: 'Nicht abgeschlossen', text: `${errorText(e)}${photoId ? ' Das Foto ist bereits gespeichert.' : ''}` });
    }
  }

  return (
    <Sheet title="Abschließen" onClose={busy ? () => undefined : onClose}>
      <p style={{ margin: '-6px 0 16px', color: 'var(--ink-2)' }}>
        <b>{activity.title}</b> · geplant {activity.plannedStart} · <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{xpFor(activity)} XP</span>
      </p>

      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={libraryRef} className="visually-hidden" type="file" accept="image/*" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="field">
        <span className="field-label">{required ? 'Foto (Pflicht)' : 'Foto (optional)'}</span>
        {preview ? (
          <>
            <div className="photo-preview">
              <img src={preview} alt="Vorschau des ausgewählten Fotos" />
              {savedPhotoId && <span className="chip ok badge"><Icon name="check" size={12} stroke={3} />gespeichert</span>}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" disabled={busy} onClick={() => cameraRef.current?.click()}><Icon name="camera" size={18} />Kamera</button>
              <button className="btn" disabled={busy} onClick={() => libraryRef.current?.click()}><Icon name="image" size={18} />Ersetzen</button>
            </div>
          </>
        ) : (
          <div className={`photo-drop ${required ? 'required' : ''}`}>
            <p style={{ margin: '0 0 14px', color: 'var(--muted)' }}>
              {required ? 'Halte das Ergebnis mit einem Foto fest – erst dann kannst du abschließen.' : 'Füge bei Bedarf ein Foto hinzu.'}
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => cameraRef.current?.click()}><Icon name="camera" size={18} />Aufnehmen</button>
              <button className="btn" onClick={() => libraryRef.current?.click()}><Icon name="image" size={18} />Mediathek</button>
            </div>
          </div>
        )}
      </div>

      <label className="field">
        <span>Notiz (optional)</span>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wie lief es?" maxLength={1000} disabled={busy} />
      </label>

      <div className="field">
        {editTimes ? (
          <div className="grid2">
            <label><span className="field-label">Tatsächlicher Beginn</span><input className="input" type="time" value={startT} onChange={(e) => e.target.value && setStartT(e.target.value)} /></label>
            <label><span className="field-label">Tatsächliches Ende</span><input className="input" type="time" value={endT} onChange={(e) => e.target.value && setEndT(e.target.value)} /></label>
          </div>
        ) : (
          <button className="btn block" onClick={() => setEditTimes(true)} disabled={busy}>
            <Icon name="clock" size={18} />{activity.actualStart ? `Tatsächlich ${startT}–${endT}` : `Erledigt um ${endT}`} · Zeiten angeben
          </button>
        )}
      </div>

      {error && <div style={{ marginBottom: 12 }}><Banner kind="error" title={error.title}>{error.text}</Banner></div>}

      <button className="btn block lg primary" disabled={!canSubmit} onClick={submit}>
        {phase === 'uploading' ? <Spinner label="Foto wird gespeichert…" />
          : phase === 'completing' ? <Spinner label="Wird abgeschlossen…" />
          : error ? 'Erneut versuchen'
          : file && !savedPhotoId ? 'Foto speichern & abschließen'
          : 'Abschließen'}
      </button>
      {required && !hasPhoto && <p className="hint" style={{ textAlign: 'center' }}>Ohne Foto kann diese Aktivität nicht abgeschlossen werden.</p>}
    </Sheet>
  );
}
