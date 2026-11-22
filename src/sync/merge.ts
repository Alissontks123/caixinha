/**
 * Mesclagem item a item entre os dados deste aparelho e os do Google Drive.
 *
 * Usa "mesclagem de três vias": compara cada registro com a versão da última sincronização (base).
 * - Só um lado mudou desde a base → vale a mudança desse lado (inclusive exclusão).
 * - Os dois mudaram → vale o mais recente (updatedAt); se um lado excluiu e o outro editou, a edição vence.
 */

export type Rec = Record<string, unknown> & { updatedAt?: number };
export type Snapshot = Record<string, Rec[]>;

/** Tabelas sincronizadas e a chave de cada uma. */
export const SYNC_TABLES: { name: string; key: string }[] = [
  { name: 'profile', key: 'id' },
  { name: 'categories', key: 'id' },
  { name: 'categoryRules', key: 'id' },
  { name: 'fixedContributions', key: 'id' },
  { name: 'transactions', key: 'id' },
  { name: 'closings', key: 'month' },
  { name: 'caixinha', key: 'id' },
  { name: 'learnedRules', key: 'key' },
  { name: 'cards', key: 'id' },
  { name: 'stars', key: 'id' },
];

/** JSON com chaves ordenadas (em todos os níveis), para comparar registros. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export interface MergeResult {
  merged: Snapshot;
  /** O resultado é diferente do que está neste aparelho (precisa gravar localmente). */
  localChanged: boolean;
  /** O resultado é diferente do que está no Drive (precisa enviar). */
  remoteChanged: boolean;
  /** Registros em que os dois lados mudaram (resolvidos pelo mais recente). */
  conflicts: number;
}

function index(records: Rec[] | undefined, key: string): Map<string, { rec: Rec; s: string }> {
  const m = new Map<string, { rec: Rec; s: string }>();
  for (const r of records ?? []) m.set(String(r[key]), { rec: r, s: stableStringify(r) });
  return m;
}

export function mergeSnapshots(base: Snapshot | null, local: Snapshot, remote: Snapshot): MergeResult {
  const merged: Snapshot = {};
  let localChanged = false;
  let remoteChanged = false;
  let conflicts = 0;

  for (const { name, key } of SYNC_TABLES) {
    const B = index(base?.[name], key);
    const L = index(local[name], key);
    // tabela que o Drive ainda não tem (enviado por uma versão antiga do app): conta como "não mudou lá"
    const R = index(remote[name] ?? base?.[name], key);
    const out: Rec[] = [];
    for (const k of new Set([...L.keys(), ...R.keys(), ...B.keys()])) {
      const l = L.get(k), r = R.get(k), b = B.get(k);
      let pick: { rec: Rec; s: string } | undefined;
      if (l?.s === r?.s) pick = l;
      else if (l?.s === b?.s) pick = r; // só o Drive mudou
      else if (r?.s === b?.s) pick = l; // só este aparelho mudou
      else {
        conflicts++;
        if (!l) pick = r;
        else if (!r) pick = l;
        else pick = (r.rec.updatedAt ?? 0) > (l.rec.updatedAt ?? 0) ? r : l;
      }
      if (pick?.s !== l?.s) localChanged = true;
      if (pick?.s !== r?.s) remoteChanged = true;
      if (pick) out.push(pick.rec);
    }
    // o Drive não tinha a tabela: precisa receber o que existe aqui
    if (remote[name] === undefined && out.length > 0) remoteChanged = true;
    merged[name] = out;
  }
  return { merged, localChanged, remoteChanged, conflicts };
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Antes de juntar dois aparelhos configurados separadamente: categorias com o mesmo nome
 * passam a ser a mesma (usa a do Drive), para não ficar "Alimentação" duplicada.
 */
export function unifyCategories(local: Snapshot, remote: Snapshot): Snapshot {
  const remoteByName = new Map((remote.categories ?? []).map((c) => [norm(c.name), String(c.id)]));
  const map = new Map<string, string>();
  for (const c of local.categories ?? []) {
    const target = remoteByName.get(norm(c.name));
    if (target && target !== c.id) map.set(String(c.id), target);
  }
  if (!map.size) return local;
  const re = (id: unknown) => map.get(String(id)) ?? id;
  return {
    ...local,
    categories: (local.categories ?? []).filter((c) => !map.has(String(c.id))),
    // as regras das categorias unificadas ficam as do Drive
    categoryRules: (local.categoryRules ?? []).filter((r) => !map.has(String(r.categoryId))),
    transactions: (local.transactions ?? []).map((t) => ({
      ...t,
      categoryId: re(t.categoryId),
      ...(Array.isArray(t.allocation) ? { allocation: (t.allocation as Rec[]).map((p) => ({ ...p, categoryId: re(p.categoryId) })) } : {}),
    })),
    learnedRules: (local.learnedRules ?? []).map((r) => ({ ...r, categoryId: re(r.categoryId) })),
    closings: (local.closings ?? []).map((c) => ({
      ...c,
      categories: ((c.categories as Rec[]) ?? []).map((x) => ({ ...x, categoryId: re(x.categoryId) })),
    })),
  };
}

export const countRecords = (s: Snapshot, table: string) => s[table]?.length ?? 0;
