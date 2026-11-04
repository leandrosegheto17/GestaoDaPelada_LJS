/**
 * Tipos das tabelas para o Kysely. A fundação não tem rota de negócio, então ainda não há tabela tipada: cada feature
 * acrescenta as suas aqui. Consultas livres usam o `sql` do Kysely.
 */
export type Banco = Record<string, never>;
