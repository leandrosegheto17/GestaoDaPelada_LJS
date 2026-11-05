---
name: preparar
description: Prepara a infraestrutura do projeto de forma guiada com o usuário, em dois níveis gravados em .specs/preparacao.md — Nível 1 síncrono (repositório e remoto, ambiente local com banco, esqueleto ponta a ponta, CI, testes.json, pré-voo e hook de commit), necessário antes do /executar, e Nível 2 assíncrono (staging, produção, domínios, segredos, backup, observabilidade e deploy), que pode andar em paralelo e fecha até o fim da execução. Use depois que o fluxo disser que o plano está disponível, ou quando o usuário digitar /preparar. Não escreve código de feature (isso é do /executar) nem lança em produção (isso é do /finalizar).
model: sonnet
effort: medium
---

# /preparar

Você conduz, **junto com o usuário**, a infraestrutura do projeto. Nada de feature aqui: só o chão onde o `/executar` vai construir e onde o `/finalizar` vai lançar.

Roda em **Sonnet**. Se a sessão estiver em outro modelo, aplique a trava de modelo do `CLAUDE.md`.

`/preparar` e `/executar` podem rodar **em paralelo**, em sessões diferentes. A única amarra é o Nível 1: o `/executar` recusa começar sem ele.

## 1. Situar

Leia `.specs/preparacao.md`, se existir, e mostre o estado dos dois níveis (`python .claude/scripts/preparacao.py`). Sem arquivo, é a primeira vez: siga para o passo 2. Com arquivo, retome no primeiro item aberto, começando pelo Nível 1.

## 2. Montar o roteiro

Leia o que o projeto já decidiu (`.specs/produto/necessidade.md` ou `decisao.md`, o `design.md`, o `tasks.md`) e proponha a lista de itens dos dois níveis, adaptada ao projeto, no formato de [references/modelo.md](references/modelo.md). Itens que não se aplicam saem (ex.: "banco" num projeto sem banco), com o motivo no arquivo. Mostre a lista e peça ajuste via `AskUserQuestion` (**seguir / ajustar / parar**); depois grave `.specs/preparacao.md`.

## 3. Nível 1: síncrono, com o usuário

Faça um item por vez, **mostrando o que vai fazer e o resultado**. Marque `[x]` só com evidência (comando que rodou, saída). Itens típicos:

1. **Repositório e remoto:** `git init` se faltar, branch base definida, remoto configurado. Criar o repositório remoto ou dar `push` é ação externa: confirmação específica.
2. **Ambiente local reproduzível:** `docker compose` (ou equivalente) que sobe com um comando, banco com a carga inicial. O que for do projeto (porta, comando de subida) vai no `CLAUDE.md` da raiz do projeto.
3. **Esqueleto ponta a ponta:** a menor fatia que atravessa todas as camadas e roda.
4. **Comando de teste:** grave `.specs/projeto/testes.json` (a trava usa) e um teste que roda, com **reporter mínimo** (ex.: `--reporter=dot`), para a saída verde ocupar uma linha.
5. **CI:** pipeline que roda a suíte em cada push/PR; confira uma execução verde.
6. **Pré-voo:** `python .claude/scripts/preparar-ambiente.py` sem pendência.
7. **Hook de commit:** o `commit-msg` instalado (`instalar.py`) ou conferido.

Ao fechar o Nível 1, rode `python .claude/scripts/preparacao.py --nivel1` e diga: **"Nível 1 completo: o /executar já pode começar."**

## 4. Nível 2: assíncrono

Pode ser feito agora, em outra hora ou em paralelo à execução. Mesma regra: um item por vez, com evidência. Itens típicos: staging, produção, domínio e DNS, segredos dos ambientes, banco gerenciado, backup agendado e **restauração testada**, observabilidade, pipeline de deploy.

- Para Docker local e nuvem gratuita, siga `.claude/skills/implantacao/references/destinos.md` (limites de plano gratuito: pergunte ao `pesquisador`, nunca de memória).
- **Segredos** nunca entram no repositório: variáveis do serviço ou `.env` fora do git.
- **Tudo o que cria recurso fora da máquina, custa dinheiro ou publica** exige confirmação específica via `AskUserQuestion`, dizendo o serviço, o custo e o que será enviado. Banco de produção: nunca sem confirmação.
- **Não publique a aplicação**: o lançamento é do `/finalizar`. Aqui se deixa o ambiente pronto e testado (teste de fumaça com a versão do esqueleto).

## 5. Fechar

Mostre `python .claude/scripts/preparacao.py` e o que ficou aberto. Se o Nível 2 estiver aberto, diga que ele deve fechar até o fim da execução e que o `/finalizar` só começa com ele completo.

## Regras

- Itens só ficam `[x]` com evidência registrada na linha do item.
- Parar é válido: o arquivo guarda o estado e `/preparar` retoma.
- Contexto grande: se o `contexto.py` passar do limite, pare e peça `/clear` e `/preparar`; o estado está no arquivo.
- Tudo em português.
