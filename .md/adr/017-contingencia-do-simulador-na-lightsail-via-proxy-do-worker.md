# ADR-017: Contingência do simulador: otimizar, depois mover só o cálculo para a Lightsail atrás de um proxy do Worker; Workers Paid só se o usuário mudar de ideia

- **Status:** Accepted (decisão do usuário, rodada 3 do Loop B). Plano de contingência: **nada é implementado agora**. Só é acionado se o spike S-02 falhar.
- **Data:** 2026-10-16
- **Decisores:** usuário (prefere a Lightsail ao Workers Paid e tolera lentidão na Fase 1); Coordenador (desenho do proxy)
- **Substitui:** a ordem de saída do ADR-014 §5 (que era otimizar → Workers Paid → Lightsail)
- **Requisitos:** RF-38 a RF-48, RNF-03, RNF-05, RNF-08, RF-09; ADR-003, ADR-005, ADR-007, ADR-014

## Contexto

No Workers Free, cada requisição tem 10 ms de CPU (ADR-014). A estimativa do `sugerir` do simulador é de 2 a 6 ms para 30 aptos, ainda sem medição. O spike S-02 mede isso no Worker publicado.

O usuário disse que lentidão não é problema nesta versão. Mas **estourar o limite de CPU não deixa o simulador lento: a Cloudflare interrompe a requisição e responde com erro (1102)**. Por isso, a contingência precisa tirar o cálculo do Worker, e não aceitar o estouro.

O usuário já paga uma máquina na AWS Lightsail e prefere usá-la ao Workers Paid (US$ 5 por mês).

O desenho precisa preservar três coisas:
- **o cookie de sessão** no mesmo host da tela (ADR-003);
- **o isolamento por grupo** decidido num só lugar (ADR-005);
- **a regra de negócio** num só pacote (ADR-007).

## Decisão

**Ordem de contingência se o S-02 falhar** (p99 do `sugerir` acima de 7 ms de CPU, ou qualquer erro 1102):

1. **Otimizar no próprio Worker:**
   - avaliação incremental;
   - vizinhança menor;
   - saída antecipada;
   - teto de iterações por tamanho de entrada.
   Medir de novo.
2. **Mover só o cálculo do simulador para a Lightsail**, atrás de um proxy do Worker (desenho abaixo). Latência maior é tolerada.
3. **Workers Paid:** só se o usuário mudar de ideia (custo de US$ 5 por mês, decisão dele).

**Desenho do passo 2 (o navegador nunca fala com a Lightsail):**

```
Navegador ──/api/grupos/:g/simulador/sugerir (cookie __Host-sessao)──▶ Worker pelada
   Worker: sessão + vínculo (ADR-005) ✔ → lê elenco, notas e partidas no Neon (Hyperdrive)
          → calcula a prioridade (RN-08, barato) → monta a ENTRADA PURA do domínio
          ──HTTPS + assinatura HMAC──▶ Lightsail: serviço "simulador" (Node + Hono + @pelada/dominio)
          ◀── sugestão (times, pares, indicadores, avisos) ──
   Worker: valida a resposta pelo contrato → devolve ao navegador
```

- **O que muda no código, quando acionado:** a `aplicacao/` do simulador passa a chamar uma **porta** `CalculadoraDeTimes`. Ela tem duas implementações:
  - local (chama `@pelada/dominio` direto, a padrão);
  - remota (`fetch` para a Lightsail).
  A escolha é por variável (`SIMULADOR_REMOTO_URL`). A rota, o contrato, a tela e a autorização não mudam.
- **Pode ir para a Lightsail:** só o `sugerir` e, se também estourar, o `avaliar`. A `previa` é aritmética e fica no Worker.
- **Serviço na Lightsail:**
  - **sem estado e sem acesso ao banco;**
  - recebe só o que o cálculo precisa: ids, apelidos, nível, idade, prioridade, "só 1º tempo", N, K e formato. Nada de telefone nem de financeiro;
  - responde só ao Worker.
- **Autenticação Worker → Lightsail:**
  - o cabeçalho leva `HMAC-SHA256(segredo, timestamp + corpo)`, com janela de 60 s;
  - o segredo fica em secret do Worker e em variável de ambiente na Lightsail;
  - o firewall da Lightsail abre só a porta 443;
  - a Lightsail recusa qualquer requisição sem assinatura válida.
- **TLS e nome:**
  - o Worker não faz `fetch` para IP puro, então a Lightsail precisa de um **hostname com TLS**;
  - use um domínio que a máquina já tenha, se houver, ou um DNS dinâmico gratuito (ex.: `pelada-sim.duckdns.org`);
  - o certificado é automático por Caddy (Let's Encrypt).
  - Alternativa sem expor porta: Cloudflare Tunnel até a máquina, desde que a conta tenha uma zona DNS ou o recurso de rede privada para Workers esteja disponível no plano grátis. Isso seria verificado só se a contingência for acionada.
- **Latência:** o tempo de espera do `fetch` **não conta como CPU** do Worker. Somam-se a ida e volta até a região da Lightsail e o cálculo, e o usuário aceita esse atraso.
- **Falha da Lightsail:** o simulador mostra "Não foi possível montar os times agora. Tente de novo." (estado de erro de T13/T14). **O resto do app não é afetado**: ranking, partidas e financeiro continuam no Worker.
- **Operação:**
  - o serviço roda como unidade `systemd` (ou container) com reinício automático;
  - o deploy é feito por um workflow manual (`deploy-simulador.yml`) que copia o build do pacote e reinicia o serviço.
  - Isso só passa a existir se o passo 2 for acionado.

## Consequências

**Positivas**
- O cookie, a origem e o isolamento ficam intactos: toda a autorização continua no Worker, e a Lightsail só calcula.
- O domínio continua num só pacote (`@pelada/dominio`), rodando em Node ou no workerd sem duplicação.
- Custo zero novo, já que a máquina já é paga.

**Negativas**
- Se acionado, entra uma máquina no caminho de **uma** função: há sistema operacional para manter, certificado e um segredo compartilhado.
- O simulador fica mais lento e passa a depender da disponibilidade da Lightsail.
- Mais um ponto para o Validador revisar (HMAC, firewall, TLS).

## Alternativas consideradas

1. **Aceitar o estouro como "lentidão".** Não é possível: o estouro é erro, não atraso. Descartada.
2. **Navegador chamando a Lightsail direto.** Quebraria o cookie na mesma origem e espalharia a autorização para outro serviço. Descartada.
3. **Workers Paid (US$ 5 por mês).** É o mais simples tecnicamente, mas o usuário prefere a Lightsail. Fica como 3ª opção.
4. **Rodar a API inteira na Lightsail.** Desfaria as vantagens do ADR-014 (sem partida a frio, sem servidor a manter) por causa de uma função só. Descartada.
