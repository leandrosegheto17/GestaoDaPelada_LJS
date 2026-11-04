---
name: validar
description: Valida uma feature inteira, na mesma branch e worktree em que foi executada — o agente verificador (atendimento do pedido, cobertura por critério, mutações e QA automatizado), a revisão de código e a auditoria de segurança — e consolida o resultado em validation.md. Achando problema, gera um lote de retrabalho separado (Phase Retrabalho R<n> no tasks.md) para o /executar; com PASS e sem retrabalho, integra a feature à branch de origem. Use depois que o /executar disser que a feature está pronta, e de novo depois de cada lote de retrabalho. Não corrige código.
model: sonnet
effort: medium
---

# /validar

Você valida **uma feature por vez**. Quem escreveu o código não verifica: os agentes `verificador` e `auditor-seguranca` e a revisão de código rodam com contexto próprio, e você só consolida, gera o retrabalho e integra. Você **não corrige** nada.

Roda em **Sonnet** (trava de modelo do `CLAUDE.md`).

## 1. Qual feature

Liste os `tasks.md` de `.specs/` (`features/`, `bugs/`, `refatoracoes/`, `performance/`, `redesign/`, `automacoes/`) cujas tarefas estão **todas concluídas** e que ainda não têm `validation.md` com PASS (ou que acabaram de executar um retrabalho). Respeite o argumento recebido. Escolha a **primeira da lista**, na ordem dos lotes do roteiro, e diga qual é. Mais de uma pronta e sem ordem clara: pergunte via `AskUserQuestion`. Tarefa em aberto: **recuse** e diga para rodar `/executar`.

A pasta do item escolhe o modo do `verificador` (o agente já conhece: feature, bug, refatoração, performance, redesign), e a fonte da verdade é a do fluxo dele (spec, `relato.md`/`causa.md`, comportamento inalterado). O relatório leva o nome que o modo manda (`validation.md`, `validation-etapa-<N>.md`, `validation-rodada-<N>.md`). No texto abaixo, "feature" vale para qualquer item.

Entre na worktree e na branch da feature (`git worktree list`): é a mesma do `/executar`. Sem worktree, use a branch `feature/<slug>`.

## 2. Verificações, em paralelo

Dispare numa única mensagem, em segundo plano, o que se aplica:

- agente **`verificador`**, passando a feature, a worktree e, se for rodada de retrabalho, o `validation.md` anterior. Cobre: cada critério rastreado até `arquivo:linha`, cobertura **por critério** (sem percentual), mutações derivadas por ele, **QA automatizado** (a suíte e os testes de tela), checagens de processo e achados com `A-NN`;
- agente **`auditor-seguranca`**, quando a feature tocar login, permissões, pagamento, dados pessoais ou exposição pela internet (ou conforme a regra do fluxo);

e, enquanto eles rodam, aplique a skill **`revisao-codigo` em modo curto** (com o `code-review`) ao diff da feature contra a Branch pai. Ela roda sempre em legado e em toda feature com tarefa de `**Risco**: alto`; nos outros casos, registre que a revisão é a do PR do projeto.

Aguarde os três. Em **rodada de retrabalho**, o escopo é o diff do retrabalho mais a regressão (a suíte inteira).

## 3. Consolidar

Junte tudo em `.specs/features/<feature>/validation.md` (compacto, ~40 linhas; formato em [references/relatorio.md](references/relatorio.md)): tabela critério → `arquivo:linha`, gate, sensor, `## Achados` (`A-NN`, `arquivo:linha`, evidência, correção sugerida, criticidade), pontos da revisão de código e da segurança. Veredito **PASS** só sem achado aberto; qualquer achado é **FAIL** com retrabalho. Rode `python .claude/skills/tlc-spec-driven/scripts/validate_state.py <feature>` quando a feature tiver `spec.md`.

## 4. Com achados: lote de retrabalho

1. Acrescente ao `tasks.md` a Phase `Retrabalho R<n>` (n = rodada), no formato de [references/relatorio.md](references/relatorio.md): uma tarefa por achado, com **Estimativa**, **Risco**, **Domínio**, **Criticidade** (a do achado) e a referência ao `A-NN`, no tamanho de tarefa do `CLAUDE.md`. É um **lote próprio**, separado dos normais. Rode `validate_tasks.py` e `progresso.py --lote`.
2. Commit na branch da feature (`chore(validar): ...`), com `validation.md` e `tasks.md`.
3. Diga apenas: **"Retrabalho R<n> gerado (<N> tarefas): rode /executar e depois /validar de novo."** A partir da **3ª rodada**, pergunte via `AskUserQuestion` se segue, ajusta o escopo ou para.

## 5. Com PASS: integrar a feature

1. `python .claude/scripts/trava-testes.py --rodar` na branch (suíte verde registrada).
2. Pergunte via `AskUserQuestion` como integrar à **Branch pai**: **merge local**, **PR** ou **deixar para depois**. Siga a skill `finishing-a-development-branch`. **Push, PR e merge exigem a confirmação específica** daquela ação.
3. Integrada: grave `<pasta do item>/integracao.md` (data, forma, commit, suíte, validação), troque a Situação no `roadmap.md` se houver e ofereça remover a worktree (`git worktree remove`). Faça o **registro** que a seção "Para o /executar e o /validar" da skill do fluxo do item pede (ex.: legado e feature: contexto do projeto, `inventario.md` e promoção do mockup; item vindo de demanda: avisar que ela pode ir ao fechamento). Etapas (refatoração e redesign em modo grande): valide e integre uma etapa por vez, como o `refatoracao.md` ou o `redesign.md` indicam.
4. Diga: **"Feature <nome> validada e integrada."** Se não restar feature por validar, acrescente que, com o Nível 2 do `/preparar` completo, o próximo passo é `/finalizar`.

## Regras

- Não corrija código, não enfraqueça nem apague teste, não edite a spec para o critério passar.
- Quem constrói nunca recebe a lista de mutações do verificador.
- Contexto grande: se o `contexto.py` passar do limite, pare e peça `/clear` e `/validar`; o estado está nos arquivos.
- Tudo em português.
