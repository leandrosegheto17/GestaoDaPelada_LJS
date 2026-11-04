---
name: feature
description: Orquestra o planejamento de uma feature em projeto existente feito com IA — pedido (spec), reconhecimento do código, mockup das telas novas (mockup-visual em modo módulo), plano e rede de proteção planejada (tarefa T0 e linha de base), terminando no tasks.md com tarefas e lotes — descobrindo a fase pelos artefatos em .specs/features/<feature>/ e pedindo aprovação a cada fase de planejamento. A execução, a validação e o lançamento são dos comandos /executar, /validar e /finalizar. Use quando o usuário quiser adicionar uma funcionalidade a um projeto que já existe, ou via /fluxo. Não use para projeto do zero (projeto-novo, uso-proprio) nem para código legado sem testes (fluxo de legado).
---

# Feature em projeto existente (fluxo 3)

Você é o **orquestrador do planejamento**. As 4 fases e seus critérios estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

Princípio: **entender o que já existe e não quebrar nada.** A feature segue as convenções do projeto, mesmo que haja jeito melhor; melhorar o resto é outra tarefa.

**O fluxo termina no `tasks.md`** (tarefas e lotes). Não implemente, verifique, integre nem libere nada aqui: isso é de `/executar`, `/validar` e `/finalizar` (seção **Fim do planejamento** do `CLAUDE.md`).

## 1. Qual feature

Liste `.specs/features/`. Features **em andamento** são as que não têm `integracao.md`.

- Nenhuma em andamento: é uma feature nova; siga para a fase 1.
- Uma ou mais: pergunte via `AskUserQuestion` qual retomar, com a opção **Feature nova**.

**Entrada pronta (modo enxuto).** Feature nova com `plano.md` na pasta do épico ou com critérios de aceite escritos: pergunte uma vez, via `AskUserQuestion` e junto com a trava de modelo, **modo enxuto (Recomendado)** ou **modo completo**. Enxuto segue a seção **Modo enxuto** do `CLAUDE.md`: o agente `planejador` grava só o `tasks.md` (sem spec, reconhecimento nem proteção separados) e a sessão diz que o plano está pronto. Dúvida sobre a entrada estar atual: completo.

**Chamada por outro fluxo:** `spec.md` com **Chamado por** `integração <slug>` (skill `integracao-terceiros`) segue estas fases com os acréscimos de [composicao.md](../integracao-terceiros/references/composicao.md) (critérios de falha, reaproveitar resiliência, auditoria restrita no lugar do `auditor-seguranca` avulso). Com **Chamado por** `automação <slug>` (skill `automacao`), os acréscimos são os de [composicao.md](../automacao/references/composicao.md) (critérios `AUT-NN`, casos iguais ao manual, entrada inerte). Com o `tasks.md` pronto, volte ao chamador.

**Vinda de uma demanda** (sugestão, solicitação ou suporte): o Specify parte de `.specs/demandas/DEM-NNN-<slug>/encaminhamento.md` (problema, critérios de aceite, fora de escopo) e o `spec.md` leva no topo **Origem**: `demanda DEM-NNN`. Se for **solicitação** (skill `solicitacao`), os `CA-NN` já foram confirmados por escrito: o Specify os traduz em EARS citando o `CA-NN` de origem e pergunta só o técnico; dúvida que mudaria um `CA-NN`, o escopo ou o prazo volta à `solicitacao` antes de seguir. Ao fechar cada fase, se o **Próximo marco** de `solicitacao.md` for essa fase, lembre a atualização ao solicitante (fase 7 dela).

## 2. Descobrir a fase da feature

A **primeira linha que se aplica** define a fase:

| Situação em `.specs/features/<feature>/` | Fase atual |
|---|---|
| `tasks.md` com `**Modo**: enxuto` | Planejamento concluído |
| sem `spec.md` | 1 Pedido |
| `spec.md`, sem `reconhecimento.md` | 2 Reconhecimento |
| `reconhecimento.md` com **Mockup** `pendente` | 2b Mockup |
| `reconhecimento.md` e **Plano aprovado em** `pendente` | 3 Plano |
| plano aprovado, `tasks.md` sem a tarefa T0 e a `## Linha de base` (ou sem `**Branch pai**`) | 4 Rede de proteção planejada |
| `tasks.md` completo, com lotes | Planejamento concluído |

**Planejamento concluído:** diga apenas **"O plano está disponível para execução."** Se já há tarefas concluídas ou em andamento, acrescente em uma linha que o próximo passo é `/executar` (tarefas em aberto) ou `/validar` (todas concluídas).

## 3. Situar o usuário

Uma linha: "**Feature <nome>, fase N de 4, <fase>.**" Avise a troca de modelo: toda fase deste fluxo é de planejamento e rende melhor em Opus ("use `/model opus`"). No **modo enxuto**, diga "**Feature <nome>, modo enxuto.**" e não avise troca por fase: o `planejador` já roda em Opus (modelo fixo, regra **Modelo pela entrada** do `CLAUDE.md`).

## 4. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| Enxuto: planejamento | agente `planejador`, passando a Base (plano ou critérios), a pasta `.specs/features/<feature>/` e a **Branch pai** | Ele grava só o `tasks.md` e devolve divergências em "Perguntas para o usuário". Sem aprovação ao fim: resolva as perguntas e diga a mensagem final. Mockup só se o delta disser que há tela **nova**. |
| 1 Pedido | `tlc-spec-driven`, fase **Specify** | Critérios de aceite testáveis e o que fica de fora. Deixe o tlc dimensionar (Small, Medium, Large). Se o pedido for grande demais para uma feature (vários fluxos de valor que não se validam nem se liberam juntos), acione antes a skill `roteiro`. |
| 2 Reconhecimento | skill `inventario` (cria ou atualiza `.specs/projeto/inventario.md`), depois skill `reconhecimento` | O reconhecimento decide, para cada necessidade, reaproveitar / estender / criar. Se ele escalar (mudança grande de arquitetura), siga a decisão do usuário. Com `plano.md` pronto na pasta do épico, vale a seção **Plano pronto** do `CLAUDE.md`: conferência do delta, não nova investigação. |
| 2b Mockup | pergunte via `AskUserQuestion`: **fazer o mockup das telas (Recomendado)** ou **dispensar** (motivo). Fazer: skill `mockup-visual` em **modo módulo**, pasta `.specs/features/<feature>/mockup/` | Só quando o reconhecimento diz que a feature cria ou muda telas. Aprovado: **Mockup** `aprovado` no `reconhecimento.md`; dispensado: `dispensado — <motivo>`. |
| 3 Plano | `tlc-spec-driven`, fases **Design** e **Tasks** (ele pula o que não precisa) | Passe o `reconhecimento.md` (e o mockup aprovado): o plano segue a tabela de reaproveitamento, o modelo a seguir e as convenções. Peça nova fora da tabela precisa de justificativa. Toda tarefa tem teste e a menor possível, com **Estimativa** de até 2h (regra de Tarefas do `CLAUDE.md`). Aprovado, grave a data em **Plano aprovado em** no `reconhecimento.md`. |
| 4 Rede de proteção planejada | método da skill `rede-de-protecao`, **só planejando** | Rode a suíte uma vez e grave a `## Linha de base` no `tasks.md` (comando, resultado, falhas preexistentes). Se a mudança toca comportamento existente sem teste, a primeira tarefa (**T0**) o caracteriza. Registre no topo `**Branch pai**: <nome>` (padrão: a branch atual): é onde o `/validar` integra. Rode `validate_tasks.py`. Não escreva testes nem código: o `/executar` faz a T0. Pronto, diga a mensagem final. |

Fases posteriores (implementação, verificação, integração, liberação): **não são deste fluxo**. `/executar` constrói numa worktree da feature, sem skills nem subagentes; `/validar` roda `verificador`, `revisao-codigo` e `auditor-seguranca`, gera o lote de retrabalho e, com PASS, integra; `/finalizar` lança e abre a operação; `/preparar` cuida da infraestrutura, em paralelo ao `/executar`.

## 5. Fechar a fase

Nas fases 1, 2, 2b e 3, apresente o que foi produzido (caminho e 3 a 5 linhas) e o critério de passagem, e pergunte via `AskUserQuestion`: **seguir / ajustar / parar**. A **última** fase (4, ou o planejamento enxuto) não pergunta: termina com **"O plano está disponível para execução."** Antes de declarar uma fase concluída, aplique `verification-before-completion`.

## Para o /executar e o /validar

- **Rede de proteção:** a T0 é executada primeiro; a suíte inteira roda ao fim da feature; nenhuma falha nova além das preexistentes da `## Linha de base`.
- **Revisão:** o `/validar` roda `revisao-codigo` em modo curto quando alguma tarefa é de `**Risco**: alto`, e o `auditor-seguranca` se a feature toca login, permissões, pagamento ou dados pessoais. Com **Mockup** `aprovado`, compara as telas do módulo (etapa 3 da `mockup-visual`).
- **Ao integrar (PASS):** atualize o contexto do projeto (`CLAUDE.md` ou equivalente, nas seções de [contexto-ia.md](../documentar/references/contexto-ia.md)) e promova as telas do mockup aprovado para `.specs/mockup/` ([modulo.md](../mockup-visual/references/modulo.md)), na mesma branch; corrija `docs/` ou README que a feature tornou falsos.
- **Demanda de origem:** quando o `/validar` integrar, avise que a demanda pode ir ao fechamento com o autor (skill `demandas`).

## Regras

- A feature segue as convenções do projeto. Refatoração vira outra tarefa (skill `refatoracao`, fluxo 13), nunca entra junto.
- Diff pequeno e branch isolada (a worktree é criada pelo `/executar`).
- Push, PR, deploy e alterações em banco de produção exigem confirmação específica.
- Tudo em português.
