import { config, z } from 'zod';

/**
 * Zod sem geração de código (FUN-28): sob a CSP do app (`script-src 'self'`, sem `unsafe-eval`) o teste
 * `Function('')` que o Zod 4 faz ao montar um schema de objeto vira `securitypolicyviolation` no navegador, mesmo
 * com o erro engolido. `jitless` pula o teste e valida sem compilar. Os schemas do contrato importam o `z` daqui,
 * então a configuração roda antes de qualquer schema ser montado, seja qual for a ordem dos chunks do build.
 */
config({ jitless: true });

export { z };
