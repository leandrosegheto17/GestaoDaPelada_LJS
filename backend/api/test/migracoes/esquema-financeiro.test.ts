import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lerReferencia } from '../../src/infraestrutura/db/esquema.ts';
import { PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';

/**
 * Impressão digital do schema com as migrações do financeiro (T14; FIN-42). O teste de igualdade entre o banco migrado
 * e a referência já é o `esquema.test.ts` da fundação (FUN-08); este confere que a referência regenerada traz o que as
 * migrações T9 e T10 criam, e só isso do financeiro, e que as 23 herdadas seguem intactas (SHA-256).
 *
 * A referência `esquema-producao.txt` é regenerada pelo /executar com `pnpm esquema:gerar`, depois de aplicar as
 * migrações; sem isso, estes testes ficam vermelhos (é o sinal de que o passo faltou).
 */

const referencia = lerReferencia();

describe('esquema-producao.txt com as migrações do financeiro (FIN-42)', () => {
  it('FIN-42: traz app_acessa_financeiro como função SECURITY DEFINER estável, com search_path fixo e EXECUTE só para pelada_app', () => {
    const funcao = referencia.filter((l) => l.startsWith('funcao app_acessa_financeiro('));
    expect(funcao).toHaveLength(1);
    expect(funcao[0]).toMatch(
      /retorna boolean sql security definer stable config=search_path=public, pg_temp corpo=/,
    );

    const grants = referencia.filter((l) => l.startsWith('grant funcao app_acessa_financeiro('));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/pelada_app/);
    expect(grants[0]).toMatch(/EXECUTE$/);
  });

  it.each([
    'config_financeira.config_financeira_acesso_financeiro',
    'lancamentos.lancamentos_acesso_financeiro',
    'pagamentos_mes.pagamentos_mes_acesso_financeiro',
  ])('FIN-42: traz a policy restritiva %s para pelada_app, com USING e WITH CHECK', (nome) => {
    const linha = referencia.find((l) => l.startsWith(`policy ${nome} `));
    expect(linha, nome).toBeDefined();
    expect(linha).toMatch(
      /^policy \S+ ALL RESTRICTIVE roles=pelada_app using=.*app_acessa_financeiro\(grupo_id\).* check=.*app_acessa_financeiro\(grupo_id\)/,
    );
  });

  it('FIN-42: traz as 2 policies restritivas de vinculos_admin (UPDATE e INSERT) para pelada_app', () => {
    const alterar = referencia.find((l) =>
      l.startsWith('policy vinculos_admin.vinculos_admin_trava_financeiro_alterar '),
    );
    const inserir = referencia.find((l) =>
      l.startsWith('policy vinculos_admin.vinculos_admin_trava_financeiro_inserir '),
    );
    expect(alterar).toMatch(
      / UPDATE RESTRICTIVE roles=pelada_app using=.*app_acessa_financeiro\(grupo_id\).* check=.*app_acessa_financeiro\(grupo_id\)/,
    );
    expect(inserir).toMatch(
      / INSERT RESTRICTIVE roles=pelada_app using= check=.*acessa_financeiro.*app_acessa_financeiro\(grupo_id\)/,
    );
  });

  it('FIN-42: do financeiro só entram a função, o grant dela e as 5 policies (7 linhas com app_acessa_financeiro)', () => {
    const linhas = referencia.filter((l) => l.includes('app_acessa_financeiro'));
    expect(
      linhas.filter((l) => l.startsWith('funcao ') || l.startsWith('grant funcao ')),
    ).toHaveLength(2);
    expect(linhas.filter((l) => l.startsWith('policy '))).toHaveLength(5);
    expect(linhas).toHaveLength(7);
  });

  it('FIN-42: contas_nomes_do_grupo continua como função SECURITY DEFINER com search_path fixo (CREATE OR REPLACE da T10)', () => {
    const linhas = referencia.filter((l) => l.startsWith('funcao contas_nomes_do_grupo('));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/security definer stable config=search_path=public, pg_temp/);
  });
});

describe('migrações herdadas intactas (FIN-42)', () => {
  const lista = readFileSync(join(PASTA_MIGRACOES, 'migracoes.sha256'), 'utf8')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((p): p is [string, string] => p.length === 2 && Boolean(p[0]) && Boolean(p[1]));

  it('FIN-42: as 23 herdadas continuam listadas', () => {
    expect(lista).toHaveLength(23);
  });

  it.each(lista)('FIN-42: SHA-256 de %s não mudou', (hash, nome) => {
    // Normaliza a quebra de linha (checkout no Windows), como a checagem `migracao-aditiva`.
    const conteudo = readFileSync(join(PASTA_MIGRACOES, nome), 'utf8');
    const bruto = readFileSync(join(PASTA_MIGRACOES, nome));
    const calculado = [
      createHash('sha256').update(bruto).digest('hex'),
      createHash('sha256').update(conteudo.replace(/\r\n/g, '\n')).digest('hex'),
    ];
    expect(calculado).toContain(hash);
  });
});
