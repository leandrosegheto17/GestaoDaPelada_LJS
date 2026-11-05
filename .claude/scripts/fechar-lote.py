#!/usr/bin/env python3
"""Fecha o lote atual do /executar numa chamada só.

Uso (depois do commit do código do lote, com a árvore limpa fora do tasks.md):
  python .claude/scripts/fechar-lote.py [--raiz .] [--item PASTA] [--gate "<comando>"] [--rodape "<linha>"]

O que faz, na ordem:
  1. Roda o gate do lote: `--gate` (o comando já filtrado pelos pacotes tocados) ou o `comando` de
     `.specs/projeto/testes.json`. Falhou: mostra o fim da saída, não escreve nada e sai com 1.
  2. Grava no tasks.md, nas tarefas do lote, as caixas marcadas e `**Status**: concluída` (onde há Status),
     e a linha `Gate: <comando> @ <árvore> = <resultado>` ao fim da última tarefa do lote.
  3. Commita só o tasks.md (`chore(tasks): fecha o lote N ...`); `--rodape` entra no fim da mensagem.
  4. Imprime três linhas: o gate, a linha do progresso.py e o veredito do contexto.py.

O lote é o primeiro com tarefa em aberto. Sai com 0, 1 (gate falhou), 2 (não achou o lote ou o tasks.md,
ou o commit falhou) ou 3 (fechou, mas o contexto passou do limite: pare e peça /clear).
"""

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def _carregar(nome):
    spec = importlib.util.spec_from_file_location(nome.replace("-", "_"), AQUI / f"{nome}.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _git(raiz, *args, check=True):
    return subprocess.run(["git", *args], cwd=raiz, capture_output=True, text=True, encoding="utf-8", check=check)


def comando_do_gate(raiz, gate):
    if gate:
        return gate
    arquivo = Path(raiz) / ".specs" / "projeto" / "testes.json"
    try:
        return json.loads(arquivo.read_text(encoding="utf-8")).get("comando")
    except (OSError, ValueError):
        return None


def marcar_lote(texto, ids, gate_linha):
    """Marca as tarefas `ids` como concluídas e põe a linha do gate ao fim da última delas."""
    linhas = texto.split("\n")
    alvo = {i.upper() for i in ids}
    titulo = re.compile(r"^(#{2,4})\s+(T\d+)\s*:", re.IGNORECASE)
    qualquer = re.compile(r"^(#{1,6})\s")
    status = re.compile(r"^(\s*\*\*Status\*\*\s*:\s*).*$", re.IGNORECASE)
    caixa = re.compile(r"^(\s*[-*]\s+)\[ \]")
    ultima_fim = None
    dentro, nivel = False, 0
    for n, linha in enumerate(linhas):
        achou = titulo.match(linha)
        if achou:
            dentro = achou.group(2).upper() in alvo
            nivel = len(achou.group(1))
            if dentro:
                ultima_fim = n
            continue
        if qualquer.match(linha) and len(qualquer.match(linha).group(1)) <= nivel:
            dentro = False
        if dentro:
            linhas[n] = status.sub(r"\1concluída", caixa.sub(r"\1[x]", linha))
            if linha.strip():
                ultima_fim = n
    if ultima_fim is None:
        return texto
    linhas[ultima_fim + 1:ultima_fim + 1] = ["", gate_linha]
    return "\n".join(linhas)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--raiz", default=".", help="raiz do projeto ou da worktree (padrão: a atual)")
    ap.add_argument("--item", help="pasta do item (ex.: .specs/features/x); padrão: o do progresso.py")
    ap.add_argument("--gate", help="comando do gate já filtrado pelos pacotes tocados (padrão: testes.json)")
    ap.add_argument("--rodape", help="linha final da mensagem do commit (ex.: a atribuição)")
    args = ap.parse_args(argv)
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")
    raiz = Path(args.raiz).resolve()
    prog = _carregar("progresso")
    rel = prog.relatorio(raiz, args.item)
    det = rel.get("detalhe")
    if not det:
        print("Sem tasks.md com tarefas para fechar.", file=sys.stderr)
        return 2
    por_id = {t["id"]: t for t in det["tarefas"]}
    lote = next((l for l in det["lotes"] if not all(por_id[i]["feita"] for i in l["tarefas"])), None)
    if lote is None:
        print("Todos os lotes já estão concluídos.", file=sys.stderr)
        return 2
    comando = comando_do_gate(raiz, args.gate)
    if not comando:
        print("Sem comando de gate: passe --gate ou grave `comando` em .specs/projeto/testes.json.", file=sys.stderr)
        return 2

    gate = subprocess.run(comando, cwd=raiz, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if gate.returncode != 0:
        fim = "\n".join((gate.stdout + gate.stderr).strip().splitlines()[-20:])
        print(f"Gate FALHOU (saída {gate.returncode}): {comando}\n{fim}")
        return 1
    arvore = _git(raiz, "rev-parse", "HEAD^{tree}").stdout.strip()
    gate_linha = f"Gate: {comando} @ {arvore} = verde"

    item = rel["item"]["nome"]
    arquivo = raiz / item / "tasks.md"
    if not arquivo.is_file():
        print(f"tasks.md não encontrado: {arquivo}", file=sys.stderr)
        return 2
    texto = arquivo.read_text(encoding="utf-8")
    arquivo.write_text(marcar_lote(texto, lote["tarefas"], gate_linha), encoding="utf-8", newline="")
    ids = ", ".join(lote["tarefas"])
    nome = lote.get("rotulo") or lote["numero"]
    mensagem = f"chore(tasks): fecha o lote {nome}, tarefas {ids} concluídas com o gate verde"
    if args.rodape:
        mensagem += f"\n\n{args.rodape}"
    try:
        _git(raiz, "add", str(arquivo))
        _git(raiz, "commit", "-q", "-m", mensagem)
    except subprocess.CalledProcessError as erro:
        print(f"Commit de fechamento falhou: {(erro.stderr or erro.stdout).strip()}", file=sys.stderr)
        return 2

    print(gate_linha)
    linha = prog.linha_lote(prog.relatorio(raiz, args.item), lote["numero"])
    print(linha or f"Lote {nome} fechado")
    ctx = subprocess.run([sys.executable, str(AQUI / "contexto.py"), "--projeto", str(raiz)],
                         capture_output=True, text=True, encoding="utf-8")
    print((ctx.stdout or ctx.stderr).strip())
    return 3 if ctx.returncode == 1 else 0


if __name__ == "__main__":
    sys.exit(main())
