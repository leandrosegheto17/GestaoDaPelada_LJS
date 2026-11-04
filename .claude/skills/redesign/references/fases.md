# As fases do redesign de interface (planejamento) e o que vai para os comandos

Princípio: **o desenho aprovado é a fonte de verdade, e as regras de negócio não mudam.** Desenho original: `.rascunho/FLUXO-REDESIGN.md`.

**O fluxo termina no planejamento** (fases 1 a 7, até o `tasks.md`). As fases 8 a 10 do desenho original são dos comandos `/executar`, `/validar` e `/finalizar` (tabela abaixo).

O redesign tem natureza própria, como a refatoração: o comportamento fica constante e a mudança anda em etapas, tela a tela. Por isso a skill chama as peças direto (`inventario`, `reconhecimento`, `mockup-visual`, `rede-de-protecao`, `tlc-spec-driven`, `verificador`, `revisao-codigo`, `liberacao`), sem passar pela `feature`.

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Motivo e meta | Por que redesenhar e como saberemos que melhorou? | `redesign.md` (motivo, meta, o que não muda, escopo, **Fases**) | Problema com evidência ou `PREMISSA`; cada métrica com linha de base **medida** (valor, data, fonte), alvo e guarda; o que não muda escrito; escopo de telas; nível de acessibilidade declarado; "vale o esforço" respondido | Opus |
| 2 | Inventário | O que existe hoje? | `inventario-telas.md`, `reconhecimento.md` (e `arqueologia.md` em legado), `capturas/antes/`; `.specs/projeto/inventario.md` atualizado | Toda tela do escopo com rota, arquivo, estados e componentes; estilos e inconsistências com contagem; captura de cada tela em PC e celular (ou o motivo de faltar) | Sonnet (leitura em Haiku) |
| 3 | Pesquisa | Onde os usuários travam? | `pesquisa.md` (problemas `P-NN`) | Problemas com evidência de pelo menos uma fonte real (uso, feedback, teste com usuários, auditoria), tipo, severidade e prioridade; saída de emergência avaliada | Opus (referências no `pesquisador`) |
| 4 | Direções | Que caminhos visuais existem? | `mockup/direcoes/`, galeria publicada | Direção escolhida (ou mistura) pelo usuário, cobrindo os `P-NN` de maior prioridade; contraste mínimo em todas | Opus (skill `mockup-visual`) |
| 5 | Sistema de design | Como manter consistência? | `mockup/tokens.css`, `mockup/guia.html`, `sistema.md`, `acessibilidade.md` (requisitos) | Todo valor visual em token; componentes com estados e foco visível; mapa componente atual → novo sem "meio-termo"; requisitos de acessibilidade atendidos no guia | Opus (skill `mockup-visual`) |
| 6 | Mockup completo | Como fica cada tela? | `mockup/telas/`, `mockup/telas.json`, `mockup/index.html` navegável; **Mockup aprovado** | Toda tela do escopo × estados × PC e celular; comportamento igual ao da captura; checklist e acessibilidade em cada tela; `--listar` do `telas.json` sem erro | Opus (skill `mockup-visual`) |
| 7 | Plano de migração | Em que ordem e com que risco? | `migracao.md`, `tasks.md` (com `**Branch pai**` e a tarefa **T0**), tabela **Etapas**; `protecao.md` sai da execução da T0 | Etapas integráveis sozinhas (1 = fundação, R = remoção); flag e coexistência definidas; T0 com os testes de comportamento de cada tela do escopo nas duas posições da flag; limite visual e forma de comparar por tela; forma de liberar; `validate_tasks.py` sem erro | Opus |

## O que vai para os comandos

| Era a fase | Agora | O que continua valendo |
|---|---|---|
| 8 Implementação | `/executar` (uma etapa por vez) | gate de cada tarefa verde com a flag nas duas posições; `checar-tokens.py` limpo no código novo; diferença visual dentro do limite ([construcao.md](construcao.md)) |
| 9 Verificação | `/validar` | `verificador` em modo redesign ([verificacao.md](verificacao.md)); acessibilidade; navegadores e dispositivos; integração da etapa com a flag desligada |
| 10 Liberação e medição | `/finalizar` | skill `liberacao` ([liberacao-medicao.md](liberacao-medicao.md)); métricas contra a linha de base; decisão manter / ajustar / reverter |

## Etapas (execução e verificação, repetidas)

| Etapa | O que entra | Quando |
|---|---|---|
| 1 Fundação | `tokens.css` copiado sem alterar, componentes do guia, mecanismo da flag, infraestrutura de testes (comportamento nas duas posições, acessibilidade automática se aprovada), `checar-tokens.py` e comparação visual configurados | sempre a primeira |
| 2 a N | uma tela ou um fluxo curto (telas que o usuário percorre juntas), na ordem de `migracao.md` | depois da fundação |
| R Remoção | apaga a interface antiga, a flag e o CSS antigo; testes passam a rodar numa posição só (mudança aprovada na fase 7) | só depois de **manter** na fase 10 |

Situação de cada etapa em **Etapas**: `planejada` → `construída` (`/executar`) → `integrada` (`/validar`) → `liberada` (`/finalizar`, se **Liberação** `por etapa`). A etapa R começa `aguardando decisão`.

## Aprovações

Uma por fase (seguir / ajustar / parar). Nas fases 4 a 6, a da `mockup-visual` sobre a galeria é a da fase. A última fase (7, o `tasks.md` pronto) não pergunta: termina com "O plano está disponível para execução." Na liberação (`/finalizar`), a `liberacao` pede as dela (cada aumento de alcance é uma confirmação) e o redesign pede a decisão final.

## Laços comuns

- Pesquisa mostra que o problema é de fluxo ou regra → saída de emergência (`SKILL.md`).
- Usuário não gosta de nenhuma direção → nova rodada da fase 4 com o motivo; duas rodadas sem escolha: volte à pesquisa (o problema pode não estar claro).
- Tela real tem um estado ou conteúdo que o mockup não previu (texto longo, erro diferente, lista vazia) → volta à fase 6 só nessa tela; código depois.
- Diferença visual acima do limite três vezes na mesma tela → escala ao usuário: ajustar o mockup, aceitar a diferença (registrada) ou rever o limite.
- Teste de comportamento falha com a flag ligada (no `/executar`) → a tela nova mudou comportamento; corrige-se a tela. Teste falha de forma inesperada → `systematic-debugging`.
- Verificador FAIL, revisão com bloqueio ou violação crítica de acessibilidade → o `/validar` gera o lote de retrabalho e o `/executar` o executa (a partir da 3ª rodada, escala).
- Critério de parada atingido na liberação (`/finalizar`) → desligar a flag (reversão testada) e voltar a este fluxo, fase 3 ou 6, para as telas afetadas.
- Meta não atingida com tudo liberado → **ajustar** (volta a este fluxo na fase 3 ou 6 nas telas com problema, replanejando para elas) ou **reverter**.
- Redesign longo e o código antigo mudou no meio (feature integrada por outro trabalho) → refazer o `reconhecimento.md` e a caracterização da tela tocada antes da etapa dela.

## Interface que não é web

App nativo ou desktop: o mockup em HTML continua sendo a referência visual; a comparação é por prints do simulador ou do aparelho lado a lado (sem `comparar-visual.mjs`); os tokens são exportados para o formato da plataforma (`PREMISSA`: conferir a ferramenta do projeto) e `checar-tokens.py` não se aplica; a acessibilidade é conferida com os leitores de tela da plataforma (VoiceOver, TalkBack) e as ferramentas dela.
