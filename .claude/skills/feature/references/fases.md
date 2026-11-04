# As 4 fases do planejamento da feature em projeto existente

Princípio: **entender o que já existe e não quebrar nada.** Projetos feitos com IA costumam ter padrões inconsistentes, pouca documentação e testes irregulares; por isso o reconhecimento e a rede de proteção planejada vêm antes do código. O fluxo termina no `tasks.md`; construir, validar e lançar são de `/executar`, `/validar` e `/finalizar`.

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Pedido | O que a feature faz, para quem, e como saberei que está pronta? | `spec.md` | Critérios de aceite testáveis, fora de escopo explícito, `validate_spec.py` sem erro | Opus |
| 2 | Reconhecimento | Onde isso entra no código existente? | `reconhecimento.md` | Arquivos afetados, modelo a seguir, convenções, testes e riscos mapeados; arquitetura cabe (ou decisão registrada) | Opus (leitura em Haiku) |
| 3 | Plano | Qual o menor caminho seguro? | `design.md`/`tasks.md` ou plano inline | Tarefas pequenas, cada uma com teste, seguindo as convenções do reconhecimento | Opus |
| 4 | Rede de proteção planejada | Se eu quebrar algo, vou perceber? | `tasks.md` com `## Linha de base`, tarefa T0 e `**Branch pai**` | Linha de base conhecida; comportamento tocado sem teste tem a T0 que o caracteriza; lotes definidos; `validate_tasks.py` sem erro | Opus |

Fim do fluxo: **"O plano está disponível para execução."**

## Depois do planejamento (fora deste fluxo)

| Comando | O que faz |
|---|---|
| `/preparar` | Infraestrutura (Nível 1 antes do `/executar`, Nível 2 até o fim), em paralelo ao `/executar` |
| `/executar` | Worktree da feature, T0 e lotes, sem skills nem subagentes, um commit por lote |
| `/validar` | `verificador`, `revisao-codigo` e `auditor-seguranca`; achados viram o lote de retrabalho; com PASS integra à **Branch pai** |
| `/finalizar` | Lançamento, operação e aprendizado |

## Laços comuns

- Reconhecimento mostra mudança grande de arquitetura → refatorar antes (skill `refatoracao`, com **Chamado por** a feature; depois, reconhecimento refeito), reduzir escopo ou seguir com risco registrado.
- Suíte já vermelha ao registrar a linha de base → registrar as falhas preexistentes ou planejar a correção antes (fluxo de bug).
- Achado do `/validar` → lote de retrabalho no `tasks.md`, executado pelo `/executar`.
