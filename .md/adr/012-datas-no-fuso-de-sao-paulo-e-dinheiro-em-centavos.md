# ADR-012: Datas de negócio como data local de São Paulo, "hoje" decidido pelo servidor, e dinheiro em centavos inteiros

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RNF-02, RN-07, RF-23 (vigência a partir de hoje), RF-25, RF-27, RF-31, RF-39, RF-60 a RF-63, RN-12

## Contexto

Várias regras dependem de "hoje" e do mês do calendário de São Paulo:
- não aceitar partida futura;
- a vigência dos pesos começa hoje;
- o mês corrente do ranking e do financeiro;
- o limite da navegação entre meses;
- a idade (ano corrente).

A função roda em servidores com relógio em UTC, e os aparelhos dos usuários podem estar em outro fuso ou com o relógio errado. O financeiro soma valores com 2 casas decimais, e somar em ponto flutuante gera erro de arredondamento.

## Decisão

1. **Data de negócio** (data da partida, entrada e saída do jogador, vigência dos pesos, data do lançamento, mês de pagamento): tipo `date` no banco e string `AAAA-MM-DD` no contrato. Nunca é um instante com fuso.
2. **"Hoje" e o mês corrente são calculados só no servidor,** com o fuso `America/Sao_Paulo`, num módulo `relogio` da infraestrutura, e passados ao domínio como parâmetro. A API devolve `hoje` nas respostas que dependem dele. A tela usa esse valor como padrão de data e limite de navegação, nunca o relógio do aparelho.
3. **Instantes de auditoria** (criado em, alterado em, eventos de uso): `timestamptz` em UTC, exibidos em São Paulo.
4. **Dinheiro:** inteiro em **centavos** (`integer`, com limite no contrato: de 1 a 99.999.999 centavos por lançamento). A formatação em R$ 1.234,56 acontece só na tela.

## Consequências

**Positivas**
- A virada de mês e de dia fica correta independentemente do fuso do servidor ou do aparelho, e é testável fixando o relógio (CONVENCOES §7).
- Não há erro de arredondamento nos saldos.

**Negativas**
- Todo teste e toda rota que dependem de "hoje" precisam receber o relógio por injeção. Isso dá um pouco mais de código, mas é exatamente o que torna o teste da virada de mês possível.
- Um aparelho com fuso diferente vê o "hoje" de São Paulo. Isso é aceito porque o público é só o Brasil e o RNF-02 manda usar São Paulo.

## Alternativas consideradas

1. **"Hoje" vindo do aparelho.** Relógio errado ou fuso diferente gerariam partida "futura" aceita ou recusada indevidamente. Descartada.
2. **`numeric(12,2)` no banco com `number` no JavaScript.** O banco seria exato, mas o JavaScript reintroduz ponto flutuante nos totais. Descartada.
