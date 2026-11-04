# Medição de execução

Para comparar execuções (teste de velocidade) ou achar onde o tempo vai. Só quando o usuário pedir ou o trabalho for um teste de velocidade; fora disso não se mede.

## O que registrar, por lote

Em `lotes.md` (local, fora do git, ou na pasta que o usuário indicar), uma linha por lote, em minutos, com o relógio do `date -Iseconds`:

| Campo | Significado |
|---|---|
| Lote, tipo, modelo | número, criticidade (comum ou crítico) e modelo realmente usado (o indicado pode não ter sido trocado) |
| Início, fim | horário; pausa por limite de uso não conta e é anotada |
| Leitura/prep | ler tasks, design e origem de reuso |
| Escrita | testes e código |
| Retrabalho | tempo refazendo por erro de ambiente, lint, teste ou assinatura; separado da escrita |
| Vermelho | rodada do teste antes do código (só lote crítico) |
| Gate | comandos do lote |
| Commits e fechamento | commits de grupo, marcação e `Gate:` |

No `/validar` e ao fim, some o **gate completo** e o **verificador** em linhas próprias (são tempo de relógio do processo, mas não do lote).

## Métricas finais (`metricas.md`)

Tempo ativo total e por lote; modelo e tipo por lote; nº de commits; linhas de código e de teste (fora lock, `.specs` e a pasta de resultados); testes por suíte; se o último commit de cada lote fecha verde; achados do verificador por gravidade; mutações (derivadas pelo verificador, **nunca passadas a quem constrói**): mortas, sobreviventes, equivalentes; tokens e `/cost` como o Claude Code mostrou (sem estimar).

`medir-lotes.py` mede só os subagentes (o `verificador` e o `auditor-seguranca` do `/validar`). O `/executar` roda na sessão principal e não tem subagente: o contexto ao fechar cada lote vem do `contexto.py`, e o tempo, do `lotes.md` e do `git log`.
