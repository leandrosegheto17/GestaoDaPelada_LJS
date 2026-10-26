# ADR-026: Verificação do PWA por teste de instalabilidade com Playwright, sem Lighthouse

- **Status:** Accepted (decisão AD-005 da fundação; decisão do usuário em 2026-10-24)
- **Data:** 2026-10-25
- **Decisores:** usuário
- **Requisitos:** FUN-36, FUN-38
- **Relacionado:** ADR-009 (PWA com service worker e TWA), ADR-019 (limite da comparação visual do PDF)

## Contexto

O padrão LJS pede "Lighthouse PWA >= 90" no CI. A categoria PWA foi removida do Lighthouse, então a métrica deixou de existir.

## Decisão

1. A verificação do PWA é um **teste de instalabilidade com Playwright** (`frontend/web/e2e/pwa.spec.ts`): manifest válido, service worker ativo, ícones e página offline. Os cabeçalhos de segurança são conferidos em `cabecalhos.spec.ts`. Ambos rodam contra o Worker local servindo o `dist`.
2. **Não há job de Lighthouse no CI.** O `ci.yml` roda o e2e e a comparação visual, ambos depois do build do web.
3. A acessibilidade continua coberta pelo axe nos testes de componente.
4. A sugestão é estender a decisão aos três apps LJS.

## Consequências

**Positivas**

- O CI deixa de depender de uma categoria que não existe mais, e o teste falha com a causa clara (manifest, ícone, service worker).

**Negativas**

- Sem métrica automática de desempenho e de acessibilidade da página inteira.

## Alternativas consideradas

1. **Lighthouse só com as categorias que restam.** Recusada: perde o objetivo (instalabilidade) e adiciona um teste instável.
2. **Verificação manual.** Recusada: não protege contra regressão.
