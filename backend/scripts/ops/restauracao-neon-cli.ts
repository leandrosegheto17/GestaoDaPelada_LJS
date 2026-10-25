import { main } from './restauracao-neon.ts';

// Ponto de entrada do deploy.yml: sempre executa e sai com o código de main.
process.exit(main(process.argv.slice(2)));
