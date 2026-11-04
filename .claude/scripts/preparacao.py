#!/usr/bin/env python3
"""Confere o `.specs/preparacao.md` gravado pelo /preparar.

Uso:
  python .claude/scripts/preparacao.py --nivel1     o /executar só começa com o Nível 1 completo
  python .claude/scripts/preparacao.py --nivel2     o /finalizar só começa com o Nível 2 completo
  python .claude/scripts/preparacao.py              mostra os dois níveis
  [--arquivo <caminho>]

O arquivo tem duas seções: `## Nível 1 ...` (síncrono) e `## Nível 2 ...` (assíncrono). Cada item é
uma caixa `- [x]` ou `- [ ]`. Item aberto vem com a linha que o descreve.

Sai com 0 quando o nível pedido está completo, 1 quando há item aberto e 2 quando o arquivo falta
ou não tem o nível (rode /preparar).
"""

import argparse
import re
import sys
from pathlib import Path

SECAO = re.compile(r"^#{2,3}\s+N[ií]vel\s+([12])\b", re.IGNORECASE)
ITEM = re.compile(r"^\s*[-*]\s+\[([ xX])\]\s*(.+?)\s*$")


def ler(arquivo):
    """{1: [(feito, texto)], 2: [...]}; níveis ausentes não aparecem."""
    niveis, atual = {}, None
    for linha in Path(arquivo).read_text(encoding="utf-8").splitlines():
        secao = SECAO.match(linha)
        if secao:
            atual = int(secao.group(1))
            niveis.setdefault(atual, [])
            continue
        if linha.startswith("#"):
            atual = None
            continue
        item = ITEM.match(linha)
        if item and atual:
            niveis[atual].append((item.group(1).lower() == "x", item.group(2)))
    return niveis


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--nivel1", action="store_true")
    p.add_argument("--nivel2", action="store_true")
    p.add_argument("--arquivo", default=".specs/preparacao.md")
    args = p.parse_args(argv)
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")
    if not Path(args.arquivo).is_file():
        print(f"{args.arquivo} não existe: rode /preparar.", file=sys.stderr)
        return 2
    niveis = ler(args.arquivo)
    pedidos = [n for n, ativo in ((1, args.nivel1), (2, args.nivel2)) if ativo] or [1, 2]
    codigo = 0
    for n in pedidos:
        itens = niveis.get(n)
        if not itens:
            print(f"Nível {n} não encontrado em {args.arquivo}: rode /preparar.", file=sys.stderr)
            return 2
        abertos = [texto for feito, texto in itens if not feito]
        rotulo = "síncrono" if n == 1 else "assíncrono"
        if abertos:
            codigo = 1
            print(f"Nível {n} ({rotulo}): {len(itens) - len(abertos)} de {len(itens)} itens prontos. Faltam:")
            print("\n".join(f"  - {texto}" for texto in abertos))
        else:
            print(f"Nível {n} ({rotulo}): completo ({len(itens)} itens).")
    return codigo


if __name__ == "__main__":
    sys.exit(main())
