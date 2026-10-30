import type { JogadorDetalhe } from '@pelada/contrato';
import { useState } from 'react';
import { Botao } from '../../componentes/basicos/Botao';
import { BotaoLink } from '../../componentes/basicos/BotaoLink';
import { EstadoVazio } from '../../componentes/basicos/EstadoVazio';
import { Faixa } from '../../componentes/basicos/Faixa';
import { Selo } from '../../componentes/basicos/Selo';
import { SeloSalvo } from '../../componentes/basicos/SeloSalvo';
import { ValorDestaque } from '../../componentes/basicos/ValorDestaque';
import { SeletorNota } from '../../componentes/campos/CampoNota';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { formatarNivel, useSalvarNota } from '../../dados/notas';

interface Props {
  grupoId: string;
  jogador: JogadorDetalhe;
}

/** Nível exibido: o que a API devolveu na última nota salva ou, antes disso, o da ficha (GEL-97, GEL-103). */
interface Nivel {
  nivel: number;
  semNota: boolean;
}

/**
 * Habilidades e nível da ficha (t16, GEL-97 a GEL-103): uma nota de 1 a 10 por habilidade, salva ao escolher; "–"
 * apaga a nota. O nível aparece como "Nível 6,8" ou "sem nota". Vale também para jogador inativo.
 */
export function NotasDoJogador({ grupoId, jogador }: Props) {
  const salvar = useSalvarNota(grupoId, jogador.id);
  const [locais, setLocais] = useState<Record<string, number | null>>({});
  const [salvo, setSalvo] = useState<string | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [nivelSalvo, setNivelSalvo] = useState<Nivel | null>(null);
  const nivel: Nivel = nivelSalvo ?? { nivel: jogador.nivel, semNota: jogador.semNota };

  const mudar = (habilidadeId: string, nota: number | null) => {
    setLocais((l) => ({ ...l, [habilidadeId]: nota }));
    setSalvo(null);
    setFalhou(null);
    salvar.mutate(
      { habilidadeId, nota },
      {
        onSuccess: (resposta) => {
          setNivelSalvo(resposta);
          setSalvo(habilidadeId);
        },
        onError: () => setFalhou(habilidadeId),
      },
    );
  };

  return (
    <section className="secao" aria-labelledby="s-hab">
      <h2 id="s-hab" className="subtitulo">
        Habilidades e nível
      </h2>
      {jogador.notas.length === 0 ? (
        <>
          <p className="paragrafo">
            <Selo tom="atencao">Sem nota</Selo> Usa 5,5 no simulador.
          </p>
          <EstadoVazio
            icone={null}
            texto="Nenhuma habilidade cadastrada."
            acao={
              <BotaoLink variante="secundario" to={`/app/grupos/${grupoId}/habilidades`}>
                Cadastrar habilidades
              </BotaoLink>
            }
          />
        </>
      ) : (
        <>
          <ValorDestaque>{nivel.semNota ? 'sem nota' : `Nível ${formatarNivel(nivel.nivel)}`}</ValorDestaque>
          <Lista>
            {jogador.notas.map((n) => {
              const id = `nota-${n.habilidadeId}`;
              return (
                <Item
                  key={n.habilidadeId}
                  titulo={<label htmlFor={id}>{n.habilidade}</label>}
                  acoes={
                    <>
                      {salvo === n.habilidadeId ? <SeloSalvo /> : null}
                      <SeletorNota
                        id={id}
                        nota={n.habilidadeId in locais ? (locais[n.habilidadeId] ?? null) : n.nota}
                        aoMudar={(nota) => mudar(n.habilidadeId, nota)}
                      />
                    </>
                  }
                />
              );
            })}
          </Lista>
          {falhou ? (
            <Faixa
              tipo="erro"
              acao={
                <Botao variante="texto" onClick={() => mudar(falhou, locais[falhou] ?? null)}>
                  Tentar de novo
                </Botao>
              }
            >
              Não foi possível salvar a nota. Verifique a conexão.
            </Faixa>
          ) : null}
        </>
      )}
    </section>
  );
}
