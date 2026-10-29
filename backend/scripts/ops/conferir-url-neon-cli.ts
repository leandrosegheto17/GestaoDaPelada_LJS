import { main } from './conferir-url-neon.ts';

// Ponto de entrada do dump-cifrado (action): sempre executa e sai com o código de main.
process.exit(main(process.argv.slice(2)));
