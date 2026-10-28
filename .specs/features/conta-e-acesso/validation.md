# Conta e acesso — Validação (volta 7: recuperação de senha zera as falhas de login, T72 e T73)

**Data**: 2026-10-28
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `11c30ba..61dffdf` (branch `fix/conta-e-acesso-seguranca`, 3 commits: `b2b40ed` documentação e tarefas, `a233d42` T72, `61dffdf` T73; 7 arquivos). Esta volta
confere o critério novo ACE-76 (SEC-CA-15) e a documentação que o registra. Conjunto avaliado: as correções do reteste de segurança T57 a T73 (AD-013).
**Verificador**: subagente independente (autor ≠ verificador). Releu a spec, o diff e o código, e refez as mutações sem confiar no relato do implementador.

**Result**: PASS

Resumo: a migration `1792844160000_conta-nova-senha-zera-falhas.sql` redefine `link_nova_senha` (mesma assinatura e retorno, `SECURITY DEFINER`, `search_path` fixo, `EXECUTE` só para `pelada_app`) e
apaga as `tentativas_login` do e-mail da conta na mesma transação da troca de senha. Os 4 testes novos provam cada cláusula do ACE-76 com o resultado da spec (conta bloqueada por 50 falhas de
origens diferentes volta a entrar com a senha nova; falhas de outro e-mail intactas; link inválido não apaga nada). 11 mutantes executados numa cópia isolada: 9 mortos e 2 equivalentes
(M9 e M11, análise abaixo), nenhum sobrevivente real. A T73 só toca documentos e as frases novas conferem com o código. Gate verde (lint, format, typecheck, `pnpm test` com 1322 testes e
`test:checagens` com 432, de primeira).

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
- **Volta 6 (PASS)**: T70 e T71 (`7c89642..7b09ddc`): o teste da serialização por e-mail do `conta_entrar` (`conta-entrar-teto-conta.test.ts:167-192`) mata o M17 e o M17b
  (3 de 3 execuções); a documentação nova (ACE-73, ACE-74, THREAT-MODEL, `seguranca.md`, README) confere com o código; 28 de 30 mutantes mortos, 2 equivalentes (M10, M16);
  gate verde (1318 testes e 432 de checagens, esta na 2ª execução após um estouro de `hookTimeout` em `dono.test.ts`). Relatório completo no histórico do git (`11c30ba`).

Os critérios que esta volta não toca continuam valendo com as mesmas evidências; o gate completo desta volta as reexecuta.

---

## Conclusão das tarefas

73 tarefas (T1 a T73). Esta volta confere as duas últimas:

| Tarefa | Estado | Conferência desta volta |
| --- | --- | --- |
| T72 `link_nova_senha` zera as falhas do e-mail | ✅ | migration `mig/1792844160000_conta-nova-senha-zera-falhas.sql:10-37` e teste `api/test/migracoes/conta-nova-senha-zera-falhas.test.ts:87-133`. `tasks.md`: os 3 itens de "Done when" marcados; o primeiro ("o teste falha sem a migration") foi refeito por este verificador (M1) |
| T73 documentação (SEC-CA-15 corrigido, SEC-CA-16 a decidir) | ✅ | `seguranca.md`, `.md/THREAT-MODEL.md` (linha D), `docs/runbook.md` (seção 9) e `spec.md` (ACE-76 e rastreabilidade); `tasks.md` com os itens marcados |

**T73 não altera comportamento**: `git diff --name-only 11c30ba..HEAD` lista 7 arquivos: 5 documentos (`THREAT-MODEL.md`, `seguranca.md`, `spec.md`, `tasks.md`, `runbook.md`), a migration da T72 e o teste da
T72. Nenhum arquivo de código de produção, configuração ou `.env.example` mudou além da migration da T72.

**Integridade dos testes** (`git diff --stat 11c30ba..HEAD -- '*.test.*'`): um único arquivo tocado, **novo** (`conta-nova-senha-zera-falhas.test.ts`, 133 linhas a mais e 0 a menos). Nenhum teste
existente alterado, apagado, pulado, comentado ou enfraquecido.

**Contagem de testes** (volta 6 → volta 7): API 765 → 769 (+4, 54 arquivos), web 493, contrato 39, raiz 20, domínio 1, checagens 432. Nenhum a menos.

---

## Critérios de aceite ancorados na spec

**ACE-76** (`spec.md:299`): "WHEN a senha é trocada pela recuperação (`link_nova_senha`) THEN o sistema SHALL zerar as falhas de login registradas para o e-mail e o bloqueio por conta que elas
causaram, para que o dono da conta volte a entrar com a senha nova."

| Cláusula | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| Bloqueio por conta existia antes | 50 falhas de origens diferentes bloqueiam o e-mail (ACE-74) | `conta-nova-senha-zera-falhas.test.ts:90` `falhasDeOrigensDiferentes(email, 50)`; `:91` `expect(await entrar(email, SENHA)).toBe('bloqueado')` (pré-condição real: sem ela o teste não distingue) | ✅ |
| A troca pela recuperação acontece | `link_nova_senha` devolve `true` com link válido | `:94` `pedirRecuperacao` (via `link_pedir`); `:95` `expect(await novaSenha(token, SENHA_NOVA)).toBe(true)` | ✅ |
| "o dono volte a entrar com a senha nova" | `conta_entrar` com a senha nova devolve `ok` (conta bloqueada antes) | `:97` `expect(await entrar(email, SENHA_NOVA)).toBe('ok')` | ✅ |
| "zerar as falhas registradas para o e-mail" | nenhuma falha restante do e-mail | `:98` `expect(await falhasDe(email)).toBe(0)` | ✅ |
| Falhas de outro e-mail não são tocadas | 50 falhas do outro e-mail seguem e ele continua bloqueado | `:104-105` 50 falhas para cada um; `:111` `expect(await falhasDe(outro)).toBe(50)`; `:112` `expect(await entrar(outro, SENHA)).toBe('bloqueado')` | ✅ |
| Link inválido não zera nada (ACE-25, `spec.md`: false sem alterar) | `link_nova_senha` devolve `false` e as falhas ficam | `:128` `expect(await novaSenha(novoHash(), SENHA_NOVA)).toBe(false)`; `:130` `falhasDe(email)` `toBe(50)`; `:131` `entrar(...)` `toBe('bloqueado')` | ✅ |
| Rollback do Worker (G-14, aditiva) | assinatura e retorno inalterados, uma só função | `:121` `expect(rows).toEqual([{ args: 'p_token_hash bytea, p_senha text', ret: 'boolean', n: 1 }])` | ✅ |
| Permissões da função (AD-008) | `SECURITY DEFINER`, `search_path` fixo, sem `EXECUTE` para `PUBLIC`, só `pelada_app` | `api/test/migracoes/funcoes-definer.test.ts` (já existente, 5 testes, passam; M8, M10 e M12 os derrubam) | ✅ |

Os valores esperados são os da spec (login volta a `ok`, zero falhas restantes, outro e-mail intacto); nenhuma lacuna de precisão. O critério não define o que acontece com as linhas de **sucesso**
do e-mail; a função apaga todas as linhas do e-mail (falhas e sucessos), o que é coerente com "zerar as contagens" do ACE-74 e não afeta nenhuma regra (os sucessos só servem para zerar o contador).

**Conferência das frases novas da T73 contra o código**:

- `runbook.md` seção 9 ("5 senhas erradas do mesmo e-mail e IP bloqueiam esse par por 15 min (ACE-13); 50 senhas erradas para o mesmo e-mail em 1 h, de quaisquer IPs, bloqueiam o login dele por 10 min
  (429, ACE-74), mesmo com a senha certa"): `mig/1792844040000_conta-entrar-teto-conta.sql:46-72` (5 em 15 min por par; 50 em 1 h por e-mail, bloqueio até `+10 min`; o bloqueio vem antes do `crypt`, então
  a senha certa também é recusada). "A nova senha pela recuperação apaga as falhas do e-mail e libera o login na hora (ACE-76)": `mig/1792844160000...sql:32`. "As sessões abertas caem na troca":
  `:30` `DELETE FROM sessoes`. ✅
- `THREAT-MODEL.md` linha D: "a nova senha pela recuperação apaga as falhas de login do e-mail e libera o login (ACE-76)" confere com `:32`; o resíduo "bloqueio renovável enquanto o atacante mantiver 50
  falhas por hora" confere com o comentário e a lógica de `conta_entrar` (as falhas da última hora continuam contando; `...entrar-teto-conta.sql:13-14`); o teste novo foi incluído na lista de evidências. O
  resíduo SEC-CA-16 (teto de 20 e-mails por hora por origem compartilhada) confere com `api/src/entrada/middlewares/limite-emails-origem.ts:28-37` e `chave-ip.ts` (chave IPv4 ou /48). ✅
- `seguranca.md` (SEC-CA-15 "Corrigido", SEC-CA-16 "Aceito por ora"): "na mesma transação" e "link inválido não apaga nada" conferem com a função (corpo único; `RETURN false` antes de qualquer `DELETE`, `:21-23`)
  e com o teste `:124-132`. ✅

**Status**: ✅ ACE-76 provado cláusula por cláusula com o resultado da spec. Nenhuma lacuna de teste aberta.

---

## Revisão da migration (aditividade e permissões)

- **Aditiva**: arquivo novo, nenhuma migration aplicada editada (`git diff --name-only 11c30ba..HEAD` só lista a nova). `CREATE OR REPLACE FUNCTION` com a mesma assinatura `(bytea, text) RETURNS boolean`.
- **Corpo anterior preservado** (comparado com `mig/1792843440000_conta-cadastro-e-links.sql:125-146`): o `UPDATE links_conta ... RETURNING conta_id`, o `RETURN false` para link inválido, o `UPDATE contas` (hash bcrypt de
  custo 12, confirmação do e-mail via `coalesce`) e o `DELETE FROM sessoes` são idênticos. Acréscimos: a variável `v_email`, o `RETURNING c.email INTO v_email` e o `DELETE FROM tentativas_login`.
- **Atributos**: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `LANGUAGE plpgsql VOLATILE`; `REVOKE ALL ... FROM PUBLIC` e `GRANT EXECUTE ... TO pelada_app` repetidos (o `CREATE OR REPLACE` já preserva
  a ACL; ver M9).
- **Nenhuma migration posterior a redefine**: `grep link_nova_senha` em `backend/api/src` só acha a migration original (`1792843440000`), a nova (`1792844160000`, a última da pasta) e o repositório
  `links.ts:62`, que chama a função. A nova não é sobrescrita.
- **Normalização do e-mail**: `contas.email` tem `CHECK (email = lower(btrim(email)))` (`1792843200000_linha-de-base.sql:10`) e `conta_entrar` grava `tentativas_login.email` como `lower(btrim(p_email))`; o `lower(btrim(...))` do
  `DELETE` é defensivo e igual ao formato gravado.
- **Corrida**: `link_nova_senha` não toma a trava `entrar|<e-mail>` de `conta_entrar`; uma falha em voo pode ser gravada logo depois da limpeza. É uma falha legítima de uma tentativa que já estava rodando, não reabre
  o bloqueio (precisa de 50), então não é lacuna.

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` no diretório de rascunho do verificador, com `pnpm install --offline --frozen-lockfile` e o `.env` local copiado. Cada mutante alterou só a migration da T72
na cópia (restaurada de um arquivo-original entre as rodadas) e rodou `conta-nova-senha-zera-falhas`, `funcoes-definer` e `conta-cadastro-e-links` (29 testes). Controle sem mutação: 29 de 29 passam. As `node_modules`
da cópia foram apagadas sem seguir links (`rmdir /s /q`), o worktree removido (`git worktree remove --force`, `git worktree prune`; `git worktree list` sem ele) e conferido que a árvore real ficou intacta (679
pacotes em `node_modules/.pnpm`, 20 entradas em `frontend/web/node_modules`, 9 em `backend/api/node_modules`, iguais a antes). `git status --porcelain` estava vazio antes; depois, a única diferença é
`seguranca.md` modificado, que **não foi feito por este verificador** (o `auditor-seguranca` trabalha em paralelo nesse arquivo).

| # | Mutação (regra crítica) | Resultado |
| --- | --- | --- |
| M1 | o `DELETE FROM tentativas_login` vira `NULL;` (sem limpar) | ✅ **Morta**: 1 falha, `expected 'bloqueado' to be 'ok'` (`test:97`). Confirma que o teste falha sem a mudança |
| M2 | apaga as falhas de **outros** e-mails (`t.email <>`) | ✅ **Morta**: 2 falhas (`:97` e `expected +0 to be 50`, `:111`) |
| M3 | apaga **tudo** (`DELETE` sem `WHERE`) | ✅ **Morta**: 1 falha, `expected +0 to be 50` (`:111`, falhas do outro e-mail) |
| M4 | `RETURN true` vira `RETURN false` (retorno errado) | ✅ **Morta**: 4 falhas (2 do teste novo e 2 de `conta-cadastro-e-links`) |
| M5 | assinatura muda (parâmetro extra `p_x int DEFAULT 0`, cria sobrecarga) | ✅ **Morta**: 14 falhas, incluindo `expected [ {…}, {…} ] to deeply equal [ {…} ]` (`:121`) |
| M6 | apaga só as falhas com mais de 30 min | ✅ **Morta**: 1 falha, `expected 29 to be +0` (`:98`) |
| M7 | apaga o e-mail errado (literal fixo de outro e-mail) | ⏸ **Não executado** (o comando caiu num lote recusado pelo ambiente e a cópia já havia sido descartada); o caso é coberto por M2, que apaga os outros e-mails e morre em 2 testes |
| M8 | tira `SECURITY DEFINER` | ✅ **Morta**: 9 falhas (testes do ACE-76, `link_nova_senha` e `funcoes-definer`) |
| M9 | tira o `REVOKE ALL ... FROM PUBLIC` | ⚠️ **Sobrevive, equivalente**: `CREATE OR REPLACE` preserva a ACL da função, que a migration `1792843440000` já tinha revogado; o efeito do `REVOKE` repetido é nulo |
| M10 | `GRANT EXECUTE ... TO PUBLIC` em vez de `pelada_app` | ✅ **Morta**: 4 falhas em `funcoes-definer.test.ts` |
| M11 | `DELETE` sem `lower(btrim(...))` (`t.email = v_email`) | ⚠️ **Sobrevive, equivalente**: `contas.email` tem `CHECK (email = lower(btrim(email)))`, então o valor já vem normalizado |
| M12 | tira o `SET search_path` | ✅ **Morta**: 4 falhas em `funcoes-definer.test.ts` |

Nota sobre M7: dos 12 mutantes numerados, **11 foram executados** (M7 não), 9 mortos, 2 equivalentes (M9, M11), nenhum sobrevivente real.

**Resultado**: o teste novo falha sem a migration (M1), com o e-mail errado (M2), com o `DELETE` sem `WHERE` (M3), com o retorno errado (M4), com a assinatura alterada (M5) e com a limpeza parcial (M6); as
permissões são guardadas pelo `funcoes-definer.test.ts` já existente (M8, M10, M12).

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ (a migration acrescenta uma variável e um `DELETE` ao corpo anterior; o teste reaproveita `comoApp`, `criarBancoTemporario`, `migrar`) |
| Mudanças cirúrgicas | ✅ (7 arquivos: uma migration, um teste e cinco documentos) |
| Segue os padrões existentes | ✅ (mesmo cabeçalho de migration `-- Up Migration` com comentário citando ACE-76/SEC-CA-15/T72 e G-14; mesmo estilo de teste de banco real) |
| Testes mapeiam critérios e não são rasos | ✅ (cabeçalho do teste cita ACE-76, ACE-74, SEC-CA-15 e T72; pré-condição `bloqueado` provada antes da recuperação) |
| Resultado asserido bate com a spec | ✅ |
| Nenhum teste órfão | ✅ |
| Testes existentes alterados | ✅ nenhum |
| Configuração | ✅ sem mudança |
| Guias seguidos | `CLAUDE.md` da raiz (migration nova aditiva, nunca edita uma aplicada; mudança de comportamento com teste que falharia sem ela), `.md/GUARDRAILS.md` G-14 (assinatura mantida para o rollback do Worker) |

---

## Casos limite

- [x] Conta bloqueada por 50 falhas de 50 origens diferentes volta a entrar após a recuperação: `conta-nova-senha-zera-falhas.test.ts:88-99`
- [x] Falhas de outro e-mail não são apagadas e ele segue bloqueado: `:101-113`
- [x] Link inexistente (hash aleatório): `false`, falhas intactas, login segue bloqueado: `:124-132`
- [x] Assinatura única (sem sobrecarga) e retorno `boolean` preservados: `:115-122`
- [x] Link já usado ou vencido, e link de confirmação (tipo errado), seguem devolvendo `false` sem alterar a senha: `api/test/migracoes/conta-cadastro-e-links.test.ts` (passa; M4 e M8 o derrubam)
- [x] Recuperação com sessões abertas apaga todas (ACE-24), mantido: `conta-cadastro-e-links.test.ts` (teste "troca a senha, consome o link, confirma o e-mail e apaga todas as sessões")
- [ ] Não há teste para link **vencido** ou **já usado** com falhas pendentes (as falhas ficam); a ramificação é a mesma do `RETURN false` antes de qualquer `DELETE` (`:21-23`) já provada com o link inexistente (`:124-132`). Não é lacuna do critério.

---

## Gate

Comando: etapas do gate Build de `tasks.md` que o pedido incluiu (sem `build`, e2e e visual), uma execução por vez no banco `conta-e-acesso-seguranca-db-1`.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 (`All matched files use Prettier code style!`) |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0: raiz 20, domínio 1, contrato 39, web 493 (54 arquivos), API 769 (54 arquivos) = 1322 testes, 0 falhas, 0 pulados |
| `pnpm test:checagens` | ✅ exit 0 de primeira: 432 testes (21 arquivos), 0 falhas, 0 pulados (sem repetir o estouro de `hookTimeout` de `dono.test.ts` visto na volta 6) |
| `build`, `e2e`, `visual`, `gitleaks`, `checar-tokens.py` | não rodados (fora do pedido desta volta; esta volta não toca o web nem a configuração) |

---

## Observações que não bloqueiam

1. **Resíduo do SEC-CA-15 (decisão do AD-013 e do usuário)**: depois da recuperação, o atacante que mantiver cerca de 50 falhas por hora para o e-mail renova o bloqueio. A saída existe (nova recuperação), com o
   custo para o dono de perder as sessões abertas. Está registrado no THREAT-MODEL e no `seguranca.md`; a 2ª correção sugerida (não renovar o bloqueio com falhas novas) não foi feita.
2. **Cadeia de rota do ACE-76**: não há teste de rota que faça `POST /api/sessao/nova-senha` e depois `POST /api/sessao/entrar` contra um e-mail bloqueado. O repositório (`links.ts:62`) chama a função e a
   rota `sessao-recuperacao` já tem o seu teste (ACE-24); o efeito no banco é provado no teste de migração, onde está a regra. Sem lacuna do critério.
3. **Rastreabilidade da spec**: `spec.md:393-398` mostra ACE-72 a ACE-76 como `Pending` e `**Coverage:** 76 total, 0 mapped to tasks` (texto antigo do modelo); o verificador não altera a spec e o autor atualiza
   na integração.
4. **`seguranca.md` modificado fora desta volta**: durante a verificação o `git status` mostrou `seguranca.md` modificado, edição do `auditor-seguranca` em paralelo, não deste verificador.
5. **Antes de integrar**: rodar a checagem final completa (`python .claude/scripts/trava-testes.py --rodar`, que inclui build, e2e e visual); não rodados nesta volta por pedido.
6. **Instabilidade do `dono.test.ts`** (volta 6): não se repetiu nesta volta.

---

## Atualização da rastreabilidade

| Requisito | Estado anterior | Novo estado |
| --- | --- | --- |
| ACE-76 | Pending | ✅ Verificado (T72; M1 a M6, M8, M10 e M12 mortos) |
| ACE-74 | ✅ Verificado (volta 6) | ✅ Sem mudança (regressão no gate; o teste novo ainda usa a regra do ACE-74 como pré-condição) |
| ACE-72, ACE-73, ACE-75 | ✅ Verificado (voltas 5 e 6) | ✅ Sem mudança (regressão no gate) |
| ACE-01 a ACE-71 | ✅ Verificado (voltas 3 e 4) | ✅ Sem mudança (regressão no gate) |

(`spec.md` não foi alterado pelo verificador; a tabela de rastreabilidade da spec mostra ACE-72 a ACE-76 como `Pending`, o que o autor atualiza na integração.)

---

## Resumo

**Geral**: ✅ A feature conta-e-acesso, no conjunto de correções T57 a T73, pode seguir para a checagem final (build, e2e, visual, gitleaks) e a integração.

**Verificação ancorada na spec**: ACE-76 provado com o resultado da spec (login volta a `ok`, zero falhas restantes, outro e-mail intacto, link inválido não apaga nada).
**Sensor**: 11 mutantes executados, 9 mortos, 2 equivalentes (M9, M11); nenhum sobrevivente real.
**Gate**: lint, format, typecheck, `pnpm test` (1322) e `test:checagens` (432) verdes; e2e e visual não rodados por pedido.

**Lacunas em ordem de gravidade**: nenhuma.

**Próximos passos**: checagem final completa antes de integrar; o autor atualiza a tabela de rastreabilidade da spec; o `auditor-seguranca` conclui o reteste do SEC-CA-15 e o usuário decide o SEC-CA-16 na liberação.

## Perguntas para o usuário

Nenhuma.
