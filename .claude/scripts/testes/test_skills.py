"""Checagem estrutural das skills de .claude/skills.

Não é script: protege a forma das peças enquanto os fluxos crescem (frontmatter,
tamanho, links para references/ e menu do /fluxo apontando para skill existente).
"""

import json
import re
import unittest
from pathlib import Path

CLAUDE = Path(__file__).resolve().parents[2]
SKILLS = CLAUDE / "skills"
LIMITE_LINHAS = 150

LINK = re.compile(r"\]\(([^)\s]+)\)")


def skills_de_pacote():
    """Pastas instaladas por pacote: não são nossas, não seguem o limite de linhas."""
    fontes = json.loads((CLAUDE / "fontes.json").read_text(encoding="utf-8"))["fontes"]
    return {
        Path(f["usado_em"]).name
        for f in fontes
        if f.get("tipo") == "pacote" and f.get("usado_em", "").startswith(".claude/skills/")
    }


def frontmatter(texto):
    partes = texto.split("---", 2)
    if not texto.startswith("---") or len(partes) < 3:
        return {}
    campos = {}
    for linha in partes[1].splitlines():
        if ":" in linha and not linha.startswith(" "):
            chave, valor = linha.split(":", 1)
            campos[chave.strip()] = valor.strip()
    return campos


def links_locais(arquivo):
    for alvo in LINK.findall(arquivo.read_text(encoding="utf-8")):
        if alvo.startswith(("http://", "https://", "#", "mailto:")):
            continue
        yield alvo.split("#", 1)[0]


class TestSkills(unittest.TestCase):
    def setUp(self):
        self.pacotes = skills_de_pacote()
        self.pastas = sorted(p for p in SKILLS.iterdir() if p.is_dir())

    def test_toda_pasta_tem_skill_md_com_nome_e_descricao(self):
        for pasta in self.pastas:
            with self.subTest(skill=pasta.name):
                arquivo = pasta / "SKILL.md"
                self.assertTrue(arquivo.exists(), "falta SKILL.md")
                campos = frontmatter(arquivo.read_text(encoding="utf-8"))
                self.assertEqual(campos.get("name"), pasta.name)
                self.assertTrue(campos.get("description"), "description vazia")

    def test_skills_nossas_ate_150_linhas(self):
        for pasta in self.pastas:
            if pasta.name in self.pacotes:
                continue
            with self.subTest(skill=pasta.name):
                linhas = len((pasta / "SKILL.md").read_text(encoding="utf-8").splitlines())
                self.assertLessEqual(linhas, LIMITE_LINHAS)

    def test_links_locais_existem(self):
        for pasta in self.pastas:
            if pasta.name in self.pacotes:
                continue
            for arquivo in [pasta / "SKILL.md", *sorted((pasta / "references").glob("*.md"))]:
                for alvo in links_locais(arquivo):
                    with self.subTest(arquivo=str(arquivo.relative_to(SKILLS)), link=alvo):
                        self.assertTrue((arquivo.parent / alvo).exists(), "link quebrado")

    def test_fluxos_que_criam_telas_oferecem_mockup(self):
        """Feature, legado e uso próprio oferecem a mockup-visual quando há tela; o reconhecimento registra a decisão."""
        for nome in ("feature", "legado", "uso-proprio"):
            with self.subTest(skill=nome):
                texto = (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("mockup-visual", texto)
                self.assertNotIn("só se o usuário pedir", texto)
        reconhecimento = (SKILLS / "reconhecimento" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("**Mockup**", reconhecimento)
        mockup = SKILLS / "mockup-visual"
        self.assertIn("Modo módulo", (mockup / "SKILL.md").read_text(encoding="utf-8"))
        self.assertTrue((mockup / "references" / "modulo.md").exists())

    def test_fase_nao_depende_da_memoria_da_conversa(self):
        """Trocar de sessão nos marcos exige que toda aprovação fique gravada em arquivo."""
        for pasta in self.pastas:
            if pasta.name in self.pacotes:
                continue
            for arquivo in [pasta / "SKILL.md", *sorted((pasta / "references").glob("*.md"))]:
                with self.subTest(arquivo=str(arquivo.relative_to(SKILLS))):
                    self.assertNotIn("aprovação nesta sessão", arquivo.read_text(encoding="utf-8"))
        self.assertIn("**Plano aprovado em**", (SKILLS / "reconhecimento" / "SKILL.md").read_text(encoding="utf-8"))

    def test_marcos_de_troca_de_sessao(self):
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("## Marcos de troca de sessão", claude_md)
        self.assertTrue((SKILLS / "fluxo" / "references" / "marcos.md").exists())
        menu = (SKILLS / "fluxo" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("## Retomada", menu)
        self.assertIn("references/marcos.md", menu)

    def test_progresso_no_resumo_de_fase_e_na_retomada(self):
        """O status de tarefas aparece no fim de cada fase e ao retomar a sessão."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("python .claude/scripts/progresso.py", claude_md)
        marcos = (SKILLS / "fluxo" / "references" / "marcos.md").read_text(encoding="utf-8")
        self.assertIn("**Progresso**", marcos)
        self.assertIn("progresso.py", (SKILLS / "fluxo" / "SKILL.md").read_text(encoding="utf-8"))
        skill = (SKILLS / "progresso" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("python .claude/scripts/progresso.py", skill)
        self.assertTrue((CLAUDE / "scripts" / "progresso.py").exists())

    def test_roteiro_acima_da_feature(self):
        """A quebra do produto em features é uma fase própria e o vocabulário é único."""
        def ler(*partes):
            return SKILLS.joinpath(*partes).read_text(encoding="utf-8")

        self.assertIn("6b", ler("projeto-novo", "references", "fases.md"))
        self.assertIn("skill `roteiro`", ler("projeto-novo", "SKILL.md"))
        self.assertIn("3b", ler("uso-proprio", "references", "fases.md"))
        self.assertIn("skill `roteiro`", ler("uso-proprio", "SKILL.md"))
        for fluxo in ("feature", "legado"):
            with self.subTest(fluxo=fluxo):
                self.assertIn("skill `roteiro`", ler(fluxo, "SKILL.md"))
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("## Vocabulário", claude_md)
        self.assertIn("**Roteiro**", claude_md)
        self.assertIn("roteiro", (CLAUDE / "rules" / "artefatos.md").read_text(encoding="utf-8"))
        self.assertTrue((SKILLS / "roteiro" / "references" / "criterios.md").exists())
        self.assertTrue((SKILLS / "roteiro" / "references" / "modelo.md").exists())

    def test_tarefa_pequena_e_sem_limite_de_quantidade(self):
        """O limite é o tamanho da tarefa (até 2 horas de trabalho humano), nunca a quantidade."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("## Tarefas", claude_md)
        self.assertIn("**Estimativa**", claude_md)
        self.assertIn("2 horas", claude_md)
        for arquivo in (CLAUDE / "CLAUDE.md", SKILLS / "roteiro" / "SKILL.md",
                        SKILLS / "roteiro" / "references" / "criterios.md",
                        SKILLS / "roteiro" / "references" / "modelo.md",
                        SKILLS / "feature" / "SKILL.md", SKILLS / "legado" / "SKILL.md"):
            with self.subTest(arquivo=arquivo.name):
                texto = arquivo.read_text(encoding="utf-8")
                self.assertIsNone(re.search(r"(?<!\d)80 tarefas", texto), "sobrou o limite de 80 tarefas")
                self.assertNotIn("LIMITE_TAREFAS", texto)
        for nome in ("feature", "legado", "projeto-novo", "uso-proprio"):
            with self.subTest(skill=nome):
                self.assertIn("Estimativa", (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8"))

    def test_execucao_na_sessao_com_ciclo_pela_criticidade(self):
        """/executar: sessão principal sem skills nem subagentes; o ciclo segue a criticidade do lote."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("## Execução", "**`/executar`: sessão principal, teste primeiro, sem skills e sem subagentes.**",
                       "**Ciclo do lote comum**", "**Ciclo do lote crítico**", "**Pré-voo, uma vez antes do primeiro lote:**",
                       "**Gate completo ao fim da feature:**", "**Sem mutação no lote.**", "**Commit por grupo de tarefas",
                       "progresso.py --lote", "`**Risco**: alto|baixo`", "**6h**", "**Serviços de apoio de pé.**",
                       "`**Criticidade**: crítica|comum`", "**Worktree por feature.**", "**sem PR por lote**",
                       "**Contexto.**", "contexto.py", "**300k**", "**Retrabalho.**", "`Retrabalho R<n>`"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        for velho in ("Sempre por subagente, um lote por vez", "Não há execução inline", "uma linha V2 por tarefa",
                      "**Subagentes**", "**Ciclo do marco**", "Executor por marco", "agente `executor`", "achados.md",
                      "revisão de marco", "implementador-dominio"):
            with self.subTest(velho=velho):
                self.assertNotIn(velho, claude_md)
        self.assertFalse((CLAUDE / "agents" / "implementador-dominio.md").exists())
        self.assertFalse((CLAUDE / "agents" / "executor.md").exists())  # /executar roda na sessão, sem subagentes
        for trecho in ("**Matriz política × comando:**", "**Higiene de teste de banco:**", "casos limite e os estados possíveis"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        implementador = (CLAUDE / "agents" / "implementador.md").read_text(encoding="utf-8")
        self.assertIn("progresso.py --tarefa", implementador)
        self.assertNotIn("Tarefa <ID> concluída", implementador)
        progresso = (SKILLS / "progresso" / "SKILL.md").read_text(encoding="utf-8")
        for trecho in ("--tarefa", "--lote", "Feature atual", "Phase atual", "Criticidade", "Retrabalho"):
            with self.subTest(progresso=trecho):
                self.assertIn(trecho, progresso)
        self.assertTrue((SKILLS / "progresso" / "references" / "medicao.md").exists())
        marcos = (SKILLS / "fluxo" / "references" / "marcos.md").read_text(encoding="utf-8")
        for trecho in ("Feature atual", "**Serviços no ar**", "contexto.py", "300k"):
            with self.subTest(marcos=trecho):
                self.assertIn(trecho, marcos)
        self.assertNotIn("A cada 6 lotes", marcos)
        self.assertIn("commit-msg", (CLAUDE / "scripts" / "instalar.py").read_text(encoding="utf-8"))
        self.assertTrue((CLAUDE / "scripts" / "preparar-ambiente.py").exists())
        self.assertTrue((CLAUDE / "scripts" / "contexto.py").exists())
        self.assertTrue((CLAUDE / "scripts" / "preparacao.py").exists())

    def test_fluxos_terminam_no_planejamento_e_os_quatro_comandos_existem(self):
        """Todo fluxo para no tasks.md; /preparar, /executar, /validar e /finalizar fazem o resto."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("## Fim do planejamento e comandos de execução", "**termina no planejamento**",
                       "O plano está disponível para execução.", "`/preparar`", "`/executar`", "`/validar`", "`/finalizar`",
                       "**Nível 1, síncrono**", "**Nível 2, assíncrono**", ".specs/preparacao.md", "preparacao.py --nivel1",
                       "**Retrabalho**", "Branch pai", "E2E geral"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        for nome, trechos in {
            "preparar": ("preparacao.py", "Nível 1", "Nível 2", "confirmação específica", "model: sonnet"),
            "executar": ("preparacao.py --nivel1", "git worktree add", "contexto.py", "não use a ferramenta `Skill`",
                         "Sem push, sem PR", "Retrabalho", "model: sonnet"),
            "validar": ("`verificador`", "`auditor-seguranca`", "`revisao-codigo`", "Retrabalho R<n>", "finishing-a-development-branch",
                        "confirmação específica", "integracao.md"),
            "finalizar": ("preparacao.py --nivel2", "E2E geral", "jornadas.md", "`liberacao`", "`implantacao`", "operacao.md"),
        }.items():
            texto = (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8")
            self.assertLessEqual(len(texto.splitlines()), 150, nome)
            for trecho in trechos:
                with self.subTest(skill=nome, trecho=trecho):
                    self.assertIn(trecho, texto)
        self.assertTrue((SKILLS / "preparar" / "references" / "modelo.md").exists())
        self.assertTrue((SKILLS / "validar" / "references" / "relatorio.md").exists())
        # o /executar não pode mandar chamar skill nem agente
        executar = (SKILLS / "executar" / "SKILL.md").read_text(encoding="utf-8")
        self.assertNotIn("subagent_type", executar)
        fluxo = (SKILLS / "fluxo" / "SKILL.md").read_text(encoding="utf-8")
        for comando in ("/preparar", "/executar", "/validar", "/finalizar"):
            with self.subTest(fluxo=comando):
                self.assertIn(comando, fluxo)

    def test_verificador_devolve_achados_para_o_retrabalho(self):
        verificador = (CLAUDE / "agents" / "verificador.md").read_text(encoding="utf-8")
        for trecho in ("`/validar`", "## Achados", "A-01", "retrabalho", "você não escreve tarefas"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, verificador)
        self.assertNotIn("revisão de marco", verificador)

    def test_execucao_sempre_em_sonnet_e_planejamento_em_opus(self):
        """Domínio e risco mudam o cuidado do lote, não o modelo; o planejamento é sempre Opus."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("`**Domínio**: sim|não`", "`**Risco**` não escolhe o modelo nem o ciclo",
                       "Todo lote é implementado pela sessão do `/executar`", "A execução é sempre **Sonnet**"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        self.assertNotIn("alguma tarefa de `**Risco**: alto`", claude_md)
        self.assertIn("o planejamento é sempre **Opus**", claude_md)
        self.assertNotIn("implementador-dominio", claude_md)
        self.assertIn("model: opus", (CLAUDE / "agents" / "planejador.md").read_text(encoding="utf-8").split("---")[1])

    def test_plano_pronto_vira_conferencia_do_delta(self):
        """Com plano.md pronto, reconhecimento e arqueologia conferem o plano; a rede de proteção continua."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("## Plano pronto", "Conferência, não nova investigação", "rede de proteção", "Base: plano pronto"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        for nome in ("legado", "feature"):
            with self.subTest(skill=nome):
                self.assertIn("**Plano pronto**", (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8"))

    def test_trava_de_modelo(self):
        """A sessão compara o próprio modelo com o da fase e pergunta antes de trabalhar."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn("**Trava de modelo**", claude_md)
        self.assertIn("antes de qualquer trabalho da fase", claude_md)
        self.assertIn("trava de modelo", (SKILLS / "fluxo" / "SKILL.md").read_text(encoding="utf-8"))
        self.assertIn("trava de modelo", (SKILLS / "fluxo" / "references" / "marcos.md").read_text(encoding="utf-8"))

    def test_modo_enxuto_com_entrada_pronta(self):
        """Plano ou critérios prontos: um agente grava só o tasks.md, uma aprovação, sessão em Sonnet."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("## Modo enxuto", "`planejador`", "**Modo**: enxuto", "`## Delta`", "`## Linha de base`",
                       "Tarefa T0, rede de proteção", "O campo Reuses nomeia a decisão", "**Sem aprovação ao fim:**",
                       "**Troca de sessão:**", "**Modelo pela entrada:**", "sem troca manual de `/model`",
                       "## Conferência spec × design"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        for nome in ("feature", "legado"):
            with self.subTest(skill=nome):
                texto = (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8")
                for trecho in ("modo enxuto", "`planejador`", "`**Modo**: enxuto`"):
                    self.assertIn(trecho, texto)
        agente = (CLAUDE / "agents" / "planejador.md").read_text(encoding="utf-8")
        cabecalho = agente.split("---")[1]
        self.assertIn("model: opus", cabecalho)
        tools = re.search(r"^tools:\s*(.*)$", cabecalho, re.MULTILINE).group(1)
        self.assertNotIn("Edit", tools)  # só grava o tasks.md; não altera código
        self.assertLessEqual(len(agente.splitlines()), 60)

    def test_fluxos_de_construcao_terminam_no_plano_e_apontam_para_os_comandos(self):
        """Cada fluxo que constrói termina no tasks.md e guarda o que o /executar e o /validar precisam saber."""
        fluxos = ("feature", "legado", "bug", "incidente", "refatoracao", "performance", "redesign",
                  "integracao-terceiros", "automacao", "projeto-novo", "uso-proprio")
        for nome in fluxos:
            with self.subTest(skill=nome):
                texto = (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("O plano está disponível para execução", texto)
                self.assertIn("/executar", texto)
                self.assertLessEqual(len(texto.splitlines()), 150)
                if nome not in ("projeto-novo", "uso-proprio"):
                    self.assertIn("Para o /executar e o /validar", texto)
                self.assertNotIn("subagent_type", texto)
        self.assertIn("jornadas.md", (SKILLS / "projeto-novo" / "SKILL.md").read_text(encoding="utf-8"))
        self.assertIn("jornadas.md", (SKILLS / "uso-proprio" / "SKILL.md").read_text(encoding="utf-8"))
        for caminho in ("refatoracao/references/verificacao.md", "performance/references/verificacao.md",
                        "redesign/references/verificacao.md"):  # o pedido do verificador continua existindo
            with self.subTest(arquivo=caminho):
                self.assertTrue((SKILLS / caminho).exists())
        legado = (SKILLS / "legado" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("**sempre** em legado", legado)
        self.assertIn("a suíte inteira roda ao fim de **cada lote**", legado)
        bug = (SKILLS / "bug" / "SKILL.md").read_text(encoding="utf-8")
        self.assertNotIn("A sessão corrige", bug)
        self.assertIn("lote pequeno", bug)

    def test_tasks_enxuto_passa_no_validador_do_tlc(self):
        """As seções de conferência do modelo do tlc podem sair: o validate_tasks.py só exige quatro."""
        from apoio import carregar
        import tempfile
        validador = carregar("../skills/tlc-spec-driven/scripts/validate_tasks.py")
        enxuto = "\n".join([
            "# Entrega N: Tasks", "", "**Modo**: enxuto", "**Base**: criterios.md, conferido em 2026-11-02", "",
            "## Delta", "- sem mudança desde o plano", "", "## Critérios", "- EN-01: vínculo no detalhe (T1)", "",
            "## Linha de base", "- suíte: 204 passam", "", "## Test Coverage Matrix", "| Camada | Teste |", "", "## Gate Check Commands",
            "- unit: dotnet test", "", "## Execution Plan", "### Phase 1: Back", "```", "T1 → T2", "```", "",
            "## Task Breakdown", "### T1: Ler o vínculo", "**Estimativa**: 1h", "**Risco**: alto", "**Domínio**: não",
            "**Depends on**: None", "**Tests**: unit", "**Gate**: unit", "", "### T2: Expor no detalhe", "**Estimativa**: 1h",
            "**Risco**: alto", "**Domínio**: não", "**Depends on**: T1", "**Tests**: unit", "**Gate**: unit", ""])
        with tempfile.TemporaryDirectory() as pasta:
            arquivo = Path(pasta) / "tasks.md"
            arquivo.write_text(enxuto, encoding="utf-8")
            erros, _ = validador.check(str(arquivo))
        self.assertEqual(erros, [])

    def test_prova_de_tela_vizinhanca_e_gate_registrado(self):
        """Teste de tela uma vez ao fim do lote, com teto; molde vizinho; gate registrado por árvore do commit."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("**Antes de editar, vizinhança:**", "**Prova de tela (tarefa de interface):**",
                       "roda uma vez ao fim do lote", "**Teto: 2 tentativas de 5 min**", "E2E não executado: <motivo>",
                       "asserção espacial ou visual", "**Registro do gate:**", "HEAD^{tree}"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        for nome, esperado in (("implementador", ("Vizinhança", "Molde:", "Prova de tela", "HEAD^{tree}")),):
            with self.subTest(agente=nome):
                texto = (CLAUDE / "agents" / f"{nome}.md").read_text(encoding="utf-8")
                for trecho in esperado:
                    self.assertIn(trecho, texto)

    def test_verificacao_proporcional_ao_risco(self):
        """Gate reaproveitado, até 3 mutações, relatório compacto e revisão de código só em risco alto."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("## Verificação proporcional", "**Gate reaproveitado:**", "Até **3** nos critérios de maior risco",
                       "Quem constrói não recebe a lista de mutações", "**Checagens de processo:**",
                       "**Relatório compacto:**", "**Decisões da Base:**", "sempre que a feature tem tarefa de `**Risco**: alto`",
                       "**`/validar`: uma feature por vez**", "**Retrabalho.**", "**Achados:**"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        verificador = (CLAUDE / "agents" / "verificador.md").read_text(encoding="utf-8")
        for trecho in ("reaproveitando", "até 3", "derive você", "sem lista recebida", "Checagens de processo",
                       "lacuna de precisão", "**Base**", "compacto"):
            with self.subTest(verificador=trecho):
                self.assertIn(trecho, verificador)
        self.assertIn("quando alguma tarefa é de `**Risco**: alto`", (SKILLS / "feature" / "SKILL.md").read_text(encoding="utf-8"))
        self.assertIn("**sempre** em legado", (SKILLS / "legado" / "SKILL.md").read_text(encoding="utf-8"))

    def test_criticidade_e_reuso_de_origem_externa(self):
        """O lote tem criticidade marcada no tasks.md; a leitura da origem de reuso é do planejamento."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("## Reuso de origem externa", "`reuso.md`", "linha do mapa", "comando de adaptação",
                       "Quem planeja marca a criticidade na quebra dos lotes", "`## Autorizações`"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        planejador = (CLAUDE / "agents" / "planejador.md").read_text(encoding="utf-8")
        for trecho in ("**Criticidade**", "reuso.md"):
            with self.subTest(planejador=trecho):
                self.assertIn(trecho, planejador)
        for nome in ("feature", "projeto-novo", "uso-proprio"):
            with self.subTest(skill=nome):
                texto = (SKILLS / nome / "SKILL.md").read_text(encoding="utf-8")
                self.assertNotIn("sempre por subagente", texto.lower())

    def test_fluxo_pronto_aponta_para_skill_existente(self):
        menu = (SKILLS / "fluxo" / "SKILL.md").read_text(encoding="utf-8")
        prontos = [linha for linha in menu.splitlines() if linha.startswith("|") and "**Pronto**" in linha]
        self.assertTrue(prontos, "nenhum fluxo pronto no menu")
        for linha in prontos:
            with self.subTest(linha=linha[:40]):
                nomes = re.findall(r"skill `([a-z0-9-]+)`", linha)
                self.assertTrue(nomes, "fluxo pronto sem skill indicada")
                for nome in nomes:
                    self.assertTrue((SKILLS / nome / "SKILL.md").exists(), f"skill {nome} não existe")


    def test_guarda_erro_e_seguranca_padrao_evitam_retrabalho(self):
        """Linha de base 2026-11-04 (ControleFinanceiroTeste): os achados do /validar viraram regra antes do código."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        for trecho in ("**Guarda, um teste por ramo:**", "cada método HTTP", "falha quando a guarda é removida",
                       "**Critério de erro tem teste de erro.**", "gatilho de falha",
                       "## Segurança padrão de app web", "`Sec-Fetch-Site`", "`Origin`", "`Host`",
                       "Content-Security-Policy", "`Referrer-Policy: same-origin`", "**primeiro lote do servidor**"):
            with self.subTest(trecho=trecho):
                self.assertIn(trecho, claude_md)
        # a regra de planejamento fica antes da Execução, onde o planejador a lê
        self.assertLess(claude_md.index("## Segurança padrão de app web"), claude_md.index("## Execução"))


    def test_sensor_do_verificador_nao_roda_a_suite_inteira_por_mutante(self):
        """Medição 2026-11-04: ~10 de 18 min do verificador foram comando (suíte e e2e por mutante, cópia de node_modules, typecheck de 9 commits)."""
        claude_md = (CLAUDE / "CLAUDE.md").read_text(encoding="utf-8")
        verificador = (CLAUDE / "agents" / "verificador.md").read_text(encoding="utf-8")
        for nome, texto in (("CLAUDE.md", claude_md), ("verificador.md", verificador)):
            for trecho in ("só o teste do arquivo mutado", "e2e roda uma vez", "por junção", "nunca `cp -r node_modules`",
                           "no máximo 3 commits"):
                with self.subTest(arquivo=nome, trecho=trecho):
                    self.assertIn(trecho, texto)
        self.assertNotIn("fecha verde em cada commit de código", claude_md)


if __name__ == "__main__":
    unittest.main()
