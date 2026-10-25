# ADR-011: Backup diário por pg_dump cifrado em GitHub Actions, somado ao histórico do Neon, com restauração testada antes do go-live

- **Status:** Accepted (rascunho do Loop B, sujeito à aprovação do usuário)
- **Data:** 2026-10-16
- **Decisores:** Coordenador (chapéu Software Architect)
- **Requisitos:** RNF-07 (RPO até 24 h, cópia restaurável testada antes do go-live), RNF-08, RNF-06

## Contexto

O Neon Free mantém cerca de 6 h de histórico para restauração (ADR-002). Isso cobre um erro recente, mas não cumpre sozinho um RPO de 24 h, por exemplo se o problema for percebido no dia seguinte, nem protege contra a perda da conta do Neon.

O banco tem dado pessoal de terceiros: telefone, ano de nascimento e notas (RNF-06). O custo deve ser zero.

## Decisão

1. **Workflow agendado no GitHub Actions** (repositório privado), uma vez por dia às 04:00 de São Paulo, e também por disparo manual:
   - roda `pg_dump` em formato custom contra o Neon, com usuário só de leitura;
   - comprime e **cifra** a cópia com chave simétrica (`age` ou `gpg --symmetric`), guardada em secret do repositório;
   - guarda o arquivo como artefato do workflow, com retenção de 30 dias.
2. **Antes de cada migração de schema em produção,** o script de deploy cria um **branch do Neon** (ponto de restauração instantâneo, SDD §6) e roda o mesmo dump.
3. **Teste de restauração (antes do go-live e a cada 3 meses):** o procedimento escrito no `DEPLOY.md` baixa o artefato, decifra e restaura num Postgres local (docker compose), e então roda uma checagem de contagem de linhas por tabela.
4. **A falha do workflow notifica por e-mail do próprio GitHub** (padrão de falha de Actions), sem serviço extra.

## Consequências

**Positivas**
- RPO de 24 h pelo dump diário, e de minutos a horas pelo histórico do Neon. Custo zero: o dump tem KBs, e os minutos do Actions são irrelevantes.
- A cópia fica fora do fornecedor do banco, cifrada.
- O branch antes da migração dá volta atrás em segundos.

**Negativas**
- **O GitHub desativa workflows agendados** de repositórios sem atividade por 60 dias. Na Fase 1, com desenvolvimento ativo, o risco é baixo. Está registrado no SDD §6 (T-08), com a checagem "último backup" no runbook mensal.
- A chave de cifra precisa ser guardada também fora do GitHub (gerenciador de senhas do Leandro). Sem ela, a cópia é inútil.
- A retenção de 30 dias não permite voltar a um estado de meses atrás. Isso é aceitável, sem requisito que peça mais.

## Alternativas consideradas

1. **Só o histórico do Neon.** Não cumpre o RPO de 24 h no plano gratuito. Descartada.
2. **Dump para um bucket (R2 ou S3).** Exige mais uma conta e credencial, sem ganho no volume. Descartada; é possível depois.
3. **Neon pago (restauração de 7 a 30 dias).** Fura a meta de custo zero. Descartada para a Fase 1.
