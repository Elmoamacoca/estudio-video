"""Sonda 2: separa 'limite por volume' de 'paginacao exige sessao', e testa vias alternativas."""
import urllib.request, urllib.error, json, time

CAB = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
       "X-IG-App-ID":"936619743392459","Accept":"*/*","Referer":"https://www.instagram.com/",
       "Accept-Language":"pt-BR,pt;q=0.9,en;q=0.8"}
UID="59965128968"; USER="boletimdamorte"

def bate(url, cab=None, rotulo=""):
    req=urllib.request.Request(url, headers=cab or CAB)
    t0=time.time()
    try:
        with urllib.request.urlopen(req,timeout=25) as r:
            corpo=r.read()
        return True, r.status, len(corpo), time.time()-t0, corpo
    except urllib.error.HTTPError as e:
        return False, e.code, 0, time.time()-t0, b""
    except Exception as e:
        return False, type(e).__name__, 0, time.time()-t0, b""

try:
    with urllib.request.urlopen("https://api.ipify.org?format=json",timeout=15) as r:
        ip=json.loads(r.read())["ip"]
except Exception: ip="?"
print(f"endereco: {ip}\n")

print("TESTE A: a MESMA primeira pagina, 8 vezes seguidas (mede limite por volume)")
base=f"https://www.instagram.com/api/v1/feed/user/{UID}/?count=12"
ok=0
for i in range(1,9):
    s,cod,tam,dt,_=bate(base)
    print(f"  {i}: {'ok' if s else 'CORTOU'} {cod} {tam}B {dt:.1f}s")
    if s: ok+=1
    else: break
    time.sleep(1.2)
print(f"  -> passaram {ok} de 8\n")
time.sleep(150 if ok<8 else 5)

print("TESTE B: pagina 1 e depois pagina 2 com marcador (mede se paginar exige sessao)")
s,cod,_,_,corpo=bate(base)
print(f"  pagina 1: {'ok' if s else 'CORTOU'} {cod}")
if s:
    j=json.loads(corpo); cur=j.get("next_max_id")
    print(f"  marcador obtido: {str(cur)[:26]}")
    time.sleep(2)
    s2,cod2,_,_,_=bate(base+f"&max_id={cur}")
    print(f"  pagina 2: {'ok' if s2 else 'CORTOU'} {cod2}")
    if not s2:
        print("  >>> paginar CORTOU com o endereco ainda liberado: o marcador exige sessao")
time.sleep(120)

print("\nTESTE C: vias alternativas de leitura")
vias = [
 ("perfil web (12 posts + marcador)", f"https://www.instagram.com/api/v1/users/web_profile_info/?username={USER}"),
 ("pagina do perfil, html cru", f"https://www.instagram.com/{USER}/"),
 ("marcadores da pagina antiga", f"https://www.instagram.com/{USER}/?__a=1&__d=dis"),
]
for nome,u in vias:
    s,cod,tam,dt,_=bate(u)
    print(f"  {nome:<34} {'ok' if s else 'nao'} {cod} {tam}B {dt:.1f}s")
    time.sleep(3)
