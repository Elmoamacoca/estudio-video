"""Seletor: separa os melhores posts de cada perfil, por formato.

A REGUA, e por que ela e' por formato:
desempenho e' multiplo da mediana da propria conta, nunca numero absoluto. Um perfil
que faz 40 mil de media e entrega 300 mil estourou; um que faz 2 milhoes e entrega
800 mil foi mal.

E a mediana tem que ser POR FORMATO, porque as escalas nao se conversam. Medido no
@boletimdamorte em 16/08/2026: video vem com contagem de exibicao, imagem e carrossel
vem sem, so com curtidas. Comparar os dois no mesmo ranking mistura duas reguas e
premia o formato errado.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
from pathlib import Path

PASTA = Path("dados/perfis")
SAIDA = Path("dados/selecao.json")
REGUA = Path("dados/regua.json")
# O QUE JA' DESCEU, por conta. Sem esta lista a fileira de Baixar repetiria para sempre
# os mesmos perfis com os mesmos números: baixar não mudaria nada na tela, e a unica
# forma de saber o que ja' veio seria abrir os lotes um por um.
BAIXADOS = Path("dados/baixados.json")
REPROVADOS = Path("dados/reprovados.json")


def ja_baixados() -> dict[str, set]:
    if not BAIXADOS.exists():
        return {}
    try:
        d = json.loads(BAIXADOS.read_text(encoding="utf-8"))
        return {c: set(v) for c, v in d.items()}
    except Exception:
        return {}


def ja_reprovados() -> dict[str, set]:
    """Quem baixou e nao passou na limpeza. NAO VOLTA PARA A FILEIRA NUNCA MAIS.

    A reprovacao e' da auditoria, que e' deterministica: baixar de novo da' no mesmo. Sem
    esta lista, os cinco reels reprovados do `thenews.business` na leva 29 continuavam
    aparecendo como disponiveis, e a esteira ia rebaixar e reprovar os mesmos cinco em
    toda leva seguinte.
    """
    if not REPROVADOS.exists():
        return {}
    try:
        d = json.loads(REPROVADOS.read_text(encoding="utf-8"))
        return {c: set(v) for c, v in d.items()}
    except Exception:
        return {}

# O QUE VALE QUANDO O GABRIEL NÃO ESCOLHEU NADA. Antes estes números moravam na linha
# de comando dentro do arquivo da esteira, escolhidos por mim: a tela tinha campos para
# editá-los e a esteira ignorava os campos. Agora a escolha dele fica no acervo, e isto
# aqui é só o ponto de partida.
PADRAO = {
    "formatos": ["reels", "post", "carrossel"],
    "por_formato": True,
    "corte": 1.5,
    "cortes": {"reels": 1.5, "post": 1.5, "carrossel": 1.5},
    "teto": 500,
}


def regua() -> dict:
    """A régua escolhida na tela, com o padrão preenchendo o que faltar."""
    d = dict(PADRAO)
    if REGUA.exists():
        try:
            d.update({k: v for k, v in
                      json.loads(REGUA.read_text(encoding="utf-8")).items()
                      if v is not None})
        except Exception:
            pass
    d["cortes"] = {**PADRAO["cortes"], **(d.get("cortes") or {})}
    return d


def corte_de(formato: str, r: dict) -> float:
    """O corte daquele formato. Sem separação por formato, um corte serve para todos."""
    if not r.get("por_formato"):
        return float(r.get("corte") or PADRAO["corte"])
    return float(r["cortes"].get(formato, r.get("corte") or PADRAO["corte"]))


def sinal(post: dict) -> tuple[int, str]:
    """Qual numero representa o alcance daquele post, e de qual escala ele veio."""
    if post.get("views"):
        return post["views"], "exibicoes"
    return post.get("curtidas") or 0, "curtidas"


def mede_perfil(dados: dict, r: dict) -> list[dict]:
    """Devolve os posts do perfil com o indice de desempenho calculado."""
    conta = (dados.get("perfil") or {}).get("conta", "?")
    posts = [p for p in dados.get("posts", []) if p.get("formato") in r["formatos"]]
    saida: list[dict] = []

    # A CHAVE DO GRUPO É A ESCOLHA DELE. Com separação por formato, reels e carrossel
    # têm medianas próprias; sem ela, todos entram num caldeirão só. A escala continua
    # separando em qualquer caso, e isso não é opção: vídeo vem com contagem de exibição
    # e imagem vem só com curtida, então comparar os dois é comparar réguas diferentes.
    def chave(p, escala):
        return (p["formato"] if r.get("por_formato") else "tudo", escala)

    grupos: dict[tuple[str, str], list[int]] = {}
    for p in posts:
        valor, escala = sinal(p)
        if valor > 0:
            grupos.setdefault(chave(p, escala), []).append(valor)

    medianas = {k: statistics.median(v) for k, v in grupos.items() if v}

    for p in posts:
        valor, escala = sinal(p)
        mediana = medianas.get(chave(p, escala), 0)
        alcance = p.get("views") or p.get("curtidas") or 0
        interacao = (p.get("curtidas") or 0) + (p.get("comentarios") or 0)
        saida.append({
            **p,
            "conta": conta,
            "escala": escala,
            "mediana_do_formato": round(mediana),
            "corte_usado": corte_de(p["formato"], r),
            "indice": round(valor / mediana, 2) if mediana else 0.0,
            "engajamento": round(100 * interacao / alcance, 2) if alcance else 0.0,
            "endereco": f"https://www.instagram.com/p/{p['codigo']}/",
        })
    return saida


def selecionar(r: dict | None = None) -> dict:
    r = r or regua()
    teto = int(r.get("teto") or PADRAO["teto"])
    criterio = {"formatos": r["formatos"], "por_formato": bool(r.get("por_formato")),
                "corte": r.get("corte"), "cortes": r["cortes"], "teto": teto}
    # ACERVO VAZIO TEM A MESMA FORMA DO CHEIO, e nao uma forma curta com um recado.
    #
    # Aqui saia {"itens": [], "erro": ...}, sem "avaliados" e sem "perfis". Isso derrubou
    # a rodada 60 inteira: o proprio programa estourou ao imprimir "avaliados", que
    # naquele caminho nao existia, e junto com ele caiu o passo que fecha a rodada e
    # carimba a hora na tela. Quem le a saida nao deve precisar saber se o banco esta
    # vazio para saber quais campos existem.
    if not PASTA.exists():
        return {"criterio": criterio, "perfis": [], "avaliados": 0, "itens": []}

    todos: list[dict] = []
    perfis: list[dict] = []
    pulados: list[str] = []
    for arq in sorted(PASTA.glob("*.json")):
        # UM PERFIL ILEGIVEL NAO DERRUBA A SELECAO INTEIRA. Um arquivo truncado por
        # queda no meio da escrita matava a selecao toda com JSONDecodeError, a
        # esteira parava, e o motivo ficava escondido; o catalogo ja' pulava o
        # corrompido, a selecao nao (auditoria de 25/08/2026). O pulado e' contado e
        # dito em voz alta, nunca engolido.
        try:
            dados = json.loads(arq.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            pulados.append(arq.name)
            print(f"  AVISO: pulei o perfil ilegivel {arq.name} ({e})")
            continue
        if not dados.get("perfil"):
            continue
        posts_todos = dados.get("posts", [])
        datas = sorted(x["data"] for x in posts_todos if x.get("data"))
        # A CONTAGEM POR FORMATO É DO QUE FOI VARRIDO, não do que passou na régua.
        # Contar pela seleção fazia a tabela dizer "0 posts e 0 carrosséis" num perfil
        # com 2.531 imagens, só porque o corte daquele momento era de reels.
        por_formato = {"reels": 0, "post": 0, "carrossel": 0}
        for x in posts_todos:
            f = x.get("formato")
            if f in por_formato:
                por_formato[f] += 1
        perfis.append({
            "conta": dados["perfil"]["conta"],
            "nome": dados["perfil"].get("nome"),
            "avatar": dados["perfil"].get("avatar"),
            "seguidores": dados["perfil"].get("seguidores"),
            # MERCADO E ETIQUETA AINDA NAO SAO GRAVADOS pela mineracao. Passam por aqui
            # vazios de proposito: o dia em que ela comecar a grava-los, os dois filtros
            # da aba de Baixar acendem sozinhos, sem mexer em mais nada.
            "mercado": dados["perfil"].get("mercado"),
            "etiquetas": dados["perfil"].get("etiquetas") or [],
            "atualizado": dados.get("atualizado"),
            "publicacoes": dados["perfil"]["publicacoes"],
            "lidos": len(dados.get("posts", [])),
            "completo": bool(dados.get("completo")),
            # perfil encerrado que foi pedido de novo. Sem este campo a tela mostrava
            # "até o limite" enquanto uma vaga estava lendo ele, e a conta não fechava
            # para quem olhava: já foi varrido, por que está varrendo?
            "relendo": bool(dados.get("relendo")),
            # ate onde a varredura alcancou. O Instagram corta a leitura anonima por
            # profundidade: no @boletimdamorte ele fechou aos 3.093 posts, cobrindo
            # de junho de 2023 para ca. O resto exige sessao, e nao vale o risco.
            "mais_antigo": datas[0] if datas else None,
            "mais_novo": datas[-1] if datas else None,
            "reels": por_formato["reels"],
            "imagens": por_formato["post"],
            "carrosseis": por_formato["carrossel"],
        })
        todos += mede_perfil(dados, r)

    # QUANTOS PASSARAM DA RÉGUA, POR PERFIL, e sem o teto do lote.
    # Contar pela lista final fazia o primeiro perfil levar as 500 vagas e o segundo
    # aparecer com zero, mesmo tendo dezenas acima do corte.
    acima_por_perfil: dict[str, int] = {}
    for x in todos:
        if x["indice"] >= x["corte_usado"]:
            acima_por_perfil[x["conta"]] = acima_por_perfil.get(x["conta"], 0) + 1

    escolhidos = sorted(
        (p for p in todos if p["indice"] >= p["corte_usado"]),
        key=lambda p: (p["indice"], p.get("views") or p.get("curtidas") or 0),
        reverse=True,
    )[:teto]

    # O QUE DA' PARA BAIXAR CONTA-SE NA LISTA JA' CORTADA PELO TETO, e nao no acervo
    # inteiro. Quem baixa le' `itens`, que para aqui no teto: contando antes do corte,
    # o cartao do perfil na tela prometia 737 e o lote entregava 500, sem nada explicar
    # a diferenca. Agora o numero do cartao e' exatamente o que desce.
    reels_por_perfil: dict[str, int] = {}
    feitos = ja_baixados()
    maus = ja_reprovados()
    baixados_por_perfil: dict[str, int] = {}
    reprovados_por_perfil: dict[str, int] = {}
    for x in escolhidos:
        if x["formato"] == "reels" and x.get("arquivo"):
            reels_por_perfil[x["conta"]] = reels_por_perfil.get(x["conta"], 0) + 1
            if x["codigo"] in feitos.get(x["conta"], ()):
                baixados_por_perfil[x["conta"]] = (
                    baixados_por_perfil.get(x["conta"], 0) + 1)
            elif x["codigo"] in maus.get(x["conta"], ()):
                reprovados_por_perfil[x["conta"]] = (
                    reprovados_por_perfil.get(x["conta"], 0) + 1)

    for pf in perfis:
        pf["acima"] = acima_por_perfil.get(pf["conta"], 0)
        pf["baixaveis"] = reels_por_perfil.get(pf["conta"], 0)
        pf["baixados"] = baixados_por_perfil.get(pf["conta"], 0)
        pf["reprovados"] = reprovados_por_perfil.get(pf["conta"], 0)
        # O QUE A FILEIRA DE BAIXAR MOSTRA. Zero aqui tira o perfil da fileira, e e' o
        # que faz ela encolher a cada lote em vez de repetir os mesmos cartoes.
        #
        # O REPROVADO SAI DA CONTA JUNTO COM O BAIXADO, e essa foi a correcao de 20/08.
        # Ele nao esta' na mao, e' verdade, mas tambem nao ha' como te-lo: a auditoria de
        # limpeza e' deterministica e ele reprovaria de novo. Contado como disponivel, o
        # perfil ficava para sempre na fileira oferecendo peca que nunca entrega. Foi o
        # que aconteceu com cinco reels do `thenews.business` depois da leva 29.
        pf["restam"] = max(0, pf["baixaveis"] - pf["baixados"] - pf["reprovados"])

    return {
        "criterio": criterio,
        "perfis": perfis,
        "avaliados": len(todos),
        "pulados": pulados,
        "itens": escolhidos,
    }


if __name__ == "__main__":
    # SEM ARGUMENTOS: a régua vem do acervo, escolhida na tela. Os argumentos continuam
    # aceitos para uso na bancada, mas a esteira não os usa mais.
    r = regua()
    if len(sys.argv) > 1:
        r["formatos"] = [f.strip() for f in sys.argv[1].split(",") if f.strip()]
    if len(sys.argv) > 2:
        r["por_formato"] = False
        r["corte"] = float(sys.argv[2])
    if len(sys.argv) > 3:
        r["teto"] = int(sys.argv[3])

    saida = selecionar(r)
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    # A ESCRITA E' ATOMICA: quem le a selecao e' o baixar, e um write cortado no meio
    # deixava um JSON truncado que estourava a leva seguinte (auditoria 25/08/2026).
    tmp = SAIDA.with_name(SAIDA.name + ".novo")
    tmp.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, SAIDA)

    como = ("por formato " + ", ".join(f"{f} {r['cortes'][f]}x" for f in r["formatos"]
                                       if f in r["cortes"])
            if r.get("por_formato") else f"corte único de {r['corte']}x")
    print(f"avaliados: {saida['avaliados']} | acima da régua: {len(saida['itens'])} "
          f"({como})")
    for p in saida["itens"][:12]:
        print(f"  {p['indice']:>6.2f}x  {p['formato']:<9} "
              f"{(p.get('views') or p.get('curtidas')):>9,}".replace(",", ".")
              + f"  {p['escala']:<10} @{p['conta']}  {p['endereco']}")
