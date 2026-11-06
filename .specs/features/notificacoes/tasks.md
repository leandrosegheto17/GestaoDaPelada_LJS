# Notificações — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: .specs/features/notificacoes/spec.md (aprovada em 2026-11-04), conferido em 2026-11-04. Contratos (nada executado ainda): fundação v2, `conta-e-acesso`, `grupos-e-elenco` e `partidas-e-ranking` (`tasks.md` de cada uma) e a spec aprovada da `planos-e-cobranca` (o `tasks.md` dela está sendo gravado em paralelo).
**Branch pai**: `main` (decidido na execu��o: o rascunho das features 1 a 7 est� na `main`, nenhuma executada).
**Feature**: 8 de 8 do roteiro (AD-001, AD-015). Requisitos `NOT-*`.

> Convenções: `S:` = `.specs/features/notificacoes/spec.md`; `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `CA:` = `.specs/features/conta-e-acesso/tasks.md`; `GE:` = `.specs/features/grupos-e-elenco/tasks.md`; `PR:` = `.specs/features/partidas-e-ranking/tasks.md`; `PC:` = `.specs/features/planos-e-cobranca/spec.md`; `M:` = as 23 migrações copiadas pela fundação (AD-003), em `backend/api/src/infraestrutura/db/migracoes/`, conferidas em `GestaoDaPelada_LJS@e557292`. Do zero (AD-002): nenhum código de biblioteca ou do LJS é copiado. ADs novas AD-098 a AD-112 e AD-116 (lista no fim). Nome de teste de tarefa de risco alto cita o `NOT-NN`.

## Delta

1. **Exclusão de conta anonimiza, não apaga** (`M:1792843800000_conta-senha-bloqueio.sql:143-149`, `excluida_em = now()`): um `ON DELETE CASCADE` não cumpre NOT-55. Vale uma trigger em `contas.excluida_em` (AD-102), sem redefinir `conta_excluir`, que a `planos-e-cobranca` redefine para PLA-68 (`PC:244`).
2. **A `planos-e-cobranca` não emite os 3 eventos da `S:38`**: ela grava os eventos do webhook do Asaas (`PC:178-187`: `id`, `event`, cobrança, assinatura, status, sem valor nem vencimento) e "só grava o estado que a `notificacoes` vai ler" (`PC:21`). Aqui se estende a rota do webhook para enfileirar o aviso depois do commit, com valor e vencimento lidos do corpo (T22). `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` da mesma cobrança são dois eventos: a chave de "uma vez" vira (cobrança, tipo) (AD-105, decisão do usuário).
3. **Plano conferido em dois pontos**: NOT-51 manda a função SQL conferir o plano; PLA-07 (`PC:79`) faz do `recursoLiberado` o único ponto da regra. Vale: a API chama `recursoLiberado` e a função confere slug ativo e teto (AD-104, decisão do usuário).
4. **Envio**: Cloudflare Queues (fila `avisos`, consumidor com 1 mensagem por invocação) e enfileiramento por `waitUntil` depois do `COMMIT` (AD-098). Criar a fila é passo do usuário no `/preparar` Nível 2, como os secrets VAPID; nenhuma tarefa de infraestrutura aqui.
5. **Criptografia do zero** com a Web Crypto (AD-099), e P-256 provada pelo próprio vetor do RFC 8291 rodando no pool do `workerd` (AD-100): se falhar, a T2 para e pergunta.
6. **Rotas que a spec não nomeou** (AD-103): `GET /api/publico/:slug/push` (disponível e chave pública, NOT-14 e NOT-61 em tempo de execução) e `POST .../push/estado` (NOT-71, exige `auth`, não enumera); o par em `/api/conta/push`. Avisos de cobrança ficam em Minha conta, `/app/conta` (AD-106).
7. **Comparação visual**: a t01 (`PR:2369`) e a t32 (`CA:1657`) já são comparadas. O controle de push só aparece quando `GET .../push` responde `disponivel: true`; o runner não simula essa rota, então as telas comparadas não mudam (AD-072). Sem `guia.html` em `.specs/mockup/`: o guia é `index.html`, `tokens.css` e `base.css` (AD-111).
8. **Acesso só por função**: as 3 tabelas novas não têm grant para `pelada_app`; tudo passa por funções `SECURITY DEFINER`, e as do envio e da limpeza exigem sessão sem conta e sem slug (AD-101). Decisão nova: teto de 10 assinaturas por conta (AD-107), contra a mesma inflação de NOT-10.
9. **Teste existente afetado**: nenhum teste das features 1 a 7 conhecido muda; a t07 (`CA:1458`) não testa a frase trocada por NOT-59, mas a versão dos termos muda para a data da mudança, sem novo aceite (AD-116).

### Suposições sobre as features 4 e 7 (conferidas pela T0)

| ID | Suposição | Usada em |
|---|---|---|
| S-01 | `recursoLiberado(db, grupoId, 'push')` (`PC:79`) funciona no contexto do slug (rota pública) e numa transação sem conta nem slug (consumidor da fila). Se exigir conta, a T10 faz a `push_envio_grupo` devolver as entradas do `planoEfetivo` e o consumidor chama o `planoEfetivo` puro | T18, T29 |
| S-02 | O `planoEfetivo` é função pura do domínio, exportada pela `planos-e-cobranca` | T18 |
| S-03 | A rota `POST /api/webhooks/asaas` passa pelo `comBanco` e o processamento devolve: evento novo ou repetido (PLA-42), aplicado ou obsoleto (PLA-48), id da cobrança e do grupo, `payment.value` e `payment.dueDate` do corpo | T0, T22 |
| S-04 | Mapa de eventos: `PAYMENT_CREATED` → `cobranca_gerada`; `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` → `pagamento_confirmado`; `PAYMENT_OVERDUE` → `pagamento_atrasado`; só de cobrança de assinatura conhecida (PLA-49) | T22 |
| S-05 | Meu plano é `/app/grupos/:grupoId/plano` (AD-063) | T23, T25 |
| S-06 | `conta_excluir`, mesmo redefinida pela `planos-e-cobranca`, continua gravando `excluida_em` | T9 |
| S-07 | `POST` e `PUT` de partida respondem pelo handler de `rotas/partidas.ts` (`PR:1461`, `PR:1487`), dentro do `comBanco` | T21 |

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| NOT-01 | Controle "Receber avisos do ranking" na t01 com 3 estados, só com push disponível | T28, T37 |
| NOT-02 | Permissão pedida no toque; `subscribe` com `userVisibleOnly` e chave VAPID | T36 |
| NOT-03 | Safari iOS fora do standalone: instrução do FUN-36 no lugar do controle (posição) | T37 |
| NOT-04 | Permissão negada: "avisos desligados" e como ligar, sem chamar a API | T36, T37 |
| NOT-05 | `POST /api/publico/:slug/push` válido grava e responde 201 | T8, T29 |
| NOT-06 | Campo extra, não https, host fora da lista, `p256dh` ou `auth` inválidos: 422 | T1, T29 |
| NOT-07 | Mesmo `endpoint` no grupo: 200 e atualiza; em outro grupo, linha separada | T8, T29 |
| NOT-08 | Slug malformado, inexistente ou arquivado: 404 de PAR-90 | T8, T29 |
| NOT-09 | Grupo sem push pelo plano: 403 `push_indisponivel` | T29 |
| NOT-10 | Teto de 200 por grupo: 409 `limite_assinaturas` | T8, T29 |
| NOT-11 | `X-Pelada: 1`, `LIMITE_PUBLICO`, IP só como chave | T29 |
| NOT-12 | Assinatura guarda só as 6 colunas | T7 |
| NOT-13 | Gravada: estado "assinado" e opção de parar | T37 |
| NOT-14 | Chave pública por rota pública; privada só secret | T4, T28 |
| NOT-15 | Com assinatura ativa: "Parar de receber avisos" | T37 |
| NOT-16 | Cancelar: `DELETE` com `endpoint` e `auth` e `unsubscribe()` | T30, T36 |
| NOT-17 | `DELETE` apaga o que coincide e responde 204 mesmo sem nada | T8, T30 |
| NOT-18 | Cancelar funciona em grupo arquivado ou Free | T8, T30 |
| NOT-19 | `pushsubscriptionchange`: remove a antiga e assina a nova | T35 |
| NOT-20 | Lançar ou editar partida agenda o envio depois do commit | T15, T21 |
| NOT-21 | Transação desfeita: nada enviado | T15, T21 |
| NOT-22 | Envio fora da resposta; falha não mexe na partida | T15, T21 |
| NOT-23 | Excluir partida não avisa | T21 |
| NOT-24 | Só grupo com push disponível no momento do envio | T18 |
| NOT-25 | Payload mínimo, sem dado de jogador, < 4096 bytes cifrado | T5 |
| NOT-26 | `aes128gcm` do RFC 8291, vetor do Apêndice A | T2 |
| NOT-27 | VAPID ES256 (`aud`, `exp` ≤ 24 h, `sub`), `TTL`, `Urgency: normal` | T3, T6 |
| NOT-28 | `Topic` derivado do grupo, até 32 caracteres | T5, T6 |
| NOT-29 | 201 atualiza `ultimo_envio_em` | T6, T18 |
| NOT-30 | 404 ou 410 apaga a assinatura | T6, T18 |
| NOT-31 | 429 ou 5xx: até 2 novas tentativas com `Retry-After` | T6, T19 |
| NOT-32 | 400, 403 ou 413: mantém e reporta só host e status | T6 |
| NOT-33 | Nunca loga `endpoint`, chaves nem payload | T6, T32 |
| NOT-34 | ≤ 40 envios por invocação, 10 ms de CPU com 40 assinaturas | T20 |
| NOT-35 | SW mostra a notificação com `tag` = slug | T34 |
| NOT-36 | Payload ilegível: notificação genérica | T34 |
| NOT-37 | Clique: foca ou abre só caminho relativo `/g/` | T34 |
| NOT-38 | Cobrança: e-mail e push só para a criadora | T11, T22, T24 |
| NOT-39 | Uma vez por evento, mesmo repetido ou em paralelo | T11, T24 |
| NOT-40 | E-mail com grupo, tipo, valor de centavos, vencimento e só o link de Meu plano | T23 |
| NOT-41 | Remetente da conta-e-acesso, cota com reserva de 100% | T24 |
| NOT-42 | Resend falha ou cota acabou: pendente, até 3 vezes em 24 h, Sentry sem conteúdo | T24 |
| NOT-43 | Push de cobrança sem valor, e-mail nem nome | T5, T25 |
| NOT-44 | "Receber avisos de cobrança neste aparelho" em `/app` para a criadora | T31, T38 |
| NOT-45 | `POST` e `DELETE /api/conta/push` com sessão, `X-Pelada`, `LIMITE_ESCRITA` | T9, T31 |
| NOT-46 | Sem assinatura: só o e-mail | T25 |
| NOT-47 | Avisos de cobrança em qualquer plano | T22, T24 |
| NOT-48 | Push de cobrança segue NOT-26 a 37, clique só em `/app/` | T25, T34 |
| NOT-49 | Migração aditiva, timestamp > `1792844520000`, FUN-56 | T7, T33 |
| NOT-50 | `grupo_id`, `FORCE ROW LEVEL SECURITY`, unicidade (grupo, endpoint) | T7 |
| NOT-51 | Contexto público sem acesso direto; função `SECURITY DEFINER` só para `pelada_app` | T8, T12 |
| NOT-52 | Matriz por comando entre contas, com UPDATE e DELETE sem `WHERE` | T12 |
| NOT-53 | Assinatura do organizador isolada por conta | T9, T12 |
| NOT-54 | `endpoint`, `p256dh` e `auth` nunca em resposta | T12, T32 |
| NOT-55 | Conta excluída apaga as assinaturas na mesma transação | T9 |
| NOT-56 | Limpeza diária: 180 dias sem envio aceito | T11, T26 |
| NOT-57 | Registro de avisos de cobrança só com 4 campos, apagado em 90 dias | T7, T11, T26 |
| NOT-58 | `pelada_backup_ro` lê as tabelas novas; dump sem linhas reprova | T13 |
| NOT-59 | Privacidade (t07) cita o push e os e-mails de cobrança | T39 |
| NOT-60 | `.env.example` com `VAPID_PUBLICA`, `VAPID_PRIVADA`, `VAPID_ASSUNTO` | T4 |
| NOT-61 | Sem VAPID: sem controle, rotas 503, sem push; e-mail continua | T18, T28, T29, T37 |
| NOT-62 | README e runbook: gerar chaves, secrets, Cron, troca de chaves | T36, T40 |
| NOT-63 | Serviço de push falso e remetente em memória nos testes | T6, T27, T41 |
| NOT-64 | Jornada "assinar, lançar, aviso chega, cancelar" no E2E | T41 |
| NOT-65 | Duas assinaturas iguais simultâneas: uma linha, 201 e 200 | T8, T29 |
| NOT-66 | Edições seguidas: uma notificação por grupo (`Topic` e `tag`) | T5, T34 |
| NOT-67 | Corpo > 4 KB ou não JSON: 413 ou 422 | T1, T29, T30 |
| NOT-68 | Pro → Free entre o commit e o envio: não envia | T18 |
| NOT-69 | Lote que passa do tempo retoma sem reenviar as aceitas | T10, T19 |
| NOT-70 | Vários grupos no mesmo aparelho: assinaturas separadas | T8, T36 |
| NOT-71 | Permissão `granted` sem assinatura no servidor: volta "Receber avisos" | T28, T37 |
| NOT-72 | Só componentes e tokens do guia, axe, fora da comparação visual | T37, T38 |

Nenhum critério fica fora. Mudam de sentido, pelas ADs: NOT-39 (chave por cobrança e tipo, AD-105), NOT-51 (plano pela API, AD-104), NOT-55 (trigger, AD-102).

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:409`): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje** (`python .claude/scripts/trava-testes.py --rodar`, 2026-11-04): "Testes dispensados neste projeto" — o repositório só tem `.claude` e `.specs`, e as features 1 a 7 não foram executadas.
- **Falhas preexistentes**: nenhuma conhecida; a linha de base é o gate final da `planos-e-cobranca`. O `/executar` roda a suíte uma vez antes do lote 1 e registra aqui o resultado. A T0 é a rede de proteção dos pontos de extensão das features 4 e 7.

## Test Coverage Matrix

> Gerada da Base, dos contratos das features 1 a 7 e das regras de teste do `.claude/CLAUDE.md`. Todo critério e todo caso limite (`S:204-212`) com teste. Nenhum teste chama serviço de push real nem o Resend (NOT-63).

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Domínio (`backend/dominio`) | unit | Payloads, datas dd/mm e valor em reais | `backend/dominio/test/notificacoes/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Corpo da assinatura: válido, cada limite, campo extra, host fora da lista; mensagens da fila | `backend/contrato/test/push.test.ts` | `pnpm --filter @pelada/contrato test` |
| Criptografia e cliente de push | unit (pool `workerd`) | Vetor do RFC 8291 Apêndice A; JWT verificado pela chave pública; cada status do serviço falso | `backend/api/test/infraestrutura/push/*.test.ts` | `pnpm --filter @pelada/api test` |
| Banco: migrações, funções, RLS e grants | integration | Postgres real como `pelada_app` (`comoApp`, `F:909`); matriz abaixo; concorrência com duas conexões; relógio pelas funções `_em` | `backend/api/test/banco/push-*.test.ts`, `backend/api/test/isolamento/push.test.ts` | `pnpm --filter @pelada/api test` |
| Fila, consumidor e Cron | integration | Consumidor com mensagem real, serviço de push falso, remetente em memória; retentativa, retomada, idempotência | `backend/api/test/aplicacao/notificacoes/*.test.ts` | `pnpm --filter @pelada/api test` |
| Rotas | e2e | Pool `workerd` com Postgres local: cada código da spec, 413, 422, 429, 503, 404 de PAR-90; isolamento de rotas (`CA:1070`) | `backend/api/test/rotas/push*.test.ts` | `pnpm --filter @pelada/api test` |
| Limites da plataforma | unit (bench) | 40 assinaturas: ≤ 40 `fetch` de push e ≤ 50 subrequisições no `workerd`; CPU medida no Node | `backend/api/test/infraestrutura/push/limites.test.ts` | `pnpm --filter @pelada/api test` |
| Front: módulo de push, telas e SW | unit | jsdom + Testing Library + axe; `PushManager`, `Notification` e `clients` falsos | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: jornada | e2e | Jornada nova contra o `wrangler dev` com o serviço de push falso | `frontend/web/e2e/notificacoes.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Documentação | none | Gate de build e a checagem do `.env.example` (`F:1886`) | — | gate de build |

**Matriz política × comando** (como `pelada_app`, grupos A e B das contas A e B, nos contextos de conta A, de conta B, de slug de A e sem contexto; cada célula é um teste que morre com grant a mais, policy `USING (true)` para `pelada_app` ou função sem a checagem de contexto):

| Tabela ou função | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `push_ranking` | recusado em todo contexto, inclusive conta A sobre A e slug de A (T12); `pelada_backup_ro` lê tudo (T13) | recusado direto em todo contexto (T12) | recusado, inclusive sem `WHERE` (T12) | recusado, inclusive sem `WHERE` (T12) |
| `push_conta` | recusado em todo contexto, inclusive a própria conta (T12); backup lê (T13) | recusado direto (T12) | recusado, inclusive sem `WHERE` (T12) | recusado, inclusive sem `WHERE` (T12) |
| `avisos_cobranca` | recusado em todo contexto (T12); backup lê (T13) | recusado direto (T12) | recusado, inclusive sem `WHERE` (T12) | recusado, inclusive sem `WHERE` (T12) |
| `push_ranking_assinar` / `_estado` | — | só com slug do contexto e grupo ativo; com conta, recusa; outro slug, `nao_encontrado`; sem `EXECUTE` para `PUBLIC` (T8) | atualiza só a linha de (grupo do slug, endpoint) (T8) | — |
| `push_ranking_cancelar` | — | — | — | só a linha de (grupo do slug, endpoint, auth); `auth` errado não apaga; arquivado apaga (T8) |
| `push_conta_assinar` / `_cancelar` / `_estado` | só da conta do contexto (T9) | só para a conta do contexto; sem conta, recusa (T9) | só a linha da própria conta (T9) | conta B não apaga a de A com o mesmo endpoint (T9) |
| `push_envio_grupo`, `push_ranking_lote`, `push_ranking_resultado`, `aviso_cobranca_*`, `notificacoes_limpar` | com conta ou com slug, recusa (T10, T11) | idem (T11) | idem (T10) | idem (T10, T11) |
| Trigger de `contas.excluida_em` | — | — | anonimizar a conta A apaga só as linhas de A, na mesma transação; rollback mantém (T9) | — |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` |
| Build | Documentação, front e o fim da feature | O comando da seção Linha de base |

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, em sequência. Criticidade: Phases 1 a 14 **críticas**, 15 e 16 **comuns**. Total: 42 tarefas, 16 Phases, 68h. Lotes previstos (até 6h, Phases inteiras, `progresso.py --lote` confirma): L1 = P1 (1,5h, crítico); L2 = P2 (6,5h, crítico; Phase maior que 6h fica inteira); L3 = P3 (3,5h, crítico); L4 = P4 (5,5h, crítico); L5 = P5 (5,5h, crítico); L6 = P6 (4h, crítico); L7 = P7 (4,5h, crítico); L8 = P8 (5h, crítico); L9 = P9 (5h, crítico); L10 = P10 (3,5h, crítico); L11 = P11 (4,5h, crítico); L12 = P12 + P13 (5,5h, crítico); L13 = P14 (3,5h, crítico); L14 = P15 (5,5h, comum); L15 = P16 (4,5h, comum). Lotes com tarefa de `Domínio: sim`: L2 a L13.

### Phase 1: Rede de proteção: pontos de extensão das features 4 e 7 (crítica, 1,5h)

```
T0
```

### Phase 2: Contrato e criptografia (crítica, 6,5h)

```
T1 → T2 → T3 → T4
```

### Phase 3: Payload e cliente de push (crítica, 3,5h)

```
T5 → T6
```

### Phase 4: Migrações: tabelas e funções de assinatura (crítica, 5,5h)

```
T7 → T8 → T9
```

### Phase 5: Migrações: envio, limpeza e isolamento (crítica, 5,5h)

```
T10 → T11 → T12
```

### Phase 6: Backup, repositório e depois do commit (crítica, 4h)

```
T13 → T14 → T15
```

### Phase 7: Fila e envio do ranking (crítica, 4,5h)

```
T16 → T17 → T18
```

### Phase 8: Retentativa, limites e gatilho das partidas (crítica, 5h)

```
T19 → T20 → T21
```

### Phase 9: Avisos de cobrança: gatilho e e-mail (crítica, 5h)

```
T22 → T23 → T24
```

### Phase 10: Push de cobrança, limpeza e push falso de dev (crítica, 3,5h)

```
T25 → T26 → T27
```

### Phase 11: Rotas públicas de push (crítica, 4,5h)

```
T28 → T29 → T30
```

### Phase 12: Rotas da conta e isolamento (crítica, 3,5h)

```
T31 → T32
```

### Phase 13: Ensaio da migração sobre a produção (crítica, 2h)

```
T33
```

### Phase 14: Service worker (crítica, 3,5h)

```
T34 → T35
```

### Phase 15: Web: assinatura e controles (comum, 5,5h)

```
T36 → T37 → T38
```

### Phase 16: Privacidade, documentação e jornada (comum, 4,5h)

```
T39 → T40 → T41
```

## Task Breakdown

#### Phase 1: Rede de proteção: pontos de extensão das features 4 e 7

### T0: Caracterização dos pontos que esta feature estende

**What**: Conferir no código executado as suposições S-01 a S-07 e escrever testes de caracterização do que as tarefas seguintes estendem e precisam manter: status e corpo de `POST` e `PUT` de partida (201 e 200) e de `DELETE` (204); webhook do Asaas com evento novo, repetido e obsoleto (estado do grupo e status 200); `conta_excluir` gravando `excluida_em`; `recursoLiberado(db, grupoId, 'push')` no contexto do slug e sem contexto. Suposição que não vale: pare e pergunte antes do lote 2.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/caracterizacao/notificacoes.test.ts`
**Depends on**: none
**Reuses**: método da skill `rede-de-protecao`; rotas de partida (`PR:1461`, `PR:1487`); webhook (`PC:176-187`); `conta_excluir` (`CA:470`, `M:1792843800000_conta-senha-bloqueio.sql:92`); `recursoLiberado` (`PC:79`)
**Requirement**: NOT-20, NOT-38, NOT-55
**Status**: rascunhada
**Lacunas**: S-01 sem contexto (consumidor da fila) provavelmente não vale: `backend/api/src/aplicacao/plano/recurso-liberado.ts:29` devolve `false` para o grupo que o contexto não enxerga; o teste afirma `false`. Confirmado no verde, o `/executar` pergunta antes do lote 2 se a T10 e a T18 seguem o plano B da S-01.
**Nota do rascunho**: escrita depois da T21 e da T22 (por isso a fila em memória nos casos de partida e de webhook). Teste em `backend/api/test/caracterizacao/notificacoes.test.ts` (projeto `banco`, Node). Evidência preliminar, por leitura, a confirmar no verde: S-01 vale para o slug (`recurso-liberado.ts:33`), sem contexto ver Lacunas; S-02 vale (`backend/dominio/src/plano/plano-efetivo.ts:56`); S-03 vale em parte (`backend/api/src/entrada/rotas/webhook-asaas.ts`, `comBanco` sem contexto; `aplicarEventoAsaas` devolve repetido, assinatura desconhecida, aplicado ou sem efeito com o efeito e o grupo em `backend/api/src/aplicacao/plano/webhook.ts:62`; valor e vencimento a T22 lê do corpo); S-04 vale (`backend/dominio/src/plano/eventos-asaas.ts:20`, `PAYMENT_CREATED` é `nao_tratado` e não obsoleto); S-05 vale (`frontend/web/src/telas/plano/MeuPlano.tsx:23`); S-06 vale (nenhuma migração redefine `conta_excluir` depois de `1792843800000_conta-senha-bloqueio.sql:149`); S-07 vale (`backend/api/src/entrada/rotas/partidas.ts:180`, `:215`).

**Done when**:

- [ ] `Evidência`: cada suposição S-01 a S-07 marcada "vale" ou "não vale" com `arquivo:linha`, registrada nesta tarefa
- [ ] Testes de caracterização verdes sobre o código atual, e vermelhos com o comportamento trocado (registrar o vermelho aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Contrato e criptografia

### T1: Contrato da assinatura de push e lista de hosts

**What**: Schemas `.strict()` `assinaturaPushCorpo` (`endpoint`, `chaves.p256dh`, `chaves.auth`) e `cancelarPushCorpo` (`endpoint`, `chaves.auth`), `endpoint` `https` até 1024 caracteres com host na lista de AD-109 (sem porta, sem credencial na URL, sem IP literal), `p256dh` base64url de 65 bytes começando em `0x04`, `auth` de 16 bytes; códigos `push_indisponivel` e `limite_assinaturas`; `base64url` de ida e volta.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/contrato/src/push.ts`
**Depends on**: T0
**Reuses**: primitivos zod (`CA:550`); AD-066 e AD-109
**Requirement**: NOT-06, NOT-67
**Status**: rascunhada
**Nota do rascunho**: rascunhada antes da T0 (decisão do usuário: só o que não depende da feature 7). O teto de 1024 fica no `endpointPushAceito`, sem `.max` no zod, para o campo ter uma só mensagem.

**Done when**:

- [ ] Casos limite listados antes do código: `http`, host parecido (`fcm.googleapis.com.mal.example`), subdomínio de `push.apple.com`, porta, `user@host`, IP, `p256dh` comprimido de 33 bytes, `auth` de 15 e 17 bytes, base64 com `+` e `/`, campo extra
- [ ] Testes `NOT-06`: cada caso acima recusado com o campo; os hosts da lista aceitos
- [ ] Teste `NOT-67`: corpo não objeto recusado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T2: Cifra aes128gcm do RFC 8291

**What**: `cifrarPayload(texto, { p256dh, auth }, opcoes?)` com a Web Crypto: par efêmero ECDH P-256, `deriveBits`, HKDF-SHA-256 para IKM, CEK (16 bytes) e nonce (12 bytes), AES-128-GCM com delimitador `0x02`, cabeçalho de RFC 8188 com `rs` 4096 e a chave efêmera; `opcoes` injeta a chave efêmera e o sal só para o teste. Do zero (AD-099). Roda no pool do `workerd`, o que prova a P-256 (AD-100).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/push/cifra.ts`
**Depends on**: T1
**Reuses**: RFC 8291 §3 e Apêndice A, RFC 8188 §2 (texto dos RFCs, `S:240`); `base64url` (T1)
**Requirement**: NOT-26
**Status**: rascunhada
**Nota do rascunho**: o vetor do Apêndice A foi transcrito de memória do RFC; se o teste do vetor falhar, confira cada valor contra o texto do RFC antes de mexer na cifra. Os testes de `test/infraestrutura/push/` passam a rodar no projeto `worker` do `vitest.config.ts` (AD-100); a T20 tem parte em Node (bench) e precisa de arquivo fora dessa pasta ou de um terceiro projeto.

**Done when**:

- [ ] Casos limite listados antes do código: vetor do Apêndice A; payload vazio; payload de 3993 bytes (limite de um registro); chave do assinante inválida
- [ ] Teste `NOT-26`: com a chave efêmera e o sal do Apêndice A, a saída é byte a byte igual ao vetor
- [ ] Teste `NOT-26`: o texto cifrado é decifrado com a chave privada do assinante do vetor (ida e volta)
- [ ] Se a P-256 falhar no `workerd`, a tarefa para e a sessão pergunta (AD-100)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T3: Cabeçalho VAPID do RFC 8292

**What**: `cabecalhoVapid(endpoint, chaves, agora)`: importa a chave privada como JWK (`d` de `VAPID_PRIVADA`, `x` e `y` de `VAPID_PUBLICA`), JWT ES256 com `aud` = origem do `endpoint`, `exp` = agora + 12 h, `sub` = `VAPID_ASSUNTO`; devolve `Authorization: vapid t=…, k=…`; cache por origem dentro da invocação.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/push/vapid.ts`
**Depends on**: T2
**Reuses**: RFC 8292 §2 e §3 (`S:240`); assinatura ECDSA em formato IEEE P1363 = JWS; relógio (`GE:831`)
**Requirement**: NOT-27
**Status**: rascunhada
**Nota do rascunho**: a assinatura `cabecalhoVapid(endpoint, chaves, agora, cache?)` ganhou o `cache` opcional da invocação (chave conferida uma vez e um cabeçalho por origem). O par é conferido com assinar e verificar, porque a Web Crypto não promete recusar o JWK com `d` de outro par.

**Done when**:

- [ ] Casos limite listados antes do código: `endpoint` com caminho e consulta (só a origem vai no `aud`); duas origens; chave privada que não casa com a pública
- [ ] Teste `NOT-27`: o JWT verifica com a chave pública; `aud`, `exp` ≤ 24 h e `sub` conferidos
- [ ] Teste `NOT-27`: chave privada e pública que não casam falham ao importar, sem enviar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T4: Script que gera as chaves VAPID e variáveis no .env.example

**What**: `pnpm vapid:gerar` imprime um par P-256 novo (`VAPID_PUBLICA` 65 bytes e `VAPID_PRIVADA` 32 bytes, base64url) sem gravar arquivo; `.env.example` com `VAPID_PUBLICA`, `VAPID_PRIVADA` (segredo) e `VAPID_ASSUNTO` (`mailto:` ou URL), obrigatoriedade "opcional: sem elas o push fica desligado" e formato. Só nomes, nenhum valor.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/vapid-gerar.ts`
**Depends on**: T3
**Reuses**: checagem do `.env.example` (`F:1886`); variáveis só pelo nome (`CA:697`); `cabecalhoVapid` (T3) no teste
**Requirement**: NOT-14, NOT-60
**Status**: rascunhada
**Nota do rascunho**: o `@pelada/api` passa a exportar `./push/vapid` para o teste do script usar o `cabecalhoVapid` (T3). O gitleaks fica para o gate do `/executar`.

**Done when**:

- [ ] Teste `NOT-60`: o `.env.example` tem as 3 variáveis com obrigatoriedade, formato e `VAPID_PRIVADA` marcada como segredo (a checagem do FUN-46 passa)
- [ ] Teste `NOT-14`: o par gerado assina um JWT que verifica (T3), e o script não grava arquivo
- [ ] Gitleaks sem achado; nenhum valor real no `.env.example`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 3: Payload e cliente de push

### T5: Payloads e Topic

**What**: No domínio, `payloadRanking({ nomeGrupo, slug, dataPartida })` (título "Ranking atualizado", texto "<nome>: partida de dd/mm", caminho `/g/<slug>?mes=AAAA-MM`) e `payloadCobranca({ tipo, nomeGrupo, grupoId })` (título com o tipo e o nome, caminho `/app/grupos/<id>/plano`); na infraestrutura, `topicoDoGrupo(grupoId)` = 32 primeiros caracteres do base64url do SHA-256 (AD-110).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/notificacoes/payload.ts`
**Depends on**: T4
**Reuses**: datas do domínio (`PR:457`); campos proibidos de PAR-76 (`PR:913`); S-05
**Requirement**: NOT-25, NOT-28, NOT-43, NOT-66
**Status**: rascunhada
**Nota do rascunho**: `topicoDoGrupo` fica em `backend/api/src/infraestrutura/push/topico.ts`; o tamanho cifrado e o tópico são testados em `backend/api/test/infraestrutura/push/payload.test.ts` (workerd). O payload de cobrança não tem `texto` (NOT-43: "só o título ... e o caminho"); o service worker (T34) trata a ausência. A lista de PAR-76 não é importada (o `CAMPOS_PROIBIDOS_PUBLICO` nasce na T19 da feature 4): o teste confere a lista exata de chaves.

**Done when**:

- [ ] Casos limite listados antes do código: nome de grupo com 120 caracteres e emoji; dia 1 e 31; virada de ano
- [ ] Teste `NOT-25`: o payload tem só título, texto e caminho, nenhum campo de PAR-76, e cifrado (T2) fica abaixo de 4096 bytes no pior nome
- [ ] Teste `NOT-43`: o payload de cobrança não tem valor, e-mail nem nome de pessoa
- [ ] Testes `NOT-28`, `NOT-66`: o tópico tem até 32 caracteres base64url, é o mesmo para o mesmo grupo e não contém o id
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T6: Cliente de envio Web Push

**What**: `enviarPush(assinatura, payload, { vapid, topico, ttl })`: `fetch` `POST` ao `endpoint` (host conferido de novo pela lista de T1) com `Content-Encoding: aes128gcm`, `TTL` (86400 no ranking, 172800 na cobrança), `Urgency: normal`, `Topic` e `Authorization`; classifica a resposta: 201 `aceito`; 404 ou 410 `revogada`; 429 ou 5xx `tentarDeNovo` com `Retry-After` em segundos; 400, 403 e 413 `erro` reportado ao Sentry só com host e status. Serviço de push falso para os testes.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/push/enviar.ts`
**Depends on**: T5
**Reuses**: T2, T3, T5; `limparEvento` e Sentry (`F:1277`, `F:1301`); log sem conteúdo do remetente (`CA:647`)
**Requirement**: NOT-27, NOT-28, NOT-29, NOT-30, NOT-31, NOT-32, NOT-33, NOT-63
**Status**: rascunhada
**Lacunas**: (1) status fora dos citados pela spec (200, 202, 3xx, 401, outros 4xx) viram `erro` reportado e mantêm a assinatura; (2) `fetch` que lança ou passa de 10 s vira `tentarDeNovo` sem atraso (mesmo teto do 5xx). Confirmar com o usuário antes do verde.
**Nota do rascunho**: o serviço de push falso (`servicoPushFalso`) mora no próprio `enviar.ts`, ao lado do remetente em memória do molde (`resend.ts`). Os relatos vão por `reportar` (padrão: `Sentry.captureMessage` só com host, status e motivo).

**Done when**:

- [ ] Casos limite listados antes do código: cada status de 200 a 503; `Retry-After` em segundos e em data HTTP; `fetch` que lança; host fora da lista (não chama `fetch`)
- [ ] Testes `NOT-27`, `NOT-28`: a requisição ao serviço falso leva os 5 cabeçalhos com os valores esperados
- [ ] Testes `NOT-29`, `NOT-30`, `NOT-31`, `NOT-32`: cada status cai na classe certa
- [ ] Teste `NOT-33`: em todos os ramos, nem o console nem o evento do Sentry contêm o `endpoint`, as chaves ou o payload
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 4: Migrações: tabelas e funções de assinatura

### T7: Migração: tabelas de assinatura e de avisos

**What**: Pelo gerador (`F:883`), timestamp maior que `1792844520000` e que a última migração da `planos-e-cobranca`: `push_ranking` (`id` bigint identity, `grupo_id` FK com `ON DELETE CASCADE`, `endpoint`, `p256dh`, `auth`, `criada_em`, `ultimo_envio_em`; `UNIQUE (grupo_id, endpoint)`), `push_conta` (`id`, `conta_id` FK com `ON DELETE CASCADE`, as mesmas colunas, `UNIQUE (conta_id, endpoint)`) e `avisos_cobranca` (`id_externo`, `tipo` com CHECK dos 3 tipos, `grupo_id`, `enviado_em`; PK (`id_externo`, `tipo`)); `ENABLE` e `FORCE ROW LEVEL SECURITY` nas 3, `REVOKE ALL` de `pelada_app` e `PUBLIC`, `GRANT SELECT` e policy `USING (true)` só para `pelada_backup_ro`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_notificacoes-tabelas.sql`
**Depends on**: T6
**Reuses**: gerador (`F:883`); checagem aditiva (`F:858`); RLS das tabelas (`M:1792843320000_rls.sql:33-59`); policy de backup (`M:1792843860000_conta-teto-emails.sql:17`); AD-067, AD-101
**Requirement**: NOT-12, NOT-49, NOT-50, NOT-57
**Status**: rascunhada
**Nota do rascunho**: o timestamp é `1792846200000`, com folga para as migrações que a `planos-e-cobranca` ainda vai ganhar (SPEC_DEVIATION no cabeçalho do SQL); o `/executar` confere a ordem e renomeia se preciso. As duas tabelas com `grupo_id` entraram no cenário (`apoio.ts`, `cenario-grupos.ts`) e na matriz de leitura e escrita da fundação (`matriz.ts`, `casos-escrita.ts`) como `sem-grant`, senão o `criarCenario` falharia. A policy e o grant de backup são `TO pelada_backup_ro`: depois de `1792844220000_roles-padronizadas.sql` a role `pelada_backup` não existe mais, e o `TO pelada_backup` da `planos-e-cobranca` (`1792845420000_planos-tabelas.sql:70-72`) vai falhar numa base nova; ela precisa do mesmo ajuste.

**Done when**:

- [ ] Teste `NOT-12`: as colunas de `push_ranking` são exatamente as 6 (mais o `id`), sem IP, user agent, conta nem jogador
- [ ] Teste `NOT-50`: `relforcerowsecurity` nas 3 tabelas e a unicidade (grupo, endpoint) recusa a segunda linha
- [ ] Teste `NOT-57`: `avisos_cobranca` tem só id externo, tipo, grupo e data
- [ ] Teste `NOT-49`: a checagem do FUN-56 passa e nenhuma migração aplicada mudou
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T8: Migração: funções de assinatura pelo slug

**What**: `push_ranking_assinar(p_slug, p_endpoint, p_p256dh, p_auth)`, `push_ranking_cancelar(p_slug, p_endpoint, p_auth)` e `push_ranking_estado(p_slug, p_endpoint, p_auth)`, `SECURITY DEFINER`, `search_path` fixo, `REVOKE ALL FROM PUBLIC`, `EXECUTE` só para `pelada_app`; exigem sem conta e `p_slug = app_slug_publico()`. Assinar: grupo não arquivado (senão `nao_encontrado`), trava por grupo (`pg_advisory_xact_lock`), teto de 200 sem contar o próprio `endpoint`, `INSERT … ON CONFLICT (grupo_id, endpoint) DO UPDATE` das chaves, devolve `criada`, `atualizada` ou `limite`. Cancelar: acha o grupo pelo slug também arquivado e apaga só com `endpoint` e `auth` iguais, sem dizer se havia. O plano fica na API (AD-104).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_push-ranking-funcoes.sql`
**Depends on**: T7
**Reuses**: molde de `evento_publico_registrar` (`PR:1038`, sem conta e slug do contexto); molde de função (`M:1792843680000_conta-admins-listar.sql:8-21`); AD-065, AD-034
**Requirement**: NOT-05, NOT-07, NOT-08, NOT-10, NOT-17, NOT-18, NOT-51, NOT-65, NOT-70
**Status**: rascunhada
**Nota do rascunho**: `push_ranking_estado` devolve texto (`ativa`, `ausente` ou `nao_encontrado`), e `push_ranking_cancelar` devolve `void` e ignora em silêncio um slug que não é o do contexto (a API responde 204 de qualquer jeito). Os testes de corrida usam duas conexões com COMMIT real e limpam as linhas `t8-*` no `finally`.

**Done when**:

- [ ] Casos limite listados antes do código: 199 e 200 assinaturas; o mesmo `endpoint` no limite; slug de outro grupo; com conta; arquivado; `auth` errado; duas conexões assinando o mesmo `endpoint`; duas assinando endpoints diferentes com 199
- [ ] Testes `NOT-05`, `NOT-07`, `NOT-70`: `criada`, depois `atualizada` com as chaves novas e uma linha só; no grupo B, outra linha
- [ ] Testes `NOT-08`, `NOT-51`: slug arquivado ou que não é o do contexto devolve `nao_encontrado`; com conta, recusa
- [ ] Teste `NOT-10`: com 200 linhas, `limite` sem gravar; reassinar um `endpoint` existente segue valendo
- [ ] Testes `NOT-65`: duas conexões com o mesmo `endpoint` gravam uma linha, uma `criada` e outra `atualizada`; com 199, duas novas simultâneas deixam 200
- [ ] Testes `NOT-17`, `NOT-18`: `auth` errado não apaga; grupo arquivado apaga
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T9: Migração: funções da conta e limpeza na exclusão

**What**: `push_conta_assinar`, `push_conta_cancelar` e `push_conta_estado`, `SECURITY DEFINER` como na T8, exigindo `app_conta_id()` de conta não excluída, com teto de 10 por conta (AD-107); trigger `AFTER UPDATE OF excluida_em ON contas` que apaga `push_conta` da conta quando `excluida_em` passa de nulo a preenchido (AD-102).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_push-conta-funcoes.sql`
**Depends on**: T8
**Reuses**: T8; molde de trigger (`M:1792844520000_grupos-arquivar-so-criadora.sql:8-25`); `conta_excluir` (`M:1792843800000_conta-senha-bloqueio.sql:143-149`); S-06
**Requirement**: NOT-45, NOT-53, NOT-55
**Status**: rascunhada
**Nota do rascunho**: a trigger roda como `SECURITY DEFINER` e dispara só na passagem de `excluida_em` de nulo a preenchido (`WHEN`), então nenhuma exclusão posterior reapaga. O teste de `conta_excluir` usa o cenário de conta e a senha de A, com a conta sem vínculo como segunda admin do grupo A.

**Done when**:

- [ ] Casos limite listados antes do código: conta excluída chamando; 10 e 11 assinaturas; contas A e B com o mesmo `endpoint`; `conta_excluir` com rollback
- [ ] Testes `NOT-45`, `NOT-53`: a conta B não cancela nem consulta a assinatura de A com o mesmo `endpoint`; sem conta, recusa
- [ ] Teste `NOT-55`: `conta_excluir` apaga as assinaturas da conta na mesma transação; com `ROLLBACK`, elas ficam; as de outra conta ficam
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 5: Migrações: envio, limpeza e isolamento

### T10: Migração: funções do envio do ranking

**What**: `push_envio_grupo(p_grupo)` (nome, slug, arquivado e, se S-01 não valer, as entradas do `planoEfetivo`), `push_ranking_lote(p_grupo, p_apos_id, p_limite, p_desde)` (assinaturas por `id` crescente, só as sem envio aceito desde `p_desde`) e `push_ranking_resultado(p_aceitos bigint[], p_revogados bigint[])` (`ultimo_envio_em = now()` e `DELETE`), `SECURITY DEFINER`, exigindo sessão sem conta e sem slug (AD-101).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_push-envio-funcoes.sql`
**Depends on**: T9
**Reuses**: T8; S-01
**Requirement**: NOT-29, NOT-30, NOT-69
**Status**: rascunhada
**Nota do rascunho**: `push_ranking_resultado` recebe o grupo do lote como primeiro parâmetro (`p_grupo`, SPEC_DEVIATION no SQL) para que o id de outro grupo seja ignorado. `push_envio_grupo` devolve só nome, slug e arquivado: S-01 ainda não foi conferida (a T0 não rodou); se não valer, o `/executar` acrescenta as entradas do `planoEfetivo`. A função de apoio `push_exigir_sem_contexto` concentra a recusa com conta ou slug (42501).

**Done when**:

- [ ] Casos limite listados antes do código: limite 40 com 41 linhas; `p_desde` posterior a um envio aceito; id revogado de outro grupo
- [ ] Teste `NOT-69`: a segunda chamada com o mesmo `p_desde` não devolve as linhas já marcadas como aceitas
- [ ] Testes `NOT-29`, `NOT-30`: aceitos ganham `ultimo_envio_em`, revogados somem, e só do grupo do lote
- [ ] Teste: com conta ou com slug no contexto, cada função recusa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T11: Migração: funções dos avisos de cobrança e da limpeza

**What**: `aviso_cobranca_destino(p_grupo)` (e-mail e nome da conta `grupos.criado_por` não excluída, nome do grupo e assinaturas de `push_conta` dela); `aviso_cobranca_registrar(p_id_externo, p_tipo, p_grupo)` (`INSERT … ON CONFLICT DO NOTHING`, devolve se gravou; a linha fica travada até o fim da transação); `push_conta_resultado`; `notificacoes_limpar_em(p_momento)` (só owner: ranking sem envio aceito há mais de 180 dias, contando de `criada_em` quando nulo; avisos com mais de 90 dias) e `notificacoes_limpar()` com `now()`. Todas exigem sessão sem conta e sem slug.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_avisos-cobranca-funcoes.sql`
**Depends on**: T10
**Reuses**: par `_em` e wrapper (`M:1792843860000_conta-teto-emails.sql:26`, `:43`); T10; AD-070, AD-105
**Requirement**: NOT-38, NOT-39, NOT-56, NOT-57
**Status**: rascunhada
**Nota do rascunho**: `push_conta_resultado` também recebe a conta (`p_conta`) como primeiro parâmetro. `aviso_cobranca_destino` devolve uma linha com `assinaturas` em jsonb. `notificacoes_limpar_em` devolve `(ranking, avisos)` com as linhas apagadas e só limpa `push_ranking` e `avisos_cobranca`, como a spec manda (NOT-56 não cita `push_conta`).

**Done when**:

- [ ] Casos limite listados antes do código: 180 dias menos 1 s e mais 1 s; nunca enviado; 90 dias; criadora excluída; outro admin com assinatura; dois registros simultâneos
- [ ] Teste `NOT-38`: o destino é só a criadora; outro admin com `push_conta` não aparece; criadora excluída devolve vazio
- [ ] Teste `NOT-39`: duas conexões registrando o mesmo (id, tipo): uma grava e a outra espera e recebe `false`
- [ ] Testes `NOT-56`, `NOT-57`: com o momento em 181 e 91 dias, apagam; em 179 e 89, ficam
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T12: Matriz política × comando das tabelas novas

**What**: Com `comoApp`, a matriz da Test Coverage Matrix para `push_ranking`, `push_conta` e `avisos_cobranca`: SELECT, INSERT, UPDATE e DELETE (com e sem `WHERE`) nos contextos de conta A, conta B, slug de A e sem contexto, todos recusados; e os casos de matriz no meta-teste do FUN-12.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/push.test.ts`
**Depends on**: T11
**Reuses**: matrizes de leitura, escrita e contexto público (`F:981`, `F:1007`, `F:1031`); meta-teste (`F:957`); cenário (`F:909`)
**Requirement**: NOT-51, NOT-52, NOT-53, NOT-54
**Status**: rascunhada
**Nota do rascunho**: a `push_conta` não tem `grupo_id`, então o caso dela entrou no meta-teste de conta (`meta-conta.test.ts`: linha na `MATRIZ_CONTA` e a contagem de 9 para 10 tabelas, mudança de teste existente pelo motivo de a tabela nova existir, sem enfraquecer a checagem); `notificacoes_limpar_em` entrou na lista `SO_OWNER`. As tabelas com `grupo_id` já estavam na `MATRIZ` desde a T7. O ator N (sem contexto) é o do consumidor da fila e pode chamar as funções do envio, então só A, C, B e S são recusados nelas. A `planos-e-cobranca` tem `eventos_asaas` na mesma situação (sem `grupo_id`, fora da `MATRIZ_CONTA`) e vai pedir a contagem 11 quando as duas forem executadas.

**Done when**:

- [ ] Testes `NOT-52`, `NOT-53`: cada célula da matriz é um teste e recusa ou afeta zero linhas; o conteúdo do grupo A e da conta A fica idêntico
- [ ] Teste `NOT-51`: no contexto do slug, nenhum comando direto passa
- [ ] Teste `NOT-54`: nem a conta admin do grupo lê `endpoint`, `p256dh` ou `auth`
- [ ] Prova da matriz: com um `GRANT SELECT` a mais num banco descartável, o teste fica vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 6: Backup, repositório e depois do commit

### T13: Backup das tabelas novas

**What**: Provar que `pelada_backup_ro` lê as 3 tabelas e que o dump feito com ela traz as linhas, falhando se vier vazio.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/banco/push-backup.test.ts`
**Depends on**: T12
**Reuses**: matriz de backup da conta (`CA:313`); script de dump (`F:534`); AD-010, AD-016
**Requirement**: NOT-58
**Status**: rascunhada
**Nota do rascunho**: o dump real roda `pg_dump` do PATH com um login temporário que herda de `pelada_backup_ro` (removido no `finally`); sem o cliente no PATH o teste falha dizendo isso, sem pular, e o `/executar` ajusta o pré-voo se preciso. A T7 ganhou `GRANT SELECT` nas duas sequences identity para a role de backup (o `pg_dump` lê o valor delas).

**Done when**:

- [ ] Teste `NOT-58`: o dump como `pelada_backup_ro` contém as linhas semeadas das 3 tabelas; sem a policy de backup, o teste falha (conferido em banco descartável)
- [ ] Banco e dump de teste removidos no `finally`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T14: Repositório de push

**What**: `push.assinarRanking`, `cancelarRanking`, `estadoRanking`, `assinarConta`, `cancelarConta`, `estadoConta`, `envioGrupo`, `loteRanking`, `resultadoRanking`, `destinoCobranca`, `registrarAviso`, `resultadoConta` e `limpar`, chamando as funções pelo `Db` da transação, sem nunca devolver as chaves para fora da infraestrutura de envio.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/push.ts`
**Depends on**: T13
**Reuses**: repositórios que chamam função (`CA:820`, `PR:1289`); T8 a T11
**Requirement**: NOT-05, NOT-17, NOT-45
**Status**: rascunhada
**Nota do rascunho**: os ids de assinatura (`bigint`) circulam como texto e os arrays vão como literal `{1,2}` com `::bigint[]`. Só `loteRanking` e `destinoCobranca` devolvem as chaves, para a infraestrutura de envio; as rotas usam os seis primeiros métodos, que só devolvem texto de estado.

**Done when**:

- [ ] Teste `NOT-05`: cada método mapeia o retorno da função (`criada`, `atualizada`, `limite`, `nao_encontrado`)
- [ ] Teste `NOT-17`: cancelar devolve o mesmo resultado com ou sem linha
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T15: Tarefas depois do commit no comBanco

**What**: Estender o `comBanco` com `c.var.aposCommit(fn)`: as funções registradas rodam depois do `COMMIT` bem-sucedido, por `c.executionCtx.waitUntil`, e são descartadas no `ROLLBACK` (status ≥ 400 ou exceção); erro numa delas vai ao Sentry sem conteúdo e não muda a resposta.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/com-banco.ts`
**Depends on**: T14
**Reuses**: estender o `comBanco` (`F:1203`, já estendido em `CA:770`); Sentry (`F:1301`); AD-068
**Requirement**: NOT-20, NOT-21, NOT-22
**Status**: rascunhada
**Nota do rascunho**: `aposCommit` entrou em `Variaveis` (`ambiente.ts`) e as tarefas rodam também quando a rota nunca abriu conexão e respondeu abaixo de 400 (nada a confirmar). O Sentry é carregado por `import()` só na falha, para o `com-banco.ts` continuar importável nos testes em Node; `OpcoesComBanco.reportarFalhaAposCommit` troca o relato nos testes.

**Done when**:

- [ ] Casos limite listados antes do código: 201, 409, 422 e exceção no handler; falha no `COMMIT`; função que lança; duas funções registradas
- [ ] Teste `NOT-20`: com 201, a função roda depois do `COMMIT` (a linha já é visível em outra conexão quando ela roda)
- [ ] Teste `NOT-21`: com 409, 422, exceção ou falha no `COMMIT`, nenhuma função roda
- [ ] Teste `NOT-22`: a resposta sai antes de a função terminar, e a função que lança não muda status nem corpo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 7: Fila e envio do ranking

### T16: Mensagens da fila, produtor e binding

**What**: Schemas das mensagens (`ranking`: grupo, data da partida, `criadoEm`, `aposId`, `ids` pendentes, tentativa; `cobranca`: id externo, tipo, grupo, valor em centavos, vencimento, sem dado pessoal); `agendarAviso(env, mensagem)`; binding `FILA_AVISOS` (produtor e consumidor da fila `avisos`, `max_batch_size` 1, `max_retries` 2) no `wrangler.jsonc` e teste de config.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/fila/avisos.ts`
**Depends on**: T15
**Reuses**: `wrangler.jsonc` e o teste dele (`F:1081`); contrato zod (`CA:550`); AD-098
**Requirement**: NOT-22, NOT-43
**Status**: rascunhada
**Nota do rascunho**: os schemas zod ficam no contrato (`backend/contrato/src/fila-avisos.ts`, exportado em `./fila-avisos`), porque o `@pelada/api` não depende do zod; testes em `backend/contrato/test/fila-avisos.test.ts`. O `avisos.ts` tem só o produtor (`agendarAviso`, que confere a mensagem antes do `send`) e a `filaMemoria` dos testes; `FILA_AVISOS` é opcional no `Env`, e sem ele o `agendarAviso` lança (o `aposCommit` reporta). O teste do produtor fica em `backend/api/test/infraestrutura/fila/` (projeto `banco`, Node). O teste de config entrou em `test/wrangler.test.ts`, da raiz. `tentativa` vai de 1 a 3.

**Done when**:

- [ ] Teste `NOT-43`: a mensagem de cobrança recusa campo de e-mail ou nome
- [ ] Teste `NOT-22`: o produtor só enfileira, sem esperar envio
- [ ] Teste de config: a fila `avisos` com produtor, consumidor e os limites; sem `routes` (FUN-27 continua verde)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T17: Consumidor da fila no worker

**What**: Handler `queue` no `worker.ts`: valida a mensagem, abre o banco sem conta nem slug, despacha para o caso de uso do tipo, `ack` no sucesso, `retry({ delaySeconds })` quando o caso de uso pede, e mensagem inválida descartada com aviso ao Sentry sem conteúdo.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/worker.ts`
**Depends on**: T16
**Reuses**: `worker.ts` (`F:1106`); cliente pg por invocação (`F:1179`); AD-098, AD-108
**Requirement**: NOT-22, NOT-33
**Status**: rascunhada
**Nota do rascunho**: a lógica fica em `backend/api/src/entrada/consumidor-avisos.ts` (`consumirAvisos`), e o `worker.ts` só a liga ao `queue`; o `criarWorker` (`observabilidade.ts`) passa a repassar o `queue`, pelo `withSentry` quando há DSN. O caso de uso recebe `banco(fn)`, uma `transacaoCurta` sem conta e sem slug por chamada, para gravar o resultado de cada lote antes do próximo (NOT-69). Caso de uso que lança: `retry()` sem atraso (a fila entrega de novo, `max_retries` 2); tipo sem caso ligado: `ack` e relato `sem_caso_de_uso` (a cobrança só liga na T24). Teste em `backend/api/test/entrada/consumidor-avisos.test.ts` (Node, com o `@sentry/cloudflare` simulado por `vi.mock`).

**Done when**:

- [ ] Casos limite listados antes do código: mensagem válida, inválida, caso de uso que lança, caso de uso que pede nova tentativa
- [ ] Teste `NOT-22`: a conexão do consumidor não tem `app.conta_id` nem `app.slug_publico`
- [ ] Teste `NOT-33`: mensagem inválida vai ao Sentry sem o corpo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T18: Envio do ranking: plano, lote e resultado

**What**: Caso de uso `enviarRanking(mensagem)`: sem VAPID, encerra; lê o grupo (`push.envioGrupo`); arquivado ou sem push pelo `recursoLiberado` (S-01) no momento do envio, encerra sem enviar; lê até 40 assinaturas a partir de `aposId` com `desde = criadoEm`; cifra e envia cada uma (T6); grava aceitos e revogados (`push.resultadoRanking`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/notificacoes/enviar-ranking.ts`
**Depends on**: T17
**Reuses**: T6, T14; `recursoLiberado` (`PC:79`), S-01, S-02; AD-049, AD-070
**Requirement**: NOT-24, NOT-29, NOT-30, NOT-61, NOT-68
**Status**: rascunhada
**Nota do rascunho**: **S-01 não vale** (`backend/api/src/aplicacao/plano/recurso-liberado.ts:26-27` da planos-e-cobranca: grupo que o contexto não enxerga, inclusive sem contexto, dá `false`), então entrou o plano B da própria S-01: a `push_envio_grupo` (migração da T10, ainda não aplicada) devolve também `situacao_comercial`, `trial_inicio` e `pago_ate` (o mesmo `pago_ate` da `plano_do_grupo`), o `push.envioGrupo` os mapeia, e o `enviarRanking` decide com `planoEfetivo` + `planoLibera(…, 'push')` do domínio, com o "hoje" de São Paulo do instante do envio (SPEC_DEVIATION no SQL e no caso de uso; o `/executar` confirma com o usuário se AD-104 precisa de nota). Os testes da T10 e da T14 ganharam as colunas novas. As variáveis VAPID entraram no `Env` e o `chavesVapidDoAmbiente` em `vapid.ts` (vazio ou só espaços = ausente). O caso de uso grava aceitos e revogados num `finally`, para uma queda no meio do lote não perder o que foi aceito; `tentarDeNovo` fica sem tratamento até a T19. `CASOS_PADRAO` do consumidor liga o `ranking`. Teste em `backend/api/test/aplicacao/notificacoes/enviar-ranking.test.ts` (Node).

**Done when**:

- [ ] Casos limite listados antes do código: Pro, trial, Free, arquivado, grupo que caiu para Free depois do commit, sem VAPID, uma assinatura 410 entre 3
- [ ] Testes `NOT-24`, `NOT-68`: grupo Free ou arquivado no momento do envio não chama o serviço falso
- [ ] Testes `NOT-29`, `NOT-30`: 3 assinaturas, uma responde 410: 2 com `ultimo_envio_em`, a terceira some do banco
- [ ] Teste `NOT-61`: sem as variáveis VAPID, nenhum `fetch`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 8: Retentativa, limites e gatilho das partidas

### T19: Retentativa e retomada do envio do ranking

**What**: Em `enviarRanking`: com 40 lidas e mais por vir, enfileira a continuação com `aposId` do último; as de 429 ou 5xx vão numa mensagem só com os `ids`, tentativa + 1, atraso do maior `Retry-After` (padrão 60 s, teto 1 h); na tentativa 3, desiste daquele aviso. Uma invocação que cai no meio é refeita pela fila sem reenviar as já aceitas (`desde`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/notificacoes/enviar-ranking.ts`
**Depends on**: T18
**Reuses**: T18; T10 (`desde`); AD-108
**Requirement**: NOT-31, NOT-69
**Status**: rascunhada
**Nota do rascunho**: o lote lê 41 para saber se há continuação (80 assinaturas dão duas invocações e nenhuma continuação vazia). A mensagem de nova tentativa relê só os `ids` em páginas de 40 a partir do menor id, com o mesmo `desde`, sem função SQL nova. A continuação e a nova tentativa são enfileiradas depois de gravar o resultado; se o `agendarAviso` lançar, o consumidor faz `retry()` e a refeita não reenvia às aceitas. `Retry-After` 0 enfileira sem atraso. Testes no mesmo `enviar-ranking.test.ts` (bloco "retentativa e retomada (T19)").

**Done when**:

- [ ] Casos limite listados antes do código: 41 e 80 assinaturas; 429 com `Retry-After` 120; 503 três vezes; queda depois de 10 aceitas
- [ ] Teste `NOT-31`: 503 recebe 2 novas tentativas e depois desiste, sem apagar a assinatura; o atraso respeita o `Retry-After`
- [ ] Teste `NOT-69`: a mensagem refeita depois da queda envia só as 30 restantes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T20: Limites de subrequisição e CPU com 40 assinaturas

**What**: Teste no pool do `workerd` que conta os `fetch` e as subrequisições de uma invocação com 40 assinaturas, e bench no Node (`process.cpuUsage`) da cifra e do VAPID de 40 envios (AD-112).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/infraestrutura/push/limites.test.ts`
**Depends on**: T19
**Reuses**: bench do domínio (`PR:840`); T18, T19
**Requirement**: NOT-34
**Status**: rascunhada
**Nota do rascunho**: o teste do `workerd` (`limites.test.ts`) simula o repositório (`vi.spyOn(push, …)`) e conta cada abertura de banco, cada envio à fila, cada `fetch` e cada relato ao Sentry como subrequisição; com 40 aceitas são 42. O bench de CPU ficou em `backend/api/test/infraestrutura/push-cpu.test.ts` (projeto `banco`, Node), fora da pasta `push/`, que roda no `workerd`. Risco para o `/executar` avaliar: 40 respostas 400, 403 ou 413 dariam 40 relatos ao Sentry (82 subrequisições com o resto); o teste não cobre esse pior caso, que a spec não define.

**Done when**:

- [ ] Teste `NOT-34`: 40 assinaturas geram 40 `fetch` de push e no máximo 50 subrequisições contando banco, fila e Sentry; a 41.ª vai para a continuação
- [ ] Teste `NOT-34`: CPU dos 40 envios ≤ 6 ms no Node (margem para os 10 ms do Workers); passou, a tarefa para e a sessão pergunta se reduz o lote
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T21: Gatilho do aviso no lançamento e na edição da partida

**What**: Em `POST` e `PUT` de partida, depois do repositório responder com sucesso, registrar `c.var.aposCommit` que enfileira a mensagem `ranking` (grupo, data, `criadoEm`); `DELETE` não registra nada (AD-069).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T20
**Reuses**: rotas de partida (`PR:1461`, `PR:1487`), S-07; T15, T16; caracterização da T0
**Requirement**: NOT-20, NOT-21, NOT-22, NOT-23
**Status**: rascunhada
**Nota do rascunho**: o `avisarRankingAtualizado` registra o `aposCommit` logo depois de o repositório gravar, antes da releitura; `criadoEm` é o `relogio.agoraIso()` da requisição. Sem a T0, o NOT-22 compara a resposta e a partida gravada de um lançamento com fila boa e de outro com fila que lança (fora o `alteradaEm`); o `/executar` confere contra a caracterização da T0 quando ela existir. Teste em `backend/api/test/rotas/partidas-aviso.test.ts` (`workerd`).

**Done when**:

- [ ] Teste `NOT-20`: `POST` 201 e `PUT` 200 enfileiram uma mensagem com o grupo e a data
- [ ] Teste `NOT-21`: 409 de data repetida e 422 não enfileiram
- [ ] Teste `NOT-22`: com a fila que lança, a resposta e a partida gravada são as mesmas da T0
- [ ] Teste `NOT-23`: `DELETE` 204 não enfileira
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 9: Avisos de cobrança: gatilho e e-mail

### T22: Gatilho dos avisos no webhook do Asaas

**What**: Na rota do webhook (S-03), para evento novo, aplicado e não obsoleto, de cobrança de assinatura conhecida, mapear o tipo (S-04) e registrar `aposCommit` que enfileira a mensagem `cobranca` com o id da cobrança, o tipo, o grupo, `payment.value` em centavos e `payment.dueDate`. Repetido, obsoleto, desconhecido ou de outro tipo: nada. Em qualquer plano.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/webhook-asaas.ts`
**Depends on**: T21
**Reuses**: rota do webhook (`PC:176-187`), S-03, S-04; T15, T16; centavos da `planos-e-cobranca` (PLA-51); AD-105
**Requirement**: NOT-38, NOT-39, NOT-47
**Status**: rascunhada
**Lacunas**: pagamento confirmado com valor divergente (PLA-51) ou de assinatura já cancelada não avisa (interpretação conservadora: não dizer que o Pro foi pago quando não foi); confirmar com o usuário.
**Nota do rascunho**: rascunhada depois da T35 a T37 da `planos-e-cobranca`. `avisoDoWebhook` na própria rota: mapa S-04, só resultado `aplicado` ou `sem_efeito` com grupo (repetido e assinatura desconhecida ficam de fora) e sem os motivos `fora_de_ordem` (o "obsoleto" da S-03), `valor_divergente` e `assinatura_cancelada`; valor e vencimento que não cabem no contrato da fila: nada. `PAYMENT_RECEIVED` depois de `PAYMENT_CONFIRMED` enfileira duas vezes a mesma chave e o consumidor descarta a segunda (AD-105). Teste em `backend/api/test/rotas/webhook-asaas-aviso.test.ts` (`workerd`).

**Done when**:

- [ ] Casos limite listados antes do código: os 4 eventos mapeados; `PAYMENT_RECEIVED` depois de `PAYMENT_CONFIRMED`; evento repetido; `PAYMENT_CREATED` obsoleto; evento desconhecido; grupo Free; valor `9.9` e `9.90`
- [ ] Teste `NOT-38`: cada evento mapeado enfileira uma mensagem com o tipo certo e sem dado pessoal
- [ ] Teste `NOT-39`: o mesmo evento repetido (PLA-42) não enfileira de novo
- [ ] Teste `NOT-47`: grupo Free enfileira
- [ ] Caracterização da T0 continua verde (resposta e estado do grupo iguais)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T23: Modelo do e-mail de cobrança

**What**: Modelo em texto e HTML para os 3 tipos ("Cobrança gerada", "Pagamento confirmado", "Pagamento em atraso"): nome do grupo escapado, valor `R$ 9,90` formatado de centavos inteiros, vencimento dd/mm/aaaa em `America/Sao_Paulo` e só o link `URL_PUBLICA` + `/app/grupos/<id>/plano`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/email/modelo-cobranca.ts`
**Depends on**: T22
**Reuses**: modelos dos e-mails de conta (`CA:672`); `URL_PUBLICA` (`F:1251`); S-05
**Requirement**: NOT-40
**Status**: rascunhada
**Lacunas**: o título do tipo atrasado é "Pagamento em atraso" aqui (texto da T23) e "Pagamento atrasado" no push (`NOME_DO_TIPO`, T5); a spec só pede o tipo em texto claro. Confirmar com o usuário se unifica.
**Nota do rascunho**: o nome do grupo passa pelo `nomeDoGrupoNoEmail` (uma linha, sem virar link, até 60 caracteres) antes do `escaparHtml`, como no convite. O valor usa o `formatarPreco` do domínio. Teste em `backend/api/test/infraestrutura/modelo-cobranca.test.ts`.

**Done when**:

- [ ] Casos limite listados antes do código: 1 centavo, 990, 100000; vencimento no dia 31 e em 1.º de janeiro; nome com `<script>` e `&`
- [ ] Teste `NOT-40`: cada tipo tem o texto, o valor e a data certos e um único link, o de Meu plano; nenhum domínio do Asaas
- [ ] Teste `NOT-40`: o nome do grupo sai escapado no HTML
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T24: Aviso de cobrança por e-mail, uma vez por evento

**What**: Caso de uso `avisarCobranca(mensagem)` numa transação: `push.registrarAviso` (já registrado: encerra); `push.destinoCobranca` (sem destino: encerra); reserva a cota com 100% de `LIMITE_EMAILS_DIA`; envia pelo `Remetente` com `Idempotency-Key` = id e tipo; falha do remetente ou cota cheia: `ROLLBACK` e nova tentativa da fila em 8 h, até 3 em 24 h; na última, Sentry com "desistência" e o tipo, sem e-mail nem conteúdo.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/notificacoes/avisar-cobranca.ts`
**Depends on**: T23
**Reuses**: `email_cota_reservar` (`CA:522`, `M:1792843860000_conta-teto-emails.sql:43`); `Remetente` e `remetenteMemoria` (`CA:647`); fluxo de `enviarEmailDeConta` (`CA:868`); T11, T14, T17; AD-108
**Requirement**: NOT-38, NOT-39, NOT-41, NOT-42, NOT-47
**Status**: rascunhada
**Nota do rascunho**: o envio reaproveita o `enviarEmailDeConta` (savepoint da cota) na categoria `recuperacao`, que é a de 100%; o e-mail ganhou o `TipoEmail` `aviso_cobranca` (`resend.ts`). A nova tentativa é uma mensagem nova com `tentativa` + 1 e 8 h de atraso (como a T19), não o `retry()` da fila, para a 3.ª saber que é a última. Criadora excluída ou grupo inexistente encerra com o registro do aviso confirmado. `CASOS_PADRAO` liga `cobranca`. Teste em `backend/api/test/aplicacao/notificacoes/avisar-cobranca.test.ts`; o da criadora excluída grava e desfaz `excluida_em` direto (a trigger da T9 só age na passagem de nulo a preenchido).

**Done when**:

- [ ] Casos limite listados antes do código: mesma mensagem duas vezes em série e em paralelo; Resend falha 1, 2 e 3 vezes; cota cheia; criadora excluída; grupo Free
- [ ] Teste `NOT-39`: `pagamento_atrasado` injetado duas vezes (e em paralelo) gera um e-mail
- [ ] Teste `NOT-41`: com 80% da cota gasta, o aviso sai; a cota conta o envio
- [ ] Teste `NOT-42`: com o remetente falhando, o aviso volta à fila com 8 h, a cota não é gasta, e na terceira falha o Sentry recebe só "desistência" e o tipo
- [ ] Teste `NOT-38`: o e-mail vai só ao endereço da criadora
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 10: Push de cobrança, limpeza e push falso de dev

### T25: Push de cobrança à criadora

**What**: Depois do e-mail aceito, `avisarCobranca` envia o push (T5, T6) a cada assinatura de `push_conta` da criadora, com o tópico do grupo e as mesmas regras de resultado (aceito, revogada, nova tentativa como na T19, erro); sem assinatura ou sem VAPID, só o e-mail.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/notificacoes/avisar-cobranca.ts`
**Depends on**: T24
**Reuses**: T6, T19, T24; `payloadCobranca` (T5)
**Requirement**: NOT-43, NOT-46, NOT-48
**Status**: rascunhada
**Nota do rascunho**: o push sai depois do `COMMIT` do e-mail, fora da transação. A nova tentativa do push é uma mensagem `cobranca` com o campo novo `pushIds` (contrato da T16 estendido), que pula o registro e o e-mail e manda só às assinaturas listadas que ainda existem; ela conta as tentativas do push a partir de 1. O atraso é o da T19 (`atrasoDaNovaTentativa`, agora exportado de `enviar-ranking.ts`). A decifra do lado do navegador para ler o payload no teste ficou em `backend/api/test/apoio/push.ts` (cópia do método do `cifra.test.ts`, que não foi alterado).

**Done when**:

- [ ] Teste `NOT-46`: sem assinatura, um e-mail e nenhum `fetch`
- [ ] Teste `NOT-48`: com 2 assinaturas, 2 envios cifrados com VAPID; 410 apaga a assinatura; 503 volta à fila só com o push
- [ ] Teste `NOT-43`: o payload enviado não tem valor, e-mail nem nome
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T26: Limpeza diária pelo Cron

**What**: Handler `scheduled` no `worker.ts` que chama `push.limpar()` numa transação sem contexto, e `triggers.crons` diário às 06:00 UTC no `wrangler.jsonc`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/notificacoes/limpar.ts`
**Depends on**: T25
**Reuses**: `worker.ts` (`F:1106`); T11, T14; teste do `wrangler.jsonc` (`F:1081`)
**Requirement**: NOT-56, NOT-57
**Status**: rascunhada
**Nota do rascunho**: `limparNotificacoes(env)` usa o mesmo `bancoSemContexto` do consumidor; o `worker.ts` ganhou o `scheduled` e o `criarWorker` passa a repassá-lo (pelo `withSentry` com DSN), como o `queue`. As linhas vencidas são semeadas como superusuário com `now() - interval`, sem a `notificacoes_limpar_em` (que só o owner executa), e a limpeza roda como `pelada_app`. Teste em `backend/api/test/aplicacao/notificacoes/limpar.test.ts`; o do Cron em `test/wrangler.test.ts`.

**Done when**:

- [ ] Testes `NOT-56`, `NOT-57`: o handler `scheduled` apaga as linhas vencidas semeadas com a função `_em`, e o Cron está no `wrangler.jsonc` (até 5 no Free)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T27: Serviço de push falso no ambiente de dev

**What**: Variável `PUSH_HOSTS_DEV` (só local e e2e) que acrescenta hosts `http://localhost` à lista de T1, uma checagem que a reprova no `wrangler.jsonc` e no `deploy.yml`, o nome no `.env.example`, e o servidor de push falso do e2e que guarda as requisições recebidas.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/push-hosts-dev.ts`
**Depends on**: T26
**Reuses**: checagem do `EMAIL_DEV` (`CA:697`); T1; AD-109
**Requirement**: NOT-63
**Status**: rascunhada
**Nota do rascunho**: `hostsPushDev` e a aceitação de `http(s)://localhost:<porta>` ficaram no contrato (`backend/contrato/src/push.ts`); a variável só aceita `localhost` ou `*.localhost`, e outro host nela é ignorado. Os casos de uso do ranking e da cobrança passam `hostsExtras` ao cliente de envio. A checagem vigia `wrangler.jsonc` e `deploy.yml` e entrou no `ci.yml`. O servidor falso mora em `frontend/web/e2e/apoio/push-falso.mjs` (teste em `frontend/web/test/ferramentas/`). Falta ligá-lo ao `playwright.config.ts` e passar `--var PUSH_HOSTS_DEV`, o que é da T41.

**Done when**:

- [ ] Teste `NOT-63`: sem `PUSH_HOSTS_DEV`, `localhost` é recusado; com ela, aceito só em `localhost`
- [ ] Teste: `PUSH_HOSTS_DEV` no `wrangler.jsonc` ou no `deploy.yml` reprova a checagem
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 11: Rotas públicas de push

### T28: GET /api/publico/:slug/push e POST de estado

**What**: `GET /api/publico/:slug/push` → 200 `{ disponivel, chavePublica }` (`disponivel` falso sem VAPID, em grupo sem push ou arquivado; 404 de PAR-90 no slug inválido); `POST /api/publico/:slug/push/estado` com `endpoint` e `chaves.auth` → 200 `{ assinado }`, com `X-Pelada`, `bodyLimit` de 4 KB e `LIMITE_PUBLICO`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico-push.ts`
**Depends on**: T27
**Reuses**: `contextoPublico` e `LIMITE_PUBLICO` (`PR:1386`, AD-045); `bodyLimit` de `POST eventos` (`PR:1634`); `recursoLiberado` (`PC:79`); AD-103
**Requirement**: NOT-01, NOT-14, NOT-61, NOT-71
**Status**: rascunhada
**Nota do rascunho**: SPEC_DEVIATION: grupo arquivado responde o 404 do PAR-90 no `GET …/push` (a RLS do slug não o mostra e o PAR-90 pede o mesmo corpo de inexistente); o front esconde o controle quando o `GET` falha (T37). Contrato: `LIMITE_CORPO_PUSH_BYTES`, mensagens e os tipos `DisponibilidadePush`, `EstadoPush` e `ErroPush` em `backend/contrato/src/push.ts`. Testes em `backend/api/test/rotas/push-publico-estado.test.ts` com o apoio `apoio-push.ts`, no molde do `publico-pdf.test.ts` (Postgres local). As rotas novas só entram na suíte de isolamento de rotas na T32.

**Done when**:

- [ ] Testes `NOT-01`, `NOT-14`: grupo Pro com VAPID responde `disponivel: true` e a chave pública; a privada nunca aparece
- [ ] Teste `NOT-61`: sem VAPID, `disponivel: false` e `chavePublica: null`
- [ ] Teste `NOT-71`: `estado` devolve `assinado: false` depois de a assinatura ser apagada e `true` com ela; `auth` errado devolve `false`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T29: POST /api/publico/:slug/push

**What**: `bodyLimit` de 4 KB (413), JSON inválido 422, `assinaturaPushCorpo` (422 por campo), sem VAPID 503 `push_indisponivel`, `recursoLiberado(…, 'push')` falso 403 `push_indisponivel` (AD-104), depois `push.assinarRanking`: `criada` 201, `atualizada` 200, `limite` 409 `limite_assinaturas`, `nao_encontrado` 404 de PAR-90. `X-Pelada` e `LIMITE_PUBLICO` antes; IP só como chave do limitador.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico-push.ts`
**Depends on**: T28
**Reuses**: T28; `exigirCabecalhoPelada` (`CA:723`); chave de IP (`CA:746`); T1, T14; AD-065, AD-104
**Requirement**: NOT-05, NOT-06, NOT-07, NOT-08, NOT-09, NOT-10, NOT-11, NOT-61, NOT-65, NOT-67
**Status**: rascunhada
**Nota do rascunho**: a ordem é a da tarefa (413, 422, 503, 404, 403, função); o 404 do grupo vem antes do 403 do plano porque o `recursoLiberado` precisa do id do grupo. A resposta de 201 e 200 é `{ assinado: true }`, sem ecoar endpoint nem chaves. O NOT-11 conta o IP como chave do limitador e procura o IP na linha (`row_to_json`) e no console capturado. Testes em `backend/api/test/rotas/push-publico-assinar.test.ts`.

**Done when**:

- [ ] Testes `NOT-05`, `NOT-07`: 201 e depois 200 com uma linha no banco
- [ ] Teste `NOT-06`: cada recusa do contrato dá 422 sem gravar
- [ ] Teste `NOT-08`: slug malformado, inexistente e arquivado dão o mesmo corpo de PAR-90
- [ ] Testes `NOT-09`, `NOT-10`, `NOT-61`: grupo Free 403, teto 409, sem VAPID 503, nada gravado
- [ ] Teste `NOT-11`: sem `X-Pelada` 403; acima do limite 429; o IP não está no banco nem no log
- [ ] Teste `NOT-65`: dois `POST` simultâneos do mesmo `endpoint` respondem 201 e 200
- [ ] Teste `NOT-67`: 5 KB dá 413 e corpo que não é JSON dá 422
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T30: DELETE /api/publico/:slug/push

**What**: `DELETE` com `cancelarPushCorpo`, `bodyLimit` de 4 KB, `X-Pelada` e `LIMITE_PUBLICO`; `push.cancelarRanking` e 204 sempre, inclusive em grupo arquivado ou Free e sem linha que coincida.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico-push.ts`
**Depends on**: T29
**Reuses**: T29; T8
**Requirement**: NOT-16, NOT-17, NOT-18, NOT-67
**Status**: rascunhada
**Nota do rascunho**: o `DELETE` não confere VAPID nem plano (cancelar nunca depende do push estar ligado) e responde 204 também para slug inexistente, sem enumerar. Testes em `backend/api/test/rotas/push-publico-cancelar.test.ts`.

**Done when**:

- [ ] Testes `NOT-16`, `NOT-17`: assinar, cancelar, a linha some; o `DELETE` repetido responde 204
- [ ] Teste `NOT-18`: grupo arquivado e grupo Free respondem 204 e apagam
- [ ] Teste `NOT-67`: corpo grande 413, não JSON 422
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 12: Rotas da conta e isolamento

### T31: Rotas /api/conta/push

**What**: Com `exigirSessao`, `X-Pelada` e `LIMITE_ESCRITA`: `GET /api/conta/push` → `{ oferecer, chavePublica }` (`oferecer` só para criadora de algum grupo não arquivado, com VAPID); `POST` (201, 200, 409 com 10, 422, 503 sem VAPID), `DELETE` (204) e `POST /api/conta/push/estado`, com as validações de T1.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/conta-push.ts`
**Depends on**: T30
**Reuses**: rotas de minha conta (`CA:971`); `exigirSessao` (`CA:770`); `LIMITE_ESCRITA` (`GE:928`); T9, T14; AD-103, AD-107
**Requirement**: NOT-44, NOT-45, NOT-53, NOT-61
**Status**: rascunhada
**Nota do rascunho**: como minha conta, `/api/conta/*` não passa pelo `comBanco`: cada rota abre a `transacaoCurta` com a conta da sessão. O `LIMITE_ESCRITA` entra por rota, depois do `exigirSessao`, com a chave `conta:<id>` do `limitarEscritasDeGrupo` (que só vigia `/api/grupos*`); conta também o `POST …/estado`. `oferecer` lê `grupos` sob a RLS da conta (`criado_por = app_conta_id()` e não arquivado). SPEC_DEVIATION: o `POST` não recusa a não criadora (a tarefa não define); ela só receberia aviso se fosse criadora na hora do aviso. Testes em `backend/api/test/rotas/push-conta.test.ts`, com a sessão gravada pelo `sessaoDe` (`apoio-financeiro.ts`).

**Done when**:

- [ ] Teste `NOT-44`: criadora recebe `oferecer: true`; admin convidado e conta sem grupo, `false`
- [ ] Testes `NOT-45`, `NOT-53`: sem sessão 401; sem `X-Pelada` 403; a conta B não apaga nem consulta a de A
- [ ] Teste `NOT-61`: sem VAPID, `POST` 503 e `oferecer: false`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T32: Isolamento das rotas novas e nada sensível em resposta e log

**What**: Linhas das 7 rotas novas na suíte de isolamento de rotas; teste que percorre as respostas de todas as rotas de push e as rotas de admin do grupo e reprova `endpoint`, `p256dh` ou `auth`; teste de log das rotas e do consumidor.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T31
**Reuses**: suíte de isolamento de rotas (`CA:1070`); teste de log sem segredo (`CA:1047`)
**Requirement**: NOT-33, NOT-54
**Status**: rascunhada
**Lacunas**: o teste existente `PAR-139: as 3 rotas públicas estão no app e têm caso` (`backend/api/test/isolamento/rotas.test.ts`) compara a lista exata das rotas `/api/publico/` com as 3 da partidas-e-ranking e vai falhar com as 4 rotas públicas de push. Não foi alterado (não há autorização em `## Autorizações` para esta feature): o `/executar` pergunta se troca o filtro para excluir `/push` (mesma força) ou se inclui as 4 na lista.
**Nota do rascunho**: são 8 rotas novas, não 7 (a tarefa não contou o `GET /api/conta/push`). As linhas vão em `ROTAS_DE_PUSH` (casos públicos com o slug de G e a assinatura de H, e o contrário; casos da conta com a sessão de B e a assinatura de A), mais um meta-teste das 8 e o NOT-54 que percorre todo `GET` do app com parâmetros conhecidos, como a criadora A e como a admin O. G e H passam a Pro no `beforeAll` do arquivo (o `POST` precisa do recurso). O NOT-33 ficou em `backend/api/test/isolamento/push-log.test.ts`: console inteiro e relato do cliente de envio capturados, nas rotas e no envio do ranking com 201, 400 e 503.

**Done when**:

- [ ] Teste `NOT-54`: nenhuma resposta, nem de admin do grupo, contém os valores semeados de `endpoint`, `p256dh` ou `auth`
- [ ] Teste `NOT-33`: com o console e o Sentry capturados, assinar, cancelar e enviar não registram esses valores nem o payload
- [ ] Rota nova sem linha na suíte de isolamento a faz falhar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 13: Ensaio da migração sobre a produção

### T33: Ensaio das migrações sobre um dump da produção (AD-033)

**What**: Restaurar no Postgres local um dump recente da produção (artefato cifrado do `backup.yml`, decifrado pelo usuário fora do repositório: pausa para o usuário), contar as linhas por tabela, aplicar `pnpm migrar` com as migrações de T7 a T11 e conferir: mesma contagem em toda tabela, as 3 tabelas novas vazias, schema esperado e segunda execução sem DDL. Antes do primeiro deploy da prévia com estas migrações (AD-032). Nada roda contra a `main` do Neon.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/ensaio-migracao.ts`
**Depends on**: T32
**Reuses**: ensaio da `partidas-e-ranking` (`PR:1684`); restauração (`F:584`); `lerEsquema` e referência (`F:736`, `F:784`); zero DDL (`F:834`); AD-033, AD-073
**Requirement**: NOT-49
**Status**: rascunhada
**Nota do rascunho**: o `ensaio-migracao.ts` já existia (financeiro T15 em diante); ganhou o passo 9 (`conferirPush`: com a `notificacoes-tabelas` aplicada, as 3 tabelas existem e estão vazias depois da segunda execução, pela contagem crua) e a linha no relatório impresso. Teste do ensaio sobre um dump simulado em `backend/scripts/test/ensaio-migracao-notificacoes.test.ts`, no molde do da planos-e-cobranca. Falta o ensaio real com o backup cifrado da produção (pausa para o usuário) e a `Evidência` abaixo, que são do `/executar`.

**Done when**:

- [ ] `Evidência`: data e origem do dump, contagem por tabela antes e depois, diff do schema e a saída da segunda execução, registrados nesta tarefa
- [ ] Teste `NOT-49`: nenhuma tabela perde linha; o schema é a referência mais só as tabelas, funções, trigger, grants e policies destas migrações
- [ ] Dump com zero linhas nas tabelas de negócio bloqueia a tarefa: pare e pergunte (AD-073)
- [ ] Banco de ensaio removido no `finally`; o dump decifrado não entra no git
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 14: Service worker

### T34: Service worker: push e clique na notificação

**What**: Preencher os handlers vazios de `push` e `notificationclick`: `showNotification` com título, texto, ícone do app e `tag` = slug (ranking) ou `cobranca-<grupoId>`; payload ilegível mostra "Ranking atualizado" genérico; clique fecha, foca uma janela aberta da mesma origem ou abre o caminho, aceitando só caminho relativo da mesma origem que começa com `/g/` ou `/app/` (outro caminho abre `/`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `frontend/web/src/pwa/sw.ts`
**Depends on**: T33
**Reuses**: estender o SW da fundação (`F:1595`) e da `partidas-e-ranking` (`PR:2246`); ícones do manifest (`F:1571`)
**Requirement**: NOT-35, NOT-36, NOT-37, NOT-48, NOT-66
**Status**: rascunhada
**Nota do rascunho**: as regras ficam em `frontend/web/src/pwa/notificacao.ts` (puras, como o `servico.ts`), e os handlers vazios de `servico.ts` passam a chamá-las com o `self` como escopo; o `sw.ts` não mudou. O tipo do push vai no `data` da notificação: ranking (título `TITULO_RANKING` e caminho `/g/<slug>?mes=`) só abre `/g/`; cobrança (caminho `/app/grupos/<uuid>/plano`) só abre `/app/`; o resto é a genérica e abre `/`. O teste FUN-34 da fundação não muda: sem escopo e com evento vazio, os handlers não fazem nada. Testes em `frontend/web/test/pwa/notificacao.test.ts`.

**Done when**:

- [ ] Testes `NOT-35`, `NOT-66`: dois `push` do mesmo grupo chamam `showNotification` com a mesma `tag`
- [ ] Teste `NOT-36`: payload que não é JSON mostra a notificação genérica, nunca nenhuma
- [ ] Testes `NOT-37`, `NOT-48`: `//mal.example`, `https://mal.example/g/x`, `/g/../x`, `javascript:` e `/app/` vindo de push de ranking abrem `/`; `/g/slug?mes=2026-11` abre ou foca
- [ ] Teste `FUN-34` da fundação continua verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T35: Service worker: troca da assinatura pelo navegador

**What**: Handler `pushsubscriptionchange`: com a assinatura antiga, `DELETE` no grupo (slug guardado no IndexedDB do SW na hora de assinar); com a nova, `POST` no mesmo grupo; sem slug guardado, não chama nada. Vale também para a assinatura de conta.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `frontend/web/src/pwa/sw-assinatura.ts`
**Depends on**: T34
**Reuses**: T34; cabeçalho `X-Pelada` do cliente HTTP (`CA:1169`)
**Requirement**: NOT-19
**Status**: rascunhada
**Nota do rascunho**: um registro de SW tem um único `PushSubscription`, então o IndexedDB (`pelada-push`, loja `destinos`) guarda por endpoint a lista de destinos (cada slug e a conta, NOT-70); o front grava e tira destinos pelo `adicionarDestino` e `removerDestino` na T36. O handler vai em `registrarTrocaDeAssinatura`, ligado pelo `sw.ts` fora do `registrarEventos` (o teste FUN-34 compara a lista exata de eventos). Um destino só passa para o endpoint novo com o `POST` 2xx. Testes em `frontend/web/test/pwa/sw-assinatura.test.ts`.

**Done when**:

- [ ] Teste `NOT-19`: evento com antiga e nova faz um `DELETE` e um `POST` no slug guardado, com `X-Pelada: 1`
- [ ] Teste `NOT-19`: evento sem a nova só faz o `DELETE`; sem slug guardado, nenhum `fetch`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 15: Web: assinatura e controles

### T36: Módulo de assinatura de push no front

**What**: `suportePush()` (`PushManager`, `serviceWorker`, `Notification`), `assinar(destino, chavePublica)` (pede a permissão só quando chamado de um toque, `subscribe` com `userVisibleOnly: true` e a chave, `POST`), `cancelar(destino)` (`DELETE` e `unsubscribe()`), `estado(destino)` (assinatura local, permissão e `POST …/estado`), e troca da chave: assinatura local com outra `applicationServerKey` é cancelada e o estado volta a "não assinado".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/push/assinatura.ts`
**Depends on**: T35
**Reuses**: cliente HTTP (`CA:1169`); `useModoInstalacao` (`F:1521`)
**Requirement**: NOT-02, NOT-04, NOT-16, NOT-62, NOT-70
**Status**: rascunhada
**Nota do rascunho**: um registro de SW tem um único `PushSubscription` para todos os grupos e a conta (NOT-70), então assinar outro grupo reaproveita a assinatura local, e o `cancelar` só chama `unsubscribe()` quando não sobra destino guardado no aparelho (o teste NOT-16, com um destino só, confere a chamada). Os destinos vão para o IndexedDB pelo `adicionarDestino` e `removerDestino` da T35, que o SW lê no `pushsubscriptionchange`. Testes em `frontend/web/test/push/assinatura.test.ts` (a pasta `test/` é a do `include` do Vitest do web).

**Done when**:

- [ ] Teste `NOT-02`: `Notification.requestPermission` só é chamado dentro de `assinar`, nunca ao importar ou ao ler o estado
- [ ] Teste `NOT-04`: permissão negada ou fechada devolve `desligado` sem `fetch`
- [ ] Teste `NOT-16`: cancelar faz o `DELETE` com `endpoint` e `auth` e chama `unsubscribe()`
- [ ] Teste `NOT-62`: chave pública nova cancela a assinatura local antiga
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T37: Controle de avisos do ranking na t01

**What**: `ControlePush` na `PaginaRanking`, montado com `Botao` e `Faixa` do guia: some quando `GET …/push` falha ou diz `disponivel: false`; no Safari iOS fora do standalone, mostra o `AvisoInstalarIphone` no mesmo lugar; estados "Receber avisos do ranking", "assinado" com "Parar de receber avisos", "avisos desligados" com como ligar nas configurações, e "sem suporte".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/ControlePush.tsx`
**Depends on**: T36
**Reuses**: `PaginaRanking` (`PR:1878`); `Botao` (`F:1448`); `Faixa` (`CA:1286`); `AvisoInstalarIphone` (`F:1521`); tokens e componentes do guia (`.specs/mockup/index.html`, `tokens.css`, `base.css`, AD-111); AD-072
**Requirement**: NOT-01, NOT-03, NOT-04, NOT-13, NOT-15, NOT-61, NOT-71, NOT-72
**Status**: rascunhada
**Nota do rascunho**: o controle vai na `PaginaRanking` depois do ranking e antes do rodapé, só com dados e fora do guardado sem rede. A parte comum com a T38 é o `ControleAvisos` (estados e ações de um destino), exportado do `ControlePush.tsx`; o `ControlePush` acrescenta o `GET …/push` e o caso do iOS. A `section` com `aria-label` "Avisos do ranking" é o contêiner que o NOT-03 confere (o `AvisoInstalarIphone` dentro dela, sem botão). Os textos que a spec não fixa (assinado, desligado, sem suporte) estão nas constantes do arquivo. Não conferido por teste aqui: o Stylelint de tokens e as entradas da t01 no `telas.json` (gate de lint e o `visual` do `/executar`). Testes existentes da t01 que contam as chamadas exatas da API podem ver o `GET …/push` a mais (responde 404 no servidor falso e o controle some). Testes em `frontend/web/test/telas/controle-push.test.tsx`.

**Done when**:

- [ ] Testes `NOT-01`, `NOT-13`, `NOT-15`: cada estado com o texto da spec; assinar leva ao "assinado" com "Parar de receber avisos"
- [ ] Teste `NOT-03` (posição): no iOS fora do standalone, o aviso de instalação ocupa o mesmo contêiner do controle, o botão não existe e a permissão não é pedida
- [ ] Teste `NOT-61`: `disponivel: false` não renderiza nada
- [ ] Teste `NOT-71`: permissão `granted` com `estado` `assinado: false` mostra "Receber avisos do ranking"
- [ ] Teste `NOT-72`: axe sem violação; o Stylelint de tokens passa; as entradas da t01 no `telas.json` continuam iguais
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T38: Avisos de cobrança em Minha conta

**What**: Seção "Receber avisos de cobrança neste aparelho" em `/app/conta`, só com `oferecer: true` e suporte, com os mesmos estados e o pedido de permissão por toque de T36, montada com os componentes do guia (AD-106).
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/minha-conta/AvisosCobranca.tsx`
**Depends on**: T37
**Reuses**: `MinhaConta` (`CA:1534`); T36, T37; AD-072
**Requirement**: NOT-44, NOT-72
**Status**: rascunhada
**Nota do rascunho**: a seção vai em Minha conta entre Segurança e Excluir conta, com o `ControleAvisos` da T37 e o destino `conta`. Em jsdom não há `PushManager`, então os testes existentes da t32 não veem a seção (e o `GET /api/conta/push` responde 404 no servidor falso deles). Não conferido por teste aqui: as entradas da t32 no `telas.json` (o `visual` do `/executar`). O mesmo commit troca o nome `contêiner` por `regiao` no teste da T37. Testes em `frontend/web/test/telas/avisos-cobranca.test.tsx`.

**Done when**:

- [ ] Teste `NOT-44`: criadora vê a seção; admin convidado não vê; o toque pede a permissão
- [ ] Teste `NOT-72`: axe sem violação; as entradas da t32 no `telas.json` continuam iguais
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 16: Privacidade, documentação e jornada

### T39: Texto da privacidade (t07)

**What**: Acrescentar à `/privacidade` que o push guarda só o endereço técnico do aparelho por grupo, sem nome, como cancelar e que é apagado depois de 180 dias sem envio; trocar a frase "Enviamos e-mails só para confirmar a conta, recuperar a senha e entregar convites de admin." por uma que inclua os e-mails de cobrança à criadora do grupo. Nova `TERMOS_VERSAO` com a data da mudança, sem pedir novo aceite; contas novas gravam a versão nova (AD-116).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/termos/Privacidade.tsx`
**Depends on**: T38
**Reuses**: páginas de termos e privacidade (`CA:1458`); `.specs/mockup/telas/t07-privacidade--pagina.html:21`; `TERMOS_VERSAO` (`CA:574`); nova versão com a data da mudança, sem novo aceite (AD-116)
**Requirement**: NOT-59
**Status**: rascunhada
**Nota do rascunho**: o texto do push entra em "O que guardamos" (como o da cobrança na planos-e-cobranca T54), porque o ACE-58 confere a lista exata das 4 seções. A `TERMOS_VERSAO` (`backend/contrato/src/acesso.ts:11`) já é `2026-11-05`, a data desta mudança (a planos-e-cobranca T54 a trocou hoje), então não mudou; se o `/executar` levar a mudança ao ar em outra data, troca para a data dele (AD-116). Testes em `frontend/web/test/telas/privacidade-push.test.tsx`.

**Done when**:

- [ ] Teste `NOT-59`: a página tem os 4 pontos do push e a frase nova; a frase antiga não aparece
- [ ] Testes `ACE-58` e `ACE-56` da `conta-e-acesso` continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T40: README e runbook do push

**What**: README: `pnpm vapid:gerar`, `PUSH_HOSTS_DEV` e o push falso local. `docs/runbook.md`: gerar as chaves, criar `VAPID_PUBLICA`, `VAPID_PRIVADA` e `VAPID_ASSUNTO` no environment `previa` e a fila `avisos` (passos do usuário no `/preparar`), o Cron da limpeza, o que fazer quando a fila acumula, e o efeito de trocar as chaves.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docs/runbook.md`
**Depends on**: T39
**Reuses**: README (`F:2113`); runbook de segredos (`F:2087`); documentação da conta (`CA:1708`)
**Requirement**: NOT-62
**Status**: rascunhada
**Nota do rascunho**: SPEC_DEVIATION: a tarefa fala em "environment `previa`"; pela AD-119 o deploy usa o environment `producao`, e as VAPID são secrets do próprio Worker (como `RESEND_API_KEY`), então o runbook manda gravá-las com `wrangler secret put`. README ganhou "Avisos no celular (push)" em Rodar local; o runbook, "Avisos no celular (push e fila)" em Segredos (passos do usuário, Cron, fila acumulando, troca das chaves). A checagem que cita cada variável do `.env.example` já passava pelas linhas da tabela de variáveis do README (T4 e T27).

**Done when**:

- [ ] O runbook lista os passos do usuário para os secrets e a fila, sem valor nenhum
- [ ] A troca de chaves diz que as assinaturas antigas deixam de valer e que o front assina de novo
- [ ] A checagem que cita cada variável do `.env.example` (`F:2113`) passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T41: Jornada de push ponta a ponta

**What**: Acrescentar a `.specs/projeto/jornadas.md` a jornada "assinar o ranking, admin lança partida, aviso chega, cancelar" (numerada pela sessão principal) e escrever o teste Playwright contra o `wrangler dev` com o seed, `PUSH_HOSTS_DEV` e o servidor de push falso: a página assina com um `PushManager` falso apontando para o servidor falso, o admin lança a partida, o servidor falso recebe uma requisição `aes128gcm` com VAPID, e cancelar apaga a assinatura.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/notificacoes.spec.ts`
**Depends on**: T40
**Reuses**: jornadas da `partidas-e-ranking` (`PR:2441`); Playwright e servidor de e2e (`F:1691`); T27
**Requirement**: NOT-63, NOT-64
**Status**: rascunhada
**Nota do rascunho**: a J-34 já estava em `.specs/projeto/jornadas.md` (numerada no planejamento), então o arquivo não mudou. O `playwright.config.ts` ganhou o push falso como `webServer` (porta 8790) e, no `wrangler dev`, as VAPID do e2e (par gerado a cada execução pelo `generateKeyPairSync`, nunca em arquivo) e `PUSH_HOSTS_DEV`, só por `--var`. A página troca `Notification`, `PushManager` e `navigator.serviceWorker` por um gerente falso com chaves P-256 de verdade (a API cifra para elas). SPEC_DEVIATION: tocar na notificação e o texto dela ficam com os testes do SW (T34), porque o SW de verdade fica bloqueado nas jornadas. O NOT-63 confere os hosts que a página chamou; o que o Worker chama sai só para o push falso, provado pelo `PUSH_HOSTS_DEV`. Teste em `frontend/web/e2e/notificacoes.spec.ts`.

**Done when**:

- [ ] Teste `NOT-64`: a jornada termina com a requisição recebida pelo servidor falso e, depois de cancelar, `estado` `assinado: false`
- [ ] Teste `NOT-63`: nenhum host fora de `localhost` é chamado durante o teste
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

## ADs desta feature (gravadas em `.specs/STATE.md` pela sessão principal)

- **AD-098**: envio por Cloudflare Queues (fila `avisos`, consumidor com `max_batch_size` 1 e `max_retries` 2), e o enfileiramento depois do `COMMIT` por `waitUntil`. Fonte: `S:243-244` (Free: 10 ms de CPU e 50 subrequisições por invocação; Queues no Free com 10 mil operações/dia e 24 h de retenção). Descartado `waitUntil` sozinho: envio na mesma invocação do admin, dividindo CPU e subrequisições, sem retomada (NOT-69) nem nova tentativa espaçada (NOT-42). Criar a fila é passo do usuário no `/preparar`.
- **AD-099**: RFC 8291 e RFC 8292 escritos do zero com a Web Crypto, sem biblioteca (AD-002, AD-071; `S:245`: as bibliotecas não têm revisão de criptografia), provados pelo vetor do Apêndice A.
- **AD-100**: P-256 na Web Crypto do Workers é PREMISSA (`S:242`); a prova é o vetor da T2 rodando no `workerd`. Falhou: pare e pergunte.
- **AD-101**: as 3 tabelas não têm grant para `pelada_app`; todo acesso passa por função `SECURITY DEFINER`; as de envio e limpeza exigem sessão sem conta e sem slug.
- **AD-102**: a exclusão de conta apaga `push_conta` por trigger em `contas.excluida_em`, porque `conta_excluir` anonimiza e a `planos-e-cobranca` a redefine (PLA-68).
- **AD-103**: rotas `GET /api/publico/:slug/push`, `POST /api/publico/:slug/push/estado`, `GET /api/conta/push` e `POST /api/conta/push/estado`.
- **AD-104**: a spec manda a função conferir o plano (NOT-51); PLA-07 faz do `recursoLiberado` o único ponto; vale: a API confere o plano pelo `recursoLiberado`, na mesma transação, e a função confere slug ativo e teto; o NOT-51 passa a ler "a API confere o plano". Decisão do usuário.
- **AD-105**: "uma vez por evento" (NOT-39) usa a chave (id da cobrança no Asaas, tipo do aviso); só evento novo, aplicado e não obsoleto enfileira. Decisão do usuário.
- **AD-106**: o controle de avisos de cobrança fica em Minha conta (`/app/conta`), porque a assinatura é por conta, não por grupo.
- **AD-107**: teto de 10 assinaturas por conta (409 `limite_assinaturas`).
- **AD-108**: novas tentativas pela fila: push 429 ou 5xx com atraso do `Retry-After` (padrão 60 s, teto 1 h), até 2; e-mail de cobrança a cada 8 h, até 3 tentativas (16 h, dentro dos 24 h de retenção).
- **AD-109**: hosts aceitos: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com` (`S:241`) e `*.notify.windows.com` (Edge, PREMISSA); `PUSH_HOSTS_DEV` só local, reprovada no `wrangler.jsonc` e no `deploy.yml`.
- **AD-110**: `Topic` = 32 primeiros caracteres do base64url do SHA-256 do `grupo_id`; `tag` do SW = slug no ranking e `cobranca-<grupoId>` na cobrança.
- **AD-111**: o "guia de `.specs/mockup/`" é `index.html`, `tokens.css` e `base.css` (não há `guia.html`).
- **AD-112**: CPU de NOT-34 medida por bench no Node (`process.cpuUsage`) com meta de 6 ms, porque o relógio do `workerd` não avança sem I/O; subrequisições contadas no `workerd`.
- **AD-116**: a mudança do texto da privacidade (NOT-59) troca a `TERMOS_VERSAO` para a data da mudança, sem pedir novo aceite a quem já tem conta; contas novas gravam a versão nova. Decisão do usuário.
