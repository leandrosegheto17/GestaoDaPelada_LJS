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

## Feature 3: grupos-e-elenco

## J-11 — Criar o grupo e cadastrar o primeiro jogador no celular
- **Quem**: organizador com conta nova e sem grupos, no celular
- **Passos**: 1. em `/app`, tocar em "Criar grupo" · 2. preencher "Pelada de Quinta", quinta, semanal, 20:00 e salvar · 3. no início do grupo, abrir Jogadores e "Novo jogador" · 4. cadastrar "Toninho" com ano, posição e telefone, sem data de entrada · 5. tentar cadastrar "toninho" de novo
- **Resultado esperado**: o grupo nasce com o slug `pelada-de-quinta` e o link `<URL_PUBLICA>/g/pelada-de-quinta`; o início mostra "6 habilidades" e "1 admin"; Toninho aparece em Ativos com "Ativo desde <hoje>"; o segundo cadastro mostra "Já existe um jogador com esse apelido neste grupo." ao lado do campo; tudo em menos de 2 minutos
- **Requisitos que atravessa**: GEL-01, GEL-02, GEL-11, GEL-17, GEL-20, GEL-31, GEL-32, GEL-35, GEL-117, GEL-118

## J-12 — Saída, retorno e correção de datas de um jogador
- **Quem**: admin do grupo
- **Passos**: 1. na ficha de Beto, inativar com a data de hoje e confirmar o aviso · 2. reativar com a data de hoje · 3. corrigir a saída do primeiro período para um dia antes · 4. tentar uma saída antes de uma presença dele · 5. recuar a data de início da pontuação
- **Resultado esperado**: Beto vai para Inativos e volta a Ativos com "Beto reativado desde <data>."; os períodos mostram dois intervalos; "Datas corrigidas."; a saída antes da presença é recusada com a data mínima; o primeiro período passa a começar na nova data de início; cada passo grava a auditoria sem telefone nem ano
- **Requisitos que atravessa**: GEL-51, GEL-54, GEL-59, GEL-60, GEL-61, GEL-68, GEL-71, GEL-76, GEL-77, GEL-81, GEL-109, GEL-113

## J-13 — Habilidades, notas e nível
- **Quem**: admin do grupo
- **Passos**: 1. dar a Toninho as notas 8, 7, 6, 7, 8 e 5 nas 6 habilidades · 2. renomear "Drible" para "Drible curto" · 3. excluir "Chute" confirmando o aviso · 4. apagar todas as notas de outro jogador · 5. tentar excluir Toninho
- **Resultado esperado**: a ficha mostra "Nível 6,8"; a renomeação mantém as notas; a exclusão some com as notas de Chute e o nível é recalculado; o jogador sem notas mostra "sem nota"; a exclusão de Toninho é recusada com "Inativar em vez disso"
- **Requisitos que atravessa**: GEL-85, GEL-86, GEL-92, GEL-93, GEL-94, GEL-97, GEL-98, GEL-101, GEL-102, GEL-103

## J-14 — Arquivar e reativar com duas admins
- **Quem**: admin C, que criou o grupo, e admin O, convidada por C
- **Passos**: 1. O abre os dados do grupo e não vê a zona de arquivar; pela API, arquivar responde 403 · 2. O tenta remover C dos admins · 3. C arquiva digitando o nome exato · 4. O abre `/app` e a rota do grupo · 5. C abre "Arquivados" e reativa · 6. O abre `/app` de novo
- **Resultado esperado**: O recebe `so_quem_criou` e `criadora_nao_removivel`; com o grupo arquivado, O não o vê na lista e recebe 404 nas rotas; C o vê só em "Arquivados", e as escritas dela respondem `grupo_arquivado` até reativar; reativado, O volta a ver o grupo com jogadores, habilidades, notas e slug iguais
- **Requisitos que atravessa**: GEL-22, GEL-24, GEL-25, GEL-26, GEL-27, GEL-28, GEL-30, SEC-001, SEC-009

## Feature 4: partidas-e-ranking

## J-15 — Lançar a partida da semana e ver no ranking
- **Quem**: admin do grupo, no celular
- **Passos**: 1. abrir o início do grupo e tocar em "Lançar partida de qui, dd/mm" · 2. marcar "Choveu? Sim", 3 presentes, 1 expulso e salvar · 3. tocar em "Ver ranking" e abrir `/g/:slug` numa janela sem login
- **Resultado esperado**: "Partida de dd/mm salva."; o início passa a "Editar partida de qui, dd/mm"; o ranking mostra a coluna da data com o ícone de chuva, pontos pelos pesos com chuva e a ordem pelo acumulado; o JSON público não tem campo proibido
- **Requisitos que atravessa**: PAR-17, PAR-22, PAR-28, PAR-36, PAR-55, PAR-64, PAR-68, PAR-76, PAR-79, PAR-133

## J-16 — Corrigir e excluir uma partida
- **Quem**: admin do grupo
- **Passos**: 1. em Partidas, abrir a de 15/10 · 2. trocar um presente por lesionado e salvar · 3. excluir a partida e confirmar
- **Resultado esperado**: "Última alteração: <nome>, dd/mm hh:mm"; os pontos do jogador mudam no ranking; "Partida de 15/10 excluída." e a coluna 15/10 some do ranking; a auditoria guarda `partida_editada` e `partida_excluida`, e o evento `partida_lancada` continua
- **Requisitos que atravessa**: PAR-44, PAR-46, PAR-49, PAR-50, PAR-51, PAR-52, PAR-53, PAR-54

## J-17 — Trocar os pesos sem mudar o passado
- **Quem**: admin do grupo
- **Passos**: 1. abrir Pontuação num grupo novo ("Pesos padrão") · 2. salvar presença com chuva 2 · 3. salvar de novo no mesmo dia · 4. conferir no ranking uma partida de ontem com chuva
- **Resultado esperado**: "Nova configuração vale a partir de hoje."; o histórico ganha uma única linha "De … a <ontem>"; a partida de ontem mantém o peso antigo; o início mostra "Vigente desde dd/mm/aaaa"
- **Requisitos que atravessa**: PAR-03, PAR-04, PAR-09, PAR-10, PAR-11, PAR-13, PAR-56, PAR-135

## J-18 — Ver meses anteriores, exportar o PDF e abrir sem conexão
- **Quem**: jogador sem conta, no celular
- **Passos**: 1. abrir `/g/:slug` · 2. voltar para julho (sem partidas) e retornar a outubro · 3. tocar em "Exportar PDF" · 4. cortar a rede e reabrir o link
- **Resultado esperado**: julho mostra "Nenhuma partida registrada neste mês", com PTS inicial igual ao final e a mesma ordem; o PDF tem 1 página A4 e sai por "PDF pronto." ou como `ranking-<slug>-2026-10.pdf`; sem rede, aparece o último ranking com "Sem conexão, atualizado em dd/mm hh:mm"
- **Requisitos que atravessa**: PAR-84, PAR-85, PAR-87, PAR-88, PAR-89, PAR-95, PAR-103, PAR-105, PAR-106, PAR-124, PAR-125, PAR-148, PAR-149

## J-19 — Grupo arquivado fica indisponível e volta ao reativar
- **Quem**: criadora do grupo e um jogador com o link
- **Passos**: 1. a criadora arquiva o grupo · 2. o jogador abre `/g/:slug` e depois `/g/nao-existe` · 3. a criadora reativa · 4. o jogador abre o link de novo
- **Resultado esperado**: as duas telas mostram "Grupo indisponível" e a API responde o mesmo 404; depois de reativar, o ranking volta pelo mesmo slug
- **Requisitos que atravessa**: PAR-90, PAR-91, PAR-92, PAR-93, PAR-94

## J-20 — Reativar um jogador vendo o efeito nos pontos
- **Quem**: admin do grupo
- **Passos**: 1. abrir a ficha de Gil, inativo desde 05/10 · 2. tocar em Reativar com retorno em 08/10 · 3. confirmar
- **Resultado esperado**: o diálogo mostra "Volta a aparecer no ranking e nas partidas; a data de início não muda."; durante "Calculando…" o "Confirmar" fica desabilitado; depois "2 rodadas passam a constar: 08/10 e 15/10." e o aviso no plural; nada muda no banco antes de confirmar; depois, a ficha mostra as rodadas e a auditoria guarda o acumulado e a posição antes e depois
- **Requisitos que atravessa**: PAR-109, PAR-113, PAR-114, PAR-116, PAR-117, PAR-118, PAR-120, PAR-121, PAR-122, PAR-159

## J-21 — Painel de uso do app
- **Quem**: admin do grupo
- **Passos**: 1. num grupo novo, ver "Sem uso registrado" no início · 2. abrir o ranking público num aparelho · 3. lançar uma partida · 4. abrir "Uso do app"
- **Resultado esperado**: o início passa a "Esta semana: 1 aparelho"; a t21 mostra a semana de segunda a domingo com 1 aparelho, 0 PDFs, "1 (1)" e "0 / 1"; nenhum evento guarda IP nem conta
- **Requisitos que atravessa**: PAR-123, PAR-124, PAR-127, PAR-129, PAR-132, PAR-136, PAR-144, PAR-155, PAR-156, PAR-157, PAR-158

## Feature 5: simulador

## J-22 — Montar os times e confirmar a escalação (2 times)
- **Quem**: admin do grupo
- **Passos**: 1. no início do grupo, tocar em "Simulador: qui, dd/mm" · 2. desmarcar um ausente e marcar um "Só 1º", escolher N = 7 e K = 2 · 3. tocar em "Sugerir times", mover um jogador do Time A para o Time B · 4. tocar em "Confirmar escalação"
- **Resultado esperado**: a prévia mostra "2 times de 7 · R reservas"; os números recalculam depois da troca; volta ao início com a faixa "Escalação de dd/mm confirmada." e, abaixo do item Simulador, "Escalação de dd/mm confirmada"; "Refazer" devolve a mesma sugestão
- **Requisitos que atravessa**: SIM-01, SIM-08, SIM-17, SIM-47, SIM-74, SIM-77

## J-23 — Dividir em 3 ou mais times
- **Quem**: admin do grupo
- **Passos**: 1. com 22 aptos, escolher "3 ou mais times" e N = 4 · 2. sugerir · 3. confirmar
- **Resultado esperado**: "5 times de 4 + 1 time incompleto de 2"; 6 cartões, o último "Incompleto (2 de 4)"; a escalação fica gravada e o painel "Uso do app" conta 1 escalação na semana
- **Requisitos que atravessa**: SIM-20, SIM-30, SIM-47, SIM-61

## J-24 — Lançar a partida pré-marcada pela escalação
- **Quem**: admin do grupo
- **Passos**: 1. depois da J-22, abrir "Lançar partida de qui, dd/mm" · 2. trocar um jogador para ausente · 3. salvar
- **Resultado esperado**: a faixa "Pré-marcado pela escalação de dd/mm (inclui quem ficou como “não entra”)." com todos da escalação presentes; a partida é gravada com as marcações finais e o ranking a mostra
- **Requisitos que atravessa**: SIM-77, PAR-17, PAR-22

## Feature 6: financeiro

## J-25 — Caixa do mês da pelada
- **Quem**: organizadora (criadora do grupo, com acesso ao financeiro)
- **Passos**: 1. abrir Financeiro no início do grupo e tocar "Configurar caixa" · 2. informar mensalidade R$ 75,00, saldo inicial R$ 350,00 e a data · 3. marcar o pagamento de Toninho no mês · 4. lançar a saída "Aluguel da quadra outubro" de R$ 800,00 · 5. desmarcar o pagamento de Toninho
- **Resultado esperado**: depois do passo 3 aparece a entrada "Mensalidade Toninho MM/AAAA" de R$ 75,00 com a data de hoje e o saldo sobe R$ 75,00; a saída reduz o saldo em R$ 800,00; "Não pagaram" conta só os ativos no mês; desmarcar remove a entrada e o saldo volta; o cartão do início mostra o saldo atual
- **Requisitos que atravessa**: FIN-01, FIN-07, FIN-10, FIN-11, FIN-15, FIN-16, FIN-22, FIN-25, FIN-34

## J-26 — Permissão do financeiro
- **Quem**: admin convidado e a criadora do grupo
- **Passos**: 1. o convidado abre o início e o Financeiro do grupo · 2. a criadora abre Admins e liga "Acessa financeiro" do convidado · 3. o convidado abre de novo e tenta desligar o próprio acesso
- **Resultado esperado**: no passo 1 o início não mostra saldo e o Financeiro mostra "Sem acesso" (403 `sem_permissao_financeiro`); depois do passo 2 ele vê o saldo e o caixa; no passo 3 o próprio interruptor está desabilitado e a API responde 409 `acao_na_propria_conta`
- **Requisitos que atravessa**: FIN-33, FIN-34, FIN-35, FIN-36, FIN-51

## Feature 7: planos-e-cobranca

## J-27 — Assinar o Pro e virar Pro pelo pagamento
- **Quem**: criadora do grupo
- **Passos**: 1. abrir Meu plano com o grupo em trial · 2. assinar com nome e CPF · 3. abrir a fatura · 4. o Asaas (sandbox) confirma o pagamento pelo webhook · 5. reabrir Meu plano
- **Resultado esperado**: "Aguardando a confirmação do pagamento" e depois "Pro", com a data de `pagoAte`; o CPF não fica gravado em lugar nenhum
- **Requisitos que atravessa**: PLA-29, PLA-30, PLA-31, PLA-35, PLA-44, PLA-52, PLA-53, PLA-54

## J-28 — Trial vence e o grupo cai para o Free sem perder nada
- **Quem**: organizador de um grupo com 21 jogadores ativos
- **Passos**: 1. chega o 15º dia (fuso de São Paulo) · 2. abrir o grupo e tentar lançar partida · 3. inativar um jogador · 4. lançar de novo
- **Resultado esperado**: faixa de somente leitura e 403 no lançamento; inativar funciona; depois disso a partida é aceita; o ranking público segue aberto o tempo todo
- **Requisitos que atravessa**: PLA-03, PLA-15, PLA-18, PLA-19, PLA-20, PLA-22

## J-29 — Recursos Pro travados no Free
- **Quem**: admin de um grupo Free
- **Passos**: 1. abrir o simulador e o financeiro · 2. abrir o ranking público
- **Resultado esperado**: aviso de recurso Pro com "R$ 9,90/mês"; o financeiro mostra os dados mas não deixa escrever; o ranking público aparece sem "Exportar PDF"
- **Requisitos que atravessa**: PLA-23, PLA-24, PLA-25, PLA-26, PLA-27

## J-30 — Admin convidada vê o plano sem os botões
- **Quem**: admin convidada
- **Passos**: 1. abrir Meu plano
- **Resultado esperado**: o plano aparece com "Só quem criou o grupo pode assinar ou cancelar" e sem os botões de assinar e cancelar
- **Requisitos que atravessa**: PLA-57, PLA-59

## J-31 — Cancelar a assinatura
- **Quem**: criadora do grupo
- **Passos**: 1. cancelar em Meu plano e confirmar · 2. com o Asaas fora do ar, tentar de novo
- **Resultado esperado**: o grupo segue Pro até `pagoAte` e depois vira Free; com o Asaas fora, a resposta é 502 e o grupo continua `ativo`
- **Requisitos que atravessa**: PLA-04, PLA-55, PLA-56

## J-32 — Visitante conhece os planos
- **Quem**: visitante sem conta
- **Passos**: 1. abrir `/` · 2. abrir `/?aviso=conta-excluida` · 3. com sessão, abrir `/`
- **Resultado esperado**: os planos lado a lado com os preços; a faixa "Sua conta foi excluída"; com sessão, vai para `/app`
- **Requisitos que atravessa**: PLA-61, PLA-62, PLA-63, PLA-64, PLA-65

## J-33 — Cortesia do grupo de teste
- **Quem**: dono do app
- **Passos**: 1. rodar o ensaio da migração sobre um dump da produção (AD-033)
- **Resultado esperado**: o grupo de teste continua em cortesia, os demais grupos passam a trial e a contagem de linhas não muda
- **Requisitos que atravessa**: PLA-11, PLA-12

## Feature 8: notificacoes

## J-34 — Assinar o ranking, receber o aviso e cancelar
- **Quem**: jogador sem conta, no celular, e admin do grupo
- **Passos**: 1. abrir `/g/:slug` de um grupo Pro ou em trial · 2. tocar em "Receber avisos do ranking" e conceder a permissão · 3. o admin lança a partida do dia · 4. tocar na notificação "Ranking atualizado" · 5. tocar em "Parar de receber avisos"
- **Resultado esperado**: estado "assinado"; até 1 min depois do lançamento chega "<grupo>: partida de dd/mm", sem dado de jogador; o toque abre `/g/<slug>?mes=AAAA-MM`; depois de cancelar, a assinatura some do banco e a tela volta a "Receber avisos do ranking" (no E2E, o push é simulado por um serviço de push falso)
- **Requisitos que atravessa**: NOT-02, NOT-05, NOT-13, NOT-16, NOT-17, NOT-20, NOT-25, NOT-26, NOT-27, NOT-35, NOT-37, NOT-64
