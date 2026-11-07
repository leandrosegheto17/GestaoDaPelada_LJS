# Validação: grupos-e-elenco — PASS ✅ (rodada 3)

- **Data**: 2026-11-06 · **Branch**: feature/grupos-e-elenco @ e8c54d50 · **Árvore**: 914db34b7117c3d804c750dbe54582058ea39138 (código em `dd2834db…` = `ab859942`; o commit de fechamento só toca o `tasks.md`). Diff desta rodada: `5cbac0d3..HEAD` (`ab859942` testes, `e8c54d50` tasks)
- **Critérios**: os 127 da rodada 1 seguem cobertos; os 3 achados abertos da rodada 2 estão fechados (A-05, A-06, A-04) · **Gate**: a suíte inteira da árvore anterior (api 3633/3636, falhas `push-backup` e `push-cpu` ambientais, aceitas em 2026-11-06) vale: o diff desde então só acrescenta 2 testes e o `tasks.md`. Repeti: api `corpo-antecipado`, `rotas-jogador`, `rotas-grupos`, `limite-escrita` e `com-banco-limites` = 5 arquivos, 79/79; `tsc --noEmit -p .` da api = 0, na árvore atual
- **Sensor**: 2 mutações desta rodada (M2 e M11), 2 mortas, 0 sobreviveram (equivalentes: 0); as 9 mortas da rodada 2 não mudaram de código. Cópia isolada (`git worktree` + junção de `node_modules`), já descartada
- **Revisão de código / Segurança**: `revisao-codigo.md` e `seguranca-validacao.md` (rodada 1); nesta rodada o diff é só de teste e de `tasks.md`, sem código de produção novo

## Achados da rodada 2

| ID | `arquivo:linha` e prova | Situação |
|---|---|---|
| A-05 | `backend/api/test/sessao/corpo-antecipado.test.ts:137-177` "corpo lento com Content-Length declarado": `headers.set('content-length', String(bytes.length))`, corpo de 5 bytes e o resto retido; `expect(espia.criadas()).toBe(0)` com o corpo pendente, depois `expect(r.status).toBe(201)`. **M2** (comentar `if (c.req.raw.body) await c.req.arrayBuffer();`, `corpo-antecipado.ts:37`) reprova só esse teste (`expected 2 to be +0`, 1 falha de 10; antes sobrevivia) | fechado |
| A-06 | `backend/api/test/grupos/rotas-jogador.test.ts:97-115` "o PATCH substitui os campos": jogador com `telefone '11987654321'` e `pontuacao_inicial 7`; `expect(linha.rows[0]).toEqual({ telefone: null, pontuacao_inicial: 7 })` e `auditoria…campos toContain('telefone')`. **M11** (`dados.telefone ?? atual.telefone`, `jogadores-edicao.ts:63`) reprova (`expected { telefone: '11987654321', … } to deeply equal`, 1 falha de 14; antes sobrevivia) | fechado |
| A-04 | `tasks.md:7` `Gate:` agora registra `@ 5cbac0d3` (suíte inteira) e `@ dd2834db09cade256b82e9ce9318ec3292777a46` (arquivos tocados) = verde, com as pendências aceitas; `dd2834db` é a árvore de `ab859942` (conferido por `git rev-parse`). Phase 24 "Retrabalho R1" (T76 a T79, todas concluídas) no Execution Plan e no Task Breakdown; `validate_tasks.py`: 0 erros, 5 avisos (T75 sem teste; granularidade `Where` de T76 a T79) | fechado |

Achados das rodadas anteriores (SV-01 a SV-04, RC-A01 a RC-A05, V-A02, V-A03, A-01 a A-03): sem mudança de código desde a rodada 2, seguem fechados.

## Achados

Nenhum achado aberto.

## Sensor (rodada 3)

| # | Mutação | Teste que rodou | Resultado |
|---|---|---|---|
| M2 | tira a leitura `arrayBuffer()` (`corpo-antecipado.ts:37`) | `corpo-antecipado.test.ts` | morta (1 falha, o teste novo) |
| M11 | PATCH mantém telefone ausente (`jogadores-edicao.ts:63`) | `rotas-jogador.test.ts` | morta (1 falha, o teste novo) |

## Lacunas e o que não foi validado

- **GEL-116 (comparação visual)**: `pnpm visual` não rodou aqui; divergências de produto aceitas na AD-127, estado em `.specs/projeto/comparacao-visual.md` (não bloqueia).
- **Suíte inteira não repetida** (escopo da rodada); e2e não repetido (nenhum código de tela mudou desde a rodada 2, que o rodou 8/8).
- **Processo**: nenhum banco ou role `teste_*` órfão no 5443; nenhum teste existente alterado (só acréscimos); sem policy nova; a árvore real só difere pelos 3 relatórios desta pasta. Observação: `STATE.md` tem `AD-126` duplicada (anterior à feature, fora do escopo).
- **Resíduo**: `C:\Leandro\Projetos\gel-mut` (da rodada 2, vazia, handle aberto fora desta sessão) continua lá; a cópia `gel-mut-r3` e as junções desta rodada foram removidas.
