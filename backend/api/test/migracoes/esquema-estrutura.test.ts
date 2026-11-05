import { describe, expect, it } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

const MINI = `
  CREATE TABLE pais (id int PRIMARY KEY, nome text NOT NULL DEFAULT 'x');
  CREATE TABLE filho (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pai_id int REFERENCES pais (id)
  );
  CREATE INDEX filho_pai_idx ON filho (pai_id);
  CREATE FUNCTION toca() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER filho_toca BEFORE INSERT ON filho FOR EACH ROW EXECUTE FUNCTION toca();
  CREATE TABLE pgmigrations (id serial PRIMARY KEY, name text);
`;

const ESTRUTURA = /^(tabela|coluna|restricao|indice|trigger) /;

async function estrutura(url: string): Promise<string[]> {
  return comCliente(url, async (c) => (await lerEsquema(c)).filter((l) => ESTRUTURA.test(l)));
}

describe('lerEsquema: estrutura', () => {
  it('FUN-08: mini schema dá a lista esperada, ordenada, sem pgmigrations', async () => {
    await bancoDeTeste(async (url) => {
      await comCliente(url, (c) => c.query(MINI));
      expect(await estrutura(url)).toEqual([
        'coluna filho.id integer not null identity always',
        'coluna filho.pai_id integer',
        'coluna pais.id integer not null',
        "coluna pais.nome text not null default 'x'::text",
        'indice filho.filho_pai_idx CREATE INDEX filho_pai_idx ON public.filho USING btree (pai_id)',
        'indice filho.filho_pkey CREATE UNIQUE INDEX filho_pkey ON public.filho USING btree (id)',
        'indice pais.pais_pkey CREATE UNIQUE INDEX pais_pkey ON public.pais USING btree (id)',
        'restricao filho.filho_pai_id_fkey FOREIGN KEY (pai_id) REFERENCES pais(id)',
        'restricao filho.filho_pkey PRIMARY KEY (id)',
        'restricao pais.pais_pkey PRIMARY KEY (id)',
        'tabela filho',
        'tabela pais',
        'trigger filho.filho_toca CREATE TRIGGER filho_toca BEFORE INSERT ON public.filho FOR EACH ROW EXECUTE FUNCTION toca()',
      ]);
    });
  });

  it('FUN-08: a saída é estável entre duas leituras', async () => {
    await bancoDeTeste(async (url) => {
      await comCliente(url, (c) => c.query(MINI));
      const a = await comCliente(url, (c) => lerEsquema(c));
      const b = await comCliente(url, (c) => lerEsquema(c));
      expect(b).toEqual(a);
      expect([...a].sort()).toEqual(a);
    });
  });

  const MUTACOES: Array<[string, string, RegExp]> = [
    [
      'tipo de coluna',
      'ALTER TABLE filho ALTER COLUMN pai_id TYPE bigint',
      /^coluna filho\.pai_id/,
    ],
    ['índice apagado', 'DROP INDEX filho_pai_idx', /^indice filho\.filho_pai_idx/],
    ['not null', 'ALTER TABLE filho ALTER COLUMN pai_id SET NOT NULL', /^coluna filho\.pai_id/],
    ['default', "ALTER TABLE pais ALTER COLUMN nome SET DEFAULT 'y'", /^coluna pais\.nome/],
    [
      'restrição',
      'ALTER TABLE pais ADD CONSTRAINT nome_unico UNIQUE (nome)',
      /^restricao pais\.nome_unico/,
    ],
    ['trigger', 'DROP TRIGGER filho_toca ON filho', /^trigger filho\.filho_toca/],
    ['tabela', 'CREATE TABLE neto (id int)', /^tabela neto/],
  ];

  for (const [nome, ddl, linha] of MUTACOES) {
    it(`FUN-08: mudar ${nome} muda a saída`, async () => {
      await bancoDeTeste(async (url) => {
        await comCliente(url, (c) => c.query(MINI));
        const antes = await estrutura(url);
        await comCliente(url, (c) => c.query(ddl));
        const depois = await estrutura(url);
        expect(depois).not.toEqual(antes);
        const mudou = [
          ...antes.filter((l) => !depois.includes(l)),
          ...depois.filter((l) => !antes.includes(l)),
        ];
        expect(
          mudou.some((l) => linha.test(l)),
          mudou.join('\n'),
        ).toBe(true);
      });
    });
  }
});
