# Modelo de `.specs/preparacao.md`

Os títulos `## Nível 1` e `## Nível 2` e as caixas `- [ ]` / `- [x]` são lidos por `.claude/scripts/preparacao.py`: mantenha o formato.

```markdown
# Preparação: <projeto>

- **Data**: <AAAA-MM-DD> · **Destino**: <local com Docker | nuvem gratuita (serviço) | staging e produção (serviço)>
- **Base**: <necessidade.md | decisao.md | design.md>

## Nível 1 — síncrono (necessário para /executar)

- [x] Repositório e remoto — <branch base, remoto>; evidência: `git remote -v`
- [x] Ambiente local — `docker compose up -d` sobe <serviços>; evidência: <saída>
- [ ] Esqueleto ponta a ponta — <o que roda>
- [ ] Comando de teste — `.specs/projeto/testes.json`
- [ ] CI — <pipeline>; uma execução verde: <link>
- [ ] Pré-voo — `preparar-ambiente.py` sem pendência
- [ ] Hook de commit — `commit-msg` instalado

## Nível 2 — assíncrono (até o fim da execução)

- [ ] Staging — <serviço, endereço>
- [ ] Produção — <serviço, endereço>
- [ ] Segredos dos ambientes — <onde ficam; nunca no repositório>
- [ ] Backup e restauração testada — <frequência, onde, data do teste>
- [ ] Observabilidade — <logs, alertas>
- [ ] Pipeline de deploy — <comando ou pipeline>; reversão testada

## Fora do escopo deste projeto

- <item removido> — <motivo>
```
