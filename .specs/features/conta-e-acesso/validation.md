# Conta e acesso — Validação (volta 5: correções do reteste de segurança T65 a T69)

**Data**: 2026-10-28
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `cc844c5..70fce3b` (branch `fix/conta-e-acesso-seguranca`, 5 commits: `d0e4ea0` T65, `a81d70a` T66, `f309ad4` T67, `b1d4581` T68,
`70fce3b` T69; 38 arquivos, 1365 linhas a mais e 67 a menos). Esta volta verifica ACE-72 (redação "atinge 80%"), ACE-73, ACE-74 e ACE-75 e refaz a leitura dos
critérios que o diff toca (ACE-13/14, ACE-66, ACE-22, ACE-45/46, ACE-52). Decisão de origem: AD-013.
**Verificador**: subagente independente (autor ≠ verificador). Derivou a cobertura sozinho a partir da spec e do diff, sem confiar no relato do implementador.

**Result**: FAIL

Resumo: os quatro critérios (ACE-72, 73, 74, 75) têm evidência localizada em asserções que conferem o resultado definido na spec, e o gate está verde (lint, format,
typecheck, `pnpm test` com 1317 testes, `pnpm test:checagens` com 432). O veredito é FAIL por **uma lacuna de teste**: o mutante M17 (trocar a trava do `conta_entrar` de
"por e-mail" de volta para "por e-mail e IP") **sobreviveu**, e essa serialização é justamente a decisão (b) que a T67 tomou para a regra do ACE-74 valer sob
concorrência (tentativas paralelas de IPs diferentes contra a mesma conta). Nenhum teste a exercita. Uma sonda escrita pelo verificador (fora do repositório) passa
com o código atual e mata o mutante, então o teste que falta é pequeno. Nada mais bloqueia: 26 dos 29 mutantes morreram, e os 2 outros sobreviventes são equivalentes.

Convenção de caminhos: `api/test/` = `backend/api/test/`; `api/src/` = `backend/api/src/`; `mig/` = `backend/api/src/infraestrutura/db/migracoes/`; `e2e/` = `frontend/web/e2e/`.

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

Os critérios que esta volta não toca continuam valendo com as mesmas evidências; o gate completo desta volta as reexecuta.

---

## Conclusão das tarefas

69 tarefas (T1 a T69). Phase 12 (reteste de segurança, AD-013), todas marcadas em `tasks.md`:

| Tarefa | Estado | Conferência desta volta |
| --- | --- | --- |
| T65 "esqueci a senha" de conta não confirmada gasta a cota de cadastro | ✅ | migration `mig/1792843920000_conta-esqueci-nao-confirmada.sql` (função nova `link_pedir_com_confirmacao`; `link_pedir` redefinida com a mesma assinatura e colunas, chamando a nova), `repositorios/links.ts` (`pedirRecuperacao`), `rotas/sessao-recuperacao.ts`, `enviar-email.ts` (categoria `recuperacao_nao_confirmada`) |
| T66 teto de 20 e-mails por hora por IPv4 ou /48 | ✅ | migration `mig/1792843980000_conta-teto-emails-origem.sql` (tabela `pedidos_email_origem`, RLS com `FORCE`, só `pelada_backup` lê; `email_origem_registrar` com `SECURITY DEFINER`), `middlewares/limite-emails-origem.ts`, `app.ts` (`ROTAS_TETO_EMAILS_ORIGEM`), `chave-ip.ts` (`chaveDoIp48`), `LIMITE_EMAILS_IP_HORA` |
| T67 teto de 50 falhas por hora por conta | ✅ | migration `mig/1792844040000_conta-entrar-teto-conta.sql` (`conta_entrar` redefinida com a mesma assinatura e colunas; sem tabela nova) |
| T68 tempo máximo no Resend e na trava da cota | ✅ | `resend.ts` (`TEMPO_MAXIMO_RESEND_MS = 10_000`), migration `mig/1792844100000_conta-cota-trava.sql` (`ALTER FUNCTION email_cota_reservar(integer) SET lock_timeout = '2s'`), `cota-email.ts` (55P03 vira `trava`), `enviar-email.ts` |
| T69 runbook, THREAT-MODEL, seguranca.md | ✅ | `docs/runbook.md` (cota, teto por origem, Resend lento), `.md/THREAT-MODEL.md` (linha D), `seguranca.md` (seção "Correções do reteste") |

**Migrations**: `git diff --name-status cc844c5..HEAD -- mig/` mostra só quatro `A` (adicionadas); nenhuma migration aplicada foi editada. As funções `link_pedir` e
`conta_entrar` são redefinidas com `CREATE OR REPLACE` mantendo assinatura e colunas (rollback do Worker, G-14). RLS e grants: `pedidos_email_origem` com `ENABLE` e `FORCE`
(`mig/1792843980000...sql:18-19`), policy de leitura só para `pelada_backup` (`:20-21`), sem grant para a `pelada_app`; `email_origem_registrar_em` sem `SECURITY DEFINER` e
sem `EXECUTE` (`:46`), `email_origem_registrar` com `SECURITY DEFINER`, `search_path` fixo e `EXECUTE` só para `pelada_app` (`:50-57`); `link_pedir_com_confirmacao` idem
(`1792843920000...sql:9-12, 43-44`). O owner tem `BYPASSRLS` (`1792843320000_rls.sql:15`), o mesmo padrão de `envios_email_dia` (T63). Provas: `api/test/migracoes/conta-teto-emails-origem.test.ts:109-118`
(`42501` em SELECT/INSERT/DELETE e na função com momento explícito), `api/test/migracoes/rls.test.ts`, `roles.test.ts`, `funcoes-definer.test.ts`, `api/test/isolamento/casos.ts`
(`pedidos_email_origem: { acesso: 'sem-grant' }`) e `isolamento/contas.test.ts`.

**Integridade dos testes** (`git diff cc844c5..HEAD -- '*.test.*'` e arquivos de apoio): **2 linhas removidas** em todo o diff de testes, ambas em
`api/test/infraestrutura/chave-ip.test.ts` (o comentário de cabeçalho, ampliado para citar o ACE-73, e a linha de `import`, que ganhou `chaveDoIp48`). Todo o resto é
acréscimo: itens novos nas listas de tabelas (`rls.test.ts`, `roles.test.ts` duas vezes, `contas.test.ts` duas vezes, `migrar.test.ts`, `casos.ts`, `cenario-dois-grupos.ts`) e de
funções (`funcoes-definer.test.ts`: `email_origem_registrar` e `link_pedir_com_confirmacao`) e blocos `describe` novos (em `teto-emails.test.ts`, `email.test.ts`, `links.test.ts`).
Nenhum teste apagado, pulado, comentado ou enfraquecido; o relato do implementador confere.

**Contagem de testes** (volta 4 → volta 5): API 716 → 764 (+48, 53 arquivos), web 493 (igual), contrato 39, raiz 20, domínio 1, checagens 432 (igual). Nenhum a menos.

---

## Critérios de aceite ancorados na spec

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| ACE-72 (redação "atinge 80%") | `spec.md:295`: "atinge 80% … o 80º e-mail ainda sai, o 81º não"; "esqueci a senha" até 100%; zera na virada do dia. A lacuna de precisão da volta 4 está fechada | Rota (limite 10, teto 8): `api/test/rotas/teto-emails.test.ts:52-56` (total 7: a rota responde 201 e o total passa a 8, `lerTotalHoje() toBe(8)`), `:62` `recusado.status toBe(503)` com o total em 8 (`:65`); reenvio `:98-103` (`503` com 8) e `:105-109` (`200` com 7); convite `:119-121`; recuperação `:139-151` (8 e 9 enviam, 10 dá 503). Runbook diz "ao atingir 80%" (`docs/runbook.md`). Banco: `api/test/migracoes/conta-teto-emails.test.ts` (inalterado, fronteira `total < teto`). Mutantes M25 morto (90% no lugar de 80%: 13 falhas) | ✅ PASS |
| ACE-73a "esqueci a senha" de conta não confirmada gasta a cota de cadastro | com a cota de cadastro cheia (80%), conta **não** confirmada recebe 503 `email_indisponivel` sem enviar; conta confirmada ainda envia (reserva dos 20%) | Rota: `api/test/rotas/teto-emails.test.ts:176` `r.status toBe(503)`, `:177` `r.corpo toMatchObject(ERRO)`, `:178` `enviadosPara(naoConfirmada) toHaveLength(0)`, `:179` `lerTotalHoje() toBe(8)`, `:182` `(await esqueci(confirmada.email)).status toBe(200)`, `:184` total 9; `:189-193` abaixo de 80%: 200, 1 e-mail, total 8. Banco: `api/test/migracoes/conta-esqueci-nao-confirmada.test.ts:49-77` (`toEqual({ enviar: true, nome, confirmada: false })`, `confirmada: true`, e sem conta `{ enviar: false, nome: null, confirmada: false }`) e `:79-93` (`link_pedir` mantém as duas colunas e o intervalo de 60 s). Repositório: `api/test/repositorios/links.test.ts` (`links.pedirRecuperacao`, três casos). Mutantes M1, M2, M3, M4, M24 mortos | ✅ PASS |
| ACE-73b teto de 20 pedidos por hora por IPv4 ou /48 | mais de 20 e-mails (cadastro, reenvio, convite ou "esqueci a senha") por hora do mesmo IPv4 ou /48 recebem 429 `muitas_requisicoes`, sem enviar | Rota: `api/test/rotas/teto-emails-origem.test.ts:57-72` (20 pedidos das 4 rotas, cada um de um /64 diferente do mesmo /48: 201, 200, 201, 200), `:77` `r.status toBe(429)`, `:78` `r.corpo toMatchObject({ erro: { codigo: 'muitas_requisicoes' } })`, `:79` `enviadosPara(...) toHaveLength(0)`, `:80` `lerTotalHoje() toBe(antes)` (nem a cota do dia foi gasta), `:84` cadastro e `:91` convite do mesmo /48: `toBe(429)`, `:94-96` outro /48: `200` e 1 e-mail. IPv4: `:118` 20 pedidos `toBe(200)`, `:120-121` o 21º `429`, `:124` outro IPv4 `200`; mapeado `:131-132` `toBe(200)` e `:132` `429`. Rotas que não enviam não contam (`:102-111`, login 401). Função da chave: `api/test/infraestrutura/chave-ip.test.ts:52-78` (`chaveDoIp48`: mesmo /48 dá a mesma chave, /48 diferentes não, IPv4 inteiro, mapeado, `sem-ip`). Banco: `api/test/migracoes/conta-teto-emails-origem.test.ts:55-61` (20 passam, o 21º `false` e não é gravado), `:63-72` (janela de 1 h exata), `:121-139` (dez simultâneos com teto 4: exatamente 4). Mutantes M5, M6, M7a a M7d, M8, M9, M11, M12 mortos; M10 equivalente | ✅ PASS |
| ACE-74 50 falhas por hora por conta, de qualquer IP | 50 senhas erradas em 1 h para a mesma conta, de quaisquer IPs: as seguintes recebem 429 `bloqueado_temporariamente`, sem bcrypt, por 10 min; resposta igual para conta inexistente; a senha certa zera a contagem só fora do bloqueio | Rota: `api/test/rotas/entrar-teto-conta.test.ts:32` `r.status toBe(429)` com a senha certa e IP novo, `:33` `codigo: 'bloqueado_temporariamente'`, `:34` `Set-Cookie` nulo; `:50-52` conta inexistente: `semConta.status toBe(comConta.status)`, `semConta.corpo toEqual(comConta.corpo)`, `toBe(429)`; `:62` 49 falhas e a senha certa: `toBe(200)`. Banco (`api/test/migracoes/conta-entrar-teto-conta.test.ts`): `:88` 50 falhas de /64 e /48 diferentes `toMatchObject(BLOQUEADO)`; `:94-95` 49 falhas não bloqueiam e a 51ª é bloqueada; `:101` 49 e senha certa `ok`; `:108-115` a 9 min 50 s ainda bloqueado e `bloqueado_ate` entre 0 e 10 min, `:120` a 10 min 10 s liberado; `:126-127` 50 espalhadas por mais de 1 h não bloqueiam; `:133` e-mail sem conta `toMatchObject(BLOQUEADO)`; `:136-143` hash que faria o `crypt` falhar (a tentativa bloqueada não roda o bcrypt) e nada é gravado; `:146-163` a senha certa zera fora do bloqueio e não durante ele. Mutantes M13, M14a, M14b, M15, M18 mortos; M16 equivalente; **M17 sobreviveu (ver lacuna)** | ✅ PASS nas cláusulas da spec; ❌ lacuna de teste na serialização (abaixo) |
| ACE-75a fetch do Resend aborta em 10 s | o Resend sem resposta por 10 s é abortado e tratado como falha (503 `email_indisponivel`, sem gastar a cota) | `api/test/infraestrutura/email.test.ts:118` (aos 9.999 ms `resultado toBeUndefined()`), `:121` (aos 10.000 ms `resultado toBe('falhou')`), `:122` `signal.aborted toBe(true)`, `:124` o log não leva o token, `:131` `vi.getTimerCount() toBe(0)` (resposta dentro do prazo não deixa relógio armado). A falha do remetente vira 503 e desfaz a reserva pelo caminho já provado no ACE-52 (`api/test/rotas/conta-cadastro.test.ts:143`, `sessao-recuperacao.test.ts:59`) e `api/test/migracoes/conta-teto-emails.test.ts:86-92` (ROLLBACK não conta). Mutantes M19, M20, M21 mortos | ✅ PASS (a cadeia "provedor mudo, 503, cota intacta" é provada em partes; ver observação 5) |
| ACE-75b `lock_timeout` de 2 s na reserva | a reserva espera no máximo 2 s pela trava da linha do dia; acima disso, 503 `email_indisponivel` sem gastar cota | Banco: `api/test/migracoes/conta-cota-trava.test.ts:61` `resultado toBe('55P03')`, `:62` `decorrido toBeGreaterThanOrEqual(1_900)`, `:63` `toBeLessThan(4_000)` (duas variantes: linha do dia existente e linha sendo criada); `:75` `lock_timeout` volta a `'0'` depois da função. Rota: `api/test/rotas/teto-emails-trava.test.ts:44` `r.status toBe(503)`, `:45` `codigo: 'email_indisponivel'`, `:46` `decorrido toBeLessThan(5_000)`, `:47` `remetente.mensagens toHaveLength(0)`, `:48` o log não leva o e-mail, `:51` total igual a antes. Mutantes M22 e M23 mortos | ✅ PASS |

### Critérios tocados pelo diff e reexecutados (regressão)

| Critério | Ponto tocado | Evidência desta volta |
| --- | --- | --- |
| ACE-13/14 bloqueio do login por e-mail e IP | `conta_entrar` redefinida; a trava passou de (e-mail, IP) para e-mail | `api/test/migracoes/conta-entrar-e-sessao.test.ts` inteiro verde (28 testes com M17 aplicado, ou seja, também verdes com a trava antiga: ver a lacuna) |
| ACE-66 concorrência do par | trava agora é do e-mail | `api/test/migracoes/conta-entrar-e-sessao.test.ts:239-251` (duas falhas simultâneas do mesmo par contam 2) e `:255-282` (a quinta grava e a outra encontra o bloqueio) |
| ACE-22 e ACE-04 mesma resposta exista a conta ou não | "esqueci a senha" usa `pedirRecuperacao` | `api/test/rotas/sessao-recuperacao.test.ts` verde; ver observação 4 (oráculo residual com a cota entre 80% e 100%) |
| ACE-45/46 RLS e `sem-grant` | tabela nova `pedidos_email_origem` | `api/test/isolamento/casos.ts`, `isolamento/contas.test.ts`, `migracoes/rls.test.ts`, `roles.test.ts` |
| ACE-52 falha do remetente sem vazar o destino | 503 também pela trava | `api/test/rotas/teto-emails-trava.test.ts:48` |
| ACE-50 limitador por IP | sem mudança | `api/test/rotas/sessao-middleware.test.ts` verde |

**Status**: ✅ ACE-72, ACE-73 e ACE-75 provados com o resultado da spec. ACE-74 tem todas as cláusulas da spec provadas, mas a serialização por conta (decisão (b)) não tem prova: ❌ uma lacuna.

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` no diretório de rascunho do verificador, com `pnpm install --offline --frozen-lockfile` e o `.env` local copiado. Cada mutação foi aplicada
por script que exige exatamente uma ocorrência do trecho, rodou os testes que cobrem a regra (banco `conta-e-acesso-seguranca-db-1`, uma execução por vez) e restaurou o
arquivo a partir do original lido em memória. Ao fim, as pastas `node_modules` da cópia foram apagadas sem seguir links (a `node_modules` da árvore real conferida depois: 679 pacotes em
`.pnpm`, igual a antes), o worktree temporário removido (`git worktree remove --force`, `git worktree prune`; `git worktree list` sem ele) e `git status --porcelain` da árvore real
ficou **vazio, igual ao de antes**.

| # | Arquivo | Mutação (regra crítica) | Testes executados | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `enviar-email.ts` (`tetoDoEnvio`) | a categoria `recuperacao_nao_confirmada` usa a cota inteira | `rotas/teto-emails` | ✅ Morta (1 falha) |
| M2 | `rotas/sessao-recuperacao.ts` | a rota sempre usa a categoria `recuperacao` | idem | ✅ Morta (1 falha) |
| M3 | idem | `pedido.confirmada` invertido | idem | ✅ Morta (3 falhas) |
| M4 | `1792843920000_conta-esqueci-nao-confirmada.sql` | `confirmada` ignora o e-mail confirmado | `migracoes/conta-esqueci-nao-confirmada` | ✅ Morta (2 falhas) |
| M5 | `sessao/chave-ip.ts` | `chaveDoIp48` usa 4 grupos (/64) | `infraestrutura/chave-ip`, `rotas/teto-emails-origem` | ✅ Morta (4 falhas) |
| M6 | idem | `chaveDoIp48` usa 2 grupos (/32) | `infraestrutura/chave-ip` | ✅ Morta (1 falha) |
| M7a | `app.ts` | o convite sai da lista do teto por origem | `rotas/teto-emails-origem` | ✅ Morta (1 falha) |
| M7b | idem | o reenvio sai da lista | idem | ✅ Morta (1 falha) |
| M7c | idem | "esqueci a senha" sai da lista | idem | ✅ Morta (4 falhas) |
| M7d | idem | o cadastro (`/api/conta`) sai da lista | idem | ✅ Morta (1 falha) |
| M8 | `middlewares/limite-emails-origem.ts` | padrão 20 vira 21 | idem | ✅ Morta (3 falhas) |
| M9 | `1792843980000_conta-teto-emails-origem.sql` | `v_total >= p_teto` vira `>` (erro de um) | `migracoes/conta-teto-emails-origem` | ✅ Morta (6 falhas) |
| M10 | idem | janela do `count` de 1 h vira 2 h | idem | ➖ Sobreviveu, **equivalente** (ver nota) |
| M11 | idem | remove o `pg_advisory_xact_lock` da origem | idem | ✅ Morta (1 falha: os dez simultâneos) |
| M12 | `middlewares/limite-emails-origem.ts` | a chave usa o /64 e não o /48 | `rotas/teto-emails-origem` | ✅ Morta (4 falhas) |
| M13 | `1792844040000_conta-entrar-teto-conta.sql` | `>= 50` vira `>= 51` | `migracoes/conta-entrar-teto-conta` | ✅ Morta (6 falhas) |
| M14a | idem | o bloqueio dura 15 min e não 10 | idem | ✅ Morta (1 falha) |
| M14b | idem | só as falhas dos últimos 5 min bloqueiam | idem | ✅ Morta (1 falha) |
| M15 | idem | janela da conta de 1 h vira 2 h | idem | ✅ Morta (1 falha) |
| M16 | idem | o filtro externo perde `f.momento > v_ultimo_sucesso_conta` | idem | ➖ Sobreviveu, **equivalente** (ver nota) |
| **M17** | idem | **a trava volta a ser (e-mail, IP)** | `migracoes/conta-entrar-teto-conta`, `migracoes/conta-entrar-e-sessao` (28 testes) | ❌ **SOBREVIVEU** |
| M18 | idem | a contagem da conta só soma as falhas do mesmo IP | `migracoes/conta-entrar-teto-conta` | ✅ Morta (6 falhas) |
| M19 | `email/resend.ts` | tempo máximo de 10 s vira 30 s | `infraestrutura/email` | ✅ Morta (1 falha) |
| M20 | idem | o `fetch` perde o `signal` | idem | ✅ Morta (1 falha) |
| M21 | idem | o `clearTimeout` some | idem | ✅ Morta (1 falha) |
| M22 | `1792844100000_conta-cota-trava.sql` | `lock_timeout` de 2 s vira 8 s | `migracoes/conta-cota-trava` | ✅ Morta (2 falhas) |
| M23 | `repositorios/cota-email.ts` | o código 55P03 deixa de ser reconhecido | `rotas/teto-emails-trava` | ✅ Morta |
| M24 | `repositorios/links.ts` | `pedirRecuperacao` devolve `confirmada: true` sempre | `repositorios/links`, `rotas/teto-emails` | ✅ Morta (3 falhas) |
| M25 | `enviar-email.ts` | teto de 80% vira 90% | `rotas/teto-emails` | ✅ Morta (13 falhas) |
| M17p | idem M17, com a sonda do verificador | trava (e-mail, IP) | sonda abaixo | ✅ Morta (a sonda falha com a mutação e passa com o código atual) |

**M10, equivalente.** Em `email_origem_registrar_em`, o `DELETE` que precede a contagem já apaga os pedidos com `momento <= p_momento - 1 hora`, então a janela do `count`
(`> p_momento - 1 hora`) é redundante: a mutação não muda nenhum resultado observável.

**M16, equivalente.** O filtro `f.momento > v_ultimo_sucesso_conta` da consulta externa é redundante com o da subconsulta: uma falha anterior ao último sucesso tem zero falhas
posteriores a ele até ela mesma, logo nunca chega a 50.

**M17, lacuna real.** A migration (`1792844040000...sql:7-8, 38`) trava `'entrar|' || v_email` justamente para que tentativas simultâneas do mesmo e-mail, de IPs diferentes, sejam
avaliadas uma depois da outra. Com a trava antiga (por e-mail e IP), 49 falhas e cinco tentativas simultâneas de IPs diferentes deixam as cinco passarem pela verificação do
bloqueio (todas leem 49), e o ACE-74 ("recusar as tentativas seguintes") deixa de valer sob rajada: o atacante com muitos IPs ultrapassa o teto. Os testes existentes só têm
concorrência do **mesmo par** (`conta-entrar-e-sessao.test.ts:239-282`, ACE-66) e o teste do ACE-74 grava as 50 falhas como owner, em série. Sonda do verificador, fora do
repositório (no rascunho do verificador, `conta-entrar-paralelo.test.ts`): 49 falhas do e-mail, cinco chamadas simultâneas a `conta_entrar` com senha errada e hashes de IP diferentes,
esperando `['bloqueado','bloqueado','bloqueado','bloqueado','invalida']`. Resultado: **passa** com o código atual e **falha** com a trava de M17 (as cinco voltam `invalida`).

**Profundidade**: P0 completo (autenticação, sessão e dados de conta; mais de 5 mutações manuais cobrindo os ramos das regras novas).
**Resultado**: 29 mutantes injetados; 26 mortos, 2 sobreviventes **equivalentes** (M10, M16) e **1 sobrevivente real (M17)**. ❌ FAIL.

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ (`chavePorPrefixo` serve a `chaveDoIp` e `chaveDoIp48`; `limiteEmailsOrigem` é um middleware aplicado a quatro rotas) |
| Mudanças cirúrgicas | ✅ (38 arquivos, todos nos `Where` de T65 a T69; `vitest.config.ts` e `playwright.config.ts` só ganham `LIMITE_EMAILS_IP_HORA` alto) |
| Segue os padrões existentes | ✅ (migrations aditivas com assinatura preservada, G-14; tabela nova com RLS `FORCE`, só `pelada_backup` lê; funções `SECURITY DEFINER` com `search_path` fixo; IP só como SHA-256) |
| Testes mapeiam critérios e não são rasos | ⚠️ (cada teste novo cita ACE-72 a 75; 26 mutantes mortos; M17 sobrevive) |
| Resultado asserido bate com a spec | ✅ (429 `muitas_requisicoes`, 429 `bloqueado_temporariamente`, 503 `email_indisponivel`, 20, 50, 10 min, 10 s, 2 s, 80% e 100% conferidos pelos valores) |
| Nenhum teste órfão | ✅ |
| Testes existentes alterados | ✅ só o cabeçalho e o `import` de `chave-ip.test.ts` (2 linhas), com acréscimo |
| Configuração | ✅ `LIMITE_EMAILS_IP_HORA` em `.env.example` (formato, padrão e se é segredo), `api/src/entrada/env.ts`, `vitest.config.ts` (`bindings`) e `e2e/playwright.config.ts` (`--var`) |
| Guias seguidos | `CLAUDE.md` da raiz (migration aditiva, rota nova em `casos.ts`, `.env.example`), `.md/GUARDRAILS.md` G-14 |

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
- [ ] **Rajada simultânea de IPs diferentes contra a mesma conta**: sem teste (M17)

---

## Gate

Comando: etapas do gate Build de `tasks.md` que o pedido incluiu (sem `build`, e2e e visual), uma execução por vez no banco `conta-e-acesso-seguranca-db-1`.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0 na 1ª execução: raiz 20, domínio 1, contrato 39, web 493 (54 arquivos), API 764 (53 arquivos) = 1317 testes, 0 falhas, 0 pulados. Nenhum teste de tela estourou o tempo desta vez |
| `pnpm test:checagens` | ✅ exit 0: 432 testes (21 arquivos), 0 falhas, 0 pulados |
| `build`, `e2e`, `visual`, `gitleaks`, `checar-tokens.py` | não rodados (fora do pedido desta volta; esta volta não toca o web) |

---

## Observações que não bloqueiam

1. **Mensagem do bloqueio (decisão (d))**: o 429 do login diz "Tente de novo em 15 minutos" (`api/src/entrada/rotas/sessao.ts:33` e `web/telas/entrar/Entrar.tsx:18`) também no bloqueio da conta, que dura 10 min. A spec do ACE-74 não define o texto, então é uma lacuna de precisão, não uma falha; a mensagem é conservadora e igual nos dois bloqueios (o que ajuda a não distinguir os casos). Convém dizer na spec que o texto é único.
2. **Lacuna de precisão ACE-73**: a spec diz "pede mais de 20 e-mails". A implementação conta **pedidos** às quatro rotas (`POST`), tenha conta ou não o e-mail, e antes da validação do corpo, e conta mesmo o pedido que a rota depois recusa (409, 503 etc.). É a leitura segura (a resposta não revela nada) e está no comentário do middleware, mas a spec poderia dizer "pedidos".
3. **Chave `sem-ip`**: pedidos sem `CF-Connecting-IP` dividem a mesma chave. Em produção a Cloudflare sempre envia o cabeçalho; no `pnpm dev` local (sem o cabeçalho) o padrão de 20 por hora vale para todos juntos. Por isso os testes e o e2e sobem o limite. Documentado no `.env.example`; vale uma frase no README.
4. **Oráculo residual (ACE-22 e ACE-04)**: com o total do dia entre 80% e 100% da cota, "esqueci a senha" de conta **não confirmada** responde 503, e de e-mail sem conta, 200. Isso revela que a conta existe e que não está confirmada, só enquanto a cota está nessa faixa. É consequência literal do ACE-73 (a spec manda contar na cota de cadastro) e o THREAT-MODEL não o registra. Ver pergunta ao usuário.
5. **Cadeia do ACE-75a**: nenhum teste de rota usa um remetente que demora 10 s e confere 503 e o contador; a cadeia é provada em partes (timeout do `fetch` → `falhou`; `falhou` → 503; ROLLBACK não conta). Mesma observação da volta 4 (item 4).
6. **Bloqueio remoto curto (decisão (b))**: o teto por conta permite que alguém trave o login de uma vítima por 10 min de cada vez (50 senhas erradas por hora). O autor registrou o risco no `seguranca.md` e no THREAT-MODEL, em linha com o AD-013. A serialização por e-mail também enfileira, na conta atacada, os logins legítimos atrás dos bcrypts do atacante; o limitador de 10 por minuto por IP e a rejeição rápida (sem bcrypt) depois de 50 falhas limitam o efeito.
7. **Segurança**: o `seguranca.md` diz que as correções do reteste ainda não foram reverificadas pelo `auditor-seguranca`; fica para a próxima rodada de segurança.
8. **Rollback do Worker**: as migrations são aditivas e mantêm assinatura e colunas de `link_pedir` e `conta_entrar`; um Worker anterior continua funcionando, sem o teto por origem nem a categoria nova.

---

## Atualização da rastreabilidade

| Requisito | Estado anterior | Novo estado |
| --- | --- | --- |
| ACE-72 | ✅ Verificado (com lacuna de precisão da fronteira) | ✅ Verificado (redação "atinge"; lacuna fechada) |
| ACE-73, ACE-75 | Pending | ✅ Verificado (T65, T66, T68; M1 a M12, M19 a M24 mortos) |
| ACE-74 | Pending | ⚠️ Cláusulas da spec provadas (T67); serialização sob concorrência sem teste (M17). Fica pendente até o teste entrar |
| ACE-01 a ACE-71 | ✅ Verificado (voltas 3 e 4) | ✅ Sem mudança (regressão no gate) |

(`spec.md` não foi alterado pelo verificador; a tabela de rastreabilidade da spec ainda mostra ACE-73 a ACE-75 como `Pending`, o que o autor atualiza na integração.)

---

## Resumo

**Geral**: ❌ Não integrar ainda: uma lacuna de teste, pequena, no ACE-74.

**Verificação ancorada na spec**: ACE-72, 73 e 75 provados com o resultado da spec; ACE-74 com todas as cláusulas da spec provadas, mais uma decisão de projeto (trava por e-mail) sem prova.
**Sensor**: 26 de 29 mutantes mortos; 2 equivalentes (M10, M16); 1 real (M17).
**Gate**: lint, format, typecheck, `pnpm test` (1317) e `test:checagens` (432) verdes; e2e e visual não rodados por pedido.

**Lacuna em ordem de gravidade**:

1. Rajada simultânea de IPs diferentes contra a mesma conta não tem teste (M17), `1792844040000_conta-entrar-teto-conta.sql:38` — ACE-74 — sem evidência. Correção sugerida (tarefa T70): em
   `api/test/migracoes/conta-entrar-teto-conta.test.ts`, 49 falhas do e-mail, cinco chamadas simultâneas a `conta_entrar` com senha errada e `ip_hash` diferentes, esperando exatamente uma
   `invalida` e quatro `bloqueado` (a sonda do verificador faz isto e já passa com o código atual).

**Próximos passos**: o autor acrescenta o teste (T70) e o verificador reverifica só o M17 (volta 6); depois, e2e e visual na checagem final antes de integrar.

## Perguntas para o usuário

1. **O oráculo de "esqueci a senha" entre 80% e 100% da cota (observação 4) é aceitável?** Hoje, nessa faixa, conta não confirmada recebe 503 e e-mail sem conta recebe 200.
   - (a) Aceitar e registrar no THREAT-MODEL como resíduo do ACE-73 (Recomendado: o risco é pequeno e exige a cota nessa faixa).
   - (b) Responder 200 nos dois casos sem enviar (a conta não confirmada fica sem e-mail e sem aviso, mas a resposta não revela nada; muda o ACE-73).
   - (c) Contar o pedido de e-mail sem conta na mesma cota, para igualar a resposta (gasta cota sem enviar e abre outro vetor de esgotamento).
2. **A mensagem "Tente de novo em 15 minutos" deve virar um texto que valha para os dois bloqueios (observação 1)?**
   - (a) Manter e registrar na spec que o texto é único e conservador (Recomendado: não distingue os dois bloqueios).
   - (b) Trocar por "Tente de novo em alguns minutos" nas duas rotas e na tela (muda testes de texto, exige aprovação).
