import { useState, type ReactNode } from 'react';
import { Modal } from './ui';

export type HelpTopic = 'setup' | 'painel' | 'lancamentos' | 'importar' | 'caixinha' | 'historico' | 'ajustes';

const TOPICS: Record<HelpTopic, { title: string; body: ReactNode }> = {
  setup: {
    title: 'Como preencher a configuração',
    body: (
      <>
        <p><b>Saldo inicial da Caixinha Nubank:</b> informe quanto havia na caixinha ao final de um dia. Use o último dia do mês anterior:
          as aplicações e os resgates dos extratos só contam a partir dessa data.</p>
        <p><b>Aporte fixo mensal da caixinha:</b> valor que deve ser aplicado na caixinha todo mês, independente dos gastos.</p>
        <p><b>Categorias:</b> preencha os valores de cada uma. Quando os gastos do mês passam do limite, os gastos excedentes contam em blocos
          (um bloco incompleto conta como inteiro), e cada bloco gera um aporte na caixinha.</p>
        <p className="muted">Exemplo: limite de R$ 500, a cada R$ 100 aportar R$ 50. Gastou R$ 650 → excedeu R$ 150 → 2 blocos → aporte de R$ 100.</p>
        <p>Desligue <b>Gera aporte na caixinha</b> para categorias sem limite, como gastos necessários: elas só mostram o total gasto.</p>
        <p className="muted">Tudo isso pode ser alterado depois em Ajustes.</p>
      </>
    ),
  },
  painel: {
    title: 'Como funciona o Painel',
    body: (
      <>
        <p>Resumo do mês escolhido no topo (use ‹ e › para trocar de mês).</p>
        <p><b>Aportes necessários no mês:</b> funciona como uma fatura. É a soma do <b>fixo devido</b>, dos aportes por
          <b> gastos excedentes</b> das categorias que passaram do limite e do que ficou faltando de <b>meses anteriores</b>.
          Embaixo aparecem o quanto já foi aportado no mês e quanto ainda falta.</p>
        <p>Cada aporte abate primeiro o valor mais antigo (os meses anteriores). O que faltar no fim do mês passa para o mês seguinte.
          Os gastos excedentes de um mês aberto são previsão: só passam para o mês seguinte quando o mês é fechado.</p>
        <p><b>Categorias:</b> cada cartão mostra quanto já foi gasto, quanto ainda dá para gastar ou, se passou do limite, quanto excedeu
          e o aporte gerado. Toque numa categoria para ver os gastos dela.</p>
        <p><b>Atenção neste mês:</b> avisa as categorias perto do limite ou acima dele.</p>
        <p><b>A identificar:</b> gastos importados que o app não soube classificar. Toque para escolher a categoria.</p>
        <p><b>Fechar mês:</b> quando o mês acabar e tudo estiver classificado, feche o mês para congelar os valores. Dá para reabrir se precisar corrigir algo.</p>
      </>
    ),
  },
  lancamentos: {
    title: 'Como funciona a aba Gastos',
    body: (
      <>
        <p>Lista todos os lançamentos do mês escolhido no topo, agrupados por dia.</p>
        <p>Use os botões de categoria no alto para filtrar. Para mudar a categoria de um gasto, use a caixa ao lado do valor:
          o app memoriza o estabelecimento para as próximas importações.</p>
        <p>Embaixo dos gastos <b>A identificar</b>, o app mostra uma dica do que provavelmente é (quando o nome dá alguma pista) e o link
          <b> 🔎 Pesquisar no Google</b>, que abre uma pesquisa com o nome do estabelecimento.</p>
        <p><b>Dividir um gasto:</b> se a fatura cobrou o valor inteiro mas o gasto foi dividido com outras pessoas, toque nele e ligue
          <b> Dividir este gasto com outras pessoas</b>. Informe a sua parte por número de pessoas, percentual ou valor fixo: só a sua parte
          conta nos limites e nos aportes. Nas compras parceladas, as próximas parcelas entram com a mesma divisão, e um estorno
          da compra é dividido na mesma proporção.</p>
        <p>Toque na descrição para editar ou excluir um lançamento. <b>+ Novo lançamento</b> serve para gastos que não vieram de fatura ou extrato.</p>
        <p className="muted">Valores negativos são estornos e abatem o total da categoria. Meses fechados não podem ser alterados: reabra o mês no Painel.</p>
      </>
    ),
  },
  importar: {
    title: 'Como funciona a importação',
    body: (
      <>
        <p>Envie o <b>PDF</b> da fatura do cartão C6 ou Nubank, ou do extrato da conta Nubank, baixado no app do banco.</p>
        <p>O app lê os gastos, confere se a soma bate com o total do documento e sugere a categoria de cada um. Escolha a categoria do
          que ele não reconheceu e toque em <b>Importar</b>. Se não souber o que é, veja a dica embaixo da despesa ou toque em
          <b> 🔎 Pesquisar no Google</b>.</p>
        <p>No extrato da conta Nubank, as aplicações e os resgates da caixinha entram sozinhos na aba Caixinha.</p>
        <p className="muted">A fatura da C6 pede senha: os 6 primeiros dígitos do CPF do titular. Importar o mesmo PDF duas vezes não duplica nada.
          O PDF é lido aqui mesmo e não é enviado para lugar nenhum.</p>
      </>
    ),
  },
  caixinha: {
    title: 'Como funciona a aba Caixinha',
    body: (
      <>
        <p><b>Saldo estimado:</b> saldo inicial + aplicações − resgates + rendimentos informados.</p>
        <p><b>Pendente:</b> aportes de meses fechados que ainda não foram aplicados. <b>Crédito:</b> o que foi aplicado a mais e será usado nos próximos meses.</p>
        <p>Cada aplicação quita primeiro o mês pendente mais antigo. Um resgate precisa ser reposto e volta a ser devido.</p>
        <p>Aplicações e resgates entram sozinhos ao importar o extrato da conta Nubank. Use <b>+ Aplicação</b> e <b>− Resgate</b> só para
          o que não estiver no extrato. <b>Informar saldo</b> corrige o saldo pelo valor real do app do banco, e a diferença é registrada como rendimento.</p>
        <p><b>Devido × pago por mês:</b> cada mês mostra o saldo anterior (o que faltou dos meses anteriores), o fixo, os excedentes,
          o total, o que foi aportado no mês e o que ainda falta. O que falta passa para o mês seguinte.</p>
      </>
    ),
  },
  historico: {
    title: 'Como funciona o Histórico',
    body: (
      <>
        <p>Gráficos para acompanhar os meses: gastos por categoria, evolução mês a mês, aportes devidos × pagos e o saldo da caixinha.</p>
        <p>Use os botões no alto para escolher o período dos gráficos.</p>
        <p><b>Exportar relatório:</b> escolha o mês inicial e o final e baixe em PDF ou planilha (Excel), com o resumo de cada mês,
          as categorias, todos os lançamentos e os movimentos da caixinha.</p>
      </>
    ),
  },
  ajustes: {
    title: 'Como funciona a aba Ajustes',
    body: (
      <>
        <p><b>Perfil e caixinha:</b> seu nome, o saldo inicial da caixinha e a partir de qual porcentagem do limite o app avisa.</p>
        <p><b>Aporte fixo mensal da caixinha</b> e <b>Categorias:</b> ao alterar, escolha a partir de qual mês a mudança vale. Meses fechados não mudam.</p>
        <p><b>Google Drive:</b> conecte para guardar uma cópia dos dados e usar o app em mais de um aparelho.</p>
        <p><b>Cartões:</b> marque quais cartões são seus. Só os gastos deles entram no seu controle.</p>
        <p><b>Senha da C6 e estabelecimentos memorizados:</b> o que o app guardou nas importações. Dá para esquecer a senha ou um estabelecimento.</p>
        <p><b>Backup:</b> salve uma cópia dos dados num arquivo ou restaure uma cópia.</p>
        <p className="muted">Em <b>Ajuda e instalação</b> há o passo a passo para instalar o app no iPhone e no computador.</p>
      </>
    ),
  },
};

/** Botão "?" que abre a explicação da aba atual. */
export function HelpButton({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
  const t = TOPICS[topic];
  return (
    <>
      <button type="button" className="help-btn" aria-label="Como funciona esta tela" title="Como funciona esta tela" onClick={() => setOpen(true)}>?</button>
      {open && (
        <Modal title={t.title} onClose={() => setOpen(false)}>
          <div className="help-modal small">{t.body}</div>
          <div className="row-end"><button type="button" className="btn primary" onClick={() => setOpen(false)}>Entendi</button></div>
        </Modal>
      )}
    </>
  );
}
