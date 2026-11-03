---
name: feature
description: Orquestra o fluxo de feature em projeto existente feito com IA — pedido (spec), reconhecimento do código, mockup das telas novas (mockup-visual em modo módulo), plano, rede de proteção, implementação em branch isolada, verificação (verificador + revisao-codigo em modo curto) e integração — descobrindo a fase pelos artefatos em .specs/features/<feature>/ e pedindo aprovação a cada fase. Use quando o usuário quiser adicionar uma funcionalidade a um projeto que já existe, ou via /fluxo. Não use para projeto do zero (projeto-novo, uso-proprio) nem para código legado sem testes (fluxo de legado).
---

# Feature em projeto existente (fluxo 3)

Você é o **orquestrador**. As 7 fases e seus critérios estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

Princípio: **entender o que já existe e não quebrar nada.** A feature segue as convenções do projeto, mesmo que haja jeito melhor; melhorar o resto é outra tarefa.

## 1. Qual feature

Liste `.specs/features/`. Features **em andamento** são as que não têm `integracao.md`.

- Nenhuma em andamento: é uma feature nova; siga para a fase 1.
- Uma ou mais: pergunte via `AskUserQuestion` qual retomar, com a opção **Feature nova**.

**Entrada pronta (modo enxuto).** Feature nova com `plano.md` na pasta do épico ou com critérios de aceite escritos: pergunte uma vez, via `AskUserQuestion` e junto com a trava de modelo, **modo enxuto (Recomendado)** ou **modo completo**. Enxuto segue a seção **Modo enxuto** do `CLAUDE.md`: o agente `planejador` grava só o `tasks.md` (sem spec, reconhecimento nem proteção separados), há uma aprovação, e a sessão fica em Sonnet. Dúvida sobre a entrada estar atual: completo.

**Chamada por outro fluxo:** `spec.md` com **Chamado por** `integração <slug>` (skill `integracao-terceiros`) segue estas fases com os acréscimos de [composicao.md](../integracao-terceiros/references/composicao.md) (critérios de falha, reaproveitar resiliência, auditoria restrita no lugar do `auditor-seguranca` avulso). Com **Chamado por** `automação <slug>` (skill `automacao`), os acréscimos são os de [composicao.md](../automacao/references/composicao.md) (critérios `AUT-NN`, casos iguais ao manual, entrada inerte). Ao gravar `integracao.md`, volte ao chamador.

**Vinda de uma demanda** (sugestão, solicitação ou suporte): o Specify parte de `.specs/demandas/DEM-NNN-<slug>/encaminhamento.md` (problema, critérios de aceite, fora de escopo) e o `spec.md` leva no topo **Origem**: `demanda DEM-NNN`. Ao gravar `integracao.md`, avise que a demanda pode ir ao fechamento com o autor (skill `demandas`, conferir ligações). Se for **solicitação** (skill `solicitacao`), os `CA-NN` já foram confirmados por escrito: o Specify os traduz em EARS citando o `CA-NN` de origem e pergunta só o técnico; dúvida que mudaria um `CA-NN`, o escopo ou o prazo volta à `solicitacao` antes de seguir. Ao fechar cada fase, se o **Próximo marco** de `solicitacao.md` for essa fase, lembre a atualização ao solicitante (fase 7 dela).

## 2. Descobrir a fase da feature

A **primeira linha que se aplica** define a fase:

| Situação em `.specs/features/<feature>/` | Fase atual |
|---|---|
| `tasks.md` com `**Modo**: enxuto` | tarefas em aberto: 5 Implementação; todas concluídas, sem `validation.md` com PASS: 6 Verificação; PASS, sem `integracao.md`: 7 Integração |
| sem `spec.md` | 1 Pedido |
| `spec.md`, sem `reconhecimento.md` | 2 Reconhecimento |
| `reconhecimento.md` com **Mockup** `pendente` | 2b Mockup |
| `reconhecimento.md`, sem `protecao.md`, e **Plano aprovado em** `pendente` no `reconhecimento.md` | 3 Plano |
| plano aprovado, sem `protecao.md` | 4 Rede de proteção |
| `protecao.md`, com tarefas em aberto ou sem `validation.md` | 5 Implementação |
| todas as tarefas concluídas, sem `validation.md` com PASS | 6 Verificação |
| `validation.md` com PASS, sem `integracao.md` | 6 Verificação (revisão do diff e segurança) e 7 Integração |

## 3. Situar o usuário

Uma linha: "**Feature <nome>, fase N de 7, <fase>.**" Avise a troca de modelo:

- fases 1, 2b e 3: "Esta fase rende melhor em Opus: use `/model opus`."
- demais: "Esta fase pode seguir em Sonnet: use `/model sonnet`."

No **modo enxuto**, diga "**Feature <nome>, modo enxuto.**" e não avise troca de modelo por fase: a sessão fica em Sonnet e o `planejador` já roda em Opus (modelo fixo, regra **Modelo pela entrada** do `CLAUDE.md`).

## 4. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| Enxuto: planejamento | agente `planejador`, passando a Base (plano ou critérios), a pasta `.specs/features/<feature>/` e a branch | Ele grava só o `tasks.md` e devolve divergências em "Perguntas para o usuário". Mostre o resumo (delta, tarefas, lotes, modelo, gate) e faça a **única** aprovação (`AskUserQuestion`: seguir / ajustar / parar); "seguir" cria a branch `feature/<nome>` e despacha o primeiro lote. Mockup só se o delta disser que há tela **nova**. |
| 1 Pedido | `tlc-spec-driven`, fase **Specify** | Critérios de aceite testáveis e o que fica de fora. Deixe o tlc dimensionar (Small, Medium, Large). Se o pedido for grande demais para uma feature (vários fluxos de valor que não se validam nem se liberam juntos), acione antes a skill `roteiro`. |
| 2 Reconhecimento | skill `inventario` (cria ou atualiza `.specs/projeto/inventario.md`), depois skill `reconhecimento` | O reconhecimento decide, para cada necessidade, reaproveitar / estender / criar. Se ele escalar (mudança grande de arquitetura), siga a decisão do usuário. Com `plano.md` pronto na pasta do épico, vale a seção **Plano pronto** do `CLAUDE.md`: conferência do delta, não nova investigação. |
| 2b Mockup | pergunte via `AskUserQuestion`: **fazer o mockup das telas (Recomendado)** ou **dispensar** (motivo). Fazer: skill `mockup-visual` em **modo módulo**, pasta `.specs/features/<feature>/mockup/` | Só quando o reconhecimento diz que a feature cria ou muda telas. Aprovado: **Mockup** `aprovado` no `reconhecimento.md`; dispensado: `dispensado — <motivo>`. |
| 3 Plano | `tlc-spec-driven`, fases **Design** e **Tasks** (ele pula o que não precisa) | Passe o `reconhecimento.md` (e o mockup aprovado: as telas seguem ele): o plano segue a tabela de reaproveitamento, o modelo a seguir e as convenções. Peça nova fora da tabela precisa de justificativa. Toda tarefa tem teste. Cada tarefa é a menor possível, com **Estimativa** de até 2h de trabalho humano (regra de Tarefas do `CLAUDE.md`). Aprovado, grave a data em **Plano aprovado em** no `reconhecimento.md`. |
| 4 Rede de proteção | crie a branch `feature/<nome>` (ou worktree, com `using-git-worktrees`); depois a skill `rede-de-protecao` | |
| 5 Implementação | `tlc-spec-driven`, fase **Execute**, na branch | Os lotes vão ao agente `executor`, 6 por marco, com teste primeiro, com o ciclo da **criticidade** do lote e a linha V2 ao fim dele (seção Execução do `CLAUDE.md`). A suíte inteira roda no marco e ao fim: nenhuma falha nova além das preexistentes de `protecao.md`. |
| 6 Verificação | verificador do `tlc-spec-driven` (agente `verificador`, com a **Verificação proporcional** do `CLAUDE.md`); com PASS e **só se alguma tarefa for de `**Risco**: alto`**, a skill `revisao-codigo` em modo curto (grave `.specs/revisoes/<feature>/revisao.md` com `spec.md` como pedido, **Fases** 4, 7 e 8, **Devolver após** `análise`), que aciona o `code-review` no diff da branch | Se a feature toca login, permissões, pagamento ou dados pessoais, despache também o `auditor-seguranca`. Com **Mockup** `aprovado`, compare as telas do módulo (etapa 3 da `mockup-visual`). Achado bloqueante vira tarefa e volta à fase 5. |
| 7 Integração | veja abaixo | |

### Integração (fase 7)

0. **Checagem final de testes:** na branch, com tudo commitado, rode `python .claude/scripts/trava-testes.py --rodar` e mostre o resultado. Falha bloqueia a integração e volta à fase 5. (Falha preexistente registrada em `protecao.md` precisa ser corrigida ou excluída da suíte com aprovação do usuário antes de integrar, porque a trava exige suíte verde.)
1. **Contexto do projeto:** atualize o arquivo de instruções do projeto (`CLAUDE.md` ou equivalente) com o que esta feature ensinou: novo padrão, comando novo, armadilha, nas seções do modelo de [contexto-ia.md](../documentar/references/contexto-ia.md). Se não existia contexto, crie um mínimo (orientação, onde fica cada coisa, rodar e verificar, convenções) a partir do `reconhecimento.md`. Se a feature torna falso algo em `docs/` ou no README, corrija na mesma branch. Mostre o diff ao usuário.
2. **Forma de integrar:** pergunte via `AskUserQuestion`: **merge local** na branch principal, **PR no GitHub** (push e abertura do PR são ações externas, com confirmação) ou **manter a branch**. Use `finishing-a-development-branch` para executar.
3. **Mockup aprovado:** promova as telas para `.specs/mockup/` (seção "Promoção" de [modulo.md](../mockup-visual/references/modulo.md)), na mesma branch.
4. Grave `.specs/features/<feature>/integracao.md`: data, forma (merge, PR com link, branch mantida), commit final, resultado da suíte na checagem final, contexto atualizado (sim/não).

## 5. Fechar a fase

Apresente o que foi produzido (caminho e 3 a 5 linhas) e o critério de passagem, e pergunte via `AskUserQuestion`: **seguir / ajustar / parar**. No modo enxuto só há duas aprovações: a do planejamento e a da integração. Antes de declarar uma fase concluída, aplique `verification-before-completion`.

## Regras

- A feature segue as convenções do projeto. Refatoração vira outra tarefa (skill `refatoracao`, fluxo 13), nunca entra junto.
- Diff pequeno e branch isolada.
- Push, PR, deploy e alterações em banco de produção exigem confirmação específica.
- Tudo em português.
