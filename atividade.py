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
    "alvo": "evento",
    "identificado": "evento",
    "varredura": "evento",
    "concluido": "evento",
    "limite": "aviso",
    "sem_avanco": "aviso",
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
REGUA = Path("dados/regua.json")
TODOS = {"reels", "post", "carrossel"}
NOMES = {"reels": "reels", "post": "posts isolados", "carrossel": "carrosséis"}


def regua() -> dict:
    if not REGUA.exists():
        return {}
    try:
        return json.loads(REGUA.read_text(encoding="utf-8"))
    except Exception:
        return {}


def rotulo() -> str:
    """Como a capa do livro chama o que foi guardado.

    A CAPA PRECISA DISSO tanto quanto o bilhete. Enquanto a varredura corre, a tela le'
    o bilhete e mostra "carrosseis"; quando a rodada fecha, ela passa a ler a capa, e a
    capa dizia "posts" contra o total de publicacoes do perfil. O cartao trocava de
    lingua sozinho no meio do caminho.
    """
    f = {x for x in (regua().get("formatos") or []) if x in TODOS} or set(TODOS)
    if f == TODOS:
        return "publicações"
    nomes = [NOMES[x] for x in ("reels", "carrossel", "post") if x in f]
    return nomes[0] if len(nomes) == 1 else " e ".join([", ".join(nomes[:-1]), nomes[-1]])


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
            # O EVENTO FALA NO FORMATO PEDIDO. Dizer "posts" numa varredura de
            # carrossel e' o mesmo defeito do cartao, so' que gravado para sempre no
            # historico: daqui a noventa dias a ficha continuaria mentindo.
            rot = rotulo()
            # CADA PAGINA LIDA VIRA UMA LINHA, com hora e maquina.
            #
            # O resumo por rodada dizia "24 novos, 4 maquinas" e mais nada: quem abria a
            # ficha via um numero, nao o trabalho. Estas marcas sao os commits reais do
            # arquivo do perfil, uma por leitura, com a hora exata e a vaga que gravou.
            # Nao e' estimativa: e' o registro do que aconteceu, e ele fica guardado.
            passos = [{"quando": q, "maquina": a} for q, a in marcas][-40:]
            anotar(livro, "varredura", agora,
                   f"Varredura: {lidos - antes} {rot} novos, "
                   + (f"{mil(lidos)} de {mil(publicacoes)} lidos" if publicacoes
                      else f"{mil(lidos)} no total"),
                   rodada=rodada, maquinas=maquinas or None,
                   gravacoes=len(marcas) or None, passos=passos or None,
                   novos=lidos - antes, total=lidos, publicacoes=publicacoes)
            entraram += 1
        elif marcas and not estado.get("completo"):
            # RODADA SEM AVANCO E' AVISO, E NAO FALHA.
            #
            # Cada maquina tem um endereco de saida proprio, e um endereco serve para uma
            # leitura. Quando ha' menos perfis do que vagas, varias vagas caem no mesmo
            # perfil e as ultimas voltam de maos vazias: e' o rodizio funcionando como
            # foi desenhado, nao defeito.
            #
            # Marcar isso como falha enchia a tela de vermelho num sistema que estava
            # trabalhando certo. Com dez perfis e vinte vagas, acontece em toda rodada.
            anotar(livro, "sem_avanco", agora,
                   "Rodada sem avanço nesta vaga: o endereço dela já tinha sido usado",
                   rodada=rodada, gravacoes=len(marcas), total=lidos)
            entraram += 1

        # O FECHAMENTO, uma vez só. "Até o limite" não é conclusão limpa: o Instagram
        # corta a leitura anônima por profundidade, e o que sobrou de histórico ficou
        # fora do alcance. Isso é aviso, e não sucesso.
        ja_fechou = any(e["tipo"] in ("concluido", "limite", "alvo")
                        for e in livro["eventos"])
        if estado.get("completo") and not ja_fechou:
            # PAROU PORQUE JA' TINHA O BASTANTE, e isso nao e' limite nem conclusao: e'
            # a escolha da tela sendo cumprida. Sem evento proprio, o perfil aparecia
            # como "fechado no limite do Instagram", que e' outra coisa e assusta.
            parada = estado.get("parou_no_alvo")
            if parada:
                # dois motivos possiveis, e a ficha diz qual foi: juntou o que se queria
                # daquele formato, ou bateu o teto de leitura antes disso
                p = parada if isinstance(parada, dict) else {}
                fmt = ", ".join(p.get("formatos") or []) or "todos os formatos"
                bateu_teto = p.get("lidos", lidos) >= (p.get("teto") or 0)
                anotar(livro, "alvo", agora,
                       (f"Parou no teto de leitura: {mil(lidos)} publicações lidas, "
                        f"{mil(p.get('do_formato') or 0)} de {fmt}")
                       if bateu_teto else
                       (f"Juntou o que foi pedido: {mil(p.get('do_formato') or 0)} de "
                        f"{fmt}, em {mil(lidos)} publicações lidas"),
                       total=lidos, **{k: v for k, v in p.items() if k != "formatos"})
                entraram += 1
                if livro["eventos"]:
                    gravar(livro)
                continue
            # COM FILTRO DE FORMATO, "menos que o total do perfil" e' o normal, e nao
            # limite. O @vinci.society tem 287 publicacoes e 106 reels: fechar em 106
            # numa varredura de reels quer dizer que acabaram os reels, e a ficha dizia
            # "fechada no limite do Instagram, o resto exige sessao", que e' outra coisa
            # e faz parecer que ficou material para tras.
            rot = rotulo()
            com_filtro = rot != "publicações"
            parcial = publicacoes and lidos < publicacoes and not com_filtro
            if com_filtro:
                anotar(livro, "concluido", agora,
                       f"Acabaram os {rot} deste perfil: {mil(lidos)} no total",
                       total=lidos, publicacoes=publicacoes)
            elif parcial:
                anotar(livro, "limite", agora,
                       f"Varredura fechada no limite do Instagram: {mil(lidos)} de "
                       f"{mil(publicacoes)}, o resto exige sessão",
                       total=lidos, publicacoes=publicacoes)
            else:
                anotar(livro, "concluido", agora,
                       f"Varredura concluída: {mil(lidos)} {rot}",
                       total=lidos, publicacoes=publicacoes)
            entraram += 1

        if livro["eventos"]:
            gravar(livro)

    reconstruir_indice()
    return entraram


def peso(evento: dict) -> str:
    """A gravidade de um evento, decidida pelo tipo dele."""
    return GRAVIDADE.get(evento.get("tipo"), evento.get("gravidade") or "evento")


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
        # o alvo entra como meta quando ha' filtro de formato: e' contra ele que a tela
        # compara, e nao contra o total de publicacoes do perfil, que nunca sera' lido
        rot = rotulo()
        if rot != "publicações" and estado_perfil:
            estado_perfil["publicacoes"] = int(regua().get("alvo") or 200)
        contas.append({
            "conta": livro["conta"],
            "nome": livro.get("nome"),
            "rotulo": rot,
            "primeiro": ev[0]["quando"],
            "ultimo": ev[-1]["quando"],
            "eventos": len(ev),
            # PELA TABELA DE AGORA, e nao pela marca que ficou escrita no evento. O
            # tipo e' o dado e nao muda; a gravidade e' opiniao sobre ele, e ja' mudou
            # uma vez. Lendo a marca antiga, o historico inteiro continuaria vermelho
            # depois da correcao.
            "falhas": sum(1 for e in ev if peso(e) == "falha"),
            "avisos": sum(1 for e in ev if peso(e) == "aviso"),
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
