"""Da' para paginar os reels sem conta, usando um endereco de saida por pagina?

O QUE JA' SE SABE, medido em 18/08/2026:
  - a PRIMEIRA pagina de /api/v1/clips/user/ responde sem login nenhum, bastando o
    token de formulario que qualquer visita ao site entrega. Ela vem com reels puros,
    doze por vez, com exibicoes e curtidas;
  - a SEGUNDA pagina, pedida do MESMO endereco, e' recusada com "aguarde alguns
    minutos" e pedido de login.

A PERGUNTA QUE ESTA SONDA RESPONDE: essa recusa e' do endereco ou da falta de conta?
Se for do endereco, a esteira resolve como ja' resolve tudo: uma pagina por maquina,
vinte maquinas por rodada. Se for da conta, nao ha' saida sem sessao.

Como se testa: esta maquina NUNCA pediu a primeira pagina. Ela recebe o marcador
pronto, vindo de outro endereco, e tenta a segunda direto.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

NAV = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")


def sessao():
    pote = CookieJar()
    abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(pote))
    try:
        abridor.open(urllib.request.Request("https://www.instagram.com/",
                                            headers={"User-Agent": NAV}), timeout=20).read(1)
    except Exception:
        pass
    return abridor, {c.name: c.value for c in pote}


def reels(uid, marcador, abridor, fichas):
    corpo = {"target_user_id": str(uid), "page_size": "50"}
    if marcador:
        corpo["max_id"] = marcador
    req = urllib.request.Request(
        "https://www.instagram.com/api/v1/clips/user/",
        data=urllib.parse.urlencode(corpo).encode(),
        headers={"User-Agent": NAV, "X-IG-App-ID": "936619743392459",
                 "X-CSRFToken": fichas.get("csrftoken", ""),
                 "X-Requested-With": "XMLHttpRequest",
                 "Referer": "https://www.instagram.com/",
                 "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with abridor.open(req, timeout=25) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, {"erro": type(e).__name__}


if __name__ == "__main__":
    uid = sys.argv[1]
    marcador = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] not in ("", "-") else None
    abridor, fichas = sessao()
    print(f"biscoitos desta maquina: {sorted(fichas)}")
    print(f"pedindo {'a pagina do marcador recebido' if marcador else 'a primeira pagina'}")

    st, d = reels(uid, marcador, abridor, fichas)
    if not d or d.get("status") == "fail":
        print(f"  RECUSOU  status {st}  {json.dumps(d)[:160] if d else ''}")
        raise SystemExit(0)
    itens = d.get("items") or []
    pag = d.get("paging_info") or {}
    print(f"  PASSOU   {len(itens)} reels | mais: {pag.get('more_available')}")
    for x in itens[:3]:
        m = x.get("media") or {}
        print(f"    {m.get('code')}  exibicoes {m.get('play_count')}  "
              f"curtidas {m.get('like_count')}")
    if pag.get("max_id"):
        print(f"MARCADOR_SEGUINTE={pag['max_id']}")
