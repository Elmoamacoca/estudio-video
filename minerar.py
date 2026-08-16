"""Minerador: varre um perfil do Instagram pagina a pagina e guarda tudo.

POR QUE ELE E' ASSIM, e nao um laco simples:
o Instagram libera UM pedido por endereco de saida. Medido em 16/08/2026: repetir o
mesmo pedido com pausa de 15, 30 ou 60 segundos foi cortado igual, e o endereco so
voltou a responder depois de cerca de dois minutos. Nao existe ritmo que sustente
uma varredura continua do mesmo lugar.

Entao o minerador nao tenta vencer o limite. Ele:
  1. le o que der, guarda onde parou (o marcador), e sai;
  2. e' chamado de novo, de outra maquina, com outro endereco, e continua dali.

Um perfil de cinco mil publicacoes nao sai numa rodada, e nao precisa sair.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CABECALHO = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
    "X-IG-App-ID": "936619743392459",
    "Accept": "*/*",
    "Referer": "https://www.instagram.com/",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}

# medido: o endereco volta a responder por volta de 120s. 135 da folga.
ESPERA_APOS_CORTE = 135
PASTA = Path("dados/perfis")

# o Instagram numera o tipo de midia assim
FORMATOS = {1: "post", 2: "reels", 8: "carrossel"}


def _pega(url: str, tempo: int = 25) -> dict:
    req = urllib.request.Request(url, headers=CABECALHO)
    with urllib.request.urlopen(req, timeout=tempo) as r:
        return json.loads(r.read())


def identifica(conta: str) -> dict:
    """Traduz o nome da conta para o numero interno, e traz o retrato do perfil."""
    d = _pega(f"https://www.instagram.com/api/v1/users/web_profile_info/?username={conta}")
    u = d["data"]["user"]
    return {
        "conta": u.get("username"),
        "id": u.get("id"),
        "nome": u.get("full_name"),
        "seguidores": u["edge_followed_by"]["count"],
        "publicacoes": u["edge_owner_to_timeline_media"]["count"],
        "privado": u.get("is_private"),
    }


def limpa_post(bruto: dict) -> dict:
    """Guarda so o que serve para medir e para baixar depois. O resto e' peso morto."""
    tipo = bruto.get("media_type")
    videos = bruto.get("video_versions") or []
    melhor = max(videos, key=lambda v: v.get("width", 0)) if videos else None
    legenda = (bruto.get("caption") or {}).get("text") or ""
    return {
        "codigo": bruto.get("code"),
        "formato": FORMATOS.get(tipo, "outro"),
        "data": bruto.get("taken_at"),
        "views": bruto.get("play_count") or bruto.get("view_count") or 0,
        "curtidas": bruto.get("like_count") or 0,
        "comentarios": bruto.get("comment_count") or 0,
        "duracao": round(bruto.get("video_duration") or 0, 1),
        "legenda": legenda[:400],
        # o link do arquivo vence em horas: serve para baixar agora, nao para guardar
        "arquivo": melhor.get("url") if melhor else None,
        "largura": melhor.get("width") if melhor else None,
    }


def carrega(conta: str) -> dict:
    caminho = PASTA / f"{conta}.json"
    if caminho.exists():
        return json.loads(caminho.read_text(encoding="utf-8"))
    return {"perfil": None, "posts": [], "marcador": None, "completo": False}


def grava(conta: str, dados: dict) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    (PASTA / f"{conta}.json").write_text(
        json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")


def minerar(conta: str, minutos: int = 18) -> dict:
    """Avanca a varredura do perfil pelo tempo dado e devolve o estado."""
    conta = conta.strip().lstrip("@").rstrip("/").split("/")[-1]
    estado = carrega(conta)
    limite = time.time() + minutos * 60

    if not estado.get("perfil"):
        try:
            estado["perfil"] = identifica(conta)
            print(f"[{conta}] {estado['perfil']['publicacoes']} publicacoes, "
                  f"{estado['perfil']['seguidores']} seguidores")
        except urllib.error.HTTPError as e:
            print(f"[{conta}] nao consegui identificar agora: HTTP {e.code}")
            return estado
        time.sleep(ESPERA_APOS_CORTE)

    if estado.get("completo"):
        print(f"[{conta}] ja estava completo, {len(estado['posts'])} posts")
        return estado

    uid = estado["perfil"]["id"]
    base = f"https://www.instagram.com/api/v1/feed/user/{uid}/?count=12"
    vistos = {p["codigo"] for p in estado["posts"]}
    paginas = 0

    while time.time() < limite:
        url = base + (f"&max_id={estado['marcador']}" if estado.get("marcador") else "")
        try:
            j = _pega(url)
        except urllib.error.HTTPError as e:
            # 401 e 429 sao o corte por endereco. Esperar e' a unica saida.
            if e.code in (401, 429):
                sobra = limite - time.time()
                if sobra < ESPERA_APOS_CORTE + 20:
                    print(f"[{conta}] cortado e sem tempo de esperar. Paro aqui.")
                    break
                print(f"[{conta}] cortado ({e.code}), esperando {ESPERA_APOS_CORTE}s")
                time.sleep(ESPERA_APOS_CORTE)
                continue
            print(f"[{conta}] erro HTTP {e.code}, encerrando")
            break
        except Exception as e:
            print(f"[{conta}] falha de rede: {type(e).__name__}")
            break

        novos = 0
        for bruto in j.get("items", []):
            p = limpa_post(bruto)
            if p["codigo"] and p["codigo"] not in vistos:
                vistos.add(p["codigo"])
                estado["posts"].append(p)
                novos += 1

        paginas += 1
        estado["marcador"] = j.get("next_max_id")
        print(f"[{conta}] pagina {paginas}: +{novos} (total {len(estado['posts'])})")

        if not j.get("more_available") or not estado["marcador"]:
            estado["completo"] = True
            print(f"[{conta}] varredura COMPLETA: {len(estado['posts'])} posts")
            break

        grava(conta, estado)   # grava a cada pagina: se a maquina cair, nada se perde
        time.sleep(ESPERA_APOS_CORTE)

    estado["atualizado"] = int(time.time())
    grava(conta, estado)
    return estado


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("uso: python minerar.py <conta> [minutos]")
        raise SystemExit(1)
    minerar(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 18)
