# As 8 fases do projeto novo

Princípio: **reduzir incerteza o mais barato possível antes de gastar com construção**. Não é uma cascata: é um funil com laços. Toda fase pode terminar em "parar", e isso é um resultado válido.

O fluxo vai até o planejamento. O que vem depois (infraestrutura, construção, validação, lançamento, operação) é dos comandos `/preparar`, `/executar`, `/validar` e `/finalizar`; ver "Depois do fluxo".

| # | Fase | Pergunta | Saída | Critério de passagem | Modelo da sessão |
|---|---|---|---|---|---|
| 1 | Ideia | Qual problema, para quem, e por que agora? | `ideia.md` | A ideia está registrada com hipóteses e dúvidas; vale investigar | Opus |
| 2 | Discovery | O problema é real e dói o bastante? | `pesquisa.md`, `problema.md` | Problema confirmado por evidência, com métricas e custo de não fazer nada | Opus |
| 3 | Solução e valor | Qual a menor solução que alguém usaria ou pagaria? | `solucao.md` | Há uma opção recomendada (ou a recomendação é não seguir) | Opus |
| 4 | Viabilidade técnica | Dá para construir, com que risco? | `viabilidade-tecnica.md` | Veredito viável ou viável com riscos mitigados | Opus |
| 5 | Viabilidade de negócio (opcional) | Os números fecham? | `plano-comercial.md` | Veredito explícito; se não fecha, o usuário decide seguir ou não | Opus |
| — | Decisão | Seguir, esclarecer ou matar? | `decisao.md` | Veredito `seguir` com entrada do MVP | Opus |
| 6 | Definição do MVP | O que entra, o que fica de fora, como saber se deu certo? | `features/<mvp>/spec.md` | Spec aprovada e aceita pelo `validate_spec.py` | Opus |
| 6b | Roteiro (só se o escopo não cabe em uma feature) | Quais features, em que ordem e de que tamanho? | `.specs/projeto/roadmap.md`, decisão `AD-NNN` em `STATE.md` | Features fatiadas na vertical, com ordem e requisitos aprovados; só a primeira segue para o Desenho | Opus |
| 7 | Desenho | Como será estruturado e como vai parecer? | `design.md`; com interface, `.specs/mockup/` (direção, `tokens.css`, guia, 2 a 3 telas-chave) | Arquitetura e decisões aprovadas; com interface, guia de estilo e telas-chave aprovados na galeria | Opus |
| 8 | Quebra em tarefas e lotes | Como o trabalho se divide em passos pequenos e verificáveis? | `tasks.md` (tarefas e lotes); `.specs/projeto/jornadas.md` | Tarefas aceitas pelo `validate_tasks.py`; jornadas derivadas da spec e do roteiro. **Sem aprovação**: termina com "O plano está disponível para execução." | Opus |

## Jornadas do E2E geral (`.specs/projeto/jornadas.md`)

Gravado na fase 8, junto com o `tasks.md`; o `/finalizar` o executa no staging (ou local) depois que todas as features estiverem validadas e integradas. As jornadas nascem da spec e do roteiro, não do código. Próxima feature do roteiro: acrescente ou ajuste as jornadas que ela cria.

```markdown
# Jornadas: <projeto>

- **Base**: <spec.md, roadmap.md>, em <AAAA-MM-DD>

## J-01 — <nome da jornada>
- **Quem**: <papel do usuário>
- **Passos**: 1. <ação> · 2. <ação> · 3. <ação>
- **Resultado esperado**: <o que o usuário vê ou o dado que fica gravado>
- **Requisitos que atravessa**: FUN-01, FUN-04
```

## Depois do fluxo

| Antes (desenho antigo) | Agora |
|---|---|
| 8 Preparação: repositório, ambiente, esqueleto, CI | `/preparar` (Nível 1, necessário antes do `/executar`) |
| 8 Preparação: staging, produção, segredos, backup | `/preparar` (Nível 2, até o fim da execução) |
| 9 Construção | `/executar` (uma worktree por feature, sem subagentes) |
| 10 Validação (verificador, revisão, segurança) | `/validar` (por feature, com lote de retrabalho) |
| 11 Lançamento | `/finalizar` (antes dele, o E2E geral das jornadas) |
| 12 Operação e aprendizado | `/finalizar` (métricas do MVP, feedback, decisão de persistir, pivotar ou encerrar) |

## Laços comuns

- Viabilidade técnica inviável → volta à fase 3 (outra opção de solução).
- Plano comercial não fecha → ajustar preço, canal ou escopo (fases 3 ou 5), ou parar.
- Decisão `esclarecer` → a fase indicada em `decisao.md`.
- Validação pendente marcada como condição (tabela em `decisao.md`) → bloqueia o planejamento concluído (condição de construção) ou o lançamento no `/finalizar` (condição de lançamento) até ser concluída, ter a condição mudada pelo usuário ou o projeto parar.
- Mudança de aparência desejada depois do mockup → começa no mockup (fase 7), depois vira tarefa.
- Falha de verificação, achado de segurança ou diferença visual rejeitada → não voltam a este fluxo: o `/validar` gera o lote de retrabalho para o `/executar`.

## Princípios

- Discovery e solução vêm antes de qualquer especificação.
- Protótipos e spikes entram cedo, porque são o jeito mais barato de dissolver incerteza.
- Esqueleto ponta a ponta já no `/preparar`, para o pipeline nunca ser surpresa.
- Construção por fatias que entregam valor, não por camadas técnicas.
- Métricas e critério de parada nascem no MVP.
- Segurança, legal e dados percorrem desde a fase 4 até o lançamento.
- A operação e o aprendizado (no `/finalizar`) realimentam a fase 1.
