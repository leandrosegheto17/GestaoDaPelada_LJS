# Revisão de código (modo curto): planos-e-cobranca

Base: arquivos da feature na worktree `feature/planos-e-cobranca` (HEAD, diff contra a pai vazio). Só leitura; nenhum teste rodado.
Lidos por inteiro: `aplicacao/plano/*`, `rotas/assinatura.ts`, `rotas/webhook-asaas.ts`, `rotas/plano.ts`, `middlewares/plano-editavel.ts`, repositórios `assinaturas`/`eventos-asaas`/`plano`, migrações 1792845480000, 540000, 600000, 660000, 720000, 780000 (parcial), domínio `plano/*`, telas `Meu plano` e `AssinarPro`. Não lidos a fundo: landing, testes de front, contrato.
Veredito: nenhum achado bloqueante de segurança; 1 bloqueante de correção (R-01) e 3 sugestões críticas.

## Achados

### R-01 (bloqueante, crítica: dinheiro) `pago_ate` some ao reassinar depois de cancelar
`1792845480000_planos-leitura.sql` (`plano_do_grupo` e `plano_grupos_da_criadora`, `ORDER BY (a.situacao <> 'cancelada') DESC, criada_em DESC`). Grupo `cancelado` com `pago_ate` 2026-12-01 (assinatura cancelada). A criadora assina de novo (`assinar.ts:96`; nova linha `aguardando_pagamento`, `pago_ate` NULL). A ordenação prefere a não cancelada, então `pago_ate` vira NULL e `planoEfetivo` (`cancelado` + `pagoAte` nulo) devolve `free` na hora. Quem pagou até 01/12 perde os dias pagos assim que clica em Assinar, antes de pagar. O teste `planos-leitura.test.ts:79` só cobre não cancelada com `pago_ate` preenchido, então não pega.
Correção: `pago_ate` = `max(pago_ate)` entre as assinaturas do grupo (a mais recente com `pago_ate` não nulo); mesma mudança em `plano_grupos_da_criadora`. Migração nova (aditiva), com teste do caso "cancelada com data + pendente nova".

### R-02 (sugestão, crítica: dinheiro) Grupo de cortesia pode assinar e pagar por nada
`assinar.ts:71-96` não confere `situacaoComercial`. PLA-58 só esconde o botão na tela (`MeuPlano.tsx`, `p.plano !== 'cortesia'`); a API aceita `POST …/assinatura` de `uso_proprio`. O pagamento ativa a assinatura, mas `plano_ativar` mantém `uso_proprio` (migração 720000, `[LACUNA]`), então a criadora é cobrada R$ 9,90/mês sem efeito.
Correção: `assinar` devolve erro de estado (409 ou `nao_encontrado`) quando `dados.situacaoComercial === 'uso_proprio'`, antes de chamar o Asaas, com teste.

### R-03 (sugestão, crítica: transação) Ordem de locks invertida entre cancelar da criadora e webhook
`assinatura_cancelar` (600000): `grupos FOR UPDATE` e depois `assinaturas FOR UPDATE`. Webhook (`asaas_evento_registrar` 660000 e `plano_*` 720000): `assinaturas FOR UPDATE` e depois `grupos FOR UPDATE`. O webhook não usa a trava de grupo (`cancelar.ts` comenta isso). Um cancelar e um evento da mesma assinatura ao mesmo tempo podem dar deadlock (40P01). O webhook sai 500 e o Asaas reenvia (ok). O cancelar da criadora vira 500 depois de `removerAssinatura` já ter funcionado no Asaas; o grupo só se acerta quando o `SUBSCRIPTION_DELETED` chega. Não há teste de concorrência cancelar × webhook (`concorrencia/webhook-asaas.test.ts` cobre só webhook × webhook).
Correção: travar o grupo primeiro em `plano_*` e `asaas_evento_registrar` (mesma ordem), ou ler `assinaturas` sem `FOR UPDATE` antes de travar o grupo. Adicionar o teste.

### R-04 (sugestão, crítica: dinheiro) Erro inesperado depois de `criarAssinatura` deixa assinatura órfã cobrando
`assinar.ts:108-122`: a compensação só cobre `primeiraCobranca` falha e `registrar` com resultado de negócio. `assinaturas.registrar` relança erro desconhecido (`assinaturas.ts`, `default: throw erro`), e qualquer falha do COMMIT também. Nesses casos a assinatura fica viva no Asaas, sem linha local: o webhook a trata como `assinatura_desconhecida` (200) e a cliente é cobrada sem Pro.
Correção: envolver o trecho depois de `criarAssinatura` em try/catch que chame `compensar` e relance; documentar o caso de falha no COMMIT (limpeza manual por log). Teste com dublê que lança no `registrar`.

### R-05 (sugestão, comum) Webhook antes do commit do assinar é perdido
`assinar` chama o Asaas dentro da transação e só grava no fim. Se o primeiro evento da assinatura (ex.: `PAYMENT_CREATED`) chegar antes do COMMIT, vira `assinatura_desconhecida`: fica gravado, nenhum aviso `cobranca_gerada`, e não há reprocessamento. Para pagamento (`PAYMENT_RECEIVED`) o risco é baixo, pois exige ação humana depois da resposta. Pergunta ao dono: aceitar, ou documentar na spec o aviso de cobrança gerada perdido?

### R-06 (sugestão, comum) Transação e trava presas durante até três chamadas ao Asaas
`assinar.ts` e `cancelar.ts` seguram a conexão do Hyperdrive e o advisory lock do grupo durante `criarCliente`, `criarAssinatura` e `primeiraCobranca` (10 s cada, até ~30 s). É decisão registrada (AD-097), mas o limite de conexões do Neon e a trava ficam ocupados; vale um teste de tempo ou comentário com o teto.

### R-07 (sugestão, comum) `efeito` do evento sem efeito nunca é gravado
`webhook.ts` (`[LACUNA]`, comentário no topo) diz que a `pelada_app` não tem UPDATE e por isso `nenhum:<motivo>` não é gravado. Mas `asaas_evento_sem_efeito` existe, é `GRANT EXECUTE` à `pelada_app` (720000, final) e tem teste (`banco/planos-webhook-transicoes.test.ts`); `eventosAsaas` (repositório) não a expõe e `aplicarEventoAsaas` não a chama. Código morto e conferência de eventos sem motivo (PLA-49, PLA-51). Correção: chamar a função no ramo `case 'nenhum'` (e para `fora_de_ordem`), ou remover a função e a LACUNA.

### R-08 (sugestão, comum) Comparação de `dateCreated` como texto cru
`eventos-asaas.ts` (domínio, `evento.dataCriacao < assinatura.ultimoEventoEm`) compara o texto do corpo, enquanto o banco só converte o formato exato `AAAA-MM-DD HH:MM:SS` (`asaas_data`, 660000). Um `dateCreated` em outro formato (ex.: `T` no meio) compara como "mais novo" no domínio e vira NULL no banco: o evento é aplicado e `ultimo_evento_em` não avança. Correção: validar o formato no contrato `asaasEventoCorpo` (ou `ehDataHoraValida` no domínio) e tratar fora do formato como `null` (então `fora_de_ordem` quando já houve evento).

### R-09 (sugestão, comum) Front abre a fatura fora do gesto do usuário
`AssinarPro.tsx` (`onSuccess: abrirFatura`): `window.open` depois de uma requisição assíncrona é bloqueado por Safari e iOS (PWA). A fatura em aberto aparece em `AssinaturaAtual` (confirmar link visível ao recarregar), mas o fluxo principal pode parecer sem efeito. Correção: depois do 201, mostrar também link "Abrir fatura" (`<a target="_blank" rel="noopener">`) além do `window.open`.

### R-10 (sugestão, comum) `textoValidade` mostra "Pro até <data passada>"
`MeuPlano.tsx` (`textoValidade`): plano `pro` por situação `ativo` com `pagoAte` já vencido (pagamento atrasado e ainda sem `PAYMENT_OVERDUE`) exibe data no passado. Só texto; mostrar "Pro" sem data quando `pagoAte < hoje` ou esclarecer no PLA-52.

## Perguntas
- P-01: `trialFimEm` é o último dia Pro (`rotas/plano.ts`); a tela mostra "Trial Pro até 14/11". Confirmado pelo usuário? (LACUNA aberta no domínio e na rota; registrar em AD.)
- P-02: A criadora é avisada de pagamento recusado por valor divergente ou assinatura cancelada? Hoje não (`webhook-asaas.ts`, `MOTIVOS_SEM_AVISO`; LACUNA aberta).

## Conferido sem achado
Idempotência do webhook (`ON CONFLICT (id) DO NOTHING` e `FOR UPDATE` na assinatura; transações desfeitas em erro, 500 e reenvio); autenticação (token em tempo constante, 401 sem gravar, limite e corpo antes do banco); `trial_inicio = NULL` ao ativar (CHECK `grupos_trial`); cortesia mantida em `plano_ativar`, `plano_inadimplente` e `plano_cancelado`; trava de 20 jogadores com advisory lock e releitura; somente leitura com GET e HEAD fora da trava e tabela de escritas por regex; `planoEfetivo` com `trial_inicio` NULL cai em `free` e no futuro segue `trial`; `pagoAteDe` limitado ao fim do mês; CPF não gravado.
Testes: sem asserção fraca nos arquivos de plano e webhook (apenas dois `toBeDefined` em testes de caracterização e cortesia, aceitáveis). Lacunas de teste: R-01, R-03, R-04.
