import { z } from 'zod';
import { email, nome, senha, senhaInformada, token } from './primitivos.ts';

/**
 * Contrato das rotas de acesso (T12; ACE-02, ACE-58): corpos `.strict()` (campo a mais é
 * recusado), respostas, códigos de erro da spec e a versão dos termos. Formas do design da
 * conta e acesso do LJS (`design.md:192`, `:215-228`), escritas do zero (AD-002).
 */

/** Versão do texto de termos e privacidade (`AAAA-MM-DD`), a mesma gravada no aceite (ACE-58). */
export const TERMOS_VERSAO = '2026-11-05';

/** Códigos de erro das rotas de acesso, um por resultado da spec. */
export const CODIGOS_ERRO = [
  'dados_invalidos',
  'termos_obrigatorios',
  'credenciais_invalidas',
  'email_nao_confirmado',
  'bloqueado_temporariamente',
  'sessao_expirada',
  'sem_sessao',
  'link_invalido',
  'senha_atual_incorreta',
  'unico_admin',
  'ja_e_admin',
  'convite_de_outro_email',
  'ultimo_admin',
  'email_indisponivel',
  'origem_recusada',
  'muitas_requisicoes',
  'nao_encontrado',
  // grupos-e-elenco (T20; GS:143-145, GS:211-214, GS:295, SEC-001)
  'grupo_arquivado',
  'so_quem_criou',
  'jogador_com_historico',
  'ja_inativo',
  'ja_ativo',
  'criadora_nao_removivel',
  // partidas-e-ranking (T39; PAR-21, PAR-30)
  'partida_ja_existe',
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

/** Mensagens mostradas ao usuário para cada código (o front pode trocar o texto pelo do mockup). */
export const MENSAGENS_ERRO: Readonly<Record<CodigoErro, string>> = {
  dados_invalidos: 'Confira os campos destacados.',
  termos_obrigatorios: 'Para criar a conta, aceite os termos de uso e a política de privacidade.',
  credenciais_invalidas: 'E-mail ou senha incorretos.',
  email_nao_confirmado: 'Confirme o seu e-mail antes de entrar.',
  bloqueado_temporariamente: 'Muitas tentativas. Tente de novo em alguns minutos.',
  sessao_expirada: 'Sua sessão expirou. Entre de novo.',
  sem_sessao: 'Entre para continuar.',
  link_invalido: 'Link inválido ou vencido.',
  senha_atual_incorreta: 'Senha atual incorreta.',
  unico_admin: 'Você é a única admin de alguns grupos. Convide outra pessoa antes de excluir a conta.',
  ja_e_admin: 'Essa pessoa já é admin do grupo.',
  convite_de_outro_email: 'Este convite foi enviado para outro e-mail.',
  ultimo_admin: 'O grupo precisa de pelo menos uma pessoa admin.',
  email_indisponivel: 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
  origem_recusada: 'Requisição recusada.',
  muitas_requisicoes: 'Muitas tentativas. Tente de novo em alguns minutos.',
  nao_encontrado: 'Não encontrado.',
  grupo_arquivado: 'Este grupo está arquivado. Reative o grupo para fazer alterações.',
  so_quem_criou: 'Só quem criou o grupo pode fazer isso.',
  jogador_com_historico: 'O jogador tem histórico de partidas e não pode ser excluído.',
  ja_inativo: 'O jogador já está inativo.',
  ja_ativo: 'O jogador já está ativo.',
  criadora_nao_removivel: 'Quem criou o grupo não pode ser removida por outra admin.',
  // A rota troca pelo texto com a data (`mensagemPartidaJaExiste`, PAR-21); este é só o padrão do código.
  partida_ja_existe: 'Já existe uma partida nesta data.',
};

/** Mensagem geral do 422 de validação das rotas de grupo (GS:70, GEL-118). */
export const MENSAGEM_CORRIJA_CAMPOS = 'Corrija os campos indicados.';

/** Corpo de toda resposta de erro das rotas de acesso. */
export const corpoErro = z
  .object({
    erro: z.string(),
    codigo: z.enum(CODIGOS_ERRO),
    /** Campos inválidos (422 `dados_invalidos`). */
    campos: z.array(z.string()).optional(),
    /**
     * Mensagem de cada campo inválido, nas rotas de grupo (GEL-118). `campos` continua com os nomes, como nas rotas
     * de acesso, para o front da conta e acesso seguir igual.
     */
    mensagens: z.record(z.string(), z.string()).optional(),
    /** Ação sugerida no lugar da recusada (409 `jogador_com_historico`: `inativar`, GEL-85). */
    sugestao: z.literal('inativar').optional(),
    /** Grupos em que a conta é a única admin (409 `unico_admin`). */
    grupos: z.array(z.object({ id: z.string(), nome: z.string() }).strict()).optional(),
    /** Data `AAAA-MM-DD` da partida que já existe (409 `partida_ja_existe`, PAR-21). */
    dataExistente: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
export type CorpoErro = z.infer<typeof corpoErro>;

/** Aceite dos termos: só `true` vale; o que faltar ou vier diferente é `termos_obrigatorios` (ACE-02). */
const termos = z.literal(true, { error: 'termos_obrigatorios' });

export const cadastroCorpo = z.object({ nome, email, senha, termos }).strict();
export const entrarCorpo = z.object({ email, senha: senhaInformada }).strict();
export const emailCorpo = z.object({ email }).strict();
export const tokenCorpo = z.object({ token }).strict();
export const novaSenhaCorpo = z.object({ token, senha }).strict();
export const trocarSenhaCorpo = z.object({ senhaAtual: senhaInformada, senhaNova: senha }).strict();
export const excluirCorpo = z.object({ senha: senhaInformada }).strict();
export const conviteCorpo = z.object({ email }).strict();
/** Cadastro pelo convite: o e-mail é o do convite (travado), não vem no corpo (ACE-34). */
export const conviteCadastroCorpo = z.object({ token, nome, senha, termos }).strict();

export type CadastroCorpo = z.infer<typeof cadastroCorpo>;
export type EntrarCorpo = z.infer<typeof entrarCorpo>;
export type NovaSenhaCorpo = z.infer<typeof novaSenhaCorpo>;
export type TrocarSenhaCorpo = z.infer<typeof trocarSenhaCorpo>;
export type ConviteCadastroCorpo = z.infer<typeof conviteCadastroCorpo>;

/** `GET /api/sessao` (ACE-18). */
export const sessaoEu = z
  .object({
    id: z.string(),
    nome: z.string(),
    email: z.string(),
    grupos: z.array(
      z.object({ id: z.string(), nome: z.string(), slug: z.string(), acessaFinanceiro: z.boolean() }).strict(),
    ),
  })
  .strict();
export type SessaoEu = z.infer<typeof sessaoEu>;

/** Resposta de entrar (ACE-09): nome e e-mail. */
export const entrarResposta = z.object({ nome: z.string(), email: z.string() }).strict();
export type EntrarResposta = z.infer<typeof entrarResposta>;

/** Leitura do convite pelo token (tela de convite). */
export const conviteLido = z
  .object({ email: z.string(), grupoNome: z.string(), contaExiste: z.boolean() })
  .strict();
export type ConviteLido = z.infer<typeof conviteLido>;

/** Convite criado (ACE-31): id, e-mail e validade. */
export const conviteCriado = z.object({ id: z.string(), email: z.string(), expiraEm: z.string() }).strict();
export type ConviteCriado = z.infer<typeof conviteCriado>;

/** `GET /api/grupos/:grupoId/admins` (ACE-37). */
export const adminsResposta = z
  .object({
    admins: z.array(
      z
        .object({
          id: z.string(),
          nome: z.string(),
          email: z.string(),
          acessaFinanceiro: z.boolean(),
          /**
           * A conta que criou o grupo (SEC-001, grupos-e-elenco T70): a tela não oferece "Remover" nela. Opcional para a
           * resposta da CA seguir válida; [LACUNA] a lista de admins da API ainda não envia o campo.
           */
          criador: z.boolean().optional(),
        })
        .strict(),
    ),
    convites: z.array(conviteCriado),
  })
  .strict();
export type AdminsResposta = z.infer<typeof adminsResposta>;

/** Mensagem de sucesso das rotas que respondem igual exista ou não a conta (ACE-01, ACE-08, ACE-22). */
export const MENSAGENS = {
  cadastro: 'Enviamos um link de confirmação para o seu e-mail',
  reenvio: 'Se houver uma conta não confirmada com esse e-mail, enviamos um novo link de confirmação',
  esqueci: 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha',
} as const;

/**
 * Converte a falha do zod no corpo de erro: `termos_obrigatorios` quando o problema é o aceite
 * (ACE-02), senão `dados_invalidos` com os campos (ACE-03).
 */
export function erroDeValidacao(erro: z.ZodError): CorpoErro {
  const campos = [...new Set(erro.issues.map((i) => String(i.path[0] ?? '')).filter(Boolean))].sort();
  if (erro.issues.some((i) => i.path[0] === 'termos')) {
    return { erro: MENSAGENS_ERRO.termos_obrigatorios, codigo: 'termos_obrigatorios', campos };
  }
  return { erro: MENSAGENS_ERRO.dados_invalidos, codigo: 'dados_invalidos', campos };
}

/** Corpo de erro de um código, com a mensagem padrão. */
export function corpoDoErro(codigo: CodigoErro, extra: Pick<CorpoErro, 'campos' | 'grupos' | 'mensagens' | 'sugestao'> = {}): CorpoErro {
  return { erro: MENSAGENS_ERRO[codigo], codigo, ...extra };
}
