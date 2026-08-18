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

from minerar import CABECALHO, PASTA, abre_pelo_arroba, limpa_post, grava

FONTES = Path("dados/fontes.json")
REGUA = Path("dados/regua.json")

# MEDIDO EM 18/08/2026, tres maquinas do GitHub lendo em sequencia: o corte vem na
# TERCEIRA leitura, com 401. Duas passam. Antes daqui so' se fazia uma por maquina, o
# que era a medida certa do caminho antigo e virou desperdicio de metade da vaga.
PAGINAS_POR_VAGA = 2

# Quantas publicacoes dos formatos escolhidos bastam para medir e escolher as melhores.
# Com duzentas ja' ha' mediana firme e sobra fora-da-curva; o resto e' historico antigo,
# que e' o que menos serve e o que mais custa.
ALVO_PADRAO = 200

# O SEGUNDO FREIO, e ele e' o que garante que a coisa acaba.
#
# So' o alvo por formato nao basta: no @brandsdecoded__, das 24 publicacoes mais
# recentes 23 eram carrossel e 1 era reels. Nessa proporcao, juntar 200 reels exigiria
# ler quase cinco mil publicacoes, e o perfil tem 2.253. O alvo nunca seria atingido e a
# varredura leria tudo assim mesmo, que e' exatamente o que se queria evitar.
#
# Entao vale o que vier primeiro: juntou o alvo do formato, ou leu este tanto no total.
LIDOS_NO_MAXIMO = 800


def regua() -> dict:
    """A regua escolhida na tela. A varredura le' dela quanto e' 'o bastante'."""
    if not REGUA.exists():
        return {}
    try:
        return json.loads(REGUA.read_text(encoding="utf-8"))
    except Exception:
        return {}


def ja_basta(estado: dict, r: dict) -> bool:
    """O perfil ja' tem o que foi pedido?

    O PROBLEMA QUE ISTO RESOLVE: quem escolhe varrer so' reels nao quer esperar o
    historico inteiro do perfil ser lido. E ele e' lido de qualquer jeito, porque o
    Instagram nao deixa pedir so' um formato sem sessao: a via de reels responde
    "require_login". O feed vem misturado, e nao ha' escolha quanto a isso.

    O que da' para escolher e' QUANDO PARAR. Medido no @brandsdecoded__: das 24
    publicacoes mais recentes, 23 eram carrossel e 1 era reels. Varrer as 2.253 para
    achar os reels custa umas tres horas de esteira; parar ao juntar o bastante deles
    custa minutos, e o que fica de fora e' o mais antigo, que e' o que menos serve.
    """
    # DUZENTAS E' O PADRAO, e nao zero. A ponte que grava a regua ainda nao repassa este
    # campo (ela monta o arquivo com uma lista fixa de campos), entao sem um padrao aqui
    # a esteira varreria sempre o perfil inteiro, que e' justamente a demora reclamada.
    # Quando o campo passar a chegar, ele manda; zero explicito continua querendo dizer
    # "varre tudo".
    alvo = r.get("alvo")
    alvo = ALVO_PADRAO if alvo is None else int(alvo or 0)
    if alvo <= 0:
        return False
    posts = estado.get("posts") or []
    teto = int(r.get("lidos_no_maximo") or LIDOS_NO_MAXIMO)
    if len(posts) >= teto:
        return True
    formatos = set(r.get("formatos") or [])
    if not formatos:
        return len(posts) >= alvo
    return sum(1 for p in posts if p.get("formato") in formatos) >= alvo
# O PEDIDO DE RELEITURA, num arquivo só e pequeno de propósito.
# Perfil dado por encerrado saía da fila para sempre: pedir para minerar de novo não
# fazia nada, a rodada abria, não achava trabalho e fechava. Agora a tela grava aqui o
# pedido, com a hora, e quem já foi encerrado volta para a fila até atender aquela hora.
#
# POR QUE UM ARQUIVO À PARTE, e não uma marca dentro do arquivo do perfil: quem escreve
# o pedido é a ponte, e o arquivo de um perfil varrido passa de 1 MB. Reescrever aquilo
# de dentro da ponte só para virar uma chave é caro e já quebrou o salvar uma vez.
RELEITURA = Path("dados/revisitar.json")
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
    ANDAMENTO.mkdir(parents=True, exist_ok=True)
    (ANDAMENTO / f"{conta}.json").write_text(json.dumps({
        "conta": conta,
        "lidos": len(estado.get("posts") or []),
        "publicacoes": perfil.get("publicacoes") or 0,
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
        estado["perfil"] = aberto["perfil"]
        estado["posts"] = aberto["posts"]
        estado["marcador"] = aberto["marcador"]
        estado["completo"] = bool(aberto["acabou"])
        estado["atualizado"] = int(time.time())
        grava(conta, estado)
        bater_ponto(conta, estado, vaga)
        print(f"[{conta}] ABERTO pelo arroba: id {aberto['perfil']['id']}, "
              f"{len(aberto['posts'])} posts já na primeira página")
        return 0

    r = regua()
    vistos = {p["codigo"] for p in estado["posts"]}
    novos = 0
    paginas = 0

    # DUAS PÁGINAS POR VAGA, e não uma. Medido: o corte vem na terceira leitura.
    while paginas < PAGINAS_POR_VAGA:
        marcador = estado.get("marcador_novo") if relendo else estado.get("marcador")
        j = _uma_pagina(estado["perfil"]["id"], marcador)
        if j is None:
            if paginas == 0:
                print(f"[{conta}] endereço desta vaga já estava gasto")
            break
        paginas += 1

        entraram = 0
        for bruto in j.get("items", []):
            p = limpa_post(bruto)
            if p["codigo"] and p["codigo"] not in vistos:
                vistos.add(p["codigo"])
                estado["posts"].append(p)
                entraram += 1
        novos += entraram

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
                formatos = set(r.get("formatos") or [])
                do_formato = sum(1 for x in estado["posts"]
                                 if x.get("formato") in formatos) if formatos else 0
                estado["parou_no_alvo"] = {
                    "alvo": ALVO_PADRAO if r.get("alvo") is None else int(r.get("alvo")),
                    "teto": int(r.get("lidos_no_maximo") or LIDOS_NO_MAXIMO),
                    "lidos": len(estado["posts"]),
                    "do_formato": do_formato,
                    "formatos": sorted(formatos),
                }
                print(f"[{conta}] PAREI: {len(estado['posts'])} lidas, "
                      f"{do_formato} dos formatos escolhidos")
                break

    if not paginas:
        return 0

    estado["atualizado"] = int(time.time())
    grava(conta, estado)
    bater_ponto(conta, estado, vaga)

    meta = (estado.get("perfil") or {}).get("publicacoes") or 0
    print(f"[{conta}] +{novos} posts em {paginas} página(s) "
          f"(total {len(estado['posts'])}{f' de {meta}' if meta else ''})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
