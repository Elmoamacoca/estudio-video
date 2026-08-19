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
    if not shutil.which("ffmpeg"):
        return {"arquivo": entrada.name, "limpo": False,
                "erro": "o ffmpeg nao esta instalado nesta maquina"}
    saida.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(entrada)]
                       + LIMPEZA + [str(saida)], capture_output=True, text=True)
    if r.returncode != 0 or not saida.exists():
        return {"arquivo": entrada.name, "limpo": False,
                "erro": (r.stderr or "o ffmpeg falhou").strip()[:200]}
    casca = sem_udta(saida)
    laudo = auditar(saida)
    laudo["casca"] = casca
    laudo["segundos"] = round(time.time() - t0, 2)
    return laudo


def mesma_midia(a: Path, b: Path) -> bool:
    """A imagem e o som saem iguais? Compara o resumo das trilhas, e nao o do arquivo.

    O resumo do arquivo inteiro muda de qualquer jeito, porque o cabecalho mudou. O que
    precisa ficar igual e' o que se ve e o que se ouve.
    """
    def resumo(arq, qual):
        r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(arq), "-map", qual,
                            "-c", "copy", "-f", "md5", "-"], capture_output=True, text=True)
        return r.stdout.strip()
    return all(resumo(a, q) == resumo(b, q) and resumo(a, q) for q in ("0:v", "0:a"))


if __name__ == "__main__":
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
        except Exception:
            pass

    for arq in arquivos:
        laudo = limpar(arq, destino / arq.name)
        laudo["arquivo"] = arq.name
        laudos.append(laudo)
        if laudo.get("limpo"):
            passaram += 1
            print(f"  limpo   {arq.name}  ({laudo['segundos']}s, {laudo['casca']})")
        else:
            reprovados += 1
            # O REPROVADO NAO SEGUE VIAGEM. Entregar um arquivo que nao passou seria pior
            # do que nao entregar: ele iria para o Instagram com a sobra dentro, e
            # ninguem saberia qual dos arquivos do lote era o furado.
            (destino / arq.name).unlink(missing_ok=True)
            print(f"  REPROVA {arq.name}: {laudo.get('erro') or laudo.get('sobras')} "
                  f"{laudo.get('marcas')} {laudo.get('tags_formato')} "
                  f"{laudo.get('tags_trilha')}")
        avisar(passaram + reprovados)

    # O LAUDO FICA JUNTO DOS ARQUIVOS, para o registro da tela ler depois. Sem ele, a
    # unica prova da limpeza seria o texto que rolou no terminal da esteira, que o
    # Gabriel nao le'.
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "_limpeza.json").write_text(
        json.dumps({"quando": int(time.time()), "laudos": laudos},
                   ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\n{passaram} limpos, {reprovados} reprovados")
    # SAI BEM MESMO COM REPROVADO, de proposito: o lote continua e entrega o que passou.
    # Quem conta a reprovacao para o Gabriel e' o registro da tela, e derrubar o trabalho
    # aqui faria um arquivo ruim custar os outros trinta que estavam certos.
    raise SystemExit(0 if passaram else 2)
