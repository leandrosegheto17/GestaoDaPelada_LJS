# ADR-005: Isolamento por grupo garantido na API (escopo obrigatório no repositório + suíte de isolamento), sem RLS na Fase 1

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-07, RF-09, RF-10, RF-18, RF-38, RN-17, RNF-05, RNF-09; Gate 1, ressalva 4

## Contexto

Todo dado pertence a um grupo. Um admin só vê os grupos aos quais está vinculado. O dono vê só os metadados dos grupos dos quais não é admin. O financeiro exige permissão por admin e por grupo. Um acesso negado não pode revelar se o recurso existe (RF-09).

A API é a única porta de acesso ao banco (ADR-001). Ela usa um papel de banco só, e o navegador nunca fala com o Postgres. A Fase 2 abrirá o sistema a outros grupos.

## Decisão

1. **Modelo lógico com `grupo_id`** em toda tabela de dado de grupo: jogador, partida, pesos, habilidade, escalação, financeiro e evento de uso. Tabelas filhas, como presença e nota, herdam o grupo pela chave do pai. Elas também guardam `grupo_id` quando isso evita uma junção na checagem.
2. **Rotas de grupo sempre sob `/api/grupos/:grupoId/...`.** Um middleware único faz quatro coisas:
   - resolve a sessão;
   - carrega o vínculo (conta, grupo);
   - recusa com **404** quando o vínculo não existe ou o grupo está arquivado;
   - para rotas marcadas como financeiras, recusa com **403** e aviso quando falta `acessa_financeiro`.
   O 403 só aparece para quem já é admin do grupo, porque saber que o financeiro existe não é segredo para ele.
3. **Repositórios recebem `grupoId` como parâmetro obrigatório** e o aplicam em toda consulta e escrita. Não existe função de repositório "por id" sem o grupo. Uma busca por id que não pertence ao grupo devolve "não encontrado".
4. **Rotas do dono sob `/api/dono/...`**, liberadas só para a conta com `e_dono = true`. Elas expõem só os metadados do grupo (RF-07). Os dados internos de um grupo só chegam ao dono pelas rotas de grupo, e só se ele for admin daquele grupo.
5. **Rotas públicas sob `/api/publico/:codigo/...`**, só leitura. Devolvem só a projeção pública (RF-33) e, para grupo arquivado, a resposta "indisponível".
6. **Suíte automatizada de isolamento**, obrigatória no CI. Usa dois grupos e três contas: admin de A, admin de B sem financeiro, e o dono sem vínculo. Para **cada rota** registrada, a suíte tenta ler e escrever no grupo alheio e espera 404. Uma rota nova sem caso na suíte quebra o teste: a suíte lista as rotas registradas no Hono e cruza com os casos.

## Consequências

**Positivas**
- Um ponto só de decisão (o middleware) e uma regra simples nos repositórios. É fácil de revisar no `/revisar`.
- A suíte cobre o comportamento observável (HTTP), que é o que importa para RF-09, independente de como cada rota foi escrita.
- Não há custo de desempenho de RLS nem a complexidade de passar a identidade para o banco.

**Negativas**
- **A garantia depende do código da API.** Uma consulta escrita sem o filtro de grupo vaza dado. A mitigação está nos itens 3 e 6 e na regra do GUARDRAILS ("toda função de repositório de dado de grupo recebe `grupoId`"), verificada por teste e pelo `/revisar`.
- **Não há defesa em profundidade no banco.** Na Fase 2, com dados de terceiros e cobrança, reavaliar RLS com `grupo_id` vindo da sessão (SDD §6, dívida aceita).

## Alternativas consideradas

1. **RLS no Postgres com `SET LOCAL app.grupo_id` por transação.** É defesa em profundidade real, mas exige transação em toda leitura, cuidado com o pooler (o modo de transação do PgBouncer funciona com `SET LOCAL`) e testes de política. Para 1 desenvolvedor e 5 grupos, o custo de manutenção supera o ganho na Fase 1. Fica adiada para a Fase 2.
2. **Banco ou schema separado por grupo.** Isolamento físico desproporcional ao volume, que também complica a migração de schema e a área do dono. Descartada.
