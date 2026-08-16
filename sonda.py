"""Sonda: mede se o Instagram responde deste endereco e qual o orcamento antes de cortar."""
import urllib.request, urllib.error, json, time, sys

CAB = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
       "X-IG-App-ID":"936619743392459","Accept":"*/*","Referer":"https://www.instagram.com/"}
UID = "59965128968"   # boletimdamorte
BASE = f"https://www.instagram.com/api/v1/feed/user/{UID}/?count=12"

def endereco():
    try:
        with urllib.request.urlopen("https://api.ipify.org?format=json", timeout=15) as r:
            return json.loads(r.read())["ip"]
    except Exception:
        return "?"

def main():
    pausa = float(sys.argv[1]) if len(sys.argv) > 1 else 1.5
    print(f"endereco de saida: {endereco()} | pausa {pausa}s")
    cursor, total, pagina, t0 = None, 0, 0, time.time()
    primeiro_erro = None
    while pagina < 60:
        url = BASE + (f"&max_id={cursor}" if cursor else "")
        try:
            req = urllib.request.Request(url, headers=CAB)
            with urllib.request.urlopen(req, timeout=25) as resp:
                j = json.loads(resp.read())
            pagina += 1
            itens = j.get("items", [])
            total += len(itens)
            if pagina % 10 == 0 or pagina <= 3:
                print(f"  pagina {pagina:>2}: total {total} posts | {time.time()-t0:.0f}s")
            cursor = j.get("next_max_id")
            if not j.get("more_available") or not cursor:
                print("  chegou ao fim do perfil"); break
            time.sleep(pausa)
        except urllib.error.HTTPError as e:
            primeiro_erro = e.code
            print(f"  CORTOU na pagina {pagina+1}: HTTP {e.code} | ja tinha {total} posts | {time.time()-t0:.0f}s")
            break
        except Exception as e:
            primeiro_erro = type(e).__name__
            print(f"  erro: {primeiro_erro}"); break

    print(f"\nVEREDITO paginas={pagina} posts={total} erro={primeiro_erro} segundos={time.time()-t0:.0f}")

    if primeiro_erro:
        print("\nmedindo recuperacao (sonda a cada 20s, ate 3 min)")
        for i in range(9):
            time.sleep(20)
            try:
                req = urllib.request.Request(BASE, headers=CAB)
                with urllib.request.urlopen(req, timeout=20) as resp:
                    json.loads(resp.read())
                print(f"  RECUPEROU em {(i+1)*20}s"); return
            except urllib.error.HTTPError as e:
                print(f"  {(i+1)*20}s: ainda {e.code}")
        print("  nao recuperou em 3 min")

main()
