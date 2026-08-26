"""A vaga de edicao: uma maquina da esteira recortando ou montando UMA fatia da leva.

POR QUE ISTO EXISTE, decisao de 25/08/2026. Na casa da VPS nao ha' placa de video e uma
peca custa uns 6 minutos de recorte; o Gabriel vetou maquina paga maior e vetou voltar
trabalho para o computador dele. A vaga da esteira e' a saida medida no mesmo dia: o
mesmo comando de video que leva 60,1 s na casa leva 1,88 s aqui, o repositorio publico
roda de graca, e vinte vagas cabem ao mesmo tempo.

O DESENHO E' O DA MINERACAO: a oficina da casa fatia o pedido, publica uma ficha de
retirada com validade, e cada vaga baixa SO' os arquivos da fatia dela, trabalha com AS
MESMAS FUNCOES da oficina (recortar_uma, ficha_da_peca, camada_da_peca, compor; nada e'
reescrito aqui, para o local e o despachado nunca divergirem) e devolve um pacote com
os arquivos prontos e um `_laudo.json`. Quem confere, funde a ficha e guarda na casa e'
o colhedor da oficina, nunca a vaga: a vaga nao tem chave de nada e nao escreve em
lugar nenhum alem da propria pasta de saida.

Uso (a esteira chama, ninguem roda a' mao):
    python3 vaga_edicao.py <endereco da casa> <ficha de retirada> <numero da fatia>
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path.cwd()
CASA_LOCAL = RAIZ / "casa"
SAIDA = RAIZ / "saida"
# O SEGREDO DA RETIRADA viaja mascarado, como segredo do repositorio: o Actions esconde
# segredo no log, e a ficha da URL sozinha nao abre a porta da casa publica.
SEGREDO = (os.environ.get("ESTUDIO_RETIRADA") or "").strip()


def baixar(base: str, ficha: str, rel: str, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    url = f"{base}/retirada/{ficha}/{urllib.parse.quote(rel, safe='/')}"
    req = urllib.request.Request(url)
    if SEGREDO:
        req.add_header("X-Estudio-Vaga", SEGREDO)
    with urllib.request.urlopen(req, timeout=300) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f, 1024 * 256)


def avisar(base: str, ficha: str, numero: int, marcas: str, atual: str) -> None:
    """Conta a' casa o andamento DESTA fatia, peca a peca, para a barra andar AO VIVO.

    A COLHEITA SO' CHEGA NO FIM DA VAGA, e ate' la' a tela ficava parada em zero por
    dez minutos: o Gabriel viu e cobrou ("deve mostrar AO VIVO"). O aviso e' de
    cortesia: falhou, a vaga segue trabalhando, e a colheita continua sendo a unica
    autoridade sobre o resultado."""
    try:
        corpo = json.dumps({"marcas": marcas, "atual": atual}).encode("utf-8")
        req = urllib.request.Request(f"{base}/sinal/{ficha}/{numero}", data=corpo,
                                     headers={"Content-Type": "application/json"})
        if SEGREDO:
            req.add_header("X-Estudio-Vaga", SEGREDO)
        urllib.request.urlopen(req, timeout=8).read()
    except Exception:                                               # noqa: BLE001
        pass


def _manifesto(base: str, ficha: str) -> dict:
    req = urllib.request.Request(f"{base}/retirada/{ficha}/_manifesto")
    if SEGREDO:
        req.add_header("X-Estudio-Vaga", SEGREDO)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    if len(sys.argv) < 4:
        print("uso: vaga_edicao.py <casa> <ficha> <fatia>")
        return 2
    base, ficha, numero = sys.argv[1].rstrip("/"), sys.argv[2], int(sys.argv[3])

    # A CASA DESTA VAGA E' UMA PASTA DESCARTAVEL DAQUI, e a variavel tem de nascer
    # ANTES do import da oficina: e' ela que o `caminhos` le' para decidir onde tudo
    # mora, e a vaga nunca pode escrever numa casa de verdade.
    os.environ["ESTUDIO_CASA"] = str(CASA_LOCAL)
    m = _manifesto(base, ficha)
    import oficina

    tipo, tela, pasta = m["tipo"], m["tela"], str(m.get("pasta", ""))
    fatia = (m.get("fatias") or [])[numero]
    SAIDA.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    feitos = falhas = cards = cegas = 0
    diario, ficha_pecas = [], []
    print(f"fatia {numero}: {len(fatia)} pecas de {pasta} ({tipo})")

    # O LAUDO SAI SEMPRE, ATE' SE A VAGA CAIR NO MEIO. Ele e' escrito num `finally`, com
    # o que houver ate' ali: um pacote sem laudo travava a colheita do despacho inteiro
    # (auditoria de 25/08/2026), porque o colhedor nao sabia contar essa fatia nem
    # desistir dela. Com o laudo sempre presente, fatia incompleta e' fatia contada.
    sinais = ""
    try:
        if tipo == "recorte":
            origem = CASA_LOCAL / "levas" / pasta
            for peca in fatia:
                nome = str(peca.get("arquivo", ""))
                # CADA PECA NUM CERCO PROPRIO: um download que falha (posto reiniciou,
                # rede caiu) vira falha DAQUELA peca, e nao a morte da fatia inteira.
                try:
                    baixar(base, ficha, f"levas/{pasta}/{nome}", origem / nome)
                    nome, achado, laudo, modo = oficina.recortar_uma(
                        origem, SAIDA, peca, tela)
                except Exception as e:                              # noqa: BLE001
                    achado, modo = None, None
                    laudo = {"arquivo": nome, "erro": f"{type(e).__name__}: {e}"}
                diario.append(laudo)
                if laudo.get("erro"):
                    falhas += 1
                    print(f"  {feitos + falhas}/{len(fatia)} {nome}: {laudo['erro']}")
                else:
                    feitos += 1
                    if modo == "card":
                        cards += 1
                    elif modo == "nao consegui olhar":
                        cegas += 1
                    ficha_pecas.append(oficina.ficha_da_peca(nome, achado, laudo, modo))
                    print(f"  {feitos + falhas}/{len(fatia)} {nome}: {modo}, "
                          f"{laudo['segundos']}s")
                # A LETRA DESTA PECA VAI PARA A CASA NA HORA, com o mesmo alfabeto
                # da barra da tela: c=card, v=cheio, ?=nao consegui olhar, f=falhou.
                sinais += ("f" if laudo.get("erro")
                           else "c" if modo == "card"
                           else "?" if modo == "nao consegui olhar" else "v")
                avisar(base, ficha, numero, sinais, nome)
                # O DISCO DA VAGA E' PEQUENO E EMPRESTADO: o bruto ja' usado sai na hora.
                (origem / nome).unlink(missing_ok=True)
        else:
            from PIL import Image
            camadas: dict[int, tuple] = {}
            for peca in fatia:
                nome = str(peca.get("arquivo", ""))
                rel_video = f"recortes/{pasta}/{nome}"
                try:
                    baixar(base, ficha, rel_video, CASA_LOCAL / rel_video)
                    n = int(peca.get("camada") or 0)
                    if n not in camadas:
                        for lado in ("fundo", "frente"):
                            rel = f"despachos/{ficha}/camada-{n}-{lado}.png"
                            baixar(base, ficha, rel, CASA_LOCAL / rel)
                        camadas[n] = (
                            Image.open(CASA_LOCAL / "despachos" / ficha
                                       / f"camada-{n}-fundo.png").convert("RGB"),
                            Image.open(CASA_LOCAL / "despachos" / ficha
                                       / f"camada-{n}-frente.png").convert("RGBA"))
                    mascara = None
                    if peca.get("mascara"):
                        mascara = CASA_LOCAL / str(peca["mascara"])
                        baixar(base, ficha, str(peca["mascara"]), mascara)
                    fundo, frente = camadas[n]
                    camada_png = RAIZ / "camada-da-vez.png"
                    oficina.camada_da_peca(fundo, frente, mascara, tela,
                                           peca.get("enquadre")).save(camada_png)
                    laudo = oficina.compor(camada_png, CASA_LOCAL / rel_video,
                                           SAIDA / nome, tela, peca.get("enquadre"))
                    camada_png.unlink(missing_ok=True)
                except Exception as e:                              # noqa: BLE001
                    # UMA PECA QUEBRADA NAO DERRUBA A FATIA, mesma regra da oficina.
                    laudo = {"erro": f"{type(e).__name__}: {e}"}
                laudo["arquivo"] = nome
                diario.append(laudo)
                if laudo.get("erro"):
                    falhas += 1
                    print(f"  {feitos + falhas}/{len(fatia)} {nome}: {laudo['erro']}")
                else:
                    feitos += 1
                    print(f"  {feitos + falhas}/{len(fatia)} {nome}: "
                          f"{laudo['segundos']}s")
                sinais += "f" if laudo.get("erro") else "c"
                avisar(base, ficha, numero, sinais, nome)
                (CASA_LOCAL / rel_video).unlink(missing_ok=True)
    finally:
        (SAIDA).mkdir(parents=True, exist_ok=True)
        (SAIDA / "_laudo.json").write_text(json.dumps(
            {"pedido": m.get("pedido"), "fatia": numero, "tipo": tipo,
             "feitos": feitos, "falhas": falhas, "cards": cards, "cegas": cegas,
             "segundos": round(time.time() - t0), "diario": diario,
             "ficha": ficha_pecas}, ensure_ascii=False, indent=1), encoding="utf-8")
    gasto = round(time.time() - t0)
    print(f"fatia {numero}: {feitos} prontas, {falhas} falharam, "
          f"{gasto // 60} min {gasto % 60} s")
    # FALHA DE PECA NAO E' FALHA DA VAGA: o laudo conta, o colhedor le'. A vaga so'
    # sai em erro quando nao produziu laudo nenhum, e ai' o teto da oficina age.
    return 0


if __name__ == "__main__":
    sys.exit(main())
