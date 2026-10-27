import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { montarMapa, nomesValidos } from './config-fundacao.mjs';
import { lerTelasAtivas } from './telas-ativas.mjs';

const MOCKUP = join(import.meta.dirname, '../../../.specs/mockup');
const mapaDoMockup = JSON.parse(readFileSync(join(MOCKUP, 'telas.json'), 'utf8'));
const ATIVAS = ['padrao--erro-rede', 'padrao--carregando-lista', 't03-indisponivel--erro'];

// FUN-37
describe('lerTelasAtivas', () => {
  const IDS = ['a--x', 'b--y', 'c--z'];

  it('vazio e só comentários não ativam nada', () => {
    expect(lerTelasAtivas('', IDS)).toEqual([]);
    expect(lerTelasAtivas('# comentário\n\n  # outro\n', IDS)).toEqual([]);
  });

  it('aceita CRLF, espaços, comentário na linha e deduplica', () => {
    expect(lerTelasAtivas('a--x\r\n  b--y  # ok\r\na--x\r\n', IDS)).toEqual(['a--x', 'b--y']);
  });

  it('nome inexistente é erro', () => {
    expect(() => lerTelasAtivas('zzz', IDS)).toThrow(/zzz/);
  });
});

describe('telas ativas da fundação', () => {
  const arquivo = readFileSync(join(import.meta.dirname, 'telas-ativas.txt'), 'utf8');

  // Motivo da mudança (T42, conta-e-acesso, aprovada pelo usuário em 2026-10-27): a feature acrescenta as telas de
  // acesso a `telas-ativas.txt`; a asserção das três da fundação continua, e entram as 36 do mockup do módulo.
  it('são as três da fundação e as 36 telas do mockup do módulo de acesso, todas existentes no mockup', () => {
    const ativas = lerTelasAtivas(arquivo, nomesValidos(mapaDoMockup));
    expect(ativas.slice(0, 3)).toEqual(ATIVAS);
    const doModulo = readdirSync(join(MOCKUP, '../features/conta-e-acesso/mockup/telas'))
      .map((f) => f.replace(/\.html$/, ''))
      .sort();
    expect(doModulo).toHaveLength(36);
    expect(ativas.slice(3, 39).sort()).toEqual(doModulo);
  });

  // Motivo (T47, volta 1 do verificador, ACE-54): a t25 (Minha senha) é do mockup anterior, mas é tela da feature e
  // entra na comparação; as asserções acima seguem valendo para as 36 do módulo, e esta fixa as acrescentadas.
  it('a tela Minha senha (t25) também é comparada, nos três estados', () => {
    const ativas = lerTelasAtivas(arquivo, nomesValidos(mapaDoMockup));
    expect(ativas.slice(39)).toEqual(['t25-senha--vazio', 't25-senha--erro', 't25-senha--sucesso']);
  });

  it('as telas de acesso usam a rota real do app, com respostas de API, sem rota de vitrine', () => {
    const ativas = lerTelasAtivas(arquivo, nomesValidos(mapaDoMockup)).slice(3);
    const mapa = montarMapa(mapaDoMockup, ativas, MOCKUP, join(import.meta.dirname, 'resultado'));
    expect(mapa.telas).toHaveLength(39);
    for (const tela of mapa.telas) {
      expect(tela.viewports).toEqual(['pc', 'celular']);
      expect(tela.rota).not.toMatch(/^\/vitrine\//);
      expect(tela.rota).toMatch(/^\//);
    }
  });

  it('o mapa derivado usa 1280×800 e 390×844, as rotas de vitrine e nenhuma resposta de API', () => {
    const mapa = montarMapa(mapaDoMockup, ATIVAS, MOCKUP, join(import.meta.dirname, 'resultado'));
    expect(mapa.viewports).toEqual({ pc: { width: 1280, height: 800 }, celular: { width: 390, height: 844 } });
    expect(mapa.respostas).toEqual([]);
    expect(mapa.telas.map((t) => t.id)).toEqual(ATIVAS);
    for (const tela of mapa.telas) {
      expect(tela.viewports).toEqual(['pc', 'celular']);
      expect(tela.rota).toMatch(/^\/vitrine\//);
      expect(tela).not.toHaveProperty('respostas');
    }
  });

  it('tela ativa sem rota de vitrine é erro', () => {
    expect(() => montarMapa(mapaDoMockup, ['t01-ranking--sucesso'], MOCKUP, MOCKUP)).toThrow(/rota de vitrine/);
  });
});

describe('visual.mjs', () => {
  const script = join(import.meta.dirname, 'visual.mjs');
  const rodar = (conteudo, ...args) => {
    const dir = mkdtempSync(join(tmpdir(), 'telas-'));
    const arquivo = join(dir, 'lista.txt');
    writeFileSync(arquivo, conteudo);
    try {
      return spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TELAS_ATIVAS_ARQUIVO: arquivo,
          VISUAL_SEM_BUILD: '1',
          DIST_VISUAL: join(dir, 'inexistente'),
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('lista vazia sai com 0 sem chamar a comparação', () => {
    const r = rodar('# nada');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Nenhuma tela ativa/);
  });

  it('nome inválido no arquivo sai com 2', () => {
    expect(rodar('T99').status).toBe(2);
  });

  it('--tela com nome inválido sai com 2', () => {
    expect(rodar('', '--tela', 'T99').status).toBe(2);
  });

  it('build de teste ausente sai com 2 e orienta', () => {
    const r = rodar(ATIVAS[0]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/dist-visual\/ ausente/);
  });
});
