import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Abas do app (as mesmas de App.tsx). */
export type TourTab = 'painel' | 'lancamentos' | 'importar' | 'caixinha' | 'historico' | 'ajustes';

interface Step {
  tab: TourTab;
  /** Valor do atributo data-tour da parte destacada; sem ele, o balão aparece no meio da tela. */
  target?: string;
  title: string;
  body: ReactNode;
}

const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

const STEPS = (): Step[] => [
  { tab: 'painel', title: 'Boas-vindas à Caixinha!', body: <p>Vamos conhecer o app em 1 minuto. Use <b>Próximo</b> para avançar ou <b>Pular</b> para fechar. Dá para rever depois em Ajustes.</p> },
  {
    tab: 'painel',
    title: 'Instale no celular',
    body: isInstalled()
      ? <p>Você já está usando o app instalado. É só abrir pelo ícone <b>Caixinha</b> da Tela de Início.</p>
      : (
        <ol>
          <li>No iPhone, abra este endereço no <b>Safari</b>.</li>
          <li>Toque em <b>Compartilhar</b> (quadrado com seta para cima).</li>
          <li>Escolha <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</li>
          <li>Abra sempre pelo ícone <b>Caixinha</b>: funciona sem internet e o iPhone não apaga os dados.</li>
        </ol>
      ),
  },
  { tab: 'ajustes', target: 'sync', title: 'Conecte ao Google Drive', body: <p>Toque em <b>Conectar ao Google Drive</b> para guardar uma cópia dos dados e usar o app em mais de um aparelho. Se aparecer "O Google não verificou este app", toque em <b>Avançado → Acessar</b>.</p> },
  { tab: 'painel', target: 'tabs', title: 'O menu', body: <p>As 6 abas ficam aqui em cima: <b>Painel</b>, <b>Gastos</b>, <b>Importar</b>, <b>Caixinha</b>, <b>Histórico</b> e <b>Ajustes</b>.</p> },
  { tab: 'painel', target: 'month', title: 'Escolha o mês', body: <p>Use <b>‹</b> e <b>›</b> para ver outros meses. Nos meses futuros aparecem as parcelas que já vão cair na fatura.</p> },
  { tab: 'painel', target: 'hero', title: 'Quanto aportar no mês', body: <p>A soma do <b>aporte fixo</b>, dos <b>gastos excedentes</b> e do que ficou faltando de <b>meses anteriores</b>. Embaixo, quanto já foi aportado e quanto falta.</p> },
  { tab: 'painel', target: 'categories', title: 'Suas categorias', body: <p>Cada cartão mostra o gasto, o limite, quanto ainda dá para gastar, a comparação com o mês anterior e a previsão até o fim do mês. Toque num cartão para ver os gastos dele.</p> },
  { tab: 'importar', target: 'import', title: 'Importe as faturas', body: <p>Escolha o PDF da fatura (C6 ou Nubank) ou do extrato Nubank, até vários de uma vez. Na revisão, escolha a categoria do que o app não reconheceu (ele dá dicas como <b>💡 Parece: academia</b>) e, nas compras parceladas, se contam <b>por mês</b> ou <b>à vista</b>.</p> },
  { tab: 'lancamentos', target: 'search', title: 'Busque qualquer gasto', body: <p>Digite aqui para achar lançamentos de <b>todos os meses</b>. Com <b>Selecionar</b>, dá para mover vários de categoria de uma vez. Errou? Toque em <b>↶ Desfazer</b>.</p> },
  { tab: 'lancamentos', target: 'new', title: 'Lançamentos', body: <p>Crie gastos que não vieram da fatura. Ao tocar num lançamento, dá para <b>dividir com outras pessoas</b> (só a sua parte conta) e marcar <b>Repete todo mês</b> para assinaturas e contas fixas.</p> },
  { tab: 'caixinha', target: 'caixinha', title: 'A caixinha', body: <p>O saldo estimado, o que está pendente e o crédito. As aplicações dos extratos Nubank entram sozinhas e quitam primeiro o mês mais antigo.</p> },
  { tab: 'caixinha', target: 'goal', title: 'Meta', body: <p>Defina quanto quer juntar e até quando: o app mostra o progresso e quanto aportar por mês.</p> },
  { tab: 'historico', target: 'charts', title: 'Histórico', body: <p>Gráficos dos meses, as parcelas dos próximos meses e o botão para baixar o relatório em PDF ou Excel.</p> },
  { tab: 'painel', target: 'close', title: 'Feche o mês', body: <p>Quando o mês acabar e tudo estiver classificado, feche o mês: os valores ficam congelados e o que faltar aportar passa para o mês seguinte.</p> },
  { tab: 'painel', target: 'actions', title: 'Tema e ajuda', body: <p><b>◐</b> troca entre automático, claro e escuro. <b>?</b> explica a tela em que você está.</p> },
  { tab: 'painel', title: 'Pronto!', body: <p>Agora é com você. Para ver este tour de novo: <b>Ajustes → Ver o tour de novo</b>.</p> },
];

const SEEN_KEY = 'caixinha-tour-visto';

export function tourSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* sem armazenamento */ }
}

type Rect = { top: number; left: number; width: number; height: number };

/** Parte alta demais: destaca só o começo dela, para sobrar espaço para o balão. */
const clampRect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: Math.min(r.height, window.innerHeight * 0.42) });
const headerBottom = () => document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;

/** Tour guiado: escurece a tela, destaca a parte explicada e mostra o balão com o texto. */
export function Tour({ goTo, onClose }: { goTo: (tab: TourTab) => void; onClose: () => void }) {
  const [steps] = useState(STEPS);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];
  // altura real do balão, para escolher onde ele cabe
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(0);
  useLayoutEffect(() => {
    const h = bubbleRef.current?.getBoundingClientRect().height ?? 0;
    if (Math.abs(h - bubbleH) > 1) setBubbleH(h);
  });

  const close = useCallback(() => { markSeen(); onClose(); }, [onClose]);

  // vai para a aba do passo e encontra a parte destacada (espera a aba aparecer)
  useLayoutEffect(() => {
    goTo(step.tab);
    setRect(null);
    if (!step.target) return;
    let tries = 0;
    let raf = 0;
    let scrolled = false;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        if (!scrolled) {
          const h = el.getBoundingClientRect().height;
          if (h > window.innerHeight * 0.42) {
            // parte alta: leva o começo dela para logo abaixo do cabeçalho
            window.scrollBy({ top: el.getBoundingClientRect().top - headerBottom() - 12, behavior: 'auto' });
          } else el.scrollIntoView({ block: 'center', behavior: 'auto' });
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        if (r.width > 0) setRect(clampRect(r));
      }
      if (tries++ < 40) raf = requestAnimationFrame(find); // ~0,7 s: acompanha a animação de entrada da aba
    };
    raf = requestAnimationFrame(find);
    return () => cancelAnimationFrame(raf);
  }, [i, step.tab, step.target, goTo]);

  // mantém o destaque no lugar ao girar o celular ou rolar
  useEffect(() => {
    if (!step.target) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) setRect(clampRect(el.getBoundingClientRect()));
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, steps.length]);

  const last = i === steps.length - 1;
  const pad = 6;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // balão embaixo da parte destacada quando cabe; senão em cima; senão no rodapé, com o destaque encurtado
  const gap = pad + 12;
  let spot = rect;
  let bubbleStyle: React.CSSProperties = { top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const bh = bubbleH || 220;
    if (rect.top + rect.height + gap + bh <= vh - 8) bubbleStyle = { top: rect.top + rect.height + gap };
    else if (rect.top - gap - bh >= 8) bubbleStyle = { bottom: vh - rect.top + gap };
    else {
      bubbleStyle = { bottom: 8 };
      spot = { ...rect, height: Math.max(Math.min(rect.height, vh - 8 - bh - gap - rect.top), 24) };
    }
  }

  return createPortal(
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {spot
        ? <div className="tour-spot" style={{ top: spot.top - pad, left: spot.left - pad, width: spot.width + pad * 2, height: spot.height + pad * 2 }} />
        : <div className="tour-dim" />}
      <div className="tour-bubble" style={bubbleStyle} key={i} ref={bubbleRef}>
        <div className="tour-head">
          <b>{step.title}</b>
          <span className="muted small">{i + 1} de {steps.length}</span>
        </div>
        <div className="tour-body small">{step.body}</div>
        <div className="tour-actions">
          {!last && <button type="button" className="link-btn small" onClick={close}>Pular tour</button>}
          <span className="tour-nav">
            {i > 0 && <button type="button" className="btn ghost small" onClick={() => setI(i - 1)}>Voltar</button>}
            {last
              ? <button type="button" className="btn primary small" onClick={close}>Começar a usar</button>
              : <button type="button" className="btn primary small" autoFocus onClick={() => setI(i + 1)}>Próximo</button>}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
