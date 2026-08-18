"""Manda os arquivos daqui para o acervo, que é de onde a ponte serve a tela.

Esta pasta não é um repositório: ela é a bancada. O acervo é o repositório
`estudio-video`, e é dele que a esteira roda e a ponte lê. Sem este arquivo, mexer na
tela local não muda nada no ar, e foi assim que a tela já ficou uma versão atrás.

A chave fica em `.claude/secrets/github_token.txt` e nunca aparece na saída.

    python publicar.py                 manda a tela e os programas da esteira
    python publicar.py index.html      manda só o que for nomeado
"""
from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).parent
DONO, REPO = "Elmoamacoca", "estudio-video"
CHAVE = Path.home() / ".claude" / "secrets" / "github_token.txt"

# O que vive no acervo. Os dados não entram aqui: quem escreve `dados/` é a esteira,
# e mandar a cópia local por cima apagaria o avanço das rodadas.
PADRAO = ["index.html", "rodada.py", "minerar.py", "selecionar.py", "baixar.py",
          ".github/workflows/esteira.yml", ".github/workflows/baixar.yml"]


def chave() -> str:
    for linha in CHAVE.read_text(encoding="utf-8").splitlines():
        if linha.startswith("GITHUB_TOKEN="):
            return linha.split("=", 1)[1].strip()
    raise SystemExit("chave do GitHub não encontrada")


def pedir(caminho: str, ficha: str, metodo: str = "GET", corpo: dict | None = None,
          tolera_conflito: bool = False):
    """Uma chamada ao acervo, com paciência para a instabilidade do outro lado.

    O GitHub devolve 503 de vez em quando, sem motivo do nosso lado ("No server is
    currently available"). Aconteceu duas vezes em 17/08, e a segunda apareceu na tela
    do Gabriel como falha de salvar. Três tentativas resolvem isso em silêncio.
    """
    req = urllib.request.Request(
        f"https://api.github.com/repos/{DONO}/{REPO}{caminho}",
        data=json.dumps(corpo).encode() if corpo else None,
        method=metodo,
        headers={"Authorization": f"Bearer {ficha}",
                 "Accept": "application/vnd.github+json",
                 "User-Agent": "estudio-bancada"})
    for tentativa in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 409 and tolera_conflito:
                return None
            if e.code >= 500 and tentativa < 3:
                time.sleep(2 * tentativa)
                continue
            raise SystemExit(f"{metodo} {caminho}: {e.code} {e.read()[:200]}")


def main() -> int:
    ficha = chave()
    alvos = sys.argv[1:] or PADRAO
    for rel in alvos:
        arq = BASE / rel
        if not arq.exists():
            print(f"  {rel}: não existe aqui, pulei")
            continue
        # A MARCA DO ARQUIVO ENVELHECE ENQUANTO A ESTEIRA TRABALHA.
        #
        # Para gravar, o GitHub exige a marca da versão atual. Com vinte máquinas
        # commitando, ela muda entre pedir a marca e usá-la, e a gravação volta com
        # "está em X mas eu esperava Y". Isso não é conflito de verdade: é a bancada
        # tendo lido a marca um segundo cedo demais.
        #
        # Então relê a marca e tenta de novo, até três vezes.
        for volta in range(1, 4):
            atual = pedir(f"/contents/{rel}?ref=main", ficha)
            corpo = {"message": f"atualiza {rel}",
                     "content": base64.b64encode(arq.read_bytes()).decode()}
            if atual and atual.get("sha"):
                corpo["sha"] = atual["sha"]
            if pedir(f"/contents/{rel}", ficha, "PUT", corpo, tolera_conflito=volta < 3):
                print(f"  {rel}: {arq.stat().st_size // 1024} KB no ar")
                break
            print(f"  {rel}: a marca mudou no meio, releio e tento de novo")
            time.sleep(2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
