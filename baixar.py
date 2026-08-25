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
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

CABECALHO = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")}
SELECAO = Path("dados/selecao.json")
DESTINO = Path("brutos")
# O QUE JA' DESCEU, por conta. E' o que faz a fileira da tela encolher a cada lote: sem
# este arquivo, o mesmo perfil aparecia com o mesmo numero para sempre, e o lote seguinte
# rebaixava tudo de novo.
BAIXADOS = Path("dados/baixados.json")
REPROVADOS = Path("dados/reprovados.json")


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


def ja_reprovados() -> dict:
    """Quem ja' baixou e reprovou na limpeza. Baixar de novo da' no mesmo resultado, entao
    ele sai da fila de vez em vez de voltar a cada leva."""
    if not REPROVADOS.exists():
        return {}
    try:
        return json.loads(REPROVADOS.read_text(encoding="utf-8"))
    except Exception:
        return {}


def baixa_um(url: str, destino: Path) -> tuple[bool, int, str]:
    """Baixa um arquivo por inteiro ou nao baixa nada.

    O DOWNLOAD NASCE COM OUTRO NOME e so' vira o arquivo de verdade no fim, por
    troca atomica: um parcial de queda de processo ou disco cheio que ficasse com o
    nome final viraria "ja tinha" na rodada seguinte, seguiria para a limpeza, seria
    reprovado pelo ffmpeg e BANIDO para sempre em reprovados.json, tudo por uma
    falha passageira (auditoria de 25/08/2026). E o fluxo desce em pedacos direto
    para o disco, nunca o video inteiro na memoria.

    E O TROPECO DE REDE TEM UMA SEGUNDA CHANCE: timeout e 5xx tentam mais uma vez
    apos espera curta antes de contar falha. 403 e 410 nao: e' link vencido, e
    insistir no mesmo link vencido nao renova nada.
    """
    parcial = destino.with_name(destino.name + ".part")
    for tentativa in (1, 2):
        try:
            req = urllib.request.Request(url, headers=CABECALHO)
            with urllib.request.urlopen(req, timeout=90) as r, \
                    open(parcial, "wb") as f:
                shutil.copyfileobj(r, f, 1024 * 256)
            tam = parcial.stat().st_size
            os.replace(parcial, destino)
            return True, tam, ""
        except urllib.error.HTTPError as e:
            parcial.unlink(missing_ok=True)
            if e.code in (403, 410):
                return False, 0, f"HTTP {e.code}: o link venceu"
            if e.code >= 500 and tentativa == 1:
                time.sleep(2)
                continue
            return False, 0, f"HTTP {e.code}"
        except Exception as e:                                      # noqa: BLE001
            parcial.unlink(missing_ok=True)
            if tentativa == 1:
                time.sleep(2)
                continue
            return False, 0, type(e).__name__
    return False, 0, "nao consegui baixar"


def main(cru: str) -> int:
    if not SELECAO.exists():
        print("nenhuma selecao encontrada. Rode o selecionar.py antes.")
        return 1

    contas, limite = pedido(cru)
    # SELECAO ILEGIVEL E' RECADO, E NAO PILHA DE ERRO: um traceback de JSON nao diz
    # a ninguem o que fazer. O socorro e' rodar o selecionar de novo.
    try:
        sel = json.loads(SELECAO.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"a selecao esta ilegivel ({e}). Rode o selecionar.py de novo.")
        return 1
    com_arquivo = [i for i in sel.get("itens", []) if i.get("arquivo")]
    sem_arquivo = len(sel.get("itens", [])) - len(com_arquivo)

    # O QUE JA' VEIO NAO VEM DE NOVO. O perfil escolhido na tela ja' mostra o saldo, e
    # sem este corte o lote repetiria os mesmos arquivos a cada pedido.
    feitos = ja_baixados()
    maus = ja_reprovados()
    novos = [i for i in com_arquivo
             if i["codigo"] not in feitos.get(i["conta"], [])
             and i["codigo"] not in maus.get(i["conta"], [])]
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

    ok = falhas = total_bytes = vencidos = 0
    registro = []
    t0 = time.time()

    # UMA CONTA DE CADA VEZ, porque o registro da tela conta cada uma separada.
    # A ordem dentro da conta continua sendo a de desempenho, que e' a ordem em que a
    # selecao chegou aqui.
    fila: dict[str, list] = {}
    for i in itens:
        fila.setdefault(i["conta"], []).append(i)

    leva = os.environ.get("LEVA") or os.environ.get("LOTE")

    def avisar(conta: str, feitos: int, total: int, fim: bool = False) -> None:
        """Manda o avanco para o registro da tela, se este trabalho pertence a uma leva.

        Rodado na bancada, sem leva nenhuma, ele so' imprime e segue: o baixador continua
        servindo para testar a mao, sem depender de acervo nem de rede.
        """
        if not leva:
            return
        try:
            import registro as diario
            diario.andamento(int(leva), conta, feitos, total, fim)
        except Exception as e:
            print(f"  (o registro da tela nao aceitou o avanco: {type(e).__name__})")

    # TRES DOWNLOADS DE CADA VEZ, DENTRO DA MESMA CONTA. O servidor de midia nao
    # compartilha o teto da leitura (a medicao de 16/08/2026 la' em cima: 11 MB em 1
    # segundo, sem corte), e o custo por arquivo e' quase todo espera de rede, entao
    # tres juntos cortam o relogio de leva grande por ate' tres. Tres, e nao mais, por
    # gentileza: acima disso ninguem mediu, e acordar um teto novo do servidor de
    # midia custaria a leva inteira.
    #
    # O DESENHO E' O DO RECORTE NA OFICINA: o trabalhador so' baixa e devolve; quem
    # soma contador, imprime, monta o registro e avisa a tela e' o laco de fora, um
    # por vez. E o registro sai na ordem da selecao, nao na ordem de chegada, porque
    # a ordem de desempenho e' a que as etapas seguintes leem.
    TRES_JUNTOS = 3
    n = 0
    for conta, lista in fila.items():
        feitos = 0
        print(f"\n-- @{conta}: {len(lista)} arquivos")
        avisar(conta, 0, len(lista))
        baixados_da_conta: dict[int, tuple] = {}
        por_baixar = []
        for j, item in enumerate(lista):
            nome = f"{item['indice']:07.2f}x_{item['conta']}_{item['codigo']}.mp4"
            caminho = DESTINO / nome
            if caminho.exists():
                n += 1
                # O "JA TINHA" TAMBEM ENTRA NO REGISTRO. Sem isto, uma queda entre o
                # download e a marca de baixado fazia a peca voltar como "ja tinha" e
                # ficar FORA do _lote.json novo, que e' sobrescrito: ela passava na
                # limpeza e chegava na etapa 4 sem legenda e sem endereco, a perda
                # que so' aparece meses depois (auditoria de 25/08/2026).
                baixados_da_conta[j] = (item, nome, caminho.stat().st_size)
                print(f"  [{n}/{len(itens)}] ja tinha: {nome}")
                continue
            por_baixar.append((j, item, nome, caminho))

        with ThreadPoolExecutor(max_workers=TRES_JUNTOS) as piscina:
            futuros = {piscina.submit(baixa_um, item["arquivo"], caminho): (j, item, nome)
                       for j, item, nome, caminho in por_baixar}
            for fut in as_completed(futuros):
                j, item, nome = futuros[fut]
                n += 1
                try:
                    sucesso, tam, erro = fut.result()
                except Exception as e:
                    sucesso, tam, erro = False, 0, type(e).__name__
                if sucesso:
                    ok += 1
                    feitos += 1
                    total_bytes += tam
                    baixados_da_conta[j] = (item, nome, tam)
                    print(f"  [{n}/{len(itens)}] ok {tam // 1024} KB  {nome}")
                    avisar(conta, feitos, len(lista))
                else:
                    falhas += 1
                    if "venceu" in erro:
                        vencidos += 1
                    print(f"  [{n}/{len(itens)}] FALHOU ({erro})  {item['endereco']}")

        for j in sorted(baixados_da_conta):
            item, nome, tam = baixados_da_conta[j]
            registro.append({**{k: item[k] for k in
                               ("codigo", "conta", "formato", "indice", "views",
                                "curtidas", "comentarios", "duracao", "data",
                                "legenda", "endereco")},
                             "arquivo_local": nome, "bytes": tam})
        avisar(conta, feitos, len(lista), fim=True)

    gasto = time.time() - t0
    (DESTINO / "_lote.json").write_text(
        json.dumps({"itens": registro, "baixado_em": int(time.time())},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    # QUEM MARCA O QUE FOI ENTREGUE E' O FIM DO FLUXO, e nao este arquivo.
    # Baixar nao e' entregar: o arquivo ainda passa pela limpeza, e o que reprovar la'
    # nao pode contar como feito. Marcado aqui, ele sumiria da fileira da tela sem nunca
    # ter chegado tratado a mao do Gabriel, e ninguem tentaria de novo.
    print(f"\n{ok} baixados, {falhas} falharam, {total_bytes / 1048576:.0f} MB em {gasto:.0f}s")
    if vencidos:
        # O MOTIVO E O SOCORRO, ditos uma vez: o link de midia da selecao vence em
        # horas, e a unica renovacao e' a mineracao passar de novo pelo perfil.
        print(f"{vencidos} falharam por LINK VENCIDO: a selecao e' antiga demais. "
              "Rode a mineracao do perfil de novo para renovar os links.")
    if repetidos:
        print(f"{repetidos} ficaram de fora por ja terem vindo em lote anterior")
    if sem_arquivo:
        print(f"{sem_arquivo} itens da selecao eram imagem ou carrossel e ficaram de fora")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
