# Grupos e elenco — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: `ljs:.specs/features/grupos-e-elenco/spec.md` (aprovada em 2026-10-29, GEL-01 a GEL-118, e as regras da auditoria em `spec.md:541-548`), `ljs:.specs/features/grupos-e-elenco/context.md` (C1 a C10), `ljs:.specs/features/grupos-e-elenco/design.md` (aprovado em 2026-10-29), `ljs:.specs/features/grupos-e-elenco/seguranca.md` (SEC-001 a SEC-010, reteste de 2026-10-30), `ljs:.specs/features/grupos-e-elenco/validation.md` (PASS) e o mockup de módulo `ljs:.specs/features/grupos-e-elenco/mockup/`, com `ljs:` = `C:\Leandro\Projetos\GestaoDaPelada_LJS` @ `e557292` (branch `main`), conferido em 2026-11-04. A remota `feat/grupos-e-elenco` (`1380484`) é anterior (só a spec, sem aprovação) e não é a Base. Contratos da v2: `.specs/features/fundacao/` (spec, design, tasks) e `.specs/features/conta-e-acesso/tasks.md`.
**Branch pai**: `feature/conta-e-acesso` (a conta-e-acesso ainda não estará integrada quando esta feature for executada). Se a conta-e-acesso já estiver integrada na `main` quando o `/executar` começar, a Branch pai passa a ser `main`.
**Feature**: 3 de 8 do roteiro (AD-001, AD-015). Requisitos `GEL-*` e `SEC-*`.

> Convenções desta lista: `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `CA:` = `.specs/features/conta-e-acesso/tasks.md`; `M:` = `ljs:backend/api/src/infraestrutura/db/migracoes/` (as 23 migrações, copiadas byte a byte pela fundação, AD-003); `GS:` = `ljs:.specs/features/grupos-e-elenco/spec.md`; `GD:` = `ljs:.specs/features/grupos-e-elenco/design.md`; `GSEG:` = `ljs:.specs/features/grupos-e-elenco/seguranca.md`; `GT:` = `ljs:.specs/features/grupos-e-elenco/tasks.md` (só granularidade); `R-NN` = linha do `reuso.md` desta pasta; `telas.json` = `.specs/mockup/telas.json`. Do zero (AD-002): código e testes do LJS são só consulta. Nome de teste de tarefa de risco alto cita o `GEL-NN` ou o `SEC-NN`.

## Delta

1. **O banco já tem tudo.** As 5 migrações da grupos-e-elenco do LJS estão entre as 23 da `main` `e557292`: `grupos_visiveis()` com arquivado (`M:1792844280000_grupos-visiveis-arquivado.sql:9`), `grupo_criar` (`M:1792844340000_grupo-criar.sql:10`), grants por coluna (`M:1792844400000_grupos-grants-coluna.sql:6-7`), convites de grupo arquivado (`M:1792844460000_convites-grupo-arquivado.sql:11`, já caracterizado em `CA:495`) e o trigger de arquivar só pela criadora (`M:1792844520000_grupos-arquivar-so-criadora.sql:8`). O design previa uma migração só (`GD:99`); vale o banco. **Sem migração nova** (AD-025 proposta). As Phases 1 e 2 são a rede de proteção (T0 da regra).
2. **IDs:** o pedido falou em `GRU-NN`; a Base usa `GEL-01` a `GEL-118`, mantidos. As regras da auditoria (`GS:541-548`) entram como critérios `SEC-001` a `SEC-009` de `GSEG:57-126` (AD-026 proposta); SEC-010 fica fora (dependência de build do LJS, sem par na v2). Da SEC-004, a parte do banco já é da CA (`CA:495`); aqui fica só a exceção do `exigirGrupoAtivo`.
3. **Contratos da CA estendidos:** `exigirVinculo` (`CA:795`), `contas.eu` (`CA:820`, passa a listar só grupos ativos, `GD:91`), `admins.remover` e a rota (`CA:844`, `CA:1020`, SEC-001), modelos de e-mail (`CA:672`, SEC-006), suíte de isolamento de rotas (`CA:1070`), `Grupos.tsx` (`CA:1509`, passa a `GET /api/grupos`), rotas do front (`CA:1309`), tela de admins (`CA:1582`) e runner visual (`CA:1609`). GEL-106 cita `backend/api/test/isolamento/casos.ts` e GEL-115 o `checar-tokens.py`, ambos do LJS: valem a suíte da CA e o Stylelint de tokens (`F:1374`), pelo texto do critério (AD-027 proposta, como a AD-020).
4. **A fundação não tem relógio nem regra de domínio sem relógio:** `F:385` proíbe só imports de I/O. GEL-70 e GEL-104 pedem domínio sem relógio; T7 estende a regra para `Date.now()`, `new Date()` sem argumento e `zod` (AD-028 proposta). `LIMITE_ESCRITA` já é declarado pela fundação (`F:1081`, FUN-26); aqui ele só é aplicado por conta (SEC-003).
5. **Mockup do módulo não está na v2.** O `telas.json` da v2 já tem as entradas (`telas.json:164-165` e `:188-227`) com `mockup` em `../features/grupos-e-elenco/mockup/telas/`, pasta inexistente; as respostas `elenco-*.json` já estão em `.specs/mockup/respostas/`. T52 copia os 36 arquivos byte a byte (`reuso.md`, R-01 a R-36). Toda tela da feature tem mockup: nenhuma pergunta de tela. Efeito na CA: `CA:1657` (T56) compara T08, cuja entrada `sucesso` usa este mockup e `GET /api/grupos`: decidido (AD-031 proposta) que a T56 da CA compara só T09 `menu-conta`, T19, T25 e T32, e as T08 `sucesso` e `vazio` (`telas.json:164-165`, ambas com este mockup) vêm para a T71.
6. **GEL-116:** a t09 fica fora da comparação até existirem partidas, uso e financeiro, como decidido pelo usuário no LJS (`ljs:.specs/features/grupos-e-elenco/validation.md:433`) (AD-029 proposta). t15 e t17 usam o mockup do projeto (`telas.json:195-201`). GEL-118 tem palavra de posição ("ao lado de cada campo"): T72 a prova com asserção espacial.
7. **Erro de validação:** `GS:70` manda 422 com "Corrija os campos indicados." e `campos`; a CA responde 422 `dados_invalidos` por campo (`CA:895`). T20 extrai o leitor da CA e acrescenta a mensagem, sem mudar o código de erro.
8. **Paridade (AD-004):** o procedimento é escrito pela fundação (`F:2087`, T74, FUN-52) e o FUN-28 (`F:2013`, T71) faz o `deploy.yml` recusar outro alvo. Este plano **não tem tarefa de paridade**: ela exige mudar `deploy.yml`, a checagem `so-previa` e o `wrangler.jsonc` (domínio e Hyperdrive de produção), mais ações externas com confirmação. Decidido pelo usuário (AD-030 proposta): a paridade é passo do `/preparar` Nível 2, logo depois do `/validar` desta feature, guiado com o usuário e com confirmação; o código (`deploy.yml`, checagem `so-previa`, `wrangler.jsonc`) entra lá, com os próprios testes.
9. Fora, como na Base: pesos (t18), prévias de acumulado e posição, ranking público e limites do Free (`GS:29-33`); o mockup do módulo já não os mostra (`GD:5-9`).

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| GEL-01 | `POST /api/grupos` cria grupo, vínculo com financeiro, `criado_por`, 6 habilidades; 201 com id, slug e link | T2, T26, T28, T59, T74 |
| GEL-02 | Habilidades iniciais na ordem Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme | T2, T10, T26 |
| GEL-03 | Nome de 3 a 60 depois do trim; senão 422 no `nome` | T16, T28, T59 |
| GEL-04 | Dia da semana fora da lista: 422 em `diaSemana` | T16, T28 |
| GEL-05 | Frequência fora da lista: 422 em `frequencia` | T16, T28 |
| GEL-06 | Horário ausente ou fora de `HH:MM`: 422 com as duas mensagens | T16, T28, T59 |
| GEL-07 | Corpo com `slug` ou `urlPublica`: 422, nada criado | T16, T28 |
| GEL-08 | Sem sessão: 401, nada criado | T28 |
| GEL-09 | Falha em qualquer passo desfaz grupo, vínculo e habilidades | T2, T28 |
| GEL-10 | Auditoria `grupo_criado` com a conta autora | T2, T28 |
| GEL-11 | Base do slug: sem acento, minúsculas, hífens, até 40 | T8 |
| GEL-12 | Base com menos de 3 caracteres vira `grupo` | T8 |
| GEL-13 | Palavra reservada vira `<base>-grupo` | T8 |
| GEL-14 | Slug ocupado (inclusive arquivado) ganha `-2`, `-3`... | T2, T26 |
| GEL-15 | Criações concorrentes: até 3 tentativas, slugs diferentes | T3 |
| GEL-16 | Slug imutável; renomear não muda o slug | T4, T29 |
| GEL-17 | Link público `<URL_PUBLICA>/g/<slug>`, sem endereço fixo | T28, T29 |
| GEL-18 | `PATCH /api/grupos/:grupoId` grava e devolve o grupo | T27, T29, T61 |
| GEL-19 | Edição inválida: as mesmas mensagens da criação | T16, T29, T61 |
| GEL-20 | `GET /api/grupos/:grupoId` com contagens e `souCriador` | T26, T29, T60 |
| GEL-21 | Sem vínculo: 404 na leitura e na edição | T29 |
| GEL-22 | Criadora arquiva com o nome exato; `grupo_arquivado` | T27, T30, T61 |
| GEL-23 | Nome de confirmação diferente: 422 com a mensagem | T27, T30, T61 |
| GEL-24 | Admin que não criou: 403 `so_quem_criou` | T4, T27, T30 |
| GEL-25 | Arquivado: 404 e fora da lista para quem não criou | T1, T24, T31 |
| GEL-26 | Arquivado: escrita da criadora dá 409 `grupo_arquivado`, salvo reativar e arquivar | T22, T31 |
| GEL-27 | Lista da criadora com a seção "Arquivados" e Reativar | T24, T26, T28, T58 |
| GEL-28 | Reativar apaga `arquivado_em`, audita e mantém tudo | T27, T30 |
| GEL-29 | Arquivar arquivado ou reativar ativo: 200 sem mudança nem auditoria | T27, T30 |
| GEL-30 | Arquivar não apaga dado | T27 |
| GEL-31 | Cadastrar jogador abre período e grava `inicio_pontuacao`; 201 | T34, T36, T63, T74 |
| GEL-32 | Sem data de entrada: hoje | T34 |
| GEL-33 | Data de entrada futura: 422 | T17, T36, T63 |
| GEL-34 | Apelido de 2 a 30: senão 422 | T17, T36, T63 |
| GEL-35 | Apelido repetido sem caixa (acento conta): 422 | T5, T34 |
| GEL-36 | Ano de 1940 a (ano de hoje − 10): senão 422 com o ano | T10, T17, T36 |
| GEL-37 | Posição fora das 7: 422 | T5, T17, T36 |
| GEL-38 | Telefone vazio ou nulo: sem telefone | T17, T34 |
| GEL-39 | Telefone de 11 dígitos com DDD e 9; grava só dígitos | T17, T36, T63 |
| GEL-40 | Pontuação inicial inteira de 0 a 9999; ausente = 0 | T17, T36 |
| GEL-41 | `PATCH` do jogador com as mesmas validações, ignora a entrada | T35, T37, T64 |
| GEL-42 | Mudar pontuação inicial audita valor antigo e novo | T35 |
| GEL-43 | Pontuação omitida na edição mantém o valor | T17, T35 |
| GEL-44 | Jogador de fora do grupo: 404 | T35, T37 |
| GEL-45 | `jogador_criado` e `jogador_excluido` na auditoria | T34, T35 |
| GEL-46 | Lista com id, apelido, posição, situação, desde, nível, `semNota` | T33, T36, T62 |
| GEL-47 | Ativos e Inativos com contagem, ordem sem acento e caixa | T9, T62 |
| GEL-48 | Busca por trecho do apelido sem acento e caixa | T9, T62 |
| GEL-49 | Estados vazios de ativos e de inativos | T62 |
| GEL-50 | Ativo = período aberto | T5, T33 |
| GEL-51 | Inativar encerra o período, audita, 200 | T38, T42 |
| GEL-52 | Sem data de saída: hoje | T18, T38, T42 |
| GEL-53 | Já inativo: 409 "O jogador já está inativo." | T38, T42 |
| GEL-54 | Reativar abre período sem mexer no início nem na pontuação | T39, T42 |
| GEL-55 | Sem data de retorno: hoje | T18, T39, T42 |
| GEL-56 | Já ativo: 409 "O jogador já está ativo." | T39, T42 |
| GEL-57 | `jogador_reativado` com retorno e saída anterior | T39 |
| GEL-58 | Saída e retorno passam pelas regras de período | T14, T38, T39 |
| GEL-59 | Tela confirma inativar com o aviso da spec | T65 |
| GEL-60 | Tela mostra "<apelido> reativado desde <data>." | T65 |
| GEL-61 | Período [início, fim): sair e voltar no mesmo dia vale | T11 |
| GEL-62 | Regras na ordem da spec, só a primeira falha | T14 |
| GEL-63 | Data inválida: "Informe uma data válida." | T11 |
| GEL-64 | Data futura: "A data não pode ser no futuro." | T11 |
| GEL-65 | Saída antes do início do período | T12 |
| GEL-66 | Retorno e saída fora de ordem (3 mensagens) | T12 |
| GEL-67 | Sobreposição de períodos | T12 |
| GEL-68 | Presença que sai de dentro do período, com a data limite | T13, T38 |
| GEL-69 | Saída do primeiro período antes do início da pontuação | T14 |
| GEL-70 | Regras puras em `@pelada/dominio`, sem relógio nem I/O | T7, T15 |
| GEL-71 | Corrigir saída ou retorno; `jogador_periodo_corrigido` | T40, T43 |
| GEL-72 | Corrigir saída de período aberto: 422 | T14, T40, T43 |
| GEL-73 | Corrigir início do primeiro período: 422 | T14, T40, T43 |
| GEL-74 | Datas iguais: 200 `alterado: false`, sem gravar | T40, T43 |
| GEL-75 | Período de fora: 404 | T40, T43 |
| GEL-76 | Tela mostra "Datas corrigidas." | T66 |
| GEL-77 | `PUT .../inicio` grava e audita | T41, T43, T66 |
| GEL-78 | Início antes de 01/01/2000: 422 | T15, T43 |
| GEL-79 | Início futuro: 422 | T15, T43 |
| GEL-80 | Início depois da saída do primeiro período: 422 | T15, T43 |
| GEL-81 | Início anterior move o início do primeiro período | T15, T41 |
| GEL-82 | Início igual: 200 sem gravar | T41, T43 |
| GEL-83 | Só a criação e a rota de início escrevem `inicio_pontuacao` | T41, T45 |
| GEL-84 | Excluir sem histórico apaga jogador e períodos; 204 | T5, T35, T37 |
| GEL-85 | Com presença, nota ou pagamento: 409 `jogador_com_historico` | T5, T35, T37 |
| GEL-86 | Recusa mostra "Inativar em vez disso" | T67 |
| GEL-87 | Confirmação "Excluir <apelido>?" com o texto da spec | T67 |
| GEL-88 | `GET .../habilidades` na ordem de cadastro | T46, T47 |
| GEL-89 | Criar habilidade no fim da ordem; 201 | T46, T47 |
| GEL-90 | Nome de 2 a 30: senão 422 | T18, T47 |
| GEL-91 | Nome repetido sem caixa: 422 | T5, T46, T47 |
| GEL-92 | Renomear mantém notas e ordem | T46, T47 |
| GEL-93 | Excluir apaga as notas e audita `habilidade_excluida` | T5, T46, T47 |
| GEL-94 | Confirmação de exclusão com o texto da spec | T68 |
| GEL-95 | Sem habilidades: "Nenhuma habilidade" e o aviso de 5,5 | T68 |
| GEL-96 | Habilidade de fora: 404 | T46, T47 |
| GEL-97 | `PUT .../notas/:habilidadeId` grava e devolve o nível | T48, T64 |
| GEL-98 | Nota `null` apaga, sem erro se não existe | T48 |
| GEL-99 | Nota fora de 1 a 10 ou não inteira: 422 | T18, T48 |
| GEL-100 | Jogador ou habilidade de fora: 404 | T48 |
| GEL-101 | Nível = média × 100, meio para cima (683) | T10 |
| GEL-102 | Sem nota: 550 e `semNota` | T10, T33 |
| GEL-103 | Tela mostra "6,8" ou "sem nota" | T55, T64 |
| GEL-104 | Nível numa função pura de `@pelada/dominio` | T7, T10, T15 |
| GEL-105 | Jogador inativo recebe notas | T48 |
| GEL-106 | Toda rota nova na suíte de isolamento; criar e listar grupos como "não se aplica" | T50 |
| GEL-107 | Admin de A com id do grupo B: 404 sem ler nem alterar | T1, T50 |
| GEL-108 | Id de jogador, período ou habilidade de outro grupo: 404 | T50 |
| GEL-109 | Escrita de período em transação, jogador travado, auditoria junto | T38, T44 |
| GEL-110 | Duas escritas de período simultâneas: uma depois da outra | T44 |
| GEL-111 | Checagem reprova escrita de `periodos_ativos` fora do repositório | T45 |
| GEL-112 | Acesso como `pelada_app`, tabelas sob RLS `FORCE` por `grupo_id` | T0, T1, T5, T6 |
| GEL-113 | Auditoria sem telefone nem ano de nascimento | T49 |
| GEL-114 | Telas t08, t27, t09, t20, t15, t16 e t17 | T58 a T68, T69 |
| GEL-115 | Só tokens; passa na checagem de tokens | T56, T57, T71 |
| GEL-116 | Comparação visual com o mockup em PC e celular | T52, T71 |
| GEL-117 | Sem grupos: estado vazio com "Criar grupo" | T58 |
| GEL-118 | 422 com `campos`: "Corrija N campos" e a mensagem ao lado do campo | T20, T59, T61, T63, T72 |
| SEC-001 | Outra admin não remove a criadora: 409 `criadora_nao_removivel` | T32, T70 |
| SEC-002 | `dataEntrada` com piso de 01/01/2000 e a mensagem do GEL-78 | T17, T36 |
| SEC-003 | `LIMITE_ESCRITA` por conta nas escritas de `/api/grupos*`: 429 | T23 |
| SEC-004 | Criadora cancela convite pendente de grupo arquivado | T22 |
| SEC-005 | Nome do grupo, apelido e habilidade sem controle nem invisível, em NFC | T16, T17, T18 |
| SEC-006 | Nome do grupo como texto puro no e-mail de convite | T51 |
| SEC-007 | `exigirGrupoAtivo` lê `arquivado_em` com `FOR KEY SHARE` | T22, T25 |
| SEC-008 | Auditar edição do jogador, renomear grupo, criar e renomear habilidade (só ids e campos) | T27, T35, T46 |
| SEC-009 | Só a criadora muda `arquivado_em`, também no banco | T4 |

Fora: SEC-010 (dependência de build do LJS). Mudam de sentido, pelas ADs propostas: GEL-106 e GEL-115 (artefatos da v2, AD-027), GEL-116 (sem a t09, AD-029), GEL-26 (arquivar também passa no grupo arquivado, nota de `GS:145`).

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:72-78`, igual ao da CA): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje**: não roda. Não há código na v2 e as features anteriores (`fundacao` e `conta-e-acesso`) ainda não foram executadas.
- **Falhas preexistentes**: a linha de base é o gate final da `conta-e-acesso` (`CA:1724`). O `/executar` desta feature roda a suíte uma vez antes do lote 1 e registra aqui o resultado e as falhas.

## Test Coverage Matrix

> Gerada da Base, dos contratos da fundação e da CA e das regras de teste do `.claude/CLAUDE.md`. Padrão forte: todo critério e todo caso limite com teste. Camadas e comandos iguais aos da fundação (`F:41-56`) e da CA (`CA:115-126`).

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Banco: RLS, grants, `grupo_criar` e trigger (caracterização) | integration | Postgres 18 real, como `pelada_app` (`comoApp`); matriz política × comando abaixo; concorrência com duas conexões | `backend/api/test/isolamento/grupos-*.test.ts`, `backend/api/test/banco/grupos-*.test.ts` | `pnpm --filter @pelada/api test` |
| Domínio (`backend/dominio`) | unit | Todos os ramos; um caso por regra e mensagem, com os limites (mesmo dia, véspera, dia seguinte) | `backend/dominio/test/**/*.test.ts` | `pnpm --filter @pelada/dominio test` |
| Contrato (`backend/contrato`) | unit | Cada schema: válido, cada limite, cada mensagem, campo extra, caracteres de controle | `backend/contrato/test/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Relógio, middlewares, repositórios e rotas | integration / e2e | Pool `workerd` com Postgres local: caminho feliz, cada código e mensagem da spec, auditoria, transação desfeita | `backend/api/test/{infraestrutura,repositorios,rotas}/*.test.ts` | `pnpm --filter @pelada/api test` |
| Concorrência (slug, período, grupo ativo) | integration | Duas conexões reais, ordem forçada por trava, sem deadlock | `backend/api/test/concorrencia/*.test.ts` | `pnpm --filter @pelada/api test` |
| Isolamento de rotas | e2e | Toda rota nova com caso (conta de B contra o grupo de A, e ids de outro grupo) ou "não se aplica" | `backend/api/test/isolamento/rotas.test.ts` | `pnpm --filter @pelada/api test` |
| Checagens e seed | unit / integration | Caso que passa e caso que falha; seed contra banco de teste | `backend/scripts/checagens/test/*.test.ts`, `backend/scripts/test/*.test.ts` | `pnpm test:checagens` e `pnpm --filter @pelada/scripts test` |
| Front: componentes, dados e telas | unit | jsdom + Testing Library + axe: cada estado do mockup, cada mensagem da spec, axe sem violação | `frontend/web/src/**/*.test.tsx` | `pnpm --filter @pelada/web test` |
| Front: comparação visual e posição | e2e | Cada estado do módulo no `telas.json` × 2 viewports, até 1%; erro ao lado do campo por `boundingBox` | `frontend/web/e2e/visual.mjs`, `frontend/web/e2e/erros-campo.spec.ts` | `pnpm --filter @pelada/web visual` e `pnpm --filter @pelada/web e2e` |
| Front: jornadas ponta a ponta | e2e | J-11 a J-14 contra o `wrangler dev` | `frontend/web/e2e/elenco.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Ativos do mockup e documentação | none | Gate de build (a cópia é conferida por `cmp`) | — | gate de build |

**Matriz política × comando** (só o que esta feature acrescenta à matriz da fundação, `F:981` e `F:1007`, que já cobre o cruzamento entre grupos em todas as tabelas). Como `pelada_app`; C = criadora do grupo G, O = outra admin de G, B = admin só do grupo H; cada célula é um teste que morre com a policy aberta `USING (true)`, sem `WITH CHECK` ou com o grant a mais:

| Tabela ou objeto | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `grupos`, G arquivado | C vê; O e B veem zero; slug público sem conta vê G (T1) | recusado para todos, só por `grupo_criar` (T2) | C: só `nome`, `dia_semana`, `frequencia`, `horario`, `arquivado_em`; `criado_por`, `slug`, `situacao_comercial`, `trial_inicio` recusados; O afeta 0 linhas; `UPDATE` sem `WHERE` de C afeta só G (T1, T4) | recusado (sem grant) (T4) |
| `grupos.arquivado_em` (trigger) | — | — | O (G ativo) recebe 42501; C arquiva e reativa; owner passa (T4) | — |
| `jogadores`, `periodos_ativos`, `habilidades`, `notas`, `vinculos_admin`, `auditoria`, `convites_admin` com G arquivado | C vê; O vê zero (T1) | C insere; O recusado pelo `WITH CHECK` (T1) | C altera; O afeta 0 linhas, inclusive sem `WHERE` (T1) | C apaga onde há grant; O afeta 0 linhas, inclusive sem `WHERE` (T1) |
| `periodos_ativos` | — | — | — | recusado para `pelada_app` (sem grant); some só pelo cascade de `jogadores` (T5) |
| `jogadores` com presença, nota ou pagamento | — | apelido repetido sem caixa recusado (23505) (T5) | — | recusado por FK (23503), nada apagado (T5) |
| `habilidades` | — | nome repetido sem caixa recusado (23505) (T5) | — | apaga as notas pelo cascade (T5) |
| `grupo_criar` | — | sem `app.conta_id`: 42501; `EXECUTE` só `pelada_app`, sem `PUBLIC` (T2, T6) | — | — |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` (ou `pnpm test:checagens`) |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` (+ `pnpm --filter @pelada/web e2e` e `visual` nas Phases 22 e 23) |
| Build | Fim de Phase, ativos, docs e o fim da feature | O comando de `.specs/projeto/testes.json` (seção Linha de base) |

> **Vermelho nas Phases 1 e 2 (caracterização):** o comportamento já existe no banco, então o teste passa de primeira. A prova de que ele falharia é a sabotagem no banco de teste: `CREATE OR REPLACE FUNCTION grupos_visiveis()` com a versão de `M:1792843320000_rls.sql:17-24`, `DROP TRIGGER`, `GRANT UPDATE ON grupos` inteiro ou `grupo_criar` sem o laço de nova tentativa, e o teste fica vermelho. Rode uma vez por tarefa e registre na própria tarefa (linha `Evidência da rede`).

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, as tarefas rodam em sequência. Criticidade por Phase: 1, 2 e 4 a 16 **críticas**; 3 e 17 a 23 **comuns**. Lotes previstos (até 6h, Phases inteiras, `progresso.py --lote` confirma): L1 = P1, L2 = P2 (críticos); L3 = P3 (comum); L4 = P4, L5 = P5, L6 = P6, L7 = P7, L8 = P8, L9 = P9, L10 = P10, L11 = P11, L12 = P12, L13 = P13, L14 = P14, L15 = P15, L16 = P16 (críticos); L17 = P17, L18 = P18, L19 = P19, L20 = P20, L21 = P21, L22 = P22, L23 = P23 (comuns). Lotes com tarefa de `Domínio: sim`: L2, L4, L5, L7, L8, L9, L13, L14. Total: 76 tarefas, 23 Phases, 23 lotes, 119h.

### Phase 1: Rede de proteção: grupo arquivado e criação no banco (crítica, 5,5h)

```
T0 → T1 → T2
```

### Phase 2: Rede de proteção: concorrência, grants, trigger e elenco no banco (crítica, 6h)

```
T3 → T4 → T5 → T6
```

### Phase 3: Domínio: regra sem relógio, slug, apelido e nível (comum, 5h)

```
T7 → T8 → T9 → T10
```

### Phase 4: Domínio: datas, ordem, sobreposição e presença (crítica, 5,5h)

```
T11 → T12 → T13
```

### Phase 5: Domínio: avaliação dos períodos e da data de início (crítica, 3,5h)

```
T14 → T15
```

### Phase 6: Contrato (crítica, 5,5h)

```
T16 → T17 → T18
```

### Phase 7: Base da API: relógio, corpo, tipos e grupo ativo (crítica, 6h)

```
T19 → T20 → T21 → T22
```

### Phase 8: Limite de escrita, sessão e corrida do grupo ativo (crítica, 4,5h)

```
T23 → T24 → T25
```

### Phase 9: API de grupos: repositório e criação (crítica, 5,5h)

```
T26 → T27 → T28
```

### Phase 10: API de grupos: dados, arquivar e criadora (crítica, 6h)

```
T29 → T30 → T31 → T32
```

### Phase 11: API de jogadores: repositório (crítica, 5,5h)

```
T33 → T34 → T35
```

### Phase 12: API de jogadores: rotas e inativar (crítica, 5h)

```
T36 → T37 → T38
```

### Phase 13: Repositório de períodos: reativar, corrigir e início (crítica, 5h)

```
T39 → T40 → T41
```

### Phase 14: Rotas de períodos, concorrência e escritores (crítica, 5,5h)

```
T42 → T43 → T44 → T45
```

### Phase 15: Habilidades e notas (crítica, 5,5h)

```
T46 → T47 → T48
```

### Phase 16: Proteções transversais (crítica, 4h)

```
T49 → T50 → T51
```

### Phase 17: Mockup do módulo e dados do front (comum, 5,5h)

```
T52 → T53 → T54 → T55
```

### Phase 18: Componentes de campo (comum, 3,5h)

```
T56 → T57
```

### Phase 19: Telas do grupo (comum, 6h)

```
T58 → T59 → T60 → T61
```

### Phase 20: Telas do elenco: lista, cadastro e ficha (comum, 5,5h)

```
T62 → T63 → T64
```

### Phase 21: Ficha do jogador: períodos e exclusão; habilidades (comum, 6h)

```
T65 → T66 → T67 → T68
```

### Phase 22: Rotas, admins, comparação visual e posição (comum, 5h)

```
T69 → T70 → T71 → T72
```

### Phase 23: Seed, jornadas e documentação (comum, 4h)

```
T73 → T74 → T75
```

## Task Breakdown

#### Phase 1: Rede de proteção: grupo arquivado e criação no banco

### T0: Cenário de grupos e elenco

**What**: Estender o cenário de teste da CA com: grupo G criado pela conta C (via `grupo_criar`), a conta O admin de G por vínculo, o grupo H só da conta B, jogadores de G com período aberto, um com período encerrado, uma partida com presença, uma nota e um pagamento mensal; helpers `arquivar(G)` e `comoConta(conta, fn)` como `postgres` e `pelada_app`. Caracteriza o estado de partida: com as 23 migrações, C e O veem G e B não.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/cenario-grupos.ts`
**Depends on**: None
**Reuses**: estender o cenário da CA (`CA:265`, T0) e o `comoApp` e a fábrica da fundação (`F:909`); `bancoDeTeste()` (`F:507`); tabelas em `M:1792843200000_linha-de-base.sql:65`, `:106`, `:122`, `:135`, `:143`, `:182`, `:257`
**Requirement**: GEL-112
**Status**: rascunhada
**Nota do rascunho**: o teste do cenário fica em `cenario-grupos.test.ts`; a evidência da rede (sabotagem da `grupo_criar`) é do /executar.

**Done when**:

- [ ] Teste `GEL-112`: C e O enxergam G por `comoApp`; B enxerga só H; o cenário tem ao menos uma linha em `jogadores`, `periodos_ativos`, `habilidades`, `notas`, `presencas` e `pagamentos_mes`
- [ ] O banco `teste_*` é removido no `finally`, também quando a criação do cenário falha
- [ ] Evidência da rede: com `grupo_criar` sabotada (sem o vínculo), o teste fica vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T1: Matriz do grupo arquivado por comando

**What**: Caracterizar a `grupos_visiveis()` vigente com G arquivado, como `pelada_app`, por SELECT, INSERT, UPDATE e DELETE em `grupos` e em toda tabela com `grupo_id` (lista do catálogo): a criadora C vê e escreve; a outra admin O vê zero linhas e não escreve, inclusive com `UPDATE` e `DELETE` sem `WHERE`; o slug público sem conta continua vendo G; reativado, O volta a ver.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/grupos-arquivado.test.ts`
**Depends on**: T0
**Reuses**: `grupos_visiveis()` de `M:1792844280000_grupos-visiveis-arquivado.sql:9-20`; policies geradas em `M:1792843320000_rls.sql:39-57`; molde da matriz da fundação (`F:981`, `F:1007`)
**Requirement**: GEL-25, GEL-107, GEL-112
**Status**: rascunhada

**Done when**:

- [ ] Testes `GEL-25`: linhas "G arquivado" da Test Coverage Matrix, uma por comando e por tabela, para C e para O
- [ ] Teste `GEL-107`: B continua sem ver nem alterar G, arquivado ou não
- [ ] Teste `GEL-112`: o ramo do slug público não muda com G arquivado
- [ ] Evidência da rede: `grupos_visiveis()` trocada pela versão de `M:1792843320000_rls.sql:17-24` deixa os testes de O vermelhos (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T2: `grupo_criar` no banco

**What**: Caracterizar `grupo_criar` como `pelada_app`: sem `app.conta_id` recusa; cria grupo com `criado_por`, vínculo com `acessa_financeiro` verdadeiro, as habilidades na ordem recebida (coluna `ordem`) e a auditoria `grupo_criado`; escolhe o primeiro sufixo livre contando grupos arquivados; uma falha no meio (habilidade inválida) desfaz tudo; `INSERT` direto em `grupos` é recusado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/grupos-criar.test.ts`
**Depends on**: T1
**Reuses**: `M:1792844340000_grupo-criar.sql:10-75` (sufixo em `:37-44`, auditoria em `:68`); `ordem` identity em `M:1792843200000_linha-de-base.sql:210`; cenário de T0
**Requirement**: GEL-01, GEL-02, GEL-09, GEL-10, GEL-14
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-01`: grupo, vínculo com `acessa_financeiro = true` e `criado_por` = conta do contexto
- [ ] Teste `GEL-02`: as habilidades saem na ordem do array recebido
- [ ] Teste `GEL-14`: com `pelada-de-quinta` (arquivado) e `pelada-de-quinta-2` ocupados, o novo é `pelada-de-quinta-3`
- [ ] Testes `GEL-09`, `GEL-10`: habilidade de 1 caractere no array faz a função falhar sem grupo, vínculo, habilidade nem auditoria; no sucesso, uma linha `grupo_criado` com a conta autora
- [ ] Teste `GEL-01`: sem `app.conta_id`, erro 42501; `INSERT INTO grupos` como `pelada_app` é recusado
- [ ] Evidência da rede: a função sem o `WHILE EXISTS` deixa o teste de sufixo vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Rede de proteção: concorrência, grants, trigger e elenco no banco

### T3: Concorrência do slug

**What**: Provar com duas conexões reais que duas chamadas de `grupo_criar` com a mesma base, disputando o mesmo slug, terminam com slugs diferentes (nova tentativa pelo `unique_violation`), e que a colisão em outra restrição sobe o erro sem nova tentativa.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/concorrencia/grupos-slug.test.ts`
**Depends on**: T2
**Reuses**: laço de `M:1792844340000_grupo-criar.sql:37-58` (`grupos_slug_key`, até 3 tentativas); `bancoDeTeste()` (`F:507`)
**Requirement**: GEL-15
**Status**: rascunhada
**Nota do rascunho**: o caso de três colisões seguidas fica só listado (exige três transações em ordem exata); a evidência da rede é do /executar.

**Done when**:

- [ ] Casos limite listados antes do teste: duas transações abertas ao mesmo tempo; a primeira confirma depois da segunda calcular o sufixo; três colisões seguidas; colisão em restrição que não é o slug
- [ ] Teste `GEL-15`: as duas criações confirmam, com `base` e `base-2`
- [ ] Teste `GEL-15`: violação que não é `grupos_slug_key` sobe o erro na primeira tentativa
- [ ] Evidência da rede: a função sem o bloco `EXCEPTION` deixa o teste vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T4: Grants por coluna em `grupos` e trigger da criadora

**What**: Caracterizar como `pelada_app`: `UPDATE` em `grupos` só em `nome`, `dia_semana`, `frequencia`, `horario` e `arquivado_em`; `criado_por`, `situacao_comercial`, `trial_inicio` e `slug` recusados (o `slug` também pela trigger da linha de base); `DELETE` recusado; `arquivado_em` mudado por admin que não criou dá 42501, a criadora arquiva e reativa, e o owner passa.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/grupos-colunas.test.ts`
**Depends on**: T3
**Reuses**: `M:1792844400000_grupos-grants-coluna.sql:6-7`; `M:1792844520000_grupos-arquivar-so-criadora.sql:8-24`; trigger do slug em `M:1792843200000_linha-de-base.sql:82-93`
**Requirement**: GEL-16, GEL-24, SEC-009
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-16`: `UPDATE grupos SET slug` falha pelo grant e, como owner, pela trigger
- [ ] Teste `GEL-24`: `UPDATE grupos SET criado_por` como `pelada_app` é recusado
- [ ] Teste `SEC-009`: O muda `arquivado_em` de G ativo e recebe 42501; C arquiva e reativa; `UPDATE` de `nome` por O passa
- [ ] Evidência da rede: `GRANT UPDATE ON grupos TO pelada_app` e `DROP TRIGGER grupos_arquivado_so_criadora` deixam testes vermelhos (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T5: Regras do elenco que o banco já garante

**What**: Caracterizar como `pelada_app`: `periodos_ativos` sem `DELETE` (some só pelo cascade de `jogadores`); um período aberto por jogador; `fim >= inicio`; as 7 posições do CHECK; apelido e habilidade únicos sem caixa (com acento contando); `DELETE` de jogador com presença, nota ou pagamento recusado por FK; `DELETE` de habilidade apaga as notas.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/elenco-restricoes.test.ts`
**Depends on**: T4
**Reuses**: grants em `M:1792843260000_roles.sql:22-33`; `M:1792843200000_linha-de-base.sql:120` (`jogadores_apelido_grupo`), `:128-131` (cascade e `periodos_um_aberto`), `:141` (`habilidades_nome_grupo`), `:149-150` (FKs de `notas`), `:189`, `:266`, `:324-326` (posições)
**Requirement**: GEL-35, GEL-37, GEL-50, GEL-84, GEL-85, GEL-91, GEL-93, GEL-112
**Status**: rascunhada

**Done when**:

- [ ] Testes `GEL-84`, `GEL-85`: jogador sem histórico é apagado com os períodos; com presença, com nota ou com pagamento, 23503 e nada apagado (3 casos)
- [ ] Testes `GEL-35`, `GEL-91`: "Toninho" e "toninho" colidem (23505 em `jogadores_apelido_grupo`); "José" e "Jose" não; idem `habilidades_nome_grupo`
- [ ] Teste `GEL-93`: apagar a habilidade apaga as notas dela e não as de outra
- [ ] Testes `GEL-37`, `GEL-50`, `GEL-112`: posição `defensor` recusada; segundo período aberto recusado; `DELETE FROM periodos_ativos` recusado
- [ ] Evidência da rede: `GRANT DELETE ON periodos_ativos TO pelada_app` deixa o teste vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T6: Meta-teste das funções de grupo

**What**: Estender o meta-teste das funções da CA: `grupo_criar` e `grupos_visiveis` têm `SECURITY DEFINER`, `search_path = public, pg_temp`, sem `EXECUTE` para `PUBLIC` e com `EXECUTE` só para `pelada_app`; a função da trigger `grupos_arquivado_so_criadora` sem `EXECUTE` para `PUBLIC`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/meta-grupos.test.ts`
**Depends on**: T5
**Reuses**: estender o meta-teste da CA (`CA:338`, T3) e o da fundação (`F:957`); `M:1792844340000_grupo-criar.sql:74-75`; `M:1792844280000_grupos-visiveis-arquivado.sql:21-22`; `M:1792844520000_grupos-arquivar-so-criadora.sql:19`
**Requirement**: GEL-112
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-112`: as 3 funções conferidas pelo catálogo; uma função de teste sem `search_path` reprova
- [ ] Evidência da rede: `GRANT EXECUTE ON FUNCTION grupo_criar(...) TO PUBLIC` deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 3: Domínio: regra sem relógio, slug, apelido e nível

### T7: Regra: domínio sem relógio e sem zod

**What**: Estender a regra de lint do domínio da fundação para proibir também `Date.now()`, `new Date()` sem argumento, `performance.now()` e o import de `zod` em `backend/dominio`, com teste sobre arquivos de exemplo.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/dominio/test/sem-relogio.test.ts`
**Depends on**: T6
**Reuses**: estender a regra `no-restricted-imports` da fundação (`F:385`, T5) com `no-restricted-syntax`; decisão de `GD:61` (lint do domínio impede I/O, relógio e zod) e AD-028 proposta
**Requirement**: GEL-70, GEL-104
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-70`: arquivo de exemplo com `Date.now()` e outro com `new Date()` reprovam; `new Date('2026-01-01')` passa
- [ ] Teste `GEL-104`: `import { z } from 'zod'` em `backend/dominio` reprova
- [ ] Os testes de FUN-06 da fundação continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T8: Base do slug

**What**: Escrever `slugBase(nome)`: decompõe e tira acentos, minúsculas, troca sequências fora de `a-z0-9` por hífen, tira hífens das pontas, corta em 40 sem hífen final; base com menos de 3 vira `grupo`; palavra reservada vira `<base>-grupo`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/dominio/src/grupos/slug.ts`
**Depends on**: T7
**Reuses**: regras de `GS:104-106` e lista de reservadas de `GS:106`; interface de `GD:116` (`gerarSlug` com sufixo fica de fora: o sufixo é do banco, `GD:213`)
**Requirement**: GEL-11, GEL-12, GEL-13
**Status**: rascunhada
**Nota do rascunho**: a reservada `g` tem 1 caractere e, pela ordem da spec (GEL-12 antes de GEL-13, `GS:105-106`), vira `grupo`; o teste das reservadas cobre as 8 com 3 ou mais caracteres e o caso `g` à parte.

**Done when**:

- [ ] Testes `GEL-11`: "Pelada de Quinta" → `pelada-de-quinta`; "Açaí & Cia" → `acai-cia`; nome de 50 letras cortado em 40 sem hífen final
- [ ] Testes `GEL-12`: "AB" e "!!!" → `grupo`
- [ ] Testes `GEL-13`: cada uma das 9 reservadas vira `<base>-grupo` ("Admin" → `admin-grupo`, "Well Known" → `well-known-grupo`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T9: Apelido: ordem, busca e data em `dd/mm/aaaa`

**What**: Escrever `chaveBusca(texto)` (sem acento e sem caixa), `compararApelido(a, b)` e `formatarData(iso)` (`AAAA-MM-DD` → `dd/mm/aaaa`, para as mensagens).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/dominio/src/elenco/apelido.ts`
**Depends on**: T8
**Reuses**: interfaces de `GD:117` e `GD:123`
**Requirement**: GEL-47, GEL-48
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-47`: ["Zé", "ana", "Álvaro", "Bia"] ordena em Álvaro, ana, Bia, Zé
- [ ] Teste `GEL-48`: `chaveBusca("JOSÉ")` contém `chaveBusca("jose")`
- [ ] Teste: `formatarData("2026-10-01")` = `01/10/2026`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T10: Nível, habilidades iniciais e limite do ano

**What**: Escrever `calcularNivel(notas)` (média × 100 com meio para cima; sem notas, 550 e `semNota`), `HABILIDADES_INICIAIS` e `anoNascimentoMaximo(hoje)` (ano de hoje − 10).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/dominio/src/elenco/nivel.ts`
**Depends on**: T9
**Reuses**: interfaces de `GD:118-120`; ordem de `GS:82`; regra do nível de `GS:337-338`
**Requirement**: GEL-02, GEL-36, GEL-101, GEL-102, GEL-104
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-101`: 8, 7, 6, 7, 8, 5 → 683; um caso exato de meio (6,505 → 651)
- [ ] Teste `GEL-102`: lista vazia → `{ nivel: 550, semNota: true }`
- [ ] Teste `GEL-02`: `HABILIDADES_INICIAIS` igual às 6 da spec, na ordem
- [ ] Teste `GEL-36`: `anoNascimentoMaximo("2026-12-31")` = 2016 e `("2027-01-01")` = 2017
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 4: Domínio: datas, ordem, sobreposição e presença

### T11: Tipos, intervalo [início, fim) e validade das datas

**What**: Escrever os tipos de período e de entrada da avaliação, a sobreposição pelo intervalo [início, fim) e as regras de data real (`AAAA-MM-DD` que existe no calendário) e não futura, com `hoje` como parâmetro.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/atividade/datas.ts`
**Depends on**: T10
**Reuses**: regras de `GS:232-235`; interface de `GD:121`
**Requirement**: GEL-61, GEL-63, GEL-64
**Status**: rascunhada
Lacunas: período vazio (saída no mesmo dia do início, que o banco aceita): a spec não diz se vale; o rascunho o aceita e o trata como sem dia nenhum, sem sobreposição (`[LACUNA]` em `backend/dominio/src/atividade/datas.ts`, `sobrepoem`).

**Done when**:

- [ ] Casos limite listados antes do código: 29/02 em ano bissexto e não bissexto; `2026-13-01`; `2026-1-1`; hoje; amanhã; saída e retorno no mesmo dia
- [ ] Teste `GEL-61`: [01/10, 05/10) e [05/10, aberto) não se sobrepõem
- [ ] Testes `GEL-63`, `GEL-64`: cada caso limite com a mensagem exata
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T12: Ordem e sobreposição dos períodos

**What**: Escrever as regras de ordem (saída antes do início do próprio período; retorno antes da saída anterior; saída depois do próximo retorno; retorno depois da saída do próprio período) e de sobreposição, com as datas em `dd/mm/aaaa` nas mensagens.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/atividade/ordem.ts`
**Depends on**: T11
**Reuses**: mensagens de `GS:236-238`; `formatarData` (T9)
**Requirement**: GEL-65, GEL-66, GEL-67
**Status**: rascunhada

**Done when**:

- [ ] Casos limite listados antes do código: cada regra no dia exato, na véspera e no dia seguinte; três períodos com o do meio alterado
- [ ] Testes `GEL-65`, `GEL-66`: as 4 mensagens, cada uma com a data do período vizinho
- [ ] Teste `GEL-67`: resultado com dois períodos sobrepostos dá "Os períodos não podem se sobrepor."
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T13: Presença que sai do período

**What**: Escrever `coberturaRetirada(antes, depois, presencas)`: as presenças (presente, lesionado, expulso) que estavam dentro de algum período antes e ficam fora depois, e a data limite da mensagem (dia seguinte à última retirada, para saída; dia da primeira retirada, para retorno). Presença que já estava fora não bloqueia.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/atividade/cobertura.ts`
**Depends on**: T12
**Reuses**: regra e mensagem de `GS:239`; interface de `GD:121` (`coberturaRetirada`)
**Requirement**: GEL-68
**Status**: rascunhada

**Done when**:

- [ ] Casos limite listados antes do código: presença no dia da saída; na véspera; várias presenças retiradas; presença já fora antes da mudança; retorno adiado sobre presença
- [ ] Teste `GEL-68`: presença em 01/10 e saída em 30/09 dá a mensagem com 01/10 e a data mínima 02/10
- [ ] Teste `GEL-68`: retorno adiado para depois de uma presença dá a mensagem de retorno com a data máxima
- [ ] Teste `GEL-68`: presença que já estava fora de período não bloqueia
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 5: Domínio: avaliação dos períodos e da data de início

### T14: Avaliar inativar, reativar e corrigir

**What**: Escrever `avaliarPeriodos(entrada)` para as operações inativar, reativar e corrigir: aplica a mudança, avalia as regras na ordem da spec (data válida, campo corrigível, não futura, ordem, sobreposição, presença, início da pontuação) e devolve só a primeira falha com `regra`, `mensagem` e `campo`, ou os períodos resultantes.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/atividade/avaliar-periodos.ts`
**Depends on**: T13
**Reuses**: funções de T11 a T13; ordem de `GS:233`; mensagens de `GS:240`, `GS:256-257`; interface de `GD:121`
**Requirement**: GEL-58, GEL-62, GEL-69, GEL-72, GEL-73
**Status**: rascunhada
**Nota do rascunho**: a regra do GEL-69 só é avaliada quando a mudança é a saída do primeiro período, para um histórico antigo fora da regra não travar escritas em outros períodos; corrigir com as datas atuais (GEL-74) volta antes da regra de data futura.

**Done when**:

- [ ] Casos limite listados antes do código: entrada que viola duas regras ao mesmo tempo (só a primeira volta); corrigir saída de período aberto; corrigir o início do primeiro período; saída do primeiro período antes do início da pontuação
- [ ] Teste `GEL-62`: data futura e sobreposição juntas devolvem só a de data futura
- [ ] Testes `GEL-72`, `GEL-73`, `GEL-69`: mensagens exatas
- [ ] Teste `GEL-58`: inativar e reativar válidos devolvem os períodos esperados
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T15: Avaliar a data de início e exportar o domínio

**What**: Escrever a avaliação da data de início (piso 01/01/2000, não futura, não depois da saída do primeiro período, e o recuo que move o início do primeiro período sem mexer nos encerrados) e exportar todo o domínio da feature em `backend/dominio/src/index.ts`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/dominio/src/atividade/avaliar-inicio.ts`
**Depends on**: T14
**Reuses**: regras de `GS:275-278`; funções de T11 e T14
**Requirement**: GEL-70, GEL-78, GEL-79, GEL-80, GEL-81, GEL-104
**Status**: rascunhada

**Done when**:

- [ ] Casos limite listados antes do código: 31/12/1999 e 01/01/2000; hoje e amanhã; igual à saída do primeiro período e um dia depois; primeiro período ainda aberto
- [ ] Testes `GEL-78`, `GEL-79`, `GEL-80`: mensagens exatas
- [ ] Teste `GEL-81`: recuar de 05/02 para 01/02 move o início do primeiro período e não muda os encerrados
- [ ] Teste `GEL-70`, `GEL-104`: o `index.ts` exporta `slugBase`, `chaveBusca`, `compararApelido`, `calcularNivel`, `HABILIDADES_INICIAIS`, `anoNascimentoMaximo`, `avaliarPeriodos`, a avaliação do início e `formatarData`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 6: Contrato

### T16: Contrato do grupo e texto visível

**What**: Escrever `textoVisivel` (NFC, sem `\p{Cc}` nem `\p{Cf}`) e os schemas `.strict()` do grupo: `dadosGrupo` (nome 3 a 60 com trim, `diaSemana`, `frequencia`, `horario` `HH:MM`), `criarGrupoCorpo`, `editarGrupoCorpo` (recusam `slug` e `urlPublica`), `arquivarCorpo`, `grupoDetalhe` e `gruposResposta { ativos, arquivados }`, com as mensagens da spec.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/grupo.ts`
**Depends on**: T15
**Reuses**: primitivos zod da CA (`CA:550`, T11) e `.strict()` dos schemas de acesso (`CA:574`, T12); formas de `GD:138`; mensagens de `GS:83-87`; regra de `GSEG:94`
**Requirement**: GEL-03, GEL-04, GEL-05, GEL-06, GEL-07, GEL-19, SEC-005
**Status**: rascunhada

**Done when**:

- [ ] Testes `GEL-03`: `"  AB  "` e 61 caracteres recusados com a mensagem; 3 e 60 aceitos
- [ ] Testes `GEL-04`, `GEL-05`, `GEL-06`: valores fora da lista e horário ausente, `24:00` e `7:30` com o campo e a mensagem
- [ ] Teste `GEL-07`: `slug` ou `urlPublica` no corpo é recusado
- [ ] Teste `SEC-005`: NUL, U+200B e U+202E no nome recusados; "Pelada São" em NFD sai em NFC
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T17: Contrato do jogador

**What**: Escrever `jogadorCorpo(hoje)` (apelido 2 a 30 com `textoVisivel`, `anoNascimento` de 1940 a `anoNascimentoMaximo(hoje)`, `posicao` das 7, `telefone` sem máscara com 11 dígitos, `pontuacaoInicial` 0 a 9999 com padrão 0, `dataEntrada` opcional, não futura e com piso de 01/01/2000), `editarJogadorCorpo(hoje)` (sem `dataEntrada`, pontuação opcional) e as respostas `jogadorItem` e `jogadorDetalhe`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/elenco.ts`
**Depends on**: T16
**Reuses**: fábrica por `hoje` de `GD:139`; mensagens de `GS:165-175`; piso de `GSEG:66` com a mensagem de `GS:275`; `textoVisivel` (T16)
**Requirement**: GEL-33, GEL-34, GEL-36, GEL-37, GEL-38, GEL-39, GEL-40, GEL-43, SEC-002, SEC-005
**Status**: rascunhada

**Done when**:

- [ ] Testes `GEL-34`, `GEL-36`: 1 e 31 caracteres; 1939 e (ano − 9) recusados com "O ano precisa estar entre 1940 e 2016." em 2026
- [ ] Testes `GEL-38`, `GEL-39`: vazio e nulo viram sem telefone; `(11) 91234-5678` vira `11912345678`; DDD `01` e sem o 9 recusados com a mensagem
- [ ] Testes `GEL-40`, `GEL-43`: -1, 10000 e 1,5 recusados; ausente no cadastro = 0; ausente na edição continua ausente
- [ ] Testes `GEL-33`, `SEC-002`: `dataEntrada` amanhã, `0000-01-01` e `1999-12-31` recusadas com as mensagens; `2000-01-01` aceita
- [ ] Teste `GEL-37`, `SEC-005`: posição `defensor` recusada; U+200B no apelido recusado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T18: Contrato de períodos, habilidades e notas

**What**: Escrever `dataCorpo { data? }`, `corrigirPeriodoCorpo { saida?, retorno? }`, `inicioCorpo { data }`, `habilidadeCorpo { nome }` (2 a 30 com `textoVisivel`), `notaCorpo { nota: 1..10 | null }` e `habilidadeItem`. As regras de período ficam no domínio, não no zod.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/periodos.ts`
**Depends on**: T17
**Reuses**: formas de `GD:140-142`; mensagens de `GS:313`, `GS:335`
**Requirement**: GEL-52, GEL-55, GEL-90, GEL-99, SEC-005
**Status**: rascunhada

**Done when**:

- [ ] Testes `GEL-52`, `GEL-55`: `dataCorpo` aceita corpo vazio
- [ ] Teste `GEL-90`: 1 e 31 caracteres recusados com a mensagem
- [ ] Teste `GEL-99`: 0, 11, 5,5 e `"7"` recusados; `null` aceito
- [ ] Teste `SEC-005`: NUL no nome da habilidade recusado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 7: Base da API: relógio, corpo, tipos e grupo ativo

### T19: Relógio da API

**What**: Escrever o `Relogio` (`hoje()` em `AAAA-MM-DD` no fuso `America/Sao_Paulo`, `agoraIso()`), injetado no contexto do Hono (`c.var.relogio`) e aceito em `criarApp({ relogio })` para os testes.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/relogio.ts`
**Depends on**: T18
**Reuses**: `criarApp` da fundação (`F:1106`); decisão de `GD:66-67` e `GD:296` (só o relógio injetado lê a data; o SQL não usa `now()` para regra de data)
**Requirement**: GEL-32, GEL-52, GEL-55
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-32`: às 22h de São Paulo (01h UTC do dia seguinte), `hoje()` devolve a data de São Paulo
- [ ] Teste: `criarApp({ relogio })` usa o relógio falso nas rotas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T20: Leitor de corpo, erros e unicidade

**What**: Extrair das rotas de acesso o leitor de corpo: 422 `dados_invalidos` com a mensagem "Corrija os campos indicados." e `campos`; acrescentar os códigos `grupo_arquivado`, `so_quem_criou`, `jogador_com_historico`, `ja_inativo`, `ja_ativo` e `criadora_nao_removivel`; e o tradutor do erro 23505 por nome de constraint (`jogadores_apelido_grupo`, `habilidades_nome_grupo`) para o 422 do campo.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/corpo.ts`
**Depends on**: T19
**Reuses**: 422 `dados_invalidos` das rotas de acesso (`CA:895`, T25); forma de `GS:70-71`; tradução por constraint de `GD:155`
**Requirement**: GEL-118
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-118`: corpo inválido devolve 422 com a mensagem geral e `campos` com uma mensagem por campo
- [ ] Teste: 23505 em `jogadores_apelido_grupo` vira 422 no campo `apelido` com a mensagem de apelido repetido; outra constraint sobe como 500
- [ ] As rotas de acesso da CA continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T21: Tipos Kysely das tabelas do elenco

**What**: Acrescentar aos tipos do banco `grupos` completo, `jogadores`, `periodos_ativos`, `habilidades`, `notas` e, só leitura, `partidas`, `presencas` e `pagamentos_mes`, com um teste que confere colunas e tipos contra o catálogo do banco migrado.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/tipos.ts`
**Depends on**: T20
**Reuses**: `Kysely<Banco>` da fundação (`FD:103`); `lerEsquema` (`F:736`); modelo de `GD:220-236`
**Requirement**: GEL-112
**Status**: rascunhada

**Done when**:

- [ ] Teste `GEL-112`: cada coluna tipada existe no catálogo com o tipo correspondente
- [ ] `pnpm typecheck` passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T22: Middleware `exigirGrupoAtivo`

**What**: Criar `exigirGrupoAtivo`, depois do `exigirVinculo`: em método diferente de GET e HEAD sob `/api/grupos/:grupoId/*`, lê `arquivado_em` com `FOR KEY SHARE` na transação da requisição e, com o grupo arquivado, responde 409 `grupo_arquivado`, salvo `POST …/reativar`, `POST …/arquivar` e `DELETE …/admins/convites/:id`. Liga-o também às rotas de admins da CA.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/grupo-ativo.ts`
**Depends on**: T21
**Reuses**: estender a cadeia do `exigirVinculo` (`CA:795`, T21); decisão de `GD:181` e a nota de `GS:145` (arquivar também passa); exceção de `GSEG:160` (SEC-004); `FOR KEY SHARE` de `GSEG:163` (`FOR SHARE` dava deadlock)
**Requirement**: GEL-26, SEC-004, SEC-007
**Status**: rascunhada

**Done when**:

- [ ] Casos limite listados antes do código: GET em arquivado; PATCH em arquivado; reativar; arquivar de novo; cancelar convite; remover admin em arquivado
- [ ] Teste `GEL-26`: com G arquivado, `PATCH /api/grupos/:grupoId` e `POST …/admins/convites` da criadora dão 409 `grupo_arquivado`; GET passa
- [ ] Teste `SEC-004`: `DELETE …/admins/convites/:id` da criadora em G arquivado dá 204
- [ ] Teste `SEC-007`: a leitura usa `FOR KEY SHARE` (a consulta registrada no teste traz a cláusula)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 8: Limite de escrita, sessão e corrida do grupo ativo

### T23: `LIMITE_ESCRITA` por conta

**What**: Aplicar o binding `LIMITE_ESCRITA` (já declarado pela fundação) por conta da sessão aos POST, PUT, PATCH e DELETE de `/api/grupos*`: 429 com `Retry-After`, sem gravar; GET não conta; outra conta não é afetada.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/limite-escrita.ts`
**Depends on**: T22
**Reuses**: estender `limiteTaxa(binding)` (`F:1153`, estendido em `CA:746`) com a chave `conta:<id>`; binding de `F:1081` (FUN-26, 60 por minuto); decisão de `GSEG:75` e `GSEG:159`
**Requirement**: SEC-003
**Status**: rascunhada

**Done when**:

- [ ] Teste `SEC-003`: com binding falso que nega na 61.ª, a 61.ª criação de grupo da conta A dá 429 com `Retry-After` e nada é criado
- [ ] Teste `SEC-003`: a conta B, na mesma janela, cria normalmente; GETs da conta A não gastam a cota
- [ ] Teste `SEC-003`: `X-Pelada` continua sendo checado antes do limitador (`CA:723`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T24: Sessão lista só grupos ativos

**What**: Estender `contas.eu` para listar só os grupos com `arquivado_em IS NULL`; a lista com arquivados vem de `GET /api/grupos`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/contas.ts`
**Depends on**: T23
**Reuses**: estender `contas.eu` (`CA:820`, T22); decisão de `GD:91` e `GD:286`
**Requirement**: GEL-25, GEL-27
**Status**: rascunhada
Lacunas: o teste da CA `ACE-18: a criadora ainda vê o próprio grupo arquivado` (`backend/api/test/repositorios/contas.test.ts:57`) contradiz o GEL-27 (a sessão da criadora não traz o arquivado); o rascunho não o alterou, porque mudar teste existente pede aprovação. O `/executar` pergunta antes de levar ao verde.

**Done when**:

- [ ] Teste `GEL-25`: com G arquivado, `GET /api/sessao` de O não traz G
- [ ] Teste `GEL-27`: `GET /api/sessao` de C também não traz G (ele só aparece em `GET /api/grupos`, em "Arquivados")
- [ ] O teste de ACE-18 da CA continua verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T25: Corrida entre escrita e arquivamento

**What**: Provar com duas conexões que arquivar espera a escrita em curso no grupo (que viu o grupo ativo) e que a escrita seguinte, já com o grupo arquivado, recebe 409; e que dois PATCH simultâneos do mesmo grupo não dão deadlock.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/concorrencia/grupo-ativo.test.ts`
**Depends on**: T24
**Reuses**: `exigirGrupoAtivo` (T22); evidência do LJS em `GSEG:163` (só consulta); `bancoDeTeste()` (`F:507`)
**Requirement**: SEC-007

**Done when**:

- [ ] Casos limite listados antes do teste: escrita aberta e arquivar em seguida; arquivar aberto e escrita em seguida; dois PATCH
- [ ] Teste `SEC-007`: o `UPDATE` de `arquivado_em` espera o fim da transação da escrita
- [ ] Teste `SEC-007`: dois PATCH simultâneos terminam sem deadlock
- [ ] Evidência: sem o `FOR KEY SHARE`, o primeiro teste fica vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 9: API de grupos: repositório e criação

### T26: Repositório de grupos: criar, listar e ler

**What**: Escrever `grupos.criar(db, dados)` (chama `grupo_criar` com `slugBase` e `HABILIDADES_INICIAIS`), `grupos.listarDaConta(db)` (ativos e os arquivados que a conta criou, com dia, frequência e horário) e `grupos.ler(db, grupoId)` (contagens de jogadores ativos, habilidades e admins, e `souCriador`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos.ts`
**Depends on**: T25
**Reuses**: interfaces de `GD:150`; `grupo_criar` (`M:1792844340000_grupo-criar.sql:10`); molde dos repositórios da CA com `grupoId` primeiro (`CA:844`)
**Requirement**: GEL-01, GEL-02, GEL-14, GEL-20, GEL-27

**Done when**:

- [ ] Teste `GEL-01`: `criar` devolve id e slug e o grupo tem as 6 habilidades na ordem
- [ ] Teste `GEL-27`: C vê G arquivado em `arquivados`; O não o vê em nenhuma das listas
- [ ] Teste `GEL-20`: `ler` conta só jogadores com período aberto e diz `souCriador` certo para C e O
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T27: Repositório de grupos: editar, arquivar e reativar

**What**: Escrever `grupos.editar` (grava e audita `grupo_editado` com os nomes dos campos), `grupos.arquivar(db, grupoId, nomeConfirmacao)` e `grupos.reativar(db, grupoId)`: travam a linha (`FOR UPDATE`), leem o vínculo da própria conta com `FOR KEY SHARE`, conferem `criado_por` (senão `so_quem_criou`), comparam o nome exato e são idempotentes.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/grupos-estado.ts`
**Depends on**: T26
**Reuses**: decisão de `GD:150` e o risco de `GD:271` (vínculo com `FOR KEY SHARE`); `auditoria.registrar` (`CA:844`, T23); eventos de `GSEG:164`
**Requirement**: GEL-18, GEL-22, GEL-23, GEL-24, GEL-28, GEL-29, GEL-30, SEC-008

**Done when**:

- [ ] Casos limite listados antes do código: ativo → arquivado; arquivado → arquivado; arquivado → ativo; ativo → ativo; nome com caixa ou espaço diferente; O pedindo; criadora removida
- [ ] Testes `GEL-22`, `GEL-23`, `GEL-24`: nome exato arquiva e audita; "pelada de quinta" para "Pelada de Quinta" dá 422; O dá `so_quem_criou`
- [ ] Testes `GEL-28`, `GEL-29`, `GEL-30`: reativar mantém vínculos, jogadores, habilidades, notas e slug; repetir o estado não grava nem audita
- [ ] Teste `SEC-008`: `grupo_editado` traz só `campos`; edição que falha não deixa evento
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T28: Rotas `POST` e `GET /api/grupos`

**What**: Criar `POST /api/grupos` (201 com `id`, `slug` e `linkPublico` = `<URL_PUBLICA>/g/<slug>`) e `GET /api/grupos` (`{ ativos, arquivados }`), atrás de `exigirSessao`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/grupos.ts`
**Depends on**: T27
**Reuses**: `exigirSessao` (`CA:770`, T20); leitor de corpo (T20); `URL_PUBLICA` de `F:1081`; tabela de `GD:165-167`
**Requirement**: GEL-01, GEL-03, GEL-04, GEL-05, GEL-06, GEL-07, GEL-08, GEL-09, GEL-10, GEL-17, GEL-27

**Done when**:

- [ ] Teste `GEL-01`, `GEL-17`: 201 com o link montado de `URL_PUBLICA` (dois valores de `URL_PUBLICA` no teste)
- [ ] Testes `GEL-03` a `GEL-07`: cada corpo inválido dá 422 com o campo e nada é criado
- [ ] Teste `GEL-08`: sem sessão, 401 e nada criado
- [ ] Testes `GEL-09`, `GEL-10`: erro forçado depois de `grupo_criar` desfaz tudo; no sucesso há `grupo_criado`
- [ ] Teste `GEL-27`: `GET` da criadora separa ativos e arquivados
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 10: API de grupos: dados, arquivar e criadora

### T29: Rotas `GET` e `PATCH /api/grupos/:grupoId`

**What**: Criar `GET /api/grupos/:grupoId` (`grupoDetalhe`) e `PATCH /api/grupos/:grupoId` (grava e devolve o detalhe, sem mudar o slug), atrás de `exigirVinculo` e `exigirGrupoAtivo`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/grupo.ts`
**Depends on**: T28
**Reuses**: `exigirVinculo` (`CA:795`); `grupos.ler` e `grupos.editar` (T26, T27); tabela de `GD:168-169`
**Requirement**: GEL-16, GEL-17, GEL-18, GEL-19, GEL-20, GEL-21

**Done when**:

- [ ] Testes `GEL-18`, `GEL-16`: renomear devolve 200 com o nome novo e o mesmo slug e link
- [ ] Teste `GEL-19`: as mensagens de GEL-03 a GEL-07 também no PATCH
- [ ] Teste `GEL-20`: o GET traz as contagens e `souCriador`
- [ ] Teste `GEL-21`: B recebe 404 no GET e no PATCH
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T30: Rotas de arquivar e reativar

**What**: Criar `POST /api/grupos/:grupoId/arquivar` (`arquivarCorpo`) e `POST /api/grupos/:grupoId/reativar`, com 200, 422 do nome e 403 `so_quem_criou`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/grupo-estado.ts`
**Depends on**: T29
**Reuses**: `grupos.arquivar` e `grupos.reativar` (T27); tabela de `GD:170-171`
**Requirement**: GEL-22, GEL-23, GEL-24, GEL-28, GEL-29

**Done when**:

- [ ] Testes `GEL-22`, `GEL-23`: nome certo dá 200 e `grupo_arquivado`; nome errado dá 422 com a mensagem no campo `nomeConfirmacao`
- [ ] Teste `GEL-24`: O recebe 403 `so_quem_criou` em arquivar (G ativo); G fica igual
- [ ] Testes `GEL-28`, `GEL-29`: reativar arquivado dá 200 com `grupo_reativado`; repetir dá 200 sem auditoria
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T31: Isolamento do grupo arquivado nas rotas

**What**: Provar nas rotas que, com G arquivado, toda rota `/api/grupos/:grupoId/*` responde 404 a O (inclusive arquivar e reativar) e o grupo some das listas dela; para C, toda escrita responde 409 `grupo_arquivado`, salvo as exceções do T22.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/grupo-arquivado.test.ts`
**Depends on**: T30
**Reuses**: lista de rotas do `app.routes` usada na suíte da CA (`CA:1070`); cenário de T0
**Requirement**: GEL-25, GEL-26

**Done when**:

- [ ] Teste `GEL-25`: para cada rota de grupo registrada, O recebe 404 com G arquivado
- [ ] Teste `GEL-26`: para cada rota de escrita, C recebe 409 `grupo_arquivado`, salvo reativar, arquivar e cancelar convite
- [ ] Teste `GEL-25`: criadora removida do grupo recebe 404 em arquivar e reativar
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T32: A criadora não é removida por outra admin

**What**: Estender `admins.remover` e `DELETE /api/grupos/:grupoId/admins/:contaId`: outra admin que tenta remover a conta de `criado_por` recebe 409 `criadora_nao_removivel`, conferido na mesma transação; a criadora remove outras e pode sair de si mesma.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/admins.ts`
**Depends on**: T31
**Reuses**: estender `admins.remover` (`CA:844`, T23) e a rota (`CA:1020`, T30); decisão de `GSEG:57` e `GSEG:157`
**Requirement**: SEC-001

**Done when**:

- [ ] Teste `SEC-001`: O removendo C dá 409 `criadora_nao_removivel` e C continua admin
- [ ] Teste `SEC-001`: C removendo O dá 204; C saindo de si mesma, havendo outro admin, dá 204
- [ ] Os testes de ACE-39 e ACE-40 da CA continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 11: API de jogadores: repositório

### T33: Repositório de jogadores: listar e ler

**What**: Escrever `jogadores.listar(db, grupoId)` (uma consulta de jogadores com o período aberto ou o último encerrado e uma de notas do grupo; situação, desde e nível pelo domínio, sem N+1) e `jogadores.ler(db, grupoId, id)` (com períodos e notas).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores-leitura.ts`
**Depends on**: T32
**Reuses**: interface de `GD:151` e a decisão de `GD:287` (duas consultas e cálculo no domínio); `calcularNivel` (T10)
**Requirement**: GEL-46, GEL-50, GEL-102

**Done when**:

- [ ] Teste `GEL-46`: cada item traz id, apelido, posição, situação, desde, nível e `semNota`
- [ ] Teste `GEL-50`: jogador com período encerrado sai como inativo desde a data de saída
- [ ] Teste `GEL-102`: jogador sem nota sai com 550 e `semNota`
- [ ] Teste: listar 30 jogadores faz exatamente 2 consultas
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T34: Repositório de jogadores: criar

**What**: Escrever `jogadores.criar(db, grupoId, dados, hoje)`: confere apelido repetido sem caixa (422), grava o jogador com `inicio_pontuacao` = data de entrada (hoje se ausente), abre o primeiro período nessa data e audita `jogador_criado` com só ids e datas.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T33
**Reuses**: interface de `GD:151`; tradutor do 23505 (T20); `auditoria.registrar` (`CA:844`)
**Requirement**: GEL-31, GEL-32, GEL-35, GEL-38, GEL-45

**Done when**:

- [ ] Testes `GEL-31`, `GEL-32`: sem data de entrada, período aberto e `inicio_pontuacao` em `hoje` do relógio falso
- [ ] Teste `GEL-35`: "toninho" com "Toninho" existente dá 422; dois cadastros simultâneos do mesmo apelido dão um 201 e um 422 (não 500)
- [ ] Teste `GEL-38`: telefone ausente grava nulo
- [ ] Teste `GEL-45`: `jogador_criado` com o id do jogador e sem telefone nem ano
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T35: Repositório de jogadores: editar e excluir

**What**: Escrever `jogadores.editar` (mesmas validações, ignora a data de entrada, mantém a pontuação omitida; audita `jogador_pontuacao_inicial_alterada` com antes e depois e `jogador_editado` com os nomes dos campos) e `jogadores.excluir` (sem presença, nota nem pagamento apaga jogador e períodos e audita `jogador_excluido`; com histórico, `jogador_com_historico` com a sugestão `inativar`).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores-edicao.ts`
**Depends on**: T34
**Reuses**: interface de `GD:151`; regra de histórico de `GS:52` e C8 (`ljs:.specs/features/grupos-e-elenco/context.md:14`); eventos de `GSEG:164`
**Requirement**: GEL-41, GEL-42, GEL-43, GEL-44, GEL-45, GEL-84, GEL-85, SEC-008

**Done when**:

- [ ] Testes `GEL-41`, `GEL-43`, `GEL-42`: editar sem pontuação mantém o valor; mudar a pontuação audita antes e depois
- [ ] Teste `SEC-008`: editar telefone grava `jogador_editado` com `campos: ["telefone"]` e sem o número
- [ ] Testes `GEL-84`, `GEL-85`: sem histórico apaga e audita; com presença, com nota e com pagamento recusa sem apagar (3 casos)
- [ ] Teste `GEL-44`: id de jogador de outro grupo dá não encontrado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 12: API de jogadores: rotas e inativar

### T36: Rotas `GET` e `POST` de jogadores

**What**: Criar `GET /api/grupos/:grupoId/jogadores` e `POST /api/grupos/:grupoId/jogadores` com `jogadorCorpo(relogio.hoje())`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/jogadores.ts`
**Depends on**: T35
**Reuses**: `jogadores.listar` e `jogadores.criar` (T33, T34); relógio (T19); tabela de `GD:172`
**Requirement**: GEL-31, GEL-33, GEL-34, GEL-36, GEL-37, GEL-39, GEL-40, GEL-46, SEC-002

**Done when**:

- [ ] Teste `GEL-31`: 201 com o jogador criado e "Ativo desde" hoje
- [ ] Testes `GEL-33`, `GEL-34`, `GEL-36`, `GEL-37`, `GEL-39`, `GEL-40`: cada inválido dá 422 com o campo e a mensagem
- [ ] Teste `SEC-002`: `dataEntrada` `0000-01-01` dá 422, não 500
- [ ] Teste `GEL-46`: a lista tem os campos da spec
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T37: Rotas `GET`, `PATCH` e `DELETE` do jogador

**What**: Criar `GET`, `PATCH` e `DELETE /api/grupos/:grupoId/jogadores/:id`, com 404 para jogador de fora e 409 `jogador_com_historico` com a mensagem "<apelido> tem histórico de partidas e não pode ser excluído." e `sugestao: "inativar"`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/jogador.ts`
**Depends on**: T36
**Reuses**: `jogadores.ler`, `editar` e `excluir` (T33, T35); tabela de `GD:173`; mensagem de `GS:295`
**Requirement**: GEL-41, GEL-44, GEL-84, GEL-85

**Done when**:

- [ ] Teste `GEL-41`: PATCH válido dá 200 e ignora `dataEntrada` enviada
- [ ] Teste `GEL-44`: jogador de outro grupo dá 404 nos 3 métodos
- [ ] Testes `GEL-84`, `GEL-85`: 204 sem histórico; 409 com código, mensagem e sugestão
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T38: Repositório de períodos: inativar

**What**: Escrever `jogadores.inativar(db, grupoId, id, dados, hoje)` em `jogadores.ts`: `SELECT … FOR UPDATE` do jogador, lê períodos e presenças (com a data da partida), chama `avaliarPeriodos`, encerra o período aberto e audita `jogador_inativado`, tudo na transação da requisição; já inativo devolve `ja_inativo`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T37
**Reuses**: escrita de período de `GD:152` (trava antes da validação); `avaliarPeriodos` (T14); auditoria de inativar de C9 (`ljs:.specs/features/grupos-e-elenco/context.md:15`)
**Requirement**: GEL-51, GEL-52, GEL-53, GEL-58, GEL-68, GEL-109

**Done when**:

- [ ] Casos limite listados antes do código: sem data; saída igual ao início; saída antes de presença; já inativo; erro depois do `UPDATE`
- [ ] Testes `GEL-51`, `GEL-52`: encerra na data dada ou em hoje e audita
- [ ] Teste `GEL-53`: já inativo devolve `ja_inativo` sem gravar
- [ ] Teste `GEL-68`: presença em 01/10 e saída em 30/09 recusada com a data mínima 02/10
- [ ] Teste `GEL-109`: erro forçado depois do `UPDATE` deixa período e auditoria como antes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 13: Repositório de períodos: reativar, corrigir e início

### T39: Repositório de períodos: reativar

**What**: Escrever `jogadores.reativar` em `jogadores.ts`: mesma trava e validação, abre período novo na data de retorno (hoje se ausente), não muda `inicio_pontuacao` nem `pontuacao_inicial`, audita `jogador_reativado` com o retorno e a saída anterior; já ativo devolve `ja_ativo`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T38
**Reuses**: trava e leitura de T38 (mesma função interna de `jogadores.ts`); `avaliarPeriodos` (T14)
**Requirement**: GEL-54, GEL-55, GEL-56, GEL-57, GEL-58

**Done when**:

- [ ] Casos limite listados antes do código: retorno no dia da saída; na véspera; já ativo; sem data
- [ ] Testes `GEL-54`, `GEL-55`: período novo e início e pontuação intactos
- [ ] Testes `GEL-56`, `GEL-57`: já ativo sem gravar; auditoria com as duas datas
- [ ] Teste `GEL-58`: retorno antes da saída anterior recusado com a mensagem
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T40: Repositório de períodos: corrigir datas

**What**: Escrever `jogadores.corrigirPeriodo(db, grupoId, id, periodoId, dados, hoje)` em `jogadores.ts`: corrige a saída de período encerrado e o retorno de período que não é o primeiro, com trava e validação, e audita `jogador_periodo_corrigido` com antes e depois; datas iguais devolvem `alterado: false` sem gravar.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T39
**Reuses**: trava de T38; `avaliarPeriodos` com a operação corrigir (T14); regras de `GS:255-259`
**Requirement**: GEL-71, GEL-72, GEL-73, GEL-74, GEL-75

**Done when**:

- [ ] Casos limite listados antes do código: período aberto; primeiro período; datas iguais; período de outro jogador; saída e retorno juntos
- [ ] Teste `GEL-71`: saída de 05/10 para 03/10 grava e audita antes e depois
- [ ] Testes `GEL-72`, `GEL-73`, `GEL-74`: mensagens e `alterado: false` sem auditoria
- [ ] Teste `GEL-75`: período de outro jogador do grupo dá não encontrado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T41: Repositório de períodos: alterar a data de início

**What**: Escrever `jogadores.alterarInicio` em `jogadores.ts`: trava, avalia, grava `inicio_pontuacao`, move o início do primeiro período no recuo e audita `jogador_inicio_alterado` com as duas datas; data igual não grava. É o único escritor de `inicio_pontuacao` além da criação.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/jogadores.ts`
**Depends on**: T40
**Reuses**: trava de T38; avaliação do início (T15); regras de `GS:274-280`
**Requirement**: GEL-77, GEL-81, GEL-82, GEL-83

**Done when**:

- [ ] Casos limite listados antes do código: recuo; avanço dentro do primeiro período; data igual; primeiro período aberto
- [ ] Testes `GEL-77`, `GEL-81`: recuar de 05/02 para 01/02 move o primeiro período e audita
- [ ] Teste `GEL-82`: data igual não grava nem audita
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 14: Rotas de períodos, concorrência e escritores

### T42: Rotas de inativar e reativar

**What**: Criar `POST /api/grupos/:grupoId/jogadores/:id/inativar` e `…/reativar` com `dataCorpo`, 409 `ja_inativo` e `ja_ativo` com as mensagens da spec e 422 das regras de período no campo da data.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/periodos.ts`
**Depends on**: T41
**Reuses**: `jogadores.inativar` e `reativar` (T38, T39); tabela de `GD:174`
**Requirement**: GEL-51, GEL-52, GEL-53, GEL-54, GEL-55, GEL-56

**Done when**:

- [ ] Testes `GEL-51`, `GEL-54`: 200 nos dois e a lista reflete a situação
- [ ] Testes `GEL-53`, `GEL-56`: 409 com "O jogador já está inativo." e "O jogador já está ativo."
- [ ] Testes `GEL-52`, `GEL-55`: corpo vazio usa hoje do relógio falso
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T43: Rotas de corrigir período e data de início

**What**: Criar `PATCH /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId` e `PUT /api/grupos/:grupoId/jogadores/:id/inicio`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/periodos-correcao.ts`
**Depends on**: T42
**Reuses**: `corrigirPeriodo` e `alterarInicio` (T40, T41); tabela de `GD:175-176`
**Requirement**: GEL-71, GEL-72, GEL-73, GEL-74, GEL-75, GEL-77, GEL-78, GEL-79, GEL-80, GEL-82

**Done when**:

- [ ] Testes `GEL-71`, `GEL-74`: 200 com as datas novas; iguais dão `alterado: false` e "Nada a alterar."
- [ ] Testes `GEL-72`, `GEL-73`, `GEL-75`: 422 e 404 da spec
- [ ] Testes `GEL-77`, `GEL-78`, `GEL-79`, `GEL-80`, `GEL-82`: 200 e cada 422 com a mensagem
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T44: Concorrência das escritas de período

**What**: Provar com duas conexões que duas escritas de período do mesmo jogador (duas inativações; inativar e corrigir) são aplicadas uma depois da outra, com a segunda validada sobre o resultado da primeira.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/concorrencia/periodos.test.ts`
**Depends on**: T43
**Reuses**: trava de T38; `bancoDeTeste()` (`F:507`)
**Requirement**: GEL-109, GEL-110

**Done when**:

- [ ] Casos limite listados antes do teste: duas inativações; reativar e inativar; corrigir enquanto inativa
- [ ] Teste `GEL-110`: duas inativações simultâneas dão uma 200 e uma `ja_inativo`
- [ ] Teste `GEL-109`: a segunda transação espera a trava (tempo medido) e lê o período já encerrado
- [ ] Evidência: sem o `FOR UPDATE`, o teste fica vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T45: Checagem dos escritores de período

**What**: Escrever a checagem que reprova escrita em `periodos_ativos` (`INSERT`, `UPDATE`, `DELETE`, `insertInto`, `updateTable`, `deleteFrom`) ou em `inicio_pontuacao` fora dos arquivos de repositório de jogadores e das migrações, ligada ao `pnpm test:checagens`.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/escritores-periodo.ts`
**Depends on**: T44
**Reuses**: molde da checagem da CA (`CA:1093`, T33) e da fundação (`F:1251`); regra de `GD:191`
**Requirement**: GEL-83, GEL-111

**Done when**:

- [ ] Teste `GEL-111`: arquivo de exemplo em `rotas/` com `updateTable('periodos_ativos')` reprova; em `repositorios/jogadores.ts` passa
- [ ] Teste `GEL-83`: `inicio_pontuacao` num `set` fora do repositório reprova
- [ ] A checagem passa na base atual
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 15: Habilidades e notas

### T46: Repositório de habilidades

**What**: Escrever `habilidades.listar | criar | renomear | excluir(db, grupoId, …)`: ordem pela coluna `ordem`, nome repetido sem caixa (consulta e 23505), renomear mantém notas e ordem, excluir apaga as notas pelo cascade; auditoria `habilidade_criada`, `habilidade_renomeada` e `habilidade_excluida`, só com ids.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/habilidades.ts`
**Depends on**: T45
**Reuses**: interface de `GD:153`; tradutor do 23505 (T20); eventos de `GSEG:164`
**Requirement**: GEL-88, GEL-89, GEL-91, GEL-92, GEL-93, GEL-96, SEC-008

**Done when**:

- [ ] Testes `GEL-88`, `GEL-89`: criada vai para o fim da ordem
- [ ] Testes `GEL-91`, `GEL-92`: "passe" com "Passe" dá 422; renomear "Drible" mantém notas e posição
- [ ] Teste `GEL-93`: excluir apaga as notas só dela e audita
- [ ] Testes `SEC-008`, `GEL-96`: criar e renomear auditam; id de outro grupo dá não encontrado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T47: Rotas de habilidades

**What**: Criar `GET`, `POST /api/grupos/:grupoId/habilidades` e `PATCH`, `DELETE /api/grupos/:grupoId/habilidades/:id`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/habilidades.ts`
**Depends on**: T46
**Reuses**: `habilidades.*` (T46); tabela de `GD:177`
**Requirement**: GEL-88, GEL-89, GEL-90, GEL-91, GEL-92, GEL-93, GEL-96

**Done when**:

- [ ] Testes `GEL-88`, `GEL-89`, `GEL-92`, `GEL-93`: 200, 201, 200 e 204
- [ ] Testes `GEL-90`, `GEL-91`: 422 com a mensagem no campo `nome`
- [ ] Teste `GEL-96`: habilidade de outro grupo dá 404 no PATCH e no DELETE
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T48: Notas do jogador

**What**: Escrever `notas.salvar(db, grupoId, jogadorId, habilidadeId, nota | null)` (`INSERT … ON CONFLICT DO UPDATE` ou `DELETE`, devolve o nível) e a rota `PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/notas.ts`
**Depends on**: T47
**Reuses**: interface de `GD:154`; `calcularNivel` (T10); tabela de `GD:178`
**Requirement**: GEL-97, GEL-98, GEL-99, GEL-100, GEL-105

**Done when**:

- [ ] Teste `GEL-97`: criar e substituir a nota devolvem o nível recalculado
- [ ] Teste `GEL-98`: `null` apaga; `null` sem nota existente dá 200
- [ ] Testes `GEL-99`, `GEL-100`: 422 no campo `nota`; jogador ou habilidade de outro grupo dá 404
- [ ] Teste `GEL-105`: jogador inativo recebe nota
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 16: Proteções transversais

### T49: Auditoria sem dado pessoal

**What**: Escrever o teste que executa cada escrita da feature com telefone e ano marcadores e confere que nenhuma linha de `auditoria` (`resumo` e demais colunas) contém o telefone ou o ano de nascimento.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/auditoria-elenco.test.ts`
**Depends on**: T48
**Reuses**: colunas de `auditoria` em `M:1792843200000_linha-de-base.sql:50`; rotas de T28 a T48
**Requirement**: GEL-113

**Done when**:

- [ ] Teste `GEL-113`: criar, editar, inativar, reativar, corrigir, alterar início e excluir com telefone `11987654321` e ano 1987: nenhuma linha contém os dois
- [ ] Teste `GEL-113`: os eventos têm só ids, datas, números e nomes de campo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T50: Isolamento das rotas novas

**What**: Registrar todas as rotas novas na suíte de isolamento de rotas da CA (`POST` e `GET /api/grupos` como "não se aplica" com motivo; as outras como rotas de grupo) e acrescentar os casos de id de jogador, período e habilidade de outro grupo.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T49
**Reuses**: estender a suíte da CA (`CA:1070`, T32; vale ela no lugar do `casos.ts` do LJS, AD-027 proposta); decisão de `GD:192`
**Requirement**: GEL-106, GEL-107, GEL-108

**Done when**:

- [ ] Teste `GEL-106`: a suíte passa com as rotas novas e reprova rota nova sem caso
- [ ] Teste `GEL-107`: cada rota de grupo dá 404 para B com o id de G, sem mudar nada de G
- [ ] Teste `GEL-108`: com o id de G na rota e o id de jogador, período ou habilidade de H, 404
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T51: Nome do grupo seguro no e-mail de convite

**What**: Estender o modelo do e-mail de convite: o nome do grupo sai como texto puro, numa linha, com até 60 caracteres, e URL, `www.`, domínio ou e-mail no nome não viram link (separadores cercados de espaço), no texto e no HTML.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/email/modelos.ts`
**Depends on**: T50
**Reuses**: estender os modelos da CA (`CA:672`, T16); regra de `GSEG:102` e `GSEG:162` (`nomeDoGrupoNoEmail`)
**Requirement**: SEC-006

**Done when**:

- [ ] Teste `SEC-006`: nome "Pelada www.golpe.com" e "Pelada\nClique aqui" não geram link nem linha nova no texto e no HTML
- [ ] Teste `SEC-006`: nome normal sai igual ao de antes
- [ ] Os testes de ACE-31 da CA continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 17: Mockup do módulo e dados do front

### T52: Copiar o mockup do módulo

**What**: Rodar o comando de adaptação do `reuso.md` (cópia byte a byte dos 36 arquivos do mockup de módulo do LJS para `.specs/features/grupos-e-elenco/mockup/`), conferir com `cmp` e escrever o teste que confere que todo `mockup` do `telas.json` aponta para um arquivo existente.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/ferramentas/telas-json.test.mjs`
**Depends on**: T51
**Reuses**: `reuso.md` R-01 a R-36 (comando de adaptação no topo do mapa; a origem só é aberta pelo comando); entradas de `telas.json:164-165` e `:188-227`
**Requirement**: GEL-116

**Done when**:

- [ ] Os 36 arquivos copiados e iguais à origem pelo `cmp` (resultado registrado aqui)
- [ ] Teste `GEL-116`: todo `mockup` do `telas.json` existe no disco; um caminho inválido de exemplo reprova
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T53: Dados de grupos no front

**What**: Escrever `useGrupos`, `useGrupo` e as mutações `criarGrupo`, `editarGrupo`, `arquivarGrupo` e `reativarGrupo`, que invalidam a lista, o grupo e a sessão.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/grupos.ts`
**Depends on**: T52
**Reuses**: cliente HTTP da CA (`CA:1169`, T36) e `useSessao` (`CA:1192`, T37); contratos de T16
**Requirement**: GEL-01, GEL-18, GEL-22, GEL-27

**Done when**:

- [ ] Teste `GEL-27`: `useGrupos` devolve ativos e arquivados de `GET /api/grupos`
- [ ] Teste `GEL-22`: arquivar invalida a lista e a sessão
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T54: Dados do elenco no front

**What**: Escrever `useJogadores`, `useJogador` e as mutações de cadastrar, editar, excluir, inativar, reativar, corrigir período e alterar início, que invalidam a lista e a ficha.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/elenco.ts`
**Depends on**: T53
**Reuses**: molde de `dados/grupos.ts` (T53); contratos de T17 e T18
**Requirement**: GEL-31, GEL-46, GEL-51, GEL-54

**Done when**:

- [ ] Teste `GEL-51`: inativar invalida a lista e a ficha do jogador
- [ ] Teste `GEL-46`: a lista chega tipada pelo `jogadorItem`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T55: Dados de habilidades e notas e exibição do nível

**What**: Escrever `useHabilidades`, as mutações de habilidade e de nota, e `exibirNivel(nivel, semNota)` (uma casa decimal com meio para cima e vírgula; "sem nota").
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/habilidades.ts`
**Depends on**: T54
**Reuses**: molde de T53; regra de `GS:339`
**Requirement**: GEL-88, GEL-97, GEL-103

**Done when**:

- [ ] Teste `GEL-103`: 683 → "6,8"; 685 → "6,9"; `semNota` → "sem nota"
- [ ] Teste `GEL-97`: salvar nota atualiza o nível da ficha com a resposta
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 18: Componentes de campo

### T56: Componentes `CampoData`, `CampoHora` e `CampoSeletor`

**What**: Escrever os três campos a partir da marcação do mockup, com rótulo, erro ligado por `aria-describedby`, CSS Module e só tokens.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/CampoData.tsx`
**Depends on**: T55
**Reuses**: molde de `Campo` da CA (`CA:1238`, T39); marcação de `.specs/mockup/telas/t27-novo-grupo--vazio.html` e de `t16-jogador--novo.html`; Stylelint de tokens (`F:1374`)
**Requirement**: GEL-115

**Done when**:

- [ ] Teste `GEL-115`: axe sem violação nos estados normal e com erro dos três
- [ ] Teste: `CampoSeletor` mostra as opções de dia e de frequência
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T57: Componentes `CampoNota`, `Busca` e `Abas`

**What**: Escrever `CampoNota` (1 a 10 e limpar), `Busca` e `Abas` (Ativos e Inativos com contagem), com CSS Module e só tokens.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/CampoNota.tsx`
**Depends on**: T56
**Reuses**: molde de T56; marcação de `.specs/mockup/telas/t15-jogadores--sucesso.html` e `t16-jogador--edicao.html`
**Requirement**: GEL-115

**Done when**:

- [ ] Teste `GEL-115`: axe sem violação nos três
- [ ] Teste: `Abas` anuncia a aba ativa com `aria-selected`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 19: Telas do grupo

### T58: Tela Seus grupos (t08)

**What**: Estender `/app` para `GET /api/grupos`: grupos ativos com a recorrência, "Criar grupo", a seção "Arquivados" (só a criadora) com Reativar, e os estados carregando, erro, vazio, reativar e reativado.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/grupos/Grupos.tsx`
**Depends on**: T57
**Reuses**: estender a tela da CA (`CA:1509`, T50); estados de `R-02` a `R-08` (`t08-grupos--*.html` do módulo)
**Requirement**: GEL-27, GEL-114, GEL-117

**Done when**:

- [ ] Teste `GEL-27`: arquivados aparecem separados, cada um com Reativar
- [ ] Teste `GEL-117`: sem grupos, o estado vazio com "Criar grupo"
- [ ] Teste `GEL-114`: axe sem violação em cada estado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T59: Tela Novo grupo (t27)

**What**: Escrever `/app/grupos/novo`: nome, dia, frequência e horário, sem "Primeiro admin"; erros por campo com o `ResumoErros`; 201 leva a `/app/grupos/:grupoId`.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/novo-grupo/NovoGrupo.tsx`
**Depends on**: T58
**Reuses**: `R-34` a `R-36` (`t27-novo-grupo--*.html`); `ResumoErros` (`CA:1263`, T40); campos de T56
**Requirement**: GEL-01, GEL-03, GEL-06, GEL-114, GEL-118

**Done when**:

- [ ] Teste `GEL-01`: 201 navega para o início do grupo novo
- [ ] Testes `GEL-03`, `GEL-06`, `GEL-118`: 422 com dois campos mostra "Corrija 2 campos: Nome, Horário" e cada mensagem no campo
- [ ] Teste `GEL-114`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T60: Tela Início do grupo (t09)

**What**: Escrever `/app/grupos/:grupoId` com o nome, a recorrência, as contagens (jogadores, "6 habilidades", "1 admin") e os itens de Jogadores, Habilidades, Dados do grupo e Admins, sem "Pontuação"; estado sem jogadores.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/grupo/InicioGrupo.tsx`
**Depends on**: T59
**Reuses**: `R-09` e `R-10` (`t09-inicio--*.html` do módulo); decisão de `GD:5-6` (t09 sem "Pontuação")
**Requirement**: GEL-20, GEL-114

**Done when**:

- [ ] Teste `GEL-20`: mostra as contagens do `GET /api/grupos/:grupoId`
- [ ] Teste `GEL-114`: estado sem jogadores e axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T61: Tela Dados do grupo e arquivar (t20)

**What**: Escrever `/app/grupos/:grupoId/dados`: edição com "Dados salvos", copiar o link, e a zona de arquivar só para a criadora (diálogo com o nome digitado); estados carregando, erro, salvo, não criador, arquivar e erro de arquivar.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/dados-grupo/DadosGrupo.tsx`
**Depends on**: T60
**Reuses**: `R-27` a `R-33` (`t20-grupo--*.html` do módulo); `Dialogo` (`CA:1286`, T41)
**Requirement**: GEL-18, GEL-19, GEL-22, GEL-23, GEL-114, GEL-118

**Done when**:

- [ ] Testes `GEL-18`, `GEL-19`: salvar mostra "Dados salvos"; 422 marca os campos
- [ ] Testes `GEL-22`, `GEL-23`: a criadora arquiva com o nome; 422 mostra a mensagem no campo; quem não criou não vê a zona
- [ ] Teste `GEL-114`: axe sem violação com o diálogo aberto
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 20: Telas do elenco: lista, cadastro e ficha

### T62: Tela Jogadores (t15)

**What**: Escrever `/app/grupos/:grupoId/jogadores`: abas Ativos e Inativos com contagem, ordem e busca sem acento e caixa, posição e nível, e os estados vazio e sem inativos.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogadores/Jogadores.tsx`
**Depends on**: T61
**Reuses**: `.specs/mockup/telas/t15-jogadores--*.html` (3 estados, `telas.json:195-197`); `compararApelido` e `chaveBusca` (T9); `Busca` e `Abas` (T57)
**Requirement**: GEL-46, GEL-47, GEL-48, GEL-49, GEL-103, GEL-114

**Done when**:

- [ ] Testes `GEL-47`, `GEL-48`: "Ativos (2) Inativos (1)"; buscar "jose" acha "José"
- [ ] Teste `GEL-49`: os dois estados vazios com os textos da spec
- [ ] Teste `GEL-114`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T63: Tela Novo jogador (t16)

**What**: Escrever `/app/grupos/:grupoId/jogadores/novo`: apelido, ano, posição, telefone com máscara, pontuação inicial e data de entrada; erros por campo; 201 leva à ficha.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogador/NovoJogador.tsx`
**Depends on**: T62
**Reuses**: `R-23` (`t16-jogador--novo.html`) e `R-16` (`t16-jogador--erro.html`); campos de T56
**Requirement**: GEL-31, GEL-33, GEL-34, GEL-39, GEL-114, GEL-118

**Done when**:

- [ ] Teste `GEL-31`: 201 navega para a ficha
- [ ] Testes `GEL-33`, `GEL-34`, `GEL-39`, `GEL-118`: 422 marca cada campo com a mensagem e preenche o resumo
- [ ] Teste `GEL-114`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T64: Ficha do jogador: dados e notas

**What**: Escrever `/app/grupos/:grupoId/jogadores/:jogadorId`: dados editáveis, nível e notas por habilidade com `CampoNota`, lista de períodos e os estados carregando e edição.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogador/FichaJogador.tsx`
**Depends on**: T63
**Reuses**: `R-11` (`t16-jogador--carregando.html`) e `R-15` (`t16-jogador--edicao.html`); `exibirNivel` (T55); `CampoNota` (T57)
**Requirement**: GEL-41, GEL-97, GEL-103, GEL-114

**Done when**:

- [ ] Teste `GEL-97`, `GEL-103`: dar 8, 7, 6, 7, 8 e 5 mostra "Nível 6,8"; limpar todas mostra "sem nota"
- [ ] Teste `GEL-41`: salvar os dados chama o PATCH sem `dataEntrada`
- [ ] Teste `GEL-114`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 21: Ficha do jogador: períodos e exclusão; habilidades

### T65: Ficha do jogador: inativar e reativar

**What**: Acrescentar à ficha o diálogo de inativar com o aviso da spec (Cancelar e Inativar), o de reativar com a data de retorno, os erros de período e os estados inativo e reativado.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogador/PeriodosJogador.tsx`
**Depends on**: T64
**Reuses**: `R-19`, `R-20`, `R-24`, `R-25` e `R-26` (`t16-jogador--inativar`, `--inativo`, `--reativado`, `--reativar-erro`, `--reativar`); `Dialogo` (`CA:1286`)
**Requirement**: GEL-59, GEL-60, GEL-114

**Done when**:

- [ ] Teste `GEL-59`: o diálogo mostra o texto exato da spec com Cancelar e Inativar
- [ ] Teste `GEL-60`: reativar mostra "Beto reativado desde 22/10/2026."
- [ ] Teste `GEL-114`: axe sem violação com o diálogo aberto
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T66: Ficha do jogador: corrigir datas e data de início

**What**: Acrescentar a correção de saída e retorno de um período e a alteração da data de início, com os erros de período e as mensagens "Datas corrigidas." e de início alterado.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogador/CorrigirDatas.tsx`
**Depends on**: T65
**Reuses**: `R-12`, `R-13`, `R-14`, `R-21` e `R-22` (`t16-jogador--corrigido`, `--corrigir-erro`, `--corrigir`, `--inicio-erro`, `--inicio`); dados de T54
**Requirement**: GEL-76, GEL-77, GEL-114

**Done when**:

- [ ] Teste `GEL-76`: correção 200 mostra "Datas corrigidas."
- [ ] Teste `GEL-77`: alterar o início chama `PUT …/inicio` e mostra a data nova
- [ ] Teste `GEL-114`: 422 de período mostra a mensagem no campo; axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T67: Ficha do jogador: excluir

**What**: Acrescentar a exclusão com o diálogo "Excluir <apelido>?" e o texto da spec, e a recusa com a mensagem e o botão "Inativar em vez disso".
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/jogador/ExcluirJogador.tsx`
**Depends on**: T66
**Reuses**: `R-17` e `R-18` (`t16-jogador--excluir`, `--exclusao-recusada`); `Dialogo` (`CA:1286`)
**Requirement**: GEL-86, GEL-87, GEL-114

**Done when**:

- [ ] Teste `GEL-87`: o diálogo mostra o título e o texto exatos
- [ ] Teste `GEL-86`: 409 mostra a mensagem e "Inativar em vez disso", que abre o diálogo de inativar
- [ ] Teste `GEL-114`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T68: Tela Habilidades (t17)

**What**: Escrever `/app/grupos/:grupoId/habilidades`: lista na ordem, adicionar, renomear e excluir com confirmação, e os estados vazio e erro.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/habilidades/Habilidades.tsx`
**Depends on**: T67
**Reuses**: `.specs/mockup/telas/t17-habilidades--*.html` (4 estados, `telas.json:198-201`); dados de T55
**Requirement**: GEL-94, GEL-95, GEL-114

**Done when**:

- [ ] Teste `GEL-94`: o diálogo de exclusão mostra o título e o texto com o nome entre aspas curvas
- [ ] Teste `GEL-95`: sem habilidades, "Nenhuma habilidade" e "O simulador vai usar nível 5,5 para todos."
- [ ] Teste `GEL-114`: nome repetido mostra o erro do campo; axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 22: Rotas, admins, comparação visual e posição

### T69: Rotas do app de grupos e elenco

**What**: Estender o roteador com `/app/grupos/novo`, `/app/grupos/:grupoId`, `/app/grupos/:grupoId/dados`, `/app/grupos/:grupoId/jogadores`, `/app/grupos/:grupoId/jogadores/novo`, `/app/grupos/:grupoId/jogadores/:jogadorId` e `/app/grupos/:grupoId/habilidades`, todas sob a guarda; 404 da API mostra o não encontrado.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T68
**Reuses**: estender `rotas.tsx` da CA (`CA:1309`, T42); rotas de `GD:202` e do `telas.json:188-227`
**Requirement**: GEL-114

**Done when**:

- [ ] Teste `GEL-114`: cada rota renderiza a sua tela e passa pela guarda
- [ ] Teste: grupo inexistente mostra o estado de não encontrado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T70: Tela de admins sem remover a criadora

**What**: Estender a tela de admins: a linha da criadora não tem "Remover"; 409 `criadora_nao_removivel` mostra a mensagem sem quebrar a tela.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/admins/Admins.tsx`
**Depends on**: T69
**Reuses**: estender a tela da CA (`CA:1582`, T53); decisão de `GSEG:157`
**Requirement**: SEC-001

**Done when**:

- [ ] Teste `SEC-001`: a linha da criadora não tem botão de remover; as outras têm
- [ ] Teste `SEC-001`: 409 mostra a mensagem em português
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T71: Comparação visual das telas do módulo

**What**: Ativar na comparação as entradas T08 (inclusive a `sucesso` e a `vazio`, `telas.json:164-165`, que saem da T56 da CA pela AD-031 proposta), T15, T16, T17, T20 e T27 do `telas.json` (sem as de T09, AD-029 proposta) e ajustar CSS e componentes até ficarem em até 1% nos dois viewports; os estados de `revisaoManual` do módulo são conferidos à mão e listados aqui.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/telas-ativas.json`
**Depends on**: T70
**Reuses**: runner da CA (`CA:1609`, T54) e a lista de telas ativas (`CA:1657`, T56); entradas de `telas.json:164-165` e `:188-227`; mockup copiado em T52
**Requirement**: GEL-115, GEL-116

**Done when**:

- [ ] Teste `GEL-116`: cada estado ativo × 2 viewports em até 1%, com as T08 `sucesso` e `vazio` (AD-031 proposta)
- [ ] Teste `GEL-115`: o Stylelint de tokens passa nas telas novas
- [ ] Um componente deformado de propósito faz a comparação falhar (conferido uma vez e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T72: Mensagem de erro ao lado do campo

**What**: Escrever o teste Playwright que, com a resposta 422 de `respostas/erro-validacao-novo-grupo.json` e `respostas/elenco-erro-novo-jogador.json`, confere por `boundingBox` que cada mensagem fica junto do seu campo (logo abaixo, alinhada à esquerda do campo, antes do campo seguinte) e que o resumo "Corrija N campos" fica acima do formulário, em PC e celular.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/erros-campo.spec.ts`
**Depends on**: T71
**Reuses**: Playwright da fundação (`F:1691`); interceptação de respostas do runner da CA (`CA:1609`); `.specs/mockup/respostas/erro-validacao-novo-grupo.json` e `elenco-erro-novo-jogador.json`
**Requirement**: GEL-118

**Done when**:

- [ ] Teste `GEL-118`: para cada campo com erro, o topo da mensagem está entre a base do campo e o topo do campo seguinte, e a esquerda difere da do campo em até 4 px
- [ ] Teste `GEL-118`: o resumo fica acima do primeiro campo
- [ ] Vermelho: com a mensagem movida para o fim do formulário, o teste falha (conferido uma vez e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 23: Seed, jornadas e documentação

### T73: Seed com grupo, elenco e notas

**What**: Estender o seed para criar o grupo de exemplo pela `grupo_criar` (com a conta do seed no contexto) e jogadores com períodos e notas, incluindo um inativo, para a lista, a ficha e as jornadas.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `backend/scripts/src/seed.ts`
**Depends on**: T72
**Reuses**: estender o seed da CA (`CA:1143`, T35) e o da fundação (`F:1055`); decisão de `GD:211`
**Requirement**: GEL-01, GEL-46

**Done when**:

- [ ] Teste `GEL-01`: depois do seed, o grupo tem 6 habilidades, vínculo com financeiro e `grupo_criado`
- [ ] Teste `GEL-46`: há ao menos um jogador ativo com notas e um inativo
- [ ] Os testes de FUN-05 e ACE-64 continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T74: Jornadas de grupos e elenco ponta a ponta

**What**: Escrever os testes Playwright das jornadas J-11 a J-14 (`.specs/projeto/jornadas.md`) contra o `wrangler dev`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/elenco.spec.ts`
**Depends on**: T73
**Reuses**: jornadas da CA (`CA:1683`, T57) e a caixa de dev (`CA:697`, T17) para o convite da J-14; `pnpm dev` (`F:1812`)
**Requirement**: GEL-01, GEL-22, GEL-28, GEL-31, GEL-51, GEL-54, GEL-97

**Done when**:

- [ ] Teste J-11: conta nova cria o grupo e cadastra o primeiro jogador
- [ ] Teste J-12: inativar, reativar e corrigir a saída de um jogador
- [ ] Teste J-13: notas nas 6 habilidades mostram "Nível 6,8"; excluir uma habilidade recalcula
- [ ] Teste J-14: a convidada recebe recusa ao arquivar; a criadora arquiva e reativa; a convidada deixa de ver e volta a ver o grupo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T75: Documentação de grupos e elenco

**What**: Atualizar o README (criar grupo local, seed com elenco) e o `docs/runbook.md` (`LIMITE_ESCRITA`: valor, onde muda e efeito no lançamento de notas em lote; grupo arquivado sem dono quando a criadora sai, tratado pelo suporte).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docs/runbook.md`
**Depends on**: T74
**Reuses**: runbook e README da CA (`CA:1708`, T58); `GSEG:159`; caso de `GS:49`
**Requirement**: SEC-003

**Done when**:

- [ ] O runbook descreve o `LIMITE_ESCRITA` e o caso do grupo sem criadora, sem segredo
- [ ] O README explica entrar local e ver o grupo e o elenco do seed
- [ ] Gate completo da feature (lint, format, checagens e a suíte inteira do `testes.json`) verde antes do `/validar`

**Tests**: none
**Gate**: build
