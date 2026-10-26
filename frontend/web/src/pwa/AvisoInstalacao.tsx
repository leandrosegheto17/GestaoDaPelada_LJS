import { useState } from 'react';
import { Faixa } from '../componentes/basicos';
import { lerAmbienteEDecidir } from './instalacao';

/** Instrução de instalação, só no Safari do iOS e só enquanto o app não está instalado. Pode ser dispensada. */
export function AvisoInstalacao() {
  const [aberto, setAberto] = useState(lerAmbienteEDecidir);
  if (!aberto) return null;
  return (
    <Faixa tipo="info" topo papel="note" aoFechar={() => setAberto(false)} rotuloFechar="Fechar aviso de instalação">
      Instale: toque em Compartilhar e depois em “Adicionar à Tela de Início”.
    </Faixa>
  );
}
