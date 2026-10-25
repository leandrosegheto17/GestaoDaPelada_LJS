# ADR-003: Sessão do admin por cookie HttpOnly opaco, definido pelo próprio domínio e guardado no banco

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-11, RF-14, RF-15, RF-17, RNF-05 (sessão expira após 30 dias sem uso); PR-06

## Contexto

O risco PR-06 pede que a sessão do admin no iPhone não dependa de mecanismo sujeito ao limite de 7 dias do Safari (ITP). O que se sabe hoje:

- **Ficam sujeitos ao limite:** o `localStorage`/IndexedDB do Safari fora do app instalado e os cookies criados por JavaScript (`document.cookie`).
- **Também ficam sujeitos, desde o Safari 16.4:** cookies definidos por `Set-Cookie` de um servidor cujo IP não bate com o do site, como uma API em outro domínio ou em outra rede.
- **Não ficam sujeitos:** cookies definidos por `Set-Cookie` pelo **mesmo** site, com o mesmo IP.
- O app instalado na tela de início tem armazenamento e cookies **separados** do Safari, com contador próprio.

Requisitos que a sessão precisa cumprir:
- expira após 30 dias sem uso (RNF-05);
- remover um admin do grupo encerra o acesso dele ao grupo (RF-15);
- "Sair" encerra a sessão no dispositivo (RF-17);
- uma sessão aberta com senha temporária só pode trocar a senha (RF-14).

## Decisão

- Ao entrar, a API gera um **token aleatório de 256 bits** e o devolve num cookie `__Host-sessao`, com os atributos:
  - `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`;
  - `Max-Age` de 30 dias.
- O cookie é definido pela API, que roda no **mesmo domínio e na mesma origem** do PWA (ADR-001, ADR-002).
- O banco guarda só o **hash SHA-256** do token, com: conta, criação, último uso, expiração e escopo (`completo` ou `troca_de_senha`).
- **Expiração deslizante:** a cada requisição autenticada, se o último uso tiver mais de 24 h, a API renova a expiração para 30 dias depois e reenvia o cookie. Uma sessão sem uso por 30 dias expira.
- **Autorização a cada requisição:** a permissão por grupo é lida no banco a cada requisição, nunca gravada na sessão. Ao remover o vínculo, o acesso ao grupo acaba na hora, sem revogar a sessão.
- **Ações que encerram sessões:**
  - "Sair" apaga a sessão do dispositivo;
  - redefinir a senha (pelo dono ou por outro admin) e trocar a própria senha apagam **todas** as outras sessões da conta.
- **Proteção contra CSRF:** `SameSite=Lax`, e toda escrita exige `Content-Type: application/json` e o cabeçalho `X-Requested-With`. Essas duas exigências não podem ser forjadas por formulário de outro site.

## Consequências

**Positivas**
- O cookie é de primeira parte, definido pelo servidor do mesmo IP, e não sofre o limite de 7 dias do ITP. O app instalado mantém a sessão enquanto houver uso a cada 30 dias.
- O token é invisível ao JavaScript (`HttpOnly`), o que reduz o impacto de um XSS.
- A revogação é imediata e funciona nos servidores sem estado (função serverless).

**Negativas**
- **Uma consulta ao banco por requisição autenticada** (sessão e vínculo). Isso é aceitável no volume (RNF-09), mas soma latência na partida a frio.
- **O app instalado no iPhone tem cookies separados do Safari:** o admin precisa entrar uma vez em cada um (navegador e app instalado). Isso é registrado na experiência (UX-SPEC §7).
- **Risco residual:** o próprio iOS pode limpar dados de um app instalado sem uso por muito tempo. O relato do WebKit Bugzilla 237350 tem ligação com isso. A validação é em iPhone real no fim do I1 (PR-06). Se a sessão cair, o efeito é só pedir login de novo, sem perda de dado.
- O domínio próprio passa a ser importante: trocar de domínio derruba todas as sessões e o grupo lembrado (ADR-010).

## Alternativas consideradas

1. **JWT no `localStorage` (padrão de vários BaaS).** Está sujeito ao limite de 7 dias no Safari fora do app instalado e fica exposto a XSS. Também não tem revogação imediata sem lista de bloqueio. Descartada.
2. **JWT em cookie, sem estado no servidor.** Não atende ao "encerrar o acesso" de RF-15 e RF-17 sem uma lista de revogação, que traz de volta a consulta ao banco. Descartada: não ganha nada e acrescenta complexidade.
3. **API em subdomínio (`api.dominio`) com cookie no domínio pai.** Se o subdomínio resolver para outro IP (provedor diferente), cai na regra do Safari 16.4. Descartada.
