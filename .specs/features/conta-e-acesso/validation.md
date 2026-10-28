# Conta e acesso — Validação (volta 4: correções de segurança T57 a T64)

**Data**: 2026-10-28
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `8df20cc..db0412e` (branch `fix/conta-e-acesso-seguranca`, 11 commits: T57 a T64, a retomada e o planejamento; 52 arquivos, 1687 linhas
a mais e 100 a menos). Esta volta verifica o intervalo todo das correções dos médios de segurança (AD-012) e refaz a leitura dos critérios tocados
(ACE-06 a ACE-08, ACE-50 a ACE-52, ACE-13, ACE-26 a ACE-30) e dos novos (ACE-70, ACE-71, ACE-72). `seguranca.md` tem alteração não commitada do auditor; não foi tocado.
**Verificador**: subagente independente (autor ≠ verificador). Derivou a cobertura sozinho a partir da spec e do diff.

**Result**: PASS

Resumo: os três critérios novos (ACE-70, ACE-71, ACE-72) e o ACE-06 reescrito têm evidência localizada em asserções que conferem o resultado definido na spec.
Gate verde na árvore real: lint, format, typecheck, `pnpm test` (1269 testes, 0 falhas, na última execução) e `pnpm test:checagens` (432 testes). Sensor: 25
mutações nas regras novas, 24 mortas e 1 sobreviveu, **equivalente** (o valor que a mutação muda nunca é lido; ver abaixo). Observações que não bloqueiam: uma
lacuna de precisão da spec no ACE-72 (limite de 80% inclusivo ou exclusivo), uma cláusula do ACE-70 sem prova própria ("não revela se a conta existe") e
dois testes de tela que estouram o tempo padrão de 5 s quando a máquina está carregada (flake, sem relação com o diff). E2E e visual não foram rodados, por pedido.

Convenção de caminhos: `api/test/` = `backend/api/test/`; `web/` = `frontend/web/src/`; `e2e/` = `frontend/web/e2e/`.

---

## Resumo das voltas anteriores

- **Volta 1 (FAIL)**: gate verde, 31 mutações (27 mortas). Quatro lacunas: M17 e M18 (policies de escrita de `sessoes` e `contas` abertas, ACE-43 e
  ACE-44), F1 (ligação entre sessão expirada e `/entrar`, ACE-20), M26 (intervalo de 60 s só testado em 0 s e 61 s, ACE-51) e a t25 fora da
  comparação visual (ACE-54). Corrigidas em T45 a T52. Relatório completo no histórico do git (`a8ec48f`).
- **Volta 2 (FAIL)**: as quatro lacunas anteriores fechadas; 19 mutações, 17 mortas. Sobreviveram N7 e N16 (nenhum teste de rota conferia o valor de
  `termos_versao` gravado em `POST /api/conta` e em `POST /api/convites/cadastrar`; ACE-01 e a cláusula "é a mesma gravada no aceite" do ACE-58) e achou-se o
  byte inválido em três mockups t25. Corrigidas em T53 a T56. Relatório completo no histórico do git (`62aa021` e `45e7dca`).
- **Volta 3 (PASS)**: 69 de 69 critérios com o resultado da spec provados (1 lacuna de precisão, ACE-56, não bloqueante); gate verde (1203 + 432 + 15 testes e 84
  comparações visuais); `gitleaks` sem vazamento; 9 mutações, 9 mortas. A tabela completa dos 69 critérios com `arquivo:linha` está no histórico do git
  (`04cdca1`); os critérios que esta volta não toca continuam valendo com as mesmas evidências, e o gate completo desta volta as reexecuta (716 testes de API e 493 de web).

---

## Conclusão das tarefas

64 tarefas (T1 a T64). Phase 11 (correções da auditoria, AD-012), tudo marcado em `tasks.md`:

| Tarefa | Estado | Conferência desta volta |
| --- | --- | --- |
| T57 spec: ACE-06 reescrito, ACE-70 a ACE-72 | ✅ | `spec.md` (ACE-06 em 81; ACE-70 a ACE-72 nas linhas 293 a 295); `design.md` cita ACE-70 nas duas rotas. Os IDs 60 a 62 já existiam (termos e script do dono) e não foram tocados; as regras novas entraram como 70 a 72 |
| T58 `link_confirmar` sem sessão | ✅ | migration aditiva `1792843740000_conta-confirmar-sem-sessao.sql` (mesma assinatura, segundo parâmetro sem uso); nenhuma migration aplicada foi editada |
| T59 rota e tela levam a `/entrar` sem cookie | ✅ | `conta-cadastro.ts` (confirmar sem `definirCookieSessao`), `Confirmar.tsx`, `Entrar.tsx` |
| T60 limitador por IP em senha e exclusão | ✅ | `app.ts`: `ROTAS_LIMITE_ENTRAR` ganha `/api/conta/senha` e `/api/conta/excluir` |
| T61 bloqueio por conta | ✅ | migration `1792843800000_conta-senha-bloqueio.sql` + `conta-minha.ts` (transação própria) |
| T62 /64 do IPv6 | ✅ | `infraestrutura/sessao/chave-ip.ts`, usado por `limite-taxa.ts` e `sessao.ts` |
| T63 teto de e-mails | ✅ | migration `1792843860000_conta-teto-emails.sql`, `cota-email.ts`, `enviar-email.ts`, `.env.example` |
| T64 runbook e THREAT-MODEL | ✅ | `docs/runbook.md` (cota do Resend), `.md/THREAT-MODEL.md:63` (linha D com as rotas novas, os critérios e o Turnstile adiado) |

**Integridade dos testes** (`git diff 8df20cc..HEAD -- '*.test.*' '*.spec.ts'`): 31 linhas removidas em 19 arquivos de teste; todas são decorrentes do ACE-06
reescrito (confirmar deixa de abrir sessão) ou do ACE-70 (as duas rotas deixam de ser "com sessão que não passa pelo `LIMITE_ENTRAR`"), cada uma com comentário
de motivo e substituída por asserção igual ou mais forte:

- `api/test/rotas/conta-cadastro.test.ts:165-176`: saiu `GET /api/sessao` 200 com o cookie da confirmação; entrou `Set-Cookie` nulo (`:173`), `GET /api/sessao` 401 (`:175`) e entrar 200 (`:177`).
- `api/test/migracoes/conta-cadastro-e-links.test.ts:172-232`: saiu a sessão de 12 h; entrou `sessoesDe(...) toEqual([])` e a prova de que o hash de sessão passado não vira linha; casos novos (segundo parâmetro nulo; link inexistente sem sessão).
- `api/test/repositorios/links.test.ts:65-95`: assinatura de `links.confirmar` sem o hash; asserções novas de link consumido e sem sessão; caso novo de link vencido.
- `api/test/rotas/sessao-middleware.test.ts:59-64, 95-108`: as duas rotas saíram da lista "com sessão" e entraram em `ROTAS_SEM_SESSAO`, com um teste novo que prova 429 sem tocar no banco (`sonda.acessos() toBe(0)`).
- `web/telas/confirmar/Confirmar.test.tsx:21-72` (pathname `/entrar`, `search` `?aviso=email-confirmado`, nenhuma chamada a `/api/sessao`) e `e2e/acesso.spec.ts:106-118`: pelo ACE-06 novo. A aprovação dessas mudanças está registrada em `STATE.md` (decisões das correções) e nas tarefas T57/T59.
- Nenhum teste apagado, pulado, comentado ou enfraquecido; `git grep` de `.skip/.only/.todo/xit/xdescribe` sem ocorrência real (os acertos são `process.exit(`).

**Contagem de testes** (volta 3 → volta 4): API 651 → 716 (+65), web 492 → 493 (+1), contrato 39, raiz 20, domínio 1, checagens 432 (igual). Nenhum a menos.

---

## Critérios de aceite ancorados na spec

### Critérios novos e reescritos

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| ACE-06 (reescrito) confirmar em 24 h | e-mail confirmado; **sem sessão**; vai a `/entrar` com "E-mail confirmado. Entre com a sua senha." | Banco: `api/test/migracoes/conta-cadastro-e-links.test.ts:181-188` (a 23,9 h) `email_confirmado_em toBeInstanceOf(Date)`, `link(token).usado toBe(true)`, `sessoesDe(conta_id) toEqual([])`, nenhuma linha em `sessoes` para o hash passado; `:190-203` com o 2º parâmetro nulo. Repositório: `api/test/repositorios/links.test.ts:66-76` `conta.rows[0] toEqual({ ok: true })`, `link.rows toEqual([{ usado: true }])`, `rowCount toBe(0)`. Rota: `api/test/rotas/conta-cadastro.test.ts:172-177` `status toBe(204)`, `headers.get('Set-Cookie') toBeNull()`, `GET /api/sessao` 401, entrar 200 (prova que o e-mail ficou confirmado). Tela: `web/telas/confirmar/Confirmar.test.tsx:40-42` `pathname toBe('/entrar')`, `search toBe('?aviso=email-confirmado')`, nenhuma chamada a `/api/sessao`; `web/telas/entrar/Entrar.test.tsx:135` `getByText('E-mail confirmado. Entre com a sua senha.') toBeVisible()`. E2E (não rodado): `e2e/acesso.spec.ts:109-115`. Mutantes M16 a M19 mortos | ✅ PASS |
| ACE-07 (ajustado) link inválido | 410 `link_invalido`, sem sessão | `api/test/rotas/conta-cadastro.test.ts:180-191` `status toBe(410)`, `codigo: 'link_invalido'`, `Set-Cookie` nulo; `api/test/repositorios/links.test.ts:78-95` (inexistente, usado e vencido: nulo, e-mail sem confirmar, sem sessão); `api/test/migracoes/conta-cadastro-e-links.test.ts:205-212` (a 24 h: nulo) | ✅ PASS |
| ACE-70a bloqueio por conta | 5 falhas da senha atual na mesma conta em 15 min: as seguintes recebem o erro de bloqueio (429 `bloqueado_temporariamente`) sem rodar o bcrypt, até 15 min depois da quinta; a senha certa antes disso zera a contagem; o bloqueio é por conta | Banco: `api/test/migracoes/conta-senha-bloqueio.test.ts:123-133` (6ª tentativa com a senha certa: `trocarSenha toBeNull()`, retrato da conta/sessões/vínculos igual, senha antiga ainda entra), `:135-144` (`excluir toBe('bloqueado')`), `:146-158` (hash que faria o `crypt` falhar: o controle lança `invalid salt`, a tentativa bloqueada responde o bloqueio, logo o bcrypt não roda), `:160-166` (`falhasDa toBe(5)`: tentativa bloqueada não conta), `:168-172` (4 falhas não bloqueiam), `:174-181` (acerto zera: `falhasDa toBe(0)` e mais 4 falhas não bloqueiam), `:183-198` (acerto recusado por única admin também zera), `:200-208` (14 min: bloqueado; 15 min: `trocarSenha toBe(true)`), `:210-222` (prazo da quinta falha; 5 falhas espalhadas não bloqueiam), `:224-230` (troca e exclusão somam), `:232-240` (outra conta não é afetada), `:250-302` (concorrência: duas falhas simultâneas contam 2; a quinta e a seguinte). Repositório: `api/test/repositorios/contas.test.ts:217-235` `toBe('bloqueado')` e `toEqual({ resultado: 'bloqueado', grupos: [] })`. Rota: `api/test/rotas/conta-minha.test.ts:138-153` `troca.status toBe(429)`, `corpo toMatchObject({ erro: { codigo: 'bloqueado_temporariamente' } })`, `exclusao.status toBe(429)`, sem `Set-Cookie`, senha antiga ainda entra; `:155-165` (5 falhas na exclusão bloqueiam também a troca; `outra` conta troca com 204). Mutantes M10 a M15, M24 e M25 mortos | ✅ PASS |
| ACE-70b limitador por IP nas duas rotas | as duas rotas passam pelo limitador por IP do login e respondem 429 antes do bcrypt | `api/test/rotas/sessao-middleware.test.ts:83-92` (`it.each(ROTAS_SEM_SESSAO)` com `/api/conta/senha` e `/api/conta/excluir`: `status toBe(429)`, `codigo: 'muitas_requisicoes'`, `entrar.chaves toHaveLength(1)`) e `:95-108` (`status toBe(429)` e `sonda.acessos() toBe(0)`: nem sessão nem bcrypt rodam). Mutante M9 morto | ✅ PASS |
| ACE-70c "a resposta não revela se a conta existe" | bloqueio por conta sem revelar a existência | As rotas exigem sessão, então não há consulta por e-mail que sirva de oráculo; a ramificação "conta inexistente" do banco devolve `false` (igual a senha errada) e não tem teste próprio | ⚠️ Lacuna de precisão da spec |
| ACE-71 IPv6 /64 | chave do limitador por IP e `ip_hash` do bloqueio por e-mail e IP usam o /64; IPv4 inteiro; sem IP, `sem-ip` | Função: `api/test/infraestrutura/chave-ip.test.ts:7` `chaveDoIp('203.0.113.7') toBe('203.0.113.7')`, `:12-14` `'sem-ip'` (undefined, null, vazio), `:18` mesmo /64 dá a mesma chave, `:22-23` /64 diferentes dão chaves diferentes, `:27-32` forma compactada/caixa/zeros, `:36-38` expansão do `::`, `:42-43` IPv4 mapeado vale como IPv4. Limitador: `api/test/rotas/limite-taxa.test.ts:50-58` (mesmo /64: o 2º recebe 429, outro /64 não, `chaves[0] toBe(chaves[1])`; sem IP: `:91` `chaves toEqual(['sem-ip'])`). `ip_hash`: `api/test/rotas/sessao.test.ts:92-119` (5 falhas de endereços do mesmo /64, escritos de formas diferentes, somam: `mesmo64.status toBe(429)`; outro /64: `toBe(200)`). Mutantes M6, M7, M8 e M23 mortos | ✅ PASS |
| ACE-72 teto diário de e-mails | acima de 80% de `LIMITE_EMAILS_DIA` (padrão 100), cadastro, reenvio e convite respondem 503 `email_indisponivel` sem enviar; "esqueci a senha" envia até 100%; o contador zera na virada do dia de São Paulo | Rota (limite 10): `api/test/rotas/teto-emails.test.ts:50-74` cadastro: total 7 envia (201, total passa a 8), total 8 dá `status toBe(503)`, `corpo toMatchObject({ erro: { codigo: 'email_indisponivel' } })`, nada enviado, conta não criada, log sem o e-mail; `:76-88` e-mail que já tem conta recebe o mesmo 503 do cadastro novo e nenhum aviso (ACE-04); `:91-110` reenvio; `:113-129` convite (503 e o convite não fica); `:132-155` recuperação: total 8 e 9 enviam (200), total 10 dá 503; `:158-173` `LIMITE_EMAILS_DIA=50` (teto 40 e 50); `:175-187` valor ausente, vazio, texto, zero, negativo e decimal voltam ao padrão 100; `:191-204` regras puras. Banco: `api/test/migracoes/conta-teto-emails.test.ts:42-48` reserva até o teto e recusa o seguinte, `:50-59` 80% e 100% convivem, `:66-76` zera na virada do dia de São Paulo (23:59 e 00:01 de SP, mesmo dia UTC), `:78-84` não zera na virada do dia UTC, `:86-92` o envio que falha (ROLLBACK) não conta, `:95-121` a `pelada_app` só executa `email_cota_reservar`, `:124-181` concorrência (dez simultâneos com teto 4: exatamente 4). Mutantes M1 a M5, M20 a M22 mortos | ✅ PASS (ver lacuna de precisão abaixo) |
| ACE-72 "passa de 80%" (fronteira) | "o total passa de 80%": a spec não diz se o 80º e-mail ainda sai | A implementação envia até o 80º e barra o 81º (`teto = floor(limite × 0,8)`, reserva com `total < teto`); `api/test/rotas/teto-emails.test.ts:98-103` (total 8 de 10 já dá 503, e total 7 envia). Uma leitura literal de "passa de 80%" poderia deixar sair o 81º | ⚠️ Lacuna de precisão da spec |

### Critérios tocados pelo diff e reexecutados (regressão)

Todos reexecutados no gate desta volta (API 716 testes, web 493), com as evidências da volta 3 (`04cdca1`) intactas; citados aqui só os pontos que o diff alterou:

| Critério | Ponto tocado | Evidência desta volta |
| --- | --- | --- |
| ACE-04 aviso de cadastro duplicado | passa pelo mesmo teto do cadastro novo (categoria `cadastro`) | `api/test/rotas/teto-emails.test.ts:76-88` `duplicado.corpo toEqual(novo.corpo)`; M21 morto |
| ACE-13/14 bloqueio do login | `ip_hash` agora pela `chaveDoIp` | `api/test/rotas/sessao.test.ts:71-90` (IPv4 inalterado) e `:92-119` (IPv6) |
| ACE-26 a ACE-30 troca e exclusão | agora em transação própria com a conta da sessão | `api/test/rotas/conta-minha.test.ts` inteiro (troca 204, atual 401, exclusão, única admin 409, senha errada 401); M15 morto |
| ACE-49/50 CSRF e `LIMITE_ENTRAR` | duas rotas a mais na lista | `api/test/rotas/sessao-middleware.test.ts:64-92` |
| ACE-52 falha do remetente | 503 também pelo teto, sem vazar o destino | `api/test/rotas/teto-emails.test.ts:67-68` `log not.toContain(barrado)` |
| ACE-45/46 RLS e `sem-grant` das tabelas de conta | duas tabelas novas (`falhas_senha_atual`, `envios_email_dia`) | `api/test/isolamento/casos.ts:176-179`, `api/test/isolamento/contas.test.ts:68-79`, `:194-195`, `api/test/migracoes/rls.test.ts:30-41`, `api/test/migracoes/roles.test.ts:190-193`; as tabelas novas têm RLS com `FORCE` e só a `pelada_backup` lê |
| ACE-60 a 62 (termos e script do dono) | não alterados pelo diff | `backend/scripts/test/dono.test.ts` e `web/telas/termos/*.test.tsx` passaram no gate |

**Status**: ✅ ACE-06, ACE-70, ACE-71 e ACE-72 provados com o resultado definido na spec. ⚠️ Duas lacunas de precisão da spec, não bloqueantes: (a) ACE-72, fronteira de
"passa de 80%"; (b) ACE-70, a cláusula "não revela se a conta existe" não tem consulta que a exercite. (A lacuna anterior, ACE-56, segue como na volta 3.)

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` na pasta de rascunho do verificador, com `pnpm install --offline --frozen-lockfile` e o `.env` local copiado.
Cada mutação foi aplicada por script que exige exatamente uma ocorrência do trecho, rodou os testes que cobrem a regra (banco `conta-e-acesso-seguranca-db-1`,
uma execução por vez) e restaurou o arquivo a partir do original lido em memória. Ao fim, a cópia foi removida (as 2118 junctions de `node_modules` sem seguir
os links), `git worktree prune` limpo e `git worktree list` sem ela. `git status --porcelain` da árvore real: só ` M .specs/features/conta-e-acesso/seguranca.md`
(a alteração do auditor), idêntico antes e depois. O resíduo da tentativa anterior (um diretório `mut` sem registro no git, com `node_modules`) foi removido do mesmo modo.

| # | Arquivo | Mutação (regra crítica) | Testes executados | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `enviar-email.ts` (`tetoDoEnvio`) | a recuperação perde a reserva (usa 80%) | `rotas/teto-emails` | ✅ Morta (3 falhas) |
| M2 | `enviar-email.ts` (`tetoDoEnvio`) | 80% vira 90% | idem | ✅ Morta (12 falhas) |
| M3 | `enviar-email.ts` (`enviarModelo`) | remove a reserva do teto (`if (false)`) | idem | ✅ Morta (12 falhas) |
| M4 | `1792843860000_conta-teto-emails.sql` | `e.total < p_teto` vira `<=` (erro de um) | `migracoes/conta-teto-emails` | ✅ Morta (7 falhas) |
| M5 | idem | dia em UTC no lugar de São Paulo | idem | ✅ Morta (2 falhas: as duas viradas de dia) |
| M6 | `sessao/chave-ip.ts` | prefixo de 5 grupos no lugar de 4 (/80) | `infraestrutura/chave-ip` | ✅ Morta (3 falhas) |
| M7 | `rotas/sessao.ts` | `ip_hash` sem o /64 | `rotas/sessao` | ✅ Morta (1 falha: o teste IPv6) |
| M8 | `middlewares/limite-taxa.ts` | chave do limitador sem o /64 | `rotas/limite-taxa` | ✅ Morta (1 falha) |
| M9 | `app.ts` | `/api/conta/excluir` sai do limitador por IP | `rotas/sessao-middleware` | ✅ Morta (2 falhas) |
| M10 | `1792843800000_conta-senha-bloqueio.sql` | bloqueio só na 6ª falha (`>= 6`) | `conta-senha-bloqueio`, `rotas/conta-minha` | ✅ Morta (11 falhas) |
| M11 | idem (`conta_senha_bloqueada_ate`) | `+ interval '15 minutes'` vira `'10 minutes'` | `conta-senha-bloqueio` | ➖ Sobreviveu, **equivalente** (ver nota) |
| M12 | idem (`conta_trocar_senha`) | o acerto não zera a contagem | idem | ✅ Morta (1 falha) |
| M13 | idem (`conta_excluir`) | a exclusão ignora o bloqueio | `conta-senha-bloqueio`, `repositorios/contas` | ✅ Morta (6 falhas) |
| M14 | idem (`conta_trocar_senha`) | a troca não grava a falha | `conta-senha-bloqueio` | ✅ Morta (9 falhas) |
| M15 | `rotas/conta-minha.ts` | a falha corre na transação da requisição (que o 401 desfaz) | `rotas/conta-minha` | ✅ Morta (2 falhas) |
| M16 | `1792843740000_conta-confirmar-sem-sessao.sql` | confirmar não marca o e-mail | `repositorios/links`, `conta-cadastro-e-links`, `rotas/conta-cadastro` | ✅ Morta (6 falhas) |
| M17 | `rotas/conta-cadastro.ts` | confirmar devolve `Set-Cookie` | `rotas/conta-cadastro` | ✅ Morta (1 falha) |
| M18 | `Confirmar.tsx` | confirmar leva a `/app` | `Confirmar.test.tsx` | ✅ Morta (3 falhas) |
| M19 | `Entrar.tsx` | o texto do aviso muda | `Entrar.test.tsx` | ✅ Morta (1 falha) |
| M20 | `rotas/sessao-recuperacao.ts` | "esqueci a senha" entra na cota de 80% | `rotas/teto-emails` | ✅ Morta (2 falhas) |
| M21 | `rotas/conta-cadastro.ts` | cadastro e aviso duplicado entram na cota de 100% | idem | ✅ Morta (9 falhas) |
| M22 | `enviar-email.ts` | padrão de `LIMITE_EMAILS_DIA` vira 1000 | idem | ✅ Morta (7 falhas) |
| M23 | `sessao/chave-ip.ts` | IPv4 mapeado em IPv6 deixa de valer como o IPv4 | `infraestrutura/chave-ip` | ✅ Morta (1 falha) |
| M24 | `1792843800000_conta-senha-bloqueio.sql` | o bloqueio nunca expira (tira a janela de 15 min) | `conta-senha-bloqueio` | ✅ Morta (1 falha: "ainda bloqueado 14 min depois da quinta falha; liberado 15 min depois") |
| M25 | `repositorios/contas.ts` | o repositório não distingue o bloqueio (`ok === null`) | `repositorios/contas`, `rotas/conta-minha` | ✅ Morta (3 falhas) |

**M11, equivalente.** `conta_senha_bloqueada_ate` devolve um instante, mas as duas únicas chamadas (`1792843800000_conta-senha-bloqueio.sql:67` e `:107`) só testam
`IS NOT NULL`. Quem decide quanto o bloqueio dura é a janela `f.momento > now() - interval '15 minutes'` (M24 a derruba), e a mutação só muda um valor que ninguém lê:
nenhum teste poderia distingui-la sem mudar o comportamento. Não é fraqueza dos testes; fica como sugestão de limpeza (a função poderia devolver `boolean`),
sem tarefa de correção.

**Profundidade**: P0 completo (autenticação, sessão e dados de conta; mais de 5 mutações manuais cobrindo todos os ramos das regras novas).
**Resultado**: 24 de 24 mutantes não equivalentes mortos (25 injetados, 1 equivalente). ✅ PASS.

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ (`chaveDoIp`, `cota-email.ts` e `comContaDaSessao` têm mais de um uso ou isolam a regra testável) |
| Mudanças cirúrgicas | ✅ (52 arquivos, todos nos `Where` de T57 a T64; `vitest.config.ts`, `playwright.config.ts` e `cenario-dois-grupos.ts` só ganham o necessário para o teto e as tabelas novas) |
| Segue os padrões existentes | ✅ (migrations aditivas com a assinatura preservada para o rollback do Worker, G-14; tabelas novas com RLS `FORCE`, só `pelada_backup` lê; funções `SECURITY DEFINER` com `search_path` fixo) |
| Testes mapeiam critérios e não são rasos | ✅ (cada teste novo cita ACE-06, 70, 71 ou 72; 24 mutantes mortos) |
| Resultado asserido bate com a spec | ✅ (429 `bloqueado_temporariamente`, 503 `email_indisponivel`, 5 falhas, 15 min, 80% e 100% conferidos pelos valores) |
| Nenhum teste órfão | ✅ |
| Testes existentes alterados | ✅ só os decorrentes de ACE-06 e ACE-70, com motivo e substituição igual ou mais forte (lista acima) |
| Guias seguidos | `CLAUDE.md` da raiz (migration aditiva, rota nova em `casos.ts`, datas em São Paulo, `.env.example`), `.md/GUARDRAILS.md` G-14 |

---

## Casos limite

- [x] Confirmar sem sessão com o 2º parâmetro nulo (rollback do Worker): `api/test/migracoes/conta-cadastro-e-links.test.ts:190-203`
- [x] Falha simultânea na senha atual: `api/test/migracoes/conta-senha-bloqueio.test.ts:257-302`
- [x] Reserva de e-mail simultânea e ROLLBACK: `api/test/migracoes/conta-teto-emails.test.ts:131-181` e `:86-92`
- [x] IPv6 com `::` no começo, no meio e no fim, e IPv4 mapeado: `api/test/infraestrutura/chave-ip.test.ts:26-44`
- [x] `LIMITE_EMAILS_DIA` inválido: `api/test/rotas/teto-emails.test.ts:175-187`
- [x] Tentativa bloqueada não prolonga o bloqueio nem é contada: `api/test/migracoes/conta-senha-bloqueio.test.ts:160-166`

---

## Gate

Comando: etapas do gate Build de `tasks.md` que o pedido incluiu (sem `build`, e2e e visual), uma execução por vez no banco `conta-e-acesso-seguranca-db-1`.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0 na 3ª execução: raiz 20, domínio 1, contrato 39, web 493 (54 arquivos), API 716 (46 arquivos) = 1269 testes, 0 falhas. Ver nota de flake |
| `pnpm test:checagens` | ✅ exit 0: 432 testes (21 arquivos), 0 falhas, 0 pulados |
| `python .claude/scripts/checar-tokens.py frontend/web/src` | ✅ "OK: nenhuma cor ou fonte fora do tokens.css" |
| `build`, `e2e`, `visual`, `gitleaks` | não rodados (fora do pedido desta volta) |

**Nota de flake (não bloqueante).** Na 1ª execução de `pnpm test` (que roda web e API em paralelo) falharam dois testes de tela por estouro dos 5 s padrão
(`web/app/App.sessao-expirada.test.tsx`, ACE-20, e `web/app/rotas.test.tsx`, "/termos abre sem sessão"), o `pnpm -r` abortou a API, e o `test:checagens`
seguinte falhou no `beforeAll` de `backend/scripts/test/dono.test.ts` (10 s) por conexão do banco cortada, tudo com a máquina carregada. Reexecutados em separado: API
716/716 e checagens 432/432 passaram; o web repetiu a falha do ACE-20 (5182 ms) numa execução isolada, mas esse teste sozinho passa (tempo de testes 3,3 s) e uma
nova execução completa de `pnpm test` fechou verde, com web 493/493. Os testes envolvidos não foram alterados nesta branch e não têm relação com as tarefas T57 a T64. O ACE-20 fica
perto do limite de 5 s numa máquina lenta; elevar o `testTimeout` desse arquivo é decisão do usuário (mudar teste pede aprovação).

- **Contagem antes e depois**: ver a seção "Integridade dos testes" (+66 testes em `pnpm test`).
- **Pulados**: nenhum. **Falhas persistentes**: nenhuma.

---

## Observações que não bloqueiam

1. **Lacuna de precisão ACE-72 (fronteira)**: a spec diz "passa de 80%"; a implementação barra a partir do momento em que o total *atinge* 80% (o 81º e-mail não sai). É a leitura conservadora; convém a spec dizer "atinge" ou "chega a".
2. **Lacuna de precisão ACE-70 (existência da conta)**: a rota exige sessão, então o oráculo de existência não existe nas duas rotas; a ramificação "conta inexistente → falso" do banco (`conta_trocar_senha`) não tem teste. Sem risco hoje.
3. **Rollback do Worker (aceito na decisão das correções)**: uma conta já bloqueada que tente excluir receberia 204 sem ser excluída com o Worker antigo (não conhece `bloqueado`). Registrado em `STATE.md`; só dura o rollback.
4. **ACE-72 e falha do remetente**: a regra "o envio que falhou não conta" é provada no banco (ROLLBACK, `conta-teto-emails.test.ts:86-92`), mas nenhum teste de rota simula a falha do Resend e confere o contador depois (`REMETENTE_QUE_FALHA` não aparece em `teto-emails.test.ts`). Depende do desfazer da transação da requisição, que já vale para o ACE-52.
5. **Contração futura**: o 2º parâmetro de `link_confirmar` ficou sem uso (G-14); `conta_senha_bloqueada_ate` poderia devolver `boolean` (M11).
6. **Segurança**: SEC-CA-01 a 04 têm correção testada (T58 a T63); o Turnstile ficou adiado, com o risco de *password spraying* distribuído registrado em `.md/THREAT-MODEL.md:63`. A revisão final do auditor está no `seguranca.md` (alteração do auditor não commitada, não avaliada aqui).

---

## Atualização da rastreabilidade

| Requisito | Estado anterior | Novo estado |
| --- | --- | --- |
| ACE-06, ACE-07 | ✅ Verificado (versão antiga do ACE-06) | ✅ Verificado (T58, T59; M16 a M19 mortos) |
| ACE-70, ACE-71, ACE-72 | Pending | ✅ Verificado (T59 a T63), com duas lacunas de precisão da spec |
| ACE-01 a ACE-05, ACE-08 a ACE-55, ACE-57 a ACE-69 | ✅ Verificado (volta 3) | ✅ Sem mudança (regressão no gate) |
| ACE-56 | ⚠️ | ⚠️ Lacuna de precisão da spec (não bloqueante) |

(`spec.md` não foi alterado pelo verificador; a tabela de rastreabilidade da spec ainda mostra ACE-70 a ACE-72 como `Pending`, o que o autor atualiza na integração.)

---

## Resumo

**Geral**: ✅ Pronto para integrar. As correções dos médios de segurança (SEC-CA-01 a 04) estão implementadas, testadas e discriminadas.

**Verificação ancorada na spec**: ACE-06, ACE-70, ACE-71 e ACE-72 provados com o resultado da spec; 2 lacunas de precisão novas (ACE-72 fronteira de 80%; ACE-70 existência da conta) e 1 antiga (ACE-56).
**Sensor**: 24 de 24 mutantes não equivalentes mortos (1 equivalente).
**Gate**: lint, format, typecheck, `pnpm test` (1269) e `test:checagens` (432) verdes; e2e e visual não rodados por pedido.

**O que funciona**: confirmar o e-mail sem abrir sessão e levar a `/entrar` com o aviso; bloqueio de 15 min após 5 falhas da senha atual por conta (troca e exclusão
somam); limitador por IP nas duas rotas antes do bcrypt; chave do limitador e `ip_hash` pelo /64 do IPv6; teto diário de e-mails com reserva para a recuperação,
zerando na virada do dia de São Paulo.

**Problemas**: nenhum bloqueante.

**Próximos passos**: o usuário decide a redação da fronteira do ACE-72 e se eleva o tempo limite do teste ACE-20; rodar e2e e visual (T59 mudou o fluxo de cadastro) na checagem final antes de integrar.
