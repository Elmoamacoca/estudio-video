"""Quantas paginas seguidas UMA maquina consegue ler antes de o Instagram cortar.

POR QUE ISTO IMPORTA: a esteira foi desenhada com a regra "um endereco serve para UMA
leitura", medida em 16/08/2026 com o caminho antigo. Se essa regra afrouxou, a varredura
inteira muda de escala: hoje uma rodada de vinte maquinas rende vinte paginas, e cada
maquina que conseguir ler dez paginas multiplica isso por dez.

A sonda le em sequencia, com uma espera curta entre uma e outra, e para no primeiro
corte. Nao grava nada.
"""
import json
import sys
import time
import urllib.error
import urllib.request

CAB = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
       "X-IG-App-ID": "936619743392459", "Accept": "*/*",
       "Referer": "https://www.instagram.com/"}


def uma(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=CAB), timeout=25) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, None


if __name__ == "__main__":
    conta = sys.argv[1] if len(sys.argv) > 1 else "brandsdecoded__"
    espera = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
    teto = int(sys.argv[3]) if len(sys.argv) > 3 else 30

    st, d = uma(f"https://www.instagram.com/api/v1/feed/user/{conta}/username/?count=12")
    if st != 200 or not d:
        print(f"nem a abertura passou: status {st}")
        raise SystemExit(0)
    uid = (d.get("user") or {}).get("pk")
    marcador = d.get("next_max_id")
    lidos = len(d.get("items") or [])
    formatos = {}
    for x in d.get("items") or []:
        formatos[x.get("media_type")] = formatos.get(x.get("media_type"), 0) + 1
    print(f"pagina 1: {lidos} posts (abertura pelo arroba)")

    pagina = 1
    while marcador and pagina < teto:
        time.sleep(espera)
        pagina += 1
        st, d = uma(f"https://www.instagram.com/api/v1/feed/user/{uid}/"
                    f"?count=12&max_id={marcador}")
        if st != 200 or not d:
            print(f"pagina {pagina}: CORTOU com status {st} depois de {lidos} posts")
            break
        novos = len(d.get("items") or [])
        lidos += novos
        for x in d.get("items") or []:
            formatos[x.get("media_type")] = formatos.get(x.get("media_type"), 0) + 1
        marcador = d.get("next_max_id")
        print(f"pagina {pagina}: +{novos} (total {lidos})")
        if not d.get("more_available") or not marcador:
            print("  acabou o perfil")
            break

    nomes = {1: "post", 2: "reels", 8: "carrossel"}
    print(f"\nRESULTADO: {pagina} paginas seguidas, {lidos} posts, espera de {espera}s")
    print("  formatos:", {nomes.get(k, k): v for k, v in formatos.items()})
