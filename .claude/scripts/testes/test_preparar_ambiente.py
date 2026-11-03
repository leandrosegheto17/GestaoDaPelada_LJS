import contextlib
import io
import json
import socket
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from apoio import carregar

pa = carregar("preparar-ambiente.py")


@contextlib.contextmanager
def porta_ocupada():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    s.listen(1)
    try:
        yield s.getsockname()[1]
    finally:
        s.close()


class TestPorta(unittest.TestCase):
    def test_porta_ocupada_nao_esta_livre(self):
        with porta_ocupada() as porta:
            self.assertFalse(pa.porta_livre(porta))

    def test_porta_solta_esta_livre(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]
        s.close()
        self.assertTrue(pa.porta_livre(porta))

    def test_aviso_de_porta_ocupada_sugere_outra_e_lembra_do_proprio_banco(self):
        with porta_ocupada() as porta:
            texto, correcao = pa.checar_porta(porta)
        self.assertIn("ocupada", texto)
        self.assertIn("deste projeto", texto)
        self.assertIn("DB_PORTA=", correcao)

    def test_porta_livre_nao_pede_correcao(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]
        s.close()
        self.assertIsNone(pa.checar_porta(porta)[1])


class TestPortasPedidas(unittest.TestCase):
    def test_argumento_vence_ambiente(self):
        with mock.patch.dict("os.environ", {"DB_PORTA": "5435"}):
            self.assertEqual(pa.portas_pedidas([6000], True), [6000])

    def test_usa_db_porta_do_ambiente(self):
        with mock.patch.dict("os.environ", {"DB_PORTA": "5435"}):
            self.assertEqual(pa.portas_pedidas([], True), [5435])

    def test_com_compose_e_sem_nada_usa_a_padrao(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(pa.portas_pedidas([], True), [pa.PORTA_PADRAO])
            self.assertEqual(pa.portas_pedidas([], False), [])


class TestGerenciador(unittest.TestCase):
    def raiz(self, pacote=None):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        if pacote is not None:
            (Path(d.name) / "package.json").write_text(json.dumps(pacote), encoding="utf-8")
        return Path(d.name)

    def test_le_o_nome_do_package_manager(self):
        self.assertEqual(pa.gerenciador_de(self.raiz({"packageManager": "pnpm@11.0.0"})), "pnpm")

    def test_sem_declaracao_nao_confere(self):
        texto, correcao = pa.checar_gerenciador(self.raiz({"name": "x"}))
        self.assertIsNone(correcao)
        self.assertIn("nada a conferir", texto)

    def test_gerenciador_fora_do_path_pede_correcao(self):
        raiz = self.raiz({"packageManager": "pnpm@11.0.0"})
        with mock.patch.object(pa.shutil, "which", return_value=None):
            texto, correcao = pa.checar_gerenciador(raiz)
        self.assertIn("não está no PATH", texto)
        self.assertIn("corepack", correcao)

    def test_gerenciador_quebrado_pede_correcao(self):
        raiz = self.raiz({"packageManager": "pnpm@11.0.0"})
        with mock.patch.object(pa.shutil, "which", return_value="pnpm"), \
                mock.patch.object(pa, "_roda", return_value=(False, "Cannot find module")):
            texto, correcao = pa.checar_gerenciador(raiz)
        self.assertIn("falhou", texto)
        self.assertIn("antes no PATH", correcao)

    def test_gerenciador_que_roda_passa(self):
        raiz = self.raiz({"packageManager": "pnpm@11.0.0"})
        with mock.patch.object(pa.shutil, "which", return_value="pnpm"), \
                mock.patch.object(pa, "_roda", return_value=(True, "11.23.0")):
            self.assertEqual(pa.checar_gerenciador(raiz), ("gerenciador de pacotes: pnpm 11.23.0", None))


class TestWorkspaceEDocker(unittest.TestCase):
    def raiz(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        return Path(d.name)

    def test_sem_workspace_nao_confere(self):
        self.assertIsNone(pa.checar_workspace(self.raiz()))

    def test_workspace_sem_dedupe_pede_correcao(self):
        raiz = self.raiz()
        (raiz / "pnpm-workspace.yaml").write_text("packages:\n  - 'backend/*'\n", encoding="utf-8")
        self.assertIn("dedupePeers: true", pa.checar_workspace(raiz)[1])

    def test_workspace_com_dedupe_passa(self):
        raiz = self.raiz()
        (raiz / "pnpm-workspace.yaml").write_text("packages:\n  - 'x'\ndedupePeers: true\n", encoding="utf-8")
        self.assertIsNone(pa.checar_workspace(raiz)[1])

    def test_sem_compose_nao_confere_docker(self):
        self.assertIsNone(pa.checar_docker(self.raiz()))

    def test_docker_parado_pede_para_abrir(self):
        raiz = self.raiz()
        (raiz / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
        with mock.patch.object(pa.shutil, "which", return_value="docker"), \
                mock.patch.object(pa, "_roda", return_value=(False, "cannot connect")):
            texto, correcao = pa.checar_docker(raiz)
        self.assertIn("não responde", texto)
        self.assertIn("Docker Desktop", correcao)


class TestNode(unittest.TestCase):
    def raiz(self, engines):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        (Path(d.name) / "package.json").write_text(json.dumps({"engines": {"node": engines}} if engines else {}), encoding="utf-8")
        return Path(d.name)

    def test_faixa_aceita_e_recusa(self):
        self.assertTrue(pa.node_aceito(">=24 <25", 24))
        self.assertFalse(pa.node_aceito(">=24 <25", 26))
        self.assertFalse(pa.node_aceito(">=24 <25", 22))
        self.assertTrue(pa.node_aceito("^24", 24))
        self.assertTrue(pa.node_aceito("24.x", 24))
        self.assertIsNone(pa.node_aceito("lts/*", 24))

    def test_versao_fora_de_engines_e_aviso_que_nao_bloqueia(self):
        texto, sugestao, gravidade = pa.checar_node(self.raiz(">=24 <25"), "v26.13.0")
        self.assertEqual(gravidade, "aviso")
        self.assertIn("fora de engines", texto)

    def test_versao_dentro_de_engines_passa(self):
        self.assertEqual(pa.checar_node(self.raiz(">=24 <25"), "v24.1.0")[2], "ok")

    def test_sem_engines_nao_diz_nada(self):
        self.assertIsNone(pa.checar_node(self.raiz(None), "v26.0.0"))


class TestSuite(unittest.TestCase):
    def raiz(self, scripts, comando="pnpm test", workspace=None, pacotes=None):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        r = Path(d.name)
        (r / "package.json").write_text(json.dumps({"scripts": scripts}), encoding="utf-8")
        (r / ".specs" / "projeto").mkdir(parents=True)
        (r / ".specs" / "projeto" / "testes.json").write_text(json.dumps({"comando": comando}), encoding="utf-8")
        if workspace:
            (r / "pnpm-workspace.yaml").write_text(workspace, encoding="utf-8")
        for nome, scr in (pacotes or {}).items():
            (r / nome).mkdir(parents=True)
            (r / nome / "package.json").write_text(json.dumps({"scripts": scr}), encoding="utf-8")
        return r

    def test_test_que_deixa_test_checagens_de_fora_e_lacuna(self):
        r = self.raiz({"test": "pnpm -r test", "test:checagens": "node x"})
        texto, correcao = pa.checar_suite(r)
        self.assertIn("test:checagens", texto)
        self.assertIsNotNone(correcao)

    def test_test_que_roda_tudo_passa(self):
        r = self.raiz({"test": "pnpm -r test && pnpm test:checagens", "test:checagens": "node x"})
        self.assertIsNone(pa.checar_suite(r)[1])

    def test_test_nao_recursivo_com_pacotes_e_lacuna(self):
        r = self.raiz({"test": "vitest"}, workspace="packages:\n  - 'backend/*'\n", pacotes={"backend/api": {"test": "vitest run"}})
        texto, correcao = pa.checar_suite(r)
        self.assertIn("não percorre os pacotes", texto)
        self.assertIn("backend/api", texto)

    def test_comando_diferente_nao_confere(self):
        r = self.raiz({"test": "x"}, comando="make check")
        self.assertIsNone(pa.checar_suite(r)[1])

    def test_sem_testes_json_nao_confere(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        (Path(d.name) / "package.json").write_text("{}", encoding="utf-8")
        self.assertIsNone(pa.checar_suite(Path(d.name)))


class TestMain(unittest.TestCase):
    def roda(self, *argv):
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            codigo = pa.main(list(argv))
        return codigo, saida.getvalue()

    def test_raiz_inexistente_sai_com_2(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(pa.main(["--raiz", "/não/existe/de/jeito/nenhum"]), 2)

    def test_ambiente_sem_problema_sai_com_0(self):
        with tempfile.TemporaryDirectory() as d:
            codigo, saida = self.roda("--raiz", d)
        self.assertEqual(codigo, 0)
        self.assertIn("Ambiente pronto.", saida)

    def test_problema_sai_com_1_e_diz_o_que_corrigir(self):
        with tempfile.TemporaryDirectory() as d, porta_ocupada() as porta:
            codigo, saida = self.roda("--raiz", d, "--porta", str(porta))
        self.assertEqual(codigo, 1)
        self.assertIn("PROBLEMA: porta", saida)
        self.assertIn("corrija:", saida)


if __name__ == "__main__":
    unittest.main()
