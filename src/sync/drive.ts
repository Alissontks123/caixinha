import { DRIVE_FILE_NAME } from '../config';

/** Acesso mínimo à API do Google Drive (pasta oculta do app: o app não vê os outros arquivos da pessoa). */

export class AuthExpiredError extends Error {
  constructor() { super('O acesso ao Google expirou. Toque em "Reconectar".'); }
}

/** O login foi feito, mas sem a permissão do Google Drive (caixa desmarcada na tela do Google). */
export class MissingScopeError extends Error {
  constructor() { super(MISSING_SCOPE_MESSAGE); }
}

export const MISSING_SCOPE_MESSAGE =
  'O Google não deu acesso ao Drive. Toque de novo para entrar e, na tela do Google, deixe MARCADA a permissão do Google Drive (dados de configuração do app). O Caixinha só vê os próprios dados, nunca os seus arquivos.';

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  } catch {
    throw new Error('Sem conexão com a internet.');
  }
  if (res.status === 401) throw new AuthExpiredError();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 403 && /insufficient(Permissions| authentication scopes)|SCOPE_INSUFFICIENT/i.test(body)) throw new MissingScopeError();
    throw new Error(`Google Drive respondeu ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  return res;
}

export interface RemoteFile {
  id: string;
  modifiedTime: string;
}

export async function findDataFile(token: string): Promise<RemoteFile | null> {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const res = await call(token, `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  const json = (await res.json()) as { files: RemoteFile[] };
  return json.files[0] ?? null;
}

export async function downloadFile<T>(token: string, id: string): Promise<T> {
  const res = await call(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return (await res.json()) as T;
}

/** Cria (id ausente) ou substitui o conteúdo do arquivo. Devolve id e data de modificação. */
export async function uploadFile(token: string, content: unknown, id?: string): Promise<RemoteFile> {
  const body = JSON.stringify(content);
  if (id) {
    const res = await call(token, `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return (await res.json()) as RemoteFile;
  }
  const boundary = `caixinha${crypto.randomUUID()}`;
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
  ].join('\r\n');
  const res = await call(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return (await res.json()) as RemoteFile;
}

export async function fetchEmail(token: string): Promise<string | undefined> {
  const res = await call(token, 'https://www.googleapis.com/oauth2/v3/userinfo');
  return ((await res.json()) as { email?: string }).email;
}
