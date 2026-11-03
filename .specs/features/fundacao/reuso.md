# Reuso — fundação

Base: GestaoDaPelada_LJS @ e557292, conferido em 2026-11-03. Também `.specs/mockup/` da v2 (cópia de GestaoDaPelada_LJS @ e557292, commit `c8d7196`).

Política: do zero total (AD-002). Só entra neste mapa o que é **copiado**. Nada aqui é código adaptado: todas as linhas são cópia sem alteração, conferida por hash.

| # | Origem | Destino | Adaptação | FUN | Tarefa |
|---|---|---|---|---|---|
| R1 | `ljs:backend/api/src/infraestrutura/db/migracoes/*.sql` (23 arquivos, de `1792843200000_linha-de-base.sql` a `1792844520000_grupos-arquivar-so-criadora.sql`) | `backend/api/src/infraestrutura/db/migracoes/` | Nenhuma. Comando: `git -C ../GestaoDaPelada_LJS archive e557292 backend/api/src/infraestrutura/db/migracoes \| tar -x --wildcards '*.sql'`. Conferir: `sha256sum` igual à origem nos 23 | FUN-08, FUN-09 | definida no `tasks.md` |
| R2 | `.specs/mockup/tokens.css` | `frontend/web/src/estilos/tokens.css` | Nenhuma. Comando: `cp .specs/mockup/tokens.css frontend/web/src/estilos/tokens.css` | FUN-30 | definida no `tasks.md` |
| R3 | `.specs/mockup/fontes/*.woff2` e `OFL.txt` | `frontend/web/public/fontes/` | Nenhuma. Comando: `cp .specs/mockup/fontes/*.woff2 .specs/mockup/fontes/OFL.txt frontend/web/public/fontes/` | FUN-30 | definida no `tasks.md` |
| R4 | `.specs/mockup/icones/*.png` e `icone.svg` | `frontend/web/public/icones/` | Nenhuma. Comando: `cp .specs/mockup/icones/*.png .specs/mockup/icones/icone.svg frontend/web/public/icones/` | FUN-30, FUN-33 | definida no `tasks.md` |

Fora do mapa, só como **referência de leitura** (não se copia código): `.specs/mockup/base.css` e `.specs/mockup/telas/*.html`, para escrever os componentes (FUN-31). E os padrões do LJS citados no `design.md` §Code Reuse.
