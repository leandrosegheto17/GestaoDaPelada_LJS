# Conta e acesso — Contexto

**Gathered:** 2026-10-26
**Spec:** `.specs/features/conta-e-acesso/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Cadastro aberto com confirmação por e-mail, entrar e sair, recuperação de senha por e-mail, troca de senha, exclusão de
conta, convite e remoção de admins de um grupo, termos e privacidade, RLS das tabelas de conta e o script do dono. Grupos
(criar, editar, arquivar), planos, push e e-mails de cobrança ficam nas features seguintes.

---

## Implementation Decisions

Ritmo **Rápido**: o usuário aceitou as sugestões do agente nas quatro áreas ("Seguir com as sugestões", 2026-10-26).

### E-mail nesta feature

- O envio transacional pelo Resend entra aqui, restrito a confirmação, recuperação, convite e aviso de cadastro duplicado.
- Em dev e teste, um remetente falso guarda as mensagens em memória (os testes leem o link de lá).

### Admins convidados e dono

- Convite por link com validade de 7 dias e uso único. Quem não tem conta se cadastra pelo link, com o e-mail travado.
- A senha temporária do legado deixa de ser usada.
- Sem telas de `/dono`. O dono existe só pelo script `dono.ts` (G-11).

### Exclusão de conta

- Imediata, com a senha digitada de novo.
- Recusada enquanto a conta for a única admin de algum grupo não arquivado; a tela lista esses grupos.
- A auditoria perde o nome e o e-mail do autor ("conta excluída").

### Termos e privacidade

- O agente redige o texto e o marca como rascunho para revisão do usuário.
- Aceite obrigatório no cadastro, com data e versão gravadas.

### Agent's Discretion

Nenhuma área ficou explicitamente a critério do agente além das sugestões aceitas.

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área foi recusada. As demais escolhas (bloqueio por e-mail e IP, prazos dos links, intervalo de 60 s entre
e-mails, contas existentes confirmadas) estão na tabela de premissas da spec.

---

## Specific References

- Mockups do legado já copiados: t04 entrar, t05 esqueci, t06 nova senha, t08 grupos, t09 menu da conta, t19 admins,
  t25 senha (`.specs/mockup/telas/`).
- Legado como referência de comportamento: `backend/api/src/aplicacao/acesso/` e `infraestrutura/db/repositorios/tentativas.ts`
  em `C:\Leandro\Projetos\GestaoDaPelada`.

---

## Deferred Ideas

- Troca de e-mail da conta (depois do MVP).
- Telas da área `/dono` (só se o suporte precisar).
