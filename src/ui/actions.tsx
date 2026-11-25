import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { errorText, useStore } from '../data/store';
import type { Activity, DateKey } from '../domain/types';
import { useToast } from './components/ui';
import { ActivityForm, type FormTarget } from './sheets/ActivityForm';
import { CompleteSheet, type CompletionFeedback } from './sheets/CompleteSheet';
import { DetailSheet, RescheduleSheet, ReviewSheet } from './sheets/MiscSheets';

type Open =
  | { kind: 'form'; target: FormTarget }
  | { kind: 'complete'; activity: Activity }
  | { kind: 'reschedule'; activity: Activity }
  | { kind: 'detail'; activity: Activity }
  | { kind: 'review'; date: DateKey }
  | null;

export interface Actions {
  create: (date: DateKey) => void;
  edit: (a: Activity) => void;
  editSeries: (seriesId: string, fromDate: DateKey) => void;
  detail: (a: Activity) => void;
  complete: (a: Activity) => void;
  reschedule: (a: Activity) => void;
  start: (a: Activity) => void;
  skip: (a: Activity) => void;
  skipMany: (list: Activity[]) => void;
  reopen: (a: Activity) => void;
  review: (date: DateKey) => void;
}

const Ctx = createContext<Actions | null>(null);

export function ActionsProvider({ children }: { children: ReactNode }) {
  const { run } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);

  const fail = useCallback((e: unknown) => toast({ text: errorText(e) }), [toast]);

  const actions = useMemo<Actions>(() => {
    const reopen = (a: Activity) => run((r) => r.reopenActivity(a.id)).catch(fail);
    return {
      create: (date) => setOpen({ kind: 'form', target: { mode: 'create', date } }),
      edit: (a) => setOpen({ kind: 'form', target: { mode: 'edit', activity: a } }),
      editSeries: (seriesId, fromDate) => setOpen({ kind: 'form', target: { mode: 'series', seriesId, fromDate } }),
      detail: (a) => setOpen({ kind: 'detail', activity: a }),
      complete: (a) => setOpen({ kind: 'complete', activity: a }),
      reschedule: (a) => setOpen({ kind: 'reschedule', activity: a }),
      review: (date) => setOpen({ kind: 'review', date }),
      start: (a) => run((r) => r.startActivity(a.id)).then(() => toast({ text: `„${a.title}“ gestartet` })).catch(fail),
      skip: (a) =>
        run((r) => r.skipActivity(a.id))
          .then(() => toast({ text: `„${a.title}“ übersprungen`, action: { label: 'Rückgängig', run: () => reopen(a) } }))
          .catch(fail),
      skipMany: (list) =>
        run(async (r) => { for (const a of list) await r.skipActivity(a.id); })
          .then(() => toast({ text: `${list.length} Aktivitäten übersprungen` }))
          .catch(fail),
      reopen,
    };
  }, [run, toast, fail]);

  const onCompleted = (f: CompletionFeedback) => {
    close();
    if (f.awarded > 0) toast({ kind: 'xp', text: `+${f.awarded} XP · ${f.title}` });
    else toast({ text: `„${f.title}“ war bereits erledigt` });
    if (f.levelUp) toast({ kind: 'xp', text: `★ Level ${f.levelUp} erreicht` });
    for (const m of f.milestones) toast({ kind: 'xp', text: `Meilenstein: ${m}` });
  };
  const done = (msg: string) => { close(); toast({ text: msg }); };

  return (
    <Ctx.Provider value={actions}>
      {children}
      {open?.kind === 'form' && <ActivityForm target={open.target} onClose={close} onDone={done} />}
      {open?.kind === 'complete' && <CompleteSheet activity={open.activity} onClose={close} onDone={onCompleted} />}
      {open?.kind === 'reschedule' && <RescheduleSheet activity={open.activity} onClose={close} onDone={done} />}
      {open?.kind === 'review' && <ReviewSheet date={open.date} onClose={close} onDone={done} />}
      {open?.kind === 'detail' && <DetailSheet activity={open.activity} onClose={close} actions={actions} />}
    </Ctx.Provider>
  );
}

export function useActions(): Actions {
  const v = useContext(Ctx);
  if (!v) throw new Error('ActionsProvider fehlt');
  return v;
}
