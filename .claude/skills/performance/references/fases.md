# As fases de performance e escala (planejamento) e o que vai para os comandos

Princípio: **medir antes de mexer.** Otimizar sem medição costuma melhorar o que não importa e piorar o que importa. Desenho original: `.rascunho/FLUXO-PERFORMANCE.md`.

**O fluxo termina no planejamento** (fases 1 a 5, até o `tasks.md`). As fases 6 a 9 do desenho original são dos comandos `/executar`, `/validar` e `/finalizar`.

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Meta | O que está lento, para quem, e qual é o alvo? | `performance.md` (sintoma, meta, cenário, ambiente, guardas) | Métrica com número-alvo, cenário reproduzível, ambiente de medição e prazo; métricas que não podem piorar | Opus |
| 2 | Linha de base | Como o sistema se comporta hoje? | `medicoes.md` (**Linha de base**), roteiro em `carga/` | Número de partida com comando, condições, repetições e dispersão; métricas de produção quando houver | Sonnet |
| 3 | Diagnóstico | Onde está o gargalo de verdade? | `diagnostico.md`; **Causa confirmada** | Fração do tempo ou do recurso por parte; o maior gargalo com evidência (perfil, plano de consulta, trace); ganho máximo possível estimado | Opus (leitura em Haiku) |
| 4 | Opções | Quais correções existem e a que custo? | `opcoes.md`, `tasks.md` (com `**Branch pai**`); **Plano aprovado** | Alternativas com esforço, risco, ganho esperado, reversibilidade e mudança de comportamento; escolhida a de melhor custo-benefício; uma tarefa por mudança; `validate_tasks.py` sem erro | Opus |
| 5 | Rede de proteção (planejada) | Como garanto que a correção não muda o comportamento? | `reconhecimento.md`; tarefa **T0** no `tasks.md` (caracterizar o comportamento tocado) e linha de base da suíte; `protecao.md` sai da execução da T0 | T0 escrita com o comportamento a caracterizar; linha de base da suíte registrada | Opus |

## O que vai para os comandos

| Era a fase | Agora | O que continua valendo |
|---|---|---|
| 6 Otimização | `/executar` (um lote de uma tarefa) | um commit `perf:` por mudança mantida, medida com o mesmo comando e condições; ganho não confirmado é revertido (`git revert`) |
| 7 Verificação | `/validar` | `verificador` em modo performance ([verificacao.md](verificacao.md)): carga repetida por quem não otimizou; guardas e custo; meta atingida ou nova rodada de planejamento |
| 8 Guarda e integração | `/validar` (integração) e `/finalizar` (guarda no CI e `liberacao`) | checagem que falha sem a otimização ([guarda.md](guarda.md)) |
| 9 Registro | `/finalizar` | gargalo, números, limite atual, dívida ([registro.md](registro.md)) |

## Aprovações

Uma por fase (seguir / ajustar / parar), exceto a última (o `tasks.md` pronto), que termina com "O plano está disponível para execução." As fases 3 a 5 se repetem a cada **rodada** (meta não atingida no `/validar`); 1 e 2 acontecem uma vez.

## Entrada por outro fluxo

| Chamador | Em que ponto dele | Já preenchido | Volta para |
|---|---|---|---|
| 13 Refatoração | saída "não é refatoração": a meta era velocidade | sintoma, trecho, métrica sugerida | `refatoracao.md` encerrada, ou etapa seguinte dela |
| 9 Incidente | prevenção: lentidão já contida que pode voltar | sintoma, linha do tempo, números do incidente | `prevencao.md` do incidente |
| 12 Bug | triagem: o defeito é só lentidão, sem resultado errado | relato e reprodução | `fechamento.md` do bug |

O chamador grava `performance.md` com **Chamado por**, **Usar em** e o **Sintoma**; a skill confirma meta, cenário e ambiente com o usuário numa pergunta e segue todas as fases.

## Peças acionadas

| Peça | Em que fase | Para quê |
|---|---|---|
| `leitor-codigo` | 3 (e 5, pelo `reconhecimento`) | mapear o caminho quente: rota, serviço, consultas, laços, chamadas externas |
| skill `spike` | 4 | opção incerta: "esta mudança leva o p95 abaixo de N?" com critério e prazo |
| skill `escolha-tecnologia` | 4 | opção é trocar banco, cache, fila, servidor, biblioteca ou hospedagem |
| skills `inventario`, `reconhecimento`, `rede-de-protecao` | 5 | onde a mudança entra e caracterização do comportamento tocado |
| `tlc-spec-driven` (Tasks) | 4 | plano em tarefas, uma por mudança |
| skill `refatoracao`, `escolha-tecnologia` | saída arquitetural | redesenho ou migração |

## Laços comuns

- Meta sem número ou cenário vago → não passa da fase 1.
- Medições muito dispersas (repetições discordam) → estabilizar o ambiente antes de seguir (seção Ruído de `medicao.md`).
- Diagnóstico aponta várias causas pequenas e nenhuma grande → atacar a maior; se a soma não chega à meta, saída arquitetural.
- Opção muda comportamento observável → decisão do usuário na fase 4, critério de aceite e teste na tarefa.
- Ganho não confirmado → `git revert` da mudança, registro e próxima tarefa; nenhuma tarefa confirmada → nova rodada de diagnóstico.
- Teste de caracterização quebrou (no `/executar`) → a mudança alterou comportamento: desfazer e refazer; nunca mudar o teste.
- Teste falha de forma inesperada → `systematic-debugging` antes de seguir.
- Verificador FAIL ou revisão com bloqueio → o `/validar` gera o lote de retrabalho e o `/executar` o executa (a partir da 3ª rodada, escala).
- Meta não atingida no `/validar` → nova rodada de planejamento (fase 3); três rodadas → escala ao usuário.
- Monitoramento acusou piora na liberação (`/finalizar`) → reverter (skill `liberacao`) e voltar à fase 3.
