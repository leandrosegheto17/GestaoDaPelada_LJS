// Verificação de saúde pós-deploy (FUN-42): consulta GET /api/health com tentativas e exige que `versao` seja o SHA
// que acabou de ser publicado. Uso: node verificar-saude.mjs <url-publica> <sha>
// Tentativas e espera podem ser trocadas por PELADA_SAUDE_TENTATIVAS e PELADA_SAUDE_ESPERA_MS.

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Uma consulta; devolve `{ ok, mensagem }` e nunca lança. */
async function consultar(url, esperada) {
  let r;
  try {
    r = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (erro) {
    return { ok: false, mensagem: `sem resposta de ${url}: ${erro.cause?.code ?? erro.message}` };
  }
  if (r.status !== 200) return { ok: false, mensagem: `${url} respondeu ${r.status}` };
  let corpo;
  try {
    corpo = await r.json();
  } catch {
    return { ok: false, mensagem: `${url} respondeu 200, mas o corpo não é JSON` };
  }
  if (corpo?.versao !== esperada) {
    return {
      ok: false,
      mensagem: `versão publicada diferente: o Worker diz "${corpo?.versao}" e o esperado é "${esperada}"`,
    };
  }
  return { ok: true, mensagem: `saúde ok: versão ${esperada}` };
}

/**
 * Tenta até `tentativas` vezes, esperando `esperaMs` entre elas (o Worker leva alguns segundos para propagar).
 * Passa na primeira que traz 200 com a versão esperada; reprova com o motivo da última.
 */
export async function verificarSaude(
  urlPublica,
  versaoEsperada,
  { tentativas = 10, esperaMs = 3000 } = {},
) {
  const url = `${urlPublica.replace(/\/+$/, '')}/api/health`;
  let ultima = { ok: false, mensagem: 'nenhuma tentativa feita' };
  for (let i = 1; i <= tentativas; i++) {
    ultima = await consultar(url, versaoEsperada);
    if (ultima.ok) return ultima;
    if (i < tentativas) await dormir(esperaMs);
  }
  return { ok: false, mensagem: `${ultima.mensagem} (depois de ${tentativas} tentativas)` };
}

if (import.meta.main) {
  const [url, sha] = process.argv.slice(2);
  if (!url || !sha) {
    console.error('uso: verificar-saude.mjs <url-publica> <sha>');
    process.exit(2);
  }
  const resultado = await verificarSaude(url, sha, {
    tentativas: Number(process.env.PELADA_SAUDE_TENTATIVAS) || 10,
    esperaMs: Number(process.env.PELADA_SAUDE_ESPERA_MS) || 3000,
  });
  (resultado.ok ? console.log : console.error)(resultado.mensagem);
  process.exit(resultado.ok ? 0 : 1);
}
