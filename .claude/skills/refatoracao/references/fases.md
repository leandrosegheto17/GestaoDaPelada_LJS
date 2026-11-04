# As fases da refatoração (planejamento) e o que vai para os comandos

Princípio: **mudar a estrutura sem mudar o comportamento**, em passos pequenos, sempre com testes verdes. Desenho original: `.rascunho/FLUXO-REFATORACAO.md`.

**O fluxo termina no planejamento** (fases 1 a 5, até o `tasks.md`). As fases 6 a 9 do desenho original são dos comandos `/executar`, `/validar` e `/finalizar` (tabela abaixo); aqui elas ficam descritas porque os comandos e o `verificador` as usam.

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Motivo | Que dor a dívida causa hoje? | `refatoracao.md` (motivo), `.specs/projeto/dividas.md` se houver várias candidatas | Custo real com evidência (bugs, horas, medo de mexer, onboarding); pontuação; o trecho vai ser tocado | Opus |
| 2 | Alvo e meta | O que muda e como saberei que melhorou? | `refatoracao.md` (alvo, meta, modo) | Trecho delimitado, fora do escopo explícito, métrica com valor **antes medido**, alvo e comando; modo pequeno ou grande | Opus |
| 3 | Mapeamento | O que depende disso? | `reconhecimento.md` com **Contratos e acoplamento**; `arqueologia.md` no legado | Quem chama e quem é chamado, contratos públicos, dados e integrações, acoplamento classificado; raio de impacto conhecido | Sonnet (leitura em Haiku; arqueologia em Opus) |
| 4 | Rede de proteção (planejada) | Como saberei que o comportamento não mudou? | tarefa **T0** no `tasks.md` (caracterizar todo contrato do mapeamento), com a linha de base da suíte e de desempenho; `protecao.md` e o commit de caracterização saem da execução da T0 | T0 escrita com os contratos listados; linha de base registrada | Opus |
| 5 | Plano em passos | Qual a sequência segura? | `tasks.md` (e `design.md` no modo grande), com `**Branch pai**`; **Plano aprovado** | Passos pequenos e reversíveis, cada um com a suíte como gate e como reverter; etapas integráveis sozinhas; `validate_tasks.py` sem erro | Opus |

## O que vai para os comandos

| Era a fase | Agora | O que continua valendo |
|---|---|---|
| 6 Execução | `/executar` | um commit `refactor:` por passo, suíte inteira verde a cada passo, caracterização intacta, nada de feature ou correção junto |
| 7 Verificação | `/validar` | `verificador` em modo refatoração ([verificacao.md](verificacao.md)): contratos iguais, métrica da etapa comparada, desempenho dentro do limite; revisão de código só com tarefa de risco alto |
| 8 Integração | `/validar` (com PASS) e `/finalizar` | uma etapa = uma integração pequena; trecho crítico: skill `liberacao` ([registro.md](registro.md)) |
| 9 Registro | `/finalizar` | meta comparada, contexto e inventário atualizados, dívida que sobrou ([registro.md](registro.md)) |

## Aprovações

Uma por fase (seguir / ajustar / parar), com 1 e 2 juntas: o motivo e a meta saem da mesma conversa, como relato e triagem no `bug`. A última fase (o `tasks.md` pronto) não pergunta: termina com "O plano está disponível para execução." No modo grande, a execução e a verificação se repetem por etapa (`/executar` e `/validar` de cada uma).

## Modos

| Modo | Quando | Como |
|---|---|---|
| **Pequeno** | cabe em até ~8 passos e num diff revisável (~400 linhas), sem mudança de dados nem de contrato entre partes | uma etapa, uma worktree/branch do `/executar`, sem `design.md` |
| **Grande** | muitos passos, várias partes do sistema, troca de biblioteca ou framework, mudança de dados, ou sem testes possíveis no código antigo | novo ao lado do antigo (padrão de `plano.md`), etapas com integração própria, uma integração por etapa, `design.md` com o padrão e a ordem |

Na dúvida, grande: dá para descer de modo no plano, nunca no meio da execução.

## Entrada por outro fluxo

| Chamador | Em que ponto dele | Motivo já preenchido | Volta para |
|---|---|---|---|
| 3 Feature (`reconhecimento`) | escalonamento: arquitetura não cabe | a feature bloqueada e o que ela exige | reconhecimento da feature, refeito |
| 4 Legado (`arqueologia`) | saída de emergência: sem costura, impacto alto | a feature bloqueada e o raio de impacto | arqueologia da feature, refeita |
| 12 Bug | causa na arquitetura, ou causa recorrente (3+ bugs) | os bugs e a causa comum | correção do bug (o `/executar` dele) ou fechamento |
| 9 Incidente | prevenção de causa recorrente | os incidentes e a causa sistêmica | `prevencao.md` do incidente |

O chamador grava `refatoracao.md` com **Chamado por**, **Usar em** e a seção Motivo; a skill completa alvo e meta com o usuário numa confirmação e segue todas as fases.

## Laços comuns

- Sem custo real ou trecho que ninguém toca → registrar a dívida e parar.
- Meta exige mudar comportamento → não é refatoração: `feature`, `legado` ou `bug`.
- Suíte vermelha na linha de base → falhas preexistentes registradas no `tasks.md` (e em `protecao.md` pela T0), ou corrigidas antes pela skill `bug` se estiverem no alvo.
- Sem testes possíveis → etapa 0 de infraestrutura de testes, ou reescrita ao lado com execução paralela, ou parar.
- Teste de caracterização quebrou → desfazer o passo e refazê-lo menor; nunca mudar o teste.
- Teste falha de forma inesperada (não é caracterização) → `systematic-debugging` antes de seguir.
- Bug encontrado → anotado, skill `bug` separada; a caracterização preserva o comportamento atual.
- Verificador FAIL ou revisão com bloqueio → o `/validar` gera o lote de retrabalho e o `/executar` o executa (a partir da 3ª rodada, escala ao usuário).
- Meta atingida antes do fim do plano → parar e registrar; os passos restantes viram dívida, se ainda valerem.
- Monitoramento acusou problema na liberação (`/finalizar`) → reverter a etapa e planejar o ajuste (volta a este fluxo, fase 5).
