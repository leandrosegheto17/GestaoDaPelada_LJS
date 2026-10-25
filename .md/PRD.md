# PRD — Gestão da Pelada

Versão: rascunho 4.4 (reabertura pontual "Datas de saída e de retorno do jogador"; base: 4.3) | Data: 2026-10-21 | Autor: Gestor (chapéu PM)
Insumos: briefing do Leandro (ideia original), respostas do Leandro às perguntas das rodadas 1, 2 e 3, `.md/PLANO-COMERCIAL.md` v2, `.md/CTO-REVIEW.md` (Gate 1 e adendo da rodada 2).
Escopo deste PRD: **Fase 1, uso próprio** do grupo do Leandro. A Fase 2 (abertura paga a outros grupos) aparece só como restrição de modelagem.

## Consolidação da fundação (2026-10-25)

Este documento foi trazido do projeto anterior (`GestaoDaPelada`) para o repositório novo e atualizado para a stack e as
decisões da feature `fundacao` (`.specs/features/fundacao/`, decisões `AD-001` a `AD-006` em `.specs/STATE.md`). As regras
de negócio não mudaram. O que mudou:

| Tema | Antes (projeto anterior) | Agora (fundação) | Onde está decidido |
|---|---|---|---|
| Host de produção | `pelada.prod-ljs.workers.dev`, Worker `pelada` | `gestaodapelada.ljssoftware.com.br`, Worker `gestaodapelada` | ADR-028 (substitui o 020) |
| Schema do banco | SQL versionado com executor próprio, 13 migrations | `node-pg-migrate`, linha de base = as 13 migrations, `--fake` na produção | ADR-024 |
| Isolamento entre grupos | Só na API (repositório e middleware), sem RLS | API **mais** RLS com `FORCE` por `grupo_id`, contexto por transação, runtime na role `pelada_app` | ADR-025 (complementa o 005) |
| Verificação do PWA | Lighthouse PWA | Teste de instalabilidade com Playwright; sem Lighthouse | ADR-026 |
| Testes da API | `@cloudflare/vitest-pool-workers`, `compatibility_date` 2026-08-15 | `@cloudflare/vitest-plugin`, `compatibility_date` 2026-10-19 | ADR-027 (substitui o 018) |
| Runtime de scripts e CI | Node 22 | Node 24, pnpm 11 | `.nvmrc`, `engines` |
| Postgres | 16 ou 17 | 16 (a impressão digital do schema e o `pg_dump` fixam a versão) | ADR-024 |
| Deploy | `deploy.yml` com `/api/saude` | `deploy.yml` com `URL_PUBLICA` conferida, `VERSAO` = SHA e `GET /api/health` | `docs/runbook.md` |
| Documentos | `.md/` com revisões e relatórios de rodadas | PRD, PRD-TECNICO, SDD, GUARDRAILS e THREAT-MODEL aqui; operação em `docs/runbook.md` | ADR-024 a 028 |

O histórico de rodadas e de reaberturas abaixo é do projeto anterior e fica como registro das decisões de produto.

**Mudanças do rascunho 4.3 para o 4.4 (reabertura pontual "Datas de saída e de retorno do jogador", pedida em 2026-10-21; correção interna, sem impacto comercial, produção apenas, ADR-028 (antes ADR-020); só o recorte abaixo mudou):**
- **Problema:** na ficha do jogador (T16, seção Situação), a saída e o retorno só são registrados no dia em que o botão é apertado. "Inativar" já tem "Data de saída", mas "Reativar" vale sempre hoje, e nada do que foi registrado pode ser corrigido. Caso real: o jogador voltou antes de 20/10/2026, mas aparece "Ativo desde 20/10/2026". Efeitos: o jogador some das rodadas em que já estava de volta (aparecem como "–", e não é possível lançar a presença dele nelas), e o "Alterar data de início" (RA-18) recusa uma data legítima com "A data de início não pode ficar depois da saída do primeiro período".
- **Nova capacidade (RA-19):** (1) "Reativar" com **data de retorno** (padrão hoje, nunca futura, nunca antes da saída anterior); (2) **corrigir a data de saída e a data de retorno** de um período já registrado, só por admin do grupo; (3) **lista de períodos** na seção Situação; (4) **prévia do efeito** antes de confirmar, no estilo do diálogo "Alterar data de início"; (5) **registro de quem alterou e quando**. O servidor decide a validade (sem 500).
- **Decisões do Gestor desta reabertura (P-43 a P-45, §7.1):** (P-43) corrigir o retorno para mais cedo **não cria pontos sozinho**: as rodadas do intervalo passam a constar como falta (0) e o admin lança a presença de quem jogou, pela edição da partida; (P-44) corrigir uma data que deixaria uma presença fora dos períodos é **recusado** (nada é apagado), com a data limite na mensagem; (P-45) **qualquer admin do grupo** corrige, como as demais edições do elenco.
- **Fora desta reabertura:** regra de pontuação por rodada, TWA, e a data de início da pontuação em si (RA-18, que continua sendo o único campo que muda pontos).
- Premissas e riscos PR-22 a PR-25 (§6). Requisitos: RF-75 a RF-82 no PRD-TECNICO.

**Mudanças do rascunho 4.2 para o 4.3 (demanda pontual "Data de início do jogador", pedida pelo usuário em 2026-10-20; sem impacto comercial, produção apenas, ADR-020):**
- **Problema:** um jogador que saiu, ou foi punido por acúmulo de faltas, volta ao grupo com a pontuação zerada. Hoje isso só se faz mexendo em todo o histórico, e o app não permite editar a data de início de um período existente. Um caso real oposto: o Vandré tem o período aberto com início em 20/10 (efeito da importação do legado), mas jogou em 20/09, 27/09 e 11/10; a data dele precisa **recuar** sem mudar pontos.
- **Nova capacidade (RA-18), modelo mínimo da rodada 3 (substitui o da rodada 2):** duas regras simples. (1) **Reativar** só faz o jogador voltar a ficar visível no ranking e disponível nas partidas; não mexe em pontos nem em data. (2) **Data de início** (a data de entrada que já existe no cadastro) editável: o ranking considera os pontos **apenas a partir dessa data**, ignorando as presenças anteriores. Logo, "zerar" é pôr a data de hoje; "voltar a contar" é voltar a data. Nada é apagado.
- **Decisões do usuário:** P-33 "Sim" (a pontuação inicial também deixa de contar quando a data avança) e P-35/P-38 (um campo só; recuar volta a contar). A resposta P-34 ("preservar o histórico dos meses anteriores") não se sustentava com um campo só e foi resolvida na P-41.
- **Aprovação final (2026-10-20):** o usuário aprovou este recorte com todas as recomendações do Gestor. **P-33 a P-41 estão DECIDIDAS** (P-36, P-37, P-39, P-40 e P-41 conforme a recomendação). Não resta pergunta de produto desta demanda.
- Premissas e riscos PR-18 a PR-21 (§6).

**Mudanças do rascunho 4.1 para o 4.2 (demanda pontual "Adequação ao legado", aprovada pelo usuário em 2026-10-19):**
- **Objetivo:** trazer para o grupo real o histórico de outro app (57 jogadores, 231 rodadas desde 03/04/2022) sem perder o acumulado de cada um. Os "ajustes manuais" do legado ficam fora (decisão do usuário).
- **Pontuação inicial por jogador** (RA-03, RA-06): soma ao acumulado e à coluna PTS INICIAL.
- **Seis posições** de cadastro (RA-03) e **dois pesos de expulsão**, sem e com chuva (RA-04).
- **Importação do histórico** como operação do dono (RA-17), depois que as 3 mudanças acima estiverem em produção.
- Premissas de default na §6 (PR-15 a PR-17).

**Mudanças do rascunho 4 para o 4.1 (reabertura pontual, P-30):**
- **Colunas do ranking (tela e PDF).** Nesta ordem: #, Jogador, PTS INICIAL (acumulado até o início do mês exibido), uma coluna por partida do mês com os **pontos** da rodada (cor por situação; ícone de chuva ou de sol no cabeçalho) e PTS FINAL (PTS INICIAL + rodadas do mês; no mês corrente, o acumulado até hoje). Saem as contagens de presenças e faltas do mês. É mudança **só de apresentação**: pontuação, acumulado contínuo e ordem sempre pelo acumulado atual (P-26) continuam iguais. Só RA-06 e RA-09 mudam.
- Uma pergunta nova em aberto (P-32, §7.1).

**Mudanças em relação ao rascunho 3:**
- **Sobra no formato de 3 ou mais times (P-29, opção c).** Quem sobra forma um **time incompleto**. Exemplo: 22 aptos com 4 por time dão 5 times de 4 e 1 time de 2. O número de times passa a ser aptos ÷ jogadores por time, arredondado **para cima**. Nesse formato não existe "aguardam": todos os aptos jogam.
- Não há mais perguntas em aberto.

**Mudanças do rascunho 2 para o 3:**
- **Ordem do ranking (P-26).** É sempre a do acumulado geral atual, também ao navegar para meses anteriores. A navegação por meses só troca as partidas exibidas, com as presenças e faltas de cada partida daquele mês. Deixam de existir a "foto" do ranking por mês e a coluna "pontos no mês".
- **Simulador em dois formatos (P-27).**
  - **2 times:** com 1º e 2º tempo, titulares, reservas, limite de substituições, "só 1º tempo" e "não entra".
  - **3 ou mais times:** só a divisão inicial equilibrada por habilidade e idade, sem substituições. O número de times sai da conta aptos ÷ jogadores por time.
- **"Só 1º tempo" fora dos titulares (P-28).** Confirmado: pode ficar como "não entra", com pontuação de presença.
- **Nova pergunta P-29.** O que fazer com a sobra no formato de 3 ou mais times.

**Mudanças do rascunho 1 para o 2:**
- O ranking passa a ser geral e contínuo (pontos acumulados), exibido mês a mês.
- Novo papel de **dono da plataforma**, que cria grupos e o primeiro admin de cada um.
- A TWA sobe de Could para Should, porque a conta da Play já está paga.
- O simulador passa a aceitar um número configurável de times e não trata mais goleiros de forma especial.
- Foi criado o fluxo "esqueci a senha", com aviso interno ao dono da plataforma.
- A expulsão passa a valer −1 por padrão.
- As habilidades começam com 6 itens fixos.
- As perguntas respondidas estão fechadas na §7.

---

## 1. Problema e Contexto

Hoje o organizador (admin) de uma pelada semanal de amigos controla a presença, monta os times e cuida do caixa da quadra por mensagens no WhatsApp, em planilha, em caderno ou de cabeça. Isso gera três dores, que podem ser verificadas na rotina do grupo do Leandro:

1. **Presença sem registro confiável.** Não existe um histórico fácil de consultar de quem veio, em quais condições (com chuva, lesionado, expulso) e de quem faltou. Por isso, o critério "quem vem mais, joga mais" depende da memória do admin e abre espaço para discussão.
2. **Divisão de times manual e contestada.** A cada jogo, o admin decide de cabeça quem começa jogando, quem entra no 2º tempo e como equilibrar os times por nível e idade. O processo é lento e sujeito a reclamação.
3. **Caixa da pelada informal.** Quem pagou o mês, as entradas e saídas e o saldo ficam espalhados em mensagens ou planilha.

**Contexto:** já existem apps de pelada no mercado (PLANO-COMERCIAL §4). Nenhum dos pesquisados mostrou **pontuação de presença configurável** (chuva, lesão, expulsão) nem **ordem de 1º e 2º tempo definida pelo ranking**, que são o diferencial desta ideia. O concorrente real da Fase 1 não é outro app, é o hábito atual (WhatsApp mais planilha).

**Restrições do contexto:**
- O desenvolvimento é hobby do Leandro, em horário de lazer, sem prazo de negócio.
- O custo de caixa da Fase 1 vai de R$ 0 a R$ 180. A conta de desenvolvedor da Google Play já está paga, então esse custo sai da conta.
- A distribuição é pelo PWA por link e pela TWA na Google Play (§4).

## 2. Público-Alvo

| Perfil | Quem é na Fase 1 | O que faz no app |
|---|---|---|
| **Dono da plataforma** | O Leandro (leandrosegheto17@gmail.com). É um papel único, acima dos admins de grupo | Cria grupos e define o primeiro admin de cada um. Arquiva grupos. Recebe os pedidos de "esqueci a senha" e redefine senhas de admins. Mantém a situação comercial dos grupos |
| **Admin do grupo** (usuário principal) | O Leandro e os gestores que ele, ou outro admin do grupo, cadastrar | Faz os cadastros, lança as partidas, configura os pesos, usa o simulador, exporta o PDF e cuida do caixa |
| **Jogador do grupo** (usuário de consulta) | Os participantes fixos da pelada do Leandro (até 40 ativos, premissa I-20) | Consulta o ranking pelo link do grupo, no celular, sem login |
| *Admin de outro grupo* (Fase 2, não atendido agora) | Organizador de pelada recorrente de 10 a 30 pessoas, conforme o ICP do PLANO-COMERCIAL §2 | Fora do escopo. Só orienta a modelagem para vários grupos |

## 3. Objetivo de Sucesso

**Objetivo:** o grupo do Leandro usa o app de fato por **8 semanas consecutivas**, contadas a partir do dia em que todos os requisitos Must (§5) estiverem no ar. Ao fim desse período, ninguém volta para planilha ou caderno.

| # | Métrica | Baseline | Meta (janela de 8 semanas) | Como medir |
|---|---|---|---|---|
| M1 | Partidas realizadas que foram lançadas no app em até 48 h após o jogo | 0% (o app não existe; hoje não há registro) | **100%** | Partidas lançadas no app comparadas com o calendário do grupo. O admin confirma os jogos que não aconteceram |
| M2 | Dispositivos distintos que abriram o ranking do grupo na semana, em relação ao número de jogadores ativos | 0 | **≥ 50%**, em **pelo menos 6 das 8 semanas** (mantida pelo usuário) | Contador anônimo de acesso por dispositivo (RA-11) |
| M3 | PDF do ranking exportado e compartilhado no grupo | 0 | **≥ 2 compartilhamentos** na janela | Exportações registradas (RA-11), com confirmação do admin de que o arquivo foi para o WhatsApp |
| M4 | Partidas em que o simulador foi usado | 0% | **≥ 50%** das partidas lançadas | Escalações confirmadas e vinculadas a uma partida (RA-08, RA-11) |
| M5 | Volta ao controle paralelo (planilha ou caderno) | Hoje é 100% planilha ou WhatsApp | **Nenhuma** na semana 8 | Declaração do Leandro ao fim da janela (sim/não) |
| G1 (guarda) | Tempo para o admin lançar uma partida de até 24 jogadores | Desconhecido | **Mediana ≤ 2 min** | Cronometragem em teste de uso com o protótipo |

O objetivo é cumprido quando M1 a M5 atingem a meta. G1 é uma métrica de guarda: se passar de 2 minutos, ameaça M1.

## 4. Escopo desta Release (Fase 1)

### Dentro

| Item | Justificativa |
|---|---|
| Ranking de presença **geral e contínuo**, sempre na ordem do acumulado atual, com navegação por meses que mostra as partidas de cada mês (presenças e faltas por partida) | Núcleo da proposta de valor. Confirmado pelo usuário (P-05, P-26) |
| Lançamento de partidas (data, chuva, presentes, lesionados, expulsos) | Alimenta o ranking. Sem isso, não há produto |
| Papel de dono da plataforma: cria grupos e o primeiro admin, arquiva grupos, redefine senhas e recebe pedidos de "esqueci a senha" | Confirmado pelo usuário (P-07, P-25). Também prepara a Fase 2 |
| Área administrativa com login de admin: edição do grupo, cadastro de jogadores, admins do grupo e habilidades (6 habilidades iniciais) | Pedido no briefing |
| Simulador de divisão de times em dois formatos. **2 times:** titulares, 2º tempo e substituições pelo ranking; equilíbrio por substituições, depois habilidade, depois idade. **3 ou mais times:** só a divisão inicial equilibrada por habilidade e idade; todos os aptos jogam, e quem sobra forma um time incompleto. Os dois formatos têm ajuste manual | Diferencial do produto e base da métrica M4 (P-14, P-27, P-29) |
| Exportação do ranking em PDF de uma página | Pedido no briefing. Base de M3 e vetor de indicação na Fase 2 |
| Financeiro do caixa da pelada (pagou ou não no mês, entradas e saídas, saldo), só para admin com permissão | Pedido no briefing. É útil, mas não está na métrica de sucesso (Should) |
| PWA instalável no iPhone (Safari) e no Android (Chrome) | Canal principal no iPhone, com custo zero |
| TWA na Google Play, com o teste fechado começando logo depois do I1 | O briefing pede a TWA "ao mesmo tempo" e a conta da Play já está paga. Detalhes da decisão em RA-14 |
| Isolamento de todo dado por grupo e campo de situação comercial do grupo, sem lógica | Prepara a Fase 2 sem retrabalho (Gate 1, ressalva 4) |
| Registro anônimo de uso | Sem isso, M2, M3 e M4 não podem ser medidas |
| Pontuação inicial por jogador, 6 posições, 2 pesos de expulso e importação única do histórico do app anterior (RA-03, RA-04, RA-17) | Demanda "Adequação ao legado" (2026-10-19). Ordem: mudanças em produção primeiro, importação depois |
| "Reativar" com data de retorno, correção das datas de saída e de retorno de períodos já registrados, lista de períodos na ficha, prévia do efeito e auditoria, só para admin do grupo (RA-19) | Reabertura "Datas de saída e de retorno" (2026-10-21). Corrige o caso real do retorno registrado depois do dia em que ele ocorreu e destrava a edição da data de início |
| Edição da data de início (entrada) do jogador no cadastro: o ranking só conta presenças a partir dela (avançar zera, recuar volta a contar), com confirmação, prévia do efeito e auditoria; e reativar passando a significar só visibilidade e disponibilidade (RA-18) | Demanda "Data de início do jogador" (2026-10-20). Permite o retorno de quem saiu ou foi punido sem mexer no histórico, e corrige o início do Vandré |

### Fora

| Item | Justificativa do corte |
|---|---|
| Cobrança do app (trial, assinatura, gateway, Pix, inadimplência do app) | É coisa da Fase 2 (PLANO-COMERCIAL §Veredito) |
| Cadastro self-service de grupos e onboarding público | Os grupos são criados só pelo dono da plataforma |
| Termos de uso e política de privacidade completos | São necessários só na Fase 2. Na Fase 1 basta um aviso simples (RA-15) |
| App nativo e App Store da Apple | O PWA atende o iPhone sem custo nem comissão |
| Login de jogador e perfil pessoal | O jogador só consulta o ranking |
| Placar, gols, artilharia, cronômetro, estatísticas de desempenho | Não foram pedidos. O ranking é de **presença** |
| Regras ou avisos específicos de goleiro no simulador | Por decisão do usuário (P-13), goleiros não são controlados |
| Confirmação de presença antes do jogo e lembretes | Não foram pedidos |
| Envio de e-mail (recuperação de senha, avisos) e notificações push | A recuperação de senha é feita por outro admin ou pelo dono, com aviso interno no app (P-25) |
| Cobrança automática ou lembrete de pagamento no financeiro | O briefing pede só "um controle simples" |
| Mais de um idioma | Público só no Brasil (pt-BR) |
| Importar os "ajustes manuais", os telefones e a data de nascimento completa do legado; tela de importação | Decisão do usuário (ajustes); telefones do arquivo são fictícios; o app guarda só o ano; a importação é operação do dono, não funcionalidade de produto |
| Apagar, editar ou reescrever partidas e presenças antigas para "zerar" um jogador; zerar o ranking de todo o grupo por temporada; editar períodos já encerrados por um campo livre (a data de início do 1º período só muda pela RA-18; as datas de saída e de retorno só pela correção da RA-19, com as validações dela); criar presenças automaticamente ao antecipar um retorno (P-43); apagar presenças para encaixar uma correção (P-44); reativação em lote | A demanda é justamente evitar mexer no histórico. Temporada continua sendo decisão futura (PR-12) |

### Ordem de entrega sugerida (incrementos)

Esta ordem é uma recomendação de produto. A decomposição em tarefas é do Coordenador.

1. **I1, núcleo:** RA-01 a RA-06, RA-10, RA-11, RA-13 e RA-16.
2. **I1-TWA:** empacotar a TWA e abrir o teste fechado com o grupo (12 testadores, 14 dias), em paralelo com o I2.
3. **I2:** RA-07 e RA-08 (habilidades e simulador).
4. **I3:** RA-09 (PDF). **Quando I1 a I3 estiverem no ar, começa a janela de 8 semanas.**
5. **I4:** RA-12 e RA-15 (financeiro e aviso de privacidade). A TWA vai para produção assim que o teste fechado terminar.

## 5. Requisitos de Alto Nível Priorizados

Prioridade MoSCoW. O detalhamento está no `PRD-TECNICO.md`.

| ID | Requisito | Prioridade | Justificativa |
|---|---|---|---|
| RA-01 | Grupos (nome, dia da semana, frequência, horário), criados e arquivados pelo dono da plataforma e editados pelos admins do grupo, com todo dado isolado por grupo | Must | Unidade de isolamento. Exigência de modelagem para a Fase 2 |
| RA-02 | Acesso de admin com credencial individual (e-mail e senha), vinculado a grupos. O primeiro admin é criado pelo dono com senha aleatória, de troca obrigatória. Os admins do grupo dão acesso a outros admins. Inclui permissão de financeiro e "esqueci a senha" | Must | Briefing e respostas P-07 e P-25 |
| RA-03 | Cadastro de jogadores (nome/apelido, ano de nascimento, telefone, posição, **pontuação inicial**, data de entrada), com inativação sem perda de histórico. Posições: Zagueiro, Lateral, Volante, Meia, Atacante e Centroavante (mais Goleiro, mantido por compatibilidade) | Must | Base do ranking e do simulador. Pontuação inicial e novas posições: demanda "Adequação ao legado" |
| RA-04 | Pesos de pontuação por grupo (6 pesos: presença, lesionado e expulso, cada um com e sem chuva), valendo só daqui para a frente. Padrão: 1 por presença e −1 por expulsão (com ou sem chuva) | Must | Pedido no briefing. Respostas P-06, P-10 e P-22. O expulso com chuva separado: demanda "Adequação ao legado" (substitui o peso único da P-10) |
| RA-05 | Lançamento de partidas: data, chuva sim/não e a situação de cada jogador (ausente, presente, lesionado, expulso) | Must | Alimenta o ranking. Precisa ser rápido (G1) |
| RA-06 | Ranking público do grupo, geral e contínuo. A ordem é sempre a do acumulado atual (desempate pelo mais velho e, depois, pelo apelido) e não muda ao trocar de mês. Colunas: posição, jogador, PTS INICIAL (pontuação inicial do jogador mais o acumulado até o início do mês exibido), uma coluna por partida do mês com os pontos da rodada de cada jogador (cor por situação: presente, lesionado, expulso, falta ou "–" antes de entrar no grupo; ícone de chuva ou de sol no cabeçalho) e PTS FINAL (PTS INICIAL + pontos das rodadas do mês). Sem contagens de presenças e faltas | Must | Tela principal e núcleo do produto (M1, M2). P-05, P-26 e P-30 |
| RA-07 | Habilidades por grupo (6 iniciais: Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme), com cadastro e nota de 1 a 10 por jogador, visíveis só para admins | Must | O simulador precisa delas (P-04) |
| RA-08 | Simulador de divisão de times, com escolha do formato, jogadores por time, aptos, ajuste manual e confirmação. **2 times:** "só 1º tempo", limite de substituições, titulares, reservas e "não entra" pelo ranking contínuo; equilíbrio por substituições, depois habilidade, depois idade. **3 ou mais times:** número de times = aptos ÷ jogadores por time, arredondado para cima; quem sobra forma um time incompleto; sem substituições; equilíbrio por habilidade, depois idade | Must | Diferencial do produto. Base de M4. P-14, P-27, P-28, P-29 |
| RA-09 | Exportação em PDF de uma página do ranking (ordem atual), com as mesmas colunas da tela (RA-06), as partidas do mês exibido e, se couber, as anteriores. Qualquer pessoa com o link pode exportar | Must | Pedido no briefing. Base de M3. P-30 |
| RA-10 | PWA instalável no iPhone e no Android, em pt-BR, pensado primeiro para celular | Must | Canal de distribuição no iPhone |
| RA-11 | Registro anônimo de uso, para medir M1 a M4 | Must | Sem medição, não há como declarar sucesso ou fracasso |
| RA-12 | Financeiro do caixa da pelada, só para admin com permissão | Should | Pedido no briefing, mas fora das métricas |
| RA-13 | Campo de situação comercial do grupo (uso próprio, trial com data de início, ativo, inadimplente, cancelado), sem lógica de cobrança, mantido pelo dono da plataforma | Must | Custo quase zero agora. Evita migração na Fase 2 |
| RA-14 | TWA na Google Play | **Should** (era Could) | **Decisão da rodada 2:** com a conta da Play já paga, o único custo que justificava adiar deixou de existir. O empacotamento tem pouco esforço se o PWA já for instalável (RNF-11), e o briefing pede a TWA "ao mesmo tempo". **Não é Must** por dois motivos. Primeiro, o PWA já cobre o Android e nenhuma métrica de sucesso depende da loja. Segundo, o teste fechado (12 testadores por 14 dias contínuos) depende de pessoas permanecerem inscritas, o que o projeto não controla, e não pode atrasar o início da janela de 8 semanas. O teste fechado começa logo depois do I1, usando o próprio grupo |
| RA-15 | Aviso simples de privacidade no app | Should | Baixo custo. Prepara a Fase 2 |
| RA-16 | Área do dono da plataforma: grupos, primeiro admin, redefinição de senha, pedidos de "esqueci a senha" e situação comercial | Must | Sem ela, não há como criar o grupo nem o primeiro admin (P-07) |
| RA-17 | Importação única do histórico do app anterior para o grupo do Leandro (jogadores, habilidades dos ativos, pontuação inicial, 231 rodadas e a config de pesos do legado), por script de operação com simulação prévia, comparação de totais, backup prévio e transação única. Sem tela. Vem depois das mudanças de RA-03, RA-04 e RA-06 em produção | Must (desta demanda) | Meta: o total de cada jogador no app bate com o do legado, exceto pelos ajustes manuais ignorados por decisão do usuário. Medido na simulação (RF-66 do PRD-TECNICO) |
| RA-18 | Edição da data de início (data de entrada do cadastro) de um jogador, só por admin do grupo; é o único campo. Regra única: o acumulado conta as presenças com data **igual ou posterior** à data de início (a pontuação inicial conta enquanto a data de início não passar da primeira presença do jogador). **Avançar** a data: o que ficou antes deixa de contar no ranking, no PDF e no simulador (o jogador "volta zerado" se a data for hoje). **Recuar** a data: o que ficou escondido volta a contar. Reativar só devolve o jogador ao ranking e às partidas. Com prévia do efeito, confirmação e registro de auditoria. Nenhum dado de partida é apagado ou editado | Must (desta demanda) | Meta mensurável: (1) o Kim volta ao grupo com acumulado 0 na data escolhida e a ordem do ranking reflete isso; (2) o Vandré tem o início recuado para 20/09 e o acumulado dele, e o de todos os outros jogadores, fica idêntico ao de antes; (3) na implantação nenhum ponto de ninguém muda. Medido por teste automatizado de regressão e conferência do Leandro no ranking real |
| RA-19 | Datas de saída e de retorno do jogador. (1) "Reativar" pede a **data de retorno** (padrão hoje; não futura; não antes da saída anterior). (2) Um admin do grupo pode **corrigir a data de saída e a data de retorno** de um período já registrado. (3) A seção Situação da ficha (T16) **lista os períodos** do jogador (entrada → saída; retorno → saída ou "atual"). (4) Antes de confirmar, **prévia do efeito**, no estilo do diálogo "Alterar data de início": acumulado de X para Y, posição de N para M, e quantas rodadas passam a constar ou deixam de constar. (5) Registra **quem alterou e quando**, com as datas anterior e nova. O servidor decide: nenhuma data no futuro; retorno não antes da saída anterior; períodos sem sobreposição; nenhuma presença pode ficar fora dos períodos resultantes; a data de início da pontuação (RA-18) continua válida em relação ao 1º período. Toda recusa informa a **data limite**. Nada é apagado e nenhum ponto é criado sozinho (P-43, P-44) | Must (desta demanda) | Meta mensurável: (1) o admin registra um retorno retroativo (ex.: antes de 20/10/2026) e corrige uma saída já registrada; (2) após confirmar, ranking, PDF, simulador e a ficha refletem as novas datas; (3) a recusa de "Alterar data de início" por causa da saída do 1º período deixa de ocorrer para data legítima depois de corrigida a saída; (4) nenhuma entrada inválida devolve erro 500; (5) a mensagem de recusa traz a data limite. Medido por teste automatizado e conferência do Leandro com o caso real |

## 6. Premissas e Riscos de Produto

| # | Premissa / risco | Tipo | Como validar | Dono | Prazo |
|---|---|---|---|---|---|
| PR-01 | O grupo aceita como justos os pesos (padrão: 1 por presença, −1 por expulsão) e o desempate por idade | Risco social, o maior da Fase 1 | Apresentar as regras e os pesos ao grupo, ajustar por consenso e registrar os valores | Leandro | Antes de começar o I1 |
| PR-02 | O admin consegue lançar uma partida em 2 minutos ou menos | Premissa crítica | Cronometrar o lançamento de 20 a 24 jogadores no protótipo do I1 | Validador, com o Leandro | No fim do I1 |
| PR-03 | O admin sabe, na hora de lançar, quem foi lesionado (foi e não jogou) ou expulso | Premissa | Confirmar com o Leandro a rotina pós-jogo | Leandro | Antes de começar o I1 |
| PR-04 | O simulador é usado de verdade | Risco de adoção | M4 nas 4 primeiras semanas. Se ficar abaixo de 50%, investigar o motivo | Gestor, com o Leandro | Semana 4 da janela |
| PR-05 | Os jogadores abrem o link do ranking sem precisar de login | Premissa de adoção | M2 | Gestor, com o Leandro | Semana 2 da janela |
| PR-06 | O PWA no iPhone mantém os dados e a sessão do admin de forma estável | Risco técnico de plataforma | Teste em iPhones reais (PRD-TECNICO §6) | Coordenador e Validador | No fim do I1 |
| PR-07 | É possível compartilhar o PDF no WhatsApp a partir do PWA e da TWA | Risco técnico de plataforma | Teste em iPhone e Android reais (PRD-TECNICO §6) | Coordenador e Validador | No fim do I3 |
| PR-08 | A infraestrutura cabe em plano gratuito | Premissa de custo | Estimativa de volume no SDD.md | Coordenador | No `/definir` |
| PR-09 | Dados pessoais de terceiros sem exposição indevida | Risco de compliance | A visão pública mostra só apelido, presenças, faltas e pontos | Gestor (estratégico) e Validador (tático) | No `/definir` |
| PR-10 | O escopo largo, somado às horas de lazer, atrasa a primeira versão útil | Risco de entrega | Entrega em incrementos (§4) | Gestor | Revisar no `/definir` (TASK.md) |
| PR-11 | Mudar os pesos gera disputa sobre pontos já ganhos | Risco social | **Resolvido:** a mudança vale só daqui para a frente (P-06) | — | Fechado |
| PR-12 | Ranking contínuo: quem está no grupo há mais tempo fica sempre no topo, e quem chega depois quase nunca começa jogando no simulador | Risco social (novo, consequência de P-05) | Observar nas 8 semanas se jogadores novos ficam presos como reservas ou "não entra". Se o grupo reclamar, avaliar uma janela móvel ou zerar o ranking por temporada (decisão futura do usuário, não desta release) | Leandro | Semana 8 da janela |
| PR-13 | O grupo tem pelo menos 12 pessoas dispostas a ficar inscritas no teste fechado da Play por 14 dias contínuos | Premissa de distribuição | Recrutar os testadores no grupo antes de fechar o I1 | Leandro | No fim do I1 |
| PR-14 | Concentrar a recuperação de senha no dono da plataforma ou em outro admin, sem e-mail, não deixa nenhum admin bloqueado por muito tempo | Premissa operacional | Observar os pedidos de "esqueci a senha" na janela | Leandro | Semana 8 da janela |
| PR-15 | Defaults da importação: lesionado vale o mesmo que presença (3 sem chuva, 6 com chuva), porque o legado não tem lesionado; telefones não são importados (os do arquivo são fictícios); as habilidades dos ativos são importadas; "Goleiro" fica como sétima posição | Premissa (decisão do Gestor, na demanda) | Conferir a config de pesos e as posições após a importação | Leandro | Antes de rodar o script |
| PR-16 | Os totais calculados diferem do "Atual" do legado só pelos ajustes manuais ignorados (4 jogadores, diferenças entre 12 e 240 pontos) | Risco de aceitação | A simulação lista as diferenças e exige que cada uma seja igual à coluna Ajustes do arquivo | Leandro | Na simulação, antes da execução real |
| PR-17 | O arquivo de cadastro dos 17 inativos não traz ano de nascimento nem posição | Risco de dados | Aceitar valores de preenchimento (PRD-TECNICO I-47) ou informar os dados reais antes | Leandro | Antes de rodar o script |
| PR-18 | **Risco de regressão maior da demanda 4.3:** com um campo só (a data de início do cadastro) decidindo o que conta, qualquer jogador que tenha presença lançada **antes** da data dele deixaria de somá-la na implantação. O candidato conhecido é o Vandré (período aberto em 20/10 pela importação, com presenças em 20/09, 27/09 e 11/10), e pode haver outros. Mitigação: verificação e ajuste de datas **antes** da regra entrar (PRD-TECNICO RF-74, RNF-13), e teste de regressão em que o acumulado de todo jogador sai idêntico. Se a verificação achar divergência, o usuário decide caso a caso (corrigir a data do jogador) | Risco de produto/dados | Teste de regressão: acumulado de todos os jogadores idêntico antes e depois da implantação e depois de recuar uma data; conferência do Leandro no ranking real | Gestor (requisito), Validador (teste) | Antes do deploy desta demanda |
| PR-19 | O usuário prevê usar a edição para "anular" faltas excessivas e saídas; o grupo pode estranhar que, ao zerar um jogador, os meses antigos dele também passem a mostrar "–" e 0 (consequência da P-41) | Risco social (análogo a PR-01 e PR-12) | Combinar a regra com o grupo antes do primeiro uso real (Kim) | Leandro | Antes de zerar o primeiro jogador |
| PR-20 | A edição por engano de uma data (avançar sem querer) zera pontos de um jogador no ranking público. Mitigação: prévia "acumulado de X para Y", confirmação explícita e possibilidade de desfazer recuando a data | Risco operacional | Teste de usabilidade com o Leandro na primeira edição real | Validador, com o Leandro | No fim do desenvolvimento |
| PR-21 | **Consequência de usar um campo só (P-41):** a data de início vale para o ranking inteiro, inclusive os meses passados. Ao avançar a data de um jogador, os meses anteriores a ela passam a mostrar, para ele, "–" nas rodadas e 0 no PTS INICIAL e no PTS FINAL; a pontuação que ele tinha naquela época não é preservada nem na tela nem no PDF (os dados de presença continuam gravados). Em compensação, PTS FINAL de um mês = PTS INICIAL do seguinte continua valendo para todos. O app guarda só a última data | Risco de produto (decisão do usuário) | Confirmar a P-41; o menor desvio, se não aceitar, é guardar o histórico de datas (custo alto, não recomendado) | Leandro | Antes do `/definir` desta demanda |
| PR-22 | **Expectativa de acumulado:** corrigir só as datas dos períodos não muda pontos, porque o acumulado depende da data de início da pontuação (RA-18) e das presenças lançadas, não dos períodos. O que a correção faz é devolver o jogador às rodadas em que ele já estava de volta (de "–" para falta, 0 ponto) e **permitir** lançar a presença dele nelas. O ponto só entra quando o admin lança a presença (P-43). Risco: o admin esperar que o acumulado suba sozinho | Risco de produto | A prévia mostra "acumulado de X para Y" (normalmente igual), as datas das rodadas que passam a constar e o aviso "lance as presenças em Editar partida"; confirmar com o Leandro no caso real | Gestor (requisito), Validador (teste) | Antes do deploy desta demanda |
| PR-23 | Antecipar um retorno e depois lançar presenças retroativas muda pontos e posições já vistas no ranking público e no PDF compartilhado | Risco social (análogo a PR-01 e PR-20) | Prévia com posição de N para M; auditoria de quem corrigiu; combinar com o grupo que correções retroativas são possíveis | Leandro | Antes da primeira correção real |
| PR-24 | Correção de data recusada porque existe presença que ficaria fora do período (P-44) pode frustrar o admin | Risco operacional | A mensagem informa a data limite e o caminho (editar a partida e remover a marcação, ou escolher a data limite) | Validador, com o Leandro | No fim do desenvolvimento |
| PR-25 | Pode haver presenças já "fora" de período por causa da importação do legado (I-48). A regra de P-44 olha só o que a correção **retira** de cobertura, para não travar correções legítimas por dado antigo | Risco de dados | Teste com histórico importado; listar os casos no RF-74 se aparecerem | Coordenador e Validador | Antes do deploy desta demanda |

## 7. Perguntas em Aberto

### 7.0 Decididas na reabertura "Datas de saída e de retorno" (4.4, Gestor, 2026-10-21)

Decisões de produto com recomendação do Gestor, registradas aqui para o usuário revogar se discordar. Contexto técnico verificado no código: o acumulado (`acumuladoPorInicio`) soma as presenças a partir da data de início da pontuação e **não olha os períodos**; os períodos decidem quem aparece nas rodadas (ativo, falta ou "–"), nas linhas do ranking, no lançamento de partida, no simulador e no financeiro; hoje só se lança presença para quem está ativo na data da partida (ou já tem presença nela).

| # | Pergunta | Decisão | Justificativa |
|---|---|---|---|
| P-43 | Ao antecipar o retorno, as rodadas entre o retorno corrigido e o antigo contam pontos, ou só valem daqui para frente? | **Contam como rodadas do jogador, mas sem pontos automáticos.** As rodadas do intervalo passam de "–" para falta (0 ponto) e o admin pode lançar a presença de quem jogou, editando a partida. Pontos só entram por presença lançada. O sistema não cria presenças | Não há dado de quem jogou: criar presença presumida inventaria pontos (e punição por falta não existe, a falta vale 0, então o erro seria sempre a favor ou neutro). "Só daqui para frente" não corrige o problema real. A prévia lista as datas das rodadas, para o admin lançar cada presença |
| P-44 | Ao corrigir a saída para mais cedo (ou o retorno para mais tarde), presenças já lançadas fora do novo período bloqueiam ou são removidas? | **Bloqueiam.** O servidor recusa e informa a data limite (ex.: "A saída não pode ser antes de 12/10/2026, data da última presença"). Nada é removido | Consistente com a regra que já barra a saída com presença depois dela e com o princípio do produto de não apagar histórico (RA-18). Apagar presença em silêncio mudaria o ranking público. Para insistir, o admin edita a partida e remove a marcação, de forma visível e auditada (RF-28) |
| P-45 | Quem pode corrigir? | **Qualquer admin do grupo.** Dono da plataforma só se for admin do grupo (I-30). Registro de quem e quando | Mesmo nível de P-40, de RF-20 e RF-21. A prévia, a confirmação e a auditoria cobrem o risco |

### 7.1 Ainda em aberto

Demanda "Data de início do jogador" (4.3): **todas as perguntas abaixo estão decididas pelo usuário em 2026-10-20.** A única pergunta ainda em aberto desta seção é a P-32 (rascunho 4.1), no fim.

**Respondidas pelo usuário em 2026-10-20 (rodadas 2 e 3):**

| # | Pergunta | Resposta do usuário | Onde foi aplicada |
|---|---|---|---|
| P-33 | A pontuação inicial do cadastro também deixa de contar quando a data de início avança? | **"Sim."** | RN-25 |
| P-35 | Que campo/período se edita? | **"Já tem o campo no cadastro, bastaria editar. Se um dia quiser voltar a contar a pontuação antiga, basta voltar a data."** Um único campo: a data de início (entrada) do cadastro; sem campo de "corte" | RF-69, RN-25 |
| P-38 | Recuar só muda quem aparece nas partidas, sem mudar pontos? | **"Correto."** Como nada é apagado, a regra única (RN-25) cumpre as duas respostas: recuar devolve só o que o avanço havia escondido, e não muda nada quando não havia nada escondido | RN-25, RN-28 |
| (rodada 3) | Reativar e data de início | **"Reativar apenas faz o jogador voltar a ficar visível no ranking e disponível para as partidas. Data de início: o ranking passa a considerar os pontos apenas depois da data de início, ignorando as presenças anteriores. Com esses dois ajustes o ZERAR já funciona."** Substitui o modelo da rodada 2 | RF-69 a RF-74, RN-25 a RN-29 |
| P-34 | Os meses anteriores ao novo início preservam a pontuação da época? | Respondida "Sim" na rodada 2, mas a regra simples da rodada 3 a contradizia. **DECIDIDA em 2026-10-20 pela P-41:** o usuário aceita que os meses anteriores à data de início deixem de mostrar a pontuação da época para aquele jogador | RN-27, PR-21 |

**DECIDIDAS em 2026-10-20** (o usuário aprovou todas as recomendações do Gestor):

| # | Pergunta | Opções | Decisão (= recomendação do Gestor) |
|---|---|---|---|
| P-36 | Limites da data: o que é válido? | (a) Data válida e não futura, sem outro limite; (b) igual a (a), mais "não anterior à primeira partida do grupo"; (c) igual a (a), mais "não posterior ao início do período aberto" | **(a), DECIDIDA.** Hoje é o limite natural para zerar; datas anteriores à primeira partida não têm efeito em pontos |
| P-37 | Efeito sobre as rodadas anteriores do próprio jogador, quando a data avança | (a) Aparecem como "–" (sem número, fora de qualquer soma, sem falta), como hoje antes da entrada; (b) Continuam mostrando os pontos, mas "fora do acumulado" (esmaecidos); (c) Aparecem como falta (0) | **(a), DECIDIDA.** É o tratamento que o ranking já dá a quem ainda não estava no grupo (RN-06) e a conta fecha na tela. (b) obriga a tela a mostrar números que não somam; (c) puniria o jogador com faltas que ele não tinha como cometer |
| P-41 | **Pede confirmação (consequência da regra simples).** Com um campo só, avançar a data de um jogador faz **todos** os meses anteriores a ela mostrarem, para ele, "–" nas rodadas e 0 no PTS INICIAL e no PTS FINAL; a pontuação que ele tinha na época não é preservada na tela nem no PDF (os dados continuam gravados, e voltar a data os traz de volta). A conta PTS FINAL do mês = PTS INICIAL do seguinte continua valendo. Você aceita? | (a) Sim, aceito; (b) Não: guardar o histórico de datas de início para mostrar cada mês com a data vigente na época (mais telas, mais regras, e "época" fica ambígua); (c) Não: manter só o acumulado de hoje com a regra e deixar os meses antigos sem a regra (a conta PTS INICIAL + rodadas = PTS FINAL deixa de fechar no mês da data) | **(a), DECIDIDA: aceito.** É a consequência direta do que você pediu ("ignorar as presenças anteriores à data") e a mais simples e segura. O menor desvio, se não aceitar, é (c) |
| P-39 | Auditoria da alteração | (a) Mínima: quem, quando, data anterior e nova; (b) (a) mais o acumulado antes e depois; (c) (b) mais um motivo em texto livre opcional | **(b), DECIDIDA.** Mostra de relance o dano de um erro, sem pedir mais um campo ao admin. Visível só aos admins do grupo |
| P-40 | Permissão | (a) Qualquer admin do grupo, como as demais edições do elenco; (b) Só admin com a permissão "acessa financeiro"; (c) Só o dono da plataforma | **(a), DECIDIDA.** Consistente com RF-20 e RF-21. O dono só vê metadados (I-30) e não opera o elenco. A confirmação com prévia e a auditoria cobrem o risco |

Pergunta anterior (rascunho 4.1):

| # | Pergunta | Por que importa | Interpretação provisória (PRD-TECNICO) |
|---|---|---|---|
| P-32 | No PDF, que inclui partidas de meses anteriores quando cabem (P-19), a que se refere o PTS INICIAL? | O usuário definiu PTS INICIAL + rodadas = PTS FINAL. Com colunas de dois ou mais meses, essa conta só fecha se o PTS INICIAL for o acumulado antes da primeira partida impressa | I-42: PTS INICIAL do PDF = acumulado antes da primeira partida impressa; PTS FINAL = o mesmo do mês exibido |

### 7.1.1 Resolvida na reabertura pontual (rascunho 4.1)

| # | Pergunta | Resposta do usuário | Onde foi aplicada |
|---|---|---|---|
| P-30 | Colunas do ranking na tela e no PDF | **#, Jogador, PTS INICIAL, uma coluna por partida do mês com os pontos da rodada (cor por situação; ícone de chuva ou de sol no cabeçalho), PTS FINAL.** Saem as contagens de presenças e faltas do mês. **Mudança só de apresentação:** a pontuação, o acumulado contínuo e a ordem sempre pelo acumulado atual (P-26) não mudam, também ao ver meses passados | RA-06, RA-09; no PRD-TECNICO: RF-29, RF-31, RF-32, RF-50, RN-01, RN-03, RN-21, RNF-10, F1, F4, I-41 a I-43 |

### 7.2 Resolvidas na rodada 4

| # | Pergunta | Resposta do usuário | Onde foi aplicada |
|---|---|---|---|
| P-29 | Sobra no formato de 3 ou mais times | **(c)** Quem sobra forma um time incompleto (ex.: 22 aptos com 4 por time dão 5 times de 4 e 1 time de 2). O número de times é arredondado para cima. Não há "aguardam" | RA-08, RN-09B, RN-10B, RF-39 a RF-47, F3 |

### 7.3 Resolvidas na rodada 3

| # | Pergunta | Resposta do usuário | Onde foi aplicada |
|---|---|---|---|
| P-26 | Ordem do ranking ao ver um mês passado | **Não muda.** É sempre a ordem do acumulado geral atual. A navegação por meses só mostra as partidas daquele mês (presenças e faltas por partida) | RA-06, RA-09, RN-05, RF-29 a RF-32, RF-50 |
| P-27 | Modelo com 3 ou mais times | **Não há substituições nem 1º e 2º tempo.** Só a divisão inicial equilibrada por habilidade e idade (ex.: 20 aptos com 4 por time dá 5 times de 4). Titulares, reservas, limite de substituições, "só 1º tempo" e "não entra" valem só para 2 times | RA-08, RN-09, RN-10, RF-39 a RF-47 |
| P-28 | "Só 1º tempo" fora dos titulares, com limite | **Confirmado:** pode ficar como "não entra", pela ordem do ranking, e recebe a pontuação de presença | RN-09, RN-19 |

### 7.4 Resolvidas na rodada 2

Respostas do usuário, já aplicadas.

| # | Pergunta | Resposta do usuário | Onde foi aplicada |
|---|---|---|---|
| P-01 | Tamanho do grupo | Indiferente. Mantida a premissa de até 40 ativos e 30 presentes por partida | I-20 |
| P-02 | Meta de M2 | Indiferente. Mantida | §3 |
| P-03 | TWA na Fase 1 | A conta da Play já está paga. O teste fechado continua valendo | RA-14 subiu para Should; I1-TWA na §4 |
| P-04 | Habilidades | Catálogo com 6 iniciais: Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme. O cadastro continua existindo | RA-07, RN-18 |
| P-05 | Base do ranking no simulador | O ranking é geral e contínuo | RA-06, RA-08, RN-05, RN-08 |
| P-06 | Mudança de pesos | Só daqui para a frente | RN-04 |
| P-07 | Login | Login individual por admin. O dono da plataforma cria o grupo e o primeiro admin, com senha aleatória de troca obrigatória. O "$" usa o mesmo login, com permissão | RA-02, RA-16 |
| P-08 | Ranking público | Por link, sem login, só apelido, presenças, faltas e pontos | RA-06 |
| P-09 | Lesionado | Foi e não jogou | RN-02 |
| P-10 | Expulsão | Peso único, padrão −1 | RN-01, RN-18 |
| P-11 | Falta | 0 ponto, só contagem | RN-03 |
| P-12 | Mesmo ano de nascimento | Ordem alfabética do apelido | RN-05 |
| P-13 | Goleiros | Não serão controlados. Removidas todas as regras e avisos de goleiro | RA-08 |
| P-14 | Número de times | Configurável | RA-08, RN-09, RN-10 |
| P-15 | "Só 1º tempo" fora dos titulares | Joga apenas o 2º tempo, sem ajuste manual | RN-09 (detalhe em aberto na P-28) |
| P-16 | Sobra de aptos com limite | Os de pior ranking ficam como "não entra", **mas recebem a pontuação de presença** | RN-09, RN-19 |
| P-17 | Prioridade do equilíbrio | Substituições iguais, depois habilidade, depois idade | RN-10 |
| P-18 | Quem usa o simulador | Só admin | RA-08 |
| P-19 | Colunas do PDF | Partidas do mês e, se couber, anteriores, até 12 | RA-09 |
| P-20 | Financeiro | Mensalidade opcional; "pagou" gera entrada vinculada; sem jogador avulso | RA-12 |
| P-21 | Jogador em mais de um grupo | Um cadastro por grupo | RA-03 |
| P-22 | Pesos iniciais | Indiferente. Mantidos 1 por presença, com expulsão = −1 | RN-18 |
| P-23 | Quem exporta o PDF | Qualquer pessoa com o link | RA-09 |
| P-24 | Faltas de quem entrou no meio do mês | Contam só a partir da data de entrada no grupo | RN-06 |
| P-25 | Recuperação de senha | Outro admin redefine, sem e-mail. "Esqueci a senha" mostra "Solicite o reset de senha a outro admin" e gera um aviso interno, visível só ao dono da plataforma no login dele | RA-02, RA-16 |
