"""As duas listas do sistema: os mercados e as etiquetas que existem.

POR QUE UMA LISTA PRÓPRIA, e não só o que já está em uso.
Até 19/08/2026 os dois filtros da aba de Baixar liam o que estivesse escrito nos perfis:
a lista de mercados era o conjunto dos mercados usados. Isso tem dois furos. Não dá para
criar um nome antes de usá-lo, então marcar o primeiro perfil de um nicho é digitar o
nome no escuro, sem lista, e "financas" e "finanças" viram dois nichos diferentes na
primeira letra errada. E não dá para apagar um nome: ele só some quando o último perfil
que o carrega for reescrito na mão.

Aqui as duas listas existem por si. Criar é criar, apagar é apagar, e marcar um perfil é
escolher de uma lista fechada.

APAGAR SEMPRE PODE, E A PERGUNTA É PARA ONDE VÃO OS PERFIS.
Esta regra é copiada do Social Tracker, onde ela nasceu de uma reclamação do Gabriel em
14/08: trancar um nome em uso não protege ninguém, só empurra o trabalho para fora da
tela. Quem quisesse apagar um mercado teria que reabrir perfil por perfil, tirar o nome
de cada um, e voltar. Aqui o destino é escolhido junto com a remoção:

    um nome    os perfis passam para esse mercado, ou ganham essa etiqueta
    vazio      ficam sem mercado, ou perdem a etiqueta

E as duas devolvem quantos perfis foram mexidos, porque "apagado" sem número não conta o
que aconteceu de verdade.

O PEDIDO VIAJA EM TEXTO SIMPLES, pelo mesmo canal do lote, pelo mesmo motivo de sempre:
a ponte entre a tela e a esteira só deixa passar um campo.

    catalogo:criar|nicho|luxo
    catalogo:criar|etiqueta|referencia
    catalogo:remover|nicho|luxo|moda        (os perfis de "luxo" passam para "moda")
    catalogo:remover|etiqueta|hot|          (os perfis simplesmente perdem "hot")
"""
from __future__ import annotations

import json
import sys
import os
import time
from pathlib import Path

PASTA = Path("dados/perfis")
ARQUIVO = Path("dados/catalogo.json")
MARCA = "catalogo:"

# O MESMO TETO DO SISTEMA DE ORIGEM. Nome de nicho é rótulo de coluna e de pastilha:
# passando disso ele para de caber em qualquer lugar onde vai aparecer.
LIMITE = 28
OS_DOIS = ("nicho", "etiqueta")


def vazio() -> dict:
    return {"nichos": [], "etiquetas": [], "atualizado": int(time.time())}


def ler() -> dict:
    if not ARQUIVO.exists():
        return vazio()
    try:
        d = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    except Exception:
        # CATALOGO ILEGIVEL NAO VIRA CATALOGO VAZIO EM SILENCIO: a proxima gravacao
        # apagaria todos os nomes criados por causa de um arquivo truncado. A copia
        # fica guardada ao lado e o aviso sai em voz alta; os nomes em uso voltam
        # pelo sincronizar (auditoria de 25/08/2026).
        try:
            ARQUIVO.replace(ARQUIVO.with_suffix(".json.bak"))
            print(f"AVISO: o catalogo estava ilegivel; guardei a copia em "
                  f"{ARQUIVO.name}.bak e recomeco. Rode o sincronizar para "
                  "recuperar os nomes em uso.")
        except OSError:
            pass
        return vazio()
    d.setdefault("nichos", [])
    d.setdefault("etiquetas", [])
    return d


def gravar(d: dict) -> None:
    d["atualizado"] = int(time.time())
    ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
    # ESCRITA ATOMICA: queda no meio de um write_text truncava o catalogo, e a
    # leitura seguinte o daria como vazio, levando os nomes embora.
    tmp = ARQUIVO.with_name(ARQUIVO.name + ".novo")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, ARQUIVO)


def normal(nome: str) -> str:
    """O nome como ele vai ficar gravado.

    Os dois separadores saem porque um nome com barra parte o pedido em dois. Espaço
    repetido some porque "luxo  " e "luxo" não podem ser dois nichos.
    """
    limpo = (nome or "").replace("|", " ").replace(";", " ")
    return " ".join(limpo.split())[:LIMITE]


def chave(nome: str) -> str:
    """Duas escritas do mesmo nome dão a mesma chave: é o que impede o par repetido."""
    return normal(nome).casefold()


def caixa(d: dict, o_que: str) -> list:
    return d["nichos" if o_que == "nicho" else "etiquetas"]


def perfis() -> list[Path]:
    return sorted(PASTA.glob("*.json")) if PASTA.exists() else []


def em_uso() -> tuple[dict, dict]:
    """Quantos perfis carregam cada nome hoje. Sem isto, apagar é apagar às cegas."""
    nichos: dict[str, int] = {}
    etiquetas: dict[str, int] = {}
    for arq in perfis():
        try:
            p = (json.loads(arq.read_text(encoding="utf-8")).get("perfil") or {})
        except Exception:
            continue
        if p.get("mercado"):
            k = chave(p["mercado"])
            nichos[k] = nichos.get(k, 0) + 1
        for e in (p.get("etiquetas") or []):
            k = chave(e)
            etiquetas[k] = etiquetas.get(k, 0) + 1
    return nichos, etiquetas


def com_uso(d: dict | None = None) -> dict:
    """As duas listas prontas para a tela, cada nome com quantos perfis o carregam."""
    d = d or ler()
    un, ue = em_uso()
    return {
        "nichos": [{**x, "perfis": un.get(chave(x["nome"]), 0)}
                   for x in sorted(d["nichos"], key=lambda x: x["nome"].casefold())],
        "etiquetas": [{**x, "perfis": ue.get(chave(x["nome"]), 0)}
                      for x in sorted(d["etiquetas"], key=lambda x: x["nome"].casefold())],
        "atualizado": d.get("atualizado"),
    }


def adotar(d: dict, o_que: str, nome: str) -> bool:
    """Põe na lista um nome que já está sendo usado e ainda não estava cadastrado.

    ISTO É REDE, E NÃO ATALHO. A marcação de um perfil e o catálogo são escritos por
    caminhos diferentes, e basta um pedido antigo, um arquivo editado na mão ou uma
    ordem invertida para existir um perfil apontando para um nome que a lista não tem.
    Nesse caso a tela mostraria a marcação do perfil e não teria como reproduzi-la.
    """
    lista = caixa(d, o_que)
    k = chave(nome)
    if not k or any(chave(x["nome"]) == k for x in lista):
        return False
    lista.append({"nome": normal(nome), "criado": int(time.time())})
    return True


def sincronizar() -> int:
    """Adota tudo o que está em uso e não está na lista. Devolve quantos entraram."""
    d = ler()
    novos = 0
    for arq in perfis():
        try:
            p = (json.loads(arq.read_text(encoding="utf-8")).get("perfil") or {})
        except Exception:
            continue
        if p.get("mercado"):
            novos += adotar(d, "nicho", p["mercado"])
        for e in (p.get("etiquetas") or []):
            novos += adotar(d, "etiqueta", e)
    if novos:
        gravar(d)
    return novos


def criar(o_que: str, nome: str) -> dict:
    nome = normal(nome)
    if not nome:
        return {"ok": False, "motivo": "escreva um nome primeiro."}
    d = ler()
    lista = caixa(d, o_que)
    igual = [x for x in lista if chave(x["nome"]) == chave(nome)]
    if igual:
        return {"ok": False, "motivo": f"“{igual[0]['nome']}” já está na lista."}
    lista.append({"nome": nome, "criado": int(time.time())})
    gravar(d)
    return {"ok": True, "nome": nome}


def remover(o_que: str, nome: str, destino: str | None) -> dict:
    """Apaga o nome e resolve o destino dos perfis que estavam nele."""
    d = ler()
    lista = caixa(d, o_que)
    achado = [x for x in lista if chave(x["nome"]) == chave(nome)]
    if not achado:
        return {"ok": False, "motivo": f"“{nome}” não está na lista."}

    destino = normal(destino or "")
    if destino and chave(destino) == chave(nome):
        return {"ok": False, "motivo": "o destino é o próprio nome que vai sumir."}
    if destino and not any(chave(x["nome"]) == chave(destino) for x in lista):
        return {"ok": False, "motivo": f"“{destino}” não está na lista."}

    movidos = mexer_nos_perfis(o_que, achado[0]["nome"], destino)
    d["nichos" if o_que == "nicho" else "etiquetas"] = [
        x for x in lista if chave(x["nome"]) != chave(nome)]
    gravar(d)
    return {"ok": True, "nome": achado[0]["nome"], "destino": destino,
            "movidos": movidos}


def mexer_nos_perfis(o_que: str, nome: str, destino: str) -> int:
    """Reescreve os perfis que carregam o nome que está sendo apagado."""
    k, mexidos = chave(nome), 0
    for arq in perfis():
        try:
            dados = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            continue
        p = dados.get("perfil") or {}
        se_mexeu = False

        if o_que == "nicho":
            if p.get("mercado") and chave(p["mercado"]) == k:
                p["mercado"] = destino or None
                se_mexeu = True
        else:
            etqs = p.get("etiquetas") or []
            if any(chave(e) == k for e in etqs):
                restantes = [e for e in etqs if chave(e) != k]
                if destino and not any(chave(e) == chave(destino) for e in restantes):
                    restantes.append(destino)
                p["etiquetas"] = sorted(dict.fromkeys(restantes))
                se_mexeu = True

        if se_mexeu:
            arq.write_text(json.dumps(dados, ensure_ascii=False, indent=1),
                           encoding="utf-8")
            mexidos += 1
    return mexidos


def aplicar(cru: str) -> int:
    if not cru.startswith(MARCA):
        print("este pedido nao e' de catalogo.")
        return 1

    # O CAMPO DE DESTINO PODE VIR VAZIO E ISSO TEM SIGNIFICADO: quer dizer "deixar sem".
    # Por isso a divisao pede quatro pedacos e completa com vazio, em vez de descartar o
    # que estiver em branco no fim.
    partes = (cru[len(MARCA):].split("|") + ["", "", ""])[:4]
    acao, o_que, nome, destino = (partes[0].strip().lower(),
                                  partes[1].strip().lower(), partes[2], partes[3])

    if o_que not in OS_DOIS:
        print(f"nao sei o que e' [{o_que}]: so' existe nicho e etiqueta.")
        return 1

    if acao == "criar":
        r = criar(o_que, nome)
    elif acao == "remover":
        r = remover(o_que, nome, destino)
    else:
        print(f"acao desconhecida: [{acao}]")
        return 1

    if not r["ok"]:
        print(f"recusado: {r['motivo']}")
        return 1

    if acao == "criar":
        print(f"criado: {o_que} [{r['nome']}]")
    else:
        para = f"para [{r['destino']}]" if r["destino"] else "sem destino"
        print(f"apagado: {o_que} [{r['nome']}] | {r['movidos']} perfil(is) {para}")
    return 0


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "sincronizar":
        n = sincronizar()
        print(f"catalogo sincronizado: {n} nome(s) adotado(s) do que ja' estava em uso.")
        raise SystemExit(0)
    raise SystemExit(aplicar(arg))
