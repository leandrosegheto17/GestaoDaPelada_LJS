# As fases da integração com terceiros (planejamento) e o que vai para os comandos

Princípio: **tratar o serviço externo como componente que vai falhar** e isolá-lo do resto do sistema. Desenho original: `.rascunho/FLUXO-INTEGRACAO.md`.

Integrar é uma feature com cuidados extras. **O fluxo termina no planejamento**: as fases 1 a 4 (antes do código) são desta skill, e a fase 5 anda **por dentro da skill `feature` ou `legado`**, que fazem spec, reconhecimento, plano e rede de proteção planejada (T0) até o `tasks.md`. As fases 6 a 9 do desenho original são dos comandos `/executar`, `/validar` e `/finalizar` (tabela abaixo). Esta skill acrescenta o que é próprio de terceiro (contrato de [composicao.md](composicao.md)).

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Necessidade | Por que integrar e o que se espera obter? | `terceiro.md` (caso de uso, dados, volume, criticidade, orçamento, **Fases**) | Caso de uso e resultado esperado escritos; dados trocados e volume com número ou faixa; o que acontece se o serviço cair; "integrar é o caminho" respondido | Opus |
| 2 | Escolha do serviço | Qual fornecedor, a que custo e risco? | `.specs/escolhas/<slug>/` (ADR); **Fornecedor** e **Rota de saída** em `terceiro.md` | Escolha do usuário com custo no volume, limites, SLA, termos e rota de saída com fonte e data; ou dispensa com motivo e rota de saída anotada | Opus (skill `escolha-tecnologia`) |
| 3 | Contrato | Como o serviço se comporta de fato? | `contrato.md`; `.specs/spikes/<slug>-contrato/` se houve sandbox | Autenticação, operações, erros, limites, paginação, versão e webhooks mapeados com fonte e data; itens críticos confirmados no sandbox ou marcados `não testável` com o risco; divergências registradas | Sonnet (pesquisa no `pesquisador`, sandbox pela skill `spike`) |
| 4 | Segurança e legal | Que dados saem e quem responde por eles? | `seguranca-legal.md` | Dados que saem campo a campo e minimizados; base legal, papéis, transferência internacional e contrato com resposta ou `[A ESCLARECER]`; fatos legais conferidos ou `PREMISSA`; segredos e permissões definidos; risco aceito pelo usuário | Opus |
| 5 | Desenho e plano | Como isolar o terceiro do resto? | `.specs/features/integracao-<slug>/spec.md`, `reconhecimento.md` (ou `arqueologia.md`), `design.md`/`tasks.md` (com `**Branch pai**`) | Spec com os critérios de falha; plano com adaptador, tempo limite, nova tentativa, disjuntor, idempotência, fila, degradação e desligamento; toda tarefa com teste | Opus (skill `feature`/`legado`) |

## O que vai para os comandos

| Era a fase | Agora | O que continua valendo |
|---|---|---|
| 6 Implementação | `/executar` | testes de falha, de lentidão e de contrato passando; suíte padrão sem rede ([desenho.md](desenho.md)) |
| 7 Verificação | `/validar` | `verificador`, `revisao-codigo` e `auditor-seguranca` restrita; ponta a ponta no sandbox; segredos e logs limpos; custo e limite configurados ([verificacao.md](verificacao.md)) |
| 8 Liberação | `/validar` (integração da branch) e `/finalizar` (skill `liberacao`) | chaves de produção no cofre; flag com desligamento testado; liberação gradual ([monitoramento.md](monitoramento.md)) |
| 9 Monitoramento | `/finalizar` | métricas e alertas com disparo testado; acompanhamento de mudanças do fornecedor; rotação de chaves ([monitoramento.md](monitoramento.md)) |

A fase 5 usa a `feature` (fluxo 3) ou o `legado` (fluxo 4), conforme o projeto: pergunte no início via `AskUserQuestion`, recomendando pelo projeto (código antigo, pouco testado, autores ausentes → `legado`; senão `feature`). No `legado`, o plano inclui a rede de proteção (T0) e a arqueologia.

## Aprovações

Uma por fase (seguir / ajustar / parar), exceto a última (o `tasks.md` pronto), que termina com "O plano está disponível para execução." Nas fases 2, 3 e 5, as skills chamadas pedem as aprovações delas; ao voltar, a integração confere os itens próprios (lista em [composicao.md](composicao.md)) e pede a dela sobre o resumo.

## Laços comuns

- Contrato real diverge muito da documentação, limite ou custo inviável, risco legal alto → saída de emergência: volta à fase 2 (`SKILL.md`). A escolha nova gera ADR que substitui o anterior.
- Fornecedor não tem sandbox → contrato só por documentação, itens críticos `não testável`; o `/validar` faz o ponta a ponta com conta de produção em modo de teste (se houver) ou com a menor operação real possível, ambos com confirmação específica; o risco entra no plano de liberação (alcance inicial menor).
- Sandbox se comporta diferente de produção (comum em pagamento) → anote em `contrato.md`; a liberação começa com alcance mínimo e reconciliação manual.
- Teste falha de forma inesperada (no `/executar`) → `systematic-debugging`, na tarefa da feature.
- Verificador FAIL, revisão com bloqueio ou achado crítico ou alto da auditoria → o `/validar` gera o lote de retrabalho e o `/executar` o executa (a partir da 3ª rodada, escala ao usuário).
- Fornecedor anuncia mudança ou fim de versão depois de pronta → registre em `monitoramento.md` e abra uma integração nova `<slug>-<versão>` com as fases 1 e 2 `dispensada — mesma necessidade e fornecedor de <slug>`, começando no contrato: `contrato.md` e os testes de contrato mudam antes do código.
- Segunda capacidade do mesmo fornecedor → integração nova, reaproveitando `contrato.md` e `seguranca-legal.md` como ponto de partida, e o adaptador existente (o reconhecimento decide estender).
