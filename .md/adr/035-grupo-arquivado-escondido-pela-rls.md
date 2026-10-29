# ADR-035: Grupo arquivado escondido pela RLS, com criação de grupo por função do banco

- **Status:** Accepted
- **Data:** 2026-10-29
- **Decisores:** usuário
- **Requisitos:** GEL-01, GEL-09, GEL-14, GEL-15, GEL-24 a GEL-29 (feature `grupos-e-elenco`)
- **Supersedes:** nenhum. Altera a função `grupos_visiveis()` do ADR-025 e segue o padrão de funções `SECURITY DEFINER` do ADR-029.

## Contexto

Com a criação de grupos aberta a qualquer conta (D1), quem cria passa a poder arquivar e reativar o grupo (C3 a C5).
Enquanto o grupo está arquivado, ele some para os outros admins e continua visível para quem o criou, que precisa
reativá-lo. A `grupos_visiveis()` do ADR-025 devolve todo grupo com vínculo da conta e não olha `arquivado_em`. Além
disso, a policy de INSERT exige `id IN (grupos_visiveis())`, então o `pelada_app` não consegue criar um grupo, que
ainda não tem vínculo.

## Decisão

1. Uma migration nova troca `grupos_visiveis()`. Com conta, a função devolve os grupos com vínculo da conta que estão
   ativos ou que foram criados por ela (`arquivado_em IS NULL OR criado_por = app_conta_id()`). O ramo do slug
   público não muda.
2. A criação passa pela função `grupo_criar` (`SECURITY DEFINER`, `search_path` fixo, `EXECUTE` só para o
   `pelada_app`). Ela cria o grupo, o vínculo de admin com acesso ao financeiro, as habilidades iniciais e a
   auditoria. Também escolhe o primeiro sufixo livre do slug e tenta de novo, até 3 vezes, quando duas criações
   disputam o mesmo slug.
3. A escrita em grupo arquivado é barrada na aplicação pelo middleware `exigirGrupoAtivo` (409 `grupo_arquivado`),
   exceto a reativação.
4. O `pelada_app` perde o UPDATE em `grupos` e fica só com UPDATE por coluna: `nome`, `dia_semana`, `frequencia`,
   `horario` e `arquivado_em`.

Alternativa recusada: filtrar o arquivado no middleware `exigirVinculo`. Seria mais simples, mas cada consulta fora
dele (sessão, listas, features seguintes) precisaria lembrar do filtro.

## Consequências

**Positivas**

- Toda tabela com `grupo_id`, inclusive as das features seguintes, respeita o arquivamento sem código novo.
- Um admin que não criou o grupo não lê nem altera nada dele enquanto está arquivado, nem com uma consulta errada.

**Negativas**

- A troca da função afeta todas as policies. A suíte de isolamento inteira precisa rodar depois dela.
- O sufixo do slug é escolhido em SQL, fora de `@pelada/dominio`; só a base do slug fica no domínio.
- Se a conta criadora sair do grupo ou for excluída, ninguém arquiva nem reativa o grupo pelo app; o caso fica com o
  suporte.
