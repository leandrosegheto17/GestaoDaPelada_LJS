# Auditoria de segurança: feature `simulador` (5 de 8)

**Data**: 2026-11-06 · **Worktree**: `GestaoDaPelada_v2-simulador` (branch `feature/simulador`, HEAD `97ecbea9`) · **Modo**: só leitura do código; teste ativo só local
**Resultado**: 0 críticos, 0 altos, 0 médios, 6 baixos (mais 3 observações)
**Bloqueia o lançamento?** Não

## Escopo e ambiente

- Código lido: `backend/dominio/src/simulador/*`, `backend/contrato/src/simulador.ts` e `escalacao.ts`, as rotas `simulador.ts`, `simulador-resultado.ts`, `escalacoes.ts`, a pré-marcação em `partidas.ts:135-171`, o `GET` de `grupo.ts:50-75`, os repositórios `escalacoes.ts`, `eventos.ts`, `jogadores-leitura.ts` e `historico.ts`, os middlewares `vinculo.ts`, `grupo-ativo.ts`, `recurso.ts`, `limite-escrita.ts`, `com-banco.ts`, `cabecalho-pelada.ts` e `cabecalhos.ts`, as migrações `1792844940000_grupo-criar-contrair.sql` e `1793919878922_escalacoes-leitura-so-conta.sql`, as policies e os grants de `escalacoes` e `eventos_uso` (`1792843260000_roles.sql`, `1792843320000_rls.sql`, `1792844700000_eventos-uso.sql`, `esquema-producao.txt:364-368,535-540`) e as telas `frontend/web/src/telas/simulador/*` e `dados/simulador.ts`.
- Teste ativo: `wrangler dev` local em **127.0.0.1:8897**, apontado para o Postgres exclusivo **127.0.0.1:5452** (`pelada-validacao-simulador`), com as contas do seed `admin@exemplo.test` (Pelada Local e Pelada de Quinta) e `convidado@exemplo.test` (só Pelada de Quinta). A porta 8797 indicada no pedido estava ocupada por um `wrangler dev` de outra sessão (worktree `conta-e-acesso`). Ela não foi usada e a outra sessão não foi tocada. No fim, só os processos desta auditoria foram encerrados.
- Ferramentas: `pnpm audit --prod` (2 moderados em `glob` e `minimatch`, dependências transitivas, fora do simulador), `gitleaks git --redact` (3 ocorrências em testes antigos: vetores de teste de cifra e senhas de teste, nenhuma do simulador) e a busca embutida no histórico (249 ocorrências de URL com senha ou atribuição em testes, `.env.example` e docs. A única do simulador é `frontend/web/e2e/simulador.spec.ts:18`, uma senha de teste `Senh****` da conta criada pelo e2e local). `osv-scanner` e `semgrep` não estão instalados.
- Sondas e saídas: na pasta temporária da sessão (`scratchpad/sondas/sondas1.py`, `sondas2.py`, `rls.mjs`, `rls2.mjs`, `cpu.mts`, `cpu2.mts` e os `.out`). Nenhuma alteração de código.

## Confirmado sem falha (com prova local)

| Controle | Evidência |
|---|---|
| Sem sessão, 401 em GET e POST | `sondas1.out`: `anon contexto`/`anon sugerir` 401 |
| Conta sem vínculo, 404 em contexto, prévia, sugerir, escalações e `partidas/nova` | `B * Local` 404; a RLS decide em `vinculo.ts:27` |
| Jogador de outro grupo nos aptos ou na composição: 422 sem dizer qual | `B sugerir/avaliar/escalacoes Quinta com id do Local` 422 "Há jogadores que não estão ativos…" (`simulador.ts:119-123`, `escalacoes.ts:38-47`) |
| `.strict()`: `grupoId` no corpo, `k` em 3 ou mais | 422 `Unrecognized key` |
| Limites de N, K, 60 aptos, repetido, data inválida, JSON inválido | 422 no campo (`contrato/src/simulador.ts:12,26-44,64-69`) |
| Injeção SQL | `data` e `id` maliciosos: 422 antes do banco; todo SQL do recurso é parametrizado (`sql\`…${}\``/Kysely) |
| Grupo arquivado: 409 em prévia, sugerir, avaliar e escalações; GET da criadora continua 200 | `sondas2.out` (`grupo-ativo.ts:49-71`) |
| CSRF: escrita sem `X-Pelada: 1` dá 403 | `sem X-Pelada` 403 (`cabecalho-pelada.ts:35-45`) |
| Cabeçalhos | `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` nas respostas; CSP e `Referrer-Policy: same-origin` em `frontend/web/public/_headers:5-7` |
| Dados pessoais na resposta e no log | sem telefone, ano, posição, notas nem pontos (SIM-03, SIM-82); a linha de log é só `{evento, formato, n, k, aptos}` (`simulador-resultado.ts:88-98`) |
| RLS de `escalacoes` como `pelada_app` (transações desfeitas) | slug e contexto vazio leem 0 linhas (restritiva `1793919878922`); conta A: `UPDATE`/`DELETE` sem `WHERE` afetam 0 linhas do grupo de B; `INSERT` no grupo de B e troca de `grupo_id` para grupo sem vínculo dão `42501`; `UPDATE` de `eventos_uso` dá `permission denied` |
| Concorrência na mesma data (SIM-87) | 4 confirmações simultâneas: `[201, 201, 201, 201]`, uma linha só |
| Trava de plano | `exigirRecurso('simulador')` em `/grupos/:grupoId/simulador/*` e `/grupos/:grupoId/escalacoes` (`recurso.ts:57-65`). A rota casa sempre o mesmo padrão do middleware, então não há caminho alternativo. Não houve prova ativa com grupo Free (o grupo novo nasce em trial) |
| SECURITY DEFINER | `grupo_criar` de 7 parâmetros com `search_path=public, pg_temp`, `REVOKE … FROM PUBLIC` e `EXECUTE` só para `pelada_app` (`esquema-producao.txt:236,316`); a migração `grupo-criar-contrair` só remove a versão de 6 parâmetros (contração prevista na AD-037) |
| XSS na tela | nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `href` com dado; apelidos e avisos vão como texto do React; `caminhoGrupo` usa `encodeURIComponent` (`dados/grupos.ts:39-41`) |

## Achados

### SEC-001 [BAIXO] A idade individual pode ser deduzida pelo `avaliar` (e pelo time incompleto de 1), o que descumpre o texto de SIM-82

- **Onde**: `backend/contrato/src/simulador.ts:209-213` (o `composicaoVarios` aceita times de qualquer tamanho, inclusive de 1 jogador ou vazios), `backend/dominio/src/simulador/avaliar.ts:106-122`, `indicadores-varios.ts:37` e `indicadores-dois.ts:74`.
- **Prova** (`sondas2.out`): no grupo próprio da auditoria, `POST …/simulador/avaliar` com `varios_times` e um time por jogador devolve `idadeMedia` de cada time = idade de cada jogador: `[('Aud00', 4600), ('Aud01', 4500), …]`, ou seja, ano de nascimento 1980, 1981… O `sugerir` com 7 aptos e N = 3 também expõe a idade do único jogador do time incompleto.
- **Impacto**: nenhuma fronteira de confiança é cruzada. Quem chama já é admin do grupo e lê `anoNascimento` e `telefone` na ficha (`GET …/jogadores/:id`, `jogadores-leitura.ts:144-145`). O problema é a divergência com SIM-82 ("SHALL nunca trazer … idade individual"). Vira risco real se um dia existir um papel de admin sem acesso à ficha.
- **Correção sugerida**: aceitar e registrar a exceção em AD (média de 1 é inevitável no time incompleto de 1), **ou** omitir `idadeMedia` em time com menos de 2 jogadores com ano. No `avaliar` de 3 ou mais, conferir também que a forma dos times segue a prévia (quantidade e tamanhos), como já se faz no `sugerir`.

### SEC-002 [BAIXO] A escalação aceita composição vazia ou incoerente e substitui a válida da mesma data

- **Onde**: `backend/contrato/src/escalacao.ts:36-58` (só recusa repetidos), `backend/api/src/entrada/rotas/escalacoes.ts:38-47` (o `every` sobre lista vazia passa) e `contrato/src/simulador.ts:196-213` (listas sem mínimo).
- **Prova** (`sondas2.out`): `201` para `dois_times` com N = 11 e todos os times vazios, para `varios_times` com 60 times vazios e para a data `1900-01-01`. Cada confirmação grava também um `eventos_uso` `escalacao_confirmada`.
- **Impacto**: integridade dos dados do próprio grupo. Um admin (ou um front com defeito) apaga, sem aviso, a escalação válida da data, que deixa de pré-marcar a partida (SIM-75). Também infla o contador "Escalações confirmadas" do painel de uso, até 60 por minuto. A SIM-72 manda aceitar composição ajustada, não composição sem jogadores.
- **Correção sugerida**: exigir pelo menos 1 jogador na composição; em `varios_times`, nenhum time vazio e no máximo `ceil(60/2)` times; opcionalmente, um piso de data (o `PISO_DATA_ENTRADA` 2000-01-01 do elenco). Registrar a decisão numa AD se a SIM-72 precisar de esclarecimento.

### SEC-003 [BAIXO] `confirmada_por` não fica preso à conta do contexto no banco

- **Onde**: policy `escalacoes_inserir`/`escalacoes_alterar` (`1792843320000_rls.sql:51-56`): o `WITH CHECK` confere o grupo, não `confirmada_por = app_conta_id()`.
- **Prova** (`rls2.mjs`, transação desfeita): como `pelada_app`, com a conta B no contexto, `INSERT … confirmada_por = <conta A>` foi aceito (`INSERT 1`).
- **Impacto**: hoje nenhum: a rota grava a conta da sessão (`escalacoes.ts:50-61`). É defesa em profundidade: um bug futuro ou uma injeção permitiria atribuir a escalação a outra conta.
- **Correção sugerida** (migração aditiva): uma policy `RESTRICTIVE FOR INSERT, UPDATE TO pelada_app WITH CHECK (confirmada_por = app_conta_id())` em `escalacoes`.

### SEC-004 [BAIXO] Qualquer conta com vínculo insere qualquer `tipo` em `eventos_uso`

- **Onde**: `1792844700000_eventos-uso.sql:61` (`GRANT INSERT`) e a policy `eventos_uso_inserir` do laço de `1792843320000_rls.sql:52`.
- **Prova** (`rls2.mjs`, desfeita): com conta, `INSERT … tipo = 'ranking_aberto', dispositivo_id = gen_random_uuid()` foi aceito.
- **Impacto**: só pela API, que não expõe isso. É defesa em profundidade para o painel de uso (aparelhos e PDFs forjáveis via SQL). A origem é da `partidas-e-ranking`; aparece aqui porque o simulador grava `escalacao_confirmada` por esse grant.
- **Correção sugerida**: uma policy restritiva de INSERT com conta limitada a `tipo IN ('partida_lancada', 'escalacao_confirmada')` (o público já entra pela `evento_publico_registrar`, que é SECURITY DEFINER).

### SEC-005 [BAIXO] Não há teto de tamanho do corpo; o JSON é lido inteiro antes dos limites do Zod

- **Onde**: `backend/api/src/entrada/corpo.ts:29-37,81-92` (`c.req.json()` sem limite) e `app.ts` (sem `bodyLimit`).
- **Prova**: um corpo de 1,1 MB (25 000 aptos) na prévia respondeu 422 em 0,17 s no local. No Worker Free (10 ms de CPU), um corpo maior derruba a própria requisição com 1102.
- **Impacto**: baixo. O corpo só é lido depois da sessão, do vínculo e do limite de escrita (60 por minuto por conta), e a falha atinge só quem envia. Qualquer pessoa cria conta e grupo (trial), então "admin" não é barreira contra abuso de cota. Vale para todo o projeto, não só para o simulador.
- **Correção sugerida**: `bodyLimit` do Hono (ex.: 64 KB) nas rotas `/api/grupos/*`, com 413. A composição máxima válida (60 UUIDs mais a estrutura) cabe em menos de 10 KB.

### SEC-006 [BAIXO] O DELETE em `escalacoes` está concedido e nenhuma rota o usa

- **Onde**: `1792843260000_roles.sql:30-32` e `esquema-producao.txt:364`.
- **Impacto**: privilégio mínimo. A policy limita o DELETE ao grupo visível com conta (provado: `DELETE` sem `WHERE` de A afeta 0 linhas de B), mas o grant sobra. A spec diz que a escalação só é substituída (Out of Scope: "Excluir … escalações antigas").
- **Correção sugerida**: `REVOKE DELETE ON escalacoes FROM pelada_app` numa migração aditiva, se nenhuma feature futura precisar dele.

## Observações (sem achado)

- **CPU na plataforma (SIM-61)**: a medição local com níveis adversariais (aleatórios, extremos, quadráticos) não aumentou as trocas aceitas (no máximo 23 em 2 times e 138 em 3 ou mais, abaixo do teto de 200). A máquina estava carregada por outras sessões: até a fixture do próprio projeto deu mediana de 8 ms em `dois_times` N = 11, então os números locais não servem como orçamento. O risco de 1102 em requisição legítima depende da medição de SIM-61 na prévia, que continua pendente e é pré-condição do lançamento pela spec.
- **Limite de escrita (429)**: o `wrangler dev` local não aplicou o binding `LIMITE_ESCRITA` (70 prévias seguidas responderam 200). Pelo código, a prévia, o sugerir, o avaliar e as escalações estão cobertos (`limite-escrita.ts:22-45`, POST em `/api/grupos/*`). A prova fica com os testes do projeto e com a prévia publicada.
- **Logs da plataforma**: a linha de SIM-60 não leva o grupo, mas o log de requisição do Workers/`wrangler tail` registra a URL com o `grupoId`. Não é dado pessoal; registre isso se a SIM-60 for lida de forma estrita.

## Dados de teste deixados no banco local 5452

Grupo **"Auditoria Simulador"** (`3cddc400-40c4-41f1-8e7f-f8e15e8d0669`, slug `auditoria-simulador`, **arquivado**, criado por `convidado@exemplo.test`), com 8 jogadores `Aud00` a `Aud07` (anos 1980 a 1987, telefones fictícios), as escalações de 2026-11-06 e de 1900-01-01 e cerca de 8 eventos `escalacao_confirmada`. Os grupos do seed não foram alterados. As provas de RLS rodaram em transações desfeitas. Esse grupo aparece em "arquivados" para a conta convidada: se algum teste do `/validar` contar os grupos dessa conta, recrie o banco com `pnpm migrar` e `pnpm seed`.

---

## Reteste (rodada 2)

**Data**: 2026-11-06 · **HEAD** `48c59f3d` (commit `fix(simulador): corrige os achados da validação r1`) · **Escopo**: `git diff 97ecbea9..HEAD` (código: `contrato/src/escalacao.ts` e `simulador.ts`, `dominio/src/simulador/avaliar.ts`, `indicadores-varios.ts`, `varios-inicial.ts`, `distribuicao-varios.ts`, a migração `1794004229184_escalacoes-confirmada-por-da-conta.sql`, `rotas/partidas.ts` só no comentário, `frontend/web/src/dados/previas.ts` e `telas/simulador/{AcoesResultado,PaginaSimulador,ResultadoDoisTimes}.tsx`)
**Resultado**: SEC-003 fechado; SEC-001 e SEC-002 fechados em parte, com resíduo **baixo**; SEC-004 a SEC-006 sem mudança (dívida da AD-131). Nenhum achado novo. **Bloqueia o lançamento?** Não

**Ambiente**: `wrangler dev` em 127.0.0.1:8897 sobre o Postgres exclusivo 127.0.0.1:5452 (`pelada-validacao-simulador`, migração `1794004229184` aplicada), conta `convidado@exemplo.test`. As sondas de banco rodaram como `pelada_app` (sem `BYPASSRLS`) em transações desfeitas. As de API usaram um grupo próprio, **"Auditoria Reteste R2"** (`790802d8-…`, 41 jogadores `R2j00` a `R2j40`), que foi removido no fim junto com as escalações, os eventos, as habilidades, os pesos, o vínculo e as 43 linhas de `auditoria`. A conferência por `grupo_id` em todas as tabelas não achou sobra. Só o processo `wrangler` desta rodada foi encerrado. Sondas e saídas: `scratchpad/r2/rls.sql`, `rls2.sql`, `sondas_r2.py`, `sondas_r2b.py` e os `.out` da sessão.

| SEC | Estado | Prova da rodada 2 |
|---|---|---|
| SEC-001 | **Aberto em parte (baixo)** | Em 3 ou mais o problema acabou: `avaliar` com 8 times de 1 devolve `idadeMedia` nula em todos, e no `sugerir` com 7 aptos e N = 3 o time incompleto de 1 também vem nulo (`indicadores-varios.ts:38`). **Resíduo 1**: em 2 times não há a mesma guarda (`indicadores-dois.ts:74`, fora do diff). `avaliar` `dois_times` com o time A só com 1 titular devolve `[7600, 7400]`, e 76 é a idade daquele jogador; com o time B vazio e o resto em "não entra" a resposta é `[7600, null]`. O `sugerir` de 2 times não forma time de 1 (com menos de 2N aptos dá 422 "Faltam aptos para 2 times."), então o vazamento vem só do `avaliar`. **Resíduo 2**: diferença entre médias. Com 3 `avaliar` de times de 2 (`m(x,y)=7550`, `m(x,z)=7500`, `m(y,z)=7450`) sai a idade exata de x, `(mxy+mxz−myz)/100 = 76`. Isso vale para qualquer média sobre composição livre e não se fecha só com o piso de 2. O impacto não mudou: quem chama é admin e lê o ano na ficha. Correção: aplicar a mesma regra `comAno >= 2` em `indicadores-dois.ts:74` e registrar numa AD que a diferença entre médias é aceita, já que o admin vê o ano na ficha |
| SEC-002 | **Fechado em parte (resíduo baixo)** | Fechado: composição vazia em 2 times, `times: []`, um time vazio, 40 times vazios e `1900-01-01` vazia dão **422** "A composição precisa ter ao menos um jogador em cada time." (`escalacao.ts:28-37`). `1900-01-01` com jogador dá 422 "inativos": nenhum jogador está ativo antes do piso de entrada, então essa data fica fechada por tabela. Listas com mais de 40 itens dão 422. **Resíduo** (todos **201**): (a) em `dois_times`, `recusarVazia` confere só o total de ids (`escalacao.ts:33`), então o time A vazio com o time B só com 1 titular e N = 11 passa. Isso contradiz a própria mensagem ("em cada time"); (b) `dois_times` sem nenhum titular, com todos em "não entra", também passa, e a `partidas/nova` pré-marca todos como presentes, porque "não entra" conta pela SIM-75; (c) `varios_times` com 40 times de 1 jogador e N = 2, ou com 1 time de 1 e N = 11; (d) data `9999-12-31`, sem teto. O impacto é só a integridade da escalação do próprio grupo, sempre feita por um admin. O número de times agora tem teto de 40 e cada time leva pelo menos 1 jogador ativo distinto. Correção opcional: em 2 times, exigir pelo menos 1 titular em cada time; em 3 ou mais, conferir a forma contra a prévia (quantidade de times e tamanhos, como o `sugerir` já faz); um teto de data (ex.: hoje + 1 ano). Se a SIM-72 aceitar a forma livre, registrar numa AD |
| SEC-003 | **Fechado** | Sondas `rls.sql` e `rls2.sql` (transação desfeita, conta B = convidada e conta A = admin, as duas com vínculo na Pelada de Quinta): (1) B faz `INSERT` com `confirmada_por = A` → `42501` da `escalacoes_confirmada_por_inserir`; (2) upsert de B com a própria conta → `INSERT 0 1`; (3) `UPDATE` de B que troca a autora para A → `42501` da `…_alterar`; (4) upsert com `EXCLUDED.confirmada_por = A` → `42501`; (5) upsert com a própria conta e `SET confirmada_por = A` → `42501`; (6) A substitui a escalação gravada por B com a própria conta → `INSERT 0 1`, autora A. Isso mostra que o `USING (true)` restritivo não impede a troca legítima entre admins do mesmo grupo; (7) B altera só o `n` de uma linha de A sem reescrever a autora → `42501`, porque o `WITH CHECK` vale para a linha nova. O `USING (true)` restritivo não afrouxa nada: só com o slug público, o `UPDATE` sem `WHERE` afeta 0 linhas e o `INSERT` dá `42501`; a conta de outro grupo (j22), com `UPDATE` sem `WHERE`, só alcança a linha do próprio grupo (`RETURNING` = grupo de j22) e o `INSERT` no grupo de B dá `42501`. As policies permissivas continuam decidindo o alcance, e a restritiva só soma o AND. Pela API, duas confirmações da mesma data (2026-11-11) deram **201** e **201**, a segunda trocou o formato e a linha gravou `confirmada_por` = conta da sessão. O teste `escalacoes-rls.test.ts` (bloco "confirmada_por é a conta da sessão") cobre INSERT, UPDATE e o upsert |
| SEC-004 | Inalterado (AD-131) | O diff não toca `eventos_uso`, os grants nem a policy |
| SEC-005 | Inalterado (AD-131); risco menor | `corpo.ts` e `app.ts` fora do diff, então continua sem `bodyLimit`. O teto de aptos caiu de 60 para 40, e as listas da composição também (`simulador.ts:194`), o que reduz o trabalho de CPU depois da validação |
| SEC-006 | Inalterado (AD-131) | A migração nova só cria policies de INSERT e UPDATE; não há grant nem policy de DELETE nova |

**Limite de 40 aptos** (fechado): `previa`, `sugerir` e `avaliar`, nos dois formatos, com 40 aptos reais → **200**; com 41 → **422** no campo `aptos`. Com 41 UUIDs aleatórios também dá 422, antes do banco. Contrato e domínio usam o mesmo número (`LIMITES_SIMULADOR.aptosMax = 40`, `simulador.ts:12`; `MAX_APTOS_SIMULADOR = 40`, `varios-inicial.ts:12`, que lança `RangeError` acima disso). Na escalação, a lista com 41 ids e os 41 times dão 422. A mensagem desse caso vem em inglês ("Too big: expected array to have <=40 items"). É questão de texto, não de segurança.

**Tela e hook** (sem achado): `previas.ts` só associa o estado à chave da requisição, para não mostrar a resposta de outra chave. `AcoesResultado` desabilita "Confirmar" durante o recálculo; `ResultadoDoisTimes` acrescenta o selo fixo "movido" (`aria-hidden`) e esconde o título quando o time não tem titulares. Nenhum `dangerouslySetInnerHTML`, `innerHTML`, `href` ou `src` com dado, `console`, `localStorage` ou `sessionStorage` em `telas/simulador/*`, `dados/previas.ts` ou `dados/simulador.ts`. Apelidos e avisos continuam como texto do React. Nenhum campo pessoal novo na tela ou na resposta. O diff não traz segredo nem dado pessoal real (só nomes de variáveis no README e respostas fictícias do mockup).

**Observações**: (1) Nesta rodada o limite de escrita local respondeu **429** depois de cerca de 60 POSTs por minuto, o que corrige a observação da rodada 1; as sondas seguintes foram espaçadas. (2) Efeito colateral do SEC-003: qualquer `UPDATE` futuro em `escalacoes` precisa regravar `confirmada_por` com a conta da sessão, senão dá `42501`, como na sonda 7. Hoje só existe o upsert, que já faz isso. (3) O grupo "Auditoria Simulador" da rodada 1 (`3cddc400-…`, arquivado) continua no banco 5452 e não foi mexido.
