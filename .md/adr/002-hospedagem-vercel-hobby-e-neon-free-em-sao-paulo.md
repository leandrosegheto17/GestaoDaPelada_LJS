# ADR-002: Hospedagem na Vercel Hobby (PWA e função única em gru1) e banco no Neon Free (aws-sa-east-1)

- **Status:** Superseded by ADR-014 (rodada 2: o usuário escolheu a Cloudflare em vez da Vercel; o Neon em São Paulo continua)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RNF-03, RNF-07, RNF-08, RNF-09; PR-08

## Contexto

A meta é infraestrutura em plano gratuito, com custo total de caixa até R$ 180 (RNF-08). O ranking deve abrir em até 2 s (p75) em 4G no Brasil (RNF-03). O desenvolvedor já usa a Vercel no MyMoney.

O volume previsto é pequeno:
- até 5 grupos, 40 jogadores e cerca de 1 partida por semana por grupo (RNF-09);
- em ordem de grandeza: algumas centenas de linhas por grupo por ano, poucos MB no total;
- alguns milhares de requisições por mês.

Limites verificados em 2026-10-16 (fontes no fim):

- **Vercel Hobby:**
  - 1 milhão de invocações por mês, 4 h de CPU ativa, 100 GB de transferência;
  - as funções rodam em **uma única região**, escolhível (`gru1` = São Paulo);
  - ao estourar um limite, a conta é **pausada**, sem cobrança;
  - uso **não comercial**.
- **Neon Free:**
  - 100 CU-hora por mês por projeto, 0,5 a 1 GB de armazenamento, 5 GB de saída;
  - região `aws-sa-east-1` (São Paulo), fixa na criação do projeto;
  - o compute **suspende após 5 minutos sem uso** e acorda em menos de 1 s;
  - histórico de restauração de cerca de 6 h.

## Decisão

- **Vercel Hobby**, num único projeto ligado ao repositório GitHub:
  - publica o PWA estático (build do Vite);
  - publica **uma função Node** que monta a API Hono inteira em `/api/*`;
  - região de função fixada em `gru1` no `vercel.json`.
- **Neon Free**, um projeto em `aws-sa-east-1`, acessado pela string de conexão com pooler.
- **GitHub** (repositório privado) para código, CI (GitHub Actions) e backup diário (ADR-011).
- Custo de caixa estimado:
  - R$ 0 por mês de infraestrutura;
  - cerca de R$ 40 por ano de domínio próprio `.com.br` (ADR-010, pergunta ao usuário);
  - a conta da Play já está paga.

## Consequências

**Positivas**
- R$ 0 por mês, com folga grande nos limites. O consumo previsto é menor que 1% das invocações e do armazenamento.
- A função e o banco em São Paulo reduzem a latência para os usuários.
- Um deploy só (git push) publica a tela e a API juntas, com prévia por branch.
- Sem pausa definitiva do banco por inatividade (diferente do Supabase Free), então não é preciso keep-alive.

**Negativas**
- **Partida a frio:** depois de 5 minutos sem uso, a primeira requisição paga o despertar do Neon e, às vezes, o início a frio da função (cerca de 1 a 2 s somados). Isso ameaça o p75 de 2 s do ranking. Mitigação: o service worker mostra o último ranking na hora e atualiza ao fundo (ADR-009), e a medição em aparelho real entra no fim do I1 (risco T-01 do SDD).
- **Vercel Hobby é para uso não comercial.** A Fase 2 (cobrança) exige Vercel Pro (cerca de US$ 20 por mês) ou migrar a API Hono para outro host. Fica registrado como dívida aceita (SDD §6).
- A conta pausa se estourar um limite. Improvável no volume previsto, mas sem cobrança automática não há "transbordo".
- O histórico do Neon Free (cerca de 6 h) não cumpre sozinho o RPO de 24 h. Por isso existe o dump diário (ADR-011).
- Ficamos dependentes de dois fornecedores. O lock-in é baixo: a API em Hono roda em qualquer Node, e o Postgres é padrão (`pg_dump` e restauração em qualquer Postgres).

## Alternativas consideradas

1. **Supabase Free (Postgres + hospedagem estática na Vercel).** O Postgres é equivalente, mas o projeto pausa após 7 dias sem atividade e precisa de keep-alive. Usar o Supabase só como banco não traz vantagem sobre o Neon. Descartada.
2. **Render Free para a API.** O serviço dorme após 15 minutos e leva dezenas de segundos para acordar, o que é incompatível com RNF-03. Descartada.
3. **Cloudflare Workers + D1.** Limite de 10 ms de CPU no plano gratuito (ADR-001, alternativa 3). Descartada, mas é o plano de saída para a Fase 2 se o Vercel Pro não compensar.
4. **VPS própria ou paga (cerca de R$ 25 a 50 por mês).** Fura a meta de custo zero e aumenta a manutenção (sistema operacional, TLS, backup). Descartada.

## Fontes

- Vercel limits: https://vercel.com/docs/limits
- Vercel regiões de função: https://vercel.com/docs/functions/configuring-functions/region
- Neon pricing: https://neon.com/pricing
- Neon regiões: https://neon.com/docs/introduction/regions
