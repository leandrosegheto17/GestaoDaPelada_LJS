# Conta e acesso — Validação (volta 2 de 3)

**Data**: 2026-10-27
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `9085f80..62aa021` (merge-base com `main` até o HEAD de `feat/conta-e-acesso`). Esta volta verifica o intervalo
`a8ec48f..62aa021` (correções T45 a T52, 11 commits, 20 arquivos) e refaz a leitura dos 69 critérios sobre o intervalo todo.
**Verificador**: subagente independente (autor ≠ verificador). Derivou a cobertura sozinho a partir da spec e do diff.

**Result**: FAIL

Resumo: as 4 lacunas da volta 1 (ACE-43/44, ACE-51, ACE-20, ACE-54) estão fechadas e os mutantes M17, M18, M26 e F1 agora morrem. T49, T50,
T51 e T52 conferem. O sensor, porém, achou um mutante novo que sobrevive em duas rotas: o valor da versão dos termos que a rota grava no aceite
(ACE-01 e a cláusula nova do ACE-58, "é a mesma gravada no aceite do cadastro") não tem asserção em nenhum teste de rota. Há também um defeito
menor de codificação nos três mockups da t25 (T47). 66 de 69 critérios provados, 2 sem discriminação, 1 lacuna de precisão da spec (ACE-56).
Gate verde. Sensor: 19 mutações, 17 mortas, 2 sobreviveram (mesma causa).

Convenção de caminhos: `api/test/` = `backend/api/test/`; `web/` = `frontend/web/src/`; `e2e/` = `frontend/web/e2e/`.

---

## Resumo da volta 1 (2026-10-27, FAIL)

Gate verde, 31 mutações (27 mortas). Quatro lacunas: (1) M17 e M18, policies de escrita de `sessoes` e `contas` abertas passavam porque os testes
usavam `WHERE` (ACE-43, ACE-44); (2) F1, nada provava a ligação do `App` entre a sessão expirada e `/entrar` com o aviso (ACE-20); (3) M26, o
intervalo de 60 s só era testado em 0 s e 61 s (ACE-51); (4) a tela t25 (`/conta/senha`) estava fora da comparação visual (ACE-54). Observações:
ACE-58/60 sem formato de versão, ACE-63 só barrava escrita de `e_dono`, sem fixture de hash externo (meta 5), sem teste de log em `esqueci-senha` e
`nova-senha`. O relatório inteiro da volta 1 está no histórico do git (`a8ec48f`).

---

## Conclusão das tarefas

52 tarefas (T1 a T52) em `tasks.md`, todas marcadas. T45 a T52 são a Phase 10 (correções da volta 1). Desvios com decisão do usuário e registro
em `tasks.md`: T49 (leitura de `e_dono` barrada, teste antigo "não barra a leitura" trocado por testes mais fortes), T50 (spec ACE-58/ACE-60
fixa `AAAA-MM-DD`; testes de `PaginaTermos`, `PaginaPrivacidade` e `acesso.test.ts` mais fortes), T47 (`telas-ativas.test.mjs`: corte
`slice(3, 39)`, 39 telas, teste novo das três t25, nenhuma asserção removida). `git grep` de `.skip/.todo/.only/xit` vazio. Dois testes saíram do
intervalo da volta 1, ambos com substituto mais forte e motivo no código: `acesso.test.ts` "é um texto não vazio" e `dono.test.ts` "não barra a
leitura de eDono".

---

## Critérios de aceite ancorados na spec

Os testes citados que não aparecem como alterados na volta 2 estão idênticos aos da volta 1 (`git diff a8ec48f..HEAD` só toca nos 20 arquivos
listados); foram relidos, e o gate completo passou. As linhas dos arquivos alterados foram recalculadas.

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| ACE-01 cadastro | 201 com a mensagem; conta sem confirmar; **data e versão dos termos gravadas**; e-mail enviado | `api/test/rotas/conta-cadastro.test.ts:19` `expect(r.status).toBe(201)`, `:20` `expect(r.corpo).toEqual({ mensagem: MENSAGEM })`; `api/test/migracoes/conta-cadastro-e-links.test.ts:129` `toMatchObject({ termos_versao: TERMOS, email_confirmado_em: null })` (chama a função do banco com um valor escrito no teste). **Nenhum teste de rota confere o valor gravado**: mutante N7 (`termosVersao: 'x'` em `backend/api/src/entrada/rotas/conta-cadastro.ts:27`) sobreviveu | ⚠️ GAP de discriminação (Fix 1) |
| ACE-02 sem aceite | 422 `termos_obrigatorios`, sem conta | `api/test/rotas/conta-cadastro.test.ts:87` `status toBe(422)`, `codigo: 'termos_obrigatorios'`, `mensagens toHaveLength(0)` | ✅ PASS |
| ACE-03 limites | 422 com o campo inválido | `api/test/rotas/conta-cadastro.test.ts:112` `campos: { [campo]: expect.any(String) }`; `backend/contrato/test/primitivos.test.ts:9`, `:38` | ✅ PASS |
| ACE-04 e-mail existente | 201 igual, conta intacta, aviso | `api/test/rotas/conta-cadastro.test.ts:40` `expect(r.corpo).toEqual(novo.corpo)`, `assunto toBe('Tentativa de cadastro com o seu e-mail')`; `api/test/migracoes/conta-cadastro-e-links.test.ts:145` `expect(await conta(email)).toEqual(antes)` | ✅ PASS |
| ACE-05 normalização | minúsculas, sem espaços | `backend/contrato/test/primitivos.test.ts:6`; `api/test/rotas/sessao.test.ts:46`; `api/test/migracoes/conta-cadastro-e-links.test.ts:136` (e-mail com outra caixa e espaços devolve `existente`) | ✅ PASS |
| ACE-06 confirmar em 24 h | confirmado, sessão aberta, `/app`; **conta existente com hash bcrypt externo entra** (meta 5) | `api/test/rotas/conta-cadastro.test.ts:151` `status toBe(204)`; `api/test/migracoes/conta-cadastro-e-links.test.ts:173` (dentro de 24 h confirma e cria sessão de 12 h), `:187` (vencido: nulo); `e2e/acesso.spec.ts:97` `toHaveURL(/\/app$/)`. T51: `api/test/migracoes/conta-entrar-hash-externo.test.ts:60` `toMatchObject({ resultado: 'ok', conta_id: contaId, nome: 'Conta Legado', sessoes: 1, falhas: 0 })`, `:65` `{ resultado: 'invalida', conta_id: null, sessoes: 0, falhas: 1 }`, `:73` `senha_hash toBe(HASH_EXTERNO)` | ✅ PASS |
| ACE-07 link inválido | tela "Link inválido ou vencido", sem sessão | `api/test/rotas/conta-cadastro.test.ts:164` `status toBe(410)`, `link_invalido`, `Set-Cookie` nulo; `web/telas/confirmar/Confirmar.test.tsx:71` | ✅ PASS |
| ACE-08 novo link | invalida o anterior; mesma resposta | `api/test/rotas/conta-cadastro.test.ts:186` `velho.status toBe(410)`; `:201` sem conta `mensagens toHaveLength(0)`; `web/telas/confirmar/Confirmar.test.tsx:94` | ✅ PASS |
| ACE-09 entrar | 200 nome e e-mail, cookie `__Host-sessao; HttpOnly; Secure; SameSite=Lax; Path=/`, sem Domain | `api/test/rotas/sessao.test.ts:24` `corpo toEqual({ nome, email })`, `cookie toMatch(/^__Host-sessao=[A-Za-z0-9_-]{43};/)`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `not.toContain('Domain')` | ✅ PASS |
| ACE-10 só o SHA-256 | banco guarda o hash | `api/test/rotas/sessao.test.ts:42` `hashes toContain(hex(sha256(token)))`, `:43` `not.toContain(hex(token))` | ✅ PASS |
| ACE-11 credenciais | 401 `credenciais_invalidas`, mesma mensagem | `api/test/rotas/sessao.test.ts:52` `errada.corpo toEqual(semConta.corpo)` | ✅ PASS |
| ACE-12 não confirmado | 403 `email_nao_confirmado`, sem sessão | `api/test/rotas/sessao.test.ts:63` `status toBe(403)`, `Set-Cookie` nulo; `web/telas/entrar/Entrar.test.tsx:87` | ✅ PASS |
| ACE-13 5 falhas | 429 `bloqueado_temporariamente` por 15 min, mesmo com senha certa | `api/test/rotas/sessao.test.ts:71` `bloqueada.status toBe(429)`; `api/test/migracoes/conta-entrar-e-sessao.test.ts:149`, `:176` (4 falhas não bloqueiam), `:183` (14 min bloqueia, 15 libera). Mutantes M1, M2, N14 mortos | ✅ PASS |
| ACE-14 outro IP | avaliado normalmente | `api/test/rotas/sessao.test.ts:83` `outroIp.status toBe(200)`; `api/test/migracoes/conta-entrar-e-sessao.test.ts:165` | ✅ PASS |
| ACE-15 15 min | 401 `sessao_expirada` | `api/test/migracoes/conta-entrar-e-sessao.test.ts:320` `tocar(token) toBeNull()` aos 15 min; `api/test/rotas/sessao-middleware.test.ts:157` | ✅ PASS |
| ACE-16 12 h | 401 mesmo com uso contínuo | `api/test/migracoes/conta-entrar-e-sessao.test.ts:330` (12 h = nulo), `:343` (11 h 59 min vale) | ✅ PASS |
| ACE-17 sair | apaga sessão, 204, cookie vencido | `api/test/rotas/sessao.test.ts:149` `status toBe(204)`, `startsWith('__Host-sessao=;')`, `Max-Age=0`, GET seguinte 401 | ✅ PASS |
| ACE-18 `GET /api/sessao` | id, nome, e-mail e grupos (id, nome, slug, `acessa_financeiro`) | `api/test/rotas/sessao.test.ts:114` `corpo toEqual({ id, nome, email, grupos: [{ id, nome, slug, acessaFinanceiro }] })`, `:133` 401 | ✅ PASS |
| ACE-19 sem sessão em `/app` | redireciona e volta | `web/app/guarda/decidir-rota.test.ts:15` `toBe('/entrar?volta=%2Fapp%2Fconta')`, `:57`; `web/app/guarda/RotaProtegida.test.tsx:55` | ✅ PASS |
| ACE-20 sessão expira durante o uso | tela em `/entrar` com "Sua sessão expirou. Entre de novo." | T46: `web/app/App.sessao-expirada.test.tsx:26` abre `/app/conta` com sessão válida, depois o `fetch` devolve 401 `sessao_expirada`; `:31` `findByText('Sua sessão expirou. Entre de novo.') toBeVisible()`, `:32` `pathname toBe('/entrar')`, `:33` `search toBe('?aviso=sessao-expirada')`. Mutante F1 morto | ✅ PASS |
| ACE-21 sem segredo no log | senha, tokens e corpo fora do log | `api/test/rotas/sessao.test.ts:98`, `conta-cadastro.test.ts:137`, `conta-minha.test.ts:63`, `convites.test.ts:152`; T52: `api/test/rotas/sessao-recuperacao.test.ts:128-129` `log not.toContain(token)` e `not.toContain(email)` (esqueci-senha, com falha do Resend, sucesso e e-mail inválido); `:148-151` `log not.toContain(senhaSecreta / tokenInexistente / tokenValido / JSON.stringify({ token, senha }))` (nova-senha: 410, 422 e 200). Mutantes N9 e N10 mortos | ✅ PASS |
| ACE-22 esqueci a senha | 200 com a mensagem exata, exista ou não | `api/test/rotas/sessao-recuperacao.test.ts:16` e `:39` `corpo toEqual({ mensagem: MENSAGEM })` | ✅ PASS |
| ACE-23 link de 1 h | invalida o anterior | `api/test/rotas/sessao-recuperacao.test.ts:25` `velho.status toBe(410)`; `api/test/migracoes/conta-cadastro-e-links.test.ts:248` (recuperação de 1 h, segundo pedido invalida o primeiro) | ✅ PASS |
| ACE-24 nova senha | troca, marca usado, encerra sessões, confirma e-mail, 200, aviso | `api/test/migracoes/conta-cadastro-e-links.test.ts:294` (senha, link usado, e-mail confirmado, sessões `[]`); `api/test/rotas/sessao-recuperacao.test.ts:87-91`; `web/telas/nova-senha/NovaSenha.test.tsx:76`; `e2e/acesso.spec.ts:127` `toHaveURL(/\/entrar\?aviso=senha-alterada$/)` | ✅ PASS |
| ACE-25 link inválido | 410 `link_invalido`, senha intacta | `api/test/rotas/sessao-recuperacao.test.ts:98-99` `status toBe(410)`, `codigo: 'link_invalido'`, `:105` `entra.status toBe(401)` | ✅ PASS |
| ACE-26 trocar senha | 204, encerra as outras, mantém a atual | `api/test/rotas/conta-minha.test.ts:14` `status toBe(204)`, atual 200, `outro` 401 | ✅ PASS |
| ACE-27 senha atual errada | 401 `senha_atual_incorreta` | `api/test/rotas/conta-minha.test.ts:32`. Mutante N4 morto | ✅ PASS |
| ACE-28 excluir | anonimiza, apaga vínculos/sessões/links, auditoria, 204 | `api/test/migracoes/conta-senha-e-exclusao.test.ts:150` `rows toEqual([{ email: 'excluida-<id>@invalido', nome: 'Conta excluída', senha_hash: '!', excluida: true }])`; `api/test/rotas/conta-minha.test.ts:79`; `web/telas/minha-conta/MinhaConta.test.tsx:101` | ✅ PASS |
| ACE-29 único admin | 409 `unico_admin` com `grupos: [{ id, nome }]` | `api/test/rotas/conta-minha.test.ts:106`; `api/test/migracoes/conta-senha-e-exclusao.test.ts:212` | ✅ PASS |
| ACE-30 senha errada na exclusão | 401, nada apagado | `api/test/rotas/conta-minha.test.ts:98`. Mutante N3 morto | ✅ PASS |
| ACE-31 convidar | 201 com id, e-mail, validade de 7 dias | `api/test/rotas/admins.test.ts:22` `status toBe(201)`, `expiraEm: stringMatching(/^\d{4}-/)`; os 7 dias em `api/test/migracoes/conta-convites.test.ts:124` | ✅ PASS |
| ACE-32 já é admin | 409 `ja_e_admin` | `api/test/rotas/admins.test.ts:40` | ✅ PASS |
| ACE-33 aceitar | vínculo com `acessa_financeiro` falso, convite usado | `api/test/repositorios/convites.test.ts:151` `rows toEqual([{ acessa_financeiro: false }])`; `api/test/rotas/convites.test.ts:50`. Mutante N5 morto | ✅ PASS |
| ACE-34 sem conta | cadastro com e-mail travado, confirmado, com vínculo | `api/test/repositorios/convites.test.ts:188` `toEqual([{ email, nome, confirmada: true }])`; `api/test/rotas/convites.test.ts:100`; `web/telas/convite/Convite.test.tsx:168` | ✅ PASS |
| ACE-35 outro e-mail | 403 `convite_de_outro_email` | `api/test/rotas/convites.test.ts:63`; `api/test/repositorios/convites.test.ts:165` | ✅ PASS |
| ACE-36 convite inválido | 410 `link_invalido` | `api/test/rotas/convites.test.ts:38`, `:73`, `:118`. Mutante N1 (aceita vencido) morto | ✅ PASS |
| ACE-37 listar | admins e convites pendentes | `api/test/rotas/admins.test.ts:73` | ✅ PASS |
| ACE-38 cancelar | invalida o link, 204 | `api/test/rotas/admins.test.ts:130` | ✅ PASS |
| ACE-39 remover | apaga vínculo, auditoria, 204 | `api/test/rotas/admins.test.ts:157` `auditoriaDe(...,'remover_admin') toEqual([{ autor_conta_id }])`. Mutante N6 morto | ✅ PASS |
| ACE-40 último admin | 409 `ultimo_admin` | `api/test/rotas/admins.test.ts:172`; `api/test/repositorios/admins.test.ts:164` | ✅ PASS |
| ACE-41 sem vínculo | 404 | `api/test/rotas/admins.test.ts:95`, `:105`; `api/test/rotas/vinculo-middleware.test.ts:35` | ✅ PASS |
| ACE-42 auditoria | autor, ação, grupo | `api/test/repositorios/admins.test.ts:202`; `api/test/rotas/admins.test.ts:22` | ✅ PASS |
| ACE-43 `contas` só a própria linha | ler e alterar só `app.conta_id` | `api/test/isolamento/contas.test.ts:98-114` (com `WHERE`); T45: `:117-134` `describe.each(PROPRIAS)('%s: escrita sem WHERE de B não toca em A')`, `UPDATE contas SET nome = 'Invasor'` e `DELETE FROM contas` sem `WHERE` como B, `:133` `expect(antes.startsWith('1:')).toBe(true)`, `:134` `expect(depois).toBe(antes)`. Mutante M18 morto (só este teste o mata) | ✅ PASS |
| ACE-44 `sessoes` só as da conta | ler e apagar só as da conta | mesmo bloco `:117-134` com `DELETE FROM sessoes`; `api/test/isolamento/contas.test.ts:169-198`; `api/test/repositorios/sessoes.test.ts:104`. Mutante M17 morto | ✅ PASS |
| ACE-45 RLS com FORCE e caso | FORCE, policy de `pelada_backup`, B não lê/altera/apaga | `api/test/migracoes/rls.test.ts:174` `ligada: true, forcada: true`; `api/test/isolamento/contas.test.ts:65` (`CASOS_CONTA` com as seis tabelas), `:98` | ✅ PASS |
| ACE-46 `auditoria` | INSERT sim; UPDATE/DELETE não | `api/test/migracoes/roles.test.ts:212` `codigoDoErro(UPDATE) toBe(SEM_PRIVILEGIO)`, `DELETE` idem | ✅ PASS |
| ACE-47 `app.conta_id` antes de dado de grupo | fixado na transação | `api/test/rotas/sessao-middleware.test.ts:107` `toEqual({ usuario: 'pelada_app', conta: s.contaId, somente_leitura: 'on' })` | ✅ PASS |
| ACE-48 toda rota tem caso (G-04) | caso por rota ou "não se aplica" | `api/test/isolamento/meta.test.ts:87` `problemasDasRotas(rotas, CASOS_ROTAS) toEqual([])`, `:96` | ✅ PASS |
| ACE-49 CSRF antes dos limitadores | 403 sem consumir cota | `api/test/rotas/sessao-middleware.test.ts:64` 11 POST dão 403, o 12º `not.toBe(429)`. Mutante M21 morto na volta 1 | ✅ PASS |
| ACE-50 `LIMITE_ENTRAR` | 429 em entrar, cadastro, esqueci, reenvio | `api/test/rotas/sessao-middleware.test.ts:80` `it.each(ROTAS_SEM_SESSAO)` `status toBe(429)`, `codigo: 'muitas_requisicoes'` | ✅ PASS |
| ACE-51 intervalo de 60 s | 59 s bloqueia, 61 s libera, mesma resposta | T48: `api/test/migracoes/conta-cadastro-e-links.test.ts:161-169` (`conta_cadastrar`: `passarSegundosDosEnvios(email, 59)` → `.enviar toBe(false)`; `+2` → `toBe(true)`) e `:213-220` (`link_pedir`: 59 s `enviar toBe(false)`, 61 s `toBe(true)`); `api/test/rotas/conta-cadastro.test.ts:63`, `sessao-recuperacao.test.ts:49-50`. Mutante M26 morto | ✅ PASS |
| ACE-52 falha do Resend | 503 `email_indisponivel`, pedido refeito funciona | `api/test/rotas/conta-cadastro.test.ts:126`, `sessao-recuperacao.test.ts:61-65`, `admins.test.ts:49`, `api/test/infraestrutura/email.test.ts:56` | ✅ PASS |
| ACE-53 `no-store` | em toda rota de `/api/sessao` e `/api/conta` | `api/test/rotas/app.test.ts:34`; `api/test/rotas/sessao.test.ts:124` | ✅ PASS |
| ACE-54 telas t04, t05, t06, t25, t08, t19 | passam na comparação visual em PC e celular | T47: `e2e/telas-ativas.txt:44-46` (`t25-senha--vazio`, `--erro`, `--sucesso`), `e2e/telas-ativas.test.mjs:50` `expect(ativas.slice(39)).toEqual(['t25-senha--vazio', 't25-senha--erro', 't25-senha--sucesso'])`; `pnpm --filter @pelada/web visual` lista as t25 nos dois viewports: 0,13% (PC) e 0,40% (celular), **OK**, limite 1%. t04, t05, t06, t08, t19 seguem na lista. Mutante N12 morto. Defeito menor nos mockups da t25: ver "Achado menor" | ✅ PASS (com achado menor) |
| ACE-55 telas novas com mockup | t29 a t33 comparadas | `e2e/telas-ativas.txt:6-43`; `visual` 0,00% a 0,27% | ✅ PASS |
| ACE-56 tokens e axe | só `tokens.css`; axe sem violação | `checar-tokens.py` "OK: nenhuma cor ou fonte fora do tokens.css"; `web/telas/cadastro/Cadastro.test.tsx:24` `expect(await violacoes(container)).toEqual([])` (e 11 outras telas). Axe no jsdom com `color-contrast` desligado (`frontend/web/test/apoio/axe.ts:5`) | ⚠️ Lacuna de precisão da spec (ambiente do axe) |
| ACE-57 estado vazio de `/app` | estado vazio do t08 | `web/telas/grupos/SeusGrupos.test.tsx:21` | ✅ PASS |
| ACE-58 `/termos` e `/privacidade` públicas, versão `AAAA-MM-DD`, **a mesma gravada no aceite** | públicas, versão e data em `AAAA-MM-DD` | T50: `web/telas/termos/PaginaTermos.test.tsx:15-18` `getByText(/^Versão \d{4}-\d{2}-\d{2}$/) toBeVisible()` e `new Date(\`${data}T00:00:00Z\`).toISOString().slice(0,10) toBe(data)` (igual em `PaginaPrivacidade.test.tsx:15-18`); `backend/contrato/test/acesso.test.ts:99-100` `toMatch(/^\d{4}-\d{2}-\d{2}$/)` e data válida; `web/app/guarda/decidir-rota.test.ts:25`. Mutante N11 morto. **A cláusula "é a mesma gravada no aceite" não tem prova**: N7 (cadastro) e N16 (cadastro por convite, `convites.ts:46`) sobreviveram | ⚠️ GAP de discriminação (Fix 1) |
| ACE-59 aceite desmarcado com links | checkbox desmarcado, links | `web/telas/cadastro/Cadastro.test.tsx:24` `not.toBeChecked()`, `href '/termos'`, `href '/privacidade'` | ✅ PASS |
| ACE-60 rascunho marcado, formato mantido | selo de rascunho; versão `AAAA-MM-DD` | `web/telas/termos/PaginaTermos.test.tsx:13` `getByText('Rascunho para revisão') toBeVisible()` mais `:15-18`; `PaginaPrivacidade.test.tsx:13`, `:15-18` | ✅ PASS |
| ACE-61 script do dono | cria ou troca a senha, sem eco | `backend/scripts/test/dono.test.ts:47` `confere('senha-dono-um') toEqual({ ok: true, e_dono: true, confirmada: true, n: 1 })`, `stdout+stderr not.toContain(senha)` | ✅ PASS |
| ACE-62 host remoto sem `--alvo` | recusa | `backend/scripts/test/dono.test.ts:68` `status toBe(1)`, `stderr toContain('informe --alvo producao ou --alvo teste')` | ✅ PASS |
| ACE-63 nenhuma rota lê ou escreve `e_dono` | sem leitura nem escrita em rota | T49: `backend/scripts/test/dono.test.ts:89-95` (escrita em rota e repositório, `toBeGreaterThan(0)`), `:99-113` `it.each` de 7 formas de leitura (propriedade, colchetes, desestruturação, projeção, `.select('e_dono')`, SQL, SQL em template), em rota e repositório, `toBeGreaterThan(0)`; `:116-122` tipo `interface` livre e `SELECT id, nome` limpo `toBe(0)`; `:124-127` `achados toEqual([])` sobre `backend/api/src/**/*.ts`. `pnpm lint` limpo. Mutante N8 morto | ✅ PASS |
| ACE-64 seed | conta confirmada com `SEED_SENHA_ADMIN`; recusa sem ela | `api/test/infraestrutura/seed-local.test.ts:111` `entrar('outra...') toBe('invalida')`, `entrar(SENHA_ADMIN) toBe('ok')`, `:135` `status toBe(1)` | ✅ PASS |
| ACE-65 logado em `/entrar` | vai a `/app` | `web/app/guarda/decidir-rota.test.ts:36` `toBe('/app')`; `RotaProtegida.test.tsx:68` | ✅ PASS |
| ACE-66 concorrência no login | as duas falhas contam | `api/test/migracoes/conta-entrar-e-sessao.test.ts:239` `falhasDoPar(email, ip) toBe(2)`, `:255` | ✅ PASS |
| ACE-67 aceite simultâneo | um vínculo, segundo 410 | `api/test/migracoes/conta-convites.test.ts:283` | ✅ PASS |
| ACE-68 mais de 72 bytes | 422 | `backend/contrato/test/primitivos.test.ts:29`, `:32` | ✅ PASS |
| ACE-69 conta excluída com sessão aberta | 401 `sessao_expirada` | `api/test/rotas/conta-minha.test.ts:79` `aparelho.status toBe(401)`; `api/test/migracoes/conta-senha-e-exclusao.test.ts:210` | ✅ PASS |

**Status**: ❌ lacuna presente. ACE-01 e ACE-58 têm asserção que passa mas não discrimina o valor da versão dos termos gravada pela rota
(mutantes N7 e N16). ACE-56 segue como lacuna de precisão da spec (não bloqueante).

### Regra de payload e conjunção

Conferidos item a item: ACE-09 (cinco atributos do cookie), ACE-18, ACE-24 (cinco efeitos no banco), ACE-28, ACE-29, ACE-34, ACE-37, ACE-39,
ACE-42. O ACE-01 é a exceção da volta: tem seis efeitos (201, mensagem, conta sem confirmar, data, **versão**, e-mail); a rota prova quatro e
o banco prova data e versão só com um valor fornecido pelo próprio teste. T51 assere o resultado, a sessão criada, a falha contada e o hash
intacto. T52 cobre sucesso e falha das duas rotas.

---

## Casos limite (spec)

- [x] ACE-65 logado abre `/entrar`: `web/app/guarda/decidir-rota.test.ts:36`
- [x] ACE-66 login concorrente: `api/test/migracoes/conta-entrar-e-sessao.test.ts:239`
- [x] ACE-67 aceite concorrente: `api/test/migracoes/conta-convites.test.ts:283`
- [x] ACE-68 senha com mais de 72 bytes: `backend/contrato/test/primitivos.test.ts:32`
- [x] ACE-69 conta excluída com sessão em outro aparelho: `api/test/rotas/conta-minha.test.ts:79`

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` fora do repositório (na pasta de rascunho do verificador), com `pnpm install --offline --frozen-lockfile`;
cada mutação aplicada na cópia, testes rodados, arquivo restaurado com `git checkout -- .`; a cópia foi removida ao fim (`git worktree list`
sem ela, diretório apagado, `git worktree prune`). `git status --porcelain`: vazio antes e vazio depois, na árvore da feature e na raiz do
repositório. Banco de teste: `conta-e-acesso-db-1` (porta 5432), uma execução por vez; os outros contêineres não foram tocados.

| # | Arquivo | Mutação | Testes executados | Resultado |
| --- | --- | --- | --- | --- |
| M17 | `1792843380000_conta-tabelas.sql` | `sessoes_apagar USING (true)` (reaplicado da volta 1) | `test/isolamento`, `roles`, `rls` | ✅ Morta (só `contas.test.ts` "sessoes: escrita sem WHERE de B", T45) |
| M18 | idem | `contas_alterar USING (true) WITH CHECK (true)` (reaplicado) | idem | ✅ Morta (só "contas: escrita sem WHERE de B", T45) |
| M26 | `1792843440000_conta-cadastro-e-links.sql` | intervalo entre e-mails 60 s para 10 s (reaplicado) | `conta-cadastro-e-links.test.ts` | ✅ Morta (2 testes de borda, T48) |
| F1 | `web/dados/consultas.ts` | `ROTA_SESSAO_EXPIRADA = '/entrar'` (reaplicado) | `src/app`, `telas/entrar`, `dados` | ✅ Morta (T46) |
| N1 | `1792843620000_conta-convites.sql` | `convite_aceitar` aceita convite vencido (remove `expira_em > now()`) | `conta-convites`, `convites` (rotas) | ✅ Morta |
| N2 | `1792843500000_conta-entrar-e-sessao.sql` | `conta_entrar` não registra a falha de login | `conta-entrar-e-sessao`, `conta-entrar-hash-externo`, `sessao` (rotas) | ✅ Morta |
| N3 | `1792843560000_conta-senha-e-exclusao.sql` | `conta_excluir` não confere a senha | `conta-senha-e-exclusao`, `conta-minha` | ✅ Morta |
| N4 | idem | `conta_trocar_senha` não confere a senha atual | idem | ✅ Morta |
| N5 | `1792843620000_conta-convites.sql` | `convite_aceitar` cria vínculo com `acessa_financeiro = true` | `conta-convites`, `repositorios/convites`, `rotas/convites` | ✅ Morta |
| N6 | `repositorios/admins.ts` | remover admin não grava a auditoria | `repositorios/admins`, `rotas/admins` | ✅ Morta |
| N7 | `rotas/conta-cadastro.ts:27` | a rota grava `termosVersao: 'x'` em vez de `TERMOS_VERSAO` | `test/rotas`, `test/repositorios`, `conta-cadastro-e-links` (22 arquivos, 269 testes) | ❌ **Sobreviveu** |
| N8 | `eslint/plugin-pelada.mjs` | o lint deixa de barrar a leitura por propriedade (`c.eDono`) | `dono.test.ts` | ✅ Morta (T49) |
| N9 | `rotas/sessao-recuperacao.ts` | `nova-senha` grava `JSON.stringify(corpo.dado)` no log | `sessao-recuperacao.test.ts` | ✅ Morta (T52) |
| N10 | idem | `esqueci-senha` grava o e-mail no log | idem | ✅ Morta (T52) |
| N11 | `backend/contrato/src/acesso.ts` | `TERMOS_VERSAO = '27/10/2026'` | `contrato` (suíte inteira) | ✅ Morta (T50, `acesso.test.ts:99`) |
| N12 | `e2e/telas-ativas.txt` | t25 sai da lista de telas comparadas | `e2e/telas-ativas.test.mjs` | ✅ Morta (T47, 2 testes) |
| N13 | `1792843500000_conta-entrar-e-sessao.sql` | `conta_entrar` só aceita hash com prefixo `$2b$` (rejeita o `$2a$` do legado) | `conta-entrar-hash-externo.test.ts` | ✅ Morta (T51) |
| N14 | idem | limite de falhas `>= 5` para `>= 6` | `conta-entrar-e-sessao`, `sessao` (rotas) | ✅ Morta (7 testes) |
| N16 | `rotas/convites.ts:46` | cadastro por convite grava `termosVersao: 'x'` | suíte API inteira (42 arquivos, 650 testes) | ❌ **Sobreviveu** |

**Profundidade**: P0 completo (autenticação e dados de conta), 19 mutações manuais nesta volta (as 4 que sobreviveram na volta 1 mais 15
novas) sobre sessão, hash e verificação de senha, expiração e uso único, limite de tentativas por e-mail e IP, autorização de admin, RLS, log
e as correções T45 a T52.
**Resultado**: 17 de 19 mortas. ❌ FAIL (2 sobreviventes, mesma causa).

Análise dos sobreviventes:

- **N7 e N16 (versão dos termos gravada pela rota)**. A rota passa `TERMOS_VERSAO` ao repositório, mas todos os testes que leem
  `termos_versao` chamam a função do banco ou o repositório com um valor escrito no próprio teste (`conta-cadastro-e-links.test.ts:129`,
  `conta-convites.test.ts:334`, `repositorios/contas.test.ts:75`). Nenhum teste de rota consulta a coluna depois de `POST /api/conta` nem
  do cadastro por convite; os fixtures de `sessao-worker.ts:61,72` usam `'teste'`. Assim, uma rota que grave qualquer outra coisa (ou nada
  coerente com a página) passa a suíte. A volta 1 não tentou esta mutação; ela só apareceu porque a spec ganhou, em T50, a cláusula "é a
  mesma gravada no aceite do cadastro" (ACE-58) e porque o ACE-01 já pedia "gravar a data e a versão dos termos aceitos".

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ (T49 removeu código: o lint ficou mais simples, 89 linhas a menos) |
| Mudanças cirúrgicas | ✅ (20 arquivos na volta 2, todos nos Where das tarefas T45 a T52) |
| Segue os padrões existentes | ✅ |
| Testes mapeiam critérios e não são rasos | ⚠️ ACE-01 e ACE-58 (valor gravado pela rota) |
| Resultado asserido bate com a spec | ⚠️ idem |
| Nenhum teste órfão | ✅ (todos citam ACE-NN) |
| Testes existentes alterados | ✅ com motivo e decisão do usuário (T47, T49, T50); `git grep` de `.skip/.only/.todo` vazio |
| Guias seguidos | `CLAUDE.md` da raiz, `.md/GUARDRAILS.md` G-02, G-03, G-04, G-08, G-09, G-11 |

---

## Edge Cases

Todos os cinco casos da spec (ACE-65 a ACE-69) com evidência acima. Casos extras da volta 2 verificados: 59 s e 61 s nos dois pontos de
entrada do intervalo; `DELETE`/`UPDATE` sem `WHERE` como B sobre `contas` e `sessoes`; hash externo com senha certa e errada.

---

## Gate

Comando: o gate Build de `tasks.md` (`.specs/projeto/testes.json`), cada etapa em sequência, uma execução por vez no banco local.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0: raiz 20, dominio 1, contrato 39, web 492 (54 arquivos), API 650 (42 arquivos) = 1202 testes, 0 falhas |
| `pnpm test:checagens` | ✅ exit 0: 432 testes (21 arquivos), 0 falhas |
| `checar-tokens.py frontend/web/src` | ✅ exit 0 |
| `pnpm --filter @pelada/web build` | ✅ exit 0 |
| `pnpm --filter @pelada/web e2e` | ✅ 15 passaram, 0 falharam |
| `pnpm --filter @pelada/web visual` | ✅ 84 comparações (42 telas, PC e celular), 0 divergentes; t25 em 0,13% (PC) e 0,40% (celular) |

- **Total executado**: 1202 + 432 + 15 = 1649 testes, mais 84 comparações visuais.
- **Delta contra a volta 1**: +11 testes em `pnpm test` (1191 para 1202: API +9, web +2, contrato 0) e +8 em `test:checagens` (424 para 432), +6 comparações visuais (as três t25 nos dois viewports). Nenhum teste a menos.
- **Pulados**: nenhum. **Falhas**: nenhuma.
- A cópia do sensor e o gate não rodaram ao mesmo tempo.

---

## Plano de correção

### Fix 1: rota grava a versão dos termos sem teste do valor (N7, N16; ACE-01, ACE-58). Prioridade: Maior

- **Causa**: os testes de rota conferem status e mensagem; os testes do banco passam o valor à mão.
- **Tarefa**: em `backend/api/test/rotas/conta-cadastro.test.ts` (e em `convites.test.ts` para o cadastro por convite), depois de `POST /api/conta`
  com sucesso, ler `contas.termos_versao` e `termos_aceitos_em` da conta criada (pelo owner do banco de teste, como já faz
  `auditoriaDe`) e conferir `termos_versao === TERMOS_VERSAO` (importado de `@pelada/contrato`) e `termos_aceitos_em` não nulo.
- **Feito quando**: N7 e N16 passam a falhar; suíte verde.

### Fix 2 (menor): mockups da t25 com byte inválido em UTF-8 (T47). Prioridade: Menor

- **Achado**: `.specs/mockup/telas/t25-senha--vazio.html`, `--erro.html` e `--sucesso.html` (linha da `<header class="barra">`) contêm
  `Gest\xE3o da Pelada` em Latin-1 dentro de arquivo `charset="utf-8"`. O navegador mostra "Gest�o da Pelada". Verificado com
  `bytes.decode('utf-8')`: só esses três, entre todos os `.html` de `.specs/mockup`, falham. A comparação visual (0,13% e 0,40%) não pega,
  porque a diferença é de poucos pixels; o app renderiza "Gestão" corretamente.
- **Tarefa**: regravar os três arquivos em UTF-8 (`ã` como `0xC3 0xA3`) sem tocar no resto; reexecutar `visual`.
- **Feito quando**: os três HTML decodificam como UTF-8 e `visual` segue abaixo de 1%.

---

## Observações que não bloqueiam

1. **pgcrypto e os prefixos `$2a$`, `$2b$`, `$2y$` (correção do texto da volta 1)**. A volta 1 afirmou que o `pgcrypto` aceita `$2a/$2b/$2y`; isso
   é falso no PostgreSQL 16 local (16.15). Medido num banco descartável (`verif_bcrypt2`, já apagado) com o hash da fixture T51 trocando só o
   prefixo: `crypt(senha, hash) = hash` dá **verdadeiro com `$2a$`**, **falso com `$2b$` e `$2y$`** (a saída vira DES, `$2vS2Nt...`), e
   `gen_salt('bf', 12)` emite `$2a$12$`. Consequência: um hash `$2b$` ou `$2y$` de outra biblioteca não entra, e `conta_entrar` o trata como
   senha errada, porque o filtro `LIKE '$2_$%'` aceita os três prefixos mas só um funciona. **Não há risco para as contas do legado**: o legado
   gera as senhas com `crypt($1, gen_salt('bf', 12))` do `pgcrypto` (`GestaodaPelada/backend/api/src/infraestrutura/db/repositorios/contas.ts:65`),
   que sempre emite `$2a$`, e o legado barra por lint o import de `bcrypt` e `bcryptjs` (`GestaodaPelada/eslint.config.mjs:23-24`), então nenhum hash dele nasce fora do `pgcrypto`. O risco só existiria em importação futura de
   hashes `$2b$`; vale uma linha no runbook. Não é achado bloqueante.
2. **T51 e a meta 5**. O teste usa um hash literal `$2a$12$...` e prova entrada com a senha certa, recusa da errada com falha contada e hash
   intacto; o mutante N13 (aceitar só `$2b$`) o derruba. A origem "gerado com bcryptjs fora do Postgres" é afirmação do comentário: `bcryptjs` não
   está instalado no repositório e eu não a reproduzi. O `pgcrypto` confirma que o hash é um bcrypt de custo 12 válido para a senha, o que
   basta para o fim do teste.
3. **ACE-56**: o axe roda no jsdom com `color-contrast` desligado; contraste sem prova automática. Lacuna de precisão da spec, sem mudança.
4. **ACE-15/16 na rota**: o prazo é provado no banco (M3, M4 mortos na volta 1); a rota usa a sessão apagada como proxy.
5. **Meta 5 em produção**: o teste prova o comportamento da função; a confirmação com a conta real do grupo de teste continua sendo verificação
   manual da liberação.

---

## Atualização da rastreabilidade

| Requisito | Estado anterior | Novo estado |
| --- | --- | --- |
| ACE-02 a ACE-57, ACE-59 a ACE-69 (exceto ACE-56) | ⚠️/❌/Pending | ✅ Verificado |
| ACE-43, ACE-44, ACE-51, ACE-20, ACE-54, ACE-60, ACE-63 | ⚠️/❌ (volta 1) | ✅ Verificado (T45 a T52) |
| ACE-01, ACE-58 | ✅ / ⚠️ | ⚠️ Verificado sem discriminação da versão dos termos (Fix 1) |
| ACE-56 | ⚠️ | ⚠️ Lacuna de precisão da spec |

(`spec.md` não foi alterado pelo verificador.)

---

## Resumo

**Geral**: ❌ Não pronto para integrar (um mutante a eliminar e um defeito menor de codificação).

**Verificação ancorada na spec**: 66 critérios provados; 2 sem discriminação (ACE-01, ACE-58); 1 lacuna de precisão da spec (ACE-56).
**Sensor**: 17 de 19 mutações mortas.
**Gate**: 1649 testes e 84 comparações visuais passaram, 0 falharam.

**O que funciona**: as quatro lacunas da volta 1 estão fechadas, cada uma com um teste que mata o mutante correspondente (M17, M18, M26, F1).
T49 (leitura e escrita de `e_dono` barradas), T50 (formato `AAAA-MM-DD` na spec e nos testes), T51 (hash externo entra) e T52 (log sem segredo
nas duas rotas de recuperação) conferem e discriminam (N8, N11, N13, N9, N10). Autorização de admin, expiração e uso único de links, limite por
e-mail e IP, verificação de senha e RLS seguem provados.

**Problemas**: Fix 1 (versão dos termos gravada pela rota) e Fix 2 (mockups da t25 com byte inválido).

**Próximos passos**: despachar Fix 1 e Fix 2 ao implementador e reverificar (volta 3 de 3).
