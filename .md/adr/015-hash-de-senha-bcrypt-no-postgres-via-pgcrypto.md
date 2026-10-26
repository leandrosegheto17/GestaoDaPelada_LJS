# ADR-015: Hash de senha com bcrypt calculado no Postgres (pgcrypto), fora do orçamento de CPU do Worker

- **Status:** Accepted (rascunho do Loop B, rodada 2, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Supersedes:** ADR-004. Todas as regras do ADR-004 continuam valendo, exceto o item 2 (`scrypt` no Node): senha temporária, escopo `troca_de_senha`, bloqueio por e-mail, "esqueci a senha", mensagem genérica e auditoria.
- **Requisitos:** RNF-05, RF-11, RF-14, RF-17; ADR-014 (limite de 10 ms de CPU)

## Contexto

O RNF-05 exige hash forte e não reversível. No Workers Free, cada requisição tem 10 ms de CPU (ADR-014):

- PBKDF2-SHA256 na força recomendada pela OWASP (600 mil iterações) passa disso com folga;
- o workerd também limita o PBKDF2 a 100 mil iterações;
- `scrypt` e argon2 em WebAssembly também passam dos 10 ms;
- **o tempo de espera por uma consulta ao banco não conta como CPU do Worker.**

O Neon (Postgres) oferece a extensão `pgcrypto`, com `crypt()` e `gen_salt('bf', custo)` (bcrypt).

## Decisão

1. **Hash calculado no banco:**
   - para gravar: `UPDATE conta SET senha_hash = crypt($1, gen_salt('bf', 12)) …`;
   - para conferir: `SELECT conta_id, senha_hash = crypt($1, senha_hash) AS confere …`;
   - a senha vai sempre como **parâmetro** da consulta, nunca concatenada.
2. **Custo bcrypt 12**, revisável por migração. O hash guarda o próprio custo, então a troca é gradual: o hash é refeito no próximo login.
3. **Tamanho da senha:** de 8 a **72 caracteres** (o bcrypt ignora o que passa de 72 bytes). O limite fica no contrato, usado pelos dois lados (CONVENCOES §8).
4. **Mesmo custo para e-mail inexistente:** a consulta compara com um hash bcrypt fixo de referência, para não revelar pela diferença de tempo se o e-mail existe.
5. **Geração de senhas temporárias** (12 caracteres, alfabeto sem ambíguos) continua no Worker, com `crypto.getRandomValues` e rejeição de viés (custo de CPU desprezível). O token de sessão continua com SHA-256 da WebCrypto (ADR-003).
6. **Nada de log de consulta com valores:** a senha não pode aparecer em log da aplicação. No Neon, o registro de comandos com parâmetros não é ativado (é o padrão).

## Consequências

**Positivas**
- O hash é forte (bcrypt 12) sem estourar os 10 ms do Worker e sem custo extra.
- Uma implementação de hash madura (pgcrypto), em vez de código próprio de criptografia.

**Negativas**
- **A senha em texto viaja do Worker ao banco** (pelo Hyperdrive, com TLS). Isso amplia a superfície: o banco e o caminho até ele passam a ver a senha em claro durante a consulta. É um risco aceito, com TLS obrigatório e sem log de parâmetros, e precisa ser revisto pelo Validador (DevSecOps).
- **Cada login gasta CPU do Neon** (cerca de 200 a 300 ms a 0,25 CU). É irrelevante no volume, mas um ataque de força bruta também acorda e ocupa o banco. A mitigação é o bloqueio por e-mail (ADR-004) e uma regra de limite por IP no painel da Cloudflare (a regra gratuita) em `/api/sessao/entrar`.
- O limite de 72 caracteres precisa aparecer na tela e no contrato.
- Ficamos dependentes de uma extensão do Postgres, disponível em qualquer Postgres gerenciado comum.

## Alternativas consideradas

1. **PBKDF2 da WebCrypto com 20 a 80 mil iterações** para caber em 10 ms. Fica bem abaixo da recomendação atual, então é um enfraquecimento deliberado. Descartada.
2. **Workers Paid (30 s de CPU) com PBKDF2 de 600 mil iterações ou scrypt.** Seria bom, mas custa US$ 5 por mês e fura a meta. Fica como alternativa se o usuário aceitar pagar.
3. **Serviço de hash na Lightsail.** Mais uma máquina no caminho do login, para algo que o banco já faz. Descartada.
