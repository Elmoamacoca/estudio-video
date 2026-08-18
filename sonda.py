"""Sonda: por onde ESTE endereco consegue ler um perfil do Instagram.

O PROBLEMA QUE ELA EXISTE PARA RESOLVER: a consulta de identificacao
(/api/v1/users/web_profile_info/) responde 429 dos enderecos do GitHub, sempre, e da
Cloudflare responde mais ou menos uma vez em tres. Enquanto o sistema depender dela,
todo perfil novo e' uma loteria.

Mas a LEITURA das paginas (/api/v1/feed/user/<id>/) funciona do GitHub sem reclamar.
Ou seja, o bloqueio e' de um caminho, e nao do Instagram inteiro. Esta sonda procura
outro caminho que sirva, testando um por um e dizendo o que cada um respondeu.

A via 1 e' a que interessa mais: se o feed aceitar o @ no lugar do numero, o sistema
nao precisa identificar perfil nenhum, nunca mais.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

NAVEGADOR = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
APP = "936619743392459"
BASE = {"User-Agent": NAVEGADOR, "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": "https://www.instagram.com/"}


def pega(url, extra=None, abridor=None, prazo=20):
    cab = dict(BASE)
    cab.update(extra or {})
    req = urllib.request.Request(url, headers=cab)
    try:
        f = (abridor or urllib.request).urlopen(req, timeout=prazo)
        with f as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:200]
    except Exception as e:
        return 0, type(e).__name__


def v_feed_por_arroba(conta):
    """O feed pedido pelo @, sem numero nenhum. Se passar, acabou o problema."""
    st, corpo = pega(
        f"https://www.instagram.com/api/v1/feed/user/{conta}/username/?count=12",
        {"X-IG-App-ID": APP})
    if st != 200:
        return st, None
    try:
        d = json.loads(corpo)
        itens = d.get("items") or []
        uid = (d.get("user") or {}).get("pk") or (itens[0]["user"]["pk"] if itens else None)
        return st, {"id": str(uid) if uid else None, "itens": len(itens),
                    "mais": bool(d.get("more_available")),
                    "marcador": bool(d.get("next_max_id"))}
    except Exception as e:
        return st, {"erro": type(e).__name__}


def v_busca(conta):
    """A busca do topo do site devolve o numero do perfil junto do @."""
    st, corpo = pega(f"https://www.instagram.com/web/search/topsearch/?query={conta}",
                     {"X-IG-App-ID": APP})
    if st != 200:
        return st, None
    try:
        for u in json.loads(corpo).get("users", []):
            if (u.get("user") or {}).get("username", "").lower() == conta.lower():
                return st, {"id": str(u["user"]["pk"])}
        return st, {"erro": "nao veio o perfil exato"}
    except Exception as e:
        return st, {"erro": type(e).__name__}


def v_com_biscoito(conta):
    """A identificacao de sempre, mas visitando a casa antes para pegar os biscoitos.

    Um navegador nunca chega direto na consulta: ele abre o site, recebe os biscoitos e
    so' entao pergunta. Sem eles a chamada e' de um desconhecido, e desconhecido e' o
    primeiro a levar 429.
    """
    pote = CookieJar()
    abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(pote))
    pega("https://www.instagram.com/", None, abridor)
    time.sleep(1.5)
    fichas = {c.name: c.value for c in pote}
    st, corpo = pega(
        f"https://www.instagram.com/api/v1/users/web_profile_info/?username={conta}",
        {"X-IG-App-ID": APP, "X-CSRFToken": fichas.get("csrftoken", ""),
         "X-Requested-With": "XMLHttpRequest"}, abridor)
    if st != 200:
        return st, {"biscoitos": list(fichas)}
    try:
        u = json.loads(corpo)["data"]["user"]
        return st, {"id": u["id"], "publicacoes": u["edge_owner_to_timeline_media"]["count"]}
    except Exception as e:
        return st, {"erro": type(e).__name__}


def v_sem_biscoito(conta):
    st, corpo = pega(
        f"https://www.instagram.com/api/v1/users/web_profile_info/?username={conta}",
        {"X-IG-App-ID": APP})
    if st != 200:
        return st, None
    try:
        u = json.loads(corpo)["data"]["user"]
        return st, {"id": u["id"]}
    except Exception as e:
        return st, {"erro": type(e).__name__}


def v_usuario_do_app(conta):
    """O caminho do aplicativo, que atende num dominio diferente."""
    st, corpo = pega(f"https://i.instagram.com/api/v1/users/{conta}/usernameinfo/",
                     {"X-IG-App-ID": APP,
                      "User-Agent": "Instagram 219.0.0.12.117 Android"})
    if st != 200:
        return st, None
    try:
        return st, {"id": str(json.loads(corpo)["user"]["pk"])}
    except Exception as e:
        return st, {"erro": type(e).__name__}


def v_incorporar(conta):
    st, corpo = pega(f"https://www.instagram.com/{conta}/embed/")
    if st != 200:
        return st, None
    m = re.search(r'"(?:owner_id|profile_id|id)"\s*:\s*"?(\d{5,})"?', corpo)
    return st, {"id": m.group(1) if m else None, "tamanho": len(corpo)}


VIAS = [
    ("feed pelo arroba", v_feed_por_arroba),
    ("busca do topo", v_busca),
    ("identificar com biscoito", v_com_biscoito),
    ("identificar sem biscoito", v_sem_biscoito),
    ("usuario do app", v_usuario_do_app),
    ("incorporar", v_incorporar),
]

if __name__ == "__main__":
    conta = sys.argv[1] if len(sys.argv) > 1 else "brandsdecoded__"
    print(f"sonda em @{conta}\n")
    for nome, f in VIAS:
        st, d = f(conta)
        bom = bool(d and (d.get("id") or d.get("itens")))
        print(f"  {'PASSOU' if bom else '  nao  '}  {nome:26} status {st:<4} {json.dumps(d, ensure_ascii=False) if d else ''}")
        time.sleep(2)
