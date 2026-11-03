#!/usr/bin/env python3
"""Pré-voo da construção: confere o ambiente uma vez, antes do primeiro lote.

Cada problema que aparece no meio de um lote (gerenciador de pacotes fora do PATH, porta do banco
ocupada, Docker parado, dependência duplicada no workspace) custa retrabalho repetido. Este script
os acha de uma vez e imprime o comando que corrige cada um. Não altera nada.

Confere:
  - gerenciador de pacotes: `packageManager` do package.json da raiz (pnpm, yarn ou npm) roda
  - Docker: só se há docker-compose.yml, docker-compose.yaml, compose.yml ou compose.yaml
  - porta do banco: --porta N (repetível) ou DB_PORTA; com compose e sem nenhuma, 5433. Porta
    ocupada pode ser o banco deste projeto já no ar; o aviso diz isso e sugere a próxima livre
  - workspace pnpm: `pnpm-workspace.yaml` sem `dedupePeers: true` (vitest e pg duplicados)

Uso:
  python .claude/scripts/preparar-ambiente.py [--raiz DIR] [--porta N ...]

Sai com 0 quando nada precisa de correção, 1 com problemas e 2 quando a raiz não existe.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

ARQUIVOS_COMPOSE = ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml")
PORTA_PADRAO = 5433
TEMPO_COMANDO = 30


def porta_livre(porta: int, host: str = "127.0.0.1") -> bool:
    """True se ninguém escuta na porta. Tenta conectar (pega quem escuta em 0.0.0.0, que o bind em
    127.0.0.1 não vê no Windows) e depois abrir a porta em todas as interfaces."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        if s.connect_ex((host, porta)) == 0:
            return False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("", porta))
        except OSError:
            return False
    return True


def proxima_livre(porta: int, tentativas: int = 20) -> int | None:
    for candidata in range(porta + 1, porta + 1 + tentativas):
        if porta_livre(candidata):
            return candidata
    return None


def gerenciador_de(raiz: Path) -> str | None:
    """Nome do gerenciador em `packageManager` (ex.: pnpm@11.0.0 -> pnpm); None se não declarado."""
    pacote = raiz / "package.json"
    if not pacote.is_file():
        return None
    try:
        dados = json.loads(pacote.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    declarado = dados.get("packageManager")
    return declarado.split("@")[0] if isinstance(declarado, str) and declarado else None


def _roda(comando: list[str], cwd: Path) -> tuple[bool, str]:
    try:
        r = subprocess.run(comando, cwd=cwd, capture_output=True, text=True, timeout=TEMPO_COMANDO)
    except (OSError, subprocess.TimeoutExpired) as erro:
        return False, str(erro).strip()
    saida = (r.stdout or "").strip() or (r.stderr or "").strip()
    return r.returncode == 0, saida.splitlines()[0] if saida else ""


def checar_gerenciador(raiz: Path) -> tuple[str, str | None]:
    nome = gerenciador_de(raiz)
    if nome is None:
        return "gerenciador de pacotes: sem `packageManager` no package.json da raiz (nada a conferir)", None
    executavel = shutil.which(nome)
    if executavel is None:
        return f"gerenciador de pacotes: `{nome}` não está no PATH", (
            f"instale ou ative o `{nome}` (ex.: `corepack enable`) ou ponha a pasta dele no PATH")
    ok, saida = _roda([executavel, "--version"], raiz)
    if not ok:
        return f"gerenciador de pacotes: `{nome} --version` falhou ({saida[:80]})", (
            f"o `{nome}` do PATH está quebrado; ache outro (`where {nome}` ou `which -a {nome}`) e ponha a pasta dele "
            "antes no PATH, ou rode `corepack enable`")
    return f"gerenciador de pacotes: {nome} {saida}", None


def checar_docker(raiz: Path) -> tuple[str, str | None] | None:
    if not any((raiz / nome).is_file() for nome in ARQUIVOS_COMPOSE):
        return None
    docker = shutil.which("docker")
    if docker is None:
        return "docker: não está no PATH", "instale o Docker Desktop e abra-o"
    ok, saida = _roda([docker, "info", "--format", "{{.ServerVersion}}"], raiz)
    if not ok:
        return f"docker: o servidor não responde ({saida[:80]})", "abra o Docker Desktop e espere ele subir"
    return f"docker: servidor {saida}", None


def checar_porta(porta: int) -> tuple[str, str | None]:
    if porta_livre(porta):
        return f"porta {porta}: livre", None
    outra = proxima_livre(porta)
    sugestao = (f"use outra porta (ex.: `DB_PORTA={outra}`) ou, se for o banco deste projeto já no ar, siga em frente"
                if outra else "libere a porta ou escolha outra com DB_PORTA")
    return f"porta {porta}: ocupada (pode ser o banco deste projeto já no ar)", sugestao


def checar_workspace(raiz: Path) -> tuple[str, str | None] | None:
    arquivo = raiz / "pnpm-workspace.yaml"
    if not arquivo.is_file():
        return None
    texto = arquivo.read_text(encoding="utf-8", errors="replace")
    if "dedupePeers" in texto and "true" in texto.split("dedupePeers", 1)[1].splitlines()[0].lower():
        return "workspace pnpm: dedupePeers ligado", None
    return "workspace pnpm: sem `dedupePeers: true` (vitest e pg podem duplicar e quebrar o Worker/Sentry)", (
        "acrescente `dedupePeers: true` ao pnpm-workspace.yaml e rode `pnpm install`")


def portas_pedidas(argumentos: list[int], tem_compose: bool) -> list[int]:
    if argumentos:
        return argumentos
    ambiente = os.environ.get("DB_PORTA", "").strip()
    if ambiente.isdigit():
        return [int(ambiente)]
    return [PORTA_PADRAO] if tem_compose else []


def conferir(raiz: Path, portas: list[int]) -> list[tuple[str, str | None]]:
    tem_compose = any((raiz / nome).is_file() for nome in ARQUIVOS_COMPOSE)
    resultados = [checar_gerenciador(raiz)]
    for parcial in (checar_docker(raiz), checar_workspace(raiz)):
        if parcial:
            resultados.append(parcial)
    for porta in portas_pedidas(portas, tem_compose):
        resultados.append(checar_porta(porta))
    return resultados


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Pré-voo do ambiente de construção.")
    ap.add_argument("--raiz", default=".", help="raiz do projeto (padrão: a pasta atual)")
    ap.add_argument("--porta", type=int, action="append", default=[], help="porta de serviço a conferir")
    args = ap.parse_args(argv)
    raiz = Path(args.raiz).resolve()
    if not raiz.is_dir():
        print(f"Raiz não encontrada: {raiz}", file=sys.stderr)
        return 2
    problemas = 0
    for texto, correcao in conferir(raiz, args.porta):
        if correcao is None:
            print(f"OK: {texto}")
        else:
            problemas += 1
            print(f"PROBLEMA: {texto}\n  corrija: {correcao}")
    print("Ambiente pronto." if not problemas else f"{problemas} problema(s) a corrigir antes do primeiro lote.")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
