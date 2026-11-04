---
name: refatoracao
description: Orquestra o planejamento de refatoração e dívida técnica — motivo ligado a custo real (inventário e pontuação de dívida), alvo e meta com métrica antes e depois, mapeamento de quem depende do trecho (reconhecimento, acoplamento e contratos; arqueologia se for legado) e plano em passos pequenos e reversíveis (novo ao lado do antigo nas mudanças grandes), com a rede de proteção por caracterização como tarefa T0 — descobrindo a fase pelos artefatos em .specs/refatoracoes/<slug>/ e terminando no tasks.md, que o /executar executa e o /validar verifica. Também é chamada por outros fluxos (feature, legado, bug, incidente) quando a estrutura impede o trabalho. Use quando o código funciona mas está difícil de entender, mudar ou testar, ou via /fluxo. Não use para mudar comportamento (feature, legado), corrigir defeito (bug), deixar mais rápido (performance) nem para limpeza por gosto sem custo real.
---

# Refatoração e dívida técnica (fluxo 13)

Você é o **orquestrador**. As 5 fases de planejamento e seus critérios estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

Princípio: **mudar a estrutura sem mudar o comportamento**, em passos pequenos, sempre com testes verdes. Se algo observável mudou, deixou de ser refatoração.

**Este fluxo termina no planejamento**: no `tasks.md` com os passos, as etapas e os lotes. Pronto o plano, diga apenas: **"O plano está disponível para execução."** Executar, verificar, integrar e registrar são de `/executar`, `/validar` e `/finalizar` (seção Fim do planejamento do `CLAUDE.md`).

## 1. Qual refatoração

Liste `.specs/refatoracoes/`. Em andamento são as que têm `refatoracao.md` com **Resultado** `pendente`.

- Nenhuma em andamento: refatoração nova, fase 1.
- Uma ou mais: pergunte via `AskUserQuestion` qual retomar, com a opção **Refatoração nova**.
- Nova: slug curto em kebab-case pelo trecho e pela meta (ex.: `pedido-service-dividir`); se a pasta existir, acrescente `-2`. Nunca sobrescreva outra pasta.

### Chamado por outro fluxo

`feature` e `reconhecimento` (arquitetura não cabe), `legado` e `arqueologia` (impacto alto demais), `bug` (causa na arquitetura ou causa recorrente) e `incidente` (prevenção) gravam `refatoracao.md` no formato de [references/motivo.md](references/motivo.md), com **Chamado por** e **Usar em**, o motivo e o custo preenchidos, e acionam esta skill. As fases 1-2 viram **uma confirmação** (alvo, meta e métrica são sempre combinados com o usuário). A skill vai até o `tasks.md` e responde ao chamador com o caminho da pasta; o chamador espera o `/executar` e o `/validar` desta refatoração antes de refazer o reconhecimento dele, porque o código mudou.

## 2. Descobrir a fase

A **primeira linha que se aplica** define a fase. A refatoração anda em **etapas** (`tasks.md`; modo pequeno = uma etapa só).

| Situação em `.specs/refatoracoes/<slug>/` | Fase atual |
|---|---|
| **Resultado** preenchido (não `pendente`) | encerrada (mostre o resumo) |
| sem `refatoracao.md`, ou **Motivo e meta aprovados** `pendente` | 1-2 Motivo, alvo e meta |
| sem `reconhecimento.md` com a seção **Contratos e acoplamento** (com **Legado** `sim`, também sem `arqueologia.md`) | 3 Mapeamento |
| **Plano aprovado** `pendente` | 4-5 Plano em passos, com a T0 da rede de proteção |
| **Plano aprovado** preenchido | planejamento concluído: diga só "O plano está disponível para execução." |

## 3. Situar o usuário

"**Refatoração <slug> (<modo>), fase N de 5, <fase>.**" Avise a troca de modelo:

- fases 1-2 e 4-5: "Esta fase rende melhor em Opus: use `/model opus`."
- fase 3: "Esta fase pode seguir em Sonnet: use `/model sonnet`." (A `arqueologia` pede Opus por conta própria.)

## 4. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| 1-2 Motivo, alvo e meta | conversa guiada por [references/motivo.md](references/motivo.md) | **Sem custo real, não há porquê**: bug recorrente, feature lenta, medo de mexer, onboarding difícil, com evidência. Várias dívidas candidatas: inventário e pontuação (juros, toque, risco, esforço) em `.specs/projeto/dividas.md`. Meta com **métrica medida agora** (comando ou contagem reproduzível), alvo e fora do escopo. Modo **pequeno** ou **grande**. Uma pergunta por vez, via `AskUserQuestion`. Grave `refatoracao.md`. |
| 3 Mapeamento | skill `inventario` (se faltar ou estiver desatualizado), skill `reconhecimento` gravando em `.specs/refatoracoes/<slug>/`; em legado, skill `arqueologia` na mesma pasta; depois a seção **Contratos e acoplamento** por [references/mapeamento.md](references/mapeamento.md) | `leitor-codigo` em paralelo para quem chama, quem é chamado, acoplamento e volatilidade pelo git. Os **contratos** (tudo o que é observável de fora do alvo) são o que a refatoração não pode mudar. |
| 4-5 Plano em passos | `tlc-spec-driven`, fases **Design** (só no modo grande) e **Tasks**, com as regras de [references/plano.md](references/plano.md) | Passos pequenos e reversíveis, cada um termina com o sistema funcionando. Mudança grande: **novo ao lado do antigo** (padrão escolhido em `plano.md`). Etapas = fases do `tasks.md`, cada uma integrável sozinha. **A rede de proteção é a tarefa T0**: caracterizar todo contrato do mapeamento (golden master se a saída é complexa), com a linha de base da suíte e de desempenho (se o alvo está em caminho quente) registradas no `tasks.md`; o método é o da skill `rede-de-protecao`, lido como referência pelo `/executar`. Registre `**Branch pai**: <nome>` no topo (padrão: a branch atual). `validate_tasks.py` no `tasks.md` da pasta. Marque **Plano aprovado**. |

### Saídas

- **Não é refatoração**: a meta exige mudar comportamento (regra nova, correção, formato de saída diferente). Encerre com **Resultado** `parada — não é refatoração` e ofereça `feature`, `legado` ou `bug`. Meta de velocidade é do fluxo 5: grave `.specs/performance/<slug>/performance.md` (formato da skill `performance`) com **Chamado por** `refatoracao <slug>`, **Usar em** `refatoracao.md` e o **Sintoma**, e acione a skill `performance`.
- **Não vale agora**: sem custo real, ou trecho estável que ninguém vai tocar. Registre a dívida em `dividas.md` com a pontuação e encerre como `parada — não vale agora`. É resultado válido.
- **Sem testes e impossível criá-los** (T0): não refatore no escuro. Pergunte via `AskUserQuestion`: **reescrita isolada ao lado com execução paralela** (o novo roda junto e tem a saída comparada com a do antigo, até estrangular o antigo; modo grande, `plano.md`), **criar primeiro a infraestrutura de testes** como etapa 0, ou **parar**.
- **Bug encontrado no caminho**: não corrija aqui. Anote em **Achados fora do escopo** e ofereça a skill `bug`.

## 5. Fechar a fase

Apresente o que foi produzido (caminho e 3 a 5 linhas) e o critério de passagem, e pergunte via `AskUserQuestion`: **seguir / ajustar / parar**. Antes de declarar uma fase concluída, aplique `verification-before-completion`. Na última fase (o `tasks.md` pronto), **não pergunte**: diga só que o plano está disponível para execução. Parar é resultado válido: grave **Resultado** `parada — <motivo>`.

## Para o /executar e o /validar

- **Um passo por vez:** mudar, rodar a **suíte inteira**, commitar `refactor:`. Passo que não cabe em poucas horas é quebrado. A T0 vem antes de qualquer passo, e sem ela verde não se refatora.
- **Etapas:** cada etapa do `tasks.md` é integrável sozinha; o `/executar` executa uma etapa e o `/validar` a verifica e integra antes da seguinte (modo grande: branch por etapa).
- **Verificação:** o `verificador` em modo refatoração, com o pedido de [references/verificacao.md](references/verificacao.md): comportamento inalterado (caracterização intacta, contratos iguais) e a métrica e o desempenho **medidos de novo** e comparados. Mudança observável ou queda além do limite é bloqueante e vira retrabalho. Toca login, permissões, pagamento ou dados pessoais: `auditor-seguranca` também.
- **Teste de caracterização quebrou:** o passo mudou comportamento. Desfaça e refaça menor; **nunca** altere o teste (`CLAUDE.md`). Se o comportamento atual é que está errado, é a skill `bug`, separada.
- **Integração e registro:** trecho crítico passa pela skill `liberacao` no `/finalizar`; o registro da dívida que sobrou e do **Resultado** (modelo de [references/registro.md](references/registro.md)) é do `/finalizar`.

## Regras

- **Comportamento constante.** Nada observável de fora do alvo muda: retorno, erro, efeito colateral, formato, ordem, mensagem.
- **Nunca misturar** com feature ou correção: cada commit tem um motivo e pode ser revertido sozinho.
- Sem rede de proteção verde, não se refatora. Teste de caracterização nunca é alterado, pulado ou apagado para passar.
- **Parar quando a meta for atingida.** Refatorar por perfeccionismo é desperdício; o resto vira dívida registrada.
- Refatore o que vai ser tocado; priorize a dívida que mais cobra juros, não a mais feia.
- Push, PR, deploy, migração de banco e banco de produção exigem confirmação específica.
- Tudo em português.
