import { merchantHint, searchUrl } from '../domain/hints';

/** Embaixo de uma despesa sem categoria: "Parece ..." (se o nome der pista) e o link para pesquisar no Google. */
export function MerchantHint({ text }: { text: string }) {
  const hint = merchantHint(text);
  return (
    <div className="tx-hint small">
      {hint && <span className="muted">💡 Parece: {hint}</span>}
      <a href={searchUrl(text)} target="_blank" rel="noopener noreferrer">🔎 Pesquisar no Google</a>
    </div>
  );
}
