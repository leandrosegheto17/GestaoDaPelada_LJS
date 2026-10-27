# Conta e acesso — Validação

**Data**: 2026-10-27
**Spec**: `.specs/features/conta-e-acesso/spec.md`
**Intervalo de commits**: `9085f80..51ef53f` (merge-base com `main` até HEAD da `feat/conta-e-acesso`, 51 commits, 231 arquivos)
**Verificador**: subagente independente (autor ≠ verificador). Derivou a cobertura sozinho a partir da spec e do diff.

**Result**: FAIL

Resumo: 69 critérios rastreados. 63 com asserção que prova o resultado definido na spec; 2 com lacuna (ACE-20 e ACE-54); 3 com
cobertura que passa mas não discrimina (ACE-43/44 e ACE-51: mutantes sobreviventes); 4 lacunas de precisão da spec. Gate verde.
Sensor: 31 mutações, 27 mortas, 4 sobreviveram (viram tarefas de correção).

Convenção de caminhos nas tabelas: `api/test/` = `backend/api/test/`; `web/` = `frontend/web/src/`; `e2e/` = `frontend/web/e2e/`.

---

## Conclusão das tarefas

44 tarefas (T1 a T44) em `tasks.md`: 137 caixas marcadas, 0 pendentes, nenhuma bloqueada ou parcial. Os registros de aprovação dos lotes 2
a 8 estão no topo de `tasks.md` e cobrem os desvios aprovados pelo usuário: `admins_listar` (SPEC_DEVIATION do C1), `convites_admin`
lido só com conta, `SEED_SENHA_ADMIN` só no `.env.example`, recorrência fora de t08, texto do convite em t31, `playwright.config.ts` e
`config-fundacao.mjs`, mudanças em `roles.test.ts`, `migrar.test.ts`, `App.test.tsx` e `telas-ativas.test.mjs`. Desvios aprovados não são
falha. Dois pontos sem registro explícito, ambos de baixa gravidade: (a) a mudança em `api/test/migracoes/rls.test.ts` (a leitura de
`convites_admin` pelo slug público sai da lista e ganha teste próprio) não aparece nos registros, embora decorra do SPEC_DEVIATION
registrado em `conta-tabelas.sql:84`; (b) o SPEC_DEVIATION de `backend/contrato/src/acesso.ts:6` (valor inicial de `TERMOS_VERSAO`) fica só
no código.

---

## Critérios de aceite ancorados na spec

| Critério | Resultado definido na spec | `arquivo:linha` + asserção | Resultado |
| --- | --- | --- | --- |
| ACE-01 cadastro | 201, mensagem "Enviamos um link de confirmação para o seu e-mail", conta sem confirmar, data e versão dos termos, e-mail enviado | `api/test/rotas/conta-cadastro.test.ts:19` `expect(r.status).toBe(201)`, `expect(r.corpo).toEqual({ mensagem: MENSAGEM })` (literal na linha 8); `api/test/migracoes/conta-cadastro-e-links.test.ts:123` `toMatchObject({ termos_versao: TERMOS, email_confirmado_em: null })` e `termos_aceitos_em toBeInstanceOf(Date)` | ✅ PASS |
| ACE-02 sem aceite | 422 `termos_obrigatorios`, conta não criada | `api/test/rotas/conta-cadastro.test.ts:87` `expect(r.status).toBe(422)`, `codigo: 'termos_obrigatorios'`, `mensagens toHaveLength(0)`, entrar depois dá 401 | ✅ PASS |
| ACE-03 limites | 422 com o campo inválido, conta não criada | `api/test/rotas/conta-cadastro.test.ts:112` `campos: { [campo]: expect.any(String) }`; `backend/contrato/test/primitivos.test.ts:9` (254 aceita, 255 recusa), `:38` (nome 2 a 60) | ✅ PASS |
| ACE-04 e-mail existente | 201 igual ao novo, conta intacta, aviso ao dono | `api/test/rotas/conta-cadastro.test.ts:40` `expect(r.corpo).toEqual(novo.corpo)`, `aviso.assunto toBe('Tentativa de cadastro com o seu e-mail')`, senha antiga ainda entra; `api/test/migracoes/conta-cadastro-e-links.test.ts:140` `expect(await conta(email)).toEqual(antes)` | ✅ PASS |
| ACE-05 normalização | minúsculas, sem espaços, iguais | `backend/contrato/test/primitivos.test.ts:6`; `api/test/rotas/sessao.test.ts:46`; `api/test/rotas/conta-cadastro.test.ts:80` `mensagens[0]?.para toBe(email)`; `api/test/migracoes/conta-cadastro-e-links.test.ts:123` | ✅ PASS |
| ACE-06 confirmar em 24 h | e-mail confirmado, sessão aberta, vai a `/app` | `api/test/rotas/conta-cadastro.test.ts:151` `r.status toBe(204)` e `GET /api/sessao` 200 com cookie; `api/test/migracoes/conta-cadastro-e-links.test.ts:163` (23,9 h vale, sessão de 12 h) e `:176` (24 h = nulo); `e2e/acesso.spec.ts:97` `toHaveURL(/\/app$/)` | ✅ PASS |
| ACE-07 link inválido | tela "Link inválido ou vencido", sem sessão | `api/test/rotas/conta-cadastro.test.ts:164` `status toBe(410)`, `link_invalido`, `Set-Cookie` nulo; `web/telas/confirmar/Confirmar.test.tsx:71` | ✅ PASS |
| ACE-08 novo link | invalida o anterior, mesma resposta exista ou não a conta | `api/test/rotas/conta-cadastro.test.ts:186` `velho.status toBe(410)`, `confirma.status toBe(204)`; `:201` sem conta `mensagens toHaveLength(0)`; `web/telas/confirmar/Confirmar.test.tsx:94` | ✅ PASS |
| ACE-09 entrar | 200 com nome e e-mail, cookie `__Host-sessao; HttpOnly; Secure; SameSite=Lax; Path=/`, sem Domain | `api/test/rotas/sessao.test.ts:24` `corpo toEqual({ nome, email })`, `cookie toMatch(/^__Host-sessao=[A-Za-z0-9_-]{43};/)`, contém `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `not.toContain('Domain')` | ✅ PASS |
| ACE-10 só o SHA-256 | banco guarda o hash, nunca o token | `api/test/rotas/sessao.test.ts:42` `hashes toContain(hex(sha256(token)))` e `:43` `not.toContain(hex(token))`; `api/test/repositorios/contas.test.ts:93` | ✅ PASS |
| ACE-11 credenciais | 401 `credenciais_invalidas`, mesma mensagem | `api/test/rotas/sessao.test.ts:52` `errada.corpo toEqual(semConta.corpo)`, `codigo: 'credenciais_invalidas'` | ✅ PASS |
| ACE-12 não confirmado | 403 `email_nao_confirmado`, sem sessão, tela oferece reenviar | `api/test/rotas/sessao.test.ts:63` `status toBe(403)`, `Set-Cookie` nulo; `web/telas/entrar/Entrar.test.tsx:87` | ✅ PASS |
| ACE-13 5 falhas | 429 `bloqueado_temporariamente` até 15 min depois da quinta, mesmo com senha certa | `api/test/rotas/sessao.test.ts:71` `bloqueada.status toBe(429)`; `api/test/migracoes/conta-entrar-e-sessao.test.ts:149` (`bloqueado_ate` = max+15 min), `:183` (14 min bloqueia, 15 min libera), `:176` (4 falhas não bloqueiam) | ✅ PASS |
| ACE-14 outro IP | avaliado normalmente | `api/test/rotas/sessao.test.ts:83` `outroIp.status toBe(200)`; `api/test/migracoes/conta-entrar-e-sessao.test.ts:165` | ✅ PASS |
| ACE-15 15 min | 401 `sessao_expirada` | `api/test/migracoes/conta-entrar-e-sessao.test.ts:320` `expect(await tocar(token)).toBeNull()` aos 15 min; `api/test/rotas/sessao-middleware.test.ts:157` 401 `sessao_expirada` (usa a sessão apagada como proxy do vencimento; o prazo em si é provado no banco) | ✅ PASS |
| ACE-16 12 h | 401 `sessao_expirada` mesmo com uso contínuo | `api/test/migracoes/conta-entrar-e-sessao.test.ts:330` 12 h = nulo, `:343` 11 h 59 min vale; `api/test/rotas/sessao-middleware.test.ts:157` | ✅ PASS |
| ACE-17 sair | apaga sessão, 204, cookie vencido | `api/test/rotas/sessao.test.ts:149` `status toBe(204)`, `cookie.startsWith('__Host-sessao=;')`, `Max-Age=0`, GET seguinte 401 | ✅ PASS |
| ACE-18 `GET /api/sessao` | 200 com id, nome, e-mail e grupos (id, nome, slug, `acessa_financeiro`); sem sessão 401 | `api/test/rotas/sessao.test.ts:114` `corpo toEqual({ id, nome, email, grupos: [{ id, nome, slug, acessaFinanceiro }] })`; `:133` 401 | ✅ PASS |
| ACE-19 sem sessão em `/app` | redireciona a `/entrar` e volta à rota pedida | `web/app/guarda/decidir-rota.test.ts:15` `toBe('/entrar?volta=%2Fapp%2Fconta')`, `:57` `destinoAposEntrar('/app/conta') toBe('/app/conta')`; `web/app/guarda/RotaProtegida.test.tsx:55` | ✅ PASS |
| ACE-20 sessão expira durante o uso | tela vai a `/entrar` com "Sua sessão expirou. Entre de novo." | `web/dados/cliente.test.ts:97` só prova que `aoSessaoExpirada` é chamado; `web/telas/entrar/Entrar.test.tsx:122` prova o texto com a URL escrita à mão. A ligação real, `web/app/App.tsx:10` `aoSessaoExpirada: () => void roteador.navigate(ROTA_SESSAO_EXPIRADA)`, não tem teste: o mutante F1 (`ROTA_SESSAO_EXPIRADA = '/entrar'`) sobreviveu | ❌ GAP |
| ACE-21 sem segredo no log | senha, token da sessão e dos links, corpo das rotas de autenticação | `api/test/rotas/sessao.test.ts:98`, `api/test/rotas/conta-cadastro.test.ts:137`, `api/test/rotas/conta-minha.test.ts:63`, `api/test/rotas/convites.test.ts:152` `expect(log).not.toContain(...)`. Fica sem teste de log `esqueci-senha` e `nova-senha` (observação, abaixo) | ✅ PASS |
| ACE-22 esqueci a senha | 200 com a mensagem exata, exista ou não a conta | `api/test/rotas/sessao-recuperacao.test.ts:11` e `:32` `corpo toEqual({ mensagem: MENSAGEM })` (literal na linha 7) | ✅ PASS |
| ACE-23 link de 1 h | invalida o anterior | `api/test/rotas/sessao-recuperacao.test.ts:11` `velho.status toBe(410)`; `api/test/migracoes/conta-cadastro-e-links.test.ts:238` `link(primeiro) toEqual({ tipo: 'recuperacao', horas: 1, usado: false })` | ✅ PASS |
| ACE-24 nova senha | troca senha, marca link usado, encerra sessões, confirma e-mail, 200, aviso "Senha alterada. Entre com a nova senha." | `api/test/migracoes/conta-cadastro-e-links.test.ts:277` (`senhaConfere`, `email_confirmado_em` Date, `usado` true, `sessoesDe` `[]`); `api/test/rotas/sessao-recuperacao.test.ts:75`; `web/telas/nova-senha/NovaSenha.test.tsx:76`; `e2e/acesso.spec.ts:127` `toHaveURL(/\/entrar\?aviso=senha-alterada$/)` | ✅ PASS |
| ACE-25 link inválido | 410 `link_invalido`, senha intacta | `api/test/rotas/sessao-recuperacao.test.ts:93` `status toBe(410)`, `entra.status toBe(401)` | ✅ PASS |
| ACE-26 trocar senha | 204, encerra as outras sessões, mantém a atual | `api/test/rotas/conta-minha.test.ts:14` `r.status toBe(204)`, sessão atual 200, `outro` 401; `api/test/migracoes/conta-senha-e-exclusao.test.ts:126` | ✅ PASS |
| ACE-27 senha atual errada | 401 `senha_atual_incorreta`, não troca | `api/test/rotas/conta-minha.test.ts:32` `status toBe(401)`, `codigo: 'senha_atual_incorreta'` | ✅ PASS |
| ACE-28 excluir | apaga sessões, vínculos e links; anonimiza; auditoria "Conta excluída"; 204; tela vai a `/` com aviso | `api/test/migracoes/conta-senha-e-exclusao.test.ts:150` `rows toEqual([{ email: 'excluida-<id>@invalido', nome: 'Conta excluída', senha_hash: '!', excluida: true }])`, `autor toEqual([{ nome: 'Conta excluída' }])`; `api/test/rotas/conta-minha.test.ts:79` `status toBe(204)`; `web/telas/minha-conta/MinhaConta.test.tsx:101` | ✅ PASS |
| ACE-29 único admin | 409 `unico_admin` com lista (id e nome), sem apagar | `api/test/rotas/conta-minha.test.ts:106` `erro: { codigo: 'unico_admin', grupos: [{ id, nome }] }`; `api/test/migracoes/conta-senha-e-exclusao.test.ts:212` (ordenada, ignora arquivado e compartilhado) | ✅ PASS |
| ACE-30 senha errada na exclusão | 401 `senha_atual_incorreta`, nada apagado | `api/test/rotas/conta-minha.test.ts:98` `status toBe(401)` e sessão ainda 200 | ✅ PASS |
| ACE-31 convidar | 201 com id, e-mail e validade, 7 dias, e-mail enviado | `api/test/rotas/admins.test.ts:22` `status toBe(201)`, `toMatchObject({ id, email, expiraEm: stringMatching(/^\d{4}-/) })`; os 7 dias estão em `api/test/migracoes/conta-convites.test.ts:124` e no mutante M13 (morto) | ✅ PASS |
| ACE-32 já é admin | 409 `ja_e_admin`, sem convite | `api/test/rotas/admins.test.ts:40` `status toBe(409)`, `mensagens toHaveLength(antes)` | ✅ PASS |
| ACE-33 aceitar | vínculo com `acessa_financeiro` falso, convite usado, vai ao grupo | `api/test/repositorios/convites.test.ts:151` `rows toEqual([{ acessa_financeiro: false }])`; `api/test/rotas/convites.test.ts:50` `corpo toEqual({ grupoId })`; convite marcado como usado: mutante M28 morto | ✅ PASS |
| ACE-34 sem conta | cadastro com e-mail travado, nasce confirmado e com vínculo | `api/test/repositorios/convites.test.ts:188` `contaCriada.rows toEqual([{ email, nome, confirmada: true }])`; `api/test/rotas/convites.test.ts:100`; `web/telas/convite/Convite.test.tsx:168` | ✅ PASS |
| ACE-35 outro e-mail | 403 `convite_de_outro_email`, sem vínculo | `api/test/rotas/convites.test.ts:63`; `api/test/repositorios/convites.test.ts:165` `rowCount toBe(0)` | ✅ PASS |
| ACE-36 convite inválido | 410 `link_invalido` | `api/test/rotas/convites.test.ts:38`, `:73`, `:118` `status toBe(410)` | ✅ PASS |
| ACE-37 listar | admins (id, nome, e-mail, `acessa_financeiro`) e convites pendentes (id, e-mail, validade) | `api/test/rotas/admins.test.ts:73` `arrayContaining([{ id, nome, email, acessaFinanceiro: false }])`, `convites toContainEqual({ id, email, expiraEm: expect.any(String) })` | ✅ PASS |
| ACE-38 cancelar | invalida o link, 204 | `api/test/rotas/admins.test.ts:130` `status toBe(204)`, `ler.status toBe(410)` | ✅ PASS |
| ACE-39 remover | apaga vínculo, auditoria, 204 | `api/test/rotas/admins.test.ts:157` `status toBe(204)`, `auditoriaDe(...,'remover_admin') toEqual([{ autor_conta_id }])` | ✅ PASS |
| ACE-40 último admin | 409 `ultimo_admin`, vínculo fica | `api/test/rotas/admins.test.ts:172`; `api/test/repositorios/admins.test.ts:164` (duas remoções simultâneas deixam um) | ✅ PASS |
| ACE-41 sem vínculo | 404 | `api/test/rotas/admins.test.ts:95` e `:105` `status toBe(404)`; `api/test/rotas/vinculo-middleware.test.ts:35` | ✅ PASS |
| ACE-42 auditoria | linha com autor, ação e grupo | `api/test/repositorios/admins.test.ts:202`; `api/test/rotas/admins.test.ts:22` `auditoriaDe(GRUPO_A.grupo,'convidar_admin',id) toEqual([{ autor_conta_id }])` | ✅ PASS |
| ACE-43 `contas` só a própria linha | ler e alterar só `app.conta_id`; resto por função | `api/test/isolamento/contas.test.ts:64` (A lê `[A]`, B não lê, B não altera); `api/test/migracoes/roles.test.ts:197` `alterar toEqual(['nome'])`. Mutante M18 (`contas_alterar USING (true)`) e M16 (`contas_ler`): M16 morto, M18 sobreviveu | ⚠️ GAP de discriminação (Fix 1) |
| ACE-44 `sessoes` só as da conta | ler e apagar só as da conta; nunca o hash de outra | `api/test/isolamento/contas.test.ts:64` e `:139`; `api/test/repositorios/sessoes.test.ts:104`. Mutante M17 (`sessoes_apagar USING (true)`) sobreviveu | ⚠️ GAP de discriminação (Fix 1) |
| ACE-45 RLS com FORCE e caso de isolamento | FORCE, policy de `pelada_backup`, B não lê/altera/apaga | `api/test/migracoes/rls.test.ts:174` `rows toEqual(DE_CONTA.map(... ligada: true, forcada: true))`; `api/test/isolamento/contas.test.ts:56`; `api/test/isolamento/contas.test.ts:155` | ✅ PASS |
| ACE-46 `auditoria` | INSERT sim; UPDATE/DELETE não | `api/test/migracoes/roles.test.ts:212` `codigoDoErro(UPDATE) toBe(SEM_PRIVILEGIO)`, `codigoDoErro(DELETE) toBe(SEM_PRIVILEGIO)` | ✅ PASS |
| ACE-47 `app.conta_id` antes de dado de grupo | fixado na transação da requisição | `api/test/rotas/sessao-middleware.test.ts:107` `corpo toEqual({ usuario: 'pelada_app', conta: s.contaId, somente_leitura: 'on' })` e `:115` (`'off'`) | ✅ PASS |
| ACE-48 toda rota tem caso (G-04) | caso por rota ou "não se aplica" justificado | `api/test/isolamento/meta.test.ts:87` `problemasDasRotas(rotas, CASOS_ROTAS) toEqual([])`; `:96` rota nova sem caso é apontada | ✅ PASS |
| ACE-49 CSRF antes dos limitadores | 403 sem consumir cota | `api/test/rotas/sessao-middleware.test.ts:64` 11 POST sem cabeçalho dão 403, o 12º `not.toBe(429)`, `entrar.chaves toHaveLength(1)` | ✅ PASS |
| ACE-50 `LIMITE_ENTRAR` | entrar, cadastro, esqueci, reenvio (e as demais rotas sem sessão): 429 | `api/test/rotas/sessao-middleware.test.ts:80` `it.each(ROTAS_SEM_SESSAO)` `status toBe(429)`, `codigo: 'muitas_requisicoes'`; rotas com sessão não passam (`:92`) | ✅ PASS |
| ACE-51 intervalo de 60 s | segundo pedido em menos de 60 s: mesma resposta, sem novo e-mail | `api/test/rotas/conta-cadastro.test.ts:63`, `api/test/rotas/sessao-recuperacao.test.ts:42`; `api/test/migracoes/conta-cadastro-e-links.test.ts:152` (imediato bloqueia, 61 s libera). Mutante M26 (60 s para 10 s) sobreviveu: nenhum teste exercita 1 a 59 s | ⚠️ GAP de discriminação (Fix 3) |
| ACE-52 falha do Resend | 503 `email_indisponivel`, erro sem conteúdo, conta/pedido mantido | `api/test/rotas/conta-cadastro.test.ts:126` `falha.status toBe(503)`, `de_novo.status toBe(201)`; `api/test/rotas/sessao-recuperacao.test.ts:52`; `api/test/rotas/admins.test.ts:49`; `api/test/infraestrutura/email.test.ts:56` (log só com status e código) | ✅ PASS |
| ACE-53 `no-store` | em toda rota de `/api/sessao` e `/api/conta` | `api/test/rotas/app.test.ts:34` `Cache-Control toBe('no-store')` (middleware global de `/api/*`, em 200/404/500/403/429); `api/test/rotas/sessao.test.ts:124` na rota real | ✅ PASS |
| ACE-54 telas t04, t05, t06, t25, t08, t19 na comparação visual (PC e celular) | passam na comparação visual | t04, t05, t06, t08, t19 estão em `e2e/telas-ativas.txt:6-30` e a execução de `pnpm --filter @pelada/web visual` deu 78 comparações OK, 0 divergentes. **t25 (`/conta/senha`) não está em `e2e/telas-ativas.txt`, nem tem `"real": true` em `.specs/mockup/telas.json:182`**: nunca é comparada. `web/telas/minha-senha/MinhaSenha.test.tsx:67` testa o comportamento, não a aparência | ❌ GAP (Fix 4) |
| ACE-55 telas novas com mockup aprovado e comparação | t29 a t33 | `.specs/mockup/telas/t29-*` a `t33-*` existem; `e2e/telas-ativas.txt` lista as telas t29, t30, t31, t32 e t33 e `visual` as dá 0,00% a 0,27% (limite 1%) | ✅ PASS |
| ACE-56 tokens e axe | só `tokens.css`; axe sem violação | `python .claude/scripts/checar-tokens.py frontend/web/src` saída "OK: nenhuma cor ou fonte fora do tokens.css"; `web/telas/cadastro/Cadastro.test.tsx:24` `expect(await violacoes(container)).toEqual([])` (e 11 outras telas). O axe roda no jsdom com `color-contrast` desligado (`frontend/web/test/apoio/axe.ts:5`) | ⚠️ Lacuna de precisão da spec |
| ACE-57 estado vazio de `/app` | estado vazio do t08 | `web/telas/grupos/SeusGrupos.test.tsx:21` `heading 'Nenhum grupo ainda'` visível, `queryByRole('list') toBeNull()` | ✅ PASS |
| ACE-58 `/termos` e `/privacidade` públicas com versão e data | públicas, versão e data do texto | `web/app/rotas.test.tsx:39`; `web/telas/termos/PaginaTermos.test.tsx:11` `getByText(\`Versão ${TERMOS_VERSAO}\`)`; `web/app/guarda/decidir-rota.test.ts:25` (abrem sem sessão). A spec não fixa a versão nem a data, e o teste compara o texto com a própria constante | ⚠️ Lacuna de precisão da spec |
| ACE-59 aceite desmarcado com links | checkbox desmarcado, links para as duas páginas | `web/telas/cadastro/Cadastro.test.tsx:24` `getByRole('checkbox') not.toBeChecked()`, `link 'termos de uso' href '/termos'`, `link 'política de privacidade' href '/privacidade'` | ✅ PASS |
| ACE-60 rascunho marcado | selo de rascunho até aprovação | `web/telas/termos/PaginaTermos.test.tsx:12` `getByText('Rascunho para revisão') toBeVisible()`; `web/telas/privacidade/PaginaPrivacidade.test.tsx:1` | ⚠️ Lacuna de precisão da spec (o valor da versão e a data não são definidos) |
| ACE-61 script do dono | cria ou troca a senha, sem eco e sem mostrar | `backend/scripts/test/dono.test.ts:47` `confere('senha-dono-um') toEqual({ ok: true, e_dono: true, confirmada: true, n: 1 })`, `stdout+stderr not.toContain(senha)` | ✅ PASS |
| ACE-62 host remoto sem `--alvo` | recusa sem alterar nada | `backend/scripts/test/dono.test.ts:68` `status toBe(1)`, `stderr toContain('informe --alvo producao ou --alvo teste')` | ✅ PASS |
| ACE-63 nenhuma rota lê/escreve `e_dono` | sem rota que leia ou escreva | `backend/scripts/test/dono.test.ts:82` regra de lint `pelada/sem-escrita-dono` barra a escrita em rota e repositório (`toBeGreaterThan(0)`). Atenção: o teste cobre a escrita de `e_dono`; a spec diz "ler ou escrever", e o lint não barra a leitura (`:107` `toBe(0)`) | ⚠️ Lacuna de precisão da spec (ver abaixo) |
| ACE-64 seed | conta admin confirmada com a senha de `SEED_SENHA_ADMIN`; recusa sem ela | `api/test/infraestrutura/seed-local.test.ts:111` `entrar('outra...') toBe('invalida')`, `entrar(SENHA_ADMIN) toBe('ok')`; `:135` sem a variável `status toBe(1)` e nada gravado | ✅ PASS |
| ACE-65 logado em `/entrar` | vai a `/app` | `web/app/guarda/decidir-rota.test.ts:36` `decidirRota(sessao, em('/entrar')) toBe('/app')`; `web/app/guarda/RotaProtegida.test.tsx:68` | ✅ PASS |
| ACE-66 concorrência no login | as duas falhas contam | `api/test/migracoes/conta-entrar-e-sessao.test.ts:239` `falhasDoPar(email, ip) toBe(2)`; `:255` quinta falha simultânea | ✅ PASS |
| ACE-67 aceite simultâneo | no máximo um vínculo, segundo recebe 410 | `api/test/migracoes/conta-convites.test.ts:283` | ✅ PASS |
| ACE-68 senha de mais de 72 bytes | 422 | `backend/contrato/test/primitivos.test.ts:29` (20 emojis) e `:32` (acentuados abaixo de 72 caracteres) | ✅ PASS |
| ACE-69 conta excluída com sessão aberta | 401 `sessao_expirada` | `api/test/rotas/conta-minha.test.ts:79` `aparelho.status toBe(401)`, `codigo: 'sessao_expirada'`; `api/test/migracoes/conta-senha-e-exclusao.test.ts:210` | ✅ PASS |

**Status**: ❌ lacunas presentes. ACE-20 e ACE-54 sem prova do resultado da spec; ACE-43, ACE-44 e ACE-51 com asserção que passa
mas não discrimina (mutantes sobreviventes).

### Regra de payload e conjunção

Critérios com vários campos ou efeitos foram conferidos item a item: ACE-09 (cinco atributos do cookie), ACE-18 (id, nome, e-mail e
quatro campos de cada grupo, por `toEqual`), ACE-24 (cinco efeitos, no banco), ACE-28 (sessões, vínculos, links, anonimização,
auditoria), ACE-29 (id e nome), ACE-34 (conta confirmada, vínculo e sessão), ACE-37, ACE-39 e ACE-42. Todos asseridos no estado do
banco ou no corpo completo, sem satisfazer a conjunção por um item só. Três exceções fracas: ACE-31 só confere o formato de `expiraEm`
na rota (os 7 dias são provados no banco e pelo mutante M13); ACE-33 não confere "convite usado" na rota (provado no banco; M28 morto);
ACE-58 confere o texto da versão contra a própria constante.

---

## Casos limite (spec)

- [x] ACE-65 logado abre `/entrar`: `web/app/guarda/decidir-rota.test.ts:36`
- [x] ACE-66 login concorrente: `api/test/migracoes/conta-entrar-e-sessao.test.ts:239`
- [x] ACE-67 aceite concorrente: `api/test/migracoes/conta-convites.test.ts:283`
- [x] ACE-68 senha com mais de 72 bytes: `backend/contrato/test/primitivos.test.ts:32`
- [x] ACE-69 conta excluída com sessão em outro aparelho: `api/test/rotas/conta-minha.test.ts:79`

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` fora do repositório, com `pnpm install --offline`; cada mutação aplicada, testes rodados e
restaurados; a cópia foi removida ao fim (`git worktree list` sem ela, diretório apagado). `git status --porcelain` da árvore real: vazio
antes e vazio depois (idêntico). Banco de teste: `conta-e-acesso-db-1` (porta 5432); nenhum outro container tocado.

| # | Arquivo | Mutação | Testes executados | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `1792843500000_conta-entrar-e-sessao.sql` | limite de falhas `>= 5` para `>= 6` | `conta-entrar-e-sessao.test.ts` | ✅ Morta |
| M2 | idem | bloqueio deixa de ser por IP (vale para o e-mail de qualquer IP) | idem | ✅ Morta |
| M3 | idem | `sessao_tocar`: inatividade 15 para 16 min | idem | ✅ Morta |
| M4 | idem | `sessao_tocar`: remove o teto absoluto de 12 h | idem | ✅ Morta |
| M5 | idem | sessão dura 24 h em vez de 12 h | idem | ✅ Morta |
| M6 | idem | `v_ok` ignora a senha (qualquer senha entra em conta com hash válido) | idem | ✅ Morta |
| M7 | `1792843440000_conta-cadastro-e-links.sql` | bcrypt custo 12 para 8 | `conta-cadastro-e-links.test.ts` | ✅ Morta |
| M8 | idem | link de confirmação usado volta a valer | idem | ✅ Morta |
| M9 | idem | aceita link de confirmação vencido há até 1 h | idem | ✅ Morta |
| M10 | idem | link de recuperação vale 2 h em vez de 1 h | idem | ✅ Morta |
| M11 | idem | link de recuperação reutilizável | idem | ✅ Morta |
| M12 | `1792843620000_conta-convites.sql` | `convite_aceitar` sem a checagem do e-mail do convite | `conta-convites.test.ts` | ✅ Morta |
| M13 | idem | convite vale 8 dias em vez de 7 | idem | ✅ Morta |
| M14 | `1792843560000_conta-senha-e-exclusao.sql` | `conta_excluir` ignora único admin | `conta-senha-e-exclusao.test.ts` | ✅ Morta |
| M15 | idem | `conta_trocar_senha` apaga também a sessão atual | idem | ✅ Morta |
| M16 | `1792843380000_conta-tabelas.sql` | `contas_ler` com `USING (true)` | isolamento, roles, rls | ✅ Morta |
| M17 | idem | `sessoes_apagar` com `USING (true)` | idem | ❌ **Sobreviveu** |
| M18 | idem | `contas_alterar` com `USING (true) WITH CHECK (true)` | idem | ❌ **Sobreviveu** |
| M19 | `repositorios/admins.ts` | `vinculos.length <= 1` para `< 1` (permite remover o último admin) | `admins.test.ts` (repositório e rota) | ✅ Morta |
| M20 | `sessao/cookie.ts` | `httpOnly: false` | `sessao.test.ts`, `cookie.test.ts` | ✅ Morta |
| M21 | `entrada/app.ts` | CSRF depois dos limitadores | `sessao-middleware.test.ts` | ✅ Morta |
| M22 | idem | `esqueci-senha` sai do `LIMITE_ENTRAR` | idem | ✅ Morta |
| M23 | `middlewares/sessao.ts` | não guarda o hash da sessão atual | `sessao.test.ts`, `conta-minha.test.ts` | ✅ Morta |
| M24 | `rotas/sessao.ts` | ignora `CF-Connecting-IP` (todos dividem a chave) | `sessao.test.ts` | ✅ Morta |
| M25 | `middlewares/vinculo.ts` | grupo sem vínculo não dá 404 | `vinculo-middleware.test.ts`, `admins.test.ts` | ✅ Morta |
| M26 | `1792843440000_conta-cadastro-e-links.sql` | intervalo entre e-mails 60 s para 10 s | `conta-cadastro-e-links.test.ts` | ❌ **Sobreviveu** |
| M27 | `sessao/token.ts` | o hash gravado deixa de ser o SHA-256 do token | `token.test.ts`, `sessao.test.ts` | ✅ Morta |
| M28 | `1792843620000_conta-convites.sql` | `convite_aceitar` não marca o convite como usado | `conta-convites.test.ts` | ✅ Morta |
| F1 | `web/dados/consultas.ts` | `ROTA_SESSAO_EXPIRADA = '/entrar'` (sem o aviso) | `web/src/app`, `telas/entrar`, `dados` | ❌ **Sobreviveu** |
| F2 | `web/app/guarda/decidir-rota.ts` | logado em `/entrar` não redireciona | idem | ✅ Morta |
| F3 | idem | sem sessão em `/app` não redireciona | idem | ✅ Morta |

**Profundidade**: P0 completo (autenticação e dados de conta), 31 mutações manuais cobrindo sessão, hash e verificação de senha, expiração
e uso único de token, limite de tentativas, RLS, autorização de admin, CSRF e limitadores.
**Resultado**: 27 de 31 mortas. ❌ FAIL (4 sobreviventes).

Análise dos sobreviventes:

- **M17 e M18 (RLS de DELETE em `sessoes` e de UPDATE em `contas`)**. Os testes de isolamento sempre escrevem com `WHERE <coluna> = A`
  (`api/test/isolamento/contas.test.ts:84-92`, `api/test/repositorios/sessoes.test.ts:104`). No PostgreSQL, `UPDATE`/`DELETE` com `WHERE`
  também passam pela policy de SELECT, que já restringe a linha própria; por isso a policy de escrita aberta passa despercebida. Foi
  confirmado à parte, num banco descartável (`verif_rls`, já apagado), que o mesmo mutante apaga as linhas de todos quando o `DELETE`
  vem sem `WHERE` (2 de 2 linhas), e com `WHERE dono = 2` apaga 0. A defesa em profundidade de ACE-43 e ACE-44 só vale se a policy
  de escrita for provada sozinha.
- **M26 (60 s)**. Todos os testes ficam em 0 s ou 61 s. Um intervalo de 10 s, ou de 59 s, passaria igual. A spec diz "menos de 60 s".
- **F1 (ACE-20)**. A tela de entrada mostra o aviso quando a URL já o traz, e o cliente chama `aoSessaoExpirada`, mas nada prova que o
  `App` liga uma coisa à outra com o destino certo.

---

## Qualidade do código

| Princípio | Estado |
| --- | --- |
| Mínimo de código, sem abstração de uso único | ✅ |
| Mudanças cirúrgicas, só arquivos necessários | ✅ (mudanças em testes e arquivos fora do Where registradas nos lotes 2 a 8) |
| Segue os padrões existentes (`emTransacaoPropria`, `lerCorpo`, schemas `.strict()`) | ✅ |
| Testes mapeiam critérios e não são rasos (amostra: história de entrar, convite, exclusão) | ✅ |
| Resultado asserido bate com a spec | ⚠️ 2 lacunas (ACE-20, ACE-54) e 3 critérios sem discriminação |
| Cobertura por camada: banco com todos os ramos de resultado; rotas com caminho feliz, erro e log | ✅ |
| Nenhum teste órfão: todo teste novo cita um ACE-NN ou um caso limite | ✅ (marcação nos títulos) |
| Testes existentes alterados | ✅ com motivo no código e registro nos lotes 2, 5 e 8; `rls.test.ts` fora do registro (ver acima). Nenhum teste apagado ou pulado (`git grep` de `.skip`/`.todo`/`xit` vazio) |
| Guias seguidos | `CLAUDE.md` da raiz (gate, tokens, datas e centavos), `.md/GUARDRAILS.md` G-03, G-04, G-08, G-09, G-11 |

---

## Gate

Comando: o gate Build de `tasks.md` (`.specs/projeto/testes.json`), cada etapa rodada em sequência na árvore real, banco local de pé.

| Etapa | Resultado |
| --- | --- |
| `pnpm lint` (ESLint e Stylelint) | ✅ exit 0 |
| `pnpm format:check` | ✅ exit 0 |
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm test` | ✅ exit 0: raiz 20, dominio 1, contrato 39, web 490, API 641 (41 arquivos, node e workers) = 1191 testes, 0 falhas |
| `pnpm test:checagens` | ✅ exit 0: 424 testes (21 arquivos), 0 falhas |
| `checar-tokens.py frontend/web/src` | ✅ "OK: nenhuma cor ou fonte fora do tokens.css" |
| `pnpm --filter @pelada/web build` | ✅ exit 0 |
| `pnpm --filter @pelada/web e2e` | ✅ 15 passaram, 0 falharam (4 fluxos de `e2e/acesso.spec.ts`, cabeçalhos, PWA, comparador) |
| `pnpm --filter @pelada/web visual` | ✅ 78 comparações (39 telas, PC e celular), 0 divergentes; maior diferença 0,27% |

- **Total de testes automatizados executados**: 1191 + 424 + 15 = 1630, mais as 78 comparações visuais.
- **Contagem antes da feature**: não medida na `main`; o diff não apaga nenhum teste. Quatro títulos do legado foram reescritos com motivo
  registrado (`roles.test.ts` x2, `rls.test.ts`, `telas-ativas.test.mjs`), sem perda de asserção (as verificações trocaram de lista, nenhuma saiu).
- **Pulados**: nenhum. **Falhas**: nenhuma na rodada limpa.
- Observação de método: uma primeira rodada do gate teve falhas em `rotas/sessao.test.ts` porque duas execuções de `pnpm test`
  rodaram ao mesmo tempo no mesmo banco (erro do verificador). As duas foram encerradas e a suíte repetida sozinha, verde. O resultado
  acima é o da rodada limpa.

---

## Planos de correção

### Fix 1: policies de escrita de `sessoes` e `contas` não são provadas sozinhas (M17, M18; ACE-43, ACE-44). Prioridade: Maior

- **Causa**: os testes de escrita usam `WHERE`, que passa pela policy de SELECT.
- **Tarefa**: em `backend/api/test/isolamento/contas.test.ts`, no caso "B não insere, não altera e não apaga nada de A", acrescentar
  como `pelada_app` com contexto de B um `DELETE FROM sessoes` e um `UPDATE contas SET nome = 'Invasor'` sem `WHERE`, e conferir que a
  linha de A (e só a de B, quando houver) segue igual por `conteudo(tabela)`.
- **Feito quando**: as mutações M17 e M18 passam a falhar; suíte verde.

### Fix 2: ligação "sessão expirada leva a `/entrar` com o aviso" sem teste (F1; ACE-20). Prioridade: Maior

- **Tarefa**: teste de `App`/roteador (ou de `ROTA_SESSAO_EXPIRADA`) em que uma consulta recebe 401 `sessao_expirada` estando em
  `/app/conta` e a tela passa a `/entrar` mostrando "Sua sessão expirou. Entre de novo.". Não basta o teste de `Entrar` com a URL escrita à mão.
- **Feito quando**: F1 morre; suíte verde.

### Fix 3: limite de 60 s sem teste de borda (M26; ACE-51). Prioridade: Menor

- **Tarefa**: em `conta-cadastro-e-links.test.ts`, depois de um envio, recuar o registro para 59 s e conferir `enviar` falso; recuar para
  61 s e conferir `enviar` verdadeiro (o teste atual só usa 0 s e 61 s). Vale para `link_pedir` e `conta_cadastrar` (aviso de duplicado).
- **Feito quando**: M26 morre; suíte verde.

### Fix 4: tela t25 (`/app/conta/senha`) fora da comparação visual (ACE-54). Prioridade: Maior (critério explícito da spec)

- **Tarefa**: marcar `t25-senha--vazio`, `--erro` e `--sucesso` com `"real": true`, rota, respostas e recortes necessários em
  `.specs/mockup/telas.json`, acrescentá-las a `frontend/web/e2e/telas-ativas.txt` e ajustar o teste que lê a lista
  (`e2e/telas-ativas.test.mjs`) sem remover asserção. Se a tela tiver de divergir do mockup (como em t05/t06), registrar o recorte como nos lotes anteriores.
- **Feito quando**: `pnpm --filter @pelada/web visual` lista as t25 nos dois viewports com diferença abaixo de 1%.

---

## Observações que não bloqueiam

1. **Lacuna de precisão da spec (ACE-58, ACE-60)**: "mostrar a versão e a data do texto" não diz qual versão nem em que formato. O código usa a data de aprovação do
   desenho como versão. O teste confirma que a tela mostra a constante, não um valor definido pela spec.
2. **Lacuna de precisão da spec (ACE-56)**: "passar no axe sem violação" não define o ambiente. O axe roda no jsdom com `color-contrast`
   desligado, porque o jsdom não calcula contraste; não há axe em navegador real nos e2e. Contraste fica sem prova automática.
3. **Lacuna de precisão da spec (ACE-63)**: a spec diz "nenhuma rota que leia ou escreva `e_dono`". O lint barra a escrita; a leitura
   é permitida de propósito (`dono.test.ts:107`). Decidir se leitura deve ser barrada também, ou ajustar a spec.
4. **Meta 5 da spec** (contas de produção continuam entrando com a senha atual): o teste de migração prova que a conta existente fica
   confirmada (`api/test/migracoes/conta-tabelas.test.ts:19`), mas nenhum teste usa um hash bcrypt gerado por outra implementação (o do
   legado) para entrar. O `pgcrypto` aceita `$2a/$2b/$2y`, então o risco é baixo; vale uma fixture com hash do legado.
5. **ACE-21**: há teste de log em cadastro, entrar, trocar senha e convites, mas não em `esqueci-senha` e `nova-senha`.
6. **ACE-15/16 na rota**: o teste de rota apaga a sessão em vez de envelhecê-la (o Worker de teste não tem o owner); o prazo é provado
   no banco, com o mutante M3 e M4 mortos.

---

## Atualização da rastreabilidade

| Requisito | Estado | Novo estado |
| --- | --- | --- |
| ACE-01 a ACE-19, ACE-21 a ACE-42, ACE-45 a ACE-50, ACE-52, ACE-53, ACE-55, ACE-57, ACE-59, ACE-61, ACE-62, ACE-64 a ACE-69 | Pending | ✅ Verificado |
| ACE-43, ACE-44, ACE-51 | Pending | ⚠️ Verificado sem discriminação (Fix 1, Fix 3) |
| ACE-20, ACE-54 | Pending | ❌ Precisa de correção (Fix 2, Fix 4) |
| ACE-56, ACE-58, ACE-60, ACE-63 | Pending | ⚠️ Lacuna de precisão da spec |

(`spec.md` não foi alterado pelo verificador; a tabela de rastreabilidade da spec continua como estava.)

---

## Resumo

**Geral**: ❌ Não pronto para integrar.

**Verificação ancorada na spec**: 63 critérios provados; 2 sem prova (ACE-20, ACE-54); 3 sem discriminação (ACE-43, ACE-44, ACE-51); 4 lacunas de precisão da spec.
**Sensor**: 27 de 31 mutações mortas.
**Gate**: 1630 testes e 78 comparações visuais passaram, 0 falharam.

**O que funciona**: cadastro, confirmação, entrar e sair com cookie conforme G-09, expiração de 15 min e 12 h, bloqueio por e-mail e IP,
recuperação por e-mail, troca de senha, exclusão com anonimização, convite de admin com todas as regras de estado, isolamento de
`contas`, `sessoes` e tabelas novas por RLS, ordem de CSRF e limitadores, script do dono e seed, fluxos ponta a ponta.

**Problemas**: Fix 1 a Fix 4 acima.

**Próximos passos**: despachar as quatro correções ao implementador (Fix 1, 2 e 4 primeiro) e reverificar; no máximo 3 voltas antes de escalar.
