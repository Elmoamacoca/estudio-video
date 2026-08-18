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

from minerar import (CABECALHO, PASTA, abre_pelo_arroba, limpa_post,
                     pagina_de_reels, grava)

FONTES = Path("dados/fontes.json")
REGUA = Path("dados/regua.json")

# MEDIDO EM 18/08/2026, tres maquinas do GitHub lendo em sequencia: o corte vem na
# TERCEIRA leitura, com 401. Duas passam. Antes daqui so' se fazia uma por maquina, o
# que era a medida certa do caminho antigo e virou desperdicio de metade da vaga.
# Duas passam sempre; a terceira passou em uma das tres maquinas medidas. Tentar a
# terceira custa uma requisicao recusada quando nao passa, e rende doze posts quando
# passa. Vale a pena tentar.
PAGINAS_POR_VAGA = 3

# SEM TETO: VARRE O PERFIL INTEIRO.
#
# Aqui houve um limite de duzentas, inventado quando varrer reels custava ler o feed
# misturado inteiro: no @brandsdecoded__ eram quase cinco mil publicacoes para juntar
# duzentos reels, e a espera passava de tres horas. O limite resolvia a espera destruindo
# o proposito.
#
# O PROPOSITO E' ACHAR OS FORA DA CURVA DE UM PERFIL. Num perfil com mil reels, os
# melhores podem estar em qualquer lugar do historico, e varrer so' os duzentos mais
# recentes e' escolher o melhor de uma amostra qualquer, nao o melhor do perfil.
#
# O que tornou isso viavel foi o caminho proprio de reels, medido em 18/08/2026: doze
# reels por pagina, sem imagem nem carrossel no meio, 204 reels em 12 minutos. Mil reels
# levam por volta de uma hora de esteira, que trabalha sozinha, sem ninguem esperando na
# frente da tela.
ALVO_PADRAO = 0

# Sem teto de leitura tambem. O que encerra uma varredura agora e' uma coisa so': acabou
# o que havia para ler naquele caminho. Quem quiser um teto pede, e ele vira um numero
# aqui; enquanto ninguem pedir, o acervo do perfil e' varrido inteiro.
LIDOS_NO_MAXIMO = 0


def regua() -> dict:
    """A regua escolhida na tela. A varredura le' dela quanto e' 'o bastante'."""
    if not REGUA.exists():
        return {}
    try:
        return json.loads(REGUA.read_text(encoding="utf-8"))
    except Exception:
        return {}


# O PEDIDO DE RELEITURA, num arquivo so' e pequeno de proposito. Perfil dado por
# encerrado saia da fila para sempre; a tela grava aqui o pedido, com a hora, e quem ja'
# foi encerrado volta para a fila ate' atender aquela hora.
RELEITURA = Path("dados/revisitar.json")

# Medido: leitura mais gravacao levam por volta de 25s com tres paginas por vaga. 35s
# cobre a vaga anterior com folga quando varias caem no mesmo perfil.
PASSO_DA_ESCADA = 35

TODOS_OS_FORMATOS = {"reels", "post", "carrossel"}
NOMES = {"reels": "reels", "post": "posts isolados", "carrossel": "carrosséis"}


def formatos_pedidos(r: dict) -> set:
    """Os formatos escolhidos na tela. Sem escolha, valem todos."""
    f = {x for x in (r.get("formatos") or []) if x in TODOS_OS_FORMATOS}
    return f or set(TODOS_OS_FORMATOS)


def so_reels(r: dict) -> bool:
    """A escolha pede reels e mais nada?

    E' a UNICA combinacao com caminho proprio no Instagram: existe uma via que devolve
    reels puros, e nao existe via equivalente para imagem nem para carrossel.

    ISSO NAO PODE VAZAR PARA A TELA. Nas outras combinacoes o feed vem misturado por
    imposicao do Instagram, e o sistema resolve por dentro: le' o que ele manda e GUARDA
    SO' O QUE FOI PEDIDO. Quem olha ve' a escolha sendo cumprida, que e' o unico
    compromisso que a tela assumiu.
    """
    return formatos_pedidos(r) == {"reels"}


def rotulo_dos_formatos(r: dict) -> str:
    """Como a tela chama o que esta' sendo buscado. Um so', ou dois, ou 'publicacoes'."""
    f = formatos_pedidos(r)
    if f == TODOS_OS_FORMATOS:
        return "publicações"
    nomes = [NOMES[x] for x in ("reels", "carrossel", "post") if x in f]
    return nomes[0] if len(nomes) == 1 else " e ".join([", ".join(nomes[:-1]), nomes[-1]])


def ja_basta(estado: dict, r: dict) -> bool:
    """O perfil ja' tem o que foi pedido?

    POR PADRAO A RESPOSTA E' NAO, E ISSO E' DE PROPOSITO.

    O proposito da ferramenta e' achar os fora da curva de um perfil. Num perfil com mil
    reels, os melhores podem estar em qualquer ponto do historico: varrer so' um pedaco
    e' escolher o melhor de uma amostra, e nao o melhor do perfil. Entao a varredura vai
    ate' o fim do que existe naquele caminho.

    Os dois freios abaixo continuam no codigo, desligados, para o dia em que alguem
    pedir um limite. Quem manda e' a regua gravada na tela:

      lidos_no_maximo  para depois de tantas publicacoes VISTAS (nao guardadas: quem
                       pede so' carrossel descarta o resto, e contar so' o que ficou
                       faria o teto nunca chegar num perfil que posta pouco daquele
                       formato)
      alvo             para depois de tantas publicacoes GUARDADAS dos formatos pedidos
    """
    posts = estado.get("posts") or []

    # O TETO DE LEITURA PRIMEIRO, e antes de qualquer saida por alvo vazio: sem esta
    # ordem, um teto pedido na regua era ignorado porque a funcao ja' tinha desistido
    # ao ver o alvo em zero.
    teto = int(r.get("lidos_no_maximo") or LIDOS_NO_MAXIMO)
    if teto > 0 and int(estado.get("vistas") or len(posts)) >= teto:
        return True

    alvo = r.get("alvo")
    alvo = ALVO_PADRAO if alvo is None else int(alvo or 0)
    if alvo <= 0:
        return False
    formatos = formatos_pedidos(r)
    return sum(1 for p in posts if p.get("formato") in formatos) >= alvo


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


def releitura_pedida() -> tuple[set[str], int]:
    """Quais perfis foram pedidos de novo, e em que momento."""
    if not RELEITURA.exists():
        return set(), 0
    try:
        d = json.loads(RELEITURA.read_text(encoding="utf-8"))
    except Exception:
        return set(), 0
    return ({c.strip().lstrip("@") for c in (d.get("contas") or []) if c.strip()},
            int(d.get("quando") or 0))


def quer_reler(conta: str, estado: dict, pedidas: set[str], quando: int) -> bool:
    """Releitura já começada continua; pedido novo começa uma."""
    if estado.get("relendo"):
        return True
    return conta in pedidas and quando > int(estado.get("releitura_em") or 0)


def pendentes(contas: list[str]) -> list[str]:
    """Perfis que ainda faltam, do menos varrido em proporção para o mais varrido."""
    pedidas, quando = releitura_pedida()
    fila = []
    for c in contas:
        e = estado_de(c)
        if e.get("completo"):
            if not quer_reler(c, e, pedidas, quando):
                continue
            # releitura entra no fim da fila: ela é curta, e quem nunca foi varrido
            # até o fim tem mais a ganhar com a vaga.
            fila.append((2.0, c))
            continue
        # QUEM AINDA NAO FOI ABERTO VEM PRIMEIRO: uma chamada resolve o perfil inteiro
        # e ja' traz doze posts, entao e' a vaga mais bem gasta da rodada.
        if not e.get("perfil"):
            fila.append((-1.0, c))
            continue
        total = (e.get("perfil") or {}).get("publicacoes") or 0
        lidos = len(e.get("posts", []))
        # COM TOTAL, ordena por fracao varrida. SEM TOTAL, por quantidade lida: o feed
        # pelo arroba nao informa quantas publicacoes o perfil tem, e tratar isso como
        # "nao identificado" mandava todo perfil para a frente da fila, para sempre.
        fila.append((lidos / total if total else lidos / 10000.0, c))
    fila.sort()
    return [c for _, c in fila]


def _motivo_da_parada(estado: dict, r: dict) -> dict:
    """O que fica escrito na ficha quando a varredura para por escolha, e nao por fim."""
    formatos = set(r.get("formatos") or [])
    return {
        "alvo": ALVO_PADRAO if r.get("alvo") is None else int(r.get("alvo") or 0),
        "teto": int(r.get("lidos_no_maximo") or LIDOS_NO_MAXIMO),
        "lidos": len(estado.get("posts") or []),
        "do_formato": sum(1 for x in (estado.get("posts") or [])
                          if x.get("formato") in formatos) if formatos else 0,
        "formatos": sorted(formatos),
    }


RETRATOS = Path("dados/retratos")
FICHA_RETRATOS = Path("dados/retratos.json")


def guardar_retrato(conta: str, perfil: dict) -> None:
    """Baixa a foto do perfil e anota o nome dele na ficha dos retratos.

    POR QUE A ESTEIRA PRECISA FAZER ISSO: quem guardava a foto era so' a ponte, no
    momento em que ela conseguia identificar o perfil. So' que a identificacao pela
    ponte falha com frequencia, e nesses casos quem abre o perfil e' a esteira, pelo
    arroba. O perfil entrava completo e sem foto: o @vinci.society ficou com a inicial
    no lugar da marca enquanto os outros dois tinham a imagem.

    O ENDERECO DA FOTO VENCE EM HORAS, entao o que se guarda e' o arquivo, e nao o
    link. Depois disso a imagem e' servida do proprio acervo, para sempre.
    """
    url = perfil.get("avatar")
    if not url:
        return
    RETRATOS.mkdir(parents=True, exist_ok=True)
    arquivo = RETRATOS / f"{conta}.jpg"
    ficha = {}
    if FICHA_RETRATOS.exists():
        try:
            ficha = json.loads(FICHA_RETRATOS.read_text(encoding="utf-8"))
        except Exception:
            ficha = {}

    tem_foto = arquivo.exists()
    if not tem_foto:
        try:
            req = urllib.request.Request(url, headers={
                **CABECALHO, "Referer": "https://www.instagram.com/"})
            with urllib.request.urlopen(req, timeout=25) as r:
                cru = r.read()
            # meio mega de teto: foto de perfil nao passa disso, e o que passar disso
            # nao e' foto de perfil
            if cru and len(cru) < 500_000:
                arquivo.write_bytes(cru)
                tem_foto = True
        except Exception as e:
            print(f"  retrato de {conta} nao veio ({type(e).__name__})")

    ficha[conta] = {"nome": perfil.get("nome"),
                    "seguidores": perfil.get("seguidores") or 0,
                    "publicacoes": perfil.get("publicacoes") or 0,
                    "foto": tem_foto}
    FICHA_RETRATOS.write_text(json.dumps(ficha, ensure_ascii=False, indent=1),
                              encoding="utf-8")


ANDAMENTO = Path("dados/andamento")


def bater_ponto(conta: str, estado: dict, vaga: int) -> None:
    """Deixa um sinal pequeno de onde a varredura está NESTE momento.

    POR QUE ISTO EXISTE: a tela só sabia do avanço quando a rodada fechava, e um perfil
    recém-adicionado ficava minutos sem sinal nenhum enquanto vinte máquinas trabalhavam
    nele. O arquivo do perfil tem o avanço, mas o do @boletimdamorte passa de 2 MB e
    ninguém baixa isso de dez em dez segundos só para ver um número.

    Este aqui tem menos de duzentos bytes e é reescrito a cada página lida.
    """
    perfil = estado.get("perfil") or {}
    posts = estado.get("posts") or []
    # A TELA PRECISA SABER CONTRA O QUE COMPARAR.
    #
    # Sem isto, o bilhete dizia "72 de 2.254", porque 2.254 e' quantas publicacoes o
    # perfil tem no total. So' que numa varredura de reels esses 2.254 nunca serao
    # lidos: a esteira busca reels puros e para em duzentos. O numero estava certo e a
    # frase estava errada, e quem le' conclui, com razao, que esta' varrendo tudo de novo.
    r = regua()
    pedidos = formatos_pedidos(r)
    alvo = ALVO_PADRAO if r.get("alvo") is None else int(r.get("alvo") or 0)
    tudo = pedidos == TODOS_OS_FORMATOS
    ANDAMENTO.mkdir(parents=True, exist_ok=True)
    (ANDAMENTO / f"{conta}.json").write_text(json.dumps({
        "conta": conta,
        # O QUE A TELA MOSTRA E' O QUE FOI PEDIDO. Este rotulo existe para o cartao nunca
        # mais dizer "72 de 2.254 posts" numa varredura de reels: sao coisas diferentes,
        # e a leitura obvia era que estava varrendo o perfil inteiro.
        "modo": "reels" if so_reels(r) else "tudo",
        "rotulo": rotulo_dos_formatos(r),
        "alvo": alvo,
        "lidos": sum(1 for x in posts if x.get("formato") in pedidos),
        "publicacoes": ((perfil.get("publicacoes") or 0) if tudo and not alvo else alvo),
        "completo": bool(estado.get("completo")),
        "relendo": bool(estado.get("relendo")),
        "vaga": vaga,
        "quando": int(time.time()),
    }, ensure_ascii=False), encoding="utf-8")


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
    pedidas, quando = releitura_pedida()
    relendo = bool(estado.get("completo")) and quer_reler(conta, estado, pedidas, quando)
    if estado.get("completo") and not relendo:
        print(f"[{conta}] já ficou completo enquanto eu esperava")
        return 0

    # A RELEITURA COMEÇA DO TOPO, e não de onde a varredura parou. O que é novo está na
    # primeira página; o marcador guardado aponta para o fundo do histórico, que já está
    # todo aqui. Ela usa marcador próprio para não perder o lugar da varredura profunda,
    # caso o Instagram volte a liberar mais fundo um dia.
    if relendo and not estado.get("relendo"):
        estado["relendo"] = True
        estado["marcador_novo"] = None
        estado["releitura_em"] = quando
        print(f"[{conta}] releitura pedida: leio do topo até bater no que já tenho")

    print(f"vaga {vaga} de {len(fila)} perfis pendentes, trabalhando em @{conta}")

    # A ABERTURA DE UM PERFIL NOVO, PELO ARROBA.
    #
    # Aqui se pedia a identificação pelo caminho antigo, que responde 429 destes
    # endereços SEMPRE: sonda de 18/08/2026, três máquinas, mesmo resultado nas três.
    # O perfil então dependia da ponte, que acerta mais ou menos uma vez em três, e
    # cada perfil novo virava sorteio. Com dez perfis de uma vez, sorteio dez vezes.
    #
    # O feed pedido pelo arroba passa destes mesmos endereços, e traz o número do
    # perfil junto dos doze primeiros posts. Uma chamada faz o que antes eram duas
    # etapas e uma reza.
    if not estado.get("perfil"):
        aberto = abre_pelo_arroba(conta, prazo=time.time() + 45)
        if not aberto:
            print(f"[{conta}] a abertura não passou nesta vaga. A próxima tenta.")
            return 0
        if aberto.get("vazio"):
            # sai da fila com motivo escrito, em vez de ser tentado para sempre
            estado["perfil"] = {"conta": conta, "id": None, "nome": None,
                                "seguidores": 0, "publicacoes": 0, "privado": None}
            estado["vazio"] = True
            estado["completo"] = True
            estado["atualizado"] = int(time.time())
            grava(conta, estado)
            print(f"[{conta}] SEM POSTS PÚBLICOS: conta fechada ou sem publicação.")
            return 0
        # SO' O QUE FOI PEDIDO ENTRA, ja' na abertura. A primeira leitura vem misturada
        # porque e' assim que o Instagram entrega, mas o que fica guardado e' a escolha.
        pedidos = formatos_pedidos(regua())
        estado["perfil"] = aberto["perfil"]
        estado["posts"] = [x for x in aberto["posts"] if x.get("formato") in pedidos]
        estado["marcador"] = aberto["marcador"]
        estado["completo"] = bool(aberto["acabou"])
        estado["atualizado"] = int(time.time())
        grava(conta, estado)
        guardar_retrato(conta, aberto["perfil"])
        bater_ponto(conta, estado, vaga)
        print(f"[{conta}] ABERTO pelo arroba: id {aberto['perfil']['id']}, "
              f"{len(aberto['posts'])} posts já na primeira página")
        return 0

    r = regua()
    vistos = {p["codigo"] for p in estado["posts"]}
    novos = 0
    paginas = 0

    # O CAMINHO DOS REELS, quando é só isso que foi pedido.
    #
    # Aqui está a diferença entre varrer cinco mil publicações e varrer duzentas: o
    # feed misturado obriga a ler tudo para achar os reels, e este caminho entrega
    # reels puros, doze por página. No perfil medido, um ganho de vinte e quatro vezes.
    if so_reels(r) and not relendo:
        while paginas < PAGINAS_POR_VAGA:
            d = pagina_de_reels(estado["perfil"]["id"], estado.get("marcador_reels"))
            if d is None:
                if paginas == 0:
                    print(f"[{conta}] endereço desta vaga já estava gasto (reels)")
                break
            paginas += 1
            for p in d["posts"]:
                if p["codigo"] not in vistos:
                    vistos.add(p["codigo"])
                    estado["posts"].append(p)
                    novos += 1
            estado["marcador_reels"] = d["marcador"]
            if d["acabou"]:
                estado["completo"] = True
                print(f"[{conta}] ACABARAM OS REELS deste perfil")
                break
            if ja_basta(estado, r):
                estado["completo"] = True
                estado["parou_no_alvo"] = _motivo_da_parada(estado, r)
                print(f"[{conta}] PAREI: alvo de reels atingido")
                break

        if not paginas:
            return 0
        estado["atualizado"] = int(time.time())
        grava(conta, estado)
        bater_ponto(conta, estado, vaga)
        reels_agora = sum(1 for x in estado["posts"] if x.get("formato") == "reels")
        print(f"[{conta}] +{novos} reels em {paginas} página(s) (total {reels_agora})")
        return 0

    # DUAS PÁGINAS POR VAGA, e não uma. Medido: o corte vem na terceira leitura.
    while paginas < PAGINAS_POR_VAGA:
        marcador = estado.get("marcador_novo") if relendo else estado.get("marcador")
        j = _uma_pagina(estado["perfil"]["id"], marcador)
        if j is None:
            if paginas == 0:
                print(f"[{conta}] endereço desta vaga já estava gasto")
            break
        paginas += 1

        # O FILTRO ACONTECE AQUI, e nao la' na frente.
        #
        # O Instagram so' entrega o historico misturado, sem deixar pedir um formato
        # (a unica excecao e' o reels, que tem via propria e e' tratado antes daqui).
        # Ler misturado e' obrigacao; GUARDAR misturado nao e'. Quem pediu carrossel
        # recebe carrossel, e o resto passa sem deixar rastro.
        pedidos = formatos_pedidos(r)
        entraram = 0
        for bruto in j.get("items", []):
            p = limpa_post(bruto)
            if not p["codigo"] or p["codigo"] in vistos:
                continue
            vistos.add(p["codigo"])
            if p.get("formato") not in pedidos:
                continue
            estado["posts"].append(p)
            entraram += 1
        novos += entraram
        # o teto de leitura conta PAGINAS VISTAS, e nao so' o que foi guardado: e' ele
        # que garante que a varredura acaba mesmo num perfil sem nada do formato pedido
        estado["vistas"] = int(estado.get("vistas") or 0) + len(j.get("items", []))

        if relendo:
            estado["marcador_novo"] = j.get("next_max_id")
            # A RELEITURA PARA QUANDO A PÁGINA INTEIRA JÁ ERA CONHECIDA. Dali para trás é
            # histórico que já está guardado, e continuar seria reler o acervo inteiro
            # para não achar nada. É isso que a torna barata: quem posta uma vez por dia
            # gasta uma leitura, e não duzentas.
            if entraram == 0 or not j.get("more_available") or not estado["marcador_novo"]:
                estado["relendo"] = False
                print(f"[{conta}] RELEITURA ENCERRADA, {entraram} posts novos")
                break
        else:
            estado["marcador"] = j.get("next_max_id")
            if not j.get("more_available") or not estado["marcador"]:
                estado["completo"] = True
                print(f"[{conta}] VARREDURA COMPLETA: acabou o histórico do perfil")
                break
            if ja_basta(estado, r):
                estado["completo"] = True
                estado["parou_no_alvo"] = _motivo_da_parada(estado, r)
                print(f"[{conta}] PAREI: {len(estado['posts'])} lidas, "
                      f"{estado['parou_no_alvo']['do_formato']} dos formatos escolhidos")
                break

    if not paginas:
        return 0

    estado["atualizado"] = int(time.time())
    grava(conta, estado)
    bater_ponto(conta, estado, vaga)

    rotulo = rotulo_dos_formatos(r)
    print(f"[{conta}] +{novos} {rotulo} em {paginas} página(s) "
          f"(total {len(estado['posts'])} {rotulo}, "
          f"{estado.get('vistas') or 0} publicações vistas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
