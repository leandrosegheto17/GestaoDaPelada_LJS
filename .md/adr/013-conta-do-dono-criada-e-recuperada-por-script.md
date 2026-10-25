# ADR-013: Conta do dono criada e recuperada só por script de linha de comando, nunca pela interface

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-01, RN-20, RNF-05 ("o papel de dono não pode ser atribuído pela interface"), I-34; CTO-REVIEW, adendo (segurança do papel de dono)

## Contexto

Existe exatamente uma conta de dono (leandrosegheto17@gmail.com), criada na implantação. A forma de criar a credencial inicial ficou a cargo do Coordenador (RF-01). Ninguém está acima do dono: se ele perder a senha, a recuperação é manual, pela infraestrutura (I-34).

É a conta de maior privilégio, e o papel não pode ser atribuído pela interface.

## Decisão

1. **O papel é um atributo da conta** (`e_dono boolean`), protegido no banco:
   - um índice único parcial garante **no máximo uma** conta com `e_dono = true`;
   - uma restrição de checagem exige que essa conta tenha o e-mail configurado.
   **Nenhuma rota da API escreve `e_dono`.** Os schemas do contrato nem têm esse campo de entrada.
2. **Script `backend/scripts/dono.ts`**, executado pelo desenvolvedor com a string de conexão de produção, com duas operações:
   - `criar`: cria a conta do dono com senha aleatória (ADR-004), exibida uma vez no terminal, com troca obrigatória no primeiro login;
   - `redefinir-senha`: gera nova senha temporária e encerra todas as sessões do dono.
   O script recusa rodar sem a confirmação digitada do e-mail e registra a ação na auditoria (autor "infraestrutura").
3. **O e-mail do dono** fica numa variável de configuração (`DONO_EMAIL`), não escrito à mão no código.

## Consequências

**Positivas**
- Nenhum caminho pela internet cria ou promove um dono. A superfície de ataque do papel se reduz ao login dele.
- A recuperação do dono funciona sem e-mail, como decidido (P-25, I-34).

**Negativas**
- A recuperação exige acesso ao computador com o repositório e à string de conexão de produção. Se o Leandro perder ambos, ainda dá para entrar pelo console do Neon, executando o script SQL equivalente documentado no `DEPLOY.md`.
- A string de conexão de produção passa a ser uma credencial sensível guardada localmente. Ela deve ficar no gerenciador de senhas, nunca num `.env` versionado (regra do GUARDRAILS).

## Alternativas consideradas

1. **Rota de "configuração inicial" que cria o dono no primeiro acesso.** É uma janela de ataque entre o deploy e o primeiro acesso, e a rota fica no código para sempre. Descartada.
2. **Seed de migração com hash de senha fixo.** O hash ficaria versionado no repositório. Descartada.
