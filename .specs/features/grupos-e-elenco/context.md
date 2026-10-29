# Grupos e elenco — Decisões das áreas cinzentas

> Discussão de 2026-10-28, com o usuário, durante o Specify. Cada decisão vale para `spec.md` e para o Design.

| # | Área | Decisão | Alternativas recusadas |
|---|---|---|---|
| C1 | Quem cria grupo | Qualquer conta cria grupos (D1, que substitui o RA-01 e o RF-02 do PRD). Quem cria vira admin do grupo com acesso ao financeiro. Outros admins entram pelo convite da `conta-e-acesso` | Manter o dono da plataforma como criador (legado); pedir no formulário o e-mail de outro admin |
| C2 | Limites do plano Free (1 grupo, 20 jogadores, D2) | Ficam para a `planos-e-cobranca`. Até lá, nenhum limite de quantidade | Aplicar os dois limites já; aplicar só o de 1 grupo |
| C3 | Arquivar | Só quem criou o grupo (`grupos.criado_por`) arquiva, e só enquanto é admin dele | Qualquer admin; ninguém nesta feature |
| C4 | Reativar | Quem arquivou (o criador) reativa; tudo volta como estava e o slug continua do grupo (ADR-016) | Arquivar ser definitivo |
| C5 | Grupo arquivado | Some para os outros admins (404 nas rotas, fora da lista). O criador o vê numa seção "Arquivados" da lista de grupos, só com a ação Reativar | Todos verem em modo leitura |
| C6 | Pesos de pontuação (tela t18) | Ficam para a `partidas-e-ranking`, que é onde têm efeito | Entrar aqui junto com o grupo |
| C7 | Prévias de reativar e de alterar a data de início (acumulado, posição no ranking, rodadas que passam a constar) e o aviso de rodada que vale 0 | Ficam para a `partidas-e-ranking`, com a função única de acumulado (G-25). Aqui entram as operações e todas as validações de período, inclusive a de presença (tabela `presencas` já existe) | Portar já o acumulado e a ordem do ranking |
| C8 | Exclusão de jogador | Mantém a regra do legado: histórico = presença, nota ou pagamento mensal. O texto da tela passa a dizer "partidas, notas nem pagamentos" | Só presença e nota (deixaria `pagamentos_mes` sem destino); incluir escalações (não têm ligação com o jogador) |
| C9 | Auditoria de inativar | Inativar também é auditado (`jogador_inativado`), como as outras escritas de período (G-26) | Seguir o legado, que não auditava |
| C10 | Posições | As 7 que a linha de base já aceita: Goleiro, Zagueiro, Lateral, Volante, Meia, Atacante, Centroavante | — (fato do schema, não decisão) |
