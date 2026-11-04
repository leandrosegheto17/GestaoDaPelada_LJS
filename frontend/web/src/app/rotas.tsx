import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AvisoInstalarIphone } from '../pwa/AvisoInstalarIphone.tsx';
import { EmBreve, NaoEncontrada } from './paginas.tsx';

/**
 * Rotas do app. A vitrine (`/_vitrine/:id`) só existe com `VITE_VITRINE=1`: a variável é trocada em tempo de build,
 * então o build de produção descarta a rota e o módulo dela. Lida dentro do componente para o teste poder trocá-la.
 */
export function Rotas() {
  const vitrine = import.meta.env.VITE_VITRINE === '1';
  return (
    <>
      <AvisoInstalarIphone />
      <Routes>
        <Route path="/" element={<EmBreve />} />
        {vitrine ? <Route path="/_vitrine/:id" element={<VitrineCarregada />} /> : null}
        <Route path="*" element={<NaoEncontrada />} />
      </Routes>
    </>
  );
}

const Vitrine = import.meta.env.VITE_VITRINE === '1' ? lazy(() => import('./vitrine.tsx')) : null;

function VitrineCarregada() {
  if (!Vitrine) return <NaoEncontrada />;
  return (
    <Suspense fallback={null}>
      <Vitrine />
    </Suspense>
  );
}
