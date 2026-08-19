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
# O QUE JA' DESCEU, por conta. E' o que faz a fileira da tela encolher a cada lote: sem
# este arquivo, o mesmo perfil aparecia com o mesmo numero para sempre, e o lote seguinte
# rebaixava tudo de novo.
BAIXADOS = Path("dados/baixados.json")


def pedido(texto: str) -> tuple[list, int]:
    """Le o pedido que veio da tela: de quais perfis, ou um teto de arquivos.

    OS DOIS NO MESMO CAMPO, e isso e' imposicao do caminho, nao preguica. Entre a tela e
    o GitHub ha' uma ponte que copia campo a campo, e so' o que esta' na lista dela
    atravessa. Medido em 18/08/2026 com uma sonda que imprimiu o pedido do outro lado:
    `contas`, `perfis`, `quem`, `alvo`, `conta`, `lista`, `selecionados` e `de` chegaram
    todos vazios; `quantos` chegou inteiro, com o texto exato que foi mandado. A ponte
    nao pode ser mexida daqui, entao o canal e' esse, e quem separa os dois sentidos e'
    esta funcao.
    """
    texto = (texto or "").strip()
    if not texto:
        return [], 300
    if texto.isdigit():
        return [], int(texto)
    contas = [c.strip().lstrip("@").lower() for c in texto.split(",") if c.strip()]
    return [c for c in contas if not c.isdigit()], 0


def ja_baixados() -> dict:
    if not BAIXADOS.exists():
        return {}
    try:
        return json.loads(BAIXADOS.read_text(encoding="utf-8"))
    except Exception:
        return {}


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


def main(cru: str) -> int:
    if not SELECAO.exists():
        print("nenhuma selecao encontrada. Rode o selecionar.py antes.")
        return 1

    contas, limite = pedido(cru)
    sel = json.loads(SELECAO.read_text(encoding="utf-8"))
    com_arquivo = [i for i in sel.get("itens", []) if i.get("arquivo")]
    sem_arquivo = len(sel.get("itens", [])) - len(com_arquivo)

    # O QUE JA' VEIO NAO VEM DE NOVO. O perfil escolhido na tela ja' mostra o saldo, e
    # sem este corte o lote repetiria os mesmos arquivos a cada pedido.
    feitos = ja_baixados()
    novos = [i for i in com_arquivo if i["codigo"] not in feitos.get(i["conta"], [])]
    repetidos = len(com_arquivo) - len(novos)

    if contas:
        # DE QUEM, E SEM TETO: quem escolheu os perfis na tela ja' viu quanto cada um
        # tem esperando, e a soma disso e' o lote.
        itens = [i for i in novos if i["conta"].lower() in contas]
        print(f"pedido: {len(contas)} perfil(is) -> {', '.join(contas)}")
    else:
        itens = novos[:limite]
        print(f"pedido: os {limite} melhores de todos os perfis")

    if not itens:
        print("nada para baixar neste pedido.")
        if repetidos:
            print(f"({repetidos} ja tinham sido baixados em lotes anteriores)")
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

    # QUEM MARCA O QUE FOI ENTREGUE E' O FIM DO FLUXO, e nao este arquivo.
    # Baixar nao e' entregar: o arquivo ainda passa pela limpeza, e o que reprovar la'
    # nao pode contar como feito. Marcado aqui, ele sumiria da fileira da tela sem nunca
    # ter chegado tratado a mao do Gabriel, e ninguem tentaria de novo.
    print(f"\n{ok} baixados, {falhas} falharam, {total_bytes / 1048576:.0f} MB em {gasto:.0f}s")
    if repetidos:
        print(f"{repetidos} ficaram de fora por ja terem vindo em lote anterior")
    if sem_arquivo:
        print(f"{sem_arquivo} itens da selecao eram imagem ou carrossel e ficaram de fora")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
