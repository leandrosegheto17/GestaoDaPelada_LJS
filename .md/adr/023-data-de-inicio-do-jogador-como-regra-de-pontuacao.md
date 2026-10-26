# ADR-023: Data de início do jogador como regra de pontuação, separada do início do primeiro período

- **Status:** Accepted (demanda "Data de início do jogador"; decisão do Coordenador dentro de RF-69 a RF-74, RN-25 a RN-29)
- **Data:** 2026-10-20
- **Decisores:** Coordenador (chapéu Software Architect); P-33 a P-41 decididas pelo usuário
- **Requisitos:** RF-69 a RF-74, RN-25 a RN-29, RNF-12, RNF-13; I-49; ADR-006, ADR-011, ADR-021

## Contexto

O PRD-TECNICO deixou como premissa técnica (I-49): "a data de entrada do cadastro e o início do primeiro período são o mesmo dado, ou ficam alinhados?". Verificado no código (2026-10-20): **não existe coluna de data de entrada**. `dataEntrada` do contrato (`elenco.ts`) é gravada como `periodos_ativos.inicio` do primeiro período (`jogadores.ts`, `criar`/`editar`); a T16 mostra `situacao.desde`. A edição atual (`editar-jogador.ts`) move esse início e **recusa** se há presença anterior à nova data (L-11).

Isso serve para "voltar a entrada para trás", mas **não** para a nova regra: ao avançar S (zerar o Kim), o jogador precisa continuar aparecendo nas partidas e nas rodadas antigas (as presenças existem), e só a **pontuação** deixa de contar. Mover o início do período faria o jogador sumir das partidas antigas e quebraria a regra de períodos (RN-06).

## Decisão

1. **Resposta à I-49:** são o mesmo dado **na criação**, mas passam a ser dois dados **alinhados por invariante**. Nova coluna `jogadores.inicio_pontuacao date` (S). Invariante: `inicio do 1º período <= S`. Avançar S não mexe nos períodos; recuar S antes do início do 1º período move esse início para S (RF-71). Reativar não mexe em S (RN-29).
2. **Domínio, um lugar só (RF-73, G-05):** `@pelada/dominio` ganha o acumulado por data de início (função única que `ranking`, `pdf/projecao`, `simulador/prioridade` e `scripts/importar-legado/calculo` chamam), no lugar de cada um chamar `acumuladoComInicial`. Entrada: S, pontuação inicial, presenças (com a primeira presença de todo o histórico), pesos, referência. A pontuação inicial conta se S <= primeira presença (ou não há presença). Rodadas com data < S saem como `fora` (o "–" que o contrato já tem), sem número e sem falta.
3. **Edição só por rota própria, com prévia:** `POST /api/grupos/:g/jogadores/:id/inicio/previa` (calcula acumulado e posição antes/depois e rodadas que passam a constar, sem gravar) e `PUT /api/grupos/:g/jogadores/:id/inicio` (grava, ajusta o 1º período se recuou, audita, numa transação). A edição genérica do cadastro **deixa de aceitar** `dataEntrada` (a criação continua aceitando: S = início do 1º período). Mesma data = nenhuma gravação. Validação: data de calendário, <= hoje SP (RN-26), e S não pode passar do fim do 1º período, se este estiver encerrado (períodos encerrados não mudam).
4. **Auditoria** em `auditoria` (sem tabela nova): ação `jogador_inicio_alterado`, resumo com data anterior, nova, acumulado antes e depois. Leitura só por admin do grupo; fora da projeção pública e do PDF (G-10).
5. **Implantação sem regressão (RNF-13), aditiva:** a migração adiciona `inicio_pontuacao` (anulável), preenche com `LEAST(início do 1º período, data da primeira presença)` e, só para quem tinha presença anterior ao 1º período (o Vandré), move o início do 1º período para essa data. Com isso nenhum acumulado muda no instante do deploy. O `backend/scripts/verificar-inicio.ts` (somente leitura, conexão só por `DATABASE_URL`, G-21) lista por jogador o acumulado atual × pela regra nova × primeira presença; roda **antes** (dry-run contra produção) e **depois** do deploy, e qualquer diferença bloqueia o uso da edição até decisão do usuário. Leitura do código trata `NULL` como "início do 1º período" até uma migração de contração num deploy seguinte (expandir → publicar → contrair).
6. **Volta atrás:** `wrangler rollback` + restaurar o branch do Neon (ADR-011); a coluna nova é ignorada pelo código antigo.

## Consequências

**Positivas:** nada é apagado; avançar zera e recuar devolve com uma fórmula só; ranking, PDF, simulador e importação não divergem; sem tela, rota ou tabela de auditoria nova além das duas rotas.

**Negativas:** um campo novo em `jogadores` e uma invariante a manter (testada); `dataEntrada` sai da edição genérica (mudança de contrato, com o front no mesmo deploy); a migração toca dados de períodos de quem tinha presença anterior ao 1º período (hoje só o Vandré).

## Alternativas consideradas

1. **Mover o início do 1º período para zerar.** Faria o jogador sumir das partidas antigas e quebra RN-06. Descartada.
2. **Campo de "corte" à parte (S2), além da entrada.** O usuário decidiu um campo só (P-35). Descartada.
3. **Guardar o acumulado "escondido" ao avançar.** Estado extra a sincronizar; a regra derivada das partidas dispensa isso (RN-25). Descartada.
4. **Ligar a regra por flag depois da verificação.** Complexidade permanente para um uso único; a migração que alinha S já mantém o resultado idêntico. Descartada.
