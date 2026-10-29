# Grupos e elenco — Especificação

> Feature 3 de 8 (AD-001). **Spec aprovada pelo usuário em 2026-10-29.** Entrada: `.specs/produto/decisao.md` (entrada do MVP), `.specs/produto/analise-legado.md`
> (§2 e §8, D1, D2 e D6), `.md/PRD.md` (RA-01, RA-03, RA-07, RA-16), `.md/PRD-TECNICO.md` (RF-19 a RF-22, RF-35 a
> RF-37, RF-75 a RF-82), `.md/GUARDRAILS.md` (G-03, G-04, G-25, G-26, G-27), ADR-016 e ADR-023. Regras de domínio
> portadas do legado (`C:\Leandro\Projetos\GestaoDaPelada`, `backend/dominio/src/{grupos,elenco,atividade}`).
> Decisões das áreas cinzentas em `context.md` (C1 a C10).

## Problem Statement

Depois da `conta-e-acesso`, qualquer pessoa cria conta e entra, mas cai numa lista de grupos vazia: não há como criar
um grupo nem cadastrar jogadores. O legado só deixava o dono da plataforma criar grupos, e a D1 abriu isso a qualquer
organizador. Sem grupo e sem elenco, nenhuma das features seguintes (partidas, ranking, simulador, financeiro) tem
sobre o que trabalhar. Esta feature entrega o grupo e o elenco com as regras de período do legado, que já foram
corrigidas em produção e precisam ser preservadas.

## Goals

- [ ] Uma conta recém-criada cria o próprio grupo e cadastra o primeiro jogador em menos de 2 minutos, no celular.
- [ ] O admin mantém o elenco (cadastro, inativação, retorno, correção de datas, exclusão) com as mesmas regras e mensagens do legado.
- [ ] O admin mantém as habilidades do grupo e as notas de cada jogador, e vê o nível calculado como no legado.
- [ ] Nenhum dado de um grupo é lido ou alterado a partir de outro grupo, e o teste de isolamento prova isso para todas as rotas e tabelas novas.
- [ ] Toda escrita de período de atividade é feita em transação, com o jogador travado, e fica auditada (G-26).

## Out of Scope

| Feature | Reason |
| ----------- | -------------- |
| Pesos de pontuação com vigência (tela t18) | Feature `partidas-e-ranking`, onde têm efeito (C6). O grupo nasce sem configuração de pesos aqui |
| Prévias com acumulado, posição no ranking e rodadas que passam a constar; aviso "vale 0 ponto até lançar a presença" | Feature `partidas-e-ranking`, com a função única de acumulado (G-25, C7) |
| Ranking público `/g/:slug` e a página "Grupo indisponível" | Feature `partidas-e-ranking`. Aqui o link é só mostrado e copiado |
| Partidas, presenças, escalações, simulador e financeiro | Features seguintes. A tabela `presencas` é só lida, para validar períodos e a exclusão |
| Limites do plano Free (1 grupo, 20 jogadores), trial e situação comercial | Feature `planos-e-cobranca` (C2). `situacao_comercial` continua no valor padrão do banco |
| Área do dono da plataforma (telas t27 e t28 na versão do dono) | D1: o dono é só suporte. Criar e arquivar passam para a conta que cria o grupo |
| Reordenar habilidades | Não existe no legado; a ordem é a de cadastro |
| Transferir a criação do grupo para outra conta | Não existe no legado nem nas decisões. Fica para depois do MVP |
| Apagar grupo de vez | Só arquivar (RA-16). A exclusão definitiva é assunto de LGPD, fora do MVP |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Quem cria grupo | Qualquer conta com sessão; quem cria vira admin com `acessa_financeiro` verdadeiro | D1 e C1 | y |
| Limites do Free | Nenhum limite nesta feature | C2 | y |
| Arquivar e reativar | Só a conta em `grupos.criado_por`, e só se ainda for admin do grupo | C3, C4 | y |
| Visibilidade do grupo arquivado | Some para os outros admins (404); o criador o vê em "Arquivados", só com Reativar | C5 | y |
| Criador que deixou de ser admin | Se o criador foi removido do grupo ou excluiu a conta, ninguém arquiva nem reativa aquele grupo pelo app; o caso fica com o suporte | Não há regra de transferência (fora de escopo); o caso é raro e não perde dados | y |
| Pesos de pontuação | Fora (C6). O grupo não ganha `config_pesos` na criação; a `partidas-e-ranking` cria os pesos padrão dos grupos que não tiverem | Evita gravar configuração que nenhuma tela desta feature mostra | y |
| Prévias e acumulado | Fora (C7) | Dependem do ranking | y |
| Histórico que impede a exclusão | Presença em partida, nota ou pagamento mensal; o texto da tela diz "partidas, notas nem pagamentos" | C8; é o que as FKs sem cascade já exigem | y |
| Auditoria de inativar | Auditada como `jogador_inativado` | C9, G-26 | y |
| Posições | Goleiro, Zagueiro, Lateral, Volante, Meia, Atacante, Centroavante (valores `goleiro`, `zagueiro`, `lateral`, `volante`, `meia`, `atacante`, `centroavante`) | C10; é o CHECK da linha de base | y |
| "Hoje" | A data de hoje no fuso `America/Sao_Paulo` (ADR-012), vinda do relógio injetado na aplicação, nunca do domínio | Regra do repositório: `backend/dominio` sem relógio | y |
| Limite de habilidades por grupo | Nenhum | O legado não tem; a tela é uma lista curta | y |
| Ano de nascimento | Obrigatório no cadastro novo, de 1940 a (ano de hoje − 10) | Legado; a coluna aceita nulo só por causa de dados antigos | y |
| Jogador inativo e notas | Jogador inativo continua recebendo e alterando notas | Legado | y |
| Telas | Seguem o mockup do legado (`.specs/mockup/telas/`), com as mudanças desta feature (criar grupo e arquivar fora da área do dono, sem "Primeiro admin", texto da exclusão) desenhadas no mockup do módulo na fase 7 | Regra do repositório: telas seguem `.specs/mockup/` | y |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

Convenções que valem para todas as histórias:

- "Admin" é uma conta com vínculo em `vinculos_admin` com o grupo. Toda rota de dado de grupo fica sob `/api/grupos/:grupoId/...` e responde 404 sem revelar existência quando não há vínculo (G-03).
- Erro de validação responde 422 com a mensagem "Corrija os campos indicados." e o objeto `campos` com a mensagem de cada campo inválido; nada é gravado.
- Corpo com campo desconhecido é recusado com 422.

### P1: Criar grupo ⭐ MVP

**User Story**: Como organizador, quero criar o meu grupo com nome, dia, frequência e horário, para começar a usar o app sem depender de ninguém.

**Why P1**: Sem grupo, a conta nova não tem o que fazer (D1).

**Acceptance Criteria**:

1. WHEN uma conta com sessão envia `POST /api/grupos` com nome, dia da semana, frequência e horário válidos THEN o sistema SHALL criar o grupo, criar o vínculo de admin da conta com `acessa_financeiro` verdadeiro, gravar `criado_por` com a conta, criar as 6 habilidades iniciais e responder 201 com o id, o slug e o link público do grupo. [GEL-01]
2. The sistema SHALL criar as habilidades iniciais nesta ordem: Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme. [GEL-02]
3. IF o nome, depois de tirar os espaços das pontas, tem menos de 3 ou mais de 60 caracteres THEN o sistema SHALL responder 422 com "O nome precisa ter de 3 a 60 caracteres." no campo `nome`. [GEL-03]
4. IF o dia da semana não é um de `domingo`, `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado` THEN o sistema SHALL responder 422 com erro no campo `diaSemana`. [GEL-04]
5. IF a frequência não é uma de `semanal`, `quinzenal`, `mensal` THEN o sistema SHALL responder 422 com erro no campo `frequencia`. [GEL-05]
6. IF o horário está ausente ou fora do formato `HH:MM` entre 00:00 e 23:59 THEN o sistema SHALL responder 422 no campo `horario`, com "Informe o horário." quando ausente e "Horário inválido." quando fora do formato. [GEL-06]
7. IF o corpo traz `slug` ou `urlPublica` THEN o sistema SHALL responder 422 e não criar o grupo. [GEL-07]
8. IF a requisição chega sem sessão válida THEN o sistema SHALL responder 401 e não criar o grupo. [GEL-08]
9. IF qualquer passo da criação falha THEN o sistema SHALL desfazer todos (grupo, vínculo e habilidades), sem deixar grupo parcial. [GEL-09]
10. WHEN o grupo é criado THEN o sistema SHALL gravar na auditoria o evento `grupo_criado` com a conta como autora. [GEL-10]

**Independent Test**: com uma conta sem grupos, criar um grupo pela tela; ele aparece em "Seus grupos", o início mostra "6 habilidades" e "1 admin".

---

### P1: Slug do grupo ⭐ MVP

**User Story**: Como organizador, quero um link legível e estável para o ranking do meu grupo, para divulgar no WhatsApp sem medo de quebrar.

**Why P1**: O link é criado junto com o grupo e nunca muda (ADR-016); errar aqui quebra o ranking público depois.

**Acceptance Criteria**:

1. The sistema SHALL gerar a base do slug a partir do nome: decompor os acentos e removê-los, passar para minúsculas, trocar cada sequência de caracteres fora de `a-z` e `0-9` por um hífen, tirar hífens das pontas e cortar em 40 caracteres sem hífen final (ex.: "Pelada de Quinta" → `pelada-de-quinta`). [GEL-11]
2. IF a base tem menos de 3 caracteres THEN o sistema SHALL usar `grupo` como base (ex.: "AB" → `grupo`). [GEL-12]
3. IF a base é uma palavra reservada (`admin`, `api`, `dono`, `entrar`, `g`, `privacidade`, `conta`, `assets`, `well-known`) THEN o sistema SHALL usar `<base>-grupo` (ex.: "Admin" → `admin-grupo`). [GEL-13]
4. IF a base já é slug de outro grupo, arquivado ou não THEN o sistema SHALL acrescentar `-2`, `-3` e assim por diante, usando o primeiro sufixo livre. [GEL-14]
5. WHEN duas criações concorrentes disputam o mesmo slug THEN o sistema SHALL repetir a criação com o próximo sufixo livre, até 3 tentativas, e as duas terminam com slugs diferentes. [GEL-15]
6. The sistema SHALL manter o slug imutável: nenhuma rota o altera, e mudar o nome não muda o slug. [GEL-16]
7. The sistema SHALL montar o link público como `<URL_PUBLICA>/g/<slug>`, sem endereço fixo no código. [GEL-17]

**Independent Test**: criar "Pelada de Quinta" duas vezes; os slugs são `pelada-de-quinta` e `pelada-de-quinta-2`. Renomear o primeiro não muda o link.

---

### P1: Editar os dados do grupo ⭐ MVP

**User Story**: Como admin, quero mudar nome, dia, frequência e horário do grupo e copiar o link do ranking, para manter o grupo em dia.

**Why P1**: Os dados mudam com o tempo; a tela t20 já existe no legado.

**Acceptance Criteria**:

1. WHEN um admin envia `PATCH /api/grupos/:grupoId` com nome, dia da semana, frequência e horário válidos THEN o sistema SHALL gravar os novos valores e responder 200 com os dados do grupo, incluindo slug e link público. [GEL-18]
2. IF algum campo é inválido THEN o sistema SHALL responder 422 com as mesmas mensagens da criação (GEL-03 a GEL-07). [GEL-19]
3. WHEN um admin abre `GET /api/grupos/:grupoId` THEN o sistema SHALL responder com nome, slug, link público, dia da semana, frequência, horário, número de jogadores ativos, número de habilidades, número de admins e se a conta da sessão é a criadora. [GEL-20]
4. IF a conta não tem vínculo com o grupo THEN o sistema SHALL responder 404 nas rotas de leitura e de edição do grupo. [GEL-21]

**Independent Test**: mudar o horário pela tela de dados do grupo, ver "Dados salvos" e o novo horário no início do grupo; o link copiado continua o mesmo.

---

### P1: Arquivar e reativar o grupo ⭐ MVP

**User Story**: Como quem criou o grupo, quero arquivá-lo quando a pelada acabar e reativá-lo se ela voltar, sem perder dados.

**Why P1**: RA-16; com criação aberta, quem cria precisa poder encerrar.

**Acceptance Criteria**:

1. WHEN a conta criadora, ainda admin do grupo, envia `POST /api/grupos/:grupoId/arquivar` com `nomeConfirmacao` igual ao nome atual do grupo (comparação exata, com caixa e espaços) THEN o sistema SHALL gravar `arquivado_em`, registrar `grupo_arquivado` na auditoria e responder 200. [GEL-22]
2. IF `nomeConfirmacao` difere do nome do grupo THEN o sistema SHALL responder 422 com "O nome digitado não confere com o nome do grupo." no campo `nomeConfirmacao` e não arquivar. [GEL-23]
3. IF quem pede para arquivar ou reativar é admin do grupo mas não é a conta criadora THEN o sistema SHALL responder 403 com o código `so_quem_criou` e não alterar o grupo. [GEL-24]
4. WHILE o grupo está arquivado o sistema SHALL responder 404 a toda rota do grupo para qualquer admin que não seja a conta criadora, e não listar o grupo para essas contas. [GEL-25]
5. WHILE o grupo está arquivado o sistema SHALL recusar, também para a conta criadora, toda rota de escrita do grupo que não seja reativar, com 409 e o código `grupo_arquivado`. [GEL-26]
6. WHEN a conta criadora lista os seus grupos THEN o sistema SHALL mostrar os grupos arquivados que ela criou numa seção "Arquivados", separados dos ativos, cada um com a ação Reativar. [GEL-27]
7. WHEN a conta criadora envia `POST /api/grupos/:grupoId/reativar` para um grupo arquivado THEN o sistema SHALL apagar `arquivado_em`, registrar `grupo_reativado` na auditoria e responder 200; vínculos, jogadores, habilidades, notas e slug continuam como estavam. [GEL-28]
8. IF o grupo já está no estado pedido (arquivar um arquivado ou reativar um ativo) THEN o sistema SHALL responder 200 sem alterar nada e sem registrar auditoria. [GEL-29]
9. The sistema SHALL tratar o arquivamento só como marca: nenhum dado do grupo é apagado ao arquivar. [GEL-30]

**Independent Test**: com duas contas admin do mesmo grupo, a que não criou recebe 403 ao arquivar; a criadora arquiva digitando o nome; a outra deixa de ver o grupo; a criadora reativa em "Arquivados" e a outra volta a vê-lo.

---

### P1: Cadastrar e editar jogador ⭐ MVP

**User Story**: Como admin, quero cadastrar os jogadores do grupo com apelido, ano, posição, telefone, pontuação inicial e data de entrada, para montar o elenco.

**Why P1**: RA-03; base do ranking, do simulador e do financeiro.

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/jogadores` com apelido, ano de nascimento e posição válidos THEN o sistema SHALL criar o jogador, abrir o primeiro período de atividade na data de entrada, gravar `inicio_pontuacao` com essa data e responder 201 com o jogador criado. [GEL-31]
2. IF a data de entrada não é enviada THEN o sistema SHALL usar a data de hoje. [GEL-32]
3. IF a data de entrada é posterior a hoje THEN o sistema SHALL responder 422 com "A data não pode ser no futuro." no campo `dataEntrada`. [GEL-33]
4. IF o apelido, sem os espaços das pontas, tem menos de 2 ou mais de 30 caracteres THEN o sistema SHALL responder 422 com "O apelido precisa ter de 2 a 30 caracteres." no campo `apelido`. [GEL-34]
5. IF já existe no grupo um jogador com o mesmo apelido, ignorando a caixa (acentos contam: "José" e "Jose" são diferentes) THEN o sistema SHALL responder 422 com "Já existe um jogador com esse apelido neste grupo." no campo `apelido`. [GEL-35]
6. IF o ano de nascimento falta, não é inteiro ou está fora de 1940 a (ano de hoje − 10) THEN o sistema SHALL responder 422 com "O ano precisa estar entre 1940 e <ano de hoje − 10>." no campo `anoNascimento` (em 2026: "entre 1940 e 2016"). [GEL-36]
7. IF a posição não é uma de `goleiro`, `zagueiro`, `lateral`, `volante`, `meia`, `atacante`, `centroavante` THEN o sistema SHALL responder 422 com erro no campo `posicao`. [GEL-37]
8. WHEN o telefone chega vazio ou nulo THEN o sistema SHALL gravar o jogador sem telefone. [GEL-38]
9. IF o telefone, sem os caracteres de máscara, não tem 11 dígitos no formato DDD de 2 dígitos sem zero seguido de 9 e mais 8 dígitos THEN o sistema SHALL responder 422 com "Informe o telefone como (DD) 9XXXX-XXXX." no campo `telefone`; o válido é gravado só com os 11 dígitos. [GEL-39]
10. IF a pontuação inicial não é um inteiro de 0 a 9999 THEN o sistema SHALL responder 422 com "Informe um número inteiro de 0 a 9999." no campo `pontuacaoInicial`; se não for enviada no cadastro, SHALL gravar 0. [GEL-40]
11. WHEN um admin envia `PATCH /api/grupos/:grupoId/jogadores/:id` com apelido, ano, posição, telefone e pontuação inicial válidos THEN o sistema SHALL gravar os novos valores e responder 200, aplicando as mesmas validações do cadastro e ignorando a data de entrada. [GEL-41]
12. WHEN a edição muda a pontuação inicial THEN o sistema SHALL registrar `jogador_pontuacao_inicial_alterada` na auditoria com o valor anterior e o novo. [GEL-42]
13. IF a pontuação inicial é omitida na edição THEN o sistema SHALL manter o valor atual. [GEL-43]
14. IF o jogador não existe no grupo da rota THEN o sistema SHALL responder 404. [GEL-44]
15. WHEN o jogador é criado ou excluído THEN o sistema SHALL registrar `jogador_criado` ou `jogador_excluido` na auditoria. [GEL-45]

**Independent Test**: cadastrar "Toninho" sem data de entrada; ele aparece em Ativos com "Ativo desde <hoje>". Tentar cadastrar "toninho" de novo mostra o erro de apelido repetido.

---

### P1: Lista de jogadores ⭐ MVP

**User Story**: Como admin, quero ver os jogadores ativos e inativos com posição e nível, e buscar pelo apelido, para achar alguém rápido.

**Why P1**: É a porta de entrada do elenco (t15).

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/jogadores` THEN o sistema SHALL responder com todos os jogadores do grupo, cada um com id, apelido, posição, situação (ativo ou inativo), data desde quando está na situação atual, nível e a marca `semNota`. [GEL-46]
2. The tela de jogadores SHALL separar Ativos e Inativos com a contagem de cada um e ordenar cada lista pelo apelido, sem acento e sem caixa. [GEL-47]
3. WHEN o admin digita na busca THEN a tela SHALL mostrar só os jogadores cujo apelido contém o texto digitado, sem diferenciar acento nem caixa. [GEL-48]
4. WHEN a lista de ativos está vazia THEN a tela SHALL mostrar o estado vazio do mockup com a ação "Novo jogador"; WHEN a de inativos está vazia THEN SHALL mostrar "Nenhum jogador inativo.". [GEL-49]
5. The sistema SHALL considerar ativo o jogador com período de atividade aberto (sem data de saída) e inativo o jogador sem período aberto. [GEL-50]

**Independent Test**: com 3 jogadores, sendo 1 inativo, a tela mostra "Ativos (2) Inativos (1)"; buscar "jose" acha "José".

---

### P1: Inativar e reativar jogador ⭐ MVP

**User Story**: Como admin, quero marcar a saída de um jogador e o retorno dele depois, sem perder o histórico.

**Why P1**: RA-03 e RF-75 a RF-82; o legado nunca exclui quem tem histórico.

**Acceptance Criteria**:

1. WHEN um admin envia `POST /api/grupos/:grupoId/jogadores/:id/inativar` para um jogador ativo, com data de saída válida THEN o sistema SHALL encerrar o período aberto nessa data, registrar `jogador_inativado` na auditoria e responder 200. [GEL-51]
2. IF a data de saída não é enviada THEN o sistema SHALL usar a data de hoje. [GEL-52]
3. IF o jogador já está inativo THEN o sistema SHALL responder 409 com "O jogador já está inativo." e não alterar nada. [GEL-53]
4. WHEN um admin envia `POST /api/grupos/:grupoId/jogadores/:id/reativar` para um jogador inativo, com data de retorno válida THEN o sistema SHALL abrir um novo período a partir dessa data, sem mudar a data de início da pontuação nem a pontuação inicial, e responder 200. [GEL-54]
5. IF a data de retorno não é enviada THEN o sistema SHALL usar a data de hoje. [GEL-55]
6. IF o jogador já está ativo THEN o sistema SHALL responder 409 com "O jogador já está ativo." e não alterar nada. [GEL-56]
7. WHEN a reativação é feita THEN o sistema SHALL registrar `jogador_reativado` na auditoria com a data de retorno e a data da saída anterior. [GEL-57]
8. The sistema SHALL validar a data de saída e a de retorno pelas regras de período (GEL-61 a GEL-69) antes de gravar. [GEL-58]
9. WHEN a inativação é confirmada na tela THEN a tela SHALL mostrar antes o aviso "Ele sai do ranking, do lançamento, do simulador e do financeiro a partir da data de saída. O histórico e os pontos ficam guardados." com Cancelar e Inativar. [GEL-59]
10. WHEN a reativação termina THEN a tela SHALL mostrar "<apelido> reativado desde <dd/mm/aaaa>.". [GEL-60]

**Independent Test**: inativar Beto hoje; ele vai para Inativos. Reativar com a data de hoje; ele volta a Ativos e os períodos mostram dois intervalos.

---

### P1: Regras dos períodos de atividade ⭐ MVP

**User Story**: Como admin, quero que o app recuse datas que bagunçariam o histórico do jogador, com uma mensagem que diga o que fazer.

**Why P1**: São as regras (a) a (h) do legado, corrigidas em produção; qualquer erro aqui muda o ranking.

**Acceptance Criteria**:

1. The sistema SHALL tratar cada período como o intervalo [início, fim), de modo que sair e voltar no mesmo dia não gera sobreposição. [GEL-61]
2. The sistema SHALL avaliar as regras nesta ordem e devolver só a primeira falha: data válida, campo corrigível, data não futura, e depois as regras de ordem, sobreposição, presença e início da pontuação. [GEL-62]
3. IF uma data não é uma data real no formato AAAA-MM-DD THEN o sistema SHALL responder 422 com "Informe uma data válida.". [GEL-63]
4. IF uma data é posterior a hoje THEN o sistema SHALL responder 422 com "A data não pode ser no futuro.". [GEL-64]
5. IF a saída fica antes do início do próprio período THEN o sistema SHALL responder 422 com "A saída não pode ser antes do início deste período (<dd/mm/aaaa>).". [GEL-65]
6. IF um retorno fica antes da saída do período anterior THEN o sistema SHALL responder 422 com "O retorno não pode ser antes da saída anterior (<dd/mm/aaaa>)."; IF uma saída fica depois do retorno seguinte THEN SHALL responder 422 com "A saída não pode ser depois do próximo retorno (<dd/mm/aaaa>)."; IF um retorno fica depois da saída do próprio período THEN SHALL responder 422 com "O retorno não pode ser depois da saída deste período (<dd/mm/aaaa>).". [GEL-66]
7. IF o resultado deixaria dois períodos sobrepostos THEN o sistema SHALL responder 422 com "Os períodos não podem se sobrepor.". [GEL-67]
8. IF a mudança tiraria de dentro de um período uma presença do jogador (situação presente, lesionado ou expulso) que estava dentro antes THEN o sistema SHALL responder 422 com "Há presença do jogador em <dd/mm/aaaa>. A saída precisa ser em <dd/mm/aaaa> ou depois. Para usar uma data anterior, remova a presença em Editar partida.", em que a data mínima é o dia seguinte à última presença retirada (para retorno, a data máxima é o dia da primeira presença retirada, com o texto correspondente). Presença que já estava fora de período não bloqueia. [GEL-68]
9. IF a saída do primeiro período fica antes da data de início da pontuação THEN o sistema SHALL responder 422 com "A saída do primeiro período não pode ser antes da data de início da pontuação (<dd/mm/aaaa>). Para ir antes, altere primeiro a data de início.". [GEL-69]
10. The sistema SHALL implementar essas regras em funções puras de `@pelada/dominio`, sem relógio nem I/O, recebendo a data de hoje como parâmetro. [GEL-70]

**Independent Test**: testes de domínio com um caso por regra e mensagem; na API, um jogador com presença em 01/10 recusa saída em 30/09 com a data mínima 02/10.

---

### P1: Corrigir datas de períodos ⭐ MVP

**User Story**: Como admin, quero corrigir a data de saída ou de retorno lançada errada, sem precisar excluir e recadastrar o jogador.

**Why P1**: RF-21A; correção comum quando alguém lança a saída no dia errado.

**Acceptance Criteria**:

1. WHEN um admin envia `PATCH /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId` com nova saída (de período encerrado) e/ou novo retorno (de período que não é o primeiro) válidos THEN o sistema SHALL gravar as novas datas, registrar `jogador_periodo_corrigido` na auditoria com as datas antes e depois e responder 200. [GEL-71]
2. IF pede para corrigir a saída de um período aberto THEN o sistema SHALL responder 422 com "Este período não tem data de saída.". [GEL-72]
3. IF pede para corrigir o início do primeiro período THEN o sistema SHALL responder 422 com "O início do primeiro período é a data de início da pontuação; use Alterar data de início.". [GEL-73]
4. IF as datas enviadas são iguais às atuais THEN o sistema SHALL responder 200 com `alterado: false` e "Nada a alterar.", sem gravar nem auditar. [GEL-74]
5. IF o período não existe para aquele jogador do grupo THEN o sistema SHALL responder 404. [GEL-75]
6. WHEN a correção termina THEN a tela SHALL mostrar "Datas corrigidas.". [GEL-76]

**Independent Test**: um jogador que saiu em 05/10 e voltou em 12/10 tem a saída corrigida para 03/10; a lista de períodos mostra 03/10 e a auditoria tem as datas antes e depois.

---

### P1: Alterar a data de início da pontuação ⭐ MVP

**User Story**: Como admin, quero mudar a data a partir da qual a pontuação do jogador conta, para acertar quem entrou antes ou depois do que foi lançado.

**Why P1**: ADR-023 e G-25; é o único jeito de mexer na entrada do primeiro período.

**Acceptance Criteria**:

1. WHEN um admin envia `PUT /api/grupos/:grupoId/jogadores/:id/inicio` com data válida THEN o sistema SHALL gravar `inicio_pontuacao`, registrar `jogador_inicio_alterado` na auditoria com a data anterior e a nova e responder 200. [GEL-77]
2. IF a data é anterior a 01/01/2000 THEN o sistema SHALL responder 422 com "A data de início não pode ser anterior a 01/01/2000.". [GEL-78]
3. IF a data é posterior a hoje THEN o sistema SHALL responder 422 com "A data não pode ser no futuro.". [GEL-79]
4. IF a data fica depois da saída do primeiro período THEN o sistema SHALL responder 422 com "A data de início não pode ficar depois da saída do primeiro período (<dd/mm/aaaa>). Corrija antes a data de saída do primeiro período.". [GEL-80]
5. WHEN a nova data é anterior ao início do primeiro período THEN o sistema SHALL mover o início do primeiro período para essa data, sem mudar os períodos encerrados. [GEL-81]
6. IF a data é igual à atual THEN o sistema SHALL responder 200 sem gravar nem auditar. [GEL-82]
7. The sistema SHALL ter como únicos escritores de `inicio_pontuacao` a criação do jogador e esta rota (G-25). [GEL-83]

**Independent Test**: recuar a data de início de Toninho de 05/02 para 01/02; o primeiro período passa a começar em 01/02 e a auditoria registra a troca.

---

### P1: Excluir jogador ⭐ MVP

**User Story**: Como admin, quero excluir um jogador cadastrado por engano, desde que ele não tenha histórico.

**Why P1**: Cadastro errado é comum; com histórico, a saída é inativar.

**Acceptance Criteria**:

1. WHEN um admin envia `DELETE /api/grupos/:grupoId/jogadores/:id` para um jogador sem presença, sem nota e sem pagamento mensal THEN o sistema SHALL apagar o jogador e os seus períodos, registrar `jogador_excluido` na auditoria e responder 204. [GEL-84]
2. IF o jogador tem presença, nota ou pagamento mensal THEN o sistema SHALL responder 409 com o código `jogador_com_historico`, a mensagem "<apelido> tem histórico de partidas e não pode ser excluído." e a sugestão `inativar`, sem apagar nada. [GEL-85]
3. WHEN a exclusão é recusada THEN a tela SHALL mostrar a mensagem e o botão "Inativar em vez disso". [GEL-86]
4. WHEN o admin pede para excluir THEN a tela SHALL confirmar com "Excluir <apelido>?" e "O cadastro é apagado. Só é possível excluir quem não tem partidas, notas nem pagamentos.". [GEL-87]

**Independent Test**: excluir um jogador recém-criado funciona; dar uma nota a outro e tentar excluí-lo mostra a recusa com "Inativar em vez disso".

---

### P1: Habilidades do grupo ⭐ MVP

**User Story**: Como admin, quero manter a lista de habilidades em que dou notas aos jogadores, para o simulador equilibrar os times depois.

**Why P1**: RA-07; o simulador depende delas.

**Acceptance Criteria**:

1. WHEN um admin abre `GET /api/grupos/:grupoId/habilidades` THEN o sistema SHALL responder com as habilidades do grupo na ordem de cadastro. [GEL-88]
2. WHEN um admin envia `POST /api/grupos/:grupoId/habilidades` com nome válido THEN o sistema SHALL criar a habilidade no fim da ordem e responder 201. [GEL-89]
3. IF o nome, sem os espaços das pontas, tem menos de 2 ou mais de 30 caracteres THEN o sistema SHALL responder 422 com "O nome precisa ter de 2 a 30 caracteres." no campo `nome`. [GEL-90]
4. IF já existe no grupo uma habilidade com o mesmo nome, ignorando a caixa THEN o sistema SHALL responder 422 com "Já existe uma habilidade com esse nome." no campo `nome`. [GEL-91]
5. WHEN um admin envia `PATCH /api/grupos/:grupoId/habilidades/:id` com nome válido THEN o sistema SHALL renomear a habilidade, manter as notas e a posição na ordem e responder 200. [GEL-92]
6. WHEN um admin envia `DELETE /api/grupos/:grupoId/habilidades/:id` THEN o sistema SHALL apagar a habilidade e todas as notas dela, registrar `habilidade_excluida` na auditoria e responder 204. [GEL-93]
7. WHEN o admin pede para excluir THEN a tela SHALL confirmar com "Excluir “<nome>”?" e "Excluir “<nome>” apaga as notas de todos os jogadores nessa habilidade.". [GEL-94]
8. WHEN o grupo não tem habilidades THEN a tela SHALL mostrar "Nenhuma habilidade" e "O simulador vai usar nível 5,5 para todos.". [GEL-95]
9. IF a habilidade não existe no grupo da rota THEN o sistema SHALL responder 404. [GEL-96]

**Independent Test**: renomear "Drible" para "Drible curto" mantém as notas; excluir "Chute" some com as notas de Chute de todos os jogadores.

---

### P1: Notas e nível do jogador ⭐ MVP

**User Story**: Como admin, quero dar a cada jogador uma nota de 1 a 10 em cada habilidade e ver o nível resultante.

**Why P1**: RA-07, RF-35 a RF-37; o nível alimenta o simulador.

**Acceptance Criteria**:

1. WHEN um admin envia `PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId` com nota inteira de 1 a 10 THEN o sistema SHALL gravar a nota (criando ou substituindo) e responder 200 com o nível atualizado do jogador. [GEL-97]
2. WHEN a nota enviada é `null` THEN o sistema SHALL apagar a nota daquela habilidade, sem erro mesmo que ela não exista. [GEL-98]
3. IF a nota não é inteira ou está fora de 1 a 10 THEN o sistema SHALL responder 422 com erro no campo `nota`. [GEL-99]
4. IF o jogador ou a habilidade não pertence ao grupo da rota THEN o sistema SHALL responder 404. [GEL-100]
5. The sistema SHALL calcular o nível como a média das notas existentes × 100, arredondada para o inteiro com meio para cima, ignorando habilidades sem nota (ex.: 8, 7, 6, 7, 8, 5 → 683). [GEL-101]
6. IF o jogador não tem nenhuma nota THEN o sistema SHALL usar o nível 550 e marcar `semNota`. [GEL-102]
7. The tela SHALL exibir o nível com uma casa decimal, arredondado com meio para cima (683 → "6,8"), e "sem nota" quando `semNota`. [GEL-103]
8. The sistema SHALL calcular o nível numa função pura de `@pelada/dominio`. [GEL-104]
9. The sistema SHALL aceitar notas de jogador inativo. [GEL-105]

**Independent Test**: dar 8, 7, 6, 7, 8 e 5 nas 6 habilidades; a ficha mostra "Nível 6,8". Apagar todas mostra "sem nota".

---

### P1: Isolamento, transação e auditoria ⭐ MVP

**User Story**: Como organizador, quero ter certeza de que nenhum outro grupo vê ou altera os meus jogadores.

**Why P1**: ADR-024, ADR-025, G-03, G-04, G-26 e G-27.

**Acceptance Criteria**:

1. The sistema SHALL registrar cada rota nova em `backend/api/test/isolamento/casos.ts`; a rota de criar grupo como `nao_se_aplica` com motivo, e todas as outras como rotas de grupo sob `/api/grupos/:grupoId`. [GEL-106]
2. WHEN uma conta admin do grupo A chama qualquer rota de grupo com o id do grupo B THEN o sistema SHALL responder 404 e não ler nem alterar dado do grupo B. [GEL-107]
3. WHEN uma rota de grupo recebe o id de um jogador, período ou habilidade de outro grupo THEN o sistema SHALL responder 404. [GEL-108]
4. The sistema SHALL fazer toda escrita de período de atividade (inativar, reativar, corrigir, alterar início) numa única transação, com a linha do jogador travada antes da validação, e com auditoria na mesma transação. [GEL-109]
5. WHEN duas escritas de período do mesmo jogador chegam ao mesmo tempo THEN o sistema SHALL aplicar uma depois da outra, validando a segunda sobre o resultado da primeira. [GEL-110]
6. The sistema SHALL ter um teste que falha se algum código fora do repositório de jogadores escrever `inicio` ou `fim` de `periodos_ativos` (G-26). [GEL-111]
7. The sistema SHALL acessar o banco como `pelada_app`, com as tabelas novas ou alteradas sob a RLS com `FORCE` por `grupo_id` (G-27). [GEL-112]
8. The sistema SHALL gravar na auditoria só ids, datas, valores numéricos e os nomes dos eventos, nunca telefone nem ano de nascimento. [GEL-113]

**Independent Test**: a suíte de isolamento roda como `pelada_app` com dois grupos e prova o 404 cruzado em todas as rotas novas.

---

### P1: Telas do grupo e do elenco no visual do legado ⭐ MVP

**User Story**: Como admin, quero as telas de grupo, jogadores e habilidades iguais às do app que já uso.

**Why P1**: Métrica do MVP: comparação visual com o mockup sem divergência.

**Acceptance Criteria**:

1. The app SHALL ter as telas: lista de grupos com "Criar grupo" e "Arquivados" (t08), novo grupo (t27 sem "Primeiro admin"), início do grupo (t09), dados do grupo com arquivar para quem criou (t20 e t28), jogadores (t15), ficha do jogador com períodos, inativar, reativar, corrigir datas, data de início e excluir (t16, sem as prévias de acumulado e posição) e habilidades (t17). [GEL-114]
2. The telas SHALL usar só os tokens de `tokens.css` e passar no `checar-tokens.py`. [GEL-115]
3. The telas SHALL passar na comparação visual com o mockup aprovado, em PC e celular. [GEL-116]
4. WHEN a conta não tem nenhum grupo THEN a lista de grupos SHALL mostrar o estado vazio com a ação "Criar grupo". [GEL-117]
5. WHEN uma rota da API devolve 422 com `campos` THEN a tela SHALL mostrar "Corrija N campos: <rótulos>" e a mensagem ao lado de cada campo, como no mockup. [GEL-118]

**Independent Test**: `pnpm --filter @pelada/web visual` sem divergência nas telas listadas.

---

## Edge Cases

- IF o nome do grupo só tem símbolos ("!!!") THEN o sistema SHALL usar o slug `grupo` (ou `grupo-2` e seguintes). [GEL-12, GEL-14]
- IF um grupo arquivado tem o slug pretendido THEN o sistema SHALL tratá-lo como ocupado. [GEL-14]
- WHEN o jogador sai e volta no mesmo dia THEN o sistema SHALL aceitar, sem sobreposição. [GEL-61]
- IF o admin tenta reativar com retorno antes da última saída THEN o sistema SHALL recusar com a mensagem de retorno antes da saída anterior. [GEL-66]
- IF a conta criadora foi removida do grupo THEN o sistema SHALL responder 404 a ela nas rotas do grupo, inclusive arquivar e reativar. [GEL-24, GEL-25]
- IF o apelido só difere por acento de outro ("José" e "Jose") THEN o sistema SHALL aceitar os dois. [GEL-35]
- WHEN o ano vira THEN o limite do ano de nascimento SHALL acompanhar (ano de hoje − 10). [GEL-36]

---

## Implicit-requirement sweep

| Dimensão | Cobertura |
| --- | --- |
| Input validation & bounds | GEL-03 a GEL-07, GEL-33 a GEL-40, GEL-63 a GEL-69, GEL-78 a GEL-80, GEL-90, GEL-91, GEL-99 |
| Failure / partial-failure states | GEL-09 (criação atômica), GEL-109 (escrita de período atômica) |
| Idempotency / retry / duplicate handling | GEL-15 (colisão de slug), GEL-29 (arquivar ou reativar de novo), GEL-53, GEL-56, GEL-74, GEL-82, GEL-98 |
| Auth boundaries & rate limits | GEL-08, GEL-21, GEL-24, GEL-25, GEL-106 a GEL-108. Os limites de taxa globais da fundação e da conta continuam valendo; nenhuma rota nova pede limite próprio |
| Concurrency / ordering | GEL-15, GEL-110 |
| Data lifecycle / expiry | GEL-30 (arquivar não apaga), GEL-84 (exclusão só sem histórico), GEL-93 (notas somem com a habilidade) |
| Observability | GEL-10, GEL-42, GEL-45, GEL-51, GEL-57, GEL-71, GEL-77, GEL-93 (auditoria); GEL-113 (o que nunca vai para a auditoria). O Sentry da fundação cobre as exceções |
| External-dependency failure | N/A: a feature não chama serviço externo; o banco é coberto por GEL-09 e GEL-109 |
| State-transition integrity | GEL-22 a GEL-29 (ativo ↔ arquivado), GEL-50 a GEL-56 (ativo ↔ inativo), GEL-62 a GEL-69 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----------- | ------ | ------- |
| GEL-01 | P1: Criar grupo | Design | Pending |
| GEL-02 | P1: Criar grupo | Design | Pending |
| GEL-03 | P1: Criar grupo | Design | Pending |
| GEL-04 | P1: Criar grupo | Design | Pending |
| GEL-05 | P1: Criar grupo | Design | Pending |
| GEL-06 | P1: Criar grupo | Design | Pending |
| GEL-07 | P1: Criar grupo | Design | Pending |
| GEL-08 | P1: Criar grupo | Design | Pending |
| GEL-09 | P1: Criar grupo | Design | Pending |
| GEL-10 | P1: Criar grupo | Design | Pending |
| GEL-11 | P1: Slug do grupo | Design | Pending |
| GEL-12 | P1: Slug do grupo | Design | Pending |
| GEL-13 | P1: Slug do grupo | Design | Pending |
| GEL-14 | P1: Slug do grupo | Design | Pending |
| GEL-15 | P1: Slug do grupo | Design | Pending |
| GEL-16 | P1: Slug do grupo | Design | Pending |
| GEL-17 | P1: Slug do grupo | Design | Pending |
| GEL-18 | P1: Editar os dados do grupo | Design | Pending |
| GEL-19 | P1: Editar os dados do grupo | Design | Pending |
| GEL-20 | P1: Editar os dados do grupo | Design | Pending |
| GEL-21 | P1: Editar os dados do grupo | Design | Pending |
| GEL-22 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-23 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-24 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-25 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-26 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-27 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-28 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-29 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-30 | P1: Arquivar e reativar o grupo | Design | Pending |
| GEL-31 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-32 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-33 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-34 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-35 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-36 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-37 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-38 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-39 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-40 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-41 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-42 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-43 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-44 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-45 | P1: Cadastrar e editar jogador | Design | Pending |
| GEL-46 | P1: Lista de jogadores | Design | Pending |
| GEL-47 | P1: Lista de jogadores | Design | Pending |
| GEL-48 | P1: Lista de jogadores | Design | Pending |
| GEL-49 | P1: Lista de jogadores | Design | Pending |
| GEL-50 | P1: Lista de jogadores | Design | Pending |
| GEL-51 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-52 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-53 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-54 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-55 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-56 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-57 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-58 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-59 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-60 | P1: Inativar e reativar jogador | Design | Pending |
| GEL-61 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-62 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-63 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-64 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-65 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-66 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-67 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-68 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-69 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-70 | P1: Regras dos períodos de atividade | Design | Pending |
| GEL-71 | P1: Corrigir datas de períodos | Design | Pending |
| GEL-72 | P1: Corrigir datas de períodos | Design | Pending |
| GEL-73 | P1: Corrigir datas de períodos | Design | Pending |
| GEL-74 | P1: Corrigir datas de períodos | Design | Pending |
| GEL-75 | P1: Corrigir datas de períodos | Design | Pending |
| GEL-76 | P1: Corrigir datas de períodos | Design | Pending |
| GEL-77 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-78 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-79 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-80 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-81 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-82 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-83 | P1: Alterar a data de início da pontuação | Design | Pending |
| GEL-84 | P1: Excluir jogador | Design | Pending |
| GEL-85 | P1: Excluir jogador | Design | Pending |
| GEL-86 | P1: Excluir jogador | Design | Pending |
| GEL-87 | P1: Excluir jogador | Design | Pending |
| GEL-88 | P1: Habilidades do grupo | Design | Pending |
| GEL-89 | P1: Habilidades do grupo | Design | Pending |
| GEL-90 | P1: Habilidades do grupo | Design | Pending |
| GEL-91 | P1: Habilidades do grupo | Design | Pending |
| GEL-92 | P1: Habilidades do grupo | Design | Pending |
| GEL-93 | P1: Habilidades do grupo | Design | Pending |
| GEL-94 | P1: Habilidades do grupo | Design | Pending |
| GEL-95 | P1: Habilidades do grupo | Design | Pending |
| GEL-96 | P1: Habilidades do grupo | Design | Pending |
| GEL-97 | P1: Notas e nível do jogador | Design | Pending |
| GEL-98 | P1: Notas e nível do jogador | Design | Pending |
| GEL-99 | P1: Notas e nível do jogador | Design | Pending |
| GEL-100 | P1: Notas e nível do jogador | Design | Pending |
| GEL-101 | P1: Notas e nível do jogador | Design | Pending |
| GEL-102 | P1: Notas e nível do jogador | Design | Pending |
| GEL-103 | P1: Notas e nível do jogador | Design | Pending |
| GEL-104 | P1: Notas e nível do jogador | Design | Pending |
| GEL-105 | P1: Notas e nível do jogador | Design | Pending |
| GEL-106 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-107 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-108 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-109 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-110 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-111 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-112 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-113 | P1: Isolamento, transação e auditoria | Design | Pending |
| GEL-114 | P1: Telas do grupo e do elenco no visual do legado | Design | Pending |
| GEL-115 | P1: Telas do grupo e do elenco no visual do legado | Design | Pending |
| GEL-116 | P1: Telas do grupo e do elenco no visual do legado | Design | Pending |
| GEL-117 | P1: Telas do grupo e do elenco no visual do legado | Design | Pending |
| GEL-118 | P1: Telas do grupo e do elenco no visual do legado | Design | Pending |

**Coverage:** 118 total, 0 mapped to tasks, 118 unmapped ⚠️ (o mapeamento acontece na fase de tarefas)

---

## Success Criteria

- [ ] Uma conta nova cria o grupo e cadastra o primeiro jogador em menos de 2 minutos, no celular.
- [ ] Todas as mensagens de erro de grupo, jogador, período e habilidade iguais às do legado (salvo as mudanças de C8).
- [ ] Suíte de isolamento verde com casos para todas as rotas novas, rodando como `pelada_app`.
- [ ] Comparação visual das telas da feature sem divergência em PC e celular.
- [ ] Nenhum achado crítico ou alto do `auditor-seguranca` em aberto.
