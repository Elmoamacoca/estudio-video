"""A oficina: monta as pecas da leva sobre o template escolhido.

ONDE O TRABALHO ACONTECE, e a conta mudou duas vezes. No PC do Gabriel, com placa de
video, a leva inteira saia em vinte minutos e transportar 900 MB para montar fora nao
pagava a viagem: tudo local. Na casa da VPS, sem placa, uma peca custa uns 6 minutos de
recorte e 5 de montagem, e a leva de 107 vira um dia de maquina; desde 25/08/2026 a
LEVA GRANDE e' fatiada e despachada para as vagas da esteira (o mesmo repositorio
publico da mineracao, onde o mesmo comando de video roda 32 vezes mais rapido, de
graca), e esta oficina despacha, colhe, confere e guarda. Leva pequena, pedido marcado
`aqui` e maquina com placa continuam locais: ver o bloco "a esteira de edicao".

COMO A TELA CONVERSA COM ESTE PROGRAMA. Nao ha' servidor no meio, nem ponte, nem GitHub.
A tela tem permissao de gravar na pasta do Estudio, entao ela deixa um pedido escrito la'
dentro e este programa, que roda de minuto em minuto, encontra o pedido e trabalha.

    Estudio/
      levas/leva-28/*.mp4            o bruto, que este programa nunca altera
      templates/<id>.png             o acervo de templates
      pedidos/<id>.json              a tela escreve aqui
      pedidos/<id>.andamento.json    este programa escreve aqui, a tela le' e mostra
      pedidos/feitos/<id>.json       o pedido cumprido, guardado
      recortes/leva-28/*.mp4         o B-roll recortado (passo 2)
      recortes/leva-28/_origem.json  de qual video bruto veio cada recorte
      edicoes/leva-28/*.mp4          a peca com o template (passo 3)

O DESENHO DA MONTAGEM: o template traz uma MOLDURA, um retangulo marcando onde a midia
entra, e o video e' recortado por ela. E' o comportamento do Canva, e foi assim que o
Gabriel pediu depois de ver a primeira versao colar o video sobre a peca inteira e sumir
com o template.

O TAMANHO DA PECA E' O TAMANHO DO TEMPLATE, e a area util e' o tamanho da moldura. Nao ha'
escolha de proporcao aqui: a tela manda, e o que o Gabriel ajusta e' o quanto do video
aparece dentro da moldura e em que posicao.

Uso:
    python oficina.py             uma passagem: pega os pedidos que houver e monta
    python oficina.py --olhar     so' mostra o que esta' na fila, sem montar nada
"""

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from limpar import LIMPEZA, auditar, sem_udta
# O CAMINHO ATE' O DRIVE MORA NUM LUGAR SO'. Ver o cabecalho do `drive.py`.
import drive

# QUEM DECIDE CAMINHO E' O `caminhos`, e mais ninguem. Trava do CLAUDE.md da raiz.
import caminhos

CASA = caminhos.CASA
PEDIDOS = caminhos.PEDIDOS
ENTREGAS = caminhos.ENTREGAS
FEITOS = caminhos.FEITOS
LEVAS = caminhos.LEVAS
TEMPLATES = caminhos.TEMPLATES
EDICOES = caminhos.EDICOES
RECORTES = caminhos.RECORTES

TRANCA = PEDIDOS / "_montando"
TRANCA_VELHA = 90 * 60      # uma leva inteira leva uns 20 min; 90 e' folga larga

# MEDIDO EM 19/08/2026, num reel de 54,7 s da leva 28, montado em 1080x1920:
#   veryfast, crf 20   19,4 s   20,2 MB
#   ultrafast, crf 20  11,3 s   56,7 MB
# O ultrafast economiza oito segundos e cobra tres vezes o tamanho do arquivo. Nao vale:
# o que se ganha em maquina se perde em disco e em upload para o Instagram depois.
PRESET = "veryfast"
# QUANTAS PECAS RODAM AO MESMO TEMPO, e o numero e' TRES por medicao e nao por palpite.
# Com o recorte na CPU, rodar varias juntas nao ganhava nada: a maquina ja' ficava em 98%
# com uma so'. Com o recorte na placa a CPU sobra, e ai' varias juntas passam a valer. As
# mesmas 12 pecas, na placa: uma de cada vez 125 s, tres 108 s, quatro 109 s. Quatro nao
# ganha porque quem esgota agora e' o bloco de video da placa, e nao o processador.
AO_MESMO_TEMPO = 3
CRF = "20"
# A QUALIDADE NA PLACA se pede por outro numero, e nao pelo CRF. 22 foi escolhido por
# comparacao quadro a quadro contra o libx264 em CRF 20: dentro da janela os dois diferem
# 1,96 de 255, o que ninguem enxerga, e o arquivo sai um pouco maior.
QUALIDADE_DA_PLACA = "22"

# A FOLGA DO ENCAIXE, de 27/08/2026 a' noite: o recorte preserva o reel INTEIRO, com a
# moldura arredondada e o preto do proprio reel gravados nos pixels. Sem folga, o
# retangulo do B-roll cobria a janela da arte mas os cantos redondos ALHEIOS apareciam
# dentro dela, com o preto entre as duas curvas. A filmagem entra 12% maior do que o
# justo e esses cantos caem fora da moldura. Calibrado ao vivo peca a peca: 1.10
# esconde o canto do reel, 1.12 fica com margem. E' A MESMA CONTA DA TELA (tela.js,
# FOLGA_DO_ENCAIXE): mudou aqui, muda la'.
FOLGA_DO_ENCAIXE = 1.12


def par(n) -> int:
    """Arredonda para par. O yuv420p, que e' o formato que todo tocador entende, guarda
    a cor em metade da resolucao, e por isso NAO ACEITA largura ou altura impar. Um
    retangulo arrastado na tela cai em numero impar na metade das vezes, e o ffmpeg
    responde com um erro que nao diz nada sobre paridade."""
    n = int(round(float(n)))
    return n if n % 2 == 0 else n + 1


def ffprobe(arq: Path, campos: str, fluxo="v:0") -> list:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", fluxo,
                        "-show_entries", campos, "-of", "csv=p=0:s=,", str(arq)],
                       capture_output=True, text=True)
    linha = (r.stdout or "").strip().splitlines()
    return linha[0].split(",") if linha else []


def cadencia(arq: Path) -> str:
    """A cadencia do video de origem, para o fundo ser gerado no mesmo passo.

    ISTO NAO E' DETALHE. O template e' uma imagem parada, e para virar fundo de um video
    ele precisa ser repetido quadro a quadro. Sem dizer a que ritmo, o ffmpeg assume 25
    por segundo: medi um reel de 30 quadros por segundo sair com 24,98, o que e' o video
    inteiro reamostrado sem ninguem pedir. Perde-se fluidez e o audio fica no limite de
    escorregar.
    """
    v = ffprobe(arq, "stream=r_frame_rate")
    taxa = v[0] if v else ""
    if "/" in taxa:
        try:
            a, b = taxa.split("/")
            if int(b) and 1 <= int(a) / int(b) <= 121:
                return taxa
        except (ValueError, ZeroDivisionError):
            pass
    return "30"


# QUANTOS QUADROS SE OLHA para descobrir o que mexe. Doze cobrem o video inteiro sem
# custar nada: cada um sai em miniatura de 200 pixels de largura.
QUADROS_DO_BROLL = 12
# A LARGURA DA ANALISE SUBIU DE 200 PARA 320 em 20/08/2026, e o motivo apareceu na tela:
# a mascara passou a seguir a FORMA do B-roll, e a 200 colunas a borda arredondada saia em
# degrau de dois a tres pixels num video de 360 de largura. O custo e' quase nulo, porque
# quem gasta tempo aqui e' extrair o quadro, e nao medi-lo.
LARGURA_DA_ANALISE = 320


def acha_broll(video: Path) -> dict | None:
    """Acha a JANELA do B-roll: o retangulo de filmagem dentro do card de noticia.

    O PEDIDO DO GABRIEL, e a razao e' direta: os reels que ele minera sao cartoes de
    noticia. Em cima vem o arroba do perfil e a legenda, pintados uma vez e parados o
    video inteiro; embaixo vem a filmagem, dentro de um retangulo. O que ele quer levar
    para o template dele e' a filmagem inteira, e nao a marca de quem postou.

    E O LUGAR E O TAMANHO DELA MUDAM EM CADA VIDEO. Medido nos 107 da leva 29: a janela
    ocupa de 50% a 100% da largura e de 21% a 84% da altura. Um recorte fixo serviria para
    um e estragaria os outros cento e seis.

    POR QUE NAO BASTA MEDIR MOVIMENTO. A primeira versao marcava o que se MEXE. Movimento
    acha o que se mexe DENTRO da janela, e nao a janela. Quando o fundo da filmagem e'
    parado (uma cortina, uma parede) e so' o rosto se move, o recorte encolhia para o
    rosto. O Gabriel viu na hora: "ele pega apenas uma parte do video".

    COMO ELE ACHA AGORA, em tres tempos:

      1. a SEMENTE e' o que se mexe, que esta' garantidamente dentro da janela
      2. a COR DO CARD sai da margem de cima e de baixo, que num card sao sempre fundo
      3. a JANELA e' o trecho continuo de linhas e colunas que NAO sao a cor do card,
         em volta da semente, mais a rampa das pontas

    Margem viva demais, ou retangulo que toma quase o quadro todo, quer dizer que nao ha'
    card nenhum: e' reel de tela cheia, e ai' a resposta certa e' o video inteiro.

    Devolve as medidas em FRACAO do quadro (0 a 1), que valem para qualquer resolucao, e
    `modo` dizendo se achou card ou se e' tela cheia. Devolve None quando nao da' para
    decidir, e ai' quem chama usa o video inteiro, que e' o lado seguro.
    """
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        return None

    dur = ffprobe(video, "format=duration", fluxo="v:0")
    try:
        dur = float((dur or ["0"])[0])
    except (TypeError, ValueError):
        return None
    if dur <= 0:
        return None

    fora = Path(tempfile.mkdtemp(prefix="broll-"))
    try:
        quadros = []
        # AS PONTAS FICAM DE FORA, e isso e' conserto de um erro visto na tela: a legenda
        # de muitos reels ENTRA animada nos primeiros segundos, deslizando ou aparecendo
        # aos poucos. Nesse intervalo ela muda de quadro para quadro igual a filmagem, e o
        # detector a inclui no B-roll. Do primeiro sexto ate' quase o fim ela ja' esta'
        # parada, e so' a filmagem se mexe.
        ini, fim = 0.15, 0.88
        # OS DOZE QUADROS SAEM DE UMA PASSAGEM SO'. Antes era uma chamada de ffmpeg
        # por quadro: doze processos abertos e fechados em cada peca, mil e duzentos numa
        # leva de cento e sete, e cada um reabrindo o arquivo do zero para procurar um
        # instante. Uma passagem com `fps` entrega os mesmos doze quadros, igualmente
        # espacados, e paga o custo de abrir o video uma vez.
        # MEDIDO CONTRA A LEVA INTEIRA: das 107 pecas, 101 sairam com a janela igual a'
        # do laco antigo e nenhuma trocou de modo. As seis restantes diferem em duas
        # colunas de analise, porque a busca rapida do ffmpeg encosta no quadro-chave mais
        # proximo e nao ha' como pedir o instante exato. Duas colunas sao sete pixels na
        # peca final, dentro da folga que a rampa das pontas ja' da'.
        vao = dur * (fim - ini)
        taxa = QUADROS_DO_BROLL / vao if vao > 0 else 1.0

        def extrair(por_chave: bool) -> list:
            for velho in fora.glob("*.png"):
                velho.unlink()
            # POR QUADRO-CHAVE, e a diferenca e' de trinta e duas vezes. Pedir quadros em
            # instantes ARBITRARIOS obriga o ffmpeg a decodificar o trecho inteiro (uns
            # 2.040 quadros de 720x1280) para jogar 2.028 fora. Medido em 25/08/2026 com
            # `-threads 1`: 12,37 s de processador por peca do jeito antigo contra 0,39 s
            # por quadro-chave. Numa leva de 180 sao 37 minutos contra 1,2.
            # E O RESULTADO E' O MESMO: a busca do ffmpeg ja' encostava no quadro-chave
            # mais proximo, entao pedir o instante exato era pagar caro por nada.
            antes = (["-skip_frame", "nokey"] if por_chave else [])
            ritmo = (["-fps_mode", "passthrough"] if por_chave else [])
            # OS FILTROS VAO NUM `-vf` SO'. Dois `-vf` na mesma linha nao se somam: o
            # ffmpeg obedece o ULTIMO e joga o primeiro fora calado. Escrito em dois, o
            # caminho de reserva perdia o `fps` e devolvia doze quadros COLADOS, do mesmo
            # instante; sem diferenca entre eles, a semente de movimento dava zero coluna
            # e a peca voltava sem medida nenhuma. Pego em 25/08/2026 nos dois videos
            # curtos da leva 31 que caem na reserva por terem so' dois quadros-chave.
            filtros = f"scale={LARGURA_DA_ANALISE}:-1"
            if not por_chave:
                filtros = f"fps={taxa:.6f}," + filtros
            subprocess.run(["ffmpeg", "-v", "error", "-y", *antes,
                            "-ss", f"{dur * ini:.3f}", "-t", f"{vao:.3f}",
                            "-i", str(video), *ritmo,
                            "-vf", filtros,
                            "-frames:v", str(QUADROS_DO_BROLL),
                            str(fora / "%02d.png")], capture_output=True)
            saiu = []
            for alvo in sorted(fora.glob("*.png")):
                saiu.append(np.asarray(Image.open(alvo).convert("RGB"), dtype=np.int16))
            return saiu

        quadros = extrair(True)
        # VIDEO POBRE DE QUADRO-CHAVE CAI NO CAMINHO ANTIGO. Peca curta, ou codificada com
        # um quadro-chave so', devolve menos de tres amostras: ai' vale pagar a decodificacao
        # inteira, que e' lenta mas sempre entrega. Sem esta volta, esses videos passariam a
        # devolver None e o recorte deles viraria "video inteiro" em silencio.
        if len(quadros) < 3:
            quadros = extrair(False)
        if len(quadros) < 3:
            return None

        p = np.stack(quadros)                       # (n, alt, lar, 3)
        cinza = p.mean(axis=3)
        alt, lar = cinza.shape[1], cinza.shape[2]
        inteiro = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0, "modo": "tela cheia"}

        # 1 ..... a semente: o que se mexe. Linha ou coluna so' conta se boa parte dela
        # mexeu; um pixel solto variando por ruido de compressao existe em toda parte.
        mexe = (cinza.max(axis=0) - cinza.min(axis=0)) > 10
        lin = np.where(mexe.mean(axis=1) > 0.18)[0]
        col = np.where(mexe.mean(axis=0) > 0.18)[0]
        if not len(lin) or not len(col):
            return None
        y0, y1, x0, x1 = int(lin[0]), int(lin[-1]), int(col[0]), int(col[-1])
        # A SEMENTE FICA GUARDADA: e' o unico pedaco que se sabe estar DENTRO da
        # filmagem, e por isso e' o muro que nenhuma retracao pode atravessar.
        sy0, sy1, sx0, sx1 = y0, y1, x0, x1

        # 2 ..... a cor do card, tirada da margem de cima e da de baixo. Sao as duas que
        # num card sao SEMPRE fundo: o arroba mora no alto e o retangulo nunca encosta na
        # borda superior. A esquerda e a direita nao servem, porque ha' janela que vai de
        # ponta a ponta na largura.
        m = max(2, int(alt * 0.02))
        borda = np.concatenate([p[:, :m, :, :].reshape(-1, 3),
                                p[:, -m:, :, :].reshape(-1, 3)])
        cor = np.median(borda, axis=0)
        liso = float(np.median(np.abs(borda - cor).max(axis=1)))
        if liso > 26:
            return inteiro                          # margem viva: nao ha' card

        # 3 ..... o que NAO e' o fundo do card. A tolerancia acompanha o quanto a margem
        # e' lisa: card preto cravado aceita desvio pequeno como sinal.
        tol = max(10, liso * 2 + 8)
        dif = np.abs(p - cor).max(axis=3).max(axis=0)

        # 3b ..... O FUNDO DO CARD E' O QUE SE ALCANCA A PARTIR DA BORDA DO QUADRO, e nao
        # tudo que se PARECE com a cor dele. Este era o defeito que o Gabriel viu em
        # 25/08/2026 num reel de card BRANCO: "o recorte e' muito mal feito".
        #
        # POR QUE A COR SOZINHA NAO SERVE. O `dif` mede distancia ate' UMA cor, entao a cor
        # do card escolhe qual metade da escala de tons da filmagem fica invisivel. Com card
        # branco (253) a faixa cega e' de 243 a 255, que e' onde moram ceu estourado, parede
        # clara e CAIXA DE LEGENDA QUEIMADA dentro do proprio video. Com card preto (2) a
        # faixa cega e' de 0 a 12, onde so' vive sombra profunda. Medido nos arquivos da
        # leva 31: 27,66% dos pixels da filmagem sao claros contra 1,22% escuros, uma razao
        # de 21 vezes. O mesmo limite nas duas pontas destroi vinte vezes mais de um lado, e
        # o A/B com o MESMO video provou: 19,5% da filmagem lida como fundo com card claro
        # contra 0,0% com card escuro, e o recorte perdendo 26,9% da altura.
        #
        # E O MOVIMENTO NAO RESGATA, porque o que colide com card branco (caixa de legenda,
        # cartela, marca d agua) e' justamente o conteudo PARADO: os dois sinais falham no
        # mesmo pixel, ao mesmo tempo, e o buraco vira corte.
        #
        # O QUE DECIDE AGORA E' O CAMINHO. Card e' moldura: o fundo dele encosta na borda do
        # quadro. Uma ilha clara DENTRO da filmagem nao encosta em borda nenhuma, porque a
        # filmagem a cerca dos quatro lados. Entao um ponto so' e' fundo quando da' para
        # chegar nele vindo de uma das quatro bordas andando sempre por pontos com cara de
        # fundo. A conta sai em quatro somas acumuladas, sem laco.
        parecido = (dif <= tol) & ~mexe
        avulso = ~parecido
        # PONTO SOLTO NAO BARRA CAMINHO. Ruido de compressao pinta pontos fora da cor do
        # card no meio do fundo chapado; contados um a um, eles fechariam a passagem e o
        # fundo inteiro viraria filmagem. So' barra quem tem companhia ao lado.
        companhia = np.zeros_like(avulso)
        companhia[:, :-1] |= avulso[:, 1:]
        companhia[:, 1:] |= avulso[:, :-1]
        companhia[:-1, :] |= avulso[1:, :]
        companhia[1:, :] |= avulso[:-1, :]
        barra = (avulso & companhia).astype(np.int32)
        FOLGA = 3          # pontos barrados que o caminho ainda atravessa
        deu = np.cumsum(barra, axis=1) <= FOLGA
        deu |= np.cumsum(barra[:, ::-1], axis=1)[:, ::-1] <= FOLGA
        deu |= np.cumsum(barra, axis=0) <= FOLGA
        deu |= np.cumsum(barra[::-1, :], axis=0)[::-1, :] <= FOLGA
        janela = ~deu

        # 4 ..... a janela e' o TRECHO CONTINUO de linhas cheias em volta da semente, mais
        # a RAMPA das pontas. Um limite so' era fragil pelos dois lados: limite alto parava
        # dentro da filmagem quando o topo dela era escuro (comia 4% da altura do B-roll do
        # MrBeast), limite baixo vazava para a legenda. Entao sao dois passos: o miolo acha
        # o retangulo com limite alto, a rampa estende ate' o fundo de verdade com limite
        # baixo, e assim o canto arredondado e a parte escura da imagem entram.
        def trecho(perfil, centro, chao, beira=0.10):
            lim = max(chao, perfil[centro] * 0.6)
            a = b = centro
            while a > 0 and perfil[a - 1] >= lim:
                a -= 1
            while b < len(perfil) - 1 and perfil[b + 1] >= lim:
                b += 1
            while a > 0 and perfil[a - 1] > beira:
                a -= 1
            while b < len(perfil) - 1 and perfil[b + 1] > beira:
                b += 1
            return a, b

        cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
        y0, y1 = trecho(janela.mean(axis=1), cy, 0.30)
        # NA LARGURA O CHAO E' BAIXO DE PROPOSITO: dentro da faixa de linhas da janela, a
        # coluna de fundo do card da' zero cravado, entao qualquer sinal ja' e' janela. Com
        # chao alto, filmagem escura (o interior de um carro) virava fundo e o recorte
        # comia um pedaco da lateral.
        x0, x1 = trecho(janela[y0:y1 + 1].mean(axis=0), cx, 0.15, beira=0.04)
        y0, y1 = trecho(janela[:, x0:x1 + 1].mean(axis=1), cy, 0.30)

        # 4c ..... O RECORTE E' O TRECHO VIVO E CONTINUO EM VOLTA DA SEMENTE, e nao tudo
        # que nao tem a cor do card. E' o conserto do "que bizarrice e' essa" de
        # 25/08/2026: card com um PAINEL interno de tinta quase igual, a filmagem morando
        # na parte de cima dele e um VAZIO enorme embaixo. Medido no proprio reel: as
        # linhas da filmagem tem movimento em 100% da largura e amplitude 253; as do
        # vazio tem movimento zero, detalhe zero e amplitude 13 a 16, ACIMA do teto de 10
        # da regua de chapa, entao a retracao de chapa nao andava um passo. E dentro do
        # vazio ainda MORA UM ENFEITE QUE SE MEXE, separado da filmagem por vinte linhas
        # mortas: regua de cor nenhuma o tira, continuidade tira.
        #
        # LINHA VIVA e' a que tem janela quase cheia (filmagem de verdade da' 100%, e a
        # continuidade do caminho protege ate' o miolo parado, tipo cortina ou parede,
        # porque ele nao se alcanca da borda), OU movimento, OU detalhe de imagem. Do
        # centro da semente anda-se para as duas pontas atravessando vao morto de ate'
        # oito linhas; o que fica do outro lado de um vao maior nao e' filmagem, e'
        # enfeite do card.
        meio_q = cinza[cinza.shape[0] // 2]
        detalhe = np.zeros_like(mexe)
        detalhe[:, 1:] = np.abs(np.diff(meio_q, axis=1)) > 12

        def correr(centro, beira, viva) -> int:
            passo = 1 if beira >= centro else -1
            fim, vao, i = centro, 0, centro
            while i != beira + passo:
                if viva(i):
                    fim, vao = i, 0
                else:
                    vao += 1
                    if vao > 8:
                        break
                i += passo
            return fim

        # E A AMPLITUDE E' O QUE SALVA A FILMAGEM PARADA. Medido no A/B contra a leva
        # inteira: sem ela, 34 caixas BOAS encolheram, porque a caixa de legenda
        # queimada (branca, encostada na borda da filmagem) rouba a janela da linha, e
        # parada e sem detalhe a linha morria. So' que essas linhas tem letra preta
        # sobre caixa branca: amplitude 200 e mais. O vazio do painel fica em 13 a 16.
        # O teto de 24 separa os dois com folga para os dois lados.
        def linha_viva(l) -> bool:
            m = max(2, (x1 - x0) // 32)
            faixa = p[:, l, x0 + m:x1 + 1 - m, :]
            return (janela[l, x0:x1 + 1].mean() >= 0.90
                    or mexe[l, x0:x1 + 1].mean() >= 0.02
                    or detalhe[l, x0:x1 + 1].mean() >= 0.02
                    or float((faixa.max(axis=(0, 1))
                              - faixa.min(axis=(0, 1))).max()) > 24)

        y0 = correr(cy, y0, linha_viva)
        y1 = correr(cy, y1, linha_viva)

        def coluna_viva(c) -> bool:
            m = max(2, (y1 - y0) // 32)
            faixa = p[:, y0 + m:y1 + 1 - m, c, :]
            return (janela[y0:y1 + 1, c].mean() >= 0.90
                    or mexe[y0:y1 + 1, c].mean() >= 0.02
                    or detalhe[y0:y1 + 1, c].mean() >= 0.02
                    or float((faixa.max(axis=(0, 1))
                              - faixa.min(axis=(0, 1))).max()) > 24)

        x0 = correr(cx, x0, coluna_viva)
        x1 = correr(cx, x1, coluna_viva)

        # 4b ..... PONTA CHAPADA E PARADA NAO E' FILMAGEM, e isto mata as faixas claras que
        # apareciam dos dois lados do recorte. Elas vem de card de DUAS tintas (cinza claro
        # por fora, branco por dentro, o caso do print de 25/08/2026): a cor de referencia
        # sai so' da margem de cima e de baixo, entao o corpo do card fica longe demais dela
        # e passa por filmagem. Medido no sintetico: vaza a partir de 8 niveis de diferenca
        # entre as duas tintas, e paleta clara empilha tons vizinhos (#FFFFFF contra #F2F2F2
        # sao 13 niveis) enquanto card escuro costuma ser um preto chapado so'.
        #
        # Filmagem de verdade tem textura ou muda de quadro para quadro. Fila de pontos que
        # e' a mesma cor em TODOS os quadros e em toda a sua extensao e' preenchimento, nao
        # imagem, e por isso encolhe. O teto de oito guarda o miolo: nunca come a peca.
        def so_tinta(bloco) -> bool:
            return float((bloco.max(axis=(0, 1)) - bloco.min(axis=(0, 1))).max()) <= 10

        # E A FAIXA CHAPADA PODE MORAR ATRAS DE UMA DIVISORIA. No reel visto em
        # 25/08/2026 a' noite, o card tem um PAINEL interno de outra tinta clara com uma
        # linha de borda fina: a janela engolia o painel inteiro (a tinta dele fica longe
        # da cor da margem) e a retracao parava na PRIMEIRA linha, porque a linha de
        # borda tem contraste. O recorte saia com um vazio gigante embaixo da filmagem:
        # 12,7% da mascara caia em fundo, medido na bancada. A retracao agora atravessa
        # divisoria de ate' quatro linhas quando ha' faixa chapada do outro lado, e para
        # de verdade no que tem textura de filmagem. O muro e' a semente: o que se mexe
        # e' filmagem, e nela a retracao nao entra.
        def recuar(beira, muro, chapada) -> int:
            passo = 1 if muro >= beira else -1
            novo, salto, i = beira, 0, beira
            while i != muro:
                if chapada(i):
                    novo, salto = i + passo, 0
                else:
                    salto += 1
                    if salto > 4:
                        break
                i += passo
            return novo

        # A CHAPA SE JULGA PELO MIOLO da linha, e nao por ela inteira: toda linha do
        # painel CRUZA as bordas verticais da moldura, entao com a linha inteira nenhuma
        # delas parece chapada e a retracao nao anda um passo. Fora as pontas, o que
        # sobra do painel e' tinta pura, e ai' a chapa aparece.
        def linha_chapada(l) -> bool:
            m = max(2, (x1 - x0) // 32)
            return so_tinta(p[:, l, x0 + m:x1 + 1 - m, :])

        def coluna_chapada(c) -> bool:
            m = max(2, (y1 - y0) // 32)
            return so_tinta(p[:, y0 + m:y1 + 1 - m, c, :])

        # DE CIMA E DE BAIXO PRIMEIRO: morto o vazio do painel na altura, as colunas
        # que sobram sao tinta pura na faixa da filmagem, e a largura fecha certa.
        # OS MUROS FICAM DENTRO DA CAIXA APARADA: a semente pode conter o enfeite que o
        # 4c acabou de tirar, e um muro fora da caixa mandaria a retracao ANDAR PARA
        # FORA, devolvendo o que ja' caiu.
        y0 = recuar(y0, max(sy0, y0), linha_chapada)
        y1 = recuar(y1, min(sy1, y1), linha_chapada)
        x0 = recuar(x0, max(sx0, x0), coluna_chapada)
        x1 = recuar(x1, min(sx1, x1), coluna_chapada)

        if (y1 - y0 + 1) * (x1 - x0 + 1) > 0.92 * alt * lar:
            return inteiro                          # tomou o quadro quase todo: sem card

        # 5 ..... A FORMA, e nao so' a caixa em volta dela. O pedido do Gabriel nao deixa
        # margem: "se a borda for arredondada deve pegar isso tambem", "e' para capturar
        # 100% como e' o original". Retangulo em volta de um B-roll de canto arredondado
        # devolveria quatro cantinhos da cor do card junto, e isso nao e' o original.
        #
        # Linha por linha, dentro da caixa, pega-se o primeiro e o ultimo ponto que nao
        # sao fundo. Preencher entre os dois nao deixa buraco no meio da filmagem, e a
        # borda que sobra e' a borda de verdade: canto arredondado sai arredondado,
        # circulo sai circulo, quadrado sai quadrado.
        largura = x1 - x0 + 1
        bordas = []
        for y in range(y0, y1 + 1):
            faixa = np.where(janela[y, x0:x1 + 1])[0]
            # O CORTE DE 10% COMIA A PONTA DO CANTO ARREDONDADO. Nas duas ou tres linhas
            # do topo de um canto bem redondo sobra pouca largura, elas eram descartadas,
            # e a mascara comecava reta um pouco abaixo: era o "cortando de forma reta"
            # que o Gabriel viu. Com 3%, a ponta entra.
            if len(faixa) < max(2, largura * 0.03):
                bordas.append(None)
            else:
                bordas.append([int(faixa[0]) + x0, int(faixa[-1]) + x0])
        # UM PONTO SOLTO NAO MUDA A BORDA. A mediana de tres linhas tira o tremor de
        # compressao sem arredondar o que e' canto de verdade.
        firmes = []
        for i, b in enumerate(bordas):
            if b is None:
                firmes.append(None)
                continue
            trio = [c for c in bordas[max(0, i - 1):i + 2] if c]
            firmes.append([int(sorted(c[0] for c in trio)[len(trio) // 2]),
                           int(sorted(c[1] for c in trio)[len(trio) // 2])])
        # A JANELA NAO TEM MORDIDA. Onde a filmagem escurece perto da borda, a linha
        # perde alguns pontos e o contorno cavava um pedaco para dentro: a mascara saia
        # com dentes na lateral e no topo. Um retangulo de card so' estreita nas PONTAS,
        # nunca no meio, entao a borda do topo ate' o meio so' pode ir para fora, e do
        # meio ate' o pe' tambem. Isso apaga a mordida e deixa o canto arredondado.
        cheios = [i for i, b in enumerate(firmes) if b]
        if cheios:
            # O MIOLO E' RETO POR CONSTRUCAO. Num card a janela so' estreita nas duas
            # pontas, onde o canto curva; do primeiro quinto ao ultimo ela e' uma faixa
            # de largura fixa. Fixar isso aqui apaga o degrau que sobrava numa filmagem
            # escura, onde a linha perdia a borda e o contorno entrava na imagem.
            corpo = cheios[len(cheios) // 5: -len(cheios) // 5 or None] or cheios
            fora_e = min(firmes[i][0] for i in corpo)
            fora_d = max(firmes[i][1] for i in corpo)
            for i in corpo:
                firmes[i][0], firmes[i][1] = fora_e, fora_d
            for i in cheios:
                firmes[i][0] = max(firmes[i][0], fora_e)
                firmes[i][1] = min(firmes[i][1], fora_d)
            meio = cheios[len(cheios) // 2]
            aberto = None
            for i in cheios:
                if i > meio:
                    break
                aberto = firmes[i][0] if aberto is None else min(aberto, firmes[i][0])
                firmes[i][0] = aberto
            aberto = None
            for i in reversed(cheios):
                if i <= meio:
                    break
                aberto = firmes[i][0] if aberto is None else min(aberto, firmes[i][0])
                firmes[i][0] = aberto
            aberto = None
            for i in cheios:
                if i > meio:
                    break
                aberto = firmes[i][1] if aberto is None else max(aberto, firmes[i][1])
                firmes[i][1] = aberto
            aberto = None
            for i in reversed(cheios):
                if i <= meio:
                    break
                aberto = firmes[i][1] if aberto is None else max(aberto, firmes[i][1])
                firmes[i][1] = aberto
        linhas = [([b[0] / lar, b[1] / lar] if b else None) for b in firmes]

        return {"x": x0 / lar, "y": y0 / alt, "w": (x1 - x0 + 1) / lar,
                "h": (y1 - y0 + 1) / alt, "modo": "card", "linhas": linhas}
    except Exception:
        return None
    finally:
        shutil.rmtree(fora, ignore_errors=True)


_PLACA = None
_TRAVA_DA_PLACA = threading.Lock()


def placa_de_video() -> bool:
    """Diz se esta maquina codifica video na propria placa, e descobre uma vez so'.

    NAO BASTA O FFMPEG LISTAR O CODIFICADOR. Ele lista `h264_qsv` em qualquer maquina,
    porque quem lista e' a compilacao e nao o hardware. A unica resposta confiavel e'
    mandar a placa codificar um quadrado preto de 64 pixels e ver se ela devolve. Custa
    menos de um segundo e acontece uma vez por execucao.
    """
    global _PLACA
    # A TRAVA EXISTE PORQUE TRES PECAS COMECAM JUNTAS. Sem ela as tres achavam `None` ao
    # mesmo tempo e as tres mandavam a placa codificar o quadrado de teste.
    with _TRAVA_DA_PLACA:
        if _PLACA is not None:
            return _PLACA
        try:
            r = subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
                 "-i", "color=black:s=64x64:d=0.1", "-c:v", "h264_qsv", "-f", "null", "-"],
                capture_output=True, timeout=40)
            _PLACA = r.returncode == 0
        except (OSError, subprocess.SubprocessError):
            _PLACA = False
        print("placa de video: " + ("Quick Sync, ligada" if _PLACA
                                    else "nenhuma, o recorte vai no processador"))
        return _PLACA


def moldura_de(mascara: Path) -> Path:
    """O caminho da moldura RGBA que acompanha uma mascara."""
    return mascara.with_name(mascara.stem + ".moldura.png")


def desenhar_mascara(achado: dict, caixa: dict, arquivo: Path) -> bool:
    """Escreve o PNG da mascara: branco onde o B-roll esta', preto no resto.

    ELA NASCE JA' NO TAMANHO DA PECA, 1080 por 1920, e nao no tamanho do bruto. A
    primeira versao desenhava em 360 de largura e deixava o ffmpeg ampliar tres vezes: o
    canto arredondado chegava na peca borrado e com degrau, e foi o que o Gabriel viu
    ("ele ta' cortando de forma reta"). Desenhada no tamanho final, a curva sai limpa.

    `caixa` diz onde o quadro do bruto cai dentro da peca: x, y, w, h em pixels. Para reel
    na proporcao de reels ele ocupa tudo; para os quatro fora de proporcao da leva 29 ele
    fica no meio, com preto em volta, que e' o mesmo preto do resto.

    A FORMA E' A DO B-ROLL. Se a borda e' arredondada, a mascara e' arredondada, porque
    "e' para capturar 100% como e' o original".
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False

    tw, th = int(caixa["tela_w"]), int(caixa["tela_h"])
    bx, by = float(caixa["x"]), float(caixa["y"])
    bw, bh = float(caixa["w"]), float(caixa["h"])
    emx = lambda fx: bx + fx * bw
    emy = lambda fy: by + fy * bh

    linhas = achado.get("linhas")
    im = Image.new("L", (tw, th), 0)
    d = ImageDraw.Draw(im)

    def gravar() -> bool:
        """Grava as duas leituras da mesma forma: a mascara e a moldura.

        A MASCARA e' branco onde o B-roll passa, e e' o que o editor e a montagem leem.
        A MOLDURA e' o negativo dela em RGBA: preto opaco onde tapa, furo onde passa. E'
        o que a placa de video precisa, porque `overlay_qsv` cola por cima em vez de
        multiplicar. Sao a mesma medida escrita de dois jeitos, e nascem juntas para
        nunca poderem discordar.
        """
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        im.save(arquivo)
        try:
            import numpy as np
            rgba = np.zeros((th, tw, 4), dtype=np.uint8)
            rgba[..., 3] = 255 - np.asarray(im)
            Image.fromarray(rgba, "RGBA").save(moldura_de(arquivo))
        except (ImportError, OSError, ValueError):
            pass                                  # sem moldura o recorte cai no libx264
        return True
    if not linhas:
        d.rectangle([emx(achado.get("x", 0)), emy(achado.get("y", 0)),
                     emx(achado.get("x", 0) + achado.get("w", 1)) - 1,
                     emy(achado.get("y", 0) + achado.get("h", 1)) - 1], fill=255)
        return gravar()

    # QUANDO A FORMA E' UM RETANGULO DE CANTO REDONDO, e e' o caso da grande maioria dos
    # cards, desenha-se o retangulo de verdade em vez do contorno linha a linha: o miolo
    # fica reto sem tremer e os quatro cantos saem com a mesma curva.
    redondo = retangulo_redondo(linhas)
    if redondo:
        deitado, de_pe, e, dd = redondo
        larg_px = (dd - e) * bw
        alt_px = achado["h"] * bh
        raio = min(deitado * bw, de_pe * alt_px, larg_px / 2, alt_px / 2)
    # RAIO GRANDE DEMAIS NAO E' CANTO, E' RUIDO. Num retangulo de canto redondo o raio
    # fica numa fracao pequena do lado; quando ele passa de um quarto, o que variou nas
    # pontas foi a imagem escurecer, e nao a borda curvar. Ai' vale mais o contorno linha
    # a linha, que segue o que foi medido em vez de inventar uma curva.
    if redondo and raio <= 0.25 * min(larg_px, alt_px):
        d.rounded_rectangle([emx(e), emy(achado["y"]), emx(dd) - 1,
                             emy(achado["y"] + achado["h"]) - 1],
                            radius=max(0.0, raio), fill=255)
        return gravar()

    passo = (achado["h"] * bh) / max(1, len(linhas))
    topo = emy(achado["y"])
    esq, dir_ = [], []
    for i, b in enumerate(linhas):
        if not b:
            continue
        yy = topo + (i + 0.5) * passo
        esq.append((emx(b[0]), yy))
        dir_.append((emx(b[1]), yy))
    if len(esq) < 2:
        return False
    # AS PONTAS SE ESTICAM ate' a primeira e a ultima linha cheias, senao a mascara nasce
    # meia linha depois do B-roll e come uma tira dele.
    esq = [(esq[0][0], esq[0][1] - passo / 2)] + esq + [(esq[-1][0], esq[-1][1] + passo / 2)]
    dir_ = [(dir_[0][0], dir_[0][1] - passo / 2)] + dir_ + [(dir_[-1][0], dir_[-1][1] + passo / 2)]
    d.polygon(esq + dir_[::-1], fill=255)
    return gravar()


def retangulo_redondo(linhas: list):
    """Diz se a forma e' um retangulo de canto redondo, e com que raio.

    A PROVA E' O MIOLO SER RETO: se as linhas do meio tem todas a mesma borda esquerda e a
    mesma direita, so' o que varia sao as pontas, e isso e' canto arredondado. O raio e' o
    quanto a borda recua na ponta.

    Devolve (raio, esquerda, direita) em fracao da largura, ou None quando a forma e'
    outra coisa e o contorno linha a linha continua sendo o caminho.
    """
    cheias = [b for b in linhas if b]
    if len(cheias) < 8:
        return None
    a, b = int(len(cheias) * 0.30), int(len(cheias) * 0.70)
    miolo = cheias[a:b] or cheias
    esq = [x[0] for x in miolo]
    dire = [x[1] for x in miolo]
    largura = max(dire) - min(esq)
    if largura <= 0:
        return None
    # o miolo tem de ser reto dentro de meio por cento da largura do quadro
    if (max(esq) - min(esq)) > 0.005 or (max(dire) - min(dire)) > 0.005:
        return None
    e, dd = sum(esq) / len(esq), sum(dire) / len(dire)
    # O RAIO SE MEDE DOS DOIS LADOS, e fica o menor. De pe' e' quantas linhas levam ate' a
    # borda ficar reta; deitado e' o quanto ela anda para dentro. Num canto redondo de
    # verdade os dois dao o mesmo numero. Medir so' deitado deixava uma linha torta na
    # ponta inflar o raio, e o canto saia como um circulo grande demais.
    tol = 0.0015
    cima = 0
    for x in cheias:
        if x[0] > e + tol or x[1] < dd - tol:
            cima += 1
        else:
            break
    baixo = 0
    for x in reversed(cheias):
        if x[0] > e + tol or x[1] < dd - tol:
            baixo += 1
        else:
            break
    deitado = max(max(x[0] - e for x in cheias), max(dd - x[1] for x in cheias), 0.0)
    de_pe = max(cima, baixo) / len(cheias)      # fracao da ALTURA da janela
    return (deitado, de_pe, e, dd)


def guardar_frase(video: Path, achado: dict, arquivo: Path) -> bool:
    """Guarda como imagem a faixa do card que fica ACIMA do B-roll.

    E' onde mora o arroba, o titulo e a frase do post original. O passo 2 apaga tudo isso
    do video, e com razao: e' a marca de quem postou. Mas a fase 3 do template precisa
    LER essa frase para escrever uma equivalente, entao ela sai daqui como recorte de
    imagem antes de o preto cobrir o quadro.
    """
    topo = float(achado.get("y", 0))
    if topo < 0.06:
        return False                     # nao sobra faixa nenhuma em cima do B-roll
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    dur = ffprobe(video, "format=duration", fluxo="v:0")
    try:
        t = max(0.5, float((dur or ["2"])[0]) * 0.5)
    except (TypeError, ValueError):
        t = 2.0
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video),
         "-frames:v", "1", "-vf", f"crop=iw:ih*{topo:.4f}:0:0", str(arquivo)],
        capture_output=True)
    return r.returncode == 0 and arquivo.exists()


def recortar(entrada: Path, saida: Path, achado: dict | None,
             mascara: Path | None, tela: dict | None = None) -> dict:
    """Deixa no quadro so' o B-roll, onde ele ja' esta', e pinta o resto de preto.

    O QUE SAI DAQUI: o mesmo quadro do reel, do mesmo tamanho, com o B-roll na posicao
    original, no tamanho original, com os pixels originais. Fora da forma dele, preto.

    NAO SE CORTA, NAO SE CENTRALIZA, NAO SE REDIMENSIONA. O Gabriel cravou assim em
    20/08/2026, e a frase e' curta: "so' o resto vira preto", "a gente deixa na posicao
    original, ele fica igual a' versao original". Antes eu gravava o retangulo cortado
    fora do quadro; ficava menor e mudava de lugar, e nao era isso.

    A FORMA E' A FORMA DELE. Se a borda e' arredondada, o recorte sai arredondado, porque
    "e' para capturar 100% como e' o original". Quem descreve a forma e' a mascara, e ela
    fica gravada ao lado: o passo 3 precisa dela para poder por o B-roll sobre um fundo
    colorido sem o preto tapar o fundo.

    E SAI SEMPRE EM 1080 POR 1920, o formato de reels. Os brutos vem menores: dos 107 da
    leva 29, 65 sao 720x1280 e 37 sao 360x640. O Gabriel cravou em 20/08/2026 que a
    conversao acontece aqui: "e' pra sempre sair nisso", "precisa aplicar entao na hora de
    ser convertido", porque "chegou na parte do template precisa estar com tudo isso
    limpo". A ampliacao aconteceria de qualquer jeito la' na frente, ja' que a peca final
    e' 1080x1920; feita aqui, ela acontece UMA VEZ so'.

    BRUTO FORA DA PROPORCAO DE REELS entra inteiro e sobra preto em volta, que e' o mesmo
    preto do resto. Na leva 29 sao quatro arquivos assim, entre 720x900 e 1280x720.
    """
    t0 = time.time()
    if not shutil.which("ffmpeg"):
        return {"erro": "o ffmpeg nao esta instalado nesta maquina"}
    saida.parent.mkdir(parents=True, exist_ok=True)

    v = ffprobe(entrada, "stream=width,height")
    try:
        lar, alt = int(v[0]), int(v[1])
    except (IndexError, ValueError):
        return {"erro": "nao consegui ler o tamanho do video"}

    par_lar, par_alt = par(lar), par(alt)
    tela = tela or {}
    tw, th = par(tela.get("w", 1080)), par(tela.get("h", 1920))
    # PARA O FORMATO DE REELS: cabe inteiro dentro de 1080x1920 e o que sobra vira preto,
    # sem esticar de um lado so' e sem cortar nada.
    escala = min(tw / par_lar, th / par_alt)
    sw, sh = par(par_lar * escala), par(par_alt * escala)
    virar = (f",scale={sw}:{sh},pad={tw}:{th}:{(tw - sw) // 2}:{(th - sh) // 2}:black,setsar=1")
    corte = f"crop={par_lar}:{par_alt}:0:0,setsar=1"

    # A MASCARA SE APLICA DEPOIS DE AMPLIAR, e nao antes. Aplicada no tamanho do bruto,
    # ela era ampliada junto e chegava borrada; feita no tamanho final, a borda sai limpa.
    tem_mascara = False
    if achado and achado.get("modo") == "card" and mascara is not None:
        tem_mascara = desenhar_mascara(
            achado, {"tela_w": tw, "tela_h": th, "x": (tw - sw) // 2,
                     "y": (th - sh) // 2, "w": sw, "h": sh}, mascara)
    # ------------------------------------------------ o caminho rapido, dentro da placa
    #
    # QUANDO ELE VALE: quando a maquina tem Quick Sync, quando o bruto enche o quadro sem
    # sobrar barra preta em volta, e quando a moldura existe no disco. Na leva 29 isso e'
    # 103 dos 107. Os quatro de fora estao fora de proporcao (720x900, 1280x720) e
    # precisam de barra, que a placa nao sabe pintar num passo so'.
    #
    # POR QUE E' MAIS RAPIDO: o quadro entra na placa ao ser decodificado e so' sai de la'
    # ja' codificado. Ampliar, colar a moldura e codificar acontecem os tres la' dentro,
    # sem uma volta pela memoria do processador a cada quadro. Medido numa peca de 52 s:
    # 25,0 s no processador contra 15,9 s na placa.
    mold = moldura_de(mascara) if (tem_mascara and mascara is not None) else None
    cabe_inteiro = (sw == tw and sh == th)
    r = None
    if cabe_inteiro and placa_de_video() and (mold is None or mold.is_file()):
        if mold is not None:
            # A MOLDURA E' O NEGATIVO DA MASCARA. `overlay_qsv` cola por cima: preto opaco
            # onde tapa, furo onde o B-roll passa. Da' o mesmo resultado da multiplicacao
            # (medido: fora da janela media 0.0 e pico 10 de 255) por uma frac,ao do custo.
            fq = (f"[0:v]vpp_qsv=w={tw}:h={th}[v];"
                  f"[1:v]format=bgra,hwupload=extra_hw_frames=16[m];"
                  f"[v][m]overlay_qsv=x=0:y=0:shortest=1[out]")
            eq = ["-i", str(entrada), "-loop", "1", "-framerate", cadencia(entrada),
                  "-i", str(mold)]
        else:
            fq = f"[0:v]vpp_qsv=w={tw}:h={th}[out]"
            eq = ["-i", str(entrada)]
        r = subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-init_hw_device", "qsv=hw",
             "-filter_hw_device", "hw", "-hwaccel", "qsv",
             "-hwaccel_output_format", "qsv"] + eq
            + ["-filter_complex", fq, "-map", "[out]", "-map", "0:a?",
               "-c:v", "h264_qsv", "-global_quality", QUALIDADE_DA_PLACA,
               "-c:a", "copy", "-movflags", "+faststart", str(saida)],
            capture_output=True, text=True)
        if r.returncode != 0 or not saida.exists():
            r = None                    # a placa recusou esta peca: segue no processador

    # ------------------------------------------- o caminho de sempre, no processador
    if r is None:
        if tem_mascara:
            # MULTIPLICAR PELA MASCARA: onde ela e' branca o pixel passa inteiro, onde e'
            # preta o pixel zera. E' exato, e nao depende de adivinhar cor de fundo como
            # faria um `colorkey`, que comeria tambem o preto de dentro da filmagem.
            #
            # A MULTIPLICACAO E' EM RGB, e isto e' conserto de um erro visto na tela:
            # feita em YUV, ela zerava so' o brilho e deixava as duas trilhas de cor
            # inteiras, entao a peca saiu verde e a legenda aparecia como fantasma. Em
            # `gbrp` cada canal e' multiplicado por si, e fora da mascara sobra preto.
            filtro = (f"[0:v]{corte}{virar},format=gbrp[v];"
                      f"[1:v]scale={tw}:{th},format=gbrp[m];"
                      f"[v][m]blend=all_mode=multiply:shortest=1,format=yuv420p[out]")
            entradas = ["-i", str(entrada), "-loop", "1", "-framerate", cadencia(entrada),
                        "-i", str(mascara)]
        else:
            # SEM CARD, O B-ROLL E' O REEL INTEIRO. So' se acerta a paridade, porque o
            # h264 nao aceita lado impar e ha' reel de 360x450 na leva.
            filtro = f"[0:v]{corte}{virar},format=yuv420p[out]"
            entradas = ["-i", str(entrada)]
        r = subprocess.run(
            ["ffmpeg", "-v", "error", "-y"] + entradas
            + ["-filter_complex", filtro, "-map", "[out]", "-map", "0:a?",
               "-c:v", "libx264", "-preset", PRESET, "-crf", CRF,
               "-c:a", "copy", "-movflags", "+faststart", str(saida)],
            capture_output=True, text=True)
    if r.returncode != 0 or not saida.exists():
        return {"erro": (r.stderr or "o ffmpeg falhou").strip()[:200]}

    laudo = tirar_assinatura(saida)
    laudo["segundos"] = round(time.time() - t0, 2)
    laudo["bytes"] = saida.stat().st_size
    laudo["quadro"] = {"w": tw, "h": th}
    laudo["bruto"] = {"w": lar, "h": alt}
    laudo["mascara"] = bool(tem_mascara)
    return laudo


def tirar_assinatura(arq: Path) -> dict:
    """Tira do arquivo montado o carimbo que o proprio ffmpeg acabou de escrever nele.

    ISTO NAO E' RELIMPAR O QUE JA' FOI LIMPO, e a diferenca importa porque o Gabriel leu
    assim na primeira vez. Os videos que entram aqui estao limpos, sim, e passaram pelo
    `limpar.py` no fim da baixa. Mas montar o template gera um ARQUIVO NOVO, e quem
    escreve esse arquivo e' o ffmpeg, que assina o proprio trabalho.

    MEDIDO em 19/08/2026: a saida da montagem carrega `encoder=Lavc libx264` na trilha de
    video, mesmo com `-map_metadata -1` e todos os `bitexact` no mesmo comando. Nao ha'
    flag que impeca, porque quem poe a marca e' o codificador e nao o transporte.

    A passagem abaixo copia as trilhas sem tocar nelas, entao nao ha' perda nenhuma de
    imagem ou som, e leva 0,096 s por arquivo. E' a diferenca entre a peca sair anonima ou
    sair carimbada com o nome do programa que a montou.
    """
    bruto = arq.with_suffix(".assinado.mp4")
    # O WINDOWS SEGURA O ARQUIVO POR UM INSTANTE depois que o ffmpeg fecha: o antivirus e
    # o indexador abrem o mp4 recem-escrito para olhar, e nesse intervalo renomear falha
    # com "arquivo em uso". Visto aqui em 20/08/2026, no meio de uma montagem. Tres
    # tentativas com meio segundo entre elas resolvem, e sao mais baratas que perder a
    # peca que acabou de ser codificada.
    for tentativa in range(3):
        try:
            arq.replace(bruto)
            break
        except OSError:
            if tentativa == 2:
                # "AVISO", E NAO "ERRO": o arquivo esta' inteiro no disco, so' ficou
                # com o carimbo. Com "erro", a peca pronta contava como falha e saia
                # da ficha (perdia mascara e frase); a auditoria de 25/08/2026 pegou.
                return {"limpo": False,
                        "aviso": "o arquivo ficou preso por outro programa"}
            time.sleep(0.6)
    try:
        r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(bruto)]
                           + LIMPEZA + [str(arq)], capture_output=True, text=True)
        if r.returncode != 0 or not arq.exists():
            bruto.replace(arq)          # sem carimbo tirado e' melhor que sem arquivo
            return {"limpo": False, "aviso": "nao consegui tirar a assinatura"}
        casca = sem_udta(arq)
        laudo = auditar(arq)
        laudo["casca"] = casca
        return laudo
    finally:
        bruto.unlink(missing_ok=True)


# --------------------------------------------------------------- os pedidos

def _disco_apertado(pid) -> bool:
    """Dois gigas de folga antes de comecar uma leva local; menos que isso e' parar
    com o motivo escrito. Sem esta porta, o disco cheio aparecia como centenas de
    falhas peca a peca, com a tela muda (o proprio andamento nao consegue gravar) e
    o pedido repetindo a leva contra o mesmo disco cheio (auditoria de 25/08/2026).
    """
    livre = shutil.disk_usage(CASA).free
    if livre >= 2 * 1024 ** 3:
        return False
    andamento(pid, {"id": pid, "fim": True,
                    "erro": f"o disco da casa esta' quase cheio "
                            f"({livre // 1048576} MB livres); libere espaco e "
                            "peca de novo"})
    print(f"  {pid}: disco quase cheio ({livre // 1048576} MB livres), nao comecei")
    return True


def andamento(pedido_id: str, dados: dict) -> None:
    """Escreve o andamento para a tela ler. NUNCA DERRUBA A MONTAGEM.

    E' a mesma licao do passo 8 da baixa: a telemetria caiu e levou junto 441 MB que ja'
    estavam no disco. Aviso que atrapalha o trabalho nao e' aviso, e' sabotagem.

    E A ESCRITA E' ATOMICA desde 25/08/2026: o posto le' este arquivo a cada 3 s para
    a tela, e no escrever ele carrega dezenas de KB de textos; leitura no meio de um
    write_text devolvia JSON rasgado e a tela piscava "sem contato" a' toa.
    """
    try:
        _gravar_json_atomico(PEDIDOS / f"{pedido_id}.andamento.json", dados)
    except OSError:
        pass


# ============================================================ O TEMPLATE COMO COMPOSICAO

# AS FONTES QUE EXISTEM NESTA MAQUINA. A regra que manda aqui e' uma so': fonte que o
# navegador mostra na tela mas o PIL nao acha na hora de gravar faria a peca sair diferente
# do que ele desenhou. Entao toda linha abaixo foi aberta em disco antes de entrar.
#
# ERAM SETE ATE' 21/08/2026, e o Gabriel abriu o seletor e disse o obvio: "aqui deveria
# ter varios outros tipos de fonte, e nao tem". Faltava justamente o que um reel de pagina
# escura usa, que e' manchete pesada e condensada. As nove de baixo vem do Google Fonts,
# licenca aberta, sem custo, e moram em `Estudio/fontes`.
FONTES = {
    # de manchete, uma espessura so'
    "anton":       ("Anton-Regular.ttf", "Anton-Regular.ttf"),
    "bebas":       ("BebasNeue-Regular.ttf", "BebasNeue-Regular.ttf"),
    "archivobk":   ("ArchivoBlack-Regular.ttf", "ArchivoBlack-Regular.ttf"),
    "impact":      ("impact.ttf", "impact.ttf"),
    "arialblack":  ("ariblk.ttf", "ariblk.ttf"),
    "segoeblack":  ("seguibl.ttf", "seguibl.ttf"),
    "franklin":    ("framd.ttf", "framd.ttf"),
    # condensadas
    "oswald":      ("Oswald[wght].ttf", "Oswald[wght].ttf"),
    "robotocond":  ("RobotoCondensed[wght].ttf", "RobotoCondensed[wght].ttf"),
    "barlowcond":  ("BarlowCondensed-Regular.ttf", "BarlowCondensed-Bold.ttf"),
    "arialn":      ("ARIALN.TTF", "ARIALNB.TTF"),
    "bahnschrift": ("bahnschrift.ttf", "bahnschrift.ttf"),
    # sem serifa
    "montserrat":  ("Montserrat[wght].ttf", "Montserrat[wght].ttf"),
    "poppins":     ("Poppins-Regular.ttf", "Poppins-Bold.ttf"),
    "inter":       ("Inter[opsz,wght].ttf", "Inter[opsz,wght].ttf"),
    "segoe":       ("segoeui.ttf", "segoeuib.ttf"),
    "arial":       ("arial.ttf", "arialbd.ttf"),
    "verdana":     ("verdana.ttf", "verdanab.ttf"),
    "tahoma":      ("tahoma.ttf", "tahomabd.ttf"),
    "trebuchet":   ("trebuc.ttf", "trebucbd.ttf"),
    "calibri":     ("calibri.ttf", "calibrib.ttf"),
    "candara":     ("Candara.ttf", "Candarab.ttf"),
    "corbel":      ("corbel.ttf", "corbelb.ttf"),
    # com serifa
    "georgia":     ("georgia.ttf", "georgiab.ttf"),
    "times":       ("times.ttf", "timesbd.ttf"),
    "cambria":     ("cambria.ttc", "cambriab.ttf"),
    "constantia":  ("constan.ttf", "constanb.ttf"),
    "garamond":    ("AppleGaramond.ttf", "AppleGaramond-Bold.ttf"),
    "izmir":       ("fonnts.com-izmir-regular.otf", "fonnts.com-izmir-semibold.otf"),
    # de maquina de escrever
    "consolas":    ("consola.ttf", "consolab.ttf"),
    "courier":     ("cour.ttf", "courbd.ttf"),
}
PASTAS_DE_FONTE = [
    Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts",
    Path.home() / "AppData" / "Local" / "Microsoft" / "Windows" / "Fonts",
    CASA / "fontes",
    # A LETRA QUE ELE SOBE NO CADASTRO DO TEMPLATE mora junto do resto do material do
    # template (26/08/2026), e nao numa pasta de fontes a' parte: quem apaga um template
    # apaga tudo dele de uma vez, e uma fonte orfa em `fontes/` sobreviveria calada.
    CASA / "templates",
]


def achar_fonte(nome: str, negrito: bool, tamanho: int):
    """Devolve a fonte pedida, ou a primeira que existir, ou a padrao do PIL.

    FONTE VARIAVEL PRECISA DE UM PEDIDO A MAIS. Oswald, Montserrat, Inter e Roboto
    Condensed vem num arquivo so' que cobre do fino ao preto, e sem dizer qual instancia
    se quer o PIL desenha a que estiver marcada como padrao, que nem sempre e' a Regular.
    Por isso a escolha e' dita nas duas pontas, no normal tambem, e nao so' no negrito.
    """
    from PIL import ImageFont
    tentativas = list(FONTES.get(nome, ())) or []
    # NOME QUE E' ARQUIVO E' PROCURADO COMO ARQUIVO. A fonte que ele sobe no cadastro do
    # template nao tem apelido no catalogo acima (ela nasceu depois dele), e o que a peca
    # carrega e' o nome do arquivo no acervo. Sem esta linha ela cairia calada no
    # `segoeui.ttf` do fim da fila, e a peca sairia com outra letra que nao a escolhida.
    if not tentativas and str(nome).lower().endswith((".ttf", ".otf", ".ttc")):
        tentativas = [str(nome)]
    arquivo = (tentativas[1] if negrito and len(tentativas) > 1
               else tentativas[0] if tentativas else None)
    ordem = [arquivo] if arquivo else []
    ordem += ["segoeui.ttf", "arial.ttf"]
    for arq in ordem:
        for pasta in PASTAS_DE_FONTE:
            caminho = pasta / arq
            if not caminho.is_file():
                continue
            try:
                fonte = ImageFont.truetype(str(caminho), tamanho)
            except OSError:
                continue
            try:
                nomes = [n.decode("utf-8", "replace")
                         for n in fonte.get_variation_names()]
            except (OSError, AttributeError):
                return fonte                      # nao e' variavel, e ja' esta' certa
            quero = ["Bold", "SemiBold", "Medium"] if negrito else ["Regular"]
            for q in quero:
                if q in nomes:
                    try:
                        fonte.set_variation_by_name(q)
                    except OSError:
                        pass
                    break
            return fonte
    return ImageFont.load_default()


def quebrar(texto: str, fonte, largura: int, desenho) -> list:
    """Quebra o texto em linhas que cabem na largura da caixa."""
    linhas = []
    for paragrafo in str(texto).split("\n"):
        atual = ""
        for palavra in paragrafo.split(" "):
            teste = (atual + " " + palavra).strip()
            if not atual or desenho.textlength(teste, font=fonte) <= largura:
                atual = teste
            else:
                linhas.append(atual)
                atual = palavra
        linhas.append(atual)
    return linhas


def pintar_camadas(tpl: dict, textos: dict, tela: dict, pasta: Path,
                   ajustes: dict | None = None) -> tuple:
    """Desenha o fundo e a frente do template. Devolve (fundo RGB, frente RGBA).

    SAO DUAS CAMADAS PORQUE O B-ROLL ENTRA NO MEIO DELAS. Foi a inversao que o Gabriel
    pediu em 20/08/2026: "antes o template tinha que encaixar o B-roll, agora e' o B-roll
    que encaixa no template". O fundo e' cor ou imagem; a frente sao as imagens e os
    textos, que ficam POR CIMA da filmagem, e por isso a legenda aparece dentro do video.

    `textos` traz o que a IA escreveu nas caixas abertas, por id. Caixa com cadeado nao
    entra nesse dicionario e nao muda nunca.

    `ajustes` traz o acerto de disposicao daquela peca, tambem por id: e' a fase 4 do
    template. Titulo longo nao cabe onde o curto cabia, entao a letra encolhe naquela peca
    sem mexer no template das outras. Caixa travada tambem nao entra aqui.
    """
    ajustes = ajustes or {}
    from PIL import Image, ImageDraw

    def acerto_de(el, chave, padrao):
        """O valor desta peca para este campo, com o do template como piso."""
        a = ajustes.get(el.get("id")) or {}
        v = a.get(chave)
        return float(padrao if v is None else v)

    def nome_de(el, chave, padrao):
        """Igual ao de cima, mas para o que e' palavra e nao numero: a fonte.

        A FONTE PASSOU A SER POR PECA em 23/08/2026, a pedido dele: "poderia trocar a
        fonte, e escolher se queria trocar a fonte apenas de um ou de todos". Trocar de
        todos e' o template; trocar de um so' e' isto aqui, e o template nao muda.
        """
        a = ajustes.get(el.get("id")) or {}
        v = a.get(chave)
        return str(padrao if v is None else v)
    tw, th = par(tela.get("w", 1080)), par(tela.get("h", 1920))
    fundo = Image.new("RGB", (tw, th), cor_de(tpl.get("fundoCor"), (0, 0, 0)))
    janela = tpl.get("janela") if isinstance(tpl.get("janela"), dict) else None
    if tpl.get("fundoImagem"):
        arq = pasta / str(tpl["fundoImagem"])
        if arq.is_file():
            try:
                im = Image.open(arq).convert("RGBA").resize((tw, th), Image.LANCZOS)
                if janela and im.getchannel("A").getextrema()[0] < 250:
                    # A ARTE E' A MOLDURA, e o furo dela e' o furo da peca.
                    #
                    # ATE' 26/08/2026 a arte era chapada sobre a cor de fundo e o buraco
                    # vinha da mascara do passo 2, ou seja, do card do reel ORIGINAL. Com
                    # o modelo escolhido na fase 1 quem manda e' o desenho dele: aqui o
                    # fundo passa a ser a propria arte, com a transparencia dela intacta,
                    # e o canto arredondado vem de graca, porque e' o canto que ela tem.
                    fundo = im
                else:
                    fundo.paste(im, (0, 0), im)
            except OSError:
                pass

    frente = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(frente)
    for el in (tpl.get("elementos") or []):
        # A POSICAO PODE SER DESTA PECA. Na fase 4 o Gabriel abre uma peca e acerta ela
        # sozinha; o que ele mexe ali vale para ela e o template das outras nao muda.
        x = int(acerto_de(el, "x", el.get("x", 0)) * tw)
        y = int(acerto_de(el, "y", el.get("y", 0)) * th)
        w = max(1, int(float(el.get("w", 0.2)) * tw))
        if el.get("tipo") == "imagem":
            arq = pasta / str(el.get("arquivo", ""))
            if not arq.is_file():
                continue
            h = max(1, int(float(el.get("h", 0.1)) * th))
            try:
                im = Image.open(arq).convert("RGBA").resize((w, h), Image.LANCZOS)
                frente.paste(im, (x, y), im)
            except OSError:
                pass
            continue

        # O TEXTO: o da caixa aberta vem da IA, o da caixa com cadeado e' o que ele
        # escreveu e fica como esta'.
        conteudo = el.get("texto", "")
        if not el.get("trava") and el.get("id") in textos:
            conteudo = textos[el["id"]]
        if not str(conteudo).strip():
            continue
        tamanho = max(8, int(acerto_de(el, "tamanho", el.get("tamanho", 0.03)) * th))
        fonte = achar_fonte(nome_de(el, "fonte", el.get("fonte", "segoe")),
                            int(el.get("peso", 400)) >= 600, tamanho)
        linhas = quebrar(conteudo, fonte, w, d)
        alinha = el.get("alinha", "esquerda")
        # A ENTRELINHA E' 1,22 AQUI E NO EDITOR, e o texto desce um pouco dentro dela.
        # No navegador a caixa da linha e' 1,22 vez a letra e o desenho fica no meio dela;
        # o PIL poe o topo da letra na coordenada crua. Sem esta folga de 11%, o texto
        # sairia do arquivo alguns pixels mais alto do que ele viu na tela, e o editor
        # deixaria de valer como conferencia.
        altura_linha = int(tamanho * 1.22)
        y += int(tamanho * 0.11)
        for i, linha in enumerate(linhas):
            larg = d.textlength(linha, font=fonte)
            px = x if alinha == "esquerda" else (x + w - larg if alinha == "direita"
                                                else x + (w - larg) / 2)
            d.text((px, y + i * altura_linha), linha, font=fonte,
                   fill=cor_de(el.get("cor"), (255, 255, 255)))
    return fundo, frente


def cor_de(texto, padrao):
    """Le uma cor `#rrggbb`. Cor invalida vira a padrao em vez de derrubar a peca."""
    t = str(texto or "").strip().lstrip("#")
    if len(t) == 3:
        t = "".join(c * 2 for c in t)
    if len(t) != 6:
        return padrao
    try:
        return tuple(int(t[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return padrao


def encaixe_na_janela(base, jan, z: float = 1.0, dx: float = 0.0,
                      dy: float = 0.0) -> tuple | None:
    """Onde a filmagem entra quando a janela e' a da ARTE, e nao a do reel de origem.

    Devolve `(k, x, y)`: quanto o quadro do recorte cresce e onde fica o canto de cima
    dele, em fracao do quadro da peca. Sem janela devolve None, e o caminho velho segue.

    A CONTA E' A MESMA QUE A TELA FAZ na fase 1 (`encaixeNaJanela`, em tela.js), e tem de
    continuar sendo: a filmagem cresce ate' o retangulo do B-roll COBRIR a janela da
    arte, e o meio de um cai no meio do outro. Cobrir, e nao caber: tarja preta dentro da
    moldura apareceria na peca pronta; beirada de filmagem perdida, nao.

    `es`, `mx` e `my` NAO ENTRAM AQUI. Eles movem a janela, e a janela agora e' o furo da
    arte, que nao se move. O que se move e' a filmagem dentro dela, com `z` e `d`.
    """
    if not isinstance(jan, dict):
        return None
    b = base if isinstance(base, dict) else {}
    try:
        bw = max(1e-4, float(b.get("w", 1) or 1))
        bh = max(1e-4, float(b.get("h", 1) or 1))
        jw = max(1e-4, float(jan.get("w", 1)))
        jh = max(1e-4, float(jan.get("h", 1)))
        # PECA DE TELA CHEIA CHEGA COM O QUADRO INTEIRO de base, e e' assim que ela
        # ENCOLHE para caber na moldura em vez de tapar o desenho todo.
        cxb = float(b.get("x", 0) or 0) + bw / 2
        cyb = float(b.get("y", 0) or 0) + bh / 2
        cxj = float(jan.get("x", 0)) + jw / 2
        cyj = float(jan.get("y", 0)) + jh / 2
    except (TypeError, ValueError):
        return None
    kenc = max(jw / bw, jh / bh) * FOLGA_DO_ENCAIXE
    k = kenc * z
    return (k, cxj - k * cxb + kenc * dx, cyj - k * cyb + kenc * dy)


def folga_do_deslize(base, jan, z: float = 1.0) -> tuple:
    """Quanto `dx` e `dy` podem andar sem abrir tarja preta dentro da janela.

    COM FURO DE ARTE A SOBRA EXISTE SEM APROXIMAR NADA. A filmagem entra doze por cento
    maior que o furo (`FOLGA_DO_ENCAIXE`), e esses doze por cento sao margem: na peca
    0001 da leva 31 dao 4,8% do quadro de um lado e 4,4% do outro. O limite velho,
    `(z - 1) / 2`, vem do tempo em que nao havia furo de arte nenhum, e com furo ele
    ZERA o gesto: na tela, arrastar a filmagem sem aproximar antes nao fazia nada, e
    gesto que nao faz nada se le como quebrado.

    SEM JANELA O LIMITE VELHO CONTINUA VALENDO, que e' o rascunho antigo: la' a filmagem
    ocupa o quadro inteiro e a unica sobra e' a que a aproximacao criou.

    A CONTA E' A MESMA QUE A TELA FAZ (`folgaDoDeslize`, em tela.js), e tem de continuar
    sendo: um lado prendendo mais que o outro faria o arquivo sair diferente do que ele
    aprovou na revisao.
    """
    velha = max(0.0, (z - 1) / 2)
    if not isinstance(jan, dict):
        return (velha, velha)
    b = base if isinstance(base, dict) else {}
    try:
        bw = max(1e-4, float(b.get("w", 1) or 1))
        bh = max(1e-4, float(b.get("h", 1) or 1))
        jw = max(1e-4, float(jan.get("w", 1)))
        jh = max(1e-4, float(jan.get("h", 1)))
    except (TypeError, ValueError):
        return (velha, velha)
    kenc = max(jw / bw, jh / bh) * FOLGA_DO_ENCAIXE
    k = kenc * z
    return (max(0.0, (k * bw - jw) / (2 * kenc)),
            max(0.0, (k * bh - jh) / (2 * kenc)))


def movimento_da_janela(enquadre: dict | None) -> tuple:
    """O que a fase 5 fez com a janela do B-roll: quanto ela cresceu e para onde andou.

    DEVOLVE `(s, mx, my, cx, cy)`, tudo em fracao do quadro: o tamanho, o deslocamento,
    e o centro da janela de origem, que e' o ponto em cima do qual ela cresce.

    UM LUGAR SO' PARA ESTA CONTA, porque ela e' feita em dois: na mascara, que abre o
    buraco, e no `compor`, que poe a filmagem. Se as duas divergirem, a janela mostra
    um pedaco do video que nao e' o que ele viu na tela, e ninguem descobre isso
    olhando codigo.

    O CENTRO VEM NO PEDIDO, em `base`, e nao e' capricho: a tela cresce e move a janela
    em cima do centro DELA, e aqui so' se conhece a mascara. Sem o retangulo de origem
    nao ha' como refazer o mesmo movimento. Pedido velho, sem `base`, cai no centro do
    quadro, que da' no mesmo enquanto o tamanho for o de origem.
    """
    e = enquadre or {}
    base = e.get("base") or {}
    try:
        s_ = float(e.get("es") or 1)
        mx = float(e.get("mx") or 0)
        my = float(e.get("my") or 0)
        cx = float(base.get("x", 0)) + float(base.get("w", 1)) / 2 if base else 0.5
        cy = float(base.get("y", 0)) + float(base.get("h", 1)) / 2 if base else 0.5
    except (TypeError, ValueError):
        return (1.0, 0.0, 0.0, 0.5, 0.5)
    s_ = min(4.0, max(0.1, s_))
    return (s_, mx, my, cx, cy)

def template_da_peca(tpl: dict, enquadre: dict | None) -> dict:
    """O template como ESTA peca o ve: com a moldura que a tela escolheu para ela.

    A MOLDURA E' POR PECA desde 27/08/2026. A tela escolhe, para cada recorte, a
    variacao do template da conta cujo furo melhor encaixa aquele B-roll (a conta e'
    dela, em `variacaoDaPeca`), e manda no pedido o arquivo e a janela da escolhida.
    Aqui so' se obedece: quando a peca traz `arte`, ela vira o fundo DESTA peca.

    NOME COM SEPARADOR NAO PASSA, pela mesma razao do guardar-no-acervo do posto: o
    arquivo e' juntado a' pasta dos templates, e um nome com barra sairia dela.
    """
    e = enquadre or {}
    arte = str(e.get("arte") or "")
    if not arte or "/" in arte or chr(92) in arte or ".." in arte:
        return tpl
    proprio = dict(tpl)
    proprio["fundoImagem"] = arte
    if isinstance(e.get("janela"), dict):
        proprio["janela"] = e["janela"]
    # A FRASE DESTA PECA, na faixa da variacao que ela veste.
    #
    # ELA CHEGA PRONTA DA TELA, como elemento de texto de id `frase`: posicao, largura,
    # tamanho de letra, fonte, cor e alinhamento ja' resolvidos la'. Refazer a conta aqui
    # seria a segunda implementacao da mesma regra, e o arquivo sairia diferente do que
    # ele aprovou na previa. Daqui para baixo ela e' um elemento como qualquer outro: o
    # que a IA escreveu entra por `textos["frase"]` e o acerto daquela peca por `ajustes`.
    escrita = e.get("escrita")
    if isinstance(escrita, dict) and escrita.get("id"):
        proprio["elementos"] = list(tpl.get("elementos") or []) + [escrita]
    return proprio


def camada_da_peca(fundo, frente, mascara: Path | None, tela: dict,
                   enquadre: dict | None = None):
    """Junta fundo, buraco do B-roll e elementos numa IMAGEM SO', com transparencia.

    POR QUE UMA CAMADA E NAO TRES. A primeira versao empilhava fundo, video e elementos
    dentro do ffmpeg, com duas contas de mistura por quadro em 1080 por 1920. Medido aqui:
    31 a 42 segundos por peca, o que daria mais de uma hora para uma leva de cento e sete.
    Nesta versao o trabalho pesado sai do video e vai para a imagem, que e' desenhada uma
    vez: o fundo fica opaco, o lugar do B-roll fica TRANSPARENTE no formato da mascara, e
    os elementos entram por cima ja' opacos de novo. Ao ffmpeg sobra um `overlay`.

    A ORDEM E' FUNDO, B-ROLL, ELEMENTOS, e ela e' o pedido do Gabriel: os elementos ficam
    POR CIMA da filmagem, porque "a legenda e' o que vai entrar dentro do video".
    """
    from PIL import Image
    tw, th = par(tela.get("w", 1080)), par(tela.get("h", 1920))
    camada = fundo.convert("RGBA")
    # A MOLDURA PODE JA' TRAZER O FURO DELA. Quando o template e' uma arte do Gabriel com
    # a janela vazada, o furo chegou aqui dentro do proprio fundo, com o canto que o
    # desenho tem. Nesse caso nao ha' mascara a aplicar: aplicar a do passo 2 por cima
    # devolveria o buraco para o formato do card do reel, que e' o que se quis trocar.
    #
    # E E' AQUI QUE A PECA DE TELA CHEIA PASSA A TER MOLDURA: sem furo proprio ela caia
    # no `putalpha(0)` la' embaixo e o template inteiro sumia.
    furo_proprio = (fundo.mode == "RGBA"
                    and fundo.getchannel("A").getextrema()[0] < 250)
    if furo_proprio:
        pass
    elif mascara and Path(mascara).is_file():
        try:
            m = Image.open(mascara).convert("L").resize((tw, th), Image.LANCZOS)
            # A JANELA PODE TER SIDO MOVIDA NA FASE 5, e entao o buraco se muda com ela.
            #
            # O PEDIDO DELE, EM 23/08/2026: "eu nao consigo mexer todo o quadrado, ou
            # seja, todo o B-roll". Mover a janela e' mover DUAS coisas ao mesmo tempo:
            # o buraco, que e' esta mascara, e a filmagem que aparece por ele, que e' o
            # `compor`. Mover so' uma faria a janela passar a mostrar outro pedaco do
            # video, que e' o contrario de mudar o B-roll de lugar.
            #
            # O FUNDO NOVO E' PRETO, que aqui quer dizer "sem buraco": o lugar de onde a
            # janela saiu volta a ser template opaco.
            #
            # CRESCER A MASCARA INTEIRA E' O MESMO QUE CRESCER A JANELA. So' o retangulo
            # dela e' branco; o resto e' preto e continua preto por maior que fique.
            esc, mx, my, cx, cy = movimento_da_janela(enquadre)
            if esc != 1 or mx or my:
                lw, lh = max(1, int(round(tw * esc))), max(1, int(round(th * esc)))
                # O CENTRO DA JANELA TEM DE CAIR ONDE A TELA POS: `c` vira `c + m`.
                ox = int(round((cx + mx) * tw - cx * esc * tw))
                oy = int(round((cy + my) * th - cy * esc * th))
                movida = Image.new("L", (tw, th), 0)
                movida.paste(m.resize((lw, lh), Image.LANCZOS), (ox, oy))
                m = movida
            camada.putalpha(Image.eval(m, lambda v: 255 - v))
        except OSError:
            pass
    else:
        # SEM MASCARA E' REEL DE TELA CHEIA: ele ocupa o quadro todo e o fundo do template
        # nao aparece em lugar nenhum.
        camada.putalpha(0)
    camada.alpha_composite(frente)
    return camada


def compor(camada: Path, video: Path, saida: Path, tela: dict,
           enquadre: dict | None = None) -> dict:
    """Poe a camada do template por cima do B-roll e grava a peca.

    O ENQUADRAMENTO E' DAQUELA PECA, e chega da fase 5. Ele pediu em 23/08/2026:
    "pegaria alguns b-rolls, reajustaria o enquadramento deles". Reel baixado nao tem
    enquadramento combinado com ninguem, e as vezes o assunto cai fora da janela que o
    recorte abriu; sem isto a unica saida era descartar a peca.

    A JANELA NAO SE MEXE, A FILMAGEM SE MEXE. Quem decide o buraco e' a mascara, e ela
    continua a mesma. O que muda aqui e' o que aparece la' dentro: `scale` faz a
    filmagem crescer, `crop` escolhe que pedaco dela fica no quadro.

    A CONTA E' A MESMA QUE A TELA FAZ, e tem de continuar sendo. La' e' um `transform`
    de `translate` mais `scale`; aqui e' `scale` mais `crop` com o recorte deslocado ao
    contrario, que da' no mesmo: mover a janela para a esquerda e mover a imagem para a
    direita sao a mesma coisa vista de dois lugares. Se um lado mudar, o outro muda.
    """
    t0 = time.time()
    tw, th = par(tela.get("w", 1080)), par(tela.get("h", 1920))
    saida.parent.mkdir(parents=True, exist_ok=True)
    e = enquadre or {}
    try:
        z = float(e.get("z") or 1)
        dx = float(e.get("dx") or 0)
        dy = float(e.get("dy") or 0)
    except (TypeError, ValueError):
        z, dx, dy = 1.0, 0.0, 0.0
    z = min(4.0, max(1.0, z))          # menos que 1 deixaria borda preta dentro da janela
    # DESLIZAR SO' VAI ATE' A SOBRA, e quanta sobra ha' depende de onde a filmagem entra.
    # A tela ja' prende nisto; aqui a conta e' repetida porque um pedido antigo, ou
    # escrito na mao, nao passou por ela.
    fdx, fdy = folga_do_deslize(e.get("base"), e.get("janela"), z)
    dx = max(-fdx, min(fdx, dx))
    dy = max(-fdy, min(fdy, dy))
    # A JANELA DA ARTE MANDA, QUANDO EXISTE.
    #
    # A conta e' a mesma que a tela faz na fase 1 (`encaixeNaJanela`): a filmagem cresce
    # ate' que o retangulo do B-roll COBRIR a janela da arte, e o meio de um cai no meio
    # do outro. Cobrir, e nao caber: sobrar tarja preta dentro da moldura apareceria na
    # peca pronta, e perder beirada de filmagem nao aparece.
    #
    # `es`, `mx` e `my` NAO ENTRAM AQUI. Eles movem a janela, e a janela agora e' o furo
    # da arte, que nao se move: o que se move e' a filmagem dentro dela, com `z` e `d`.
    encaixe = encaixe_na_janela(e.get("base"), e.get("janela"), z, dx, dy)
    if encaixe:
        k, fx, fy = encaixe
        ew, eh = par(int(round(tw * k))), par(int(round(th * k)))
        px, py = int(round(tw * fx)), int(round(th * fy))
    else:
        # E O QUE FOI FEITO COM A JANELA. A filmagem acompanha: ver `camada_da_peca`.
        esc, mx, my, cx, cy = movimento_da_janela(e)
        # DUAS AMPLIACOES SE MULTIPLICAM: a da janela e a da filmagem dentro dela.
        k = esc * z
        ew, eh = par(int(round(tw * k))), par(int(round(th * k)))
        # ONDE FICA O CANTO DE CIMA DA FILMAGEM, DEPOIS DE TUDO.
        #
        # E' A MESMA COMPOSICAO QUE O NAVEGADOR FAZ, escrita de uma vez so': a filmagem
        # cresce `z` em cima do centro do quadro e desliza `d`; depois a janela cresce
        # `esc` em cima do centro dela e anda `m`, levando a filmagem junto.
        px = int(round(tw * (-0.5 * k + cx + esc * (0.5 - cx) + esc * dx + mx)))
        py = int(round(th * (-0.5 * k + cy + esc * (0.5 - cy) + esc * dy + my)))
    # A CAMADA JA' NASCE DO TAMANHO DA PECA (`camada_da_peca` a desenha em tw por th),
    # entao redimensiona-la a cada quadro era trabalho jogado fora. Conferir uma vez e'
    # barato; confiar sem conferir seria pintar torto se algum dia ela mudar de tamanho.
    try:
        from PIL import Image
        with Image.open(camada) as im:
            camada_certa = im.size == (tw, th)
    except OSError:
        camada_certa = False
    c = "[1:v]" if camada_certa else "[c]"
    prep = "" if camada_certa else f"[1:v]scale={tw}:{th}[c];"
    if z == 1 and not px and not py:
        # O CAMINHO CURTO, que e' o de quase toda peca: nada foi mexido.
        filtro = (f"[0:v]scale={tw}:{th},setsar=1[v];" + prep
                  + f"[v]{c}overlay=0:0,format=yuv420p[out]")
    else:
        # O FUNDO PRETO SO' EXISTE QUANDO A FILMAGEM NAO COBRE O QUADRO.
        #
        # POR QUE ELE EXISTIA SEMPRE, e a nota vale para nao se repetir o engano: o
        # `crop` SO' ANDA PARA DENTRO, entao ele nao serve quando a filmagem precisa
        # ficar FORA do quadro (mover a janela leva a filmagem junto, as vezes muito
        # alem do que ha' de imagem). O `overlay` aceita posicao negativa e nao tem esse
        # limite, e por isso virou o caminho unico. So' que ele passou a pagar o preco
        # do fundo em TODA peca, inclusive nas que nem enxergam o preto.
        #
        # A CONDICAO `cobre` E' EXATAMENTE A FRONTEIRA entre os dois casos: quando o
        # retangulo da filmagem contem o quadro inteiro, o corte cai todo dentro do que
        # existe e nao ha' o que prender; quando nao contem, o fundo volta a ser preciso.
        #
        # QUANDO ELA COBRE, e' o caso de quase toda peca com janela de arte, o preto e'
        # inteiramente tapado pela propria filmagem: desenha-lo e' pintar por baixo do
        # que ja' esta' opaco. Medido na casa da rua, 15 s de video: 163,2 s com o
        # fundo, 83,6 s cortando o pedaco que aparece. O `crop` chega ao mesmo lugar
        # que o `overlay` negativo, porque mover a janela para a esquerda e mover a
        # imagem para a direita sao a mesma coisa vista de dois lados.
        #
        # E O FUNDO QUE SOBRA GANHOU CADENCIA. Sem `r=`, o `color` nasce a 25 quadros
        # por segundo, e como ele e' a base do primeiro `overlay` a peca inteira saia a
        # 25 num video de 30: um quadro fora a cada seis, medido no arquivo.
        cobre = px <= 0 and py <= 0 and px + ew >= tw and py + eh >= th
        if cobre:
            filtro = (f"[0:v]scale={ew}:{eh},setsar=1,crop={tw}:{th}:{-px}:{-py}[v];"
                      + prep + f"[v]{c}overlay=0:0,format=yuv420p[out]")
        else:
            filtro = (f"[0:v]scale={ew}:{eh},setsar=1[v0];"
                      f"color=c=black:s={tw}x{th}:r={cadencia(video)}[fundo];"
                      f"[fundo][v0]overlay={px}:{py}:shortest=1[v];"
                      + prep + f"[v]{c}overlay=0:0,format=yuv420p[out]")
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(camada),
         "-filter_complex", filtro, "-map", "[out]", "-map", "0:a?",
         "-c:v", "libx264", "-preset", PRESET, "-crf", CRF,
         "-c:a", "copy", "-movflags", "+faststart", str(saida)],
        capture_output=True, text=True)
    if r.returncode != 0 or not saida.exists():
        return {"erro": (r.stderr or "o ffmpeg falhou").strip()[:200]}
    laudo = tirar_assinatura(saida)
    laudo["segundos"] = round(time.time() - t0, 2)
    laudo["bytes"] = saida.stat().st_size
    return laudo


def arquivar(caminho: Path, p: dict, feitos: int, falhas: int, gasto: int) -> None:
    """Guarda o pedido cumprido e tira ele da fila.

    O PEDIDO SAI DA FILA MESMO QUANDO A COPIA EM FEITOS FALHA, e isso e' conserto da
    auditoria de 25/08/2026: com o disco cheio, o write de feitos estourava ANTES do
    unlink e o pedido voltava para a fila, e a leva inteira repetia a cada minuto
    contra o mesmo disco cheio, regastando cota de IA e enchendo mais o disco. O
    unlink nao precisa de espaco; perder o registro em feitos e' mais barato que
    regastar cota em laco.
    """
    FEITOS.mkdir(parents=True, exist_ok=True)
    p["cumprido"] = int(time.time())
    p["feitos"], p["falhas"], p["segundos"] = feitos, falhas, gasto
    try:
        (FEITOS / caminho.name).write_text(json.dumps(p, ensure_ascii=False, indent=1),
                                           encoding="utf-8")
    except OSError as e:
        print(f"  nao consegui guardar a copia em feitos: {e}")
    try:
        caminho.unlink(missing_ok=True)
    except OSError as e:
        print(f"  nao consegui tirar o pedido da fila: {e}")


def fundir_ficha(velha, leva, origem: Path, pecas_novas: list) -> dict:
    """A ficha nova entra POR CIMA da velha, peca a peca, sem apagar as outras.

    POR QUE FUNDIR, achado da auditoria de 25/08/2026: o botao "Recortar as N que
    faltaram" manda so' as que faltam, e reescrever a `_origem.json` so' com elas
    apagaria frase, broll e mascara das dezenas que ja' estavam prontas, cegando a fase
    da IA (peca sem frase na ficha volta a gastar cota, e peca sem mascara sai sem furo
    na montagem). A peca repetida e' substituida; a que nao veio no pedido fica como
    estava.
    """
    por_arquivo = {}
    if isinstance(velha, dict):
        for x in (velha.get("pecas") or []):
            if isinstance(x, dict) and x.get("arquivo"):
                por_arquivo[x["arquivo"]] = x
    for x in pecas_novas:
        por_arquivo[x["arquivo"]] = x
    return {"leva": leva, "origem": str(origem), "quando": int(time.time()),
            "pecas": [por_arquivo[k] for k in sorted(por_arquivo)]}


def recortar_uma(origem: Path, destino: Path, peca: dict, tela: dict) -> tuple:
    """Recorta UMA peca, do zero ao arquivo gravado. Devolve (nome, achado, laudo, modo).

    ELA NAO TOCA EM CONTADOR NENHUM e nao escreve andamento: devolve o que achou, e quem
    soma e' o laco de fora, numa linha so'. E' isso que torna seguro rodar varias ao
    mesmo tempo, e e' tambem o que deixa a MESMA peca ser recortada aqui ou numa vaga da
    esteira (vaga_edicao.py), sem duas versoes do recorte para divergirem.
    """
    nome = str(peca.get("arquivo", ""))
    entrada = origem / nome
    if not entrada.is_file():
        return nome, None, {"arquivo": nome, "erro": "arquivo nao encontrado"}, None
    try:
        # O B-ROLL DE CADA PECA E' ACHADO NA HORA. Quando o Gabriel acertou o
        # retangulo de uma peca na tela, ele vem escrito no pedido e isto nao roda.
        achado = peca.get("broll") or acha_broll(entrada)
        # NADA DEVOLVIDO QUER DIZER "NAO CONSEGUI OLHAR", E NAO "TELA CHEIA".
        #
        # O `acha_broll` devolve uma ficha com `modo: tela cheia` quando ele OLHOU e
        # concluiu que o video e' tela cheia. Ele devolve nada em seis situacoes bem
        # diferentes: sem as bibliotecas de imagem, duracao ilegivel, o ffmpeg de
        # amostragem falhando, menos de tres quadros lidos, nenhuma linha util, ou
        # qualquer estouro no meio. Ate' 22/08/2026 esta linha somava as duas coisas
        # em "tela cheia", e a peca saia so' ampliada, com o card do outro perfil
        # inteiro dentro, contada como recorte pronto. Trava 3 do CLAUDE.md.
        modo = (achado or {}).get("modo") or "nao consegui olhar"
        # A FRASE DO CARD SAI ANTES DE O PRETO COBRIR TUDO. E' o unico lugar do
        # processo em que ela ainda existe, e a fase 3 do template precisa dela:
        # "pega essa frase, interpreta a frase, cria algo equivalente ou parecido".
        # Guardada como imagem, porque ler letra de video pede olho, e nao texto.
        if modo == "card":
            guardar_frase(entrada, achado,
                          destino / "_frases" / (Path(nome).stem + ".png"))
        laudo = recortar(entrada, destino / nome, achado,
                         destino / "_mascaras" / (Path(nome).stem + ".png"), tela)
    except Exception as e:                                          # noqa: BLE001
        # UMA PECA QUEBRADA NAO DERRUBA A LEVA. Sem este cerco a excecao subiria pela
        # piscina e as outras cento e seis morreriam junto com ela.
        return nome, None, {"arquivo": nome, "erro": str(e)[:200]}, None
    laudo["arquivo"] = nome
    return nome, achado, laudo, modo


def ficha_da_peca(nome: str, achado: dict | None, laudo: dict, modo) -> dict:
    """A linha da ficha `_origem.json` de uma peca recortada, num formato so'.

    Uma peca recortada aqui e uma recortada numa vaga da esteira precisam chegar na
    MESMA ficha, senao o passo 3 leria duas verdades diferentes.
    """
    return {"arquivo": nome, "origem": nome, "modo": modo,
            "frase": ("_frases/" + Path(nome).stem + ".png")
                     if modo == "card" else None,
            "quadro": laudo.get("quadro"),
            # ONDE O B-ROLL ESTA' NO QUADRO, em fracao, para o editor do passo
            # 3 desenhar a moldura dele sem ter de abrir o video.
            "broll": None if not achado else
                     {k: round(achado[k], 5) for k in ("x", "y", "w", "h")},
            "mascara": ("_mascaras/" + Path(nome).stem + ".png")
                       if laudo.get("mascara") else None}


def cumprir_recorte(caminho: Path, p: dict) -> None:
    """PASSO 2: recorta o B-roll de todas as pecas da leva e deixa a ficha de origem.

    O QUE ESTE PASSO RESOLVE. Antes, o template era o passo 2 e o recorte acontecia
    espremido dentro dele, obrigado a caber na proporcao da moldura. Dava errado por
    construcao: cada reel poe o B-roll num tamanho diferente, e forcar todos na mesma
    proporcao cortava pedaco de uns e sobrava nos outros. Agora o recorte vem ANTES e nao
    deve satisfacao a template nenhum. Quem manda na forma e' o B-roll.

    A FICHA DE ORIGEM E' OBRIGATORIA, e foi pedido explicito: "tem que ter uma linkagem, o
    sistema tem que saber exatamente qual e' o video original". Ela fica em
    `_origem.json`, ao lado dos recortes, e diz por peca de qual arquivo bruto ela veio,
    que retangulo foi tirado e onde ele ficou no quadro. O passo 3 le' essa ficha em vez
    de procurar o B-roll de novo.
    """
    pid = p.get("id") or caminho.stem
    origem = LEVAS / str(p.get("pasta", ""))
    destino = RECORTES / str(p.get("destino") or p.get("pasta", ""))
    tela = p.get("tela") or {"w": 1080, "h": 1920}
    pecas = p.get("pecas") or []

    if not origem.is_dir():
        andamento(pid, {"id": pid, "erro": f"nao achei a pasta {origem.name}", "fim": True})
        arquivar(caminho, p, 0, 0, 0)   # sai da fila: ver a nota em cumprir_escrever
        return

    # LEVA GRANDE VAI PARA A ESTEIRA, desde 25/08/2026: ver o bloco "a esteira de
    # edicao". Falhando o despacho, o caminho local de sempre continua daqui.
    if despacho_vale(pecas, p) and despachar(caminho, p, "recorte"):
        return
    if _disco_apertado(pid):
        arquivar(caminho, p, 0, 0, 0)
        return

    # O PARALELISMO E' DA PLACA, e nao da maquina: o proprio comentario do
    # AO_MESMO_TEMPO mediu que na CPU rodar varias juntas nao ganha nada (98% com uma
    # so'). Na casa da VPS nao ha' placa, entao ali vai uma de cada vez, e o numero
    # tres continua valendo onde ha' Quick Sync. Auditoria de 25/08/2026.
    juntas = AO_MESMO_TEMPO if placa_de_video() else 1
    print(f"pedido {pid}: recortar o B-roll de {len(pecas)} pecas de {origem.name}, "
          f"{juntas} de cada vez")
    destino.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    feitos = falhas = cards = 0
    cegas = 0          # nao deu para olhar o video: nao e' tela cheia, e' nao sei
    resultados = [None] * len(pecas)
    # UMA LETRA POR PECA, e e' isto que a barra da tela desenha. Ate' 25/08/2026 o
    # andamento so' mandava contagem, entao a barra era uma tarja que enchia e o Gabriel
    # nao gostava dela. Com uma marca por peca a barra diz de uma vez QUANTAS sao,
    # quantas ja' foram e QUAIS deram problema, sem texto ao lado.
    #
    # SAO CENTO E OITENTA LETRAS numa leva de cento e oitenta pecas: cabe folgado no
    # arquivo que ja' se reescreve a cada peca, e nao ha' o que economizar aqui.
    #   .  ainda nao chegou a vez        c  recortada pelo card
    #   v  sem card, foi o video inteiro  ?  nao consegui olhar o video
    #   f  falhou
    marcas = ["."] * len(pecas)
    andamento(pid, {"id": pid, "tipo": "recorte", "total": len(pecas), "feitos": 0,
                    "falhas": 0, "atual": "", "fim": False, "segundos": 0,
                    "juntas": juntas, "marcas": "".join(marcas)})

    # O TRABALHO DE UMA PECA MORA EM `recortar_uma`, la' em cima, fora desta funcao:
    # e' a mesma rotina que a vaga da esteira roda (vaga_edicao.py), para o recorte
    # local e o despachado nunca divergirem.
    with ThreadPoolExecutor(max_workers=juntas) as piscina:
        futuros = {piscina.submit(recortar_uma, origem, destino, p, tela): i
                   for i, p in enumerate(pecas)}
        for pronto in as_completed(futuros):
            onde = futuros[pronto]
            nome, achado, laudo, modo = pronto.result()
            resultados[onde] = (nome, achado, laudo, modo)
            if laudo.get("erro"):
                falhas += 1
                marcas[onde] = "f"
                print(f"  {feitos + falhas}/{len(pecas)} {nome}: {laudo['erro']}")
            else:
                feitos += 1
                if modo == "card":
                    cards += 1
                    marcas[onde] = "c"
                elif modo == "nao consegui olhar":
                    cegas += 1     # ver a nota em `modo`, mais acima
                    marcas[onde] = "?"
                else:
                    marcas[onde] = "v"
                print(f"  {feitos + falhas}/{len(pecas)} {nome}: {modo}, "
                      f"{laudo['segundos']}s, {laudo['bytes'] / 1e6:.1f} MB")
            andamento(pid, {"id": pid, "tipo": "recorte", "total": len(pecas),
                            "feitos": feitos, "falhas": falhas, "atual": nome,
                            "fim": False, "segundos": round(time.time() - t0),
                            "juntas": juntas, "marcas": "".join(marcas)})
            renovar_tranca()   # leva local longa nao pode envelhecer a propria tranca

    # A FICHA SAI NA ORDEM DO PEDIDO, e nao na ordem em que as pecas terminaram. Com
    # varias rodando juntas a terceira pode acabar antes da primeira, e esta ficha e' o
    # que o passo 3 le' para saber de qual bruto veio cada peca.
    diario, ficha = [], []
    for item in resultados:
        if not item:
            continue
        nome, achado, laudo, modo = item
        diario.append(laudo)
        if laudo.get("erro"):
            continue
        ficha.append(ficha_da_peca(nome, achado, laudo, modo))

    try:
        velha = None
        try:
            velha = json.loads((destino / "_origem.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass                       # primeira ficha desta pasta, nada a fundir
        (destino / "_origem.json").write_text(json.dumps(
            fundir_ficha(velha, p.get("leva"), origem, ficha),
            ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError as e:
        print(f"  nao consegui escrever a ficha de origem: {e}")

    gasto = round(time.time() - t0)
    andamento(pid, {"id": pid, "tipo": "recorte", "total": len(pecas), "feitos": feitos,
                    "falhas": falhas, "atual": "", "fim": True, "segundos": gasto,
                    "pasta": str(destino), "cards": cards, "cegas": cegas,
                    "marcas": "".join(marcas), "diario": diario})
    arquivar(caminho, p, feitos, falhas, gasto)
    print(f"  {feitos} recortadas, {falhas} falharam, {gasto//60} min {gasto%60} s"
          f"  ({cards} com card, {feitos - cards - cegas} de tela cheia,"
          f" {cegas} que nao consegui medir)")
    print(f"  em {destino}")


# ============================================================ A IA QUE ESCREVE

IA_FICHA = CASA / "ia.json"

# O PROMPT PADRAO, e ele mora aqui e nao no meio do codigo por um motivo: e' o unico
# lugar do sistema onde uma palavra muda o resultado de cento e sete pecas. Fica visivel,
# fica editavel na tela, e o que esta' escrito aqui e' so' o comeco.
PROMPT_DESCRICAO = (
    "Voce escreve a legenda de um post de Instagram de uma pagina de noticias.\n"
    "Abaixo vem a legenda ORIGINAL do post de onde este video veio.\n"
    "Escreva uma legenda NOVA sobre o mesmo assunto, com as suas palavras.\n"
    "REGRAS:\n"
    "1. Mesmo assunto, mesmo sentido, texto seu. Nao copie frases da original.\n"
    "2. No maximo {limite} caracteres, contando tudo.\n"
    "3. Portugues do Brasil, direto. Sem hashtag, sem emoji, sem aspas.\n"
    "4. Primeira linha: o fato principal. Depois, no maximo duas frases de contexto.\n"
    "5. Nao invente numero, nome nem data que nao esteja na original.\n"
    "6. Se a original nao disser nada de concreto, responda exatamente: SEM ASSUNTO.\n"
    "Responda so com a legenda.\n\n"
    "LEGENDA ORIGINAL:\n{original}"
)

# O FECHO QUE VAI EM TODA LEGENDA, igual em todas as pecas da leva. Pedido dele:
# "depois disso a gente coloca um padrao pra toda a descricao, por exemplo com CTA,
# pedindo pra seguir". Vem no pedido; este e o valor de partida.
RODAPE_PADRAO = "Siga para acompanhar."

PROMPT_PADRAO = (
    "Voce le a frase de um card de noticia e escreve OUTRA frase equivalente, para um "
    "perfil diferente publicar.\n"
    "REGRAS:\n"
    "1. Mesma noticia, mesmo sentido, palavras diferentes.\n"
    "2. Uma linha so, no maximo {limite} caracteres.\n"
    "3. Portugues do Brasil, direto, sem aspas, sem emoji, sem hashtag.\n"
    "4. Nao invente numero, nome nem data que nao esteja na imagem.\n"
    "5. Se a imagem nao tiver frase legivel, responda exatamente: SEM FRASE.\n"
    "Responda SO com a frase."
)

# OS SERVICOS QUE ENTRAM, e todos tem plano gratuito e leem imagem. Cada um e' so' um
# endereco e um formato de corpo; trocar de um para o outro nao muda mais nada no
# sistema, e e' por isso que a reserva funciona.
SERVICOS = {
    "gemini": {
        "nome": "Google Gemini",
        "modelo": "gemini-2.0-flash",
        "url": ("https://generativelanguage.googleapis.com/v1beta/models/"
                "{modelo}:generateContent"),
        "espera": 4.2,
        # O TETO DO DIA AQUI E' POR MODELO, E NAO POR CHAVE, e isso vale uma leva inteira.
        # MEDIDO NA CHAVE DO GABRIEL em 22/08/2026: quando o teto estoura, o Google devolve
        # a etiqueta `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, e o proprio nome
        # dela diz onde o teto mora. Sao vinte por dia CADA MODELO, e o catalogo daquela
        # chave lista trinta e dois que servem para esta tarefa. Ate' aqui uma recusa de
        # cota aposentava a chave inteira: vinte pedidos, a leva de 107 parava, e trinta e
        # um modelos ficavam intactos do lado sem nunca serem tentados.
        "cota_por_modelo": True,
    },
    "groq": {
        "nome": "Groq",
        "modelo": "meta-llama/llama-4-scout-17b-16e-instruct",
        "url": "https://api.groq.com/openai/v1/chat/completions",
        # O TETO DIARIO DO GROQ TAMBEM E' POR MODELO, e eu tinha escrito o contrario aqui.
        # MEDIDO NA CHAVE DO GABRIEL em 22/08/2026, na leva de verdade: a recusa foi
        # ``Rate limit reached for model `qwen/qwen3.6-27b` ... on tokens per day (TPD):
        # Limit 200000, Used 199979``. O teto que para a leva e' de FICHAS por dia, de
        # CADA MODELO, e nao os mil pedidos da chave: naquele instante restavam 966 dos
        # 1.000 pedidos e a leva parou assim mesmo, na peca 37 de 91. Um card custa cerca
        # de 1.500 fichas, entao 200.000 fichas dao umas 130 pecas por dia por modelo.
        "cota_por_modelo": True,
        # DEZ SEGUNDOS, E O NUMERO SAI DE CONTA E NAO DE PALPITE. O teto do Groq nao e' de
        # pedidos por minuto, e' de FICHAS por minuto: 8000, dito por ele mesmo no cabecalho
        # da resposta. Um card custa cerca de 1.300 fichas de leitura mais 15 de escrita,
        # entao cabem uns seis por minuto. A 2,2 s ele mandava vinte e sete por minuto e
        # batia no teto quase sempre, e cada batida custava um descanso inteiro.
        "espera": 10.0,
    },
    "openrouter": {
        "nome": "OpenRouter",
        # CONFERIDO NO CATALOGO DO OPENROUTER em 21/08/2026: o antigo padrao daqui,
        # `meta-llama/llama-3.2-11b-vision-instruct:free`, saiu do ar sem aviso. E' outro
        # motivo para a lista da tela vir do servico, e nao de uma linha escrita aqui.
        "modelo": "google/gemma-4-31b-it:free",
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "espera": 3.2,
    },
}

# QUANTO SE ESPERA ENTRE UM PEDIDO E OUTRO NA MESMA CHAVE. E' `espera` de cada servico
# acima, e sai do teto por minuto do plano gratuito: o Gemini aceita quinze por minuto, o
# Groq trinta, o OpenRouter vinte. Sem esse compasso uma leva de cento e sete dispara tudo
# de uma vez, leva 429 na terceira peca e queima a fila inteira de chaves em segundos por
# um limite que so' precisava de quatro segundos de paciencia.
#
# DESCANSO E ESGOTAMENTO SAO COISAS DIFERENTES, e confundir as duas custa chave boa. Um
# 429 pode ser o teto do MINUTO, que passa sozinho, ou o teto do DIA, que nao passa. Aqui
# a primeira recusa poe a chave para descansar noventa segundos; so' depois de tres
# recusas seguidas, sem nenhum acerto no meio, ela e' dada como esgotada ate' amanha.
DESCANSO = 90
RECUSAS_ATE_ESGOTAR = 3


def ler_ia() -> dict:
    """A ficha da IA, escrita pela tela, sempre devolvida no formato de fila.

    ELA MUDOU DE FORMA EM 21/08/2026. Antes eram dois campos, principal e reserva, e o
    Gabriel pediu o que faltava: "eu preciso ter um sistema de rotacionamento, caso alguma
    chave bata o limite". Duas chaves nao sao um rodizio, sao um plano B. Agora e' uma
    FILA, do tamanho que ele quiser.

    A FICHA ANTIGA CONTINUA SENDO LIDA, e vira fila de duas na entrada. Ninguem precisa
    reconfigurar nada por causa de uma mudanca minha.
    """
    try:
        d = json.loads(IA_FICHA.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"chaves": [], "prompt": ""}
    if not isinstance(d, dict):
        return {"chaves": [], "prompt": ""}
    if isinstance(d.get("chaves"), list):
        d["chaves"] = [c for c in d["chaves"] if isinstance(c, dict) and c.get("chave")]
        return d
    fila = []
    for i, parte in enumerate([d, d.get("reserva") or {}]):
        if parte.get("chave"):
            fila.append({"id": parte.get("id") or f"k{i + 1}",
                         "servico": parte.get("servico") or "gemini",
                         "chave": parte["chave"], "modelo": parte.get("modelo") or ""})
    return {"chaves": fila, "prompt": d.get("prompt") or ""}


class SemCota(Exception):
    """O servico recusou por limite. E' o caso em que a reserva entra.

    ELE COSTUMA DIZER QUANTO ESPERAR, e ignorar isso custa caro. O Groq responde "Please
    try again in 8.7s" quando e' o teto de fichas do minuto, e o programa punia com noventa
    segundos de castigo, dez vezes mais do que o proprio servico pediu.
    """

    def __init__(self, recado: str = "", espere: float = 0.0, completo: str = ""):
        super().__init__(recado)
        self.espere = espere
        # DO MINUTO OU DO DIA, e a diferenca decide o destino da chave. Sao dois tetos
        # diferentes com o mesmo codigo 429, e trata-los igual custava o dia inteiro:
        # tres engasgos do teto do MINUTO, que passam em nove segundos, marcavam a chave
        # como esgotada ate' o dia virar. Os dois recados sao textuais e conferidos:
        #   Groq:   "on tokens per minute (TPM): Limit 8000, Used 5992"
        #   Google: "GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit: 20"
        # O TEXTO INTEIRO E' QUEM DECIDE, e nao o pedaco que vai para a tela. Ver a nota
        # dentro do `pedir_a_ia`, no corte do corpo da resposta.
        self.completo = completo or recado
        self.por_minuto = bool(POR_MINUTO.search(self.completo))
        self.por_dia = bool(POR_DIA.search(self.completo))
        achou = QUAL_MODELO.search(self.completo)
        self.modelo = (achou.group(1) or achou.group(2) or "").strip() if achou else ""
        self.motivo = motivo_da_recusa(self.completo)


# AS BORDAS DE PALAVRA ESTAVAM COMO CARACTERE DE CONTROLE INVISIVEL, resto de um `\b`
# escrito fora de uma string crua em alguma reforma antiga. Com o caractere no lugar da
# borda, `TPM`, `RPM`, `PerDay` e `RPD` nunca casavam com nada: sobrava so' o
# `per[ _-]?day` para carregar o discriminador inteiro. Achado em 22/08/2026 por uma
# varredura de caractere invisivel, que virou trava no `conferir.py`.
# QUAL MODELO O SERVICO CITOU NA RECUSA. O Google escreve `model: gemini-3.7-flash` e o
# Groq escreve ``for model `qwen/qwen3.6-27b```. As duas formas entram aqui, e o nome que
# ele devolve importa: pedindo `gemini-flash-latest`, o Google responde citando
# `gemini-3.7-flash`. Sao o mesmo modelo com dois nomes.
QUAL_MODELO = re.compile(r"\bmodel[\"']?\s*[:=]\s*[\"'`]?([\w./-]+)"
                         r"|\bfor model\s+[`\"']([\w./-]+)[`\"']", re.I)

# DE QUAL TETO O SERVICO ESTA' FALANDO, em palavras que o Gabriel le'. Sai do texto que
# ele mesmo mandou, e nao de suposicao: sao quatro tetos diferentes, e saber qual bateu
# muda o que fazer. Fichas por minuto passa sozinho em segundos; fichas por dia so' zera
# amanha; pedidos por dia deste modelo se resolve trocando de modelo na mesma chave.
#
# A ORDEM IMPORTA: a primeira regra que casar ganha, e as mais especificas vem antes.
TETOS = [
    (re.compile(r"tokens?[ _-]?per[ _-]?day|\bTPD\b", re.I),
     "o teto de fichas por dia deste modelo"),
    (re.compile(r"tokens?[ _-]?per[ _-]?minute|\bTPM\b", re.I),
     "o teto de fichas por minuto"),
    (re.compile(r"PerDayPerProjectPerModel|RequestsPerDayPerModel", re.I),
     "o teto de pedidos por dia deste modelo"),
    (re.compile(r"requests?[ _-]?per[ _-]?day|\bRPD\b|PerDay", re.I),
     "o teto de pedidos por dia"),
    (re.compile(r"requests?[ _-]?per[ _-]?minute|\bRPM\b|PerMinute", re.I),
     "o teto de pedidos por minuto"),
]


def motivo_da_recusa(texto: str) -> str:
    """Em uma frase, qual teto estourou. Vazio quando o servico nao disse qual."""
    for regra, frase in TETOS:
        if regra.search(texto or ""):
            return frase
    return ""


POR_MINUTO = re.compile(r"per[ _-]?minute|\bTPM\b|\bRPM\b", re.I)
POR_DIA = re.compile(r"per[ _-]?day|\bPerDay|\bRPD\b|dai?ly", re.I)
# CADA SERVICO ESCREVE A ESPERA DE UM JEITO: o Groq diz "Please try again in 8.729s" e o
# Google diz "Please retry in 24.558911399s". As duas formas entram aqui.
QUANTO_ESPERAR = re.compile(r"(?:try again|retry)\s+in\s+([\d.]+)\s*s", re.I)


def quanto_esperar(detalhe: str) -> float:
    m = QUANTO_ESPERAR.search(detalhe or "")
    return min(float(m.group(1)) + 1.0, 120.0) if m else 0.0


# COMO CADA SERVICO DIZ "EU NAO LEIO IMAGEM". Sao 400 com texto diferente em cada um, e
# nenhum deles usa um codigo proprio. Medido no Groq em 22/08/2026 com `allam-2-7b`.
SEM_OLHO = re.compile(
    r"content must be a string"
    r"|does not support (?:image|vision|multimodal)"
    r"|image (?:input )?(?:is )?not supported"
    r"|invalid[_ ]image", re.I)


class ModeloCego(Exception):
    """O modelo existe e responde, mas nao le' imagem.

    MEDIDO NA CHAVE DO GABRIEL em 22/08/2026: mandando um PNG para `allam-2-7b`, o Groq
    responde 400 com `messages[0].content must be a string`. Nao e' modelo morto nem chave
    sem cota: e' um modelo que so' le' texto, e este sistema PRECISA de olho, porque a frase
    original do card so' existe como imagem.

    POR QUE VIROU UMA EXCECAO PROPRIA. Sem ela esse 400 caia como erro comum e o modelo
    continuava escolhido: as noventa pecas seguintes bateriam no mesmo 400, uma a uma, e a
    leva terminaria inteira em branco. O catalogo do Groq daquela chave tem oito modelos e
    so' UM que enxerga, entao a chance de o rodizio cair num cego e' alta. Anotado, ele nunca
    mais e' tentado, nem hoje nem depois.
    """


class ModeloRuim(Exception):
    """O modelo pedido nao existe mais, ou nao vale para esta conta.

    ISTO NAO E' PROBLEMA DA CHAVE, e por isso nao pode derrubar a chave. Em 21/08/2026 o
    Google respondeu ao Gabriel: "This model models/gemini-2.5-flash is no longer available
    to new users. Please update your code to use models/gemini-3.6-flash". A chave estava
    perfeita; morto estava o nome que eu tinha escrito no codigo. Quando isso acontece, o
    certo e' trocar de MODELO, e nao de chave.
    """


class ServicoOcupado(Exception):
    """Os servidores do servico estao cheios agora. Isto passa sozinho.

    NAO E' CULPA DA CHAVE, e por isso nao conta recusa nem esgota ninguem. O Gabriel
    recebeu, em 21/08/2026: "This model is currently experiencing high demand. Spikes in
    demand are usually temporary. Please try again later." Marcar a chave dele por causa
    disso seria queimar uma chave boa por um minuto ruim do outro lado.
    """


MORREU = re.compile(
    r"no longer available|not found|does not exist|decommission|deprecat|unsupported",
    re.I)
OCUPADO = re.compile(
    r"high demand|overload|unavailable|try again later|capacity|busy|temporarily", re.I)

# QUANTO ESPERAR QUANDO O SERVICO ESTA' CHEIO. Pico de demanda costuma passar em segundos,
# nao em minutos, e por isso esta espera e' curta perto do DESCANSO de quem bateu no teto.
ESPERA_DO_OCUPADO = 20


# O TETO DE FICHAS, e nada mais que isso.
#
# ELE ERA 200, e por isso vinha "sem texto (motivo: MAX_TOKENS)": o modelo nao cabia no
# orcamento e devolvia o quadro vazio. Subir o teto nao muda como a IA trabalha, muda so' o
# quanto ela pode escrever antes de ser cortada.
#
# E NADA ALEM DISSO. Eu tinha acrescentado um campo que desligava o raciocinio do modelo, e
# o Gabriel cortou na hora: "deixa a IA gratuita funcionar normal". Estava certo: mexer no
# funcionamento dela para caber num teto meu e' consertar o lado errado.
TETO_DE_FICHAS = 4096

# O MODELO DO GROQ PARA DE PENSAR EM VOZ ALTA, e isto foi decidido com o Gabriel, com
# numero na mesa e nao por conta propria.
#
# O QUE FOI MEDIDO, mesma chave, mesmo card, em 22/08/2026:
#   como estava   700 fichas queimadas, resposta VAZIA, cortada no meio do raciocinio
#   sem pensar     15 fichas, "Bancos levam bolsa a alta de 2% na terca"
# A leva de 107 pecas daquele dia terminou com 4 escritas e 101 falhas por causa disso.
#
# ELE JA' TINHA ME BARRADO NISTO UMA VEZ, e com razao: naquela hora eu mexia no
# funcionamento da IA para contornar um erro meu, um teto de 200 fichas que eu mesmo tinha
# posto. Aqui e' outra coisa: sem isto o Groq nao entrega frase nenhuma, e o Groq e' a unica
# chave dele com folego para uma leva inteira (1000 pedidos por dia, contra 20 do Gemini
# gratuito). Perguntei antes de aplicar, e a resposta foi "pode".
#
# E SO' NO GROQ. O Gemini nao recebe campo nenhum a mais: ele ja' responde certo.
SEM_PENSAR_ALTO = {"groq": {"reasoning_effort": "none"}}

# QUEM SOU EU, dito ao servico. Sem esta linha o Groq responde "403: error code: 1010", que
# nem e' do Groq: e' do Cloudflare na frente dele, barrando o Python por ele nao se
# apresentar. Medido em 22/08/2026, com a chave do Gabriel: sem cabecalho, 403 nas duas
# tentativas; com cabecalho, respondeu na primeira. A tela nunca sofreu disso porque o
# navegador se apresenta sozinho, e por isso "Provar" funcionava e a leva nao.
QUEM_SOU = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")


# O QUE E' A FRASE E O QUE E' O MODELO PENSANDO ALTO.
#
# O modelo que o Gabriel escolheu no Groq comeca a resposta com uma etiqueta <think> e
# despeja dentro dela o proprio raciocinio, em ingles, antes de entregar a frase. Isso
# iria escrito em cima do video.
#
# ISTO NAO MEXE NO FUNCIONAMENTO DA IA, que e' regra dele: "deixa a IA gratuita funcionar
# normal". Ela continua pensando como quiser; o que muda e' que o pensamento nao vai parar
# na peca. Limpar a resposta e' trabalho de quem recebe, nao do outro lado.
# O FECHAMENTO TEM DE SER O MESMO DA ABERTURA, e ate' 22/08/2026 esta linha nao tinha um
# fechamento de verdade: no lugar de `</\1>` havia um caractere de controle invisivel,
# resto de um `\1` escrito fora de uma string crua em alguma reforma antiga. Como ele
# nunca casa, o efeito era o CONTRARIO do que a linha promete: a etiqueta nao era cortada,
# a linha de baixo via a resposta ainda comecando com `<think>` e zerava o texto inteiro.
# A frase estava certa e ja' tinha sido paga em cota, e voltava como "o servico respondeu
# sem texto".
PENSANDO = re.compile(r"<(think|thinking|reasoning)>.*?</\1>", re.I | re.S)
PENSANDO_SEM_FIM = re.compile(r"^\s*<(think|thinking|reasoning)>.*", re.I | re.S)


def so_a_frase(texto: str) -> str:
    t = PENSANDO.sub("", texto or "")
    if PENSANDO_SEM_FIM.match(t):          # ficou aberto: o teto de fichas cortou no meio
        t = ""
    return t.strip().strip('"').strip()


def pedir_a_ia(servico: str, chave: str, modelo: str, prompt: str,
               imagem: bytes | None, sem_ajuste: bool = False) -> tuple:
    """Manda o pedido e devolve a frase. Levanta SemCota quando bateu no teto.

    SAO TRES FORMATOS DE CORPO para um pedido so', porque cada servico tem o seu. O que
    muda e' o envelope; o miolo, o prompt e a imagem, e' o mesmo nos tres.
    """
    import urllib.error
    import urllib.request

    ficha = SERVICOS.get(servico) or SERVICOS["gemini"]
    modelo = modelo or ficha["modelo"]
    url = ficha["url"].format(modelo=modelo)
    b64 = base64.b64encode(imagem).decode() if imagem else None
    cabeca = {"Content-Type": "application/json", "User-Agent": QUEM_SOU}

    if servico == "gemini":
        partes = [{"text": prompt}]
        if b64:
            partes.append({"inline_data": {"mime_type": "image/png", "data": b64}})
        corpo = {"contents": [{"parts": partes}],
                 "generationConfig": {"temperature": 0.9,
                                      "maxOutputTokens": TETO_DE_FICHAS}}
        url += "?key=" + chave
    else:
        conteudo = [{"type": "text", "text": prompt}]
        if b64:
            conteudo.append({"type": "image_url",
                             "image_url": {"url": "data:image/png;base64," + b64}})
        corpo = {"model": modelo, "temperature": 0.9,
                 "max_tokens": TETO_DE_FICHAS,
                 "messages": [{"role": "user", "content": conteudo}]}
        if not sem_ajuste:
            corpo.update(SEM_PENSAR_ALTO.get(servico) or {})
        cabeca["Authorization"] = "Bearer " + chave

    pedido = urllib.request.Request(
        url, data=json.dumps(corpo).encode("utf-8"), headers=cabeca, method="POST")
    limites = {}
    try:
        with urllib.request.urlopen(pedido, timeout=60) as r:
            limites = limites_do_cabecalho(r.headers)
            d = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        # O CORPO INTEIRO PARA DECIDIR, E O PEDACO CURTO PARA MOSTRAR.
        #
        # ISTO APAGAVA O RODIZIO DE MODELO INTEIRO, e so' apareceu quando o Gabriel rodou
        # a leva de verdade em 22/08/2026. A recusa do Google tem 1.363 letras, e o
        # `quotaId`, que diz QUAL teto estourou, mora por volta da letra 900. Cortando em
        # 300, o discriminador recebia so' o comeco generico ("You exceeded your current
        # quota") e respondia por_minuto=False e por_dia=False. Sem `por_dia`, o rodizio
        # nunca era chamado: tres recusas e a chave inteira saia da fila, com trinta e um
        # modelos dela intactos ao lado. O que estava escondido depois do corte:
        #
        #   quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit: 20,
        #   model: gemini-3.7-flash, Please retry in 37.904550451s
        #
        # O `Please retry in` tambem ficava depois do corte, entao todo castigo virava os
        # noventa segundos do padrao em vez dos trinta e oito que o servico pediu.
        #
        # QUATRO MIL LETRAS E' O TETO DE LEITURA, e nao ha' recusa maior que isso em
        # nenhum dos tres servicos. O pedaco curto continua sendo o que vai para a tela.
        inteiro = e.read().decode("utf-8", "replace")[:4000]
        detalhe = inteiro[:300]
        # MODELO QUE NAO ENXERGA nao pode virar erro comum: se ele continuar escolhido,
        # as pecas seguintes batem todas no mesmo 400. Ver a classe `ModeloCego`.
        if e.code == 400 and imagem is not None and SEM_OLHO.search(inteiro):
            raise ModeloCego(f"{modelo}: {detalhe[:180]}")
        if e.code == 400 and not sem_ajuste and re.search(r"reasoning", detalhe, re.I):
            # MODELO QUE NAO ENTENDE O CAMPO nao pode virar erro: tenta sem ele e segue.
            return pedir_a_ia(servico, chave, modelo, prompt, imagem, True)
        if e.code in (429, 402):
            raise SemCota(f"{e.code}: {detalhe}", quanto_esperar(inteiro),
                          completo=inteiro)
        if e.code >= 500 or OCUPADO.search(inteiro):
            raise ServicoOcupado(f"{e.code}: {detalhe[:180]}")
        if e.code == 404 or MORREU.search(inteiro):
            raise ModeloRuim(f"{modelo}: {detalhe[:180]}")
        raise RuntimeError(f"{e.code}: {detalhe[:180]}")
    except Exception as e:
        raise RuntimeError(str(e)[:180])

    try:
        if servico == "gemini":
            texto = d["candidates"][0]["content"]["parts"][0]["text"].strip()
        else:
            texto = d["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        texto = ""
    texto = so_a_frase(texto)
    if not texto:
        raise RuntimeError("o servico respondeu sem texto: " + str(d)[:150])
    return texto, limites


def limites_do_cabecalho(cab) -> dict:
    """O que o servico informa de cota na resposta, quando informa.

    CUIDADO COM FALSO POSITIVO, que foi pedido expresso: "muito cuidado com os falsos
    positivos". Entao aqui nao se estima nada. O Groq manda quanto resta e quando zera; o
    Gemini nao manda. Quando nao vem, nao vem, e a tela diz isso com todas as letras em
    vez de inventar uma barra bonita.
    """
    fora = {}
    for chave, nome in (("x-ratelimit-limit-requests", "teto_pedidos"),
                        ("x-ratelimit-remaining-requests", "restam_pedidos"),
                        ("x-ratelimit-reset-requests", "zera_pedidos"),
                        ("x-ratelimit-limit-tokens", "teto_fichas"),
                        ("x-ratelimit-remaining-tokens", "restam_fichas")):
        v = cab.get(chave)
        if v:
            fora[nome] = v
    return fora


# COMO SE ESCOLHE OUTRO MODELO, e a regra e' a mesma da tela, de proposito: as duas
# pontas precisam concordar, senao o que ele escolhe na tela nao e' o que roda aqui.
# NENHUMA VERSAO APARECE ESCRITA: a ordem sai do catalogo da chave dele, com o mais novo na
# frente, `flash` antes de `pro`, e nome limpo antes de `preview`.
OUTRA_FUNCAO = re.compile(
    r"embedding|imagen|veo|image-generation|tts|speech|audio|whisper|guard|safety"
    r"|moderat|rerank|aqa|learnlm|robotics|live-", re.I)
FAMILIA_QUE_VE = re.compile(r"gemini|gemma|llama-4|scout|maverick|vision|-vl|omni|pixtral",
                            re.I)


def peso_do_modelo(nome: str) -> int:
    n = nome.lower()
    p = 0
    if not FAMILIA_QUE_VE.search(n):
        p += 1000
    if re.search(r"preview|exp|thinking|-\d{3,4}$", n):
        p += 200
    if re.search(r"lite|nano|small|mini|8b|4b", n):
        p += 60
    if re.search(r"\bpro\b|-pro", n):
        p += 20
    v = re.search(r"(\d+)\.(\d+)", n)
    if v:
        p -= int(v.group(1)) * 100 + int(v.group(2))
    return p


def listar_modelos(servico: str, chave: str) -> list:
    """O catalogo daquela chave, ja' na ordem que serve para esta tarefa."""
    import urllib.error
    import urllib.request
    if servico == "gemini":
        url = ("https://generativelanguage.googleapis.com/v1beta/models?key="
               + urllib.parse.quote(chave))
        cabeca = {}
    elif servico == "groq":
        url = "https://api.groq.com/openai/v1/models"
        cabeca = {"Authorization": "Bearer " + chave}
    else:
        url = "https://openrouter.ai/api/v1/models"
        cabeca = {}
    cabeca["User-Agent"] = QUEM_SOU
    try:
        with urllib.request.urlopen(
                urllib.request.Request(url, headers=cabeca), timeout=30) as r:
            d = json.loads(r.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError):
        return []
    if servico == "gemini":
        nomes = [str(m.get("name", "")).replace("models/", "")
                 for m in d.get("models") or []
                 if "generateContent" in (m.get("supportedGenerationMethods") or [])]
    elif servico == "groq":
        nomes = [str(m.get("id", "")) for m in d.get("data") or []]
    else:
        nomes = [str(m.get("id", "")) for m in d.get("data") or []
                 if str(m.get("id", "")).endswith(":free")
                 and "image" in ((m.get("architecture") or {})
                                 .get("input_modalities") or [])]
    nomes = [n for n in nomes if n and not OUTRA_FUNCAO.search(n)]
    nomes.sort(key=lambda n: (peso_do_modelo(n), n))
    return nomes


class Rodizio:
    """A fila de chaves, girando conforme cada uma bate no teto.

    O PEDIDO, com as palavras dele: "eu preciso ter um sistema de rotacionamento, caso
    alguma chave, alguma coisa aqui bata o limite".

    COMO ELE GIRA. A primeira chave saudavel da fila atende. Enquanto ela atender, e' ela
    que atende, e isso e' de proposito: trocar de servico no meio da leva troca tambem o
    jeito de escrever, e as pecas sairiam com vozes diferentes sem ninguem ter pedido.
    Quando ela recusa por cota, descansa e a proxima assume. Tres recusas seguidas sem
    acerto no meio e ela sai da fila ate' o dia virar.

    O ESTADO ATRAVESSA AS PECAS, e por isso ele mora num objeto e nao dentro do laco: sem
    isso a peca 51 tentaria de novo a chave que a peca 50 acabou de derrubar, e a leva
    gastaria uma recusa por peca ate' o fim.
    """

    def __init__(self, ia: dict):
        self.chaves = list(ia.get("chaves") or [])
        agora = time.time()
        # QUEM JA' ESTAVA ESGOTADA HOJE nao volta para a fila so' porque a leva recomecou.
        gasto = ler_uso()
        self.estado = {}
        for i, c in enumerate(self.chaves):
            ficha = (gasto.get("chaves") or {}).get(self._id(c, i)) or {}
            self.estado[self._id(c, i)] = {
                "esgotada": bool(ficha.get("esgotada")),
                "recusas": int(ficha.get("recusas_seguidas", 0)),
                "quando": 0.0, "ultimo_pedido": agora - 999, "castigo": 0.0,
                # QUAL MODELO ESTA' EM USO E QUAIS JA' ACABARAM HOJE, os dois lidos da conta
                # do dia. Sem isso, reiniciar o programa recomecava pelo modelo esgotado e
                # gastava um pedido so' para redescobrir o que ja' se sabia.
                "modelo": str(ficha.get("modelo_agora") or ""),
                "gastos": set(ficha.get("modelos_gastos") or []),
                # O QUE JA' SE SABE SOBRE OS OLHOS DE CADA MODELO. Ver `anotar_olho`.
                "cegos": set(gasto.get("cegos") or []),
                "videntes": set(gasto.get("videntes") or []),
                "catalogo": None,
                "ja_trocou": False,
            }
        self.vez = 0

    @staticmethod
    def _id(c: dict, i: int) -> str:
        return str(c.get("id") or f"k{i + 1}")

    def vivas(self) -> int:
        return sum(1 for i, c in enumerate(self.chaves)
                   if not self.estado[self._id(c, i)]["esgotada"])

    def _trocar_de_modelo(self, servico: str, c: dict, est: dict):
        """Troca de MODELO na mesma chave, quando o teto do dia e' por modelo.

        POR QUE ISTO EXISTE. Ate' 22/08/2026 uma recusa de cota diaria aposentava a chave
        inteira, e no Gemini isso era jogar fora quase tudo: o teto de vinte por dia e' de
        CADA MODELO, e a chave do Gabriel lista trinta e dois que servem. Vinte pecas e a
        leva de cento e sete parava, com trinta e um modelos intactos ao lado.

        A LISTA VEM DO SERVICO, e nao de uma linha escrita aqui. E' a trava 6 do CLAUDE.md,
        e ela ja' cobrou o preco duas vezes: em 21/08 o padrao do OpenRouter saiu do ar sem
        aviso, e em 22/08 o Google respondeu que `gemini-2.5-flash` nao existe mais para
        contas novas.

        CATALOGO VAZIO NAO E' CATALOGO SEM SOBRA. Se o servico nao responder a lista, isto
        devolve nada e quem chamou aposenta a chave, como antes. Chutar nome de modelo
        daria erro em toda peca que faltasse, e o erro apareceria como se fosse da chave.
        """
        if not (SERVICOS.get(servico) or {}).get("cota_por_modelo"):
            return None
        atual = (est.get("modelo") or c.get("modelo")
                 or (SERVICOS.get(servico) or {}).get("modelo", ""))
        if atual:
            est["gastos"].add(atual)
        if est.get("catalogo") is None:
            try:
                est["catalogo"] = listar_modelos(servico, c.get("chave", "")) or []
            except Exception:
                est["catalogo"] = []
        # QUEM ENXERGA VEM PRIMEIRO, e quem ja' provou nao enxergar nao entra.
        #
        # O CATALOGO JA' VEM ORDENADO por `peso_do_modelo`, que poe a familia que le'
        # imagem na frente. Mas ordenar nao basta: no Groq daquela chave sao oito modelos
        # e so' um enxerga, entao o rodizio caia direto num cego assim que o unico bom
        # acabava. Aqui ele pula os que ja' se sabe cegos, e so' desce para os de fora da
        # familia depois de ter tentado todos os de dentro.
        fora = est.get("gastos") | est.get("cegos", set())
        sobra = [m for m in est["catalogo"] if m not in fora]
        # TRES DEGRAUS: primeiro quem JA' PROVOU que enxerga, depois quem tem cara de
        # quem enxerga, e so' entao o resto. Medida vale mais que palpite sobre o nome.
        provados = [m for m in sobra if m in est.get("videntes", set())]
        veem = [m for m in sobra if FAMILIA_QUE_VE.search(m)]
        for m in (provados or veem or sobra):
            est["modelo"] = m
            return m
        return None

    def escrever(self, prompt: str, imagem: bytes | None) -> tuple:
        """Devolve (frase, servico, id da chave). Levanta RuntimeError quando ninguem pode.

        DESCANSANDO NAO E' MORTA, e essa diferenca vale uma leva inteira. Se todas as
        chaves estiverem apenas de castigo pelo teto do minuto, esperar noventa segundos
        termina o trabalho; desistir joga fora as pecas que faltavam. Por isso, quando
        ninguem pode agora mas alguem podera' em breve, ele espera em vez de falhar.
        """
        if not self.chaves:
            raise RuntimeError("sem chave de IA configurada")
        ultimo = "nenhuma chave respondeu"
        for paciencia in range(3):
            dito, ultimo, descansando = self._uma_volta(prompt, imagem, ultimo)
            if dito is not None:
                return dito
            if descansando is None:
                break                       # ninguem vai voltar: nao ha' o que esperar
            time.sleep(max(0.05, descansando))
        raise RuntimeError(ultimo)

    def _uma_volta(self, prompt, imagem, ultimo):
        """Percorre a fila UMA vez, do lugar onde parou. Nao mexe em `self.vez` no meio.

        POR QUE NAO MEXE: mexer era um erro meu, e o teste o pegou. O indice da volta saia
        de `self.vez`, e mudar `self.vez` dentro do laco fazia a volta seguinte pular uma
        chave: com tres chaves, a primeira recusava e a terceira atendia, e a segunda nunca
        era tentada.
        """
        inicio, quantas = self.vez, len(self.chaves)
        volta_ao = None                     # daqui a quanto tempo a mais proxima acorda
        for passo in range(quantas):
            i = (inicio + passo) % quantas
            c = self.chaves[i]
            cid = self._id(c, i)
            est = self.estado[cid]
            if est["esgotada"]:
                continue
            agora = time.time()
            falta = ((est.get("castigo") or DESCANSO) - (agora - est["quando"])
                     if est["quando"] else 0)
            if falta > 0:
                volta_ao = falta if volta_ao is None else min(volta_ao, falta)
                continue                    # ainda de castigo pelo ultimo 429
            servico = c.get("servico") or "gemini"
            # O COMPASSO DA MESMA CHAVE, para nao bater no teto do minuto a toa.
            espera = float((SERVICOS.get(servico) or {}).get("espera", 3.0))
            atraso = espera - (agora - est["ultimo_pedido"])
            if atraso > 0:
                time.sleep(min(atraso, espera))
            est["ultimo_pedido"] = time.time()
            try:
                dito, limites = pedir_a_ia(servico, c.get("chave", ""),
                                           est.get("modelo") or c.get("modelo", ""),
                                           prompt, imagem)
            except ModeloCego as e:
                # NAO E' FALHA DA CHAVE, e' um modelo que nao serve para esta tarefa.
                # Anota, troca por outro da MESMA chave e volta ja': ver `ModeloCego`.
                cego = est.get("modelo") or c.get("modelo") or ""
                print(f"    {cid}: {cego} nao le' imagem, nunca mais tento nele")
                anotar_olho(cego, False)
                est.setdefault("cegos", set()).add(cego)
                est["gastos"].add(cego)
                outro = self._trocar_de_modelo(servico, c, est)
                if outro:
                    print(f"    {cid}: vou de {outro} agora")
                    anotar_uso(cid, servico, False, modelo_agora=outro,
                               modelos_gastos=sorted(est["gastos"]))
                    volta_ao = 0.05 if volta_ao is None else min(volta_ao, 0.05)
                    ultimo = f"{servico}: troquei de modelo para {outro}"
                    continue
                est["esgotada"] = True
                est["motivo"] = "nenhum modelo desta chave lê a imagem do card"
                anotar_uso(cid, servico, False, esgotada=True,
                           motivo=est["motivo"])
                ultimo = f"{servico}: nenhum modelo desta chave le' imagem"
            except ModeloRuim as e:
                # MODELO MORTO NAO DERRUBA A CHAVE. Pergunta ao servico o que ele tem hoje,
                # pega o primeiro que serve e tenta de novo com a MESMA chave. Foi o caso
                # do Gabriel: o Google mandou trocar `gemini-2.5-flash` por outro, e nada
                # havia de errado com a chave dele.
                print(f"    modelo caiu em {cid}: {e}")
                achou = None
                for m in listar_modelos(servico, c.get("chave", "")):
                    if m != (est.get("modelo") or c.get("modelo", "")):
                        achou = m
                        break
                if achou and not est.get("ja_trocou"):
                    est["modelo"] = achou
                    est["ja_trocou"] = True       # uma troca por chave, e nao um rodizio
                    print(f"    troquei o modelo de {cid} para {achou}")
                    ultimo = f"{servico}: troquei de modelo para {achou}"
                    return self._uma_volta(prompt, imagem, ultimo)
                anotar_uso(cid, servico, False)
                ultimo = f"{servico}: {e}"
            except ServicoOcupado as e:
                # NAO ANOTA NADA, de proposito: a chave nao fez nada de errado. So' marca
                # de quanto em quanto tempo vale a pena voltar, e segue para a proxima da
                # fila, que pode ser de outra empresa e estar livre.
                volta_ao = (ESPERA_DO_OCUPADO if volta_ao is None
                            else min(volta_ao, ESPERA_DO_OCUPADO))
                ultimo = f"{servico} ocupado agora ({e})"
            except SemCota as e:
                # ENGASGO DO MINUTO NAO CONTA CONTRA A CHAVE. Ele passa sozinho em segundos
                # e nao diz nada sobre o saldo do dia.
                if not e.por_minuto:
                    est["recusas"] += 1
                # O MOTIVO EM PORTUGUES VAI PARA A CONTA DO DIA, e dai' para a tela: sao
                # quatro tetos diferentes, e "bateu o limite" nao diz qual nem o que fazer.
                est["motivo"] = getattr(e, "motivo", "") or est.get("motivo", "")
                if e.por_dia:
                    # O TETO DO DIA PODE SER DO MODELO, E NAO DA CHAVE. Antes de aposentar
                    # a chave, pergunta se ha' outro modelo dela para hoje. A medicao esta'
                    # em `_trocar_de_modelo`.
                    #
                    # O NOME QUE O SERVICO CITOU ENTRA NA LISTA DOS GASTOS. Pedindo
                    # `gemini-flash-latest`, o Google recusa citando `gemini-3.7-flash`:
                    # sao o mesmo modelo com dois nomes, e sem esta linha o rodizio trocaria
                    # um pelo outro e bateria no mesmo teto, gastando um pedido para nada.
                    citado = getattr(e, "modelo", "")
                    if citado:
                        est["gastos"].add(citado)
                    outro = self._trocar_de_modelo(servico, c, est)
                    if outro:
                        est["recusas"] = 0
                        est["quando"] = 0.0
                        est["castigo"] = 0.0
                        print(f"    {cid}: o modelo bateu no teto do dia, "
                              f"vou de {outro} agora")
                        anotar_uso(cid, servico, False, sem_cota=True, recusas=0,
                                   modelo_agora=outro,
                                   modelos_gastos=sorted(est["gastos"]),
                                   motivo=est.get("motivo") or "")
                        # VOLTA JA', e nao daqui a noventa segundos: nao ha' castigo a
                        # cumprir, o modelo novo esta' com a cota inteira do dia. Sem esta
                        # linha, com uma chave so' na fila a volta terminaria sem ninguem
                        # para esperar e a peca seria descartada tendo um modelo pronto.
                        volta_ao = 0.05 if volta_ao is None else min(volta_ao, 0.05)
                        ultimo = f"{servico}: troquei de modelo para {outro}"
                        continue
                    est["recusas"] = RECUSAS_ATE_ESGOTAR   # o proprio servico ja' avisou
                est["quando"] = time.time()
                # O CASTIGO E' O QUE O SERVICO PEDIU, quando ele diz. Noventa segundos por
                # um teto que zera em nove e' jogar fora um minuto e meio a cada tropeco.
                est["castigo"] = float(getattr(e, "espere", 0.0)) or DESCANSO
                if est["recusas"] >= RECUSAS_ATE_ESGOTAR:
                    est["esgotada"] = True
                    print(f"    chave {cid} ({servico}) esgotada por hoje")
                else:
                    volta_ao = (est["castigo"] if volta_ao is None
                                else min(volta_ao, est["castigo"]))
                anotar_uso(cid, servico, False, sem_cota=True,
                           esgotada=est["esgotada"], recusas=est["recusas"],
                           modelo_agora=(est.get("modelo") or None),
                           modelos_gastos=(sorted(est["gastos"]) if est["gastos"] else None),
                           motivo=est.get("motivo") or "")
                ultimo = f"{servico} sem cota ({e})"
            except RuntimeError as e:
                anotar_uso(cid, servico, False)
                ultimo = f"{servico}: {e}"
            else:
                est["recusas"] = 0
                est["quando"] = 0.0
                # RESPONDEU TENDO RECEBIDO IMAGEM: esta' provado que enxerga, e este
                # modelo passa a ser preferido nas trocas seguintes. Ver `anotar_olho`.
                usado = est.get("modelo") or c.get("modelo") or ""
                if imagem is not None and usado and usado not in est.get("videntes", set()):
                    est.setdefault("videntes", set()).add(usado)
                    anotar_olho(usado, True)
                anotar_uso(cid, servico, True, recusas=0, limites=limites)
                self.vez = i        # deu certo: fica nesta, para a voz nao mudar no meio
                return (dito, servico, cid), ultimo, None
        return None, ultimo, volta_ao


IA_USO = CASA / "ia-uso.json"


_TRAVA_DO_USO = threading.Lock()


def ler_uso() -> dict:
    """A conta do dia. Vira folha nova quando o dia vira, e e' isso que faz a chave
    esgotada voltar para a fila amanha sem ninguem mexer em nada."""
    hoje = time.strftime("%Y-%m-%d")
    try:
        d = json.loads(IA_USO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    # QUEM NAO LE' IMAGEM CONTINUA NAO LENDO AMANHA, entao esta lista atravessa a virada
    # do dia. Todo o resto e' conta do dia e zera: cota volta, cegueira nao.
    def lista(nome):
        x = d.get(nome) if isinstance(d, dict) else None
        return x if isinstance(x, list) else []
    if not isinstance(d, dict) or d.get("dia") != hoje:
        return {"dia": hoje, "pedidos": 0, "sem_cota": 0, "erros": 0, "chaves": {},
                "cegos": lista("cegos"), "videntes": lista("videntes")}
    d.setdefault("chaves", {})
    d.setdefault("cegos", [])
    d.setdefault("videntes", [])
    return d


def anotar_olho(modelo: str, ve: bool) -> None:
    """Guarda se este modelo le' imagem ou nao. Vale para sempre, e nao so' hoje.

    DUAS LISTAS, E AS DUAS SAO MEDIDAS. `cegos` sai de um 400 dizendo que o modelo nao
    aceita imagem; `videntes` sai de uma resposta que veio DEPOIS de uma imagem ter sido
    mandada. Nenhuma das duas e' palpite sobre o nome do modelo, e e' por isso que elas
    valem mais que a regra de familia: `qwen/qwen3.6-27b` nao tem cara de quem enxerga e
    escreveu as 37 frases da leva 29 lendo o card.

    ATRAVESSAM A VIRADA DO DIA porque cegueira nao volta a meia-noite, e nem a visao.
    """
    if not modelo:
        return
    with _TRAVA_DO_USO:
        d = ler_uso()
        aqui = d.setdefault("videntes" if ve else "cegos", [])
        outra = d.setdefault("cegos" if ve else "videntes", [])
        if modelo not in aqui:
            aqui.append(modelo)
        if modelo in outra:
            outra.remove(modelo)      # a medida nova manda na antiga
        try:
            IA_USO.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass


def anotar_uso(cid: str, servico: str, ok: bool, sem_cota: bool = False,
               esgotada: bool = False, recusas: int | None = None,
               limites: dict | None = None, modelo_agora: str | None = None,
               modelos_gastos: list | None = None, motivo: str | None = None) -> None:
    """Soma mais um pedido na conta do dia, e na conta DAQUELA chave.

    E' A CONTA DO QUE SAIU DAQUI, e nao do saldo que sobra la'. Nenhum dos tres servicos
    publica quanto resta por programa, entao prometer "faltam tantas" seria invencao. O
    que da' para saber com certeza e' quantos pedidos esta chave atendeu hoje, quantos
    voltaram recusados por cota, e se ela ainda esta' de pe'.

    POR CHAVE E NAO SO' NO TOTAL, porque com rodizio o total nao responde a pergunta que
    importa: qual delas ainda funciona.
    """
    with _TRAVA_DO_USO:
        d = ler_uso()
        d["pedidos"] = int(d.get("pedidos", 0)) + 1
        if sem_cota:
            d["sem_cota"] = int(d.get("sem_cota", 0)) + 1
        elif not ok:
            d["erros"] = int(d.get("erros", 0)) + 1
        c = d["chaves"].setdefault(cid, {"pedidos": 0, "sem_cota": 0, "erros": 0,
                                         "esgotada": False, "recusas_seguidas": 0})
        c["pedidos"] = int(c.get("pedidos", 0)) + 1
        c["servico"] = servico
        if sem_cota:
            c["sem_cota"] = int(c.get("sem_cota", 0)) + 1
        elif not ok:
            c["erros"] = int(c.get("erros", 0)) + 1
        else:
            c["ultimo_acerto"] = int(time.time())
        if recusas is not None:
            c["recusas_seguidas"] = int(recusas)
        if limites:
            c["limites"] = limites
        # QUAL MODELO ESTA' EM USO E QUAIS JA' ACABARAM HOJE. Fica na conta do dia porque e'
        # ela que vira folha nova quando o dia vira: sem isso, a chave voltaria amanha ainda
        # achando que trinta e dois modelos dela estao esgotados.
        if modelo_agora is not None:
            c["modelo_agora"] = modelo_agora
        if modelos_gastos is not None:
            c["modelos_gastos"] = list(modelos_gastos)
        # QUAL TETO BATEU, em palavras. Sem isto a tela so' sabia dizer "bateu o limite",
        # e os tetos pedem coisas diferentes: um passa em segundos, outro so' zera amanha,
        # e outro se resolve trocando de modelo na mesma chave.
        if motivo:
            c["motivo"] = motivo
        if ok:
            c.pop("motivo", None)
        c["esgotada"] = bool(esgotada) or (bool(c.get("esgotada")) and not ok)
        if ok:
            c["esgotada"] = False
        d["ultimo"] = {"quando": int(time.time()), "servico": servico, "id": cid,
                       "ok": bool(ok)}
        try:
            IA_USO.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass


def cumprir_provar_ia(caminho: Path, p: dict) -> None:
    """Prova, do lado do programa, que o que a tela guardou chegou aqui e funciona.

    POR QUE ISTO EXISTE. O Gabriel cobrou o que faltava: "garanta que o que for feito aqui
    salva no back-end, impacta diretamente o back-end, porque nao pode ser front-end so'
    bonitinho". A tela ate' entao provava a chave falando ela mesma com o servico, o que
    prova a chave e nao prova o caminho. Aqui quem le' o arquivo e' este programa, quem
    monta a fila e' este programa, e quem chama a IA e' este programa. Se isto responder, o
    caminho inteiro esta' de pe'.
    """
    pid = p.get("id") or caminho.stem
    ia = ler_ia()
    n = len(ia.get("chaves") or [])
    andamento(pid, {"id": pid, "tipo": "provar-ia", "fim": False,
                    "passo": f"li o arquivo: {n} " + ("chave" if n == 1 else "chaves")})
    if not n:
        andamento(pid, {"id": pid, "fim": True,
                        "erro": "o arquivo ia.json nao tem chave nenhuma"})
        arquivar(caminho, p, 0, 1, 0)
        return

    frase = "Bolsa fecha em alta de 2% nesta terca, puxada pelos bancos"
    imagem = frase_em_imagem(frase)
    t0 = time.time()
    try:
        dito, servico, cid = Rodizio(ia).escrever(
            (ia.get("prompt") or PROMPT_PADRAO).replace("{limite}", "70"), imagem)
    except RuntimeError as e:
        andamento(pid, {"id": pid, "fim": True, "erro": str(e), "chaves": n})
        arquivar(caminho, p, 0, 1, round(time.time() - t0))
        return
    andamento(pid, {"id": pid, "fim": True, "chaves": n, "servico": servico,
                    "chave": cid, "frase": frase, "dito": dito,
                    "prompt_de": len(ia.get("prompt") or PROMPT_PADRAO),
                    "segundos": round(time.time() - t0, 1)})
    arquivar(caminho, p, 1, 0, round(time.time() - t0))
    print(f"prova da IA: {cid} ({servico}) respondeu: {dito[:70]}")


def frase_em_imagem(frase: str) -> bytes | None:
    """Desenha a frase numa imagem, que e' como a IA ve' o card de verdade."""
    try:
        import io
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    im = Image.new("RGB", (720, 200), (255, 255, 255))
    d = ImageDraw.Draw(im)
    fonte = achar_fonte("arial", True, 34)
    linha, y = "", 60
    for palavra in frase.split(" "):
        teste = (linha + " " + palavra).strip()
        if d.textlength(teste, font=fonte) > 660 and linha:
            d.text((30, y), linha, font=fonte, fill=(17, 17, 17))
            y += 46
            linha = palavra
        else:
            linha = teste
    d.text((30, y), linha, font=fonte, fill=(17, 17, 17))
    saco = io.BytesIO()
    im.save(saco, format="PNG")
    return saco.getvalue()


def originais_da_leva(pasta: str) -> dict:
    """A legenda original de cada peca, lida do `_lote.json` da leva.

    POR QUE A TELA NAO MANDA ISTO NO PEDIDO. Ela poderia, e a primeira versao mandava.
    So' que a legenda de 107 posts e' um pedido de meio megabyte trafegando por uma coisa
    que ja' esta' no disco, do lado. O arquivo e' a fonte; quem precisa dele le' dele.

    A CHAVE E' O NOME DO ARQUIVO, e ele sobrevive a leva inteira: o mesmo nome que sai da
    baixa entra no recorte, sai da montagem e chega aqui. Conferido em disco na leva 29.
    """
    if not pasta:
        return {}
    lote = LEVAS / pasta / "_lote.json"
    if not lote.is_file():
        print(f"  aviso: {pasta} nao tem _lote.json; esta leva veio sem a origem")
        return {}
    try:
        d = json.loads(lote.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"  nao consegui ler a origem de {pasta}: {e}")
        return {}
    fora = {}
    for x in (d.get("itens") or []):
        nome = x.get("arquivo_local")
        if nome:
            fora[nome] = {"legenda": (x.get("legenda") or "").strip(),
                          "endereco": x.get("endereco") or "",
                          "conta": x.get("conta") or ""}
    return fora


def cumprir_descrever(caminho: Path, p: dict) -> None:
    """ETAPA 4.1: a IA escreve a legenda do post a partir da legenda ORIGINAL.

    DE ONDE VEM A ORIGINAL: do `_lote.json` da leva, que o `baixar.py` grava e que desde
    23/08/2026 segue viagem junto com os videos. Ate essa data ele ficava para tras na
    pasta `brutos`, e a leva chegava sem saber de onde veio nenhuma peca.

    ISTO NAO PRECISA DE OLHO, e essa e a boa noticia da cota. A fase 3 manda uma IMAGEM
    para a IA ler a frase do card, entao so serve modelo que enxerga, e no catalogo dele
    sao poucos. Aqui vai texto puro: todo modelo serve, inclusive os que o rodizio marcou
    como cegos. E muito mais fila disponivel para o mesmo trabalho.

    O FECHO E COLADO DEPOIS, e nao pedido a IA. Pedir o CTA no prompt gastaria caracteres
    da cota para receber de volta um texto que ja se sabe qual e, e ainda sairia diferente
    em cada peca. Ele quer o mesmo fecho em todas.
    """
    pid = p.get("id") or caminho.stem
    pecas = p.get("pecas") or []
    limite = int(p.get("limite") or 500)
    # PEDIDO SEM A CHAVE `rodape` GANHA O PADRAO; vazio EXPLICITO continua querendo
    # dizer sem fecho. Era o que o comentario do RODAPE_PADRAO prometia e o codigo nao
    # cumpria: `or` engolia os dois casos. Auditoria de 25/08/2026.
    rodape = ((p["rodape"] or "") if "rodape" in p else RODAPE_PADRAO).strip()
    ia = ler_ia()

    if not (ia.get("chaves") or []):
        andamento(pid, {"id": pid, "erro": "sem chave de IA: preencha na aba de "
                                           "Configuracoes", "fim": True})
        arquivar(caminho, p, 0, 0, 0)      # ver a nota em `cumprir_escrever`
        return
    rodizio = Rodizio(ia)
    if not rodizio.vivas():
        andamento(pid, {"id": pid, "erro": "todas as chaves ja bateram o limite hoje; "
                                           "acrescente outra ou espere o dia virar",
                        "fim": True})
        arquivar(caminho, p, 0, 0, 0)
        return

    base = ia.get("prompt_descricao") or PROMPT_DESCRICAO
    # A ORIGEM VEM DO DISCO quando o pedido nao a traz. Ver `originais_da_leva`.
    doLote = originais_da_leva(str(p.get("pasta") or ""))
    print(f"pedido {pid}: descrever {len(pecas)} pecas, {rodizio.vivas()} "
          f"{'chave' if rodizio.vivas() == 1 else 'chaves'} na fila")
    t0 = time.time()
    feitos = falhas = sem_original = 0
    parou_por = ""
    saida, diario = {}, []

    # A LEGENDA PAGA NAO PODE EVAPORAR, e o descrever ganhou em 25/08/2026 as duas
    # protecoes que o escrever ja' tinha: cada legenda aceita vai no andamento (a tela
    # grava no rascunho na hora, e um F5 no meio nao joga fora o que a cota ja' pagou)
    # e num arquivo ao lado da leva, para queda de processo tambem nao perder nada.
    guardadas_em = LEVAS / str(p.get("pasta") or "") / "_descricoes.json"
    for i, peca in enumerate(pecas, 1):
        nome = str(peca.get("arquivo", ""))
        andamento(pid, {"id": pid, "tipo": "descrever", "total": len(pecas),
                        "feitos": feitos, "falhas": falhas,
                        "sem_original": sem_original, "atual": nome,
                        "fim": False, "segundos": round(time.time() - t0),
                        "textos": saida})
        renovar_tranca()   # leva de IA e' longa; a tranca do dono vivo nao envelhece
        original = (peca.get("original") or "").strip()
        if not original:
            original = (doLote.get(nome) or {}).get("legenda", "").strip()
        # SEM ORIGINAL NAO SE PEDE NADA, pelo mesmo motivo da fase 3: pedido gasto para a
        # IA inventar do nada e cota jogada fora.
        if not original:
            sem_original += 1
            diario.append({"arquivo": nome,
                           "aviso": "esta peca nao tem legenda de origem para adaptar"})
            print(f"  {i}/{len(pecas)} {nome}: sem legenda de origem, nao gastei pedido")
            continue
        try:
            prompt = (base.replace("{limite}", str(limite))
                          .replace("{original}", original))
            texto, quem, cid = rodizio.escrever(prompt, None)
            texto = texto.strip().strip('"').strip()
            if texto.upper().startswith("SEM ASSUNTO"):
                texto = ""
        except RuntimeError as e:
            diario.append({"arquivo": nome, "erro": str(e)})
            print(f"  {i}/{len(pecas)} {nome}: {e}")
            falhas += 1
            # SO' SE PARA A LEVA QUANDO NAO HA' MAIS CHAVE VIVA, como o escrever ja'
            # faz: uma peca que todas as chaves recusam e' falha DELA, e as outras
            # cento e tantas seguem. O break incondicional parava a leva na peca 5
            # com "restantes" altos e nenhuma explicacao (auditoria de 25/08/2026).
            if not rodizio.vivas():
                parou_por = "As chaves da fila bateram o teto de hoje."
                break
            continue
        if texto:
            # O FECHO ENTRA AQUI, depois de a IA responder e antes de guardar.
            saida[nome] = (texto + ("\n\n" + rodape if rodape else "")).strip()
            feitos += 1
            print(f"  {i}/{len(pecas)} {nome}: {texto[:60]}")
            # A COPIA EM DISCO SAI A CADA LEGENDA, com o OSError engolido como nos
            # irmaos (_textos.json, _origem.json): telemetria nunca derruba trabalho.
            try:
                guardadas_em.write_text(json.dumps(saida, ensure_ascii=False,
                                                   indent=1), encoding="utf-8")
            except OSError:
                pass
        else:
            diario.append({"arquivo": nome, "aviso": "a IA nao achou assunto"})

    gasto = round(time.time() - t0)
    andamento(pid, {"id": pid, "tipo": "descrever", "total": len(pecas),
                    "feitos": feitos, "falhas": falhas,
                    "sem_original": sem_original, "fim": True,
                    "segundos": gasto, "parou_por": parou_por,
                    "restantes": len(pecas) - feitos,
                    "textos": saida, "diario": diario})
    arquivar(caminho, p, feitos, falhas, gasto)
    print(f"  {feitos} descritas, {falhas} falharam, {sem_original} sem original, "
          f"{gasto//60} min {gasto%60} s")


def nome_da_entrega(numero, contas: list) -> str:
    """"leva 29 de thenews.business", que foi a nomenclatura que ele pediu.

    ELE DEU O EXEMPLO em 23/08/2026: "botar uma nomenclatura ali especifica, por exemplo
    leva 29 de thenews.business". Com mais de uma conta na mesma leva, a primeira nomeia
    e o resto vira contagem: nome de pasta com seis arrobas dentro nao se le' de relance.
    """
    limpas = [c for c in (contas or []) if c]
    if not limpas:
        quem = "sem conta"
    elif len(limpas) == 1:
        quem = limpas[0]
    elif len(limpas) == 2:
        quem = f"{limpas[0]} e {limpas[1]}"
    else:
        quem = f"{limpas[0]} e mais {len(limpas) - 1}"
    return f"leva {numero} de {quem}"


# CARACTERES QUE O WINDOWS RECUSA EM NOME DE PASTA. Nao e' gosto meu: o sistema devolve
# "Invalid argument" e a entrega morre no meio, com metade das pecas empacotadas.
#
# E' UM CONJUNTO, E NAO UMA EXPRESSAO REGULAR, de proposito. A primeira versao era regex,
# e a barra invertida sumiu dela no caminho: cada camada por onde um remendo passa (shell,
# JSON, string do Python) come um nivel de escape, e o que chegou ao arquivo deixou a
# barra invertida PASSAR. Descricao com barra invertida viraria pasta dentro de pasta.
# Conjunto de caracteres nao tem escape para comer.
PROIBIDOS = frozenset(chr(92) + '/:*?"<>|')
# O NOME INTEIRO CABE EM 64. A conta e': a pasta da entrega ja' gastou uns 60 caracteres
# do caminho, o nome aparece DUAS vezes (pasta e video dentro dela) e o Windows corta em
# 260. Com 64, sobra folga de sessenta caracteres para leva com nome comprido.
NOME_MAXIMO = 64


def peneirar(texto: str) -> str:
    """Tira o que o Windows recusa em nome de arquivo: os nove proibidos e os de controle."""
    return "".join(c for c in (texto or "") if c not in PROIBIDOS and c >= " ")


def titulo_da_peca(descricao: str, quanto: int) -> str:
    """A primeira frase da descricao, cortada em palavra inteira.

    E' DAQUI QUE SAI O NOME LEGIVEL. Ate 24/08/2026 a pasta de cada peca se chamava
    `0004.52x_thenews.business_DMti-n6u4v8`, que e' o nome tecnico do arquivo: o
    multiplicador de desempenho, a conta e o codigo do post, colados por sublinhado.
    Ele leu isso no Drive e foi direto: "do jeito que ta' agora e' uma merda". E era:
    noventa e duas pastas com aquela cara, nenhuma dizendo o que tem dentro.

    CORTA EM PALAVRA, E NUNCA NO MEIO DELA. "MrBeast tem menos de um mi" nao e' titulo
    curto, e' titulo quebrado, e da' mais trabalho de ler do que o codigo que substituiu.
    """
    texto = (descricao or "").strip()
    if not texto:
        return ""
    # O FECHO NAO E' TITULO. Ele e' o mesmo em todas as pecas ("Siga para acompanhar."),
    # entao entra em cena depois do primeiro paragrafo e nunca deve virar nome de pasta.
    texto = texto.split(chr(10))[0].strip()
    fim = FIM_DE_FRASE.search(texto)
    if fim:
        texto = texto[:fim.start() + 1]
    texto = peneirar(texto).replace(chr(10), " ")
    texto = " ".join(texto.split()).strip(" .,;:-")
    if len(texto) > quanto:
        # CORTE NA ULTIMA PALAVRA INTEIRA que ainda cabe. "MrBeast tem menos de um mi"
        # nao e' titulo curto, e' titulo quebrado.
        pedaco = texto[:quanto]
        texto = (pedaco[:pedaco.rindex(" ")] if " " in pedaco else pedaco)
    return _sem_palavra_solta(texto)


# ONDE A PRIMEIRA FRASE ACABA, E NAO ONDE APARECE UM PONTO. Sao coisas diferentes, e a
# diferenca apareceu na primeira rodada: "John D. Rockefeller construiu..." virava a
# pasta "03 - thenews.business - John D", cortada na inicial do nome do sujeito.
#
# A REGRA E' EXIGIR DUAS LETRAS MINUSCULAS ANTES DO PONTO. Fim de frase de verdade vem
# depois de palavra inteira ("pessoal."); inicial de nome vem depois de um espaco e uma
# maiuscula sozinha ("D."), e essa nao passa.
FIM_DE_FRASE = re.compile(r"(?<=[a-zà-öø-ÿ0-9]{2})[.!?](?=\s|$)")

# PALAVRAS QUE NAO SEGURAM O FIM DE UM TITULO. Elas ligam duas ideias, entao sozinhas no
# fim ficam penduradas: "MrBeast afirmou que possui menos de um" espera a proxima palavra
# que o corte levou embora. Tirando-as, sobra "MrBeast afirmou que possui menos", que
# termina de pe'.
PENDURADAS = {"de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um",
              "uma", "uns", "umas", "o", "a", "os", "as", "para", "por", "pelo", "pela",
              "com", "sem", "que", "ao", "aos", "à", "às", "seu", "sua", "seus", "suas",
              "mais", "menos", "sobre", "entre", "apos", "após", "ate", "até", "como"}


def _sem_palavra_solta(texto: str) -> str:
    """Tira do fim as palavras que so' fazem sentido ligadas a' seguinte."""
    partes = texto.split()
    while len(partes) > 2 and partes[-1].lower().strip(",;:") in PENDURADAS:
        partes.pop()
    return " ".join(partes).strip(" .,;:-")


def nome_simples_da_peca(ordem: int, largura: int, conta: str, descricao: str,
                         arquivo: str) -> str:
    """"01 - thenews.business - MrBeast tem menos de um milhao em caixa".

    O MOLDE E' O DELE, dado em 24/08/2026: "traco 01, Daniel Business, pa pa pa... ou
    ate' mesmo o titulo da descricao pode ser". Sao as tres partes, nesta ordem: a
    posicao, de quem e', e do que se trata.

    O NUMERO E' A MESMA ORDEM DA TELA. A peca 1 aqui e' a peca 1 que ele viu passar no
    passo 3, uma por uma. Numerar por outro criterio (desempenho, data) faria a peca 7
    do Drive nao ser a peca 7 que ele lembra de ter aprovado.

    SEM DESCRICAO, O CODIGO DO POST FICA NO LUGAR DO TITULO. Ele autorizou codigo:
    "pode haver um codigo como tem agora". O que ele nao quer e' SO' codigo.
    """
    n = str(int(ordem)).zfill(max(2, largura))
    partes = [n]
    conta = peneirar((conta or "").strip())
    if conta:
        partes.append(conta)
    prefixo = " - ".join(partes) + " - "
    titulo = titulo_da_peca(descricao, NOME_MAXIMO - len(prefixo))
    if not titulo:
        # O CODIGO DO POST E' O ULTIMO PEDACO DO NOME TECNICO, depois do sublinhado.
        titulo = peneirar(Path(arquivo).stem.split("_")[-1]) or "sem titulo"
    # O WINDOWS TAMBEM RECUSA NOME TERMINADO EM PONTO OU ESPACO.
    return (prefixo + titulo).strip(" .")


def por_a_peca_na_pasta(video: Path, casa: Path, descricao: str) -> None:
    """Uma pasta por peca, com o video dentro e a descricao ao lado.

    LIGACAO ANTES DE COPIA. Copiar 107 videos e' repetir uns 600 MB no disco por leva sem
    precisar: no NTFS, `os.link` faz o mesmo arquivo aparecer nos dois lugares, ocupando
    o espaco uma vez so'. O rclone sobe uma ligacao dessas como sobe qualquer arquivo.

    E COPIA QUANDO A LIGACAO NAO DA'. Volume diferente, pasta em nuvem sincronizada,
    sistema de arquivos que nao suporta: cai para copia e ninguem fica sem a peca.
    """
    casa.mkdir(parents=True, exist_ok=True)
    # O VIDEO SE CHAMA COMO A PASTA. Pasta legivel com arquivo tecnico dentro so' adia o
    # problema: quem abre a pasta para pegar o video volta a ver `0004.52x_...` na tela.
    alvo = casa / (casa.name + video.suffix)
    if not alvo.exists():
        try:
            os.link(str(video), str(alvo))
        except (OSError, AttributeError):
            shutil.copy2(str(video), str(alvo))
    if descricao:
        (casa / "descricao.txt").write_text(descricao, encoding="utf-8")


def marcar_leva_entregue(numero, quantas: int, onde: str) -> str:
    """Escreve no acervo que esta leva foi entregue, e devolve o que deu.

    E' ISTO QUE ELE PEDIU NO FIM DA ETAPA 4: "a gente voltaria la' pra aba barra tabela de
    minerados e atualizaria aqui: olha, esse perfil aqui foi 100% concluido". A tabela le'
    a capa das levas, e nao o diario de cada uma, entao a marca vai nas duas: o diario
    conta a historia, a capa e' o que a coluna da tabela consegue ver.

    QUEM JA' FAZ ISTO E' O `guardar.py`, com "guardado". Aqui e' o passo seguinte, e por
    isso as funcoes dele sao importadas em vez de copiadas: duas escritas no mesmo arquivo
    do acervo, com dois codigos diferentes, e' como se perde um indice.
    """
    try:
        import guardar
    except ImportError as e:
        return f"nao consegui falar com o acervo: {e}"
    try:
        ficha = guardar.chave()
    except (OSError, SystemExit):
        return "nao achei a chave do GitHub; a marca no acervo ficou para depois"
    try:
        guardar.passo(int(numero), ficha, "entregue",
                      f"{quantas} pecas entregues em {onde}.")
        capa = guardar.api("/contents/dados/lotes/indice.json?ref=main", ficha)
        if not capa:
            return "nao achei a capa das levas no acervo"
        ind = json.loads(base64.b64decode(capa["content"]))
        mexeu = False
        for l in ind.get("lotes", []):
            if l.get("numero") == int(numero) and not l.get("entregue"):
                l["entregue"] = True
                mexeu = True
        if mexeu:
            guardar.api("/contents/dados/lotes/indice.json", ficha, "PUT", {
                "message": f"leva {numero}: entregue no Drive",
                "content": base64.b64encode(
                    json.dumps(ind, ensure_ascii=False, indent=1).encode()).decode(),
                "sha": capa["sha"]})
    except (OSError, ValueError, KeyError) as e:
        return f"a marca no acervo nao foi: {e}"
    except Exception as e:                      # noqa: BLE001  (rede: nunca derruba)
        return f"a marca no acervo nao foi: {e}"
    return ""


def quanto_ocupa(pastas: list) -> int:
    """Bytes de verdade, contando arquivo ligado uma vez so'.

    A PEGADINHA E' A LIGACAO. `por_a_peca_na_pasta` nao copia o video: liga o mesmo
    arquivo em dois lugares, e os dois lugares mostram o mesmo tamanho. Somar os dois
    diria que a entrega libera 1,2 GB quando ela libera 600 MB. Numero inflado num aviso
    de "espaco liberado" e' mentira que o disco desmente sozinho no dia seguinte.
    """
    vistos, total = set(), 0
    for pasta in pastas:
        if not pasta or not pasta.is_dir():
            continue
        for f in pasta.rglob("*"):
            try:
                if not f.is_file():
                    continue
                d = f.stat()
            except OSError:
                continue
            marca = (d.st_dev, d.st_ino)
            if d.st_ino and marca in vistos:
                continue
            if d.st_ino:
                vistos.add(marca)
            total += d.st_size
    return total


def apagar_o_local(pastas: list) -> tuple:
    """Apaga as pastas e devolve (megabytes_liberados, o_que_deu_errado).

    ORDEM DELE, EM 24/08/2026: "toda vez que for feito o processo de importar o material,
    entao a versao final dos videos para o Drive, a versao que tiver local, ela precisa
    ser apagada". Sao duas pastas: o pacote da entrega e a montagem que o originou. As
    duas guardam a VERSAO FINAL; o material bruto em `levas` e os `recortes` ficam.

    SO' E' CHAMADA COM A CONTAGEM DO DRIVE JA' CONFERIDA. Ver `cumprir_entregar`.
    """
    liberado = quanto_ocupa(pastas)
    problemas = []
    for pasta in pastas:
        if not pasta or not pasta.is_dir():
            continue
        try:
            shutil.rmtree(pasta)
        except OSError as e:
            problemas.append(f"{pasta.name}: {e}")
    if problemas:
        # SE SOBROU PASTA, O ESPACO NAO FOI LIBERADO. Dizer que foi seria o mesmo tipo de
        # relatorio falso que a etapa toda evita.
        return (0, "; ".join(problemas))
    return (round(liberado / (1024 * 1024)), "")


def cumprir_entregar(caminho: Path, p: dict) -> None:
    """ETAPA 4.2: empacota cada peca com a descricao dela e sobe para o Drive.

    O PEDIDO DELE, INTEIRO, em 23/08/2026: "compactar, separar cada video em sua devida
    pasta, e ai' dentro dessa pasta vai ter tanto o video quanto o arquivo ali da
    descricao desse video. Upar dentro de uma pasta do Drive, botar uma nomenclatura ali
    especifica. Depois a gente voltaria la' pra tabela de minerados e atualizaria: olha,
    esse perfil aqui foi 100% concluido".

    SAO TRES COISAS, E A ORDEM IMPORTA. Empacotar acontece sempre, porque e' local e nao
    depende de ninguem. Subir depende de o Drive estar autorizado. Marcar so' acontece se
    subiu: dizer "100% concluido" com os videos parados no disco e' relatorio falso, e
    relatorio falso e' pior que nao ter relatorio.

    O EMPACOTAMENTO VAI UMA PECA DE CADA VEZ, e continua assim mesmo com a fila
    indiana de 23/08/2026 revogada por ele em 25/08/2026. A revogacao valeu para a
    SUBIDA, que agora vai tres arquivos por vez dentro do drive.py; aqui o um-por-vez
    nao custa nada (empacotar e' os.link, sai instantaneo) e a deteccao de nome
    repetido depende da ordem.
    """
    pid = p.get("id") or caminho.stem
    numero = p.get("leva")
    edicao = str(p.get("edicao") or p.get("pasta") or "")
    descricoes = p.get("descricoes") or {}
    contas = p.get("contas") or []
    quer_subir = p.get("subir") is not False
    origem = EDICOES / edicao
    t0 = time.time()

    if not origem.is_dir():
        andamento(pid, {"id": pid, "erro": f"nao achei a pasta montada {edicao}",
                        "fim": True})
        arquivar(caminho, p, 0, 0, 0)
        return
    videos = sorted(origem.glob("*.mp4"))
    if not videos:
        andamento(pid, {"id": pid, "erro": f"a pasta {edicao} nao tem nenhuma peca",
                        "fim": True})
        arquivar(caminho, p, 0, 0, 0)
        return

    rotulo = nome_da_entrega(numero, contas)
    casa = ENTREGAS / rotulo
    # A PASTA DA ENTREGA NASCE LIMPA, sempre. O rotulo e' o mesmo em toda re-entrega,
    # e o empacote mantinha arquivo que ja' existia: depois de um "so' empacotar" e uma
    # re-montagem, a peca de mesmo nome subia com o VIDEO ANTIGO, e titulo mudado
    # deixava a pasta velha ao lado como sobra, tudo somando certo na contagem do
    # Drive. Zerar custa nada (o empacote e' os.link, refaz em instantes) e garante
    # que o que sobe e' exatamente o que esta' montado agora (auditoria de 25/08/2026).
    shutil.rmtree(casa, ignore_errors=True)
    print(f"pedido {pid}: entregar {len(videos)} pecas como '{rotulo}'")

    def contar(fase, feitos, total, extra=None):
        d = {"id": pid, "tipo": "entregar", "fase": fase, "feitos": feitos,
             "total": total, "fim": False, "rotulo": rotulo,
             "segundos": round(time.time() - t0)}
        if extra:
            d.update(extra)
        andamento(pid, d)
        renovar_tranca()   # a subida de uma leva e' longa; a tranca nao envelhece

    # ------------------------------------------------------------ 1. empacotar
    empacotadas = sem_descricao = 0
    diario = []
    # DE QUEM E' CADA PECA. Com uma conta so' na leva, e' ela em todas e nao ha' o que
    # procurar. Com mais de uma, o `_lote.json` e' quem sabe, peca por peca.
    doLote = originais_da_leva(f"leva-{numero}") if len(contas) > 1 else {}
    largura = len(str(len(videos)))
    usados = set()
    for i, v in enumerate(videos, 1):
        contar("empacotando", empacotadas, len(videos), {"atual": v.name})
        texto = (descricoes.get(v.name) or "").strip()
        if not texto:
            sem_descricao += 1
            diario.append({"arquivo": v.name, "aviso": "sobe sem descricao"})
        de_quem = ((doLote.get(v.name) or {}).get("conta")
                   or (contas[0] if contas else ""))
        nome = nome_simples_da_peca(i, largura, de_quem, texto, v.name)
        # DUAS PECAS PODEM DAR NO MESMO NOME, e duas manchetes parecidas cortadas no
        # mesmo ponto dao exatamente isso. Sem esta trava a segunda cairia dentro da
        # pasta da primeira e o Drive receberia 91 pastas onde deviam ir 92.
        if nome.lower() in usados:
            nome = f"{nome} ({i})"
        usados.add(nome.lower())
        try:
            por_a_peca_na_pasta(v, casa / nome, texto)
            empacotadas += 1
        except OSError as e:
            diario.append({"arquivo": v.name, "erro": str(e)})
            print(f"  {i}/{len(videos)} {v.name}: {e}")
    print(f"  {empacotadas} pecas empacotadas em {casa}"
          + (f", {sem_descricao} sem descricao" if sem_descricao else ""))

    # ------------------------------------------------------------ 2. subir
    subiu = {"ok": False, "erro": "", "feitos": 0}
    situacao = drive.situacao()
    # O TESTE INDECISO NAO IMPEDE A SUBIDA, e esta linha e' o conserto de 24/08/2026.
    #
    # O QUE ACONTECEU: o teste de autorizacao estourou o relogio, a entrega leu "nao
    # autorizado" e nem tentou subir. Foram 42 pecas empacotadas e paradas, e ele foi
    # olhar no Drive e nao achou nada. So' que quem tinha demorado era o TESTE: a subida
    # de verdade tem tres tentativas e relogio muito maior, e daria conta.
    #
    # DUVIDA SE RESOLVE TENTANDO, e nao desistindo. Se de fato faltar autorizacao, a
    # propria subida falha e diz; o custo de tentar e' um pedido perdido, e o custo de
    # nao tentar e' o trabalho inteiro parado sem motivo.
    indeciso = str(situacao.get("recado") or "").startswith(drive.INDECISO)
    if not quer_subir:
        subiu["erro"] = "voce pediu so' para empacotar"
    elif not situacao.get("autorizado") and not indeciso:
        # O MOTIVO DE VERDADE, E NAO UMA FRASE GENERICA.
        #
        # A primeira versao escrevia sempre "o Drive ainda nao foi autorizado", jogando
        # fora o `recado` que a `situacao` devolve. Em 23/08/2026 isso custou caro: ele
        # tinha autorizado quinze minutos antes, a entrega falhou, e a tela disse que
        # faltava autorizar. Com o motivo escondido, nem ele nem eu tinhamos como saber
        # se era falta de login, rede fora, tempo esgotado ou rclone sumido.
        #
        # SAO COISAS DIFERENTES E PEDEM COISAS DIFERENTES: falta de login pede um clique
        # dele; rede fora pede esperar. Mandar clicar em autorizar quem ja' autorizou e'
        # mandar refazer um trabalho que ja' esta' feito.
        porque = (situacao.get("recado") or "").strip()
        subiu["erro"] = porque or "o Drive nao respondeu, e nao disse por que"
        # O BOTAO DE AUTORIZAR SO' APARECE QUANDO E' ISSO QUE FALTA.
        subiu["autorizar"] = "conta do Google" in porque or "configurado" in porque
    else:
        if indeciso:
            print("  o teste do Drive nao respondeu a tempo; subindo assim mesmo")
        contar("subindo", 0, empacotadas)
        subiu = drive.subir(casa, rotulo,
                            aviso=lambda f, t: contar("subindo", f, t or empacotadas))
        print(f"  Drive: {'subiu' if subiu.get('ok') else subiu.get('erro')}")

    # ------------------------------------------------------------ 3. marcar
    # ---------------------------------- 3. CONFERIR, e so' entao marcar e apagar
    #
    # A AUDITORIA DE 24/08/2026 ACHOU A ORDEM ERRADA AQUI, e ela produzia relatorio falso.
    #
    # COMO ESTAVA: `marcar` rodava com `subiu["ok"]`, que e' o codigo de saida do rclone.
    # A conferencia do lado do Drive vinha DEPOIS, e so' servia para liberar o apagar.
    # Resultado: a leva era carimbada "100% concluida" na tabela de minerados com base na
    # palavra de quem acabou de subir, sem ninguem ter olhado do outro lado. Se a
    # conferencia falhasse em seguida, o carimbo ja' estava escrito e ninguem o desfazia.
    #
    # E O CARIMBO ERA O QUE ELE VIA. "So' pegou e constou la' que 92 foram upados. Isso
    # ta' completamente errado."
    #
    # AGORA A CONFERENCIA E' O PORTAO DAS DUAS COISAS. Marcar e apagar sao consequencias
    # de um fato verificado do lado de la', e nao de uma promessa deste lado.
    subiu_agora = int(subiu.get("feitos") or 0)
    conferidos = 0
    verificado = False
    porque_nao = ""
    if subiu.get("ok"):
        contar("conferindo", empacotadas, empacotadas)
        conferencia = drive.conferir(rotulo)
        if not conferencia.get("ok"):
            porque_nao = ("nao consegui conferir a pasta no Drive"
                          + (f": {conferencia['erro']}" if conferencia.get("erro")
                             else ""))
        else:
            conferidos = int(conferencia.get("quantos") or 0)
            # O PORTAO COMPARA COM O TOTAL DA LEVA, e nao com as empacotadas. A
            # auditoria de 25/08/2026 pegou o furo: uma peca que falhava no empacote
            # saia das duas pontas da conta, a leva era carimbada 100% com 106, e o
            # apagar levava embora a unica copia da 107a. Faltou peca, e' entrega
            # parcial: nada de carimbo, nada de apagar, e o motivo escrito.
            if empacotadas < len(videos):
                porque_nao = (f"{len(videos) - empacotadas} pecas falharam no "
                              "empacote; entrega parcial nao ganha carimbo")
            elif conferidos < len(videos):
                porque_nao = (f"o Drive respondeu {conferidos} videos, e a leva "
                              f"tem {len(videos)}")
            else:
                verificado = True

    marca = ""
    if verificado:
        contar("anotando", empacotadas, empacotadas)
        marca = marcar_leva_entregue(numero, empacotadas, drive.PASTA_NOME)
        if marca:
            print(f"  {marca}")

    # ------------------------------------------------- 4. apagar a copia daqui
    #
    # A ORDEM E' DELE, de 24/08/2026: subiu, apaga o que ficou no computador. O motivo
    # tambem e' dele, e e' concreto: em 23/08 o disco estava com 6,6 GB livres de 219, e
    # cada leva deixa umas centenas de megabytes de video final parado.
    #
    # MAS SO' DEPOIS DE PERGUNTAR AO DRIVE, e nao ao rclone que acabou de subir. Este e'
    # o unico lugar do sistema onde um engano apaga arquivo, entao a conferencia nao pode
    # passar pelo mesmo caminho que produziu o resultado: `drive.conferir` lista a pasta
    # do lado de la' e conta. So' bate, so' apaga.
    #
    # E' A LICAO DE 23/08 APLICADA A UM CASO ONDE ELA CUSTA CARO. Naquele dia a tela
    # disse quatro vezes "autorizado" porque perguntou a quem ja' tinha respondido. Ali
    # o preco foi uma tarde; aqui seria a leva inteira.
    # ---------------------------------- 4. apagar, com a conferencia ja' feita
    liberado_mb = 0
    apagou = False
    porque_nao_apagou = porque_nao and (porque_nao + "; nada foi apagado da casa")
    if verificado:
        contar("apagando", empacotadas, empacotadas)
        liberado_mb, erro_ao_apagar = apagar_o_local([casa, origem])
        apagou = not erro_ao_apagar
        if erro_ao_apagar:
            porque_nao_apagou = erro_ao_apagar
    if subiu.get("ok"):
        if porque_nao_apagou:
            print(f"  nao apaguei: {porque_nao_apagou}")
        else:
            print(f"  apaguei a copia daqui, {liberado_mb} MB livres")

    gasto = round(time.time() - t0)
    andamento(pid, {"id": pid, "tipo": "entregar", "fim": True, "rotulo": rotulo,
                    "total": len(videos), "feitos": empacotadas,
                    "sem_descricao": sem_descricao, "pasta": str(casa),
                    "onde": "entregas/" + rotulo,
                    # O QUE SUBIU E' O QUE O DRIVE CONFIRMOU, e nao o que o rclone
                    # disse. Ate' 24/08/2026 `subiu` era o codigo de saida do rclone, e a
                    # tela escrevia "Entregue no Drive" em cima dele. `rclone copy` sai
                    # com zero tambem quando NAO TRANSFERE NADA, porque o destino ja'
                    # tinha os arquivos: sucesso e zero transferencias sao a mesma
                    # resposta. Com o numero de empacotadas no lugar do de subidas, a
                    # tela dizia "92" em qualquer um dos casos.
                    "subiu": verificado,
                    "rclone_ok": bool(subiu.get("ok")),
                    # OS TRES NUMEROS SEPARADOS, porque sao tres coisas: quantas foram
                    # embrulhadas aqui, quantas o rclone transferiu nesta rodada, e
                    # quantas o Drive diz ter. Um so' numero escondia as diferencas.
                    "subiu_agora": subiu_agora, "conferidos": conferidos,
                    "verificado": verificado, "porque_nao": porque_nao,
                    "drive": subiu.get("erro", "") or porque_nao,
                    # COM QUE PROGRAMA E QUE CONFIGURACAO ELE TENTOU. Fica no registro
                    # da entrega mesmo quando da' certo: quando uma execucao falha e a
                    # outra funciona, sao estas duas linhas que dizem o que mudou.
                    "drive_programa": situacao.get("programa", ""),
                    "drive_config": situacao.get("config", ""),
                    "drive_detalhe": situacao.get("detalhe", ""),
                    "autorizar": bool(subiu.get("autorizar")),
                    "drive_pasta": drive.PASTA_NOME, "drive_link": drive.PASTA_LINK,
                    "marcado": bool(verificado and not marca), "marca": marca,
                    # O QUE ACONTECEU COM A COPIA DAQUI. A tela precisa dizer as tres
                    # coisas separadas: subiu, foi conferida, e o disco ficou mais leve.
                    # Juntar as tres numa frase so' e' como esconder qual delas falhou.
                    "apagou": apagou, "liberado_mb": liberado_mb,
                    "nao_apagou": porque_nao_apagou,
                    "segundos": gasto, "diario": diario})
    arquivar(caminho, p, empacotadas, len(videos) - empacotadas, gasto)
    print(f"  {empacotadas} entregues, {gasto//60} min {gasto%60} s")


def cumprir_escrever(caminho: Path, p: dict) -> None:
    """FASE 3 DO TEMPLATE: a IA le a frase do card de cada peca e escreve a nova.

    Ela le a IMAGEM da faixa que ficava acima do B-roll, guardada pelo passo 2 antes de o
    preto cobrir o quadro. E' o unico lugar onde a frase original ainda existe.
    """
    pid = p.get("id") or caminho.stem
    origem = RECORTES / str(p.get("pasta", ""))
    pecas = p.get("pecas") or []
    campos = p.get("campos") or []
    ia = ler_ia()

    if not (ia.get("chaves") or []):
        andamento(pid, {"id": pid, "erro": "sem chave de IA: preencha na aba de "
                                           "Configuracoes", "fim": True})
        # O PEDIDO SAI DA FILA MESMO QUANDO NAO DA' PARA CUMPRIR.
        #
        # SEM ISTO ELE FICAVA NA PASTA PARA SEMPRE, e a oficina passa la' de minuto em
        # minuto: a cada volta ela relia o mesmo pedido, via que nao dava, e escrevia o
        # mesmo erro por cima. Pior, virando o dia a cota voltava e o pedido velho era
        # cumprido sozinho, gastando o dia inteiro numa leva que ele talvez nem quisesse
        # mais. Quem manda de novo e' ele, no botao.
        arquivar(caminho, p, 0, 0, 0)
        return
    rodizio = Rodizio(ia)
    if not rodizio.vivas():
        andamento(pid, {"id": pid, "erro": "todas as chaves ja' bateram o limite hoje; "
                                           "acrescente outra ou espere o dia virar",
                        "fim": True})
        arquivar(caminho, p, 0, 0, 0)      # ver a nota logo acima
        return

    prompt_base = (ia.get("prompt") or PROMPT_PADRAO)
    print(f"pedido {pid}: escrever {len(pecas)} pecas, {rodizio.vivas()} "
          f"{'chave' if rodizio.vivas() == 1 else 'chaves'} na fila")
    t0 = time.time()
    feitos = falhas = 0
    sem_frase = 0          # nao tem card, nao tem frase, nao gasta pedido
    parou_por = ""
    saida, diario = {}, []

    for i, peca in enumerate(pecas, 1):
        nome = str(peca.get("arquivo", ""))
        # AS FRASES JA' ACEITAS VIAJAM EM TODO ANDAMENTO, e nao so' no fecho. A tela
        # grava cada frase no rascunho assim que a ve; se so' o fecho carregasse os
        # textos, um F5 no meio da escrita jogava fora frases ja' pagas com a cota
        # do dia. O `_textos.json` ao lado guarda o mesmo conteudo contra queda DESTA
        # oficina; este campo aqui guarda contra queda da TELA.
        andamento(pid, {"id": pid, "tipo": "escrever", "total": len(pecas),
                        "feitos": feitos, "falhas": falhas, "sem_frase": sem_frase,
                        "atual": nome, "textos": saida,
                        "fim": False, "segundos": round(time.time() - t0)})
        renovar_tranca()   # leva de IA e' longa; a tranca do dono vivo nao envelhece
        frase = origem / "_frases" / (Path(nome).stem + ".png")
        # A FRASE ILEGIVEL NAO DERRUBA A LEVA: um PNG rasgado no disco (queda no meio
        # da gravacao do recorte) virava OSError solto que matava a oficina inteira.
        try:
            imagem = frase.read_bytes() if frase.is_file() else None
        except OSError:
            imagem = None
        # SEM IMAGEM NAO HA' O QUE LER, E ENTAO NAO SE PEDE NADA.
        #
        # ISTO QUEIMAVA COTA PARA INVENTAR TEXTO. A peca so' tem `_frases/<nome>.png`
        # quando o passo 2 achou um card com faixa de frase; nas de tela cheia nao ha'
        # frase nenhuma. O pedido saia mesmo assim, sem parte de imagem, e a IA respondia
        # do nada: ou inventava uma manchete, ou dizia SEM FRASE. Nos dois casos um pedido
        # da cota do dia tinha sido gasto. Na leva 29 sao 15 pecas assim, de 107.
        #
        # E ELA SUMIA DA CONTA: sem excecao, `falhas` nao subia; sem texto, `feitos` nao
        # subia. A peca nao aparecia em lugar nenhum do fecho, e no dia seguinte o botao
        # pedia ela de novo, gastando de novo.
        if imagem is None:
            sem_frase += 1
            diario.append({"arquivo": nome, "aviso": "esta peca nao tem frase para ler"})
            print(f"  {i}/{len(pecas)} {nome}: sem frase para ler, nao gastei pedido")
            continue
        desta = {}
        for campo in campos:
            texto = ""
            try:
                # UM PROMPT SO', E ELE MORA NA ABA DE CONFIGURACOES. Havia um campo
                # por caixa pedindo "o que ela deve escrever aqui", e o Gabriel cortou:
                # "isso aqui nao faz sentido, tem que retirar isso". Abrir a caixa ja' era
                # a ordem; o resto e' o prompt, que e' um so' e esta' visivel.
                prompt = prompt_base.replace("{limite}", str(campo.get("limite", 90)))
                texto, quem, cid = rodizio.escrever(prompt, imagem)
                texto = texto.strip().strip('"').strip()
                if texto.upper().startswith("SEM FRASE"):
                    texto = ""
            except RuntimeError as e:
                diario.append({"arquivo": nome, "erro": str(e)})
                print(f"  {i}/{len(pecas)} {nome}: {e}")
                falhas += 1
                # PARAR QUANDO NAO HA' MAIS QUEM ATENDA, e nao seguir batendo em porta
                # fechada. Na leva 29 ele viu 101 falhas seguidas: as chaves tinham
                # acabado na peca 6 e o programa insistiu nas outras 101, uma a uma, so'
                # para escrever "falhou" em cada. Gasta tempo e nao ensina nada.
                if not rodizio.vivas():
                    parou_por = "As chaves da fila bateram o teto de hoje."
                break
            if texto:
                desta[campo["id"]] = texto
                # A FRASE VAI PARA O DISCO ASSIM QUE CHEGA, e nao so' no fecho.
                #
                # A AUDITORIA DE 22/08/2026 ACHOU O BURACO: tudo o que a IA escrevia
                # morava so' em memoria ate' o relatorio final, e se a oficina caisse
                # no meio (queda de luz, processo morto) a leva inteira de frases JA'
                # PAGAS com a cota do dia evaporava. A cota nao volta; o arquivo sim.
                # Cada frase aceita reescreve `_textos.json` ao lado de `_frases/`
                # (mesma convencao do `_origem.json`), com tudo o que ja' saiu ate'
                # aqui. NAO pode ficar em `pedidos/` com nome solto: `na_fila` pega
                # qualquer *.json de la' como pedido novo. O fecho final continua
                # gravando tudo no andamento, exatamente como antes.
                # Falha de disco nao derruba a escrita: a licao do `andamento` vale
                # aqui tambem, aviso que atrapalha o trabalho e' sabotagem.
                try:
                    (origem / "_textos.json").write_text(
                        json.dumps({**saida, nome: desta}, ensure_ascii=False),
                        encoding="utf-8")
                except OSError:
                    pass
        if desta:
            saida[nome] = desta
            feitos += 1
            print(f"  {i}/{len(pecas)} {nome}: {list(desta.values())[0][:60]}")
        # SO' DEPOIS DE GUARDAR O QUE SAIU. Na primeira versao deste corte eu pus o `break`
        # antes desta linha, e a peca que a IA tinha acabado de escrever ia para o lixo: o
        # `feitos` ficava em zero mesmo com a frase na mao. O teste pegou; o Gabriel teria
        # pego depois, com uma leva inteira em branco.
        if parou_por:
            break

    gasto = round(time.time() - t0)
    andamento(pid, {"id": pid, "tipo": "escrever", "total": len(pecas), "feitos": feitos,
                    "falhas": falhas, "sem_frase": sem_frase,
                    "atual": "", "fim": True, "segundos": gasto,
                    # QUANTAS FICARAM, e por que parou. A tela precisa disso para dizer a
                    # ele que e' so' clicar de novo amanha, e que nada do que ja' saiu
                    # sera' refeito nem cobrado de novo.
                    "parou_por": parou_por, "restantes": len(pecas) - feitos,
                    "textos": saida, "diario": diario})
    arquivar(caminho, p, feitos, falhas, gasto)
    print(f"  {feitos} escritas, {falhas} falharam, {sem_frase} sem frase para ler, "
          f"{gasto//60} min {gasto%60} s")

def ler_template(nome: str) -> dict | None:
    """Le a composicao do acervo. Aceita tambem os templates antigos, que eram um PNG so'.

    O TEMPLATE DEIXOU DE SER UM ARQUIVO E VIROU UMA COMPOSICAO em 20/08/2026, por pedido
    do Gabriel: "a ideia e' que eu monte um template na hora", com cor de fundo, imagens
    que ele sobe e caixas de texto. Um PNG solto continua valendo: ele entra como imagem
    de fundo de uma composicao sem elementos, e nada do que ja' existia no acervo se
    perde.
    """
    if not nome:
        return None
    arq = TEMPLATES / nome
    if not arq.is_file():
        return None
    if arq.suffix.lower() == ".json":
        try:
            return json.loads(arq.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
    return {"fundoCor": "#000000", "fundoImagem": nome, "elementos": []}


def cumprir(caminho: Path) -> None:
    """PASSO 3: monta as pecas da leva sobre a composicao escolhida."""
    try:
        p = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        # PEDIDO ILEGIVEL SAI DE CENA COM O MOTIVO ESCRITO, no mesmo desenho do
        # estado corrompido da colheita: sem isto ele era relido a cada minuto para
        # sempre, sem andamento, e a tela nunca ficava sabendo (auditoria 25/08/2026).
        print(f"  pedido {caminho.name} ilegivel: {e}")
        andamento(caminho.stem, {"id": caminho.stem, "fim": True,
                                 "erro": "o pedido chegou ilegivel e saiu da fila; "
                                         "peca de novo pela tela"})
        try:
            caminho.rename(caminho.with_name(caminho.stem + ".corrompido"))
        except OSError:
            caminho.unlink(missing_ok=True)
        return

    # DOIS TIPOS DE PEDIDO NA MESMA FILA. O passo 2 manda `tipo: recorte`; o passo 3
    # manda o pedido de montagem, que nao tem tipo por ser o mais antigo dos dois.
    if p.get("tipo") == "recorte":
        cumprir_recorte(caminho, p)
        return
    if p.get("tipo") == "escrever":
        cumprir_escrever(caminho, p)
        return
    if p.get("tipo") == "descrever":
        cumprir_descrever(caminho, p)
        return
    if p.get("tipo") == "entregar":
        cumprir_entregar(caminho, p)
        return
    if p.get("tipo") == "provar-ia":
        cumprir_provar_ia(caminho, p)
        return

    pid = p.get("id") or caminho.stem
    tpl = ler_template(str(p.get("template", "")))
    origem = RECORTES / str(p.get("pasta", ""))
    destino = EDICOES / str(p.get("destino") or p.get("pasta", ""))
    tela = p.get("tela") or {"w": 1080, "h": 1920}
    pecas = p.get("pecas") or []

    if not tpl:
        andamento(pid, {"id": pid, "erro": "nao achei o template deste pedido",
                        "fim": True})
        arquivar(caminho, p, 0, 0, 0)   # sai da fila: ver a nota em cumprir_escrever
        return
    if not origem.is_dir():
        andamento(pid, {"id": pid, "erro": f"nao achei os recortes de {origem.name}",
                        "fim": True})
        arquivar(caminho, p, 0, 0, 0)   # sai da fila: ver a nota em cumprir_escrever
        return

    # A FICHA DO PASSO 2 diz onde esta' a mascara de cada peca. Sem ela o B-roll entraria
    # com o preto em volta e taparia o fundo do template.
    mascaras = {}
    try:
        f_org = origem / "_origem.json"
        if f_org.is_file():
            for x in (json.loads(f_org.read_text(encoding="utf-8")).get("pecas") or []):
                if x.get("mascara"):
                    mascaras[x["arquivo"]] = origem / x["mascara"]
    except (OSError, ValueError):
        mascaras = {}

    # LEVA GRANDE VAI PARA A ESTEIRA, desde 25/08/2026: as camadas sao pintadas aqui
    # (fontes e templates moram nesta casa) e as vagas so' compoem com o ffmpeg, que e'
    # onde o relogio vai. Falhando o despacho, o caminho local de sempre segue abaixo.
    if despacho_vale(pecas, p) and despachar(caminho, p, "montagem", tpl, mascaras):
        return
    if _disco_apertado(pid):
        arquivar(caminho, p, 0, 0, 0)
        return

    print(f"pedido {pid}: {len(pecas)} pecas sobre {p.get('template')}")
    destino.mkdir(parents=True, exist_ok=True)
    trabalho = Path(tempfile.mkdtemp(prefix="peca-"))
    t0 = time.time()
    feitos = falhas = 0
    diario = []
    # SO' O ULTIMO PAR PINTADO FICA NA MEMORIA. Cada par fundo+frente em 1080x1920
    # pesa uns 14,5 MB; depois da fase da IA cada peca tem texto proprio, e guardar
    # todos os pares acumulava ate' 1,5 GB de RAM junto com o ffmpeg, na maquina sem
    # placa onde a leva local ja' dura horas (auditoria de 25/08/2026). O caso que o
    # cache serve de verdade, template sem IA, e' um par so', e chega consecutivo.
    guardado = {"chave": None, "par": None}

    try:
        for i, peca in enumerate(pecas, 1):
            nome = str(peca.get("arquivo", ""))
            entrada = origem / nome
            andamento(pid, {"id": pid, "total": len(pecas), "feitos": feitos,
                            "falhas": falhas, "atual": nome, "fim": False,
                            "segundos": round(time.time() - t0)})
            if not entrada.is_file():
                falhas += 1
                diario.append({"arquivo": nome, "erro": "recorte nao encontrado"})
                print(f"  {i}/{len(pecas)} {nome}: recorte nao encontrado")
                continue

            # AS CAMADAS SO' SE PINTAM DE NOVO QUANDO O TEXTO MUDA. Enquanto a IA nao
            # escreve nada diferente por peca, as cento e sete usam o mesmo par de PNGs,
            # e o desenho custa uma vez em vez de cento e sete.
            textos = peca.get("textos") or {}
            acertos = peca.get("ajustes") or {}
            # A MOLDURA DA PECA ENTRA NA CHAVE DA GUARDA: duas pecas de variacoes
            # diferentes nao podem sair vestindo o mesmo par de PNGs.
            tpl_da_peca = template_da_peca(tpl, peca.get("enquadre"))
            chave = json.dumps([textos, acertos, tpl_da_peca.get("fundoImagem")],
                               sort_keys=True, ensure_ascii=False)
            if guardado["chave"] != chave:
                try:
                    guardado = {"chave": chave,
                                "par": pintar_camadas(tpl_da_peca, textos, tela,
                                                      TEMPLATES, acertos)}
                except Exception as e:
                    # PINTAR O TEMPLATE E' O QUE VALE PARA A LEVA INTEIRA, entao uma falha
                    # aqui e' mesmo o fim da montagem. Mas o pedido tem de sair da fila,
                    # senao a oficina volta nele de minuto em minuto para sempre.
                    andamento(pid, {"id": pid,
                                    "erro": f"nao consegui pintar o template: {e}",
                                    "fim": True})
                    arquivar(caminho, p, feitos, falhas, round(time.time() - t0))
                    return
            # UMA PECA QUEBRADA NUNCA DERRUBA A LEVA. Trava 7 do CLAUDE.md, que o recorte
            # ja' cumpria e a montagem nao: aqui uma unica peca com problema (mascara
            # corrompida, disco cheio, arquivo preso) estourava para fora do laco, matava
            # as outras 106 e ainda deixava o pedido na fila para repetir tudo de novo.
            try:
                fundo, frente = guardado["par"]
                camada = trabalho / f"camada{i}.png"
                camada_da_peca(fundo, frente, mascaras.get(nome), tela,
                               peca.get("enquadre")).save(camada)
                laudo = compor(camada, entrada, destino / nome, tela,
                               peca.get("enquadre"))
                camada.unlink(missing_ok=True)
            except Exception as e:
                laudo = {"erro": f"{type(e).__name__}: {e}"}
            laudo["arquivo"] = nome
            diario.append(laudo)
            if laudo.get("erro"):
                falhas += 1
                print(f"  {i}/{len(pecas)} {nome}: {laudo['erro']}")
            else:
                feitos += 1
                print(f"  {i}/{len(pecas)} {nome}: {laudo['segundos']}s, "
                      f"{laudo['bytes']/1e6:.1f} MB"
                      + ("" if laudo.get("limpo") else "  (ATENCAO: sobrou metadado)"))
            renovar_tranca()   # leva local longa nao pode envelhecer a propria tranca
    finally:
        shutil.rmtree(trabalho, ignore_errors=True)

    gasto = round(time.time() - t0)
    andamento(pid, {"id": pid, "total": len(pecas), "feitos": feitos, "falhas": falhas,
                    "atual": "", "fim": True, "segundos": gasto,
                    "pasta": str(destino), "diario": diario})
    arquivar(caminho, p, feitos, falhas, gasto)
    print(f"  {feitos} montadas, {falhas} falharam, {gasto//60} min {gasto%60} s")
    print(f"  em {destino}")


# ------------------------------------------------------------------ a esteira de edicao
#
# POR QUE A EDICAO PODE SAIR DAQUI, decisao de 25/08/2026. Na CPU da casa da VPS uma
# peca custa uns 6 minutos de recorte e 5 de montagem, e a leva de 107 vira um dia de
# maquina; o Gabriel vetou pagar maquina maior ("nao vou pagar 17 dolares mensais") e
# vetou voltar qualquer coisa para o computador dele. A bancada do mesmo dia mediu a
# saida: o MESMO comando de video que leva 60,1 s aqui leva 1,88 s numa vaga da esteira
# (repositorio publico roda de graca, sem teto de minutos, 20 vagas por vez). Entao a
# leva grande e' FATIADA em vagas, cada vaga recorta ou monta as suas pecas com ESTE
# MESMO programa (vaga_edicao.py importa daqui), devolve um pacote, e o colhedor daqui
# confere e guarda. Leva pequena continua local: o transporte nao paga a viagem.
DESPACHO_MINIMO = 12          # abaixo disso a propria maquina resolve mais rapido
PECAS_POR_VAGA = 7
VAGAS_TETO = 16               # o plano gratuito corre 20 vagas; 4 ficam pra mineracao
# DOIS RELOGIOS PARA DESISTIR, e a razao e' que o do GitHub tem fila. O PRAZO conta a
# partir da hora em que a esteira ACORDOU (a primeira fatia colhida): dai' em diante,
# uma vaga retardataria tem 45 min. O TETO conta a partir do despacho e existe para o
# caso de a esteira NUNCA acordar (as 20 vagas ocupadas pela mineracao deixam a edicao
# na fila): 3 horas depois, o pedido volta para a fila local aconteca o que acontecer.
# Contar so' do despacho fazia a VPS desistir enquanto os jobs ainda estavam na fila,
# e o trabalho saia em dobro (auditoria de 25/08/2026).
DESPACHO_PRAZO = 45 * 60
DESPACHO_TETO = 3 * 3600
DESPACHO_VALIDADE = 12 * 3600  # a ficha de retirada vence sozinha
FLUXO_DA_EDICAO = "edicao.yml"


def _gravar_json_atomico(alvo: Path, dado: dict) -> None:
    """Grava um json trocando o arquivo de uma vez, para queda no meio nao truncar.

    O estado do despacho e' relido a cada minuto; um write_text cortado no meio o
    deixaria ilegivel para sempre, e o pedido ja' saiu da fila. `os.replace` no mesmo
    volume e' atomico: ou o arquivo velho inteiro, ou o novo inteiro, nunca metade.
    """
    alvo.parent.mkdir(parents=True, exist_ok=True)
    tmp = alvo.with_name(alvo.name + ".novo")
    tmp.write_text(json.dumps(dado, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, alvo)


def despacho_vale(pecas: list, p: dict) -> bool:
    """Diz se este pedido deve ir para a esteira em vez de rodar aqui.

    QUATRO CONDICOES, cada uma com motivo: leva grande (transporte so' paga a viagem a
    partir de umas doze pecas); `aqui` e' a saida de emergencia do pedido que o Gabriel
    quer forcar local; maquina COM placa de video monta a leva inteira em minutos e nao
    precisa de esteira; e sem a chave do GitHub nao ha' como despachar nem colher.
    """
    return (len(pecas) >= DESPACHO_MINIMO and not p.get("aqui")
            and not placa_de_video() and caminhos.CHAVE_DO_GITHUB.exists())


def _fatiar(pecas: list) -> list:
    """Reparte as pecas em fatias contiguas, na ordem do pedido.

    CONTIGUAS DE PROPOSITO: a ficha final sai na ordem do pedido so' de juntar as
    fatias na ordem do indice, sem reordenar peca a peca.
    """
    vagas = min(VAGAS_TETO, max(1, -(-len(pecas) // PECAS_POR_VAGA)))
    tam = -(-len(pecas) // vagas)
    return [pecas[i:i + tam] for i in range(0, len(pecas), tam)]


def _acervo_pos(caminho: str, ficha: str, corpo: dict) -> None:
    """Um POST na API do acervo que espera 204, sem corpo de resposta.

    O `guardar.api` faz `json.loads` da resposta, e o disparo de fluxo responde 204
    vazio: passaria por erro onde deu certo.
    """
    req = urllib.request.Request(
        f"https://api.github.com/repos/{caminhos.DONO}/{caminhos.REPO}{caminho}",
        data=json.dumps(corpo).encode(), method="POST",
        headers={"Authorization": f"Bearer {ficha}",
                 "Accept": "application/vnd.github+json", "User-Agent": "estudio-local"})
    with urllib.request.urlopen(req, timeout=60) as r:
        r.read()


def _sonda_da_casa(ficha: str, criado: int) -> bool:
    """Confere que ESTA maquina e' a casa publica onde as vagas vao bater.

    POR QUE, achado da auditoria de 25/08/2026: o manifesto e' gravado no disco local,
    mas as vagas buscam em `CASA_PUBLICA`. Se quem despacha nao e' essa casa (o PC do
    Gabriel com a placa mal detectada, uma prova sem o endereco apontado), as vagas
    pediriam a um posto que nunca ouviu falar da ficha, morreriam todas, e o pedido
    esperaria o teto inteiro parado. A sonda pede o proprio manifesto pela porta
    publica, com o mesmo cabecalho secreto que a vaga usa, e so' segue se a casa
    devolver o manifesto certo. Falhou a sonda, o pedido fica local na hora.
    """
    base = caminhos.CASA_PUBLICA.rstrip("/")
    req = urllib.request.Request(f"{base}/retirada/{ficha}/_manifesto")
    segredo = caminhos.segredo_da_retirada()
    if segredo:
        req.add_header("X-Estudio-Vaga", segredo)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            eco = json.loads(r.read())
        return eco.get("criado") == criado
    except Exception:                                              # noqa: BLE001
        return False


def despachar(caminho: Path, p: dict, tipo: str, tpl: dict | None = None,
              mascaras: dict | None = None) -> bool:
    """Fatia o pedido, publica a ficha de retirada e acorda as vagas da esteira.

    DEVOLVE False SEM DERRUBAR NADA: qualquer falha aqui (sem chave, GitHub fora,
    disco cheio) e' impressa e o pedido segue o caminho local de sempre. Despachar e'
    atalho, nunca portao.
    """
    import guardar
    pid = p.get("id") or caminho.stem
    pecas = p.get("pecas") or []
    tela = p.get("tela") or {"w": 1080, "h": 1920}
    pasta = str(p.get("pasta", ""))
    destino_rel = str(p.get("destino") or p.get("pasta", ""))

    # PEDIDO QUE JA' TEM DESPACHO NO AR NAO E' DESPACHADO DE NOVO. Uma queda entre o
    # disparo e a saida da fila deixaria o pedido para ser relido; sem esta guarda, a
    # segunda leitura abriria um segundo despacho, dobraria as vagas e orfanaria as
    # fatias da primeira. Aqui o pedido teimoso so' e' removido da fila; o despacho que
    # ja' existe e' colhido pelo colhedor.
    if (caminhos.DESPACHADOS / f"{pid}.json").exists():
        print(f"  {pid} ja' esta' na esteira; tiro o pedido teimoso da fila")
        caminho.unlink(missing_ok=True)
        return True

    ficha = os.urandom(16).hex()
    aux = caminhos.DESPACHOS / ficha
    try:
        # DENTRO DO CERCO, porque `chave()` sai com SystemExit quando o arquivo esta'
        # errado, e uma chave torta nao pode derrubar a passagem: vira caminho local.
        ficha_do_github = guardar.chave()
        fatias = _fatiar(pecas)
        arquivos, fatias_manifesto = [], []
        if tipo == "recorte":
            for fatia in fatias:
                itens = []
                for peca in fatia:
                    nome = str(peca.get("arquivo", ""))
                    arquivos.append(f"levas/{pasta}/{nome}")
                    itens.append({"arquivo": nome, "broll": peca.get("broll")})
                fatias_manifesto.append(itens)
        else:
            # AS CAMADAS SAO PINTADAS AQUI, NUNCA NA VAGA: pintar pede as fontes e o
            # acervo de templates, que moram nesta casa. A vaga recebe os PNGs prontos
            # e so' compoe com o ffmpeg, que e' onde o relogio vai.
            caminhos.criar(aux)
            pares: dict[str, int] = {}
            for fatia in fatias:
                itens = []
                for peca in fatia:
                    nome = str(peca.get("arquivo", ""))
                    textos = peca.get("textos") or {}
                    acertos = peca.get("ajustes") or {}
                    # A MOLDURA E' POR PECA TAMBEM AQUI (revisao de 27/08/2026): so' o
                    # laco local tinha aprendido, e a esteira, que e' quem monta as
                    # levas grandes, pintava todo mundo com o template global, que no
                    # desenho novo vem sem arte nenhuma. A arte entra na chave do par
                    # pela mesma razao do laco local: pecas de variacoes diferentes
                    # nao podem sair vestindo o mesmo PNG.
                    tpl_da_peca = template_da_peca(tpl, peca.get("enquadre"))
                    chave_par = json.dumps([textos, acertos,
                                            tpl_da_peca.get("fundoImagem")],
                                           sort_keys=True, ensure_ascii=False)
                    if chave_par not in pares:
                        n = len(pares)
                        fundo, frente = pintar_camadas(tpl_da_peca, textos, tela,
                                                       TEMPLATES, acertos)
                        fundo.save(aux / f"camada-{n}-fundo.png")
                        frente.save(aux / f"camada-{n}-frente.png")
                        arquivos += [f"despachos/{ficha}/camada-{n}-fundo.png",
                                     f"despachos/{ficha}/camada-{n}-frente.png"]
                        pares[chave_par] = n
                    mask = (mascaras or {}).get(nome)
                    mask_rel = None
                    if mask is not None and Path(mask).is_file():
                        mask_rel = str(Path(mask).resolve()
                                       .relative_to(CASA.resolve())).replace("\\", "/")
                        arquivos.append(mask_rel)
                    arquivos.append(f"recortes/{pasta}/{nome}")
                    itens.append({"arquivo": nome, "camada": pares[chave_par],
                                  "enquadre": peca.get("enquadre"),
                                  "mascara": mask_rel})
                fatias_manifesto.append(itens)

        agora = int(time.time())
        manifesto = {"pedido": pid, "tipo": tipo, "pasta": pasta, "tela": tela,
                     "criado": agora, "vence": agora + DESPACHO_VALIDADE,
                     "fatias": fatias_manifesto, "arquivos": sorted(set(arquivos))}
        caminhos.criar(caminhos.DESPACHOS)
        (caminhos.DESPACHOS / f"{ficha}.json").write_text(
            json.dumps(manifesto, ensure_ascii=False, indent=1), encoding="utf-8")

        # A SONDA ANTES DO DISPARO: so' despacha quem e' de fato a casa publica onde as
        # vagas vao bater. Falhou, o pedido segue local sem gastar as vagas a' toa.
        if not _sonda_da_casa(ficha, agora):
            raise RuntimeError("esta maquina nao atende em CASA_PUBLICA; fica local")

        estado = {"id": pid, "tipo": tipo, "ficha": ficha, "criado": agora,
                  "visto": None, "runs": None,
                  "vagas": len(fatias_manifesto), "colhidas": [], "laudos": {},
                  "pasta": pasta, "destino": destino_rel, "pedido": p}
        _gravar_json_atomico(caminhos.DESPACHADOS / f"{pid}.json", estado)

        # O PEDIDO SAI DA FILA ANTES DO DISPARO, e nao depois. Se o disparo cair
        # aqui, o estado ja' existe e a desistencia por teto devolve as pecas sozinha;
        # se saisse depois, uma queda no meio relia o pedido e abria despacho em dobro.
        caminho.unlink(missing_ok=True)

        _acervo_pos(f"/actions/workflows/{FLUXO_DA_EDICAO}/dispatches",
                    ficha_do_github,
                    {"ref": "main",
                     "inputs": {"pedido": str(pid), "casa": caminhos.CASA_PUBLICA,
                                "ficha": ficha,
                                "fatias": json.dumps(
                                    list(range(len(fatias_manifesto))))}})
    except (Exception, SystemExit) as e:                            # noqa: BLE001
        print(f"  nao consegui despachar {pid} ({type(e).__name__}: {e})")
        if caminho.exists():
            # O PEDIDO AINDA ESTA' NA FILA: nada foi comprometido, limpa os rastros e
            # segue no caminho local de sempre nesta mesma passagem.
            print("    (sigo aqui mesmo)")
            (caminhos.DESPACHOS / f"{ficha}.json").unlink(missing_ok=True)
            shutil.rmtree(aux, ignore_errors=True)
            (caminhos.DESPACHADOS / f"{pid}.json").unlink(missing_ok=True)
            return False
        # DISPARO RECUSADO NA CARA (4xx) NAO ESPERA TETO NENHUM: a resposta chegou e
        # disse nao (token vencido e' 401, fluxo renomeado e' 404), entao a esteira
        # garantidamente nao acordou. As pecas voltam para a fila JA', como pedido
        # local, e a ficha e o estado morrem aqui, sem as 3 horas de espera.
        if isinstance(e, urllib.error.HTTPError) and e.code < 500:
            try:
                novo = dict(p)
                novo["aqui"] = True
                caminho.write_text(json.dumps(novo, ensure_ascii=False, indent=1),
                                   encoding="utf-8")
                (caminhos.DESPACHOS / f"{ficha}.json").unlink(missing_ok=True)
                shutil.rmtree(aux, ignore_errors=True)
                (caminhos.DESPACHADOS / f"{pid}.json").unlink(missing_ok=True)
                print(f"    (o GitHub recusou o disparo: {e.code}; a leva segue "
                      "nesta maquina)")
                return False
            except OSError:
                pass
        # O PEDIDO JA' SAIU DA FILA e o disparo pode ter ido (timeout, 5xx): NAO se
        # apaga a ficha nem o estado, porque as vagas precisam do manifesto e o
        # colhedor precisa do estado. O teto devolve as pecas se a esteira nao acordar.
        print("    (o pedido ja' esta' na esteira; o colhedor assume)")
        return True

    d = {"id": pid, "total": len(pecas), "feitos": 0, "falhas": 0,
         "atual": f"na esteira: {len(fatias_manifesto)} vagas trabalhando",
         "fim": False, "segundos": 0,
         "esteira": {"vagas": len(fatias_manifesto), "colhidas": 0}}
    if tipo == "recorte":
        d["tipo"] = "recorte"
    andamento(pid, d)
    print(f"pedido {pid}: {len(pecas)} pecas despachadas para a esteira em "
          f"{len(fatias_manifesto)} vagas")
    return True


def _runs_do_despacho(ficha: str, ficha_github: str) -> set:
    """Os run ids da esteira que ESTE despacho disparou, achados pela ficha no nome.

    POR QUE, achado da auditoria de 25/08/2026: o colhedor pegava o artifact so' pelo
    nome (`edicao-<pid>-fatia-<i>`), e o pid e a contagem de fatias sao publicos no
    disparo. Um run qualquer do repositorio (um PR de fork rodando CI) que subisse um
    artifact com esse nome seria colhido como se fosse nosso, e o video envenenado
    entraria no material que vai para as contas. Agora a colheita so' aceita artifact
    de um run cujo NOME carrega a ficha deste despacho (o edicao.yml poe a ficha no
    `run-name`), e a ficha sorteada e' o que o atacante nao tem.
    """
    import guardar
    d = guardar.api(f"/actions/workflows/{FLUXO_DA_EDICAO}/runs"
                    "?event=workflow_dispatch&per_page=40", ficha_github)
    achados = set()
    for run in (d or {}).get("workflow_runs") or []:
        titulo = f"{run.get('display_title') or ''} {run.get('name') or ''}"
        if ficha in titulo:
            achados.add(run.get("id"))
    return achados


def _artifacts_dos_runs(runs: set, ficha_github: str) -> dict:
    """Os pacotes dos runs DESTE despacho, por nome. Uma chamada por run.

    UMA CHAMADA POR RUN, E NAO UMA POR VAGA (fecho de 25/08/2026). A colheita roda
    a cada minuto e perguntava pelo pacote de CADA vaga que ainda faltava: ate' 16
    chamadas por volta, por despacho, contra a mesma resposta. A esteira de edicao e'
    UM run com N trabalhos dentro, entao perguntar ao proprio run traz as N de uma vez.

    E O VENENO CONTINUA BARRADO, agora pela raiz. Antes se procurava o pacote pelo NOME
    no repositorio inteiro e depois se conferia de quem ele era; agora so' se pergunta
    aos runs que ESTE despacho disparou (achados pela ficha sorteada, em
    `_runs_do_despacho`). Pacote de run estranho com o mesmo nome nunca entra na lista.

    O teto de 100 por pagina cobre com folga o teto de 16 vagas de um despacho.
    """
    import guardar
    achados = {}
    for run in sorted(runs):
        d = guardar.api(f"/actions/runs/{run}/artifacts?per_page=100", ficha_github)
        for art in (d or {}).get("artifacts") or []:
            if not art.get("expired"):
                achados.setdefault(art.get("name"), art)
    return achados


def instalar_fatia(pacote: Path, destino: Path, tipo: str,
                   pedido=None, fatia=None) -> dict:
    """Abre o pacote de uma vaga dentro do destino e devolve o laudo dela.

    O PACOTE E' ENTRADA DE FORA, mesmo vindo do nosso proprio fluxo: cada nome de
    arquivo e' conferido antes de tocar o disco. Nome com barra invertida, caminho
    absoluto, `..` ou pasta fora das tres esperadas nao entra, e derruba a fatia
    inteira, porque pacote adulterado nao e' pacote pela metade. E O LAUDO SE CONFERE
    ANTES DA GRAVACAO, nao depois: um laudo de outro pedido descoberto tarde ja'
    teria misturado arquivos na pasta errada (auditoria de 25/08/2026).
    """
    import zipfile
    with zipfile.ZipFile(pacote) as z:
        nomes = [n for n in z.namelist() if not n.endswith("/")]
        # PRIMEIRO SE CONFERE TUDO, DEPOIS SE GRAVA: a primeira versao gravava
        # enquanto conferia, e um pacote reprovado no meio ja' tinha deixado rastro
        # no destino. Pacote adulterado nao pode ser pacote pela metade.
        for nome in nomes:
            partes = Path(nome).parts
            if (nome.startswith("/") or "\\" in nome or ".." in partes
                    or len(partes) > 2
                    or (len(partes) == 2 and partes[0] not in ("_mascaras", "_frases"))):
                raise ValueError(f"nome estranho no pacote: {nome[:60]}")
            if nome != "_laudo.json" and Path(nome).suffix.lower() not in (".mp4",
                                                                           ".png"):
                raise ValueError(f"tipo estranho no pacote: {nome[:60]}")
        if "_laudo.json" not in nomes:
            raise ValueError("o pacote veio sem o _laudo.json")
        laudo = json.loads(z.read("_laudo.json").decode("utf-8"))
        if not isinstance(laudo, dict):
            raise ValueError("o _laudo.json do pacote nao e' uma ficha")
        if pedido is not None and (str(laudo.get("pedido")) != str(pedido)
                                   or laudo.get("fatia") != fatia):
            raise ValueError(f"laudo de outra origem: {laudo.get('pedido')}"
                             f"/{laudo.get('fatia')}")
        for nome in nomes:
            if nome == "_laudo.json":
                continue
            alvo = destino / nome
            alvo.parent.mkdir(parents=True, exist_ok=True)
            with z.open(nome) as de, open(alvo, "wb") as para:
                shutil.copyfileobj(de, para, 1024 * 256)
    return laudo


def colher_despachos() -> None:
    """Recolhe as fatias que as vagas ja' entregaram e fecha os pedidos completos."""
    if not caminhos.DESPACHADOS.is_dir():
        return
    for arq in sorted(caminhos.DESPACHADOS.glob("*.json")):
        if arq.name.endswith(".novo"):
            continue
        try:
            _colher_um(arq)
        except (Exception, SystemExit) as e:                        # noqa: BLE001
            # UM DESPACHO EMPERRADO NAO SEGURA OS OUTROS; os relogios continuam
            # correndo e resolvem o emperrado nas voltas seguintes.
            print(f"  colheita de {arq.stem} falhou: {type(e).__name__}: {e}")


def _colher_um(arq: Path) -> None:
    import guardar
    try:
        estado = json.loads(arq.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        # ESTADO ILEGIVEL E' CASO TERMINAL, e nao motivo para tentar para sempre. Com a
        # gravacao atomica isto praticamente nao acontece; se acontecer, o arquivo sai
        # de cena com o motivo escrito, em vez de o colhedor reler lixo a cada minuto.
        estragado = arq.with_name(arq.stem + ".corrompido")
        try:
            arq.rename(estragado)
        except OSError:
            arq.unlink(missing_ok=True)
        print(f"  {arq.stem}: estado ilegivel ({e}); tirei de cena")
        return

    pid, tipo = estado["id"], estado["tipo"]
    destino = (RECORTES if tipo == "recorte" else EDICOES) / estado["destino"]
    colhidas = set(estado.get("colhidas") or [])
    mudou = False

    # A CHAVE DO GITHUB E' PARA COLHER, NAO PARA DESISTIR. Sem ela nao da' para buscar
    # artifact, mas os relogios abaixo ainda rodam e a desistencia devolve as pecas a'
    # fila local sem GitHub nenhum. Por isso ela e' opcional aqui, e nunca derruba.
    ficha_do_github = None
    try:
        ficha_do_github = guardar.chave()
    except (Exception, SystemExit) as e:                            # noqa: BLE001
        print(f"  {pid}: sem chave do GitHub agora ({e}); so' cuido dos relogios")

    if ficha_do_github:
        runs = set(estado.get("runs") or [])
        if not runs:
            runs = _runs_do_despacho(estado.get("ficha", ""), ficha_do_github)
            if runs:
                estado["runs"] = sorted(runs)
                mudou = True
        # A LISTA DE PACOTES SAI DE UMA CHAMADA SO', antes do laco das vagas: ver a
        # nota em `_artifacts_dos_runs`. Sem run conhecido ainda nao ha' o que colher.
        catalogo = _artifacts_dos_runs(runs, ficha_do_github) if runs else {}
        for i in range(int(estado.get("vagas") or 0)):
            if i in colhidas:
                continue
            try:
                fragmento = _colher_fatia(pid, i, estado, tipo, destino, catalogo,
                                          ficha_do_github, guardar)
            except (Exception, SystemExit) as e:                    # noqa: BLE001
                # UMA FATIA PODRE NAO SEGURA AS OUTRAS nem congela o pedido: registra,
                # segue para a proxima, e o relogio la' embaixo continua valendo.
                print(f"  {pid}: fatia {i + 1} nao entrou ({type(e).__name__}: {e})")
                continue
            if fragmento is None:
                continue
            estado.setdefault("laudos", {})[str(i)] = fragmento
            colhidas.add(i)
            estado["colhidas"] = sorted(colhidas)
            if estado.get("visto") is None:
                estado["visto"] = int(time.time())   # a esteira acordou: liga o prazo
            mudou = True
            print(f"  {pid}: colhi a fatia {i + 1} de {estado['vagas']} "
                  f"({fragmento.get('feitos', 0)} pecas)")

    total = len((estado.get("pedido") or {}).get("pecas") or [])
    laudos = estado.get("laudos") or {}
    feitos = sum(x.get("feitos", 0) for x in laudos.values())
    falhas = sum(x.get("falhas", 0) for x in laudos.values())
    if mudou:
        _gravar_json_atomico(arq, estado)
        d = {"id": pid, "total": total, "feitos": feitos, "falhas": falhas,
             "atual": f"na esteira: {len(colhidas)} de {estado['vagas']} "
                      "vagas colhidas",
             "fim": False, "segundos": int(time.time() - estado["criado"]),
             "esteira": {"vagas": estado["vagas"], "colhidas": len(colhidas)}}
        if tipo == "recorte":
            d["tipo"] = "recorte"
        andamento(pid, d)

    # OS DOIS RELOGIOS. Colheu tudo, fecha. Senao, desiste por PRAZO (a esteira ja'
    # acordou e uma vaga se atrasou) ou por TETO (a esteira nunca acordou, as vagas
    # ficaram na fila do GitHub). Ver o comentario das constantes.
    agora = time.time()
    if len(colhidas) >= int(estado.get("vagas") or 0):
        _fechar_despacho(estado, arq, destino)
    elif (agora - estado["criado"] > DESPACHO_TETO
          or (estado.get("visto") and agora - estado["visto"] > DESPACHO_PRAZO)):
        _desistir_do_despacho(estado, arq, destino)


def _colher_fatia(pid, i, estado, tipo, destino, catalogo, ficha_do_github,
                  guardar) -> dict | None:
    """Baixa e instala UMA fatia, conferindo que ela e' deste pedido. None se nao veio."""
    art = (catalogo or {}).get(f"edicao-{pid}-fatia-{i}")
    if not art:
        return None
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        pacote = Path(tmp.name)
    try:
        guardar.baixar_pacote(art["id"], ficha_do_github, pacote,
                              int(art.get("size_in_bytes") or 0))
        destino.mkdir(parents=True, exist_ok=True)
        # O LAUDO E' CONFERIDO DENTRO DO INSTALAR, ANTES de qualquer gravacao: um
        # laudo de outro pedido nao pode ter misturado arquivo nenhum no destino.
        fragmento = instalar_fatia(pacote, destino, tipo, pedido=pid, fatia=i)
    finally:
        pacote.unlink(missing_ok=True)
    return fragmento


def _fechar_despacho(estado: dict, arq: Path, destino: Path,
                     faltaram: list | None = None) -> None:
    """Junta as fatias na ordem do pedido, grava a ficha e arquiva o pedido."""
    pid, tipo, p = estado["id"], estado["tipo"], estado.get("pedido") or {}
    laudos = estado.get("laudos") or {}
    diario, ficha = [], []
    feitos = falhas = cards = cegas = 0
    for i in range(int(estado.get("vagas") or 0)):
        frag = laudos.get(str(i)) or {}
        diario += frag.get("diario") or []
        ficha += frag.get("ficha") or []
        feitos += frag.get("feitos", 0)
        falhas += frag.get("falhas", 0)
        cards += frag.get("cards", 0)
        cegas += frag.get("cegas", 0)

    if tipo == "recorte" and ficha:
        # A MESMA FUSAO DO CAMINHO LOCAL: a ficha nova entra por cima da velha, peca a
        # peca, para o recorte das faltantes nunca apagar o que ja' estava pronto.
        velha = None
        try:
            velha = json.loads((destino / "_origem.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        try:
            (destino / "_origem.json").write_text(json.dumps(
                fundir_ficha(velha, p.get("leva"), LEVAS / estado.get("pasta", ""),
                             ficha), ensure_ascii=False, indent=1), encoding="utf-8")
        except OSError as e:
            print(f"  nao consegui escrever a ficha de origem: {e}")

    gasto = int(time.time() - estado["criado"])
    total = len(p.get("pecas") or [])
    d = {"id": pid, "total": total, "feitos": feitos, "falhas": falhas, "atual": "",
         "fim": True, "segundos": gasto, "pasta": str(destino), "diario": diario,
         "esteira": {"vagas": estado.get("vagas"), "colhidas":
                     len(estado.get("colhidas") or [])}}
    if tipo == "recorte":
        d.update({"tipo": "recorte", "cards": cards, "cegas": cegas})
    if faltaram:
        d["aviso"] = (f"{len(faltaram)} pecas nao voltaram da esteira no prazo "
                      "e voltaram para a fila desta maquina")
    andamento(pid, d)
    try:
        FEITOS.mkdir(parents=True, exist_ok=True)
        p2 = dict(p)
        p2["cumprido"] = int(time.time())
        p2["feitos"], p2["falhas"], p2["segundos"] = feitos, falhas, gasto
        (FEITOS / f"{pid}.json").write_text(
            json.dumps(p2, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError as e:
        print(f"  nao consegui arquivar o pedido {pid}: {e}")
    ficha_id = estado.get("ficha") or ""
    (caminhos.DESPACHOS / f"{ficha_id}.json").unlink(missing_ok=True)
    shutil.rmtree(caminhos.DESPACHOS / ficha_id, ignore_errors=True)
    arq.unlink(missing_ok=True)
    print(f"  {pid}: esteira entregou {feitos} pecas, {falhas} falharam, "
          f"{gasto // 60} min {gasto % 60} s, em {destino}")


def _desistir_do_despacho(estado: dict, arq: Path, destino: Path) -> None:
    """Fecha o despacho com o que veio e devolve o resto a' fila desta maquina.

    VAGA QUE NAO VOLTOU NO PRAZO NAO SEGURA A LEVA PARA SEMPRE: as pecas das fatias
    ausentes viram um pedido novo, marcado `aqui` para nao ser despachado de novo, e o
    andamento conta isso em voz alta em vez de fingir que a esteira entregou tudo.
    """
    p = estado.get("pedido") or {}
    laudos = estado.get("laudos") or {}
    manifesto = None
    try:
        manifesto = json.loads((caminhos.DESPACHOS / f"{estado['ficha']}.json")
                               .read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    faltaram = []
    if manifesto:
        vieram = {str(i) for i in laudos}
        for i, fatia in enumerate(manifesto.get("fatias") or []):
            if str(i) not in vieram:
                faltaram += [x.get("arquivo") for x in fatia]
    nomes = set(faltaram)
    pecas_de_novo = [x for x in (p.get("pecas") or [])
                     if str(x.get("arquivo", "")) in nomes]
    if pecas_de_novo:
        novo = dict(p)
        novo["id"] = f"{estado['id']}r"
        novo["pecas"] = pecas_de_novo
        novo["aqui"] = True
        caminhos.pedidos().joinpath(f"{novo['id']}.json").write_text(
            json.dumps(novo, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  {estado['id']}: {len(pecas_de_novo)} pecas nao voltaram no prazo; "
              "voltaram para a fila desta maquina")
    _fechar_despacho(estado, arq, destino, faltaram=faltaram or None)


def na_fila() -> list:
    if not PEDIDOS.is_dir():
        return []
    return sorted(x for x in PEDIDOS.glob("*.json")
                  if not x.name.endswith(".andamento.json"))


def processo_vivo(pid: int) -> bool:
    """Diz se o processo de numero `pid` ainda esta' de pe' nesta maquina.

    NO WINDOWS NAO SE USA os.kill(pid, 0) PARA ISSO: fora dos dois sinais de
    console, qualquer valor MATA o processo alvo via TerminateProcess. Conferir se
    a outra oficina vive nao pode ser o que a assassina. Aqui se abre um punhado
    de processo so' para esperar por ele com prazo zero: respondeu "ainda nao
    terminou", esta' vivo.

    NA DUVIDA, VIVO. Erro de consulta ou acesso negado contam como vivo, porque o
    prego de seguranca dos noventa minutos continua la' em `trancar` para soltar
    qualquer tranca que envelheca demais.
    """
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.OpenProcess.restype = ctypes.c_void_p
        k.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        k.WaitForSingleObject.restype = ctypes.c_ulong
        k.CloseHandle.argtypes = [ctypes.c_void_p]
        h = k.OpenProcess(0x00100000, False, pid)     # so' o direito de esperar
        if not h:
            # 87 e' "esse pid nao existe"; 5 e' "existe mas nao e' seu", vivo.
            return ctypes.get_last_error() != 87
        try:
            # 0 e' "ja' terminou"; espera-esgotada (0x102) ou erro contam vivo.
            return k.WaitForSingleObject(h, 0) != 0
        finally:
            k.CloseHandle(h)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except OSError:
        return True                                   # existe, so' nao e' meu


def trancar() -> bool:
    """Uma montagem por vez. Duas mexendo na mesma pasta de saida se atropelam.

    A TRANCA OLHA O DONO, E NAO SO' O RELOGIO. A auditoria de 22/08/2026 pegou os
    dois lados do defeito antigo: depois de uma queda, a tranca do processo morto
    segurava a fila por noventa minutos inteiros, com a oficina passando de minuto
    em minuto sem poder trabalhar; e duas oficinas lendo a mesma tranca velha ao
    mesmo tempo passavam AMBAS, porque o write_text nao disputa nada, e a mesma
    leva saia montada em dobro.

    O DESENHO AGORA: a tranca ja' guardava o pid de quem trancou, e ele passa a
    ser conferido. Dono vivo e tranca nova, recua como antes. Dono morto (ou
    tranca velha demais, que segue como rede para pid reaproveitado por outro
    programa), a vaga se disputa por um rename, que no mesmo disco so' um processo
    consegue fazer: quem perde recua e volta na proxima passagem do minuto. E a
    tranca nova nasce com criacao exclusiva ("x"), entao duas oficinas chegando
    juntas numa pasta limpa tambem se resolvem sozinhas, uma cria e a outra recua.
    """
    PEDIDOS.mkdir(parents=True, exist_ok=True)
    if TRANCA.exists():
        try:
            dono = int(TRANCA.read_text(encoding="utf-8").split()[0])
        except (OSError, ValueError, IndexError):
            dono = 0                # ilegivel: sem pid para conferir, vale o relogio
        try:
            idade = time.time() - TRANCA.stat().st_mtime
        except OSError:
            idade = TRANCA_VELHA + 1
        if idade < TRANCA_VELHA and (dono == 0 or processo_vivo(dono)):
            print(f"outra montagem comecou ha' {idade/60:.0f} min e ainda roda.")
            return False
        # TRANCA DE MORTO SE ASSUME NA HORA, mas por disputa e nao por fe': se duas
        # oficinas viram o mesmo cadaver, so' a que ganhar o rename segue adiante.
        cadaver = TRANCA.with_name(f"_montando.morta.{os.getpid()}")
        try:
            TRANCA.rename(cadaver)
        except OSError:
            return False            # outra oficina assumiu primeiro; a fila e' dela
        cadaver.unlink(missing_ok=True)
    try:
        with open(TRANCA, "x", encoding="utf-8") as f:
            f.write(f"{os.getpid()} {int(time.time())}\n")
    except OSError:
        return False                # perdi a corrida da criacao para outra oficina
    return True


def renovar_tranca() -> None:
    """Adia a validade da minha tranca enquanto o trabalho anda.

    POR QUE, achado da auditoria de 25/08/2026: o `TRANCA_VELHA` de 90 min foi
    calibrado para a leva de 20 min do PC com placa. Na casa da VPS, sem placa, quando
    a esteira nao esta' disponivel a leva cai no caminho local a uns 6 min por peca, e
    uma leva de 107 passa de dez horas. A oficina roda de minuto em minuto: passados
    os 90 min, a segunda instancia roubaria a tranca do dono AINDA VIVO e as duas
    montariam a mesma leva por cima uma da outra. Renovar o carimbo a cada peca mantem
    a tranca sempre nova enquanto ha' trabalho, e o roubo so' acontece para dono
    mesmo morto, que e' o unico caso em que ele deve acontecer.
    """
    try:
        if TRANCA.read_text(encoding="utf-8").split()[0] == str(os.getpid()):
            os.utime(TRANCA, None)
    except (OSError, IndexError):
        pass


def destrancar() -> None:
    """So' a minha tranca, nunca a de outro processo."""
    try:
        if TRANCA.read_text(encoding="utf-8").split()[0] != str(os.getpid()):
            return
    except (OSError, IndexError):
        return
    try:
        TRANCA.unlink(missing_ok=True)
    except OSError:
        pass


def main() -> int:
    fila = na_fila()
    despachados = (sorted(caminhos.DESPACHADOS.glob("*.json"))
                   if caminhos.DESPACHADOS.is_dir() else [])
    if "--olhar" in sys.argv:
        print(f"{len(fila)} pedido(s) na fila, {len(despachados)} na esteira")
        for x in fila:
            print("  " + x.name)
        for x in despachados:
            print("  " + x.name + " (esteira)")
        return 0
    if not fila and not despachados:
        return 0
    if not trancar():
        return 0
    try:
        # A COLHEITA VEM ANTES DA FILA, e a fila e' relida depois dela: a desistencia
        # de um despacho pode devolver pecas como pedido novo, e ele deve rodar ja'
        # nesta passagem, nao dali a um minuto.
        if despachados:
            colher_despachos()
        for x in na_fila():
            # UM PEDIDO QUE ESTOURA NAO TRAVA A FILA INTEIRA. Sem este cerco, uma
            # excecao fora dos cercos internos derrubava a passagem, o pedido culpado
            # ficava na fila e a oficina crashava de novo a cada minuto, muda. Agora
            # ele sai de cena com o motivo no andamento e os outros pedidos seguem.
            try:
                cumprir(x)
            except (Exception, SystemExit) as e:                    # noqa: BLE001
                print(f"  o pedido {x.name} estourou: {type(e).__name__}: {e}")
                andamento(x.stem, {"id": x.stem, "fim": True,
                                   "erro": f"o pedido quebrou a oficina "
                                           f"({type(e).__name__}: {e}) e saiu da "
                                           "fila; peca de novo pela tela"})
                try:
                    x.rename(x.with_name(x.stem + ".corrompido"))
                except OSError:
                    x.unlink(missing_ok=True)
    finally:
        destrancar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
