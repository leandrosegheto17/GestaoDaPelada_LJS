# ADR-022: PDF com escolha entre Compartilhar e Baixar em aparelho que compartilha arquivo

- **Status:** Accepted (decisão do usuário, 2026-10-20)
- **Data:** 2026-10-20
- **Decisores:** usuário (BK-0013, alternativa A); Coordenador (ajuste dos artefatos)
- **Requisitos:** RF-49, RF-52, PR-07; ADR-008
- **Substitui:** apenas o §3 do ADR-008 (o resto do ADR-008 continua valendo: PDF gerado no cliente a partir de projeção da API)

## Contexto

O §3 do ADR-008 decidia gerar o PDF e chamar `navigator.share({ files })` no mesmo gesto do toque, com download só como plano B (recusa por `NotAllowedError` ou `canShare` falso). No PC, o Chrome/Edge informa que sabe compartilhar arquivo e abria a janela de compartilhamento do Windows, que não tem a opção "Salvar"; o usuário ficava sem como guardar o arquivo. Por pedido do usuário, o app passou a agir de outro modo (`frontend/web/src/pdf/entregar.ts` e `usarExportarPdf.ts`; UX-SPEC F4/D4, alinhado pela RTP-0174).

## Decisão

1. Depois de gerar o PDF, em aparelho em que o navegador compartilha arquivo (`canShare({ files })` verdadeiro), a tela mostra o diálogo D4 "PDF pronto." com os botões **Compartilhar** e **Baixar**. `entregarPdf` devolve `'pedir-gesto'` nesse caso; o toque em Compartilhar é um novo gesto, então a ativação transitória deixa de ser um problema.
2. Só o aparelho sem compartilhamento de arquivo baixa direto, com o aviso "PDF baixado".
3. A recusa do Web Share (inclusive no iOS) cai no mesmo diálogo, não é mais um caminho de exceção.
4. O restante do ADR-008 não muda: projeção pronta da API, regra de corte no servidor, desenho no navegador, evento `pdf_exportado`.

## Consequências

**Positivas**
- No PC o usuário sempre consegue baixar o arquivo.
- Um fluxo único e previsível, sem depender de o gesto sobreviver à geração.

**Negativas**
- Um toque a mais no celular, onde antes a folha de compartilhamento abria direto.
- O ADR-008 §3 e os textos do SDD (C3, T-05) precisaram ser ajustados.

## Alternativas consideradas

1. **Voltar ao compartilhamento direto (ADR-008 §3).** Recusada pelo usuário: no PC abre a janela do Windows sem "Salvar".
2. **Editar o ADR-008 sem ADR novo.** Recusada: ADR aceito é imutável; a mudança de decisão é um novo ADR que supersede o ponto.
