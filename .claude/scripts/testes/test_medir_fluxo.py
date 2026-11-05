import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from apoio import SCRIPTS, carregar

SCRIPT = SCRIPTS / "medir-fluxo.py"
medir = carregar("medir-fluxo.py")


def comando(nome, quando):
    return json.dumps({"type": "user", "timestamp": quando, "message": {
        "role": "user", "content": f"<command-message>{nome}</command-message>\n<command-name>/{nome}</command-name>"}})


def fala(texto, quando, meta=False):
    d = {"type": "user", "timestamp": quando, "message": {"role": "user", "content": texto}}
    if meta:
        d["isMeta"] = True
    return json.dumps(d)


def resultado(id_, quando):
    return json.dumps({"type": "user", "timestamp": quando, "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": id_, "content": "ok"}]}})


def resposta(id_, quando, saida=10, cache_lido=100, entrada=1, cache_gravado=0, usos=()):
    """usos: lista de (nome_da_ferramenta, id_do_uso)."""
    conteudo = [{"type": "tool_use", "id": uid, "name": nome, "input": {}} for nome, uid in usos]
    return json.dumps({"type": "assistant", "requestId": f"req-{id_}", "timestamp": quando, "message": {
        "id": id_, "role": "assistant", "model": "claude-sonnet-5-5", "content": conteudo, "usage": {
            "input_tokens": entrada, "output_tokens": saida,
            "cache_read_input_tokens": cache_lido, "cache_creation_input_tokens": cache_gravado}}})


class TestMedirFluxo(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self._tmp.name) / "proj"
        (self.raiz / "sess1" / "subagents").mkdir(parents=True)

    def tearDown(self):
        self._tmp.cleanup()

    def principal(self, *linhas, nome="sess1"):
        (self.raiz / f"{nome}.jsonl").write_text("\n".join(linhas), encoding="utf-8")

    def segmentos(self, **filtros):
        return medir.segmentar(self.raiz, **filtros)

    def test_um_segmento_por_comando_na_ordem(self):
        self.principal(
            comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z"),
            comando("validar", "2026-11-04T10:05:00Z"), resposta("b", "2026-11-04T10:06:00Z"))
        segs = self.segmentos()
        self.assertEqual([s["comando"] for s in segs], ["/executar", "/validar"])

    def test_o_que_vem_antes_do_primeiro_comando_fica_sem_comando(self):
        self.principal(fala("oi", "2026-11-04T09:00:00Z"), resposta("a", "2026-11-04T09:00:30Z"),
                       comando("executar", "2026-11-04T10:00:00Z"), resposta("b", "2026-11-04T10:01:00Z"))
        segs = self.segmentos()
        self.assertEqual(segs[0]["comando"], "(sem comando)")
        self.assertEqual(segs[1]["comando"], "/executar")

    def test_soma_tokens_chamadas_e_contexto_maximo(self):
        self.principal(
            comando("executar", "2026-11-04T10:00:00Z"),
            resposta("a", "2026-11-04T10:01:00Z", saida=10, cache_lido=1000, entrada=5, cache_gravado=20),
            resposta("b", "2026-11-04T10:02:00Z", saida=30, cache_lido=3000, entrada=7, cache_gravado=40))
        seg = self.segmentos()[0]
        self.assertEqual(seg["saida"], 40)
        self.assertEqual(seg["cache_lido"], 4000)
        self.assertEqual(seg["chamadas"], 2)
        self.assertEqual(seg["contexto_max"], 3000 + 7 + 40)

    def test_nao_conta_duas_vezes_a_mesma_resposta(self):
        r = resposta("a", "2026-11-04T10:01:00Z", saida=10)
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), r, r)
        self.assertEqual(self.segmentos()[0]["saida"], 10)

    def test_conta_perguntas_subagentes_skills_e_bash(self):
        self.principal(
            comando("validar", "2026-11-04T10:00:00Z"),
            resposta("a", "2026-11-04T10:01:00Z", usos=[("AskUserQuestion", "q1"), ("Agent", "g1"), ("Skill", "s1")]),
            resposta("b", "2026-11-04T10:02:00Z", usos=[("Bash", "b1"), ("Bash", "b2")]))
        seg = self.segmentos()[0]
        self.assertEqual((seg["perguntas"], seg["subagentes"], seg["skills"], seg["bash"]), (1, 1, 1, 2))

    def test_espera_da_pergunta_sai_do_tempo_ativo(self):
        self.principal(
            comando("preparar", "2026-11-04T10:00:00Z"),
            resposta("a", "2026-11-04T10:01:00Z", usos=[("AskUserQuestion", "q1")]),
            resultado("q1", "2026-11-04T10:06:00Z"),
            resposta("b", "2026-11-04T10:07:00Z"))
        seg = self.segmentos()[0]
        self.assertEqual(seg["duracao_s"], 7 * 60)
        self.assertEqual(seg["espera_s"], 5 * 60)
        self.assertEqual(seg["ativo_s"], 2 * 60)

    def test_pausa_antes_de_nova_fala_do_usuario_conta_como_espera(self):
        self.principal(
            comando("fluxo", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z"),
            fala("pode seguir", "2026-11-04T10:11:00Z"), resposta("b", "2026-11-04T10:12:00Z"))
        seg = self.segmentos()[0]
        self.assertEqual(seg["espera_s"], 10 * 60)
        self.assertEqual(seg["ativo_s"], 2 * 60)

    def test_mensagem_injetada_pelo_sistema_nao_conta_como_espera(self):
        self.principal(
            comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z"),
            fala("conteudo da skill", "2026-11-04T10:06:00Z", meta=True), resposta("b", "2026-11-04T10:07:00Z"))
        self.assertEqual(self.segmentos()[0]["espera_s"], 0)

    def test_bloco_de_ferramenta_em_linha_com_o_mesmo_id_da_resposta_e_contado(self):
        """O Claude Code grava um bloco por linha, todas com o mesmo message.id e o mesmo usage."""
        texto = resposta("a", "2026-11-04T10:01:00Z", saida=10)
        ferramenta = resposta("a", "2026-11-04T10:01:01Z", saida=10, usos=[("AskUserQuestion", "q1"), ("Bash", "b1")])
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), texto, ferramenta)
        seg = self.segmentos()[0]
        self.assertEqual((seg["chamadas"], seg["saida"], seg["perguntas"], seg["bash"]), (1, 10, 1, 1))

    def test_saida_final_da_resposta_vale_mais_que_a_parcial(self):
        parcial = resposta("a", "2026-11-04T10:01:00Z", saida=3)
        final = resposta("a", "2026-11-04T10:01:02Z", saida=40)
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), parcial, final)
        self.assertEqual(self.segmentos()[0]["saida"], 40)

    def test_pausa_longa_entre_registros_conta_como_espera(self):
        self.principal(
            comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z"),
            resposta("b", "2026-11-04T20:01:00Z"))  # sessão esquecida aberta por 10 h
        seg = self.segmentos()[0]
        self.assertEqual(seg["espera_s"], 10 * 3600)
        self.assertEqual(seg["ativo_s"], 60)

    def test_pausa_curta_entre_registros_e_trabalho(self):
        self.principal(
            comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z"),
            resposta("b", "2026-11-04T10:08:00Z"))  # comando demorado de 7 min
        self.assertEqual(self.segmentos()[0]["espera_s"], 0)

    def test_registro_fora_de_ordem_nao_gera_espera_negativa(self):
        self.principal(
            comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:05:00Z"),
            fala("oi", "2026-11-04T10:02:00Z"), resposta("b", "2026-11-04T10:06:00Z"))
        seg = self.segmentos()[0]
        self.assertGreaterEqual(seg["espera_s"], 0)
        self.assertGreaterEqual(seg["ativo_s"], 0)

    def test_ignora_subagentes(self):
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z", saida=5))
        (self.raiz / "sess1" / "subagents" / "agent-x.jsonl").write_text(
            resposta("z", "2026-11-04T10:02:00Z", saida=999), encoding="utf-8")
        self.assertEqual(self.segmentos()[0]["saida"], 5)

    def test_comando_repetido_em_outra_sessao_vira_outro_segmento(self):
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z"), nome="s1")
        self.principal(comando("executar", "2026-11-04T11:00:00Z"), resposta("b", "2026-11-04T11:01:00Z"), nome="s2")
        self.assertEqual(len(self.segmentos()), 2)

    def test_filtra_por_periodo(self):
        self.principal(comando("executar", "2026-11-03T10:00:00Z"), resposta("a", "2026-11-03T10:01:00Z"),
                       comando("validar", "2026-11-04T10:00:00Z"), resposta("b", "2026-11-04T10:01:00Z"))
        segs = self.segmentos(desde=medir.instante("2026-11-04"))
        self.assertEqual([s["comando"] for s in segs], ["/validar"])

    def test_linha_corrompida_e_ignorada(self):
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), "{não é json", resposta("a", "2026-11-04T10:01:00Z"))
        self.assertEqual(self.segmentos()[0]["chamadas"], 1)

    def test_cli_json_e_erro_sem_registros(self):
        self.principal(comando("executar", "2026-11-04T10:00:00Z"), resposta("a", "2026-11-04T10:01:00Z", saida=7))
        ok = subprocess.run([sys.executable, str(SCRIPT), "--pasta", str(self.raiz), "--json"],
                            capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertEqual(json.loads(ok.stdout)["segmentos"][0]["saida"], 7)
        vazio = subprocess.run([sys.executable, str(SCRIPT), "--pasta", str(Path(self._tmp.name) / "nada")],
                               capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(vazio.returncode, 2)


if __name__ == "__main__":
    unittest.main()
