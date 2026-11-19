import { useCallback, useEffect, useState } from 'react';
import { SyncBadge, SyncButton, SyncChoiceModal } from './components/SyncPanel';
import { HelpButton } from './components/TabHelp';
import { ThemeButton } from './components/ThemeButton';
import { Tour, tourSeen, type TourTab } from './components/Tour';
import { MonthPicker } from './components/ui';
import type { Month } from './domain/types';
import { currentMonth } from './lib/months';
import { Caixinha } from './screens/Caixinha';
import { Dashboard } from './screens/Dashboard';
import { Help } from './screens/Help';
import { History } from './screens/History';
import { Import } from './screens/Import';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { Transactions } from './screens/Transactions';
import { useAppData, type ReadyData } from './useAppData';

type Tab = 'painel' | 'lancamentos' | 'importar' | 'caixinha' | 'historico' | 'ajustes' | 'ajuda';

const TABS: { id: Exclude<Tab, 'ajuda'>; label: string; icon: string }[] = [
  { id: 'painel', label: 'Painel', icon: '◔' },
  { id: 'lancamentos', label: 'Gastos', icon: '☰' },
  { id: 'importar', label: 'Importar', icon: '⇪' },
  { id: 'caixinha', label: 'Caixinha', icon: '◈' },
  { id: 'historico', label: 'Histórico', icon: '▥' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙' },
];

export default function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>('painel');
  const [month, setMonth] = useState<Month>(currentMonth());
  const [filter, setFilter] = useState<string | undefined>();
  const [setupHelp, setSetupHelp] = useState(false);

  const [touring, setTouring] = useState(false);
  const go = (t: Tab) => { setTab(t); window.scrollTo(0, 0); };
  const tourGo = useCallback((t: TourTab) => { setFilter(undefined); setTab(t); }, []);
  const hasProfile = !!data?.profile;
  // tour: abre sozinho uma vez (logo depois de configurar, ou na primeira vez nesta versão)
  useEffect(() => { if (hasProfile && !tourSeen()) setTouring(true); }, [hasProfile]);

  if (!data) return <div className="loading">Carregando…</div>;
  if (!data.profile) {
    return (
      <>
        {setupHelp ? <div className="content"><Help onBack={() => setSetupHelp(false)} /></div> : <Setup onHelp={() => setSetupHelp(true)} />}
        <SyncChoiceModal />
      </>
    );
  }
  const d = data as ReadyData;

  const goToTransactions = (f?: string, m?: Month) => {
    setFilter(f);
    if (m) setMonth(m);
    go('lancamentos');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand" data-tour="sync-top">Olá, {d.profile.name}<SyncBadge onClick={() => go('ajustes')} /><SyncButton /></span>
          {(tab === 'painel' || tab === 'lancamentos') && <div className="topbar-month" data-tour="month"><MonthPicker month={month} onChange={setMonth} /></div>}
          <div className="topbar-actions" data-tour="actions">
            <button type="button" className="help-btn" aria-label="Ver o tour do app" title="Ver o tour do app"
              onClick={() => { setMonth(currentMonth()); setTouring(true); }}><span aria-hidden>▶</span></button>
            <ThemeButton />
            {tab !== 'ajuda' && <HelpButton topic={tab} />}
          </div>
        </div>
        <nav className="tabbar" data-tour="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => { if (t.id !== 'lancamentos') setFilter(undefined); go(t.id); }}
            >
              <span className="tab-icon" aria-hidden>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
          <span className="tab-ink" aria-hidden style={{
            transform: `translateX(${Math.max(TABS.findIndex((t) => t.id === tab), 0) * 100}%)`,
            opacity: TABS.some((t) => t.id === tab) ? 1 : 0,
          }} />
        </nav>
      </header>
      <main className="content page-enter" key={tab}>
        {tab === 'painel' && <Dashboard data={d} month={month} setMonth={setMonth} goToTransactions={goToTransactions} goToCaixinha={() => go('caixinha')} goToSettings={() => go('ajustes')} />}
        {tab === 'lancamentos' && <Transactions data={d} month={month} filter={filter} setFilter={setFilter} />}
        {tab === 'importar' && <Import data={d} goToTransactions={(m) => goToTransactions(undefined, m)} />}
        {tab === 'caixinha' && <Caixinha data={d} />}
        {tab === 'historico' && <History data={d} />}
        {tab === 'ajustes' && <Settings data={d} onHelp={() => go('ajuda')} />}
        {tab === 'ajuda' && <Help onBack={() => go('ajustes')} />}
      </main>
      <SyncChoiceModal />
      {touring && <Tour goTo={tourGo} onClose={() => { setTouring(false); go('painel'); }} />}
    </div>
  );
}
