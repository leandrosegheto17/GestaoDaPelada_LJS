---
name: uso-proprio
description: Orquestra o fluxo de aplicação para uso próprio (ferramenta pessoal, só o usuário usa, servidor local com Docker ou nuvem gratuita, custo zero) até o plano de tarefas e lotes — descobre a fase pelos artefatos em .specs/, avisa a troca de modelo, aciona a peça certa (necessidade, tlc-spec-driven) e pede aprovação ao fim de cada fase de planejamento. Termina no tasks.md pronto: infraestrutura, construção, validação e implantação são dos comandos /preparar, /executar, /validar e /finalizar. Use quando o usuário quiser construir ou retomar uma ferramenta pessoal, ou via /fluxo. Não use para produto que será vendido (projeto-novo) nem para feature em projeto existente.
---

# Uso próprio (fluxo 2)

Você é o **orquestrador**: decide a fase, aciona a peça certa e controla as aprovações. As 5 fases do fluxo e seus critérios estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

Princípio: **menos cerimônia**. O usuário é o único usuário; não há plano comercial, nem lançamento gradual, nem suporte. O risco principal é **perder os dados**, e a ferramenta morre por **abandono**, não por falta de clientes.

**O fluxo termina no planejamento.** Pronto o `tasks.md` (tarefas e lotes) e o `jornadas.md`, nada mais é feito aqui: ambiente, esqueleto, CI e backup são do `/preparar`; a construção é do `/executar`; a validação, do `/validar`; a implantação e a revisão periódica (manter, evoluir ou aposentar), do `/finalizar` (seção Fim do planejamento do `CLAUDE.md`).

## 1. Descobrir onde estamos

A **primeira linha que se aplica** define a fase:

| Situação dos arquivos | Fase atual |
|---|---|
| sem `.specs/produto/necessidade.md` | 1 a 3 Necessidade, escopo e restrições |
| `necessidade.md` com veredito `adaptar algo pronto` ou `desistir` | Encerrado: mostre o veredito e, se for adaptar, ofereça ajudar a configurar a solução pronta |
| `necessidade.md` com `construir`, sem `.specs/features/*/spec.md` | 4 Desenho enxuto |
| `spec.md`, e `necessidade.md` sem **Mockup** | 4 Desenho enxuto (mockup) |
| `spec.md`, sem `tasks.md` | 5 Quebra em tarefas e lotes |
| `tasks.md`, sem `.specs/projeto/jornadas.md` | 5 Quebra em tarefas e lotes (faltam as jornadas) |
| `tasks.md` e `jornadas.md` | **Planejamento concluído**: diga só "O plano está disponível para execução." e encerre |

## 2. Situar o usuário

Uma linha: "**Fase N de 5, <nome>.** Anterior: <fase>, aprovada." Todas as fases deste fluxo rendem melhor em Opus: "Esta fase rende melhor em Opus: use `/model opus`." (a trava de modelo do `CLAUDE.md` vale).

## 3. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| 1 a 3 | skill `necessidade` | Uma conversa, um arquivo, uma aprovação. |
| 3b | skill `roteiro` (só se o escopo não cabe em uma feature) | Ferramenta pessoal quase sempre cabe em uma: a skill pula e diz o motivo. |
| 4 | `tlc-spec-driven`, fase **Specify** (e Design só se ele julgar necessário) | Entrada: `necessidade.md`. Projeto pessoal costuma ser Small ou Medium: deixe o tlc dimensionar. Os requisitos de **backup, restauração testada** e, se exposto pela internet, **autenticação e HTTPS** entram como critérios de aceite (o `/validar` os confere e o `/preparar` os prepara). Depois do Specify, se a ferramenta tem tela, pergunte via `AskUserQuestion`: **fazer o mockup (Recomendado)** ou **dispensar**. Fazer: skill `mockup-visual` (direções, guia e 2 a 3 telas-chave em `.specs/mockup/`). Registre em `necessidade.md` a linha **Mockup**: `aprovado`, `dispensado — <motivo>` ou `não se aplica` (sem tela). |
| 5 | `tlc-spec-driven`, fase **Tasks** (se ele não a pular) | **Só a quebra em tarefas e lotes**, em Opus: o `tasks.md` aceito pelo `validate_tasks.py`, com tarefas da menor medida possível (**Estimativa** de até 2h, **Risco**, **Domínio**, **Criticidade**; regra de Tarefas do `CLAUDE.md`) e lotes; projeto pequeno é um lote só. **Sem tarefa de infraestrutura** (ambiente Docker, esqueleto, CI, script de backup e de restauração, implantação): isso é do `/preparar`. Grave também `.specs/projeto/jornadas.md`, com as jornadas ponta a ponta do E2E geral (formato em [../projeto-novo/references/fases.md](../projeto-novo/references/fases.md)), derivadas da spec. |
| depois da 5 | **nenhuma peça** | Com o `tasks.md` e o `jornadas.md` prontos, o planejamento está concluído: diga só "O plano está disponível para execução." e encerre. Sem pergunta de próxima fase, sem iniciar lote. |

## 4. Fechar a fase

Nas fases **1 a 4**, apresente o que foi produzido (caminho do arquivo e 3 a 5 linhas com o essencial), o critério de passagem e se foi atendido, e pergunte via `AskUserQuestion`: **seguir / ajustar / parar**, dizendo qual é a próxima fase.

Não avance sem aprovação explícita. Antes de declarar uma fase concluída, aplique `verification-before-completion`.

Na **fase 5** não há aprovação: pronto o `tasks.md` e o `jornadas.md`, a única mensagem é "O plano está disponível para execução." O usuário ajusta pedindo, e o `/executar` é a aprovação.

## Regras

- Ações externas (push, publicar na nuvem, apagar dados) exigem confirmação específica.
- Parar é um resultado válido: registre o motivo.
- Tudo em português.
