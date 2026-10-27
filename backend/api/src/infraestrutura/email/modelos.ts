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

export function modeloConvite(d: { urlPublica: string; grupoNome: string; token: string }): Modelo {
  return montar(
    `Convite para administrar ${d.grupoNome}`,
    [`Você foi convidado para administrar o grupo ${d.grupoNome} no Gestão da Pelada.`, 'O convite vale por 7 dias.'],
    linkComToken(d.urlPublica, '/convite', d.token),
    'Aceitar convite',
  );
}

export function modeloCadastroDuplicado(d: { urlPublica: string; nome: string }): Modelo {
  return montar(
    'Tentativa de cadastro com o seu e-mail',
    [
      `Olá, ${d.nome}.`,
      'Alguém tentou criar uma conta com este e-mail, mas ele já tem cadastro. Nada foi alterado. Se foi você, entre ou recupere a senha.',
    ],
    `${base(d.urlPublica)}/entrar`,
    'Entrar',
  );
}
