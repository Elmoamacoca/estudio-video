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
# QUEM REPROVOU NA LIMPEZA NAO VOLTA PARA A FILEIRA. Ver `fechar()` para o porque.
REPROVADOS = Path("dados/reprovados.json")
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

def por_conta(numero: int, tipo: str, conta: str, texto: str, **extra) -> None:
    """Um passo POR CONTA, e o mesmo passo se atualiza enquanto aquela conta anda.

    Sem isto, o avanco de uma conta com duzentos arquivos viraria duzentas linhas no
    registro. Aqui a linha daquela conta e' uma so' e o numero dentro dela sobe.
    """
    d = ler(diario(numero), {"numero": numero, "passos": []})
    linha = next((x for x in d["passos"]
                  if x.get("tipo") == tipo and x.get("conta") == conta), None)
    if linha:
        linha.update({"quando": int(time.time()), "texto": texto, **extra})
    else:
        d["passos"].append({"quando": int(time.time()), "tipo": tipo, "conta": conta,
                            "texto": texto, **extra})
    escrever(diario(numero), d)


# O AVANCO DE UMA CONTA NAO E' GRAVADO A CADA ARQUIVO.
# Gravar significa empurrar para o acervo, e empurrar duzentas e cinquenta vezes numa
# leva grande custaria mais tempo do que a propria baixa. A cada quinze segundos o numero
# sobe na tela, que ja' e' mais rapido do que qualquer um consegue ler.
INTERVALO = 15
_ultimo: dict[str, float] = {}


def andamento(numero: int, conta: str, feitos: int, total: int, fim: bool = False) -> None:
    agora = time.time()
    if not fim and agora - _ultimo.get(conta, 0) < INTERVALO:
        return
    _ultimo[conta] = agora
    por_conta(numero, "baixa", conta,
              f"{feitos} de {total} baixados." + (" Conta concluída." if fim else ""),
              feitos=feitos, total=total, concluida=fim)
    empurrar(f"leva {numero}: baixa de @{conta}")


def abrir(numero: int, execucao: str, pedido: str) -> None:
    contas = [] if not pedido or pedido.isdigit() else \
        [c.strip().lstrip("@") for c in pedido.split(",") if c.strip()]
    capa(numero, execucao=execucao, contas=contas, estado="em curso")
    # OS NOMES INTEIROS, e nao "3 perfis". Se foram cinquenta, saem os cinquenta: quem
    # abre o registro quer saber de quais contas aquela leva e' feita, e contagem nao
    # responde isso.
    passo(numero, "escolha",
          ("Escolhidos: @" + ", @".join(contas)) if contas
          else f"Escolhidos: os {pedido or 300} melhores de todos os perfis.",
          contas=contas)


def separar(numero: int) -> None:
    sel = ler(Path("dados/selecao.json"), {})
    passo(numero, "selecao",
          f"Régua aplicada: {sel.get('avaliados', 0)} avaliados, "
          f"{len(sel.get('itens', []))} acima da régua.")


def baixado(numero: int) -> None:
    """Fecha a fase de baixa: so' atualiza a capa, porque as linhas ja' foram escritas
    uma por conta enquanto o trabalho andava."""
    reg = ler(LOTE, {}).get("itens", [])
    mb = round(sum(i.get("bytes", 0) for i in reg) / 1048576)
    capa(numero, baixados=len(reg), mb=mb)


def limpo(numero: int) -> None:
    """Uma linha de tratamento POR CONTA, e nao uma linha para a leva inteira.

    De quem e' cada arquivo sai do registro da baixa, que guarda conta e nome do arquivo.
    Sem esse cruzamento so' restaria adivinhar pelo nome, e nome de arquivo e' convencao
    que muda.
    """
    laudos = ler(LIMPEZA, {}).get("laudos", [])
    dono = {i.get("arquivo_local"): i["conta"] for i in ler(LOTE, {}).get("itens", [])}
    ok = [x for x in laudos if x.get("limpo")]
    mau = [x for x in laudos if not x.get("limpo")]
    capa(numero, limpos=len(ok), reprovados=len(mau))

    contas = {}
    for x in laudos:
        c = dono.get(x["arquivo"], "sem conta")
        d = contas.setdefault(c, {"ok": 0, "mau": []})
        if x.get("limpo"):
            d["ok"] += 1
        else:
            d["mau"].append(x["arquivo"])

    for conta, d in sorted(contas.items()):
        por_conta(numero, "falha" if d["mau"] else "limpeza", conta,
                  f"{d['ok']} tratado{'' if d['ok'] == 1 else 's'}"
                  + (f", {len(d['mau'])} reprovado{'' if len(d['mau']) == 1 else 's'}"
                     " e fora da leva." if d["mau"] else "."),
                  aprovados=d["ok"], reprovados=len(d["mau"]))


def fechar(numero: int, entregue: bool) -> None:
    """Marca o que foi entregue e fecha o lote.

    SO' O QUE PASSOU NA LIMPEZA CONTA COMO ENTREGUE, e o que reprovou vai para uma lista
    propria, de onde nunca mais sai.

    A PRIMEIRA VERSAO DEIXAVA O REPROVADO SEM MARCA NENHUMA, com o argumento de que aquela
    peca "ainda nao esta' na mao" e por isso o perfil devia seguir mostrando o saldo. O
    argumento estava errado na pratica: sem marca, o reel volta para a fileira, e a esteira
    baixa e reprova o mesmo arquivo de novo, todas as vezes, para sempre. Aconteceu com
    cinco reels do `thenews.business` na leva 29: os 112 baixados viraram 107 limpos, e os
    cinco reprovados continuaram aparecendo como disponiveis.

    A reprovacao aqui e' da auditoria de limpeza, que e' deterministica: o mesmo arquivo
    reprova de novo. Repetir o download nao muda o resultado, so' gasta.
    """
    reg = ler(LOTE, {}).get("itens", [])
    laudos = ler(LIMPEZA, {}).get("laudos", [])
    aprovados = {x["arquivo"] for x in laudos if x.get("limpo")}
    caidos = {x["arquivo"] for x in laudos if not x.get("limpo")}
    feitos = ler(BAIXADOS, {})
    maus = ler(REPROVADOS, {})
    marcados = 0
    for i in reg:
        local = i.get("arquivo_local")
        if entregue and local in aprovados:
            feitos.setdefault(i["conta"], [])
            if i["codigo"] not in feitos[i["conta"]]:
                feitos[i["conta"]].append(i["codigo"])
                marcados += 1
        elif local in caidos:
            maus.setdefault(i["conta"], [])
            if i["codigo"] not in maus[i["conta"]]:
                maus[i["conta"]].append(i["codigo"])
    escrever(BAIXADOS, feitos)
    escrever(REPROVADOS, maus)

    d = ler(LIMPEZA, {})
    ok = len([x for x in d.get("laudos", []) if x.get("limpo")])
    capa(numero, estado="pronto" if entregue and ok else "falhou", fim=int(time.time()))
    passo(numero, "fim" if entregue and ok else "falha",
          f"Leva entregue: {ok} peças tratadas, {marcados} saíram da fileira."
          if entregue and ok else "Leva fechada sem entrega.")


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
    elif fase == "passo":
        # UM PASSO SOLTO, escrito pela propria esteira. Serve para as esperas que nao
        # sao fase de trabalho e mesmo assim demoram: preparar a ferramenta, subir o
        # pacote. Sem isto, esses minutos passam sem uma linha na tela.
        passo(numero, sys.argv[3], " ".join(sys.argv[4:]))
    else:
        raise SystemExit(f"fase desconhecida: {fase}")
    # a selecao e' refeita depois da marca, senao a tela mostraria o saldo velho
    if fase == "fechar":
        subprocess.run([sys.executable, "selecionar.py"], capture_output=True)
    empurrar(f"leva {numero}: {fase}")
