import { main } from './verificar-cache-hyperdrive.ts';

// Ponto de entrada do deploy.yml: sempre executa e sai com o código de main (sem condição por nome de arquivo
// nem por versão do Node).
process.exit(main(process.argv.slice(2)));
