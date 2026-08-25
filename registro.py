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
# O ENVIO E A CHEGADA SAO FATOS DIFERENTES, e ficam guardados separados.
# `baixados.json` tira o reel da fileira (e' o que o selecionar.py le'); `enviados.json`
# diz em qual pacote e quando ele subiu. A chegada de verdade e' o passo "guardado" que
# o guardar.py escreve no diario do lote quando o pacote desce para o computador. Sem
# essa separacao, o envio valia como entrega: o pacote vence em catorze dias, e vencer
# sem download deixava o reel "entregue" no papel e perdido de fato, para sempre.
ENVIADOS = Path("dados/enviados.json")
# O prazo de vida do pacote na esteira, o `retention-days: 14` do fluxo de baixa.
# Passado ele sem chegada, o envio nao vale mais nada e a vaga tem que voltar.
PRAZO_PACOTE = 14 * 24 * 3600
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
    """Grava no acervo agora, e nao no fim. Falha aqui nao derruba o lote.

    O REBASE QUE CONFLITA E' DESTRAVADO NA HORA, e isso e' conserto da auditoria de
    25/08/2026: a esteira e a leva reescrevem os mesmos arquivos de dados, e um
    `pull --rebase` parado em conflito deixava o repositorio PRESO em rebase; dai'
    em diante todo empurrao falhava em silencio, o diario calava e a leva seguinte
    rebaixava reels ja' entregues. Agora o conflito aborta o rebase e tenta de novo
    com espera; o commit local ja' foi feito, entao nada se perde: o proximo
    empurrao que passar leva tudo junto.
    """
    for cmd in (["git", "config", "user.name", "esteira"],
                ["git", "config", "user.email", "esteira@users.noreply.github.com"],
                ["git", "add", "dados/"],
                ["git", "commit", "-m", recado]):
        subprocess.run(cmd, capture_output=True, timeout=180)
    for volta in range(3):
        puxa = subprocess.run(["git", "pull", "--rebase", "--autostash",
                               "origin", "main"], capture_output=True, timeout=180)
        if puxa.returncode != 0:
            subprocess.run(["git", "rebase", "--abort"],
                           capture_output=True, timeout=60)
            time.sleep(1 + volta * 2)
            continue
        if subprocess.run(["git", "push"], capture_output=True,
                          timeout=180).returncode == 0:
            return
        time.sleep(1 + volta * 2)
    print(f"  (o acervo recusou o empurrao tres vezes: '{recado}' fica no commit "
          "local e sobe junto com o proximo que passar)")


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
    # A VARREDURA RODA ANTES DA SELECAO DESTA LEVA (o passo seguinte do fluxo roda o
    # selecionar.py): reel que subiu num pacote vencido sem chegar ao computador volta
    # para a fileira agora, senao a leva que esta' nascendo ja' nasce sem ele.
    varrer_vencidos()
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


def chegada(numero: int) -> int | None:
    """Quando o pacote daquele lote chegou ao computador, se chegou.

    A prova e' o passo "guardado" que o guardar.py escreve no diario do lote na hora
    do download. A data devolvida e' a do proprio passo, e nao a de agora: a marca de
    chegada tem que dizer quando o pacote desceu de verdade.
    """
    for p in ler(diario(numero), {}).get("passos", []):
        if p.get("tipo") == "guardado":
            return p.get("quando")
    return None


def varrer_vencidos() -> None:
    """Cruza envio com chegada e devolve para a fileira o que venceu sem descer.

    Reel enviado cujo lote ja' tem o passo "guardado" ganha a marca de chegada. Reel
    cujo pacote passou do prazo sem chegada perde a vaga em `baixados.json`: enviado
    nao e' entregue, e sem esta varredura o pacote vencido sem download deixava o reel
    contando como entregue e ele nunca mais descia. A marca "vencido" fica em
    `enviados.json` como historia, e e' sobrescrita se ele subir de novo num lote novo.
    """
    env = ler(ENVIADOS, {})
    if not env:
        return
    feitos = ler(BAIXADOS, {})
    agora = int(time.time())
    # a chegada de um lote vale para todos os reels dele; conferir uma vez por lote
    chegadas: dict = {}
    mexeu = False
    for conta, codigos in env.items():
        for codigo, marca in codigos.items():
            if not isinstance(marca, dict) or "guardado" in marca or "vencido" in marca:
                continue
            n = marca.get("lote")
            if n not in chegadas:
                chegadas[n] = chegada(n)
            if chegadas[n]:
                marca["guardado"] = chegadas[n]
                mexeu = True
            elif agora - marca.get("quando", agora) > PRAZO_PACOTE:
                marca["vencido"] = agora
                if codigo in feitos.get(conta, []):
                    feitos[conta].remove(codigo)
                mexeu = True
    if mexeu:
        escrever(ENVIADOS, env)
        escrever(BAIXADOS, feitos)


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

    E ENTREGUE AQUI E' O ENVIO, NAO A CHEGADA. Este passo roda logo depois de o pacote
    subir como artifact, que vence em catorze dias. Marcar so' `baixados.json` fazia o
    envio valer como chegada: pacote vencido sem download deixava o reel entregue no
    papel e perdido de fato. Por isso o envio tambem fica em `enviados.json` (qual lote,
    quando), e a `varrer_vencidos()` cruza isso com o passo "guardado" do diario para
    devolver a fileira o que venceu sem descer. A vaga em `baixados.json` continua sendo
    tomada ja' no envio, de proposito: enquanto o pacote vive, a leva seguinte nao deve
    baixar o mesmo reel de novo.
    """
    # a varredura vem antes de ler `baixados.json`, porque ela reescreve esse arquivo
    varrer_vencidos()
    reg = ler(LOTE, {}).get("itens", [])
    laudos = ler(LIMPEZA, {}).get("laudos", [])
    aprovados = {x["arquivo"] for x in laudos if x.get("limpo")}
    # FALHA DE AMBIENTE NAO E' REPROVA DE CONTEUDO. A reprova deterministica (sobra
    # de metadado, midia que mudou) bane o reel com razao: baixar de novo da' no
    # mesmo. Ja' a falha de ambiente (disco cheio, ffmpeg ausente) e' passageira, e
    # bani-la queimava reels bons para sempre por um aperto de disco (auditoria de
    # 25/08/2026). O laudo marca `ambiente` e o banimento pula essas pecas: elas
    # ficam sem marca nenhuma e voltam para a fileira sozinhas.
    caidos = {x["arquivo"] for x in laudos
              if not x.get("limpo") and not x.get("ambiente")}
    feitos = ler(BAIXADOS, {})
    maus = ler(REPROVADOS, {})
    env = ler(ENVIADOS, {})
    marcados = 0
    for i in reg:
        local = i.get("arquivo_local")
        if entregue and local in aprovados:
            feitos.setdefault(i["conta"], [])
            if i["codigo"] not in feitos[i["conta"]]:
                feitos[i["conta"]].append(i["codigo"])
                marcados += 1
            # O FATO HONESTO DO ENVIO, separado da chegada: qual pacote e quando. E'
            # esta marca que a varredura cruza com o passo "guardado" do diario; num
            # reenvio ela sobrescreve a marca vencida do lote anterior, que era o certo.
            env.setdefault(i["conta"], {})[i["codigo"]] = {
                "lote": numero, "quando": int(time.time())}
        elif local in caidos:
            maus.setdefault(i["conta"], [])
            if i["codigo"] not in maus[i["conta"]]:
                maus[i["conta"]].append(i["codigo"])
    escrever(BAIXADOS, feitos)
    escrever(REPROVADOS, maus)
    escrever(ENVIADOS, env)

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
