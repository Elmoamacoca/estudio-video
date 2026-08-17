"""Extrai as peças de tela do Social Tracker, preservando o contexto de cada regra.

POR QUE ESTE ARQUIVO EXISTE:
a primeira extração puxou as regras uma a uma, achatadas, e trouxe junto o que morava
DENTRO de blocos condicionais. Duas quebraram a tela inteira:

  1. `.nav-itens{display:none}` vive dentro de `@media(max-width:1080px)`. Solta, ela
     escondia as abas em qualquer largura.
  2. estados iniciais de animação (opacity zero, deslocamento) vivem junto da regra que
     os desfaz. Separados, o elemento nasce invisível e nunca aparece.

Aqui a leitura é por blocos equilibrados: quando encontra `@media` ou `@keyframes`, leva
o bloco inteiro, com as chaves de dentro. E o que sobra é conferido: qualquer regra que
deixe algo invisível sem uma animação junto é registrada em vez de copiada em silêncio.
"""
from __future__ import annotations

import re
from pathlib import Path

BASE = Path(__file__).parent
MOLDE = (Path(r"C:\Users\Gabri\OneDrive\Área de Trabalho\Perfis Dark")
         / "Social Tracker - Sistema" / "motor" / "moldes" / "tela_base.html")

# O que a tela do Estúdio usa. Fora disto não vem, para a página não carregar o
# sistema inteiro de outro projeto.
QUERO = (
    "nav-wrap", "nav-body", "nav-logo", "nav-itens", "nav-dir", "nav-hamb", "nav-menu",
    ".pilula", ".marca", ".status", ".troca", ".chave", ".bolinha", ".ind", ".ping",
    ".bola", ".ico", ".online", ".offline",
)


def blocos_equilibrados(css: str):
    """Percorre o CSS devolvendo (seletor, corpo, bloco_inteiro), sem achatar aninhado."""
    i, n = 0, len(css)
    while i < n:
        abre = css.find("{", i)
        if abre == -1:
            return
        sel = css[i:abre].strip()
        nivel, j = 0, abre
        while j < n:
            if css[j] == "{":
                nivel += 1
            elif css[j] == "}":
                nivel -= 1
                if nivel == 0:
                    break
            j += 1
        yield sel, css[abre + 1:j], css[i:j + 1]
        i = j + 1


def interessa(sel: str) -> bool:
    return any(q in sel for q in QUERO)


def extrair_css(html: str) -> tuple[str, list[str]]:
    i = html.find("<style")
    css = html[html.find(">", i) + 1: html.find("</style>", i)]

    guardados, avisos = [], []
    for sel, corpo, inteiro in blocos_equilibrados(css):
        if sel.startswith(("@media", "@supports")):
            # leva o bloco inteiro, mas só com as regras que interessam dentro dele
            dentro = [b for s, _c, b in blocos_equilibrados(corpo) if interessa(s)]
            if dentro:
                guardados.append(sel + "{\n  " + "\n  ".join(dentro) + "\n}")
            continue
        if sel.startswith("@keyframes"):
            if any(k in sel for k in ("ping", "subir", "tracar")):
                guardados.append(inteiro)
            continue
        if sel.startswith(":root") or sel.startswith("html["):
            guardados.append(inteiro)          # a paleta inteira, dos dois temas
            continue
        if interessa(sel):
            # a armadilha: nascer invisível sem nada que desfaça
            some = re.search(r"opacity\s*:\s*0(?!\.)", corpo)
            if some and "animation" not in corpo and "transition" not in corpo:
                avisos.append(f"{sel} nasce invisível e nada o revela: não copiei")
                continue
            guardados.append(inteiro)
    return "\n".join(guardados), avisos


def extrair_pedaco(html: str, inicio: str, fim: str) -> str:
    i = html.find(inicio)
    j = html.find(fim, i) + len(fim)
    return html[i:j] if i >= 0 else ""


def main() -> None:
    html = MOLDE.read_text(encoding="utf-8", errors="replace")
    destino = BASE / "pecas"
    destino.mkdir(exist_ok=True)

    css, avisos = extrair_css(html)
    (destino / "sistema.css").write_text(css, encoding="utf-8")

    (destino / "defs.svg").write_text(
        extrair_pedaco(html, '<svg class="tinta"', "</svg>"), encoding="utf-8")

    # o javascript do cabeçalho: tema, encolher, pílula e menu
    js = [m.group(1) for m in re.finditer(r"<script[^>]*>(.*?)</script>", html, flags=re.S)
          if any(k in m.group(1) for k in ("pilula", "chave-tema", "hamb"))]
    (destino / "cab.js").write_text("\n".join(js), encoding="utf-8")

    print(f"sistema.css: {len(css) // 1024} KB")
    print(f"cab.js: {sum(len(j) for j in js) // 1024} KB")
    for a in avisos:
        print("  descartado:", a)
    # confere que o que quebrou da última vez não voltou
    solta = re.search(r"(?<!\s)\n\.nav-itens\{display:none\}", css)
    print("regra de celular vazando:", "SIM, ainda quebra" if solta else "não")


if __name__ == "__main__":
    main()
