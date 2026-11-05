# Conta e acesso — Tarefas

**Modo**: enxuto
**Passada**: rascunho
**Base**: `ljs:.specs/features/conta-e-acesso/spec.md` (aprovada em 2026-10-26, ACE-01 a ACE-76), `ljs:.specs/features/conta-e-acesso/design.md`, `ljs:.specs/features/conta-e-acesso/context.md`, `ljs:.specs/features/conta-e-acesso/seguranca.md`, `ljs:.specs/features/conta-e-acesso/validation.md` (PASS) e o mockup de módulo `ljs:.specs/features/conta-e-acesso/mockup/`, com `ljs:` = `C:\Leandro\Projetos\GestaoDaPelada_LJS` @ `e557292`, conferido em 2026-11-03. Contrato da fundação v2: `.specs/features/fundacao/spec.md`, `design.md` e `tasks.md`.
**Branch pai**: `feature/fundacao` (a fundação ainda não estará integrada quando esta feature for executada). Se a fundação já estiver integrada na `main` quando o `/executar` começar, a Branch pai passa a ser `main`.
**Feature**: 2 de 8 do roteiro (AD-001, AD-015). Requisitos `ACE-*`.

> Convenções desta lista: `F:` = `.specs/features/fundacao/tasks.md`; `FD:` = `.specs/features/fundacao/design.md`; `M:` = `ljs:backend/api/src/infraestrutura/db/migracoes/` (as 23 migrações, copiadas byte a byte pela fundação, AD-003); `telas.json` = `.specs/mockup/telas.json`. Do zero (AD-002): o código e os testes do LJS são só consulta. Nome de teste de tarefa de risco alto cita o `ACE-NN`.

## Delta

1. **O banco já tem tudo.** As 23 migrações (AD-003) já trazem as colunas, as tabelas (`links_conta`, `convites_admin`, `envios_email`, `envios_email_dia`, `pedidos_email_origem`, `falhas_senha_atual`), as policies, os grants e as 20 funções `SECURITY DEFINER` desta feature (`M:1792843380000` a `M:1792844160000`). **Sem migração nova** (AD-018 proposta). As Phases 1 a 3 são a rede de proteção (T0 da regra): caracterizam no Postgres o que o banco já faz, sem teste na v2.
2. **O que a grupos-e-elenco do LJS já mudou no banco** e vale aqui: `grupos_visiveis()` esconde grupo arquivado de quem não o criou (`M:1792844280000_grupos-visiveis-arquivado.sql:9`), então `GET /api/sessao` (ACE-18) não lista esse grupo; convite de grupo arquivado responde `link_invalido` (`M:1792844460000_convites-grupo-arquivado.sql:11-101`). A role de backup chama-se `pelada_backup_ro` (`M:1792844220000_roles-padronizadas.sql:26`), não `pelada_backup` como no ACE-45 (AD-016 proposta).
3. **A fundação v2 não tem** o middleware do `X-Pelada` (ACE-49), o leitor de sessão, nem zod no contrato: nascem aqui. O `comBanco` (`F:1203`) recebe o contexto; esta feature o estende para ler `c.var.contaId`. O `limiteTaxa` (`F:1153`) usa o IP inteiro como chave; esta feature passa a usar o /64 no IPv6 (ACE-71).
4. **Comparação visual:** a fundação compara só rotas de vitrine (`F:1788`, FUN-38). As telas de acesso do `telas.json` são rotas reais com `respostas`, `esperar`, `recorte` e `passos`: T54 estende o runner (AD-021 proposta). O mockup de módulo do LJS **já está em `.specs/mockup/`** da v2 (t29 a t33 e os estados novos de t04, t05, t06, t19, t25; `telas.json:137-187`), então ACE-55 já tem o mockup aprovado e **não há `reuso.md`** (nenhuma cópia literal).
5. **Tela sem mockup:** o roteiro da v2 (`.specs/projeto/roadmap.md:8`) põe "landing" nesta feature, mas a spec do LJS deixa a landing na `planos-e-cobranca` (`spec.md:29`) e o mockup não tem landing. Decidido (AD-023): a landing fica na `planos-e-cobranca`; aqui `/` segue a página provisória com a faixa de conta excluída.
6. **Guardrails do LJS** (`.md/GUARDRAILS.md`, G-02 a G-20) não existem na v2 (AD-006): os critérios valem pelo próprio texto (AD-020 proposta). O snapshot de compatibilidade do contrato (design C6 do LJS) não é pedido por nenhum ACE e fica fora (AD-019 proposta).
7. **Prévia e e-mail:** até a paridade o único alvo é a prévia `gestaodapelada-v2` (AD-004). Os links de e-mail usam `URL_PUBLICA` da prévia. `RESEND_API_KEY`, `RESEND_REMETENTE`, `LIMITE_EMAILS_DIA`, `EMAIL_DEV` e `SEED_SENHA_ADMIN` entram só como nomes no `.env.example`; criar os secrets no environment `previa` é passo do usuário no `/preparar` (Nível 2). O script do dono mantém `--alvo producao` como no LJS, com confirmação digitada (AD-024, exceção consciente à AD-004 só para este script).
8. **Rotas do front pelo `telas.json`:** a t25 abre em `/app/conta/senha` e Minha conta em `/app/conta` (`telas.json:137`, `telas.json:183`), não `/conta/senha` como no ACE-54 (AD-017 proposta). Depois de aceitar o convite, a tela vai a `/app/grupos/:grupoId/admins`, a única rota de grupo até a `grupos-e-elenco` (AD-022 proposta; mesma escolha do LJS, `ljs:.specs/features/conta-e-acesso/tasks.md:32`).
9. Node 26 (AD-012); testes de banco só em Postgres local ou de serviço (FUN-19); local e CI migram como `postgres` (AD-009). O risco do `FD:183` (função `SECURITY DEFINER` sem `search_path`) não se confirma: todas as 20 têm `SET search_path = public, pg_temp`; T3 prova.

## Critérios

| ID | Resumo | Tarefa |
|---|---|---|
| ACE-01 | `POST /api/conta` cria conta não confirmada, grava termos, envia confirmação, 201 | T4, T25, T44 |
| ACE-02 | Sem aceite dos termos: 422 `termos_obrigatorios` | T12, T25 |
| ACE-03 | Nome, e-mail ou senha fora dos limites: 422 com o campo | T11, T25, T44 |
| ACE-04 | E-mail já existente: mesma resposta, conta intacta, aviso ao dono do e-mail | T4, T16, T25 |
| ACE-05 | E-mail em minúsculas e sem espaços; iguais se só diferem nisso | T4, T11 |
| ACE-06 | Link de confirmação em 24 h confirma sem abrir sessão; `/entrar` com aviso | T4, T25, T45 |
| ACE-07 | Link vencido, usado ou inexistente: "Link inválido ou vencido" | T4, T25, T45 |
| ACE-08 | Novo link invalida o anterior; mesma resposta exista ou não a conta | T4, T25, T45 |
| ACE-09 | Entrar cria sessão, 200 com nome e e-mail, cookie `__Host-sessao` | T5, T14, T26, T43 |
| ACE-10 | Banco guarda só o SHA-256 do token de sessão | T5, T13 |
| ACE-11 | E-mail inexistente ou senha errada: 401 `credenciais_invalidas`, mesma mensagem | T5, T26, T43 |
| ACE-12 | Não confirmada: 403 `email_nao_confirmado`, tela oferece reenviar | T5, T26, T43 |
| ACE-13 | 5 falhas do par e-mail e IP em 15 min: 429 `bloqueado_temporariamente` | T5, T26, T43 |
| ACE-14 | Bloqueio de um IP não afeta outro IP sem falhas | T5, T26 |
| ACE-15 | 15 min sem requisição: 401 `sessao_expirada` | T6, T20 |
| ACE-16 | 12 h desde a criação: 401 `sessao_expirada` | T6, T20 |
| ACE-17 | Sair apaga a sessão, 204, cookie vencido | T14, T26, T50 |
| ACE-18 | `GET /api/sessao`: id, nome, e-mail e grupos; sem sessão, 401 | T22, T26, T50 |
| ACE-19 | `/app` sem sessão vai a `/entrar` e volta à rota pedida | T37 |
| ACE-20 | Sessão expira no uso: `/entrar` com "Sua sessão expirou. Entre de novo." | T36, T43 |
| ACE-21 | Nunca logar senha, tokens nem corpo das rotas de autenticação | T15, T31 |
| ACE-22 | Esqueci a senha: 200 com a mesma mensagem exista ou não a conta | T27, T46 |
| ACE-23 | Link de recuperação de 1 h; o anterior perde a validade | T4, T7, T16, T27 |
| ACE-24 | Nova senha com link válido: troca, usa o link, encerra sessões, confirma e-mail | T7, T27, T47 |
| ACE-25 | Link de recuperação inválido: 410 `link_invalido`, senha intacta | T7, T27, T47 |
| ACE-26 | Trocar senha: 204, encerra as outras sessões, mantém a atual | T7, T28, T52 |
| ACE-27 | Senha atual errada: 401 `senha_atual_incorreta` | T7, T28, T52 |
| ACE-28 | Excluir conta: apaga sessões, vínculos e links, anonimiza, 204, `/` com aviso | T8, T28, T51 |
| ACE-29 | Única admin de grupo não arquivado: 409 `unico_admin` com a lista | T8, T28, T51 |
| ACE-30 | Senha errada na exclusão: 401, nada apagado | T8, T28 |
| ACE-31 | Convidar: convite de 7 dias, e-mail com link, 201 | T9, T16, T30, T53 |
| ACE-32 | E-mail já com vínculo: 409 `ja_e_admin` | T9, T30, T53 |
| ACE-33 | Logado aceita convite do próprio e-mail: vínculo sem financeiro, vai ao grupo | T9, T29, T49 |
| ACE-34 | Sem conta: cadastro com e-mail travado, nasce confirmado e com vínculo | T9, T29, T49 |
| ACE-35 | Convite de outro e-mail: 403 `convite_de_outro_email` | T9, T29, T49 |
| ACE-36 | Convite vencido, usado, cancelado ou inexistente: 410 `link_invalido` | T9, T29, T49 |
| ACE-37 | `GET .../admins`: admins e convites pendentes | T9, T30, T53 |
| ACE-38 | Cancelar convite: link inválido, 204 | T30, T53 |
| ACE-39 | Remover admin: apaga vínculo, auditoria, 204 | T23, T30, T53 |
| ACE-40 | Remoção que deixaria o grupo sem admin: 409 `ultimo_admin` | T23, T30, T53 |
| ACE-41 | Sem vínculo com o grupo: 404 | T21, T30, T32 |
| ACE-42 | Vínculo e convite criados ou removidos gravam `auditoria` | T23, T30 |
| ACE-43 | `pelada_app` lê e altera em `contas` só a própria linha; o resto por funções | T0, T1, T3 |
| ACE-44 | `pelada_app` lê e apaga em `sessoes` só as próprias; nunca lê hash de outra conta | T1 |
| ACE-45 | Tabelas de conta com RLS `FORCE`, leitura para a role de backup, teste de isolamento | T0, T1, T2, T3 |
| ACE-46 | `auditoria`: só `INSERT` para `pelada_app` | T2 |
| ACE-47 | Sessão resolvida e `app.conta_id` fixado antes de qualquer consulta de grupo | T20 |
| ACE-48 | Toda rota do Hono com caso na suíte de isolamento de rotas ou "não se aplica" | T32 |
| ACE-49 | Escrita sem `X-Pelada: 1`: 403 sem gastar cota de limitador | T18, T36 |
| ACE-50 | `LIMITE_ENTRAR` nas rotas sem sessão; acima, 429 | T19, T25, T26, T27, T29 |
| ACE-51 | Segundo e-mail do mesmo tipo em menos de 60 s: mesma resposta, sem envio | T4, T24 |
| ACE-52 | Resend falha: 503 `email_indisponivel`, log sem conteúdo, pedir de novo funciona | T15, T24 |
| ACE-53 | `Cache-Control: no-store` em `/api/sessao` e `/api/conta` | T31 |
| ACE-54 | t04, t05, t06, t25, t08 e t19 seguem o mockup e passam na comparação visual | T54, T55, T56 |
| ACE-55 | Telas novas com mockup aprovado e na comparação visual | T55, T56 |
| ACE-56 | Só tokens e componentes base; axe sem violação | T39, T40, T41, T43 a T53 |
| ACE-57 | `/app` sem vínculo: estado vazio do t08 | T50 |
| ACE-58 | `/termos` e `/privacidade` públicas, com versão `AAAA-MM-DD` igual à do aceite | T12, T25, T48 |
| ACE-59 | Cadastro com aceite desmarcado e links para as duas páginas | T44 |
| ACE-60 | Texto marcado como rascunho para revisão do usuário | T48 |
| ACE-61 | `pnpm --filter @pelada/scripts dono` cria ou recupera o dono, senha sem eco | T34 |
| ACE-62 | Banco remoto sem `--alvo` explícito: recusa sem alterar | T34 |
| ACE-63 | Nenhuma rota lê ou escreve `e_dono` | T33 |
| ACE-64 | `pnpm seed` cria admin confirmado com `SEED_SENHA_ADMIN`; sem ela, recusa | T35 |
| ACE-65 | Logado em `/entrar` vai a `/app` | T37, T43 |
| ACE-66 | Falhas simultâneas do mesmo par contam as duas | T5 |
| ACE-67 | Aceites simultâneos do mesmo convite: um vínculo, o segundo 410 | T9, T29 |
| ACE-68 | Senha com mais de 72 bytes em UTF-8: 422 | T11, T25 |
| ACE-69 | Conta excluída com sessão aberta: a próxima requisição recebe 401 | T8, T20 |
| ACE-70 | 5 senhas atuais erradas em 15 min bloqueiam troca e exclusão, sem bcrypt; limitador por IP | T7, T19, T28 |
| ACE-71 | IPv6 pelo /64 na chave do limitador e no `ip_hash`; IPv4 inteiro; sem IP `sem-ip` | T13, T19 |
| ACE-72 | Cota diária: 80% para cadastro, reenvio e convite; 100% para recuperação; zera no dia | T10, T24 |
| ACE-73 | Recuperação de conta não confirmada conta nos 80%; 20 pedidos por IPv4 ou /48 em 1 h: 429 | T10, T13, T24 |
| ACE-74 | 50 senhas erradas em 1 h para a conta: 429 por 10 min, texto único | T6, T26 |
| ACE-75 | Resend sem resposta em 10 s: 503 sem gastar cota; trava da cota até 2 s | T10, T15, T24 |
| ACE-76 | Recuperação de senha zera as falhas de login e o bloqueio por conta | T7, T27 |

Nenhum critério fica fora. Mudam de sentido, pelas ADs propostas: ACE-45 (role `pelada_backup_ro`, AD-016), ACE-54 (rota da t25, AD-017), ACE-33 (destino depois do aceite, AD-022), ACE-48 e ACE-63 (sem guardrails, AD-020). ACE-61 e ACE-62 valem como no LJS, com `--alvo previa` e `--alvo producao` (AD-024).

## Linha de base

- **Comando da suíte** (o de `.specs/projeto/testes.json` ao fim da fundação, `F:72-78`): `docker compose up -d --wait && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:checagens && pnpm --filter @pelada/web build && pnpm --filter @pelada/web e2e && pnpm --filter @pelada/web visual`.
- **Resultado hoje**: não roda. O `testes.json` atual é a dispensa temporária (sem código na v2) e a feature anterior, `fundacao`, ainda não foi executada.
- **Falhas preexistentes**: feature anterior ainda não executada; a linha de base é o gate final da fundação. O `/executar` desta feature roda a suíte uma vez antes do lote 1 e registra aqui o resultado e as falhas encontradas.

## Test Coverage Matrix

> Gerada da Base, do contrato da fundação e das regras de teste do `.claude/CLAUDE.md`. Sem testes na v2 ainda: padrão forte, todo critério e todo caso limite com teste. Camadas e comandos iguais aos da fundação (`F:41-56`).

| Camada | Tipo de teste exigido | Expectativa de cobertura | Padrão de local | Comando |
|---|---|---|---|---|
| Banco: RLS, grants e funções de conta (caracterização) | integration | Postgres 18 real, como `pelada_app` (`comoApp`). Matriz política × comando abaixo. Cada regra das funções com os limites (59 s, 60 s, 61 s; 4.ª e 5.ª falha; 80.º e 81.º e-mail) e concorrência | `backend/api/test/isolamento/conta-*.test.ts`, `backend/api/test/banco/conta-*.test.ts` | `pnpm --filter @pelada/api test` |
| Contrato (`backend/contrato`) | unit | Cada schema: válido, cada limite e campo extra (`.strict()`) | `backend/contrato/test/*.test.ts` | `pnpm --filter @pelada/contrato test` |
| Infraestrutura da API (token, cookie, e-mail) | unit | Todos os ramos; `fetch` falso para o Resend | `backend/api/test/infraestrutura/*.test.ts` | `pnpm --filter @pelada/api test` |
| Middlewares, repositórios e rotas | e2e | Pool `workerd` com Postgres local: caminho feliz, cada código de erro da spec, cabeçalhos e cookie | `backend/api/test/rotas/*.test.ts` | `pnpm --filter @pelada/api test` |
| Isolamento de rotas | e2e | Uma linha por rota do Hono (conta B contra o grupo da conta A) ou "não se aplica" justificado | `backend/api/test/isolamento/rotas.test.ts` | `pnpm --filter @pelada/api test` |
| Scripts e checagens | unit / integration | Caso que passa e caso que falha; o script do dono e o seed contra banco de teste | `backend/scripts/test/*.test.ts`, `backend/scripts/checagens/test/*.test.ts` | `pnpm --filter @pelada/scripts test` e `pnpm test:checagens` |
| Front: componentes, dados e telas | unit | jsdom + Testing Library + axe: cada estado do mockup, cada mensagem da spec, axe sem violação | `frontend/web/src/**/*.test.tsx` | `pnpm --filter @pelada/web test` |
| Front: comparação visual | e2e | Cada estado de acesso do `telas.json` × 2 viewports, até 1% | `frontend/web/e2e/visual.mjs` | `pnpm --filter @pelada/web visual` |
| Front: jornadas ponta a ponta | e2e | J-06 a J-09 contra o `wrangler dev` com `EMAIL_DEV=1` | `frontend/web/e2e/acesso.spec.ts` | `pnpm --filter @pelada/web e2e` |
| Documentação | none | Gate de build | — | gate de build |

**Matriz política × comando** (Phases 1, como `pelada_app`, contas A e B, e sem contexto; cada célula é um teste que morre com a policy aberta `USING (true)` ou sem `WITH CHECK`):

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `contas` | A vê só a própria linha; sem contexto, zero; `senha_hash` recusada por grant de coluna (T1) | recusado (sem grant) (T1) | só `nome` da própria linha; B sobre A afeta 0; `UPDATE` sem `WHERE` afeta só a de A; mudar `id` para a de B recusado pelo `WITH CHECK` (T1) | recusado (sem grant) (T1) |
| `sessoes` | só as da própria conta; `token_hash` de B invisível (T1) | recusado (T1) | recusado (T1) | só as próprias; `DELETE` sem `WHERE` apaga só as de A (T1) |
| `convites_admin` | só de grupos visíveis e com conta; slug público sem conta vê zero (T2) | só em grupo visível; em grupo de B recusado (T2) | só em grupo visível, com `WITH CHECK`; mover para grupo de B recusado; sem `WHERE` afeta só os de A (T2) | recusado (sem grant) (T2) |
| `auditoria` | policy de grupo herdada: B não lê a de A (T2) | só em grupo visível (T2) | recusado (T2) | recusado (T2) |
| `tentativas_login`, `links_conta`, `envios_email`, `envios_email_dia`, `pedidos_email_origem`, `falhas_senha_atual`, `pedidos_reset` | recusado (T2) | recusado (T2) | recusado (T2) | recusado (T2) |
| todas acima, role `pelada_backup_ro` | lê tudo (T2) | recusado (T2) | recusado (T2) | recusado (T2) |

## Gate Check Commands

| Nível do gate | Quando usar | Comando |
|---|---|---|
| Quick | Tarefas só com teste unitário, no pacote tocado | `pnpm --filter <pacote> test` (ou `pnpm test:checagens`) |
| Full | Tarefas com integration ou e2e; exige o Postgres local | `docker compose up -d --wait && pnpm typecheck && pnpm test && pnpm test:checagens` |
| Build | Fim de Phase, docs e o fim da feature | O comando de `.specs/projeto/testes.json` (seção Linha de base) |

> **Vermelho nas Phases 1 a 3 (caracterização):** o comportamento já existe no banco, então o teste passa de primeira. A prova de que ele falharia é a sabotagem: no banco de teste, um `CREATE OR REPLACE FUNCTION` com a regra quebrada, ou `DROP POLICY`/`GRANT` a mais, e o teste fica vermelho. Rode uma vez por tarefa e registre a evidência na própria tarefa (linha `Evidência da rede`).

## Execution Plan

As Phases rodam em ordem; dentro de cada uma, as tarefas rodam em sequência. Criticidade por Phase: 1 a 11 **críticas**, 12 a 18 **comuns**. Lotes previstos (até 6h, Phases inteiras, `progresso.py --lote` confirma): L1 = P1, L2 = P2, L3 = P3, L4 = P4, L5 = P5, L6 = P6, L7 = P7, L8 = P8, L9 = P9, L10 = P10, L11 = P11 (críticos); L12 = P12, L13 = P13, L14 = P14, L15 = P15, L16 = P16, L17 = P17 + P18 (comuns; P18 tem 2 tarefas e se junta ao anterior). Lotes com tarefa de `Domínio: sim`: L2, L3, L5, L6, L7, L8, L9.

### Phase 1: Rede de proteção: RLS e grants das tabelas de conta (crítica, 7h)

```
T0 → T1 → T2 → T3
```

### Phase 2: Rede de proteção: cadastro, entrar e sessão no banco (crítica, 6h)

```
T4 → T5 → T6
```

### Phase 3: Rede de proteção: senha, exclusão, convites e cotas no banco (crítica, 7,5h)

```
T7 → T8 → T9 → T10
```

### Phase 4: Contrato, token e cookie (crítica, 5,5h)

```
T11 → T12 → T13 → T14
```

### Phase 5: E-mail (crítica, 4,5h)

```
T15 → T16 → T17
```

### Phase 6: Middlewares de entrada e sessão (crítica, 5,5h)

```
T18 → T19 → T20 → T21
```

### Phase 7: Repositórios e envio de e-mail (crítica, 6h)

```
T22 → T23 → T24
```

### Phase 8: Rotas: cadastro, sessão e recuperação (crítica, 5,5h)

```
T25 → T26 → T27
```

### Phase 9: Rotas: minha conta, convites e admins (crítica, 6h)

```
T28 → T29 → T30
```

### Phase 10: Proteções transversais da API (crítica, 4h)

```
T31 → T32 → T33
```

### Phase 11: Script do dono e seed (crítica, 3h)

```
T34 → T35
```

### Phase 12: Base do front: dados e sessão (comum, 5,75h)

```
T36 → T37 → T38 → T39
```

### Phase 13: Componentes e rotas do front (comum, 4,5h)

```
T40 → T41 → T42
```

### Phase 14: Telas públicas: entrar, cadastro e confirmação (comum, 5,5h)

```
T43 → T44 → T45
```

### Phase 15: Telas públicas: recuperação, termos e convite (comum, 6,5h)

```
T46 → T47 → T48 → T49
```

### Phase 16: Telas com sessão (comum, 7h)

```
T50 → T51 → T52 → T53
```

### Phase 17: Comparação visual (comum, 6h)

```
T54 → T55 → T56
```

### Phase 18: Jornadas ponta a ponta e documentação (comum, 3h)

```
T57 → T58
```

## Task Breakdown

#### Phase 1: Rede de proteção: RLS e grants das tabelas de conta

### T0: Cenário de teste com duas contas que entram

**What**: Estender a fábrica de cenário da fundação com duas contas confirmadas e com senha conhecida (A e B, cada uma admin de um grupo), uma conta não confirmada e helpers para criar sessão, link e convite como `postgres`, para os testes de conta. Caracteriza o estado de partida: com as 23 migrações, as contas criadas por `conta_definir_senha` entram por `conta_entrar`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/cenario-conta.ts`
**Depends on**: None
**Reuses**: estender a fábrica de cenário e o `comoApp` da fundação (`F:909`, `FD:89`) e o `bancoDeTeste()` (`F:507`); senha por `conta_definir_senha` (`M:1792843560000_conta-senha-e-exclusao.sql:97`), chamada como `postgres` (AD-009)
**Requirement**: ACE-43, ACE-45
**Status**: rascunhada
**Nota do rascunho**: o teste do cenário fica em `cenario-conta.test.ts`; a evidência da rede (sabotagem do `conta_definir_senha`) é do /executar.

**Done when**:

- [ ] Teste `ACE-43`: as contas A e B entram com a senha do cenário por `conta_entrar` e cada uma enxerga só o próprio grupo por `comoApp`
- [ ] O banco `teste_*` é removido no `finally`, também quando a criação do cenário falha
- [ ] Evidência da rede: com `conta_definir_senha` sabotada (hash fixo), o teste fica vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T1: Matriz política × comando de `contas` e `sessoes`

**What**: Escrever os casos da matriz para `contas` e `sessoes` como `pelada_app` (contas A e B e sem contexto), por SELECT, INSERT, UPDATE e DELETE, incluindo UPDATE e DELETE sem `WHERE`, e a recusa de `senha_hash` e `token_hash` de outra conta.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/conta-sessao.test.ts`
**Depends on**: T0
**Reuses**: molde da matriz de leitura e escrita da fundação (`F:981`, `F:1007`); policies e grants em `M:1792843380000_conta-tabelas.sql:69-81`
**Requirement**: ACE-43, ACE-44, ACE-45
**Status**: rascunhada

**Done when**:

- [ ] Testes `ACE-43`: linhas da Test Coverage Matrix para `contas` (4 comandos, sem `WHERE`, `WITH CHECK` do `id`, grant de coluna de `senha_hash`)
- [ ] Testes `ACE-44`: linhas para `sessoes` (4 comandos, `DELETE` sem `WHERE` só apaga as de A)
- [ ] Evidência da rede: `DROP POLICY contas_alterar` + `CREATE POLICY ... USING (true)` e um `GRANT SELECT (senha_hash)` deixam testes vermelhos (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T2: Matriz de `convites_admin`, `auditoria`, tabelas de apoio e backup

**What**: Escrever os casos da matriz para `convites_admin` (leitura só com conta), `auditoria` (só INSERT), as 7 tabelas de apoio (tudo recusado para `pelada_app`) e a leitura completa e escrita recusada para `pelada_backup_ro`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/conta-apoio.test.ts`
**Depends on**: T1
**Reuses**: policies de `M:1792843380000_conta-tabelas.sql:55-101`; tabelas novas em `M:1792843800000_conta-senha-bloqueio.sql:8`, `M:1792843860000_conta-teto-emails.sql:7`, `M:1792843980000_conta-teto-emails-origem.sql:7`; role renomeada em `M:1792844220000_roles-padronizadas.sql:26` (AD-016 proposta)
**Requirement**: ACE-45, ACE-46
**Status**: rascunhada

**Done when**:

- [ ] Testes `ACE-45`: `convites_admin` por comando, com o slug público sem conta vendo zero linhas e `UPDATE` que move o convite para o grupo de B recusado
- [ ] Teste `ACE-46`: `pelada_app` insere em `auditoria` do próprio grupo e recebe recusa em UPDATE e DELETE
- [ ] Testes `ACE-45`: nas 7 tabelas de apoio, os 4 comandos recusados para `pelada_app`; `pelada_backup_ro` lê todas e não escreve
- [ ] Evidência da rede: `GRANT UPDATE ON auditoria TO pelada_app` deixa o teste vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T3: Meta-teste das tabelas e funções de conta

**What**: Estender o meta-teste da fundação: toda tabela de conta (sem `grupo_id`) tem `FORCE`, policy de leitura para `pelada_backup_ro` e linha na matriz; toda função `SECURITY DEFINER` tem `search_path` fixo, não tem `EXECUTE` para `PUBLIC`, e `conta_definir_senha` e as funções `_em` não têm `EXECUTE` para `pelada_app`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/meta-conta.test.ts`
**Depends on**: T2
**Reuses**: estender o meta-teste da fundação (`F:957`) e ler o catálogo como o `lerEsquema` (`F:760`); fecha o risco de `FD:183`
**Requirement**: ACE-43, ACE-45
**Status**: rascunhada
**Nota do rascunho**: a matriz de conta (tabela → arquivo de teste) fica no próprio meta-teste.

**Done when**:

- [ ] Teste `ACE-45`: uma tabela nova sem `FORCE` ou sem linha na matriz reprova (conferido com tabela criada no teste)
- [ ] Teste `ACE-43`: as 20 funções `SECURITY DEFINER` têm `search_path = public, pg_temp`; uma função criada sem ele reprova
- [ ] Teste `ACE-43`: `PUBLIC` sem `EXECUTE` em nenhuma; `pelada_app` sem `EXECUTE` em `conta_definir_senha`, `email_cota_reservar_em` e `email_origem_registrar_em`
- [ ] Evidência da rede: `GRANT EXECUTE ON FUNCTION conta_definir_senha(...) TO pelada_app` deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 2: Rede de proteção: cadastro, entrar e sessão no banco

### T4: Cadastro, links de confirmação e intervalo de 60 s no banco

**What**: Caracterizar, como `pelada_app`, `conta_cadastrar`, `link_pedir` e `link_confirmar`: conta nova sem confirmação com termos gravados, e-mail existente sem mudança, e-mail normalizado, confirmação em 24 h sem sessão, link vencido ou usado, link novo invalidando o anterior e o intervalo de 60 s.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-cadastro.test.ts`
**Depends on**: T3
**Reuses**: `M:1792843440000_conta-cadastro-e-links.sql:11` (`envio_permitido`), `:29` (`conta_cadastrar`); `M:1792843920000_conta-esqueci-nao-confirmada.sql:47` (`link_pedir`); `M:1792843740000_conta-confirmar-sem-sessao.sql:9` (`link_confirmar`)
**Requirement**: ACE-01, ACE-04, ACE-05, ACE-06, ACE-07, ACE-08, ACE-23, ACE-51
**Status**: rascunhada
**Nota do rascunho**: o apoio dos testes de banco (transação desfeita, troca de role) nasce em `backend/api/test/banco/apoio-conta.ts`.

**Done when**:

- [ ] Testes `ACE-01`, `ACE-04`, `ACE-05`: conta nova com `termos_versao` e `termos_aceitos_em`; e-mail existente (também com maiúsculas e espaços) devolve `existente` e não altera a linha
- [ ] Testes `ACE-06`, `ACE-07`: confirmação dentro de 24 h marca `email_confirmado_em` e não cria sessão; 24 h + 1 s, usado ou inexistente devolvem nulo
- [ ] Testes `ACE-08`, `ACE-23`, `ACE-51`: pedido novo invalida o anterior do mesmo tipo; aos 59 s não envia, aos 60 s e 61 s envia (borda exata do LJS)
- [ ] Evidência da rede: `link_confirmar` sabotado para ignorar `expira_em` deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T5: `conta_entrar` e bloqueio por e-mail e IP no banco

**What**: Caracterizar `conta_entrar`: sucesso cria sessão só com o hash, senha errada e e-mail inexistente com o mesmo resultado, conta não confirmada, 5 falhas do par e-mail e IP bloqueiam por 15 min, outro IP segue livre e duas falhas simultâneas contam as duas.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-entrar.test.ts`
**Depends on**: T4
**Reuses**: `M:1792844040000_conta-entrar-teto-conta.sql:21` (versão vigente de `conta_entrar`, com a trava por e-mail e IP de `M:1792843500000_conta-entrar-e-sessao.sql:15`)
**Requirement**: ACE-09, ACE-10, ACE-11, ACE-12, ACE-13, ACE-14, ACE-66
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo do teste; sem lacuna. O teste com 4 falhas e duas tentativas simultâneas é o que morre sem a trava por e-mail.

**Done when**:

- [ ] Casos limite listados antes do teste: 4.ª e 5.ª falha; 15 min menos 1 s e mais 1 s; senha certa durante o bloqueio; e-mail inexistente; falhas concorrentes
- [ ] Testes `ACE-09`, `ACE-10`: sucesso devolve `ok`, nome e conta, e `sessoes.token_hash` é o SHA-256 recebido, nunca o token
- [ ] Testes `ACE-11`, `ACE-12`: `invalida` igual para e-mail inexistente e senha errada; `nao_confirmado` sem sessão
- [ ] Testes `ACE-13`, `ACE-14`: 5 falhas do par bloqueiam até 15 min depois da quinta, mesmo com a senha certa; outro `ip_hash` entra
- [ ] Teste `ACE-66`: duas transações simultâneas com senha errada do mesmo par gravam duas falhas
- [ ] Evidência da rede: trava por e-mail sabotada (sem `pg_advisory_xact_lock`) deixa o teste de concorrência vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T6: `sessao_tocar` e teto por conta no login

**What**: Caracterizar `sessao_tocar` (15 min de inatividade, 12 h absolutas, renovação) e o teto de 50 falhas por hora por conta em `conta_entrar` (bloqueio de 10 min sem bcrypt, mesma resposta para conta inexistente, senha certa zera só fora do bloqueio).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-sessao.test.ts`
**Depends on**: T5
**Reuses**: `M:1792843500000_conta-entrar-e-sessao.sql:78` (`sessao_tocar`); `M:1792844040000_conta-entrar-teto-conta.sql:21`
**Requirement**: ACE-15, ACE-16, ACE-74
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo do teste; sem lacuna.

**Done when**:

- [ ] Casos limite listados antes do teste: inatividade de 14:59 e 15:00; 11:59 h de uso contínuo e 12 h; 49.ª e 50.ª falha de IPs diferentes; 10 min menos 1 s e mais 1 s
- [ ] Testes `ACE-15`, `ACE-16`: sessão vencida por inatividade ou pelas 12 h devolve nulo e é apagada; a válida renova `ultimo_uso_em`
- [ ] Testes `ACE-74`: 50 falhas em 1 h de 50 IPs bloqueiam por 10 min com o mesmo resultado do bloqueio por par; conta inexistente responde igual; senha certa dentro do bloqueio não zera
- [ ] Evidência da rede: `sessao_tocar` sem o teste de `expira_em` deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 3: Rede de proteção: senha, exclusão, convites e cotas no banco

### T7: Nova senha, troca de senha e bloqueio da senha atual no banco

**What**: Caracterizar `link_nova_senha` (troca, uso único, encerra sessões, confirma e-mail, zera falhas de login), `conta_trocar_senha` (mantém a sessão atual, encerra as outras) e o bloqueio de 5 senhas atuais erradas em 15 min por conta.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-senha.test.ts`
**Depends on**: T6
**Reuses**: `M:1792844160000_conta-nova-senha-zera-falhas.sql:10` (`link_nova_senha` vigente); `M:1792843800000_conta-senha-bloqueio.sql:27-82` (`falhas_senha_atual`, `conta_trocar_senha`)
**Requirement**: ACE-23, ACE-24, ACE-25, ACE-26, ACE-27, ACE-70, ACE-76
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo do teste; sem lacuna.

**Done when**:

- [ ] Casos limite listados antes do teste: link de 1 h menos 1 s e mais 1 s; link usado; 5.ª falha; senha certa antes da 5.ª zera; conta bloqueada por 50 falhas de login
- [ ] Testes `ACE-24`, `ACE-25`, `ACE-76`: link válido troca a senha, apaga todas as sessões, confirma o e-mail e apaga as `tentativas_login` do e-mail; vencido ou usado devolve falso e não troca
- [ ] Testes `ACE-26`, `ACE-27`: troca mantém só a sessão do hash recebido; senha atual errada não troca
- [ ] Testes `ACE-70`: 5 falhas em 15 min recusam a 6.ª sem comparar a senha; senha certa antes zera a contagem
- [ ] Evidência da rede: `link_nova_senha` sem o `DELETE FROM sessoes` deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T8: Exclusão de conta como anonimização no banco

**What**: Caracterizar `conta_excluir`: senha certa e sem ser única admin apaga sessões, vínculos, links e convites enviados ao e-mail e anonimiza a linha; única admin de grupo não arquivado recebe a lista de grupos sem nada apagado; senha errada não apaga nada.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-excluir.test.ts`
**Depends on**: T7
**Reuses**: `M:1792843800000_conta-senha-bloqueio.sql:92` (`conta_excluir` vigente)
**Requirement**: ACE-28, ACE-29, ACE-30, ACE-69
**Status**: rascunhada

**Done when**:

- [ ] Testes `ACE-28`: depois da exclusão, a linha tem `excluida-<id>@invalido`, "Conta excluída", hash `!` e `excluida_em`; a auditoria aponta para ela; nenhum nome ou e-mail da pessoa resta nas tabelas de conta
- [ ] Testes `ACE-29`: única admin de grupo não arquivado recebe a lista (id e nome); grupo arquivado não conta
- [ ] Testes `ACE-30`, `ACE-69`: senha errada não apaga nada; a sessão aberta de outro aparelho some e `sessao_tocar` devolve nulo
- [ ] Evidência da rede: `conta_excluir` sem a checagem de única admin deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T9: Convites e lista de admins no banco

**What**: Caracterizar `convite_criar`, `convite_ler`, `convite_aceitar`, `convite_cadastrar` e `admins_listar`: validade de 7 dias, recusa de quem já é admin, aceite só pelo e-mail do convite, cadastro pelo convite já confirmado e com vínculo, convite inválido e aceites simultâneos.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-convites.test.ts`
**Depends on**: T8
**Reuses**: `M:1792843620000_conta-convites.sql:13` (`convite_criar`); versões vigentes de `convite_ler`, `convite_aceitar` e `convite_cadastrar` em `M:1792844460000_convites-grupo-arquivado.sql:11`, `:25`, `:61`; `M:1792843680000_conta-admins-listar.sql:8`
**Requirement**: ACE-31, ACE-32, ACE-33, ACE-34, ACE-35, ACE-36, ACE-37, ACE-67
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo do teste; sem lacuna. O aceite concorrente grava de verdade (COMMIT) e limpa no finally.

**Done when**:

- [ ] Casos limite listados antes do teste: 7 dias menos 1 s e mais 1 s; usado; cancelado; grupo arquivado; e-mail diferente; aceites concorrentes; conta sem vínculo chamando `convite_criar`
- [ ] Testes `ACE-31`, `ACE-32`: convite com `expira_em` de 7 dias; e-mail já admin recusado; conta sem vínculo recusada
- [ ] Testes `ACE-33`, `ACE-35`: aceite cria o vínculo com `acessa_financeiro` falso e usa o convite; e-mail de outra conta recebe `convite_de_outro_email`
- [ ] Testes `ACE-34`, `ACE-36`: cadastro pelo convite nasce confirmado, com vínculo e sessão; vencido, usado, cancelado ou inexistente dá `link_invalido`
- [ ] Testes `ACE-37`, `ACE-67`: `admins_listar` só com vínculo; dois aceites simultâneos criam um vínculo e o segundo dá `link_invalido`
- [ ] Evidência da rede: `convite_aceitar` sem `FOR UPDATE` deixa o teste de concorrência vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T10: Cotas de e-mail no banco

**What**: Caracterizar `email_cota_reservar` e `email_cota_reservar_em` (80% para cadastro, reenvio e convite; 100% para recuperação; dia de São Paulo; trava de 2 s), `email_origem_registrar` (20 pedidos por hora por chave) e `link_pedir_com_confirmacao` (recuperação de conta não confirmada gasta a cota de cadastro).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/test/banco/conta-cotas.test.ts`
**Depends on**: T9
**Reuses**: `M:1792843860000_conta-teto-emails.sql:26`, `:43`; `M:1792844100000_conta-cota-trava.sql:7`; `M:1792843980000_conta-teto-emails-origem.sql:27`, `:50`; `M:1792843920000_conta-esqueci-nao-confirmada.sql:9`
**Requirement**: ACE-72, ACE-73, ACE-75
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo do teste; sem lacuna. O teto por categoria (80% ou 100%) é da API (T24); aqui ele entra como parâmetro.

**Done when**:

- [ ] Casos limite listados antes do teste: 80.º e 81.º e-mail com teto 100; 100.º e 101.º para recuperação; 23:59:59 e 00:00:00 em `America/Sao_Paulo`; 20.º e 21.º pedido da mesma chave em 1 h; trava segurada por 2,5 s
- [ ] Testes `ACE-72`: o 80.º sai e o 81.º não, na cota de cadastro; a recuperação segue até 100; o contador zera na virada do dia de São Paulo
- [ ] Testes `ACE-73`: recuperação de conta não confirmada gasta a cota de cadastro; o 21.º pedido da mesma chave em 1 h é recusado
- [ ] Teste `ACE-75`: com a linha do dia travada por outra transação, a reserva falha com `55P03` em até cerca de 2 s
- [ ] Evidência da rede: `ALTER FUNCTION email_cota_reservar(integer) RESET lock_timeout` deixa vermelho (registrar aqui)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 4: Contrato, token e cookie

### T11: Primitivos do contrato com zod

**What**: Acrescentar zod (`>= 4.6.6`) ao `@pelada/contrato` e escrever os primitivos: e-mail (até 254, minúsculas e sem espaços), nome (2 a 60), senha (8 a 72 caracteres e até 72 bytes em UTF-8) e token (base64url de 32 bytes).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/primitivos.ts`
**Depends on**: None
**Reuses**: pacote `@pelada/contrato` da fundação (`F:338`, nomes em `F:18`); limites de `ljs:.specs/features/conta-e-acesso/spec.md:50` e `:76`
**Requirement**: ACE-03, ACE-05, ACE-68
**Status**: rascunhada
**Nota do rascunho**: o `pnpm-lock.yaml` com o zod nasce no `pnpm install` do /executar.

**Done when**:

- [ ] Testes `ACE-03`: 1, 2, 60 e 61 caracteres de nome; 7, 8, 72 e 73 de senha; 254 e 255 de e-mail
- [ ] Teste `ACE-05`: `"  Ana@Ex.COM "` vira `ana@ex.com`
- [ ] Teste `ACE-68`: senha de 30 emojis (menos de 72 caracteres e mais de 72 bytes) é recusada
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T12: Schemas das rotas de acesso e versão dos termos

**What**: Escrever os schemas `.strict()` de corpo e resposta (`cadastroCorpo`, `entrarCorpo`, `emailCorpo`, `tokenCorpo`, `novaSenhaCorpo`, `trocarSenhaCorpo`, `excluirCorpo`, `conviteCorpo`, `conviteCadastroCorpo`, `sessaoEu`, `adminsResposta`), os códigos de erro da spec e `TERMOS_VERSAO` no formato `AAAA-MM-DD`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/contrato/src/acesso.ts`
**Depends on**: T11
**Reuses**: formas de `ljs:.specs/features/conta-e-acesso/design.md:192` e `:215-228` (só consulta, AD-002)
**Requirement**: ACE-02, ACE-58
**Status**: rascunhada
**Nota do rascunho**: corpo de erro `{ erro, codigo, campos?, grupos? }`; `TERMOS_VERSAO` = 2026-11-05, a data do rascunho dos textos (T48).

**Done when**:

- [ ] Teste `ACE-02`: `cadastroCorpo` sem `termos: true` falha com o código `termos_obrigatorios`
- [ ] Teste `ACE-58`: `TERMOS_VERSAO` casa `^\d{4}-\d{2}-\d{2}$`
- [ ] Teste: campo a mais em qualquer corpo é recusado (`.strict()`)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T13: Token, hash e chave de IP

**What**: Escrever `gerarToken()` (32 bytes de `crypto.getRandomValues`, base64url, e o SHA-256), `hashToken(token)` e `chaveIp(ip, prefixo)`: IPv4 inteiro, IPv6 pelo /64 (limitador e `ip_hash`) ou pelo /48 (teto por origem), e `sem-ip` sem cabeçalho.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/sessao/token.ts`
**Depends on**: T12
**Reuses**: decisão de `ljs:.specs/features/conta-e-acesso/design.md:141-142` (token e hash do IP); escrito do zero
**Requirement**: ACE-10, ACE-71, ACE-73
**Status**: rascunhada
**Nota do rascunho**: o hash é o SHA-256 do texto do token (UTF-8); valor que não é IP também vira `sem-ip`.

**Done when**:

- [ ] Teste `ACE-10`: o hash tem 32 bytes e não contém o token; dois tokens seguidos diferem
- [ ] Testes `ACE-71`: `2001:db8:1:2:aaaa::1` e `2001:db8:1:2:bbbb::9` dão a mesma chave /64; IPv4 inteiro; IPv6 abreviado e com `::ffff:` normalizados; sem IP, `sem-ip`
- [ ] Teste `ACE-73`: `2001:db8:1:2::1` e `2001:db8:1:ff::1` dão a mesma chave /48
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T14: Cookie de sessão

**What**: Escrever `definirCookieSessao(c, token)` e `vencerCookieSessao(c)`: `__Host-sessao`, `HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`, e o cookie vencido no sair.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/sessao/cookie.ts`
**Depends on**: T13
**Reuses**: app Hono da fundação (`F:1106`); atributos de `ljs:.specs/features/conta-e-acesso/spec.md:48` e `:99`
**Requirement**: ACE-09, ACE-17
**Status**: rascunhada
**Nota do rascunho**: o cookie leva `Max-Age` das 12 h da sessão; o vencido leva também `Expires` em 1970.

**Done when**:

- [ ] Teste `ACE-09`: o `Set-Cookie` tem os 4 atributos e não tem `Domain`
- [ ] Teste `ACE-17`: o cookie vencido tem `Max-Age=0` e o mesmo nome e caminho
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 5: E-mail

### T15: Remetente do Resend e remetente em memória

**What**: Escrever a interface `Remetente`, o `remetenteResend(env)` (`fetch` para `https://api.resend.com/emails` com `Authorization`, `Idempotency-Key`, `text` e `html`, abortado aos 10 s; não 2xx ou abortado vira `'falhou'` com log só do status e do código) e o `remetenteMemoria()` para dev e teste.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/email/resend.ts`
**Depends on**: T14
**Reuses**: decisão de `ljs:.specs/features/conta-e-acesso/design.md:176-187` (`fetch` direto, sem SDK); escrito do zero
**Requirement**: ACE-21, ACE-52, ACE-75
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo do código; sem lacuna. O remetente em memória tem `falharProximos(n)` para provar o ACE-52 nas rotas.

**Done when**:

- [ ] Casos limite listados antes do código: 2xx, 4xx, 429 de cota, 5xx, rede caída, resposta depois de 10 s
- [ ] Testes `ACE-52`: com `fetch` falso devolvendo 500 ou 429, o resultado é `'falhou'` e o log tem o status sem destino, assunto nem corpo
- [ ] Teste `ACE-75`: resposta que demora mais de 10 s é abortada e vira `'falhou'`
- [ ] Teste `ACE-21`: nenhum log do remetente contém o link nem o token
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T16: Modelos dos e-mails de conta

**What**: Escrever os 4 modelos (confirmação, recuperação, convite e aviso de cadastro duplicado), em texto e HTML, com o link montado a partir de `URL_PUBLICA` e o token no fragmento (`/confirmar#t=…`, `/entrar/nova-senha#t=…`, `/convite#t=…`).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/email/modelos.ts`
**Depends on**: T15
**Reuses**: `URL_PUBLICA` como única origem de URL (FUN-23, `F:1251`); fragmento de `ljs:.specs/features/conta-e-acesso/design.md:30-31`
**Requirement**: ACE-04, ACE-23, ACE-31
**Status**: rascunhada
**Nota do rascunho**: o aviso de cadastro duplicado leva só o link de `/entrar/esqueci`, sem token.

**Done when**:

- [ ] Teste `ACE-23`: o link de recuperação começa por `URL_PUBLICA` e leva o token só depois de `#t=`
- [ ] Teste `ACE-04`: o aviso de cadastro duplicado não tem link de confirmação
- [ ] Teste `ACE-31`: o convite traz o nome do grupo e o link `/convite#t=`
- [ ] A checagem de URL absoluta da fundação continua verde
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T17: Caixa de e-mails de desenvolvimento e variáveis novas

**What**: Criar `GET /api/dev/emails`, registrada só quando `EMAIL_DEV=1` (lista as mensagens do remetente em memória), uma checagem que reprova `EMAIL_DEV` no `wrangler.jsonc`, e os nomes `RESEND_API_KEY`, `RESEND_REMETENTE`, `LIMITE_EMAILS_DIA`, `EMAIL_DEV` e `SEED_SENHA_ADMIN` no `.env.example`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/dev-emails.ts`
**Depends on**: T16
**Reuses**: molde das checagens da fundação (`F:1251`, `backend/scripts/checagens/`) e a checagem do `.env.example` (`F:1886`)
**Requirement**: ACE-52
**Status**: rascunhada
**Nota do rascunho**: como o Hono monta o app sem o `env`, a rota existe sempre e responde o 404 padrão sem `EMAIL_DEV=1`. A checagem `email-dev` entra no ci.yml.

**Done when**:

- [ ] Teste: sem `EMAIL_DEV`, `GET /api/dev/emails` responde 404; com `EMAIL_DEV=1`, lista as mensagens
- [ ] Teste: um `wrangler.jsonc` de exemplo com `EMAIL_DEV` reprova; o real passa
- [ ] A checagem do `.env.example` da fundação passa com as 5 variáveis novas (obrigatoriedade, formato e se é segredo)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 6: Middlewares de entrada e sessão

### T18: Cabeçalho `X-Pelada` antes dos limitadores

**What**: Criar `exigirCabecalhoPelada` (escrita em `/api/*` sem `X-Pelada: 1` responde 403) e registrá-lo em `criarApp` antes de qualquer `limiteTaxa`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/cabecalho-pelada.ts`
**Depends on**: T17
**Reuses**: ordem de `ljs:.specs/features/conta-e-acesso/design.md:143`, escrita do zero no `app.ts` da fundação (`F:1106`); binding falso do teste de `limiteTaxa` (`F:1153`)
**Requirement**: ACE-49
**Status**: rascunhada
**Nota do rascunho**: escrita = todo método fora de GET e HEAD; o valor tem de ser exatamente `1`; a recusa é `403` com `corpoDoErro('origem_recusada')`.
**Lacunas**: mudança de teste existente sem aprovação registrada: `test/rotas/limite-taxa.test.ts` e `test/db/com-banco.test.ts` passam a mandar `X-Pelada: 1` nos POST (nenhuma asserção mudou); o `/executar` pede a aprovação antes do verde.

**Done when**:

- [ ] Teste `ACE-49`: 11 POST sem o cabeçalho recebem 403 e o 12.º, com o cabeçalho, não recebe 429 (binding falso de 10 por minuto)
- [ ] Teste `ACE-49`: GET sem o cabeçalho passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T19: Chave do limitador pelo /64 e `LIMITE_ENTRAR` nas rotas de acesso

**What**: Estender o `limiteTaxa` da fundação para usar `chaveIp(ip, 64)` e criar o grupo de rotas de acesso que aplica `LIMITE_ENTRAR` (entrar, cadastro, confirmar, reenviar, esqueci, nova senha, ler e cadastrar convite, trocar senha e excluir conta).
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/limite-taxa.ts`
**Depends on**: T18
**Reuses**: estender `limiteTaxa(binding)` (`F:1153`); binding `LIMITE_ENTRAR` de FUN-26 (`F:1081`); `chaveIp` (T13)
**Requirement**: ACE-50, ACE-70, ACE-71
**Status**: rascunhada
**Nota do rascunho**: `CHAVE_SEM_IP` passa a ser o `SEM_IP` da T13 (mesmo valor); as rotas ficam em `ROTAS_LIMITE_ENTRAR`, registradas por `limitarRotasDeAcesso(api)` antes das rotas, para valerem já antes de elas existirem.

**Done when**:

- [ ] Teste `ACE-71`: dois IPv6 do mesmo /64 dividem a cota
- [ ] Teste `ACE-50`: a lista de rotas com `LIMITE_ENTRAR` é a do design do LJS (`design.md:152-170`) e cada uma responde 429 acima do limite
- [ ] Teste `ACE-70`: `POST /api/conta/senha` acima do limite responde 429 antes de qualquer consulta ao banco
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T20: Leitura da sessão antes do `comBanco`

**What**: Escrever `sessoes.tocar(urlBanco, tokenHash)` (transação curta própria), os middlewares `carregarSessao` (lê `__Host-sessao`, fixa `contaId` e `tokenHash`, limpa o cookie inválido) e `exigirSessao` (401 `sessao_expirada`), e estender o `comBanco` para usar `c.var.contaId` no `set_config('app.conta_id')`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/sessao.ts`
**Depends on**: T19
**Reuses**: estender o `comBanco` da fundação (`F:1203`, `FD:103`) e o cliente por requisição (`F:1179`); decisão de `ljs:.specs/features/conta-e-acesso/design.md:18-23` (transação curta antes do `comBanco`, leituras seguem `READ ONLY`)
**Requirement**: ACE-15, ACE-16, ACE-47, ACE-69
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo de `sessao.ts`. `sessoes.tocar` fica em `src/infraestrutura/db/repositorios/sessoes.ts` (a T22 acrescenta `encerrarAtual`); o `carregarSessao` é global em `criarApp`, depois dos limitadores; o `comBanco` passa a ter `contextoDaSessao` como padrão. Teste no projeto `banco` (Node), em `test/sessao/`, com o app como `pelada_app` pela `fabricaComoApp` nova de `test/db/requisicao.ts`.
**Lacunas**: cookie de sessão de escopo `troca_de_senha` numa rota comum: a spec não define; o rascunho trata como sessão inválida e vence o cookie.

**Done when**:

- [ ] Casos limite listados antes do código: sem cookie; cookie de sessão vencida; sessão de conta excluída; duas requisições simultâneas de A e B; GET (transação da rota `READ ONLY`)
- [ ] Teste `ACE-47`: o `app.conta_id` da transação da rota é a conta da sessão antes da primeira consulta, e GET continua `READ ONLY`
- [ ] Testes `ACE-15`, `ACE-16`, `ACE-69`: sessão vencida ou de conta excluída responde 401 `sessao_expirada` e vence o cookie
- [ ] Teste `ACE-47`: 100 pares de requisições concorrentes de A e B nunca trocam o contexto
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T21: Vínculo com o grupo

**What**: Criar `exigirVinculo` para `/api/grupos/:grupoId/*`: `SELECT id FROM grupos WHERE id = $1` sob a RLS; sem linha, 404.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/middlewares/vinculo.ts`
**Depends on**: T20
**Reuses**: `grupos_visiveis()` vigente (`M:1792844280000_grupos-visiveis-arquivado.sql:9`); `comBanco` estendido (T20)
**Requirement**: ACE-41
**Status**: rascunhada
**Nota do rascunho**: `grupoId` que não é uuid dá 404 sem consulta. `protegerRotasDeGrupo(api)` registra em `criarApp` a cadeia `exigirSessao` → `comBanco()` → `exigirVinculo` em `/grupos/:grupoId/*`; as rotas da T30 só declaram o handler. Teste em `test/sessao/vinculo.test.ts` (projeto `banco`).

**Done when**:

- [ ] Teste `ACE-41`: conta B em rota do grupo de A recebe 404; grupo inexistente e `grupoId` que não é uuid também
- [ ] Teste `ACE-41`: grupo arquivado de que a conta não é criadora responde 404
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 7: Repositórios e envio de e-mail

### T22: Repositórios de contas, sessões e links

**What**: Escrever os repositórios que chamam as funções de conta pelo `Db` da transação: `contas.cadastrar`, `contas.entrar`, `contas.trocarSenha`, `contas.excluir`, `contas.eu` (conta e grupos sob a RLS), `sessoes.encerrarAtual`, `links.pedir`, `links.confirmar` e `links.novaSenha`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/contas.ts`
**Depends on**: T21
**Reuses**: `c.var.db: Kysely<Banco>` da fundação (`FD:103`); assinaturas das funções em T4 a T8 (`M:` citados lá)
**Requirement**: ACE-18
**Status**: rascunhada
**Nota do rascunho**: `contas` e `links` em `contas.ts`; `sessoes.encerrarAtual` em `sessoes.ts`, ao lado do `tocar` (T20); `Db` e `bytea()` em `repositorios/tipos.ts`. `links.pedir` chama `link_pedir_com_confirmacao` (devolve também `confirmada`, para o ACE-73 da T24). `links.confirmar` passa `NULL` no hash de sessão (a função não abre sessão desde `1792843740000`). Teste com o `comDb` novo de `test/repositorios/apoio.ts`.

**Done when**:

- [ ] Teste `ACE-18`: `contas.eu` devolve id, nome, e-mail e os grupos com `id`, `nome`, `slug` e `acessa_financeiro`, sem grupo arquivado de outra criadora
- [ ] Teste: cada repositório devolve o resultado tipado da função correspondente (`ok`, `invalida`, `bloqueado`, `nao_confirmado`, nulo)
- [ ] Nenhum repositório lê `senha_hash` nem `e_dono`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T23: Repositórios de convites, admins e auditoria

**What**: Escrever `convites.criar`, `convites.ler`, `convites.aceitar`, `convites.cadastrar`, `convites.cancelar(db, grupoId, id)`, `admins.listar(db, grupoId)`, `admins.remover(db, grupoId, contaId)` (recusa o último admin com `SELECT … FOR UPDATE` dos vínculos do grupo) e `auditoria.registrar`, sempre com `grupoId` como primeiro dado.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/infraestrutura/db/repositorios/convites.ts`
**Depends on**: T22
**Reuses**: funções de T9; decisão de `ljs:.specs/features/conta-e-acesso/design.md:128` (último admin por `FOR UPDATE` na mesma transação)
**Requirement**: ACE-39, ACE-40, ACE-42
**Status**: rascunhada
**Nota do rascunho**: `convites`, `admins` e `auditoria` em `convites.ts`. Criar, aceitar e cadastrar convite gravam a auditoria no próprio banco; cancelar (`cancelar_convite`) e remover (`remover_admin`, entidade `vinculo_admin`) gravam pelo `auditoria.registrar`. `admins.remover` devolve `ok`, `ultimo_admin` ou `nao_encontrado`.

**Done when**:

- [ ] Teste `ACE-40`: com dois admins, duas remoções simultâneas deixam um admin e a segunda dá `ultimo_admin`
- [ ] Teste `ACE-39`: remover apaga o vínculo e grava a auditoria na mesma transação; com erro, nada fica
- [ ] Teste `ACE-42`: criar e cancelar convite gravam linha em `auditoria` com autor, ação e grupo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T24: Envio de e-mail de conta com cota e intervalo

**What**: Escrever o caso de uso `enviarEmailDeConta`: registra o pedido por origem (/48, 20 por hora, 429 `muitas_requisicoes`), reserva a cota (80% ou 100% de `LIMITE_EMAILS_DIA`), chama o remetente e responde 503 `email_indisponivel` sem gastar a cota quando ele falha; dentro dos 60 s, não envia e devolve o mesmo sucesso.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/aplicacao/acesso/enviar-email.ts`
**Depends on**: T23
**Reuses**: funções de cota de T10; remetentes de T15; chave /48 de T13
**Requirement**: ACE-51, ACE-52, ACE-72, ACE-73, ACE-75
**Status**: rascunhada
**Nota do rascunho**: casos limite listados no topo de `enviar-email.ts`. O caso de uso tem duas partes: `registrarOrigem(urlBanco, ip)`, que a rota chama ao chegar, em transação curta própria (o ACE-73 conta o pedido "mesmo que a rota depois o recuse", e a resposta 4xx desfaria o registro na transação da rota), e `enviarEmailDeConta(db, remetente, pedido)`, que reserva a cota sob `SAVEPOINT` e o desfaz quando o remetente falha ou a trava passa de 2 s (55P03). `categoriaDaRecuperacao(confirmada)` escolhe 80% ou 100% (ACE-73).

**Done when**:

- [ ] Casos limite listados antes do código: intervalo de 60 s; cota de cadastro cheia com recuperação livre; remetente falha; remetente demora; trava da cota acima de 2 s; 21.º pedido da origem
- [ ] Testes `ACE-52`, `ACE-75`: falha ou demora do remetente dá 503 `email_indisponivel`, a cota não é gasta e o pedido seguinte envia
- [ ] Testes `ACE-72`, `ACE-73`: com 80 envios no dia, cadastro e convite dão 503 e recuperação envia; 21 pedidos da mesma origem em 1 h dão 429 `muitas_requisicoes`
- [ ] Teste `ACE-51`: segundo pedido em 30 s devolve sucesso sem chamar o remetente
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 8: Rotas: cadastro, sessão e recuperação

### T25: Rotas de cadastro e confirmação

**What**: Criar `POST /api/conta`, `POST /api/conta/confirmar` e `POST /api/conta/reenviar-confirmacao`, finas sobre os repositórios e o envio, com 422 `dados_invalidos` por campo e as mensagens da spec.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/conta.ts`
**Depends on**: T24
**Reuses**: tabela de rotas de `ljs:.specs/features/conta-e-acesso/design.md:152-157`; schemas de T12
**Requirement**: ACE-01, ACE-02, ACE-03, ACE-04, ACE-06, ACE-07, ACE-08, ACE-50, ACE-58, ACE-68
**Status**: rascunhada
**Nota do rascunho**: apoio comum das rotas em `src/entrada/rotas/apoio-acesso.ts` (`lerCorpo`, `contarPedidoDeEmail`, `emailIndisponivel`); as rotas nascem de `rotasConta(opcoes)`, montada em `criarApp` com a fábrica de teste. O pedido por origem é contado antes de validar o corpo. Confirmar com token malformado responde 410 `link_invalido` (não 422). Testes no projeto `banco` (Node), em `test/acesso/`, com `SPEC_DEVIATION` (a matriz pede `workerd`, que não tem o Postgres).
**Lacunas**: o aviso de cadastro duplicado não tem o nome do dono do e-mail (a função não o devolve); o rascunho saúda pelo endereço.

**Done when**:

- [ ] Testes `ACE-01`, `ACE-58`: 201 com "Enviamos um link de confirmação para o seu e-mail", o e-mail na caixa em memória e `termos_versao` gravado igual a `TERMOS_VERSAO`
- [ ] Testes `ACE-02`, `ACE-03`, `ACE-68`: 422 com o código ou o campo, sem conta criada
- [ ] Teste `ACE-04`: e-mail existente recebe resposta idêntica (status e corpo) e o dono recebe o aviso
- [ ] Testes `ACE-06`, `ACE-07`, `ACE-08`: confirmar sem `Set-Cookie`; link inválido dá 410 `link_invalido`; reenviar responde igual para e-mail sem conta
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T26: Rotas de sessão: entrar, consultar e sair

**What**: Criar `POST /api/sessao/entrar` (com o `ip_hash` do /64), `GET /api/sessao` e `POST /api/sessao/sair`, com os códigos e o texto único do bloqueio "Muitas tentativas. Tente de novo em 15 minutos.".
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/sessao.ts`
**Depends on**: T25
**Reuses**: cookie de T14; `contas.entrar` e `contas.eu` de T22; tabela de `ljs:.specs/features/conta-e-acesso/design.md:157-159`
**Requirement**: ACE-09, ACE-11, ACE-12, ACE-13, ACE-14, ACE-17, ACE-18, ACE-50, ACE-74

**Done when**:

- [ ] Casos limite listados antes do código: senha certa bloqueada; IP sem cabeçalho; sair sem sessão; teto por conta e por par com o mesmo texto
- [ ] Testes `ACE-09`, `ACE-11`, `ACE-12`: 200 com nome, e-mail e cookie; 401 `credenciais_invalidas` com o mesmo corpo para e-mail inexistente e senha errada; 403 `email_nao_confirmado` sem cookie
- [ ] Testes `ACE-13`, `ACE-14`, `ACE-74`: 429 `bloqueado_temporariamente` com o texto único, nos dois bloqueios; outro IP entra
- [ ] Testes `ACE-17`, `ACE-18`: sair dá 204 com cookie vencido e depois `GET /api/sessao` dá 401; com sessão, a lista de grupos
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T27: Rotas de recuperação de senha

**What**: Criar `POST /api/sessao/esqueci-senha` (mesma mensagem exista ou não a conta) e `POST /api/sessao/nova-senha` (`{token, senha}`, 200 ou 410 `link_invalido`).
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/recuperacao.ts`
**Depends on**: T26
**Reuses**: `links.pedir` e `links.novaSenha` (T22); envio de T24; tabela de `ljs:.specs/features/conta-e-acesso/design.md:160-161`
**Requirement**: ACE-22, ACE-23, ACE-24, ACE-25, ACE-50, ACE-76

**Done when**:

- [ ] Testes `ACE-22`, `ACE-23`: 200 com "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha" nos dois casos; só a conta existente recebe e-mail
- [ ] Testes `ACE-24`, `ACE-76`: nova senha com link válido: 200, a senha antiga dá 401, as sessões antigas dão 401 e a conta bloqueada entra
- [ ] Teste `ACE-25`: link inválido dá 410 e a senha não muda
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 9: Rotas: minha conta, convites e admins

### T28: Rotas de minha conta: trocar senha e excluir

**What**: Criar `POST /api/conta/senha` e `POST /api/conta/excluir`, com sessão, `LIMITE_ENTRAR` e o bloqueio por conta da senha atual.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/minha-conta.ts`
**Depends on**: T27
**Reuses**: `contas.trocarSenha` e `contas.excluir` (T22); tabela de `ljs:.specs/features/conta-e-acesso/design.md:162-163`
**Requirement**: ACE-26, ACE-27, ACE-28, ACE-29, ACE-30, ACE-70

**Done when**:

- [ ] Testes `ACE-26`, `ACE-27`: 204 e a outra sessão da conta dá 401 enquanto a atual segue; senha atual errada dá 401 `senha_atual_incorreta`
- [ ] Testes `ACE-28`, `ACE-29`, `ACE-30`: 204 e login seguinte 401; 409 `unico_admin` com a lista de grupos; senha errada 401 sem apagar
- [ ] Teste `ACE-70`: a 6.ª tentativa com senha errada recebe o erro de bloqueio, com a mesma resposta para quem tentar a senha certa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T29: Rotas de convite: ler, aceitar e cadastrar

**What**: Criar `POST /api/convites/ler` (sem sessão), `POST /api/convites/aceitar` (com sessão) e `POST /api/convites/cadastrar` (sem sessão, abre a sessão nova).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: sim
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/convites.ts`
**Depends on**: T28
**Reuses**: `convites.*` (T23); tabela de `ljs:.specs/features/conta-e-acesso/design.md:164-166`
**Requirement**: ACE-33, ACE-34, ACE-35, ACE-36, ACE-50, ACE-67

**Done when**:

- [ ] Casos limite listados antes do código: logado com outro e-mail; sem conta com e-mail que passa a ter conta entre ler e cadastrar; convite de grupo arquivado; aceites concorrentes
- [ ] Testes `ACE-33`, `ACE-35`: aceitar cria o vínculo e devolve o `grupoId`; outro e-mail dá 403 `convite_de_outro_email`
- [ ] Testes `ACE-34`, `ACE-58`: cadastrar pelo convite abre sessão, o grupo aparece em `GET /api/sessao` e `termos_versao` é gravado
- [ ] Testes `ACE-36`, `ACE-67`: inválido dá 410; dois aceites simultâneos dão um 200 e um 410
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T30: Rotas de admins do grupo

**What**: Criar `GET /api/grupos/:grupoId/admins`, `POST /api/grupos/:grupoId/admins/convites`, `DELETE /api/grupos/:grupoId/admins/convites/:id` e `DELETE /api/grupos/:grupoId/admins/:contaId`, atrás de `exigirSessao` e `exigirVinculo`.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/src/entrada/rotas/admins.ts`
**Depends on**: T29
**Reuses**: `admins.*` e `convites.*` (T23); envio de T24; tabela de `ljs:.specs/features/conta-e-acesso/design.md:167-170`
**Requirement**: ACE-31, ACE-32, ACE-37, ACE-38, ACE-39, ACE-40, ACE-41, ACE-42

**Done when**:

- [ ] Testes `ACE-31`, `ACE-32`: 201 com id, e-mail e validade, e o e-mail na caixa; já admin dá 409 `ja_e_admin`
- [ ] Testes `ACE-37`, `ACE-38`: a lista traz admins e convites pendentes; cancelar dá 204 e o link passa a dar 410
- [ ] Testes `ACE-39`, `ACE-40`, `ACE-42`: remover dá 204 com auditoria; o último admin dá 409 `ultimo_admin`
- [ ] Teste `ACE-41`: as 4 rotas dão 404 para conta sem vínculo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 10: Proteções transversais da API

### T31: Sem cache e sem segredo no log nas rotas de acesso

**What**: Provar `Cache-Control: no-store` em toda rota de `/api/sessao` e `/api/conta`, e que nenhuma rota de acesso grava em log (console e evento do Sentry) a senha, o token de sessão, os tokens dos links nem o corpo.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/rotas/acesso-cabecalhos.test.ts`
**Depends on**: T30
**Reuses**: `semCache` da fundação (`F:1130`, FUN-22) e o `beforeSend` do Sentry (`F:1277`)
**Requirement**: ACE-21, ACE-53

**Done when**:

- [ ] Teste `ACE-53`: todas as rotas de `/api/sessao` e `/api/conta`, inclusive as respostas de erro, têm `Cache-Control: no-store`
- [ ] Teste `ACE-21`: com uma senha e um token marcadores, nenhuma linha de log capturada nem evento do Sentry os contém, em sucesso e em erro 500 forçado
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T32: Suíte de isolamento de rotas

**What**: Escrever o teste que lista as rotas registradas no Hono e exige, para cada uma, um caso de isolamento (conta B contra o grupo ou a conta de A) ou um "não se aplica" com motivo (rotas públicas e de sessão), e falha com rota nova sem linha.
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/api/test/isolamento/rotas.test.ts`
**Depends on**: T31
**Reuses**: cenário de T0; `app.routes` do Hono da fundação (`F:1106`)
**Requirement**: ACE-41, ACE-48

**Done when**:

- [ ] Teste `ACE-48`: toda rota do `app.routes` tem caso ou "não se aplica" com motivo; uma rota de teste nova sem caso reprova
- [ ] Teste `ACE-41`: os casos das rotas de grupo dão 404 para a conta B e não mudam nada do grupo de A
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T33: Checagem: sem `e_dono` nas rotas e sem `crypt(` fora das migrações

**What**: Escrever a checagem que reprova `e_dono` em `backend/api/src/entrada/`, `aplicacao/` e `repositorios/`, e `crypt(` ou bibliotecas de hash fora das migrações.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/checagens/sem-e-dono.ts`
**Depends on**: T32
**Reuses**: molde da checagem de URL absoluta (`F:1251`)
**Requirement**: ACE-63

**Done when**:

- [ ] Teste `ACE-63`: arquivo de exemplo em `rotas/` com `e_dono` reprova; em `migracoes/` passa
- [ ] Teste: `crypt(` num repositório reprova
- [ ] A checagem roda na base atual e passa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 11: Script do dono e seed

### T34: Script do dono

**What**: Escrever `pnpm --filter @pelada/scripts dono -- --email <e-mail> [--alvo <alvo>]`: pede a senha no terminal sem eco (duas vezes), chama `conta_definir_senha` com a role de migração, nunca mostra a senha, e recusa banco remoto sem `--alvo` explícito. Alvos: local (padrão), `previa` (branch `dev` do Neon) e `producao` (`main` do Neon), este só depois de o usuário digitar o e-mail do dono e a palavra `producao` para confirmar (AD-024).
**Estimativa**: 2h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/dono.ts`
**Depends on**: T33
**Reuses**: trava de host `exigirHostPermitido` (`F:459`); `conta_definir_senha` (`M:1792843560000_conta-senha-e-exclusao.sql:97`)
**Requirement**: ACE-61, ACE-62

**Done when**:

- [ ] Teste `ACE-61`: no banco de teste, cria o dono e, rodando de novo, troca a senha; a conta entra por `conta_entrar`; a saída e o log não contêm a senha
- [ ] Teste `ACE-62`: URL remota sem `--alvo` sai com erro antes de conectar; nada muda
- [ ] Teste `ACE-62`: `--alvo producao` sem a confirmação digitada correta sai com erro antes de conectar; nada muda (AD-024)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

### T35: Seed com conta que entra

**What**: Estender o seed da fundação para criar a conta admin confirmada com a senha de `SEED_SENHA_ADMIN` por `conta_definir_senha`, e recusar rodar sem a variável.
**Estimativa**: 1h
**Risco**: alto
**Domínio**: não
**Criticidade**: crítica
**Where**: `backend/scripts/src/seed.ts`
**Depends on**: T34
**Reuses**: estender o seed da fundação (`F:1055`, FUN-05)
**Requirement**: ACE-64

**Done when**:

- [ ] Teste `ACE-64`: depois do seed, a conta tem `email_confirmado_em` e entra por `conta_entrar` com a senha do ambiente
- [ ] Teste `ACE-64`: sem `SEED_SENHA_ADMIN`, sai com erro antes de conectar
- [ ] Os testes de FUN-05 da fundação continuam verdes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: integration
**Gate**: full

---

#### Phase 12: Base do front: dados e sessão

### T36: Cliente HTTP do front

**What**: Escrever o cliente HTTP: `X-Pelada: 1` em toda escrita, `credentials: 'same-origin'`, erro padrão tipado e, no 401 `sessao_expirada`, limpar o cache de consultas e levar a `/entrar?aviso=sessao-expirada`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/cliente.ts`
**Depends on**: T35
**Reuses**: TanStack Query do esqueleto da fundação (`F:1326`)
**Requirement**: ACE-20, ACE-49

**Done when**:

- [ ] Teste `ACE-49`: POST, DELETE e PATCH levam `X-Pelada: 1`
- [ ] Teste `ACE-20`: resposta 401 `sessao_expirada` limpa o cache e navega para `/entrar?aviso=sessao-expirada`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T37: Sessão no front e guarda de rota

**What**: Escrever `useSessao()` (`GET /api/sessao`) e a guarda: rota de `/app` sem sessão vai a `/entrar` e volta à rota pedida depois do login; logado em `/entrar` vai a `/app`.
**Estimativa**: 1,5h
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/guarda.tsx`
**Depends on**: T36
**Reuses**: roteador da fundação (`F:1545`)
**Requirement**: ACE-19, ACE-65

**Done when**:

- [ ] Teste `ACE-19`: `/app/conta` sem sessão vai a `/entrar` e, depois do login, a `/app/conta`; destino externo (`//outro.site`) é ignorado
- [ ] Teste `ACE-65`: com sessão, `/entrar` vai a `/app`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T38: Leitura do token no fragmento

**What**: Escrever `lerTokenDoFragmento()`: lê `#t=` uma vez e o apaga da barra com `history.replaceState`.
**Estimativa**: 45 min
**Risco**: alto
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/dados/fragmento.ts`
**Depends on**: T37
**Reuses**: decisão de `ljs:.specs/features/conta-e-acesso/design.md:200` (fragmento apagado logo depois de lido)
**Requirement**: ACE-06, ACE-24

**Done when**:

- [ ] Teste `ACE-06`: depois da leitura, `location.hash` está vazio e o token foi devolvido
- [ ] Teste: sem `#t=` ou com token malformado, devolve nulo
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T39: Componentes `Campo` e `CampoSenha`

**What**: Escrever `Campo` (rótulo, erro, somente leitura) e `CampoSenha` (mostrar e ocultar) a partir do HTML e do CSS do mockup, com CSS Module, só tokens, teste de renderização e axe.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/Campo.tsx`
**Depends on**: T38
**Reuses**: molde dos componentes da fundação (`F:1448`, `Botao`); marcação de `.specs/mockup/telas/t04-entrar--vazio.html` e `.specs/mockup/base.css`; Stylelint de tokens (`F:1374`)
**Requirement**: ACE-56

**Done when**:

- [ ] Teste `ACE-56`: axe sem violação nos estados normal, com erro e somente leitura; o erro está ligado ao campo por `aria-describedby`
- [ ] Teste: `CampoSenha` alterna `type` entre `password` e `text`
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 13: Componentes e rotas do front

### T40: Componentes `CaixaSelecao` e `ResumoErros`

**What**: Escrever `CaixaSelecao` (desmarcada por padrão, aceita links no rótulo) e `ResumoErros` (lista de erros com foco), com CSS Module, só tokens, teste e axe.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/CaixaSelecao.tsx`
**Depends on**: T39
**Reuses**: molde de `Campo` (T39); marcação de `.specs/mockup/telas/t29-cadastro--erro.html`
**Requirement**: ACE-56, ACE-59

**Done when**:

- [ ] Teste `ACE-59`: `CaixaSelecao` nasce desmarcada e os links do rótulo funcionam
- [ ] Teste `ACE-56`: axe sem violação nos dois componentes
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T41: Componentes `TelaMensagem`, `Faixa`, `Dialogo` e `Lista`

**What**: Escrever `TelaMensagem` (ícone, título, texto e ação), `Faixa` (aviso de sucesso ou erro), `Dialogo` (modal com foco preso) e `Lista`, com CSS Module, só tokens, teste e axe.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/componentes/Dialogo.tsx`
**Depends on**: T40
**Reuses**: molde de `EstadoErro` da fundação (`F:1472`); marcação de `.specs/mockup/telas/t30-confirmar--invalido.html`, `t32-conta--excluir.html` e `t32-conta--excluida.html` (`.faixa--sucesso`)
**Requirement**: ACE-56

**Done when**:

- [ ] Teste `ACE-56`: axe sem violação nos 4 componentes; `Dialogo` prende o foco e fecha com Esc
- [ ] Teste: `Faixa` usa `role="status"` no sucesso e `role="alert"` no erro
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T42: Rotas do app de acesso

**What**: Estender o roteador da fundação com `/entrar`, `/cadastro`, `/confirmar`, `/entrar/esqueci`, `/entrar/nova-senha`, `/convite`, `/termos`, `/privacidade`, `/app`, `/app/conta`, `/app/conta/senha` e `/app/grupos/:grupoId/admins` (guarda em `/app/*`), e a página provisória de `/` com a faixa "Sua conta foi excluída" em `?aviso=conta-excluida`. A landing fica na `planos-e-cobranca` (AD-023).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/app/rotas.tsx`
**Depends on**: T41
**Reuses**: estender `rotas.tsx` da fundação (`F:1545`, página provisória da AD-007); rotas de `telas.json:137-187` (AD-017 proposta)
**Requirement**: ACE-28, ACE-58

**Done when**:

- [ ] Teste: cada rota renderiza a sua tela (marcador por tela) e `/app/*` passa pela guarda
- [ ] Teste `ACE-28`: `/?aviso=conta-excluida` mostra a página provisória com a faixa "Sua conta foi excluída"
- [ ] Teste `ACE-58`: `/termos` e `/privacidade` abrem sem sessão
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 14: Telas públicas: entrar, cadastro e confirmação

### T43: Tela Entrar

**What**: Escrever a tela `/entrar` (t04) com os estados vazio, carregando, erro, bloqueado, não confirmado (com reenviar o link) e os avisos de sessão expirada, e-mail confirmado e senha alterada.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/entrar/Entrar.tsx`
**Depends on**: T42
**Reuses**: `.specs/mockup/telas/t04-entrar--*.html` (7 estados); componentes de T39 a T41
**Requirement**: ACE-06, ACE-09, ACE-11, ACE-12, ACE-13, ACE-20, ACE-24, ACE-56, ACE-65

**Done when**:

- [ ] Teste `ACE-12`: resposta 403 `email_nao_confirmado` mostra a ação de reenviar, que chama `POST /api/conta/reenviar-confirmacao`
- [ ] Testes `ACE-11`, `ACE-13`: 401 e 429 mostram as mensagens da spec
- [ ] Testes `ACE-20`, `ACE-06`, `ACE-24`: cada `?aviso=` mostra o texto exato da spec
- [ ] Teste `ACE-56`: axe sem violação em todos os estados
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T44: Tela Cadastro

**What**: Escrever `/cadastro` (t29): nome, e-mail, senha, aceite desmarcado com links para `/termos` e `/privacidade`, erros por campo e a tela de sucesso.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/cadastro/Cadastro.tsx`
**Depends on**: T43
**Reuses**: `.specs/mockup/telas/t29-cadastro--*.html` (4 estados); `CaixaSelecao` e `ResumoErros` (T40)
**Requirement**: ACE-01, ACE-03, ACE-56, ACE-59

**Done when**:

- [ ] Teste `ACE-59`: o aceite nasce desmarcado e tem os dois links
- [ ] Teste `ACE-03`: 422 com `campos` marca o campo inválido e preenche o `ResumoErros`
- [ ] Teste `ACE-01`: 201 mostra "Enviamos um link de confirmação para o seu e-mail"
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T45: Tela Confirmar e-mail

**What**: Escrever `/confirmar` (t30): lê o token do fragmento, envia `POST /api/conta/confirmar`, leva a `/entrar` com o aviso no sucesso e mostra "Link inválido ou vencido" com o pedido de novo link.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/confirmar/Confirmar.tsx`
**Depends on**: T44
**Reuses**: `.specs/mockup/telas/t30-confirmar--*.html` (3 estados); `lerTokenDoFragmento` (T38); `TelaMensagem` (T41)
**Requirement**: ACE-06, ACE-07, ACE-08, ACE-56

**Done when**:

- [ ] Teste `ACE-06`: 200 navega para `/entrar` com o aviso "E-mail confirmado. Entre com a sua senha."
- [ ] Testes `ACE-07`, `ACE-08`: 410 mostra a tela de link inválido; pedir novo link mostra o estado reenviado
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 15: Telas públicas: recuperação, termos e convite

### T46: Tela Esqueci a senha

**What**: Escrever `/entrar/esqueci` (t05) com os estados vazio, sucesso e erro e o texto de recuperação por e-mail.
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/esqueci/Esqueci.tsx`
**Depends on**: T45
**Reuses**: `.specs/mockup/telas/t05-esqueci--*.html` (3 estados)
**Requirement**: ACE-22, ACE-56

**Done when**:

- [ ] Teste `ACE-22`: 200 mostra "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha"
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T47: Tela Nova senha

**What**: Escrever `/entrar/nova-senha` (t06): lê o token do fragmento, nova senha com confirmação, 200 leva a `/entrar` com "Senha alterada. Entre com a nova senha." e 410 mostra o estado inválido.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/nova-senha/NovaSenha.tsx`
**Depends on**: T46
**Reuses**: `.specs/mockup/telas/t06-nova-senha--*.html` (4 estados); `lerTokenDoFragmento` (T38)
**Requirement**: ACE-24, ACE-25, ACE-56

**Done when**:

- [ ] Teste `ACE-24`: 200 navega para `/entrar` com o aviso exato
- [ ] Teste `ACE-25`: 410 mostra o estado inválido com o pedido de novo link
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T48: Páginas Termos de uso e Privacidade

**What**: Redigir o texto de `/termos` (t33) e `/privacidade` (t07), marcado como rascunho para revisão do usuário, com a versão `TERMOS_VERSAO` e a data exibidas, e escrever as duas páginas públicas.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/termos/Termos.tsx`
**Depends on**: T47
**Reuses**: `.specs/mockup/telas/t33-termos--pagina.html` e `t07-privacidade--pagina.html`; `TERMOS_VERSAO` (T12)
**Requirement**: ACE-58, ACE-60

**Done when**:

- [ ] Teste `ACE-58`: as duas páginas mostram a versão igual a `TERMOS_VERSAO` e abrem sem sessão
- [ ] Teste `ACE-60`: as duas páginas mostram a marca de rascunho
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T49: Tela Convite

**What**: Escrever `/convite` (t31): lê o token, chama `POST /api/convites/ler` e mostra carregando, inválido, sem conta (cadastro com o e-mail preenchido e travado), logado (aceitar e ir a `/app/grupos/:grupoId/admins`) e outro e-mail.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/convite/Convite.tsx`
**Depends on**: T48
**Reuses**: `.specs/mockup/telas/t31-convite--*.html` (5 estados); `Campo` somente leitura (T39); destino da AD-022 proposta
**Requirement**: ACE-33, ACE-34, ACE-35, ACE-36, ACE-56

**Done when**:

- [ ] Teste `ACE-34`: sem conta, o e-mail do convite aparece no campo somente leitura e o envio chama `POST /api/convites/cadastrar`
- [ ] Teste `ACE-33`: logado, aceitar navega para `/app/grupos/<id>/admins`
- [ ] Testes `ACE-35`, `ACE-36`: 403 e 410 mostram os estados outro e-mail e inválido
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 16: Telas com sessão

### T50: Lista de grupos e menu da conta

**What**: Escrever `/app` (t08) com a lista de grupos de `GET /api/sessao` e o estado vazio, e o menu da conta na barra (t09 `menu-conta`) com Minha conta e Sair.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/grupos/Grupos.tsx`
**Depends on**: T49
**Reuses**: `.specs/mockup/telas/t08-grupos--sucesso.html`, `t08-grupos--vazio.html`, `t09-inicio--menu-conta.html`; `Casca` e `Barra` da fundação (`F:1424`)
**Requirement**: ACE-17, ACE-18, ACE-56, ACE-57

**Done when**:

- [ ] Teste `ACE-18`: os grupos da resposta aparecem com nome e link
- [ ] Teste `ACE-57`: sem grupos, o estado vazio do t08
- [ ] Teste `ACE-17`: Sair chama `POST /api/sessao/sair` e leva a `/entrar`
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T51: Tela Minha conta com exclusão

**What**: Escrever `/app/conta` (t32): dados da conta, link para trocar a senha e a exclusão com diálogo e senha; 409 lista os grupos de única admin; 204 leva a `/?aviso=conta-excluida`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/minha-conta/MinhaConta.tsx`
**Depends on**: T50
**Reuses**: `.specs/mockup/telas/t32-conta--*.html` (5 estados); `Dialogo` (T41)
**Requirement**: ACE-28, ACE-29, ACE-56

**Done when**:

- [ ] Teste `ACE-28`: confirmar com 204 navega para `/?aviso=conta-excluida`
- [ ] Teste `ACE-29`: 409 `unico_admin` mostra os nomes dos grupos
- [ ] Teste `ACE-56`: axe sem violação com o diálogo aberto
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T52: Tela Minha senha

**What**: Escrever `/app/conta/senha` (t25): senha atual, nova senha e confirmação; 204 mostra o sucesso; 401 `senha_atual_incorreta` marca o campo.
**Estimativa**: 1,5h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/minha-senha/MinhaSenha.tsx`
**Depends on**: T51
**Reuses**: `.specs/mockup/telas/t25-senha--*.html` (3 estados); `CampoSenha` (T39)
**Requirement**: ACE-26, ACE-27, ACE-56

**Done when**:

- [ ] Teste `ACE-26`: 204 mostra o estado de sucesso
- [ ] Teste `ACE-27`: 401 marca o campo da senha atual com a mensagem
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

### T53: Tela Admins do grupo

**What**: Escrever `/app/grupos/:grupoId/admins` (t19): lista de admins e convites pendentes, convidar por e-mail, cancelar convite e remover admin com confirmação, e os estados carregando, erro, convite enviado, já admin e último admin.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/src/telas/admins/Admins.tsx`
**Depends on**: T52
**Reuses**: `.specs/mockup/telas/t19-admins--*.html` (estados do `telas.json`); `Lista` e `Dialogo` (T41)
**Requirement**: ACE-31, ACE-32, ACE-37, ACE-38, ACE-39, ACE-40, ACE-56

**Done when**:

- [ ] Testes `ACE-31`, `ACE-37`: convidar mostra o estado convite enviado e o convite aparece na lista de pendentes
- [ ] Testes `ACE-32`, `ACE-40`: 409 `ja_e_admin` e 409 `ultimo_admin` mostram os estados do mockup
- [ ] Testes `ACE-38`, `ACE-39`: cancelar e remover chamam o DELETE certo e atualizam a lista
- [ ] Teste `ACE-56`: axe sem violação
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: unit
**Gate**: quick

---

#### Phase 17: Comparação visual

### T54: Runner visual com telas reais do `telas.json`

**What**: Estender o runner visual da fundação para as entradas do `telas.json` com `rota`, `respostas` (interceptação do Playwright), `esperar`, `recorte` e `passos`, além das rotas de vitrine.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/visual.mjs`
**Depends on**: T53
**Reuses**: estender `visual.mjs` (`F:1788`) e o comparador (`F:1764`); formato do `telas.json:1-12` e `telas.json:187` (exemplo com `recorte`); AD-021 proposta
**Requirement**: ACE-54, ACE-55

**Done when**:

- [ ] Teste: uma entrada com `respostas` serve o JSON indicado e a tela renderiza com ele
- [ ] Teste: `recorte` compara só o seletor indicado nas duas imagens
- [ ] As 3 telas de vitrine da fundação continuam passando
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T55: Comparação visual das telas públicas de acesso

**What**: Ativar na comparação as entradas T04, T05, T06, T07, T29, T30, T31 e T33 do `telas.json` e ajustar CSS e componentes até ficarem em até 1% nos dois viewports.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/telas-ativas.json`
**Depends on**: T54
**Reuses**: entradas de `telas.json:152-182`; runner de T54
**Requirement**: ACE-54, ACE-55

**Done when**:

- [ ] Teste `ACE-54`: T04, T05, T06 e T07 × 2 viewports em até 1%
- [ ] Teste `ACE-55`: T29, T30, T31 e T33 × 2 viewports em até 1%
- [ ] Um componente deformado de propósito faz a comparação falhar (conferido uma vez e revertido)
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T56: Comparação visual das telas com sessão

**What**: Ativar na comparação as entradas T09 `menu-conta`, T19, T25 e T32 do `telas.json` (a T08 `sucesso` e a `vazio`, `telas.json:164-165`, usam o mockup do módulo da `grupos-e-elenco` e passam para a T71 de lá, AD-031 proposta) (com `recorte` da faixa em `/?aviso=conta-excluida`) e ajustar até 1% nos dois viewports; os estados de `revisaoManual` são conferidos à mão contra o mockup e registrados aqui.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/telas-ativas.json`
**Depends on**: T55
**Reuses**: entradas de `telas.json:137-139`, `telas.json:166` (T09 `menu-conta`), `telas.json:183-187` e as de T19; runner de T54
**Requirement**: ACE-54, ACE-55

**Done when**:

- [ ] Teste `ACE-54`: T09 `menu-conta`, T19 e T25 × 2 viewports em até 1% (sem as T08 `sucesso` e `vazio`, AD-031 proposta)
- [ ] Teste `ACE-55`: T32 (5 estados) × 2 viewports em até 1%
- [ ] Estados de `revisaoManual` das telas de acesso conferidos e listados nesta tarefa
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

#### Phase 18: Jornadas ponta a ponta e documentação

### T57: Jornadas de acesso ponta a ponta

**What**: Escrever os testes Playwright das jornadas J-06 a J-09 (`.specs/projeto/jornadas.md`) contra o `wrangler dev` com `EMAIL_DEV=1`, lendo os links pela caixa `GET /api/dev/emails`.
**Estimativa**: 2h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `frontend/web/e2e/acesso.spec.ts`
**Depends on**: T56
**Reuses**: Playwright e servidor de e2e da fundação (`F:1691`); caixa de dev (T17); `pnpm dev` (`F:1812`)
**Requirement**: ACE-01, ACE-06, ACE-09, ACE-24, ACE-28, ACE-33

**Done when**:

- [ ] Teste J-06: cadastro, link capturado, aviso em `/entrar`, login até `/app`
- [ ] Teste J-07: esqueci a senha, link, senha nova entra e a antiga é recusada
- [ ] Teste J-08: A convida B, B aceita, os dois veem o grupo e A remove B
- [ ] Teste J-09: conta sem grupos troca a senha, exclui a conta e o login seguinte responde 401
- [ ] Gate passa, sem teste removido ou enfraquecido

**Tests**: e2e
**Gate**: full

---

### T58: Documentação da conta e acesso

**What**: Atualizar o README (entrar local com o seed, caixa de e-mails de dev, script do dono) e o `docs/runbook.md` (secrets `RESEND_API_KEY` e `RESEND_REMETENTE` no environment `previa` como passo do usuário, domínio do remetente verificado no Resend, cota de 100 e-mails por dia e o que fazer quando acabar, `LIMITE_EMAILS_DIA`).
**Estimativa**: 1h
**Risco**: baixo
**Domínio**: não
**Criticidade**: comum
**Where**: `docs/runbook.md`
**Depends on**: T57
**Reuses**: runbook e README da fundação (`F:2063`, `F:2113`)
**Requirement**: ACE-52, ACE-61, ACE-64

**Done when**:

- [ ] O runbook lista os passos do usuário para os secrets do Resend na prévia, sem valor nenhum
- [ ] O README explica entrar local com o e-mail do seed e a senha de `SEED_SENHA_ADMIN`
- [ ] Gate completo da feature (lint, format, checagens e a suíte inteira do `testes.json`) verde antes do `/validar`

**Tests**: none
**Gate**: build
