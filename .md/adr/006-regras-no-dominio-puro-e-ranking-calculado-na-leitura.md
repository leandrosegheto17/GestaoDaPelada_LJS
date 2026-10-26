# ADR-006: Regras de negócio num pacote de domínio puro; ranking calculado na leitura, a partir de pesos versionados por vigência

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-21, RF-23 a RF-32, RF-37, RF-50, RN-01 a RN-07, RN-11, RN-12, RN-14, RN-19, RNF-02, RNF-03, RNF-09

## Contexto

O ranking é contínuo e nunca zera (I-35). A ordem é sempre a do acumulado até hoje (RN-05). Os pontos de cada presença dependem do peso vigente na **data da partida** (RN-01, RN-04). A edição ou exclusão de partida recalcula tudo (RF-28). Uma mudança no ano de nascimento ou na data de entrada afeta o desempate e as faltas (RF-20). A inativação e a reativação mudam quem aparece nas linhas e quando conta falta (RN-06).

O volume é pequeno: 40 jogadores × cerca de 52 partidas por ano dá cerca de 2.000 presenças por ano por grupo. O simulador usa a mesma ordem, com a data de referência na véspera do jogo (RN-08).

## Decisão

1. **Pacote `@pelada/dominio`** (TypeScript puro, sem I/O, sem relógio, sem banco) com as regras:
   - pontos por situação, chuva e configuração vigente;
   - atividade numa data (períodos de atividade);
   - acumulado até uma data de referência;
   - ordenação e desempate, com comparação de apelido sem diferenciar maiúsculas nem acentos (`localeCompare` pt-BR, `sensitivity: 'base'`);
   - contagem de presenças e faltas por mês;
   - nível (média, com 5,5 para quem não tem nota);
   - idade;
   - simulador (ADR-007);
   - saldos do financeiro.
   "Hoje" e o mês corrente entram como parâmetro, nunca são lidos do relógio dentro do domínio.
2. **Ranking calculado na leitura.** A consulta carrega:
   - os jogadores do grupo e seus períodos de atividade;
   - todas as partidas e presenças do grupo;
   - as configurações de pesos.
   O domínio calcula o acumulado até hoje, a ordem e as marcações do mês pedido. **Não existe tabela de pontos materializada.**
3. **Pesos versionados e imutáveis.** Cada configuração é uma linha com `vigente_desde` (a data do registro, sempre hoje, RF-23) e quem registrou. A configuração de uma data é a de maior `vigente_desde` que seja menor ou igual à data. Se houver duas no mesmo dia, vale a mais recente. Uma configuração nunca é editada nem apagada.
4. **Ausência não é gravada.** A presença existe só para as situações presente, lesionado e expulso. Falta é derivada assim: o jogador estava ativo na data da partida e não tem presença registrada nela (RN-03, RN-06).
5. **Períodos de atividade** por jogador (`inicio`, `fim` opcional):
   - a data de entrada abre o primeiro período;
   - a inativação fecha o período aberto;
   - a reativação abre um novo período.

## Consequências

**Positivas**
- Não existe dado derivado para ficar inconsistente: editar partida, peso ou cadastro reflete na próxima leitura, sem recálculo em lote nem troca de projeção (SDD §6, "Troca de dados em produção").
- As regras são testáveis com tabelas de casos (RN-05, RN-06 e virada de mês) sem banco.
- O mesmo código serve à tela, ao PDF (projeção do servidor) e à prioridade do simulador, e não há duas implementações da ordem.

**Negativas**
- Toda leitura do ranking processa o histórico inteiro do grupo. Isso custa cerca de 2.000 linhas por ano por grupo, irrelevante agora. Daqui a anos, ou com grupos muito maiores, pode passar a pesar no tempo de resposta. Condição de revisão (SDD §6): ranking acima de 300 ms no servidor ou mais de 20 mil presenças num grupo. A saída é um acumulado materializado por jogador, recalculado na escrita.
- Uma consulta "inteira" por leitura transfere mais dados do Neon para a função do que um agregado SQL. Aceito: são KBs.

## Alternativas consideradas

1. **Pontos gravados na presença no momento do lançamento.** Seria mais rápido na leitura, mas a gravação congela o peso. Uma edição posterior de partida precisaria lembrar de recalcular, e qualquer correção de regra exigiria migração de dados. Descartada pela simplicidade e pela consistência.
2. **Agregação em SQL (views e funções no Postgres).** É possível para o acumulado, mas a ordem com comparação sem acento, a atividade por períodos e o reuso no simulador e no PDF ficariam divididos entre SQL e TypeScript. Descartada para manter uma implementação só da regra.
