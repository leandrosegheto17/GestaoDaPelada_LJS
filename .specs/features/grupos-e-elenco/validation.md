# Grupos e elenco — Validação

**Date**: 2026-10-30
**Spec**: `.specs/features/grupos-e-elenco/spec.md`
**Diff range**: `eb1fb60..7989f05` (`main`..`feat/grupos-e-elenco-2`; 71 commits, 178 arquivos)
**Verifier**: subagente independente (autor ≠ verificador)

**Validation: PASS ✅ (com um ponto a decidir pelo usuário: GEL-116 e a tela t09; ver "Pontos a decidir")**

---

## Task Completion

As 70 tarefas (T1 a T70) estão concluídas: `tasks.md` tem 280 critérios "Done when" marcados `[x]` e 0 `[ ]`; há um commit por tarefa
(`git log eb1fb60..HEAD` traz T1 a T70, sem lacuna); o caminho `Where` de cada uma das 70 tarefas existe no worktree.

| Phase | Tarefas | Status | Notas |
| ----- | ------- | ------ | ----- |
| 1 Domínio: slug e elenco | T1 a T5 | ✅ Done | `backend/dominio/test/{grupos,elenco}/*` |
| 2 Domínio: períodos | T6 a T11 | ✅ Done | `backend/dominio/test/atividade/*`, `pacote.test.ts` |
| 3 Contrato | T12 a T16 | ✅ Done | `backend/contrato/test/*` (snapshot em `compatibilidade.test.ts`) |
| 4 Banco | T17 a T20 | ✅ Done | 3 migrations aditivas (já descrito nas premissas do `tasks.md`) |
| 5 Base da API | T21 a T26 | ✅ Done | `exigirGrupoAtivo` com SPEC_DEVIATION de T25 (arquivar passa; decisão do usuário) |
| 6 API de grupos | T27 a T32 | ✅ Done | |
| 7 API de jogadores | T33 a T37 | ✅ Done | |
| 8 API de períodos | T38 a T45 | ✅ Done | |
| 9 Habilidades, notas e transversais | T46 a T52 | ✅ Done | |
| 10 Front: dados e telas do grupo | T53 a T60 | ✅ Done | |
| 11 Front: elenco e habilidades | T61 a T67 | ✅ Done | |
| 12 Front: rotas, visual e fluxo | T68 a T70 | ✅ Done | T69 deixa a t09 fora da comparação visual por decisão do usuário (STATE.md, Retomada) |

Observação de rastreio: os commits T33 a T45 e T47 a T56 (23 commits) têm `Co-Authored-By: Claude Opus 5.5`; os demais (48), `Claude Sonnet 5.5`.
O pedido citava só T47 a T56; o intervalo T33 a T45 também está nessa situação (a decisão pendente cobre os dois).

---

## Spec-Anchored Acceptance Criteria

Evidência: `arquivo:linha` do teste (linha do `it`/`describe` marcado com o ID GEL, e da asserção quando lida). Caminhos relativos a `backend/` ou `frontend/web/`.
Todos os 118 IDs aparecem em pelo menos um teste (varredura por `GEL-NN` em `*.test.*` e `*.spec.ts`: 0 ausentes). Todas as mensagens literais da spec
(41 textos, de "O nome precisa ter de 3 a 60 caracteres." a "jogador_com_historico") aparecem em ao menos uma asserção de teste.

### Criar grupo e slug (GEL-01 a GEL-17)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-01 POST /api/grupos válido | 201 com id, slug, link; vínculo admin com `acessa_financeiro` true; `criado_por` | `api/test/rotas/grupos.test.ts:22` `expect(r.status).toBe(201)`; `:29` `toEqual([{ nome, criado_por: s.contaId }])`; `:33` `toEqual([{ conta_id, acessa_financeiro: true }])`; `api/test/migracoes/grupo-criar.test.ts:61` | ✅ PASS |
| GEL-02 6 habilidades na ordem | Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme | `dominio/test/elenco/habilidades-iniciais.test.ts:6` `toEqual([...6 nomes])`; `api/test/rotas/grupos.test.ts:38` | ✅ PASS |
| GEL-03 nome 3 a 60 | 422 `nome` "O nome precisa ter de 3 a 60 caracteres." | `api/test/rotas/grupos.test.ts:103,108` (`'  AB  '` e 61 caracteres) `campos: { [campo]: mensagem }`; `contrato/test/grupo.test.ts:25` | ✅ PASS |
| GEL-04 dia da semana | 422 no campo `diaSemana` | `api/test/rotas/grupos.test.ts:103,108` (caso `diaSemana: 'feriado'`); `contrato/test/grupo.test.ts:48` | ✅ PASS (⚠️ spec não fixa a mensagem; o teste fixa "Escolha o dia da semana.") |
| GEL-05 frequência | 422 no campo `frequencia` | `api/test/rotas/grupos.test.ts:103,108` (`frequencia: 'diaria'`); `contrato/test/grupo.test.ts:58` | ✅ PASS (⚠️ idem: "Escolha a frequência.") |
| GEL-06 horário | 422 `horario`: "Informe o horário." (ausente) e "Horário inválido." | `api/test/rotas/grupos.test.ts:103,108` (ausente, `24:00`, `7:30`); `contrato/test/grupo.test.ts:68` | ✅ PASS |
| GEL-07 `slug`/`urlPublica` no corpo | 422 e nada criado | `api/test/rotas/grupos.test.ts:84,88,92` `expect(r.status).toBe(422)` + `SELECT 1 FROM grupos ... toEqual([])` | ✅ PASS |
| GEL-08 sem sessão | 401 e nada criado | `api/test/rotas/grupos.test.ts:76` `toBe(401)`, `:78` `toEqual([])` | ✅ PASS |
| GEL-09 atomicidade | grupo, vínculo e habilidades desfeitos | `api/test/migracoes/grupo-criar.test.ts:152,175-186` `toEqual({ grupos: [], vinculos: [], habilidades: [] })` | ✅ PASS |
| GEL-10 auditoria `grupo_criado` | evento com a conta autora | `api/test/rotas/grupos.test.ts:50` `toEqual([{ autor_conta_id: s.contaId }])`; `api/test/repositorios/auditoria-feature.test.ts:102` | ✅ PASS |
| GEL-11 base do slug | "Pelada de Quinta" → `pelada-de-quinta`; corte em 40 | `dominio/test/grupos/slug.test.ts:6-30` `expect(slugBase(nome)).toBe(esperado)`; `:32` corte | ✅ PASS |
| GEL-12 base curta | `grupo` ("AB", "!!!") | `dominio/test/grupos/slug.test.ts:41-62` | ✅ PASS |
| GEL-13 reservadas | `admin-grupo` etc. (as 9) | `dominio/test/grupos/slug.test.ts:64-90` | ✅ PASS |
| GEL-14 sufixo | `-2`, `-3`, primeiro livre, arquivado ocupa | `api/test/migracoes/grupo-criar.test.ts:123-150` `toBe('pelada-de-quinta-2')`, `'buraco-2'`; `api/test/rotas/grupos.test.ts:59` | ✅ PASS |
| GEL-15 concorrência de slug | 2 slugs distintos; até 3 tentativas | `api/test/migracoes/grupo-criar-concorrencia.test.ts:85-95` `toEqual([base, `${base}-2`])` (20 rodadas); `:101,127` esgota na 3ª → `'23505'` sem grupo parcial | ✅ PASS |
| GEL-16 slug imutável | nenhuma rota altera; renomear não muda | `api/test/rotas/grupos.test.ts:285-297` (slug no PATCH → 422, grupo igual); `api/test/migracoes/grupos-grants-coluna.test.ts:8`; `api/test/migracoes/roles.test.ts:303` | ✅ PASS |
| GEL-17 link `<URL_PUBLICA>/g/<slug>` | sem endereço fixo | `api/test/rotas/grupos.test.ts:26` `toBe(`${env.URL_PUBLICA}/g/${corpo.slug}`)` | ✅ PASS |

### Editar, ler, arquivar e reativar grupo (GEL-18 a GEL-30)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-18 PATCH válido | 200 com dados, slug e link | `api/test/rotas/grupos.test.ts:262-274` `toMatchObject({...})`; `api/test/repositorios/grupos.test.ts:147` | ✅ PASS |
| GEL-19 PATCH inválido | 422 com as mensagens da criação | `api/test/rotas/grupos.test.ts:306-307` `campos: { nome: 'O nome precisa ter de 3 a 60 caracteres.' }`; `contrato/test/grupo.test.ts:19` | ✅ PASS |
| GEL-20 GET do grupo | nome, slug, link, dia, freq., horário, ativos, habilidades, admins, `souCriador` | `api/test/rotas/grupos.test.ts:191` `toEqual({...})`, `:216` `souCriador: false, admins: 2`, `:247` `jogadoresAtivos: 2` | ✅ PASS |
| GEL-21 sem vínculo | 404 em leitura e edição | `api/test/rotas/grupos.test.ts:257` `toEqual([404, 404])`, `:258` grupo intacto | ✅ PASS |
| GEL-22 arquivar | `arquivado_em`, auditoria `grupo_arquivado`, 200 | `api/test/rotas/grupos.test.ts:380-383` `toBe(200)`, `toEqual([{ autor_conta_id: criadora.contaId }])` | ✅ PASS |
| GEL-23 nome não confere | 422 `nomeConfirmacao` "O nome digitado não confere com o nome do grupo." | `api/test/rotas/grupos.test.ts:350-365` `toBe(422)` + `toMatchObject`, `arquivado_em` segue nulo | ✅ PASS |
| GEL-24 não criadora | 403 `so_quem_criou` | `api/test/rotas/grupos.test.ts:340-347` `toBe(403)`, `codigo: 'so_quem_criou'` (arquivar e reativar) | ✅ PASS |
| GEL-25 arquivado some | 404 para outros admins e fora da lista | `api/test/rotas/grupos.test.ts:385` `toBe(404)`, `:167` `toEqual({ ativos: [], arquivados: [] })`; `api/test/isolamento/arquivado.test.ts:47,65`; `api/test/migracoes/grupos-visiveis-arquivado.test.ts:84`; `api/test/rotas/sessao.test.ts:157` | ✅ PASS |
| GEL-26 escritas no arquivado | 409 `grupo_arquivado` (exceto reativar; arquivar passa, nota T31) | `api/test/rotas/grupo-ativo-middleware.test.ts:55` e `:88`; `api/test/rotas/grupos.test.ts:387-388`; `api/test/rotas/{jogadores,habilidades,notas,periodos}.test.ts` (409 em cada rota); `api/test/rotas/grupo-arquivado-rotas-existentes.test.ts:47` | ✅ PASS |
| GEL-27 seção Arquivados | criadora vê arquivados com Reativar | `api/test/rotas/grupos.test.ts:160` `toEqual({...})`; `web/src/telas/grupos/SeusGrupos.test.tsx:130-151` | ✅ PASS |
| GEL-28 reativar | apaga `arquivado_em`, `grupo_reativado`, 200 | `api/test/rotas/grupos.test.ts:391-394`; `api/test/repositorios/grupos.test.ts:244` | ✅ PASS |
| GEL-29 idempotência | 200 sem alterar nem auditar | `api/test/rotas/grupos.test.ts:404-411` `toHaveLength(1)` e `toEqual([])` | ✅ PASS |
| GEL-30 arquivar não apaga | nenhum dado apagado | `api/test/repositorios/grupos.test.ts:160` (describe com GEL-30) | ✅ PASS |

### Jogador: cadastro, edição, lista (GEL-31 a GEL-50)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-31 cadastro | 201, 1º período na data de entrada, `inicio_pontuacao` | `api/test/rotas/jogadores.test.ts:50-65` `toBe(201)`, `inicioPontuacao: HOJE`, `periodos: [{ inicio: HOJE, fim: null }]`; `api/test/repositorios/jogadores.test.ts:317` | ✅ PASS |
| GEL-32 sem data = hoje | hoje (São Paulo) | `api/test/rotas/jogadores.test.ts:47` (22h de 31/12), `desde: HOJE`; `api/test/repositorios/jogadores.test.ts:303` | ✅ PASS |
| GEL-33 data futura | 422 `dataEntrada` "A data não pode ser no futuro." | `api/test/rotas/jogadores.test.ts:81-93`; `contrato/test/elenco.test.ts:118` | ✅ PASS |
| GEL-34 apelido 2 a 30 | 422 `apelido` | `api/test/rotas/jogadores.test.ts:100-120`; `contrato/test/elenco.test.ts:33` | ✅ PASS |
| GEL-35 apelido repetido sem caixa | 422; "José"/"Jose" coexistem | `api/test/rotas/jogadores.test.ts:139-147`; `api/test/repositorios/jogadores.test.ts:332,340,351` | ✅ PASS |
| GEL-36 ano de nascimento | 422 `anoNascimento` "entre 1940 e 2016" | `api/test/rotas/jogadores.test.ts:123` (2016 e 1940 aceitos), `:308`; `contrato/test/elenco.test.ts:45,52,130`; `dominio/test/elenco/idade.test.ts:5` | ✅ PASS |
| GEL-37 posição | 422 `posicao` | `api/test/rotas/jogadores.test.ts:100-120`; `contrato/test/elenco.test.ts:59` | ✅ PASS |
| GEL-38 telefone vazio | grava sem telefone | `contrato/test/elenco.test.ts:73`; `api/test/rotas/jogadores.test.ts:55` `telefone: null` | ✅ PASS |
| GEL-39 telefone | 422 "Informe o telefone como (DD) 9XXXX-XXXX."; grava 11 dígitos | `contrato/test/elenco.test.ts:67,89`; `api/test/rotas/jogadores.test.ts:68` | ✅ PASS |
| GEL-40 pontuação inicial | 422 "Informe um número inteiro de 0 a 9999."; omitida = 0 | `contrato/test/elenco.test.ts:93,108`; `api/test/rotas/jogadores.test.ts:57` `pontuacaoInicial: 0` | ✅ PASS |
| GEL-41 PATCH | grava, 200, mesmas validações, ignora data de entrada | `api/test/rotas/jogadores.test.ts:255-294` (`dataEntrada` no corpo → 422), `:297-308`; `contrato/test/elenco.test.ts:27` | ✅ PASS |
| GEL-42 auditoria da pontuação | `jogador_pontuacao_inicial_alterada` com anterior e nova | `api/test/repositorios/jogadores.test.ts:422` | ✅ PASS |
| GEL-43 omitida mantém | valor atual | `api/test/repositorios/jogadores.test.ts:442`; `contrato/test/elenco.test.ts:139` | ✅ PASS |
| GEL-44 jogador de outro grupo | 404 | `api/test/rotas/jogadores.test.ts:236-249`, `:322-328` | ✅ PASS |
| GEL-45 auditoria criar/excluir | `jogador_criado`, `jogador_excluido` | `api/test/rotas/jogadores.test.ts:341`; `api/test/repositorios/jogadores.test.ts:378,477` | ✅ PASS |
| GEL-46 GET lista | id, apelido, posição, situação, desde, nível, `semNota` | `api/test/rotas/jogadores.test.ts:171-172` `toEqual({...})`; `contrato/test/elenco.test.ts:160` | ✅ PASS |
| GEL-47 ordem | por apelido sem acento nem caixa | `dominio/test/elenco/apelido.test.ts:7`; `api/test/repositorios/jogadores.test.ts:155`; `web/src/telas/jogadores/Jogadores.test.tsx:74-80` `toEqual(['álvaro','Beto','Carlos','Dedé'])` | ✅ PASS |
| GEL-48 busca | "jose" acha "José" | `web/src/telas/jogadores/Jogadores.test.tsx:66-72`; `dominio/test/elenco/apelido.test.ts:31` | ✅ PASS |
| GEL-49 estados vazios | "Novo jogador"; "Nenhum jogador inativo." | `web/src/telas/jogadores/Jogadores.test.tsx:96-101,104-109` | ✅ PASS |
| GEL-50 ativo = período aberto | | `api/test/repositorios/jogadores.test.ts:113,133`; `api/test/rotas/grupos.test.ts:219` | ✅ PASS |

### Inativar, reativar e regras de período (GEL-51 a GEL-70)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-51 inativar | encerra período, `jogador_inativado`, 200 | `api/test/rotas/periodos.test.ts:60-66` `situacao: 'inativo', desde: '2026-10-05'`, `periodosDe` `[{ inicio:'2026-09-01', fim:'2026-10-05' }]`; `api/test/repositorios/jogadores.test.ts:537` | ✅ PASS |
| GEL-52 sem data = hoje | | `api/test/rotas/periodos.test.ts:89-93`; `api/test/repositorios/jogadores.test.ts:550`; `contrato/test/periodos.test.ts:7` | ✅ PASS |
| GEL-53 já inativo | 409 "O jogador já está inativo." | `api/test/rotas/periodos.test.ts:64-65` `toEqual({ erro: { codigo:'ja_inativo', mensagem } })` | ✅ PASS |
| GEL-54 reativar | novo período; início da pontuação e pontuação inalterados | `api/test/rotas/periodos.test.ts:77-78`; `api/test/repositorios/jogadores.test.ts:650` | ✅ PASS |
| GEL-55 sem data = hoje | | `api/test/rotas/periodos.test.ts:94-95`; `api/test/repositorios/jogadores.test.ts:681` | ✅ PASS |
| GEL-56 já ativo | 409 "O jogador já está ativo." | `api/test/rotas/periodos.test.ts:73-74` | ✅ PASS |
| GEL-57 auditoria da reativação | `jogador_reativado` com retorno e saída anterior | `api/test/repositorios/jogadores.test.ts:650,667` | ✅ PASS |
| GEL-58 validar antes de gravar | | `api/test/repositorios/jogadores.test.ts:586-599`; `api/test/rotas/periodos.test.ts:119-128` | ✅ PASS |
| GEL-59 aviso de inativação | texto exato, Cancelar e Inativar | `web/src/telas/jogador/PeriodosJogador.test.tsx:77-96` `getByText('Ele sai do ranking, ...')` | ✅ PASS |
| GEL-60 "reativado desde" | "Beto reativado desde 07/10/2026." | `web/src/telas/jogador/PeriodosJogador.test.tsx:158` | ✅ PASS |
| GEL-61 [início, fim) | sair e voltar no mesmo dia | `dominio/test/atividade/atividade.test.ts:8,31`; `dominio/test/atividade/validar-periodos.test.ts:144`; `api/test/repositorios/jogadores.test.ts:703` | ✅ PASS |
| GEL-62 ordem das regras | só a primeira falha | `dominio/test/atividade/validar-periodos.test.ts:152-190`; `dominio/test/atividade/avaliar-periodos.test.ts:120` | ✅ PASS |
| GEL-63 data real | "Informe uma data válida." | `dominio/test/atividade/validar-periodos.test.ts:25-26,31-32` `toEqual(falha('data-invalida', ..., 'Informe uma data válida.'))` | ✅ PASS |
| GEL-64 não futura | "A data não pode ser no futuro." | `dominio/test/atividade/validar-periodos.test.ts:44-56` | ✅ PASS |
| GEL-65 saída antes do início | mensagem com dd/mm/aaaa | `dominio/test/atividade/validar-periodos.test.ts:63-67` | ✅ PASS |
| GEL-66 retorno/saída vizinhos | três mensagens | `dominio/test/atividade/validar-periodos.test.ts:70-93`; `api/test/rotas/periodos.test.ts:125` | ✅ PASS |
| GEL-67 sobreposição | "Os períodos não podem se sobrepor." | `dominio/test/atividade/validar-periodos.test.ts:121-136` | ✅ PASS |
| GEL-68 presença | mensagem com data mínima (dia seguinte à última presença) | `dominio/test/atividade/cobertura-periodos.test.ts:16,104`; `dominio/test/atividade/avaliar-periodos.test.ts:158`; `api/test/repositorios/jogadores.test.ts:569` (presença 01/10, saída 30/09 → mínima 02/10) | ✅ PASS |
| GEL-69 saída do 1º período antes do início | mensagem exata | `dominio/test/atividade/avaliar-periodos.test.ts:80-81` | ✅ PASS |
| GEL-70 função pura | `hoje` por parâmetro | `dominio/test/atividade/avaliar-periodos.test.ts:270`; `dominio/test/pacote.test.ts:12`; `pnpm lint` (regra `DOMINIO_PROIBIDAS`) verde | ✅ PASS |

### Corrigir datas, início, excluir (GEL-71 a GEL-87)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-71 corrigir | grava, `jogador_periodo_corrigido` antes/depois, 200 | `api/test/rotas/periodos.test.ts:179-195`; `api/test/repositorios/jogadores.test.ts:764` | ✅ PASS |
| GEL-72 saída de período aberto | 422 "Este período não tem data de saída." | `api/test/rotas/periodos.test.ts:209-223`; `dominio/test/atividade/avaliar-periodos.test.ts:36` | ✅ PASS |
| GEL-73 início do 1º período | 422 com a mensagem | `api/test/rotas/periodos.test.ts:209-223`; `dominio/test/atividade/avaliar-periodos.test.ts:43` | ✅ PASS |
| GEL-74 datas iguais | 200 `alterado:false`, "Nada a alterar." | `api/test/rotas/periodos.test.ts:205-206` | ✅ PASS |
| GEL-75 período inexistente | 404 | `api/test/rotas/periodos.test.ts:233-250` | ✅ PASS |
| GEL-76 "Datas corrigidas." | | `web/src/telas/jogador/CorrigirDatas.test.tsx:119` | ✅ PASS |
| GEL-77 PUT início | grava, `jogador_inicio_alterado`, 200 | `api/test/rotas/periodos.test.ts:263-265`; `api/test/repositorios/jogadores.test.ts:900` | ✅ PASS |
| GEL-78 piso 01/01/2000 | mensagem exata | `api/test/rotas/periodos.test.ts:279-290`; `dominio/test/atividade/alterar-inicio.test.ts:17` | ✅ PASS |
| GEL-79 não futura | | `api/test/rotas/periodos.test.ts:279-290`; `dominio/test/atividade/alterar-inicio.test.ts:29` | ✅ PASS |
| GEL-80 depois da saída do 1º período | mensagem com data | `api/test/rotas/periodos.test.ts:293-305`; `dominio/test/atividade/alterar-inicio.test.ts:37` | ✅ PASS |
| GEL-81 recuar move o 1º período | encerrados intactos | `api/test/rotas/periodos.test.ts:264` `periodos: [{ inicio:'2026-02-01', fim:null }]`; `api/test/repositorios/jogadores.test.ts:900`; `dominio/test/atividade/alterar-inicio.test.ts:67` | ✅ PASS |
| GEL-82 igual à atual | 200 sem gravar nem auditar | `api/test/rotas/periodos.test.ts:270-276`; `api/test/repositorios/jogadores.test.ts:931` | ✅ PASS |
| GEL-83 únicos escritores de `inicio_pontuacao` | criação e rota | `scripts/checagens/test/checar-escritores-periodo.test.mjs:34-115` | ✅ PASS |
| GEL-84 excluir | 204, apaga jogador e períodos, auditoria | `api/test/rotas/jogadores.test.ts:337-345`; `api/test/repositorios/jogadores.test.ts:477,491` (presença, nota e pagamento mensal) | ✅ PASS |
| GEL-85 com histórico | 409 `jogador_com_historico`, mensagem, sugestão `inativar`, nada apagado | `api/test/rotas/jogadores.test.ts:355-363` `toEqual({...})`; `web/src/dados/elenco.test.tsx:153` | ✅ PASS |
| GEL-86 "Inativar em vez disso" | | `web/src/telas/jogador/ExcluirJogador.test.tsx:104-112,117` | ✅ PASS |
| GEL-87 confirmação | "Excluir <apelido>?" e o texto | `web/src/telas/jogador/ExcluirJogador.test.tsx:72-78` | ✅ PASS |

### Habilidades e notas (GEL-88 a GEL-105)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-88 listar | na ordem de cadastro | `api/test/rotas/habilidades.test.ts:69` `toEqual(INICIAIS)` | ✅ PASS |
| GEL-89 criar | 201, fim da ordem | `api/test/rotas/habilidades.test.ts:77-81` `toBe(201)`, `toEqual([...INICIAIS, 'Cabeceio'])` | ✅ PASS |
| GEL-90 nome 2 a 30 | 422 `nome` | `api/test/rotas/habilidades.test.ts:84-92`; `contrato/test/habilidades.test.ts:9` | ✅ PASS |
| GEL-91 nome repetido | 422 "Já existe uma habilidade com esse nome." | `api/test/rotas/habilidades.test.ts:102-107,131-137` | ✅ PASS |
| GEL-92 renomear | mantém notas e posição | `api/test/rotas/habilidades.test.ts:124-128` `banco[3]`, `notasDaHabilidade(drible)` `[{ valor: 8 }]` | ✅ PASS |
| GEL-93 excluir | apaga habilidade e notas, `habilidade_excluida`, 204 | `api/test/rotas/habilidades.test.ts:163-166` | ✅ PASS |
| GEL-94 confirmação | "Excluir “<nome>”?" e o texto | `web/src/telas/habilidades/Habilidades.test.tsx:160-165` | ✅ PASS |
| GEL-95 vazio | "Nenhuma habilidade" e "O simulador vai usar nível 5,5 para todos." | `web/src/telas/habilidades/Habilidades.test.tsx:62-65` | ✅ PASS |
| GEL-96 outro grupo | 404 | `api/test/rotas/habilidades.test.ts:143-152,171-181` | ✅ PASS |
| GEL-97 PUT nota | grava e devolve o nível | `api/test/rotas/notas.test.ts:63-66` `toEqual({ nivel: 800, semNota: false })`, `:76` 683 | ✅ PASS |
| GEL-98 nota null | apaga, sem erro se não existe | `api/test/rotas/notas.test.ts:85-90` `toEqual({ nivel: 550, semNota: true })` | ✅ PASS |
| GEL-99 nota inválida | 422 `nota` | `api/test/rotas/notas.test.ts:93-106`; `contrato/test/habilidades.test.ts:28` | ✅ PASS (⚠️ spec não fixa a mensagem) |
| GEL-100 outro grupo | 404 | `api/test/rotas/notas.test.ts:120-148` | ✅ PASS |
| GEL-101 nível | 8,7,6,7,8,5 → 683; meio para cima | `dominio/test/elenco/nivel.test.ts:7-9` `toEqual({ nivel: 683, semNota: false })`, `:12-27` | ✅ PASS |
| GEL-102 sem nota | 550 e `semNota` | `dominio/test/elenco/nivel.test.ts:48-51` `toEqual({ nivel: 550, semNota: true })` | ✅ PASS |
| GEL-103 exibição | 683 → "6,8"; "sem nota" | `web/src/dados/notas.test.tsx:14`; `web/src/telas/jogador/FichaJogador.test.tsx:123-140` `getByText('Nível 6,8')` | ✅ PASS |
| GEL-104 função pura | | `dominio/test/elenco/nivel.test.ts:5`; `dominio/test/pacote.test.ts:12` | ✅ PASS |
| GEL-105 inativo recebe nota | | `api/test/rotas/notas.test.ts:109-115`; `api/test/repositorios/notas.test.ts:115` | ✅ PASS |

### Isolamento, transação e auditoria (GEL-106 a GEL-113)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-106 casos de isolamento | toda rota nova registrada | `api/test/isolamento/meta.test.ts:90-94` `problemasDasRotas(rotas, CASOS_ROTAS)` `toEqual([])`; `:97-118` (rota sem caso é apontada) | ✅ PASS |
| GEL-107 404 cruzado | | `api/test/isolamento/ids-cruzados.test.ts:223-244` `toBe(404)` e `estadoDeB()` inalterado | ✅ PASS |
| GEL-108 ids de outro grupo | jogador, período, habilidade | `api/test/isolamento/ids-cruzados.test.ts:192-218` | ✅ PASS |
| GEL-109 transação, trava, auditoria | | `api/test/repositorios/jogadores.test.ts:601` (auditoria falha → período não muda), `:620` (FOR UPDATE); `api/test/repositorios/periodos-concorrencia.test.ts:146` | ✅ PASS |
| GEL-110 concorrência | segunda valida sobre a primeira | `api/test/repositorios/periodos-concorrencia.test.ts:120-123` `toEqual({ ok:true })`, `toEqual({ ok:false, codigo:'ja_inativo' })`, 20 rodadas `:126-141` | ✅ PASS |
| GEL-111 teste que falha | escrita fora do repositório | `scripts/checagens/test/checar-escritores-periodo.test.mjs:59-60` `r.status` 1; `:112` repositório real passa; `:121` roda no CI | ✅ PASS |
| GEL-112 `pelada_app` + RLS FORCE | | `api/test/isolamento/ids-cruzados.test.ts:185` `toEqual([{ usuario:'pelada_app', bypass:false }])`; `api/test/rotas/grupos.test.ts:179`; `api/test/migracoes/roles.test.ts:303` | ✅ PASS |
| GEL-113 auditoria sem dado pessoal | | `api/test/repositorios/auditoria-feature.test.ts:105-125` `not.toContain(TELEFONE)`, `not.toContain(String(ANO))`, só ids/datas/números | ✅ PASS |

### Telas (GEL-114 a GEL-118)

| Critério | Resultado esperado (spec) | Evidência | Result |
| -------- | ------------------------- | --------- | ------ |
| GEL-114 as telas existem | t08, t27, t09, t20/t28, t15, t16, t17 | `web/src/app/rotas.test.tsx:145`; testes de tela em `web/src/telas/{grupos,novo-grupo,grupo,dados-grupo,jogadores,jogador,habilidades}/*.test.tsx`; `web/e2e/grupos-elenco.spec.ts:73-136` (16 e2e verdes) | ✅ PASS |
| GEL-115 só tokens | | `python .claude/scripts/checar-tokens.py frontend/web/src` → "OK: nenhuma cor ou fonte fora do tokens.css"; `pnpm lint` (Stylelint) verde; `web/e2e/telas-ativas.test.mjs:64` | ✅ PASS |
| GEL-116 comparação visual PC e celular | sem divergência | `pnpm --filter @pelada/web visual`: exit 0, 160 comparações `OK`, 0 `DIVERGE`, nas 33 telas do módulo em `telas-ativas.txt`; `web/e2e/telas-ativas.test.mjs:64-105` (33 de 35 telas do módulo, PC e celular) | ⚠️ Parcial: a t09 (início do grupo, 2 estados) está fora da comparação por decisão do usuário (STATE.md, Retomada). Ver "Pontos a decidir" |
| GEL-117 estado vazio de grupos | "Criar grupo" | `web/src/telas/grupos/SeusGrupos.test.tsx:71-83`; `web/e2e/grupos-elenco.spec.ts:79-82` | ✅ PASS |
| GEL-118 "Corrija N campos" | resumo e mensagem ao lado | `web/src/telas/jogador/NovoJogador.test.tsx:97-102` `findByText('Corrija 3 campos:')`; `web/src/telas/dados-grupo/DadosDoGrupo.test.tsx:129-138`; `web/src/dados/grupos.test.tsx:150` | ✅ PASS |

**Status**: ✅ 117 de 118 com evidência e resultado conforme a spec; ⚠️ 1 parcial (GEL-116, t09, decisão do usuário). ⚠️ Lacunas de precisão da spec: GEL-04, GEL-05, GEL-37 e GEL-99 pedem só "erro no campo X" (sem mensagem); os testes fixam campo e status e, onde há, a mensagem implementada.

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach` em pasta do scratchpad, com `node_modules` ligado por junção; vitest chamado direto (`node vitest.mjs`), sem `pnpm` (o `pnpm` na cópia tentou `install`
e falhou sem efeito). Mutantes aplicados com `python` (substituição exata, falha se o trecho não aparece uma vez), revertidos com `git checkout` na cópia. Observação: nas cópias, os pacotes
`@pelada/*` resolvem para a árvore real; por isso as mutações em `dominio`/`contrato` foram testadas pelos testes do próprio pacote, e as da API/web em arquivos de `src` do próprio pacote.

| # | Arquivo:linha | Mutação | Testes que mataram | Killed? |
| - | ------------- | ------- | ------------------ | ------- |
| 1 | `backend/dominio/src/atividade/atividade.ts` (`sobrepoem`) | `compararDatas(a.fim, b.inicio) <= 0` → `< 0` (sair e voltar no mesmo dia vira sobreposição) | 6 falhas: `atividade.test.ts`, `avaliar-periodos.test.ts:245`, `validar-periodos.test.ts:70,81,105` | ✅ Killed |
| 2 | `backend/dominio/src/elenco/nivel.ts` (`dividirMeioParaCima`) | arredondamento com meio para cima → truncamento | 4 falhas em `nivel.test.ts` | ✅ Killed |
| 3 | `backend/contrato/src/elenco.ts:27` | `CELULAR` aceita qualquer dígito no lugar do 9 | 2 falhas: `elenco.test.ts` "telefone com sem o 9 é recusado (GEL-39)" | ✅ Killed |
| 4 | `backend/api/src/infraestrutura/db/repositorios/grupos.ts` (`arquivar`) | removido `if (!g.souCriador) return 'so_quem_criou'` | `repositorios/grupos.test.ts` e `rotas/grupos.test.ts:331` (GEL-24) | ✅ Killed |
| 5 | `backend/api/src/infraestrutura/db/repositorios/jogadores.ts` (`excluir`) | histórico por pagamento mensal passa a consultar `presencas` | `repositorios/jogadores.test.ts:491` "com pagamento mensal" | ✅ Killed |
| 6 | `.../repositorios/jogadores.ts:256` (`travar`) | removido `.forUpdate()` | 5 falhas: `jogadores.test.ts:620`, `periodos-concorrencia.test.ts` (4) | ✅ Killed |
| 7 | `.../repositorios/jogadores.ts:434` (`inativar`) | removida a auditoria `jogador_inativado` | 4 falhas: `jogadores.test.ts:537,557,601`, `auditoria-feature.test.ts:100` | ✅ Killed |
| 8 | `.../repositorios/jogadores.ts:557` (`alterarInicio`) | `recuarPrimeiroPeriodo` invertido (não move o 1º período) | 3 falhas: `jogadores.test.ts:900,917`, `rotas/periodos.test.ts:259` | ✅ Killed |
| 9 | `.../repositorios/habilidades.ts:37` (`listar`) | `orderBy('ordem')` → `orderBy('nome')` | 4 falhas: `habilidades.test.ts:106,121,164`, `rotas/habilidades.test.ts:64` | ✅ Killed |
| 10 | `backend/api/src/entrada/middlewares/grupo-ativo.ts` | `if (grupo?.arquivado_em)` → `if (false && ...)` (escrita passa no arquivado) | 7 falhas em `grupo-ativo-middleware.test.ts` e `rotas/jogadores.test.ts` | ✅ Killed |
| 11 | `frontend/web/src/dados/notas.ts:9` (`formatarNivel`) | meio para cima → truncamento (nível arredondado errado na exibição) | 2 falhas: `notas.test.tsx`, `FichaJogador.test.tsx` | ✅ Killed |

(Uma primeira tentativa da mutação 3 com `sed` não casou o trecho e não alterou nada; foi refeita com o `python` e morta como acima.)

**Sensor depth**: lightweight ampliado (11 mutações; domínio de períodos, auth/autorização, concorrência, dado pessoal e UI)
**Result**: 11/11 killed — PASS ✅

**Isolamento da execução**: `git status --porcelain` da árvore real vazio antes e depois (`cmp` igual); as junções foram removidas antes de `git worktree remove --force`; `node_modules` da árvore real intacto
(19 entradas na raiz, 23 em `frontend/web`); `git worktree list` sem a cópia; `git stash list` vazio.

---

## Code Quality

| Princípio | Status |
| --------- | ------ |
| Mínimo de código / sem escopo extra | ✅ (SPEC_DEVIATIONs registrados em comentário e STATE.md) |
| Mudanças cirúrgicas | ✅ nos arquivos antigos: só 5 testes existentes tiveram linhas removidas (ver abaixo) |
| Segue os padrões do projeto | ✅ (repositórios, `casos.ts`, `emTransacao`, Zod via `zod.ts`) |
| Valor asserido = resultado da spec | ✅ (tabelas acima) |
| Cobertura por camada (domínio 1:1; rotas feliz + borda + erro) | ✅ |
| Todo teste mapeia a critério, caso limite ou Done-when | ✅ (sem teste órfão encontrado nas leituras; um `expect(campo).toBeTruthy()` em `api/test/rotas/grupos.test.ts:91` é inócuo, sem prejuízo) |
| Diretrizes documentadas | `.md/GUARDRAILS.md` (G-01, G-03, G-04, G-25, G-26, G-27), `CLAUDE.md` da raiz (gate, tokens, sem URL absoluta) ✅ |

**Integridade de testes**: nenhum arquivo de teste removido (`git diff --diff-filter=D` vazio); nenhum `skip`/`todo` na execução (0 testes ignorados). Testes antigos com linhas removidas: `api/test/apoio/acesso.ts`,
`api/test/isolamento/meta.test.ts`, `api/test/migracoes/roles.test.ts`, `web/src/telas/grupos/SeusGrupos.test.tsx` (todos aprovados) e **`web/e2e/telas-ativas.test.mjs`**
(`slice(39)` → `slice(39, 42)` e `slice(3)` → `slice(3, 42)`: asserções equivalentes, só com o fim da fatia explícito porque a lista de telas cresceu; motivo anotado em comentário, **mas o arquivo não estava na lista
de alterações aprovadas**: ver "Pontos a decidir").

---

## Edge Cases

- [x] "!!!" → slug `grupo` (e `grupo-2`): `dominio/test/grupos/slug.test.ts:41-62`; `api/test/migracoes/grupo-criar.test.ts:123`
- [x] Grupo arquivado ocupa o slug: `api/test/migracoes/grupo-criar.test.ts:123-131`
- [x] Sair e voltar no mesmo dia: `dominio/test/atividade/atividade.test.ts:8`; `api/test/repositorios/jogadores.test.ts:703`
- [x] Reativar com retorno antes da última saída: `api/test/rotas/periodos.test.ts:119-128`; `api/test/repositorios/jogadores.test.ts:691`
- [x] Criadora removida do grupo → 404 em arquivar/reativar: `api/test/rotas/grupos.test.ts:414-425` (sem vínculo); `api/test/isolamento/arquivado.test.ts:47`
- [x] "José" e "Jose" aceitos: `api/test/repositorios/jogadores.test.ts:340`
- [x] Limite do ano acompanha a virada: `contrato/test/elenco.test.ts:130`; `dominio/test/elenco/idade.test.ts:5`

---

## Gate Check

- **Gate command** (`tasks.md`, nível Build / `.specs/projeto/testes.json`), rodado por pacote por restrição de memória:
  `pnpm lint` ✅ · `pnpm format:check` ✅ · `pnpm typecheck` ✅ · `pnpm exec vitest run --dir test` ✅ · `pnpm -r --workspace-concurrency=1 test` ✅ · `pnpm test:checagens` ✅ · `pnpm --filter @pelada/web build` ✅ · `pnpm --filter @pelada/web e2e` ✅ · `pnpm --filter @pelada/web visual` ✅ · `python .claude/scripts/checar-tokens.py frontend/web/src` ✅
- **Result**: 2.698 testes passaram, 0 falharam, 0 ignorados (raiz 20; contrato 205; domínio 170; API 1.204; web 640; checagens 459) + 16 e2e Playwright + 160 comparações visuais OK (0 DIVERGE)
- **Test count before feature**: não medido (a base `eb1fb60` não foi executada); nenhum teste removido (ver Integridade)
- **Skipped tests**: nenhum
- **Failures**: nenhuma
- Não foram rodados `pnpm migrar` nem `pnpm seed`; o Postgres local já estava migrado.

---

## Pontos a decidir pelo usuário (não são FAIL automático)

1. **GEL-116 e a t09 (início do grupo)**: a comparação visual cobre 33 das 35 telas do mockup do módulo, em PC e celular, com 0% de divergência acima do limite; a t09 (2 estados) fica fora até as features que ela
   mostra (Partidas, Uso do app, Financeiro) existirem. Decisão já registrada no STATE.md; falta decidir se a feature pode ser integrada com esse ressalva e se o critério GEL-116 / o Success Criteria "comparação visual sem divergência" passa a ser reescrito.
2. **Critério de sucesso "Nenhum achado crítico ou alto do `auditor-seguranca` em aberto"**: não há auditoria desta feature em `.specs/seguranca/` (nenhum relatório desta feature). Fora do escopo do verificador; é pré-requisito da integração.
3. **Co-Authored-By Opus 5.5**: 23 commits (T33 a T45 e T47 a T56, não só T47 a T56) em vez de Sonnet 5.5. Apenas registrado.
4. **`web/e2e/telas-ativas.test.mjs` alterado** (2 linhas de fatia + novo `describe`) sem estar na lista de testes aprovados; mudança equivalente e com motivo no comentário. Pede a aprovação formal exigida pela regra de testes.

## Observações

- A regra ESLint `pelada/sem-escrita-periodo` existe em `eslint/plugin-pelada.mjs:128` mas não está ligada em `eslint.config.mjs`; o `GUARDRAILS.md` (G-26) a descreve como "ativa". A proteção efetiva vem do script `checar-escritores-periodo` (GEL-111), com teste e no CI.
- SPEC_DEVIATIONs presentes no código (T25, T45, T52, T57, T59, T60, T66, `jogadorCorpo(hoje)`, duplicação de `compararApelido`/limite do ano no web por G-01): já aprovados.

---

## Fix Plans

Nenhum item bloqueante. Se o usuário decidir que a t09 deve entrar na comparação agora, a correção é uma tarefa nova (ativar as entradas da t09 em `telas-ativas.txt` quando houver dados para Partidas/Financeiro).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| GEL-01 a GEL-115, GEL-117, GEL-118 | Pending | ✅ Verified |
| GEL-116 | Pending | ⚠️ Verified em 33 de 35 telas; t09 pendente de decisão |

---

## Summary

**Overall**: ✅ Ready (com os pontos a decidir acima)

**Spec-anchored check**: 117/118 critérios conforme a spec; 1 parcial (GEL-116/t09); 4 lacunas de precisão de spec (GEL-04, GEL-05, GEL-37, GEL-99)
**Sensor**: 11/11 mutações mortas
**Gate**: 2.698 testes + 16 e2e + 160 comparações visuais verdes; lint, format, typecheck, build e checagens verdes

**What works**: criação e arquivamento de grupo com slug estável e concorrência; elenco com todas as regras de período (mensagens e ordem do legado), escrita de período transacional, travada e auditada; habilidades e notas com nível; isolamento por grupo como `pelada_app`; telas fiéis ao mockup.

**Issues found**: nenhum bloqueante; ver "Pontos a decidir" e "Observações".

**Next steps**: decidir os 4 pontos; rodar o `auditor-seguranca`; integrar (fase 11) com a suíte completa via `python .claude/scripts/trava-testes.py --rodar`.

---

## Decisões do usuário (2026-10-30)

- **GEL-116 / t09**: integrar assim. A t09 entra na comparação visual quando Partidas, Uso do app e Financeiro existirem; anotado no roadmap (feature 4 em diante).
- **`frontend/web/e2e/telas-ativas.test.mjs`**: alteração aprovada (`slice(39)` para `slice(39,42)`, `slice(3)` para `slice(3,42)` e `describe` novo; mudança equivalente, motivo em comentário no teste).
- **Auditoria de segurança**: executada antes da integração (ver `seguranca.md`).
