# Grupos e elenco: auditoria de segurança do /validar

**Data**: 2026-11-06
**Alvo**: feature `grupos-e-elenco` da v2, worktree `GestaoDaPelada_v2-wt-grupos-e-elenco`, branch `feature/grupos-e-elenco` @ `f9801ec0`. A branch está igual à `main`: o código da feature já foi integrado, e a auditoria olhou o código atual.
**Auditor**: `auditor-seguranca` (subagente, só leitura; nenhum código alterado)
**Resultado**: **0 críticos, 0 altos, 1 médio, 3 baixos** e 5 observações informativas
**Bloqueia a integração?** Não: não há crítico nem alto. O médio pede uma decisão (ver Perguntas).
**Critérios SEC-001 a SEC-009 da Base**: os nove se sustentam (tabela abaixo). Os achados novos são `SV-NN`, para não se confundir com os `SEC-NNN` da Base.

## Escopo e método

- Revisão manual: cadeia das rotas de grupo (`entrada/app.ts`, `middlewares/{vinculo,grupo-ativo,limite-escrita,com-banco}.ts`), rotas `grupos`, `grupo`, `grupo-estado`, `jogadores`, `jogador`, `periodos`, `periodos-correcao`, `habilidades`, `notas` e `admins`; repositórios `grupos`, `grupos-estado`, `jogadores*`, `habilidades`, `notas` e `convites`; migrações de RLS, grants, `grupos_visiveis`, trigger de arquivar e `vinculos_travar`; contrato (`grupo.ts`, `elenco.ts`, `periodos.ts`); e-mail de convite; Sentry; front (montagem de URL, `innerHTML`, armazenamento, cache).
- Varredura: `python .claude/scripts/varredura-seguranca.py ferramentas` (saídas brutas no scratchpad da sessão, fora do repositório).
- Teste ativo **só no ambiente isolado**: Postgres `pelada-gel-pg` (127.0.0.1:5443, banco `pelada_gel`) e `wrangler dev` em 127.0.0.1:8743 como `pelada_app` (`rolbypassrls = f`), com o `.env` da worktree e `URL_PUBLICA` local. A API foi encerrada ao fim. Contas novas `sonda-{criadora,outra,intrusa,tardia}-*@exemplo.test`, criadas pela própria API. As provas no banco rodaram como `SET LOCAL ROLE pelada_app` em transação com `ROLLBACK`. A única gravação direta, feita como owner, foi um `pagamentos_mes` de teste (SV-02). Os dados de sonda ficaram no `pelada_gel`. Scripts: `C:\Users\leand\AppData\Local\Temp\claude\b1dd5b99a1e67609\311045a7-4b0f-4c09-9853-1ab7351f6898\scratchpad\sondas\sondas.mjs` e `sondas2.mjs`.
- Nenhuma suíte do projeto foi rodada. Para o SEC-003, 61 requisições leves de uma só conta, o mínimo para ver o 429.

### Ferramentas

| Ferramenta | Situação | Resultado |
|---|---|---|
| `pnpm audit --prod` | rodou | 2 moderadas, `glob` (GHSA-3g3m-2fjr-6pw4) e `minimatch` (GHSA-g3hv-75wg-m249), via `node-pg-migrate`, que só o executor de migrações usa; o Worker não as carrega |
| gitleaks (histórico) | rodou | 3 ocorrências, todas fixtures de teste (`test/rotas/sessao*.test.ts`, `test/infraestrutura/push/cifra.test.ts`) |
| Busca embutida (histórico) | rodou | 249 ocorrências: URLs `postgres://…:****@127.0.0.1` locais, modelos `<se****>` no runbook e no README e senhas de fixture. Nenhuma credencial do Neon nem do Asaas (ver I-5) |
| osv-scanner, semgrep | não executado | não instalados (instalar é decisão do usuário) |

## Critérios da Base (SEC-001 a SEC-009) e controles conferidos

| Critério | Situação | Evidência |
|---|---|---|
| Isolamento entre grupos | sustenta | 12 rotas de G chamadas pela conta X, sem vínculo: 404 em todas. 7 ids de G usados sob o grupo GX de X (GET, PATCH e DELETE de jogador, inativar, nota, PATCH e DELETE de habilidade): 404. Os repositórios filtram por `grupo_id` (ex.: `jogadores-edicao.ts:201`, `notas.ts:26-27`) |
| SEC-001 | sustenta (só na aplicação, I-1) | `DELETE …/admins/<criadora>` pela O: 409 `criadora_nao_removivel` (`repositorios/convites.ts:203`) |
| SEC-002 | sustenta | `dataEntrada` `0000-01-01`, `0001-01-01` e `1999-12-31`: 422 (`contrato/src/elenco.ts:119`) |
| SEC-003 | sustenta | conta X: 429 na 61.ª escrita, com `Retry-After: 60`; a conta A na mesma janela: 201; GET da X depois do 429: 200 (`middlewares/limite-escrita.ts:40-46`) |
| SEC-004 | sustenta | criadora cancela o convite pendente em G arquivado: 204 (`middlewares/grupo-ativo.ts:31`) |
| GEL-26 | sustenta | em G arquivado: PATCH de jogador, POST de habilidade, convite, remoção de admin e POST com o id em maiúsculas dão 409. Caminho com barra final (`…/arquivar/`) também dá 409 (falha fechada) |
| SEC-005 | parcial (SV-03) | NUL, U+200B e U+202E: 422 (`contrato/src/grupo.ts:14`) |
| SEC-006 | sustenta (revisão) | `infraestrutura/email/modelos.ts:96-100`: uma linha, separadores de link cercados de espaço, HTML escapado |
| SEC-007 | sustenta | com uma escrita em curso, o `arquivar` da criadora esperou o fim dela (`active / Lock` no `pg_stat_activity`) e depois deu 200 (`grupo-ativo.ts:64`, `grupos-estado.ts:311`) |
| SEC-008 | sustenta | a edição do telefone gravou `jogador_editado {"campos":["telefone"]}`; nenhuma linha de `auditoria` do grupo tem o telefone ou o ano |
| SEC-009 | sustenta | `UPDATE grupos SET arquivado_em` como `pelada_app` com a conta O: `Só quem criou o grupo pode arquivar ou reativar.` (42501). `UPDATE … criado_por`: `permission denied` |
| GEL-24 | sustenta | `POST …/arquivar` pela O: 403 `so_quem_criou` |
| CSRF | sustenta | PATCH sem `X-Pelada`: 403 |
| Dado pessoal fora de logs e Sentry | sustenta (revisão) | `app.ts:166-171` responde sem o erro; o `limparEvento` (`contrato/src/sentry.ts:36-54`) tira o corpo, os cookies e os e-mails |
| Front | sustenta (revisão) | todo id de caminho passa por `encodeURIComponent` (`dados/grupos.ts:40`, `telas/admins/Admins.tsx:139`); nenhum `dangerouslySetInnerHTML`; o cache é limpo ao sair (`dados/cliente.ts:160`) |

## Achados

### Médio

#### SV-01 [MÉDIO] Corpo lido depois de abrir a transação e de travar o grupo: uma escrita lenta segura conexão e trava sem limite de tempo

- **Onde**: a cadeia em `backend/api/src/entrada/middlewares/vinculo.ts:72-79` roda `comBanco`, `exigirVinculo` (primeira consulta, que abre a conexão e o `BEGIN`) e `exigirGrupoAtivo` (`grupo-ativo.ts:62-66`, `FOR KEY SHARE` na linha do grupo) **antes** do handler. Só no handler o corpo é lido (`entrada/corpo.ts:33`, `c.req.json()`). Não há `idle_in_transaction_session_timeout` nem `statement_timeout` (`infraestrutura/db/cliente.ts`, migrações).
- **Reprodução** (sonda `sondas2.mjs lento`): a conta O abre `POST /api/grupos/<G>/jogadores` com `Content-Length` de 57 e manda só 5 bytes. O `pg_stat_activity` mostra a sessão `pelada_app` em `idle in transaction`. O `POST …/arquivar` da criadora fica `active / Lock` e não responde em 6 s. Quando o corpo termina, a escrita lenta dá 201 e o arquivar dá 200, 8,2 s depois.
- **Impacto**: qualquer conta cria um grupo grátis e pode abrir várias escritas com corpo lento. Cada uma prende uma conexão do Hyperdrive ou do Neon pelo tempo que o cliente quiser. O `LIMITE_ESCRITA` conta requisições por minuto, não as que continuam abertas: a cada minuto mais 60 se acumulam. O pool esgotado derruba o app para todos os grupos (503), contra a premissa de custo zero. No próprio grupo, a admin trava o `arquivar` da criadora. **Não reproduzido em escala nem na Cloudflare**: o esgotamento do pool não foi testado (seria teste de carga), e não está confirmado se a borda da Cloudflare entrega o corpo ao Worker aos poucos ou bufferizado. Por isso fica médio, não alto.
- **Correção recomendada**: ler e validar o corpo **antes** da primeira consulta (ex.: um middleware que lê o JSON das escritas antes do `comBanco` e o guarda em `c.var`), com `bodyLimit` (SV-04). Como segunda barreira, `SET LOCAL idle_in_transaction_session_timeout` (ex.: 5 s) e `statement_timeout` no `aoAbrir` do `comBanco`. Teste: corpo lento não abre conexão, e transação ociosa cai sozinha.

### Baixo

#### SV-02 [BAIXO] Admin sem acesso ao financeiro que exclui jogador com pagamento recebe 500, não 409

- **Onde**: `backend/api/src/infraestrutura/db/repositorios/jogadores-edicao.ts:259-270`. A conferência de histórico lê `pagamentos_mes` sob a RLS, e a policy restritiva `pagamentos_mes_acesso_financeiro` (`migracoes/1792845300000_financeiro-rls.sql:41-44`) esconde as linhas de quem não tem `acessa_financeiro`. O `EXISTS` dá falso, o `DELETE FROM jogadores` cai na FK sem cascata (`linha-de-base.sql:266`) e o 23503 vira 500.
- **Reprodução** (sonda `sondas2.mjs pagamento`): um `pagamentos_mes` de teste para o jogador JP de G. `DELETE /api/grupos/<G>/jogadores/<JP>` pela O, que é convidada sem financeiro: `500 {"erro":"Erro interno."}`. A criadora, com financeiro: `409 jogador_com_historico`.
- **Impacto**: a GEL-85 falha para toda admin convidada, porque o convite nasce sem financeiro. A tela mostra erro genérico em vez de "Inativar em vez disso", e cada tentativa gera um 500 no Sentry. Há também um oráculo pequeno: 500 contra 204 diz a quem não vê o caixa que o jogador tem pagamento. Nada é apagado: a FK segura.
- **Correção recomendada**: conferir o histórico numa função `SECURITY DEFINER` que devolve só o booleano (com `search_path` fixo e a checagem de vínculo, como `vinculos_travar`), ou traduzir o 23503 dessa FK no mesmo 409. Teste de rota com uma admin sem financeiro.

#### SV-03 [BAIXO] SEC-005 incompleto: caracteres invisíveis fora de `\p{Cc}` e `\p{Cf}` são aceitos

- **Onde**: `backend/contrato/src/grupo.ts:14` (`INVISIVEIS = /[\p{Cc}\p{Cf}]/u`), usado por `textoVisivel` no nome do grupo, no apelido e na habilidade.
- **Reprodução** (sonda `sondas.mjs`, S4): com o jogador "Beto" já cadastrado, o apelido `"Beto\u034F"` (combining grapheme joiner, Mn) dá 201, e o grupo passa a ter dois "Beto" iguais na tela, o que contorna a GEL-35 a olho. Também dão 201: `"Beto\uFE0F"` (seletor de variação), `"\u3164\u3164\u3164"` (Hangul filler, Lo, que fica em branco na tela), `"\u2800\u2800"` (braille em branco), `"Be\u2028to"` (separador de linha), a habilidade `"\u3164\u3164"` e o nome de grupo `"\u3164\u3164\u3164"`.
- **Impacto**: é o mesmo risco que o SEC-005 queria fechar. Apelidos falsificados ou invisíveis aparecem no ranking público, no PDF e na escalação; nomes de grupo e de habilidade ficam em branco. Não há XSS: o React escapa.
- **Correção recomendada**: acrescentar ao padrão U+034F, U+115F, U+1160, U+17B4, U+17B5, U+180E, U+2028, U+2029, U+2800, U+3164, U+FFA0, os seletores de variação (U+FE00 a U+FE0F, U+E0100 a U+E01EF) e `\p{Co}` e `\p{Cn}`. Exigir pelo menos uma letra ou um número (`\p{L}|\p{N}`) depois de tirar os invisíveis. Testes de contrato por caractere.

#### SV-04 [BAIXO] Sem limite de tamanho do corpo nas rotas de grupo (o controle de 16 KB da Base não veio para a v2)

- **Onde**: `backend/api/src/entrada/app.ts:95-113`: nenhum `bodyLimit` antes das rotas `/api/grupos*`, que leem o JSON inteiro em `entrada/corpo.ts:33`. Só as rotas públicas, de push e o webhook têm `bodyLimit` (`rotas/publico.ts:156`, `rotas/publico-push.ts:45`, `rotas/webhook-asaas.ts:172`). A Base registrava `bodyLimit` de 16 KB em `app.ts:34,106` como controle conferido.
- **Reprodução**: `POST /api/grupos/<G>/jogadores` com um corpo de 5 MB, com o campo `lixo`. Resposta: 422 (o `.strict()` recusa o campo) em 380 ms, depois de receber e parsear tudo. Nenhum 413.
- **Impacto**: cada requisição gasta a CPU do Worker parseando até o limite da plataforma, e no Free a requisição pode estourar o tempo de CPU. Somado ao SV-01, o corpo grande e lento também segura a transação. O `LIMITE_ESCRITA` limita o volume por conta.
- **Correção recomendada**: `bodyLimit` (ex.: 16 KB, 413 com mensagem fixa) nas escritas de `/api/*` antes do `carregarSessao`, com teste por método (POST, PUT, PATCH, DELETE).

### Observações informativas (sem severidade)

- **I-1. SEC-001 sem segunda barreira no banco.** Como `pelada_app` com a conta O, `DELETE FROM vinculos_admin WHERE conta_id = <criadora>` apagou 1 linha (transação desfeita). A policy `vinculos_admin_apagar` (`1792843320000_rls.sql:55`) só exige visibilidade. O SEC-009 ganhou trigger; o SEC-001 depende só de `repositorios/convites.ts:203`. Sugestão: trigger `BEFORE DELETE` que recusa remover a `criado_por` quando `app_conta_id()` é outra conta.
- **I-2. `pelada_app` insere vínculo de admin para qualquer conta.** O grant `INSERT` em `vinculos_admin` (`1792843260000_roles.sql:22`) e a policy permissiva (`rls.sql:53`) deixaram a O inserir o vínculo da conta X em G sem convite (transação desfeita). Nenhuma rota faz isso hoje: os convites usam funções `SECURITY DEFINER`. Revogar o `INSERT` do runtime fecharia a porta.
- **I-3. Fora do escopo (financeiro): admin com financeiro pode retirar o acesso da criadora.** `repositorios/financeiro/acesso.ts:29-69` não confere `criado_por`. É a variante financeira da tomada de controle do SEC-001, e a criadora não pode se conceder o acesso de volta (`1792845360000_financeiro-trava-acesso.sql:16-19`). Encontrada só por revisão, sem teste; vale para a auditoria da `financeiro`.
- **I-4. Corridas de arquivar ainda dão 500.** Dois `arquivar` ou `reativar` simultâneos do mesmo grupo dão 40P01, como a lacuna já registrada em `grupos-estado.ts:251-253`. Só afetam a criadora; sem impacto de segurança.
- **I-5. Credenciais locais no histórico.** `.specs/STATE.md` (commit `62e95816`) traz a URL do Postgres local `postgres://postgres:pos****@127.0.0.1` e as senhas de seed (`SEED_SENHA_ADMIN=Senh****`), só de 127.0.0.1. Não são de produção. Se alguma dessas senhas for reaproveitada fora do ambiente local, troque-a.

## Indícios de invasão ou vazamento

Nenhum. Os achados de segredo da varredura são fixtures e valores locais mascarados.

## Perguntas para o usuário

1. **SV-01: corpo lento segurando a transação.**
   - *Ler o corpo antes do banco, com `bodyLimit` e timeout de transação ociosa (Recomendado)*: um lote de retrabalho crítico (middleware e `aoAbrir` do `comBanco`), que fecha SV-01 e SV-04 juntos.
   - *Só o timeout no `comBanco`*: muda menos código e limita o estrago a alguns segundos por requisição, mas a conexão continua aberta enquanto o corpo não chega.
   - *Aceitar o risco até a revalidação do fim do projeto*: registrar como débito. Uma conta automatizada pode esgotar o pool.
2. **SV-02 a SV-04 (baixos)**: corrigir no retrabalho desta feature ou registrar como débito?
   - *Corrigir no retrabalho (Recomendado)*: SV-02 e SV-03 são pequenos e cada um tem teste direto.
   - *Registrar como débito*: a GEL-85 continua dando 500 para convidadas, e os apelidos invisíveis seguem aceitos.
3. **Dados de sonda no `pelada_gel`**: as contas `sonda-*-mw5gqmzf@exemplo.test`, os grupos delas e o `pagamentos_mes` de teste do jogador "Pagante" ficaram no banco isolado. Mantê-los (inofensivos para a suíte, que cria os próprios dados) ou recriar o banco?
