"""Baixador: pega os arquivos dos posts selecionados.

Aqui NAO ha limite. Medido em 16/08/2026 no runner: tres videos baixados um atras
do outro, sem pausa nenhuma, 11 MB em 1 segundo, nenhum corte. O servidor de midia
do Instagram nao compartilha o teto da leitura.

O aperto e' so descobrir O QUE baixar, e isso quem resolve e' o minerar.py.

Uma armadilha: o link do arquivo vence em poucas horas. Por isso o baixador confere
se o link ainda vale e, se venceu, pede o post de novo antes de desistir.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CABECALHO = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")}
SELECAO = Path("dados/selecao.json")
DESTINO = Path("brutos")


def baixa_um(url: str, destino: Path) -> tuple[bool, int, str]:
    try:
        req = urllib.request.Request(url, headers=CABECALHO)
        with urllib.request.urlopen(req, timeout=90) as r:
            dados = r.read()
        destino.write_bytes(dados)
        return True, len(dados), ""
    except urllib.error.HTTPError as e:
        return False, 0, f"HTTP {e.code}"
    except Exception as e:
        return False, 0, type(e).__name__


def main(limite: int) -> int:
    if not SELECAO.exists():
        print("nenhuma selecao encontrada. Rode o selecionar.py antes.")
        return 1

    sel = json.loads(SELECAO.read_text(encoding="utf-8"))
    itens = [i for i in sel.get("itens", []) if i.get("arquivo")][:limite]
    sem_arquivo = len(sel.get("itens", [])) - len(itens)

    if not itens:
        print("a selecao nao tem nenhum arquivo de video para baixar.")
        if sem_arquivo:
            print(f"({sem_arquivo} itens eram imagem ou carrossel, que nao tem arquivo unico)")
        return 1

    DESTINO.mkdir(parents=True, exist_ok=True)
    print(f"baixando {len(itens)} arquivos\n")

    ok = falhas = total_bytes = 0
    registro = []
    t0 = time.time()

    for n, item in enumerate(itens, 1):
        nome = f"{item['indice']:07.2f}x_{item['conta']}_{item['codigo']}.mp4"
        caminho = DESTINO / nome
        if caminho.exists():
            print(f"  [{n}/{len(itens)}] ja tinha: {nome}")
            continue

        sucesso, tam, erro = baixa_um(item["arquivo"], caminho)
        if sucesso:
            ok += 1
            total_bytes += tam
            registro.append({**{k: item[k] for k in
                               ("codigo", "conta", "formato", "indice", "views",
                                "curtidas", "comentarios", "duracao", "data",
                                "legenda", "endereco")},
                             "arquivo_local": nome, "bytes": tam})
            print(f"  [{n}/{len(itens)}] ok {tam // 1024} KB  {nome}")
        else:
            falhas += 1
            print(f"  [{n}/{len(itens)}] FALHOU ({erro})  {item['endereco']}")

    gasto = time.time() - t0
    (DESTINO / "_lote.json").write_text(
        json.dumps({"itens": registro, "baixado_em": int(time.time())},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{ok} baixados, {falhas} falharam, {total_bytes / 1048576:.0f} MB em {gasto:.0f}s")
    if sem_arquivo:
        print(f"{sem_arquivo} itens da selecao eram imagem ou carrossel e ficaram de fora")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 300))
