# As fases da automação de processo (planejamento) e o que vai para os comandos

Princípio: **automatizar um processo que já funciona à mão.** Desenho original: `.rascunho/FLUXO-AUTOMACAO.md`.

As fases 1 a 3 são uma conversa curta com um só artefato e uma aprovação (como a `necessidade` do uso próprio). As demais têm aprovação própria. **O fluxo termina no planejamento** (fases 1 a 5, até o `tasks.md`); a construção usa o caminho que a fase 4 escolheu e é executada pelo `/executar`. As fases 6 a 9 do desenho original são dos comandos (tabela abaixo).

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Processo atual | O que é feito hoje, passo a passo? | `processo.md` (passos, entradas, saídas, decisões, exceções, pessoas, tempo e frequência) | Processo descrito a partir de uma execução real anotada; tempo e frequência com número (medido ou estimado e marcado); exceções conhecidas listadas | Opus |
| 2 | Vale automatizar? | O ganho compensa o custo? | `processo.md` (**Conta de retorno**, **Veredito**) | Horas economizadas por mês, horas para construir, horas de manutenção por mês e meses para empatar, escritos; erros evitados e risco da falha considerados; veredito `automatizar`, `automatizar parte`, `não automatizar` ou `padronizar primeiro` | Opus |
| 3 | Escopo | O que automatizar e o que fica manual? | `processo.md` (**Escopo**) | Caminho comum automatizado (com a parcela dos casos que cobre); exceções com o humano e o aviso que ele recebe; o que fica fora explícito; primeiro passo pequeno definido | Opus |
| 4 | Ferramenta | Qual o meio mais simples que serve? | `processo.md` (**Ferramenta**, **Onde mora**, **Como se testa**); `.specs/escolhas/automacao-<slug>/` se houve escolha | Degrau mais baixo da escada que atende, com motivo para cada degrau descartado; IA só com motivo; escolha do usuário com fonte e data (se houve `escolha-tecnologia`) | Opus |
| 5 | Desenho seguro e plano | O que pode dar errado? | `desenho.md`, `tasks.md` (com `**Branch pai**`) | Cada seção resolvida ou `não se aplica — motivo`; critérios EARS de simulação, idempotência, teto, falha parcial, exceção e alerta; ações irreversíveis listadas com a trava de cada uma | Opus |

## O que vai para os comandos

| Era a fase | Agora | O que continua valendo |
|---|---|---|
| 6 Implementação | `/executar` | testes dos critérios de `desenho.md` (simulação, repetição, teto, falha no meio); dado real só em cópia; a automação entra inerte |
| 7 Execução assistida | `/validar` | rodadas comparadas com o manual ([execucao.md](execucao.md)); critério de confiança definido antes; divergência explicada e corrigida (com teste) ou aceita |
| 8 Operação | `/finalizar` | agendamento ligado com confirmação; alerta com disparo testado; pausa testada; dono ([operacao.md](operacao.md)) |
| 9 Manutenção | `/finalizar` | documentação, gatilhos de revisão e data da próxima revisão; **Resultado** `concluída` |

## Caminhos do plano de tarefas (fase 5) e da construção

| Onde mora (fase 4) | Construção | Verificação | Integração |
|---|---|---|---|
| Projeto existente feito com IA | plano da skill `feature` em `.specs/features/automacao-<slug>/` (até o `tasks.md`), com os acréscimos de [composicao.md](composicao.md), executado pelo `/executar` | `/validar` (verificador e `revisao-codigo` curta) | integração pelo `/validar` (merge ou PR); a automação entra **inerte**: simulação por padrão e sem agendamento |
| Projeto legado | plano da skill `legado` (até o `tasks.md`), executado pelo `/executar` | `/validar` | merge ou PR da branch, inerte; a liberação é do `/finalizar` |
| Repositório próprio de automação (script avulso, hook do Claude Code) | `tlc-spec-driven` (Specify a partir de `desenho.md`, Tasks) até o `tasks.md`, executado pelo `/executar` numa worktree; repositório novo começa com a infraestrutura mínima de testes e o CI | `/validar`: agente `verificador` contra `desenho.md` e a spec | checagem final e integração pelo `/validar` |
| Serviço pronto ou recurso nativo, sem código | configuração feita pelo usuário (ou com ele) no serviço, em modo de teste | `/validar`: casos de teste de [desenho.md](desenho.md) executados e registrados em `execucao.md` | — |

Pedaço de código num serviço pronto (expressão, função, script embutido) é código: mora num repositório e tem teste. Configuração pura não é código do projeto; a prova dela são os casos de teste executados, e isso fica registrado em `processo.md` (**Como se testa**).

## Aprovações

Uma para 1-3; depois uma por fase (seguir / ajustar / parar), exceto a última (o `tasks.md` pronto), que termina com "O plano está disponível para execução." Nas fases 4 (com escolha) e 5 (plano), as skills chamadas pedem as aprovações delas; ao voltar, a automação confere os itens próprios ([composicao.md](composicao.md)) e pede a dela sobre o resumo.

## Laços comuns

- Ao descrever o processo, ele se mostra confuso ou diferente a cada vez → saída `padronizar primeiro` (`SKILL.md`). O processo-padrão escrito vale como fase 1 da próxima tentativa.
- Conta de retorno negativa no todo, positiva num passo → escopo reduzido a esse passo (veredito `automatizar parte`).
- Desenho revela ação irreversível sem simulação possível (ex.: API que não tem modo de teste) → aprovação humana antes de cada ação na execução assistida (`/validar`), alcance mínimo na operação (`/finalizar`), e o risco registrado em `desenho.md`.
- Teste falha de forma inesperada (no `/executar`) → `systematic-debugging`, na tarefa da construção.
- Execução assistida diverge do manual (`/validar`) → causa no processo (a descrição estava incompleta: volta a este fluxo, fase 1, só nesse ponto) ou na automação (teste que reproduz a divergência vira retrabalho, nova rodada). Três rodadas sem atingir a confiança: escala ao usuário (reduzir escopo, manter aprovação humana permanente, parar).
- Alerta real em operação → pausa, depois skill `bug` (defeito da automação) ou `incidente` (dano em curso).
- Sistema de origem, API ou processo mudou → revisão de manutenção (`/finalizar`); se muda o comportamento, automação nova `<slug>-<versão>` com as fases 1 a 4 começando do que existe.
- Pedido de crescer (mais passos, mais casos) → automação nova ou volta à fase 3 desta, com nova conta de retorno; nunca crescer sem a execução assistida da parte nova.
