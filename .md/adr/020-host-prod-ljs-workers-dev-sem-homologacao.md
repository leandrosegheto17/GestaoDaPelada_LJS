# ADR-020: Host de produção em pelada.prod-ljs.workers.dev, sem ambiente de homologação

- **Status:** Accepted (decisão do usuário, BK-0008 e BK-0009)
- **Data:** 2026-10-17
- **Decisores:** usuário (subdomínio da conta e fim da homologação); Coordenador (ajuste dos artefatos)
- **Requisitos:** RF-29, RF-34, RF-53, RF-55, RNF-08, RNF-11; ADR-003, ADR-009, ADR-014, ADR-016
- **Substitui:** ADR-010

## Contexto

O ADR-010 fixou o host `pelada.gestaodapelada.workers.dev` e previu um Worker de homologação (`pelada-teste`, branch `teste` do Neon, environment `teste` do GitHub, Hyperdrive `pelada-teste`). Na prática, o subdomínio `workers.dev` da conta Cloudflare é `prod-ljs` (BK-0008), e o usuário decidiu não manter homologação.

## Decisão

1. **Host de produção:** `https://pelada.prod-ljs.workers.dev`. O Worker segue chamado `pelada`. Exemplo de link do ranking: `https://pelada.prod-ljs.workers.dev/g/pelada-de-quinta`.
2. **Sem homologação.** Ficam fora: Worker `pelada-teste`, branch `teste` do Neon, environment `teste` do GitHub, Hyperdrive `pelada-teste`, secret `NEON_URL_MIGRACAO_TESTE`. O `env.teste` sai do `wrangler.jsonc` e o caminho `teste` sai do `deploy.yml`. Se a homologação voltar, abre-se um novo BK.
3. **`URL_PUBLICA`:** o `wrangler.jsonc` mantém `http://localhost:8787` (dev e testes); o deploy injeta o valor de produção por `--var` a partir da variável `URL_PUBLICA` do environment `producao` do GitHub.
4. **Mesma preparação de troca futura de domínio do ADR-010, sem alteração:** nenhuma URL absoluta no código ou no banco, `URL_PUBLICA` única, cookie `__Host-` sem `Domain=`, sinal `enderecoNovo` (variável `ENDERECO_NOVO`, vazia na Fase 1), saída de emergência do service worker, plano de 301 que preserva caminho e query, pacote da TWA `com.gestaodapelada.app` independente do domínio.
5. **Sem CORS:** app e API respondem na mesma origem; não há cabeçalho `Access-Control-*` a ajustar.

## Consequências

**Positivas**
- Menos infraestrutura para manter e nenhum custo extra.

**Negativas**
- Migrações e o deploy vão direto à produção, protegidos por branch de restauração e dump cifrado antes da migração, e pelo disparo manual do workflow (`gh workflow run deploy.yml --ref main`).
- Atualização (decisão do Leandro, 2026-10-19): o environment `producao` não exige mais revisor; o push na `main` não dispara deploy. A barreira passa a ser o disparo manual deliberado + a branch policy do environment (só a `main` pode implantar), mais o branch de restauração e o dump cifrado. Perde-se a segunda pessoa/aprovação explícita antes de cada deploy.
- Os riscos da troca futura de domínio (T-18) continuam como no ADR-010; o nome `prod-ljs` fica fixo enquanto durar o `workers.dev`.

## Alternativas consideradas

1. **Manter a homologação adormecida (`env.teste` no `wrangler.jsonc`).** Recusada: código morto e configuração sem uso real.
2. **Criar o subdomínio `gestaodapelada`.** Recusada: o subdomínio da conta já é `prod-ljs`.
