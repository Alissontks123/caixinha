# Plano — Controle de Gastos e Caixinha

## Visão geral
App web instalável (PWA) que roda localmente no navegador de cada aparelho (Windows e iPhone),
funciona offline, com custo zero. Código publicado no GitHub Pages; dados ficam apenas no
aparelho (IndexedDB) e numa pasta privada do Google Drive de cada usuário (sincronização).

## Usuários
- Até 4 pessoas, cada uma com dados totalmente isolados.
- Cada pessoa pode usar vários aparelhos; sincronização automática via Google Drive
  (pasta oculta `appDataFolder`, só o app enxerga). Login com a conta Google.
- Sem senha/PIN no app.

## Fontes de dados (somente PDF)
| Documento | Banco | Uso |
|---|---|---|
| Fatura do cartão | C6 (PDF com senha) | Gastos no cartão |
| Fatura do cartão | Nubank | Gastos no cartão |
| Extrato da conta | Nubank | Pix, boletos, débitos e movimentações da caixinha |

- Não há Pix pelo C6 → não se importa extrato C6.
- Senha da fatura C6 (6 primeiros dígitos do CPF) salva no perfil do usuário; se falhar, pede de novo.
- Ano das transações deduzido do vencimento/fechamento da fatura (as linhas só trazem dia/mês).
- Conferência: soma das transações lidas × total informado na fatura; avisa se divergir.
- Detecção de duplicidade ao importar o mesmo documento duas vezes.
- Lançamento manual de gastos (ex.: dinheiro).

### Cartões adicionais
- Os gastos pertencem ao **portador** do cartão: ao importar, o app separa por cartão
  (nome/final) e só considera os cartões do usuário (ex.: cartão adicional de outra pessoa
  dentro da fatura do titular).

### Fatura — o que conta
- Compras e parcelas: contam.
- IOF de compra internacional: conta na categoria da compra (IOF + "IOF de volta" se anulam).
- Estornos/créditos na fatura: abatem o gasto (ex.: Anuidade 98,00 − Estorno 98,00 = 0).
- Pagamentos de fatura ("Pagamento em…", "Pag Fatura Boleto"): ignorados.

### Extrato Nubank — o que conta
- Saídas que contam como gasto: Pix enviado, pagamento de boleto, débito automático,
  débito em conta / compra no débito.
- Ignorados automaticamente: pagamento de fatura, Compra de Ações, Conversão para Conta Global,
  transferências para contas do próprio usuário (pelo nome/CPF), aplicações/resgates da caixinha
  (tratados na Caixinha).
- Pix para pessoa física → sempre "A identificar".
- Entradas: só estornos contam (abatem o gasto); Pix recebido e créditos são ignorados.

## Regras de cálculo
- Mês do gasto = data da compra. Parcelas: cada parcela conta no seu mês
  (C6 mostra a data original da compra → mês = data original + (n−1) meses;
  Nubank já mostra a data da parcela).

## Categorias
- Padrão: Alimentação, Hobbys, Gastos desnecessários, Gastos necessários, A identificar.
- Cada categoria tem a opção **"Gera aporte na caixinha"** (faz parte da regra versionada por mês).
  Desligada = sem limite, só mostra o total gasto. "Gastos necessários" vem desligada.
- Editáveis (criar/renomear/excluir) já na configuração inicial e em Ajustes;
  "A identificar" é fixa e funciona só como fila:
  o mês só fecha com ela vazia.
- Classificação especial **"Não é gasto (ignorar)"**, disponível para qualquer lançamento.
- Cada categoria tem: **limite**, **X** (bloco de excedente) e **Y** (aporte por bloco).
- Fórmula: `aporte = ceil((gasto − limite) / X) × Y`, se gasto > limite; senão 0.
  Ex.: limite 500, X 100, Y 50, gasto 650 → ceil(150/100)=2 → R$100.
- Sem compensação entre categorias.
- Ao alterar limite/X/Y, o usuário escolhe a partir de qual mês vale (regras versionadas).

## Categorização automática
- 100% offline: base inicial de regras comuns no Brasil (iFood/IFD*, Uber, Spotify, Netflix,
  Disney, supermercados, postos, farmácias...) + regras pessoais aprendidas a cada
  classificação manual.
- O que não for reconhecido vai para "A identificar" e o app pede a classificação.

## Caixinha (Nubank)
- Configuração inicial: usuário informa o **saldo total da caixinha em uma data**.
- **Aporte fixo mensal**: valor definido pelo usuário, devido todo mês independentemente dos gastos.
  - Começa a valer no mês da data do saldo inicial.
  - Fica devido no **dia 1º** do mês (pode ser aportado durante o próprio mês).
  - Ao alterar o valor, o usuário escolhe a partir de qual mês vale (meses fechados não mudam).
- Devido do mês = aporte fixo + aportes por estouro (os estouros entram no fechamento do mês).
  É uma soma única para fins de quitação; o painel só mostra a divisão como informação.
- A partir dessa data, aplicações e resgates da caixinha no extrato Nubank são lidos automaticamente.
- Aplicação abate a **dívida mais antiga** (FIFO); o excedente vira crédito para meses futuros.
- **Resgate vira dívida de novo** (precisa ser reposto).
- Saldo = inicial + aplicações − resgates; usuário pode informar o saldo real a qualquer momento
  e a diferença é registrada como rendimento.
- Painel: devido × pago por mês, pendente, total acumulado e saldo.

## Fechamento
- Manual ("Fechar mês"), exige "A identificar" vazia; congela o aporte devido.

## Extras
- Alerta dentro do app ao chegar perto do limite (ex.: 80%) — sem push (exigiria servidor).
- Gráficos: evolução mensal por categoria e total aportado.
- Exportar relatório do mês (PDF e Excel).

## Stack técnica
- Vite + React + TypeScript, PWA (service worker), IndexedDB (Dexie).
- Leitura de PDF com pdf.js (suporta PDF com senha), um leitor por layout
  (fatura C6, fatura Nubank, extrato Nubank).
- Google Identity Services + Drive API (app registrado no Google Cloud em modo teste).
- Testes automatizados da fórmula de aporte e dos leitores, com dados **anonimizados**.

## Privacidade
- A pasta `exemplos/` contém dados reais: nunca vai para o Git nem para o GitHub Pages
  (`.gitignore`). Senhas nunca ficam no código.

## Fases
1. ✅ Base do app, categorias/regras editáveis, lançamento manual, cálculo do aporte, caixinha,
   aporte fixo, fechamento de mês, backup em arquivo (concluída em 17/11/2026).
2. ✅ Leitores de PDF (fatura C6, fatura Nubank, extrato Nubank) + categorização + revisão antes de salvar
   (concluída em 17/11/2026). Detalhes:
   - Categorias padrão agora incluem **Assinaturas** e **Viagem** (ambas geram aporte).
   - Regras de base: mercado/restaurante/delivery → Alimentação; streaming/assinaturas → Assinaturas;
     Latam/Airbnb/Smiles/hotéis → Viagem; contas da casa, farmácia/saúde, transporte e tarifas → Gastos necessários.
   - Marketplaces (Shopee, Mercado Livre, Amazon, Magalu, Natura, Sephora, Zara…) sempre perguntam e não são memorizados.
   - Academia: sem regra (pergunta na primeira vez e memoriza).
   - O que o usuário escolhe/corrige é memorizado; também ao trocar a categoria em Lançamentos.
   - Cartões: na primeira fatura o usuário marca quais são dele (memorizado, editável em Ajustes).
   - Compras de mês fechado: aviso e não importa. Duplicados: ignorados.
   - Teste ponta a ponta: `C6_PDF_PASSWORD=... node scripts/smoke-import.mjs` (com `npm run dev -- --port 5199`).
3. ✅ Caixinha automática pelo extrato (concluída em 17/11/2026):
   - "Aplicação RDB" / "Resgate RDB" do extrato Nubank viram movimentos da caixinha. O extrato não diz
     de qual caixinha é: todas vêm marcadas e o usuário pode desmarcar na revisão.
   - Aplicação manual com mesma data/valor é substituída pela do extrato.
   - Movimentos do extrato podem ser excluídos (não editados); excluídos/desmarcados ficam como
     "desconsiderados", não voltam ao reimportar e podem ser restaurados.
   - Boleto/Pix pago ao Banco C6 ou Nu Pagamentos = pagamento de fatura → ignorado.
4. ✅ Alertas, gráficos e exportação (concluída em 17/11/2026):
   - Alertas: faixa "Atenção neste mês" no Painel (estourou / perto do limite), lembrete de aporte
     pendente de meses anteriores, efeito da importação (novos blocos / perto do limite) e aviso rápido
     ao lançar à mão ou trocar categoria.
   - Aba Histórico (a aba Lançamentos passou a se chamar "Gastos"): gastos do mês × limite, evolução mensal
     por categoria, aportes devido × pago e saldo da caixinha; período 6 meses / 12 meses / tudo;
     todos com legenda, dica ao tocar e "ver tabela". Cores = paleta validada para daltonismo, com modo escuro.
   - Exportar relatório (PDF e Excel) de um intervalo de meses: resumo, categorias, lançamentos, caixinha.
5. Sincronização Google Drive + publicação no GitHub Pages + guia de instalação.

## Pendências do usuário
- Nenhum exemplo de **resgate** RDB ainda: o leitor assume "Resgate RDB" como entrada; validar quando aparecer um.
