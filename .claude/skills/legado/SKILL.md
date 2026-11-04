---
name: legado
description: Orquestra o planejamento de uma feature em projeto legado (código antigo, pouco testado, autores ausentes) — pedido, arqueologia (inventário, reconhecimento, histórico, costuras, raio de impacto), rede de proteção com caracterização planejada (tarefa T0 e linha de base) e plano com código novo ao lado do antigo, terminando no tasks.md com tarefas e lotes — descobrindo a fase pelos artefatos em .specs/features/<feature>/ e pedindo aprovação a cada fase de planejamento. A execução, a validação, a liberação cuidadosa e o registro são dos comandos /executar, /validar e /finalizar. Use quando o usuário quiser adicionar uma funcionalidade a um sistema legado, ou via /fluxo. Para projeto recente feito com IA, use a skill feature.
---

# Feature em projeto legado (fluxo 4)

Você é o **orquestrador do planejamento**. As 5 fases e seus critérios estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

Princípio: **mexer sem entender tudo e sem quebrar o que funciona há anos.** O código novo entra ao lado do antigo, por uma costura; o antigo muda o mínimo.

**O fluxo termina no `tasks.md`** (tarefas e lotes). Não implemente, verifique, integre nem libere nada aqui: isso é de `/executar`, `/validar` e `/finalizar` (seção **Fim do planejamento** do `CLAUDE.md`).

## 1. Qual feature

Liste `.specs/features/`. Em andamento são as que não têm `integracao.md`. Nenhuma: feature nova. Uma ou mais: pergunte via `AskUserQuestion` qual retomar, com a opção **Feature nova**.

**Entrada pronta (modo enxuto).** Feature nova com `plano.md` ou critérios escritos: pergunte uma vez, via `AskUserQuestion` e junto com a trava de modelo, **modo enxuto (Recomendado)** ou **modo completo**. Enxuto segue a seção **Modo enxuto** do `CLAUDE.md`, mantendo o que a arqueologia tem de obrigatório em legado: o `## Delta` do `tasks.md` ganha `Costura` (ponto único de integração), `Raio de impacto` e `Ambiente` (roda ou não), e o T0 caracteriza **todo** o raio de impacto. Ambiente que não roda ou impacto alto: modo completo.

**Chamada por outro fluxo:** `spec.md` com **Chamado por** `integração <slug>` (skill `integracao-terceiros`) segue estas fases com os acréscimos de [composicao.md](../integracao-terceiros/references/composicao.md); leve ao `/finalizar` os itens de liberação do chamador. Com **Chamado por** `automação <slug>` (skill `automacao`), siga os acréscimos de [composicao.md](../automacao/references/composicao.md); ligar é a fase do chamador, sem a `liberacao`. Com o `tasks.md` pronto, volte ao chamador.

**Vinda de uma demanda** (sugestão, solicitação ou suporte): o Specify parte de `.specs/demandas/DEM-NNN-<slug>/encaminhamento.md` e o `spec.md` leva no topo **Origem**: `demanda DEM-NNN`. Se for **solicitação** (skill `solicitacao`), os `CA-NN` já foram confirmados por escrito: o Specify os traduz em EARS citando o `CA-NN` de origem e pergunta só o técnico; dúvida que mudaria um `CA-NN`, o escopo ou o prazo volta à `solicitacao` antes de seguir. Ao fechar cada fase, se o **Próximo marco** de `solicitacao.md` for essa fase, lembre a atualização ao solicitante (fase 7 dela).

## 2. Descobrir a fase

| Situação em `.specs/features/<feature>/` | Fase atual |
|---|---|
| `tasks.md` com `**Modo**: enxuto` | Planejamento concluído |
| sem `spec.md` | 1 Pedido |
| `spec.md`, sem `arqueologia.md` | 2 e 3 Arqueologia, fronteira e risco |
| `arqueologia.md`, com **Mockup** `pendente` no `reconhecimento.md` | 3b Mockup |
| `arqueologia.md`, **Plano aprovado em** `pendente` no `reconhecimento.md` | 4 Plano |
| plano aprovado, `tasks.md` sem a tarefa T0 e a `## Linha de base` (ou sem `**Branch pai**`) | 5 Rede de proteção planejada |
| `tasks.md` completo, com lotes | Planejamento concluído |

**Planejamento concluído:** diga apenas **"O plano está disponível para execução."** Se já há tarefas concluídas ou em andamento, acrescente em uma linha que o próximo passo é `/executar` (tarefas em aberto) ou `/validar` (todas concluídas).

## 3. Situar o usuário

"**Feature <nome> (legado), fase N de 5, <fase>.**" Toda fase deste fluxo é de planejamento e rende melhor em Opus: avise "use `/model opus`". No **modo enxuto**, diga "**Feature <nome> (legado), modo enxuto.**" e não avise troca por fase (regra **Modelo pela entrada** do `CLAUDE.md`).

## 4. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| Enxuto: planejamento | agente `planejador`, passando a Base, a pasta `.specs/features/<feature>/` e a **Branch pai** | Grava só o `tasks.md`; costura e raio de impacto sem resposta viram "Perguntas para o usuário". Sem aprovação ao fim: resolva as perguntas e diga a mensagem final. |
| 1 Pedido | `tlc-spec-driven`, fase **Specify** | Se o pedido for grande demais para uma feature (vários fluxos de valor que não se validam nem se liberam juntos), acione antes a skill `roteiro`. |
| 2-3 Arqueologia | skills `inventario`, `reconhecimento` e `arqueologia`, nesta ordem | A arqueologia pode escalar (impacto alto): siga a decisão do usuário. Com `plano.md` pronto na pasta do épico, vale a seção **Plano pronto** do `CLAUDE.md`: conferência do delta, não nova investigação. |
| 3b Mockup | pergunte via `AskUserQuestion`: **fazer o mockup das telas (Recomendado)** ou **dispensar** (motivo). Fazer: skill `mockup-visual` em **modo módulo**, pasta `.specs/features/<feature>/mockup/` | Só quando o reconhecimento diz que a feature cria ou muda telas; sem guia no projeto, o guia mínimo reproduz a aparência atual do legado. Registre `aprovado` ou `dispensado — <motivo>` no `reconhecimento.md`. |
| 4 Plano | `tlc-spec-driven`, **Design** e **Tasks** | Cada tarefa é a menor possível, com **Estimativa** de até 2h (regra de Tarefas do `CLAUDE.md`). Código novo **ao lado** do antigo, pelo ponto único de integração de `arqueologia.md`; mudança mínima no código antigo; feature flag quando possível; plano de volta. Refatoração não entra. Aprovado, grave a data em **Plano aprovado em** no `reconhecimento.md`. |
| 5 Rede de proteção planejada | método da skill `rede-de-protecao`, **só planejando** | Se o ambiente não roda (`arqueologia.md`), a primeira tarefa é fazê-lo rodar. Rode a suíte uma vez e grave a `## Linha de base` no `tasks.md`; a **T0** caracteriza **todo** o raio de impacto, não só o trecho alterado. Registre no topo `**Branch pai**: <nome>` (padrão: a branch atual; é onde o `/validar` integra). Rode `validate_tasks.py`. Não escreva testes nem código: o `/executar` faz a T0. Pronto, diga a mensagem final. |

Fases posteriores (implementação, verificação, liberação, registro): **não são deste fluxo**. `/executar` constrói numa worktree da feature, sem skills nem subagentes; `/validar` roda `verificador`, `revisao-codigo` e `auditor-seguranca`, gera o lote de retrabalho e, com PASS, integra; `/finalizar` faz a liberação cuidadosa (skill `liberacao`) e abre a operação; `/preparar` cuida da infraestrutura, em paralelo ao `/executar`.

## 5. Fechar a fase

Nas fases 1, 2-3, 3b e 4, apresente o que foi produzido (caminho e 3 a 5 linhas) e o critério de passagem, e pergunte via `AskUserQuestion`: **seguir / ajustar / parar**. A **última** fase (5, ou o planejamento enxuto) não pergunta: termina com **"O plano está disponível para execução."** Antes de declarar uma fase concluída, aplique `verification-before-completion`.

## Para o /executar e o /validar

- **Suíte a cada lote:** em legado a suíte inteira roda ao fim de **cada lote** (exceção à regra do `CLAUDE.md`), sem falha nova, e os testes de caracterização continuam passando. Teste de caracterização **nunca** é apagado: se quebra, a feature mudou comportamento existente e é decisão do usuário.
- **Revisão:** o `/validar` roda `revisao-codigo` em modo curto **sempre** em legado, `auditor-seguranca` se tocar login, permissões, pagamento ou dados pessoais, e o teste manual dos fluxos vizinhos do raio de impacto. Com **Mockup** `aprovado`, compara as telas do módulo.
- **Liberação cuidadosa (`/finalizar`):** skill `liberacao` com staging e flag conforme `arqueologia.md`, reversão testada. Demanda do tipo solicitação: a liberação para todos espera o aceite (demonstração com flag ligada só para o solicitante, ou em staging).
- **Registro (ao integrar, PASS):** atualize o contexto do projeto (`CLAUDE.md` ou equivalente, nas seções de [contexto-ia.md](../documentar/references/contexto-ia.md)) com como rodar o ambiente, as costuras usadas e as **armadilhas** da arqueologia; corrija `docs/` ou README que a feature tornou falsos; atualize o `inventario.md` e promova as telas do mockup aprovado para `.specs/mockup/` ([modulo.md](../mockup-visual/references/modulo.md)). Avise que a demanda de origem pode ir ao fechamento (skill `demandas`).

## Regras

- Mudança mínima no código antigo. Refatoração é outro fluxo (skill `refatoracao`).
- Push, PR, deploy e banco de produção exigem confirmação específica.
- Tudo em português.
