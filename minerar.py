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
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
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


def vias_do_feed(conta: str, uid: str | None, marcador: str | None) -> list:
    """As vias de pedir uma pagina do feed, em ordem. Devolve [(e_principal, rotulo, url)].

    ESTA FUNCAO EXISTE PORQUE A REGRA ESTAVA ESCRITA DUAS VEZES (04/09/2026, espec
    cd-0-terreno). O `rodada._uma_pagina` e o `casa._pagina_logada` decidiam por conta
    propria por qual endereco pedir a pagina, e o "Como se mede" da espec dizia por
    extenso que as duas funcoes passariam a chamar o MESMO ajudante. Nao passavam: eram
    dois ajudantes, e ja' divergiam no dia em que nasceram, um com duas vias e o outro com
    tres. E' a trava 60, e foi o `revisor-escopo` quem a pegou.

    A MEDICAO QUE MANDA NA ORDEM, feita em 03/09/2026 nesta maquina, com segundos entre
    as chamadas:

        /feed/user/<CONTA>/username/?count=12                    200, 12 posts
        /feed/user/<CONTA>/username/?count=12&max_id=<marcador>  200, 12 posts NOVOS
        a terceira, com o marcador da segunda                    200, 12 posts NOVOS
        /feed/user/<UID>/?count=12                               401
        /feed/user/<UID>/?count=12&max_id=<marcador>             401
        o mesmo por i.instagram.com                              401
        o mesmo sem o X-IG-App-ID                                401

    O caminho do arroba ACEITA `max_id` e pagina de verdade. O caminho do numero interno
    fica como RESERVA e nao sai daqui: ele ja' foi o principal, pode voltar a passar num
    endereco de saida que o do arroba recuse, e tira-lo trocaria um caminho que as vezes
    falha por um caminho so'.

    O PRIMEIRO CAMPO E' O QUE SEPARA UM 401 DO OUTRO. Recusa pela PRINCIPAL, com cookie,
    e' sessao morta. Recusa pela RESERVA nao diz nada sobre a conta: aquele endereco
    recusa ate' anonimo. Aposentar a conta por causa dele seria condena-la pelo defeito do
    caminho, e o dono so' descobriria recadastrando uma conta que nunca teve problema.
    """
    rabo = f"&max_id={marcador}" if marcador else ""
    vias = []
    if conta:
        vias.append((True, "o arroba",
                     f"https://www.instagram.com/api/v1/feed/user/{conta}/username/"
                     f"?count={POR_PAGINA}{rabo}"))
    if uid:
        for dominio in ("www.instagram.com", "i.instagram.com"):
            vias.append((False, dominio,
                         f"https://{dominio}/api/v1/feed/user/{uid}/"
                         f"?count={POR_PAGINA}{rabo}"))
    return vias


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
    # A QUINTA E ULTIMA COPIA DESTA URL, e ela morava no mesmo arquivo do ajudante. As
    # outras quatro (a abertura da casa, a paginacao dela, o `--testar` e o resgate) ja'
    # tinham sido reunidas; deixar esta de fora manteria a regra escrita duas vezes
    # dentro do proprio dono dela, que e' o pior lugar para a divergencia nascer.
    url = vias_do_feed(conta, None, None)[0][2]
    d = _pega_alternando([url], voltas=3, prazo=prazo, rotulo=f"[{conta}] abertura")
    if not d:
        return None
    u = d.get("user") or {}
    itens = d.get("items") or []
    if not u.get("pk") and itens:
        u = itens[0].get("user") or {}
    if not u.get("pk"):
        # RESPOSTA BOA E VAZIA NAO E' FALHA. Medido no @ftevidencias: o Instagram
        # responde 200, com status "ok", zero itens e sem o bloco do perfil. E' o que
        # ele devolve para conta sem publicacao nenhuma e para conta fechada.
        #
        # Isso precisa ter nome proprio, senao o perfil fica sendo tentado por todas as
        # vagas de todas as rodadas, para sempre, sem nunca dar certo e sem ninguem
        # entender por que. Com dez perfis de uma vez, basta um assim para a fila
        # inteira parecer travada.
        if d.get("status") == "ok":
            return {"vazio": True}
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


def _sessao():
    """Uma visita a' porta de entrada, so' para receber os biscoitos da casa.

    Nao ha' conta nenhuma envolvida: sao os mesmos biscoitos que qualquer visitante
    anonimo recebe ao abrir o site. O caminho dos reels exige o token de formulario que
    vem neles, e e' so' isso que falta.
    """
    pote = CookieJar()
    abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(pote))
    try:
        abridor.open(urllib.request.Request("https://www.instagram.com/",
                                            headers=CABECALHO), timeout=20).read(1)
    except Exception:
        pass
    return abridor, {c.name: c.value for c in pote}


def pagina_de_reels(uid: str, marcador: str | None) -> dict | None:
    """Uma pagina de REELS PUROS, sem post nem carrossel no meio.

    POR QUE ISTO EXISTE, e o que foi medido em 18/08/2026:

    O feed de um perfil vem misturado e nao aceita filtro. No @brandsdecoded__, das 24
    publicacoes mais recentes, 23 eram carrossel e 1 era reels. Juntar 200 reels por ali
    exigiria ler quase cinco mil publicacoes, uma atras da outra.

    Existe um caminho so' de reels, e a primeira leitura dele passa sem conta nenhuma,
    bastando os biscoitos de visitante. A segunda pagina, do mesmo endereco, e' recusada
    com um recado que pede login, e foi por isso que ele parecia exigir sessao.

    So' que nao exige. Uma maquina do GitHub, que nunca tinha pedido a primeira pagina,
    recebeu o marcador vindo daqui e trouxe a segunda inteira: doze reels, com exibicoes
    e curtidas. Das tres maquinas testadas, uma passou e duas levaram 401.

    Ou seja: o limite e' do ENDERECO, e nao da falta de conta. E endereco e' o que a
    esteira tem de sobra, vinte por rodada. E' o mesmo racha que ja' rege a leitura do
    feed, so' que agora rendendo reels puros em vez de um reels a cada vinte e quatro
    publicacoes.
    """
    abridor, fichas = _sessao()
    corpo = {"target_user_id": str(uid), "page_size": "50"}
    if marcador:
        corpo["max_id"] = marcador
    req = urllib.request.Request(
        "https://www.instagram.com/api/v1/clips/user/",
        data=urllib.parse.urlencode(corpo).encode(),
        headers={**CABECALHO, "X-CSRFToken": fichas.get("csrftoken", ""),
                 "X-Requested-With": "XMLHttpRequest",
                 "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with abridor.open(req, timeout=25) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  reels: recusou ({e.code})")
        return None
    except Exception as e:
        print(f"  reels: falhou ({type(e).__name__})")
        return None

    if not isinstance(d, dict) or d.get("status") == "fail":
        print("  reels: endereco gasto (pediu login)")
        return None
    itens = [x.get("media") or {} for x in (d.get("items") or [])]
    pag = d.get("paging_info") or {}
    return {
        "posts": [limpa_post(x) for x in itens if x.get("code")],
        "marcador": pag.get("max_id"),
        "acabou": not pag.get("more_available") or not pag.get("max_id"),
    }


# O TETO DA LEGENDA. Ate' 02/09/2026 era 400, e o corte estava comendo a descricao de TODO
# post minerado, e nao so' a de carrossel: medidas as doze legendas da primeira pagina do
# perfil dele, as DOZE passavam de 400, e a maior tinha 1.887 caracteres. 2.200 e' o teto do
# proprio Instagram, entao acima disso nao existe texto para perder.
TETO_DA_LEGENDA = 2200
# O QUE VAI PARA A TELA e' outro numero, bem menor, e a razao esta' no `selecionar.py`: a
# ficha completa mora em `dados/perfis`, mas o `selecao.json` copia o post INTEIRO ate' 500
# vezes, e ele ja' pesa 824 KB. Com a legenda cheia seriam 1,1 MB a mais no unico arquivo que
# a trava 17 teve de tirar da janela da verdade por demorar trinta segundos pela ponte.
TETO_NA_VITRINE = 300


def peca_do_carrossel(bruto: dict, ordem: int) -> dict:
    """Uma lamina de carrossel: onde ela esta', de que tipo e' e que tamanho tem.

    A MAIOR VERSAO, E NAO A PRIMEIRA DA LISTA. O Instagram devolve a mesma imagem em muitos
    tamanhos (medidos 14 em 02/09/2026, e 11 meia hora depois no mesmo perfil: o numero
    varia). A ordem da lista nao promete nada, entao quem escolhe e' a largura.

    E PECA DE VIDEO TRAZ AS DUAS COISAS: o video E uma capa. Medido no ensaio, a peca de
    video tem 11 versoes de imagem ate' 640px e 3 de video ate' 720px. Guardar a capa daria
    um arquivo que abre, parece certo, e nao e' o post.
    """
    imagens = (bruto.get("image_versions2") or {}).get("candidates") or []
    videos = bruto.get("video_versions") or []
    fonte = videos or imagens
    melhor = max(fonte, key=lambda v: v.get("width") or 0) if fonte else None
    return {
        "ordem": ordem,
        "formato": "video" if videos else "imagem",
        "arquivo": melhor.get("url") if melhor else None,
        "largura": melhor.get("width") if melhor else None,
        "altura": melhor.get("height") if melhor else None,
    }


def limpa_post(bruto: dict) -> dict:
    """Guarda so o que serve para medir e para baixar depois. O resto e' peso morto."""
    tipo = bruto.get("media_type")
    videos = bruto.get("video_versions") or []
    melhor = max(videos, key=lambda v: v.get("width", 0)) if videos else None
    legenda = (bruto.get("caption") or {}).get("text") or ""
    p = {
        "codigo": bruto.get("code"),
        "formato": FORMATOS.get(tipo, "outro"),
        "data": bruto.get("taken_at"),
        "views": bruto.get("play_count") or bruto.get("view_count") or 0,
        "curtidas": bruto.get("like_count") or 0,
        "comentarios": bruto.get("comment_count") or 0,
        "duracao": round(bruto.get("video_duration") or 0, 1),
        "legenda": legenda[:TETO_DA_LEGENDA],
        # o link do arquivo vence em horas: serve para baixar agora, nao para guardar
        "arquivo": melhor.get("url") if melhor else None,
        "largura": melhor.get("width") if melhor else None,
    }
    # A LISTA DE LAMINAS, e ela SO' NASCE em post de carrossel.
    #
    # POR QUE O CAMPO NAO EXISTE NOS OUTROS FORMATOS: ficha sem o campo quer dizer "este post
    # nao e' carrossel", e ficha COM o campo em lista vazia quer dizer "e' carrossel e a
    # resposta veio sem laminas". Sao coisas diferentes, e po-las as duas como `[]` seria a
    # trava 2 escrita no dado: a tela nao teria como distinguir "nao tem" de "nao li".
    if tipo == 8:
        laminas = bruto.get("carousel_media") or []
        p["pecas"] = [peca_do_carrossel(x, i) for i, x in enumerate(laminas, 1)]
        # O CONTADOR DELES, GUARDADO SEPARADO do tamanho da lista, de proposito: os dois
        # bateram nos cinco carrosseis do ensaio, mas se um dia nao baterem, quem le' precisa
        # saber que a lista veio curta em vez de achar que o post encolheu.
        p["pecas_ditas"] = bruto.get("carousel_media_count")
    return p


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
