"""O caminho ate' o Google Drive, e ele e' um so'.

POR QUE ISTO E' UM ARQUIVO SEPARADO. Duas partes do sistema precisam saber do Drive: a
tela pergunta se ja' foi autorizado e manda autorizar (pelo `posto.py`), e a oficina sobe
os arquivos (pelo `oficina.py`). Escrever o nome do remoto e o numero da pasta nos dois
seria duas verdades sobre a mesma coisa, e uma delas ficaria velha. Mesma razao pela qual
`caminhos.py` existe.

POR QUE RCLONE, E NAO A API DO GOOGLE. A trava do projeto e' custo zero, e vale aqui:
subir para o Drive por conta propria pediria um projeto no Google Cloud, uma tela de
consentimento e uma chave para guardar. O rclone ja' esta' instalado (no Windows v1.75
pelo WinGet; na casa da VPS pelo apt, no provisionamento), fala Drive nativamente, e a
conta que ele usa e' a do proprio Gabriel.

O QUE ELE PRECISA FAZER, UMA VEZ SO'. Autorizar no navegador. E' a unica coisa do sistema
inteiro que nao da' para fazer por ele: o Google exige que a pessoa dona da conta clique
em "permitir". Depois disso o rclone guarda a permissao e nunca mais pergunta.

A CHAVE NUNCA PASSA POR AQUI. Quem guarda e' o proprio rclone, no arquivo de configuracao
dele. Este modulo nunca le' esse arquivo, nunca imprime o conteudo dele, e nunca manda
nada disso para a tela: as funcoes daqui respondem "autorizado" ou "nao autorizado", e
mais nada.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

# O NOME DO REMOTO no rclone. Serve de apelido; quem manda e' a pasta de destino abaixo.
REMOTO = "estudio"

# A PASTA DE DESTINO NO DRIVE, pelo numero e nao pelo caminho escrito.
#
# ELE ESCOLHEU ESTA PASTA em 23/08/2026: "Páginas Dark › Videos / isso". Conferida no
# Drive na mesma data: pasta `Videos`, dentro de `Páginas Dark`, da conta dele.
#
# PELO NUMERO PORQUE CAMINHO ESCRITO QUEBRA. `Páginas Dark` tem acento e espaco, e uma
# pasta renomeada levaria o sistema a criar outra igual ao lado, em silencio, e a subir
# cento e sete videos para o lugar errado. O numero e' da pasta, nao do nome dela: ele
# sobrevive a renomear e a mover.
PASTA = "1rft8TEkaWA_U6kRnt_liYxmsIDIn1_e1"
PASTA_NOME = "Páginas Dark › Videos"
PASTA_LINK = f"https://drive.google.com/drive/folders/{PASTA}"

# A QUEBRA DE LINHA, MONTADA E NAO ESCRITA. Ver a nota igual no `provar.py`.
QUEBRA = chr(10)

# QUANTO ESPERAR. Autorizar depende de ele clicar no navegador, entao a espera e' longa;
# as perguntas rapidas nao podem pendurar a tela.
# A CONFERENCIA TEM DE ESPERAR MAIS DO QUE O PRIMEIRO PALPITE. Em 24/08/2026 uma entrega
# de 42 pecas foi recusada em 27 segundos com "o rclone passou de 25 segundos sem
# responder": nao era falta de autorizacao, era o `lsd` demorando. O primeiro pedido
# depois de um tempo parado renova o token com o Google antes de responder, e 25 segundos
# nao cobrem renovacao mais rede num dia ruim. O trabalho de empacotar ja' estava feito.
ESPERA_CURTA = 90
ESPERA_DO_LOGIN = 5 * 60


def onde_esta() -> str | None:
    """O rclone desta maquina, ou None.

    O `which` SOZINHO NAO BASTA. O WinGet instala em `AppData\\Local\\Microsoft\\WinGet\\
    Packages\\Rclone.Rclone_<coisas>\\rclone\\rclone.exe` e poe no PATH do usuario por um
    atalho. O `posto.py` e o `oficina.py` sobem por `pythonw`, que nem sempre herda esse
    PATH: procurar na pasta e' o que faz isto funcionar quando ninguem esta' olhando.
    """
    achado = shutil.which("rclone")
    if achado:
        return achado
    base = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    if base.is_dir():
        for padrao in ("Rclone.Rclone_*/rclone*/rclone.exe", "Rclone.Rclone_*/rclone.exe"):
            for p in sorted(base.glob(padrao)):
                if p.is_file():
                    return str(p)
    return None


# O ERRO CRU DA ULTIMA CHECAGEM, guardado inteiro.
#
# POR QUE ISTO PRECISOU EXISTIR. Passei tres rodadas lendo a MINHA classificacao em vez
# da mensagem do rclone. O codigo traduz qualquer texto que contenha "not found" para
# "o Drive ainda nao foi configurado", e "not found" e' generico demais para diagnosticar
# coisa nenhuma: a traducao apagava a unica informacao util que existia.
#
# CLASSIFICAR SERVE PARA FALAR COM ELE; o texto cru serve para consertar. Os dois
# precisam existir, e o cru nao pode ser jogado fora no caminho.
ULTIMO_ERRO = [""]
# A MARCA DO "NAO SEI". Vai na frente do recado quando o teste nao chegou a uma resposta,
# para quem le' distinguir duvida de recusa. Ver a nota em `autorizado`.
INDECISO = "[indeciso] "


def onde_esta_a_config() -> Path:
    """O arquivo de configuracao do rclone, decidido AQUI e nao pelo ambiente.

    ISTO CUSTOU UMA ENTREGA INTEIRA em 23/08/2026. O Gabriel autorizou o Drive as 20:44,
    a entrega das 92 pecas rodou as 20:59 e falhou dizendo que faltava autorizar. A
    autorizacao estava la'; quem nao a encontrava era o rclone.

    O PORQUE: o rclone acha a configuracao por `%APPDATA%`. A oficina roda por TAREFA
    AGENDADA, e o ambiente de uma tarefa agendada nao carrega essa variavel. Sem ela o
    rclone procura em `~/.config/rclone/rclone.conf`, que nao existe nesta maquina, e
    responde "didn't find section in config file". Reproduzido na mao, tirando a variavel.

    E' A MESMA LICAO DO `onde_esta`, que existe porque o PATH tambem nao e' herdado. Eu
    tinha a licao escrita neste arquivo, dez linhas acima, e nao a apliquei aqui. Fora do
    terminal, nada do ambiente pode ser dado como certo: o caminho se calcula.

    O `Path.home()` E' CONFIAVEL onde `APPDATA` nao e': o Python o resolve pelo perfil do
    usuario, que a tarefa agendada carrega porque e' quem ela e'.
    """
    pelo_ambiente = os.environ.get("RCLONE_CONFIG")
    if pelo_ambiente and Path(pelo_ambiente).is_file():
        return Path(pelo_ambiente)
    casa = Path.home()
    # FORA DO WINDOWS NAO HA' AppData: escrever la' criaria uma pasta de Windows dentro
    # do /home do Linux, e o rclone da casa leria outro arquivo. Auditoria de 25/08/2026.
    if os.name != "nt":
        return casa / ".config" / "rclone" / "rclone.conf"
    for tentativa in (casa / "AppData" / "Roaming" / "rclone" / "rclone.conf",
                      casa / ".config" / "rclone" / "rclone.conf"):
        if tentativa.is_file():
            return tentativa
    # AINDA NAO EXISTE: e' onde ela VAI ser escrita quando ele autorizar.
    return casa / "AppData" / "Roaming" / "rclone" / "rclone.conf"


def _rodar(args: list, espera: int) -> tuple:
    """Chama o rclone e devolve (deu_certo, saida, erro). Nunca levanta."""
    exe = onde_esta()
    if not exe:
        return (False, "", "o rclone nao esta' instalado nesta maquina")
    try:
        # O CAMINHO DA CONFIGURACAO VAI EM TODA CHAMADA, inclusive nas que ESCREVEM nela.
        # Sem isto, autorizar gravaria num arquivo e conferir leria de outro, conforme
        # quem chamou tivesse ou nao a variavel de ambiente. Ver `onde_esta_a_config`.
        r = subprocess.run([exe, "--config", str(onde_esta_a_config())] + args,
                           capture_output=True, text=True,
                           timeout=espera, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return (False, "", f"o rclone passou de {espera} segundos sem responder")
    except OSError as e:
        return (False, "", f"nao consegui chamar o rclone: {e}")
    return (r.returncode == 0, r.stdout or "", (r.stderr or "").strip())


def existe() -> bool:
    """O remoto ja' esta' escrito na configuracao do rclone?

    ISTO NAO E' A MESMA PERGUNTA QUE `autorizado`, e confundir as duas custou caro.
    Existir e' ter a entrada escrita; autorizado e' ter token que funciona. Um remoto
    recem-criado existe e nao serve para nada.
    """
    ok, saida, _ = _rodar(["listremotes"], ESPERA_CURTA)
    if not ok:
        return False
    return REMOTO in [x.strip().rstrip(":") for x in saida.splitlines() if x.strip()]


def autorizado() -> tuple:
    """O remoto consegue MESMO chegar na pasta? Devolve (sim, porque).

    POR QUE NAO BASTA O REMOTO EXISTIR, e isto custou um selo verde falso em 23/08/2026.
    A primeira versao perguntava `rclone listremotes` e, achando o nome na lista, dizia
    "autorizado". So' que `rclone config create` CRIA A ENTRADA sem fazer login nenhum:
    o remoto passa a existir com o token vazio. A tela dizia autorizado, o Gabriel nao
    tinha clicado em coisa alguma, e a primeira subida e' que iria descobrir.

    ENTAO A PERGUNTA E' OUTRA: o remoto consegue LISTAR a pasta de destino? Sem token,
    o rclone responde "empty token found" e sai com erro. Com token, sai com zero, mesmo
    que a pasta esteja vazia. E' o unico jeito honesto de perguntar, porque e' a mesma
    coisa que a subida vai tentar fazer.

    E O SEGREDO CONTINUA FORA DAQUI. Esta funcao nunca abre o arquivo de configuracao do
    rclone: ela faz um pedido de verdade e olha se deu certo. O token nao passa por aqui
    em momento nenhum, nem para ser conferido.
    """
    ok, _, erro = _rodar(["lsd", f"{REMOTO}:", "--max-depth", "1"], ESPERA_CURTA)
    ULTIMO_ERRO[0] = (erro or "").strip()[-600:]
    if ok:
        return (True, "")
    baixo = (erro or "").lower()
    if "empty token" in baixo or "reconnect" in baixo:
        return (False, "falta entrar na conta do Google")
    if "didn't find section" in baixo or "not found" in baixo:
        # O CAMINHO ENTRA NO RECADO, e nao so' o diagnostico.
        #
        # SEM ISTO EU FIQUEI TRES RODADAS ADIVINHANDO. A mensagem dizia "nao foi
        # configurado" e nao dizia ONDE ele tinha procurado. Com o caminho na mao, a
        # diferenca entre "procurou no lugar certo e o remoto nao esta' la'" e "procurou
        # no lugar errado" se ve' de relance, em vez de sair de simulacao de ambiente.
        return (False, "o Drive ainda nao foi configurado; procurei em "
                       f"{onde_esta_a_config()}")
    # TEMPO ESGOTADO NAO E' RESPOSTA. Nao e' "sim" nem "nao": e' "nao consegui perguntar".
    #
    # E A DIFERENCA CUSTOU UMA ENTREGA. Em 24/08/2026 o teste estourou o relogio, a
    # entrega leu isso como "nao autorizado" e nem TENTOU subir, com 42 pecas ja'
    # empacotadas. So' que quem tinha demorado era o teste, e nao o Drive: a subida de
    # verdade tem tres tentativas e um relogio muito maior, e teria funcionado.
    #
    # O TERCEIRO ESTADO ENTRA AQUI, marcado com o prefixo. Quem chama decide o que fazer
    # com "nao sei"; o que nao pode e' tratar duvida como recusa.
    if "sem responder" in (erro or "").lower():
        return (False, INDECISO + _ultima_linha(erro) or INDECISO + "o teste demorou")
    # QUALQUER OUTRA COISA E' A REDE OU O GOOGLE FALANDO, e nao "falta autorizar". Dizer
    # a ele para autorizar de novo quando o problema e' a internet e' mandar refazer um
    # login que ja' esta' feito.
    return (False, _ultima_linha(erro) or "o Drive nao respondeu")


def _ultima_linha(texto: str) -> str:
    """A ultima linha util do rclone, sem o aviso de client_id que ele sempre repete."""
    linhas = [x.strip() for x in (texto or "").splitlines() if x.strip()]
    uteis = [x for x in linhas if "NOTICE" not in x and "shared Google Drive" not in x]
    if not uteis:
        return ""
    # O rclone escreve "2026/08/23 19:12:21 CRITICAL: ..."; o carimbo nao interessa.
    ultima = uteis[-1]
    for corte in ("CRITICAL:", "ERROR:", "Failed to"):
        if corte in ultima:
            return ultima.split(corte, 1)[1].strip() or ultima
    return ultima


def situacao() -> dict:
    """Em que pe' esta' o Drive, para a tela mostrar.

    TRES RESPOSTAS POSSIVEIS, e cada uma pede uma coisa diferente dele:

        sem rclone      instalar (no Windows sozinho, pelo WinGet; na VPS pelo apt)
        sem autorizacao ele entrar na conta dele, uma vez
        pronto          nada
    """
    exe = onde_esta()
    if not exe:
        return {"instalado": False, "autorizado": False,
                "recado": "o rclone ainda nao esta' instalado"}
    ok, porque = autorizado()
    return {"instalado": True, "autorizado": ok,
            "pasta": PASTA_NOME, "link": PASTA_LINK,
            # O QUE FOI USADO FICA REGISTRADO, sempre, e nao so' quando da' errado. E' o
            # que permite comparar uma execucao que funcionou com uma que nao funcionou.
            "programa": exe, "config": str(onde_esta_a_config()),
            # O TEXTO CRU DO RCLONE, sem traducao. Ver a nota em `ULTIMO_ERRO`.
            "detalhe": ULTIMO_ERRO[0],
            "recado": "" if ok else porque}


def autorizar() -> dict:
    """Abre o navegador para ele entrar na conta, e guarda a permissao.

    ISTO E' A UNICA COISA QUE E' DELE PARA FAZER no sistema inteiro, e mesmo assim o que
    sobra para ele e' so' clicar em "permitir": este comando ja' abre a janela certa e
    ja' grava a resposta. Nao ha' menu para navegar nem pergunta para responder.

    SAO DOIS COMANDOS, E NAO UM, e descobrir isso custou um selo verde falso. O
    `config create` so' ESCREVE A ENTRADA do remoto; ele nao faz login, e o remoto nasce
    com o token vazio. Quem faz o login e' o `config reconnect`, que e' o que abre o
    navegador e espera ele permitir. O proprio rclone diz isso na mensagem de erro de
    quem tenta usar um remoto sem token: 'please run "rclone config reconnect"'.

    NAO E' O `rclone config` DE MENU. Aquele e' interativo, faz onze perguntas, e uma
    resposta errada no meio cria um remoto que nao serve.
    """
    if autorizado()[0]:
        return {"ok": True, "ja_era": True}
    # 1. A ENTRADA, se ela ainda nao existe. Criar por cima de uma que ja' tem token
    #    apagaria o token, e ele teria de entrar na conta de novo sem motivo.
    #
    #    E QUEM RESPONDE ISSO E' O `listremotes`, E NAO O `config show`. Conferido em
    #    23/08/2026: `rclone config show naoexisteisso` sai com ZERO, igualzinho a um
    #    remoto que existe. Usar o codigo de saida dele daria "ja' existe" sempre, e
    #    numa maquina limpa o login seguinte falharia por nao haver o que reconectar.
    if not existe():
        ok, _, erro = _rodar(
            ["config", "create", REMOTO, "drive",
             # SO' O QUE PRECISA SER PEDIDO. `drive.file` da' acesso apenas aos arquivos
             # que o proprio sistema criar: ele nao consegue ler nem apagar o resto do
             # Drive dele. E' o menor acesso que ainda deixa subir os videos.
             "scope=drive.file",
             f"root_folder_id={PASTA}"],
            ESPERA_CURTA)
        if not ok:
            return {"ok": False, "erro": _ultima_linha(erro) or "nao criei o remoto"}
    # 2. O LOGIN. Aqui e' que o navegador abre e ele clica em permitir.
    ok, _, erro = _rodar(["config", "reconnect", f"{REMOTO}:"], ESPERA_DO_LOGIN)
    if not ok:
        return {"ok": False, "erro": _ultima_linha(erro)
                or "a autorizacao nao foi concluida"}
    valeu, porque = autorizado()
    return {"ok": valeu, "erro": "" if valeu else porque}


# COMO SE SABE QUANTAS PECAS JA' SUBIRAM.
#
# NAO PELAS ESTATISTICAS DO RCLONE, e a primeira versao tentou por ali. Ele so' imprime
# o bloco de estatistica de tempos em tempos, e uma subida curta termina antes da primeira
# impressao: medido em 23/08/2026, duas pastas subiram inteiras e o contador ficou em
# zero. Barra de progresso que so' funciona quando o trabalho demora nao e' barra.
#
# PELA LINHA DE CADA ARQUIVO, que o `-v` imprime sempre, uma por arquivo, na hora em que
# ele chega: `INFO  : peca/peca.mp4: Copied (new)`.
#
# E SO' OS VIDEOS SAO CONTADOS. Cada peca sobe dois arquivos, o video e a descricao, e
# contar os dois faria a tela dizer 214 de 107. Quem ele conta sao pecas.
SUBIU_UMA = re.compile(r":\s*([^:]+\.mp4):\s*Copied", re.I)


def subir(pasta: Path, nome_no_drive: str, aviso=None) -> dict:
    """Sobe uma pasta inteira para dentro da pasta de destino no Drive.

    `aviso` E' CHAMADO A CADA NOTICIA, com (feitos, total). E' o que permite a tela
    mostrar 12 de 107 em vez de uma bolinha girando por vinte minutos.

    COPIA, E NAO SINCRONIZA. `sync` apaga no destino o que nao existe na origem: um erro
    de caminho aqui apagaria levas antigas do Drive dele. `copy` so' acrescenta.
    """
    exe = onde_esta()
    if not exe:
        return {"ok": False, "erro": "o rclone nao esta' instalado nesta maquina",
                "feitos": 0, "total": 0}
    if not pasta.is_dir():
        return {"ok": False, "erro": f"nao achei a pasta {pasta}", "feitos": 0, "total": 0}
    alvo = f"{REMOTO}:{nome_no_drive}"
    # O TOTAL SAI DAQUI, DO DISCO, e nao do que o rclone disser. Contar o que existe para
    # subir e' medida certa; esperar o programa contar e' ficar sem numero quando ele
    # resolve nao imprimir.
    total = len(list(pasta.rglob("*.mp4")))
    args = [exe, "--config", str(onde_esta_a_config()), "copy", str(pasta), alvo, "-v",
            # TRES ARQUIVOS DE CADA VEZ, e isto tambem e' ordem dele, nao escolha tecnica.
            # A fila indiana de 23/08/2026 ("daqui em diante eu so' quero que funcione a
            # nivel de fila indiana") foi REVOGADA por ele em 25/08/2026, ao perguntar
            # "tem alguma forma para que nao seja fila indiana?" e pedir velocidade.
            # Tres porque o custo fixo por arquivo (abrir a conversa com o Drive) domina
            # em leva de centenas de arquivos pequenos, e o proprio rclone segura o passo
            # sozinho quando o Google pede calma (pacer). A contagem ali embaixo continua
            # certa com subidas entrelacadas: cada "Copied" sai uma vez por arquivo.
            "--transfers=3",
            "--drive-chunk-size=32M", "--retries=3", "--low-level-retries=10"]
    feitos = 0
    try:
        # O NIVEL DE REGISTRO VEM SO' DO `-v`, e nao tambem do ambiente. Pondo os dois,
        # o rclone recusa antes de subir nada: "Can't set -v and --log-level". Era sobra
        # da primeira versao, que lia estatistica em vez de contar arquivo.
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding="utf-8", errors="replace")
    except OSError as e:
        return {"ok": False, "erro": f"nao consegui chamar o rclone: {e}",
                "feitos": 0, "total": total}
    ultimas = []
    for linha in p.stdout:
        linha = linha.strip()
        if not linha:
            continue
        # AS ULTIMAS LINHAS FICAM GUARDADAS PARA O CASO DE DAR ERRADO. Guardar o registro
        # inteiro de cento e sete videos so' para mostrar a ultima linha e' encher a
        # memoria com o que ninguem vai ler.
        ultimas.append(linha)
        if len(ultimas) > 12:
            ultimas.pop(0)
        if SUBIU_UMA.search(linha):
            feitos += 1
            if aviso:
                aviso(feitos, total)
    p.wait()
    if p.returncode != 0:
        return {"ok": False, "erro": _ultima_linha(QUEBRA.join(ultimas))
                or f"o rclone saiu com {p.returncode}",
                "feitos": feitos, "total": total}
    return {"ok": True, "erro": "", "feitos": feitos, "total": total,
            "onde": alvo, "link": PASTA_LINK}


def conferir(nome_no_drive: str) -> dict:
    """Conta o que chegou DO LADO DO DRIVE, e nao do lado de quem subiu.

    ISTO EXISTE POR CAUSA DE 23/08/2026. Naquele dia a tela jurou quatro vezes que o
    Drive estava autorizado, porque o `listremotes` mostrava o nome do remoto; e quatro
    vezes a entrega falhou. A licao ficou: conferir pelo mesmo caminho que produziu o
    resultado nao e' conferir, e' repetir. Aqui a pergunta e' feita pela outra ponta.

    E ELA E' A TRAVA DO APAGAR. Desde 24/08/2026 a entrega apaga o video do computador
    depois de subir, a pedido dele. Apagar por causa de um "deu certo" que ninguem
    checou seria apagar no escuro: um `copy` que devolvesse zero por engano levaria a
    leva junto. So' se apaga quando esta contagem bate com a de ca'.
    """
    exe = onde_esta()
    if not exe:
        return {"ok": False, "quantos": 0, "erro": "o rclone nao esta' instalado"}
    deu, saida, erro = _rodar(["lsf", "--files-only", "-R",
                               f"{REMOTO}:{nome_no_drive}"], ESPERA_CURTA)
    if not deu:
        return {"ok": False, "quantos": 0,
                "erro": _ultima_linha(erro) or _ultima_linha(saida)
                        or "o rclone nao conseguiu listar a pasta"}
    quantos = sum(1 for x in saida.splitlines() if x.strip().lower().endswith(".mp4"))
    return {"ok": True, "quantos": quantos, "erro": ""}
