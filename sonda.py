"""Sonda 4: um pedido traz os links; o download do arquivo sofre o mesmo limite?"""
import urllib.request, urllib.error, json, time
CAB={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
     "X-IG-App-ID":"936619743392459","Accept":"*/*","Referer":"https://www.instagram.com/"}
UID="59965128968"
try:
    with urllib.request.urlopen("https://api.ipify.org?format=json",timeout=15) as r: ip=json.loads(r.read())["ip"]
except Exception: ip="?"
print(f"endereco: {ip}")

print("\n=== 1 pedido de leitura, para colher os links ===")
try:
    with urllib.request.urlopen(urllib.request.Request(
        f"https://www.instagram.com/api/v1/feed/user/{UID}/?count=12",headers=CAB),timeout=25) as r:
        j=json.loads(r.read())
except urllib.error.HTTPError as e:
    print(f"cortou: {e.code}"); raise SystemExit

itens=[i for i in j.get("items",[]) if i.get("video_versions")]
print(f"  {len(j.get('items',[]))} posts, {len(itens)} com video")

print("\n=== baixando os videos, um atras do outro, SEM pausa ===")
ok=0; bytes_totais=0; t0=time.time()
for n,i in enumerate(itens,1):
    v=sorted(i["video_versions"],key=lambda x:x.get("width",0))[-1]
    try:
        t=time.time()
        with urllib.request.urlopen(urllib.request.Request(v["url"],headers={"User-Agent":CAB["User-Agent"]}),timeout=60) as r:
            dados=r.read()
        dt=time.time()-t; ok+=1; bytes_totais+=len(dados)
        print(f"  {n}: ok {len(dados)//1024} KB em {dt:.1f}s | {i.get('video_duration',0):.0f}s de video | views={i.get('play_count')}")
    except urllib.error.HTTPError as e:
        print(f"  {n}: CORTOU HTTP {e.code} apos {ok} downloads"); break
    except Exception as e:
        print(f"  {n}: erro {type(e).__name__}"); break

g=time.time()-t0
print(f"\nVEREDITO: {ok} de {len(itens)} videos baixados, {bytes_totais/1048576:.0f} MB em {g:.0f}s")
if ok: print(f"media: {bytes_totais/ok/1048576:.1f} MB por video, {g/ok:.1f}s por video")
