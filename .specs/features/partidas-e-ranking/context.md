# Partidas e ranking — Decisões das áreas cinzentas

> Discussão de 2026-10-30, com o usuário, durante o Specify. Cada decisão vale para `spec.md` e para o Design.

## Feature Boundary

Lançar, editar e excluir partidas com as presenças; pesos de pontuação com vigência (t18); a função única de acumulado
(G-25, RF-73); ranking `/g/:slug` sem login, com navegação entre meses, "Grupo indisponível", PDF e modo sem conexão;
as prévias que a `grupos-e-elenco` deixou para cá (C7); o registro anônimo de uso com o painel "Uso do app" da t09; e os
débitos 4 a 6 do THREAT-MODEL.

## Implementation Decisions

| # | Área | Decisão | Alternativas recusadas |
|---|---|---|---|
| P1 | PDF do ranking (RF-49 a RF-52, ADR-008, ADR-022, ADR-019) | Entra nesta feature, a partir da mesma projeção pública do ranking (G-10) | Feature própria no roteiro; junto do simulador |
| P2 | Registro anônimo de uso (RA-11, RF-56 a RF-58) | Entra nesta feature: eventos `ranking_aberto`, `pdf_exportado`, `partida_lancada` e o painel "Uso do app" da t09, que passa a entrar na comparação visual | Só os eventos; fora do MVP |
| P3 | Ranking sem conexão (RF-54, G-17) | Entra agora: o service worker guarda o último ranking público aberto e o mostra com a faixa "sem conexão" | Deixar para depois como P3 |
| P4 | Editar partida | A data é fixa na edição; só mudam chuva e situações. Para trocar a data, exclui e lança de novo | Data editável com revalidação dos períodos |
| P5 | Quem saiu e voltou | Vale o legado (RTP-0207 e RTP-0211): a contagem recomeça no retorno e a pontuação inicial deixa de valer se houve presença antes. Diverge de RN-21, RN-22 e RN-29 do PRD-TECNICO | Seguir o PRD ("reativar não altera ponto") |
| P6 | Texto do diálogo de reativar (t16) | Passa a "Volta a aparecer no ranking e nas partidas; a data de início não muda." Mudam o mockup t16 e o teste `PeriodosJogador.test.tsx:136`, com motivo registrado | Manter "os pontos não mudam" |
| P7 | Presença fora de período e PDF com mais de 12 partidas | Vale o legado: a presença conta na grade e no acumulado; o PDF fica com as 12 mais recentes do mês | "–" para presença fora de período (RN-21); PDF com mais páginas |
| P8 | Tela "Uso do app" (t21) | Entra, com a coluna "Escalações / partidas" mostrando 0 até o `simulador` | Coluna escondida; só o cartão do início |
| P9 | Atalhos de features seguintes | Simulador e Financeiro ficam ocultos na t09 e o Financeiro no cabeçalho da t01; a t09 compara só `sem-jogadores` e a t01 mascara o atalho pela lista `ocultar` | Comparar a t09 `sucesso` mascarada; atalhos desabilitados |
| P10 | Rótulo "Pesos padrão" | Aparece quando há uma só configuração com os valores de RN-18; senão "Vigente desde dd/mm/aaaa" | Sempre "Vigente desde" (legado) |
| P11 | Pesos padrão da migração | `vigente_desde` = data de criação do grupo; `registrado_por` = criador | Data da primeira partida |
| P12 | Prévias em grupo arquivado | 409 `grupo_arquivado`, sem exceção no `exigirGrupoAtivo` | Abrir exceção para as prévias |

### Agent's Discretion

Nenhuma área foi deixada à escolha do agente.

### Declined / Undiscussed Gray Areas → Assumptions

Registradas na seção Assumptions de `spec.md`, com default e motivo:

- pré-preenchimento com a escalação confirmada (RF-26) fica para o `simulador`;
- importação do histórico (RA-17, RF-65 a RF-68) fora: o banco do legado já foi reaproveitado (D5);
- ausente não grava linha e vale 0;
- débitos herdados: I-3 (filtro de arquivado no ramo público de `grupos_visiveis()`), I-1 (ligar `pelada/sem-escrita-periodo`) e SEC-010 (reavaliar `deepmerge`) entram;
- pesos padrão (1, 1, −1, com e sem chuva) para os grupos que não tiverem e na criação de grupo.

## Specific References

Regras e telas do legado (`C:\Leandro\Projetos\GestaoDaPelada`): `backend/dominio/src/{pontuacao,ranking,pdf,atividade,datas}`,
rotas `backend/api/src/entrada/rotas/{grupos/partidas,grupos/pesos,publico}`, telas `frontend/web/src/telas/{ranking,partidas,partida,pontuacao,grupo-indisponivel}`.
Mockup: t01, t03, t09, t10, t11, t18 e P01 em `.specs/mockup/`.

## Deferred Ideas

Nenhuma: a discussão ficou dentro do escopo.
