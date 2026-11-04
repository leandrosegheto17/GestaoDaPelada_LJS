import json
import os
import re
import tempfile
import unittest
from pathlib import Path

from apoio import carregar

ctx = carregar("contexto.py")


def resposta(id_, entrada=10, leitura=0, escrita=0, lateral=False):
    reg = {"type": "assistant", "uuid": id_,
           "message": {"id": id_, "usage": {"input_tokens": entrada, "cache_read_input_tokens": leitura,
                                            "cache_creation_input_tokens": escrita, "output_tokens": 5}}}
    if lateral:
        reg["isSidechain"] = True
    return reg


def sessao(pasta, nome, registros, instante=None):
    arq = Path(pasta) / f"{nome}.jsonl"
    arq.write_text("\n".join(json.dumps(r) for r in registros) + "\nlinha quebrada\n", encoding="utf-8")
    if instante:
        os.utime(arq, (instante, instante))
    return arq


class TestContextoDaSessao(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_contexto_e_a_soma_da_ultima_resposta(self):
        sessao(self.pasta, "s1", [resposta("a", 5, 1000, 500), resposta("b", 7, 2000, 300)])
        tokens, _ = ctx.contexto_da_sessao(self.pasta)
        self.assertEqual(tokens, 7 + 2000 + 300)

    def test_usa_a_sessao_mais_recente(self):
        sessao(self.pasta, "velha", [resposta("a", 1, 900_000)], instante=1_000_000_000)
        sessao(self.pasta, "nova", [resposta("b", 1, 2000)], instante=1_900_000_000)
        self.assertEqual(ctx.contexto_da_sessao(self.pasta)[0], 2001)

    def test_ignora_resposta_de_subagente(self):
        sessao(self.pasta, "s1", [resposta("a", 1, 1000), resposta("b", 1, 99_000, lateral=True)])
        self.assertEqual(ctx.contexto_da_sessao(self.pasta)[0], 1001)

    def test_sem_resposta_devolve_none(self):
        sessao(self.pasta, "s1", [{"type": "user"}])
        self.assertIsNone(ctx.contexto_da_sessao(self.pasta))


class TestContextoCli(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name)
        self.projeto = base / "meu projeto"
        self.projeto.mkdir()
        self.raiz = base / "registros"
        self.raiz.mkdir()
        # a pasta de registros leva o caminho com símbolos trocados por hífen
        self.pasta = self.raiz / re.sub(r"[^A-Za-z0-9]", "-", str(self.projeto))
        self.pasta.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def rodar(self, *extra):
        return ctx.main(["--projeto", str(self.projeto), "--raiz", str(self.raiz), *extra])

    def test_abaixo_do_limite_segue(self):
        sessao(self.pasta, "s1", [resposta("a", 1, 100_000)])
        self.assertEqual(self.rodar(), 0)

    def test_acima_do_limite_padrao_de_300k_manda_limpar(self):
        sessao(self.pasta, "s1", [resposta("a", 1, 300_000, 5)])
        self.assertEqual(self.rodar(), 1)

    def test_exatamente_no_limite_ainda_segue(self):
        sessao(self.pasta, "s1", [resposta("a", 0, 300_000)])
        self.assertEqual(self.rodar(), 0)

    def test_limite_do_projeto_vem_do_execucao_json(self):
        sessao(self.pasta, "s1", [resposta("a", 1, 150_000)])
        (self.projeto / ".specs" / "projeto").mkdir(parents=True)
        (self.projeto / ".specs" / "projeto" / "execucao.json").write_text('{"limite_contexto": 100000}', encoding="utf-8")
        self.assertEqual(self.rodar(), 1)

    def test_parametro_limite_vale_mais_que_o_arquivo(self):
        sessao(self.pasta, "s1", [resposta("a", 1, 150_000)])
        self.assertEqual(self.rodar("--limite", "200000"), 0)

    def test_execucao_json_invalido_cai_no_padrao(self):
        sessao(self.pasta, "s1", [resposta("a", 1, 150_000)])
        (self.projeto / ".specs" / "projeto").mkdir(parents=True)
        (self.projeto / ".specs" / "projeto" / "execucao.json").write_text("não é json", encoding="utf-8")
        self.assertEqual(self.rodar(), 0)

    def test_sem_registros_sai_com_dois(self):
        self.assertEqual(self.rodar(), 2)


if __name__ == "__main__":
    unittest.main()
