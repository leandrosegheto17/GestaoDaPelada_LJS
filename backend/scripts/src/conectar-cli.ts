import { BancoForaDoArError, conectar } from './conectar.ts';

const url = process.argv[2];
if (!url) {
  console.error('uso: conectar-cli <url>');
  process.exit(2);
}
try {
  const cliente = await conectar(url);
  await cliente.end();
} catch (erro) {
  console.error(erro instanceof BancoForaDoArError ? erro.message : (erro as Error).message);
  process.exit(1);
}
