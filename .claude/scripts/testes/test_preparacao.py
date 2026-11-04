import tempfile
import unittest
from pathlib import Path

from apoio import carregar

pc = carregar("preparacao.py")

COMPLETO = """# Preparação

## Nível 1 — síncrono (necessário para /executar)

- [x] Repositório e remoto
- [x] Ambiente local com banco
- [x] Esqueleto ponta a ponta

## Nível 2 — assíncrono (até o fim da execução)

- [ ] Staging
- [ ] Produção
"""


class TestPreparacao(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.arquivo = Path(self._tmp.name) / "preparacao.md"

    def tearDown(self):
        self._tmp.cleanup()

    def rodar(self, texto, *args):
        if texto is not None:
            self.arquivo.write_text(texto, encoding="utf-8")
        return pc.main([*args, "--arquivo", str(self.arquivo)])

    def test_ler_separa_os_dois_niveis(self):
        self.arquivo.write_text(COMPLETO, encoding="utf-8")
        niveis = pc.ler(self.arquivo)
        self.assertEqual([f for f, _ in niveis[1]], [True, True, True])
        self.assertEqual([t for _, t in niveis[2]], ["Staging", "Produção"])

    def test_nivel1_completo_libera_o_executar_mesmo_com_o_nivel2_aberto(self):
        self.assertEqual(self.rodar(COMPLETO, "--nivel1"), 0)

    def test_nivel1_com_item_aberto_recusa(self):
        self.assertEqual(self.rodar(COMPLETO.replace("- [x] Esqueleto", "- [ ] Esqueleto"), "--nivel1"), 1)

    def test_nivel2_aberto_bloqueia_o_finalizar(self):
        self.assertEqual(self.rodar(COMPLETO, "--nivel2"), 1)

    def test_nivel2_completo_libera(self):
        self.assertEqual(self.rodar(COMPLETO.replace("[ ]", "[x]"), "--nivel2"), 0)

    def test_sem_argumento_mostra_os_dois_e_falha_se_algum_aberto(self):
        self.assertEqual(self.rodar(COMPLETO), 1)

    def test_arquivo_ausente_manda_rodar_o_preparar(self):
        self.assertEqual(pc.main(["--nivel1", "--arquivo", str(self.arquivo)]), 2)

    def test_arquivo_sem_o_nivel_manda_rodar_o_preparar(self):
        self.assertEqual(self.rodar("# Preparação\n\n## Nível 2 — x\n\n- [x] a\n", "--nivel1"), 2)

    def test_nivel_sem_itens_nao_conta_como_completo(self):
        self.assertEqual(self.rodar("## Nível 1 — síncrono\n\nsó texto\n", "--nivel1"), 2)

    def test_caixa_maiuscula_vale(self):
        self.assertEqual(self.rodar("## Nível 1\n\n- [X] a\n", "--nivel1"), 0)


if __name__ == "__main__":
    unittest.main()
