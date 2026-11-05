---
name: rascunho
description: Primeira passada de construção de um projeto do zero (fluxos 1 e 2, tasks.md com "Passada - rascunho") — na sessão principal, sem skills e sem subagentes, escreve os testes a partir dos critérios e o código de cada lote direto na Branch pai (sem worktree), commita por tarefa, e não roda nada (nem testes, nem typecheck, nem lint, nem build). Marca as tarefas como rascunhadas; quem roda, corrige e leva ao verde é o /executar. Use quando o fluxo disser que o plano está disponível e o tasks.md pedir a passada de rascunho. Não executa, não valida e não faz push.
model: opus
effort: medium
---

# /rascunho

Você **só escreve**. Teste e código de cada lote, na ordem do `tasks.md`, **sem executar nada**: nenhum teste, `typecheck`, lint, build, servidor, banco ou instalação de dependência. Nada de skills, nada de subagentes. O que roda e fica verde é do `/executar`; o que é verificado de ponta a ponta é do `/validar`. Roda em **Opus** (trava de modelo do `CLAUDE.md`): como o código nasce sem a suíte à frente, o raciocínio fica por conta de quem escreve. O `/executar` seguinte volta a **Sonnet**.

Motivo: escrever tudo de uma vez, sem parar para o ciclo de rodar e corrigir, é mais rápido e mantém o contexto pequeno; o `/executar` depois corrige com a suíte à frente.

## 1. Qual feature

1. Liste os `tasks.md` de `.specs/` com tarefa em aberto (`python .claude/scripts/progresso.py`). Respeite o argumento. Mais de uma: pergunte qual via `AskUserQuestion`.
2. O `tasks.md` precisa ter `**Passada**: rascunho` no topo. Sem a linha, **recuse** e mande rodar `/executar`. É a única verificação: nada de `preparacao.py`, worktree ou ambiente.
3. **Trabalhe direto na Branch pai** (a do topo do `tasks.md`, padrão `main`), na pasta do projeto. Sem worktree e sem branch de feature: o `/executar` cria a worktree a partir dela e os commits de cada tarefa já estão lá.

## 2. Os lotes

`python .claude/scripts/progresso.py --lote --rascunho` diz o **primeiro lote ainda não rascunhado** (sai com 1 e "Todos os lotes já foram rascunhados" quando acabou). Para cada lote, na ordem do Execution Plan:

1. Siga o molde da vizinhança e a decisão nomeada em **Reuses**, literalmente.
2. **Testes primeiro, a partir dos critérios de aceite**, conforme a Test Coverage Matrix; no lote **crítico**, também o que o erro deixaria passar em silêncio (seção Execução do `CLAUDE.md`). Depois o código. Arquivos do lote em chamadas paralelas.
3. Tarefa de `**Domínio**: sim`: liste os casos limite antes de codar. Onde a spec não define o resultado, **não pare**: deixe `[LACUNA] <o quê>` num comentário no código e uma linha `Lacunas:` na tarefa do `tasks.md`, siga com a interpretação mais conservadora; o `/executar` pergunta antes de levar a tarefa ao verde.
4. **Sem rodar nada** (nem teste, typecheck, lint, build, servidor ou instalação). Nenhuma releitura de conferência além do necessário para escrever.
5. **Um commit local por tarefa finalizada**, em português, citando `Tn` e `FUN-NN`, com `Molde:` no corpo. O mesmo commit grava `**Status**: rascunhada` na tarefa (a caixa `- [ ]` fica aberta). Nenhum commit afirma que algo passa, e ele não precisa fechar verde; só vale que nada importe arquivo que só nasce em tarefa posterior. Sem commit de fechamento de lote.
6. **Contexto, só a cada 5 lotes rascunhados** (e não a cada lote): `python .claude/scripts/contexto.py --comando rascunho`. Saída 1 (acima de 300k, ou do `limite_contexto` de `.specs/projeto/execucao.json`): **pare**, diga só "Contexto acima do limite: rode /clear e depois /rascunho". Saída 2: siga. O estado está no `tasks.md` e no git.

Lote de **retrabalho** não passa por aqui: vai direto ao `/executar`.

## 3. Fim

Com todos os lotes rascunhados, sem gate, sem merge e sem pergunta: consulte o roteiro (`.specs/projeto/roadmap.md`). Havendo feature seguinte com `tasks.md` de `**Passada**: rascunho` ainda não rascunhado, siga para ela direto (seção 1). Senão, diga apenas **"Projeto rascunhado: rode /executar."** Publicar o rascunho e a ordem do `/executar` e do `/validar` são do usuário; não publique nem faça deploy.

## Regras

- **Nada executa.** Nem para "só conferir". Dúvida de sintaxe se resolve lendo o código e a documentação.
- Nunca pule, comente ou enfraqueça um teste para "caber": ele é a prova do critério, e vai ser rodado pelo `/executar`.
- Nada de "já que estou aqui": só o escopo das tarefas. Divergiu da spec ou do desenho: `SPEC_DEVIATION: <o quê>` no código e no commit.
- **Sem push, sem PR, sem merge, sem deploy.** Só commits locais na Branch pai.
- Tarefa de interface: só `tokens.css` e os componentes do guia; a prova de tela é do `/executar`.
- Tudo em português.
