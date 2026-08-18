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
# doze e' o que o Instagram devolve por pagina neste caminho, e pedir mais nao aumenta
POR_PAGINA = 12
PASTA = Path("dados/perfis")

# o Instagram numera o tipo de midia assim
FORMATOS = {1: "post", 2: "reels", 8: "carrossel"}


def _pega(url: str, tempo: int = 25) -> dict:
    req = urllib.request.Request(url, headers=CABECALHO)
    with urllib.request.urlopen(req, timeout=tempo) as r:
        return json.loads(r.read())


def _pega_teimoso(url: str, tentativas: int, prazo: float, rotulo: str) -> dict | None:
    """Insiste enquanto houver tempo.

    O endereco da maquina pode ja chegar queimado, porque o GitHub reaproveita
    enderecos entre execucoes. Desistir na primeira recusa joga a rodada fora por
    nada: basta esperar o orcamento voltar, o que medi em cerca de dois minutos.
    """
    for tentativa in range(1, tentativas + 1):
        try:
            return _pega(url)
        except urllib.error.HTTPError as e:
            if e.code not in (401, 429):
                print(f"{rotulo} erro HTTP {e.code}")
                return None
            if tentativa == tentativas or time.time() + ESPERA_APOS_CORTE > prazo:
                print(f"{rotulo} recusado ({e.code}) e sem tempo de esperar")
                return None
            print(f"{rotulo} recusado ({e.code}), tentativa {tentativa}, "
                  f"esperando {ESPERA_APOS_CORTE}s")
            time.sleep(ESPERA_APOS_CORTE)
        except Exception as e:
            print(f"{rotulo} falha de rede: {type(e).__name__}")
            return None
    return None


def _pega_alternando(urls: list[str], voltas: int, prazo: float,
                     rotulo: str) -> dict | None:
    """Reveza entre vias equivalentes antes de gastar espera.

    Enderecos diferentes do Instagram contam orcamento separado, entao tentar a
    segunda via custa segundos, enquanto esperar custa mais de dois minutos.
    """
    for volta in range(1, voltas + 1):
        for i, url in enumerate(urls, 1):
            try:
                return _pega(url)
            except urllib.error.HTTPError as e:
                if e.code not in (401, 429):
                    print(f"{rotulo} erro HTTP {e.code}")
                    return None
                print(f"{rotulo} via {i} recusou ({e.code})")
            except Exception as e:
                print(f"{rotulo} via {i} falhou: {type(e).__name__}")
            time.sleep(3)
        if volta == voltas or time.time() + ESPERA_APOS_CORTE > prazo:
            print(f"{rotulo} nao passou nesta rodada")
            return None
        print(f"{rotulo} esperando {ESPERA_APOS_CORTE}s antes da volta {volta + 1}")
        time.sleep(ESPERA_APOS_CORTE)
    return None


def identifica(conta: str, prazo: float) -> dict | None:
    """Traduz o nome da conta para o numero interno, e traz o retrato do perfil.

    Duas vias, alternadas: medido em 16/08/2026 que www e i.instagram respondem a
    mesma coisa e contam orcamento separado, entao quando uma recusa a outra pode
    passar. E o numero interno do perfil nunca muda: basta acertar uma vez na vida,
    porque a partir dai ele fica gravado e a varredura nao depende mais disto.
    """
    vias = [
        f"https://www.instagram.com/api/v1/users/web_profile_info/?username={conta}",
        f"https://i.instagram.com/api/v1/users/web_profile_info/?username={conta}",
    ]
    d = _pega_alternando(vias, voltas=4, prazo=prazo,
                         rotulo=f"[{conta}] identificacao")
    if not d:
        return None
    u = d["data"]["user"]
    return {
        "conta": u.get("username"),
        "id": u.get("id"),
        "nome": u.get("full_name"),
        "seguidores": u["edge_followed_by"]["count"],
        "publicacoes": u["edge_owner_to_timeline_media"]["count"],
        "privado": u.get("is_private"),
    }


def abre_pelo_arroba(conta: str, prazo: float) -> dict | None:
    """A primeira pagina de um perfil, pedida pelo @, sem numero nenhum.

    ESTE E' O CAMINHO PRINCIPAL, e a razao esta' medida.

    Em 18/08/2026 uma sonda rodou em tres maquinas do GitHub ao mesmo tempo, testando
    seis vias de descobrir quem e' um perfil. Nas tres maquinas, o resultado foi igual:

      identificacao pelo caminho de sempre .... 429
      a mesma, com biscoitos de visita ........ nem chegou a responder
      busca do topo do site ................... 429
      caminho do aplicativo ................... 429
      pagina de incorporacao .................. responde, mas o numero nao esta' la'
      FEED PEDIDO PELO ARROBA ................. 200, com tudo dentro

    O bloqueio, entao, nunca foi do Instagram inteiro: e' de um caminho so'. E este
    aqui, alem de passar, resolve duas coisas de uma vez, porque a resposta traz o
    numero do perfil E os doze primeiros posts.

    Com isso o sistema deixa de precisar identificar perfil como etapa separada. Some
    junto a dependencia da ponte para isso, que acertava mais ou menos uma vez em tres
    e transformava cada perfil novo numa loteria.

    O que NAO vem aqui e' o total de publicacoes do perfil. Ele nao faz falta para
    varrer: serve so' para a tela dizer "300 de 2.253". A ponte preenche esse numero
    quando consegue, e quando nao consegue a tela mostra o que foi lido, sem fracao.
    """
    url = (f"https://www.instagram.com/api/v1/feed/user/{conta}/username/"
           f"?count={POR_PAGINA}")
    d = _pega_alternando([url], voltas=3, prazo=prazo, rotulo=f"[{conta}] abertura")
    if not d:
        return None
    u = d.get("user") or {}
    itens = d.get("items") or []
    if not u.get("pk") and itens:
        u = itens[0].get("user") or {}
    if not u.get("pk"):
        return None
    return {
        "perfil": {
            "conta": u.get("username") or conta,
            "id": str(u["pk"]),
            "nome": u.get("full_name"),
            "seguidores": u.get("follower_count") or 0,
            # desconhecido por enquanto: quem preenche e' a ponte, se conseguir
            "publicacoes": u.get("media_count") or 0,
            "privado": bool(u.get("is_private")),
            "avatar": u.get("profile_pic_url"),
        },
        "posts": [limpa_post(x) for x in itens],
        "marcador": d.get("next_max_id"),
        "acabou": not d.get("more_available") or not d.get("next_max_id"),
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
        perfil = identifica(conta, limite)
        if not perfil:
            print(f"[{conta}] nao consegui identificar nesta rodada. A proxima continua.")
            return estado
        estado["perfil"] = perfil
        grava(conta, estado)
        print(f"[{conta}] {perfil['publicacoes']} publicacoes, "
              f"{perfil['seguidores']} seguidores")
        if perfil.get("privado"):
            print(f"[{conta}] perfil privado, nao da para varrer")
            estado["completo"] = True
            grava(conta, estado)
            return estado
        time.sleep(ESPERA_APOS_CORTE)

    if estado.get("completo"):
        print(f"[{conta}] ja estava completo, {len(estado['posts'])} posts")
        return estado

    uid = estado["perfil"]["id"]
    bases = [f"https://www.instagram.com/api/v1/feed/user/{uid}/?count=12",
             f"https://i.instagram.com/api/v1/feed/user/{uid}/?count=12"]
    vistos = {p["codigo"] for p in estado["posts"]}
    paginas = 0

    while time.time() < limite:
        rabo = f"&max_id={estado['marcador']}" if estado.get("marcador") else ""
        j = _pega_alternando([b + rabo for b in bases], voltas=6, prazo=limite,
                             rotulo=f"[{conta}] pagina {paginas + 1}")
        if j is None:
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
