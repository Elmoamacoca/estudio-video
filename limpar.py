"""Limpeza absoluta de metadado de reel, com inspetor que reprova o que sobrar.

O QUE ISTO FAZ, E O QUE NAO FAZ.
Tira do arquivo tudo que nao e' imagem, som ou indice de reproducao. Nao toca no que
esta' queimado na imagem e no som, que e' conteudo e nao metadado: marca d'agua, logo,
arroba na tela e voz continuam la'. Quem resolve isso e' a etapa de edicao.

POR QUE NAO BASTA O COMANDO CONHECIDO.
O comando que circula, `ffmpeg -map_metadata -1 -c copy`, nao limpa: ele ASSINA. Medido
em 18/08/2026 num reel de verdade, o arquivo saiu com uma caixa nova de 98 bytes com
"Lavf62.12.101" dentro, que e' a versao do proprio ffmpeg. Trocar a marca do Instagram
pela marca do ffmpeg nao e' limpar, e' trocar de digital.

SAO TRES CAMADAS, e cada uma so' morre com um tratamento proprio:

  1. tags de formato e de trilha   -map_metadata -1 e os bitexact
  2. nome do manipulador de trilha -empty_hdlr_name 1
     (sem isto ficam "VideoHandler" e "SoundHandler" escritos no arquivo)
  3. a casca vazia `udta/meta/ilst` que o proprio ffmpeg escreve mesmo sem conteudo
     nenhum, e que carrega o marcador "mdirappl". Nao ha' opcao que a impeca: ela e'
     removida byte a byte, depois, por `sem_udta`.

A MIDIA NAO E' TOCADA. Tudo e' copia de fluxo, sem recodificar: medido nos oito reels do
lote 2, o resumo md5 da trilha de video e da de audio e' o mesmo antes e depois. Zero
perda de qualidade e nenhuma mudanca na imagem.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# As caixas que carregam DADO, e nao midia nem indice de reproducao. Qualquer uma delas
# num arquivo tratado significa limpeza incompleta.
CAIXAS_DE_DADO = {b"udta", b"meta", b"uuid", b"ilst", b"xml ", b"pssh", b"iods",
                  b"cprt", b"loci", b"ID32", b"gps ", b"albm", b"auth", b"titl"}
RECIPIENTES = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"udta", b"edts", b"meta",
               b"ilst", b"moof", b"traf", b"mvex"}

# Texto que denuncia origem, aparelho ou programa. Procurado no arquivo inteiro, porque
# marca d'agua de plataforma mora em caixa customizada que nenhum leitor conhece.
#
# `mdat` fica de fora da busca: video comprimido e' ruido, e em 11 MB de ruido aparecem
# sequencias de tres letras por acaso. Medido: "XMP" aparece dentro da midia de cinco dos
# oito reels do lote 2, sempre cercado de bytes aleatorios, e em nenhum deles ha' pacote
# XMP nenhum. Procurar no arquivo todo daria alarme falso em quase toda peca.
MARCAS = [b"XMP", b"xmpmeta", b"c2pa", b"jumb", b"Instagram", b"instagram", b"Facebook",
          b"TikTok", b"Lavf", b"Lavc", b"HandBrake", b"Adobe", b"GoPro", b"Apple",
          b"appl", b"mdir", b"iPhone", b"Android", b"CapCut", b"Premiere", b"Resolve",
          b"encoder", b"VideoHandler", b"SoundHandler", b"\xa9too", b"\xa9xyz",
          b"\xa9nam", b"\xa9cmt", b"\xa9swr", b"\xa9day", b"\xa9ART", b"\xa9alb"]

LIMPEZA = ["-map_metadata", "-1", "-map_metadata:s:v", "-1", "-map_metadata:s:a", "-1",
           "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
           "-flags:a", "+bitexact", "-empty_hdlr_name", "1", "-c", "copy"]


def caixas(dados: bytes, ini=0, fim=None, nivel=0):
    """Percorre a arvore de caixas do MP4 e devolve (nivel, nome, tamanho, posicao)."""
    fim = len(dados) if fim is None else fim
    i = ini
    while i + 8 <= fim:
        tam = int.from_bytes(dados[i:i + 4], "big")
        nome = dados[i + 4:i + 8]
        cabeca = 8
        if tam == 1:
            tam = int.from_bytes(dados[i + 8:i + 16], "big")
            cabeca = 16
        elif tam == 0:
            tam = fim - i
        if tam < cabeca or i + tam > fim:
            return
        yield nivel, nome, tam, i
        if nome in RECIPIENTES:
            pulo = 4 if nome == b"meta" else 0
            yield from caixas(dados, i + cabeca + pulo, i + tam, nivel + 1)
        i += tam


def auditar(arq: Path) -> dict:
    """O que ainda existe de metadado no arquivo. Auditoria propria, e nao do ffprobe.

    O ffprobe mostra o que ELE entende como metadado; caixa que ele nao conhece nao
    aparece na saida dele e continua dentro do arquivo. Aqui a arvore inteira e' lida.
    """
    b = arq.read_bytes()
    sobras, midia = [], None
    for _n, nome, tam, pos in caixas(b):
        if nome == b"mdat":
            midia = (pos, tam)
        if nome in CAIXAS_DE_DADO:
            sobras.append({"caixa": nome.decode("latin-1"), "bytes": tam, "em": pos})

    # a busca de texto pula a area de midia, pelo motivo escrito la' em cima
    fora = b if not midia else b[:midia[0]] + b[midia[0] + midia[1]:]
    marcas = sorted({m.decode("latin-1", "replace") for m in MARCAS if m in fora})

    ff = subprocess.run(["ffprobe", "-v", "quiet", "-print_format", "json",
                         "-show_format", "-show_streams", str(arq)],
                        capture_output=True, text=True)
    d = json.loads(ff.stdout) if ff.stdout.strip() else {}
    formato = dict((d.get("format") or {}).get("tags", {}))
    # marca, versao e compatibilidade sao a assinatura do FORMATO, e nao do arquivo:
    # todo MP4 tem, e sem elas o arquivo deixa de ser um MP4 valido.
    for k in ("major_brand", "minor_version", "compatible_brands"):
        formato.pop(k, None)
    trilhas = {}
    for s in d.get("streams", []):
        t = dict(s.get("tags", {}))
        t.pop("language", None)          # "und" e' a ausencia de idioma, nao um dado
        # VENDEDOR ZERADO E' AUSENCIA, E NAO SOBRA.
        #
        # O campo de vendedor mora dentro da descricao da amostra e faz parte do formato:
        # ele existe sempre, e o que muda e' se tem alguma coisa escrita. Zerado, o
        # ffprobe imprime "[0][0][0][0]", que e' exatamente o que se quer.
        #
        # Isto so' apareceu na maquina da esteira, no lote 7: a versao de ffprobe daqui
        # nem mostra o campo, e a de la' mostra. Os tres arquivos foram reprovados por
        # estarem limpos. Versao de ferramenta e' ambiente, e inspetor que muda de
        # veredito com o ambiente nao serve para nada.
        if t.get("vendor_id", "").strip("[]0 	") == "":
            t.pop("vendor_id", None)
        if t:
            trilhas[f"trilha {s['index']}"] = t

    return {"arquivo": arq.name, "bytes": len(b), "sobras": sobras, "marcas": marcas,
            "tags_formato": formato, "tags_trilha": trilhas,
            "limpo": not sobras and not marcas and not formato and not trilhas}


def sem_udta(arq: Path) -> str:
    """Tira a casca `udta` que o ffmpeg escreve mesmo vazia, corrigindo os tamanhos.

    SO' COM O `moov` NO FIM DO ARQUIVO. Se ele viesse antes da midia, encurtar o `moov`
    moveria a midia, e todos os indices de posicao guardados dentro dele apontariam para
    o lugar errado. A limpeza acima escreve o `moov` no fim, entao aqui nao ha' risco, e
    esta funcao se recusa a mexer em qualquer outro arranjo.
    """
    b = bytearray(arq.read_bytes())
    ini = tam = None
    i = 0
    while i + 8 <= len(b):
        t = int.from_bytes(b[i:i + 4], "big")
        nome = bytes(b[i + 4:i + 8])
        if t == 1:
            t = int.from_bytes(b[i + 8:i + 16], "big")
        if t <= 0:
            break
        if nome == b"moov":
            ini, tam = i, t
        i += t
    if ini is None:
        return "sem moov"
    if ini + tam != len(b):
        return "o moov nao esta no fim: nao mexo"

    j = ini + 8
    while j < ini + tam:
        t = int.from_bytes(b[j:j + 4], "big")
        if t <= 0:
            break
        if bytes(b[j + 4:j + 8]) == b"udta":
            del b[j:j + t]
            b[ini:ini + 4] = (tam - t).to_bytes(4, "big")
            arq.write_bytes(bytes(b))
            return f"casca de {t} bytes removida"
        j += t
    return "nao havia casca"


def limpar(entrada: Path, saida: Path) -> dict:
    """Limpa um arquivo e devolve o laudo. O laudo diz se ele passa ou nao."""
    t0 = time.time()
    # A FALTA DO FFMPEG E' RECADO, E NAO PILHA DE ERRO. Ela ja' derrubou um lote inteiro
    # com um rastro de vinte linhas de Python que nao diz o que fazer.
    # `ambiente: True` SEPARA A FALHA PASSAGEIRA DA REPROVA DE VERDADE. A reprova de
    # conteudo (sobra, marca, midia que mudou) e' deterministica e bane o reel com
    # razao; falha de ambiente (ffmpeg ausente, disco cheio) bania reel bom para
    # sempre por um aperto passageiro (auditoria de 25/08/2026). Quem le a marca e'
    # o fechar() do registro, que pula o banimento das pecas de ambiente.
    if not shutil.which("ffmpeg"):
        return {"arquivo": entrada.name, "limpo": False, "ambiente": True,
                "erro": "o ffmpeg nao esta instalado nesta maquina"}
    saida.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(entrada)]
                       + LIMPEZA + [str(saida)], capture_output=True, text=True)
    if r.returncode != 0 or not saida.exists():
        de_ambiente = any(s in (r.stderr or "") for s in
                          ("No space left", "Permission denied",
                           "Read-only file system"))
        return {"arquivo": entrada.name, "limpo": False, "ambiente": de_ambiente,
                "erro": (r.stderr or "o ffmpeg falhou").strip()[:200]}
    casca = sem_udta(saida)
    laudo = auditar(saida)
    laudo["casca"] = casca

    # A IMAGEM E O SOM PRECISAM SAIR IGUAIS, E ISSO PASSOU A SER CONFERIDO POR ARQUIVO.
    #
    # A funcao `mesma_midia` existia desde 18/08 e nao era chamada por ninguem: a
    # comparacao tinha sido feita uma vez, na mao, para provar que a limpeza nao mexe no
    # video, e depois a prova ficou valendo por confianca. Nao serve. O comando de limpeza
    # copia as trilhas em vez de recodificar, mas "copia" e' uma promessa do ffmpeg, e
    # promessa nao conferida e' a coisa que este projeto ja' descobriu ser falsa duas
    # vezes: o comando conhecido nao limpava metadado, ele assinava, e o pacote da entrega
    # ja' desceu pela metade sem avisar.
    #
    # Agora cada arquivo carrega no laudo a prova de que o que se ve e o que se ouve
    # saiu byte a byte igual ao que entrou. Custo medido: 0,4 s por arquivo, contra os
    # 0,06 s da limpeza. Vale: e' a unica resposta possivel a "o video perdeu qualidade?".
    igual = mesma_midia(entrada, saida)
    laudo["midia_igual"] = igual
    if not igual:
        laudo["limpo"] = False
        laudo["erro"] = "a imagem ou o som mudaram na limpeza"

    laudo["segundos"] = round(time.time() - t0, 2)
    return laudo


def resumos_das_trilhas(arq: Path) -> dict:
    """Os resumos de cada trilha do arquivo, por tipo, numa passada so'.

    UMA CHAMADA POR ARQUIVO, E NAO UMA POR TRILHA (fecho de 25/08/2026). O `-f md5`
    resume o que o mapa escolher, entao imagem e som custavam duas chamadas por
    arquivo, quatro por comparacao. O `-f streamhash` resume TODAS as trilhas de uma
    vez e devolve uma linha por trilha, no formato `0,v,MD5=...`.

    MEDIDO NA VPS, 25/08/2026, com oito reels reais, cache quente e a ordem alternada
    em tres rodadas: 5,1 / 6,5 / 6,0 s numa chamada contra 6,0 / 8,2 / 11,2 s em duas.
    A primeira medicao, com cache frio, dizia o CONTRARIO (11,4 contra 8,2): esta
    maquina tem vizinho e a mesma carga varia quase o dobro entre rodadas, entao aqui
    so' vale medida repetida e alternada.

    E O VEREDITO E' O MESMO, conferido nos 276 arquivos das levas 28, 29 e 30: para
    cada um, o resumo da imagem e o do som saem identicos aos das chamadas antigas.
    Zero divergencia.

    REEL SEM TRILHA DE AUDIO NAO E' DEFEITO (auditoria de 22/08/2026): num reel mudo o
    mapa "0:a" nao casava com trilha nenhuma, o ffmpeg saia em erro com a saida vazia,
    e o vazio reprovava o reel, que era apagado e banido por uma trilha que ele nunca
    teve. Aqui isso se resolve sozinho: o mudo nao tem a linha do som, dos dois lados,
    e as duas fichas continuam iguais.
    """
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(arq),
                        "-map", "0", "-c", "copy", "-f", "streamhash",
                        "-hash", "md5", "-"], capture_output=True, text=True)
    achados = {}
    for linha in (r.stdout or "").splitlines():
        partes = linha.split(",")
        if len(partes) >= 3:
            achados[partes[1]] = partes[2].strip()
    return achados


def mesma_midia(a: Path, b: Path) -> bool:
    """A imagem e o som saem iguais? Compara o resumo das trilhas, e nao o do arquivo.

    O resumo do arquivo inteiro muda de qualquer jeito, porque o cabecalho mudou. O que
    precisa ficar igual e' o que se ve e o que se ouve.
    """
    da_entrada = resumos_das_trilhas(a)
    da_saida = resumos_das_trilhas(b)
    # FICHA VAZIA E' O FFMPEG QUEBRANDO, e nao arquivo sem trilha: vazia dos dois lados
    # combinaria por engano e daria a limpeza por boa sem ninguem ter conferido nada.
    if not da_entrada or not da_saida:
        return False
    return da_entrada == da_saida


def conferir_pasta(pasta: Path) -> int:
    """Audita uma pasta pronta e diz, arquivo por arquivo, o que sobrou dentro dela.

    POR QUE EXISTE UM CONFERIDOR SEPARADO DO LIMPADOR.
    A limpeza roda uma vez, na esteira, e o laudo dela fica gravado num arquivo que
    ninguem abre. Isto aqui e' para o Gabriel rodar quando quiser, na pasta que ele tem
    na mao, sem depender de acreditar no que aconteceu antes. Auditoria que so' quem fez
    o trabalho consegue rodar nao e' auditoria.

    A CONFERENCIA E' A MESMA DA ESTEIRA, e nao uma versao simplificada: le' a arvore de
    caixas do arquivo inteiro, procura as caixas de dado, varre o texto fora da area de
    midia atras das marcas conhecidas, e ainda pergunta ao ffprobe o que ELE ve'.

        python limpar.py conferir "C:/Users/Gabri/Estudio/levas/leva-28"
    """
    arquivos = sorted(pasta.glob("*.mp4"))
    if not arquivos:
        print(f"nenhum .mp4 em {pasta}")
        return 1

    print(f"conferindo {len(arquivos)} arquivos em {pasta}\n")
    sujos = []
    for arq in arquivos:
        laudo = auditar(arq)
        if laudo["limpo"]:
            print(f"  limpo    {arq.name}")
        else:
            sujos.append(arq.name)
            print(f"  SUJO     {arq.name}")
            for campo in ("sobras", "marcas", "tags_formato", "tags_trilha"):
                if laudo.get(campo):
                    print(f"             {campo}: {laudo[campo]}")

    print()
    if sujos:
        print(f"{len(sujos)} de {len(arquivos)} com sobra de metadado:")
        for n in sujos:
            print(f"  {n}")
        return 2
    print(f"os {len(arquivos)} arquivos estao limpos: nenhuma caixa de dado, nenhuma "
          "marca conhecida, nenhuma etiqueta de formato ou de trilha.")
    return 0


if __name__ == "__main__":
    # O CONFERIDOR VEM ANTES, porque ele e' o unico modo que alguem roda a mao.
    if len(sys.argv) > 1 and sys.argv[1] == "conferir":
        raise SystemExit(conferir_pasta(Path(sys.argv[2] if len(sys.argv) > 2 else ".")))

    origem = Path(sys.argv[1] if len(sys.argv) > 1 else "brutos")
    destino = Path(sys.argv[2] if len(sys.argv) > 2 else "tratados")
    arquivos = sorted(origem.glob("*.mp4"))
    if not arquivos:
        print(f"nenhum .mp4 em {origem}")
        raise SystemExit(1)

    passaram, reprovados, laudos = 0, 0, []
    # O AVANCO DA LIMPEZA TAMBEM E' DITO EM VOZ ALTA, de quinze em quinze segundos.
    # Com duzentos e cinquenta arquivos sao quase um minuto de trabalho, e minuto sem
    # linha nenhuma na tela e' minuto que parece travamento.
    leva = os.environ.get("LEVA") or os.environ.get("LOTE")
    ultimo = [0.0]

    def avisar(feitos: int, fim: bool = False) -> None:
        if not leva:
            return
        if not fim and time.time() - ultimo[0] < 15:
            return
        ultimo[0] = time.time()
        try:
            import registro as diario
            diario.passo(int(leva), "tratando",
                         f"{feitos} de {len(arquivos)} tratados.")
            diario.empurrar(f"leva {leva}: tratando")
        except Exception as e:                                      # noqa: BLE001
            # O AVISO QUE MORREU DEIXA UMA LINHA NO LOG, como o baixar ja' faz: a
            # tela congelada em "tratando 0 de N" precisa de uma pista em algum lugar.
            print(f"  (o registro da tela nao aceitou o avanco: {type(e).__name__})")

    # QUATRO LIMPEZAS DE CADA VEZ. O custo por arquivo e' quase todo de subprocesso
    # (o ffmpeg da copia e os resumos md5), que roda fora do Python e solta o
    # interpretador; quatro juntas ocupam os nucleos da maquina da esteira em vez de
    # deixa-los parados. O teto que impede mais e' a memoria: o auditar le' o arquivo
    # inteiro, entao N limpezas juntas seguram N videos na memoria ao mesmo tempo.
    #
    # O DESENHO E' O MESMO DO RECORTE NA OFICINA: o trabalhador so' devolve o laudo, e
    # quem soma, imprime, apaga reprovado e avisa a tela e' o laco de fora, um por vez,
    # para nenhum contador nem arquivo ser escrito por duas maos.
    QUATRO_JUNTAS = 4
    resultados: dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=QUATRO_JUNTAS) as piscina:
        futuros = {piscina.submit(limpar, arq, destino / arq.name): i
                   for i, arq in enumerate(arquivos)}
        for fut in as_completed(futuros):
            i = futuros[fut]
            arq = arquivos[i]
            try:
                laudo = fut.result()
            except Exception as e:
                # EXCECAO NO GRUPO E' AMBIENTE (ffprobe sumido, disco, memoria), e
                # nao veredito sobre o conteudo: a peca nao pode ser banida por isso.
                laudo = {"arquivo": arq.name, "limpo": False, "ambiente": True,
                         "erro": f"{type(e).__name__}: {e}"}
            laudo["arquivo"] = arq.name
            resultados[i] = laudo
            if laudo.get("limpo"):
                passaram += 1
                print(f"  limpo   {arq.name}  ({laudo['segundos']}s, {laudo['casca']})")
            else:
                reprovados += 1
                # O REPROVADO NAO SEGUE VIAGEM. Entregar um arquivo que nao passou seria
                # pior do que nao entregar: ele iria para o Instagram com a sobra dentro,
                # e ninguem saberia qual dos arquivos do lote era o furado.
                (destino / arq.name).unlink(missing_ok=True)
                print(f"  REPROVA {arq.name}: {laudo.get('erro') or laudo.get('sobras')} "
                      f"{laudo.get('marcas')} {laudo.get('tags_formato')} "
                      f"{laudo.get('tags_trilha')}")
            avisar(passaram + reprovados)
    # O LAUDO SAI NA ORDEM DOS ARQUIVOS, e nao na ordem de chegada. Quem abre o
    # _limpeza.json compara com a pasta, e ordem que muda a cada rodada so' confunde.
    laudos = [resultados[i] for i in range(len(arquivos))]

    # O LAUDO FICA JUNTO DOS ARQUIVOS, para o registro da tela ler depois. Sem ele, a
    # unica prova da limpeza seria o texto que rolou no terminal da esteira, que o
    # Gabriel nao le'.
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "_limpeza.json").write_text(
        json.dumps({"quando": int(time.time()), "laudos": laudos},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    # A ORIGEM DE CADA PECA SEGUE VIAGEM JUNTO COM ELA.
    #
    # O QUE SE PERDIA, e o Gabriel bateu nisso em 23/08/2026. O `baixar.py` grava um
    # `_lote.json` na pasta de onde estes arquivos sairam, com a legenda e o endereco do
    # post de cada um. Esse arquivo ficava para tras: o pacote que vai para o computador
    # leva `tratados/`, e o lote morava em `brutos/`. A leva chegava sem saber de onde
    # veio nenhuma das pecas.
    #
    # E ISSO SO' APARECE LA' NA FRENTE, que e' o pior tipo de perda: a etapa 4 escreve a
    # descricao do post a partir da original, e sem o lote ela nao tem materia-prima.
    # Quem descobre e' quem chega na etapa 4, meses depois de a leva ter sido baixada.
    #
    # VAI SO' O QUE PASSOU NA LIMPEZA, para o lote nao prometer peca reprovada, que foi
    # apagada do destino algumas linhas acima.
    origem = arquivos[0].parent / "_lote.json" if arquivos else None
    if origem and origem.is_file():
        try:
            lote = json.loads(origem.read_text(encoding="utf-8"))
            vivos = {l["arquivo"] for l in laudos if l.get("limpo")}
            lote["itens"] = [x for x in (lote.get("itens") or [])
                             if x.get("arquivo_local") in vivos]
            (destino / "_lote.json").write_text(
                json.dumps(lote, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  origem de {len(lote['itens'])} pecas seguiu junto")
        except (OSError, ValueError) as e:
            print(f"  NAO consegui levar a origem das pecas: {e}")
    else:
        print("  aviso: nao achei _lote.json na origem; a leva vai sem a origem das pecas")

    print(f"\n{passaram} limpos, {reprovados} reprovados")
    # SAI BEM MESMO COM REPROVADO, de proposito: o lote continua e entrega o que passou.
    # Quem conta a reprovacao para o Gabriel e' o registro da tela, e derrubar o trabalho
    # aqui faria um arquivo ruim custar os outros trinta que estavam certos.
    raise SystemExit(0 if passaram else 2)
