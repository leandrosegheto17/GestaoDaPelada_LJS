# ADR-028: Host próprio gestaodapelada.ljssoftware.com.br, Worker novo e sem homologação

- **Status:** Accepted (design da fundação, FUN-27)
- **Data:** 2026-10-25
- **Decisores:** usuário
- **Requisitos:** FUN-22, FUN-27, FUN-45
- **Supersedes:** ADR-020 (o host em `pelada.prod-ljs.workers.dev`). A decisão de não ter homologação do ADR-020 continua valendo.

## Contexto

O ADR-020 fixou o host `pelada.prod-ljs.workers.dev` e o Worker `pelada`. A zona `ljssoftware.com.br` está na Cloudflare da conta, e o projeto novo é um Worker novo, com os assets e a API juntos.

## Decisão

1. O host de produção é **`https://gestaodapelada.ljssoftware.com.br`**, como rota `custom_domain` do Worker `gestaodapelada` (`wrangler.jsonc`).
2. O Worker antigo `pelada` é **removido antes da primeira migração** do banco de produção, com dump cifrado já feito (FUN-45; runbook, seções 1 e 6).
3. **Continua sem homologação**, como no ADR-020: sem Worker de teste, sem branch `teste` do Neon, sem environment `teste`. O disparo manual do `deploy.yml` na `main`, a branch de restauração e o dump cifrado são a proteção.
4. `URL_PUBLICA` continua sendo a única fonte do endereço: o `wrangler.jsonc` mantém `http://localhost:8787` e o deploy injeta o valor de produção por `--var` a partir da variável do environment `producao`. Nenhuma URL absoluta no código ou no banco.
5. O Hyperdrive existente é reaproveitado (origem `pelada_app`, cache desligado).
6. App e API respondem na mesma origem: sem CORS.

## Consequências

**Positivas**

- Endereço estável e da marca, sem depender do subdomínio `workers.dev` da conta.

**Negativas**

- A troca de host exige a remoção do Worker antigo (ação difícil de desfazer, com confirmação a cada passo) e a rota na zona `ljssoftware.com.br`.
- Quem tinha o link antigo não é redirecionado automaticamente.

## Alternativas consideradas

1. **Manter `pelada.prod-ljs.workers.dev`.** Recusada: o domínio próprio já existe e é parte do posicionamento do produto.
2. **Migrar o Worker antigo no lugar.** Recusada: o nome e a configuração mudam, e o app novo é outra base de código.
