/**
 * ID do cliente OAuth do Google (criado no Google Cloud Console).
 * Não é segredo: ele só identifica o app e só funciona nos endereços autorizados no console.
 * Vazio = sincronização com o Drive desativada. A variável VITE_GOOGLE_CLIENT_ID (usada nos testes) tem prioridade.
 */
const DEFAULT_CLIENT_ID = '253275375413-p84ok0b06nha93cs1iku2dtd9c31dm3c.apps.googleusercontent.com';

export const GOOGLE_CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID;

/** Nome do arquivo de dados na pasta oculta do app no Drive de cada usuário. */
export const DRIVE_FILE_NAME = 'caixinha-dados.json';
