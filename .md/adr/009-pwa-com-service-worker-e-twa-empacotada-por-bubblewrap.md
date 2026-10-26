# ADR-009: PWA com service worker (app shell em precache e último ranking em cache para leitura sem conexão); TWA empacotada por Bubblewrap da mesma URL

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-34, RF-53, RF-54, RF-55, RF-56, RNF-01, RNF-03, RNF-11; PR-06, PR-13

## Contexto

Requisitos que este ADR atende:
- **Instalação:** o app precisa ser instalável no Android (Chrome) e no iPhone (Safari 16.4+), abrindo em tela cheia (RF-53).
- **Sem conexão:** deve mostrar o último ranking carregado, com aviso, enquanto as funções administrativas exigem conexão (RF-54, Should).
- **Grupo lembrado:** deve lembrar o grupo do link para a próxima abertura do app instalado (RF-34).
- **Identificador anônimo:** gerado por dispositivo (RF-56).
- **TWA:** distribuída pela Google Play, empacotando a mesma URL, com o domínio verificado (RF-55), e o PWA cumpre a instalabilidade do Chrome (RNF-11).

## Decisão

1. **Manifesto e service worker gerados no build** (plugin PWA do Vite, com Workbox):
   - **precache** do app shell (HTML, JS, CSS, fontes, ícones);
   - **`/api/publico/:codigo/ranking*`**: estratégia *network-first*, com espera de 3 s antes de cair no cache; a resposta vem com `geradoEm`, e a tela mostra "sem conexão, atualizado em dd/mm hh:mm" quando a resposta vier do cache;
   - **todas as outras rotas `/api/*`:** só rede, nunca em cache (dados administrativos e privados não ficam no aparelho).
2. **Primeira pintura rápida:** a tela do ranking lê, ao abrir, a última resposta guardada pela própria aplicação em IndexedDB, mostra na hora e substitui quando a rede responde (*stale-while-revalidate* na camada de dados). Isso protege o p75 de 2 s contra a partida a frio (ADR-002).
3. **Grupo lembrado e identificador anônimo** ficam no armazenamento local do app (IndexedDB, com espelho em `localStorage`). A abertura em `/` redireciona para o último grupo lembrado. Sem grupo lembrado, mostra "Peça o link ao admin do seu grupo".
   - Se o Safari apagar esses dados fora do app instalado (limite de 7 dias), o efeito é pequeno: o jogador abre o link de novo, e um novo identificador anônimo é gerado. Esse identificador novo pode contar o mesmo aparelho duas vezes numa semana (risco T-07 do SDD).
4. **Instruções para o iPhone:** no Safari do iOS fora do modo instalado (`display-mode` ≠ `standalone`), a tela mostra um aviso fechável com "Adicionar à Tela de Início" (RF-53).
5. **TWA:**
   - projeto Android gerado pelo **Bubblewrap** a partir do manifesto, versionado em `frontend/twa/`;
   - `/.well-known/assetlinks.json` servido pelo PWA, com a impressão digital da chave de assinatura da Play;
   - sem código nativo e sem funcionalidade exclusiva.
   - A publicação segue PR-13: teste fechado com 12 testadores por 14 dias logo após o I1, e só depois produção.

## Consequências

**Positivas**
- O ranking abre na hora em visitas repetidas, mesmo com a função ou o banco frios.
- Nenhum dado privado fica em cache no aparelho, só a projeção pública, que já é pública.
- A TWA é a mesma aplicação: uma base de código e zero esforço de manutenção extra além da publicação.

**Negativas**
- **A primeira visita de um aparelho novo** não tem cache e paga a partida a frio inteira (risco T-01 do SDD).
- **O service worker exige cuidado com versões:** um app shell desatualizado chamando uma API nova. Mitigação: atualização automática do SW na abertura seguinte, e a API mantém compatibilidade com a versão anterior do PWA por um deploy (regra do GUARDRAILS proposta no Loop C).
- **A TWA amarra o domínio:** trocar de domínio exige publicar um app novo na Play (ADR-010).
- **O teste fechado depende de 12 pessoas** ficarem inscritas por 14 dias (PR-13), o que está fora do controle técnico.

## Alternativas consideradas

1. **Sem service worker de dados (só o app shell).** Mais simples, mas perde o RF-54 e a mitigação de partida a frio. Descartada.
2. **Cache de todas as rotas, inclusive as administrativas.** Deixaria dado pessoal (telefone, notas, financeiro) no aparelho, o que contraria a minimização da LGPD (PR-09). Descartada.
3. **App Android nativo ou Capacitor em vez de TWA.** Mais manutenção e uma segunda base, sem nenhum requisito que a TWA não atenda. Descartada.
