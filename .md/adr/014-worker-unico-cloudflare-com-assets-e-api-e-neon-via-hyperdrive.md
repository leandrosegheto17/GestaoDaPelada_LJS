# ADR-014: Um único Cloudflare Worker (arquivos estáticos do PWA + API Hono no mesmo domínio), com Neon em São Paulo acessado por Hyperdrive

- **Status:** Accepted (rascunho do Loop B, rodada 2, sujeito à aprovação do usuário). A ordem de saída do §5 (simulador) foi substituída pelo ADR-017 na rodada 3. O §7 (Lightsail só como contingência) continua valendo.
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect), a partir da escolha do usuário pela Cloudflare (rodada 2)
- **Supersedes:** ADR-001 (o padrão "monólito modular em TypeScript, tela e API no mesmo domínio" continua; muda o runtime) e ADR-002 (hospedagem Vercel)
- **Complementa:** ADR-007 (orçamento de CPU do simulador)
- **Requisitos:** RNF-03, RNF-05, RNF-07, RNF-08, RNF-09; PR-06, PR-08

## Contexto

Na rodada 2, o usuário trocou a Vercel pela Cloudflare. Os motivos levados a ele:

- o plano gratuito da Cloudflare permite **uso comercial**, o que elimina a dívida "Vercel Hobby" da Fase 2;
- o Hono roda nativo em Workers;
- não há partida a frio relevante.

O usuário já tem conta no Neon. Ficam mantidos:
- a forma do sistema: monólito modular em TypeScript, com domínio puro, contrato compartilhado e API como única porta para o banco (ADR-001);
- a sessão por cookie do próprio domínio (ADR-003).

Limites do **Workers Free** verificados em 2026-10-16:

| Limite | Valor |
|---|---|
| Requisições à Worker | 100 mil por dia |
| CPU por requisição HTTP | **10 ms** (espera de rede e de banco não conta). Ao estourar, a resposta é o erro 1102 |
| Rajada | 1.000 requisições por minuto |
| Requisições a arquivos estáticos | não invocam a Worker |

Limites do **Hyperdrive Free:**

| Limite | Valor |
|---|---|
| Consultas | 100 mil por dia |
| Configurações | 10 |
| Conexões com a origem | cerca de 20 por configuração |
| Cache de leitura | ligado por padrão por 60 s, **sem invalidação na escrita** |

O Neon recomenda Hyperdrive com driver padrão em Workers, e não combinar o Hyperdrive com o driver serverless.

Três pontos precisam de resposta:
1. **Mesma origem** para a tela e a API, exigida pelo ADR-003 contra o limite de 7 dias do Safari para cookies de servidor com IP diferente.
2. **Transações** para confirmar escalação, salvar partida, marcar pagamento e remover admin, e para as migrações.
3. **Os 10 ms de CPU.**

## Decisão

### 1. Runtime e mesma origem
- **Um Worker** (`pelada`) com **Static Assets**:
  - o build do Vite vai como arquivos estáticos, com `not_found_handling = "single-page-application"`;
  - `run_worker_first = ["/api/*"]`: só `/api/*` invoca o código, e o resto é servido como arquivo.
- A tela e a API ficam no **mesmo host** (ex.: `pelada.<conta>.workers.dev` ou o domínio próprio, ADR-010), com a mesma origem e o mesmo IP. O cookie `__Host-sessao` (ADR-003) fica válido sem ajuste.
- **Pages + Pages Functions não foram escolhidos.** Dariam a mesma origem, mas a Cloudflare hoje orienta projetos novos para Workers com Static Assets: uma configuração (`wrangler.jsonc`) e um deploy. Aqui "Pages" do pedido do usuário vira o recurso de arquivos estáticos do próprio Worker, com o mesmo efeito.

### 2. Acesso ao Neon
- O Worker usa **Hyperdrive** com o driver **`pg`** (node-postgres, `compatibility_flags: ["nodejs_compat"]`), por baixo do Kysely.
- O cliente é criado **por requisição** e fechado no fim (`ctx.waitUntil(client.end())`).
- O Hyperdrive mantém o pool de conexões perto do banco e elimina o custo de abrir uma conexão TLS ao Neon a cada requisição.
- O Hyperdrive aponta para a string de conexão **direta** do Neon, sem o pooler do Neon (recomendação do próprio Neon).
- **O cache de consultas do Hyperdrive fica desligado** (`--caching-disabled`). O ranking precisa refletir na hora uma partida salva, e o cache não é invalidado na escrita.

### 3. Transações
- O `pg` sobre o Hyperdrive mantém a conexão durante a transação. Os casos de uso que escrevem mais de uma tabela usam `BEGIN … COMMIT` numa única conexão:
  - confirmar escalação;
  - salvar ou editar partida (presenças + auditoria);
  - marcar ou desmarcar pagamento (marca + lançamento);
  - remover admin (checagem do último admin + remoção + sessões);
  - criar grupo (grupo + pesos + habilidades + admin + vínculo).
- **Migrações não passam pelo Worker:** o script Node `backend/scripts/migrar.ts` conecta direto no Neon (string direta, TLS) pelo GitHub Actions ou pela máquina do desenvolvedor, com uma transação por migração.
- O spike S-01 (§6 do SDD) confirma `BEGIN`/`COMMIT` e o rollback em erro sobre o Hyperdrive no primeiro deploy.

### 4. Região e latência
- O Worker roda no ponto de presença mais próximo do usuário (há vários no Brasil).
- O Neon fica em `aws-sa-east-1` (São Paulo).
- O Hyperdrive coloca o pool perto do banco. Cada consulta faz uma ida e volta de dezenas de ms dentro do Brasil.
- **Smart Placement** fica desligado: usuário e banco estão no Brasil, e não há ganho.
- O que sobra de partida a frio é só o Neon acordando depois de 5 minutos ocioso (cerca de 0,5 a 1 s). O Worker não tem partida a frio relevante.

### 5. Orçamento de CPU (10 ms por requisição)

| Requisição | Custo estimado | Decisão |
|---|---|---|
| Hash de senha (login, troca, criação de admin) | PBKDF2 ou scrypt fortes passam de 10 ms | **Sai do Worker:** o hash é calculado no Postgres (ADR-015). A espera pelo banco não conta como CPU |
| Ranking (cálculo de cerca de 2.000 presenças por ano) | 1 a 3 ms | Cabe. Condição de revisão: > 5 ms medidos |
| Simulador `sugerir` (30 aptos, busca local) | 2 a 6 ms, se implementado com avaliação incremental | Cabe com margem pequena. Exige (a) avaliação incremental da troca, sem recalcular o time inteiro; (b) teto de iterações; (c) teste de orçamento no CI; (d) medição no Worker publicado (spike S-02) |
| `avaliar`, `previa`, demais rotas | < 1 a 2 ms | Cabe |
| Geração do PDF | No navegador (ADR-008) | Fora do Worker |

**Se o S-02 mostrar que o `sugerir` não cabe** em 10 ms nos casos de 30 aptos, a ordem de saída é:
1. otimizar (vizinhança menor, saída antecipada);
2. Workers Paid (US$ 5 por mês, 30 s de CPU), que fura a meta de custo zero e precisa da decisão do usuário;
3. mover só o simulador para a Lightsail do usuário (item 7), com o mesmo pacote de domínio em Node.

### 6. Deploy e CI/CD (GitHub Actions + Wrangler)
- **Em PR:** lint, tipos, testes de domínio, testes de API e suíte de isolamento contra um Postgres de serviço do Actions (workerd local via `wrangler dev`/Vitest pool de Workers), e2e com Playwright.
- **Em `main`:**
  1. cria um branch de restauração no Neon (API do Neon) e roda o dump (ADR-011);
  2. `migrar.ts` com a string direta;
  3. `wrangler deploy` (build do Vite + Worker).
  - Volta atrás: `wrangler rollback` para a versão anterior, mais a restauração do branch.
- **Homologação:** um segundo Worker, `pelada-teste`, com Hyperdrive próprio apontando para o branch `teste` do Neon. Ele é publicado por disparo manual e nunca toca o banco de produção.
- **Segredos:** `CLOUDFLARE_API_TOKEN`, string direta do Neon e chave do backup, como secrets do GitHub. O Worker só conhece o binding do Hyperdrive.

### 7. Lightsail do usuário: não usada na Fase 1
- Nenhum componente roda na Lightsail.
- **Motivo:** cada máquina no caminho é sistema operacional, atualização, credencial e ponto de falha a manter. Nada do sistema exige isso hoje:
  - o hash de senha foi resolvido no banco;
  - o simulador cabe na estimativa;
  - o backup roda no GitHub Actions.
- **Registrada como contingência**, sem custo novo por já estar paga:
  - (a) host do simulador, se o S-02 falhar (item 5);
  - (b) executor do backup diário, se o agendamento do GitHub se mostrar pouco confiável (risco T-08).
  - Nos dois casos, o código não muda: o Hono e o domínio rodam em Node.

### 8. Ambiente local
Os serviços do `docker compose` são:
- `db` (Postgres 16);
- `backend` (`wrangler dev`, workerd, com `localConnectionString` do Hyperdrive apontando para `db`);
- `frontend` (Vite, com proxy de `/api` para o `backend`).

O workerd local **não impõe** o limite de 10 ms. Por isso o orçamento de CPU é verificado pelo teste de orçamento e pela medição no Worker publicado.

## Consequências

**Positivas**
- R$ 0 por mês, com **uso comercial permitido**, e a dívida da Fase 2 sobre hospedagem desaparece.
- O Worker não tem partida a frio. Só o Neon acorda, e o Hyperdrive reduz o custo de conexão.
- Um artefato e um deploy, com a mesma origem garantida pela própria configuração.
- Os arquivos estáticos não consomem a cota de requisições da Worker.

**Negativas**
- **O limite de 10 ms de CPU vira uma restrição de projeto:**
  - o hash de senha precisou sair do Worker (ADR-015);
  - o simulador precisa de implementação cuidadosa e de teste de orçamento;
  - um estouro aparece como erro 1102 para o usuário.
- **O runtime não é o Node completo:** `nodejs_compat` cobre `pg` e `crypto.getRandomValues`, mas as dependências precisam ser compatíveis com workerd. É mais uma checagem no CI.
- **Limites diários** (100 mil requisições e 100 mil consultas) se renovam às 00:00 UTC. O consumo previsto é menor que 1%.
- O local (workerd) não reproduz o limite de CPU de produção.

## Alternativas consideradas

1. **Cloudflare Pages + Pages Functions.** Mesma origem e mesmo resultado, mas a Cloudflare orienta projetos novos para Workers com Static Assets. Descartada pela configuração dupla.
2. **Pages para a tela e Worker em subdomínio para a API.** Seria outro host, e o cookie da sessão teria de ser `Domain=` do domínio pai, sem `__Host-`, com risco de cair na regra do Safari 16.4 se os IPs divergirem. Descartada.
3. **Driver serverless do Neon (HTTP/WebSocket) em vez de Hyperdrive.** O HTTP não faz transação interativa. O WebSocket faz, mas abre conexão a cada requisição. O Neon recomenda Hyperdrive em Workers. Descartada.
4. **Vercel Hobby (ADR-002).** Superada pela restrição de uso comercial na Fase 2 e pela escolha do usuário.
5. **Workers Paid desde já (US$ 5 por mês).** Removeria o problema de CPU, mas fura a meta de custo zero. Fica como plano de saída, com decisão do usuário.

## Fontes

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Hyperdrive limits: https://developers.cloudflare.com/hyperdrive/platform/limits/
- Hyperdrive query caching: https://developers.cloudflare.com/hyperdrive/configuration/query-caching/
- Neon + Cloudflare Workers: https://neon.com/docs/guides/cloudflare-workers
- Neon FAQ Hyperdrive: https://neon.com/blog/hyperdrive-neon-faq
