# Validação: financeiro — FAIL ❌ (rodada 1)

- **Data**: 2026-11-06 · **Branch**: feature/financeiro @ a686df3b · **Árvore**: f16ab5972e1927e48355887a21a3b00513fe4559 (a registrada no `tasks.md`, abc17b49, é outra: gate repetido por inteiro)
- **Critérios**: 48 de 51 com asserção e resultado conforme a spec; FIN-46 e FIN-47 reprovam na comparação visual; FIN-51 sem o registro da revisão manual · **Gate**: ver "Gate" abaixo
- **Sensor**: 10 mutações, 10 mortas, 0 sobreviveram (equivalentes: 0)
- **Revisão de código**: `revisao-codigo` roda em paralelo na sessão do `/validar` (não consolidada aqui) · **Segurança**: `auditor-seguranca` em paralelo (`seguranca.md` não lido por mim)

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
| FIN-46, 47 | `visual` (t22, t23, t24): 16 ok e 8 reprovam; asserção espacial `e2e/financeiro-erros-campo.spec.ts:87,119` passa | ❌ A-01, A-02, A-03 |
| FIN-51 | `web/test/telas/admins-financeiro.test.tsx:61,91` (switch, rótulo, desabilitado, axe); o registro da revisão manual exigido pela spec não existe (`tasks.md:1524` marcado sem data nem resultado) | ⚠️ A-04 |

## Gate (repetido; reaproveitamento impossível: árvore diferente)

`lint` ok · `typecheck` ok · `build web` ok · `format:check` 1 arquivo (`playwright.config.ts`, do commit de ambiente a686df3b) · `test:checagens` 133/134 (FUN-46: `PELADA_E2E_PORTA_API` fora do `.env.example`, também do a686df3b) · contrato ok · dominio 666/668 (SIM-58 aceita; GEL-70 estoura 5 s sob carga e passa isolada) · scripts 325/326 (FUN-46) · web 1050/1058 (8 timeouts de 5 s sob carga; os 5 arquivos passam isolados) · raiz 48/50 (2 timeouts do ESLint, passam isoladas) · api projeto `banco` 2878/2881 (3 = push-backup ×2 e push-cpu, pendências aceitas) · api projeto `worker`: a suíte inteira não terminou (pool do Cloudflare travou: "Timeout terminating cloudflare-pool worker", processos mortos por mim); os 27 arquivos de `financeiro` mais `isolamento/rotas.test.ts` passam (488 + 53 testes, 5 arquivos só na 2ª tentativa por timeout de hook de 10 s sob carga) · e2e Playwright 72 ok, 2 reprovam (`pdf-visual.spec.ts:86`, PAR-108, fora do financeiro); J-25, J-26 e FIN-47 passam · visual com filtro `^t2[234]-` e `^t09-sucesso`: t22 sucesso, vazio-config e vazio-mes ok; t23 8/8 ok; t24 vazio ok; t09 sucesso ok. Sem banco `teste_*` órfão no cluster 5456 ao fim.

## Sensor (cópia isolada, 1 arquivo de teste por mutante)

Mortos: RLS de `lancamentos` com `USING (true) WITH CHECK (true)` (10 testes); `app_acessa_financeiro` sem `AND v.acessa_financeiro` (28); trava da própria conta removida (2); INSERT de vínculo com `WITH CHECK (true)` (2); `exigirFinanceiro` sem o 403 (6); `exigirRecursoNaEscrita` removido (5); advisory lock da config removido (FIN-06, 3 de 3 rodadas); apelido na auditoria de marcar (1); `saldoAtual` com `<` em vez de `<=` (3); `conferirResultado` sem o estouro (5).

## Achados

| ID | `arquivo:linha` | Achado e evidência | Correção sugerida | Criticidade | Situação |
|---|---|---|---|---|---|
| A-01 | `frontend/web/src/telas/financeiro/FinanceiroMes.tsx:280` | FIN-47: `t22-sem-permissao` reprova (2,16% PC, 3,48% celular, limite 1%): o app usa `icone="erro"` (círculo vermelho "!") e o mockup tem o cadeado verde | Trocar o ícone do estado "Sem acesso" pelo cadeado do mockup e conferir de novo o `visual` | crítica | aberto |
| A-02 | `frontend/web/src/telas/financeiro/ConfigCaixa.tsx:147` | FIN-47: `t24-erro` reprova (1,33% PC, 2,82% celular): a imagem de diferença mostra o formulário deslocado na vertical (ajuda da mensalidade e erro do saldo) | Alinhar o espaçamento e a ajuda ao `t24-config--erro.html` | crítica | aberto |
| A-03 | `frontend/web/e2e/ferramentas/telas-reais.mjs:174` | FIN-24, FIN-47: `t22-desmarcar` e `t22-erro-pagamento` (PC e celular) dão `locator.click: Timeout 30000ms`: o passo `clicar` mira o `<input role=switch>` e o `<span class=interruptor__trilho>` intercepta o clique (`financeiro.module.css:104-109`); o e2e já corrigiu isso (commit c92d67e5), o runner visual não: 4 comparações sem prova | Passo `clicar` do runner com `click({ force: true })` ou no trilho; rodar de novo | crítica | aberto |
| A-04 | `.specs/features/financeiro/tasks.md:1524` | FIN-51: a spec exige "revisão manual registrada"; T46 está `[x]` sem data nem resultado, e nada em `docs/` ou `STATE.md` | Fazer a revisão do t19 (PC e celular) e registrá-la na T46 com data e resultado | crítica | aberto |
| A-05 | `backend/api/src/infraestrutura/db/migracoes/1793920000000_vinculos-travar.sql:10` | Divergência spec×design sem AD: o commit 24b68451 diz "SPEC_DEVIATION: AD pendente de registro no `STATE.md`" e `grep vinculos_travar .specs/STATE.md` não acha AD (AD-075 manda só policies). Função `SECURITY DEFINER` com guarda (sem conta ou sem vínculo devolve nada) e nenhum teste a cita (`grep vinculos_travar backend/api/test` = 0) | Registrar a AD e escrever teste por ramo da guarda (sem conta, sem vínculo, `p_todos` verdadeiro e falso) | crítica | aberto |
| A-06 | `.specs/features/financeiro/tasks.md:752` | Commit que não fecha verde: amostra de 3 commits de código (0d1b482b dominio ok; 191f2235 api **falha**: `@pelada/contrato` sem `acessoFinanceiroCorpo`, `configFinanceiraCorpo`, `lancamentoCorpo` etc., índice só corrigido depois; c92d67e5 web ok). Por regra, os demais commits de api T25 a T32 não foram checados | Histórico não se reescreve: registrar a aceitação da passada de rascunho numa AD, ou o usuário decide checar todos | crítica | aberto |
| A-07 | `backend/api/src/infraestrutura/db/repositorios/financeiro/pagamentos.ts:48` | Decisão nomeada não seguida: T18 e AD-078 mandam `jogadores.travarVarios` (existe em `jogadores.ts:413`), o código faz `SELECT ... FOR UPDATE` direto; a nota "o /executar troca por `travarVarios` se ele existir" não foi cumprida e não há `SPEC_DEVIATION` no código | Usar `travarVarios` ou registrar o `SPEC_DEVIATION` com o motivo | comum | aberto |
| A-08 | `frontend/web/playwright.config.ts:19` | O commit de ambiente a686df3b quebra `format:check` (esse arquivo) e `test:checagens` FUN-46 (`PELADA_E2E_PORTA_API` fora do `.env.example`): se integrado, a `main` fica vermelha | Rodar o prettier e declarar `PELADA_E2E_PORTA_API` (e as portas novas) no `.env.example`, ou não integrar o commit | comum | aberto |

## Lacunas e o que não foi validado

- Pendências aceitas em 2026-11-06 (registradas, não são achado): push-backup e push-cpu por ambiente; SIM-57 e SIM-58 no CI do domínio.
- Suíte do projeto `worker` da api não rodou inteira (travou no pool); só os 28 arquivos do financeiro rodaram.
- FIN-13 na rota: nenhum teste faz a requisição falhar com estouro (só domínio e repositório); a soma real fica em int4, então o risco é baixo.
- O `seguranca.md` untracked na worktree é do auditor em paralelo; o resto do `git status` ficou igual ao do início.
