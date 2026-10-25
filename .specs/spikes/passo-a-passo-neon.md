# Passo a passo: acesso aos spikes S1 e S2

Objetivo: dar à sessão uma branch descartável do Neon e um Hyperdrive de teste, sem tocar na produção.

## Etapa 1: criar a branch no Neon

1. Abra https://console.neon.tech e entre no projeto do Gestão da Pelada (o mesmo do banco de produção).
2. No menu lateral, clique em **Branches** e depois em **Create branch**.
3. Nome: `spike-descartavel`. Em *Parent branch*, deixe a principal (`main` ou `production`). Crie.
4. No painel da branch, clique em **Connect** (ou **Connection details**).
5. Confira:
   - o seletor de *Branch* mostra `spike-descartavel`;
   - *Role* é `neondb_owner`;
   - **Pooled connection** está **desligado**.
6. Copie a URL que começa com `postgresql://`. Não cole essa URL no chat.

## Etapa 2: criar o Hyperdrive (só o S1 usa)

Escolha um caminho.

- **Pelo painel:** https://dash.cloudflare.com > **Storage & Databases** > **Hyperdrive** > **Create configuration**. Nome `spike-s1`, cole a URL da etapa 1, deixe o cache desligado (*Caching disabled*). Depois de criar, copie o **ID** da configuração.
- **Pelo terminal:** `npx wrangler login` (uma vez) e depois
  `npx wrangler hyperdrive create spike-s1 --connection-string="<a URL>" --caching-disabled`
  O comando imprime o ID.

## Etapa 3: gravar o arquivo

Crie o arquivo `C:\Leandro\Projetos\GestaoDaPelada_LJS\.worktrees\fundacao\.specs\spikes\.env`
(no Bloco de Notas, salvando com o nome exato `.env`, sem `.txt` no fim), com duas linhas:

```
NEON_BRANCH_URL_DIRETA=postgresql://...(a URL da etapa 1)
HYPERDRIVE_ID=...(o ID da etapa 2)
```

O git ignora esse arquivo; ele não vai para o repositório.

## Depois

A sessão confere só os nomes das chaves (sem mostrar valores) e despacha o lote 1.
Ao fim dos spikes, a branch `spike-descartavel` e o Hyperdrive `spike-s1` são apagados, com a sua confirmação.
