# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Prove a policy de escrita de RLS com UPDATE e DELETE sem WHERE, pois com WHERE a policy de SELECT mascara uma policy de escrita aberta
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `rls` · harmful: 0
- features: conta-e-acesso
- evidence: M17,M18 backend/api/test/isolamento/contas.test.ts:84 (rls)
- last seen: 2026-10-27T17:34:20Z

### L-002 - Teste de intervalo de tempo exercita os dois lados da borda, não só o instante zero e um valor folgado acima do limite
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tempo` · harmful: 0
- features: conta-e-acesso
- evidence: M26 backend/api/test/migracoes/conta-cadastro-e-links.test.ts:152 (tempo)
- last seen: 2026-10-27T17:34:21Z

### L-003 - Teste a ligação entre o evento do cliente e a navegação de destino, não só cada lado isolado com o valor escrito à mão
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend` · harmful: 0
- features: conta-e-acesso
- evidence: ACE-20 frontend/web/src/app/App.tsx:10 (frontend)
- last seen: 2026-10-27T17:34:21Z

### L-004 - Confira que toda tela citada no critério de comparação visual está na lista de telas comparadas
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `visual` · harmful: 0
- features: conta-e-acesso
- evidence: ACE-54 frontend/web/e2e/telas-ativas.txt (visual)
- last seen: 2026-10-27T17:34:21Z

### L-005 - Especifique valor e formato de versão e data de texto legal e o ambiente em que a checagem de acessibilidade vale
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: conta-e-acesso
- evidence: ACE-58 ACE-60 ACE-56 (spec)
- last seen: 2026-10-27T17:34:21Z

### L-006 - Teste de rota que grava dado exigido pela spec (versão dos termos aceitos) confere o valor gravado no banco, não só o status 201 da resposta
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: conta-e-acesso
- evidence: N7/N16 backend/api/src/entrada/rotas/conta-cadastro.ts:27 e convites.ts:46 (ACE-01, ACE-58) (routes)
- last seen: 2026-10-27T19:32:05Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
