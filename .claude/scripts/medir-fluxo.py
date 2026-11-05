#!/usr/bin/env python3
"""Mede, por comando (/fluxo, /preparar, /executar, /validar, /finalizar...), o tempo e o consumo de uma sessão do Claude Code.

Lê só as transcrições da sessão principal (`~/.claude/projects/<pasta>/*.jsonl`, sem os subagentes) e
corta a conversa em segmentos: cada mensagem `<command-name>/x</command-name>` abre um segmento novo.
Para cada segmento mostra:

  duração    do primeiro ao último registro do segmento
  espera     tempo em que a sessão esperava você: resposta de AskUserQuestion, pausa antes de uma nova fala sua
             e qualquer pausa acima de 10 min entre dois registros (sessão parada, permissão sem resposta)
  ativo      duração menos espera (o tempo que o fluxo gastou de fato)
  saída, cache lido, chamadas, contexto máximo (a mesma conta do contexto.py)
  perguntas  AskUserQuestion; subagentes (Agent); skills (Skill); bash (Bash)

Serve de linha de base para otimizar o fluxo: roda-se uma feature de ponta a ponta e compara-se depois.
Limite: permissão aprovada em menos de 10 min conta como tempo ativo. Somente leitura. O consumo dos subagentes não entra aqui: use o custo.py (`--por agente`).

Uso:
  python .claude/scripts/medir-fluxo.py [--projeto <pasta em ~/.claude/projects> | --pasta <caminho>]
      [--desde AAAA-MM-DD[THH:MM]] [--ate AAAA-MM-DD[THH:MM]] [--json]

Sem --projeto nem --pasta, usa a pasta do projeto atual. Horários em UTC, como gravados nas transcrições.
Sai com 0, ou 2 quando não acha transcrições.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SEM_COMANDO = "(sem comando)"
COMANDO = re.compile(r"<command-name>(/[^<\s]+)</command-name>")
OCIOSO_S = 10 * 60  # pausa entre dois registros acima disso é espera, não trabalho
FERRAMENTAS = {"AskUserQuestion": "perguntas", "Agent": "subagentes", "Skill": "skills", "Bash": "bash"}


def pasta_do_projeto(cwd: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", str(cwd))


def instante(texto, fim=False):
    if not texto:
        return None
    if len(texto) == 10:
        texto += "T23:59:59" if fim else "T00:00:00"
    return datetime.fromisoformat(texto).replace(tzinfo=timezone.utc)


def _hora(texto):
    return datetime.fromisoformat(texto.replace("Z", "+00:00"))


def _novo(comando, sessao, quando):
    return {"comando": comando, "sessao": sessao, "inicio": quando, "fim": quando, "espera_s": 0.0,
            "saida": 0, "cache_lido": 0, "chamadas": 0, "contexto_max": 0,
            "perguntas": 0, "subagentes": 0, "skills": 0, "bash": 0}


def _texto_da_fala(mensagem):
    """Texto de uma fala do usuário; None quando a mensagem é só resultado de ferramenta."""
    conteudo = mensagem.get("content")
    if isinstance(conteudo, str):
        return conteudo
    if isinstance(conteudo, list):
        partes = [b.get("text", "") for b in conteudo if isinstance(b, dict) and b.get("type") == "text"]
        return "\n".join(partes) if partes else None
    return None


def _segmentar_arquivo(arquivo, desde, ate):
    segmentos, atual = [], None
    perguntas_abertas = set()  # ids de AskUserQuestion ainda sem resposta
    usos = {}  # (id da resposta, requestId) -> (segmento, usage final); o Claude Code grava um bloco por linha
    ferramentas = set()  # ids de uso de ferramenta já contados
    ultimo = None  # instante do registro anterior
    for linha in arquivo.read_text(encoding="utf-8", errors="ignore").splitlines():
        try:
            d = json.loads(linha)
        except ValueError:
            continue
        msg = d.get("message")
        if d.get("type") not in ("user", "assistant") or not isinstance(msg, dict) or not d.get("timestamp"):
            continue
        try:
            quando = _hora(d["timestamp"])
        except ValueError:
            continue
        if (desde and quando < desde) or (ate and quando > ate):
            continue
        pausa = max(0.0, (quando - ultimo).total_seconds()) if ultimo else 0.0
        espera = pausa > OCIOSO_S  # sessão parada: usuário longe, permissão sem resposta

        if msg.get("role") == "user":
            fala = _texto_da_fala(msg)
            achou = COMANDO.search(fala) if fala else None
            if achou:
                atual = _novo(achou.group(1), arquivo.stem, quando)
                segmentos.append(atual)
                espera = False
            elif atual is None:
                atual = _novo(SEM_COMANDO, arquivo.stem, quando)
                segmentos.append(atual)
                espera = False
            elif fala is not None and not d.get("isMeta"):
                espera = True  # nova fala sua: o tempo anterior foi espera por você
            if isinstance(msg.get("content"), list):
                for bloco in msg["content"]:
                    if isinstance(bloco, dict) and bloco.get("type") == "tool_result"                             and bloco.get("tool_use_id") in perguntas_abertas:
                        perguntas_abertas.discard(bloco["tool_use_id"])
                        espera = True
        else:
            if atual is None:
                atual = _novo(SEM_COMANDO, arquivo.stem, quando)
                segmentos.append(atual)
            chave = (msg.get("id"), d.get("requestId"))
            if chave not in usos:
                atual["chamadas"] += 1
            anterior = usos.get(chave)
            novo_uso = msg.get("usage") or {}
            if not anterior or novo_uso.get("output_tokens", 0) >= anterior[1].get("output_tokens", 0):
                usos[chave] = (anterior[0] if anterior else atual, novo_uso)
            for bloco in msg.get("content") or []:
                if isinstance(bloco, dict) and bloco.get("type") == "tool_use" and bloco.get("id") not in ferramentas:
                    ferramentas.add(bloco.get("id"))
                    campo = FERRAMENTAS.get(bloco.get("name"))
                    if campo:
                        atual[campo] += 1
                    if bloco.get("name") == "AskUserQuestion":
                        perguntas_abertas.add(bloco.get("id"))
        if espera:
            atual["espera_s"] += pausa
        atual["fim"] = max(atual["fim"], quando)
        ultimo = quando
    for seg, uso in usos.values():
        seg["saida"] += uso.get("output_tokens", 0)
        seg["cache_lido"] += uso.get("cache_read_input_tokens", 0)
        seg["contexto_max"] = max(seg["contexto_max"], uso.get("input_tokens", 0)
                                  + uso.get("cache_read_input_tokens", 0) + uso.get("cache_creation_input_tokens", 0))
    return segmentos


def segmentar(raiz, desde=None, ate=None):
    """Segmentos da sessão principal de todas as transcrições de `raiz`, em ordem de início."""
    todos = []
    for arquivo in sorted(Path(raiz).glob("*.jsonl")):
        todos.extend(_segmentar_arquivo(arquivo, desde, ate))
    todos.sort(key=lambda s: s["inicio"])
    for s in todos:
        s["duracao_s"] = round((s["fim"] - s["inicio"]).total_seconds())
        s["espera_s"] = round(min(s["espera_s"], s["duracao_s"]))
        s["ativo_s"] = s["duracao_s"] - s["espera_s"]
        s["inicio"], s["fim"] = s["inicio"].isoformat(), s["fim"].isoformat()
    return todos


def _min(segundos):
    return f"{segundos / 60:.1f} min"


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--projeto")
    p.add_argument("--pasta", help="caminho completo da pasta de transcrições (no lugar de --projeto)")
    p.add_argument("--desde")
    p.add_argument("--ate")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    for fluxo in (sys.stdout, sys.stderr):
        if hasattr(fluxo, "reconfigure"):
            fluxo.reconfigure(encoding="utf-8")

    raiz = Path(a.pasta) if a.pasta else Path.home() / ".claude" / "projects" / (a.projeto or pasta_do_projeto(Path.cwd()))
    if not raiz.is_dir() and raiz.parent.is_dir():  # o Claude Code grava o drive em minúscula (c--...)
        raiz = next((d for d in raiz.parent.iterdir() if d.name.lower() == raiz.name.lower()), raiz)
    if not raiz.is_dir():
        print(f"Sem transcrições em {raiz}", file=sys.stderr)
        return 2

    segs = segmentar(raiz, instante(a.desde), instante(a.ate, fim=True))
    total = {c: sum(s[c] for s in segs) for c in
             ("duracao_s", "espera_s", "ativo_s", "saida", "cache_lido", "chamadas", "perguntas", "subagentes", "skills", "bash")}
    if a.json:
        print(json.dumps({"segmentos": segs, "total": total}, ensure_ascii=False, indent=2))
        return 0
    for s in segs:
        print(f"{s['comando']} ({s['inicio'][:16]}): ativo {_min(s['ativo_s'])} | espera {_min(s['espera_s'])}"
              f" | saída {s['saida']:,} | cache lido {s['cache_lido']:,} | chamadas {s['chamadas']}"
              f" | contexto máx {s['contexto_max']:,} | perguntas {s['perguntas']} | subagentes {s['subagentes']}"
              f" | skills {s['skills']} | bash {s['bash']}")
    print(f"TOTAL: ativo {_min(total['ativo_s'])} | espera {_min(total['espera_s'])} | saída {total['saida']:,}"
          f" | cache lido {total['cache_lido']:,} | chamadas {total['chamadas']} | perguntas {total['perguntas']}"
          f" | subagentes {total['subagentes']} | skills {total['skills']} | bash {total['bash']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
