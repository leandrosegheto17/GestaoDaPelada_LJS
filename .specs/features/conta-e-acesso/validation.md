# Conta e acesso — Validação (volta 3 de 3)

**Data**: 2026-10-27
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `9085f80..032b8ea` (merge-base com `main` até o HEAD de `feat/conta-e-acesso`, 68 commits, 244 arquivos). Esta volta
verifica o intervalo `62aa021..032b8ea` (6 commits, 12 arquivos: correções T53 a T56, o relatório de segurança e os registros da volta 2) e refaz a
leitura dos 69 critérios sobre o intervalo todo.
**Verificador**: subagente independente (autor ≠ verificador). Derivou a cobertura sozinho a partir da spec e do diff.

**Result**: PASS

Resumo: as duas lacunas da volta 2 estão fechadas. (1) A versão dos termos gravada pelas rotas de cadastro e de convite agora tem teste que lê a
coluna no banco e compara com `TERMOS_VERSAO`; os mutantes N7 e N16 morrem. (2) Os três mockups t25 decodificam em UTF-8 (e nenhum `.html` de
`.specs/mockup` falha mais). 69 de 69 critérios com o resultado definido na spec provados; 1 lacuna de precisão da spec (ACE-56, não bloqueante).
Gate verde (1203 + 432 + 15 testes e 84 comparações visuais, 0 falhas), `gitleaks` sem vazamento. Sensor: 9 mutações, 9 mortas, 0 sobreviveram.

Convenção de caminhos: `api/test/` = `backend/api/test/`; `web/` = `frontend/web/src/`; `e2e/` = `frontend/web/e2e/`.

---

## Resumo das voltas anteriores

- **Volta 1 (FAIL)**: gate verde, 31 mutações (27 mortas). Quatro lacunas: M17 e M18 (policies de escrita de `sessoes` e `contas` abertas, ACE-43 e
  ACE-44), F1 (ligação entre sessão expirada e `/entrar`, ACE-20), M26 (intervalo de 60 s só testado em 0 s e 61 s, ACE-51) e a t25 fora da
  comparação visual (ACE-54). Corrigidas em T45 a T52. Relatório completo no histórico do git (`a8ec48f`).
- **Volta 2 (FAIL)**: as quatro lacunas anteriores fechadas (M17, M18, M26, F1 mortos); 19 mutações, 17 mortas. Sobreviveram N7 e N16 (nenhum teste de
  rota conferia o valor de `termos_versao` gravado em `POST /api/conta` e em `POST /api/convites/cadastrar`; ACE-01 e a cláusula "é a mesma gravada no
  aceite" do ACE-58) e achou-se o byte inválido em três mockups t25. Corrigidas em T53 e T54 (mais T55, runbook, e T56, allowlist do gitleaks).
  Relatório completo no histórico do git (`62aa021` e `45e7dca`).

---

## Conclusão das tarefas

56 tarefas (T1 a T56) em `tasks.md`, 166 caixas marcadas e nenhuma em aberto; `git grep` de `.skip/.only/.todo/xit/xdescribe` vazio. Phase 10 (correções):

| Tarefa | Estado | Conferência desta volta |
| --- | --- | --- |
| T53 versão dos termos gravada | ✅ | `api/test/rotas/conta-cadastro.test.ts:33-42` e `api/test/rotas/convites.test.ts:118-124`; N7 e N16 mortos |
| T54 mockups t25 em UTF-8 | ✅ | os 3 arquivos decodificam em UTF-8 (`bytes.decode('utf-8')`), e nenhum `.html` de `.specs/mockup` falha; diff: só o byte `ã` (1 byte a mais por arquivo); `visual` da t25 em 0,00% |
| T55 runbook `$2a$` | ✅ | `docs/runbook.md` (4 linhas novas), texto coerente com a observação 1 abaixo |
| T56 allowlist do gitleaks | ✅ | `.gitleaks.toml`: `[[allowlists]]` com `condition = "AND"` (caminho dos dois testes **e** linha `senhaSecreta = '...'`); `gitleaks git` no histórico inteiro (168 commits) e em `9085f80..HEAD` (68 commits): "no leaks found". Nenhuma asserção de teste alterada |

Nenhum teste foi removido nem enfraquecido no intervalo da volta 3: `git diff 62aa021..HEAD -- '*.test.*'` não tem linha removida; só entram uma asserção
nova em `convites.test.ts` e um teste novo em `conta-cadastro.test.ts`.

---

## Critérios de aceite ancorados na spec

O intervalo `62aa021..032b8ea` não toca código de produção (só dois arquivos de teste, três mockups, `.gitleaks.toml`, o runbook e artefatos de
`.specs/`). Os testes citados fora desses dois arquivos de teste estão idênticos aos da volta 2; foram relidos nos pontos de citação, exercitados pelo gate
completo e, para as regras críticas, por mutantes novos desta volta. As linhas de `conta-cadastro.test.ts` e `convites.test.ts` foram recalculadas
(imports e testes novos deslocaram as linhas).

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| ACE-01 cadastro | 201 com a mensagem; conta sem confirmar; **data e versão dos termos gravadas**; e-mail enviado | `api/test/rotas/conta-cadastro.test.ts:25` `expect(r.status).toBe(201)`, `:26` `expect(r.corpo).toEqual({ mensagem: MENSAGEM })`, `:28` `mensagens[0] toMatchObject({ para: email, assunto: 'Confirme seu e-mail' })`; **T53** `:33-42`: após `POST /api/conta` lê `select termos_versao, termos_aceitos_em from contas where email = $1` como owner e afirma `:41` `expect(conta?.termos_versao).toBe(TERMOS_VERSAO)` e `:42` `expect(conta?.termos_aceitos_em).not.toBeNull()`; `:50-51` entrar dá 403 `email_nao_confirmado` (conta nasce sem confirmar). Mutante N7 morto | ✅ PASS |
| ACE-02 sem aceite | 422 `termos_obrigatorios`, sem conta | `api/test/rotas/conta-cadastro.test.ts:109-111` `status toBe(422)`, `codigo: 'termos_obrigatorios'`, `mensagens toHaveLength(0)`; `:114` `entra.status toBe(401)` | ✅ PASS |
| ACE-03 limites | 422 com o campo inválido | `api/test/rotas/conta-cadastro.test.ts:129-131` `campos: { [campo]: expect.any(String) }`; `backend/contrato/test/primitivos.test.ts:9`, `:38` | ✅ PASS |
| ACE-04 e-mail existente | 201 igual, conta intacta, aviso | `api/test/rotas/conta-cadastro.test.ts:65` `expect(r.corpo).toEqual(novo.corpo)`, `:67` `assunto toBe('Tentativa de cadastro com o seu e-mail')`, `:71-74` a conta continua entrando com a senha antiga; `api/test/migracoes/conta-cadastro-e-links.test.ts:145` `expect(await conta(email)).toEqual(antes)` | ✅ PASS |
| ACE-05 normalização | minúsculas, sem espaços | `backend/contrato/test/primitivos.test.ts:6`; `api/test/rotas/conta-cadastro.test.ts:98` `mensagens[0]?.para toBe(email)`; `api/test/rotas/sessao.test.ts:46`; `api/test/migracoes/conta-cadastro-e-links.test.ts:136` | ✅ PASS |
| ACE-06 confirmar em 24 h | confirmado, sessão aberta, `/app`; conta existente com hash bcrypt externo entra | `api/test/rotas/conta-cadastro.test.ts:170` `status toBe(204)`, `:172-175` sessão 200 e entrar 200; `api/test/migracoes/conta-cadastro-e-links.test.ts:173` (dentro de 24 h confirma e cria sessão de 12 h), `:187` (vencido: nulo); `e2e/acesso.spec.ts:97` `toHaveURL(/\/app$/)`; `api/test/migracoes/conta-entrar-hash-externo.test.ts:60` `toMatchObject({ resultado: 'ok', conta_id: contaId, nome: 'Conta Legado', sessoes: 1, falhas: 0 })`, `:65`, `:73` | ✅ PASS |
| ACE-07 link inválido | tela "Link inválido ou vencido", sem sessão | `api/test/rotas/conta-cadastro.test.ts:186-188` `status toBe(410)`, `link_invalido`, `Set-Cookie` nulo; `web/telas/confirmar/Confirmar.test.tsx:71` | ✅ PASS |
| ACE-08 novo link | invalida o anterior; mesma resposta | `api/test/rotas/conta-cadastro.test.ts:210` `velho.status toBe(410)`, `:219-220` sem conta: mesma resposta e `mensagens toHaveLength(0)`; `web/telas/confirmar/Confirmar.test.tsx:94` | ✅ PASS |
| ACE-09 entrar | 200 nome e e-mail, cookie `__Host-sessao; HttpOnly; Secure; SameSite=Lax; Path=/`, sem Domain | `api/test/rotas/sessao.test.ts:24` `corpo toEqual({ nome, email })`, `cookie toMatch(/^__Host-sessao=[A-Za-z0-9_-]{43};/)`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `not.toContain('Domain')` | ✅ PASS |
| ACE-10 só o SHA-256 | banco guarda o hash | `api/test/rotas/sessao.test.ts:42` `hashes toContain(hex(sha256(token)))`, `:43` `not.toContain(hex(token))` | ✅ PASS |
| ACE-11 credenciais | 401 `credenciais_invalidas`, mesma mensagem | `api/test/rotas/sessao.test.ts:52` `errada.corpo toEqual(semConta.corpo)` | ✅ PASS |
| ACE-12 não confirmado | 403 `email_nao_confirmado`, sem sessão | `api/test/rotas/sessao.test.ts:63` `status toBe(403)`, `Set-Cookie` nulo; `web/telas/entrar/Entrar.test.tsx:87` | ✅ PASS |
| ACE-13 5 falhas | 429 `bloqueado_temporariamente` por 15 min, mesmo com senha certa | `api/test/rotas/sessao.test.ts:71` `bloqueada.status toBe(429)`; `api/test/migracoes/conta-entrar-e-sessao.test.ts:149`, `:176` (4 falhas não bloqueiam), `:183` (14 min bloqueia, 15 libera) | ✅ PASS |
| ACE-14 outro IP | avaliado normalmente | `api/test/rotas/sessao.test.ts:83` `outroIp.status toBe(200)`; `api/test/migracoes/conta-entrar-e-sessao.test.ts:165` | ✅ PASS |
| ACE-15 15 min | 401 `sessao_expirada` | `api/test/migracoes/conta-entrar-e-sessao.test.ts:320` `tocar(token) toBeNull()` aos 15 min; `api/test/rotas/sessao-middleware.test.ts:157` | ✅ PASS |
| ACE-16 12 h | 401 mesmo com uso contínuo | `api/test/migracoes/conta-entrar-e-sessao.test.ts:330` (12 h = nulo), `:343` (11 h 59 min vale). **Mutante N20 morto** (remove a expiração absoluta; falha o teste "criada há 12 h, mesmo em uso: nulo e a sessão é apagada") | ✅ PASS |
| ACE-17 sair | apaga sessão, 204, cookie vencido | `api/test/rotas/sessao.test.ts:149` `status toBe(204)`, `startsWith('__Host-sessao=;')`, `Max-Age=0`, GET seguinte 401 | ✅ PASS |
| ACE-18 `GET /api/sessao` | id, nome, e-mail e grupos (id, nome, slug, `acessa_financeiro`) | `api/test/rotas/sessao.test.ts:114` `corpo toEqual({ id, nome, email, grupos: [{ id, nome, slug, acessaFinanceiro }] })`, `:133` 401 | ✅ PASS |
| ACE-19 sem sessão em `/app` | redireciona e volta | `web/app/guarda/decidir-rota.test.ts:15` `toBe('/entrar?volta=%2Fapp%2Fconta')`, `:57`; `web/app/guarda/RotaProtegida.test.tsx:55` | ✅ PASS |
| ACE-20 sessão expira durante o uso | tela em `/entrar` com "Sua sessão expirou. Entre de novo." | `web/app/App.sessao-expirada.test.tsx:31` `findByText('Sua sessão expirou. Entre de novo.') toBeVisible()`, `:32` `pathname toBe('/entrar')`, `:33` `search toBe('?aviso=sessao-expirada')` | ✅ PASS |
| ACE-21 sem segredo no log | senha, tokens e corpo fora do log | `api/test/rotas/sessao.test.ts:98`; `api/test/rotas/conta-cadastro.test.ts:159-160` `log not.toContain(senha)` e `not.toContain(tokenDoEmail(email))`; `api/test/rotas/conta-minha.test.ts:63`; `api/test/rotas/convites.test.ts:166-167` `log not.toContain(token)` e `not.toContain('senha-vazada-do-convite')`; `api/test/rotas/sessao-recuperacao.test.ts:128-129`, `:148-151` | ✅ PASS |
| ACE-22 esqueci a senha | 200 com a mensagem exata, exista ou não | `api/test/rotas/sessao-recuperacao.test.ts:16` e `:39` `corpo toEqual({ mensagem: MENSAGEM })` | ✅ PASS |
| ACE-23 link de 1 h | invalida o anterior | `api/test/rotas/sessao-recuperacao.test.ts:25` `velho.status toBe(410)`; `api/test/migracoes/conta-cadastro-e-links.test.ts:248` | ✅ PASS |
| ACE-24 nova senha | troca, marca usado, encerra sessões, confirma e-mail, 200, aviso | `api/test/migracoes/conta-cadastro-e-links.test.ts:294` (senha, link usado, e-mail confirmado, sessões `[]`); `api/test/rotas/sessao-recuperacao.test.ts:87-91`; `web/telas/nova-senha/NovaSenha.test.tsx:76`; `e2e/acesso.spec.ts:127` `toHaveURL(/\/entrar\?aviso=senha-alterada$/)`. **Mutante N21 morto** (a nova senha deixa de apagar as sessões; falham "troca a senha, consome o link, confirma o e-mail e apaga todas as sessões" e o teste de rota "link válido: 200, encerra as sessões") | ✅ PASS |
| ACE-25 link inválido | 410 `link_invalido`, senha intacta | `api/test/rotas/sessao-recuperacao.test.ts:98-99` `status toBe(410)`, `codigo: 'link_invalido'`, `:105` `entra.status toBe(401)`. **Mutante N23 morto** (link de recuperação reutilizável: falham "link já usado ou inexistente: false e a senha não muda", no banco e na rota) | ✅ PASS |
| ACE-26 trocar senha | 204, encerra as outras, mantém a atual | `api/test/rotas/conta-minha.test.ts:14` `status toBe(204)`, atual 200, `outro` 401. **Mutante N17 morto** (a troca deixa de encerrar as outras sessões; falham o teste de rota "troca a senha: 204, a sessão atual fica, a de outro aparelho passa a 401" e "troca a senha, apaga as outras sessões e mantém a atual") | ✅ PASS |
| ACE-27 senha atual errada | 401 `senha_atual_incorreta` | `api/test/rotas/conta-minha.test.ts:32` | ✅ PASS |
| ACE-28 excluir | anonimiza, apaga vínculos/sessões/links, auditoria, 204 | `api/test/migracoes/conta-senha-e-exclusao.test.ts:150` `rows toEqual([{ email: 'excluida-<id>@invalido', nome: 'Conta excluída', senha_hash: '!', excluida: true }])`; `api/test/rotas/conta-minha.test.ts:79`; `web/telas/minha-conta/MinhaConta.test.tsx:101`. **Mutante N18 morto** (`senha_hash` não anonimizado; falha "sem ser única admin: apaga sessões, vínculos e links, anonimiza a conta e a auditoria mostra Conta excluída") | ✅ PASS |
| ACE-29 único admin | 409 `unico_admin` com `grupos: [{ id, nome }]` | `api/test/rotas/conta-minha.test.ts:106`; `api/test/migracoes/conta-senha-e-exclusao.test.ts:212` | ✅ PASS |
| ACE-30 senha errada na exclusão | 401, nada apagado | `api/test/rotas/conta-minha.test.ts:98` | ✅ PASS |
| ACE-31 convidar | 201 com id, e-mail, validade de 7 dias | `api/test/rotas/admins.test.ts:22` `status toBe(201)`, `expiraEm: stringMatching(/^\d{4}-/)`; os 7 dias em `api/test/migracoes/conta-convites.test.ts:124` | ✅ PASS |
| ACE-32 já é admin | 409 `ja_e_admin` | `api/test/rotas/admins.test.ts:40` | ✅ PASS |
| ACE-33 aceitar | vínculo com `acessa_financeiro` falso, convite usado | `api/test/repositorios/convites.test.ts:151` `rows toEqual([{ acessa_financeiro: false }])`; `api/test/rotas/convites.test.ts:56-57` `status toBe(200)`, `corpo toEqual({ grupoId: GRUPO_A.grupo })` | ✅ PASS |
| ACE-34 sem conta | cadastro com e-mail travado, confirmado, com vínculo | `api/test/repositorios/convites.test.ts:188` `toEqual([{ email, nome, confirmada: true }])`; `api/test/rotas/convites.test.ts:106-117` (201, `grupoId`, vínculo em `GET /api/sessao`, entrar sem link 200); `web/telas/convite/Convite.test.tsx:168` | ✅ PASS |
| ACE-35 outro e-mail | 403 `convite_de_outro_email` | `api/test/rotas/convites.test.ts:69-70` `status toBe(403)`, `codigo: 'convite_de_outro_email'`, `:72` `grupos: []`; `api/test/repositorios/convites.test.ts:165`. **Mutante N19 morto** (a checagem do e-mail removida; falham os 3 testes: rota, função do banco e repositório) | ✅ PASS |
| ACE-36 convite inválido | 410 `link_invalido` | `api/test/rotas/convites.test.ts:45-46`, `:81-82`, `:131-137` | ✅ PASS |
| ACE-37 listar | admins e convites pendentes | `api/test/rotas/admins.test.ts:73` | ✅ PASS |
| ACE-38 cancelar | invalida o link, 204 | `api/test/rotas/admins.test.ts:130` | ✅ PASS |
| ACE-39 remover | apaga vínculo, auditoria, 204 | `api/test/rotas/admins.test.ts:157` `auditoriaDe(...,'remover_admin') toEqual([{ autor_conta_id }])` | ✅ PASS |
| ACE-40 último admin | 409 `ultimo_admin` | `api/test/rotas/admins.test.ts:172`; `api/test/repositorios/admins.test.ts:164`. **Mutante N22 morto** (`vinculos.length <= 0`; falham 3 testes: rota, repositório e remoção simultânea) | ✅ PASS |
| ACE-41 sem vínculo | 404 | `api/test/rotas/admins.test.ts:95`, `:105`; `api/test/rotas/vinculo-middleware.test.ts:35` | ✅ PASS |
| ACE-42 auditoria | autor, ação, grupo | `api/test/repositorios/admins.test.ts:202`; `api/test/rotas/admins.test.ts:22` | ✅ PASS |
| ACE-43 `contas` só a própria linha | ler e alterar só `app.conta_id` | `api/test/isolamento/contas.test.ts:98-114` (com `WHERE`), `:117-134` `describe.each(PROPRIAS)` escrita sem `WHERE` como B: `:133` `expect(antes.startsWith('1:')).toBe(true)`, `:134` `expect(depois).toBe(antes)` | ✅ PASS |
| ACE-44 `sessoes` só as da conta | ler e apagar só as da conta | mesmo bloco `:117-134` com `DELETE FROM sessoes`; `api/test/isolamento/contas.test.ts:169-198`; `api/test/repositorios/sessoes.test.ts:104` | ✅ PASS |
| ACE-45 RLS com FORCE e caso | FORCE, policy de `pelada_backup`, B não lê/altera/apaga | `api/test/migracoes/rls.test.ts:174` `ligada: true, forcada: true`; `api/test/isolamento/contas.test.ts:65` (`CASOS_CONTA` com as seis tabelas), `:98` | ✅ PASS |
| ACE-46 `auditoria` | INSERT sim; UPDATE/DELETE não | `api/test/migracoes/roles.test.ts:212` `codigoDoErro(UPDATE) toBe(SEM_PRIVILEGIO)`, `DELETE` idem | ✅ PASS |
| ACE-47 `app.conta_id` antes de dado de grupo | fixado na transação | `api/test/rotas/sessao-middleware.test.ts:107` `toEqual({ usuario: 'pelada_app', conta: s.contaId, somente_leitura: 'on' })` | ✅ PASS |
| ACE-48 toda rota tem caso (G-04) | caso por rota ou "não se aplica" | `api/test/isolamento/meta.test.ts:87` `problemasDasRotas(rotas, CASOS_ROTAS) toEqual([])`, `:96` | ✅ PASS |
| ACE-49 CSRF antes dos limitadores | 403 sem consumir cota | `api/test/rotas/sessao-middleware.test.ts:64` 11 POST dão 403, o 12º `not.toBe(429)` | ✅ PASS |
| ACE-50 `LIMITE_ENTRAR` | 429 em entrar, cadastro, esqueci, reenvio | `api/test/rotas/sessao-middleware.test.ts:80` `it.each(ROTAS_SEM_SESSAO)` `status toBe(429)`, `codigo: 'muitas_requisicoes'` | ✅ PASS |
| ACE-51 intervalo de 60 s | 59 s bloqueia, 61 s libera, mesma resposta | `api/test/migracoes/conta-cadastro-e-links.test.ts:161-169` (`conta_cadastrar`: 59 s `.enviar toBe(false)`; 61 s `toBe(true)`) e `:213-220` (`link_pedir`, idem); `api/test/rotas/conta-cadastro.test.ts:85-88` (mesma resposta, um e-mail de cada tipo) | ✅ PASS |
| ACE-52 falha do Resend | 503 `email_indisponivel`, pedido refeito funciona | `api/test/rotas/conta-cadastro.test.ts:144-148`, `api/test/rotas/sessao-recuperacao.test.ts:61-65`, `api/test/rotas/admins.test.ts:49`, `api/test/infraestrutura/email.test.ts:56` | ✅ PASS |
| ACE-53 `no-store` | em toda rota de `/api/sessao` e `/api/conta` | `api/test/rotas/app.test.ts:34`; `api/test/rotas/sessao.test.ts:124` | ✅ PASS |
| ACE-54 telas t04, t05, t06, t25, t08, t19 | passam na comparação visual em PC e celular | `e2e/telas-ativas.txt:44-46` (`t25-senha--vazio`, `--erro`, `--sucesso`), `e2e/telas-ativas.test.mjs:50` `expect(ativas.slice(39)).toEqual([...as três t25])`; `visual` desta volta: 84 comparações OK, t25 em 0,00% nos dois viewports (era 0,13% e 0,40% antes da regravação em UTF-8) | ✅ PASS |
| ACE-55 telas novas com mockup | t29 a t33 comparadas | `e2e/telas-ativas.txt:6-43`; `visual` desta volta, 0 divergentes | ✅ PASS |
| ACE-56 tokens e axe | só `tokens.css`; axe sem violação | `checar-tokens.py` desta volta: "OK: nenhuma cor ou fonte fora do tokens.css"; `web/telas/cadastro/Cadastro.test.tsx:24` `expect(await violacoes(container)).toEqual([])` (e 11 outras telas). Axe no jsdom com `color-contrast` desligado (`frontend/web/test/apoio/axe.ts:5`) | ⚠️ Lacuna de precisão da spec (ambiente do axe) |
| ACE-57 estado vazio de `/app` | estado vazio do t08 | `web/telas/grupos/SeusGrupos.test.tsx:21` | ✅ PASS |
| ACE-58 `/termos` e `/privacidade` públicas, versão `AAAA-MM-DD`, **a mesma gravada no aceite** | públicas, versão e data em `AAAA-MM-DD`; mesma versão no aceite | `web/telas/termos/PaginaTermos.test.tsx:15-18` `getByText(/^Versão \d{4}-\d{2}-\d{2}$/) toBeVisible()` e `new Date(...).toISOString().slice(0,10) toBe(data)` (igual em `PaginaPrivacidade.test.tsx:15-18`); `backend/contrato/test/acesso.test.ts:99-100` `TERMOS_VERSAO toMatch(/^\d{4}-\d{2}-\d{2}$/)` e data válida; `web/app/guarda/decidir-rota.test.ts:25`. **Elo do aceite fechado (T53)**: a página exibe `TERMOS_VERSAO` (`web/telas/compartilhado/PaginaTexto.tsx:28`, mesma constante do contrato) e as duas rotas gravam `TERMOS_VERSAO`, conferido no banco em `api/test/rotas/conta-cadastro.test.ts:41` e `api/test/rotas/convites.test.ts:123` `expect(conta?.termos_versao).toBe(TERMOS_VERSAO)`. Mutantes N7 e N16 mortos | ✅ PASS |
| ACE-59 aceite desmarcado com links | checkbox desmarcado, links | `web/telas/cadastro/Cadastro.test.tsx:24` `not.toBeChecked()`, `href '/termos'`, `href '/privacidade'` | ✅ PASS |
| ACE-60 rascunho marcado, formato mantido | selo de rascunho; versão `AAAA-MM-DD` | `web/telas/termos/PaginaTermos.test.tsx:13` `getByText('Rascunho para revisão') toBeVisible()` mais `:15-18`; `PaginaPrivacidade.test.tsx:13`, `:15-18` | ✅ PASS |
| ACE-61 script do dono | cria ou troca a senha, sem eco | `backend/scripts/test/dono.test.ts:47` `confere('senha-dono-um') toEqual({ ok: true, e_dono: true, confirmada: true, n: 1 })`, `stdout+stderr not.toContain(senha)` | ✅ PASS |
| ACE-62 host remoto sem `--alvo` | recusa | `backend/scripts/test/dono.test.ts:68` `status toBe(1)`, `stderr toContain('informe --alvo producao ou --alvo teste')` | ✅ PASS |
| ACE-63 nenhuma rota lê ou escreve `e_dono` | sem leitura nem escrita em rota | `backend/scripts/test/dono.test.ts:89-95` (escrita), `:99-113` `it.each` de 7 formas de leitura `toBeGreaterThan(0)`, `:116-122`, `:124-127` `achados toEqual([])` sobre `backend/api/src/**/*.ts` | ✅ PASS |
| ACE-64 seed | conta confirmada com `SEED_SENHA_ADMIN`; recusa sem ela | `api/test/infraestrutura/seed-local.test.ts:111` `entrar('outra...') toBe('invalida')`, `entrar(SENHA_ADMIN) toBe('ok')`, `:135` `status toBe(1)` | ✅ PASS |
| ACE-65 logado em `/entrar` | vai a `/app` | `web/app/guarda/decidir-rota.test.ts:36` `toBe('/app')`; `RotaProtegida.test.tsx:68` | ✅ PASS |
| ACE-66 concorrência no login | as duas falhas contam | `api/test/migracoes/conta-entrar-e-sessao.test.ts:239` `falhasDoPar(email, ip) toBe(2)`, `:255` | ✅ PASS |
| ACE-67 aceite simultâneo | um vínculo, segundo 410 | `api/test/migracoes/conta-convites.test.ts:283` | ✅ PASS |
| ACE-68 mais de 72 bytes | 422 | `backend/contrato/test/primitivos.test.ts:29`, `:32` | ✅ PASS |
| ACE-69 conta excluída com sessão aberta | 401 `sessao_expirada` | `api/test/rotas/conta-minha.test.ts:79` `aparelho.status toBe(401)`; `api/test/migracoes/conta-senha-e-exclusao.test.ts:210` | ✅ PASS |

**Status**: ✅ todos os critérios com resultado definido na spec têm evidência localizada e discriminada. ⚠️ ACE-56 segue como lacuna de precisão da spec
(a spec pede "axe sem violação", mas o ambiente do axe não mede contraste; não bloqueante, sem mudança desde a volta 1).

### Regra de payload e conjunção

ACE-01 tem agora os seis efeitos provados: 201 (`:25`), mensagem (`:26`), conta sem confirmar (`:50-51`), e-mail enviado (`:28`), data do aceite
(`:42`) e versão (`:41`). Conferidos item a item na leitura anterior e não alterados: ACE-09 (cinco atributos do cookie), ACE-18, ACE-24 (cinco efeitos),
ACE-28, ACE-29, ACE-34, ACE-37, ACE-39, ACE-42.

---

## Casos limite (spec)

- [x] ACE-65 logado abre `/entrar`: `web/app/guarda/decidir-rota.test.ts:36`
- [x] ACE-66 login concorrente: `api/test/migracoes/conta-entrar-e-sessao.test.ts:239`
- [x] ACE-67 aceite concorrente: `api/test/migracoes/conta-convites.test.ts:283`
- [x] ACE-68 senha com mais de 72 bytes: `backend/contrato/test/primitivos.test.ts:32`
- [x] ACE-69 conta excluída com sessão em outro aparelho: `api/test/rotas/conta-minha.test.ts:79`

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` fora do repositório (pasta de rascunho do verificador), com `pnpm install --offline --frozen-lockfile` e o
`.env` local copiado (ignorado pelo git; só existiu na cópia). Cada mutação foi aplicada por script que exige exatamente uma ocorrência do trecho,
os testes de cobertura foram rodados, e o arquivo foi restaurado com `git checkout -- .`. A cópia foi removida ao fim (`git worktree list` sem ela,
`git worktree prune`, diretório apagado). `git status --porcelain`: vazio antes e vazio depois, na árvore da feature e na raiz do repositório.
Banco de teste: `conta-e-acesso-db-1` (porta 5432), uma execução por vez; os outros contêineres não foram tocados.

Incidente de método, sem efeito no resultado: um primeiro disparo em segundo plano do laço de mutações continuou a rodar enquanto eu disparava um
segundo, e os dois mutaram a mesma cópia ao mesmo tempo. Descartei esse resultado (invalido por intercalação), limpei a cópia e a trava de índice do
worktree temporário, e **refiz as oito mutações em uma única execução sequencial**. Os números abaixo são só dessa execução limpa.

| # | Arquivo | Mutação (regra crítica) | Testes executados | Resultado |
| --- | --- | --- | --- | --- |
| N7 | `backend/api/src/entrada/rotas/conta-cadastro.ts:27` | a rota grava `termosVersao: 'x'` (reaplicado da volta 2) | `test/rotas/conta-cadastro.test.ts` | ✅ Morta (1 falha: "grava a versão dos termos vigente e a hora do aceite", T53) |
| N16 | `backend/api/src/entrada/rotas/convites.ts:46` | cadastro por convite grava `termosVersao: 'x'` (reaplicado) | `test/rotas/convites.test.ts` | ✅ Morta (1 falha: "cria a conta confirmada, abre a sessão e o grupo aparece em GET /api/sessao", T53) |
| N17 | `1792843560000_conta-senha-e-exclusao.sql` (`conta_trocar_senha`) | a troca de senha não encerra as outras sessões (`DELETE FROM sessoes ... WHERE false`) | `conta-senha-e-exclusao`, `rotas/conta-minha` | ✅ Morta (2 falhas, banco e rota) |
| N18 | idem (`conta_excluir`) | a exclusão não anonimiza o hash da senha (`senha_hash = c.senha_hash`) | idem | ✅ Morta (1 falha) |
| N19 | `1792843620000_conta-convites.sql` (`convite_aceitar`) | aceita convite de outro e-mail (`IF false THEN` no lugar de `IF v_convite.email <> v_conta.email`) | `conta-convites`, `repositorios/convites`, `rotas/convites` | ✅ Morta (3 falhas: banco, repositório e rota) |
| N20 | `1792843500000_conta-entrar-e-sessao.sql` (`sessao_tocar`) | remove a expiração absoluta de 12 h (`false OR s.ultimo_uso_em ...`) | `conta-entrar-e-sessao`, `rotas/sessao-middleware` | ✅ Morta (1 falha: "criada há 12 h, mesmo em uso: nulo e a sessão é apagada") |
| N21 | `1792843440000_conta-cadastro-e-links.sql` (`link_nova_senha`) | a nova senha por link não apaga as sessões da conta | `conta-cadastro-e-links`, `rotas/sessao-recuperacao` | ✅ Morta (2 falhas, banco e rota) |
| N22 | `backend/api/src/infraestrutura/db/repositorios/admins.ts:50` | `vinculos.length <= 1` vira `<= 0`: o último admin pode ser removido | `repositorios/admins`, `rotas/admins` | ✅ Morta (3 falhas, incluindo a remoção simultânea) |
| N23 | `1792843440000_conta-cadastro-e-links.sql` (`link_nova_senha`) | o link de recuperação deixa de ser de uso único (remove `usado_em IS NULL`) | `conta-cadastro-e-links`, `rotas/sessao-recuperacao` | ✅ Morta (2 falhas, banco e rota) |

**Profundidade**: P0 completo (autenticação, sessão e dados de conta). Esta volta: 9 mutações manuais, 2 reaplicadas (N7, N16) e 7 novas em regras
que ainda não tinham sido mutadas (encerramento de sessões na troca de senha e na recuperação, anonimização da exclusão, e-mail do convite, expiração
absoluta da sessão, último admin e uso único do link de recuperação). As 19 mutações da volta 2 e as 31 da volta 1 seguem válidas: nenhum código de
produção mudou no intervalo da volta 3.
**Resultado**: 9 de 9 mortas. ✅ PASS (0 sobreviventes).

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ (o intervalo da volta 3 só acrescenta 23 linhas de teste e configuração) |
| Mudanças cirúrgicas | ✅ (12 arquivos, todos nos Where das tarefas T53 a T56 e nos registros do fluxo) |
| Segue os padrões existentes | ✅ (`comoOwner` reaproveitado de `test/apoio/owner-worker.ts`, como o `auditoriaDe` das rotas de admin) |
| Testes mapeiam critérios e não são rasos | ✅ (ACE-01 e ACE-58 agora conferem o valor gravado) |
| Resultado asserido bate com a spec | ✅ (`TERMOS_VERSAO` com formato `AAAA-MM-DD` fixado em `acesso.test.ts:99`, e as rotas comparadas com ele) |
| Nenhum teste órfão | ✅ (os dois testes novos citam ACE-01/ACE-58) |
| Testes existentes alterados | ✅ nenhum enfraquecido; só acréscimos; `git grep` de `.skip/.only/.todo/xit` vazio |
| Guias seguidos | `CLAUDE.md` da raiz, `.md/GUARDRAILS.md` G-02, G-03, G-04, G-08, G-09, G-11 |

---

## Edge Cases

Todos os cinco casos da spec (ACE-65 a ACE-69) com evidência acima. Casos extras desta volta: limites do fim da sessão (N20), concorrência na
remoção dos dois últimos admins (N22, "duas remoções simultâneas dos dois últimos admins deixam um admin") e reuso de link de recuperação (N23).

---

## Gate

Comando: o gate Build de `tasks.md` (`.specs/projeto/testes.json`), cada etapa em sequência, uma execução por vez no banco local
(`conta-e-acesso-db-1`). Rodado antes do sensor; os dois não rodaram ao mesmo tempo.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0: raiz 20, dominio 1, contrato 39, web 492 (54 arquivos), API 651 (42 arquivos) = 1203 testes, 0 falhas |
| `pnpm test:checagens` | ✅ exit 0: 432 testes (21 arquivos), 0 falhas |
| `checar-tokens.py frontend/web/src` | ✅ exit 0: "OK: nenhuma cor ou fonte fora do tokens.css" |
| `pnpm --filter @pelada/web build` | ✅ exit 0 |
| `pnpm --filter @pelada/web e2e` | ✅ 15 passaram, 0 falharam |
| `pnpm --filter @pelada/web visual` | ✅ 84 comparações (42 telas, PC e celular), 0 divergentes; t25 em 0,00% nos dois viewports |
| `gitleaks git --redact` (histórico inteiro, 168 commits) | ✅ no leaks found |
| `gitleaks git --redact --log-opts "9085f80..HEAD"` (68 commits) | ✅ no leaks found |

- **Total executado**: 1203 + 432 + 15 = 1650 testes, mais 84 comparações visuais.
- **Delta contra a volta 2**: +1 teste em `pnpm test` (API 650 para 651: o teste novo de `conta-cadastro.test.ts`; a prova do convite é uma asserção a mais num teste existente). Nenhum teste a menos.
- **Pulados**: nenhum. **Falhas**: nenhuma.
- `git status --porcelain` da árvore da feature: vazio depois do gate (`build`, `e2e` e `visual` só escrevem em pastas ignoradas).

---

## Observações que não bloqueiam

1. **pgcrypto e os prefixos `$2a$`, `$2b$`, `$2y$`** (texto da volta 2, agora registrado no runbook por T55). No PostgreSQL 16 local, `crypt(senha, hash) = hash`
   dá verdadeiro com `$2a$` e falso com `$2b$` e `$2y$`; o filtro `LIKE '$2_$%'` de `conta_entrar` aceita os três prefixos, mas só `$2a$` funciona. Sem risco para as
   contas do legado, que geram as senhas com `crypt($1, gen_salt('bf', 12))` do `pgcrypto` (sempre `$2a$`). Só importa em importação futura de hash `$2b$` ou
   `$2y$`: o runbook manda converter para `$2a$` antes de gravar.
2. **T51 e a meta 5**: o teste usa um hash literal `$2a$12$...` de bcrypt de custo 12 e prova entrada com a senha certa, recusa da errada com falha contada e hash
   intacto. A origem "gerado fora do Postgres" é afirmação do comentário e não foi reproduzida (`bcryptjs` não está instalado no repositório).
3. **ACE-56**: o axe roda no jsdom com `color-contrast` desligado; contraste sem prova automática. Lacuna de precisão da spec, sem mudança.
4. **ACE-15/16 na rota**: o prazo é provado no banco (N20 e M3/M4 mortos); a rota usa a sessão apagada como proxy.
5. **Meta 5 em produção**: o teste prova o comportamento da função; a confirmação com a conta real do grupo de teste continua sendo verificação manual da liberação.
6. **Allowlist do gitleaks (T56)**: o escopo é estreito (dois caminhos e o padrão `senhaSecreta = '...'` na mesma linha, `condition = "AND"`). A confirmação de que um
   segredo real nesses dois arquivos ainda seria acusado não foi feita nesta volta; o `gitleaks` do CI roda a mesma configuração.

### Achados do `seguranca.md` (fora da validação funcional)

O auditor de segurança (`.specs/features/conta-e-acesso/seguranca.md`) não encontrou crítico nem alto. Os 4 achados médios (SEC-CA-01 a 04: tomada
antecipada de conta pelo link de confirmação, cota diária do Resend esgotável, bcrypt sem limitador nas rotas com sessão, rotação de IPv6 contra o
bloqueio) foram decididos como pendências para depois do merge e antes da liberação. **Não contam como falha desta validação funcional**: nenhum
critério da spec exige o contrário, e todos os 69 estão provados. O INF-01 (gitleaks) foi tratado em T56. Ficam registrados para a liberação.

---

## Atualização da rastreabilidade

| Requisito | Estado anterior | Novo estado |
| --- | --- | --- |
| ACE-01 a ACE-55, ACE-57 a ACE-69 | ⚠️/Pending | ✅ Verificado |
| ACE-01, ACE-58 | ⚠️ sem discriminação da versão dos termos (volta 2) | ✅ Verificado (T53; N7 e N16 mortos) |
| ACE-56 | ⚠️ | ⚠️ Lacuna de precisão da spec (não bloqueante) |

(`spec.md` não foi alterado pelo verificador.)

---

## Resumo

**Geral**: ✅ Pronto para integrar. As lacunas da volta 2 (N7 e N16; mockups t25 em UTF-8) estão corrigidas e provadas. Os achados médios do
`seguranca.md` ficam para a liberação, por decisão do usuário.

**Verificação ancorada na spec**: 68 critérios provados e discriminados; 1 lacuna de precisão da spec (ACE-56).
**Sensor**: 9 de 9 mutações mortas.
**Gate**: 1650 testes e 84 comparações visuais passaram, 0 falharam; `gitleaks` sem vazamento.

**O que funciona**: cadastro com confirmação, entrada e saída, recuperação por e-mail, troca de senha e exclusão de conta, convite de admin, RLS por conta,
proteções de entrada, telas no visual do mockup, termos e privacidade, script do dono e seed. A regra de segurança de cada fluxo (sessões encerradas na troca
e na recuperação, anonimização, e-mail do convite, expiração absoluta, último admin, uso único do link) é derrubada por mutante.

**Problemas**: nenhum bloqueante.

**Próximos passos**: integrar a branch; tratar SEC-CA-01 a 04 antes da liberação; verificar manualmente a conta real do grupo de teste na liberação.
