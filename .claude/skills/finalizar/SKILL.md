---
name: finalizar
description: Fecha o projeto depois que todas as features foram executadas, validadas e integradas — confere o Nível 2 do /preparar, roda o E2E geral do projeto (as jornadas ponta a ponta definidas no planejamento), faz o lançamento (fase 11) e abre a operação e o aprendizado (fase 12). Falha no E2E geral gera retrabalho no mesmo formato do /validar. Use quando todo o projeto estiver pronto e reintegrado com os merges, ou quando o usuário digitar /finalizar. Recusa começar com feature por validar ou com o Nível 2 aberto.
model: sonnet
effort: medium
---

# /finalizar

Fecha o projeto: testa o conjunto, lança e deixa a operação combinada. Roda em **Sonnet** (trava de modelo do `CLAUDE.md`).

## 1. Condições para começar

Verifique tudo antes de qualquer ação e **recuse listando o que falta**:

1. Todo item com `tasks.md` em `.specs/` (features, bugs, refatorações...) tem relatório de validação com PASS e `integracao.md` (integrado à branch de origem). Feature por validar ou por integrar: diga qual e para rodar `/executar` ou `/validar`.
2. `python .claude/scripts/preparacao.py --nivel2` completo. Aberto: liste os itens e diga para rodar `/preparar`.
3. Branch de origem atualizada, árvore limpa, e `python .claude/scripts/trava-testes.py --rodar` verde.

## 2. E2E geral do projeto

1. As jornadas ponta a ponta saem do **planejamento** (`.specs/projeto/jornadas.md`, escrito junto com os lotes do projeto novo ou do uso próprio). Sem o arquivo: em projeto que acabou de ser construído, proponha as jornadas a partir da spec e do roteiro e peça aprovação via `AskUserQuestion` antes de rodar; em projeto existente que só recebeu uma mudança, pergunte se há jornadas gerais a rodar ou se o E2E geral não se aplica (registre o motivo).
2. Rode cada jornada no **staging** (Nível 2 do `/preparar`); sem staging, no ambiente local. Registre em `.specs/e2e-geral.md`: jornada, ambiente, resultado e evidência (comando, saída, captura).
3. Todas verdes: segue. **Falha:** não lance. Gere o retrabalho como o `/validar` faz (Phase `Retrabalho R<n>` em `.specs/features/e2e-geral/tasks.md`, uma tarefa por falha, com `A-NN`), e diga: **"E2E geral reprovou: rode /executar e depois /finalizar de novo."**

Projeto que vai à internet ou trata dado pessoal e não teve auditoria do conjunto: ofereça a skill `auditoria-seguranca` com escopo restrito antes do lançamento.

## 3. Lançamento (fase 11)

- Produto para vender, projeto existente com usuários ou correção em produção: skill **`liberacao`** (staging, flag, liberação gradual, pausa antes de produção, monitoramento, reversão testada; hotfix conforme a skill `bug`).
- Uso próprio (há `necessidade.md`): skill **`implantacao`** (script único, teste de fumaça, backup rodado).

**Deploy, banco de produção e publicação exigem a confirmação específica** daquela ação, mesmo com tudo aprovado.

## 3b. Fechamento dos itens

Depois de liberar, feche cada item que a skill do fluxo dele manda fechar na seção "Para o /executar e o /validar": bug (`fechamento.md`, aviso ao relator com confirmação, recorrência), incidente (post-mortem, prevenção e comunicação, sem deixar a LGPD em aberto), demanda ligada (conferir ligações e avisar o autor, com confirmação) e os registros de resultado de refatoração, performance, redesign, integração e automação (medição depois da liberação, operação e manutenção).

## 4. Operação e aprendizado (fase 12)

Grave `.specs/operacao.md`: como acompanhar (métricas e alertas combinados), quem responde, a hipótese do produto e como saber se ela se confirmou, e a data da primeira revisão (uso próprio: a revisão periódica de `.claude/skills/uso-proprio/references/fases.md`). Decisão a tomar na revisão: **persistir, pivotar, evoluir ou encerrar**; evolução volta ao `/fluxo` como feature.

## 5. Fechar

Atualize a Situação do produto no `roadmap.md` (se houver) e diga o resumo: E2E geral, lançamento (onde e quando), operação (próxima revisão). Nada mais fica pendente no projeto.

## Regras

- Não corrija código aqui: falha vira retrabalho para o `/executar`.
- Contexto grande: se o `contexto.py` passar do limite, pare e peça `/clear` e `/finalizar`.
- Tudo em português.
