"""Monta a tela do Estúdio a partir das peças do Social Tracker.

POR QUE EXISTE ESTE ARQUIVO, e não uma tela escrita à mão:
o cabeçalho, a paleta e as animações são cópia do Social Tracker, decisão do Gabriel
em 17/08/2026. Copiar na mão uma vez e depois editar o resultado faria as duas telas
divergirem em silêncio. Aqui as peças ficam em `pecas/`, cruas como saíram de lá, e a
tela é remontada por cima delas.

Para atualizar o visual quando o Social Tracker mudar: reextrair as peças e rodar isto.
"""
from __future__ import annotations

import base64
import re
from pathlib import Path

BASE = Path(__file__).parent
PECAS = BASE / "pecas"
MARCA = BASE / "marca"

# As quatro abas, na ordem que o Gabriel definiu. A quarta ainda não tem desenho, e
# isso está dito na própria tela em vez de virar botão que não faz nada.
ABAS = [
    ("minerar", "Mineração"),
    ("baixar", "Baixar"),
    ("tratar", "Tratamento"),
    ("editar", "Edição"),
]


def sem_comentario(css: str) -> str:
    """Tira os comentários do CSS copiado.

    Eles vieram com acentuação quebrada da extração, e comentário do outro sistema
    dentro desta tela é explicação de decisão que não foi tomada aqui.
    """
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def embutir(imagem: Path) -> str:
    """A marca vira texto dentro da própria página: a tela é servida de um lugar só."""
    if not imagem.exists():
        return ""
    return "data:image/png;base64," + base64.b64encode(imagem.read_bytes()).decode()


def cabecalho() -> str:
    itens = "".join(
        f'<a href="#{chave}" data-aba="{chave}"'
        f'{" class=\"ativo\"" if i == 0 else ""}>{rotulo}</a>'
        for i, (chave, rotulo) in enumerate(ABAS))
    return f"""
<header class="nav-wrap">
 <div class="nav-body" id="barra">
  <a class="nav-logo" href="#minerar" data-aba="minerar">
    <img class="marca marca-clara" src="{embutir(MARCA / 'marca-clara.png')}" alt="">
    <img class="marca marca-escura" src="{embutir(MARCA / 'marca-escura.png')}" alt="">Estúdio</a>
  <nav class="nav-itens" id="itens">
    <span class="pilula" id="pilula"></span>
    {itens}
  </nav>
  <div class="nav-dir">
    <span class="status offline" id="estado">
      <span class="ind"><span class="ping"></span><span class="bola"></span></span>
      <span class="rotulo">verificando</span>
    </span>
    <div class="troca">
      <span class="ico sol" id="ir-claro" role="button" tabindex="0" title="Tema claro">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12
             20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34
             17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      </span>
      <button class="chave" id="chave-tema" type="button" role="switch"
              aria-checked="false" aria-label="Alternar entre tema claro e escuro">
        <span class="bolinha"></span>
      </button>
      <span class="ico lua" id="ir-escuro" role="button" tabindex="0" title="Tema escuro">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9
             9 9 0 1 1-9-9Z"/></svg>
      </span>
    </div>
    <button class="nav-hamb" id="hamb" type="button" aria-expanded="false"
            aria-label="Abrir o menu">
      <svg viewBox="0 0 24 24" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
 </div>
 <div class="nav-menu" id="menu">
   {itens}
 </div>
</header>
"""


def por_construir(titulo: str, linhas: list[str]) -> str:
    """O cartão de aba que ainda não foi desenhada.

    Ele diz o que vai morar ali e para por aí. Desenhar botão de coisa que não existe
    é a forma mais rápida de a tela mentir.
    """
    itens = "".join(f"<li>{l}</li>" for l in linhas)
    return f"""
<div class="secao">
  <div class="por-vir">
    <div class="por-vir-selo">a construir</div>
    <h2>{titulo}</h2>
    <p class="nota">Esta aba ainda não foi desenhada. Abaixo, o que vai morar aqui.</p>
    <ul class="por-vir-lista">{itens}</ul>
  </div>
</div>
"""


def montar() -> Path:
    css = "\n".join(sem_comentario((PECAS / f).read_text(encoding="utf-8", errors="replace"))
                    for f in ("paleta.css", "cab.css", "corpo.css"))
    proprio = (BASE / "estilo.css").read_text(encoding="utf-8")
    defs = (PECAS / "defs.svg").read_text(encoding="utf-8", errors="replace")
    js_cab = (PECAS / "cab.js").read_text(encoding="utf-8", errors="replace")
    js_cab = re.sub(r"/\*.*?\*/", "", js_cab, flags=re.S)
    corpo = (BASE / "corpo.html").read_text(encoding="utf-8")
    js = (BASE / "tela.js").read_text(encoding="utf-8")

    html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Estúdio</title>
<style>
{css}
{proprio}
</style>
</head>
<body>
{defs}
{cabecalho()}
<main class="corpo">
{corpo}
</main>
<script>
{js_cab}
</script>
<script>
{js}
</script>
</body>
</html>
"""
    destino = BASE / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


if __name__ == "__main__":
    p = montar()
    print(f"tela montada: {p} ({p.stat().st_size // 1024} KB)")
