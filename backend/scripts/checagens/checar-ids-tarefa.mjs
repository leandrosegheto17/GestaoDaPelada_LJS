import { arquivosVersionados, encerrar, procurar } from './arquivos.mjs';

const RAIZ = process.argv[2] ?? process.cwd();
const ESCOPO = /^(backend|frontend|\.github)\/|^[^/]+$/;
const FORA = /^(\.md|\.claude)\/|^pnpm-lock\.yaml$|\/node_modules\//;
const ID = /\b(TP|RTP|SPK|BK)[-‐‑–—]\d{3,4}\b|\bLote\s+\d+\b/i;

const arquivos = arquivosVersionados(RAIZ, (c) => ESCOPO.test(c) && !FORA.test(c));
encerrar(procurar(arquivos, ID), 'ID de tarefa ou lote no código (CONVENCOES §4)');
