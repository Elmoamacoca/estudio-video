"""O livro de atividade: um arquivo por perfil, guardado no acervo para sempre.

POR QUE ISTO EXISTE:
o registro da tela vivia na memória do navegador e sumia ao recarregar a página. O
Gabriel precisa do contrário: abrir daqui a noventa dias e ver tudo o que foi feito com
cada perfil, desde o primeiro. Isso é dado, e dado não pode se perder.

ONDE FICA, E POR QUE ASSIM:
  dados/atividade/<conta>.json   o histórico daquele perfil, evento por evento
  dados/atividade/indice.json    a capa: um resumo por perfil, para a tela abrir rápido

UM ARQUIVO POR PERFIL, e não um arquivão só. Três razões, todas medidas neste projeto:
  1. a via de leitura do acervo devolve conteúdo VAZIO acima de 1 MB, e foi isso que
     quebrou o salvar quando o arquivo do boletimdamorte passou de 1,4 MB;
  2. a tela abre mostrando dez cartões e só busca o histórico do perfil que for aberto,
     então carregar a lista custa um arquivo pequeno em vez de três anos de log;
  3. um perfil não some nem é reescrito quando outro é varrido.

QUEM ESCREVE É UMA MÁQUINA SÓ, o trabalho de fechamento da rodada. Vinte vagas gravando
o mesmo arquivo dariam conflito; uma só, depois que todas terminaram, não dá.
"""
from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

PASTA = Path("dados/atividade")
PERFIS = Path("dados/perfis")

# Os tipos de evento, e a gravidade de cada um na tela. As três gravidades são as mesmas
# do console: falha é o que não devia ter acontecido, aviso é o que foi barrado de
# propósito, evento é o andamento normal.
GRAVIDADE = {
    "aguardando": "aviso",
    "vazio": "aviso",
    "identificado": "evento",
    "varredura": "evento",
    "concluido": "evento",
    "limite": "aviso",
    "sem_avanco": "falha",
    "lote": "evento",
}


def mil(n) -> str:
    """Número com ponto de milhar.

    A troca de vírgula por ponto era feita na FRASE INTEIRA, e comia a vírgula do texto:
    "281 de 286, o resto exige sessão" virava "286. o resto exige sessão". Aqui a troca
    acontece só dentro do número.
    """
    return f"{int(n or 0):,}".replace(",", ".")


def caminho(conta: str) -> Path:
    return PASTA / f"{conta}.json"


def carregar(conta: str) -> dict:
    p = caminho(conta)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"conta": conta, "nome": None, "eventos": []}


def gravar(livro: dict) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    caminho(livro["conta"]).write_text(
        json.dumps(livro, ensure_ascii=False, indent=1), encoding="utf-8")


def anotar(livro: dict, tipo: str, quando: int, texto: str, **detalhe) -> None:
    livro["eventos"].append({
        "quando": int(quando),
        "tipo": tipo,
        "gravidade": GRAVIDADE.get(tipo, "evento"),
        "texto": texto,
        **({"detalhe": detalhe} if detalhe else {}),
    })


def gravacoes(conta: str, depois: int) -> list[tuple[int, str]]:
    """As gravações do arquivo daquele perfil, do momento pedido para cá.

    É daqui que sai o "quantas máquinas trabalharam nele": cada vaga que leu uma página
    gravou um commit no arquivo do perfil, com a hora. Não é estimativa.
    """
    # `--since=@0` não devolve nada: o git trata o zero como "sem corte válido" e some
    # com o histórico inteiro. Quando não há marco anterior, a busca vai sem corte.
    cmd = ["git", "log", "--format=%at\t%s"]
    if depois > 0:
        cmd.append(f"--since=@{depois}")
    cmd += ["--", str(PERFIS / f"{conta}.json")]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    saida = []
    for linha in r.stdout.splitlines():
        if "\t" in linha:
            quando, assunto = linha.split("\t", 1)
            try:
                saida.append((int(quando), assunto.strip()))
            except ValueError:
                pass
    return sorted(saida)


def ultimo_total(livro: dict) -> int:
    """Quantos posts este livro já registrou. É a régua do que é novo."""
    for e in reversed(livro["eventos"]):
        d = e.get("detalhe") or {}
        if "total" in d:
            return int(d["total"] or 0)
    return 0


FONTES = Path("dados/fontes.json")


def contas_na_lista() -> list[str]:
    if not FONTES.exists():
        return []
    try:
        d = json.loads(FONTES.read_text(encoding="utf-8"))
    except Exception:
        return []
    return [str(c).strip().lstrip("@") for c in (d.get("contas") or []) if str(c).strip()]


def registrar_espera(agora: int) -> int:
    """Abre ficha para quem entrou na lista e o Instagram ainda nao deixou identificar.

    POR QUE ISTO EXISTE: a ficha de um perfil so nascia depois que o Instagram
    confirmasse quem ele e'. So que a recusa e' comum, porque o limite e' por endereco
    de saida. O perfil entrava na lista, a tela nao mostrava cartao nenhum, e a leitura
    inevitavel era que nada tinha acontecido. Aconteceu: ele esta na fila, e a espera
    agora fica escrita, com hora, e sobrevive ao fechar da tela.

    A ficha nao se repete: uma vez aberta, so ganha evento novo quando a situacao muda.
    """
    entraram = 0
    for conta in contas_na_lista():
        if (PERFIS / f"{conta}.json").exists():
            continue
        livro = carregar(conta)
        if livro["eventos"]:
            continue
        anotar(livro, "aguardando", agora,
               "Perfil na fila de origem, esperando a esteira abrir pelo arroba")
        gravar(livro)
        entraram += 1
    return entraram


def registrar_rodada(rodada: int | None = None) -> int:
    """Anota o que esta rodada fez com cada perfil. Devolve quantos eventos entraram."""
    agora = int(time.time())
    entraram = registrar_espera(agora)
    if not PERFIS.exists():
        reconstruir_indice()
        return entraram

    for arq in sorted(PERFIS.glob("*.json")):
        conta = arq.stem
        try:
            estado = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            continue

        livro = carregar(conta)
        perfil = estado.get("perfil") or {}
        livro["nome"] = perfil.get("nome") or livro.get("nome")

        lidos = len(estado.get("posts") or [])
        publicacoes = perfil.get("publicacoes") or 0

        # PRIMEIRA VEZ: o perfil acabou de entrar no banco.
        # A pergunta e' se JA' FOI IDENTIFICADO, e nao se o livro esta' vazio: quem
        # passou pela espera ja' tem um evento escrito, e com a pergunta antiga a
        # identificacao dele nunca seria registrada.
        # CONTA FECHADA OU SEM POST tem evento proprio, e nao vira "identificado" com
        # zero em tudo: quem le a ficha precisa saber que nao ha o que varrer ali.
        if estado.get("vazio"):
            if not any(e["tipo"] == "vazio" for e in livro["eventos"]):
                anotar(livro, "vazio", estado.get("atualizado") or agora,
                       "Sem posts públicos: conta fechada ou sem publicação. "
                       "Nada a varredura aqui.", total=0)
                entraram += 1
            if livro["eventos"]:
                gravar(livro)
            continue

        if not any(e["tipo"] == "identificado" for e in livro["eventos"]):
            # SEM O TOTAL, NAO SE INVENTA O TOTAL. O caminho que abre o perfil nao
            # informa quantas publicacoes a conta tem, e escrever "0 publicacoes" seria
            # a ficha nascendo com uma informacao falsa.
            anotar(livro, "identificado",
                   estado.get("atualizado") or agora,
                   f"Perfil aberto no Instagram: {mil(publicacoes)} publicações"
                   if publicacoes else
                   f"Perfil aberto no Instagram: {mil(lidos)} posts na primeira leitura",
                   publicacoes=publicacoes or None,
                   seguidores=perfil.get("seguidores") or None, total=lidos)
            entraram += 1

        antes = ultimo_total(livro)
        desde = livro["eventos"][-1]["quando"] if livro["eventos"] else 0
        marcas = gravacoes(conta, desde)

        if lidos > antes:
            maquinas = len({a for _, a in marcas if a.startswith(("vaga", "elo"))})
            anotar(livro, "varredura", agora,
                   f"Varredura: {lidos - antes} posts novos, "
                   f"{mil(lidos)} de {mil(publicacoes)} lidos",
                   rodada=rodada, maquinas=maquinas or None,
                   gravacoes=len(marcas) or None,
                   novos=lidos - antes, total=lidos, publicacoes=publicacoes)
            entraram += 1
        elif marcas and not estado.get("completo"):
            # A ESTEIRA MEXEU NO ARQUIVO E NÃO TROUXE POST. É o caso de erro: o Instagram
            # recusou a leitura naquele endereço, e a vaga saiu de mãos vazias.
            anotar(livro, "sem_avanco", agora,
                   "Rodada sem avanço: o Instagram recusou a leitura neste endereço",
                   rodada=rodada, gravacoes=len(marcas), total=lidos)
            entraram += 1

        # O FECHAMENTO, uma vez só. "Até o limite" não é conclusão limpa: o Instagram
        # corta a leitura anônima por profundidade, e o que sobrou de histórico ficou
        # fora do alcance. Isso é aviso, e não sucesso.
        ja_fechou = any(e["tipo"] in ("concluido", "limite") for e in livro["eventos"])
        if estado.get("completo") and not ja_fechou:
            parcial = publicacoes and lidos < publicacoes
            if parcial:
                anotar(livro, "limite", agora,
                       f"Varredura fechada no limite do Instagram: {mil(lidos)} de "
                       f"{mil(publicacoes)}, o resto exige sessão",
                       total=lidos, publicacoes=publicacoes)
            else:
                anotar(livro, "concluido", agora,
                       f"Varredura concluída: {mil(lidos)} posts",
                       total=lidos, publicacoes=publicacoes)
            entraram += 1

        if livro["eventos"]:
            gravar(livro)

    reconstruir_indice()
    return entraram


def reconstruir_indice() -> dict:
    """A capa da lista: um resumo por perfil, do mais recente para o mais antigo."""
    contas = []
    if not PASTA.exists():
        PASTA.mkdir(parents=True, exist_ok=True)
    for arq in sorted(PASTA.glob("*.json")):
        if arq.name == "indice.json":
            continue
        try:
            livro = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            continue
        ev = livro.get("eventos") or []
        if not ev:
            continue
        estado_perfil = {}
        pa = PERFIS / f"{livro['conta']}.json"
        if pa.exists():
            try:
                d = json.loads(pa.read_text(encoding="utf-8"))
                estado_perfil = {
                    "lidos": len(d.get("posts") or []),
                    "publicacoes": (d.get("perfil") or {}).get("publicacoes") or 0,
                    "completo": bool(d.get("completo")),
                }
            except Exception:
                pass
        contas.append({
            "conta": livro["conta"],
            "nome": livro.get("nome"),
            "primeiro": ev[0]["quando"],
            "ultimo": ev[-1]["quando"],
            "eventos": len(ev),
            "falhas": sum(1 for e in ev if e["gravidade"] == "falha"),
            "avisos": sum(1 for e in ev if e["gravidade"] == "aviso"),
            "ultimo_tipo": ev[-1]["tipo"],
            **estado_perfil,
        })
    contas.sort(key=lambda c: c["ultimo"], reverse=True)
    indice = {"contas": contas, "atualizado": int(time.time())}
    PASTA.mkdir(parents=True, exist_ok=True)
    (PASTA / "indice.json").write_text(
        json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")
    return indice


def semear() -> int:
    """Reconstrói o passado a partir do histórico de gravação do acervo.

    Roda uma vez, para a lista não nascer vazia. Cada vaga que leu uma página deixou um
    commit no arquivo do perfil, com data e nome: isso é registro de verdade, e dá as
    datas, as rodadas e quantas máquinas trabalharam em cada uma.

    O QUE NÃO DÁ PARA RECUPERAR é quantos posts entraram em cada rodada daquelas: saber
    isso exigiria baixar as 258 versões de um arquivo de 1,4 MB. Então o evento histórico
    diz o que se sabe, e o total só é carimbado no último, que é o que a régua do que é
    novo precisa. Daqui em diante tudo é anotado inteiro, rodada a rodada.
    """
    INTERVALO = 900          # 15 minutos de silêncio fecham uma rodada
    feitos = 0
    for arq in sorted(PERFIS.glob("*.json")):
        conta = arq.stem
        if caminho(conta).exists():
            continue
        try:
            estado = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            continue

        marcas = gravacoes(conta, 0)
        if not marcas:
            continue

        perfil = estado.get("perfil") or {}
        livro = {"conta": conta, "nome": perfil.get("nome"), "eventos": []}
        publicacoes = perfil.get("publicacoes") or 0
        lidos = len(estado.get("posts") or [])

        anotar(livro, "identificado", marcas[0][0],
               f"Perfil identificado no Instagram: {mil(publicacoes)} publicações",
               publicacoes=publicacoes, seguidores=perfil.get("seguidores"),
               total=0, origem="histórico")

        grupos, atual = [], [marcas[0]]
        for m in marcas[1:]:
            if m[0] - atual[-1][0] > INTERVALO:
                grupos.append(atual); atual = [m]
            else:
                atual.append(m)
        grupos.append(atual)

        for i, g in enumerate(grupos):
            ultimo = i == len(grupos) - 1
            maquinas = len({a for _, a in g})
            anotar(livro, "varredura", g[-1][0],
                   f"Varredura: {len(g)} "
                   + ("página lida" if len(g) == 1 else "páginas lidas")
                   + f" por {maquinas} "
                   + ("máquina" if maquinas == 1 else "máquinas"),
                   gravacoes=len(g), maquinas=maquinas, origem="histórico",
                   **({"total": lidos, "publicacoes": publicacoes} if ultimo else {}))

        if estado.get("completo"):
            parcial = publicacoes and lidos < publicacoes
            anotar(livro, "limite" if parcial else "concluido", marcas[-1][0],
                   (f"Varredura fechada no limite do Instagram: {mil(lidos)} de "
                    f"{mil(publicacoes)}, o resto exige sessão" if parcial
                    else f"Varredura concluída: {mil(lidos)} posts"),
                   total=lidos, publicacoes=publicacoes, origem="histórico")

        gravar(livro)
        feitos += 1
        print(f"  {conta}: {len(livro['eventos'])} eventos reconstruídos "
              f"de {len(marcas)} gravações")
    reconstruir_indice()
    return feitos


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "semear":
        print(f"atividade: {semear()} perfis reconstruídos")
    else:
        n = registrar_rodada(int(sys.argv[1]) if len(sys.argv) > 1 else None)
        print(f"atividade: {n} eventos novos")
