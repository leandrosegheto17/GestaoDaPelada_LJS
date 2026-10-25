# ADR-010: Fase 1 inteira no subdomínio gratuito *.workers.dev, preparando desde já uma troca barata de domínio

- **Status:** Superseded by ADR-020
- **Data:** 2026-10-16
- **Decisores:** usuário (ficar sem domínio próprio na Fase 1); Coordenador (nome do host e preparação da troca)
- **Requisitos:** RF-29, RF-34, RF-53, RF-55, RNF-08, RNF-11; ADR-003, ADR-009, ADR-014, ADR-016

> O nome do arquivo ("dominio-proprio-desde-o-i1") vem da proposta original da rodada 1 e foi mantido para não quebrar links. A decisão aceita é a do título acima.

## Contexto

O app roda num Cloudflare Worker (ADR-014), servido de graça em `<worker>.<subdominio-da-conta>.workers.dev`. A rodada 2 mostrou que esse endereço atende tecnicamente a tudo:
- cookie `__Host-` preso ao host e na mesma origem (ADR-003);
- PWA instalável;
- `assetlinks.json` da TWA, servido pelo próprio Worker.

O custo está numa **troca futura** de endereço: apps instalados, sessões, grupo lembrado, links enviados e a versão da TWA. Na rodada 3, o usuário escolheu ficar no `workers.dev` durante toda a Fase 1, sem custo, e aceitou esse risco.

## Decisão

1. **Host de produção:** `pelada.gestaodapelada.workers.dev`.
   - **Subdomínio da conta Cloudflare:** `gestaodapelada`. É configurado uma vez por conta e vale para todos os Workers dela. Se a conta já tiver outro subdomínio, por exemplo por causa do keep-alive do MyMoney, que não tem rota HTTP pública, trocar para `gestaodapelada` não afeta esse Worker. Se o subdomínio estiver indisponível, usar `gestao-pelada` ou `peladaapp`.
   - **Nome do Worker de produção:** `pelada`. Ele compõe a URL, então não muda mais depois de o link ir ao grupo.
   - **Worker de homologação:** `pelada-teste`, que fica em `pelada-teste.gestaodapelada.workers.dev`.
   - Exemplo de link do ranking: `https://pelada.gestaodapelada.workers.dev/g/pelada-do-leandro`.
2. **O que já é preparado agora para baratear uma troca futura.** Tudo isso entra no TASK.md como critério de aceite, e não como trabalho extra depois:
   - **Nenhuma URL absoluta no código ou no banco.** A tela e a API usam caminhos relativos. O banco guarda só o slug (ADR-016). A URL pública completa (link copiável, rodapé do PDF, manifesto) vem de **uma** variável de configuração do Worker, `URL_PUBLICA`.
   - **Cookie sem `Domain=`** (`__Host-`): ele já funciona em qualquer host, sem mudança.
   - **Sinal de mudança de endereço:** a resposta de `GET /api/sessao/eu` e a do ranking público trazem o campo opcional `enderecoNovo`, vindo da variável `ENDERECO_NOVO`, vazia na Fase 1. Quando o campo vier preenchido, o PWA mostra a faixa "O app mudou de endereço. Abrir o novo endereço e reinstalar", com o link já na rota atual (ex.: `<novo>/g/<slug>`, para o grupo ser lembrado no novo host).
     - **Por quê:** o app instalado usa o shell guardado pelo service worker e **não veria um redirecionamento 301**. O aviso precisa vir de dentro do próprio app.
   - **Service worker com saída de emergência:** ao receber `enderecoNovo`, o SW deixa de servir o app shell do cache para navegações (a página passa a vir da rede, já redirecionada). Assim, um app antigo instalado não fica preso ao endereço velho.
   - **Plano de redirecionamento (executado só na troca, não agora):**
     - o Worker `pelada` publica `ENDERECO_NOVO` e mantém a API respondendo por um período de transição;
     - depois disso, vira um Worker mínimo de **301 que preserva caminho e query** para o novo host;
     - esse Worker continua servindo o `assetlinks.json` antigo. Ele fica no ar de graça, por tempo indeterminado.
   - **TWA independente do domínio:**
     - o **nome do pacote Android** é `com.gestaodapelada.app`. Ele não precisa ser um domínio do qual sejamos donos e **nunca muda**;
     - a chave de assinatura fica na **Play App Signing**, e a chave de upload fica guardada no gerenciador de senhas;
     - o host fica num único campo do `twa-manifest.json`;
     - trocar de domínio = publicar uma **nova versão do mesmo app** com o host novo e o `assetlinks.json` no domínio novo.
   - **Nada de identidade presa ao host além do inevitável:** o grupo lembrado e o identificador anônimo são recriados no novo host na primeira abertura pelo link novo (o próprio link já traz o slug).

## Consequências

**Positivas**
- R$ 0 com domínio na Fase 1.
- Se a Fase 2 acontecer, a troca vira um procedimento conhecido: definir `ENDERECO_NOVO`, publicar a nova versão da TWA e trocar o Worker antigo por um redirecionamento. Não há reengenharia.

**Negativas (risco T-18, aceito pelo usuário)**
- Na troca, cada jogador com o app instalado precisa reinstalar (guiado pela faixa).
- Todos os admins entram de novo uma vez.
- A métrica M2 conta os aparelhos como novos na semana da troca.
- A TWA precisa de uma versão nova na Play.
- O endereço é longo e com cara de "provisório" no WhatsApp e no PDF. Isso foi aceito para a Fase 1.
- O nome `gestaodapelada` no subdomínio da conta e `pelada` no Worker ficam **fixos** enquanto durar o `workers.dev`.

## Alternativas consideradas

1. **`.com.br` no Registro.br (cerca de R$ 40 por ano) antes do I1.** Evitaria a troca. Recusada pelo usuário na Fase 1.
2. **`.com` pelo Cloudflare Registrar (cerca de US$ 10 por ano).** Idem.
3. **`*.pages.dev`.** O app não é um projeto Pages (ADR-014). Descartada.
