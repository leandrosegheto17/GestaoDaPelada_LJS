# STATE

## Decisions

- **AD-001** (2026-11-03): roteiro em 8 features, na mesma quebra e ordem do `GestaoDaPelada_LJS`: fundacao → conta-e-acesso → grupos-e-elenco → partidas-e-ranking → simulador → financeiro → planos-e-cobranca → notificacoes (`.specs/projeto/roadmap.md`). Cada uma é uma fatia vertical que se valida e libera sozinha. A fundação vem primeiro porque concentra o maior risco: subir sobre o schema atual do banco compartilhado como linha de base. Conta, grupos e partidas destravam o resto. Simulador e financeiro vêm depois do ranking (o simulador depende dele). Cobrança e notificações ficam por último, porque dependem das features pagas. **Descartadas**: (a) uma feature única com o produto inteiro, sem aprovação no meio (anti-padrão "Geral"); (b) adiantar o simulador para medir cedo o CPU de 10 ms, descartada porque ele depende do ranking. A medição entra como spike na fundação, se o desenho achar necessário.
