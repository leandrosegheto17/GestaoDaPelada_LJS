# ADR-004: Autenticação própria por e-mail e senha, sem envio de e-mail, com senha temporária e bloqueio por e-mail

- **Status:** Superseded by ADR-015 (rodada 2: só o item 2, hash `scrypt` no Node, foi substituído por bcrypt no Postgres; os demais itens seguem valendo e o ADR-015 os herda explicitamente)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RF-01, RF-02, RF-05, RF-06, RF-11 a RF-18, RN-20, RNF-05, RNF-12

## Contexto

O PRD-TECNICO fixa um modelo de acesso que nenhum provedor de autenticação pronto atende sem contorno:

- **sem e-mail** (P-25): o admin é criado por outro admin ou pelo dono, com senha aleatória exibida uma vez e troca obrigatória;
- **bloqueio por e-mail:** 5 falhas em 15 minutos bloqueiam aquele e-mail por 15 minutos;
- **"esqueci a senha" não revela se o e-mail existe:** a mensagem é sempre a mesma e o pedido fica só para o dono;
- **papel de dono** único, fora da interface;
- **permissão de financeiro** por admin e por grupo.

## Decisão

1. **Conta única por e-mail.** O e-mail é normalizado (sem espaços nas pontas e em minúsculas). A mesma conta pode estar em vários grupos pelo vínculo admin↔grupo, que guarda o campo `acessa_financeiro`.
2. **Hash de senha com `scrypt`** nativo do Node (`node:crypto`), com estes parâmetros:
   - sal aleatório de 16 bytes por senha;
   - custo N = 2^15, r = 8, p = 1;
   - parâmetros gravados junto com o hash, para que possam subir no futuro.
   - Comparação em tempo constante.
3. **Senhas aleatórias e temporárias** geradas com `crypto.randomInt`:
   - 12 caracteres de um alfabeto sem ambíguos (sem 0/O/1/l/I);
   - guardadas só como hash, com a marca `senha_temporaria = true`;
   - exibidas **uma única vez** na resposta HTTP que as criou, que leva `Cache-Control: no-store`.
4. **Login com senha temporária** abre uma sessão de escopo `troca_de_senha` (ADR-003). Ela só acessa as rotas de troca de senha e de sair (RF-14). A nova senha precisa ter no mínimo 8 caracteres e ser diferente da temporária.
5. **Bloqueio por tentativas.** A tabela de tentativas guarda e-mail normalizado, momento e resultado. Com 5 falhas daquele e-mail nos últimos 15 minutos, o login responde "bloqueado" por 15 minutos, contados da 5ª falha. Isso vale também para e-mails que não existem, para não revelar quais existem. Um login bem-sucedido não apaga o histórico, mas zera a contagem a partir dali.
6. **"Esqueci a senha"** responde sempre a mesma mensagem, em tempo semelhante. Se o e-mail for de uma conta de admin, cria ou atualiza **um** pedido pendente por conta (RF-12, I-29). O pedido é resolvido quando o dono marca como resolvido ou quando a senha daquela conta é redefinida por qualquer meio (RF-06, RF-16).
7. **Mensagem de credencial inválida** é sempre "e-mail ou senha incorretos", com o mesmo custo de hash para e-mail existente ou não (um hash falso é calculado quando a conta não existe).
8. **Rastreabilidade (RNF-12):** toda redefinição de senha grava quem fez, para quem e quando, na tabela de auditoria.

## Consequências

**Positivas**
- O modelo do PRD é atendido sem contornar um provedor, e sem custo nem dependência externa.
- `scrypt` é nativo: não há binário extra para empacotar na função serverless.
- Ataques de força bruta por e-mail ficam limitados a 5 tentativas a cada 15 minutos.

**Negativas**
- **Código de segurança próprio.** O Validador (DevSecOps) precisa revisar com atenção hash, comparação, geração de senha e bloqueio. A matriz de casos adversariais da CONVENCOES §9 vale para essas funções.
- **O bloqueio por e-mail permite negação de serviço dirigida:** alguém que saiba o e-mail de um admin pode bloqueá-lo por 15 minutos repetidamente. Isso é aceito na Fase 1 (grupo de amigos). A reavaliação fica para a Fase 2, por exemplo combinando com um limite por IP na borda.
- O custo do `scrypt` (cerca de 50 a 100 ms de CPU por login) é aceitável no volume e no limite de CPU ativa do plano (ADR-002).
- **Não há recuperação por e-mail** (decisão do usuário, PR-14). O dono que perde a senha recupera pelo script de infraestrutura (ADR-013).

## Alternativas consideradas

1. **Supabase Auth / Auth.js / Lucia com provedor de credenciais.** Exigiriam desligar ou contornar o fluxo por e-mail, criar usuários pela API administrativa e implementar o bloqueio por e-mail à parte, de qualquer jeito. Ainda trariam sessão em `localStorage` ou JWT (ADR-003). Descartadas.
2. **Argon2id (`@node-rs/argon2`).** Algoritmo igualmente forte, mas com binário nativo de terceiros para empacotar na função. O `scrypt` nativo atende ao RNF-05 ("hash forte e não reversível") sem essa dependência. Descartada pela simplicidade, sem prejuízo de segurança no volume previsto.
3. **Login sem senha (link mágico ou código por e-mail).** Contradiz a decisão de não enviar e-mail (P-25). Descartada.
