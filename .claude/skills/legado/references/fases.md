# As 5 fases do planejamento da feature em legado

Princípio: **como mexer sem entender tudo e sem quebrar o que funciona há anos?** O fluxo termina no `tasks.md`; construir, validar e liberar são de `/executar`, `/validar` e `/finalizar`.

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Pedido | O que a feature faz e como saberei que está pronta? | `spec.md` | Critérios de aceite testáveis; `validate_spec.py` sem erro | Opus |
| 2 | Arqueologia | Como essa parte funciona de fato? | `inventario.md`, `reconhecimento.md`, `arqueologia.md` | Ambiente roda (ou tarefa para fazê-lo rodar); comportamento e histórico registrados | Opus (leitura em Haiku) |
| 3 | Fronteira e risco | Onde posso mexer com segurança? | `arqueologia.md` (costuras, raio de impacto, staging, flag) | Ponto único de integração escolhido; impacto aceito ou escalado | Opus |
| 4 | Plano | Qual o menor desvio possível? | `design.md`/`tasks.md` | Código novo ao lado do antigo, ponto único, flag quando possível, plano de volta | Opus |
| 5 | Rede de proteção planejada | Como saberei se quebrei algo? | `tasks.md` com `## Linha de base`, tarefa T0 (todo o raio de impacto) e `**Branch pai**` | Linha de base conhecida; T0 caracteriza o raio de impacto; lotes definidos; `validate_tasks.py` sem erro | Opus |

Fim do fluxo: **"O plano está disponível para execução."**

## Depois do planejamento (fora deste fluxo)

| Comando | O que faz |
|---|---|
| `/preparar` | Infraestrutura (Nível 1 antes do `/executar`, Nível 2 até o fim), em paralelo ao `/executar` |
| `/executar` | Worktree da feature, T0 e lotes, sem skills nem subagentes; suíte inteira ao fim de cada lote em legado |
| `/validar` | `verificador`, `revisao-codigo` (sempre em legado) e `auditor-seguranca`; achados viram o lote de retrabalho; com PASS integra à **Branch pai** e registra o contexto |
| `/finalizar` | Liberação cuidadosa (`liberacao`), operação e aprendizado |

## Laços comuns

- Ambiente não roda → primeira tarefa é fazê-lo rodar; sem isso a T0 não tem como ser executada.
- Impacto alto demais → refatorar antes (skill `refatoracao`; depois, arqueologia refeita), serviço novo ao lado (estrangular aos poucos), reduzir escopo ou seguir com risco registrado.
- Teste de caracterização quebrou na execução → a feature mudou comportamento existente: decisão do usuário (ajustar a feature ou aceitar a mudança, registrando).
- Monitoramento acusou problema na liberação → reverter e abrir correção (fluxo de bug).
