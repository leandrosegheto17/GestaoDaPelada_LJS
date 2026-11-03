# Necessidade: Gestão da Pelada v2 (reimplementação do zero)

- **Data**: 2026-11-03
- **Veredito**: construir
- **Motivo de construir**: outro — estudo. Reimplementar do zero o produto já definido no `GestaoDaPelada_LJS` para exercitar o novo fluxo do Rascunho. As duas versões anteriores (`GestaodaPelada` e `GestaoDaPelada_LJS`) são estudos sem usuários reais; só existe o grupo de teste do usuário.
- **Aprovação**: aprovado pelo usuário em 2026-11-03 (seguir para a fase 3b, roteiro)
- **Mockup**: aprovado — reaproveitado do `GestaoDaPelada_LJS` (decisão do usuário em 2026-11-03). `.specs/mockup/` copiado de `GestaoDaPelada_LJS@e557292`, com `tokens.css` idêntico. Os mockups de módulo do LJS (`.specs/features/{conta-e-acesso,grupos-e-elenco,partidas-e-ranking}/mockup/`) entram na feature correspondente. As telas que o LJS não desenhou são feitas em modo módulo no mesmo estilo.

## 1. Necessidade

- **O que resolve**: o organizador de pelada controla presença, times e caixa no WhatsApp e na planilha, sem registro nem equilíbrio dos times. Fonte: `GestaodaPelada/.md/PRD.md:58-61`, citado em `GestaoDaPelada_LJS/.specs/produto/analise-legado.md` §1.
- **Como faço hoje**: com o `GestaoDaPelada_LJS` em produção, que só tem conta, grupos e elenco. Partidas e ranking ficaram numa branch, e o resto não começou (`GestaoDaPelada_LJS/.specs/projeto/roadmap.md`).
- **Frequência de uso**: semanal (uma pelada por semana) — PREMISSA.
- **Natureza do projeto**: uso próprio como estudo, mas o **produto é o do LJS, sem cortes**: cadastro aberto, planos Free e Pro, cobrança e push (decisão do usuário em 2026-11-03: "siga exatamente o que está definido no LJS, onde vamos ter Free e Pro").

## 2. O que já existe

Pesquisa feita em 2026-11-03 pelo agente `pesquisador`. Confiança média-baixa: as fontes são agregadores, não as lojas oficiais.

| Solução | Cobre | Não cobre | Licença e custo | Roda local (Docker)? | Ativa? | Fonte |
|---|---|---|---|---|---|---|
| Futebol Society (app) | sorteio, elenco, ranking por temporada, caixa do grupo | presença lesionado/expulso, chuva, pesos, link público, PDF | grátis (descrição da loja) | não | v5.4.0 (2026) | https://mwm.ai/apps/futebol-society/6743960382 |
| Fut Plus (app) | balanceamento, presença por WhatsApp, avaliação, financeiro | ranking público, PDF, pesos, chuva | não informado | não | v1.0.12 (2024) | https://mwm.ai/apps/fut-plus/6478063578 |
| PeladaBot (app) | sorteio por posição e nível, financeiro | ranking, link público, PDF | assinatura (valor não informado) | não | v1.1.14 (2025) | https://mwm.ai/apps/peladabot/6741855212 |
| JeremyNRoos/AzureFinal (GitHub) | jogadores, notas, sorteio de 2 a 10 times, presença | financeiro, ranking, partidas, PDF | sem licença ("uso educacional") | não | 3 commits | https://github.com/JeremyNRoos/AzureFinal |
| `GestaoDaPelada_LJS` (próprio) | conta, grupos, elenco em produção, schema completo, mockups | partidas, ranking, simulador, financeiro, planos, push | próprio | sim (Postgres) | main `e557292` | `C:\Leandro\Projetos\GestaoDaPelada_LJS` |

- **Conclusão**: nenhuma solução pronta cobre o essencial. Nenhuma confirma a pontuação com pesos e vigência, a chuva, o status lesionado/expulso, o ranking público por link ou o PDF, que são o centro do produto. E o motivo declarado é o estudo do fluxo, não a falta de ferramenta. Construir.

## 3. Escopo pessoal

- **Essencial** (o produto do LJS, decisões D1 a D8 de `GestaoDaPelada_LJS/.specs/produto/analise-legado.md` §8, e o roteiro de 8 features):
  - **Fundação**: monorepo, Worker único com assets e `/api/*`, banco, CI, backup e deploy.
  - **Conta e acesso**: cadastro aberto com confirmação por e-mail, entrar e sair, recuperação de senha por e-mail, convite de admin, troca de senha, exclusão de conta, termos e privacidade. Sessão de 15 min de inatividade e 12 h absoluta (D7).
  - **Grupos e elenco**: qualquer conta cria grupos (D1), slug imutável, admins por vínculo (sempre resta um), jogadores (apelido único, posição, ano de nascimento, telefone), períodos de atividade, habilidades e notas, nível.
  - **Partidas e ranking**: partidas (uma por data, sem data futura, chuva), presenças (presente/lesionado/expulso), pesos com vigência, acumulado a partir do retorno, ranking com desempate, ranking público `/g/:slug` sem login, PDF no cliente.
  - **Simulador**: prioridade pelo ranking da véspera, 2 times (serpentina) e N times, reservas, escalação confirmada.
  - **Financeiro**: mensalidade por mês (gera entrada, recusa mês futuro e jogador inativo), lançamentos de entrada e saída, saldo, quem não pagou.
  - **Planos e cobrança** (D2): Free com 1 grupo, até 20 jogadores, ranking e partidas. Pro a R$ 9,90/mês por grupo, com jogadores ilimitados, simulador, financeiro, PDF e push. Trial Pro de 14 dias sem cartão. Ao expirar, cai para Free sem apagar dados, e o excedente fica somente leitura. Cobrança pelo Asaas.
  - **Notificações** (D3): push de ranking atualizado para quem assinou pelo link público, sem login. Push e e-mail de cobrança para o organizador.
  - **Painel do dono da plataforma**: papel de suporte (D1).
  - Todas as regras de negócio da tabela §2 de `analise-legado.md` (pontuação, vigência, acumulado, ranking, rodadas, períodos, nível, simulador, financeiro, partidas, escalação, slug, PDF, fuso `America/Sao_Paulo`, centavos inteiros).
- **Fica de fora** (mesmo corte do LJS, `decisao.md`): TWA e Play Store, plano anual, permissões diferentes por grupo além do legado, homologação (staging).
- **Bom o bastante quando**: o grupo de teste do usuário roda uma pelada inteira no app novo (presença, sorteio, ranking público, mensalidade) sem planilha, e a assinatura Pro passa de ponta a ponta no sandbox do Asaas.

## 4. Restrições

- **Onde roda**: nuvem gratuita. Cloudflare Workers (Worker único) + Neon (Postgres) via Hyperdrive, no domínio `gestaodapelada.ljssoftware.com.br` (D4). Local com Docker só para desenvolvimento e testes (Postgres 18).
- **Limites do plano gratuito** (consulta em 2026-11-03, agente `pesquisador`):
  - Neon Free: 1 GB por projeto, 100 CU-hours/mês, 10 branches. Suspende após 5 min ocioso (cold start inevitável). PITR de só 6 h. Sem expiração e sem apagar dados. Fonte: https://neon.com/docs/introduction/plans
  - Cloudflare Workers Free: 100 mil requisições/dia, **10 ms de CPU por requisição**, 5 Cron Triggers, assets estáticos grátis. Rate Limiting binding no Free é PREMISSA, não confirmado. Fontes: https://developers.cloudflare.com/workers/platform/limits/ e https://developers.cloudflare.com/workers/platform/pricing/
  - Hyperdrive Free: 100 mil queries/dia, cerca de 20 conexões de origem. Fonte: https://developers.cloudflare.com/hyperdrive/platform/pricing/
  - Resend Free: 100 e-mails/dia, 3 mil/mês, 3 domínios. Fonte: https://resend.com/pricing
  - Sentry Developer: 5 mil erros e 1 monitor de uptime (período mensal é PREMISSA). Fonte: https://sentry.io/pricing/
  - Asaas: sandbox com saldo fictício (gratuidade é PREMISSA). Em produção não há mensalidade: Pix/boleto custam R$ 1,59 por cobrança recebida, descontados do valor pago. Fonte: https://www.asaas.com/precos-e-taxas
  - GitHub Actions (repositório privado): cota de US$ 12/mês, cerca de 2 mil min Linux. Bloqueia ao esgotar, sem cobrar. Fonte: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
  - Web Push (VAPID): sem custo (PREMISSA, padrão aberto pelos navegadores).
- **Stack**: a mesma do LJS, enxuta — já domino. React + Vite + CSS Modules com os tokens do mockup, PWA. Hono num Cloudflare Worker. Kysely + `pg`. Zod no contrato. Postgres 18 no Neon, `node-pg-migrate`, RLS com `FORCE` por `grupo_id`, roles `pelada_owner`, `pelada_app` e `pelada_backup_ro`. Sessão opaca em cookie, bcrypt via pgcrypto. Resend, Asaas e Web Push. Monorepo pnpm, Node 26, TypeScript estrito, Vitest e Playwright. "Enxuta" corta o **processo** que deixou o LJS caro de manter (36 ADRs, cerca de 2.900 testes, cerca de 260 telas de mockup), não a tecnologia.
- **Interface**: a do LJS. Mockups em `GestaoDaPelada_LJS/.specs/mockup/` (direção `a-gramado` aprovada, `tokens.css` copiado sem alteração) e `GestaoDaPelada_LJS/.specs/features/*/mockup/`. Telas que o LJS ainda não desenhou (landing, Meu plano e planos, notificações) entram na fase 4 ou na feature, no mesmo estilo.
- **Exposição**: internet, com autenticação e HTTPS (Cloudflare). A auditoria de segurança entra na validação (fase 7).

## 5. Dados e backup

- **Banco**: o **mesmo** do LJS, sem migração de dados (decisão do usuário). Projeto Neon com branch `main` (produção) e `dev`, database `pelada`, mesmo Hyperdrive. O app novo assume o schema da produção no estado da main do LJS (`e557292`, 23 migrações até `1792844520000_grupos-arquivar-so-criadora.sql`) como linha de base e evolui só de forma aditiva. As 6 migrações da branch `feat/partidas-e-ranking` do LJS **não** estão aplicadas na produção (`GestaoDaPelada_LJS/.specs/liberacao.md`) e não fazem parte da linha de base.
- **Dados guardados**: contas e sessões, grupos e admins, jogadores, períodos, notas, partidas e presenças, pesos, escalações, financeiro (mensalidades e lançamentos), assinaturas e push. Contém dado pessoal (e-mail, nome, telefone, ano de nascimento): vale a LGPD.
- **Custo de perder**: baixo hoje (só o grupo de teste), médio a partir do uso real do grupo (histórico do ranking e do caixa não se refaz de memória).
- **Backup**: o mesmo esquema do LJS. `pg_dump` diário às 07:00 UTC pelo GitHub Actions, com a role `pelada_backup_ro`, cifrado com `age`. Mais um dump cifrado e uma branch de restauração no Neon antes de cada deploy com migração. O PITR de 6 h do Neon Free não substitui o backup externo.
- **Teste de restauração**: obrigatório na validação, a partir de uma cópia limpa.

## 6. Riscos e dúvidas

- **Convivência com o LJS no mesmo banco**: enquanto o Worker do LJS estiver no ar, as migrações da v2 precisam ser compatíveis com ele, ou o LJS precisa ser desligado antes da primeira migração da v2. **Decidido (2026-11-03): a v2 substitui o LJS.** Na primeira implantação da v2, o Worker do LJS sai do ar e a v2 assume o mesmo domínio. Até lá, a v2 roda só local e na branch `dev` do Neon. As migrações não precisam manter compatibilidade com o código do LJS.
- **Escrita de teste no banco de produção**: testes rodam só no Postgres local (Docker) ou na branch `dev` do Neon, nunca na `main`.
- **CPU de 10 ms por requisição** no Worker Free: o simulador roda no servidor (ADR-007 do legado) e o custo não foi medido. Medir cedo, com spike se preciso.
- **Herança do schema**: funções SECURITY DEFINER (`grupos_visiveis()`, `grupo_criar` etc.), RLS e roles herdadas. A v2 reaproveita ou substitui por migração aditiva, decidido no desenho.
- **Débitos herdados do LJS**: `deepmerge` (SEC-010), regra `pelada/sem-escrita-periodo` não ligada (I-1), filtro de arquivado no ramo público de `grupos_visiveis()` (I-3), e SEC-CA-05 a SEC-CA-12 e SEC-CA-14 em aberto. Viram critérios na feature correspondente.
- **Escopo grande para uso próprio**: 8 features. Na fase 3b, o `roteiro` divide em features e só a primeira recebe spec.
- **Rate Limiting binding no plano Free** não confirmado: conferir no desenho.
- **Cota do Resend** (100/dia) basta para um grupo. Com cadastro aberto, precisa de teto de envio (o LJS já tem `envios_email_dia`).
- **Pendências herdadas**: Plano do grupo de teste existente: **cortesia Pro permanente, sem cobrança** (decidido em 2026-11-03). [A ESCLARECER: texto do BK-0020, "Volta a aparecer no ranking…"].
