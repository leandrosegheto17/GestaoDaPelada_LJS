import { readFileSync } from 'node:fs';
import { idDoHyperdrive } from '../comum/wrangler-jsonc.ts';

// Imprime o id do Hyperdrive do wrangler.jsonc da raiz (usado pelo deploy.yml).
console.log(idDoHyperdrive(readFileSync(process.argv[2] ?? 'wrangler.jsonc', 'utf8')));
