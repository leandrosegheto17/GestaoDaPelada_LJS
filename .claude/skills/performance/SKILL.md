---
name: performance
description: Orquestra o planejamento de performance e escala — meta mensurável antes de tudo (métrica, número-alvo, cenário, ambiente), linha de base medida com a ferramenta já instalada (teste de carga, benchmark, perfil, Lighthouse na web), diagnóstico do maior gargalo com evidência e opções com custo, risco e ganho esperado (spike quando incerta, escolha de tecnologia quando é trocar componente), terminando no tasks.md com uma mudança por tarefa e a rede de proteção como tarefa T0 — descobrindo a fase pelos artefatos em .specs/performance/<slug>/. A otimização, a verificação contra a linha de base, a guarda no CI e o registro são dos comandos /executar, /validar e /finalizar. Também é chamada por outros fluxos (refatoração, incidente, bug) quando o problema é lentidão. Use quando o sistema está lento ou vai receber mais carga, ou via /fluxo. Não use para queda ou degradação aguda em produção agora (incidente), resultado errado (bug), estrutura difícil de mudar (refatoracao) nem para otimizar sem meta medida.
---

# Performance e escala (fluxo 5)

Você é o **orquestrador**. As 5 fases de planejamento e seus critérios estão em [references/fases.md](references/fases.md); leia-o na primeira vez que acionar esta skill na sessão.

Princípio: **medir antes de mexer.** Sem meta com número não se começa; sem linha de base não se otimiza; uma mudança por vez, medida depois; ganho não confirmado é revertido; meta atingida, para.

**Este fluxo termina no planejamento**: no `tasks.md` com uma tarefa por mudança, em ordem de custo-benefício. Pronto, diga apenas: **"O plano está disponível para execução."** Otimizar, verificar, guardar no CI e registrar são de `/executar`, `/validar` e `/finalizar` (seção Fim do planejamento do `CLAUDE.md`).

## 1. Qual trabalho

Liste `.specs/performance/`. Em andamento são os que têm `performance.md` com **Resultado** `pendente`.

- Nenhum em andamento: trabalho novo, fase 1.
- Um ou mais: pergunte via `AskUserQuestion` qual retomar, com a opção **Trabalho novo**.
- Novo: slug curto em kebab-case pelo cenário e pela métrica (ex.: `listagem-pedidos-p95`); se a pasta existir, acrescente `-2`. Nunca sobrescreva outra pasta.

### Chamado por outro fluxo

`refatoracao` (a meta era velocidade), `incidente` (prevenção de lentidão recorrente, já contida) e `bug` (o defeito relatado é só lentidão, sem resultado errado) gravam `performance.md` no formato de [references/meta.md](references/meta.md), com **Chamado por**, **Usar em** e o **Sintoma** preenchidos, e acionam esta skill. A fase 1 vira **uma confirmação** (métrica, alvo, cenário e ambiente são sempre combinados com o usuário). A skill vai até o `tasks.md` e responde ao chamador com o caminho da pasta; os números antes e depois e o commit integrado voltam depois do `/executar` e do `/validar`.

## 2. Descobrir a fase

A **primeira linha que se aplica** define a fase (campos de `performance.md`; os de rodada valem para a **Rodada** atual).

| Situação em `.specs/performance/<slug>/` | Fase atual |
|---|---|
| **Resultado** preenchido (não `pendente`) | encerrado (mostre o resumo) |
| sem `performance.md`, ou **Meta aprovada** `pendente` | 1 Meta |
| sem `medicoes.md` com a seção **Linha de base** | 2 Linha de base |
| **Causa confirmada** `pendente` | 3 Diagnóstico |
| **Plano aprovado** `pendente` | 4-5 Opções e plano, com a T0 da rede de proteção |
| **Plano aprovado** preenchido | planejamento concluído: diga só "O plano está disponível para execução." |

**Meta atingida** `não` no `/validar` abre a rodada seguinte: ao chamar `/fluxo performance`, some 1 à **Rodada** e volte **Causa confirmada** e **Plano aprovado** a `pendente` (fase 3 de novo, com o que se aprendeu). Defeito de implementação (não é a meta) é retrabalho normal do `/validar`.

## 3. Situar o usuário

"**Performance <slug> (rodada N), fase N de 5, <fase>.** Meta: <métrica> de <antes> para <alvo>." Avise a troca de modelo:

- fases 1, 3, 4 e 5: "Esta fase rende melhor em Opus: use `/model opus`."
- fase 2: "Esta fase pode seguir em Sonnet: use `/model sonnet`."

## 4. Acionar a peça da fase

| Fase | Acione | Observações |
|---|---|---|
| 1 Meta | conversa guiada por [references/meta.md](references/meta.md) | O que está lento, para quem, com que carga. **Métrica, número-alvo, cenário, ambiente de medição e prazo**, mais as métricas que não podem piorar (erros, memória, custo). Meta sem número vira `[A ESCLARECER]` e não passa. Uma pergunta por vez, via `AskUserQuestion`. Grave `performance.md`. |
| 2 Linha de base | [references/medicao.md](references/medicao.md); na web, também [references/web.md](references/web.md) | Ferramenta **já instalada** ou script mínimo na linguagem do projeto; instalar é decisão do usuário. Ambiente parecido com produção, dados em volume, aquecimento e repetições. **Carga nunca contra produção ou serviço de terceiro sem confirmação específica.** Grave `medicoes.md` e o roteiro em `carga/`. |
| 3 Diagnóstico | [references/diagnostico.md](references/diagnostico.md); `leitor-codigo` para mapear o caminho quente | Perfil de CPU, memória, banco, rede e I/O; fração do tempo de cada parte. **O maior gargalo, não o mais óbvio**, com evidência. Limite arquitetural: saída de emergência. Grave `diagnostico.md` e marque **Causa confirmada**. |
| 4-5 Opções e plano | [references/opcoes.md](references/opcoes.md); `tlc-spec-driven`, fase **Tasks** | Alternativas com esforço, risco, ganho esperado (limitado pela fração do gargalo) e se mudam comportamento. Incerta: skill `spike`. Trocar componente ou infraestrutura: skill `escolha-tecnologia`. **Escalar é a última opção.** Uma tarefa por mudança, em ordem de custo-benefício, cada uma com o comando de medição. **Rede de proteção = tarefa T0**: caracterizar o comportamento do caminho que as tarefas vão tocar (saída, ordem, erros, efeitos); o método é o da skill `rede-de-protecao`, lido como referência pelo `/executar`; para o plano, use `inventario` (se faltar) e `reconhecimento` na pasta do trabalho. Registre `**Branch pai**: <nome>` no topo (padrão: a branch atual). Grave `opcoes.md` e marque **Plano aprovado**. |

### Saídas

- **Meta já atingida na linha de base**: não há problema medido. Encerre com **Resultado** `parada — meta já atingida` e mostre os números. É resultado válido.
- **Não é performance**: resultado errado vai para `bug`; queda ou degradação aguda com usuários afetados agora vai para `incidente`; estrutura difícil de mudar, para `refatoracao`.
- **Limite arquitetural** (fase 3 ou rodadas esgotadas): pare e proponha redesenho ou migração com o usuário: `refatoracao` (modo grande), `escolha-tecnologia` (trocar componente) ou desenho novo. **Resultado** `parada — limite arquitetural`, com a evidência.
- **Sem ambiente representativo**: pergunte via `AskUserQuestion`: medir local com dados em volume (números marcados `PREMISSA`), preparar staging antes, ou parar.
- **Três rodadas sem atingir a meta**: escale ao usuário: aceitar meta parcial, rever a meta ou saída arquitetural.
- **Bug encontrado no caminho**: não corrija aqui; anote em **Achados fora do escopo** e ofereça a skill `bug`.

## 5. Fechar a fase

Apresente o que foi produzido (caminho e 3 a 5 linhas, com os números) e o critério de passagem, e pergunte via `AskUserQuestion`: **seguir / ajustar / parar**. Antes de declarar uma fase concluída, aplique `verification-before-completion`. Na última fase (o `tasks.md` pronto), **não pergunte**: diga só que o plano está disponível para execução. Parar é resultado válido: grave **Resultado** `parada — <motivo>`.

## Para o /executar e o /validar

- **Uma tarefa por vez, lote de uma tarefa** (esta skill restringe a seção Execução do `CLAUDE.md`): mudar, suíte verde, commit `perf:`, **medir com o mesmo comando e condições** ([references/opcoes.md](references/opcoes.md)). Ganho confirmado além do ruído: mantém. Senão: `git revert` e registra em `medicoes.md`. Meta atingida: para.
- **Verificação:** o `verificador` em modo performance, com o pedido de [references/verificacao.md](references/verificacao.md): carga completa repetida por quem não otimizou, comparada com a linha de base; guardas e custo. Comportamento mudado sem aprovação é bloqueante.
- **Guarda no CI e registro:** a checagem automatizada que falha se o ganho se perder ([references/guarda.md](references/guarda.md)) e o registro dos números e do limite atual ([references/registro.md](references/registro.md)) são do `/finalizar`; produção com usuários passa pela skill `liberacao`.

## Regras

- **Medir antes de mexer.** Número sem o comando que o produziu, as condições e as repetições não é evidência.
- **Uma mudança por vez**, medida depois; o que não melhora sai (`git revert`), mesmo que "devesse" ajudar.
- **Parar quando a meta for atingida.** O resto vira oportunidade registrada, não tarefa.
- Otimizar não muda resultado. Se a opção muda algo observável (cache com dado velho, paginação, ordem), isso é decidido pelo usuário na fase 4 e ganha teste nascido do critério.
- Nunca enfraquecer, pular ou apagar teste para ganhar tempo de suíte ou de resposta.
- Teste de carga, `EXPLAIN ANALYZE` e perfil em produção, ou carga que passa por serviço de terceiro, exigem confirmação específica (pode ser negação de serviço, custo ou bloqueio). Instalar ferramenta é decisão do usuário.
- Push, PR, deploy, mudança de infraestrutura, índice ou migração em banco de produção exigem confirmação específica.
- Tudo em português.
