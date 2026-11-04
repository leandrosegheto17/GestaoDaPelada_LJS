#!/usr/bin/env python3
"""Mede o tamanho do contexto da sessão atual do Claude Code e diz se passou do limite.

Uso (ao fechar cada lote do /executar):
  python .claude/scripts/contexto.py [--projeto <pasta>] [--limite N] [--raiz <registros>]

O tamanho é o da última resposta do modelo na sessão mais recente: entrada + leitura de cache +
escrita de cache (a mesma conta do medir-lotes.py). O limite vem, nesta ordem, de --limite, de
`limite_contexto` em `.specs/projeto/execucao.json` ou do padrão de 300 mil tokens.
Os registros ficam sob a pasta onde a sessão começou; numa worktree, a pasta é a do repositório
principal, e o script tenta as duas. Somente leitura.

Sai com 0 abaixo do limite, 1 acima (pare e peça /clear) e 2 quando não acha registros.
"""

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

LIMITE_PADRAO = 300_000
_aqui = Path(__file__).resolve().parent


def _pasta_de_registros(projeto, raiz=None):
    spec = importlib.util.spec_from_file_location("medir_lotes", _aqui / "medir-lotes.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.pasta_de_registros(projeto, raiz)


def repositorio_principal(pasta):
    """Raiz do repositório principal quando `pasta` é uma worktree; None se não for git."""
    try:
        saida = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=pasta,
                               capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    comum = Path(saida)
    return comum.parent if comum.name == ".git" else None


def contexto_da_sessao(pasta_registros):
    """(tokens, arquivo) da última resposta da sessão mais recente; None se não houver."""
    sessoes = sorted((p for p in Path(pasta_registros).glob("*.jsonl") if p.is_file()), key=lambda p: p.stat().st_mtime)
    for arquivo in reversed(sessoes):
        ultimo = None
        for linha in arquivo.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                reg = json.loads(linha)
            except ValueError:
                continue
            msg = reg.get("message")
            if reg.get("type") == "assistant" and not reg.get("isSidechain") and isinstance(msg, dict) and msg.get("usage"):
                ultimo = msg["usage"]
        if ultimo:
            total = sum(ultimo.get(c) or 0 for c in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
            return total, arquivo
    return None


def limite_do_projeto(projeto):
    arquivo = Path(projeto) / ".specs" / "projeto" / "execucao.json"
    if arquivo.is_file():
        try:
            valor = json.loads(arquivo.read_text(encoding="utf-8")).get("limite_contexto")
            if isinstance(valor, int) and valor > 0:
                return valor
        except ValueError:
            pass
    return LIMITE_PADRAO


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--projeto", default=".", help="pasta do projeto (padrão: a atual)")
    p.add_argument("--limite", type=int, help="limite de tokens (padrão: execucao.json ou 300000)")
    p.add_argument("--raiz", help="pasta dos registros (padrão: ~/.claude/projects)")
    args = p.parse_args(argv)
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")
    projeto = Path(args.projeto).resolve()
    candidatas = [projeto]
    principal = repositorio_principal(projeto)
    if principal and principal.resolve() != projeto:
        candidatas.append(principal.resolve())
    medida = None
    for pasta in candidatas:
        registros = _pasta_de_registros(pasta, args.raiz)
        medida = contexto_da_sessao(registros) if registros else None
        if medida:
            break
    if not medida:
        print("Sem registros da sessão: não consegui medir o contexto.", file=sys.stderr)
        return 2
    tokens, _ = medida
    limite = args.limite or limite_do_projeto(candidatas[-1] if len(candidatas) > 1 else projeto)
    k = lambda n: f"{n / 1000:.0f}k"  # noqa: E731
    if tokens > limite:
        print(f"Contexto: {k(tokens)} acima do limite de {k(limite)}. Pare aqui: rode /clear e depois /executar.")
        return 1
    print(f"Contexto: {k(tokens)} de {k(limite)}. Pode seguir para o próximo lote.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
