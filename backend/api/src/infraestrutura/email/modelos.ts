/** Modelos dos e-mails de conta. O link vem de `URL_PUBLICA` (G-18) e leva o token no fragmento (AD-010). */
export interface Modelo {
  assunto: string;
  texto: string;
  html: string;
}

const escapar = (valor: string) =>
  valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const base = (urlPublica: string) => urlPublica.replace(/\/+$/, '');

export function linkComToken(urlPublica: string, caminho: string, token: string): string {
  return `${base(urlPublica)}${caminho}#t=${token}`;
}

function montar(assunto: string, linhas: string[], link: string, rotuloLink: string): Modelo {
  const html = `<p>${linhas.map(escapar).join('</p><p>')}</p><p><a href="${escapar(link)}">${escapar(rotuloLink)}</a></p>`;
  return { assunto, texto: `${linhas.join('\n\n')}\n\n${rotuloLink}: ${link}\n`, html };
}

export function modeloConfirmacao(d: { urlPublica: string; nome: string; token: string }): Modelo {
  return montar(
    'Confirme seu e-mail',
    [`Olá, ${d.nome}.`, 'Confirme seu e-mail para entrar no Gestão da Pelada. O link vale por 24 horas.'],
    linkComToken(d.urlPublica, '/confirmar', d.token),
    'Confirmar e-mail',
  );
}

export function modeloRecuperacao(d: { urlPublica: string; nome: string; token: string }): Modelo {
  return montar(
    'Recupere sua senha',
    [
      `Olá, ${d.nome}.`,
      'Use o link para criar uma senha nova. Ele vale por 1 hora. Se não foi você, ignore este e-mail.',
    ],
    linkComToken(d.urlPublica, '/entrar/nova-senha', d.token),
    'Criar nova senha',
  );
}

/** Tamanho máximo do nome do grupo no e-mail: o mesmo teto do nome (GEL-03). Acima disso, corta com reticências. */
const MAX_NOME_NO_EMAIL = 60;
/** Quebras de linha, controles, invisíveis e espaços em sequência viram um espaço só. */
const QUEBRAS_E_INVISIVEIS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\s]+/gu;
/**
 * O que os clientes de e-mail costumam transformar em link: esquema seguido de duas barras, `www.`, domínio
 * (letra, ponto e duas letras) e e-mail.
 */
const PARECE_LINK = /[a-z][a-z0-9+.-]*:\/\/|www\.|[\p{L}\p{N}_-]\.\p{L}{2,}|@/iu;
/** Separadores de URL que, cercados de espaço, deixam de formar um endereço. */
const SEPARADORES_DE_LINK = /\s*([.:/@])\s*/g;

/**
 * Nome do grupo como texto puro no convite (SEC-006): o nome é texto livre de quem criou o grupo e vai, pelo remetente
 * do app, a qualquer e-mail convidado. Numa linha só (sem quebra que injete linha no texto ou no assunto), com até 60
 * caracteres e, se tiver cara de link, com `.`, `:`, `/` e `@` separados por espaços, para nenhum cliente o transformar
 * em link. Nome normal sai igual. No HTML, o resultado ainda passa pelo `escapar`.
 */
export function nomeDoGrupoNoEmail(nome: string): string {
  const umaLinha = nome.replace(QUEBRAS_E_INVISIVEIS, ' ').trim();
  const caracteres = [...umaLinha];
  const curto =
    caracteres.length > MAX_NOME_NO_EMAIL
      ? `${caracteres
          .slice(0, MAX_NOME_NO_EMAIL - 1)
          .join('')
          .trimEnd()}…`
      : umaLinha;
  return PARECE_LINK.test(curto) ? curto.replace(SEPARADORES_DE_LINK, ' $1 ').trim() : curto;
}

export function modeloConvite(d: { urlPublica: string; grupoNome: string; token: string }): Modelo {
  const grupo = nomeDoGrupoNoEmail(d.grupoNome);
  return montar(
    `Convite para administrar ${grupo}`,
    [`Você foi convidado para administrar o grupo ${grupo} no Gestão da Pelada.`, 'O convite vale por 7 dias.'],
    linkComToken(d.urlPublica, '/convite', d.token),
    'Aceitar convite',
  );
}

/** `nome` é opcional: quem recebe o aviso é o dono do e-mail, e o nome dele não é lido sem sessão (AD-008). */
export function modeloCadastroDuplicado(d: { urlPublica: string; nome?: string }): Modelo {
  return montar(
    'Tentativa de cadastro com o seu e-mail',
    [
      d.nome ? `Olá, ${d.nome}.` : 'Olá.',
      'Alguém tentou criar uma conta com este e-mail, mas ele já tem cadastro. Nada foi alterado. Se foi você, entre ou recupere a senha.',
    ],
    `${base(d.urlPublica)}/entrar`,
    'Entrar',
  );
}
