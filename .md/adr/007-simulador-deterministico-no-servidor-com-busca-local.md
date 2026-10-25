# ADR-007: Simulador determinístico no servidor, com busca local de ordem fixa; ajuste manual reavaliado pela API

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-38 a RF-48, RN-08, RN-09A, RN-09B, RN-10A, RN-10B, RN-11, RN-12, RNF-03

## Contexto

O simulador tem dois formatos. No formato de 2 times, a classificação e as substituições seguem regras fixas pela ordem do ranking (RN-09A), e a distribuição entre os times segue um objetivo lexicográfico (RN-10A). No formato de 3 ou mais times, há uma composição fixa (RN-09B) e o equilíbrio é feito por média de nível e de idade (RN-10B).

O resultado precisa ser **determinístico**: as mesmas entradas geram a mesma sugestão (RF-44). Com 30 aptos, a sugestão deve sair em até 2 s (RNF-03). Depois de um ajuste manual, os indicadores, os pares "sai → entra" e os avisos precisam ser recalculados **sem refazer a sugestão** (RF-46). A convenção do ambiente proíbe recalcular regra de negócio na tela (CONVENCOES §2).

## Decisão

1. **O cálculo mora em `@pelada/dominio/simulador`.** A API expõe duas operações:
   - `POST /api/grupos/:g/simulador/sugerir`: entradas (data, formato, N, K, aptos, "só 1º tempo") → sugestão completa;
   - `POST /api/grupos/:g/simulador/avaliar`: entradas mais a composição atual (times, reservas, "não entra") → indicadores, pares "sai → entra" e avisos.
   A escalação só é gravada ao confirmar (`POST .../escalacoes`).
2. **Formato 2 times:**
   - as etapas fixas da RN-09A (titulares, reservas que entram, "não entra") são aplicadas por regra, sem busca;
   - a distribuição entre os times usa **busca local determinística**:
     - solução inicial em "serpentina" pela ordem de prioridade;
     - depois, trocas de pares entre os times, avaliadas numa ordem fixa (índices crescentes);
     - aceita a primeira troca que melhora o objetivo lexicográfico (regra rígida 1, depois 2, depois 3, depois 4 da RN-10A);
     - para quando nenhuma troca melhora ou ao atingir um teto de iterações.
   - Quem sai no intervalo é derivado por regra (RN-09A item 3) a cada avaliação.
3. **Formato 3 ou mais times:** mesma técnica. O objetivo é a diferença entre a maior e a menor média de nível, depois entre a maior e a menor idade média (RN-10B). A composição tem os tamanhos da RN-09B, e todos os aptos são candidatos ao time incompleto.
4. **Determinismo:**
   - sem `Math.random` e sem dependência da ordem de chegada dos dados;
   - os aptos são ordenados de forma canônica (por prioridade e, no formato 3+, por id) antes da busca;
   - comparações numéricas são feitas em inteiros (nível × 100, idade em anos) para não haver diferença de ponto flutuante.
5. **Prévia das entradas:** o número de times, a composição prevista ("5 times de 4 + 1 time de 2") e o bloqueio por aptos insuficientes (RF-39, RF-40) vêm de `POST .../simulador/previa`, uma operação barata, sem busca, chamada com debounce enquanto o admin marca os aptos. A tela não faz essa conta.
6. **Ajuste manual na tela:** a tela move os jogadores (estado local de apresentação) e chama `avaliar`, com debounce de 300 ms. Enquanto a resposta não chega, os indicadores aparecem como "recalculando". A tela não calcula nível, soma nem pares.

## Consequências

**Positivas**
- Uma implementação só, testada no domínio com casos fixos (a mesma entrada dá o mesmo resultado) e propriedades (composição válida, N titulares, diferença de substituições ≤ 1 sempre que possível).
- O desempenho sobra: 30 aptos com trocas de pares dão menos de 500 comparações por passada, bem abaixo de 100 ms.
- O "Refazer sugestão" é só chamar `sugerir` de novo.

**Negativas**
- **A busca local não garante o ótimo global.** A sugestão é "boa e estável", não "a melhor possível". Isso é aceitável porque o admin ajusta à mão (RF-46). O critério de aceite precisa testar propriedades e casos de referência, não o ótimo.
- **Cada ajuste manual custa uma ida à API** (cerca de 100 a 300 ms com a função aquecida, mais na partida a frio). A sensação de resposta imediata é preservada porque o movimento aparece na hora, e só os números esperam (UX-SPEC §7).
- O simulador exige conexão, o que é coerente com "funções administrativas exigem conexão" (RF-54).

## Alternativas consideradas

1. **Busca exaustiva.** Para 2 times de 11 titulares, C(22,11) dá cerca de 700 mil divisões, ainda viável em segundos, mas cresce rápido com reservas e com 3 ou mais times. Descartada pelo custo imprevisível de CPU, num plano que mede CPU ativa.
2. **Algoritmo no cliente (domínio importado na tela).** Daria ajuste instantâneo, sem rede, mas viola a CONVENCOES §2 ("a tela não recalcula regra de negócio") e duplicaria o pacote de domínio no bundle. Descartada.
3. **Sorteio aleatório com semente.** É determinístico com semente fixa, mas a qualidade varia de forma arbitrária e é difícil explicar ao grupo por que a sugestão mudou quando a lista mudou. Descartada.
