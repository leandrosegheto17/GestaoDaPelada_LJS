# ADR-016: Link público do grupo legível por slug (/g/pelada-do-leandro), estável e nunca reutilizado; enumeração de grupos aceita pelo usuário

- **Status:** Accepted (decisão do usuário, rodada 2 do Loop B)
- **Data:** 2026-10-16
- **Decisores:** usuário (formato legível); Coordenador (regra de geração)
- **Requisitos:** RF-02, RF-03, RF-08, RF-09, RF-29, RF-33, RF-34

## Contexto

Na rodada 1, o Coordenador propôs um código aleatório no link do ranking (cerca de 50 bits) para impedir a enumeração de grupos. O usuário preferiu o formato **legível**, porque a visão pública só mostra apelido, posição, pontos e presenças (RF-33) e ele não vê informação sensível nisso.

O link é gravado em vários lugares:
- mensagens do WhatsApp;
- apps instalados;
- grupo lembrado no aparelho;
- rodapé do PDF.

Por isso, ele não pode mudar sem ação explícita, nem passar a apontar para outro grupo.

## Decisão

1. **Geração na criação do grupo** (RF-02), no servidor (domínio):
   - parte do nome do grupo;
   - passa para minúsculas e remove acentos (normalização NFD sem marcas);
   - troca qualquer sequência que não seja `a-z0-9` por `-` e tira os `-` das pontas;
   - corta em 40 caracteres sem deixar `-` no fim.
   - Resultado vazio ou com menos de 3 caracteres: usa `grupo`.
2. **Colisão:** se o slug já existir (inclusive em grupo arquivado), acrescenta `-2`, `-3`… até ficar livre. A unicidade é garantida por índice único no banco: numa disputa entre duas criações, o servidor tenta de novo com o próximo sufixo.
3. **Palavras reservadas** recusadas como slug: `admin`, `api`, `dono`, `entrar`, `g`, `privacidade`, `conta`, `assets`, `well-known`. Elas recebem o sufixo `-grupo`.
4. **Estável:** **renomear o grupo (RF-08) não muda o slug.** A T20 avisa "Mudar o nome não muda o link". Não há edição de slug na Fase 1.
5. **Nunca reutilizado:** o slug de um grupo arquivado continua reservado para ele. O link antigo mostra "Grupo indisponível" (RF-03) e nunca passa a mostrar outro grupo.
6. **Nome do parâmetro de rota:** as rotas públicas passam a ser `/api/publico/:slug/...` e `/g/:slug`. Onde os ADR-005, 008 e 009 (que não foram editados, por serem imutáveis) escrevem `:codigo`, leia-se `:slug`.
7. **Resposta igual para inexistente e arquivado:** as duas recebem a mesma tela "Grupo indisponível" (RF-09), sem revelar a diferença.

## Consequências

**Positivas**
- O link é legível no WhatsApp e no PDF, e fácil de ditar.
- É estável diante de mudança de nome e não é reutilizado.

**Negativas (risco aceito pelo usuário)**
- **Os grupos podem ser enumerados:** qualquer pessoa pode tentar `/g/<nome-provável>` e ver o ranking público de outro grupo (apelidos, pontos e presenças). Isso está registrado no SDD §6 (T-13) e §7.
  - Na Fase 1, com até 5 grupos de amigos, o impacto é baixo.
  - **Na Fase 2**, com grupos de terceiros, reavaliar: opção de link privado por grupo, ou um sufixo aleatório curto (`/g/pelada-do-leandro-7k2m`).
- O nome do grupo fica no link para sempre, mesmo depois de um renome. Isso é aceito (item 4). Uma mudança de slug, se pedida no futuro, exige redirecionamento do antigo.
- Mitigação parcial contra varredura em massa: a regra gratuita de limite de taxa da Cloudflare em `/api/publico/*` (ADR-014).

## Alternativas consideradas

1. **Código aleatório** (proposta da rodada 1). Não pode ser enumerado, mas é ilegível. Recusada pelo usuário.
2. **Slug legível + sufixo aleatório curto.** Equilíbrio entre os dois, mas o usuário preferiu o formato limpo. Fica registrada para a Fase 2.
3. **Slug que acompanha o nome do grupo.** Quebraria os links já enviados a cada renome. Descartada.
