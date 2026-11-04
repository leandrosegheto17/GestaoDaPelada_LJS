# Partidas e ranking — Mapa de reuso

**Base**: `GestaoDaPelada_LJS` @ `c6dc82c` (branch `feat/partidas-e-ranking`; `ljs:` = `C:\Leandro\Projetos\GestaoDaPelada_LJS`), conferido em 2026-11-04.

Só ativos de mockup (AD-002 permite copiar os ativos do mockup). Nenhum código, teste ou script do LJS entra aqui.

**Comando de adaptação, R-01 a R-19 (T53)**: com `git -C "$LJS" rev-parse c6dc82c` conferido, `git -C "$LJS" archive c6dc82c .specs/features/partidas-e-ranking/mockup | tar -x -C .`; depois, `cmp` de cada arquivo contra `git -C "$LJS" show c6dc82c:<caminho>`.

**Comando de adaptação, R-20 a R-36 (T75)**: `git -C "$LJS" diff 93ce6d1 c6dc82c -- .specs/mockup > mockup.diff` (`93ce6d1` = base comum da branch com a `main` `e557292`; a `main` não mudou `.specs/mockup` depois dela), `git apply --check mockup.diff` e `git apply mockup.diff`; depois, `cmp` de cada arquivo contra `c6dc82c`. Se o `--check` falhar (o `telas.json` da v2 mudou desde 2026-11-04), pare e refaça só as linhas afetadas.

| Linha | Origem | Destino | O que muda | Requisito | Tarefa |
|---|---|---|---|---|---|
| R-01 | `ljs:.specs/features/partidas-e-ranking/mockup/index.html:1-156` | `.specs/features/partidas-e-ranking/mockup/index.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-02 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t09-inicio--sem-jogadores.html:1-34` | `.specs/features/partidas-e-ranking/mockup/telas/t09-inicio--sem-jogadores.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-03 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t09-inicio--sucesso.html:1-33` | `.specs/features/partidas-e-ranking/mockup/telas/t09-inicio--sucesso.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-04 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t11-partida--nova.html:1-55` | `.specs/features/partidas-e-ranking/mockup/telas/t11-partida--nova.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-05 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigido.html:1-41` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigido.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-06 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigir-calculando.html:1-24` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigir-calculando.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-07 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigir-erro-rede.html:1-25` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigir-erro-rede.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-08 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigir-previa.html:1-28` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--corrigir-previa.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-09 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inativo.html:1-65` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inativo.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-10 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-avancar.html:1-23` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-avancar.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-11 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-calculando.html:1-23` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-calculando.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-12 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-erro-rede.html:1-24` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-erro-rede.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-13 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-recuar.html:1-23` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--inicio-recuar.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-14 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativado.html:1-41` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativado.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-15 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-calculando.html:1-24` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-calculando.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-16 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-erro-rede.html:1-25` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-erro-rede.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-17 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-erro.html:1-24` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-erro.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-18 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-previa.html:1-28` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar-previa.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-19 | `ljs:.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar.html:1-24` | `.specs/features/partidas-e-ranking/mockup/telas/t16-jogador--reativar.html` | nada (cópia byte a byte) | PAR-146 | T53 |
| R-20 | `ljs:.specs/mockup/respostas/elenco-grupo-domingo.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/elenco-grupo-domingo.json` | hunks do patch (respostas acompanham o contrato, P27) | PAR-146 | T75 |
| R-21 | `ljs:.specs/mockup/respostas/partida-nova-2026-10-22.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/partida-nova-2026-10-22.json` | hunks do patch: sem o aviso "Pré-marcado pela escalação" e todos `ausente` (P28) | PAR-146 | T75 |
| R-22 | `ljs:.specs/mockup/respostas/partida-nova-sem-ativos.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/partida-nova-sem-ativos.json` | hunks do patch: sem o aviso "Pré-marcado pela escalação" e todos `ausente` (P28) | PAR-146 | T75 |
| R-23 | `ljs:.specs/mockup/respostas/publico-ranking-2026-07.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/publico-ranking-2026-07.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-24 | `ljs:.specs/mockup/respostas/publico-ranking-2026-10.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/publico-ranking-2026-10.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-25 | `ljs:.specs/mockup/respostas/publico-ranking-endereco-novo.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/publico-ranking-endereco-novo.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-26 | `ljs:.specs/mockup/respostas/publico-ranking-vazio.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/publico-ranking-vazio.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-27 | `ljs:.specs/mockup/respostas/sessao-eu-admin.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-admin.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-28 | `ljs:.specs/mockup/respostas/sessao-eu-carlos.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-carlos.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-29 | `ljs:.specs/mockup/respostas/sessao-eu-dono-sem-grupos.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-dono-sem-grupos.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-30 | `ljs:.specs/mockup/respostas/sessao-eu-endereco-novo.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-endereco-novo.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-31 | `ljs:.specs/mockup/respostas/sessao-eu-primeiro-acesso.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-primeiro-acesso.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-32 | `ljs:.specs/mockup/respostas/sessao-eu-sem-financeiro.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-sem-financeiro.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-33 | `ljs:.specs/mockup/respostas/sessao-eu-sem-grupos.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-sem-grupos.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-34 | `ljs:.specs/mockup/respostas/sessao-eu-troca-de-senha.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/respostas/sessao-eu-troca-de-senha.json` | hunk do patch: sai a linha `enderecoNovo` (P27) | PAR-146 | T75 |
| R-35 | `ljs:.specs/mockup/telas.json` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/telas.json` | hunks do patch: entradas `real` nas rotas `/app/grupos/...` e `/g/...`, `ocultar` do Financeiro, `abortar` na t01 `erro` (P17, P28) | PAR-146 | T75 |
| R-36 | `ljs:.specs/mockup/telas/t11-partida--nova.html` (`git diff 93ce6d1 c6dc82c`) | `.specs/mockup/telas/t11-partida--nova.html` | hunks do patch: sem o aviso "Pré-marcado pela escalação" e todos `ausente` (P28) | PAR-146 | T75 |
