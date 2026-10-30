# Grupos e elenco — Validação

**Date**: 2026-10-30 (reverificação das T71 a T83 no mesmo dia da validação parcial)
**Spec**: `.specs/features/grupos-e-elenco/spec.md`
**Diff range**: `eb1fb60..3f11ad2` (`main`..`feat/grupos-e-elenco-2`); validação parcial sobre `eb1fb60..7989f05` (T1 a T70) e reverificação sobre `618ed0d..3f11ad2` (T71 a T83, 13 commits, 51 arquivos)
**Verifier**: subagentes independentes (autor ≠ verificador): um para T1 a T70, outro, de contexto novo, para T71 a T83

**Validation: PASS ✅** (117 de 118 critérios GEL com resultado conforme a spec e GEL-116 parcial por decisão do usuário; SEC-001 a SEC-009 corrigidos e provados; 51 de 51 mutações mortas; gate completo verde. Pontos a decidir e observações no fim.)

---

## Task Completion

As 83 tarefas (T1 a T83) estão concluídas. Na validação parcial: T1 a T70, 280 critérios "Done when" `[x]`, um commit por tarefa. Na reverificação: `grep -c '^- \[ \]'` em
`tasks.md` dá 0, os `Done when` das T71 a T83 estão todos `[x]` e há um commit por tarefa (`git log 618ed0d..HEAD`: `d812d91` T71, `a6ce56e` T72, `51687f9` T73, `04a01cf` T74, `10bc439` T75, `99c9c67` T76,
`58d01dd` T77, `9001de8` T78, `3cc2259` T79, `57536ab` T80, `a901803` T81, `061eaaf` T82, `3f11ad2` T83, sem lacuna).

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
| 13 Endurecimento: achados médios | T71 a T75 | ✅ Done | SEC-001 (T71, T72), SEC-002 (T73), SEC-003 (T74, T75); ver "Reverificação das T71 a T83" |
| 14 Endurecimento: achados baixos | T76 a T83 | ✅ Done | SEC-004 a SEC-009 (T76 a T82) e reteste (T83) |

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

## Reverificação das T71 a T83 (Phases 13 e 14, endurecimento da auditoria)

A fonte da verdade desta parte são os "Done when" das T71 a T83 (`tasks.md`) e os achados SEC-001 a SEC-009 de `seguranca.md`, com as decisões do usuário de 2026-10-30
(`STATE.md`, Retomada: a criadora pode se remover; só outra admin removendo a criadora dá 409; GEL-29 mantida; auditoria só com ids e nomes de campo, GEL-113).
Caminhos relativos a `backend/` ou `frontend/web/`. Os pacotes de teste rodaram um por vez (restrição de memória).

### Critérios por tarefa

| Tarefa / critério (Done when) | Resultado esperado | `arquivo:linha` + asserção | Result |
| ----------------------------- | ------------------ | -------------------------- | ------ |
| T71 admin convidada remove a criadora | 409 `criadora_nao_removivel`; criadora segue admin e com acesso; nada na auditoria | `api/test/rotas/admins.test.ts:204` `expect(r.status).toBe(409)`, `:205` `toMatchObject({ erro: { codigo: 'criadora_nao_removivel' } })`, `:207-213` criadora ainda na lista, `souCriador: true`, `auditoriaDe(...)` `[]`; `api/test/repositorios/admins.test.ts:138` (`toBe('criadora_nao_removivel')`, `vinculosDe` intacto, `auditoriaDe` `[]`) | ✅ PASS |
| T71 criadora remove outra admin; admin sai de si mesma (204) | 204 como antes | `api/test/rotas/admins.test.ts:216` (criadora remove a outra, 204), `:226` (criadora sai de si com outra admin, 204), `:185-194` (convidada sai de si, 204; criadora última admin → 409 `ultimo_admin`); `api/test/repositorios/admins.test.ts:147` (regra pelo `criado_por`: `toBe('ok')`) | ✅ PASS |
| T71 teste de rota e de repositório falham sem a regra | | mutações 12 a 15 (abaixo) | ✅ PASS |
| T72 linha da criadora sem Remover; as demais mantêm | sem botão só para a criadora | `web/src/telas/admins/PaginaAdmins.test.tsx:319` `expect(screen.queryByRole('button', { name: 'Remover Rosa' })).toBeNull()`, `:320` Remover Marquinhos visível, `:321` `toHaveLength(1)` | ✅ PASS |
| T72 409 mostra mensagem em português sem quebrar a tela | faixa com o texto; diálogo fecha; lista mantida | `PaginaAdmins.test.tsx:336-338` `toHaveTextContent('A pessoa que criou o grupo não pode ser removida por outra admin.')`, `:339` `queryByRole('alertdialog')` nulo, `:340-341` Rosa e Leandro visíveis | ✅ PASS |
| T72 axe sem violação | | `PaginaAdmins.test.tsx:322` e `:343` `expect(await violacoes(container)).toEqual([])` | ✅ PASS |
| T72 (desvio) `GET …/admins` traz `criadoraId` | campo opcional no contrato | `api/test/rotas/admins.test.ts:94` `toMatchObject({ criadoraId: criadora.contaId })` e `adminsResposta.safeParse(...).success` verdadeiro; `contrato/test/acesso.test.ts`; snapshot `contrato/compatibilidade.json` | ✅ PASS |
| T73 `dataEntrada` `0000-01-01` e `1999-12-31` | 422 (não 500) com "A data de início não pode ser anterior a 01/01/2000."; nada gravado | `api/test/rotas/jogadores.test.ts:96-110` (`it.each` de `0000-01-01`, `0001-01-01`, `1999-12-31`): `:101` `expect(r.status).toBe(422)`, `campos: { dataEntrada: 'A data de início não pode ser anterior a 01/01/2000.' }`, `jogadoresDoGrupo` `[]`; `contrato/test/elenco.test.ts:124-130` | ✅ PASS |
| T73 `2000-01-01` continua aceita | 201, início e período em 2000-01-01 | `api/test/rotas/jogadores.test.ts:112-118` `toBe(201)`, `:117` `toMatchObject({ inicioPontuacao: '2000-01-01', periodos: [{ inicio: '2000-01-01', fim: null }] })`; `contrato/test/elenco.test.ts:132` | ✅ PASS |
| T74 chave do limite é a conta; valor no `wrangler.jsonc` | chave = `contaId`; 60 por 60 s | `api/test/rotas/limite-escrita.test.ts:74` `toEqual([ana.contaId, ana.contaId, bia.contaId])`, `:75` `not.toContain(IP)`; `api/test/config/wrangler.test.ts:86` `toEqual({ limit: 60, period: 60 })` | ✅ PASS |
| T74 excedido: 429 com `Retry-After`, sem criar nada; GET não conta | 429, `Retry-After: 60`, 2 grupos ao final; GET sem chamar o limitador | `limite-escrita.test.ts:60` `toBe(429)`, `:62` `Retry-After` `'60'`, `:64` `toHaveLength(2)`; `:87` `expect(escrita.chaves).toHaveLength(chavesAntes)`; `:90-101` POST, PUT, PATCH e DELETE barrados; `:116-117` sem sessão: 401 e `chaves` `[]` | ✅ PASS |
| T74 outra conta não é afetada | 201 para a segunda conta | `limite-escrita.test.ts:73` `status` `toBe(201)` para `bia`; `:128-138` com o binding real do `wrangler.jsonc`: a 61ª dá 429 (`:136`) e `bia` segue 422 (`:138`) | ✅ PASS |
| T74 casos de `casos.ts` seguem verdes | meta-teste | `api/test/isolamento/meta.test.ts:90-94`; rodado no gate (API: 82 arquivos verdes); nenhuma rota nova nas T71 a T83 | ✅ PASS |
| T75 README e runbook descrevem o `LIMITE_ESCRITA` | valor e como mudar | `README.md:77-81`, `docs/runbook.md:368-379` (lidos) | ✅ PASS |
| T75 checagem falha numa fixture sem o binding e passa no repositório | | `scripts/checagens/test/checar-limitadores.test.mjs:43` (passa no repositório), `:53` (falha sem `LIMITE_ESCRITA` e diz qual falta), `:83` (Retry-After diferente do período); `node backend/scripts/checagens/checar-limitadores.mjs` sem achado; no CI (`.github/workflows/ci.yml:41`) | ✅ PASS |
| T76 grupo arquivado: `convites/ler` e `aceitar` | 410 `link_invalido`, nenhum vínculo | `api/test/rotas/convites.test.ts:204` `toBe(410)`, `:207` `toBe(410)`, `:210` `vinculosDe` `toEqual([criadora.contaId])`; `api/test/migracoes/convites-grupo-arquivado.test.ts:144,153,166` (`ler` sem linha; `aceitar` e `cadastrar` → `link_invalido`) | ✅ PASS |
| T76 `DELETE` do convite pendente de grupo arquivado | 204 para a criadora; ele não volta ao reativar | `convites.test.ts:225` e `:232` `expect(r.status).toBe(204)`; `api/test/rotas/grupo-arquivado-rotas-existentes.test.ts:61` `toBe(204)`; convidar e remover seguem 409 (mesmo arquivo, `:54-57`) | ✅ PASS |
| T76 reativado, o convite volta a valer | ler 200 e aceitar 200 | `convites.test.ts:263-275` `toEqual({ email, grupoNome: 'Grupo Convite Arquivado', contaExiste: true })` e `aceito.corpo` `toEqual({ grupoId: grupo })`; `convites-grupo-arquivado.test.ts:179,195` | ✅ PASS |
| T76 migration roda do zero e sobre o banco atual; teste falha sem ela | | `convites-grupo-arquivado.test.ts:244-257` (`aplicarMigracoes` parcial: antes `ler` devolve 1 linha, depois `[]` e `link_invalido`); mutações 26 a 29 | ✅ PASS |
| T77 NUL no nome do grupo ou no apelido | 422 (não 500) com `MENSAGEM_TEXTO_INVISIVEL` | `api/test/rotas/texto-visivel.test.ts:37` `recusado(r, 'nome')` (`toBe(422)` e `campos: { nome: MENSAGEM_TEXTO_INVISIVEL }`), `:70` apelido; nada gravado (`:38`, `:71`) | ✅ PASS |
| T77 U+200B e U+202E recusados; "Beto" e "Beto"+U+200B | segundo apelido recusado | `texto-visivel.test.ts:74-80` (`recusado(..., 'apelido')` e banco `[{ apelido: 'Beto' }]`); `contrato/test/texto-visivel.test.ts:52` (14 caracteres × 5 campos) | ✅ PASS |
| T77 texto acentuado aceito e guardado em NFC | NFC no banco | `contrato/test/texto-visivel.test.ts:55,59,66`; `api/test/rotas/texto-visivel.test.ts:55` `toEqual([{ nome: 'Pelada da Conceição' }])` (o literal de entrada está em NFD, conferido nos bytes do fonte) | ✅ PASS |
| T77 teste por campo falha sem a regra | grupo (criar e editar), apelido (criar e editar), habilidade | `contrato/test/texto-visivel.test.ts:24-30`; mutações 30 a 33 | ✅ PASS |
| T78 nome com URL, quebra de linha ou HTML | sem link, sem linha injetada, até 60 caracteres | `api/test/infraestrutura/email.test.ts:194-208` (URL, `www.`, domínio e e-mail: `not.toContain` em assunto, texto e html; `<a ` uma vez só), `:213` e `:217` (quebra de linha), `:220-225` (HTML escapado), `:227-233` (corte em 60 com reticências) | ✅ PASS |
| T78 nome normal sai igual | `toEqual` com assunto, texto e html de antes | `email.test.ts:181-191` | ✅ PASS |
| T79 leitura trava a linha; arquivar durante escrita | o arquivar espera a escrita em curso | `api/test/repositorios/grupo-ativo-concorrencia.test.ts:120` `expect(arquivou).toBe(false)` (com a escrita pendente), `:123-130` escrita 200 e `arquivar` `'ok'` só depois, `:177` `toEqual([200, 200])` (sem deadlock) | ✅ PASS (⚠️ SPEC_DEVIATION `FOR KEY SHARE`, aprovada; ver "Desvios") |
| T79 testes existentes do middleware seguem verdes sem alteração | | `git diff 618ed0d..HEAD --stat` não lista `grupo-ativo-middleware.test.ts`; suíte da API verde | ✅ PASS |
| T80 cada edição grava evento com os nomes dos campos | `jogador_editado`, `resumo: { campos: [...] }` | `api/test/repositorios/jogadores.test.ts:999-1001` `toEqual([{ autor_conta_id, entidade: 'jogador', entidade_id: id, resumo: { campos: [...campos] } }])` em 7 casos (`:983-994`) | ✅ PASS |
| T80 edição que falha não deixa evento | | `jogadores.test.ts:1034-1041` (apelido repetido → `ok:false`; jogador alheio → `null`; `editados` `[]` nos dois grupos), `:1044` (auditoria falha → posição segue `'meia'`) | ✅ PASS |
| T80 nenhum evento contém telefone nem ano | | `jogadores.test.ts:1015` `expect(JSON.stringify(rows)).not.toContain(valor)` para 21987654321, 11912345678, 1983 e 1999 | ✅ PASS |
| T81 renomear grupo, criar e renomear habilidade gravam um evento cada | `grupo_editado` `{ campos: ['nome'] }`; `habilidade_criada` `{}`; `habilidade_renomeada` `{ campos: ['nome'] }` | `api/test/repositorios/grupos.test.ts:294-296` `toEqual([{ ..., resumo: { campos: ['nome'] } }])`; `habilidades.test.ts:302` (`resumo: {}`), `:313` | ✅ PASS (⚠️ SPEC_DEVIATION: a tarefa dizia "nome antigo e novo"; o usuário manteve a GEL-113, sem texto de nome no evento; `grupos.test.ts:298` e `habilidades.test.ts:316` provam que o nome não aparece) |
| T81 operação que falha não deixa evento | | `grupos.test.ts:321-322` (sem vínculo → `false` e `[]`), `:325` (auditoria falha → nome intacto); `habilidades.test.ts:331-339` (repetido e outro grupo → `[]`), `:342-350` (auditoria falha → `INICIAIS`) | ✅ PASS |
| T82 `UPDATE … arquivado_em` por admin que não criou, como `pelada_app` | falha no banco (`42501`), nada muda | `api/test/migracoes/grupos-arquivar-so-criadora.test.ts:55` `expect(codigo).toBe(SEM_PRIVILEGIO)` (`'42501'`) e `:56` `arquivadoEm` nulo; `:59-64` junto de outras colunas | ✅ PASS |
| T82 a criadora arquiva e reativa normalmente | 1 linha em cada | `grupos-arquivar-so-criadora.test.ts:89` `expect(r).toEqual([1, 1])`; fluxo da API e e2e verdes no gate | ✅ PASS |
| T82 migration roda do zero e sobre o banco atual | | `grupos-arquivar-so-criadora.test.ts:33-101` (do zero) e `:103-141` (antes `toBeNull`, `aplicarMigracoes`, depois `42501` em `:138`) | ✅ PASS |
| T83 SEC-001 a SEC-009 "corrigido" com `arquivo:linha` do teste | | `seguranca.md:155-166` (tabela do reteste): as referências de teste foram conferidas uma a uma contra o código (todas existem na linha citada e afirmam o que a tabela diz) | ✅ PASS |
| T83 SEC-010, I-1, I-3 como débito com dono | THREAT-MODEL itens 4 a 6 | `.md/THREAT-MODEL.md:138-140` (itens 4, 5 e 6, dono `partidas-e-ranking`); `.specs/projeto/roadmap.md` (linha 4); `.md/GUARDRAILS.md` G-26 reescrita sem prometer lint ativo | ✅ PASS |
| T83 gate build completo passa | | ver "Gate Check" | ✅ PASS |

**Status**: ✅ todos os critérios das T71 a T83 com evidência `arquivo:linha` e resultado conforme a spec/tarefa. Nenhum critério sem cobertura.
Lacuna de precisão: a `spec.md` não ganhou critérios para as regras novas (criadora não removível, piso na `dataEntrada`, limite de escrita, texto visível, novos eventos de auditoria): elas
vivem em `tasks.md` e `seguranca.md`. Os testes miram o resultado definido nesses documentos; nada na spec contradiz as regras novas (ver "Observações").

### Conferência do reteste da T83 (`seguranca.md`) contra código e testes

| Achado | O reteste diz | Conferido | Result |
| ------ | ------------- | --------- | ------ |
| SEC-001 | 409 `criadora_nao_removivel` (T71), tela sem a ação (T72) | `repositorios/admins.ts:52-58` (compara `criado_por` com `app_conta_id()` na mesma transação, depois da trava `FOR UPDATE`), `rotas/admins.ts` (409 + `criadoraId`), `PaginaAdmins.tsx`; teste `admins.test.ts:204-205` | ✅ confere |
| SEC-002 | piso 01/01/2000 na `dataEntrada` | `contrato/src/elenco.ts` (`PISO_INICIO` e `refine`); `jogadores.test.ts:101`, `elenco.test.ts:124` | ✅ confere |
| SEC-003 | `LIMITE_ESCRITA` 60/60 s por conta; documentado e checado | `app.ts` (`ehEscritaDeGrupo`, `chave: c.var.contaId`), `wrangler.jsonc`, `limite-taxa.ts`; `limite-escrita.test.ts:60`; `checar-limitadores` no CI | ✅ confere |
| SEC-004 | migration `1792844460000` e exceção do cancelar convite | SQL lido (as 3 funções com `g.arquivado_em IS NULL`), `grupo-ativo.ts` (`CANCELAR_CONVITE`); `convites.test.ts:204,207,232`; `convites-grupo-arquivado.test.ts:160,255` | ✅ confere |
| SEC-005 | `textoVisivel` (NFC, sem `Cc` e `Cf`) | `contrato/src/texto.ts`; `texto-visivel.test.ts:52` (contrato), `:37,:70` (rotas) | ✅ confere |
| SEC-006 | `nomeDoGrupoNoEmail` | `email/modelos.ts` (função e uso no assunto e no corpo); `email.test.ts:202,213` | ✅ confere |
| SEC-007 | `FOR KEY SHARE` (desvio de `FOR SHARE`) | `grupo-ativo.ts` (`.forKeyShare()` e comentário do desvio); `grupo-ativo-concorrencia.test.ts:120,177`; a mutação 39 prova que `FOR SHARE` faz o teste falhar (deadlock) | ✅ confere |
| SEC-008 | `jogador_editado`, `grupo_editado`, `habilidade_criada`, `habilidade_renomeada` | `jogadores.ts` (`camposEditados`), `grupos.ts`, `habilidades.ts`; testes `jogadores.test.ts:1000,1015`, `grupos.test.ts:295`, `habilidades.test.ts:302,313` | ✅ confere |
| SEC-009 | trigger `BEFORE UPDATE OF arquivado_em` | SQL `1792844520000_grupos-arquivar-so-criadora.sql`; `grupos-arquivar-so-criadora.test.ts:55,89,138` | ✅ confere |
| SEC-010, I-1, I-3 | débitos 4, 5 e 6 no THREAT-MODEL | `.md/THREAT-MODEL.md` (diff `618ed0d..HEAD`: +3 linhas, itens 4 a 6, com dono) | ✅ confere |

Nenhuma divergência entre o reteste e o código ou os testes. O item I-3 (filtro de arquivado no ramo público de `grupos_visiveis()`) segue aberto de propósito, como débito 6 do
THREAT-MODEL com dono na `partidas-e-ranking`; não há rota pública hoje.

### Desvios (SPEC_DEVIATION) das T71 a T83, todos já aprovados e registrados em `STATE.md`

T72 (`GET …/admins` devolve `criadoraId`), T73 (o contrato repete o piso por G-01), T79 (`FOR KEY SHARE` no lugar de `FOR SHARE`), T81 (evento sem nome antigo e novo; `grupo_editado`
só quando o nome muda). Cada um está comentado no código, tem teste e não contradiz a spec.

### Integridade dos testes (T71 a T83)

- Nenhum arquivo de teste removido (`git diff --diff-filter=D 618ed0d..HEAD` vazio); nenhum `skip`, `todo` ou `xit` adicionado.
- Três testes antigos tiveram linhas removidas, cada um com comentário de motivo e decisão do usuário registrada em `STATE.md` (lotes 6 e 7): `api/test/rotas/admins.test.ts`
  (ACE-40: a fundadora do grupo isolado é a criadora e a convidada não pode mais removê-la; o cenário passou a "a convidada sai, a criadora, última admin, recebe 409 `ultimo_admin`",
  com a mesma asserção de `ultimo_admin` e do vínculo mantido), `api/test/config/wrangler.test.ts` (3 → 4 limitadores; as conferências antigas continuam) e
  `api/test/rotas/grupo-arquivado-rotas-existentes.test.ts` (cancelar convite no arquivado passa de 409 para 204; convidar e remover seguem 409). Nenhum enfraquecimento: o que saiu foi
  trocado por asserções do mesmo alcance.
- Testes sem critério (órfãos): nenhum nas T71 a T83. Todo `it` novo cita o SEC ou a tarefa.

### Discrimination Sensor das T71 a T83

Cópia isolada: `git worktree add --detach` em pasta do scratchpad, com `node_modules` ligados por junção. Para a mutação do contrato valer também nos testes da API (o
`node_modules/@pelada/*` apontava para a árvore real), o `node_modules` da API foi refeito na cópia com `@pelada/contrato` e `@pelada/dominio` apontando para a própria cópia. Mutantes
aplicados por script (substituição exata, falha se o trecho não aparece uma vez), revertidos com `git checkout` na cópia depois de cada rodada. Vitest direto, sem `pnpm`, só nos
arquivos que cobrem o trecho.

| # | Arquivo | Mutação | Testes que mataram | Killed? |
| - | ------- | ------- | ------------------ | ------- |
| 12 | `api/src/infraestrutura/db/repositorios/admins.ts:52-58` (SEC-001) | removido `if (criadora?.por_outra) return 'criadora_nao_removivel'` | `admins.test.ts:138` (repositório) e `rotas/admins.test.ts:199` | ✅ Killed (2 falhas) |
| 13 | `repositorios/admins.ts` | `<> app_conta_id()` → `= app_conta_id()` (inverte quem é barrado) | 6 falhas: remoção de si mesma, criadora sai de si, `criadora_nao_removivel` e `ultimo_admin` (rota e repositório) | ✅ Killed |
| 14 | `rotas/admins.ts` | resposta 409 da criadora desligada | `rotas/admins.test.ts:199` | ✅ Killed |
| 15 | `rotas/admins.ts` | `criadoraId` devolvido sempre `null` | `rotas/admins.test.ts:94` | ✅ Killed |
| 16 | `web/src/telas/admins/PaginaAdmins.tsx` | botão Remover volta para a criadora | `PaginaAdmins.test.tsx:315` | ✅ Killed |
| 17 | `PaginaAdmins.tsx` | `recusaDe` ignora `criadora_nao_removivel` | `PaginaAdmins.test.tsx:325` | ✅ Killed |
| 18 | `contrato/src/elenco.ts` (SEC-002) | `valor >= PISO_INICIO` → `>` (o próprio piso recusado) | `contrato/test/elenco.test.ts:132` | ✅ Killed |
| 19 | `contrato/src/elenco.ts` | piso removido (testado pela API) | `rotas/jogadores.test.ts:96` (3 falhas: `0000`, `0001`, `1999`) | ✅ Killed |
| 20 | `api/src/entrada/app.ts` (SEC-003) | chave do limitador passa a ser o IP | 7 falhas em `limite-escrita.test.ts` (inclui "a chave é a conta" e o binding real) | ✅ Killed |
| 21 | `app.ts` | `DELETE` sai de `METODOS_ESCRITA` | `limite-escrita.test.ts:90` ("DELETE … conta e é barrado") | ✅ Killed |
| 22 | `middlewares/limite-taxa.ts` | `Retry-After` do 429 removido | 6 falhas em `limite-escrita.test.ts` | ✅ Killed |
| 23 | `wrangler.jsonc` | `LIMITE_ESCRITA` com limite 61 | `wrangler.test.ts:86` e `limite-escrita.test.ts:128` | ✅ Killed |
| 24 | `scripts/checagens/checar-limitadores.mjs` (T75) | `LIMITE_ESCRITA` tirado de `OBRIGATORIOS` | `checar-limitadores.test.mjs:53` | ✅ Killed |
| 25 | `checar-limitadores.mjs` | comparação do período com `PERIODO_LIMITE_ESCRITA_S` desligada | `checar-limitadores.test.mjs:83` | ✅ Killed |
| 26 | `migracoes/1792844460000_convites-grupo-arquivado.sql` (SEC-004) | `convite_aceitar` sem `g.arquivado_em IS NULL` | 3 falhas (`convites-grupo-arquivado.test.ts:153,244`; `convites.test.ts:199`) | ✅ Killed |
| 27 | idem | `convite_cadastrar` sem o filtro | 2 falhas (`convites-grupo-arquivado.test.ts:166`; `convites.test.ts:215`) | ✅ Killed |
| 28 | idem | `convite_ler` sem o filtro | 4 falhas (`:144`, `:179`, `:244`; `convites.test.ts:199`) | ✅ Killed |
| 29 | `middlewares/grupo-ativo.ts` | exceção `CANCELAR_CONVITE` removida | 3 falhas (`convites.test.ts:225`, `grupo-arquivado-rotas-existentes.test.ts:61`) | ✅ Killed |
| 30 | `contrato/src/texto.ts` (SEC-005) | regex sem `\p{Cf}` (U+200B e U+202E passam) | 40 falhas em `contrato/test/texto-visivel.test.ts` | ✅ Killed |
| 31 | `texto.ts` | regex sem `\p{Cc}` (NUL volta a dar 500) | `rotas/texto-visivel.test.ts:34,60,118` | ✅ Killed |
| 32 | `texto.ts` | `.normalize('NFC')` removido | 10 falhas no contrato e 3 nas rotas (`:50,:82,:128`) | ✅ Killed |
| 33 | `contrato/src/habilidades.ts` | habilidade volta ao `z.string()` sem `textoVisivel` | 16 falhas em `contrato/test/texto-visivel.test.ts` | ✅ Killed |
| 34 | `api/src/infraestrutura/email/modelos.ts` (SEC-006) | assunto usa `d.grupoNome` cru | 6 falhas em `email.test.ts` | ✅ Killed |
| 35 | `modelos.ts` | `MAX_NOME_NO_EMAIL` 60 → 61 | `email.test.ts:227` | ✅ Killed |
| 36 | `modelos.ts` | separadores de link não aplicados | 5 falhas em `email.test.ts` | ✅ Killed |
| 37 | `modelos.ts` | quebras e invisíveis não viram espaço | `email.test.ts:210` | ✅ Killed |
| 38 | `grupo-ativo.ts` (SEC-007) | `.forKeyShare()` removido | `grupo-ativo-concorrencia.test.ts:94` | ✅ Killed |
| 39 | `grupo-ativo.ts` | `.forKeyShare()` → `.forShare()` (o deadlock que o desvio evitou) | `grupo-ativo-concorrencia.test.ts:160` | ✅ Killed |
| 40 | `repositorios/jogadores.ts` (SEC-008) | auditoria `jogador_editado` removida | 9 falhas em `jogadores.test.ts` | ✅ Killed |
| 41 | `jogadores.ts` | telefone fora da comparação dos campos | 3 falhas (`telefone`, `telefone apagado`, `os quatro`) | ✅ Killed |
| 42 | `jogadores.ts` | evento passa a levar o telefone | 8 falhas (formato do `resumo`) | ✅ Killed |
| 43 | `repositorios/grupos.ts` | auditoria `grupo_editado` removida | 3 falhas em `grupos.test.ts` | ✅ Killed |
| 44 | `grupos.ts` | `grupo_editado` gravado mesmo sem trocar o nome | `grupos.test.ts:308` | ✅ Killed |
| 45 | `repositorios/habilidades.ts` | `habilidade_criada` removida | 2 falhas (`:297`, `:342`) | ✅ Killed |
| 46 | `habilidades.ts` | `habilidade_renomeada` removida | 3 falhas (`:306`, `:319`, `:342`) | ✅ Killed |
| 47 | `habilidades.ts` | renomear audita mesmo sem mudar o nome | `habilidades.test.ts:319` | ✅ Killed |
| 48 | `migracoes/1792844520000_grupos-arquivar-so-criadora.sql` (SEC-009) | trigger nunca barra (`IF false`) | 3 falhas (`grupos-arquivar-so-criadora.test.ts:51,59,126`) | ✅ Killed |
| 49 | idem | condição invertida (barra a criadora) | 4 falhas, incluindo `:83` | ✅ Killed |
| 50 | idem | `WHEN` removido (barra até atribuição sem mudança) | `grupos-arquivar-so-criadora.test.ts:76` | ✅ Killed |
| 51 | idem | `current_user = 'pelada_app'` removido (barra o owner) | `grupos-arquivar-so-criadora.test.ts:92` | ✅ Killed |

(As mutações 1 a 11 são as da validação parcial, acima. Total: 51 mutações injetadas, 51 mortas.)

**Sensor depth**: completo manual para caminho crítico (≥ 5 mutações por área: autorização da criadora, limite de taxa, convite, sanitização de texto, concorrência, auditoria e trigger no banco)
**Result**: 51/51 killed — PASS ✅. Nenhuma mutação sobreviveu.

**Isolamento da execução**: `git status --porcelain` da árvore real vazio antes e depois (igual ao baseline gravado); as junções foram removidas antes de `git worktree remove --force`;
`node_modules` da árvore real intacto (API com as mesmas 9 entradas); `git worktree list` sem a cópia; `git stash list` vazio. Nada foi aplicado no banco de dev local (`pnpm migrar` e `pnpm seed` não
rodaram; os testes de migration usam bancos temporários próprios).

---

## Code Quality

| Princípio | Status |
| --------- | ------ |
| Mínimo de código / sem escopo extra | ✅ (SPEC_DEVIATIONs registrados em comentário e STATE.md) |
| Mudanças cirúrgicas | ✅ nos arquivos antigos: 5 testes existentes tiveram linhas removidas na validação parcial e mais 3 nas T71 a T83, todos com motivo e decisão do usuário (ver abaixo e "Integridade dos testes (T71 a T83)") |
| Segue os padrões do projeto | ✅ (repositórios, `casos.ts`, `emTransacao`, Zod via `zod.ts`) |
| Valor asserido = resultado da spec | ✅ (tabelas acima) |
| Cobertura por camada (domínio 1:1; rotas feliz + borda + erro) | ✅ |
| Todo teste mapeia a critério, caso limite ou Done-when | ✅ (sem teste órfão encontrado nas leituras, T71 a T83 incluídas; um `expect(campo).toBeTruthy()` em `api/test/rotas/grupos.test.ts:91` é inócuo, sem prejuízo) |
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

- **Gate command** (`tasks.md`, nível Build / `.specs/projeto/testes.json`), rodado por pacote por restrição de memória (validação parcial em `7989f05`; reverificação em `3f11ad2`):
  `pnpm lint` ✅ · `pnpm format:check` ✅ · `pnpm typecheck` ✅ · `pnpm exec vitest run --dir test` ✅ · `pnpm -r --workspace-concurrency=1 test` ✅ · `pnpm test:checagens` ✅ · `pnpm --filter @pelada/web build` ✅ · `pnpm --filter @pelada/web e2e` ✅ · `pnpm --filter @pelada/web visual` ✅ · `python .claude/scripts/checar-tokens.py frontend/web/src` ✅
- **Result (reverificação, HEAD `3f11ad2`)**: 2.892 testes passaram, 0 falharam, 0 ignorados (raiz 20; contrato 299; domínio 170; API 1.286 em 82 arquivos; web 642 em 69 arquivos; checagens 475 em 24 arquivos) + 16 e2e Playwright + 160 comparações visuais `OK` (0 `DIVERGE`) + as 9 checagens do CI que rodam como script (`checar-ids-tarefa`, `checar-urls-absolutas`, `checar-migracao-aditiva`, `checar-wrangler-deploy`, `checar-acoes-fixadas`, `checar-crypt`, `checar-grupo-id`, `checar-escritores-periodo`, `checar-limitadores`) sem achado.
- **Primeira rodada do web**: 1 falha, `src/app/rotas.test.tsx > /termos abre sem sessão e sem consultar a sessão` (`Unable to find role="main"`, 1.168 ms, estourando o `findBy` padrão de 1.000 ms logo depois da suíte da API). Intermitente por tempo: o arquivo passou isolado (35/35) e a suíte web inteira passou na repetição (642/642). Nenhum arquivo da tela tocado pelas T71 a T83. Registrado em "Observações".
- **Test count (validação parcial, `7989f05`)**: 2.698. **Depois das T71 a T83 (`3f11ad2`)**: 2.892. **Delta**: +194 testes (contrato +94, API +82, web +2, checagens +16, raiz e domínio 0), nenhum removido.
- **Skipped tests**: nenhum
- **Failures**: nenhuma na repetição (ver acima a falha intermitente da primeira rodada)
- Não foram rodados `pnpm migrar` nem `pnpm seed`; o banco de dev local não foi tocado (os testes criam bancos temporários próprios).

---

## Pontos a decidir pelo usuário (não são FAIL automático)

Estado depois da reverificação das T71 a T83:

1. **GEL-116 e a t09 (início do grupo)**: decidido pelo usuário em 2026-10-30 (integrar assim; a t09 entra na comparação quando Partidas, Uso do app e Financeiro existirem; anotado no
   roadmap, feature 4). A comparação visual cobre 33 das 35 telas do mockup do módulo, PC e celular, 160 comparações `OK` e 0 `DIVERGE` na reverificação. Não é falha.
2. **Critério de sucesso "Nenhum achado crítico ou alto do `auditor-seguranca` em aberto"**: atendido. `seguranca.md` (auditoria de 2026-10-30) tem 0 críticos e 0 altos; os 3 médios e os baixos SEC-004 a SEC-009
   estão corrigidos e conferidos nesta reverificação; SEC-010, I-1 e I-3 são débitos registrados no THREAT-MODEL (itens 4 a 6), por decisão do usuário.
3. **Co-Authored-By Opus 5.5**: 23 commits (T33 a T45 e T47 a T56) em vez de Sonnet 5.5; as T71 a T83 trazem Sonnet 5.5. Apenas registrado.
4. **`web/e2e/telas-ativas.test.mjs` alterado**: alteração aprovada pelo usuário em 2026-10-30 (ver "Decisões do usuário").
5. **Testes antigos alterados nas T71 a T83** (`api/test/rotas/admins.test.ts`, `api/test/config/wrangler.test.ts`, `api/test/rotas/grupo-arquivado-rotas-existentes.test.ts`): cada um com comentário de motivo no teste e decisão
   registrada em `STATE.md` (lotes 6 e 7). A regra de testes pede aprovação do usuário para mudar teste existente; a Retomada do `STATE.md` registra as três decisões como do usuário.

## Observações

- A regra ESLint `pelada/sem-escrita-periodo` existe em `eslint/plugin-pelada.mjs:128` mas não está ligada em `eslint.config.mjs`. A proteção efetiva vem do script `checar-escritores-periodo` (GEL-111), com teste e no CI.
  Depois da T83, o `GUARDRAILS.md` (G-26) deixou de dizer "regra de lint ativa" e o THREAT-MODEL registra o débito 5 (dono `partidas-e-ranking`).
- SPEC_DEVIATIONs presentes no código (T25, T45, T52, T57, T59, T60, T66, T72, T73, T79, T81, `jogadorCorpo(hoje)`, duplicação de `compararApelido`/limite do ano/piso de data no web e no contrato por G-01): já aprovados.
- `spec.md` não foi atualizada com as regras das T71 a T83 (SEC-001 a SEC-009 vivem em `tasks.md` e `seguranca.md`); nada nela as contradiz. Sugestão, não bloqueio: ao integrar, acrescentar à spec uma nota
  remetendo a `seguranca.md` ou critérios curtos para a criadora não removível, o piso da `dataEntrada` e os novos eventos de auditoria, para a rastreabilidade futura (a `partidas-e-ranking` herda estas regras).
- Falha intermitente de tempo em `web/src/app/rotas.test.tsx` ("/termos abre sem sessão...", `findByRole('main')` com timeout de 1.000 ms) na primeira rodada do pacote web, logo depois da suíte da API; passou isolada e na repetição da suíte web.
  A trava de testes do CI ou da integração pode esbarrar nela. Não ligada às T71 a T83; candidata a uma tarefa de estabilização (timeout do `findBy` ou pré-carga da rota).
- Limite de escrita (`LIMITE_ESCRITA`, 60 por 60 s por conta, `PUT` de nota incluído): o valor está fixado por decisão do usuário (T74). Lançar notas em lote de um elenco grande, num minuto só, pode encostar nele; a tela não trata o 429
  de forma específica. Não é critério da spec; vale acompanhar no uso real.
- Inspeção de qualidade nas T71 a T83: sem funcionalidade além do pedido, mudanças confinadas aos arquivos listados no `Where` das tarefas, padrões do projeto mantidos (Kysely parametrizado, `auditoria.registrar` na mesma transação, contrato via `zod.ts`).

---

## Fix Plans

Nenhum item bloqueante. Se o usuário decidir que a t09 deve entrar na comparação agora, a correção é uma tarefa nova (ativar as entradas da t09 em `telas-ativas.txt` quando houver dados para Partidas/Financeiro). Nenhuma mutação sobreviveu e nenhum critério ficou sem cobertura nas T71 a T83, então não há fix task da reverificação.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| GEL-01 a GEL-115, GEL-117, GEL-118 | Pending | ✅ Verified |
| GEL-116 | Pending | ⚠️ Verified em 33 de 35 telas; t09 fora por decisão do usuário (2026-10-30) |
| SEC-001 a SEC-009 (T71 a T83) | Implementing | ✅ Verified (teste que falha sem a correção, mutações mortas) |
| SEC-010, I-1, I-3 | Aberto | Débito registrado no THREAT-MODEL (itens 4 a 6), dono `partidas-e-ranking` |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 117/118 critérios GEL conforme a spec; 1 parcial (GEL-116/t09, decisão do usuário); 4 lacunas de precisão de spec (GEL-04, GEL-05, GEL-37, GEL-99). T71 a T83: 100% dos "Done when" com `arquivo:linha`; SEC-001 a SEC-009 provados e o reteste da T83 confere com o código e os testes.
**Sensor**: 51/51 mutações mortas (11 na validação parcial e 40 nas T71 a T83), 0 sobreviventes
**Gate**: 2.892 testes (0 falha, 0 ignorado) + 16 e2e + 160 comparações visuais `OK`; lint, format, typecheck, build, checagens do CI e tokens verdes (uma falha intermitente de tempo no web na primeira rodada, verde na repetição)

**What works**: criação e arquivamento de grupo com slug estável e concorrência; elenco com todas as regras de período, escrita de período transacional, travada e auditada; habilidades e notas com nível; isolamento por grupo como `pelada_app`;
telas fiéis ao mockup; endurecimento da auditoria: criadora não removível por outra admin, piso de 01/01/2000 na data de entrada, limite de escrita por conta, convite de grupo arquivado inválido, nomes sem caracteres de controle ou invisíveis,
nome do grupo como texto puro no e-mail, trava de leitura contra a corrida com o arquivamento, auditoria das edições, e a regra "só a criadora muda `arquivado_em`" também no banco.

**Issues found**: nenhum bloqueante; ver "Observações" (spec sem as regras novas, falha intermitente de tempo no web, limite de escrita a acompanhar).

**Next steps**: aceite visual do usuário; checagem final `python .claude/scripts/trava-testes.py --rodar` com tudo commitado; `finishing-a-development-branch` (integrar na `main`; push, PR e deploy pedem confirmação específica).

---

## Decisões do usuário (2026-10-30)

- **GEL-116 / t09**: integrar assim. A t09 entra na comparação visual quando Partidas, Uso do app e Financeiro existirem; anotado no roadmap (feature 4 em diante).
- **`frontend/web/e2e/telas-ativas.test.mjs`**: alteração aprovada (`slice(39)` para `slice(39,42)`, `slice(3)` para `slice(3,42)` e `describe` novo; mudança equivalente, motivo em comentário no teste).
- **Auditoria de segurança**: executada antes da integração (ver `seguranca.md`).
- **Reverificação das T71 a T83**: SEC-001 a SEC-009 corrigidos nas Phases 13 e 14 por decisão do usuário; SEC-010, I-1 e I-3 como débitos no THREAT-MODEL (itens 4 a 6). Nenhuma decisão nova pendente.
