# Segurança: financeiro

**Data**: 2026-11-06 · **Branch**: `feature/financeiro` (worktree `GestaoDaPelada_v2-val-financeiro`, HEAD `a686df3b`) · **Auditor**: `auditor-seguranca` (somente leitura no código)

**Resultado**: 0 críticos, 0 altos, 1 médio, 4 baixos. Não bloqueia o lançamento por severidade; o médio pede decisão do usuário (seção Perguntas).

## Escopo e método

- Código do financeiro na API (`rotas/financeiro-*.ts`, `rotas/admins.ts` PATCH do acesso, `middlewares/financeiro.ts`, `recurso.ts`, `plano-editavel.ts`, `repositorios/financeiro/*`), migrações `1792845300000_financeiro-rls.sql` e `1792845360000_financeiro-trava-acesso.sql` (e a `1793920000000_vinculos-travar.sql`, que depende delas), domínio `caixa/*`, contrato `financeiro*.ts` e telas `telas/financeiro/*`, `telas/admins/Admins.tsx`, `dados/financeiro.ts`.
- **Teste ativo só local**, no ambiente da worktree: Postgres `pelada-val-financeiro-pg` (127.0.0.1:5456) e API `wrangler dev` em 127.0.0.1:8756, contas do seed (`admin@exemplo.test` criadora com acesso; `convidado@exemplo.test` admin sem acesso). Nenhuma outra porta, container ou o Neon.
- Sondas de banco como `pelada_app` dentro de `BEGIN … ROLLBACK` (nada persistiu). Sondas de API que gravaram (2 lançamentos, troca de acesso, 1 jogador) foram desfeitas no fim; ficaram só as linhas de auditoria dessas ações no banco local de validação.
- Ferramentas: `varredura-seguranca.py ferramentas` rodou `pnpm audit`, `gitleaks` e a busca embutida no histórico; `osv-scanner` e `semgrep` não instalados (não executados).

## Achados

### SEC-F01 [MÉDIO] Admin convidado com acesso ao financeiro retira o acesso da criadora, que não consegue recuperá-lo

- **Evidência**: `backend/api/src/infraestrutura/db/migracoes/1792845360000_financeiro-trava-acesso.sql:16-19` (a policy só exige `conta_id <> app_conta_id()` e acesso de quem pede); `backend/api/src/infraestrutura/db/repositorios/financeiro/acesso.ts:29-71` (nenhuma checagem de `grupos.criado_por`); `backend/api/src/entrada/rotas/admins.ts:74-97`. Contraste: remover a criadora é bloqueado (`admins.ts:152`, SEC-001 da grupos-e-elenco), retirar o financeiro dela não.
- **Reprodução (local, feita)**: criadora concede o acesso ao convidado (`PATCH /api/grupos/<G>/admins/<convidado>/financeiro {"acessaFinanceiro":true}` → 200); convidado envia `PATCH /api/grupos/<G>/admins/<criadora>/financeiro {"acessaFinanceiro":false}` → **200**; a criadora passa a receber **403** em `GET …/financeiro/mes` e **403** ao tentar se devolver o acesso. Estado restaurado depois.
- **Impacto**: tomada do caixa. A dona do grupo (quem paga o plano) perde a visão do dinheiro e só o suporte reverte. Um admin convidado pode então editar ou excluir lançamentos sem que ela veja. Variante: duas contas com acesso que se retiram ao mesmo tempo deixam o grupo sem ninguém no financeiro (a spec aceita isso para o último admin removido, mas não fala do caso da criadora).
- **Correção sugerida** (decisão do usuário, ver Perguntas): recusar no repositório e na policy restritiva de UPDATE a retirada do acesso de `grupos.criado_por` (ex.: `WITH CHECK (acessa_financeiro OR conta_id <> (SELECT criado_por FROM grupos WHERE id = grupo_id))`, via função `SECURITY DEFINER`), com o 409 `criadora_nao_removivel` ou um código novo, e o teste por comando.

### SEC-F02 [BAIXO] Admin sem acesso ao financeiro que exclui jogador com pagamento recebe 500 em vez de 409, e a resposta revela que existe pagamento

- **Evidência**: `backend/api/src/infraestrutura/db/repositorios/jogadores-edicao.ts:104-115`. O `EXISTS (SELECT 1 FROM pagamentos_mes …)` roda sob a RLS nova e devolve falso para quem não tem acesso. O `DELETE` então bate na FK (23503, que ignora a RLS), e nada trata esse erro: vira 500 no `onError` (`backend/api/src/entrada/app.ts:166-171`). O Delta 2 do `tasks.md` prometia 409 `jogador_com_historico` pela FK.
- **Reprodução (local, feita)**: jogador sem presença nem nota, com 1 pagamento. `DELETE /api/grupos/<G>/jogadores/<id>` pelo convidado → **500 `{"erro":"Erro interno."}`**; pela criadora → 409 `jogador_com_historico`. Dados de teste removidos depois.
- **Impacto**: nenhum dado se perde (a FK segura). Mas a resposta 500 contra 204 revela a quem não deve ver o caixa que o jogador tem pagamento (contraria a intenção de FIN-39), e o erro fica sem tratamento.
- **Correção sugerida**: no `excluir`, `SAVEPOINT` e tratar 23503 como `com_historico` (molde: `lancamentos-excluir.ts:66-78`), ou ler o histórico por uma função `SECURITY DEFINER` que devolve só o booleano. Teste com o ator sem acesso.

### SEC-F03 [BAIXO] Ano 0000 passa no contrato e vira 500 no banco

- **Evidência**: `backend/contrato/src/financeiro.ts:38` (`z.iso.date()` aceita `0000-01-01`; o Postgres não tem ano 0) e `:41-43` (`mesFinanceiro` aceita `0000-01`).
- **Reprodução (local, feita)**: `POST …/financeiro/lancamentos` com `"data":"0000-01-01"` → **500**; `PUT …/financeiro/config` com `"dataSaldoInicial":"0000-01-01"` → **500**. Nada gravado.
- **Impacto**: robustez. Dá erro interno no lugar do 422 com a mensagem do campo (FIN-03), sem vazar detalhe: o corpo é fixo.
- **Correção sugerida**: ano mínimo (ex.: 1900 ou 2000) em `dataFinanceira` e `mesFinanceiro`, com teste do 422.

### SEC-F04 [BAIXO] Descrição do lançamento aceita caracteres invisíveis e de controle bidirecional

- **Evidência**: `backend/contrato/src/financeiro-lancamentos.ts:182-186` usa só `.trim()`. O resto do projeto usa `textoVisivel` (`backend/contrato/src/grupo.ts:14,24-32`), que recusa `\p{Cc}\p{Cf}` e normaliza para NFC.
- **Reprodução (local, feita)**: `POST …/financeiro/lancamentos` com `"descricao":"​"` → 201, com descrição visualmente vazia. Com `"descricao":"Pix ‮05,99 R$‬ recebido"` → 201, e o texto aparece invertido na tela. Lançamentos apagados depois.
- **Impacto**: um admin com acesso deixa no caixa um registro enganoso (valor ou texto disfarçado, ou linha sem descrição), contra os demais admins. O React escapa a saída: **não há XSS**.
- **Correção sugerida**: `descricaoLancamento` sobre `textoVisivel(1, 80, MENSAGEM_DESCRICAO)`.

### SEC-F05 [BAIXO, defesa em profundidade] A trava de `vinculos_admin` vale por linha, não por coluna; o `pelada_app` ainda tem INSERT na tabela

- **Evidência (sonda de banco, feita em ROLLBACK)**: com o contexto da conta A, que tem acesso em G1 e G3, `UPDATE vinculos_admin SET conta_id = <D>` na linha de B → 1 linha: dá vínculo a uma conta sem convite. `SET grupo_id = <G3>` → 1 linha: move B para um grupo em que ele não estava. `SET criado_por/criado_em` → 1 linha. Com o contexto de B, sem acesso, `INSERT (D, G1, false)` → 1 linha: vínculo sem convite, pela policy permissiva herdada `1792843320000_rls.sql:56`. Grants em `1792843260000_roles.sql:22-32`.
- **Por que é baixo**: nenhuma rota faz isso. A API só faz `UPDATE … SET acessa_financeiro`, com parâmetros (`acesso.ts:60-62`), e nunca insere vínculo direto: convite e criação de grupo usam funções `SECURITY DEFINER`. Exigiria uma falha nova na API. A meta da FIN-41 ("um erro na API não conceda a permissão") fica cumprida para a coluna, mas não para o vínculo em si.
- **Correção sugerida**: migração aditiva com `REVOKE INSERT, UPDATE ON vinculos_admin FROM pelada_app; GRANT UPDATE (acessa_financeiro) ON vinculos_admin TO pelada_app;`. Antes, confirmar que nenhuma rota precisa do `FOR UPDATE` direto (`vinculos_travar` já cobre). Teste por comando.

## Observações (sem severidade)

- `onError` (`backend/api/src/entrada/app.ts:166-171`) não registra o erro. Os 500 de SEC-F02 e SEC-F03 aparecem no log só como linha de acesso, sem causa. Isso é bom para não vazar dado pessoal, mas deixa a operação às cegas. Sugestão: registrar só o código SQLSTATE e a rota.
- `pularChecagemDaPropriaConta` (`acesso.ts:26`) e `pularChecagemDoVinculo` (`lancamentos-excluir.ts:25`) são opções só de teste no código de produção. Nenhuma rota as repassa (`admins.ts:79`, `financeiro-lancamentos.ts:131`), então não são exploráveis.
- LGPD: a descrição gerada da mensalidade guarda o apelido (`backend/dominio/src/caixa/mensalidade.ts:28`), que continua no texto livre se o apelido mudar. A auditoria não guarda descrição nem apelido (FIN-44 conferido em `pagamentos.ts:92-97`, `lancamentos.ts:97-101,134-142`, `lancamentos-excluir.ts:230-235`, `config.ts:159-164`).
- Dependências: `pnpm audit --prod` mostra 2 moderadas (`glob`, `minimatch`, via `node-pg-migrate`, ferramenta de migração fora do Worker). Não são da feature.
- Segredos: o `gitleaks` deu 3 resultados em arquivos de teste (`cifra.test.ts`, `sessao*.test.ts`) e a busca embutida achou `SENH****` em `frontend/web/e2e/financeiro.spec.ts:18`. Todos são fixtures de senha de conta local de teste: falsos positivos. `.env.validacao` não é versionado (está em `.git/info/exclude`).

## Conferido sem achado

| Ponto | Evidência |
|---|---|
| Matriz RLS: 3 tabelas × SELECT/INSERT/UPDATE e DELETE sem WHERE × 5 atores (com acesso, admin sem acesso, outro grupo, slug, sem contexto) | Sonda de banco em ROLLBACK: só A vê e altera G1. Os outros veem 0, alteram 0 e o INSERT dá 42501. O upsert em grupo alheio dá 42501. `config_financeira` sem DELETE grant (42501) |
| FIN-41: B não se concede (UPDATE da própria linha = 0, sem WHERE = 0, INSERT `true` = 42501, upsert = 42501, DELETE+INSERT = 42501); A não altera a própria linha (0) | `1792845360000_financeiro-trava-acesso.sql:16-23` |
| `contas_nomes_do_grupo` não revela autoras de lançamento a quem não tem acesso | Sonda: B = 0, A = 1 |
| Ordem 404 → 409 → 403 → `plano_pro` | `middlewares/vinculo.ts:72-79`, depois `app.ts:111-113` e `middlewares/financeiro.ts:50-54`. Financeiro fora do `somente_leitura` (`plano-editavel.ts:96`) |
| API: sem acesso → 403 nas 4 famílias; grupo alheio → 404; variantes de caminho (`/mes/`, `%66inanceiro`, `//`, caixa) não contornam o middleware | Sonda de API |
| IDOR: lançamento de outro grupo ou inexistente → 404; jogador de outro grupo → 422 com a mesma mensagem; `contaId` filtrado pelo grupo | `lancamentos.ts:65,123`, `pagamentos.ts:43-48`, `acesso.ts:43-56` |
| Injeção: todo SQL usa o `sql` com parâmetros do kysely; corpos e consulta são `.strict()` | `repositorios/financeiro/*` |
| Concorrência: config com `pg_advisory_xact_lock`; marcar com `FOR UPDATE` do jogador e PK; excluir e editar com `FOR UPDATE OF l` e SAVEPOINT | `config.ts:141`, `pagamentos.ts:43-89`, `lancamentos-excluir.ts:202-228` |
| Respostas sem cache (`Cache-Control: no-store`, `nosniff`); o service worker não guarda `/api` do financeiro; o front escapa a saída e codifica ids na URL | `pwa/servico.ts:68-72`, `dados/financeiro.ts:57-68`, `dados/grupos.ts:39-41` |

## Perguntas para o usuário

1. **A criadora do grupo pode perder o acesso ao financeiro por ação de outro admin (SEC-F01)?**
   - **Não, proteger a criadora (Recomendado)**: o PATCH sobre a criadora com `false` responde 409 e a policy recusa no banco. Custa uma migração aditiva e um teste por comando, no retrabalho.
   - **Sim, manter como está**: vale como regra de negócio aceita (registrar uma AD). A criadora depende do suporte para recuperar o acesso.
   - **Só a criadora retira acessos**: só ela concede e retira, e os convidados com acesso só usam o caixa. Muda a FIN-35 e a tela t19.
