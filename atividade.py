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

# A CAIXA DE NOTAS DAS VAGAS (04/09/2026, espec cd-0-terreno).
#
# O cabeçalho acima diz "quem escreve é uma máquina só", e os ramos de falha da vaga
# desobedeciam isso desde 24/08: eles chamavam `gravar` direto, do meio da vaga. Com
# dois perfis na fila e vinte vagas, DEZ vagas caem no mesmo perfil por rodada
# (`posicao = (vaga - 1) % len(fila)`), e o perfil murado é justamente o que recebe as
# dez: dez máquinas reescrevendo o mesmo arquivo, disputando o mesmo galho.
#
# Cada vaga passa a deixar a nota num arquivo SÓ DELA, cujo nome traz a vaga, então
# não há dois escritores no mesmo caminho em momento nenhum. O fechamento da rodada,
# que é uma máquina depois de todas terem terminado, recolhe e aplica.
#
# E ISSO CONSERTA O CONTADOR DE GRAÇA: `seguidas` e `vagas` liam o último evento do
# livro, que num instante qualquer da rodada só conhece as vagas que já gravaram. No
# recolhimento a rodada inteira está sobre a mesa de uma vez.
NOTAS = Path("dados/notas")

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
    # OS RAMOS DE FALHA DA PROPRIA VAGA, escritos pelo rodada.py na hora em que doem.
    # Em 24/08/2026 a esteira falhou 26 rodadas seguidas e NADA apareceu na tela: a
    # falha total nao deixa marca no acervo, entao o fechamento nao tinha o que anotar.
    # A abertura que nao passa e o estouro sao falha, porque travam o perfil; a pagina
    # que nao veio e' aviso, porque o rodizio de enderecos torna isso rotina.
    "falha_abertura": "falha",
    "sem_leitura": "aviso",
    "estouro": "falha",
    # o vigia reapresentando perfil travado e' anomalia, nao andamento normal
    "vigia": "aviso",
}


def mil(n) -> str:
    """Número com ponto de milhar.

    A troca de vírgula por ponto era feita na FRASE INTEIRA, e comia a vírgula do texto:
    "281 de 286, o resto exige sessão" virava "286. o resto exige sessão". Aqui a troca
    acontece só dentro do número.
    """
    return f"{int(n or 0):,}".replace(",", ".")


def caminho(conta: str) -> Path:
    """O livro daquele perfil. O nome e' higienizado AQUI, que e' o portao de todos.

    `carregar` e `gravar` passam por esta funcao, entao fechar o buraco aqui fecha para
    quem chamar de onde for. Medido pelo `revisor-codigo` em 04/09/2026, com
    `../../FUGIU` no lugar do perfil: o livro foi escrito FORA da raiz do acervo.
    """
    seguro = conta_segura(conta)
    if not seguro:
        raise ValueError("nome de perfil vazio depois de higienizado")
    return PASTA / f"{seguro}.json"


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


def conta_segura(conta) -> str:
    """O nome de perfil reduzido ao que pode virar nome de arquivo. Vazio se não sobrar.

    ELA VALE NA IDA E NA VOLTA, e a primeira versão só valia na ida. O `revisor-codigo`
    mediu o buraco: o nome do ARQUIVO era higienizado e a conta ia CRUA dentro do corpo,
    o recolhimento usava a crua, e `carregar`/`gravar` montavam o caminho com ela. Com
    `../../FUGIU` no lugar do perfil, o livro foi escrito **fora da raiz do acervo**.

    O buraco é anterior a esta atividade (`rodada.contas_pedidas` só tira espaço e
    arroba), mas a docstring que nasceu aqui **afirmava que ele estava fechado**, citando
    a trava 73n pelo nome. Afirmar fechado o que está aberto é pior que o buraco.
    """
    return "".join(c for c in str(conta or "") if c.isalnum() or c in "._-")[:64]


def deixar_nota(conta: str, vaga: int, tipo: str, **campos) -> None:
    """A vaga deixa o que viu num arquivo só dela, e não no livro do perfil.

    O NOME CARREGA A VAGA **E A HORA**, e é isso que garante um escritor por caminho sem
    perder nada. Só com a vaga, o `revisor-codigo` mediu a perda: a nota de uma rodada
    não recolhida era sobrescrita pela da rodada seguinte, na mesma vaga, e o contador de
    "Nª Rodada Seguida" passava a **sub**contar. Basta o `git push` de uma vaga falhar
    uma vez, e o fluxo já engole essa falha de propósito.

    A GRAVAÇÃO É ATÔMICA (trava 8): escreve ao lado e troca de uma vez. A nota vai ao
    acervo pelo `git add dados/`, e nota lida pela metade viraria nota ilegível, que o
    recolhimento deixa parada para sempre.
    """
    seguro = conta_segura(conta)
    if not seguro:
        return
    NOTAS.mkdir(parents=True, exist_ok=True)
    p = NOTAS / f"{seguro}.{int(vaga)}.{int(time.time() * 1000)}.json"
    tmp = p.with_suffix(".novo")
    tmp.write_text(json.dumps(
        {"conta": seguro, "vaga": int(vaga), "tipo": tipo,
         "quando": int(time.time()), **campos},
        ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)


def ler_notas() -> list:
    """As notas das vagas, em ordem de quando aconteceram.

    ILEGÍVEL NÃO É AUSENTE (trava 3): nota que não deu para ler não vira lista vazia,
    ela é devolvida com `ilegivel` marcado, para quem recolhe não apagá-la calado. A
    ordem por `quando` importa porque `anotar_de_novo` colapsa o mesmo tropeço repetido,
    e colapsar fora de ordem escreveria a hora errada na linha.
    """
    if not NOTAS.exists():
        return []
    fora = []
    for p in sorted(NOTAS.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            # A CONTA E' HIGIENIZADA NA VOLTA TAMBEM, e nao so' na ida. Quem le' daqui
            # monta `dados/atividade/<conta>.json` com ela, e nota escrita por uma versao
            # antiga (ou por qualquer coisa que caia nesta pasta) traria a conta crua.
            if isinstance(d, dict) and conta_segura(d.get("conta")) and d.get("tipo"):
                d["conta"] = conta_segura(d["conta"])
                d["_arquivo"] = str(p)
                fora.append(d)
            else:
                fora.append({"_arquivo": str(p), "ilegivel": True})
        except Exception:
            fora.append({"_arquivo": str(p), "ilegivel": True})
    fora.sort(key=lambda d: int(d.get("quando") or 0))
    return fora


def apagar_nota(caminho: str) -> None:
    """A nota some depois de aplicada, e só depois.

    Apagar antes de aplicar perderia a única pista de por que um perfil parou; deixar
    depois de aplicada faria a rodada seguinte reaplicá-la para sempre, que é a trava 7
    vista do outro lado.
    """
    try:
        Path(caminho).unlink()
    except OSError:
        pass


def anotar(livro: dict, tipo: str, quando: int, texto: str, **detalhe) -> None:
    livro["eventos"].append({
        "quando": int(quando),
        "tipo": tipo,
        "gravidade": GRAVIDADE.get(tipo, "evento"),
        "texto": texto,
        **({"detalhe": detalhe} if detalhe else {}),
    })


def anotar_de_novo(livro: dict, tipo: str, quando: int, texto: str, **detalhe) -> None:
    """Como o anotar, mas o mesmo tropeço repetido atualiza a última linha em vez de
    empilhar outra.

    POR QUE: os ramos de falha escrevem a cada vaga, e são vinte vagas por rodada,
    quarenta e oito rodadas por dia. Uma linha por tentativa levaria o livro ao teto
    de 1 MB da via de leitura em poucos dias, o mesmo teto que já quebrou o salvar uma
    vez. Vale a regra da casa: a ficha só ganha linha nova quando a situação muda.
    Enquanto é o mesmo tropeço, a linha existente ganha a hora nova, o texto novo e o
    contador que sobe, então cada tentativa continua datada e visível.
    """
    ev = livro["eventos"]
    if ev and ev[-1].get("tipo") == tipo:
        e = ev[-1]
        e["quando"] = int(quando)
        e["texto"] = texto
        if detalhe:
            e["detalhe"] = {**(e.get("detalhe") or {}), **detalhe}
        return
    anotar(livro, tipo, quando, texto, **detalhe)


SAUDE = Path("dados/saude.json")


def anotar_saude(texto: str, **detalhe) -> None:
    """Falha que não tem perfil para chamar de seu fica na saúde geral, datada.

    É o destino do estouro que acontece antes de a vaga escolher um perfil: sem conta,
    não há livro onde escrever, e sem este arquivo a falha morria só no log do Actions.
    Ficam as últimas cinquenta, para o arquivo não crescer para sempre.
    """
    d = {"eventos": []}
    if SAUDE.exists():
        try:
            d = json.loads(SAUDE.read_text(encoding="utf-8"))
        except Exception:
            d = {"eventos": []}
    d["eventos"] = (d.get("eventos") or [])[-49:] + [{
        "quando": int(time.time()),
        "texto": texto,
        **({"detalhe": detalhe} if detalhe else {}),
    }]
    d["atualizado"] = int(time.time())
    SAUDE.parent.mkdir(parents=True, exist_ok=True)
    SAUDE.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


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


def rotulo_medido(posts: list) -> str:
    """Como chamar o que ESTE perfil tem, medido nos posts dele.

    O FALLBACK ANTIGO ERA A REGUA DE HOJE, e foi ele que pos na tela dele, em
    03/09/2026, a linha:

        "@leisdamentemilionaria - 395 CARROSSEIS, acabaram os CARROSSEIS do perfil"

    Aquele perfil tem 395 reels e ZERO carrossel. A ficha dele e' anterior ao campo
    `regua_da_epoca` (conferido: as chaves do topo sao perfil, marcador, completo,
    atualizado e marcador_reels, e nao ha' `regua_da_epoca`), entao a capa caia na regua
    ATUAL, que ele tinha acabado de marcar so' em carrossel. O comentario logo abaixo ja'
    previa esse caminho ("acervo antigo, sem o campo, cai na regua atual como antes") sem
    notar que ele nomeia o historico inteiro com a etiqueta errada.

    A RESPOSTA HONESTA NAO E' A REGUA DE HOJE NEM A DE ONTEM: e' o que esta' no disco.
    Ficha sem a regua da epoca ainda sabe dizer o que ela guarda, post por post, e e' a
    trava 2 aplicada ao rotulo: mede-se, nao se deduz.
    """
    tem = {x.get("formato") for x in (posts or [])} & TODOS
    if len(tem) != 1:
        # zero formatos (ficha vazia) ou mais de um: nenhum nome de formato e' verdade,
        # e a palavra neutra e' a unica que nao mente.
        return "publicações"
    return NOMES[next(iter(tem))]


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
            # COM FILTRO, NAO SE COMPARA COM O TOTAL DE PUBLICACOES. O @blankpartners
            # tem 1.678 publicacoes e a varredura era de reels: escrever "251 de 1.678
            # lidos" mistura duas contagens e faz parecer que faltam 1.427 reels, quando
            # o que falta e' o que ainda houver de reels, numero que ninguem sabe antes
            # de acabar.
            com_filtro = rot != "publicações"
            anotar(livro, "varredura", agora,
                   f"Varredura: {lidos - antes} {rot} novos, "
                   + (f"{mil(lidos)} no total" if com_filtro or not publicacoes
                      else f"{mil(lidos)} de {mil(publicacoes)} lidos"),
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
        da_epoca = {}
        medido = ""
        pa = PERFIS / f"{livro['conta']}.json"
        if pa.exists():
            try:
                d = json.loads(pa.read_text(encoding="utf-8"))
                # A REGUA DA EPOCA VEM DO PROPRIO ESTADO, desde 25/08/2026. A capa
                # usava a regua DE HOJE para todos os perfis: mudar a regua para
                # varrer um perfil novo reetiquetava o historico inteiro (rotulo,
                # meta e contagem trocavam retroativamente, e "300 de 200 reels"
                # aparecia num perfil varrido com outra regua). O rodada grava a
                # regua no estado na hora da varredura; acervo antigo, sem o campo,
                # cai na regua atual como antes.
                da_epoca = d.get("regua_da_epoca") or {}
                formatos_da_epoca = set(da_epoca.get("formatos") or [])
                posts = d.get("posts") or []
                # O QUE A FICHA TEM DE VERDADE, para quando ela nao souber dizer com que
                # regua foi varrida. Sem isto, a capa cai na regua de HOJE e reetiqueta o
                # historico (395 reels viraram "395 carrosséis" na tela dele em 03/09).
                medido = rotulo_medido(posts)
                # E O NUMERO JA' ESTAVA CERTO, o que so' ficou claro conferindo ao
                # contrario. A revisao de 03/09/2026 apontou este `lidos` como o outro
                # lado da mentira do rotulo; a conferencia mostrou que nao e'. Sem regua
                # da epoca, `lidos` e' o total de posts da ficha, e o rotulo medido nomeia
                # exatamente os formatos que estao la' dentro: para o perfil dele sao 395
                # posts, todos reels, rotulados "reels". Deduzir os formatos aqui daria o
                # MESMO numero em todo caso possivel, e codigo que nao muda resultado
                # nenhum e' pior que codigo nenhum: ele finge que consertou algo.
                lidos = (len([x for x in posts
                              if x.get("formato") in formatos_da_epoca])
                         if formatos_da_epoca and formatos_da_epoca != set(TODOS)
                         else len(posts))
                estado_perfil = {
                    "lidos": lidos,
                    "publicacoes": (d.get("perfil") or {}).get("publicacoes") or 0,
                    "completo": bool(d.get("completo")),
                }
            except Exception:
                pass
        # o alvo entra como meta quando ha' filtro de formato: e' contra ele que a tela
        # compara, e nao contra o total de publicacoes do perfil, que nunca sera' lido
        # A ORDEM E' ESTA, E CADA DEGRAU E' MENOS PALPITE QUE O SEGUINTE: o que a ficha
        # gravou na hora da varredura; senao o que a ficha TEM, medido; e so' quando nao
        # ha' ficha nenhuma, a regua de hoje, que ai' e' a unica coisa que existe.
        rot = str(da_epoca.get("rotulo") or medido or rotulo())
        if rot != "publicações" and estado_perfil:
            # META SO' EXISTE SE ALGUEM PEDIU UM ALVO. Aqui havia um "ou 200" herdado do
            # tempo em que a varredura parava sozinha: sem alvo, o cartao continuava
            # dizendo "132 de 200 reels (66%)" numa varredura que vai ate' o fim do
            # perfil, e 66% de coisa nenhuma e' pior do que numero nenhum.
            alvo = int((da_epoca.get("alvo") if "alvo" in da_epoca
                        else regua().get("alvo")) or 0)
            estado_perfil["publicacoes"] = alvo if alvo > 0 else 0
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
            # O MAIS RECENTE PELO RELOGIO, e nao o ultimo da lista. Sao coisas diferentes
            # quando duas vagas gravam fora de ordem, e o carimbo do cartao ja' andava para
            # tras sozinho por causa disso.
            "ultimo_tipo": max(ev, key=lambda e: e.get("quando") or 0)["tipo"],
            # O CONTADOR DE TENTATIVAS DE ABERTURA vai na capa porque e' a capa que os
            # cartoes leem: com ele aqui, o cartao mostra "Tentativa N" sem abrir o
            # livro. Ele so' aparece enquanto ha' fila de tentativas em curso; quando a
            # abertura passa, o rodada.py zera o campo e ele some daqui.
            **({"tentativas_id": int(livro.get("tentativas_id") or 0)}
               if livro.get("tentativas_id") else {}),
            # QUANTAS RODADAS SEGUIDAS SEM PAGINA, na capa, porque e' a capa que a tela le'
            # sem abrir o cartao. E' com este numero que ela distingue rodizio (uma vaga
            # vazia entre outras que leram) de parede (todas vazias, rodada apos rodada), e
            # sem ele a tela chamava as duas coisas de revezamento.
            **({"sem_pagina": int((ev[-1].get("detalhe") or {}).get("seguidas") or 0),
                "vagas_recusadas": int((ev[-1].get("detalhe") or {}).get("vagas") or 0)}
               if ev and ev[-1].get("tipo") == "sem_leitura" else {}),
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
