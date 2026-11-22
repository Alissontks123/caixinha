import { useCallback, useEffect, useState } from 'react';
import { Icon, ICONS } from './components/icons';
import { PointsButton } from './components/Points';
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
import { Themes } from './screens/Themes';
import { applyPalette } from './lib/themes';
import { Setup } from './screens/Setup';
import { Transactions } from './screens/Transactions';
import { useAppData, type ReadyData } from './useAppData';

type Tab = 'painel' | 'lancamentos' | 'importar' | 'caixinha' | 'historico' | 'ajustes' | 'ajuda' | 'temas';

const TABS: { id: Exclude<Tab, 'ajuda' | 'temas'>; label: string; icon: string }[] = [
  { id: 'painel', label: 'Painel', icon: ICONS.painel },
  { id: 'lancamentos', label: 'Gastos', icon: ICONS.gastos },
  { id: 'importar', label: 'Importar', icon: ICONS.importar },
  { id: 'caixinha', label: 'Caixinha', icon: ICONS.caixinha },
  { id: 'historico', label: 'Histórico', icon: ICONS.historico },
  { id: 'ajustes', label: 'Ajustes', icon: ICONS.ajustes },
];
/** Título grande do topo nas abas sem escolha de mês. */
const TITLES: Partial<Record<Tab, string>> = { importar: 'Importar', caixinha: 'Caixinha', historico: 'Histórico', ajustes: 'Ajustes' };

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
  // tema escolhido no perfil (vem sincronizado do Drive)
  const themeId = data?.profile?.theme;
  useEffect(() => { if (data) applyPalette(themeId); }, [data, themeId]);
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

  // "Ajuda" e "Temas" ficam dentro de Ajustes: o menu continua marcando Ajustes
  const navTab = tab === 'ajuda' || tab === 'temas' ? 'ajustes' : tab;
  const navIndex = TABS.findIndex((t) => t.id === navTab);
  const title = TITLES[tab];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand" data-tour="sync-top">
            <span className="greet">Olá, {d.profile.name}!</span>
            <SyncBadge onClick={() => go('ajustes')} /><SyncButton />
          </span>
          <div className="topbar-actions" data-tour="actions">
            <PointsButton />
            <button type="button" className="help-btn" aria-label="Ver o tour do app" title="Ver o tour do app"
              onClick={() => { setMonth(currentMonth()); setTouring(true); }}><Icon d={ICONS.play} size={15} width={2} /></button>
            <ThemeButton />
            {tab !== 'ajuda' && tab !== 'temas' && <HelpButton topic={tab} />}
          </div>
        </div>
        {(tab === 'painel' || tab === 'lancamentos') && <div className="topbar-month" data-tour="month"><MonthPicker month={month} onChange={setMonth} /></div>}
        {title && <h1 className="page-title">{title}</h1>}
      </header>
      <nav className="tabbar" data-tour="tabs" aria-label="Seções do app">
        <span className="tab-ink" aria-hidden style={{ transform: `translateX(${Math.max(navIndex, 0) * 100}%)` }} />
        {TABS.map((t) => (
          <button
            key={t.id}
            className={navTab === t.id ? 'active' : ''}
            aria-current={navTab === t.id ? 'page' : undefined}
            onClick={() => { if (t.id !== 'lancamentos') setFilter(undefined); go(t.id); }}
          >
            <Icon d={t.icon} className="tab-icon" />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <main className="content page-enter" key={tab}>
        {tab === 'painel' && <Dashboard data={d} month={month} setMonth={setMonth} goToTransactions={goToTransactions} goToCaixinha={() => go('caixinha')} goToSettings={() => go('ajustes')} />}
        {tab === 'lancamentos' && <Transactions data={d} month={month} filter={filter} setFilter={setFilter} />}
        {tab === 'importar' && <Import data={d} goToTransactions={(m) => goToTransactions(undefined, m)} />}
        {tab === 'caixinha' && <Caixinha data={d} />}
        {tab === 'historico' && <History data={d} />}
        {tab === 'ajustes' && <Settings data={d} onHelp={() => go('ajuda')} onThemes={() => go('temas')} />}
        {tab === 'temas' && <Themes profile={d.profile} onBack={() => go('ajustes')} />}
        {tab === 'ajuda' && <Help onBack={() => go('ajustes')} />}
      </main>
      <SyncChoiceModal />
      {touring && <Tour goTo={tourGo} onClose={() => { setTouring(false); go('painel'); }} />}
    </div>
  );
}
