---
name: projeto-novo
description: Orquestra o fluxo de projeto novo (construir um software para vender), da ideia ao plano de tarefas e lotes — descobre em que fase o projeto está pelos artefatos em .specs/, avisa a troca de modelo, aciona a skill certa (descoberta, viabilidade-tecnica, plano-comercial, decisao, tlc-spec-driven) e pede aprovação ao fim de cada fase de planejamento. Termina no tasks.md pronto: infraestrutura, construção, validação e lançamento são dos comandos /preparar, /executar, /validar e /finalizar. Use quando o usuário quiser começar ou retomar um projeto novo, ou via /fluxo. Não use para feature em projeto existente, bug ou outros fluxos.
---

# Projeto novo (fluxo 1)

Você é o **orquestrador**: decide a fase, aciona a peça certa e controla as aprovações. O trabalho de cada fase está nas skills e agentes que você aciona. As 8 fases do fluxo, suas perguntas e critérios de passagem estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

**O fluxo termina no planejamento.** Pronto o `tasks.md` (tarefas e lotes) e o `jornadas.md`, nada mais é feito aqui: a infraestrutura é do `/preparar`, a construção do `/executar`, a validação do `/validar` e o lançamento, a operação e o aprendizado do `/finalizar` (seção Fim do planejamento do `CLAUDE.md`).

## 1. Descobrir onde estamos

Liste `.specs/produto/` e `.specs/features/`. A **primeira linha que se aplica** define a fase:

| Situação dos arquivos | Fase atual |
|---|---|
| `.specs/` não existe ou `produto/` vazio | 1 Ideia |
| `ideia.md`, sem `problema.md` | 2 Discovery |
| `problema.md`, sem `solucao.md` | 3 Solução e valor |
| `solucao.md`, sem `viabilidade-tecnica.md` | 4 Viabilidade técnica |
| `viabilidade-tecnica.md`, sem `decisao.md` | 5 Plano comercial (opcional) ou Decisão |
| `decisao.md` com veredito `matar` | Encerrado: mostre o motivo e pare |
| `decisao.md` com veredito `esclarecer` | Volte à fase indicada em "Voltar para" |
| `decisao.md` com `seguir`, sem `features/*/spec.md` | 6 MVP |
| `spec.md` de escopo grande (mais de uma feature), sem `.specs/projeto/roadmap.md` | 6b Roteiro (a skill pula se o escopo cabe em uma feature) |
| `spec.md`, sem `design.md` e sem `tasks.md` | 7 Desenho (o tlc pode pular, se a feature for simples) |
| `design.md`, projeto com interface, sem `.specs/mockup/tokens.css` | 7 Desenho: mockup visual |
| `design.md` (e mockup, se houver interface) ou spec simples, sem `tasks.md` | 8 Quebra em tarefas e lotes |
| `tasks.md`, sem `.specs/projeto/jornadas.md` | 8 Quebra em tarefas e lotes (faltam as jornadas) |
| `tasks.md` e `jornadas.md` | **Planejamento concluído**: diga só "O plano está disponível para execução." e encerre |

Para retomar um trabalho já executado, use `/executar`, `/validar` ou `/finalizar`; este fluxo não os conduz.

## 2. Situar o usuário

Uma linha: "**Fase N de 8, <nome>.** Anterior: <fase>, aprovada."

**Validações pendentes** (tabela em `decisao.md`): se houver alguma `pendente`, acrescente uma linha: "Validações pendentes: N (V1 entrevistas, V3 advogado...)". Antes de dar o plano como disponível (fim da fase 8), confira as marcadas como condição para **construção**. Com alguma em aberto, **não conclua o planejamento**: mostre quais faltam e pergunte (via `AskUserQuestion`) se o usuário quer registrar o resultado de alguma, mudar a condição ou parar. As marcadas como condição para **lançamento** continuam registradas em `decisao.md` para a hora do lançamento. Quando o usuário trouxer o resultado de uma validação, atualize a linha da tabela (situação, data, resultado). Se `decisao.md` com "seguir" listar pendências só em texto, sem a tabela, ofereça montá-la.

Todas as fases deste fluxo rendem melhor em Opus: "Esta fase rende melhor em Opus: use `/model opus`." (a trava de modelo do `CLAUDE.md` vale).

## 3. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| 1, 2, 3 | skill `descoberta` | Ela retoma da etapa que falta e para a cada etapa. |
| 4 | skill `viabilidade-tecnica` | |
| 5 | pergunte: "Quer fazer o plano comercial agora? (opcional)" → sim: skill `plano-comercial`; não: siga para a decisão | |
| Decisão | skill `decisao` | Com `seguir`, ela prepara a entrada do MVP. |
| 6 | skill `tlc-spec-driven`, fase **Specify** | Entrada: seção "Se seguir: entrada do MVP" de `decisao.md`. Projeto novo costuma ser de tamanho Complex. |
| 6b | skill `roteiro` | Quebra o MVP em features ordenadas e grava `.specs/projeto/roadmap.md`. Pula sozinha se o escopo cabe em uma feature. Depois dela, as fases 7 e 8 valem para **uma feature por vez**, começando pela primeira do roteiro; a próxima volta ao fluxo (fase 7) depois que a anterior estiver integrada pelo `/validar`. |
| 7 | `tlc-spec-driven`, fase **Design**; depois, se houver interface, skill `mockup-visual` (etapas 1 e 2) | O desenho define telas e fluxos; o mockup define a aparência (direção, guia de estilo, 2 a 3 telas-chave). A fase só fecha com os dois aprovados. Use `leitor-codigo` se já houver código. Escolha de stack difícil de reverter (linguagem, banco, hospedagem) com alternativas reais: skill `escolha-tecnologia`, com `escolha.md` gravado a partir da stack candidata de `viabilidade-tecnica.md`; o Design referencia o `AD-NNN` que ela registra. |
| 8 | `tlc-spec-driven`, fase **Tasks** | **Só a quebra em tarefas e lotes**, em Opus: o `tasks.md` aceito pelo `validate_tasks.py`, com tarefas da menor medida possível (**Estimativa** de até 2h, **Risco**, **Domínio**, **Criticidade**; regra de Tarefas do `CLAUDE.md`) e lotes. **Sem tarefa de infraestrutura** (repositório, ambiente local, esqueleto, CI, staging, produção): isso é do `/preparar`. Com interface, inclua: copiar `.specs/mockup/tokens.css` sem alterar e criar os componentes do guia antes das telas; a checagem `checar-tokens.py` no CI fica com o `/preparar`. Grave também `.specs/projeto/jornadas.md`, com as jornadas ponta a ponta do E2E geral (formato em [references/fases.md](references/fases.md)), derivadas da spec e do roteiro. |
| depois da 8 | **nenhuma peça** | Com o `tasks.md` e o `jornadas.md` prontos, o planejamento está concluído: diga só "O plano está disponível para execução." e encerre. Sem pergunta de próxima fase, sem iniciar lote. |

## 4. Fechar a fase

Nas fases **1 a 7**, quando a peça terminar, apresente:

- o que foi produzido (caminho do arquivo) e 3 a 5 linhas com o essencial;
- o critério de passagem da fase (de `references/fases.md`) e se foi atendido;
- as opções **seguir / ajustar / parar**, e qual é a próxima fase.

Não avance sem aprovação explícita. Ajuste fica na mesma fase. Voltar a uma fase anterior só se a decisão dela mudar.

Na **fase 8** não há aprovação: pronto o `tasks.md` e o `jornadas.md`, a única mensagem é "O plano está disponível para execução." O usuário ajusta pedindo, e o `/executar` é a aprovação.

Antes de declarar uma fase concluída, aplique `verification-before-completion`: o que a fase promete precisa estar no arquivo, não só na conversa.

## Regras

- Ações externas (push, deploy, publicar, banco de produção) exigem confirmação específica, mesmo com a fase aprovada.
- Parar é um resultado válido: registre o motivo no artefato da fase.
- Tudo em português.
