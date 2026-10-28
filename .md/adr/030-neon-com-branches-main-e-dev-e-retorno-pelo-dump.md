# ADR-030: Neon com duas branches permanentes (`main` e `dev`) e retorno pelo dump cifrado

- **Status:** Accepted (padronização do Neon entre os projetos)
- **Data:** 2026-10-28
- **Decisores:** usuário
- **Requisitos:** FUN-40, FUN-43
- **Supersedes:** os trechos sobre branch do Neon antes da migração do ADR-011 (decisão 2 e a consequência "o branch antes da migração dá volta atrás em segundos"), do ADR-014 (passo 1 do deploy, "cria um branch de restauração no Neon", e a volta atrás "mais a restauração do branch"), do ADR-020 e do ADR-028 (a branch de restauração como proteção), do ADR-023 (volta atrás "restaurar o branch do Neon") e do ADR-024 (decisão 6, "depois do dump cifrado e da branch de restauração"). O resto desses ADRs continua valendo.

## Contexto

O `deploy.yml` criava, a cada execução, uma branch `restauracao-producao-<run_id>` no Neon a partir da branch `production`, pela API do Neon (`NEON_API_KEY`, `NEON_PROJECT_ID`), e apagava as antigas para ficar com as 2 mais novas. Os projetos irmãos usam o Neon de formas diferentes, e o usuário decidiu um padrão único: poucas branches, com papel fixo, e um ponto de retorno que não depende da API do Neon.

## Decisão

1. O projeto do Neon tem **só duas branches permanentes**: **`main`** (produção, branch padrão) e **`dev`** (desenvolvimento e ensaios, filha da `main`). Não há branch por PR, por deploy nem de restauração.
2. O `deploy.yml` **não chama a API do Neon**. O passo da branch de restauração sai, assim como os scripts `restauracao-neon.ts` e `restauracao-neon-cli.ts` e os secrets `NEON_API_KEY` e `NEON_PROJECT_ID`.
3. O **ponto de retorno antes de migrar é só o dump cifrado com `age`** (`dump-predeploy-<run_id>`, ADR-011), que continua obrigatório e vem antes da migração.
4. A restauração (runbook, seções 3 e 4) vai para a `dev` ou para um banco local, nunca para a `main`. Em emergência, com confirmação específica, a origem do Hyperdrive pode apontar para a `dev` restaurada.
5. A branch de produção do Neon se chama `main`. O projeto chamava essa branch de `production`: a troca de nome é uma ação manual no console do Neon.

## Consequências

**Positivas**

- Menos peças no deploy: sem token do Neon no GitHub, sem limpeza de branches e sem depender do limite de branches do plano gratuito.
- O mesmo padrão nos projetos irmãos.

**Negativas**

- A volta atrás deixa de ser instantânea: restaurar o dump leva minutos, contra segundos de uma branch. Para os dados deste projeto (poucos MB), o custo é aceito.
- A `dev` é uma só: um ensaio de restauração sobrescreve o que houver nela.

## Alternativas consideradas

1. **Manter a branch de restauração por deploy.** Descartada pelo padrão decidido pelo usuário.
2. **Usar o histórico (point-in-time) do Neon como retorno.** Fica como recurso extra do console, sem automação: a janela do plano gratuito é curta e a restauração cria uma branch a mais.
