# Grupos e elenco — Mapa de reuso

**Base**: `GestaoDaPelada_LJS` @ `e557292` (`ljs:` = `C:\Leandro\Projetos\GestaoDaPelada_LJS`), conferido em 2026-11-04.

Só ativos do mockup do módulo, copiados byte a byte (AD-002 permite copiar os ativos do mockup). Nenhum código, teste ou script do LJS entra aqui. Os caminhos relativos dos arquivos (`../../../../mockup/` nas telas e `../../../mockup/` no `index.html`) resolvem igual na v2, porque a pasta fica na mesma profundidade e `.specs/mockup/` já existe. As 35 entradas do `telas.json` da v2 com `"mockup": "../features/grupos-e-elenco/mockup/telas/..."` (`telas.json:164-165` e `telas.json:188-227`, menos as de t15 e t17 em `:195-201`, que usam o mockup do projeto) apontam para estes arquivos.

**Comando de adaptação (todas as linhas)**: `mkdir -p .specs/features/grupos-e-elenco/mockup && cp -r "$LJS/.specs/features/grupos-e-elenco/mockup/." .specs/features/grupos-e-elenco/mockup/`, com `LJS` apontando para o clone do LJS no commit `e557292` (`git -C "$LJS" rev-parse HEAD` = `e557292...` antes de copiar); depois, `cmp` arquivo a arquivo contra a origem. A tarefa é rodar e conferir (T52).

| Linha | Origem | Destino | O que muda | Requisito | Tarefa |
|---|---|---|---|---|---|
| R-01 | `ljs:.specs/features/grupos-e-elenco/mockup/index.html:1-264` | `.specs/features/grupos-e-elenco/mockup/index.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-02 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--arquivado.html:1-32` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--arquivado.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-03 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--carregando.html:1-20` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--carregando.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-04 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--erro.html:1-19` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-05 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--reativado.html:1-26` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--reativado.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-06 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--reativar.html:1-22` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--reativar.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-07 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--sucesso.html:1-31` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--sucesso.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-08 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--vazio.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t08-grupos--vazio.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-09 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t09-inicio--sem-jogadores.html:1-33` | `.specs/features/grupos-e-elenco/mockup/telas/t09-inicio--sem-jogadores.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-10 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t09-inicio--sucesso.html:1-35` | `.specs/features/grupos-e-elenco/mockup/telas/t09-inicio--sucesso.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-11 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--carregando.html:1-25` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--carregando.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-12 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--corrigido.html:1-40` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--corrigido.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-13 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--corrigir-erro.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--corrigir-erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-14 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--corrigir.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--corrigir.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-15 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--edicao.html:1-65` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--edicao.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-16 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--erro.html:1-33` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-17 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--excluir.html:1-22` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--excluir.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-18 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--exclusao-recusada.html:1-21` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--exclusao-recusada.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-19 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inativar.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inativar.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-20 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inativo.html:1-65` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inativo.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-21 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inicio-erro.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inicio-erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-22 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inicio.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--inicio.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-23 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--novo.html:1-33` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--novo.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-24 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--reativado.html:1-40` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--reativado.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-25 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--reativar-erro.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--reativar-erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-26 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--reativar.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t16-jogador--reativar.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-27 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--arquivar-erro.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--arquivar-erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-28 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--arquivar.html:1-23` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--arquivar.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-29 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--carregando.html:1-25` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--carregando.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-30 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--erro.html:1-41` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-31 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--nao-criador.html:1-37` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--nao-criador.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-32 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--salvo.html:1-41` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--salvo.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-33 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--sucesso.html:1-42` | `.specs/features/grupos-e-elenco/mockup/telas/t20-grupo--sucesso.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-34 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t27-novo-grupo--carregando.html:1-28` | `.specs/features/grupos-e-elenco/mockup/telas/t27-novo-grupo--carregando.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-35 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t27-novo-grupo--erro.html:1-29` | `.specs/features/grupos-e-elenco/mockup/telas/t27-novo-grupo--erro.html` | nada (cópia byte a byte) | GEL-116 | T52 |
| R-36 | `ljs:.specs/features/grupos-e-elenco/mockup/telas/t27-novo-grupo--vazio.html:1-29` | `.specs/features/grupos-e-elenco/mockup/telas/t27-novo-grupo--vazio.html` | nada (cópia byte a byte) | GEL-116 | T52 |
