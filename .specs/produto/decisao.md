# Decisão: recriar o Gestão da Pelada no padrão LJS Software

- **Data**: 2026-10-24
- **Veredito**: seguir (por decisão do usuário, sem avaliação de mercado)
- **Aprovação**: aprovado pelo usuário em 2026-10-24 (seguir para a fase 6)
- **Artefatos lidos**: analise-legado.md. Os artefatos de produto do legado (`C:\Leandro\Projetos\GestaoDaPelada\.md\PRD.md`, `PLANO-COMERCIAL.md`) entram como referência.

## Notas

| Critério | Nota | Justificativa |
|---|---|---|
| Validade do problema | adequado | O PRD do legado descreve a dor (presença, times e caixa no WhatsApp e na planilha). O app já foi construído e usado pelo usuário |
| Força das evidências | desconhecido | Não houve pesquisa de mercado, por decisão do usuário |
| Valor contra não fazer nada | adequado | Padroniza os três apps da LJS e põe o app publicado no domínio próprio, com cobrança |
| Opção de solução | forte | As regras de negócio e o layout já existem e estão testados no legado |
| Viabilidade técnica | forte | O legado já roda na mesma stack (Worker, Hono, Neon, Hyperdrive) |
| Viabilidade comercial | não avaliada | O usuário escolheu publicar com custo zero e pensar em escala só se surgirem usuários reais |
| Riscos | adequado | Ver "Restrições e riscos técnicos" |

## Decisão do usuário

O usuário escolheu construir sem pesquisa de mercado: "Vamos construir o projeto independente de pesquisa de mercado. [...] Quero ter os três apps prontos e deixar publicados. Se houver usuários reais mais a frente pensamos em escala."

Consequências aceitas:
- A demanda e o preço (R$ 9,90) não estão validados. O lançamento é técnico, sem meta comercial.

## Se seguir: entrada do MVP

- **Problema**: o organizador de pelada controla presença, times e caixa no WhatsApp e na planilha, sem registro nem equilíbrio.
- **Solução escolhida**: recriar o Gestão da Pelada do zero no padrão LJS Software (prompt do usuário), preservando as regras de negócio do domínio do legado e 100% do layout (tokens, componentes, CSS e mockup de referência). O padrão acrescenta cadastro aberto, planos Free e Pro com Asaas, e-mail, push, observabilidade e LGPD.
- **Entra**:
  - tudo o que o legado faz: grupos, admins por vínculo, jogadores e períodos, habilidades e notas, partidas e presenças, pesos com vigência, ranking público `/g/:slug`, PDF, simulador e escalação, financeiro;
  - o comum LJS: landing `/`, app em `/app`, cadastro com confirmação, recuperação por e-mail, Meu plano, termos e privacidade, exclusão de conta, push, PWA, Sentry, health, backup e deploy.
  - Decisões D1 a D8 em `analise-legado.md` §8.
- **Fica de fora**: TWA e Play Store (despriorizados no legado), plano anual, admin de vários grupos com permissões diferentes por grupo além do legado, homologação.
- **Métricas de sucesso**:
  - app publicado em `gestaodapelada.ljssoftware.com.br`;
  - suíte e CI verdes;
  - comparação visual com o mockup do legado sem divergência;
  - teste de isolamento entre grupos passando;
  - Lighthouse PWA ≥ 90;
  - assinatura de ponta a ponta no sandbox do Asaas;
  - restauração do backup testada.
- **Restrições e riscos técnicos**:
  - Custo zero: nenhuma dependência paga. Os limites atuais dos planos gratuitos (Neon, Cloudflare, Resend, Sentry, Asaas sandbox e produção) são conferidos no Design.
  - CPU de 10 ms por requisição no Worker. O simulador roda no servidor (ADR-007 do legado), e o legado previa contingência (ADR-017). O custo de CPU precisa ser medido.
  - Reaproveitar o banco atual (D5). É preciso conciliar o schema existente com `node-pg-migrate`, RLS com `FORCE` e as roles owner, app e backup_ro, sem perder o grupo de teste.
  - Sessão de 15 min de inatividade (D7): atrito no uso à beira do campo, aceito.
  - Push para quem não tem login (D3): a assinatura fica ligada ao grupo pelo slug, sem conta, e precisa de proteção contra abuso.
- **Perguntas em aberto**:
  - [A ESCLARECER: plano do grupo de teste existente (cortesia, trial ou Free)]
  - [A ESCLARECER: texto do BK-0020 herdado]
  - [A ESCLARECER: a refatoração `node24-dominio-proprio` do legado fica abandonada? Premissa: sim, substituída por esta reescrita]
