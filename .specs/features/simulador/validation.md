# Validação: simulador — PASS ✅ (rodada 2, retrabalho da R1)

- **Data**: 2026-11-06 · **Branch**: feature/simulador @ 48c59f3d · **Árvore**: 4bf585e105b5f02fa24436294a89f02a4f20fb82 (sem `Gate:` registrado para ela: tudo repetido aqui). Escopo: `git diff 97ecbea9..HEAD` (1 commit de código) mais a regressão.
- **Critérios**: 95; os 5 com problema na R1 (SIM-57, 58, 59, 61, 85) e os tocados pelo retrabalho conferem abaixo; SIM-61 segue sem prova por decisão do usuário (T42 e T43 reabertas)
- **Gate**: lint, format:check, typecheck, `test:checagens` (134) verdes; `contrato` 571/571; `scripts` 326/326; raiz `test/` 50/50 (FUN-51 verde; 2 testes de lint estouraram 5 s sob carga na 1ª rodada, verdes no rerun); `dominio` 672/673 (GEL-70 estoura 5 s sob carga, verde isolado com timeout maior); `api` 3.625/3.628 (3 falhas de ambiente conhecidas: `push-backup` 2, `push-cpu` 1; 5 arquivos do worker estouraram hook sob carga e passam isolados, 92/92; `esquema-*` FUN-08 verde); `web` 1.060/1.062 (SIM-15 e SIM-66 estouraram 5 s, verdes isolados, 13/13); e2e `simulador.spec.ts` (J-22 a J-24) e `simulador-inicio.spec.ts`: 7/7; visual `^t1[234]-`: **36 de 36 em até 1%, 0 reprovadas** (maior diferença 0,41%)
- **Sensor**: 17 mutações em cópia isolada (junção de `node_modules`, só o teste do arquivo), 15 mortas, 2 vivas sem achado (abaixo). Cópia descartada; `git status` igual ao do início, salvo `auditoria-seguranca.md` (do auditor, em paralelo)
- **Processo**: migração `1794004229184_...sql` só `CREATE POLICY` (aditiva); `esquema-producao.txt` regerado e conferido pelos testes `esquema-*`; HEAD fecha o `typecheck` (único commit de código); nenhum teste removido, pulado ou enfraquecido (diff `-` só traz as linhas 60/61 trocadas por 40/41, o limiar e SIM-46/73/93 com as asserções originais mantidas: o corpo da escalação e o 409 continuam afirmados, só esperam o fim do recálculo); cada troca tem motivo em AD-128/129 e em `## Autorizações` de 2026-11-06; sem `teste_*` órfão; portas 8798, 8799, 8800 e 4194 livres ao fim (matei o `vite preview` órfão da R1 na 4194)
- **Isolamento**: Postgres 5452 e portas 8798/8799/8800/4194; nada na 5432, 8787 a 8790, 4174, 4184 nem em `GestaoDaPelada_v2`

## Critérios tocados pelo retrabalho

| Critério | `arquivo:linha` e asserção | Resultado |
|---|---|---|
| SIM-53, 34, 59 (AD-128) | `contrato/test/simulador.test.ts` (41 recusados, 40 aceitos), `varios-inicial.test.ts` (`montar(aptos(41))` lança), `distribuicao-varios.test.ts` (40 aptos, 20 times) | ✅ (spec ainda diz 60: vale a AD) |
| SIM-57, 58 | `orcamento.test.ts:36-37`, `pior-entrada.test.ts:104-124`: `toBeLessThan(LIMIAR_EFETIVO_MS)` = 10 (`medir.ts:41`); 3 rodadas seguidas verdes com 40 aptos sob carga | ✅ (spec ainda diz 4 ms: vale a AD) |
| SIM-28, 36 | `teto-trocas.test.ts:12,16`: `toBe(200)` | ✅ |
| SIM-79 | `escalacoes-ler.test.ts:192-193`: `porData` e `idsNaData` do grupo sem escalação dão `null` com a mesma conta em dois grupos | ✅ |
| SIM-67, 76 | `escalacao.test.ts:204,213,222`: 422 em `composicao` (2 times vazios, 3+ sem times, 3+ com time vazio); `rotas/escalacoes.test.ts:205`: 422 e a linha da data não muda | ✅ |
| SIM-69, 81 | `escalacoes-rls.test.ts:142,154`: INSERT e UPDATE com `confirmada_por` da conta B dão `42501`; upsert com a própria conta passa (`:156-169`); e2e J-22 confirma com 201 | ✅ |
| SIM-14 | `simulador-previa.test.tsx:85-93`: data `""` e botão `disabled` | ✅ |
| SIM-37 | `avaliar.test.ts:185,197`: `incompleto: 0` e `incompleto: 5` depois de mover | ✅ |
| SIM-64, 46 (AD-129) | `simulador-mover.test.tsx:174`: `confirmar().disabled` é `true` durante o recálculo e volta a `false`; `previas-chave.test.tsx:28-40`: primeiro render da chave nova é `calculando` | ✅ |
| SIM-82 | `indicadores-varios.test.ts:46-50`: `idadeMedia` nula com um só ano | ✅ |
| SIM-85 | visual: 36 de 36 em até 1% (limite de `visual.mjs` intacto; `telas.json` só mudou os estados T12/T13 do simulador) | ✅ |

## Achados

| ID | `arquivo:linha` | Verificação | Criticidade | Situação |
|---|---|---|---|---|
| A-01 | `medir.ts:41`, `varios-inicial.ts:12`, `contrato/simulador.ts:12` | 40 aptos e limiar de 10 ms (AD-128); títulos dizem 10 ms; M8a e M8b mortos | crítica | fechado |
| A-02 | `escalacoes-ler.test.ts:185-200` | M2 (sem `.where('grupo_id')` em `porData`) reprova 1 teste | crítica | fechado |
| A-03 | `teto-trocas.test.ts:12,16` | M1 e M1b (`200` vira `20`) mortos | crítica | fechado |
| A-04 | `telas.json`, `AcoesResultado.tsx:68-73` | visual 0 reprovadas; AD-129/130 conferidas; M5 (tirar `disabled`) morto | crítica | fechado |
| A-05 | `tasks.md` T42 e T43 | reabertas com a pendência escrita; aceita pelo usuário (SIM-61 e dump seguem sem prova) | crítica | fechado (pendência aceita) |
| A-06 | `README.md` | `test/readme.test.ts` (FUN-51) verde | comum | fechado |
| A-07 | histórico | aceito na AD-131(a); HEAD fecha o typecheck | crítica | fechado (aceito) |
| A-08 | `partidas.ts:54`, `escalacoes-rls.test.ts:5-21`, `spec.md:273` | comentários e nota da spec atualizados | comum | fechado |
| A-09 | `PaginaSimulador.tsx:255` | M10 morto | comum | fechado |
| A-10 | `avaliar.ts:88-95,119-123` | M7 (`times.length - 1`) morto; sem teste de tela nem de rota do `incompleto` movido (só domínio) | comum | fechado |
| A-11 | `escalacao.ts:21-37` | M4a a M4d mortos, um por ramo | crítica | fechado |
| A-12 | `previas.ts:36-80` | M9 morto | comum | fechado |
| A-13 | `indicadores-varios.ts:38` | M6 (`>= 1`) morto | comum | fechado |
| A-14 | `1794004229184_...sql:8-11` | M3 (`WITH CHECK (true)`) reprova INSERT e UPDATE; matriz política × comando intacta | crítica | fechado |
| A-15, A-16 | `1792844700000_eventos-uso.sql:61`, `corpo.ts:29-37` | dívida aceita (AD-131 b, c) | comum | fechado (aceito) |
| A-17 | `varios-inicial.ts:38` ("acima de 60"), `pior-entrada.test.ts:20,22` e `distribuicao-varios.ts:106` ("4 ms"), `escalacao.ts:21` | comentários de limite velhos depois da AD-128; a mensagem "em cada time" vale só para 3+ (em 2 times o teste `escalacao.test.ts:225` aceita time vazio se houver "não entra", coerente com SIM-75). Só texto, não bloqueia. Fechado depois da R2: comentários e mensagem de `escalacao.ts` atualizados; guarda de idade também em `indicadores-dois.ts` (SEC-001) com teste; resíduos de SEC-001/SEC-002 aceitos na AD-131 (d) | comum | fechado |

## Lacunas e o que não foi validado

- Mutantes vivos: M1c (`maxTrocas = 20` no parâmetro padrão: o teto de 200 só é provado como constante e, por injeção, como mecanismo, SIM-92; nenhuma entrada dos testes chega a 20 trocas) e M7b (empate entre dois times incompletos: a spec não define a regra, lacuna de precisão; o código fica com o último). M7c (`<= n`) é equivalente: sempre há um time abaixo de N.
- Aparência: o recorte de `t13-recalculando` trocou `.barra-acao` por `.cartao-time` (AD-130); o botão desabilitado fica provado só pelo teste de tela (M5), não pela comparação visual.
- Não validado, por decisão do usuário: SIM-61 (prévia publicada) e o ensaio sobre o dump (T42, T43); esperado do legado (SIM-52, fora da worktree, não reconferido).
- Falhas de ambiente com causa verificada, sem achado: `push-backup` (`pg_dump` 16 contra servidor 18) e `push-cpu` (relógio do Windows em passos de 15,6 ms).
