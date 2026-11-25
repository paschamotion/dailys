import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../data/store';

// ---------- Icons (inline SVG, keine externen Abhängigkeiten) ----------
const paths: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
  plan: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v4h4M12 8v4.3l3 1.8" /></>,
  profile: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20.5c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  camera: <><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.5-2h4.6l1.5 2h1.7A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.8" r="3.6" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-8.5 8.5" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  skip: <path d="M6 6l8 6-8 6zM17.5 6v12" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevL: <path d="M15 5l-7 7 7 7" />,
  chevR: <path d="M9 5l7 7-7 7" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  repeat: <><path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3" /></>,
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.9 3.2-5.9 4.2-9.8 2.2 1.6 3.3 3.6 3.4 5.6 1-.7 1.6-1.8 1.8-3 1.9 1.8 3.6 4.4 3.6 7.2 0 3.6-2.6 6.2-6.5 6.2z" />,
};

export function Icon({ name, size = 22, stroke = 1.8 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ---------- Bottom-Sheet ----------
export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="grabber" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <div className="row" style={{ alignItems: 'center' }}>
            {actions}
            <button className="icon-btn" onClick={onClose} aria-label="Schließen" style={{ boxShadow: 'none', background: 'var(--surface)' }}>
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

// ---------- Fortschrittsring ----------
export function ProgressRing({ value, size = 64, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-soft)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15 }}>{children}</div>
    </div>
  );
}

export function XpBar({ progress }: { progress: number }) {
  return <div className="xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${Math.max(2, progress * 100)}%` }} /></div>;
}

export function Empty({ glyph, title, text, action }: { glyph: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="glyph" aria-hidden="true">{glyph}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Banner({ kind, title, children }: { kind: 'error' | 'warn' | 'info'; title?: string; children?: ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>{title && <strong>{title}</strong>}{children}</div>
    </div>
  );
}

export const Spinner = ({ label }: { label?: string }) => (
  <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span className="spinner" aria-hidden="true" />{label && <span>{label}</span>}
  </span>
);

// ---------- Foto aus lokalem Speicher ----------
export function usePhotoUrl(photoId: string | null | undefined) {
  const { repo } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'missing'>('idle');
  useEffect(() => {
    if (!photoId) { setUrl(null); setState('idle'); return; }
    let objectUrl: string | null = null;
    let alive = true;
    setState('loading');
    repo.getPhoto(photoId).then((p) => {
      if (!alive) return;
      if (!p) { setState('missing'); return; }
      objectUrl = URL.createObjectURL(p.blob);
      setUrl(objectUrl);
      setState('ready');
    }).catch(() => alive && setState('missing'));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoId, repo]);
  return { url, state };
}

export function PhotoThumb({ photoId, size = 56 }: { photoId: string; size?: number }) {
  const { url, state } = usePhotoUrl(photoId);
  if (state === 'ready' && url) return <img className="thumb" src={url} alt="Foto zur Aktivität" style={{ width: size, height: size }} />;
  return <div className="thumb" style={{ width: size, height: size, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>{state === 'loading' ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="image" size={20} />}</div>;
}

// ---------- Toasts ----------
interface Toast { id: number; text: string; kind?: 'xp' | 'default'; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.action ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'xp' ? 'xp' : ''}`}>
            <span className="grow">{t.text}</span>
            {t.action && <button onClick={() => { t.action!.run(); setToasts((l) => l.filter((x) => x.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
