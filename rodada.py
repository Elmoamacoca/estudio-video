"""Uma rodada de um elo: le UMA pagina do perfil que estiver mais atrasado.

POR QUE UMA SO:
medido em 16/08/2026 no proprio runner, um endereco de saida serve para uma unica
leitura. A segunda pagina foi recusada com 401 em seis voltas seguidas, com 135
segundos de espera entre elas. Nao existe pausa que devolva o orcamento a tempo.

Entao insistir e' desperdicio: o elo le uma pagina, grava e sai. O proximo elo da
corrente entra com endereco novo e continua dali. Quem faz o volume e' a quantidade
de maquinas, nunca a insistencia de uma delas.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

from minerar import CABECALHO, PASTA, limpa_post, identifica, grava

FONTES = Path("dados/fontes.json")


def _uma_pagina(uid: str, marcador: str | None) -> dict | None:
    """Tenta a leitura nas duas vias. Se as duas recusarem, este elo acabou."""
    rabo = f"&max_id={marcador}" if marcador else ""
    for dominio in ("www.instagram.com", "i.instagram.com"):
        url = f"https://{dominio}/api/v1/feed/user/{uid}/?count=12{rabo}"
        try:
            req = urllib.request.Request(url, headers=CABECALHO)
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            print(f"  {dominio} recusou ({e.code})")
        except Exception as e:
            print(f"  {dominio} falhou ({type(e).__name__})")
        time.sleep(2)
    return None


def contas_pedidas() -> list[str]:
    if not FONTES.exists():
        return []
    d = json.loads(FONTES.read_text(encoding="utf-8"))
    return [c.strip().lstrip("@") for c in (d.get("contas") or []) if c.strip()]


def estado_de(conta: str) -> dict:
    caminho = PASTA / f"{conta}.json"
    if caminho.exists():
        return json.loads(caminho.read_text(encoding="utf-8"))
    return {"perfil": None, "posts": [], "marcador": None, "completo": False}


def escolhe_alvo(contas: list[str]) -> tuple[str, dict] | None:
    """O perfil mais atrasado ganha a vez, para nenhum ficar para tras."""
    candidatos = []
    for c in contas:
        e = estado_de(c)
        if e.get("completo"):
            continue
        total = (e.get("perfil") or {}).get("publicacoes") or 0
        lidos = len(e.get("posts", []))
        falta = (total - lidos) if total else 10 ** 9   # sem identificador ainda: prioridade
        candidatos.append((falta, c, e))
    if not candidatos:
        return None
    candidatos.sort(reverse=True)
    _, conta, estado = candidatos[0]
    return conta, estado


def main() -> int:
    contas = contas_pedidas()
    if not contas:
        print("nenhuma conta de origem cadastrada")
        return 0

    alvo = escolhe_alvo(contas)
    if not alvo:
        print("todos os perfis ja estao completos")
        return 0

    conta, estado = alvo
    print(f"elo trabalhando em @{conta}")

    # sem identificador, este elo gasta a sua unica leitura descobrindo ele
    if not estado.get("perfil"):
        perfil = identifica(conta, prazo=time.time() + 60)
        if not perfil:
            print(f"[{conta}] identificador nao veio neste endereco. Outro elo tenta.")
            return 0
        estado["perfil"] = perfil
        grava(conta, estado)
        print(f"[{conta}] identificado: {perfil['publicacoes']} publicacoes")
        return 0

    j = _uma_pagina(estado["perfil"]["id"], estado.get("marcador"))
    if j is None:
        print(f"[{conta}] endereco deste elo ja estava gasto. Proximo elo continua.")
        return 0

    vistos = {p["codigo"] for p in estado["posts"]}
    novos = 0
    for bruto in j.get("items", []):
        p = limpa_post(bruto)
        if p["codigo"] and p["codigo"] not in vistos:
            vistos.add(p["codigo"])
            estado["posts"].append(p)
            novos += 1

    estado["marcador"] = j.get("next_max_id")
    if not j.get("more_available") or not estado["marcador"]:
        estado["completo"] = True
        print(f"[{conta}] VARREDURA COMPLETA")
    estado["atualizado"] = int(time.time())
    grava(conta, estado)

    total = len(estado["posts"])
    meta = (estado.get("perfil") or {}).get("publicacoes") or 0
    print(f"[{conta}] +{novos} posts (total {total} de {meta})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
