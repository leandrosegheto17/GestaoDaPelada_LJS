# Jornadas: Gestão da Pelada v2

- **Base**: `.specs/features/fundacao/spec.md`, `.specs/projeto/roadmap.md`, em 2026-11-03
- Cada feature planejada acrescenta as jornadas que cria (decisão do usuário em 2026-11-03, AD-015).

## Feature 1: fundacao

## J-01 — Do clone ao app rodando local
- **Quem**: desenvolvedor (dono do app)
- **Passos**: 1. clonar o repositório num diretório limpo · 2. `pnpm install`, `docker compose up -d`, `pnpm migrar`, `pnpm seed` · 3. `pnpm dev` · 4. abrir `http://localhost:5173` e chamar `GET /api/health`
- **Resultado esperado**: o shell no visual do mockup em `localhost:5173`; `/api/health` = 200 com `{"status":"ok","versao":"<sha>"}`; o banco local tem a conta, o grupo e os jogadores do seed
- **Requisitos que atravessa**: FUN-01, FUN-03, FUN-04, FUN-05, FUN-08, FUN-21, FUN-30, FUN-51

## J-02 — Prévia publicada e instalada como app
- **Quem**: jogador ou organizador, no celular
- **Passos**: 1. abrir a prévia `gestaodapelada-v2` (workers.dev) por HTTPS · 2. no Android, instalar o PWA; no Safari do iOS, ver a instrução de instalação · 3. abrir o app instalado sem rede numa rota fora do cache
- **Resultado esperado**: `/api/health` da prévia = 200 com o SHA publicado; o app instala com nome "Gestão da Pelada" e ícone; sem rede, aparece a página offline no visual do mockup; as rotas `/api/*` respondem com `Cache-Control: no-store`
- **Requisitos que atravessa**: FUN-20, FUN-21, FUN-22, FUN-27, FUN-29, FUN-33, FUN-34, FUN-35, FUN-36

## J-03 — Banco herdado intacto e dados isolados por grupo
- **Quem**: dono do app
- **Passos**: 1. restaurar localmente um dump da branch `dev` do Neon · 2. `pnpm migrar` sobre ele · 3. com duas contas de grupos diferentes, ler e tentar escrever nos dados do grupo da outra
- **Resultado esperado**: zero DDL executado e contagem de linhas idêntica; cada conta só vê e altera as linhas dos próprios grupos; sem contexto, zero linhas
- **Requisitos que atravessa**: FUN-09, FUN-10, FUN-13, FUN-15, FUN-16, FUN-17

## J-04 — Backup da produção e restauração
- **Quem**: dono do app
- **Passos**: 1. disparar o `backup.yml` à mão · 2. baixar o artefato e decifrar com a chave privada guardada fora do GitHub · 3. `pg_restore` num Postgres local recém-criado · 4. comparar a contagem de linhas por tabela com a produção
- **Resultado esperado**: job verde com artefato cifrado retido por 30 dias; a restauração tem a mesma contagem de linhas da produção (pendência da AD-014: revalidar no fim do projeto)
- **Requisitos que atravessa**: FUN-47, FUN-48, FUN-49, FUN-50

## J-05 — Deploy da prévia pelo caminho seguro
- **Quem**: dono do app
- **Passos**: 1. abrir um PR com um teste quebrado · 2. corrigir e integrar na `main` · 3. disparar o `deploy.yml` por `workflow_dispatch`
- **Resultado esperado**: o PR com teste quebrado fica vermelho no CI; o deploy cria a branch de restauração, faz o dump cifrado, migra, publica o Worker `gestaodapelada-v2` e confere o `/api/health` com o SHA; nada toca o Worker `gestaodapelada` nem a `main` do Neon
- **Requisitos que atravessa**: FUN-40, FUN-41, FUN-42, FUN-28, FUN-57, FUN-58

## Feature 2: conta-e-acesso

## J-06 — Criar conta, confirmar o e-mail e entrar
- **Quem**: organizador sem conta, no celular
- **Passos**: 1. abrir `/cadastro`, preencher nome, e-mail e senha e marcar o aceite dos termos · 2. abrir o link de confirmação recebido por e-mail · 3. em `/entrar`, entrar com a senha
- **Resultado esperado**: "Enviamos um link de confirmação para o seu e-mail"; o link leva a `/entrar` com "E-mail confirmado. Entre com a sua senha." sem abrir sessão; o login chega a `/app` com o estado vazio de grupos; o cookie é `__Host-sessao`
- **Requisitos que atravessa**: ACE-01, ACE-05, ACE-06, ACE-09, ACE-18, ACE-57, ACE-58, ACE-59

## J-07 — Recuperar a senha por e-mail
- **Quem**: admin que esqueceu a senha
- **Passos**: 1. em `/entrar/esqueci`, informar o e-mail · 2. abrir o link recebido · 3. criar a senha nova · 4. entrar com a senha nova e tentar a antiga
- **Resultado esperado**: a mesma mensagem de sucesso exista ou não a conta; "Senha alterada. Entre com a nova senha."; a senha nova entra, a antiga recebe 401 e as sessões abertas antes deixam de valer
- **Requisitos que atravessa**: ACE-22, ACE-23, ACE-24, ACE-25, ACE-76

## J-08 — Convidar, aceitar e remover um admin
- **Quem**: admin A de um grupo e pessoa B sem conta
- **Passos**: 1. A abre os admins do grupo e convida o e-mail de B · 2. B abre o link, cria a conta com o e-mail travado · 3. os dois veem o grupo em `/app` · 4. A remove B · 5. A tenta se remover sozinho
- **Resultado esperado**: convite pendente com validade de 7 dias; B nasce confirmado e com vínculo; a remoção grava a auditoria; a última remoção responde "último admin"; B passa a receber 404 nas rotas do grupo
- **Requisitos que atravessa**: ACE-31, ACE-34, ACE-37, ACE-39, ACE-40, ACE-41, ACE-42

## J-09 — Trocar a senha e excluir a conta
- **Quem**: admin logado em dois aparelhos
- **Passos**: 1. em `/app/conta/senha`, trocar a senha · 2. no outro aparelho, usar o app · 3. em `/app/conta`, excluir a conta com a senha (sendo a única admin de um grupo, e depois sem grupos)
- **Resultado esperado**: a troca mantém a sessão atual e encerra a do outro aparelho (401 "Sua sessão expirou"); a exclusão é recusada com a lista dos grupos enquanto a conta for a única admin; sem grupos, a conta é excluída, a tela vai a `/` com "Sua conta foi excluída" e o login responde 401
- **Requisitos que atravessa**: ACE-20, ACE-26, ACE-28, ACE-29, ACE-69

## J-10 — Conta do grupo de teste entra na prévia
- **Quem**: dono do app, com a conta que já existe no banco
- **Passos**: 1. abrir `/entrar` na prévia `gestaodapelada-v2` (branch `dev` do Neon) · 2. entrar com o e-mail e a senha atuais · 3. errar a senha 5 vezes de um IP e tentar de outro
- **Resultado esperado**: a conta entra com a senha que já tinha e vê o grupo de teste em `/app`; o par e-mail e IP fica bloqueado por 15 min ("Muitas tentativas. Tente de novo em 15 minutos.") e o outro IP entra
- **Requisitos que atravessa**: ACE-09, ACE-13, ACE-14, ACE-18, ACE-50
