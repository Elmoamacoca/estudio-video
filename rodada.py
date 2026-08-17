"""Uma vaga da rodada: lê UMA página de UM perfil, e sai.

POR QUE UMA PÁGINA SÓ POR MÁQUINA:
medido em 16/08/2026, um endereço de saída serve para uma única leitura de 12 posts.
A segunda foi recusada em seis voltas seguidas com 135 segundos de espera entre elas.
Não existe pausa que devolva o orçamento a tempo. Quem faz volume é a quantidade de
máquinas, nunca a insistência de uma delas.

COMO O PARALELISMO FUNCIONA:
perfis diferentes são independentes, então N máquinas leem N perfis ao mesmo tempo.
O mesmo perfil é que é sequencial, porque a página seguinte só existe depois que a
anterior devolveu o marcador.

Então cada vaga escolhe o perfil pela sua posição:
  - com 20 perfis pendentes e 20 vagas, cada vaga pega um: paralelo puro.
  - com 1 perfil e 20 vagas, todas caem no mesmo, e aí elas se ESCALONAM no tempo:
    a vaga 5 espera quatro passos antes de começar, e nesse meio tempo as anteriores
    já gravaram o avanço. Vira escada em vez de colisão.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from minerar import CABECALHO, PASTA, limpa_post, identifica, grava

FONTES = Path("dados/fontes.json")
# medido: leitura mais gravação levam por volta de 20s. 50s dá folga para a vaga
# seguinte enxergar o avanço da anterior quando as duas caem no mesmo perfil.
PASSO_DA_ESCADA = 50


def _uma_pagina(uid: str, marcador: str | None) -> dict | None:
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


def puxar_avanco() -> None:
    """Traz o que as outras vagas gravaram enquanto esta esperava na escada."""
    for cmd in (["git", "fetch", "origin", "main", "--quiet"],
                ["git", "reset", "--hard", "origin/main", "--quiet"]):
        subprocess.run(cmd, capture_output=True, timeout=90)


def pendentes(contas: list[str]) -> list[str]:
    """Perfis que ainda faltam, do menos varrido em proporção para o mais varrido."""
    fila = []
    for c in contas:
        e = estado_de(c)
        if e.get("completo"):
            continue
        total = (e.get("perfil") or {}).get("publicacoes") or 0
        # sem identificador ainda entra na frente: descobrir quem é custa uma leitura
        fatia = -1.0 if not total else len(e.get("posts", [])) / total
        fila.append((fatia, c))
    fila.sort()
    return [c for _, c in fila]


def main() -> int:
    vaga = int(os.environ.get("VAGA", "1"))
    contas = contas_pedidas()
    if not contas:
        print("nenhuma conta de origem cadastrada")
        return 0

    fila = pendentes(contas)
    if not fila:
        print("todos os perfis já estão completos")
        return 0

    # a vaga N atende o perfil N da fila. Sobrando vaga, ela gira e cai num perfil
    # já atendido: aí espera a escada, para não ler a mesma página duas vezes.
    posicao = (vaga - 1) % len(fila)
    voltas = (vaga - 1) // len(fila)
    conta = fila[posicao]

    if voltas:
        espera = voltas * PASSO_DA_ESCADA
        print(f"vaga {vaga}: @{conta} já tem vaga antes de mim, espero {espera}s")
        time.sleep(espera)
        puxar_avanco()

    estado = estado_de(conta)
    if estado.get("completo"):
        print(f"[{conta}] já ficou completo enquanto eu esperava")
        return 0

    print(f"vaga {vaga} de {len(fila)} perfis pendentes, trabalhando em @{conta}")

    if not estado.get("perfil"):
        perfil = identifica(conta, prazo=time.time() + 45)
        if not perfil:
            print(f"[{conta}] identificador não veio neste endereço. A ponte resolve.")
            return 0
        estado["perfil"] = perfil
        grava(conta, estado)
        print(f"[{conta}] identificado: {perfil['publicacoes']} publicações")
        return 0

    j = _uma_pagina(estado["perfil"]["id"], estado.get("marcador"))
    if j is None:
        print(f"[{conta}] endereço desta vaga já estava gasto")
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

    meta = (estado.get("perfil") or {}).get("publicacoes") or 0
    print(f"[{conta}] +{novos} posts (total {len(estado['posts'])} de {meta})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
