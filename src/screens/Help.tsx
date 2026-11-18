import type { ReactNode } from 'react';

function Item({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="card details help-item" open={open}>
      <summary>{title}</summary>
      <div className="help-body">{children}</div>
    </details>
  );
}

const appUrl = () => `${location.origin}${location.pathname}`;

export function Help({ onBack }: { onBack: () => void }) {
  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="help-title">Ajuda</h1>
        <button className="btn ghost small" onClick={onBack}>Voltar</button>
      </div>
      <p className="muted small">Endereço do app: <b className="break">{appUrl()}</b></p>

      <Item title="Instalar no iPhone" open>
        <ol>
          <li>Abra o endereço acima no <b>Safari</b>.</li>
          <li>Toque no botão <b>Compartilhar</b> (quadrado com uma seta para cima).</li>
          <li>Role a lista e toque em <b>Adicionar à Tela de Início</b>, depois em <b>Adicionar</b>.</li>
          <li>Abra sempre pelo ícone <b>Caixinha</b> da Tela de Início: assim o app funciona sem internet e o iPhone não apaga os dados.</li>
        </ol>
        <p className="muted small">Se o app ficar só aberto numa aba do Safari, sem ser adicionado à Tela de Início, o iPhone pode apagar os dados depois de alguns dias sem uso. Conectar o Google Drive também protege contra isso.</p>
      </Item>

      <Item title="Instalar no Windows">
        <ol>
          <li>Abra o endereço acima no <b>Microsoft Edge</b> ou no <b>Google Chrome</b>.</li>
          <li>Clique no ícone <b>Instalar aplicativo</b> no fim da barra de endereço. Se ele não aparecer, abra o menu <b>⋯</b> → <b>Aplicativos</b> → <b>Instalar este site como aplicativo</b>.</li>
          <li>O app ganha um ícone no menu Iniciar e abre numa janela própria.</li>
        </ol>
      </Item>

      <Item title="Usar em mais de um aparelho (Google Drive)">
        <ol>
          <li>No primeiro aparelho: <b>Ajustes</b> → <b>Conectar ao Google Drive</b> e entre com a sua conta Google.</li>
          <li>Nos outros aparelhos: na tela inicial, toque em <b>Já uso em outro aparelho</b> e entre com a mesma conta.</li>
          <li>Depois disso, tudo sincroniza sozinho ao abrir o app e alguns segundos depois de cada alteração.</li>
        </ol>
        <p className="small">
          <b>Aviso "O Google não verificou este app":</b> é esperado, porque o app é de uso particular. Toque em <b>Avançado</b> e depois em <b>Acessar</b>.
          Só as contas cadastradas pelo administrador conseguem entrar.
        </p>
        <p className="muted small">O app usa só uma pasta oculta do seu Drive, reservada para ele. Ele não vê nem altera seus outros arquivos.</p>
      </Item>

      <Item title="Importar faturas e extratos">
        <ol>
          <li>No app do banco, baixe o <b>PDF</b> da fatura do cartão (C6 ou Nubank) ou do extrato da conta Nubank.</li>
          <li>Aqui, vá em <b>Importar</b> → <b>Escolher arquivo PDF</b> e selecione o arquivo. No iPhone, ele costuma estar em <b>Arquivos</b> → <b>Downloads</b>.</li>
          <li>A fatura da C6 pede senha: os <b>6 primeiros dígitos do CPF</b> do titular. O app guarda a senha para as próximas vezes.</li>
          <li>Na revisão, escolha a categoria do que o app não reconheceu e toque em <b>Importar</b>. O que você ensinar, ele memoriza.</li>
        </ol>
        <p className="muted small">Importar o mesmo PDF duas vezes não duplica nada.</p>
      </Item>

      <Item title="Como o aporte é calculado">
        <p className="small">
          Cada categoria tem um <b>limite</b> de gastos mensal. Quando ultrapassado, os gastos excedentes contam em blocos, e cada bloco
          gera um aporte na caixinha. Um bloco incompleto conta como inteiro.
        </p>
        <p className="small">Exemplo: limite de R$ 500, a cada R$ 100 aportar R$ 50. Gastou R$ 650 → excedeu R$ 150 → 2 blocos → aporte de <b>R$ 100</b>.</p>
        <p className="small">Além disso, todo mês tem o <b>aporte fixo</b> definido em Ajustes. Categorias como "Gastos necessários" podem ficar sem limite e não geram aporte.</p>
      </Item>

      <Item title="Fechar o mês">
        <p className="small">
          Depois que o mês termina e todos os lançamentos estão classificados, use <b>Fechar mês</b> no Painel. Os valores ficam congelados
          e o aporte por estouro passa a ser devido. Dá para reabrir se precisar corrigir algo.
        </p>
      </Item>

      <Item title="Caixinha">
        <p className="small">
          Ao importar o extrato da conta Nubank, as aplicações e os resgates da caixinha ("RDB") entram sozinhos. Cada aplicação quita
          primeiro o mês pendente mais antigo. Um resgate volta a ser devido. Em <b>Caixinha</b> → <b>Informar saldo</b> você
          corrige o saldo pelo valor real, e a diferença é registrada como rendimento.
        </p>
      </Item>

      <Item title="Onde ficam meus dados?">
        <p className="small">
          Só neste aparelho e, se você conectar, na pasta oculta do app no seu Google Drive. Ninguém mais tem acesso, nem as outras
          pessoas que usam o app. Os PDFs importados são lidos aqui mesmo e não são enviados para lugar nenhum.
        </p>
      </Item>
    </div>
  );
}
