# As 5 fases do uso próprio

Princípio: **isso vale o meu tempo e funciona na minha infraestrutura, com custo zero?** Toda fase pode terminar em "parar", e isso é válido.

O fluxo vai até o planejamento. O que vem depois (infraestrutura, construção, validação, implantação, manutenção) é dos comandos `/preparar`, `/executar`, `/validar` e `/finalizar`; ver "Depois do fluxo".

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo |
|---|---|---|---|---|---|
| 1 | Necessidade | Que dor isso resolve? Já existe algo pronto? | `necessidade.md` §1 e §2 | Necessidade clara; alternativas prontas avaliadas | Opus |
| 2 | Escopo pessoal | O que é o essencial para eu usar de verdade? | `necessidade.md` §3 | Lista curta e critério de "bom o bastante" | Opus |
| 3 | Restrições e viabilidade | Onde roda, quanto custa, e os dados? | `necessidade.md` §4 a §6, veredito | Cabe no ambiente e no custo zero; backup definido; veredito `construir` | Opus |
| 3b | Roteiro (só se o escopo não cabe em uma feature) | Quais features, em que ordem? | `.specs/projeto/roadmap.md` | Features fatiadas na vertical e aprovadas; só a primeira segue | Opus |
| 4 | Desenho enxuto | Qual a estrutura mais simples que serve? | `features/<app>/spec.md` (e `design.md`, se precisar) | Spec aprovada, com backup, restauração e (se na internet) autenticação e HTTPS como critérios | Opus |
| 5 | Quebra em tarefas e lotes | Como o trabalho se divide em passos pequenos e verificáveis? | `tasks.md` (tarefas e lotes); `.specs/projeto/jornadas.md` | Tarefas aceitas pelo `validate_tasks.py`; jornadas derivadas da spec. **Sem aprovação**: termina com "O plano está disponível para execução." | Opus |

## Depois do fluxo

| Antes (desenho antigo) | Agora |
|---|---|
| 5 Preparação: ambiente Docker, esqueleto, scripts de backup e restauração | `/preparar` (Nível 1, necessário antes do `/executar`; backup e restauração testada no Nível 2) |
| 6 Construção | `/executar` (uma worktree por feature, sem subagentes) |
| 7 Validação (verificador, restauração a partir de cópia limpa, segurança se na internet) | `/validar` (por feature, com lote de retrabalho) |
| 8 Implantação | `/finalizar` (antes dele, o E2E geral das jornadas; publicar na nuvem exige confirmação específica) |
| 9 Uso e manutenção | `/finalizar` abre a operação; a revisão periódica segue o checklist abaixo |

## Checklist da revisão periódica

Sugira fazer a cada 1 a 3 meses, ou quando o usuário voltar ao projeto (o `/finalizar` registra a primeira revisão em `.specs/operacao.md`):

- [ ] **Ainda uso?** Se não usou no último período, considerar aposentar.
- [ ] **Backup:** rodou dentro do esperado? Restaurar um backup recente numa cópia limpa.
- [ ] **Dependências:** há atualização de segurança? (`npm audit`, `pip-audit` ou equivalente)
- [ ] **Plano gratuito** (nuvem): os limites mudaram? O projeto está perto de algum limite ou corre risco de ser pausado ou apagado?
- [ ] **Exposição:** continua só na rede local, ou passou a ser acessada pela internet?
- [ ] **Decisão:** manter, evoluir (vira feature, fluxo 3, ou volta à fase 4) ou aposentar.

**Aposentar:** exportar os dados num formato aberto, parar e remover o serviço, registrar em `.specs/operacao.md` onde ficou a exportação.

## Laços comuns

- Algo pronto resolve → encerrar com veredito `adaptar algo pronto`.
- Restrição de infraestrutura impede (plano gratuito pequeno demais) → rever escopo (fase 2) ou destino (fase 3).
- Restauração do backup falhou na validação → o `/validar` gera o lote de retrabalho para o `/executar`; não implantar.
