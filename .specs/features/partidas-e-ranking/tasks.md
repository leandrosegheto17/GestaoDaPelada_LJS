# Partidas e ranking — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: `ljs:.specs/features/partidas-e-ranking/spec.md` (aprovada em 2026-10-30, PAR-01 a PAR-161), `design.md`, `context.md` (P1 a P28) e `mockup/`, todos @ `c6dc82c` (branch `feat/partidas-e-ranking`), com `ljs:` = `C:\Leandro\Projetos\GestaoDaPelada_LJS`, conferido em 2026-11-04. Contratos: fundação v2 (`.specs/features/fundacao/`), `conta-e-acesso` v2 e `grupos-e-elenco` v2 (`tasks.md` de cada uma).
**Branch pai**: `feature/grupos-e-elenco` (a `grupos-e-elenco` ainda não estará integrada). Se já estiver integrada na `main` quando o `/executar` começar, a Branch pai passa a ser `main`.
**Feature**: 4 de 8 do roteiro (AD-001, AD-015). Requisitos `PAR-*`.

> Convenções: `B:` = `ljs:.specs/features/partidas-e-ranking/spec.md` @ `c6dc82c`; `BD:` = o `design.md` e `BC:` = o `context.md` da mesma pasta e commit; `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `CA:` = `.specs/features/conta-e-acesso/tasks.md`; `GE:` = `.specs/features/grupos-e-elenco/tasks.md` (v2, requisitos `GEL-*`, conferido em 2026-11-04); `M:` = `ljs:backend/api/src/infraestrutura/db/migracoes/` (as 23 migrações copiadas pela fundação, AD-003). Do zero (AD-002): código e testes do LJS e do legado são só consulta; os ativos do mockup entram por cópia (`reuso.md`). ADs propostas com IDs provisórios `AD-PAR-N`. Nome de teste de tarefa de risco alto cita o `PAR-NN`.

## Delta

1. **Base não validada**: a feature do LJS não tem `validation.md` (construção até T67, sem `/validar`). `spec.md` e `design.md` são iguais na branch e na `main` do LJS. As decisões da construção do LJS que mudam comportamento entram como Base (`BC:29-40`: P17, P23, P27, P28; AD-040); as que mudam testes existentes viram a Pergunta 1.
2. **Banco**: as 4 tabelas já existem com RLS `FORCE` (`M:1792843200000_linha-de-base.sql:155-207`, `M:1792843320000_rls.sql:33-59`); sem tabela nova. As 6 migrações do LJS não estão na produção: a v2 escreve as suas (T21 a T26), aditivas, pelo gerador (`F:883`), com timestamp maior que `1792844520000` **e** que a última da `grupos-e-elenco` v2. São as primeiras DDL da v2 na `main` do Neon: a prévia usa a produção (AD-032), então o deploy dela migra a produção já antes da paridade, e a T81 ensaia as migrações sobre um dump restaurado localmente (AD-033): a `grupo_criar` de 6 parâmetros fica delegando (AD-037) e o `-- contrair:` vai para a `simulador`.
3. **Débitos do LJS na v2**: I-3 vale (a v2 copiou `M:1792844280000_grupos-visiveis-arquivado.sql:19` igual) → T26. I-1: a regra `pelada/sem-escrita-periodo` era do `eslint/plugin-pelada.mjs` do LJS; na v2 nasce e é ligada aqui, se a `grupos-e-elenco` v2 não a criar (T52; a `grupos-e-elenco` v2 só tem a checagem `GE:1482`). SEC-010 vale: o `vite-plugin-pwa` com `injectManifest` (`FD:123`) puxa o `workbox-build` → T49. G-25, G-26 e o THREAT-MODEL não existem na v2 (AD-006, AD-020): o registro vai na própria tarefa (AD-039).
4. **O que a fundação v2 não faz e a Base supunha**: o `LIMITE_PUBLICO` só é declarado (`F:1081`), não ligado em `/api/publico/*` (o `B:67` diz "já ligado"): T37 liga (AD-045). O `checar-tokens.py` do PAR-145 é o Stylelint de tokens da v2 (`F:1374`, AD-042). O snapshot de compatibilidade (G-20, `BD:176`) fica fora, como na AD-019.
5. **Mockup**: todas as telas da feature têm mockup na v2 (`.specs/mockup/telas/` t01, t03, t09, t10, t11, t18, t21 e P01); não há tela sem mockup. Mas o `telas.json` da v2 é o da `main` do LJS (rotas do legado `/admin/g-quinta`, `telas.json:13-122`). O mockup do módulo (19 arquivos) e o patch de 17 arquivos de `.specs/mockup/` do LJS (`git diff 93ce6d1 c6dc82c`, entradas `real`, respostas sem `enderecoNovo`, t11 `nova`) entram por cópia (`reuso.md`, T53 e T75); o `git apply --check` está limpo hoje.
6. **Runner visual**: o `telas.json` do LJS usa `ocultar`, `abortar`, `sequencia`, `pendente`, `aguardarMs` e `userAgent`, que o runner da v2 (`CA:1609`) não tem → T75. Decisão nova: o runner congela o relógio do navegador (AD-044), porque a t09 `sem-jogadores` mostra o mês real (pendência de `BC:69`).
7. **Regressão do legado**: os casos Vandré, Kim e "saiu e voltou" entram como dado (entradas e valores esperados) de `ljs:backend/dominio/test/` @ `c6dc82c`, com os testes escritos do zero (AD-041, T6).
8. **Critérios com posição ou aparência**: PAR-12 e PAR-147 ("ao lado") com asserção de `boundingBox` (T62); PAR-80 (indicador além da cor) com seletor e comparação visual (T55, T76); PAR-88 ("no lugar das colunas") e PAR-104 pela comparação visual (T76, T77).
9. **Contrato da `grupos-e-elenco` v2** (`GE:`), conferido: relógio em `infraestrutura/relogio.ts` só com `hoje()` e `agoraIso()` (`GE:831`), então o mês é `mesDe(relogio.hoje())`; `grupos.criar(db, dados)` sem `slugBase` (`GE:1003`) ganha `hoje`; rota do grupo em `rotas/grupo.ts` (`GE:1080`); prévias de período e início em `rotas/periodos-correcao.ts` (`GE:1433`); início do grupo em `telas/grupo/InicioGrupo.tsx` (`GE:1847`); seed em `backend/scripts/src/seed.ts` (`GE:2164`); `tipos.ts` com `partidas` e `presencas` só leitura (`GE:878`) → T80. A `grupos-e-elenco` v2 deixa a t09 fora da comparação (AD-029 dela) e o SEC-010 fora ("sem par na v2"); aqui a t09 `sem-jogadores` entra (PAR-146) e T49 confere o `deepmerge` de verdade. Restam as suposições S-01 a S-03, abaixo.

### Suposições restantes sobre a grupos-e-elenco v2

| ID | Suposição | Usada em |
|---|---|---|
| S-01 | O `exigirGrupoAtivo` (`GE:901`) deixa a transação da requisição decidir o modo; T36 troca o `FOR KEY SHARE` por leitura simples quando ela é `READ ONLY` | T36 |
| S-02 | O texto do diálogo de reativar vem do mockup do módulo da grupos-e-elenco (`t16-jogador--reativar.html`, com "os pontos não mudam") e um teste dela o confere; T66 o troca (Pergunta 1) | T66 |
| S-03 | Os ids e slugs de exemplo (`g-quinta`, `pelada-de-quinta`, `racha-de-domingo`, `j-beto`, `j-gil`, `j-toninho`) do seed (`GE:2164`) são os do `telas.json` | T74, T76 |

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| PAR-01 | `GET pesos`: vigente e histórico com `registradoPor` | T17, T24, T28, T38 |
| PAR-02 | `vigenteAte` = véspera da configuração seguinte | T28 |
| PAR-03 | `POST pesos` grava com vigência hoje e a conta | T28, T38 |
| PAR-04 | Já há configuração hoje: substitui, sem linha nova | T28 |
| PAR-05 | Auditoria `pesos_configurados` ou `pesos_substituidos` na transação | T28 |
| PAR-06 | Peso não inteiro ou fora de −10 a 10: 422 no campo | T17, T38 |
| PAR-07 | Falta peso: 422 no campo | T17, T38 |
| PAR-08 | `vigenteDesde` ou campo extra: 422 sem gravar | T17, T38 |
| PAR-09 | Configuração anterior a hoje nunca muda | T25, T28 |
| PAR-10 | Tela t18 com vigente, formulário, nota e histórico | T62 |
| PAR-11 | Salvo: "Nova configuração vale a partir de hoje." | T62 |
| PAR-12 | Campo inválido: mensagem ao lado, sem enviar (posição) | T62 |
| PAR-13 | Migração cria pesos padrão para grupo sem configuração | T2, T21 |
| PAR-14 | Migração aditiva, sem tocar configuração existente | T21 |
| PAR-15 | `grupo_criar` cria a configuração padrão com o hoje recebido | T0, T22, T34 |
| PAR-16 | Falha nos pesos desfaz a criação do grupo | T22 |
| PAR-17 | `GET partidas/nova` sugere a data e lista os ativos `ausente` | T7, T39 |
| PAR-18 | Com `data`: ativos dessa data, `dataSugerida` mantida | T39 |
| PAR-19 | Data irreal: 422 "Informe uma data válida." | T1, T18, T39, T40 |
| PAR-20 | Data futura: 422 na consulta e no lançamento | T39, T40 |
| PAR-21 | Partida já existe: 409 `partida_ja_existe` com `dataExistente` | T39, T40 |
| PAR-22 | `POST partidas` grava partida e presenças, 201 | T30, T40 |
| PAR-23 | `ausente` e ativo sem marcação não gravam linha | T8, T30 |
| PAR-24 | Jogador inativo, inexistente ou de outro grupo: 422, mesma mensagem | T8, T30, T40 |
| PAR-25 | Jogador repetido: 422 em `marcacoes` | T8, T40 |
| PAR-26 | Situação inválida: 422 no campo | T18, T40 |
| PAR-27 | Ativo na data = período [início, fim) que a contém | T8, T29 |
| PAR-28 | Partida, presenças, evento e auditoria numa transação | T30 |
| PAR-29 | Trava dos marcados em ordem crescente de id antes de validar | T29, T30 |
| PAR-30 | Lançamentos simultâneos da mesma data: um 201, outro 409 | T30 |
| PAR-31 | Tela t11 com data, chuva, contadores, busca e botões | T60 |
| PAR-32 | Troca de data recarrega com "Carregando os jogadores…" | T60 |
| PAR-33 | Ninguém ativo: textos do vazio | T60 |
| PAR-34 | 409 na tela com o link de edição | T60 |
| PAR-35 | Falha de rede mantém as marcações | T60 |
| PAR-36 | Salvo: volta ao início com "Partida de dd/mm salva." | T60 |
| PAR-37 | `GET partidas?mes` com navegação e contagens | T32, T39 |
| PAR-38 | Sem `mes`: mês de hoje | T39 |
| PAR-39 | `mes` fora de `AAAA-MM`: 422 | T18, T39 |
| PAR-40 | Mês futuro: 422 | T39 |
| PAR-41 | Navegação da lista da primeira partida a hoje | T12, T32, T39 |
| PAR-42 | t10: "Quinta, 15/10/2026" e "15 P · 0 L · 1 E" | T59 |
| PAR-43 | t10 vazio | T59 |
| PAR-44 | `GET partidas/:data` com ativos e quem tem presença | T24, T32, T41 |
| PAR-45 | Sem partida ou data irreal: 404 em GET, PUT e DELETE | T41 |
| PAR-46 | `PUT` substitui chuva e presenças | T31, T41 |
| PAR-47 | Data do corpo ≠ caminho: 422 | T41 |
| PAR-48 | Edição valida os ativos na data da partida | T31, T41 |
| PAR-49 | Auditoria `partida_editada`, travas, sem evento | T31 |
| PAR-50 | `DELETE` apaga, audita e responde 204 | T31, T41 |
| PAR-51 | Exclusão mantém o `partida_lancada` | T31 |
| PAR-52 | Edição: data fixa e "Última alteração" | T24, T61 |
| PAR-53 | Diálogo de exclusão | T61 |
| PAR-54 | Depois de excluir: mensagem; falha: mensagem | T61 |
| PAR-55 | Pontos = peso da situação com ou sem chuva vigente na data | T2 |
| PAR-56 | Vigente = maior `vigente_desde` ≤ data; antes da primeira, a mais antiga | T3 |
| PAR-57 | Início da contagem: S ou o retorno | T4, T6 |
| PAR-58 | Acumulado do início da contagem até D, inclusive | T5, T6 |
| PAR-59 | Pontuação inicial só se o início ≤ primeira presença ou sem presença | T5, T6 |
| PAR-60 | Presença fora de período conta | T5, T10 |
| PAR-61 | Função única no domínio e regra de lint | T5, T51 |
| PAR-62 | Ranking calculado na leitura, sem pontos gravados | T16, T27, T74 |
| PAR-63 | 40 jogadores × 104 partidas em < 5 ms | T16 |
| PAR-64 | `GET publico/ranking` com os campos da projeção | T19, T45 |
| PAR-65 | Sem `mes`: hoje; formato inválido: "Mês inválido." | T1, T45, T54 |
| PAR-66 | Fora do histórico: 422 | T12, T45 |
| PAR-67 | Linhas só dos ativos hoje | T11 |
| PAR-68 | Ordem: acumulado, ano, apelido | T9 |
| PAR-69 | Empate: mesma posição e salto (1, 1, 3) | T9 |
| PAR-70 | Linha: posição, apelido, PTS inicial, rodadas, PTS final | T11, T19 |
| PAR-71 | Rodada de presença: situação e pontos | T10 |
| PAR-72 | Ativo sem presença: `falta`, 0 | T10 |
| PAR-73 | Fora ou antes do início: `fora`, "–" | T10 |
| PAR-74 | PTS INICIAL do mês | T11 |
| PAR-75 | PTS FINAL do mês | T11 |
| PAR-76 | Projeção pública sem campos proibidos | T19, T45 |
| PAR-77 | Ranking só no contexto do slug, sem sessão, somente leitura | T27, T37, T45 |
| PAR-78 | 429 acima de 60/60 s por IP, sem gravar o IP | T37 |
| PAR-79 | Tela t01 com cabeçalho, resumo e tabela | T55, T56, T74 |
| PAR-80 | Rodada com indicador além da cor e texto acessível | T55 |
| PAR-81 | Sem ativos: textos do vazio | T56 |
| PAR-82 | "Carregando o ranking…" | T56 |
| PAR-83 | "Ver ranking" abre `/g/:slug` | T58, T64 |
| PAR-84 | `mesAnterior` | T1, T12 |
| PAR-85 | `mesSeguinte` | T1, T12 |
| PAR-86 | Grupo sem partidas: navegação nula e PTS = acumulado | T11, T12 |
| PAR-87 | Mês sem partidas: linhas mantidas, PTS INICIAL = PTS FINAL | T11 |
| PAR-88 | Tela do mês vazio e cabeçalhos com o mês (posição: no lugar das colunas, T76) | T56, T76 |
| PAR-89 | Navegação troca `?mes=` e desabilita no nulo | T54, T56 |
| PAR-90 | Slug malformado, inexistente ou arquivado: mesmo 404 | T37, T45 |
| PAR-91 | `grupos_visiveis()` sem arquivado no ramo do slug | T0, T26 |
| PAR-92 | RLS: slug arquivado não lê nenhuma tabela | T26, T48 |
| PAR-93 | Reativado: slug volta a servir | T26, T45 |
| PAR-94 | t03 "Grupo indisponível", sem API no slug malformado | T57 |
| PAR-95 | `GET publico/pdf` com a projeção | T19, T46 |
| PAR-96 | Colunas: 12 mais recentes até o fim do mês | T13 |
| PAR-97 | `semPartidasNoMes` | T13 |
| PAR-98 | `ptsInicial` do PDF | T13 |
| PAR-99 | PDF com as linhas e o PTS FINAL do ranking | T13 |
| PAR-100 | PDF com as mesmas recusas do ranking | T46 |
| PAR-101 | Projeção do PDF estrita, até 12 colunas | T19, T46 |
| PAR-102 | "Preparando PDF…" e `jspdf` sob demanda | T50, T70 |
| PAR-103 | 1 página A4 até 40 × 12, fonte ≥ 7 pt | T68 |
| PAR-104 | Conteúdo do PDF (meses sobre as colunas, legenda) | T68, T77 |
| PAR-105 | Compartilhamento: diálogo "PDF pronto." | T69 |
| PAR-106 | Sem compartilhamento: download e "PDF baixado." | T69 |
| PAR-107 | Falha: "Não foi possível gerar o PDF." | T70 |
| PAR-108 | Comparação visual com P01 | T77 |
| PAR-109 | Prévia de reativar sem gravar | T14, T20, T36, T42 |
| PAR-110 | Prévia de correção de período | T14, T20, T36, T42 |
| PAR-111 | Prévia de data de início | T15, T20, T36, T42 |
| PAR-112 | Prévia com a mesma validação e recusa da gravação | T36, T42 |
| PAR-113 | Acumulado e posição de hoje pela função única | T14, T42 |
| PAR-114 | Rodadas que passam e deixam de constar | T15, T42 |
| PAR-115 | Recuo antes do primeiro período alinha o início | T15, T42 |
| PAR-116 | `aviso` singular, plural ou nulo | T15, T42 |
| PAR-117 | Textos de acumulado e posição | T65 |
| PAR-118 | Textos das rodadas e faixa de atenção | T65 |
| PAR-119 | Texto da prévia de início | T65 |
| PAR-120 | "Calculando…" e "Confirmar" desabilitado | T66 |
| PAR-121 | Ficha depois de confirmar | T66 |
| PAR-122 | Auditoria das escritas de período com acumulado e posição | T35 |
| PAR-123 | Identificador anônimo no aparelho | T67 |
| PAR-124 | `ranking_aberto` uma vez por carregamento | T67 |
| PAR-125 | `pdf_exportado` com o mês | T67, T70 |
| PAR-126 | Falha do evento ignorada | T67 |
| PAR-127 | Evento gravado com grupo, tipo, momento do relógio; 204 | T23, T33, T47 |
| PAR-128 | Corpo inválido 422, acima de 1 KB 413, slug indisponível 404 | T19, T47 |
| PAR-129 | Nunca IP, user-agent, conta ou jogador no evento | T23, T47 |
| PAR-130 | `pelada_app` só SELECT e INSERT em `eventos_uso` | T0, T23 |
| PAR-131 | Contexto do slug sem escrita em outra tabela | T23 |
| PAR-132 | `GET /api/grupos/:grupoId` com os 6 campos | T20, T33, T34, T43 |
| PAR-133 | "Dia de jogo": lançar ou editar na data sugerida | T64 |
| PAR-134 | Item Partidas | T64 |
| PAR-135 | Item Pontuação: "Pesos padrão" ou "Vigente desde" | T2, T64 |
| PAR-136 | Item Uso do app | T64 |
| PAR-137 | Rotas novas na suíte de isolamento | T48 |
| PAR-138 | Grupo B: 404 sem ler nem alterar | T48 |
| PAR-139 | Rota pública devolve só o grupo do slug | T48 |
| PAR-140 | Regra `pelada/sem-escrita-periodo` ligada (sem G-26/THREAT-MODEL, AD-039) | T52 |
| PAR-141 | Reavaliar `deepmerge` e registrar (AD-039) | T49 |
| PAR-142 | Auditoria só com ids, datas, booleanos, números | T28, T30, T31 |
| PAR-143 | Rotas do app | T58 |
| PAR-144 | Tela t21 | T63 |
| PAR-145 | Só tokens (Stylelint, AD-042) | T76 |
| PAR-146 | Comparação visual das telas | T53, T75, T76 |
| PAR-147 | 422 com `campos`: "Corrija N campos" e mensagem ao lado (posição) | T60, T62 |
| PAR-148 | Guarda a resposta por slug e mês | T72 |
| PAR-149 | Faixa "Sem conexão, atualizado em …" | T73, T78 |
| PAR-150 | "É preciso conexão para entrar." | T73, T78 |
| PAR-151 | Sem guardado: "Sem conexão" | T73, T78 |
| PAR-152 | "atualizando…" | T73 |
| PAR-153 | SW guarda só o shell e o ranking público | T71, T78 |
| PAR-154 | Aparelho guarda só o permitido e valida | T72 |
| PAR-155 | `GET uso` por semana | T20, T33, T44 |
| PAR-156 | Semana segunda a domingo em São Paulo | T33 |
| PAR-157 | Aparelhos distintos | T33 |
| PAR-158 | Partidas em até 48 h no horário do grupo | T33 |
| PAR-159 | Texto novo do diálogo de reativar | T66 |
| PAR-160 | t09 sem Simulador e Financeiro | T64 |
| PAR-161 | t01 sem o atalho Financeiro | T56 |

Nenhum critério fica fora. Mudam de leitura, pelas ADs propostas: PAR-15 (delegação da `grupo_criar` antiga, AD-037), PAR-78 (limite ligado aqui, AD-045), PAR-140 e PAR-141 (sem G-26 nem THREAT-MODEL, AD-039), PAR-145 (Stylelint, AD-042), PAR-148 e PAR-154 (`localStorage`, AD-040).

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:409`): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje**: não roda. O `testes.json` atual é a dispensa temporária (repositório sem código) e as features 1 a 3 ainda não foram executadas.
- **Falhas preexistentes**: nenhuma conhecida; a linha de base é o gate final da `grupos-e-elenco`. O `/executar` roda a suíte uma vez antes do lote 1 e registra aqui o resultado. A T0 é a rede de proteção do que esta feature muda no banco.

## Test Coverage Matrix

> Gerada da Base, dos contratos das features 1 a 3 e das regras de teste do `.claude/CLAUDE.md`. Padrão forte: todo critério e todo caso limite (`B:486-502`) com teste.

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Domínio (`backend/dominio`) | unit | Todos os ramos de PAR-55 a PAR-63, PAR-67 a PAR-75, PAR-84 a PAR-87, PAR-96 a PAR-99, PAR-109 a PAR-116; regressão do legado; bench | `backend/dominio/test/**/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada schema: válido, cada limite, campo extra; campo proibido do público | `backend/contrato/test/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Banco: migrações, funções, RLS e grants | integration | Postgres real, como `pelada_app` (`comoApp`); matriz política × comando abaixo; fuso de São Paulo; slug de grupo arquivado | `backend/api/test/banco/*.test.ts`, `backend/api/test/isolamento/*.test.ts` | `pnpm --filter @pelada/api test` |
| Repositórios | integration | Cada caminho, auditoria na mesma transação, rollback, travas na ordem da AD-038 com duas conexões, 23505 → 409 | `backend/api/test/repositorios/*.test.ts` | `pnpm --filter @pelada/api test` |
| Middlewares e rotas | e2e | Pool `workerd` com Postgres local: caminho feliz, cada código de erro da spec, 404 cruzado, 409 de arquivado, 404 do slug, 413, 429; relógio fixo | `backend/api/test/rotas/*.test.ts` | `pnpm --filter @pelada/api test` |
| Isolamento de rotas | e2e | Toda rota nova: conta do grupo A contra o B; públicas com o slug do outro grupo e de arquivado | `backend/api/test/isolamento/rotas.test.ts` | `pnpm --filter @pelada/api test` |
| Lint e dependências | unit / none | Regra com arquivo de prova que falha e que passa; auditoria de dependência registrada | `test/lint/*.test.ts` | `pnpm lint` e `pnpm test` |
| Front: dados, telas, PDF e SW | unit | jsdom + Testing Library + axe: cada estado do mockup e cada mensagem da spec | `frontend/web/src/**/*.test.{ts,tsx}` | `pnpm --filter @pelada/web test` |
| Front: comparação visual e PDF | e2e | Telas de PAR-146 × 2 viewports até 1%; P01 em 794 × 1123 px até 4,5% (9% no CI) | `frontend/web/e2e/visual.mjs`, `pdf-visual.spec.ts` | `pnpm --filter @pelada/web visual` e `e2e` |
| Front: jornadas e sem conexão | e2e | Jornadas desta feature e `ranking-offline` contra o `wrangler dev` com o seed | `frontend/web/e2e/*.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Mockup e documentação | none | `cmp` contra a origem; gate de build | — | gate de build |

**Matriz política × comando** (como `pelada_app`, dois grupos A e B, contexto de conta A, de slug de A e sem contexto; cada célula é um teste que morre com a policy aberta `USING (true)`, sem `WITH CHECK` ou com grant a mais):

| Tabela ou função | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `config_pesos` | conta A só A; slug de A só A; slug de arquivado zero (T26) | conta A em B recusado; slug recusado (T21, T28) | só colunas de peso de A; `vigente_desde` recusado; sem `WHERE` afeta só A (T25) | recusado, sem grant (T25) |
| `partidas` | como acima (T26, T32) | conta A em B recusado; slug recusado (T30) | só `choveu`, `alterada_por`, `alterada_em`; `data` recusado; mover para B recusado pelo `WITH CHECK`; sem `WHERE` só A (T25) | só de A; sem `WHERE` apaga só as de A (T31) |
| `presencas` | como acima (T26, T27) | só em partida de A (T30) | grant da linha de base, só A (T31) | só de A; cascade da partida (T31) |
| `eventos_uso` | só com conta, só A; slug zero (T23) | conta A só em A; slug direto recusado (T23) | recusado, sem grant (T23) | recusado, sem grant; TRUNCATE recusado (T23) |
| `evento_publico_registrar` | — | só com o slug do contexto e grupo ativo; com conta, recusa; outro slug, `false` (T23) | — | — |
| `contas_nomes_do_grupo` | só com conta e grupo visível; só autoras; sem e-mail (T24) | — | — | — |
| `grupos_visiveis()` | ramo da conta inalterado (T0); ramo do slug sem arquivado (T26) | — | — | — |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` |
| Build | Dependências, mockup e o fim da feature | O comando da seção Linha de base |

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, em sequência. Criticidade: Phases 1 a 19 **críticas**, 20 a 30 **comuns**. Total: 82 tarefas, 30 Phases, 131h. Lotes previstos (até 6h, Phases inteiras, `progresso.py --lote` confirma): L1 = P1 (2h, crítico); L2 = P2 (4,5h, crítico); L3 = P3 (5h, crítico); L4 = P4 (2,5h, crítico); L5 = P5 (5,5h, crítico); L6 = P6 (3,5h, crítico); L7 = P7 (5h, crítico); L8 = P8 (5h, crítico); L9 = P9 (4,5h, crítico); L10 = P10 (6h, crítico); L11 = P11 (5,5h, crítico); L12 = P12 (5,5h, crítico); L13 = P13 (5h, crítico); L14 = P14 (3h, crítico); L15 = P15 (5h, crítico); L16 = P16 (4h, crítico); L17 = P17 (4h, crítico); L18 = P18 (5h, crítico); L19 = P19 (4h, crítico); L20 = P20 (3h, comum); L21 = P21 (4h, comum); L22 = P22 (4h, comum); L23 = P23 (5h, comum); L24 = P24 (5h, comum); L25 = P25 (4h, comum); L26 = P26 (5h, comum); L27 = P27 (4,5h, comum); L28 = P28 (3h, comum); L29 = P29 + P30 (9h, comum). Lotes com tarefa de `Domínio: sim`: L2, L3, L4, L5, L6, L7, L9, L11, L12, L13, L16.

### Phase 1: Rede de proteção: o que o banco já faz e esta feature mexe (crítica, 2h)

```
T0
```

### Phase 2: Domínio: datas e pesos (crítica, 4,5h)

```
T1 → T2 → T3
```

### Phase 3: Domínio: função única de acumulado (crítica, 5h)

```
T4 → T5 → T6
```

### Phase 4: Domínio: partida (crítica, 2,5h)

```
T7 → T8
```

### Phase 5: Domínio: ranking (crítica, 5,5h)

```
T9 → T10 → T11
```

### Phase 6: Domínio: meses e PDF (crítica, 3,5h)

```
T12 → T13
```

### Phase 7: Domínio: prévias e desempenho (crítica, 5h)

```
T14 → T15 → T16
```

### Phase 8: Contrato (crítica, 5h)

```
T17 → T18 → T19 → T20
```

### Phase 9: Migrações: pesos padrão e grupo_criar (crítica, 4,5h)

```
T21 → T22 → T80
```

### Phase 10: Migrações: evento público, nomes, grants e grupos_visiveis (crítica, 6h)

```
T23 → T24 → T25 → T26
```

### Phase 11: Repositórios: histórico, pesos e jogadores (crítica, 5,5h)

```
T27 → T28 → T29
```

### Phase 12: Repositórios: partidas (crítica, 5,5h)

```
T30 → T31 → T32
```

### Phase 13: Repositórios: eventos, grupos e auditoria de períodos (crítica, 5h)

```
T33 → T34 → T35
```

### Phase 14: Middlewares: prévia somente leitura e contexto público (crítica, 3h)

```
T36 → T37
```

### Phase 15: Rotas admin: pesos e lançamento (crítica, 5h)

```
T38 → T39 → T40
```

### Phase 16: Rotas admin: partida por data e prévias (crítica, 4h)

```
T41 → T42
```

### Phase 17: Rotas admin e ranking público (crítica, 4h)

```
T43 → T44 → T45
```

### Phase 18: Rotas públicas restantes e isolamento (crítica, 5h)

```
T46 → T47 → T48
```

### Phase 19: Ensaio das migrações sobre a produção e dependências (crítica, 4h)

```
T81 → T49 → T50
```

### Phase 20: Lint da função única e das escritas de período (comum, 3h)

```
T51 → T52
```

### Phase 21: Web: mockup do módulo e tabela do ranking (comum, 4h)

```
T53 → T54 → T55
```

### Phase 22: Web: página do ranking, indisponível e rotas (comum, 4h)

```
T56 → T57 → T58
```

### Phase 23: Web: partidas (comum, 5h)

```
T59 → T60 → T61
```

### Phase 24: Web: pontuação, uso e início do grupo (comum, 5h)

```
T62 → T63 → T64
```

### Phase 25: Web: prévias na ficha do jogador (comum, 4h)

```
T65 → T66
```

### Phase 26: Web: eventos anônimos e geração do PDF (comum, 5h)

```
T67 → T68 → T69
```

### Phase 27: Web: PDF na tela, service worker e guardado local (comum, 4,5h)

```
T70 → T71 → T72
```

### Phase 28: Web: telas sem conexão e seed (comum, 3h)

```
T73 → T74
```

### Phase 29: Comparação visual (comum, 5,5h)

```
T75 → T76 → T77
```

### Phase 30: Ponta a ponta (comum, 3,5h)

```
T78 → T79
```

## Task Breakdown

#### Phase 1: Rede de proteção: o que o banco já faz e esta feature mexe

### T0: Caracterização no banco do que esta feature troca e precisa manter

**What**: Rede de proteção (T0, skill `rede-de-protecao`): testes no Postgres, como `pelada_app`, do comportamento atual que as migrações desta feature tocam: (a) ramo com conta de `grupos_visiveis()` (arquivado só para quem criou); (b) `grupo_criar` de 6 parâmetros (slug, vínculo, habilidades, rollback) sem `config_pesos`; (c) grants atuais de `partidas`, `config_pesos`, `presencas` e `eventos_uso`; (d) ramo do slug ainda mostra grupo arquivado (I-3, o teste deste item é o que T26 inverte, com motivo).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/partidas-rede.test.ts`
**Depends on**: None
**Reuses**: `comoApp` e o cenário de dois grupos (`F:909`); `M:1792844280000_grupos-visiveis-arquivado.sql:9-22`; `M:1792844340000_grupo-criar.sql:10-75`; `M:1792843260000_roles.sql:22-31`; matriz de `F:981` e `F:1007`
**Requirement**: PAR-91, PAR-15, PAR-130 (linha de base)
**Status**: rascunhada

**Done when**:

- [ ] Teste: com conta não criadora, grupo arquivado some de `grupos`; com a criadora, aparece (item a, fica verde até o fim da feature)
- [ ] Teste: `grupo_criar` de 6 parâmetros cria grupo, vínculo e habilidades e desfaz tudo numa falha forçada (item b, fica verde até o fim: a delegação de T22 o mantém)
- [ ] Teste: `pelada_app` tem `UPDATE` em `partidas` e `config_pesos`, nenhum grant em `eventos_uso` (item c, documenta o antes de T23 e T25)
- [ ] Evidência da rede: uma sabotagem por item (ex.: `CREATE OR REPLACE` de `grupos_visiveis()` sem o filtro de arquivado) deixa o teste vermelho; registrada nesta tarefa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Domínio: datas e pesos

### T1: Datas e meses no domínio

**What**: Funções puras em `backend/dominio/src/datas.ts`: `ehDataReal`, `ehMes`, `mesDe`, `primeiroDia`, `ultimoDia`, `vespera`, `mesAnterior`, `mesSeguinte`, `compararMeses`, `diaDaSemana`. Recebem datas `AAAA-MM-DD` e meses `AAAA-MM`; nenhuma lê relógio.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/datas.ts`
**Depends on**: None
**Reuses**: Regra de domínio sem I/O (`F:385`); convenção de datas de `B:98-100`; reusar `ehDataReal` e o intervalo [início, fim) de `backend/dominio/src/atividade/datas.ts` (`GE:626`), sem duplicar
**Requirement**: PAR-19, PAR-39, PAR-65, PAR-84, PAR-85
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-19`: 2026-02-29 e 2026-13-01 não são datas reais; 2028-02-29 é
- [ ] Teste `PAR-84`/`PAR-85`: `mesAnterior('2026-01')` = `2025-12`, `mesSeguinte('2026-12')` = `2027-01`
- [ ] Teste: `diaDaSemana` de 2026-10-15 é quinta; `ultimoDia('2028-02')` = `2028-02-29`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T2: Pesos: tipos, padrão e pontos da presença

**What**: `ConfigPesos`, `PESOS_PADRAO` (1, 1, 1, 1, −1, −1), `pontosDaPresenca(situacao, choveu, pesos)` e `ehPesosPadrao(configs)` (uma só configuração com os valores padrão) em `backend/dominio/src/pontuacao/pesos.ts`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/pontuacao/pesos.ts`
**Depends on**: T1
**Reuses**: Regras de `B:229` (PAR-55), `B:77` (rótulo Pesos padrão, P10) e `BD:159-160`
**Requirement**: PAR-55, PAR-135, PAR-13
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-55`: expulso em partida com chuva usa `expulsoComChuva` (caso limite `B:496`)
- [ ] Teste `PAR-55`: cada uma das 3 situações × chuva sim/não dá o peso certo
- [ ] Teste `PAR-135`: `ehPesosPadrao` é falso com duas configurações, mesmo ambas padrão, e falso com uma não padrão
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T3: Resolvedor de pesos por vigência

**What**: `criarResolvedorDePesos(configs)`: busca binária pela maior `vigente_desde` ≤ data; data anterior à primeira usa a mais antiga; sem configuração lança erro.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/pontuacao/resolvedor.ts`
**Depends on**: T2
**Reuses**: `B:230` (PAR-56) e casos limite `B:490-491`; `BD:159`
**Requirement**: PAR-56
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-56`: partida no dia exato do `vigente_desde` usa a configuração nova
- [ ] Teste `PAR-56`: pesos trocados no meio do mês pontuam cada partida pela sua vigência
- [ ] Teste `PAR-56`: data anterior à primeira configuração usa a mais antiga; lista vazia lança
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 3: Domínio: função única de acumulado

### T4: Início da contagem

**What**: `inicioDaContagem(jogador, X)`: a data de início da pontuação S quando o período mais recente com início até X é o primeiro (ou não há período), e o início desse período quando ele é um retorno.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/pontuacao/inicio.ts`
**Depends on**: T3
**Reuses**: `B:231` (PAR-57), Assumption `B:60` (saiu e voltou, vale o legado); tipos e intervalo [início, fim) de `GE:626` (T11 da grupos-e-elenco)
**Requirement**: PAR-57
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-57`: sem período, S; um período, S; saiu e voltou, a data do retorno para X depois dele e S para X antes
- [ ] Teste `PAR-57`: sair e voltar no mesmo dia (GEL-61) dá o retorno como início
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T5: Função única de acumulado

**What**: `acumuladoPorInicio({ inicio, pontuacaoInicial, presencas, configs, referencia, periodos, periodoEm })`: soma os pontos das presenças do início da contagem até D (inclusive nas duas pontas), com a pontuação inicial só quando o início da contagem é ≤ a primeira presença de todo o histórico ou não há presença. Internas `acumuladoAte` e `acumuladoComInicial` não são exportadas pelo `index.ts`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/pontuacao/acumulado.ts`
**Depends on**: T4
**Reuses**: `B:232-235` (PAR-58 a PAR-61), casos limite `B:486-489`, `B:501`; interface de `BD:155-158`
**Requirement**: PAR-58, PAR-59, PAR-60, PAR-61
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-59`: S igual à primeira presença soma a inicial; S um dia depois, não
- [ ] Teste `PAR-59`: sem presença, soma a inicial com qualquer S
- [ ] Teste `PAR-60`: presença fora de período, dentro de [início da contagem, D], conta
- [ ] Teste `PAR-58`: data de início hoje dá acumulado 0 e recuar volta ao valor anterior (Kim)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T6: Regressão com os casos do legado

**What**: Testes de regressão com as entradas e os valores esperados dos casos Vandré, Kim e "saiu e voltou", tirados como dado de `ljs:backend/dominio/test/pontuacao/acumulado.test.ts` e `ljs:backend/dominio/test/apoio/historico.ts` @ `c6dc82c` (AD-041); o código do teste é escrito do zero.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/test/pontuacao/regressao.test.ts`
**Depends on**: T5
**Reuses**: AD-041; Goal `B:25` e Independent Test `B:239`
**Requirement**: PAR-58, PAR-59, PAR-57
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-58`: Vandré, Kim e "saiu e voltou" dão os mesmos números da origem, caso a caso
- [ ] Teste `PAR-57`: no mês do retorno, PTS INICIAL 0 sem a inicial se havia presença antes; meses do primeiro período inalterados (`B:489`)
- [ ] A tabela de origem (arquivo e linha de cada caso) fica no cabeçalho do teste
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 4: Domínio: partida

### T7: Data sugerida da partida

**What**: `dataSugeridaPartida(hoje, diaSemana)`: a maior data até hoje que cai no dia da semana do grupo (hoje, se hoje é o dia).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/partidas/data-sugerida.ts`
**Depends on**: T1
**Reuses**: `B:152` (PAR-17), caso limite `B:502`; Independent Test `B:173`
**Requirement**: PAR-17
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-17`: grupo de quinta, numa sexta, sugere a quinta anterior; numa quinta, sugere hoje
- [ ] Teste `PAR-17`: virada de mês e de ano (quinta 2026-12-31 → sexta 2027-01-01)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T8: Validação das marcações e contagem da partida

**What**: `validarMarcacoes(ativosNaData, marcacoes)` (inativo, inexistente e de outro grupo com a mesma mensagem; repetido) e `contagemDaPartida(presencas)`; `ausente` nunca vira presença.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/dominio/src/partidas/marcacoes.ts`
**Depends on**: T7
**Reuses**: `B:158-162` (PAR-23 a PAR-27); intervalo [início, fim) de `GE:626`
**Requirement**: PAR-23, PAR-24, PAR-25, PAR-27
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-24`: os três casos dão "Jogador não está ativo nesta data." em `marcacoes.<i>.jogadorId`
- [ ] Teste `PAR-25`: jogador repetido dá "Há jogador repetido nas marcações." em `marcacoes`
- [ ] Teste `PAR-27`: jogador com período [início, fim) que termina na data não está ativo nela
- [ ] Teste `PAR-23`: `ausente` não entra na lista de presenças a gravar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 5: Domínio: ranking

### T9: Ordem e posição do ranking

**What**: `ordenarPorRanking(linhas)`: acumulado até hoje (maior primeiro), ano de nascimento (menor primeiro, nulo = 9999 no fim), apelido sem acento nem caixa; posições iguais para empate nos três, a seguinte pula (1, 1, 3).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/ranking/ordenar.ts`
**Depends on**: T5
**Reuses**: `B:255-256` (PAR-68, PAR-69), `B:66` (sem ano no fim), caso limite `B:492`; ordem do apelido sem acento nem caixa de `GE:575`
**Requirement**: PAR-68, PAR-69
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-69`: "José", "Jose" e "Jôse" empatados em tudo ficam na mesma posição e o seguinte é o 4
- [ ] Teste `PAR-68`: sem ano de nascimento vai depois de todos com ano, no mesmo acumulado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T10: Rodadas de cada jogador

**What**: `rodadasDoJogador(jogador, partidasDoMes, inicioDaContagemDoMes)`: presença gravada dá a situação e os pontos; ativo sem presença, `falta` e 0; não ativo e sem presença, `fora` e nulo; toda rodada antes do início da contagem do mês, `fora`, com ou sem presença.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/ranking/rodadas.ts`
**Depends on**: T9
**Reuses**: `B:258-260` (PAR-71 a PAR-73), `B:62` (presença fora de período conta), casos `B:486`, `B:497`
**Requirement**: PAR-71, PAR-72, PAR-73, PAR-60
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-73`: rodada anterior ao início da contagem é `fora` mesmo com presença gravada
- [ ] Teste `PAR-72`: ativo sem presença é `falta` com 0
- [ ] Teste `PAR-60`: presença fora de período e depois do início da contagem aparece com a situação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T11: calcularRanking: linhas, PTS INICIAL e PTS FINAL

**What**: `calcularRanking(entrada)`: linhas só dos ativos hoje, iguais em qualquer mês; PTS INICIAL = acumulado até a véspera do dia 1 de M, com o início da contagem tomado no último dia de M ou hoje (o que vier antes); PTS FINAL = PTS INICIAL + soma das rodadas ("–" = 0); mês sem partidas mantém linhas e ordem.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/ranking/calcular.ts`
**Depends on**: T10
**Reuses**: `B:254`, `B:257`, `B:261-262` (PAR-67, PAR-70, PAR-74, PAR-75), `B:286-287`; casos `B:493-495`
**Requirement**: PAR-67, PAR-70, PAR-74, PAR-75, PAR-86, PAR-87
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-74`: mês corrente toma o período em hoje e PTS FINAL = acumulado de hoje
- [ ] Teste `PAR-67`: inativo hoje com partidas no mês sai das linhas, sem perder histórico
- [ ] Teste `PAR-87`: mês sem partidas dá PTS INICIAL = PTS FINAL e a mesma ordem de outubro
- [ ] Teste `PAR-86`: grupo sem partidas dá PTS INICIAL = PTS FINAL = acumulado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 6: Domínio: meses e PDF

### T12: Mês no histórico e navegação

**What**: `mesNoHistorico(mes, mesDaPrimeira, mesDeHoje)` e `navegacaoDeMes(...)`: aceita do mês da primeira partida ao de hoje; sem partidas, só o de hoje; `mesAnterior`/`mesSeguinte` nulos nas pontas e sem partidas.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/ranking/navegacao.ts`
**Depends on**: T11
**Reuses**: `B:253` (PAR-66), `B:284-286` (PAR-84 a PAR-86), `B:189` (PAR-41), `B:65`
**Requirement**: PAR-41, PAR-66, PAR-84, PAR-85, PAR-86
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-66`: mês anterior à primeira partida, futuro, ou outro que não o de hoje sem partidas: fora do histórico
- [ ] Teste `PAR-84`: no mês da primeira partida, `mesAnterior` nulo; `PAR-85`: no mês de hoje, `mesSeguinte` nulo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T13: calcularPdf e escolha das colunas

**What**: `escolherColunasPdf` (partidas até o último dia de M, as 12 mais recentes, em ordem cronológica, com `doMesExibido`) e `calcularPdf(entrada)`: mesmas linhas, ordem, posições e PTS FINAL do ranking; `ptsInicial` = acumulado até a véspera da primeira coluna, ou = `ptsFinal` sem coluna; `semPartidasNoMes`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/pdf/calcular.ts`
**Depends on**: T12
**Reuses**: `B:322-325` (PAR-96 a PAR-99), `B:63-64`, casos `B:498-499`
**Requirement**: PAR-96, PAR-97, PAR-98, PAR-99
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-96`: mês com 14 partidas fica com as 12 mais recentes e o PTS INICIAL absorve as 2 primeiras
- [ ] Teste `PAR-96`: janeiro completa as colunas com dezembro do ano anterior
- [ ] Teste `PAR-99`: soma das rodadas + `ptsInicial` fecha o `ptsFinal` do ranking em toda linha
- [ ] Teste `PAR-97`: mês sem partida marca `semPartidasNoMes` com colunas só de meses anteriores
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 7: Domínio: prévias e desempenho

### T14: compararCenarios: acumulado e posição antes e depois

**What**: `compararCenarios(historico, jogadorId, periodosDepois, hoje)`: calcula, pela função única, acumulado e posição de hoje antes e depois, com os outros jogadores como estão; `posicao` nula quando o jogador não está ativo hoje no cenário.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/previas/comparar.ts`
**Depends on**: T13
**Reuses**: `B:352` (PAR-113), `BD:165`
**Requirement**: PAR-109, PAR-110, PAR-113
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-113`: reativar quem estava fora passa de `posicaoAntes` nula a uma posição
- [ ] Teste `PAR-113`: corrigir a saída para antes de hoje dá `posicaoDepois` nula
- [ ] Teste `PAR-113`: posições dos outros jogadores são recalculadas no cenário depois
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T15: Rodadas que passam ou deixam de constar, aviso e prévia de início

**What**: `previaDosPeriodos` (rodadas de "–" para situação e o inverso, cortadas no início da contagem do mês de cada uma; `aviso` singular, plural ou nulo) e `previaDoInicio` (recuo antes do primeiro período alinha esse início à nova data, GEL-81).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/previas/rodadas.ts`
**Depends on**: T14
**Reuses**: `B:350`, `B:353-355` (PAR-111, PAR-114 a PAR-116), caso `B:500`; avaliação da data de início com o recuo de `GE:726`
**Requirement**: PAR-111, PAR-114, PAR-115, PAR-116
**Status**: rascunhada

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-116`: uma falta que passa a constar dá o aviso no singular; duas, no plural; nenhuma, nulo
- [ ] Teste `PAR-114`: Gil inativo desde 05/10, retorno em 08/10, dá 08/10 e 15/10 passando a constar (`B:364`)
- [ ] Teste `PAR-115`: recuo que não alcança presença mantém o acumulado e só passa rodadas de "–" a falta
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T16: Desempenho do domínio e exportações

**What**: Bench: 40 jogadores × 104 partidas, mediana de `calcularRanking` < 5 ms em 50 rodadas, e o mesmo orçamento para `calcularPdf` e `compararCenarios`; `index.ts` exporta só a API pública (sem `acumuladoAte` e `acumuladoComInicial`).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/dominio/test/desempenho.test.ts`
**Depends on**: T15
**Reuses**: `B:237` (PAR-63), `BD:169-170`
**Requirement**: PAR-63, PAR-62
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-63`: mediana < 5 ms nas três funções
- [ ] Teste: `index.ts` não exporta as internas da pontuação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 8: Contrato

### T17: Contrato de pesos

**What**: `pesosCorpo` (6 inteiros de −10 a 10, `strictObject`, mensagem "Use um número inteiro de -10 a 10.") e `pesosPainel` (`hoje`, `vigente`, `historico` com `vigenteAte`).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/pesos.ts`
**Depends on**: None
**Reuses**: Primitivos zod do contrato (`CA:550`); `B:110-117`; `BD:177`
**Requirement**: PAR-01, PAR-06, PAR-07, PAR-08
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-06`: 10,5, 11 e −11 recusados no campo do peso, com a mensagem
- [ ] Teste `PAR-07`: peso ausente recusado no campo
- [ ] Teste `PAR-08`: `vigenteDesde` no corpo é recusado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T18: Contrato de partidas

**What**: `partidaCorpo` (`data`, `choveu`, `marcacoes: { jogadorId: uuid, situacao }[]`), `partidaResposta`, `partidaNova`, `partidasDoMes`, `consultaData` e `consultaMes`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/partidas.ts`
**Depends on**: T17
**Reuses**: `CA:550`; `B:152-161`, `B:185-187`; `BD:178-179`
**Requirement**: PAR-19, PAR-26, PAR-39
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-19`: `data` que não é data real dá "Informe uma data válida."
- [ ] Teste `PAR-26`: situação fora das 4 recusada no campo da marcação
- [ ] Teste `PAR-39`: `mes` fora de `AAAA-MM` dá "Informe o mês como AAAA-MM."
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T19: Contrato público: ranking, PDF e evento

**What**: `rankingPublico` e `pdfPublico` (só os campos de PAR-64, PAR-70 e PAR-95, `strictObject`, PDF com até 12 colunas e uma rodada por coluna), `eventoPublicoCorpo` (união por `tipo`: `ranking_aberto` com `dispositivoId`, `pdf_exportado` com `mes`) e `CAMPOS_PROIBIDOS_PUBLICO`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/publico.ts`
**Depends on**: T18
**Reuses**: `B:251`, `B:257`, `B:263` (PAR-76), `B:321`, `B:327`, `B:381`; `BD:179-182`
**Requirement**: PAR-64, PAR-70, PAR-76, PAR-95, PAR-101, PAR-128
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-76`: um campo de `CAMPOS_PROIBIDOS_PUBLICO` (id de jogador, telefone, ano, idade, posição, notas, nível, períodos, pontuação inicial, financeiro) em qualquer nível é recusado
- [ ] Teste `PAR-101`: 13 colunas ou linha com rodadas ≠ colunas recusadas
- [ ] Teste `PAR-128`: `ranking_aberto` com `mes`, tipo desconhecido e campo extra recusados
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T20: Contrato de prévias, uso e início do grupo

**What**: `previaResposta`, `previaInicioResposta`, `usoResposta` e os 6 campos novos de `grupoDetalhe` (PAR-132); a prévia de reativar usa o mesmo `{ data }` da gravação.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/previas.ts`
**Depends on**: T19
**Reuses**: `B:348-350`, `B:398`, `B:475`; `BD:181-182`; `grupoDetalhe` da grupos-e-elenco (`GE:753`)
**Requirement**: PAR-109, PAR-110, PAR-111, PAR-132, PAR-155
**Status**: rascunhada

**Done when**:

- [ ] Teste `PAR-109`: `previaResposta` aceita `posicaoDepois` nula e recusa campo extra
- [ ] Teste `PAR-132`: `grupoDetalhe` exige os 6 campos novos
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 9: Migrações: pesos padrão e grupo_criar

### T21: Migração: pesos padrão para os grupos sem configuração

**What**: Migração aditiva (gerador `F:883`, timestamp maior que a última da grupos-e-elenco v2): insere 1, 1, 1, 1, −1, −1 para cada grupo sem `config_pesos`, com `vigente_desde` = `(criado_em AT TIME ZONE 'America/Sao_Paulo')::date` e `registrado_por` = `criado_por`. Não lê relógio.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_pesos-padrao.sql`
**Depends on**: T0
**Reuses**: Gerador e checagem aditiva (`F:883`, `F:858`); tabela `M:1792843200000_linha-de-base.sql:155`; SQL de `BD:120-124`
**Requirement**: PAR-13, PAR-14
**Status**: rascunhada
**Nota do rascunho**: migração `1792844580000_pesos-padrao.sql`; testes em `backend/api/test/banco/pesos-padrao.test.ts` (roda de novo o SQL da migração sobre grupos criados depois) e `backend/scripts/checagens/test/migracao-aditiva-partidas.test.ts` (as tarefas T22 a T26 acrescentam o sufixo delas). O código entrou no commit `f00bc55` de outra sessão (índice do git compartilhado).

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-13`: grupo criado em 2026-10-01 02:30 UTC ganha `vigente_desde` 2026-09-30 (fuso de São Paulo)
- [ ] Teste `PAR-14`: grupo que já tinha configuração fica intacto; rodar de novo não duplica
- [ ] Teste `PAR-14`: a checagem de migração aditiva passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T22: Migração: grupo_criar com pesos (expandir)

**What**: Nova `grupo_criar(…, p_habilidades text[], p_hoje date)` com o corpo atual mais a configuração padrão (`p_hoje` nulo levanta erro); a de 6 parâmetros passa a delegar com `(now() AT TIME ZONE 'America/Sao_Paulo')::date`, só para o deploy anterior e o rollback (AD-037). Mesmo `SECURITY DEFINER`, `search_path` e grants.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_grupo-criar-pesos.sql`
**Depends on**: T21
**Reuses**: Função atual `M:1792844340000_grupo-criar.sql:10-75`; desenho `BD:125-129`; AD-037
**Requirement**: PAR-15, PAR-16
**Status**: rascunhada
**Nota do rascunho**: migração `1792844640000_grupo-criar-pesos.sql` (a de 6 parâmetros vira `LANGUAGE sql` delegando; `p_hoje` nulo levanta `22023`); testes em `backend/api/test/banco/grupo-criar-pesos.test.ts`, com a falha forçada por um trigger criado e desfeito na própria transação.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-15`: a de 7 parâmetros cria o grupo com a configuração padrão vigente desde `p_hoje` e a conta como `registrado_por`
- [ ] Teste `PAR-16`: falha forçada no INSERT dos pesos desfaz grupo, vínculo e habilidades
- [ ] Teste `PAR-15`: a de 6 parâmetros continua passando nos testes de T0 e agora cria os pesos; `p_hoje` nulo levanta erro
- [ ] Teste: nenhuma outra função do schema usa `now()` para data (exceção única, AD-037)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T80: Tipos Kysely das tabelas da feature

**What**: Acrescentar aos tipos do banco `config_pesos` (com a coluna `expulso` = sem chuva), `partidas` e `presencas` graváveis e `eventos_uso` só de inserção, com o teste que confere colunas e tipos contra o catálogo do banco migrado.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/tipos.ts`
**Depends on**: T22
**Reuses**: Estender `tipos.ts` da grupos-e-elenco (`GE:878`, que já tem `partidas` e `presencas` só leitura); colunas `M:1792843200000_linha-de-base.sql:155-207`
**Requirement**: PAR-62
**Status**: rascunhada
**Nota do rascunho**: teste em `backend/api/test/banco/partidas-tipos.test.ts`; o erro de compilação do UPDATE é conferido por `@ts-expect-error` numa função que só o typecheck lê. O alias `SoLeitura` saiu do `tipos.ts` (ficou sem uso).

**Done when**:

- [ ] Teste: os tipos batem com o catálogo nas 4 tabelas
- [ ] Teste: `eventos_uso` não aceita `updateTable` no tipo (erro de compilação conferido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 10: Migrações: evento público, nomes, grants e grupos_visiveis

### T23: Migração: evento público e grants de eventos_uso

**What**: `evento_publico_registrar(p_slug, p_tipo, p_dispositivo, p_mes, p_momento) RETURNS boolean`, `SECURITY DEFINER`, `search_path` fixo: exige sem conta e `p_slug = app_slug_publico()`, acha o grupo ativo, insere e devolve `true` (sem grupo, `false`). `GRANT SELECT, INSERT ON eventos_uso` e `ALTER POLICY eventos_uso_ler` exigindo conta.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_eventos-uso.sql`
**Depends on**: T22
**Reuses**: Molde de função `admins_listar` (`M:1792843680000_conta-admins-listar.sql:8-21`); tabela `M:1792843200000_linha-de-base.sql:194-207`; policies `M:1792843320000_rls.sql:48-56`; `BD:130-137`; AD-034
**Requirement**: PAR-127, PAR-129, PAR-130, PAR-131
**Status**: rascunhada
**Nota do rascunho**: migração `1792844700000_eventos-uso.sql`; testes em `backend/api/test/banco/eventos-uso.test.ts`. Tipo fora de `ranking_aberto`/`pdf_exportado`, dispositivo e mês trocados ou momento nulo levantam `22023`; conta na sessão, `42501`. O teste (c) "nenhum grant em eventos_uso" da T0 passou a exigir exatamente SELECT e INSERT, como a T0 previa.
**Lacunas**: a matriz de isolamento da fundação descreve `eventos_uso` como sem grant (`backend/api/test/isolamento/matriz.ts:28`, `leitura: 'sem-grant'`; `backend/api/test/isolamento/casos-escrita.ts:86`, `insere: false`). Depois desta migração, a conta lê e insere no próprio grupo e o slug não lê: os testes de leitura e escrita da matriz vão falhar. Trocar isso (um modo de leitura "só com conta" e `insere: true`) muda teste existente fora das Autorizações: o `/executar` pergunta antes. Não alterado no rascunho.

**Done when**:

- [ ] Teste `PAR-130`: `pelada_app` tem só SELECT e INSERT em `eventos_uso`; UPDATE, DELETE e TRUNCATE recusados
- [ ] Teste `PAR-131`: no contexto do slug, a função grava e um INSERT direto em `eventos_uso` ou em outra tabela é recusado
- [ ] Teste `PAR-127`: slug de grupo arquivado ou outro slug que não o do contexto devolve `false` sem gravar; com conta, a função recusa
- [ ] Teste `PAR-129`: a linha gravada só tem grupo, tipo, momento e `dispositivo_id` ou `mes_exportado`; o contexto do slug não lê `eventos_uso`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T24: Migração: contas_nomes_do_grupo

**What**: `contas_nomes_do_grupo(p_grupo_id) RETURNS TABLE (id, nome)`, `SECURITY DEFINER`: só com conta e grupo em `grupos_visiveis()`, e só as contas autoras em `config_pesos.registrado_por` ou `partidas.criada_por/alterada_por` daquele grupo; nunca e-mail.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_contas-nomes-do-grupo.sql`
**Depends on**: T23
**Reuses**: Molde `M:1792843680000_conta-admins-listar.sql:8-21`; `BD:138-140`; filtro por `grupos_visiveis()` (`BC:25`, P13); AD-036
**Requirement**: PAR-01, PAR-44, PAR-52
**Status**: rascunhada
**Nota do rascunho**: migração `1792844760000_contas-nomes-do-grupo.sql`; testes em `backend/api/test/banco/contas-nomes-do-grupo.test.ts`, com cada autoria (pesos, criação e alteração de partida) e o grupo arquivado para a admin que não o criou.

**Done when**:

- [ ] Teste `PAR-01`: admin do grupo A recebe o nome da outra admin autora; não recebe conta que não é autora
- [ ] Teste `PAR-01`: com o id do grupo B, zero linhas; sem conta, zero linhas; a função não devolve coluna de e-mail
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T25: Migração: grants por coluna em partidas e config_pesos

**What**: `REVOKE UPDATE ON partidas, config_pesos FROM pelada_app`; `GRANT UPDATE (choveu, alterada_por, alterada_em) ON partidas` e `GRANT UPDATE` só das 6 colunas de peso, `registrado_por` e `registrado_em` em `config_pesos`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_grants-partidas-pesos.sql`
**Depends on**: T24
**Reuses**: Grants atuais `M:1792843260000_roles.sql:22-31`; `BD:141-143`; matriz desta lista
**Requirement**: PAR-09
**Status**: rascunhada
**Nota do rascunho**: migração `1792844820000_grants-partidas-pesos.sql`; testes em `backend/api/test/banco/grants-partidas-pesos.test.ts`. O teste (c) "pelada_app tem UPDATE em partidas e config_pesos" da T0 passou a exigir a lista exata dos privilégios de tabela, sem UPDATE, como a T0 previa.

**Done when**:

- [ ] Teste `PAR-09`: UPDATE de `partidas.data` e de `config_pesos.vigente_desde` recusado como `pelada_app`
- [ ] Teste `PAR-09`: DELETE em `config_pesos` recusado (sem grant); UPDATE de `choveu` do grupo B afeta 0 linhas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T26: Migração: grupos_visiveis() só com grupo ativo no ramo do slug

**What**: `CREATE OR REPLACE FUNCTION grupos_visiveis()` igual à atual, com `AND g.arquivado_em IS NULL` no ramo do slug; o ramo com conta não muda. O item (d) de T0 é invertido, com o motivo no teste e no commit.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/migracoes/<ts>_grupos-visiveis-publico-ativo.sql`
**Depends on**: T25
**Reuses**: Função atual `M:1792844280000_grupos-visiveis-arquivado.sql:9-22`; `BD:144-145`; mudança de teste pela Pergunta 1
**Requirement**: PAR-91, PAR-92, PAR-93
**Status**: rascunhada
**Nota do rascunho**: migração `1792844880000_grupos-visiveis-publico-ativo.sql`; testes em `backend/api/test/banco/grupos-visiveis-publico.test.ts`. Invertidos, com a mesma força (lista exata), o item (d) de `partidas-rede.test.ts` e o "ramo do slug não muda" de `backend/api/test/isolamento/grupos-arquivado.test.ts:184` (Autorizações de 2026-11-04).

**Done when**:

- [ ] Teste `PAR-92`: no contexto do slug de grupo arquivado, zero linhas em `grupos`, `jogadores`, `periodos_ativos`, `partidas`, `presencas`, `config_pesos` e `eventos_uso`
- [ ] Teste `PAR-93`: reativado, o slug volta a ler o grupo
- [ ] Teste `PAR-91`: os testes do ramo com conta de T0 continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 11: Repositórios: histórico, pesos e jogadores

### T27: historico.carregar

**What**: `historico.carregar(db, grupoId, ate)`: 4 consultas (jogadores com `id`, `apelido`, `ano_nascimento`, `pontuacao_inicial`, `inicio_pontuacao` e períodos; partidas até `ate`; presenças; pesos), traduzindo `expulso` para `expulsoSemChuva`. Serve ao admin e ao slug; a RLS decide o que se vê.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/historico.ts`
**Depends on**: T26, T80
**Reuses**: `c.var.db: Kysely` (`FD:103`); colunas `M:1792843200000_linha-de-base.sql:155-192`; `BD:190-192`
**Requirement**: PAR-62, PAR-77
**Status**: rascunhada
**Nota do rascunho**: devolve o `HistoricoDoGrupo` do domínio (`backend/dominio/src/previas/comparar.ts:18`); as presenças vêm só das partidas até `ate`, e as configurações de pesos, todas. Testes em `backend/api/test/repositorios/historico.test.ts`, com um plugin do Kysely que conta as consultas e guarda o SQL.

**Done when**:

- [ ] Teste `PAR-62`: o histórico do seed de 2 grupos traz só o grupo do contexto, em 4 consultas (contador do Kysely)
- [ ] Teste `PAR-77`: a consulta não seleciona telefone, posição nem notas
- [ ] Teste: expulso com chuva lê `expulso_com_chuva`, sem chuva lê `expulso`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T28: Repositório de pesos

**What**: `pesos.painel(db, grupoId, hoje)` (vigente, histórico da mais recente para a mais antiga com `vigenteAte` = véspera da seguinte, nomes por `contas_nomes_do_grupo`) e `pesos.salvar(db, grupoId, pesos, hoje)` com `INSERT … ON CONFLICT (grupo_id, vigente_desde) DO UPDATE` só para hoje e auditoria `pesos_configurados` ou `pesos_substituidos`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/pesos.ts`
**Depends on**: T27
**Reuses**: Repositório de auditoria (`CA:844`); `BD:193-194`; `B:110-114`
**Requirement**: PAR-01, PAR-02, PAR-03, PAR-04, PAR-05, PAR-09, PAR-142
**Status**: rascunhada
**Nota do rascunho**: `pesos.salvar` devolve `{ substituiu }` pelo `xmax` da linha do `ON CONFLICT`; `entidade` da auditoria é `config_pesos` com `entidade_id` = hoje. Testes em `backend/api/test/repositorios/pesos.test.ts` (G fica só com a configuração de 2026-01-01 do cenário, sem depender do relógio).
**Lacunas**: (1) configuração com `vigente_desde` depois de hoje: o painel a ignora e o salvar não a toca (interpretação conservadora); (2) autora sem nome em `contas_nomes_do_grupo`: `registradoPor` vazio, sem rótulo inventado. O `/executar` pergunta antes de levar ao verde.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-04`: salvar duas vezes no mesmo dia deixa uma linha e audita `pesos_substituidos`
- [ ] Teste `PAR-02`: `vigenteAte` de cada anterior é a véspera da seguinte
- [ ] Teste `PAR-09`: configuração de ontem nunca muda; erro depois do INSERT desfaz pesos e auditoria
- [ ] Teste `PAR-142`: o `resumo` da auditoria só tem números e nomes de evento
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T29: Jogadores: travarVarios, ativosNaData e lerParaPrevia

**What**: Em `jogadores.ts`: `travarVarios(db, grupoId, ids)` (`… WHERE grupo_id AND id = ANY ORDER BY id FOR UPDATE`, uma consulta), `ativosNaData(db, grupoId, data)` (só leitura de `periodos_ativos`) e `lerParaPrevia` (a leitura do `travarParaPeriodo`, sem trava).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T28
**Reuses**: Estender `jogadores.ts` da grupos-e-elenco (trava `SELECT … FOR UPDATE` de `GE:1305`); ordem de travas AD-038
**Requirement**: PAR-27, PAR-29
**Status**: rascunhada
**Nota do rascunho**: `travarParaPeriodo` passou a delegar a `lerEstado(…, travar)`, que `lerParaPrevia` usa sem `FOR UPDATE` (mesma leitura); `ativosNaData` devolve `{ id, apelido }` em ordem de apelido; `EstadoDoJogador` passou a ser exportado. Testes em `backend/api/test/repositorios/jogadores-partidas.test.ts`, com duas conexões de verdade.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-29`: duas conexões travando [B, A] e [A, B] não fazem deadlock (ordem crescente de id)
- [ ] Teste `PAR-27`: `ativosNaData` segue [início, fim)
- [ ] Teste: id de outro grupo não é travado nem devolvido
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 12: Repositórios: partidas

### T30: partidas.lancar

**What**: Trava os marcados (`travarVarios`), lê `ativosNaData`, valida (`validarMarcacoes`), insere a partida (23505 de `UNIQUE (grupo_id, data)` vira `partida_ja_existe`), as presenças só de presente, lesionado e expulso, o evento `partida_lancada` (INSERT com conta) e a auditoria com as contagens, na transação da requisição.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/partidas.ts`
**Depends on**: T29
**Reuses**: `BD:198-201`; ordem de travas AD-038; T8 e T29
**Requirement**: PAR-22, PAR-23, PAR-24, PAR-28, PAR-29, PAR-30, PAR-142
**Status**: rascunhada
**Nota do rascunho**: `partidas.lancar(db, grupoId, dados)` devolve `ok` (id e contagem), `invalido` (campos do domínio) ou `partida_ja_existe`; a data futura fica na rota (T40). O 23505 de `partidas_grupo_id_data_key` é traduzido dentro de um SAVEPOINT (molde `financeiro/pagamentos.ts:53`). SPEC_DEVIATION: o evento `partida_lancada` é um INSERT direto, porque `eventos.partidaLancada` nasce na T33. Testes em `backend/api/test/repositorios/partidas-lancar.test.ts`.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-30`: dois lançamentos simultâneos da mesma data, em duas conexões: um grava e o outro recebe `partida_ja_existe`
- [ ] Teste `PAR-28`: falha forçada depois das presenças desfaz partida, presenças, evento e auditoria
- [ ] Teste `PAR-23`: `ausente` e ativo sem marcação não gravam linha
- [ ] Teste `PAR-142`: auditoria `partida_lancada` só com data, chuva e contagens
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T31: partidas.editar e partidas.excluir

**What**: Editar: partida `FOR UPDATE`, `travarVarios`, validação na data da partida, UPDATE de chuva e autoria, troca das presenças, auditoria `partida_editada`, sem evento. Excluir: `FOR UPDATE`, DELETE (cascade das presenças), auditoria `partida_excluida`; o evento `partida_lancada` fica.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/partidas.ts`
**Depends on**: T30
**Reuses**: `BD:202-204`; AD-038
**Requirement**: PAR-46, PAR-48, PAR-49, PAR-50, PAR-51, PAR-142
**Status**: rascunhada
**Nota do rascunho**: `editar(db, grupoId, data, dados)` devolve `ok`, `nao_encontrada`, `data_alterada` (PAR-47, conferido também aqui) ou `invalido`; `excluir` devolve `ok` ou `nao_encontrada`. Testes em `backend/api/test/repositorios/partidas-editar.test.ts`; a serialização usa `jogadores.alterarInicio` segurando a trava do jogador.

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-48`: marcação de jogador ativo hoje mas não na data da partida é recusada
- [ ] Teste `PAR-51`: excluir mantém o `partida_lancada`
- [ ] Teste `PAR-49`: editar não grava evento; falha no meio desfaz tudo
- [ ] Teste: editar a partida enquanto outra conexão corrige o período do mesmo jogador serializa (AD-038)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T32: partidas.doMes, ler e mesDaPrimeira

**What**: `doMes(db, grupoId, mes)` (da mais recente para a mais antiga, com contagens), `ler(db, grupoId, data)` (ativos na data mais quem tem presença, pelo apelido sem acento nem caixa, autor pelo nome) e `mesDaPrimeira(db, grupoId)`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/partidas.ts`
**Depends on**: T31
**Reuses**: `BD:195-197`; `contas_nomes_do_grupo` (T24)
**Requirement**: PAR-37, PAR-41, PAR-44

**Done when**:

- [ ] Teste `PAR-44`: jogador inativo na data com presença gravada aparece na leitura
- [ ] Teste `PAR-37`: outubro com 01, 08 (chuva) e 15 vem de 15 para 01 com as contagens
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 13: Repositórios: eventos, grupos e auditoria de períodos

### T33: Repositório de eventos de uso

**What**: `eventos.partidaLancada`, `eventos.registrarPublico(db, slug, evento, momento)` (chama a função), `eventos.porSemana(db, grupoId)` (segunda a domingo em São Paulo, aparelhos distintos, PDFs, partidas e partidas em até 48 h da data mais o horário do grupo, escalações 0) e `eventos.aparelhosDaSemana(db, grupoId, hoje)`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/eventos.ts`
**Depends on**: T32
**Reuses**: `BD:205-207`; `B:74` e `B:475-478`
**Requirement**: PAR-127, PAR-155, PAR-156, PAR-157, PAR-158, PAR-132

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-156`: evento de domingo 23:30 em São Paulo (segunda UTC) cai na semana do domingo
- [ ] Teste `PAR-158`: partida de quinta 20:00 lançada no sábado 19:00 conta em 48 h; lançada na segunda, não ("2 (1)")
- [ ] Teste `PAR-157`: dois `ranking_aberto` do mesmo aparelho contam 1
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T34: grupos.criar com a data e grupos.ler ampliado

**What**: `grupos.criar(db, dados, hoje)` passa a chamar a `grupo_criar` de 7 parâmetros; `grupos.ler(db, grupoId, hoje)` acrescenta `dataSugeridaPartida`, `partidaNaDataSugerida`, `partidasNoMes`, `pesosVigentesDesde`, `pesosPadrao` e `aparelhosNaSemana`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos.ts`
**Depends on**: T33
**Reuses**: Estender `grupos.criar(db, dados)` e `grupos.ler(db, grupoId)` da grupos-e-elenco (`GE:1003`), acrescentando o parâmetro `hoje`; `BC:26` (P14); `BD:212-213`
**Requirement**: PAR-15, PAR-132

**Done when**:

- [ ] Teste `PAR-15`: grupo criado pelo repositório tem pesos vigentes desde o `hoje` recebido
- [ ] Teste `PAR-132`: grupo novo devolve `partidasNoMes` 0, `pesosPadrao` verdadeiro e `aparelhosNaSemana` 0
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T35: Auditoria das escritas de período com acumulado e posição

**What**: Depois do `avaliarPeriodos`, as escritas de reativar, corrigir período e alterar início leem `historico.carregar` na mesma transação e acrescentam ao `resumo` da mesma linha de auditoria `acumuladoAntes`, `acumuladoDepois`, `posicaoAntes` e `posicaoDepois` (`compararCenarios`).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T34
**Reuses**: Escritas de período da grupos-e-elenco (`GE:1333`, `GE:1358`, `GE:1383`); `BC:27` (P15); T14
**Requirement**: PAR-122

**Done when**:

- [ ] Teste `PAR-122`: reativar grava na auditoria os quatro valores, iguais aos da prévia do mesmo cenário
- [ ] Os testes de auditoria existentes da grupos-e-elenco passam a esperar os 4 campos a mais (Pergunta 1), sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 14: Middlewares: prévia somente leitura e contexto público

### T36: Transação somente leitura nas prévias

**What**: `comBanco` abre `READ ONLY` quando o caminho termina em `/previa`; `exigirGrupoAtivo` lê `arquivado_em` sem `FOR KEY SHARE` nesse caso e continua respondendo 409 `grupo_arquivado`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/com-banco.ts`
**Depends on**: T35
**Reuses**: Estender `comBanco` (`F:1203`, `FD:103`) e `exigirGrupoAtivo` (`GE:901`); `BD:33-35`; AD-035
**Requirement**: PAR-109, PAR-110, PAR-111, PAR-112

**Done when**:

- [ ] Teste `PAR-109`: um INSERT de prova dentro de uma rota `/previa` falha (transação de leitura)
- [ ] Teste `PAR-112`: prévia em grupo arquivado responde 409 `grupo_arquivado`
- [ ] Teste: rotas sem o sufixo continuam com transação de escrita
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T37: Middleware contextoPublico e limite público

**What**: `contextoPublico` em `/api/publico/:slug/*`, depois da leitura da sessão: slug fora de `^[a-z0-9-]{1,64}$` → 404 sem consulta; senão apaga `contaId` e põe `slugPublico`. Liga `limiteTaxa(LIMITE_PUBLICO)` nesse grupo de rotas (AD-045).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/contexto-publico.ts`
**Depends on**: T36
**Reuses**: `comBanco` com `app.slug_publico` (`F:1203`); `limiteTaxa` (`F:1153`) e binding `LIMITE_PUBLICO` (`F:1081`); chave de IP (`CA:746`); `carregarSessao` (`CA:770`); `BD:220-222`; AD-034
**Requirement**: PAR-77, PAR-78, PAR-90

**Done when**:

- [ ] Teste `PAR-77`: admin logado do grupo A abre o slug do grupo B e recebe os dados de B (a conta foi apagada)
- [ ] Teste `PAR-90`: slug malformado responde 404 sem abrir conexão
- [ ] Teste `PAR-78`: binding que nega gera 429 com "Muitas requisições. Tente de novo em instantes."; o IP não aparece em log
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 15: Rotas admin: pesos e lançamento

### T38: GET e POST /api/grupos/:grupoId/pesos

**What**: Rotas de pesos sob sessão, vínculo e grupo ativo, com `lerCorpo` e `relogio.hoje()`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/pesos.ts`
**Depends on**: T37
**Reuses**: `exigirVinculo` (`CA:795`); `lerCorpo` (`GE:854`) e `Relogio` (`GE:831`, `c.var.relogio`; o mês vem de `mesDe(relogio.hoje())`, T1); T17 e T28; tabela `BD:227-228`
**Requirement**: PAR-01, PAR-03, PAR-06, PAR-07, PAR-08

**Done when**:

- [ ] Teste `PAR-03`: POST válido responde 200 com o painel e `vigente.vigenteDesde` = hoje do relógio fixo
- [ ] Teste `PAR-08`: corpo com `vigenteDesde` responde 422 sem gravar
- [ ] Teste: sem vínculo, 404; grupo arquivado, 409
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T39: GET partidas/nova e GET partidas?mes

**What**: `GET /api/grupos/:grupoId/partidas/nova?data=` (registrada antes de `/partidas/:data`) e `GET /api/grupos/:grupoId/partidas?mes=`, com hoje e mês do `Relogio`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T38
**Reuses**: `Relogio` (`GE:831`; mês por `mesDe(relogio.hoje())`); T7, T12, T32; `BD:229-230`, `BD:244-245`
**Requirement**: PAR-17, PAR-18, PAR-19, PAR-20, PAR-21, PAR-37, PAR-38, PAR-39, PAR-40, PAR-41

**Done when**:

- [ ] Teste `PAR-17`: sem `data`, devolve a quinta anterior com os ativos ordenados pelo apelido, todos `ausente`
- [ ] Teste `PAR-20`: data de amanhã dá "A data não pode ser no futuro."
- [ ] Teste `PAR-21`: data já lançada dá 409 `partida_ja_existe` com `dataExistente`
- [ ] Teste `PAR-40`: mês seguinte ao de hoje dá "O mês não pode ser futuro."
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T40: POST /api/grupos/:grupoId/partidas

**What**: Lançamento: valida o corpo, recusa data futura e duplicada, chama `partidas.lancar` e responde 201.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T39
**Reuses**: T30; `BD:231`; `LIMITE_ESCRITA` por conta da grupos-e-elenco (`GE:928`)
**Requirement**: PAR-19, PAR-20, PAR-21, PAR-22, PAR-24, PAR-25, PAR-26

**Done when**:

- [ ] Teste `PAR-22`: 3 presentes e 1 expulso gravam 4 presenças e respondem 201 com `alteradaPor`
- [ ] Teste `PAR-24`: jogador de outro grupo responde 422 no `marcacoes.<i>.jogadorId`, nada gravado
- [ ] Teste `PAR-21`: lançar de novo a mesma data responde 409
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 16: Rotas admin: partida por data e prévias

### T41: GET, PUT e DELETE /api/grupos/:grupoId/partidas/:data

**What**: Leitura, edição (data do corpo = data do caminho) e exclusão; `:data` que não é data real, ou sem partida, responde 404 nos três.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/partidas.ts`
**Depends on**: T40
**Reuses**: T31 e T32; `BD:232-234`
**Requirement**: PAR-44, PAR-45, PAR-46, PAR-47, PAR-48, PAR-50

**Done when**:

- [ ] Teste `PAR-47`: PUT com `data` diferente do caminho responde 422 "A data da partida não pode ser alterada."
- [ ] Teste `PAR-45`: `/partidas/2026-02-30` e data sem partida respondem 404 em GET, PUT e DELETE
- [ ] Teste `PAR-50`: DELETE responde 204 e a auditoria guarda `partida_excluida`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T42: Rotas de prévia: reativar, período e início

**What**: `POST …/jogadores/:id/reativar/previa` (`{ data }`), `…/periodos/:periodoId/previa` e `…/inicio/previa`: mesma validação da gravação (`avaliarPeriodos`, `avaliarInicio`), `lerParaPrevia`, `historico.carregar` e o domínio; nada gravado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/periodos.ts`
**Depends on**: T41
**Reuses**: Rotas de período da grupos-e-elenco: reativar em `rotas/periodos.ts` (`GE:1409`, `dataCorpo` de `GE:804`), período e início em `rotas/periodos-correcao.ts` (`GE:1433`); a prévia de cada uma fica no mesmo arquivo da gravação; T15, T29, T36; `BD:237-239`, `BD:248-249`
**Requirement**: PAR-109, PAR-110, PAR-111, PAR-112, PAR-113, PAR-114, PAR-115, PAR-116

**Done when**:

- [ ] Casos limite e estados listados no corpo do commit antes do código; resultado não definido na Base = pare e pergunte
- [ ] Teste `PAR-112`: cada recusa da gravação (422 com o mesmo campo e mensagem, 409 "O jogador já está ativo.", 404 fora do grupo) sai igual na prévia
- [ ] Teste `PAR-109`: a prévia de Gil devolve as duas rodadas e o aviso no plural, e nenhuma linha muda no banco
- [ ] Teste `PAR-111`: prévia de início devolve o número de rodadas que passam a constar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 17: Rotas admin e ranking público

### T43: GET /api/grupos/:grupoId ampliado

**What**: A rota do início do grupo passa `relogio.hoje()` a `grupos.ler` e devolve os 6 campos novos.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/grupo.ts`
**Depends on**: T42
**Reuses**: Rota `rotas/grupo.ts` da grupos-e-elenco (`GE:1080`); T34; `BC:28` (P16)
**Requirement**: PAR-132

**Done when**:

- [ ] Teste `PAR-132`: com relógio fixo numa sexta, `dataSugeridaPartida` é a quinta anterior e `partidaNaDataSugerida` reflete o banco
- [ ] O teste existente da rota passa a esperar os 6 campos (Pergunta 1), sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T44: GET /api/grupos/:grupoId/uso

**What**: Painel de uso por semana a partir de `eventos.porSemana`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/uso.ts`
**Depends on**: T43
**Reuses**: T33; `BD:235`
**Requirement**: PAR-155

**Done when**:

- [ ] Teste `PAR-155`: semanas só com evento, da mais recente para a mais antiga, com `escalacoesConfirmadas` 0
- [ ] Teste: sem vínculo, 404
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T45: GET /api/publico/:slug/ranking

**What**: Lê o grupo pela RLS do slug (sem linha → 404 com o mesmo corpo), valida `mes` (formato e histórico), carrega o histórico e devolve `calcularRanking` no `rankingPublico`, com `geradoEm` do relógio, em transação somente leitura.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T44
**Reuses**: T11, T12, T19, T27, T37; `BD:240`
**Requirement**: PAR-64, PAR-65, PAR-66, PAR-76, PAR-77, PAR-90, PAR-93

**Done when**:

- [ ] Teste `PAR-76`: a resposta do seed não tem nenhum campo de `CAMPOS_PROIBIDOS_PUBLICO`
- [ ] Teste `PAR-65`: `mes=2026-1` responde 422 "Mês inválido."; `PAR-66`: mês antes da primeira partida, "Mês fora do histórico do grupo."
- [ ] Teste `PAR-90`: slug inexistente e slug de grupo arquivado têm o mesmo status e corpo
- [ ] Teste `PAR-93`: reativado, o slug volta a responder 200
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 18: Rotas públicas restantes e isolamento

### T46: GET /api/publico/:slug/pdf

**What**: Mesma leitura e mesmas recusas do ranking; devolve `calcularPdf` no `pdfPublico` com `urlPublica` = `<URL_PUBLICA>/g/<slug>`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T45
**Reuses**: T13, T19, T45; `URL_PUBLICA` como única origem (`F:1251`); `BD:241`, `BD:246`
**Requirement**: PAR-95, PAR-100, PAR-101

**Done when**:

- [ ] Teste `PAR-100`: mês inválido, fora do histórico, slug indisponível e 429 respondem como no ranking
- [ ] Teste `PAR-101`: resposta sem campo proibido e com no máximo 12 colunas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T47: POST /api/publico/:slug/eventos

**What**: `bodyLimit` de 1 KB (413 "O corpo da requisição é grande demais."), `eventoPublicoCorpo`, `eventos.registrarPublico` com `relogio.agoraIso()`; função devolve `false` → 404; sucesso 204.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/publico.ts`
**Depends on**: T46
**Reuses**: T23, T33; `BD:242`, `BD:247`
**Requirement**: PAR-127, PAR-128, PAR-129

**Done when**:

- [ ] Teste `PAR-128`: corpo de 1025 bytes responde 413; tipo desconhecido, 422; slug arquivado, 404
- [ ] Teste `PAR-127`: `ranking_aberto` válido responde 204 e grava o momento do relógio fixo
- [ ] Teste `PAR-129`: a linha gravada não tem IP, user-agent nem conta, com `cf-connecting-ip` e cookie de sessão na requisição
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T48: Isolamento das rotas novas

**What**: Toda rota nova entra na suíte de isolamento de rotas: as de admin como rota de grupo (conta do grupo A contra o B, inclusive data de partida que só existe no B), as públicas com o slug do outro grupo e o de grupo arquivado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T47
**Reuses**: Suíte de isolamento de rotas (`CA:1070`, estendida pela grupos-e-elenco em `GE:1607`); `BD:250-251`
**Requirement**: PAR-137, PAR-138, PAR-139, PAR-92

**Done when**:

- [ ] Teste `PAR-138`: as 13 rotas novas de admin respondem 404 ao grupo B e o banco do B fica igual (contagem antes e depois)
- [ ] Teste `PAR-139`: as 3 rotas públicas no slug de A só devolvem dados de A, como `pelada_app`
- [ ] Teste `PAR-137`: o meta-teste falha com uma rota nova sem caso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 19: Ensaio das migrações sobre a produção e dependências

### T81: Ensaio das migrações sobre um dump da produção (AD-033)

**What**: Restaurar no Postgres local um dump recente da produção (artefato cifrado do `backup.yml`, decifrado pelo usuário fora do repositório: pausa para o usuário), contar as linhas por tabela, aplicar `pnpm migrar` com as migrações de T21 a T26 e conferir: mesma contagem em toda tabela (mais só as linhas novas de `config_pesos`, uma por grupo sem configuração), schema esperado (`lerEsquema` igual à referência da v2 mais o diff destas migrações) e uma segunda execução sem DDL. Antes do primeiro deploy da prévia com estas migrações, porque a prévia migra a produção (AD-032). Nada roda contra a `main` do Neon.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/ensaio-migracao.ts`
**Depends on**: T48, T26
**Reuses**: AD-033 e AD-032; restauração da fundação (`F:584`); `lerEsquema` e a referência do schema (`F:736`, `F:784`); migrar sobre banco já migrado (`F:834`); contagem de linhas de `F:2233`
**Requirement**: PAR-13, PAR-14, PAR-91

**Done when**:

- [ ] `Evidência`: data e origem do dump, contagem por tabela antes e depois, diff do schema e a saída da segunda execução, registrados nesta tarefa
- [ ] Teste `PAR-14`: nenhuma tabela perde linha; `config_pesos` ganha exatamente uma linha por grupo que não tinha
- [ ] Teste `PAR-91`: o schema depois do ensaio é a referência mais só as funções, grants e a policy destas migrações
- [ ] Dump com zero linhas nas tabelas de negócio (pendência da AD-014) bloqueia a tarefa: pare e pergunte, porque o ensaio não prova nada
- [ ] Banco de ensaio removido no `finally`; o dump decifrado não entra no git
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T49: Reavaliação do deepmerge (SEC-010)

**What**: Rodar `pnpm audit --prod`, `pnpm audit` e `pnpm why deepmerge`; atualizar se houver versão corrigida (ou dependente sem ele), senão manter. Registrar data, saída resumida e decisão na linha `Evidência` desta tarefa (AD-039).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `pnpm-lock.yaml`
**Depends on**: T81
**Reuses**: `BD:315-318`; `vite-plugin-pwa` com `injectManifest` (`FD:123`)
**Requirement**: PAR-141

**Done when**:

- [ ] `Evidência`: data, versão encontrada, advisory GHSA-gcqx-w48m-w2h4 e decisão
- [ ] Se atualizou: `pnpm --filter @pelada/web build` e os testes do SW passam
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T50: Auditoria e fixação do jspdf

**What**: Antes de instalar, conferir `pnpm audit` e o GitHub Advisory do `jspdf`; fixar a última 4.x sem aviso aberto no `frontend/web`; registrar o resultado nesta tarefa. O pacote só entra por `import()` dinâmico.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `frontend/web/package.json`
**Depends on**: T49
**Reuses**: `BD:282-285`
**Requirement**: PAR-102

**Done when**:

- [ ] `Evidência`: versão fixada, advisories conferidos e data
- [ ] Teste `PAR-102`: o build não põe o `jspdf` no chunk inicial (conferido no manifesto do Vite)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 20: Lint da função única e das escritas de período

### T51: Regra ESLint: só o módulo de pontuação soma pontos

**What**: Regra `no-restricted-syntax` que proíbe `acumuladoAte`, `acumuladoComInicial` e `pontosDaPresenca` fora de `backend/dominio/src/pontuacao/`, em `backend/**` e `frontend/**`; teste com arquivo de prova.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `eslint.config.mjs`
**Depends on**: T50
**Reuses**: ESLint da fundação (`F:362`) e o teste de regra por arquivo de exemplo (`F:385`); `BD:306-308`
**Requirement**: PAR-61

**Done when**:

- [ ] Teste `PAR-61`: arquivo de prova em `backend/api/src` que chama `pontosDaPresenca` falha o lint
- [ ] Teste `PAR-61`: o mesmo código dentro de `pontuacao/` passa; `pnpm lint` verde na base
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T52: Regra ESLint pelada/sem-escrita-periodo ligada

**What**: Criar e ligar (a grupos-e-elenco v2 tem só a checagem `GE:1482`, sem a regra ESLint) `pelada/sem-escrita-periodo` em `backend/api/src/**`, com `ignores` do repositório de jogadores e das migrações; rodar o lint antes e confirmar zero achados.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `eslint/plugin-pelada.mjs`
**Depends on**: T51
**Reuses**: Checagem `backend/scripts/checagens/escritores-periodo.ts` (`GE:1482`), que continua cobrindo `deleteFrom` e `inicio_pontuacao`; `BD:309-314`; AD-039
**Requirement**: PAR-140

**Done when**:

- [ ] Teste `PAR-140`: arquivo de prova com `insertInto('periodos_ativos')` ou UPDATE de `inicio`/`fim` fora do repositório falha o lint
- [ ] Teste `PAR-140`: `partidas.ts` (que só lê períodos) passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 21: Web: mockup do módulo e tabela do ranking

### T53: Mockup do módulo copiado do LJS

**What**: Rodar o comando de adaptação do `reuso.md` (linhas R-01 a R-19): cópia byte a byte do mockup do módulo para `.specs/features/partidas-e-ranking/mockup/` e `cmp` arquivo a arquivo.
**Estimativa**: 30 min
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `.specs/features/partidas-e-ranking/mockup/index.html`
**Depends on**: T52
**Reuses**: `reuso.md` R-01 a R-19
**Requirement**: PAR-146

**Done when**:

- [ ] `cmp` sem diferença nos 19 arquivos contra `c6dc82c`
- [ ] A galeria `index.html` abre as 18 telas com os ativos de `.specs/mockup/`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: none
**Gate**: build

---

### T54: Dados do ranking público e mês pela URL

**What**: `dados/publico.ts` (TanStack Query, `rankingPublico` e `pdfPublico`) e `useMesDaUrl` (`?mes=` lido e trocado por substituição).
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/publico.ts`
**Depends on**: T53
**Reuses**: Cliente HTTP (`CA:1169`); TanStack Query (`F:1326`)
**Requirement**: PAR-89, PAR-65

**Done when**:

- [ ] Teste `PAR-89`: trocar de mês altera o `?mes=` e refaz a consulta só uma vez
- [ ] Teste: resposta fora do contrato vira erro, não dado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T55: TabelaRanking

**What**: Tabela "#", "Jogador", "Pts inicial", uma coluna por partida ("dd/mm" com ícone de sol ou chuva e o texto ", sem chuva"/", com chuva"), "Pts final"; cada rodada com o número, um indicador da situação além da cor e o texto acessível da spec; "–" com "Fora do grupo ou antes da data de início".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/TabelaRanking.tsx`
**Depends on**: T54
**Reuses**: `.specs/mockup/telas/t01-ranking--sucesso.html`; componentes base (`F:1424`); `B:266-267`
**Requirement**: PAR-79, PAR-80

**Done when**:

- [ ] Teste `PAR-80`: "Presente, 1 ponto", "Expulso, menos 1 ponto", "Falta, 0 pontos" e o texto do "–" como nome acessível
- [ ] Teste `PAR-80`: cada situação tem um marcador visual distinto que não é só cor (classe ou forma), conferido por seletor; a cor sozinha fica provada na comparação visual (T76)
- [ ] Teste `PAR-79`: coluna de partida com chuva tem o ícone de chuva e ", com chuva"; axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 22: Web: página do ranking, indisponível e rotas

### T56: Página do ranking (t01)

**What**: `PaginaRanking`: nome, agenda ("Toda quinta · 20:00"), mês, "Exportar PDF", resumo "N partidas no mês, M com chuva. Ordem pelos pontos acumulados até hoje.", estados carregando, vazio e mês sem partidas, navegação com botões desabilitados por nulo, sem o atalho Financeiro; 422 de mês fora do histórico volta ao mês de hoje com a faixa (P17).
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/PaginaRanking.tsx`
**Depends on**: T55
**Reuses**: `.specs/mockup/telas/t01-ranking--{sucesso,vazio,vazio-mes,carregando,erro}.html`; `Faixa` (`CA:1286`); `BC:29` (P17)
**Requirement**: PAR-79, PAR-81, PAR-82, PAR-88, PAR-89, PAR-161

**Done when**:

- [ ] Teste `PAR-88`: mês sem partidas mostra "Nenhuma partida registrada neste mês" e "Pts inicial (início de julho)"
- [ ] Teste `PAR-89`: "Mês seguinte" desabilitado quando `mesSeguinte` é nulo; linhas e ordem iguais ao trocar
- [ ] Teste `PAR-81`: sem ativos, "Nenhum jogador no ranking ainda."; `PAR-82`: "Carregando o ranking…"
- [ ] Teste `PAR-161`: não há botão "Financeiro" no cabeçalho
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T57: Grupo indisponível (t03)

**What**: `GrupoIndisponivel` para 404 da API e para slug malformado, sem chamar a API neste.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/GrupoIndisponivel.tsx`
**Depends on**: T56
**Reuses**: `.specs/mockup/telas/t03-indisponivel--erro.html`; `EstadoErro` (`F:1472`)
**Requirement**: PAR-94

**Done when**:

- [ ] Teste `PAR-94`: `/g/Nao_Valido` mostra "Grupo indisponível" sem nenhuma requisição
- [ ] Teste `PAR-94`: 404 da API mostra o mesmo texto
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T58: Rotas novas do app e link Ver ranking

**What**: Em `app/rotas.tsx`: `/g/:slug` fora da rota protegida, `/app/grupos/:grupoId/partidas`, `…/partidas/nova`, `…/partidas/:data`, `…/pontuacao` e `…/uso`; o "Ver ranking" do início abre `/g/:slug`.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T57
**Reuses**: Rotas do app (`CA:1309`) e guarda de rota (`CA:1192`); rotas da grupos-e-elenco (`GE:2068`)
**Requirement**: PAR-143, PAR-83

**Done when**:

- [ ] Teste `PAR-143`: cada rota renderiza a tela certa; `/g/:slug` abre sem sessão
- [ ] Teste `PAR-83`: o link "Ver ranking" aponta para `/g/<slug>`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 23: Web: partidas

### T59: Dados de partidas e Partidas do mês (t10)

**What**: `dados/partidas.ts` (consultas e mutações que invalidam o mês, o início e o ranking) e `PaginaPartidas`: "Quinta, 15/10/2026", "15 P · 0 L · 1 E" (com "chuva · " antes quando choveu), "Nova partida" e o vazio.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/partidas/PaginaPartidas.tsx`
**Depends on**: T58
**Reuses**: `.specs/mockup/telas/t10-partidas--{sucesso,vazio}.html`; `Lista` (`CA:1286`)
**Requirement**: PAR-42, PAR-43

**Done when**:

- [ ] Teste `PAR-42`: partida com chuva mostra "chuva · 15 P · 0 L · 1 E"
- [ ] Teste `PAR-43`: mês vazio mostra "Nenhuma partida neste mês." e "Nova partida"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T60: Lançar partida (t11)

**What**: `PaginaNovaPartida`: data sugerida, "Choveu?" (Não), contadores, busca, "Marcar todos como presentes", "Limpar marcações", botões A, P, L e E, "Salvar partida (N presentes)"; troca de data com "Carregando os jogadores ativos em dd/mm…"; vazio; 409 com o link de edição; falha de rede sem perder marcações; sucesso volta ao início com "Partida de dd/mm salva.".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/partida/PaginaNovaPartida.tsx`
**Depends on**: T59
**Reuses**: Mockup do módulo `t11-partida--nova.html` (R-04) e `.specs/mockup/telas/t11-partida--{carregando,vazio,data-futura,duplicada,erro-salvar}.html`; `ResumoErros` (`CA:1263`); `CampoData` (`GE:1751`)
**Requirement**: PAR-31, PAR-32, PAR-33, PAR-34, PAR-35, PAR-36, PAR-147

**Done when**:

- [ ] Teste `PAR-35`: falha de rede mostra "Não salvou. Suas marcações continuam aqui." e as marcações ficam
- [ ] Teste `PAR-34`: 409 mostra "Já existe uma partida em dd/mm/aaaa." e o link "Editar a partida de dd/mm"
- [ ] Teste `PAR-31`: "Marcar todos como presentes" atualiza o contador e o botão "Salvar partida (N presentes)"
- [ ] Teste `PAR-33`: sem ativos, "Ninguém estava ativo nessa data."
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T61: Editar e excluir partida (t11)

**What**: `PaginaEditarPartida`: data sem campo editável, "Última alteração: <nome>, dd/mm hh:mm", diálogo de exclusão e retorno às partidas do mês.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/partida/PaginaEditarPartida.tsx`
**Depends on**: T60
**Reuses**: `.specs/mockup/telas/t11-partida--{edicao,excluir}.html`; `Dialogo` (`CA:1286`)
**Requirement**: PAR-52, PAR-53, PAR-54

**Done when**:

- [ ] Teste `PAR-53`: o diálogo tem "Excluir a partida de dd/mm?", o texto do recálculo, "Cancelar" e "Excluir partida"
- [ ] Teste `PAR-54`: sucesso vai às partidas com "Partida de dd/mm excluída."; falha mostra "Não foi possível excluir a partida. Tente de novo."
- [ ] Teste `PAR-52`: "Última alteração" com hora em São Paulo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 24: Web: pontuação, uso e início do grupo

### T62: Pontuação (t18)

**What**: `PaginaPontuacao`: "Vigente desde dd/mm/aaaa", "Pesos vigentes", formulário "Nova configuração (vale a partir de hoje)" com a nota, histórico ("De … a …", "p · p · … · registrado por <nome>"), validação local ao lado do campo e "Nova configuração vale a partir de hoje.".
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/pontuacao/PaginaPontuacao.tsx`
**Depends on**: T61
**Reuses**: `.specs/mockup/telas/t18-pontuacao--{sucesso,salvo,erro}.html`; `Campo` e `ResumoErros` (`CA:1238`, `CA:1263`); asserção de posição no molde de `GE:2138`
**Requirement**: PAR-10, PAR-11, PAR-12, PAR-147

**Done when**:

- [ ] Teste `PAR-12`: campo vazio ou 11 mostra "Use um número inteiro de −10 a 10." ligado ao campo (`aria-describedby`) e não envia
- [ ] Teste `PAR-12` (posição, e2e `pontuacao.spec.ts` no fim do lote): a caixa da mensagem fica na mesma linha ou logo abaixo do campo dela (`boundingBox`, distância vertical ≤ 24 px)
- [ ] Teste `PAR-147`: 422 da API mostra "Corrija 2 campos: …" e a mensagem em cada campo
- [ ] Teste `PAR-10`: o histórico mostra uma linha por configuração anterior, mais recente primeiro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T63: Uso do app (t21)

**What**: `PaginaUso`: tabela "Uso por semana, mais recente primeiro" com "dd/mm a dd/mm", aparelhos, PDFs, "N (M)" e "E / N"; vazio "Ainda não há uso registrado.".
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/uso/PaginaUso.tsx`
**Depends on**: T62
**Reuses**: `.specs/mockup/telas/t21-uso--{sucesso,vazio}.html`
**Requirement**: PAR-144

**Done when**:

- [ ] Teste `PAR-144`: semana com 2 partidas, 1 em 48 h, mostra "2 (1)" e "0 / 2"
- [ ] Teste `PAR-144`: sem semanas, o texto vazio
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T64: Início do grupo (t09)

**What**: `InicioGrupo`: "Dia de jogo" com "Lançar partida de <dia>, dd/mm" ou "Editar partida de …"; itens Partidas ("N em <mês>"/"Nenhuma em <mês>"), Pontuação ("Pesos padrão"/"Vigente desde dd/mm/aaaa") e Uso do app ("Esta semana: N aparelhos", singular, "Sem uso registrado"); sem Simulador e Financeiro; retirar o `SPEC_DEVIATION` do arquivo, se houver.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/grupo/InicioGrupo.tsx`
**Depends on**: T63
**Reuses**: Mockup do módulo `t09-inicio--{sucesso,sem-jogadores}.html` (R-02, R-03); tela da grupos-e-elenco (`GE:1847`); `BC:31` (P19)
**Requirement**: PAR-133, PAR-134, PAR-135, PAR-136, PAR-160, PAR-83

**Done when**:

- [ ] Teste `PAR-133`: com partida na data sugerida, o botão diz "Editar partida de qui, 15/10" e abre `/partidas/2026-10-15`
- [ ] Teste `PAR-136`: 1 aparelho mostra "Esta semana: 1 aparelho"; 0 mostra "Sem uso registrado"
- [ ] Teste `PAR-160`: nenhum item "Simulador" nem "Financeiro"
- [ ] Os testes existentes da tela passam a esperar os itens do mockup (Pergunta 1), sem asserção removida
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 25: Web: prévias na ficha do jogador

### T65: Componente PreviaPeriodos

**What**: Textos da prévia: "Acumulado de X pontos passa a Y." / "não muda.", as quatro frases de posição, as rodadas ("1 rodada passa a constar: 15/10.", "N rodadas passam a constar: 08/10 e 15/10.", "deixam de constar", até 5 datas e "e mais K"), o `aviso` em faixa de atenção e a frase única da prévia de início.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/PreviaPeriodos.tsx`
**Depends on**: T64
**Reuses**: Mockup do módulo `t16-jogador--{reativar-previa,corrigir-previa,inicio-recuar,inicio-avancar}.html` (R-09, R-11, R-12, R-19); `Faixa` (`CA:1286`)
**Requirement**: PAR-117, PAR-118, PAR-119

**Done when**:

- [ ] Teste `PAR-117`: posição nula antes e 3 depois dá "Passa a aparecer no ranking, na posição 3."; o inverso, "Sai do ranking (hoje está na posição N)."
- [ ] Teste `PAR-118`: 7 datas mostram 5 e "e mais 2"; o `aviso` fica dentro do elemento `.faixa--atencao`
- [ ] Teste `PAR-119`: prévia de início omite as partes que não se aplicam
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T66: Prévias nos diálogos da ficha (t16)

**What**: Nos diálogos de reativar, corrigir e início: prévia pedida 300 ms depois da última troca de data, "Calculando…", "Confirmar" desabilitado até a prévia voltar sem erro, erro de rede e recusa no diálogo; depois de confirmar, a frase das rodadas na ficha; texto novo do reativar.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogador/PeriodosJogador.tsx`
**Depends on**: T65
**Reuses**: Telas da grupos-e-elenco `PeriodosJogador.tsx` (`GE:1970`) e `CorrigirDatas.tsx` (`GE:1994`); mockup do módulo R-05 a R-19; `BC:18` (P6), `BC:30` (P18)
**Requirement**: PAR-120, PAR-121, PAR-159

**Done when**:

- [ ] Teste `PAR-120`: "Confirmar" fica desabilitado durante "Calculando…" e depois de um 422 da prévia
- [ ] Teste `PAR-121`: confirmar com 2 rodadas mostra "2 rodadas passaram a constar: … Elas valem 0 ponto até você lançar a presença em Editar partida."
- [ ] Teste `PAR-159`: o diálogo de reativar mostra "Volta a aparecer no ranking e nas partidas; a data de início não muda." e não contém "os pontos não mudam" (muda o teste existente, Pergunta 1)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 26: Web: eventos anônimos e geração do PDF

### T67: Identificador anônimo e eventos de uso

**What**: `pwa/armazenamento/armazenamento-local.ts` com `crypto.randomUUID()` em `localStorage`; `ranking_aberto` uma vez por slug a cada carregamento da página (não ao trocar de mês); `pdf_exportado` com o mês; falha ignorada, sem nova tentativa.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/eventos.ts`
**Depends on**: T66
**Reuses**: Cliente HTTP (`CA:1169`); `B:376-379`; `BC:32` (P20)
**Requirement**: PAR-123, PAR-124, PAR-125, PAR-126

**Done when**:

- [ ] Teste `PAR-123`: duas aberturas usam o mesmo id; o id é UUID v4
- [ ] Teste `PAR-124`: trocar de mês duas vezes não envia outro `ranking_aberto`
- [ ] Teste `PAR-126`: rede falhando não mostra mensagem e não repete o envio
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T68: Geração do PDF

**What**: `gerarPdf(projecao): Promise<Blob>` com `import('jspdf')`: 1 página A4 retrato até 40 jogadores e 12 colunas, fonte de 8,5 a 7 pt (ajuste), nome do grupo, "Ranking: <mês> de <ano>", "Gerado em dd/mm/aaaa hh:mm", meses sobre as colunas, ícones, legenda sem depender de cor e rodapé "Gestão da Pelada" com o endereço sem esquema.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/pdf/gerar-pdf.ts`
**Depends on**: T67
**Reuses**: `.specs/mockup/telas/p01-pdf--{sucesso,mes-vazio}.html` e `telas.json:286-288`; fontes TTF em `public/fontes/pdf/` (`BD:276-277`); T50
**Requirement**: PAR-103, PAR-104

**Done when**:

- [ ] Teste `PAR-103`: 40 linhas × 12 colunas geram exatamente 1 página A4 retrato e nenhuma fonte abaixo de 7 pt
- [ ] Teste `PAR-104`: o texto extraído tem o nome, "Ranking: outubro de 2026", "Gerado em" e o rodapé sem `https://`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T69: Entrega do PDF

**What**: `entregar(blob, nome)`: com `navigator.canShare({ files })`, diálogo "PDF pronto." com "Baixar" e "Compartilhar" (recusa volta ao diálogo); sem suporte, baixa `ranking-<slug>-<AAAA-MM>.pdf` e mostra "PDF baixado.".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/pdf/entregar.ts`
**Depends on**: T68
**Reuses**: `.specs/mockup/telas/t01-ranking--{pdf-compartilhar,pdf-baixado}.html`; `Dialogo` (`CA:1286`)
**Requirement**: PAR-105, PAR-106

**Done when**:

- [ ] Teste `PAR-105`: `share` rejeitado com `AbortError` volta ao diálogo
- [ ] Teste `PAR-106`: sem `canShare`, o nome do arquivo é `ranking-pelada-de-quinta-2026-10.pdf`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 27: Web: PDF na tela, service worker e guardado local

### T70: PDF na tela do ranking

**What**: Botão "Exportar PDF": "Preparando PDF…", busca da projeção, `gerarPdf`, `entregar`, `pdf_exportado` e o erro "Não foi possível gerar o PDF." com "Tentar de novo".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/usarExportarPdf.ts`
**Depends on**: T69
**Reuses**: `.specs/mockup/telas/t01-ranking--{pdf-preparando,pdf-erro}.html`; `BC:33` (P21)
**Requirement**: PAR-102, PAR-107, PAR-125

**Done when**:

- [ ] Teste `PAR-102`: o `import('jspdf')` só acontece no toque (ou no ocioso)
- [ ] Teste `PAR-107`: projeção com 500 mostra o erro e "Tentar de novo" refaz
- [ ] Teste `PAR-125`: PDF entregue envia `pdf_exportado` com o mês exibido
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T71: Service worker: cache só do ranking público

**What**: `ehRankingPublico(url, origem)` (`^/api/publico/[a-z0-9-]{1,64}/ranking$`, mesma origem) e `NetworkFirst` com `CacheableResponsePlugin` (200) e `ExpirationPlugin` (50); nenhuma outra rota de `/api` registrada; dependências `workbox-cacheable-response` e `workbox-expiration`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/pwa/sw.ts`
**Depends on**: T70
**Reuses**: Estender o SW da fundação (`F:1595`, `FD:123`); `BD:293-297`; `BC:34` (P22)
**Requirement**: PAR-153

**Done when**:

- [ ] Teste `PAR-153`: só a rota do ranking casa; `/pdf`, `/eventos`, `/api/grupos/...` e outra origem não
- [ ] Teste `PAR-153`: o SW registra só a navegação e o ranking; os testes do SW da fundação passam (contagem ajustada pela Pergunta 1)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T72: Guardado local do ranking

**What**: `localStorage` com as chaves `pelada:ranking:<slug>:<mes>` e `pelada:ranking:<slug>:atual`, gravado a cada sucesso com o `geradoEm`, validado com `rankingPublico` ao ler e descartado se inválido; o aparelho guarda só slug, id anônimo, projeção e a marca do aviso de instalação.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/pwa/armazenamento/ranking-guardado.ts`
**Depends on**: T71
**Reuses**: `BC:35` (P23); `BC:36` (P24: `localStorage.clear()` entre testes); aviso de instalação (`F:1521`)
**Requirement**: PAR-148, PAR-154

**Done when**:

- [ ] Teste `PAR-148`: carregar outubro sem `?mes=` grava a chave do mês e a `:atual`
- [ ] Teste `PAR-154`: guardado com campo extra é descartado e removido
- [ ] Teste `PAR-154`: depois de entrar como admin, nenhuma chave nova além das 4 permitidas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 28: Web: telas sem conexão e seed

### T73: Telas sem conexão

**What**: Com guardado e sem rede: faixa "Sem conexão, atualizado em dd/mm hh:mm" (hora do `geradoEm` em São Paulo), somente leitura; rede voltando, "atualizando…"; sem guardado, "Sem conexão", "Conecte-se para ver o ranking." e "Tentar de novo"; engrenagem de admin responde "É preciso conexão para entrar.".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/ranking/FaixaSemConexao.tsx`
**Depends on**: T72
**Reuses**: `.specs/mockup/telas/t01-ranking--{sem-conexao,sem-conexao-admin,carregando-cache}.html`; `Faixa` (`CA:1286`)
**Requirement**: PAR-149, PAR-150, PAR-151, PAR-152

**Done when**:

- [ ] Teste `PAR-149`: `geradoEm` 2026-10-16T01:30Z mostra "atualizado em 15/10 22:30"
- [ ] Teste `PAR-151`: sem guardado, o vazio sem conexão
- [ ] Teste `PAR-150`: tocar na engrenagem sem rede mostra a mensagem
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T74: Seed com as partidas do exemplo da t01

**What**: O seed passa a criar o grupo pela `grupo_criar` de 7 parâmetros com a data e grava as 3 partidas do exemplo (01, 08 com chuva e 15/10/2026), a pontuação inicial e a situação de cada jogador, para o ranking do seed bater com o mockup.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/scripts/src/seed.ts`
**Depends on**: T73
**Reuses**: Seed da fundação (`F:1055`) estendido pela grupos-e-elenco (`GE:2164`); `BC:37` (P25); `respostas/publico-ranking-2026-10.json` do mockup
**Requirement**: PAR-62, PAR-79

**Done when**:

- [ ] Teste: depois do seed, `GET /api/publico/pelada-de-quinta/ranking?mes=2026-10` dá as linhas e os pontos de `publico-ranking-2026-10.json`
- [ ] O teste existente do seed passa a esperar 3 partidas (Pergunta 1)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 29: Comparação visual

### T75: Mockup do projeto atualizado e runner com os campos novos

**What**: Aplicar o patch do `reuso.md` (R-20 a R-36: `telas.json` com as entradas `real`, respostas sem `enderecoNovo`, t11 `nova`) e estender o runner visual com `ocultar`, `abortar`, `sequencia`, `pendente`, `aguardarMs`, `userAgent` e relógio congelado (AD-044).
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/visual.mjs`
**Depends on**: T74
**Reuses**: Runner estendido na conta-e-acesso (`CA:1609`) e comparador (`F:1764`); `reuso.md` R-20 a R-36; `BC:39-40` (P27, P28)
**Requirement**: PAR-146

**Done when**:

- [ ] `git apply --check` limpo antes de aplicar; depois, `cmp` com `c6dc82c` nos 17 arquivos
- [ ] Teste: entrada com `ocultar` mascara o seletor nas duas imagens; `abortar` derruba a requisição
- [ ] Teste: com o relógio congelado em 2026-10-16, a t09 `sem-jogadores` mostra "Nenhuma em outubro" em qualquer data real
- [ ] As telas já ativas das features anteriores continuam passando
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T76: Comparação visual das telas da feature

**What**: Ativar t01 (`sucesso`, `vazio`, `vazio-mes`, `carregando`, `erro`), t03, t09 `sem-jogadores`, t10, t11 (`nova`, `edicao`, `carregando`, `vazio`, `data-futura`, `duplicada`), t18 e t21 em PC e celular, até 1%; conferir à mão os estados de `revisaoManual` (PDF, sem conexão, instalar, prévias da t16) e listá-los aqui.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/telas-ativas.json`
**Depends on**: T75
**Reuses**: Lista de telas ativas (`CA:1633`); Stylelint de tokens (`F:1374`, AD-042)
**Requirement**: PAR-145, PAR-146

**Done when**:

- [ ] Teste `PAR-146`: as telas listadas × 2 viewports em até 1%
- [ ] Teste `PAR-145`: Stylelint de tokens sem erro nos CSS novos
- [ ] Estados de `revisaoManual` conferidos e listados nesta tarefa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T77: Comparação visual do PDF (P01)

**What**: `e2e/pdf-visual.spec.ts`: gera o PDF de `sucesso` e `mes-vazio` a partir das respostas do mockup, rasteriza em 794 × 1123 px e compara com P01, até 4,5% local e 9% no CI.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/pdf-visual.spec.ts`
**Depends on**: T76
**Reuses**: Comparador (`F:1764`); bloco `pdf` de `telas.json:286-288`
**Requirement**: PAR-108, PAR-104

**Done when**:

- [ ] Teste `PAR-108`: as duas imagens têm 794 × 1123 px e a divergência fica no limite
- [ ] Uma coluna deslocada de propósito faz o teste falhar (conferido e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 30: Ponta a ponta

### T78: e2e do ranking sem conexão

**What**: `e2e/ranking-offline.spec.ts`: abre o ranking online, corta a rede e recarrega (faixa com a hora, aviso ao tentar entrar); num contexto novo sem guardado, "Sem conexão".
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/ranking-offline.spec.ts`
**Depends on**: T77
**Reuses**: Playwright e servidor de e2e (`F:1691`); Independent Test `B:463`
**Requirement**: PAR-149, PAR-150, PAR-151, PAR-153

**Done when**:

- [ ] Teste `PAR-149`: offline, a faixa aparece com a hora do `geradoEm`
- [ ] Teste `PAR-151`: contexto sem guardado mostra "Sem conexão"
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T79: Jornadas da feature ponta a ponta

**What**: Testes Playwright das jornadas novas desta feature (`.specs/projeto/jornadas.md`, numeradas pela sessão principal) contra o `wrangler dev` com o seed: lançar e ver no ranking, corrigir e excluir, pesos novos, meses e PDF, grupo indisponível, prévia de reativar e uso do app.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/partidas.spec.ts`
**Depends on**: T78
**Reuses**: Jornadas de acesso (`CA:1683`); `pnpm dev` (`F:1812`)
**Requirement**: PAR-22, PAR-46, PAR-50, PAR-03, PAR-84, PAR-95, PAR-90, PAR-109, PAR-155

**Done when**:

- [ ] Um teste por jornada, com o nome da jornada
- [ ] Cada jornada termina com a asserção do Resultado esperado dela
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---
