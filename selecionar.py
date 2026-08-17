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
import statistics
import sys
from pathlib import Path

PASTA = Path("dados/perfis")
SAIDA = Path("dados/selecao.json")


def sinal(post: dict) -> tuple[int, str]:
    """Qual numero representa o alcance daquele post, e de qual escala ele veio."""
    if post.get("views"):
        return post["views"], "exibicoes"
    return post.get("curtidas") or 0, "curtidas"


def mede_perfil(dados: dict, formatos: list[str]) -> list[dict]:
    """Devolve os posts do perfil com o indice de desempenho calculado."""
    conta = (dados.get("perfil") or {}).get("conta", "?")
    posts = [p for p in dados.get("posts", []) if p.get("formato") in formatos]
    saida: list[dict] = []

    # um grupo por formato e por escala: reels-exibicoes e reels-curtidas nao se misturam
    grupos: dict[tuple[str, str], list[int]] = {}
    for p in posts:
        valor, escala = sinal(p)
        if valor > 0:
            grupos.setdefault((p["formato"], escala), []).append(valor)

    medianas = {k: statistics.median(v) for k, v in grupos.items() if v}

    for p in posts:
        valor, escala = sinal(p)
        mediana = medianas.get((p["formato"], escala), 0)
        alcance = p.get("views") or p.get("curtidas") or 0
        interacao = (p.get("curtidas") or 0) + (p.get("comentarios") or 0)
        saida.append({
            **p,
            "conta": conta,
            "escala": escala,
            "mediana_do_formato": round(mediana),
            "indice": round(valor / mediana, 2) if mediana else 0.0,
            "engajamento": round(100 * interacao / alcance, 2) if alcance else 0.0,
            "endereco": f"https://www.instagram.com/p/{p['codigo']}/",
        })
    return saida


def selecionar(formatos: list[str], corte: float, teto: int) -> dict:
    if not PASTA.exists():
        return {"itens": [], "erro": "nenhum perfil minerado ainda"}

    todos: list[dict] = []
    perfis: list[dict] = []
    for arq in sorted(PASTA.glob("*.json")):
        dados = json.loads(arq.read_text(encoding="utf-8"))
        if not dados.get("perfil"):
            continue
        datas = sorted(x["data"] for x in dados.get("posts", []) if x.get("data"))
        perfis.append({
            "conta": dados["perfil"]["conta"],
            "nome": dados["perfil"].get("nome"),
            "avatar": dados["perfil"].get("avatar"),
            "seguidores": dados["perfil"].get("seguidores"),
            "atualizado": dados.get("atualizado"),
            "publicacoes": dados["perfil"]["publicacoes"],
            "lidos": len(dados.get("posts", [])),
            "completo": bool(dados.get("completo")),
            # ate onde a varredura alcancou. O Instagram corta a leitura anonima por
            # profundidade: no @boletimdamorte ele fechou aos 3.093 posts, cobrindo
            # de junho de 2023 para ca. O resto exige sessao, e nao vale o risco.
            "mais_antigo": datas[0] if datas else None,
            "mais_novo": datas[-1] if datas else None,
        })
        todos += mede_perfil(dados, formatos)

    escolhidos = sorted(
        (p for p in todos if p["indice"] >= corte),
        key=lambda p: (p["indice"], p.get("views") or p.get("curtidas") or 0),
        reverse=True,
    )[:teto]

    return {
        "criterio": {"formatos": formatos, "corte": corte, "teto": teto},
        "perfis": perfis,
        "avaliados": len(todos),
        "itens": escolhidos,
    }


if __name__ == "__main__":
    formatos = (sys.argv[1] if len(sys.argv) > 1 else "reels,post,carrossel").split(",")
    corte = float(sys.argv[2]) if len(sys.argv) > 2 else 1.5
    teto = int(sys.argv[3]) if len(sys.argv) > 3 else 500

    r = selecionar([f.strip() for f in formatos if f.strip()], corte, teto)
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"avaliados: {r['avaliados']} | acima de {corte}x: {len(r['itens'])}")
    for p in r["itens"][:12]:
        print(f"  {p['indice']:>6.2f}x  {p['formato']:<9} "
              f"{(p.get('views') or p.get('curtidas')):>9,}".replace(",", ".")
              + f"  {p['escala']:<10} @{p['conta']}  {p['endereco']}")
