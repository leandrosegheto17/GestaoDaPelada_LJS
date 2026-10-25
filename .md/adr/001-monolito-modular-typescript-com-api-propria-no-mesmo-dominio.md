# ADR-001: Monólito modular em TypeScript, com PWA e API própria servidos no mesmo domínio

- **Status:** Superseded by ADR-014 (rodada 2: o padrão de monólito em TypeScript com tela e API no mesmo domínio continua; o runtime passa a ser um Cloudflare Worker)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-01 a RF-64, RNF-03, RNF-05, RNF-08, RNF-09; PRD-TECNICO PR-06

## Contexto

O Gestão da Pelada tem um desenvolvedor só, em horas de lazer, com custo de caixa perto de zero (RNF-08). O volume é mínimo: até 5 grupos, 40 jogadores por grupo, 1 partida por semana (RNF-09).

Ao mesmo tempo, a lógica é mais densa do que o volume sugere:

- autenticação própria, sem e-mail: senha aleatória de troca obrigatória, bloqueio por e-mail após 5 falhas, pedidos de "esqueci a senha" para o dono e papel de dono fora da interface (RF-01, RF-11 a RF-18, RNF-05);
- o simulador é uma otimização determinística com dois formatos e objetivo lexicográfico (RN-08 a RN-10B);
- o ranking depende de pesos versionados por data de vigência (RN-01, RN-04, RN-05).

A sessão do admin no iPhone não pode depender de mecanismo sujeito ao limite de 7 dias do Safari (PR-06). Desde o Safari 16.4, cookies definidos por um servidor cujo IP não bate com o do site também caem para 7 dias. Cookies criados por JavaScript e o `localStorage` do navegador já estavam sujeitos a esse limite.

O projeto irmão (MyMoney) usa PWA React com o Supabase acessado direto pelo navegador e as regras em SQL. Esse modelo foi avaliado aqui.

## Decisão

Um **monólito modular em TypeScript**, com duas aplicações e dois pacotes compartilhados:

- **PWA** (React) e **API HTTP** (Hono, em Node) publicados **no mesmo domínio**: a tela em `/` e a API em `/api`;
- as regras de negócio ficam num **pacote de domínio puro** (sem I/O), usado só pela API;
- o contrato de requisição e resposta fica num **pacote de contrato** (schemas), usado pela API e pela tela;
- um banco Postgres, acessado só pela camada de infraestrutura da API.

A tela não fala com o banco nem calcula regra de negócio.

## Consequências

**Positivas**
- Uma linguagem só, e o domínio (ranking, simulador) é testável em teste unitário puro e rápido.
- A API no mesmo domínio permite sessão por cookie `HttpOnly` definido pelo servidor, que não sofre o limite de 7 dias do Safari (ADR-003).
- A autenticação sob medida (bloqueio por e-mail, senha temporária, dono) é código comum, sem contornar um provedor.
- A API é portátil: Hono roda em Node, Vercel, Cloudflare ou num servidor próprio. Isso reduz o lock-in (ADR-002).

**Negativas**
- Há mais código próprio do que com um BaaS: rotas, sessão, hash de senha e autorização são escritos e testados aqui.
- A autorização é responsabilidade do código da API (ADR-005), não de uma política no banco. Um erro numa rota pode vazar dado. Por isso a suíte de isolamento é obrigatória.
- Há duas aplicações para publicar, embora no mesmo projeto e no mesmo deploy (ADR-002).

## Alternativas consideradas

1. **Supabase direto do navegador (como no MyMoney), com regras em SQL/RPC e RLS.**
   - Prós: o desenvolvedor já conhece, tem RLS e auth prontos.
   - Contras: a sessão do Supabase JS fica no `localStorage`, num domínio de terceiros (`supabase.co`), e fica exposta ao limite de 7 dias do Safari (PR-06). Criar um admin sem e-mail, com senha aleatória, exige a API administrativa (Edge Function com chave de serviço). O bloqueio de 5 tentativas por e-mail não existe nativamente: o limite é por IP. O vencimento por inatividade de 30 dias é recurso do plano pago. O simulador (otimização) em PL/pgSQL é difícil de escrever e de testar. O plano gratuito pausa o projeto após 7 dias sem uso, e o MyMoney precisou de keep-alive para isso.
   - Descartada.
2. **Serviços separados (API de auth, API de domínio, gerador de PDF).** Não há volume nem equipe que justifiquem: seria mais deploy, mais custo e mais pontos de falha. Descartada.
3. **Cloudflare Workers + D1 (SQLite) como runtime único.**
   - Prós: tudo grátis, sem pausa por inatividade.
   - Contras: o plano gratuito limita a 10 ms de CPU por requisição. O hash de senha forte e a busca local do simulador correm risco real de passar disso.
   - Descartada para a Fase 1. Continua como plano de saída, porque a API em Hono é portátil.
