import { useSyncExternalStore } from 'react';
import { db, onLocalChange, withSyncApply } from '../db/db';
import { clearToken, driveConfigured, getToken, handleRedirect, markMissingScope, MISSING_SCOPE, startLogin } from './auth';
import { AuthExpiredError, downloadFile, fetchEmail, findDataFile, MISSING_SCOPE_MESSAGE, MissingScopeError, uploadFile } from './drive';
import { countRecords, mergeSnapshots, stableStringify, SYNC_TABLES, unifyCategories, type Rec, type Snapshot } from './merge';

// ---------- estado observável pela interface ----------

export type SyncStatus = 'unconfigured' | 'off' | 'idle' | 'syncing' | 'error' | 'needs-auth' | 'needs-choice';

export interface ChoiceInfo {
  local: { transactions: number; movements: number };
  remote: { transactions: number; movements: number };
}

export interface SyncState {
  status: SyncStatus;
  email?: string;
  lastSyncAt?: number;
  error?: string;
  notice?: string;
  choice?: ChoiceInfo;
}

let state: SyncState = { status: driveConfigured() ? 'off' : 'unconfigured' };
const listeners = new Set<() => void>();
const setState = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export function useSyncState(): SyncState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

// ---------- metadados guardados no aparelho ----------

interface SyncMeta {
  id: 'sync';
  enabled: boolean;
  email?: string;
  fileId?: string;
  remoteModified?: string;
  /** Cópia dos dados na última sincronização (base da mesclagem). */
  base?: Snapshot;
  lastSyncAt?: number;
}

const loadMeta = async (): Promise<SyncMeta> => ((await db.meta.get('sync')) as SyncMeta | undefined) ?? { id: 'sync', enabled: false };
const saveMeta = (m: SyncMeta) => db.meta.put(m as never);

interface RemoteContent {
  app: 'controle-gastos-caixinha';
  version: 1;
  savedAt: string;
  tables: Snapshot;
}
const wrap = (tables: Snapshot): RemoteContent => ({ app: 'controle-gastos-caixinha', version: 1, savedAt: new Date().toISOString(), tables });

async function readLocal(): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const { name } of SYNC_TABLES) out[name] = (await db.table(name).toArray()) as Rec[];
  return out;
}

/** Grava no aparelho só o que mudou (preserva alterações feitas durante a sincronização em outros itens). */
async function applyLocal(before: Snapshot, after: Snapshot) {
  await withSyncApply(() =>
    db.transaction('rw', SYNC_TABLES.map((t) => db.table(t.name)), async () => {
      for (const { name, key } of SYNC_TABLES) {
        const prev = new Map((before[name] ?? []).map((r) => [String(r[key]), stableStringify(r)]));
        const next = after[name] ?? [];
        const nextKeys = new Set(next.map((r) => String(r[key])));
        const toDelete = [...prev.keys()].filter((k) => !nextKeys.has(k));
        const toPut = next.filter((r) => prev.get(String(r[key])) !== stableStringify(r));
        if (toDelete.length) await db.table(name).bulkDelete(toDelete);
        if (toPut.length) await db.table(name).bulkPut(toPut);
      }
    }),
  );
}

const hasProfile = (s: Snapshot) => countRecords(s, 'profile') > 0;
const counts = (s: Snapshot) => ({ transactions: countRecords(s, 'transactions'), movements: countRecords(s, 'caixinha') });

// ---------- fluxo ----------

let enabled = false;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { fileId: string; modifiedTime: string; remote: Snapshot; email?: string } | null = null;

/** Chamado uma vez ao abrir o app. */
export async function initSync() {
  if (!driveConfigured()) return;
  const redirect = handleRedirect();
  const meta = await loadMeta();
  enabled = meta.enabled;
  setState({ status: meta.enabled ? 'idle' : 'off', email: meta.email, lastSyncAt: meta.lastSyncAt });

  onLocalChange(scheduleSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled && Date.now() - (state.lastSyncAt ?? 0) > 60_000) void syncNow();
  });

  if (redirect.type === 'error') {
    const msg = redirect.error === 'access_denied' ? 'Login no Google cancelado.'
      : redirect.error === MISSING_SCOPE ? MISSING_SCOPE_MESSAGE
      : `Login no Google: ${redirect.error}`;
    setState(redirect.purpose === 'silent' ? { status: 'needs-auth' } : { status: meta.enabled ? 'error' : 'off', error: msg });
    return;
  }
  if (redirect.type === 'ok' && redirect.purpose === 'connect') return connectFlow();
  if (!meta.enabled) return;
  if (getToken()) return syncNow();
  // token vencido: tenta renovar sem mostrar nada (uma vez por sessão)
  let tried = false;
  try { tried = sessionStorage.getItem('caixinha.silentTried') === '1'; sessionStorage.setItem('caixinha.silentTried', '1'); } catch { tried = true; }
  if (!tried && navigator.onLine) startLogin({ silent: true, email: meta.email, purpose: 'silent' });
  else setState({ status: 'needs-auth' });
}

/** Botão "Conectar" (ou "Já uso em outro aparelho"). */
export function connect() {
  if (getToken()) void connectFlow();
  else startLogin({ purpose: 'connect' });
}

export function reconnect() {
  startLogin({ purpose: 'reconnect', email: state.email });
}

async function connectFlow() {
  const token = getToken();
  if (!token) return setState({ status: 'needs-auth' });
  setState({ status: 'syncing', error: undefined, notice: undefined });
  try {
    const email = await fetchEmail(token.accessToken).catch(() => undefined);
    const file = await findDataFile(token.accessToken);
    const local = await readLocal();
    if (!file) {
      // Drive vazio: envia o que há aqui (se houver)
      let fileId: string | undefined;
      let remoteModified: string | undefined;
      if (hasProfile(local)) {
        const f = await uploadFile(token.accessToken, wrap(local));
        fileId = f.id;
        remoteModified = f.modifiedTime;
      }
      await finishConnect({ email, fileId, remoteModified, base: local });
      if (!hasProfile(local)) setState({ notice: 'Conectado. Ainda não há dados desta conta no Drive: configure o app abaixo e eles serão salvos lá.' });
      return;
    }
    const remote = (await downloadFile<RemoteContent>(token.accessToken, file.id)).tables ?? {};
    if (!hasProfile(local)) {
      await applyLocal(local, remote);
      await finishConnect({ email, fileId: file.id, remoteModified: file.modifiedTime, base: remote });
      return;
    }
    if (!hasProfile(remote)) {
      const f = await uploadFile(token.accessToken, wrap(local), file.id);
      await finishConnect({ email, fileId: f.id, remoteModified: f.modifiedTime, base: local });
      return;
    }
    // os dois lados têm dados: o usuário escolhe
    pending = { fileId: file.id, modifiedTime: file.modifiedTime, remote, email };
    setState({ status: 'needs-choice', email, choice: { local: counts(local), remote: counts(remote) } });
  } catch (e) {
    handleError(e);
  }
}

export async function resolveChoice(kind: 'merge' | 'remote' | 'local') {
  const token = getToken();
  if (!pending || !token) return setState({ status: 'needs-auth', choice: undefined });
  const p = pending;
  pending = null;
  setState({ status: 'syncing', choice: undefined });
  try {
    const local = await readLocal();
    let result: Snapshot;
    if (kind === 'remote') {
      result = p.remote;
      await applyLocal(local, result);
    } else if (kind === 'local') {
      result = local;
    } else {
      result = mergeSnapshots(null, unifyCategories(local, p.remote), p.remote).merged;
      await applyLocal(local, result);
    }
    const f = kind === 'remote' ? { id: p.fileId, modifiedTime: p.modifiedTime } : await uploadFile(token.accessToken, wrap(result), p.fileId);
    await finishConnect({ email: p.email, fileId: f.id, remoteModified: f.modifiedTime, base: result });
  } catch (e) {
    handleError(e);
  }
}

export function cancelChoice() {
  pending = null;
  setState({ status: 'off', choice: undefined });
}

async function finishConnect(m: Omit<SyncMeta, 'id' | 'enabled' | 'lastSyncAt'>) {
  const meta: SyncMeta = { id: 'sync', enabled: true, lastSyncAt: Date.now(), ...m };
  await saveMeta(meta);
  enabled = true;
  setState({ status: 'idle', email: m.email, lastSyncAt: meta.lastSyncAt, error: undefined });
}

export async function disconnect() {
  enabled = false;
  pending = null;
  clearToken();
  await saveMeta({ id: 'sync', enabled: false });
  setState({ status: 'off', email: undefined, lastSyncAt: undefined, error: undefined, notice: undefined, choice: undefined });
}

function scheduleSync() {
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 4000);
}

/** Sincroniza agora (botão, abertura do app, alguns segundos depois de cada alteração). */
export async function syncNow(): Promise<void> {
  if (!enabled) return;
  if (running) { again = true; return running; }
  running = (async () => {
    const token = getToken();
    if (!token) { setState({ status: 'needs-auth' }); return; }
    setState({ status: 'syncing', error: undefined });
    try {
      const meta = await loadMeta();
      const local = await readLocal();
      const file = await findDataFile(token.accessToken);
      let base: Snapshot;
      let remoteFile = file;
      if (!file) {
        remoteFile = await uploadFile(token.accessToken, wrap(local));
        base = local;
      } else {
        const remote = file.modifiedTime === meta.remoteModified && meta.base
          ? meta.base
          : ((await downloadFile<RemoteContent>(token.accessToken, file.id)).tables ?? {});
        const r = mergeSnapshots(meta.base ?? null, local, remote);
        if (r.localChanged) await applyLocal(local, r.merged);
        if (r.remoteChanged) remoteFile = await uploadFile(token.accessToken, wrap(r.merged), file.id);
        base = r.merged;
      }
      const lastSyncAt = Date.now();
      await saveMeta({ ...meta, enabled: true, fileId: remoteFile!.id, remoteModified: remoteFile!.modifiedTime, base, lastSyncAt });
      setState({ status: 'idle', lastSyncAt, notice: undefined });
    } catch (e) {
      handleError(e);
    }
  })();
  try {
    await running;
  } finally {
    running = null;
    if (again) { again = false; scheduleSync(); }
  }
}

function handleError(e: unknown) {
  if (e instanceof MissingScopeError) {
    markMissingScope();
    setState({ status: enabled ? 'error' : 'off', error: e.message });
    return;
  }
  if (e instanceof AuthExpiredError) {
    clearToken();
    setState({ status: 'needs-auth' });
    return;
  }
  setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
}
