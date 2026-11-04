---
name: executar
description: Executa o tasks.md de uma feature na sessão principal, sem skills e sem subagentes, em uma worktree própria da feature — lê os lotes e as tarefas, escreve testes a partir dos critérios, implementa e fecha cada lote com um commit, medindo o contexto ao fim de cada lote (acima de 300k, para e pede /clear). Sem PR por lote; a integração é do /validar. Use quando o fluxo disser que o plano está disponível, ou para executar o lote de retrabalho gerado pelo /validar. Recusa começar se o Nível 1 do /preparar estiver incompleto. Não planeja, não valida e não faz push.
model: sonnet
effort: medium
---

# /executar

Você **só executa**. Nada de skills, nada de subagentes: não use a ferramenta `Skill`, não use `Agent`, nem `leitor-codigo`. Você tem o `tasks.md`, o código e a seção **Execução** do `CLAUDE.md`. Esta sessão é a que escreve o código; quem verifica depois é o `/validar`.

Roda em **Sonnet** (trava de modelo do `CLAUDE.md`).

## 1. Qual feature

Liste os `tasks.md` com tarefa em aberto em `.specs/` (`features/`, `bugs/`, `refatoracoes/`, `performance/`, `redesign/` e `automacoes/`; `python .claude/scripts/progresso.py` ajuda). A pasta que tem o `tasks.md` é o "item"; no texto abaixo, "feature" vale para qualquer item. Respeite o argumento recebido, se houver. Mais de uma: pergunte qual (via `AskUserQuestion`), a mais antiga primeiro como recomendada. Nenhuma: diga que não há plano a executar e que o `/fluxo` faz o planejamento.

## 2. Condições para começar

1. `python .claude/scripts/preparacao.py --nivel1`. Saída diferente de 0: **recuse**, mostre os itens que faltam e diga para rodar `/preparar`. Não escreva nada.
2. A feature depende de outra que ainda não está integrada (campo **Branch pai** no topo do `tasks.md`)? Diga e confirme a branch pai.
3. `python .claude/scripts/preparar-ambiente.py` uma vez antes do primeiro lote do projeto; corrija o que ele apontar.

## 3. Worktree da feature

- `git worktree list`. Se a feature já tem worktree, entre nela e retome.
- Senão: **Branch pai** = a do topo do `tasks.md` (`**Branch pai**: <nome>`) ou a branch atual (padrão `main`). Crie fora da pasta do projeto:
  `git worktree add ../<projeto>-<slug> -b feature/<slug> <pai>`
- Trabalhe nela até o fim. Registre a Branch pai no topo do `tasks.md` se faltar. A trava de testes e o hook de commit valem na worktree.

## 4. Os lotes

`python .claude/scripts/progresso.py --lote` diz o lote atual e a criticidade. Para cada lote, na ordem:

1. Siga o **ciclo do lote comum** ou o **do lote crítico** da seção Execução do `CLAUDE.md`: testes a partir dos critérios, vermelho no crítico, código, gate do lote.
2. **Vizinhança antes de editar** (`Molde: <arquivo:linha>` no commit); a decisão nomeada na tarefa vale literalmente (Reuses).
3. Tarefa de `**Domínio**: sim`: antes de codar, liste os casos limite e os estados. Lacuna da spec: **pare e pergunte** via `AskUserQuestion`.
4. **Commit por grupo de tarefas**, em português, citando `Tn` e `FUN-NN`, cada um fechando verde. Depois, **um commit de fechamento do lote** com o status no `tasks.md` e `Gate: <comando> @ <árvore> = <resultado>`, sem `amend`.
5. Mostre a linha de `progresso.py --lote`.
6. **Contexto:** rode `python .claude/scripts/contexto.py`. Saída 1 (acima de 300k): **pare**, diga só "Contexto acima do limite: rode /clear e depois /executar" e não comece o lote seguinte. O estado está no `tasks.md` e no git.

Item em **etapas** (refatoração e redesign em modo grande): uma etapa por vez, na ordem do `refatoracao.md` ou do `redesign.md`, cada uma com o gate que a skill do fluxo manda (a seção "Para o /executar e o /validar" dela vale).

Lote de **retrabalho** (Phase `Retrabalho R<n>`, gerada pelo `/validar`) é executado como qualquer outro, depois dos normais; cada tarefa cita o achado `A-NN` que corrige.

Falha ou bloqueio: não marque a tarefa; pare e diga o motivo. Teste que falha de forma inesperada: ache a causa raiz antes de mudar qualquer coisa.

## 5. Fim da feature

Com todas as tarefas concluídas: rode o **gate completo** (lint, format, checagens do CI e a suíte inteira) e corrija o que falhar. Depois diga apenas: **"Feature <nome> pronta para validar: rode /validar."** com a linha final do `progresso.py`.

## Regras

- **Nunca** enfraqueça, pule ou apague um teste para fazê-lo passar; mudar teste existente exige o motivo no commit e a aprovação da regra de Testes.
- Nada de "já que estou aqui": só o escopo das tarefas.
- Divergiu da spec ou do desenho? `SPEC_DEVIATION: <o quê>` no código e no commit; siga as ADs do `STATE.md`.
- **Sem push, sem PR, sem merge, sem deploy.** A integração é do `/validar`, com confirmação específica.
- Tarefa de interface: só `tokens.css` e os componentes do guia; prova de tela conforme a seção Execução.
- Tudo em português.
