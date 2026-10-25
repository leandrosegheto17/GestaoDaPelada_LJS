import type { DadosDoSeed } from '../../api/src/infraestrutura/db/repositorios/seed-local.ts';

/**
 * Dados fictícios do seed local: um grupo, a conta admin, 20 jogadores (apelidos e posições do mockup do legado)
 * e as partidas das quintas-feiras de outubro de 2026. Datas fixas: o seed é determinístico.
 */
export const DADOS_DO_SEED: DadosDoSeed = {
  grupo: { nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', diaSemana: 'quinta', horario: '20:00' },
  admin: { email: 'admin@exemplo.com.br', nome: 'Admin do Seed' },
  jogadores: [
    { apelido: 'Alemão', posicao: 'zagueiro', anoNascimento: 1985 },
    { apelido: 'Bigode', posicao: 'zagueiro', anoNascimento: 1979 },
    { apelido: 'Cabeça', posicao: 'atacante', anoNascimento: 1990 },
    { apelido: 'Careca', posicao: 'meia', anoNascimento: 1982 },
    { apelido: 'Dudu', posicao: 'atacante', anoNascimento: 1995 },
    { apelido: 'Fumaça', posicao: 'zagueiro', anoNascimento: 1988 },
    { apelido: 'Gordo', posicao: 'goleiro', anoNascimento: 1976 },
    { apelido: 'Japa', posicao: 'meia', anoNascimento: 1992 },
    { apelido: 'Juninho', posicao: 'meia', anoNascimento: 1996 },
    { apelido: 'Léo Baiano', posicao: 'meia', anoNascimento: 1991 },
    { apelido: 'Marcão', posicao: 'zagueiro', anoNascimento: 1983 },
    { apelido: 'Neném', posicao: 'atacante', anoNascimento: 1998 },
    { apelido: 'Paulinho', posicao: 'goleiro', anoNascimento: 1987 },
    { apelido: 'Pedrão', posicao: 'zagueiro', anoNascimento: 1980 },
    { apelido: 'Rafinha', posicao: 'meia', anoNascimento: 1994 },
    { apelido: 'Serginho', posicao: 'atacante', anoNascimento: 1993 },
    { apelido: 'Tiago', posicao: 'meia', anoNascimento: 1989 },
    { apelido: 'Toninho', posicao: 'atacante', anoNascimento: 1978 },
    { apelido: 'Vini', posicao: 'atacante', anoNascimento: 1997 },
    { apelido: 'Zé Carlos', posicao: 'zagueiro', anoNascimento: 1984 },
  ],
  partidas: ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'],
  momento: '2026-10-22T15:00:00Z',
};
