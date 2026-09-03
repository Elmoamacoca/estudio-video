# -*- coding: utf-8 -*-
"""Onde cada coisa mora. Manda em todos os outros arquivos desta pasta.

POR QUE EXISTE UM ARQUIVO SO' PARA ISSO. Ate' 22/08/2026 nao havia nada parecido aqui, e o
endereco da pasta do Estudio estava declarado QUATRO VEZES, de TRES jeitos diferentes:
`abrir.py` e `guardar.py` liam a variavel de ambiente `ESTUDIO_CASA`, `posto.py` aceitava
`--casa` na linha de comando, e `oficina.py` cravava `Path.home() / "Estudio"` sem saida.
Na pratica isso queria dizer duas coisas ruins: mudar a pasta de lugar era mudar quatro
linhas, e um ensaio feito com `--casa` no posto continuava sendo montado pela oficina na
pasta de verdade. O comentario do `guardar.py` chegou a dizer que o endereco morava ali e em
mais nenhum lugar, o que era verdade quando foi escrito e deixou de ser.

O projeto irmao, o Social Tracker, ja' tinha resolvido isso do mesmo jeito: um `caminhos.py`
que decide tudo, e nenhum outro arquivo montando caminho por conta propria. A regra vale
aqui a partir de agora, e esta' escrita no `CLAUDE.md` da raiz.

COMO SE USA:

    import caminhos
    caminhos.CASA          a pasta de trabalho, com os videos
    caminhos.TELA          o index.html montado
    caminhos.pedidos()     a pasta de pedidos, criada se faltar
"""

import os
from pathlib import Path

# ------------------------------------------------------------------ o projeto
CODIGO = Path(__file__).resolve().parent          # esta pasta, `motor`
PROJETO = CODIGO.parent                           # a raiz do projeto

PECAS = CODIGO / "pecas"                          # as pecas de tela copiadas do irmao
MOLDE_CORPO = CODIGO / "corpo.html"
MOLDE_ESTILO = CODIGO / "estilo.css"
MOLDE_PROGRAMA = CODIGO / "tela.js"

MARCA = PROJETO / "marca"
DOCS = PROJETO / "docs"
# AS ESPECS, desde 02/09/2026. Ate' aqui o combinado de cada trabalho morava so' na
# conversa: o escopo do passo 3 cresceu de "vestir a peca com a arte dele" ate' um editor de
# nivel Canva, um pedido de boa-fe' por vez, e ninguem conseguia dizer onde ele tinha
# comecado. Espec e' contrato em disco, com criterio de aceite em numero; quem confere se
# ela foi cumprida e' o `aceite.py`, nunca a sessao que a construiu.
ESPECS = DOCS / "ESPEC"
PROPOSTAS = DOCS / "propostas"          # as maquetes clicaveis, uma pasta por proposta
PROVAS = PROJETO / "provas"
FOTOS = PROVAS / "fotos"
# AS RESPOSTAS DE VERDADE, GRAVADAS UMA VEZ, desde 02/09/2026. Doze criterios da espec do
# carrossel medem a FORMA da resposta do Instagram; prova que chama a rede quebra sozinha no
# dia em que uma conta virar privada, e o susto manda a proxima sessao procurar defeito onde
# nao ha'. Confere-se com a rede uma vez, grava-se, e a prova roda contra a copia.
ENSAIOS = PROVAS / "ensaios"
# O CARIMBO DAS PROVAS, desde 25/08/2026: a assinatura dos fontes no estado em que a
# suite inteira passou. Quem escreve e' o `provar.py` (so' sem filtro), quem le' e' o
# `publicar.py`, que recusa mandar arquivo com assinatura diferente da carimbada. Fica
# fora do acervo: e' marca de bancada, nao programa.
CARIMBO_DAS_PROVAS = PROVAS / "carimbo.json"
TELAS = PROJETO / "telas"
TELA = TELAS / "index.html"                       # a pagina montada, nunca editada a' mao
FLUXOS = PROJETO / ".github" / "workflows"

# ------------------------------------------------------------------ a pasta de trabalho
#
# FORA DO ONEDRIVE DE PROPOSITO: Area de Trabalho, Documentos e Fotos sobem para a nuvem
# sozinhos, e uma leva pesa de 430 MB a 2,7 GB. Em duas levas a cota estaria estourada, e a
# sincronizacao ainda mexeria em arquivo que ninguem pediu para mexer.
#
# A VARIAVEL DE AMBIENTE E' A UNICA SAIDA, e agora ela vale para TODOS os programas, e nao
# so' para dois deles. As provas usam isso para trabalhar numa pasta descartavel.
CASA = Path(os.environ.get("ESTUDIO_CASA") or (Path.home() / "Estudio"))

LEVAS = CASA / "levas"                            # o bruto ja' limpo, uma pasta por leva
# A FICHA DA LEVA, E NENHUM VIDEO, desde 03/09/2026, com a espec `aba-de-edicao-a-bancada`.
#
# ATE' AQUI ISTO SE CHAMAVA `recortes` e guardava, por leva, um video recortado por peca:
# 2,1 GB para os 787 MB de bruto que os geraram, quase o triplo. O recorte foi apagado do
# desenho porque ele grava o preto e a borda arredondada do reel DENTRO dos pixels, de onde
# nao saem mais, e porque na bancada o reel entra inteiro e a moldura so' decide o que
# aparece, do mesmo jeito que ele faz no Canva.
#
# SOBRA A MEDIDA, e ela pesa kilobytes: `_origem.json` com o retangulo do B-roll de cada
# peca, `_frases/` com a imagem da manchete do card, e `_textos.json` com o que a IA
# escreveu. Uma pasta por leva, como antes.
#
# POR QUE NAO MORA DENTRO DE `levas/`: o cabecalho do `oficina.py` declara que `levas/` e' o
# bruto e que este programa nunca o altera, e essa regra e' o que garante que remedir uma
# leva seja sempre possivel. Ficha ao lado do bruto, e nao dentro dele.
MEDIDAS = CASA / "medidas"                        # a ficha da leva: retangulo, frase, texto
EDICOES = CASA / "edicoes"                        # a peca montada sobre o template
TEMPLATES = CASA / "templates"                    # o acervo de templates
PEDIDOS = CASA / "pedidos"                        # a caixa de recados entre tela e oficina
FEITOS = PEDIDOS / "feitos"
# A ETAPA 4.2 EMPACOTA AQUI: uma pasta por leva, e dentro dela uma pasta por peca,
# com o video e a descricao dele. E' o que sobe para o Drive.
ENTREGAS = CASA / "entregas"           # o pacote final, video mais descricao
FONTES = CASA / "fontes"                          # as fontes que a oficina desenha
# ONDE ELE PAROU, desde 02/09/2026. Ate' aqui o rascunho vivia SO' no guarda-volumes do
# navegador, e sumiu com a leva 31 dentro. Todo o resto ja' morava na casa; o mapa do
# trabalho de mao (enquadramento, ajuste, quais pecas ele deu por prontas) nao.
RASCUNHOS = CASA / "rascunhos"                    # um json por rascunho, pelo id dele

# O CARROSSEL, desde 02/09/2026, e ele NAO passa pela esteira do GitHub.
#
# POR QUE UMA PASTA SO' DELE, longe de `levas` e de `pedidos`: a esteira e' de video, e
# carrossel dentro dela morre em quatro lugares (o `limpar.py` sai com erro sem `.mp4`, o
# `registro.py` nunca o tira da fileira, o `guardar.py` nao o traz e o livro conta zero).
# Nenhum desses e' defeito: e' o preco de passar imagem por um caminho de video. A espec
# `carrossel-de-ponta-a-ponta` escolheu o caminho curto, em que a casa baixa direto.
#
# E `pedidos/` E' DA OFICINA, e de mais ninguem: ela trata QUALQUER json de la' como pedido
# de edicao dela. Um pedido de carrossel ali dentro seria lido como leva.
CARROSSEIS = CASA / "carrosseis"                  # uma pasta por perfil, com as laminas
CARROSSEIS_PEDIDOS = CARROSSEIS / "pedidos"       # a caixa de recados da tela para ca'
CARROSSEIS_PACOTES = CARROSSEIS / "pacotes"       # o ZIP que ele baixa, um por perfil

# A EDICAO DESPACHADA PARA A ESTEIRA, desde 25/08/2026. `despachos/<ficha>.json` e' o
# manifesto que a rota de retirada do posto serve as vagas; `despachos/<ficha>/` guarda
# as camadas pintadas que viajam junto; `pedidos/despachados/` e' o estado de cada
# pedido que saiu da fila local e espera as vagas voltarem.
DESPACHOS = CASA / "despachos"
DESPACHADOS = PEDIDOS / "despachados"

IA = CASA / "ia.json"                             # a fila de chaves e o prompt
IA_USO = CASA / "ia-uso.json"                     # o gasto de cada chave, dia a dia
GUARDADAS = CASA / "guardadas.json"               # o livro das levas ja' trazidas
REGISTRO_DO_POSTO = CASA / "posto-registro.txt"   # o caderno da portaria

# ------------------------------------------------------------------ fora daqui
#
# O SEGREDO NUNCA E' LIDO AQUI, so' apontado. Quem le' e' quem precisa, e nenhum programa
# imprime o conteudo em lugar nenhum.
CHAVE_DO_GITHUB = Path.home() / ".claude" / "secrets" / "github_token.txt"

# O SEGREDO DA RETIRADA DA ESTEIRA DE EDICAO, desde 25/08/2026. A rota /retirada do
# posto entrega os arquivos de um despacho para as vagas da esteira; a ficha sozinha
# nao pode ser a chave, porque ela viaja como parametro do disparo e o Actions de um
# repositorio PUBLICO mostra esse parametro a qualquer um. Entao a vaga tambem manda um
# cabecalho com este segredo, que viaja como segredo do repositorio (o Actions mascara
# segredo no log) e nunca aparece. Mora FORA do repositorio, e vale a variavel de
# ambiente primeiro (as provas usam), depois o arquivo. Sem ele configurado, a rota
# volta a ser so' a ficha (PC e provas), e a casa publica DEVE configura-lo.
CHAVE_DA_RETIRADA = Path.home() / ".claude" / "secrets" / "estudio_retirada.txt"

# A SENHA DA PONTE, desde 25/08/2026. As rotas da ponte que gastam (disparar a esteira,
# escrever no acervo, consultar o Instagram) ficavam destrancadas: qualquer um com o
# endereco mandava ordem. A senha viaja num cabecalho e mora em quatro cofres, um por
# chamador: aqui (VPS e bancada), no segredo do repositorio (a esteira), no cofre da
# Cloudflare (a propria ponte confere) e no /vivo do posto, so' para sessao aberta (e'
# assim que a tela a recebe sem a senha morar no fonte publico). As LEITURAS da ponte
# ficam abertas de proposito: o acervo e' um repositorio publico, trancar leitura nao
# esconderia nada.
CHAVE_DA_PONTE = Path.home() / ".claude" / "secrets" / "estudio_ponte.txt"


def _segredo(nome_no_ambiente: str, arquivo: Path) -> str | None:
    do_ambiente = (os.environ.get(nome_no_ambiente) or "").strip()
    if do_ambiente:
        return do_ambiente
    try:
        do_arquivo = arquivo.read_text(encoding="utf-8").strip()
        return do_arquivo or None
    except OSError:
        return None


def segredo_da_retirada() -> str | None:
    """O segredo do cabecalho da retirada, ou None quando nao ha' nenhum configurado."""
    return _segredo("ESTUDIO_RETIRADA", CHAVE_DA_RETIRADA)


def segredo_da_ponte() -> str | None:
    """A senha das ordens da ponte, ou None quando nao ha' nenhuma configurada."""
    return _segredo("ESTUDIO_PONTE", CHAVE_DA_PONTE)


# A SESSAO DA CONTA DESCARTAVEL DO INSTAGRAM, usada SO' pelo resgate em casa (casa.py),
# que roda neste computador, no endereco residencial, para ler as contas que escondem o
# feed de quem nao esta' logado. Fica FORA do repositorio, no mesmo lugar da chave do
# GitHub, e NUNCA e' commitada, impressa ou mandada para a nuvem (nem VPS, nem esteira,
# nem ponte): endereco de datacenter com conta logada e' o que o Instagram mais pune.
CHAVE_DO_INSTAGRAM = Path.home() / ".claude" / "secrets" / "ig_sessao.txt"

DONO, REPO = "Elmoamacoca", "estudio-video"
ACERVO_CRU = f"https://raw.githubusercontent.com/{DONO}/{REPO}/main"
# O ENDERECO PUBLICO DA CASA, que as vagas da esteira usam para retirar os arquivos de
# um despacho. A variavel de ambiente existe para as provas apontarem para um ensaio.
CASA_PUBLICA = os.environ.get("ESTUDIO_ENDERECO") or "https://estudio.borusa.com.br"
PONTE = "https://estudio-ponte.gabrieltorres.workers.dev"
VITRINE = f"https://{DONO.lower()}.github.io"
PORTA_DO_POSTO = 8787


def criar(pasta: Path) -> Path:
    """Garante que a pasta existe e devolve ela. Nunca cria a raiz do Estudio a' toa."""
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def pedidos() -> Path:
    return criar(PEDIDOS)


def leva(numero) -> Path:
    return LEVAS / f"leva-{numero}"


def medidas_da_leva(numero) -> Path:
    return MEDIDAS / f"leva-{numero}"


def edicoes_da_leva(numero) -> Path:
    return EDICOES / f"leva-{numero}"
