# Reprodução, teste planejado, causa raiz e plano da correção (fases 3 a 6)

Um arquivo só, preenchido aos poucos. Os campos do cabeçalho dizem em que fase o bug está: só passam de `pendente` com a evidência na seção correspondente.

## Reprodução (fase 3)

- Reproduza **localmente**, no menor caso possível: tire passos, dados e configuração até o erro sumir; o último que fez sumir faz parte do caso.
- Interface web: reproduza no navegador (Playwright, se o projeto tiver) e guarde a captura.
- Intermitente: rode muitas vezes e anote a taxa; procure dependência de tempo, ordem, concorrência ou estado compartilhado entre testes.
- Só em produção: compare versão, configuração e dados com o local antes de concluir "não reproduz".

## Teste que falha, planejado (fase 4)

Siga o passo vermelho do `test-driven-development` **como plano**: aqui o teste é descrito, não escrito (o código só muda no `/executar`; a tarefa T1 prova o vermelho):

- Nomeie antes qual mudança no código faria o teste passar; se não souber, o teste ainda não está claro.
- Teste do **comportamento esperado** (critério 1 do relato), pela entrada pública mais próxima do sintoma; mock só quando inevitável.
- Descreva a falha esperada: **pela asserção**, com a mensagem que corresponde ao sintoma. Erro de importação, digitação ou ambiente não conta.
- Na execução (T1): passou de primeira? O teste não reproduz o bug; pare e refaça o teste planejado.

## Causa raiz (fase 5)

Siga as fases 1 a 3 do `systematic-debugging` (investigação, padrão, hipótese). Checklist:

- **Leia o erro inteiro**: pilha, linha, código de erro.
- **O que mudou?** `git log` do trecho; se "antes funcionava", `git bisect` com o caso mínimo da fase 3 (ou o teste planejado, se já existir) como critério.
- **Siga o dado para trás**: onde o valor errado nasce, quem chamou com ele, até a origem.
- **Compare com o que funciona**: código parecido no projeto que não tem o defeito; liste toda diferença.
- **Uma hipótese por vez**: "acho que X é a causa porque Y"; teste com a menor mudança possível; errou, descarte e anote.
- **Erros silenciosos** (muitas vezes a origem real): `catch` vazio ou que só registra e segue, valor padrão devolvido no erro, `?.` ou `??` pulando operação que falhou, nova tentativa que esgota sem avisar, implementação falsa fora dos testes.
- **Pergunte "por quê"** até chegar a algo que, corrigido, impede o defeito (não só este sintoma).
- **Mesmo defeito em outros pontos**: o padrão da causa aparece em outro lugar? Liste. Mesma causa no mesmo trecho entra nesta correção, com teste; o resto vira relato próprio em `.specs/bugs/`.
- **Arquitetura**: cada correção tentada revela problema em outro lugar, ou a correção exige mudança grande? É falha de arquitetura: pare (saída de emergência da skill).

## Plano da correção (fase 6) e execução

O `tasks.md` planeja; o `/executar` faz:

- Mude **só a origem**; nada de remendo no sintoma, nada de refatorar junto.
- Teste do bug verde, suíte sem falha nova além das preexistentes da `## Linha de base` do `tasks.md`.
- Correção que esconde o erro (um `catch` a mais, um valor padrão) não é correção.
- Um commit `fix: <sintoma> (<slug>)` com teste e correção.

## Modelo de `causa.md`

```markdown
# Causa: <slug>

- **Reproduzido**: pendente | sim | não (<por quê>)
- **Teste planejado**: pendente | `<arquivo:linha previsto>`
- **Causa confirmada**: pendente | sim
- **Plano da correção**: pendente | `tasks.md` pronto
- **Commit da correção** (preenchido na execução): pendente | <hash curto> na branch da correção

## Reprodução

- **Caso mínimo**: <passos ou comando>
- **Resultado**: <saída ou erro literal> · **Taxa**: <sempre | N de M>

## Teste que falha, planejado

- **Teste**: `<arquivo:linha previsto>` — <o que verifica>
- **Comando**: `<comando>`
- **Falha esperada**: <linha da asserção que deve falhar> · **Saída vermelha real** (preenchida pela T1): <...>

## Causa raiz

- **Origem**: `<arquivo:linha>` — <o que está errado>
- **Desde**: <commit ou versão | não determinado>
- **Por quês**: <sintoma> ← <...> ← <origem>
- **Evidência**: <o que prova a causa: log, experimento, bisect>
- **Hipóteses descartadas**: <hipótese — como foi descartada>
- **Mesmo defeito em outros pontos**: <`arquivo:linha` — incluído | relato <slug> | nenhum>
- **Arquitetura**: cabe | falha de arquitetura (<qual>; decisão: <...>)

## Correção (preenchida na execução)

- **Mudança**: <arquivos e o que mudou, em 1 a 3 linhas>
- **Por que é mínima**: <...>
- **Suíte depois**: <N passaram, 0 falhas novas>
```
