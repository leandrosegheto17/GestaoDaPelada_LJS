# ADR-021: Importação do histórico legado por script de operação, em transação única, só depois do deploy da etapa 1

- **Status:** Accepted (demanda "Adequação ao legado"; decisão do Coordenador dentro do RF-65 a RF-68)
- **Data:** 2026-10-19
- **Decisores:** Coordenador (chapéu Software Architect); o usuário executa em produção
- **Requisitos:** RF-65 a RF-68, RN-22 a RN-24, RNF-06, RNF-07, RNF-12; G-21; ADR-005, ADR-006, ADR-013

## Contexto

O grupo real tem 57 jogadores e 231 rodadas desde 03/04/2022 num app antigo. É uma carga única, de 1 grupo, que precisa dar o mesmo total de cada jogador (menos os "ajustes manuais", que não entram). Não há rota nem tela: uma tela de importação seria superfície de ataque permanente para uma operação que roda uma vez.

## Decisão

1. **Script de operação** `backend/scripts/importar-legado.ts` (componente C9), com `--dry-run` e execução real. Segue o padrão do `dono.ts`: conexão **só** pela variável de ambiente `DATABASE_URL` do operador, passando por `exigirHostPermitido` (trava de host); nenhuma credencial em arquivo, argumento ou documento (G-21).
2. **Reuso, sem SQL próprio:** o script usa os repositórios de `@pelada/api` (jogadores, períodos, habilidades e notas, pesos, partidas, auditoria) e o `@pelada/dominio` (pontuação, ranking). O cálculo do dry-run e o da execução real são **o mesmo código**; só a gravação muda.
3. **Transação única** (`emTransacao`): qualquer falha desfaz tudo. **Idempotência por recusa:** grupo alvo com qualquer partida ou algum apelido do arquivo recusa a execução real. Exige a confirmação digitada de que há backup recente (RNF-07) e que a etapa 1 já está em produção (o script confere as colunas novas no banco e recusa se faltarem).
4. **Configuração do legado (RN-24):** como o grupo ainda não tem partidas, o script substitui a(s) configuração(ões) de pesos existentes pela do legado, com vigência retroativa a 03/04/2022 e auditoria (autor "infraestrutura"). É a única exceção à regra "vigência nunca no passado" (RN-04), e vale só dentro do script; a API continua recusando data no passado.
5. **Privacidade:** o script não lê nem grava telefone; do nascimento guarda só o ano; o log persistente tem só contagens e o número da linha. Apelidos só aparecem no terminal do operador.
6. **Ordem:** (a) deploy da etapa 1 (pontuação inicial, 6 posições, 6 pesos); (b) `--dry-run` sem erro; (c) backup confirmado; (d) execução real. A execução em produção é do usuário, nunca de agente.

## Consequências

**Positivas:** sem rota nova nem permissão nova; a carga usa as mesmas regras e a mesma integridade do app; o dry-run prova a diferença contra o "Atual" do arquivo antes de gravar.

**Negativas:** o script depende da forma dos repositórios (mudança neles pode quebrá-lo; coberto por teste com banco do Docker). Se a execução real falhar no meio, nada é gravado, mas a rodada inteira precisa ser repetida.

## Alternativas consideradas

1. **Tela de importação para o admin.** Superfície permanente para uma carga única, com upload de arquivo com dado pessoal. Descartada.
2. **SQL direto no console do Neon.** Duplicaria as regras (pontos, períodos, auditoria) e não teria dry-run. Descartada.
3. **Aceitar nulo para ano e posição dos 17 inativos.** O contrato (`jogadorDetalhe`, lista) exige os dois campos; afrouxar mudaria a resposta da API e as telas por um caso transitório. Descartada: usar 1970 e Meia, só nesses jogadores (I-47), sem efeito em regra.
