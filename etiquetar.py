"""Grava mercado e etiquetas num perfil do acervo.

POR QUE ISTO E' UM PROGRAMA A PARTE, e por que ele viaja pelo mesmo caminho do lote:
a tela nao escreve no acervo. Quem escreve e' a esteira, e quem manda a esteira rodar e'
uma ponte que copia campo a campo, com lista fixa. Medido em 18/08/2026: dos nove nomes
de campo testados, so' `quantos` atravessa. Entao todo pedido da tela viaja nesse campo,
e o comeco do texto diz o que ele e'.

O FORMATO E' DE TEXTO SIMPLES, e nao JSON, de proposito: quanto menos aspas e chaves o
texto tiver, menos chance de alguma camada no caminho mexer nele.

    etiquetar:<conta>|<mercado>|<etiqueta>;<etiqueta>;<etiqueta>

Mercado vazio apaga o mercado; lista vazia apaga as etiquetas.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PASTA = Path("dados/perfis")
MARCA = "etiquetar:"


def limpo(texto: str) -> str:
    """Sem os separadores dentro do valor, senao um nome parte o pedido em dois."""
    return texto.replace("|", " ").replace(";", " ").strip()


def aplicar(cru: str) -> int:
    if not cru.startswith(MARCA):
        print("este pedido nao e' de etiquetar.")
        return 1

    partes = (cru[len(MARCA):].split("|") + ["", ""])[:3]
    conta = limpo(partes[0]).lstrip("@").lower()
    mercado = limpo(partes[1])
    etiquetas = [limpo(e) for e in partes[2].split(";") if limpo(e)]

    arq = PASTA / f"{conta}.json"
    if not conta or not arq.exists():
        print(f"perfil nao encontrado no acervo: [{conta}]")
        return 1

    dados = json.loads(arq.read_text(encoding="utf-8"))
    if not dados.get("perfil"):
        print(f"[{conta}] ainda nao tem ficha aberta: nada a marcar.")
        return 1

    dados["perfil"]["mercado"] = mercado or None
    # SEM REPETIDA E EM ORDEM, para a mesma etiqueta escrita duas vezes nao virar duas
    # opcoes iguais no filtro.
    dados["perfil"]["etiquetas"] = sorted(dict.fromkeys(etiquetas))
    arq.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"[{conta}] mercado: {mercado or '(nenhum)'} | "
          f"etiquetas: {', '.join(dados['perfil']['etiquetas']) or '(nenhuma)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(aplicar(sys.argv[1] if len(sys.argv) > 1 else ""))
