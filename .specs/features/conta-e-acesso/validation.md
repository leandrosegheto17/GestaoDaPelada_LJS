# Conta e acesso — Validação (volta 6: reverificação do M17 e da documentação, T70 e T71)

**Data**: 2026-10-28
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `7c89642..7b09ddc` (branch `fix/conta-e-acesso-seguranca`, 2 commits: `b17cee9` T70, `7b09ddc` T71; 6 arquivos, 45 linhas a mais e 11 a menos). Esta volta
fecha a única lacuna da volta 5 (M17, ACE-74) e confere que a documentação nova (ACE-73, ACE-74, THREAT-MODEL, `seguranca.md`, README) bate com o código. Conjunto avaliado:
as correções do reteste de segurança T57 a T71 (AD-013).
**Verificador**: subagente independente (autor ≠ verificador). Releu a spec, o diff e o código, e refez a mutação sem confiar no relato do implementador.

**Result**: PASS

Resumo: o teste novo da T70 (`backend/api/test/migracoes/conta-entrar-teto-conta.test.ts:167-192`) prova a serialização por e-mail do ACE-74: 49 falhas e cinco chamadas
simultâneas de IPs diferentes dão exatamente uma `invalida` e quatro `bloqueado`, e 50 falhas gravadas. O mutante M17 (trava de volta para e-mail e IP) **morre** (3 de 3
execuções) e, sem a trava, também morre; os outros 28 testes dos dois arquivos de migração seguem verdes, como na volta 5. A T71 não toca código de produção, e as frases novas
da spec, do README e do THREAT-MODEL conferem com o código. Gate verde. Os 29 mutantes da volta 5 passam a ter 27 mortos e 2 equivalentes (M10, M16), nenhum sobrevivente real.

Convenção de caminhos: `api/test/` = `backend/api/test/`; `api/src/` = `backend/api/src/`; `mig/` = `backend/api/src/infraestrutura/db/migracoes/`.

---

## Resumo das voltas anteriores

- **Volta 1 (FAIL)**: gate verde, 31 mutações (27 mortas). Quatro lacunas: M17 e M18 (policies de escrita de `sessoes` e `contas` abertas, ACE-43 e ACE-44), F1
  (ligação entre sessão expirada e `/entrar`, ACE-20), M26 (intervalo de 60 s só testado em 0 s e 61 s, ACE-51) e a t25 fora da comparação visual (ACE-54). Corrigidas
  em T45 a T52. Relatório completo no histórico do git (`a8ec48f`).
- **Volta 2 (FAIL)**: as quatro lacunas anteriores fechadas; 19 mutações, 17 mortas. Sobreviveram N7 e N16 (nenhum teste de rota conferia o valor de `termos_versao`
  gravado em `POST /api/conta` e em `POST /api/convites/cadastrar`; ACE-01 e a cláusula "é a mesma gravada no aceite" do ACE-58) e achou-se o byte inválido em três
  mockups t25. Corrigidas em T53 a T56. Relatório completo no histórico do git (`62aa021` e `45e7dca`).
- **Volta 3 (PASS)**: 69 de 69 critérios com o resultado da spec provados (1 lacuna de precisão, ACE-56, não bloqueante); gate verde (1203 + 432 + 15 testes e 84
  comparações visuais); `gitleaks` sem vazamento; 9 mutações, 9 mortas. A tabela completa dos 69 critérios com `arquivo:linha` está no histórico do git (`04cdca1`).
- **Volta 4 (PASS)**: correções dos médios de segurança T57 a T64 (`8df20cc..db0412e`): ACE-06 reescrito, ACE-70, ACE-71 e ACE-72 provados; 25 mutações, 24 mortas e 1
  sobrevivente equivalente (M11, `conta_senha_bloqueada_ate` devolve um valor que ninguém lê); gate verde (716 testes de API, 493 de web, 432 de checagens); duas
  lacunas de precisão (fronteira do 80% do ACE-72, agora fechada pela redação "atinge"; cláusula "não revela se a conta existe" do ACE-70). Relatório completo no
  histórico do git (`cc844c5`).
- **Volta 5 (FAIL)**: correções do reteste T65 a T69 (`cc844c5..70fce3b`, 38 arquivos): ACE-72 (redação "atinge"), ACE-73, ACE-74 e ACE-75 com o resultado da spec provado em
  asserções (cota de cadastro para "esqueci a senha" de conta não confirmada, teto de 20 pedidos por hora por IPv4 ou /48, teto de 50 falhas por hora por conta com bloqueio de 10
  min, `fetch` do Resend abortado em 10 s e `lock_timeout` de 2 s na reserva); gate verde (1317 testes e 432 de checagens); 29 mutações, 26 mortas, 2 sobreviventes
  equivalentes (M10, M16) e **1 real, M17** (a trava do `conta_entrar` por e-mail, e não por e-mail e IP, sem teste de concorrência com IPs diferentes). Corrigida em T70.
  Levantou duas perguntas ao usuário (oráculo de "esqueci a senha" entre 80% e 100% da cota; texto único do 429), resolvidas em T71. Relatório completo no histórico do git
  (`7c89642`).

Os critérios que esta volta não toca continuam valendo com as mesmas evidências; o gate completo desta volta as reexecuta.

---

## Conclusão das tarefas

71 tarefas (T1 a T71). Esta volta confere as duas últimas:

| Tarefa | Estado | Conferência desta volta |
| --- | --- | --- |
| T70 teste da serialização por e-mail do `conta_entrar` | ✅ | `api/test/migracoes/conta-entrar-teto-conta.test.ts:167-192` (bloco novo) e o helper `entrar` (`:56-63`, parâmetro opcional `c: pg.Client = cliente`). `tasks.md`: os dois itens de "Done when" marcados; o primeiro ("passa com a migration atual e falha com a trava em e-mail e IP") foi refeito por este verificador na cópia isolada |
| T71 documentação (oráculo, texto do 429, `LIMITE_EMAILS_IP_HORA`) | ✅ | spec ACE-73 e ACE-74, THREAT-MODEL linha da enumeração, `seguranca.md` (SEC-CA-05), README; `tasks.md` com os itens marcados |

**T71 não altera comportamento**: `git diff --name-only 7c89642..HEAD` sem `.md` e sem arquivo de teste não lista nada (nenhum arquivo de código de produção, migration, configuração ou `.env.example`). Os 6 arquivos
são `THREAT-MODEL.md`, `seguranca.md`, `spec.md`, `tasks.md`, `README.md` e o teste da T70.

**Integridade dos testes** (`git diff 7c89642..HEAD -- backend/api/test`): um único arquivo de teste tocado, com 31 linhas a mais e 3 a menos. As 3 linhas removidas são a assinatura e as duas
linhas de abertura do helper `entrar` (que passou a aceitar o cliente como quarto parâmetro, com o padrão `cliente` e o mesmo `SELECT * FROM conta_entrar($1, $2, $3, $4)` com os mesmos
argumentos, `:56-63`); todos os chamadores antigos continuam como estavam e o arquivo segue com os 8 testes anteriores intactos (9 testes no total). Nenhum teste apagado, pulado, comentado ou
enfraquecido.

**Contagem de testes** (volta 5 → volta 6): API 764 → 765 (+1, 53 arquivos), web 493 (igual), contrato 39, raiz 20, domínio 1, checagens 432 (igual). Nenhum a menos.

---

## Critérios de aceite ancorados na spec

Só o ACE-74 muda de estado; os demais da volta 5 (ACE-72, ACE-73a e b, ACE-75a e b) seguem com as evidências da tabela daquela volta, reexecutadas no gate desta.

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| ACE-74 (serialização por conta sob rajada) | `spec.md` ACE-74: 50 senhas erradas em 1 h para a mesma conta, "vindas de quaisquer IPs", e as tentativas seguintes recebem 429 `bloqueado_temporariamente` sem bcrypt. Sob rajada de IPs diferentes, a regra só vale se as tentativas forem avaliadas uma depois da outra | `api/test/migracoes/conta-entrar-teto-conta.test.ts:172` `falhasDeOrigensDiferentes(email, 49, ...)` (49 falhas de IPs distintos); `:174-179` cinco conexões `pg.Client` separadas; `:181` cinco chamadas `conta_entrar` simultâneas (`Promise.all`) com senha errada e `novoHash()` diferente em cada; `:183` `expect(resultados).toEqual(['bloqueado','bloqueado','bloqueado','bloqueado','invalida'])` (exatamente 1 `invalida` e 4 `bloqueado`); `:184-188` `count(*)` das falhas do e-mail `toBe(50)` (as bloqueadas não são gravadas). Cada chamada usa conexão própria, então a concorrência é real | ✅ PASS |
| ACE-74 (demais cláusulas) | idem | Sem mudança desde a volta 5: `api/test/rotas/entrar-teto-conta.test.ts:32-34, 50-52, 62`; `conta-entrar-teto-conta.test.ts:88-163` | ✅ PASS |
| ACE-73 e ACE-74 (redação nova da T71) | ACE-73: pedidos contados ao chegar, tenha conta ou não o e-mail, e mesmo que a rota depois os recuse. ACE-74: o texto do 429 é único, o mesmo do ACE-13 ("Muitas tentativas. Tente de novo em 15 minutos."), valendo também para o bloqueio de 10 min | Conferido contra o código, abaixo | ✅ A frase nova bate com o código |

**Conferência das frases novas contra o código**:

- ACE-73 "contados ao chegar, tenha conta ou não o e-mail e mesmo que a rota depois os recuse": `api/src/entrada/middlewares/limite-emails-origem.ts:30-37` registra o pedido numa transação própria
  antes de `proximo()`, antes de a rota validar o corpo ou decidir o resultado, e sem ler a conta.
- ACE-74 "texto único": `api/src/entrada/rotas/sessao.ts:30-34` responde o `case 'bloqueado'` com "Muitas tentativas. Tente de novo em 15 minutos." para os dois bloqueios (a função SQL devolve
  `bloqueado` nos dois casos); o mesmo texto está em `api/src/entrada/rotas/conta-minha.ts:16` e em `frontend/web/src/telas/entrar/Entrar.tsx:18`. O ACE-13 (`spec.md:103`) fala do bloqueio do par e
  não repete o texto, mas o texto já era esse na tela e na rota: a spec agora diz o que o código faz.
- README "`LIMITE_EMAILS_IP_HORA` (padrão 20) … 429 acima disso … sem `CF-Connecting-IP`, como no `pnpm dev`, todos dividem a chave `sem-ip`": `limite-emails-origem.ts:10, 31` (padrão 20 e leitura da
  variável), `api/src/infraestrutura/sessao/chave-ip.ts:2` (`CHAVE_SEM_IP = 'sem-ip'`) e `limite-emails-origem.ts:30` (o cabeçalho ausente vira `sem-ip`); `.env.example:121` documenta a variável.
- THREAT-MODEL e `seguranca.md` (SEC-CA-05): "entre 80% e 100% de `LIMITE_EMAILS_DIA`, 'esqueci a senha' responde 503 `email_indisponivel` para conta não confirmada e 200 para e-mail sem conta": confere
  com `api/src/entrada/enviar-email.ts:36` (a categoria `recuperacao_nao_confirmada` para em 80%), `rotas/sessao-recuperacao.ts:26` e a prova da volta 5 em `api/test/rotas/teto-emails.test.ts:176-184`.
  O registro como risco residual aceito reflete a decisão do usuário (resposta à pergunta 1 da volta 5, recomendada (a)).

**Status**: ✅ ACE-72 a ACE-75 provados com o resultado da spec. Nenhuma lacuna de teste aberta.

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` no diretório de rascunho do verificador, com `pnpm install --offline --frozen-lockfile` e o `.env` local copiado. As `node_modules` da cópia foram apagadas
sem seguir links ao fim, o worktree temporário removido (`git worktree remove --force`, `git worktree prune`; `git worktree list` sem ele) e conferido que a árvore real ficou intacta (679 pacotes
em `node_modules/.pnpm`, 20 entradas em `frontend/web/node_modules`, 9 em `backend/api/node_modules`, iguais a antes) e que `git status --porcelain` ficou **vazio, igual ao de antes**.

Os 29 mutantes da volta 5 continuam como lá (M1 a M25, M17p); só o M17 foi refeito, mais uma variante:

| # | Arquivo | Mutação (regra crítica) | Testes executados | Resultado |
| --- | --- | --- | --- | --- |
| M17 | `mig/1792844040000_conta-entrar-teto-conta.sql:38` | a trava do `conta_entrar` volta a ser (e-mail, IP): `hashtextextended('entrar|' \|\| v_email \|\| '\|' \|\| p_ip_hash, 0)` | `migracoes/conta-entrar-teto-conta` e `migracoes/conta-entrar-e-sessao` (29 testes), 3 execuções | ✅ **Morta** (3 de 3: 1 falha, `AssertionError: expected ['invalida','invalida',…] to deeply equal ['bloqueado',…]` no teste da T70; os outros 28 passam) |
| M17b | idem | a trava some (a linha `PERFORM pg_advisory_xact_lock(...)` comentada) | `migracoes/conta-entrar-teto-conta` | ✅ **Morta** (1 falha, o mesmo teste da T70; 8 passam) |
| Controle | sem mutação | código real, 3 execuções do arquivo do teste novo | idem | 9 de 9 passam nas 3 (sem instabilidade) |

**Resultado**: o teste novo falha com as duas mutações da trava e passa com o código real; os demais testes dos dois arquivos se comportam como na volta 5 (nenhum outro cai com a trava por e-mail e
IP, o que confirma que só o teste novo prova a serialização). Total de mutantes do conjunto T65 a T71: 29 injetados na volta 5 mais M17b; **28 mortos**, 2 sobreviventes **equivalentes** (M10, M16, análise na
volta 5 e mantida: o `DELETE` anterior à contagem torna a janela do `count` redundante; o filtro externo `f.momento > v_ultimo_sucesso_conta` é redundante com o da subconsulta), **0 sobreviventes reais**.

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ (o teste novo reaproveita `falhasDeOrigensDiferentes`, `novaConta` e `comoApp`; o helper `entrar` ganhou só um parâmetro opcional) |
| Mudanças cirúrgicas | ✅ (6 arquivos: um teste e cinco documentos; nenhum código de produção) |
| Segue os padrões existentes | ✅ (mesmo estilo de `describe`/`it`, banco real, cabeçalho citando ACE-74 e T70) |
| Testes mapeiam critérios e não são rasos | ✅ (o teste cita ACE-74 e T70; o mutante da trava o derruba) |
| Resultado asserido bate com a spec | ✅ (1 `invalida` e 4 `bloqueado`, 50 falhas gravadas) |
| Nenhum teste órfão | ✅ |
| Testes existentes alterados | ✅ só a assinatura do helper `entrar`, com o mesmo comportamento |
| Configuração | ✅ sem mudança |
| Guias seguidos | `CLAUDE.md` da raiz (mudança de comportamento com teste que falharia sem ela; nenhum teste enfraquecido), `.md/GUARDRAILS.md` G-14 (sem mudança de migration) |

---

## Casos limite

- [x] 49 falhas não bloqueiam e a 50ª tentativa é avaliada: `api/test/migracoes/conta-entrar-teto-conta.test.ts:91-102`
- [x] Bloqueio expira em 10 min exatos (9 min 50 s bloqueado; 10 min 10 s liberado): `:104-121`
- [x] Falhas com mais de 1 h não contam: `:123-128`
- [x] Conta inexistente com a mesma resposta: `api/test/rotas/entrar-teto-conta.test.ts:50-52` e `conta-entrar-teto-conta.test.ts:130-134`
- [x] Tentativa bloqueada não roda o bcrypt nem é gravada: `conta-entrar-teto-conta.test.ts:136-144`
- [x] 21º pedido na fronteira da janela de 1 h: `api/test/migracoes/conta-teto-emails-origem.test.ts:63-72`
- [x] Dez pedidos simultâneos da mesma origem, teto 4: `conta-teto-emails-origem.test.ts:121-139`
- [x] IPv4 mapeado em IPv6 e `sem-ip`: `api/test/infraestrutura/chave-ip.test.ts:52-78`, `rotas/teto-emails-origem.test.ts:127-133`
- [x] `LIMITE_EMAILS_IP_HORA` inválido volta ao padrão 20: `rotas/teto-emails-origem.test.ts:137-141`
- [x] Trava ocupada por mais de 2 s e `lock_timeout` restrito à função: `conta-cota-trava.test.ts:61-63, 75`
- [x] **Rajada simultânea de IPs diferentes contra a mesma conta** (antes sem teste, M17): `conta-entrar-teto-conta.test.ts:167-192`

---

## Gate

Comando: etapas do gate Build de `tasks.md` que o pedido incluiu (sem `build`, e2e e visual), uma execução por vez no banco `conta-e-acesso-seguranca-db-1`.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0: raiz 20, domínio 1, contrato 39, web 493 (54 arquivos), API 765 (53 arquivos) = 1318 testes, 0 falhas, 0 pulados |
| `pnpm test:checagens` | ✅ exit 0 na 2ª execução: 432 testes (21 arquivos), 0 falhas, 0 pulados. A 1ª execução (logo depois do `pnpm test`) terminou com exit 1: `backend/scripts/test/dono.test.ts` estourou o `beforeAll` de 10 s (`Hook timed out in 10000ms`, depois `Connection terminated unexpectedly`) ao criar o banco temporário; 417 passaram e 15 foram pulados por causa disso. Arquivo e fixture não mudaram nesta volta; ver observação 1 |
| `build`, `e2e`, `visual`, `gitleaks`, `checar-tokens.py` | não rodados (fora do pedido desta volta; esta volta não toca o web nem a configuração) |

---

## Observações que não bloqueiam

1. **Instabilidade do `dono.test.ts`**: na 1ª execução de `test:checagens`, o `beforeAll` que cria o banco temporário (`criarBancoTemporario` e `migrar`) estourou os 10 s padrão do hook, logo depois de uma
   suíte de API pesada no mesmo Postgres. A repetição passou inteira (432 de 432). O arquivo não faz parte do diff desta volta (nem das voltas 4 e 5, em que passou de primeira); o `--testTimeout=30000` do
   comando cobre os testes, mas não o `hookTimeout`. Sugestão para depois, fora desta feature: dar um `hookTimeout` maior ao `beforeAll` desse arquivo.
2. **Cadeia do ACE-75a**: nenhum teste de rota usa um remetente que demora 10 s e confere 503 e o contador; a cadeia é provada em partes (timeout do `fetch` → `falhou`; `falhou` → 503; ROLLBACK não
   conta). Mesma observação das voltas 4 e 5.
3. **Bloqueio remoto curto (decisão (b))**: o teto por conta permite travar o login de uma vítima por 10 min de cada vez (50 senhas erradas por hora), e a serialização por e-mail enfileira os logins
   legítimos atrás dos bcrypts do atacante. O autor registrou o risco no `seguranca.md` e no THREAT-MODEL, em linha com o AD-013; o limitador de 10 por minuto por IP e a rejeição rápida (sem bcrypt)
   depois de 50 falhas limitam o efeito.
4. **Segurança**: o `seguranca.md` diz que as correções do reteste ainda não foram reverificadas pelo `auditor-seguranca`; fica para a próxima rodada de segurança.
5. **Tabela de rastreabilidade da spec**: `spec.md:393-396` ainda mostra ACE-72 a ACE-75 como `Pending`; o verificador não altera a spec, e o autor atualiza na integração (ver tabela abaixo).
6. **Rollback do Worker**: as migrations são aditivas e mantêm assinatura e colunas de `link_pedir` e `conta_entrar`; um Worker anterior continua funcionando, sem o teto por origem nem a categoria nova.
7. **Antes de integrar**: rodar a checagem final completa (`python .claude/scripts/trava-testes.py --rodar`, que inclui build, e2e e visual), não rodados nesta volta por pedido.

---

## Atualização da rastreabilidade

| Requisito | Estado anterior | Novo estado |
| --- | --- | --- |
| ACE-72, ACE-73, ACE-75 | ✅ Verificado (volta 5) | ✅ Verificado (sem mudança; regressão no gate) |
| ACE-74 | ⚠️ Cláusulas provadas; serialização sem teste (M17) | ✅ Verificado (T70; M17 e M17b mortos) |
| ACE-01 a ACE-71 | ✅ Verificado (voltas 3 e 4) | ✅ Sem mudança (regressão no gate) |

(`spec.md` não foi alterado pelo verificador; a tabela de rastreabilidade da spec ainda mostra ACE-72 a ACE-75 como `Pending`, o que o autor atualiza na integração.)

---

## Resumo

**Geral**: ✅ A feature conta-e-acesso, no conjunto de correções T57 a T71, pode seguir para a checagem final (build, e2e, visual, gitleaks) e a integração.

**Verificação ancorada na spec**: ACE-72 a ACE-75 provados com o resultado da spec, incluindo a serialização por conta sob rajada (T70).
**Sensor**: 28 de 30 mutantes mortos; 2 equivalentes (M10, M16); nenhum sobrevivente real. M17 reaplicado: morre em 3 de 3 execuções.
**Gate**: lint, format, typecheck, `pnpm test` (1318) e `test:checagens` (432, na 2ª execução, após um estouro de `hookTimeout` em `dono.test.ts` na 1ª) verdes; e2e e visual não rodados por pedido.

**Lacunas em ordem de gravidade**: nenhuma.

**Próximos passos**: checagem final completa antes de integrar; o autor atualiza a tabela de rastreabilidade da spec; a próxima rodada do `auditor-seguranca` reverifica o reteste.

## Perguntas para o usuário

Nenhuma. As duas perguntas da volta 5 (oráculo de "esqueci a senha" entre 80% e 100% da cota; texto do 429) foram resolvidas na T71 pela opção (a) de cada uma, e a redação conferida acima.
