# ADR-008: PDF gerado no navegador a partir de uma projeção pronta da API, com compartilhamento nativo e alternativa de download

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário); §3 Superseded by ADR-022
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-49 a RF-52, RF-33, RF-57, RNF-03 (PDF em até 5 s), RNF-08; PR-07

## Contexto

Qualquer pessoa com o link do grupo pode exportar o PDF do mês exibido (RF-49). O PDF tem uma página A4 retrato para até 40 jogadores e 12 colunas, com fonte de no mínimo 7 pt (RF-51).

Depois de gerar, o PDF deve abrir a folha de compartilhamento do sistema, ou ser baixado quando o compartilhamento não estiver disponível (RF-52). A Web Share API exige um gesto do usuário recente ("ativação transitória"). Se houver uma ida à rede longa entre o toque e o `navigator.share`, o Safari pode recusar o compartilhamento.

A meta é custo zero. Gerar PDF no servidor com navegador sem cabeça (headless) é pesado demais para o plano gratuito.

## Decisão

1. **A API entrega a projeção pronta:** `GET /api/publico/:codigo/pdf?mes=AAAA-MM` devolve:
   - o nome do grupo, o mês e a data de geração;
   - as linhas na ordem do ranking (posição, apelido, acumulado, presenças e faltas do mês);
   - as **colunas já escolhidas pelo servidor**: as partidas do mês exibido mais as anteriores, até 12, com a marcação de mês e de chuva;
   - a grade de marcações (P, L, E, F, –).
   **A regra de corte (RF-50/51) roda no servidor (domínio):** as partidas do mês nunca saem, e o corte começa pelas colunas de meses anteriores.
2. **O navegador só desenha:** um módulo `pdf/` carregado sob demanda (biblioteca de desenho de PDF, ex.: jsPDF) monta a página com a fonte do mockup embutida (acentos pt-BR). Ele calcula só o tamanho de fonte que cabe, entre 9 e 7 pt. Isso é diagramação, não regra de negócio.
3. **[Superseded by ADR-022 — o diálogo "PDF pronto." com Compartilhar e Baixar substitui este fluxo; texto original mantido abaixo]** **Ordem para preservar o gesto:**
   - a tela do ranking **pré-carrega** a projeção do PDF do mês exibido (em segundo plano, depois que o ranking aparece);
   - ao tocar em "Exportar PDF", o arquivo é gerado de forma síncrona (menos de 300 ms) e `navigator.share({ files })` é chamado no mesmo gesto;
   - se o navegador recusar por perda de ativação (`NotAllowedError`), a tela mostra os botões "Compartilhar" e "Baixar", e o novo toque é um novo gesto;
   - se `navigator.canShare({ files })` for falso, o arquivo é baixado direto.
4. **Evento de uso:** registrado por `POST /api/publico/:codigo/eventos` (`pdf_exportado`, mês) no momento da geração (RF-57).
5. **Mais de 40 jogadores** (fora da premissa): a fonte desce até 7 pt. Se ainda não couber, a tabela continua numa 2ª página. É um detalhe registrado; o RF-51 só exige 1 página até 40.

## Consequências

**Positivas**
- Custo zero, sem CPU de servidor para desenhar, e a geração é instantânea depois do pré-carregamento (RNF-03, 5 s).
- O compartilhamento funciona no mesmo gesto na maioria dos casos, e há alternativa explícita quando não funciona (PR-07).
- A regra de quais colunas entram fica no domínio, testável. O desenho fica no cliente.

**Negativas**
- **A aparência do PDF pode variar levemente** entre navegadores, porque a fonte embutida é a mesma mas o motor de desenho roda no aparelho. Isso é aceito; o teste visual é feito em iPhone e Android reais no I3.
- **O bundle cresce** com a biblioteca de PDF e a fonte. A mitigação é o carregamento sob demanda, fora do caminho do ranking.
- O pré-carregamento faz uma requisição a mais a cada abertura do ranking. Ela é barata, mas conta nas invocações. A tela só pré-carrega quando o usuário rola até o botão ou fica parado alguns segundos (detalhe do Executor).

## Alternativas consideradas

1. **PDF no servidor com Chromium headless (Puppeteer).** Pesado para função serverless gratuita: tamanho do pacote, partida a frio de vários segundos e CPU. Também perde o gesto do usuário por causa da espera. Descartada.
2. **PDF no servidor com biblioteca leve (pdf-lib/pdfkit).** Viável, mas o arquivo chega depois de uma ida à rede, e o gesto se perde no Safari. Exigiria sempre o 2º toque em "Compartilhar". Descartada; o cliente dá melhor experiência pelo mesmo custo de código.
3. **`window.print()` com CSS de impressão.** Não garante 1 página, não gera arquivo compartilhável no iPhone e varia muito entre navegadores. Descartada.
