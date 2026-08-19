"""O diario de bordo do lote: cada passo, na hora em que acontece, gravado no acervo.

POR QUE EXISTE.
A mineracao tem registro ao vivo porque a esteira grava a cada vaga. O lote nao tinha
nada: entre apertar o botao e o arquivo aparecer havia minutos de silencio, e se algo
quebrasse no meio o silencio era o mesmo do sucesso. Aqui cada fase escreve no acervo e
empurra na hora, entao a tela conta a historia enquanto ela acontece.

O CUSTO E' UM COMMIT POR FASE, cinco por lote. E' o mesmo preco que a esteira ja' paga
por rodada, e e' o unico jeito de a tela saber de algo antes do fim.

QUEM MARCA O QUE JA' DESCEU E' O FIM DESTE ARQUIVO, e nao o baixador. Um arquivo que
baixou e reprovou na limpeza nao pode contar como entregue: ele nao vai no lote, e o
perfil precisa continuar mostrando aquele saldo para ele ser tentado de novo.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

PASTA = Path("dados/lotes")
INDICE = PASTA / "indice.json"
BAIXADOS = Path("dados/baixados.json")
LOTE = Path("brutos/_lote.json")
LIMPEZA = Path("tratados/_limpeza.json")

# Quantos lotes ficam no indice. O historico completo de cada um continua no arquivo
# proprio; o indice e' so' a capa que a tela le' de vinte e cinco em vinte e cinco
# segundos, e capa que cresce sem limite vira leitura cara para sempre.
NO_INDICE = 12


def ler(arq: Path, padrao):
    if not arq.exists():
        return padrao
    try:
        return json.loads(arq.read_text(encoding="utf-8"))
    except Exception:
        return padrao


def escrever(arq: Path, dado) -> None:
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(json.dumps(dado, ensure_ascii=False, indent=1), encoding="utf-8")


def diario(numero: int) -> Path:
    return PASTA / f"{numero}.json"


def passo(numero: int, tipo: str, texto: str, **extra) -> dict:
    """Acrescenta um passo ao diario do lote e devolve o diario."""
    d = ler(diario(numero), {"numero": numero, "passos": []})
    d["passos"].append({"quando": int(time.time()), "tipo": tipo, "texto": texto, **extra})
    escrever(diario(numero), d)
    return d


def capa(numero: int, **campos) -> None:
    """Atualiza a linha deste lote no indice, criando se ainda nao existe."""
    ind = ler(INDICE, {"lotes": []})
    linha = next((l for l in ind["lotes"] if l.get("numero") == numero), None)
    if not linha:
        linha = {"numero": numero, "inicio": int(time.time()), "estado": "em curso",
                 "baixados": 0, "limpos": 0, "reprovados": 0, "mb": 0}
        ind["lotes"].insert(0, linha)
    linha.update(campos)
    ind["lotes"] = ind["lotes"][:NO_INDICE]
    ind["atualizado"] = int(time.time())
    escrever(INDICE, ind)


def empurrar(recado: str) -> None:
    """Grava no acervo agora, e nao no fim. Falha aqui nao derruba o lote."""
    for cmd in (["git", "config", "user.name", "esteira"],
                ["git", "config", "user.email", "esteira@users.noreply.github.com"],
                ["git", "add", "dados/"],
                ["git", "commit", "-m", recado],
                ["git", "pull", "--rebase", "--autostash", "origin", "main"],
                ["git", "push"]):
        subprocess.run(cmd, capture_output=True, timeout=180)


# --------------------------------------------------------------------- as cinco fases

def abrir(numero: int, execucao: str, pedido: str) -> None:
    contas = [] if not pedido or pedido.isdigit() else \
        [c.strip().lstrip("@") for c in pedido.split(",") if c.strip()]
    de = ("de @" + ", @".join(contas)) if contas else f"os {pedido or 300} melhores"
    capa(numero, execucao=execucao, contas=contas, estado="em curso")
    passo(numero, "pedido", f"Lote pedido: {de}.")


def separar(numero: int) -> None:
    sel = ler(Path("dados/selecao.json"), {})
    passo(numero, "selecao",
          f"Régua aplicada: {sel.get('avaliados', 0)} avaliados, "
          f"{len(sel.get('itens', []))} acima da régua.")


def baixado(numero: int) -> None:
    reg = ler(LOTE, {}).get("itens", [])
    mb = round(sum(i.get("bytes", 0) for i in reg) / 1048576)
    capa(numero, baixados=len(reg), mb=mb)
    passo(numero, "baixa", f"{len(reg)} arquivos baixados, {mb} MB.", arquivos=len(reg))


def limpo(numero: int) -> None:
    d = ler(LIMPEZA, {})
    ok = [x for x in d.get("laudos", []) if x.get("limpo")]
    mau = [x for x in d.get("laudos", []) if not x.get("limpo")]
    capa(numero, limpos=len(ok), reprovados=len(mau))
    passo(numero, "limpeza" if not mau else "falha",
          f"Limpeza: {len(ok)} aprovados, {len(mau)} reprovados."
          + ("" if not mau else " Reprovado não entra no lote: "
             + ", ".join(x["arquivo"] for x in mau[:4])),
          aprovados=len(ok), reprovados=len(mau))


def fechar(numero: int, entregue: bool) -> None:
    """Marca o que foi entregue e fecha o lote.

    SO' O QUE PASSOU NA LIMPEZA CONTA COMO ENTREGUE. O arquivo que baixou e reprovou fica
    sem marca, e o perfil segue mostrando aquele saldo, que e' a verdade: aquela peca
    ainda nao esta' na mao.
    """
    reg = ler(LOTE, {}).get("itens", [])
    aprovados = {x["arquivo"] for x in ler(LIMPEZA, {}).get("laudos", []) if x.get("limpo")}
    feitos = ler(BAIXADOS, {})
    marcados = 0
    for i in reg:
        if entregue and i.get("arquivo_local") in aprovados:
            feitos.setdefault(i["conta"], [])
            if i["codigo"] not in feitos[i["conta"]]:
                feitos[i["conta"]].append(i["codigo"])
                marcados += 1
    escrever(BAIXADOS, feitos)

    d = ler(LIMPEZA, {})
    ok = len([x for x in d.get("laudos", []) if x.get("limpo")])
    capa(numero, estado="pronto" if entregue and ok else "falhou", fim=int(time.time()))
    passo(numero, "fim" if entregue and ok else "falha",
          f"Lote fechado: {ok} peças tratadas e entregues, {marcados} saíram da fileira."
          if entregue and ok else "Lote fechado sem entrega.")


if __name__ == "__main__":
    fase = sys.argv[1]
    numero = int(sys.argv[2])
    if fase == "abrir":
        abrir(numero, sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "")
    elif fase == "separar":
        separar(numero)
    elif fase == "baixado":
        baixado(numero)
    elif fase == "limpo":
        limpo(numero)
    elif fase == "fechar":
        fechar(numero, (sys.argv[3] if len(sys.argv) > 3 else "sim") == "sim")
    else:
        raise SystemExit(f"fase desconhecida: {fase}")
    # a selecao e' refeita depois da marca, senao a tela mostraria o saldo velho
    if fase == "fechar":
        subprocess.run([sys.executable, "selecionar.py"], capture_output=True)
    empurrar(f"lote {numero}: {fase}")
