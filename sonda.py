"""Sonda 3: qual o RITMO sustentavel, e quanto dado vem por pedido."""
import urllib.request, urllib.error, json, time, re

CAB={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
     "X-IG-App-ID":"936619743392459","Accept":"*/*","Referer":"https://www.instagram.com/",
     "Accept-Language":"pt-BR,pt;q=0.9"}
UID="59965128968"; USER="boletimdamorte"
BASE=f"https://www.instagram.com/api/v1/feed/user/{UID}/?count=12"

def bate(url,cab=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=cab or CAB),timeout=25) as r:
            return True,r.status,r.read()
    except urllib.error.HTTPError as e: return False,e.code,b""
    except Exception as e: return False,type(e).__name__,b""

try:
    with urllib.request.urlopen("https://api.ipify.org?format=json",timeout=15) as r: ip=json.loads(r.read())["ip"]
except Exception: ip="?"
print(f"endereco: {ip}")

print("\n=== 1. QUANTO VEM NUM PEDIDO SO ===")
s,cod,corpo=bate(BASE)
if s:
    j=json.loads(corpo)
    itens=j.get("items",[])
    print(f"  {len(itens)} posts | {len(corpo)//1024} KB | mais={j.get('more_available')}")
    if itens:
        i=itens[0]
        print(f"  campos uteis: views={i.get('play_count')} likes={i.get('like_count')} coment={i.get('comment_count')} data={i.get('taken_at')} dur={i.get('video_duration')}")
        print(f"  link do arquivo de video presente: {'sim' if i.get('video_versions') else 'nao'}")
else:
    print(f"  cortou de cara: {cod}")

print("\n=== 2. RITMO: quantos pedidos passam com cada pausa ===")
for pausa in (15, 30, 60):
    print(f"  pausa {pausa}s:", end=" ", flush=True)
    passou=0
    for tent in range(4):
        time.sleep(pausa)
        s,cod,_=bate(BASE)
        if s: passou+=1
        else: print(f"cortou no {tent+1}o (HTTP {cod})", end=""); break
    if passou==4: print("4 de 4 passaram", end="")
    print(f"  -> {passou}/4")
    time.sleep(150)

print("\n=== 3. A PAGINA COMUM DO PERFIL: quanto dado tem dentro ===")
s,cod,corpo=bate(f"https://www.instagram.com/{USER}/", {"User-Agent":CAB["User-Agent"],"Accept-Language":"pt-BR,pt;q=0.9"})
if s:
    h=corpo.decode("utf-8","replace")
    print(f"  {len(corpo)//1024} KB de pagina")
    for chave in ("edge_owner_to_timeline_media","play_count","shortcode","video_url","taken_at_timestamp"):
        print(f"    contem '{chave}': {h.count(chave)} vezes")
else:
    print(f"  nao respondeu: {cod}")
