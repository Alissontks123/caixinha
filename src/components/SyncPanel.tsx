import { cancelChoice, connect, disconnect, reconnect, resolveChoice, syncNow, useSyncState, type SyncState } from '../sync/engine';
import { Modal } from './ui';

const time = (ms?: number) =>
  ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function statusText(s: SyncState): string {
  switch (s.status) {
    case 'unconfigured': return 'Sincronização ainda não configurada neste app.';
    case 'off': return 'Desconectado.';
    case 'syncing': return 'Sincronizando…';
    case 'idle': return `Sincronizado em ${time(s.lastSyncAt)}.`;
    case 'needs-auth': return 'O acesso ao Google expirou. Toque em "Reconectar".';
    case 'needs-choice': return 'Escolha como juntar os dados.';
    case 'error': return s.error ?? 'Erro ao sincronizar.';
  }
}

/** Cartão em Ajustes. */
export function SyncSettings() {
  const s = useSyncState();
  return (
    <section className="card stack-sm">
      <h2>Sincronização com Google Drive</h2>
      <p className="muted small">
        Guarda seus dados numa pasta oculta do <b>seu</b> Google Drive (o app não vê seus outros arquivos) e mantém iguais
        todos os aparelhos em que você entrar com a mesma conta. É opcional.
      </p>
      {s.email && <p className="small">Conta: <b>{s.email}</b></p>}
      <p className={`small ${s.status === 'error' || s.status === 'needs-auth' ? 'text-danger' : 'muted'}`} role="status">{statusText(s)}</p>
      {s.notice && <p className="ok-box">{s.notice}</p>}
      <div className="row-end">
        {s.status === 'off' && <button className="btn primary" onClick={connect}>Conectar ao Google Drive</button>}
        {s.status === 'needs-auth' && <button className="btn primary" onClick={reconnect}>Reconectar</button>}
        {(s.status === 'idle' || s.status === 'error') && <button className="btn primary" onClick={() => void syncNow()}>Sincronizar agora</button>}
        {s.status !== 'off' && s.status !== 'unconfigured' && (
          <button
            className="btn ghost"
            onClick={() => window.confirm('Desconectar do Google Drive? Os dados continuam neste aparelho e no Drive, mas deixam de sincronizar.') && void disconnect()}
          >Desconectar</button>
        )}
      </div>
    </section>
  );
}

/** Pergunta da primeira conexão quando os dois lados já têm dados. */
export function SyncChoiceModal() {
  const s = useSyncState();
  if (s.status !== 'needs-choice' || !s.choice) return null;
  const { local, remote } = s.choice;
  return (
    <Modal title="Já existem dados nos dois lugares" onClose={cancelChoice}>
      <div className="stack-sm">
        <p className="small">
          Este aparelho tem <b>{local.transactions}</b> lançamento(s) e <b>{local.movements}</b> movimento(s) da caixinha.
          O Google Drive{s.email ? ` (${s.email})` : ''} tem <b>{remote.transactions}</b> lançamento(s) e <b>{remote.movements}</b> movimento(s).
        </p>
        <button className="btn primary" onClick={() => void resolveChoice('merge')}>Juntar os dois (recomendado)</button>
        <p className="muted small">Nada se perde. Categorias com o mesmo nome viram uma só.</p>
        <button className="btn ghost" onClick={() => window.confirm('Os dados DESTE APARELHO serão substituídos pelos do Drive. Continuar?') && void resolveChoice('remote')}>
          Usar só os dados do Drive
        </button>
        <button className="btn ghost" onClick={() => window.confirm('Os dados DO DRIVE serão substituídos pelos deste aparelho. Continuar?') && void resolveChoice('local')}>
          Usar só os dados deste aparelho
        </button>
      </div>
    </Modal>
  );
}

/** Indicador pequeno no topo. */
export function SyncBadge({ onClick }: { onClick: () => void }) {
  const s = useSyncState();
  if (s.status === 'unconfigured' || s.status === 'off') return null;
  const map: Record<string, [string, string]> = {
    idle: ['✓', 'Sincronizado'],
    syncing: ['↻', 'Sincronizando'],
    error: ['!', 'Erro na sincronização'],
    'needs-auth': ['!', 'Reconectar ao Drive'],
    'needs-choice': ['?', 'Escolha pendente'],
  };
  const [icon, label] = map[s.status];
  return (
    <button className={`sync-badge ${s.status}`} onClick={onClick} title={statusText(s)} aria-label={label}>
      <span aria-hidden>☁{icon}</span>
    </button>
  );
}

/**
 * Botão de sincronizar no topo, ao lado do indicador:
 * desconectado → conecta; precisa entrar de novo → reconecta; conectado → sincroniza agora.
 */
export function SyncButton() {
  const s = useSyncState();
  if (s.status === 'unconfigured' || s.status === 'needs-choice') return null;
  const busy = s.status === 'syncing';
  const label = s.status === 'off' ? 'Conectar ao Google Drive'
    : s.status === 'needs-auth' ? 'Entrar de novo no Google Drive'
      : busy ? 'Sincronizando…' : 'Sincronizar agora';
  const act = () => {
    if (s.status === 'off') connect();
    else if (s.status === 'needs-auth') reconnect();
    else void syncNow();
  };
  return (
    <button type="button" className={`help-btn sync-btn ${busy ? 'spinning' : ''}`} aria-label={label} title={label} disabled={busy} onClick={act}>
      <span aria-hidden>{s.status === 'off' ? '☁' : '↻'}</span>
    </button>
  );
}
