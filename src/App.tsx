import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './data/store';
import { ActionsProvider } from './ui/actions';
import { Banner, Icon, Spinner, ToastProvider } from './ui/components/ui';
import { HistoryScreen } from './ui/screens/History';
import { PlanScreen } from './ui/screens/Plan';
import { ProfileScreen } from './ui/screens/Profile';
import { TodayScreen } from './ui/screens/Today';

type Tab = 'today' | 'plan' | 'history' | 'profile';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Heute', icon: 'today' },
  { id: 'plan', label: 'Planung', icon: 'plan' },
  { id: 'history', label: 'Verlauf', icon: 'history' },
  { id: 'profile', label: 'Profil', icon: 'profile' },
];

function readTab(): Tab {
  const h = location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'today';
}

function Shell() {
  const { status, error } = useStore();
  const [tab, setTab] = useState<Tab>(readTab);
  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: Tab) => {
    history.replaceState(null, '', `#${t}`);
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      {status === 'loading' && <div className="center"><Spinner label="Daten werden geladen…" /></div>}
      {status === 'error' && (
        <div className="screen" style={{ paddingTop: 40 }}>
          <Banner kind="error" title="Daten konnten nicht geladen werden">{error}</Banner>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => location.reload()}>Erneut versuchen</button>
        </div>
      )}
      {status === 'ready' && (
        <main>
          {tab === 'today' && <TodayScreen />}
          {tab === 'plan' && <PlanScreen />}
          {tab === 'history' && <HistoryScreen />}
          {tab === 'profile' && <ProfileScreen />}
        </main>
      )}
      <div className="tabbar">
        <nav aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} size={24} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <ActionsProvider>
          <Shell />
        </ActionsProvider>
      </StoreProvider>
    </ToastProvider>
  );
}
