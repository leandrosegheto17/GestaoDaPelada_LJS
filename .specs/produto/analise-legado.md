# Análise do legado — Gestão da Pelada

- **Data:** 2026-10-24
- **Fonte:** `C:\Leandro\Projetos\GestaoDaPelada` (1059 commits; último `ece227e0`), lido somente leitura.
- **Fluxo:** 1 (projeto para vender), entrando pela fase 6 (MVP). Sem pesquisa de mercado, por decisão do usuário: o objetivo é recriar o app no padrão LJS Software, com custo zero, e deixá-lo publicado. Escala só se surgirem usuários reais.
- **Diretrizes do usuário:** regras de negócio vêm do legado; layout das telas reaproveitado 100%; o padrão de stack e infra é o prompt "Padrão de projeto — LJS Software" (vale para os três apps: Gestão da Pelada, MyMoney e Evolução Segura, que ficam em repositórios separados).

Caminhos abaixo são relativos à raiz do legado.

## 1. Produto atual

- Público: organizador de pelada semanal entre amigos, que hoje usa WhatsApp e planilha. As dores são presença sem registro, divisão manual dos times e caixa sem controle (`.md/PRD.md:58-61`).
- Papéis (`.md/PRD.md:75-78`):
  - **dono da plataforma**: conta única, criada por script (ADR-013). Cria grupos e o primeiro admin, arquiva grupos e redefine senhas.
  - **admin do grupo**: vínculo por grupo, com acesso ao financeiro opcional.
  - **jogador**: não tem login. Consulta o ranking pelo link público `/g/<slug>` (ADR-016).
- Não há cadastro aberto. A recuperação de senha passa pelo dono, e nenhum e-mail é enviado.
- Comercial (`.md/PLANO-COMERCIAL.md:42`): trial de 3 meses e depois R$ 9,90 por grupo por mês, pago pelo admin. **Nada implementado**: o campo `situacao_comercial` não tem efeito e o trial não expira.

## 2. Regras de negócio a preservar (domínio puro, `backend/dominio/src`)

| Área | Regra | Fonte |
|---|---|---|
| Pontuação | Peso por situação (presente, lesionado, expulso) com e sem chuva. Padrão: +1, +1, +1, +1, −1, −1. Ausência vale 0 | `pontuacao/pontos.ts:6-15`, `pesos.ts:5-12` |
| Vigência dos pesos | Vale a configuração com maior `vigenteDesde` ≤ data. Data anterior a todas usa a mais antiga | `pontuacao/pesos.ts:20-43` |
| Acumulado | Ponto inicial + partidas no período ativo. A contagem recomeça no retorno do jogador. O ponto inicial só vale se o início não passar da primeira presença | `pontuacao/acumulado-inicio.ts:35-60` (ADR-023) |
| Ranking | Ordem por acumulado ↓, ano de nascimento ↑, apelido (sem acento e sem caixa), id. Empate total divide a posição (1, 1, 3) | `ranking/ordem.ts:20-41` |
| Rodadas | Antes do início da pontuação conta "fora". Ativo sem presença conta falta (0). Fora do período fica null | `ranking/rodadas.ts:29-43` |
| Períodos de atividade | Intervalo [início, fim). Validações (a) a (h): data futura, sobreposição, saída antes da entrada etc. Só a entrada não é corrigível | `atividade/*.ts` |
| Nível | Média das notas × 100, arredondada meio para cima. Sem nota vale 550 e marca `semNota` | `elenco/nivel.ts` |
| Habilidades iniciais | Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme (notas de 1 a 10) | `elenco/habilidades-iniciais.ts` |
| Simulador | 2 times exige aptos ≥ 2N; 3 ou mais times exige aptos > 2N; N ≥ 2. Reservas e saída no intervalo. Distribuição em serpentina mais busca local (teto de 200 trocas, 60 aptos). Prioridade pela ordem do ranking na véspera. Avisos não bloqueiam | `simulador/*.ts` (ADR-007) |
| Financeiro | Marcar a mensalidade gera a entrada do mês. Recusa mês futuro e jogador inativo no mês. Saldo = inicial + entradas − saídas. Lista quem não pagou | `caixa/*.ts`, `api/.../marcar-pagamento.ts` |
| Partidas | Uma por grupo e data. Data futura é recusada | `api/.../partidas/nova.ts` |
| Escalação | Uma por grupo e data. Todos precisam estar ativos. Confirmar de novo substitui | `api/.../confirmar-escalacao.ts` |
| Jogador | Apelido único no grupo. Com histórico não se exclui, só se inativa | `api/.../elenco/excluir.ts` |
| Slug | De 3 a 40 caracteres. Reservados ganham sufixo `-grupo`; colisão ganha `-2`. Imutável | `grupos/slug.ts` (ADR-016) |
| PDF | Gerado no cliente, até 12 colunas (as partidas mais recentes do mês), com Compartilhar e Baixar | `pdf/colunas.ts` (ADR-008, ADR-022) |
| Datas e dinheiro | Fuso `America/Sao_Paulo`; centavos inteiros | ADR-012 |

Cobertura atual: 215 arquivos de teste no backend (27 no domínio) e cerca de 104 no front. Esses testes **servem de fonte para os critérios de aceite**. Pela regra de testes do projeto, os novos são escritos a partir dos critérios, nunca copiados do código.

## 3. Modelo de dados atual

13 migrations SQL num runner próprio. As tabelas são: `contas`, `sessoes`, `tentativas_login`, `pedidos_reset`, `auditoria`, `grupos`, `vinculos_admin`, `jogadores`, `periodos_ativos`, `habilidades`, `notas`, `config_pesos`, `partidas`, `presencas`, `eventos_uso`, `escalacoes`, `config_financeira`, `lancamentos` e `pagamentos_mes`.

O isolamento é **por `grupo_id`, só na aplicação** (ADR-005, sem RLS). O padrão LJS exige uma coluna de dono e RLS com `FORCE`.

## 4. Telas e layout (reaproveitamento)

- Rotas atuais (`frontend/web/src/app/rotas.tsx`): `/` (sem grupo), `/entrar`, `/entrar/esqueci`, `/g/:slug` (ranking público), `/privacidade`, `/dono/*`, `/admin`, `/admin/:grupoId/*` (início, uso, grupo, admins, pontuação, jogadores, partidas, financeiro, habilidades, simulador), `/conta/senha`, `/entrar/nova-senha`.
- **Copiar literalmente:**
  - `src/estilos/tokens.css`, cópia byte a byte de `.md/mockup/tokens.css`. Verde #0B6B34 e amarelo #FFD23F.
  - `global.css`, `public/fontes/` (Barlow e Barlow Condensed, OFL) e `public/icones/`.
  - Componentes base de `basicos/`, `barras/`, `campos/`, `escolhas/`, `dialogos/` e `listas/`.
  - Todos os `*.module.css` e a casca visual dos layouts.
- **Recriar sobre o contrato novo:** `src/dados/*`, guarda de rota, `pwa/sw.ts`, e as telas acopladas (simulador, financeiro, dono).
- Estilo: CSS Modules + variáveis, com Stylelint impondo o uso de tokens. Só tema claro.
- Mockup: `.md/mockup/` (142 HTML, `telas.json` com viewports de 1280×800 e 390×844). Na comparação visual de 2026-10-24, 48 telas deram OK e nenhuma divergiu (`frontend/web/e2e/resultado/resumo.md`). Esse mockup é a **referência visual** da reescrita, e a comparação visual pode ser portada.
- **Não existem no legado:** landing, cadastro, confirmação de e-mail, Meu plano, termos, push e página offline. Essas telas precisam ser desenhadas no mesmo estilo (`mockup-visual`, modo módulo).

## 5. Infra atual × padrão LJS

| Item | Legado | Padrão LJS | Lacuna |
|---|---|---|---|
| Worker único com assets e Hono em `/api/*` | sim | sim | — |
| Neon via Hyperdrive, Kysely + `pg` | sim | sim | — |
| Migrations | runner próprio `.sql` | `node-pg-migrate` | trocar |
| RLS + roles owner/app/backup_ro | não (ADR-005) | obrigatório | novo |
| Auth: bcrypt no PG, sessão opaca SHA-256 | sim, cookie `__Host-sessao`, 30 dias | `__Host-sid`, 15 min de inatividade, 12 h absoluta | ajustar |
| Cadastro aberto e confirmação por e-mail | não | sim | novo |
| Resend, Asaas, Web Push, Cron, Sentry, UptimeRobot | não | sim | novo |
| Rate limit | `LIMITE_ENTRAR` e `LIMITE_PUBLICO` | + `LIMITE_WEBHOOK` | acrescentar |
| Backup `pg_dump` + `age` às 04:00 BRT | sim | sim | — |
| Deploy só por `workflow_dispatch` (restauração, dump, migração, deploy) | sim | sim | — |
| Domínio | `pelada.prod-ljs.workers.dev` (ADR-020) | `<app>.ljssoftware.com.br` | novo |
| Node | 22 | 24 | subir |
| Landing `/`, app `/app`, Meu plano, termos, exclusão de conta | não | sim | novo |

## 6. Pendências herdadas

- BK-0020: redação do texto "Volta a aparecer no ranking…", ainda em aberto (`.md/BLOCKERS.md:181`).
- ARCH-REVIEW #1 a #4: os documentos descrevem a regra antiga da data de início, e o código do início da contagem está triplicado. **A reescrita parte da regra vigente no código** (contagem a partir do retorno).
- SECURITY-REVIEW: o rate limit e os cabeçalhos no host publicado não foram verificados (risco aceito). Na reescrita, viram critério de aceite.
- `so1oTempo` vem do cliente e não é persistido. `ano_nascimento` é nullable, mas o cálculo de idade supõe número; no ranking, o ausente vira 9999.
- Refatoração `node24-dominio-proprio`, iniciada no legado, fica **substituída por esta reescrita**. `PREMISSA`: confirmar com o usuário.

## 7. Conflitos entre o legado e o padrão LJS (decisão do usuário)

1. **Unidade de dono e de cobrança.** No legado é o grupo (com vários admins e um dono da plataforma). O padrão pede `usuario_id` por linha e cadastro aberto. [A ESCLARECER: quem é o dono dos dados e quem paga]
2. **Planos.** O plano comercial do legado é R$ 9,90 por grupo por mês com trial de 3 meses. O padrão pede trial de 14 dias e planos Free e Pro com limites. [A ESCLARECER: preço do Pro e limites do Free]
3. **Push.** O padrão pede Web Push, mas o legado não tem nenhum evento notificável definido, e o jogador não tem login. [A ESCLARECER: o que notifica e quem]
4. **Sessão.** No legado são 30 dias, renovados (o organizador usa à beira do campo). O padrão pede 15 min de inatividade e 12 h absoluta. Fica o padrão, salvo decisão em contrário.
5. **Dados de produção do legado.** Migrar para o app novo ou começar vazio? (ADR-021 trata da importação de dados ainda mais antigos.)
6. **Rotas.** `/` passa a ser a landing e o app vai para `/app`. O link público `/g/:slug` é mantido.

## 8. Decisões do usuário (2026-10-24)

| # | Tema | Decisão |
|---|---|---|
| D1 | Dono e cobrança | **Organizador, por grupo.** Cadastro aberto, e qualquer conta cria grupos. A assinatura é por grupo. Admins convidados entram por vínculo. A RLS isola por `grupo_id`, ligado aos vínculos da conta da sessão. O dono da plataforma fica só como papel de suporte |
| D2 | Planos | **Pro a R$ 9,90/mês por grupo.** Free: 1 grupo, até 20 jogadores, ranking e partidas. Pro: jogadores ilimitados, simulador, financeiro, PDF e push. Trial Pro de 14 dias sem cartão. Ao expirar, cai para Free sem apagar dados, e o excedente fica somente leitura |
| D3 | Push | **Ranking atualizado**, para quem assinou pelo link público do grupo, sem login, quando o admin lança ou altera uma partida. **Cobrança da assinatura**, para o organizador: cobrança gerada, pagamento confirmado e atraso, além do e-mail |
| D4 | Domínio | `gestaodapelada.ljssoftware.com.br` |
| D5 | Banco | **Reaproveitar o mesmo projeto Neon e o mesmo Hyperdrive, avaliando manter o schema atual.** O app novo é desenhado para continuar sobre as tabelas existentes: as migrations nascem de uma linha de base equivalente às 13 atuais e evoluem de forma aditiva (RLS, roles, cadastro, assinatura, push). O app antigo será descontinuado. Ele não tem usuários, só o grupo de teste do usuário, que continua valendo. A viabilidade fica para avaliar no Design (fase 7), com ADR |
| D6 | Grupos existentes | Só há o grupo de teste do usuário. Com o banco reaproveitado, não é preciso script de importação. O plano desse grupo é decidido no Design (sugestão: cortesia) |
| D7 | Sessão | Padrão LJS: 15 min de inatividade e 12 h absoluta |
| D8 | Escopo do repositório | Só o Gestão da Pelada. MyMoney e Evolução Segura seguem em repositórios próprios |
