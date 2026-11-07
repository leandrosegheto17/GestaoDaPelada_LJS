# Validação: financeiro — PASS ✅ (rodada 2)

- **Data**: 2026-11-06 · **Branch**: feature/financeiro @ 538d2f28 · **Árvore**: 81ec7d1dc630f51fcaec1ff50957cd01a9044a4f
- **Rodada 1** (reprovada, 8 achados do verificador, 5 de segurança, 4 sugestões de revisão): todos tratados abaixo, na própria worktree, com teste que falha sem a correção. Sensor da rodada 1: 10 mutações, 10 mortas.
- **Revisão de código**: `general-purpose` em modo curto, achados B1, S1 a S4 · **Segurança**: `seguranca.md` (0 críticos, 0 altos, 1 médio, 4 baixos), todos tratados

## Critérios (teste em `backend/api/test` salvo indicação; "T:" = título do teste, linha de abertura)

| Critério | `arquivo:linha` e asserção | Resultado |
|---|---|---|
| FIN-01 a 04 | `rotas/financeiro-config.test.ts:53` 200 e 3 campos; `:90` 422 `dataSaldoInicial` sem gravar; `:110` it.each 422 por campo; `:76` auditoria antes/depois | ✅ |
| FIN-05, FIN-06 | `repositorios/financeiro-config.test.ts:274` valor do lançamento intacto; `:306` `expect(comAntes[0]?.antes).toEqual(semAntes[0]?.depois)` | ✅ |
| FIN-07 a 09, 14 | `rotas/financeiro-mes.test.ts:60,84,134,112,153` (todos os campos, nulos sem config, 422 "Mês fora do histórico", ordem) | ✅ |
| FIN-10 a 13 | `repositorios/financeiro-mes.test.ts:141,154,164,176,188`; `:206` `toBe(200 * 99_999_999 + 5000)`; `dominio/test/caixa/centavos.test.ts:25` `toThrow(ErroEstouroCentavos)` | ✅ |
| FIN-15 | `frontend/web/test/telas/financeiro-mes.test.tsx:45,57`; `financeiro-mensalidades.test.tsx:59` (16 mensalidades numa linha) | ✅ |
| FIN-16 a 21 | `rotas/financeiro-pagamentos.test.ts:77` 204, `descricao 'Mensalidade Toninho 10/2026'`, `valorCentavos 5000`, data de hoje; `:124,137,153,183,195`; FIN-21 `repositorios/financeiro-marcar.test.ts:174` e `-desmarcar.test.ts:178` (falha forçada na auditoria desfaz) | ✅ |
| FIN-22, 23 | `rotas/financeiro-pagamentos.test.ts:222,253,259,273` (204/404/422/204+404 sem 500) | ✅ |
| FIN-24 | `web/test/telas/financeiro-pagamentos.test.tsx:73,84` (volta a "Não pagou"; texto exato do diálogo) | ✅ |
| FIN-25 a 31 | `rotas/financeiro-lancamentos.test.ts:68,90,149,190,220,229`; corrida `repositorios/financeiro-lancamentos-excluir.test.ts:90` (23001 vira `vinculado`); 404 igual `repositorios/financeiro-lancamentos.test.ts:229` | ✅ |
| FIN-32 | `web/test/telas/financeiro-lancamento.test.tsx:63,160,174,195` ("0 de 80", "Última alteração", "Conta excluída", diálogo) | ✅ |
| FIN-33 a 37 | `sessao/financeiro.test.ts:98` (GET, POST, PUT, PATCH, DELETE: 403 `sem_permissao_financeiro`); `:148` 409 antes do 403; `isolamento/rotas.test.ts:1433,1498`; `rotas/financeiro-grupo.test.ts:48,69`; `rotas/financeiro-acesso.test.ts:59,101,109,122` | ✅ |
| FIN-38 a 41 | `isolamento/financeiro-rls.test.ts:106,132` e `financeiro-rls-escrita.test.ts:93,100,114,154,161,205,216` (3 tabelas × 4 comandos × X/P/N, com e sem WHERE, foto de G idêntica); `banco/financeiro-trava-acesso.test.ts:47,52,57,68,93` | ✅ |
| FIN-42 a 44 | `banco/financeiro-rls-migracao.test.ts:80`; `migracao-aditiva-financeiro.test.ts`; `rotas/auditoria-financeiro.test.ts:273,304,317` (sem descrição, apelido, telefone) | ✅ |
| FIN-45, 50 | `sessao/financeiro-plano.test.ts:90,166,183`; `rotas/financeiro-plano.test.ts:137` (8 escritas 403 `plano_pro` e retrato idêntico; 3 leituras 200) | ✅ |
| FIN-48, 49 | `web/test/telas/financeiro-config.test.tsx:72,100`; `dados/dinheiro.test.ts:57` (sem `parseFloat`); `rotas/financeiro-fuso.test.ts:51,58,72,79` | ✅ |
| FIN-46, 47 | `visual` t22 (6 estados), t23 (4), t24 (2) e t09 sucesso, PC e celular: todas em até 1%; controles reprovam como devem; asserção espacial `e2e/financeiro-erros-campo.spec.ts:87,119` passa | ✅ (A-01 a A-03 corrigidos) |
| FIN-51 | `web/test/telas/admins-financeiro.test.tsx:61,91`; revisão manual do t19 registrada em `tasks.md` (T46, 2026-11-06) | ✅ (A-04) |

## Achados e resolução
| ID | Resolução |
|---|---|
| A-01, A-02 | `FinanceiroMes.tsx` (cadeado, barra sem "Trocar grupo"), `ConfigCaixa.tsx` (ajuda some com erro): t22 sem-permissão e t24 erro em até 1% |
| A-03 | `telas-reais.mjs`: clique no trilho do interruptor; t22 desmarcar ok; erro-pagamento: faixa sob o título (`FinanceiroMes.tsx`) e recorte `.faixa--erro` no mockup (AD-135, decisão do usuário) |
| A-04 | registro da revisão manual do t19 em `tasks.md` (T46), com a observação do e-mail longo em 390 px mantida pelo mockup aprovado |
| A-05 | AD-133 e `banco/vinculos-travar.test.ts` (um teste por ramo; guarda removida reprova 2) |
| A-06 | AD-134 (história não se reescreve; a passada de rascunho aceita) |
| A-07 | `pagamentos.ts` usa `jogadores.travarVarios` |
| A-08 | `PELADA_E2E_PORTA_API` no `.env.example` e no readme; format e FUN-46 verdes |
| S-1 (AD-132) | 409 `acesso_da_criadora` + policy restritiva `vinculos_admin_protege_criadora`; testes de repositório, rota e banco |
| S-2 | exclusão de jogador com pagamento oculto pela RLS: 409 `com_historico` (SAVEPOINT) |
| S-3, S-4 | contrato recusa ano 0000 e descrição com invisíveis (`textoVisivel`), 422 |
| S-5 | trigger `vinculos_admin_so_acessa_financeiro`; INSERT direto segue como risco residual aceito (AD-132) |
| R-S1 | POST de pagamento em mês antes do histórico: 422 `mes` |
| R-S2, R-S4 | comentários e textos unificados · R-S3 (extrair `saldoDe`) **não aplicada**: as duas consultas diferem de propósito e o revisor a deu por aceitável |

## Gate (rodada 2, árvore acima)
- lint, format, typecheck, build web, `test:checagens` (134): verdes. Raiz 50, contrato 571 verdes.
- dominio, web, api (`pnpm -r test`): falhas só de ambiente e carga, todas verdes isoladas (GEL-70, PAR-63, SIM-14/15/66, 3 arquivos do pool worker) ou já aceitas em 2026-11-06 (push-backup ×2, push-cpu, SIM-58).
- e2e: 72 passam; 2 reprovam em `pdf-visual.spec.ts:86` (PAR-108, `partidas-e-ranking`, fora do financeiro). J-25 e J-26 passam.
- `visual` completo: 25 comparações reprovam, **todas de outras features** (t01, t05, t09 menu-conta, t10, t12, t13, t32 e afins; AD-127 aceita parte); nenhuma do financeiro.
- Higiene: sem banco `teste_*` órfão; ambiente isolado (container `pelada-val-financeiro-pg`, porta 5456).

## Lacunas
- Sensor não repetido na rodada 2: as mudanças de código são guardas novas, cada uma com teste vermelho sem a correção.
- A revisão manual do t19 foi feita por Claude, não por pessoa.
