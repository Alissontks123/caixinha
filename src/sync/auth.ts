import { GOOGLE_CLIENT_ID } from '../config';

/**
 * Login no Google pelo fluxo de redirecionamento (funciona no iPhone com o app instalado na Tela de Início,
 * onde janelas pop-up costumam falhar). O token vale ~1 hora e fica só neste aparelho.
 */
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = `${DRIVE_SCOPE} openid email`;
/** A pessoa desmarcou a permissão do Drive na tela do Google: no próximo login, a tela de permissões aparece de novo. */
const CONSENT_KEY = 'caixinha.google.askConsent';
/** Erro devolvido quando o Google não deu acesso ao Drive. */
export const MISSING_SCOPE = 'missing_drive_scope';
const TOKEN_KEY = 'caixinha.google.token';
const STATE_KEY = 'caixinha.google.state';

export interface Token {
  accessToken: string;
  expiresAt: number;
}

const storage = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

export const driveConfigured = () => GOOGLE_CLIENT_ID.length > 0;

/** Endereço do app sem "#..." (é para onde o Google devolve o usuário). */
const redirectUri = () => `${location.origin}${location.pathname}`;

export function startLogin(opts: { silent?: boolean; email?: string; purpose: string }) {
  const state = `${opts.purpose}.${crypto.randomUUID()}`;
  storage.set(STATE_KEY, state);
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state,
  });
  if (opts.silent) p.set('prompt', 'none');
  else p.set('prompt', storage.get(CONSENT_KEY) ? 'consent select_account' : 'select_account');
  if (opts.email) p.set('login_hint', opts.email);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

export type RedirectResult =
  | { type: 'none' }
  | { type: 'ok'; purpose: string }
  | { type: 'error'; purpose: string; error: string };

/** Ao abrir o app: verifica se voltamos do login do Google e guarda o token. */
export function handleRedirect(): RedirectResult {
  if (!location.hash.includes('state=')) return { type: 'none' };
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', redirectUri()); // limpa o token da barra de endereço
  const state = p.get('state') ?? '';
  const expected = storage.get(STATE_KEY);
  storage.del(STATE_KEY);
  const purpose = state.split('.')[0];
  if (!expected || state !== expected) return { type: 'error', purpose, error: 'Resposta de login inválida. Tente de novo.' };
  const error = p.get('error');
  if (error) return { type: 'error', purpose, error };
  const accessToken = p.get('access_token');
  const expiresIn = Number(p.get('expires_in') ?? 3600);
  if (!accessToken) return { type: 'error', purpose, error: 'O Google não devolveu o acesso.' };
  // a tela do Google deixa desmarcar a permissão do Drive: sem ela, o login "funciona" mas nada sincroniza
  const granted = p.get('scope');
  if (granted !== null && !granted.split(' ').includes(DRIVE_SCOPE)) {
    markMissingScope();
    return { type: 'error', purpose, error: MISSING_SCOPE };
  }
  storage.del(CONSENT_KEY);
  storage.set(TOKEN_KEY, JSON.stringify({ accessToken, expiresAt: Date.now() + (expiresIn - 60) * 1000 }));
  return { type: 'ok', purpose };
}

export function getToken(): Token | null {
  const raw = storage.get(TOKEN_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Token;
    return t.expiresAt > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export function clearToken() {
  storage.del(TOKEN_KEY);
}

/** O acesso veio sem a permissão do Drive: descarta e pede a tela de permissões no próximo login. */
export function markMissingScope() {
  storage.del(TOKEN_KEY);
  storage.set(CONSENT_KEY, '1');
}
