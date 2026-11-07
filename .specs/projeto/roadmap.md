# Roadmap

Roteiro aprovado em 2026-11-03 (decisão AD-001 em `.specs/STATE.md`). Entrada: `.specs/produto/necessidade.md`. Referência: roteiro do `GestaoDaPelada_LJS` (`.specs/projeto/roadmap.md`), mesma quebra e ordem. Os IDs de requisito nascem na spec de cada feature, com o prefixo indicado.

| # | Feature | Situação | Tamanho | Depende de | Requisitos | Entrega (o que o usuário vê) |
|---|---|---|---|---|---|---|
| 1 | `fundacao` | Concluída (validada e integrada em 2026-11-06 com pendências: R2-T1 em 2026-11-07, contagem do backup e privilégios na produção, ruleset da `main` e Dependabot; AD-014 segue aberta até o `/finalizar`) | G | n/a | FUN-* | App no ar local e na branch `dev` do Neon sobre o schema atual do banco (linha de base da main do LJS), CI verde, backup cifrado e restauração testados, `/api/health` respondendo |
| 2 | `conta-e-acesso` | Não começada | G | 1 | ACE-* | Cadastro com confirmação por e-mail, entrar, sair, recuperar e trocar senha, convite de admin, exclusão de conta, termos e privacidade, entrando com a conta que já existe no banco |
| 3 | `grupos-e-elenco` | Não começada | G | 2 | GRU-* | Criar e arquivar grupo, admins, jogadores com períodos, habilidades e notas, painel do dono, vendo o grupo de teste que já existe |
| 4 | `partidas-e-ranking` | Não começada | G | 3 | PAR-* | Lançar partida com presença e chuva, pesos com vigência, ranking com desempate, ranking público `/g/:slug` e PDF |
| 5 | `simulador` | Concluída (validada e integrada em 2026-11-06; T42 e T43 pendentes até o `/finalizar`) | M | 4 | SIM-* | Sortear times (2 ou N) pela prioridade do ranking e confirmar a escalação, dentro do limite de CPU do Worker |
| 6 | `financeiro` | Concluída (validada e integrada em 2026-11-06) | M | 3 | FIN-* | Marcar mensalidades, lançar entradas e saídas, ver o saldo e quem não pagou |
| 7 | `planos-e-cobranca` | Concluída | G | 4, 5, 6 | PLA-* | Landing em `/` com os planos (AD-023), Free e Pro com trial de 14 dias, assinatura pelo Asaas (sandbox), Meu plano, cortesia Pro do grupo de teste, excedente somente leitura ao cair para Free |
| 8 | `notificacoes` | Não começada | M | 4, 7 | NOT-* | Push de ranking atualizado pelo link público e avisos de cobrança ao organizador |
