/**
 * Modelos dos e-mails de conta (T16; ACE-04, ACE-23, ACE-31), em texto e HTML. O endereço vem
 * só de `URL_PUBLICA` (FUN-23) e o token vai no fragmento (`#t=`), que o navegador não manda ao
 * servidor (decisão do design do LJS, `design.md:30-31`). O que vem do usuário (nome, nome do
 * grupo) é escapado no HTML.
 */

export interface Conteudo {
  assunto: string;
  texto: string;
  html: string;
}

export const CAMINHOS = {
  confirmar: '/confirmar',
  novaSenha: '/entrar/nova-senha',
  convite: '/convite',
  esqueci: '/entrar/esqueci',
} as const;

/** Escapa o texto para HTML. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `URL_PUBLICA` + caminho + `#t=<token>`. Sem `URL_PUBLICA`, falha: nunca monta link relativo. */
export function montarLink(urlPublica: string, caminho: string, token?: string): string {
  const base = urlPublica.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('URL_PUBLICA ausente ou inválida');
  return token === undefined ? `${base}${caminho}` : `${base}${caminho}#t=${encodeURIComponent(token)}`;
}

function html(titulo: string, paragrafos: string[], botao?: { texto: string; link: string }): string {
  const corpo = paragrafos.map((p) => `<p>${p}</p>`).join('\n');
  const acao = botao ? `\n<p><a href="${escaparHtml(botao.link)}">${escaparHtml(botao.texto)}</a></p>` : '';
  return `<!doctype html>\n<html lang="pt-BR"><body>\n<h1>${escaparHtml(titulo)}</h1>\n${corpo}${acao}\n</body></html>`;
}

export function emailConfirmacao(d: { urlPublica: string; nome: string; token: string }): Conteudo {
  const link = montarLink(d.urlPublica, CAMINHOS.confirmar, d.token);
  return {
    assunto: 'Confirme o seu e-mail',
    texto: `Olá, ${d.nome}.\n\nPara confirmar o seu e-mail, abra o link abaixo (vale por 24 horas):\n${link}\n\nSe não foi você, ignore esta mensagem.`,
    html: html(
      'Confirme o seu e-mail',
      [`Olá, ${escaparHtml(d.nome)}.`, 'Para confirmar o seu e-mail, use o botão abaixo. O link vale por 24 horas.', 'Se não foi você, ignore esta mensagem.'],
      { texto: 'Confirmar e-mail', link },
    ),
  };
}

export function emailRecuperacao(d: { urlPublica: string; nome: string; token: string }): Conteudo {
  const link = montarLink(d.urlPublica, CAMINHOS.novaSenha, d.token);
  return {
    assunto: 'Crie uma nova senha',
    texto: `Olá, ${d.nome}.\n\nPara criar uma nova senha, abra o link abaixo (vale por 1 hora e uma vez só):\n${link}\n\nSe não foi você, ignore esta mensagem: a senha atual continua valendo.`,
    html: html(
      'Crie uma nova senha',
      [
        `Olá, ${escaparHtml(d.nome)}.`,
        'Para criar uma nova senha, use o botão abaixo. O link vale por 1 hora e uma vez só.',
        'Se não foi você, ignore esta mensagem: a senha atual continua valendo.',
      ],
      { texto: 'Criar nova senha', link },
    ),
  };
}

export function emailConvite(d: { urlPublica: string; grupoNome: string; token: string }): Conteudo {
  const link = montarLink(d.urlPublica, CAMINHOS.convite, d.token);
  return {
    assunto: `Convite para administrar ${d.grupoNome}`,
    texto: `Você foi convidada para administrar o grupo ${d.grupoNome} no Gestão da Pelada.\n\nPara aceitar, abra o link abaixo (vale por 7 dias):\n${link}`,
    html: html(
      'Convite para administrar um grupo',
      [
        `Você foi convidada para administrar o grupo <strong>${escaparHtml(d.grupoNome)}</strong> no Gestão da Pelada.`,
        'Para aceitar, use o botão abaixo. O convite vale por 7 dias.',
      ],
      { texto: 'Ver convite', link },
    ),
  };
}

/** Aviso ao dono do e-mail de que alguém tentou cadastrá-lo de novo (ACE-04): sem link de confirmação. */
export function emailAvisoCadastro(d: { urlPublica: string; nome: string }): Conteudo {
  const link = montarLink(d.urlPublica, CAMINHOS.esqueci);
  return {
    assunto: 'Tentativa de cadastro com o seu e-mail',
    texto: `Olá, ${d.nome}.\n\nAlguém tentou criar uma conta com o seu e-mail, que já tem conta. Nada mudou na sua conta.\nSe esqueceu a senha, peça uma nova em:\n${link}`,
    html: html(
      'Tentativa de cadastro com o seu e-mail',
      [
        `Olá, ${escaparHtml(d.nome)}.`,
        'Alguém tentou criar uma conta com o seu e-mail, que já tem conta. Nada mudou na sua conta.',
        'Se esqueceu a senha, peça uma nova pelo botão abaixo.',
      ],
      { texto: 'Esqueci a senha', link },
    ),
  };
}
