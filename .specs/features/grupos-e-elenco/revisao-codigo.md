# Revisão de código (modo curto): grupos-e-elenco

Base: arquivos da feature já na `main`, lidos na worktree `GestaoDaPelada_v2-wt-grupos-e-elenco`. Só leitura; nenhum teste rodado. Resultado: **sem bloqueantes**; 1 achado médio e 4 sugestões.

## Achados

### A-01 (médio) Arquivar bloqueado por assinatura mostra "Algo deu errado" na tela

- Evidência: `backend/api/src/entrada/rotas/grupo-estado.ts:57-60` responde 409 com `{ erro: 'assinatura_ativa', mensagem }`, sem `codigo`. `frontend/web/src/dados/cliente.ts:105-107` (`corpoDeErro`) devolve `undefined` quando `codigo` não é conhecido, e `ErroApi` (`cliente.ts:46`) cai em `MENSAGEM_INESPERADA` ("Algo deu errado. Tente de novo."). `ERROS_DE_PLANO` (`cliente.ts:22`) só cobre `plano_pro` e `somente_leitura`. `DadosGrupo.tsx:67-70` mostra `e.message`. Nenhum arquivo de `frontend/web/src/telas` cita `assinatura_ativa` ou `MENSAGEM_CANCELE_ANTES_DE_ARQUIVAR`.
- O que acontece: a criadora com assinatura pendente ou ativa clica em "Arquivar grupo" e vê a mensagem genérica, não "Cancele a assinatura antes de arquivar o grupo" (PLA-69).
- Correção: em `DialogoArquivar.onError`, ler `e.corpo` (`erro === 'assinatura_ativa'` -> `mensagem`) e mostrar na faixa; ou fazer a rota responder no formato do contrato (`codigo` + `erro` com a mensagem). Falta um teste de tela para esse 409.

### A-02 (baixo) PATCH do jogador sem `telefone` apaga o telefone

- Evidência: `backend/contrato/src/elenco.ts:84-93` (`telefone` aceita `undefined` e transforma em `null`) e `editarJogadorCorpo` (`elenco.ts:150-159`) usa o mesmo campo; `jogadores-edicao.ts:60` grava `dados.telefone ?? null`. A `pontuacaoInicial` omitida mantém o valor (GEL-43), o telefone omitido, não.
- O que acontece: cliente que mande PATCH parcial perde o telefone sem aviso. A tela sempre envia o campo, então hoje não aparece.
- Correção: decidir na spec; se omitido deve manter, separar `undefined` de `null` no schema do PATCH e tratar no repositório. Se a regra é "corpo completo", registrar numa AD e ter um teste que a fixe.

### A-03 (baixo) Exclusão de jogador deixa referências soltas em escalações

- Evidência: `jogadores-edicao.ts:105-111` checa histórico só em `presencas`, `notas` e `pagamentos_mes` (as 3 FKs sem cascade, `linha-de-base.sql:149,189,266`). A composição de `escalacoes` guarda ids em JSON, sem FK. O comentário de `jogadores-leitura.ts:194` aceita escalação inválida (SIM-94).
- O que acontece: jogador escalado e depois excluído some do cadastro, e a escalação aponta para id inexistente. É tratado como inválida a jusante, mas a ficha não avisa. Registrar como risco aceito ou excluir só quando não houver escalação que o cite.

### A-04 (baixo) Contagem de tamanho em unidades UTF-16

- Evidência: `backend/contrato/src/grupo.ts:36-37` (`.min/.max` do zod contam unidades UTF-16). Emoji e caracteres fora do plano básico contam 2.
- O que acontece: apelido de 30 "caracteres" com emoji é recusado antes do esperado. Sem impacto de segurança. Sugestão: contar por pontos de código (`[...valor].length`) ou documentar.

### A-05 (baixo) Molde divergente e duplicação

- `UUID` repetido em `rotas/admins.ts:36`, `rotas/jogador.ts:30`, `rotas/notas.ts:27` e `middlewares/vinculo.ts:29`: extrair um helper único.
- `rotas/admins.ts:112-114` faz `SELECT nome FROM grupos` direto na rota; as demais rotas usam repositório. Mover para `grupos` ou `convites`.
- Erro de arquivar por assinatura (`grupo-estado.ts:57-60`) foge do formato `corpoDoErro` das outras respostas da mesma rota (origem do A-01).

## Conferido, sem achado

- Autorização: `exigirVinculo` (UUID, 404 igual para não existe e sem vínculo), `exigirGrupoAtivo` (409 em escrita com grupo arquivado, exceções só para reativar, arquivar e cancelar convite, com `FOR KEY SHARE`), `so_quem_criou` antes da conferência do nome, criadora não removível por outra admin (`convites.ts:203`), último admin (`convites.ts:204`).
- Validação de entrada: corpos `.strict()`, data de entrada (calendário, piso 2000-01-01, futuro), ano de nascimento, telefone, nota 1 a 10 ou `null`, texto sem controle nem invisível, NFC. Slug do domínio (reservadas, mínimo 3, corte em 40).
- Banco: toda consulta de elenco filtra por `grupo_id` além da RLS; exclusão com histórico trava a linha (`FOR UPDATE OF j`) e o 23505 de apelido vira 422 (`comUnicidade`); auditoria sem telefone nem ano.
- Domínio: `calcularNivel` (meio para cima, em inteiros) e `compararApelido` corretos.
- Testes: não achei `skip`, `todo` ou `only` nos arquivos de teste da feature (125 arquivos); os `toBeTruthy` são o idioma do Testing Library. Teste dos ramos de `exigirGrupoAtivo`, vínculo, notas e repositórios existem em `backend/api/test/{sessao,grupos,repositorios,concorrencia}`.

## Lacunas já declaradas no código (não são achados novos)

- `grupos-estado.ts`: arquivar grupo já arquivado com nome errado dá 422; dois arquivar simultâneos podem dar 40P01 (500). Ambos marcados `[LACUNA]`; a segunda merece decisão de spec (um 409 ou repetir a transação).
