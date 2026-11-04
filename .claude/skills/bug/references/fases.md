# As 6 fases do planejamento da correção de bug

Princípio: **corrigir a causa, não o sintoma, e provar com um teste que falhava e agora passa.** Desenho original: `.rascunho/FLUXO-BUG.md`. O fluxo termina no `tasks.md` da correção; corrigir, verificar, liberar e fechar são de `/executar`, `/validar` e `/finalizar`.

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Relato | O que foi observado, onde e com que frequência? | `relato.md` (relato) | Passos, esperado × obtido, ambiente, versão, evidência e impacto registrados; o que falta marcado `[A ESCLARECER]` | Opus |
| 2 | Triagem | É bug de verdade, e quão grave? | `relato.md` (triagem) | Contraria comportamento definido; severidade P0–P3 e urgência com justificativa; duplicados checados; veredito | Opus |
| 3 | Reprodução | Consigo fazer acontecer sempre? | `reconhecimento.md`, `causa.md` (reprodução) | Reproduzido localmente com o menor caso, comando ou passos anotados | Opus (leitura em Haiku) |
| 4 | Teste que falha, planejado | Como provarei que o bug existe? | `causa.md` (teste planejado) | Teste descrito (arquivo, o que verifica, comando) com a falha esperada pela asserção | Opus |
| 5 | Causa raiz | Por que acontece? | `causa.md` (causa) | Origem em `arquivo:linha`, cadeia de porquês, evidência; hipóteses descartadas anotadas | Opus |
| 6 | Plano da correção | Qual a menor mudança que resolve a causa? | `tasks.md` com `## Linha de base`, T1 (teste), T2 (correção) e `**Branch pai**` | Tarefas pequenas e com teste; lote definido; `validate_tasks.py` sem erro | Opus |

Fim do fluxo: **"O plano está disponível para execução."** (bug e incidente esperam o `/executar` do usuário; nada de hotfix automático.)

## Depois do planejamento (fora deste fluxo)

| Comando | O que faz |
|---|---|
| `/executar` | T1 (teste vermelho pelo motivo certo) e T2 (correção mínima) numa worktree, um commit `fix:` |
| `/validar` | `verificador` (modo bug), `code-review`, `auditor-seguranca` se aplicável; achado vira lote de retrabalho; com PASS integra à **Branch pai** |
| `/finalizar` | Liberação (normal ou hotfix, skill `liberacao`) e fechamento (`fechamento.md`, aviso ao relator, recorrência) |

## Entrada por outro fluxo

| Chamador | Em que fase dele | Entra na fase | Devolve ao chamador |
|---|---|---|---|
| 9 Incidente | 6 (correção definitiva, depois da contenção) | 3 | com o plano pronto; **Devolver após** `verificação` (o incidente libera e faz o pós-mortem) |
| 16 Auditoria de segurança | 8 (correção dos achados) | 3, um bug por achado (ou por causa comum a vários) | com o plano pronto; **Devolver após** `fechamento` (a auditoria faz o reteste) |
| 32 Suporte | 5 (encaminhamento) | 3 | com o plano pronto; **Devolver após** `liberação` (o suporte avisa o cliente) |

O chamador grava `relato.md` com relato e triagem completos (formato de `relato.md`), e o bug segue a tabela de fases normalmente.

## Laços comuns

- Triagem diz "não é bug" → fechamento com o motivo; pedido de feature pelos fluxos 3 ou 4.
- Grave em produção → skill `incidente` (contenção e restauração primeiro; ela volta a esta pasta no plano da correção). Hotfix por este fluxo só com o dano já contido, pelos comandos.
- Não reproduz → mais dados, instrumentação, ou encerrar como não reproduzido. Nunca planejar no escuro.
- Teste passa de primeira na execução → não reproduz o bug; o `/executar` para e o teste planejado é refeito (fase 4).
- Hipótese errada → nova hipótese, uma variável por vez; 3 correções falharam → questionar a arquitetura.
- Causa é falha de arquitetura → parar e propor a skill `refatoracao` (fluxo 13; o plano da correção retoma depois dela), ou contenção mínima com risco registrado.
- `/validar` com FAIL → lote de retrabalho no `tasks.md` (até 3 rodadas; depois, escala ao usuário).
- Monitoramento acusou problema na liberação → reverter e voltar à fase 5.
