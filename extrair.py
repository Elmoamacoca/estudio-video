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

# A base: sem ela o texto sai com fonte serifada do navegador e as caixas nascem sem
# fundo, porque `var(--branco)` aponta para uma variável que nunca foi definida. Foi
# exatamente o que quebrou a tela na primeira montagem.
BASE_SEL = ("*", "html", "body", "::selection", "a", "img", "button", "input", "textarea")


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


# O SISTEMA DE REVELAÇÃO AO ROLAR NÃO VEM, e isso não é preguiça.
# Lá ele funciona assim: a classe `com-revelar` deixa tudo com opacidade zero, e um
# observador de rolagem marca cada seção como vista para acender. Copiar só a metade
# de CSS deixa a página inteira apagada para sempre, que foi o que aconteceu aqui: o
# texto saía cinza-fantasma e a tela parecia quebrada. Ou vem inteiro, com observador,
# ou não vem. Optamos por não vir: a tela do Estúdio é curta e não ganha nada com isso.
PROIBIDO = ("com-revelar", ".entra", "data-visto")


def interessa(sel: str) -> bool:
    if any(p in sel for p in PROIBIDO):
        return False
    return any(q in sel for q in QUERO)


def e_base(sel: str) -> bool:
    """Regra de base: o seletor inteiro é um dos elementos raiz, não um filho deles."""
    return any(p.strip() in BASE_SEL for p in sel.split(","))


def extrair_css(html: str) -> tuple[str, list[str]]:
    i = html.find("<style")
    css = html[html.find(">", i) + 1: html.find("</style>", i)]
    # Os comentários saem ANTES de qualquer leitura. Com eles no meio, o seletor
    # capturado vinha como "/* explicação */\n:root", e o teste de início de texto
    # falhava: a paleta inteira era descartada em silêncio, e as caixas nasciam sem
    # fundo porque as variáveis de cor nunca existiam.
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

    guardados, avisos = [], []
    for sel, corpo, inteiro in blocos_equilibrados(css):
        if sel.startswith(("@media", "@supports")):
            # leva o bloco inteiro, mas só com as regras que interessam dentro dele
            dentro = [b for s, _c, b in blocos_equilibrados(corpo) if interessa(s)]
            if dentro:
                guardados.append(sel + "{\n  " + "\n  ".join(dentro) + "\n}")
            continue
        if sel.startswith("@keyframes"):
            # Só as animações que a tela realmente usa, e só se terminarem VISÍVEIS.
            # `subir`, de lá, termina em opacidade 0,10: ela serve para sumir com um
            # elemento. Aplicada como entrada, deixou o corpo inteiro a 10% e a tela
            # parecia quebrada. Animação de entrada agora é escrita aqui, com nome
            # próprio, e nenhuma emprestada passa sem esta conferência.
            if "ping" not in sel:
                continue
            fim = re.search(r"(?:to|100%)\s*\{[^}]*opacity\s*:\s*(0(?:\.\d+)?)", corpo)
            if fim and float(fim.group(1)) < 0.9:
                avisos.append(f"{sel} termina invisivel (opacidade {fim.group(1)}): fora")
                continue
            guardados.append(inteiro)
            continue
        if any(p in sel for p in PROIBIDO):
            avisos.append(f"{sel[:50]} é do sistema de revelação: fora")
            continue
        if ":root" in sel or sel.startswith("html["):
            guardados.append(inteiro)          # a paleta inteira, dos dois temas
            continue
        if e_base(sel):
            guardados.append(inteiro)          # fonte, fundo e medidas de partida
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

    # As três conferências que existem porque as três já quebraram a tela uma vez.
    faltando = []
    if "--branco" not in css.split("var(")[0] and not re.search(r"--branco\s*:", css):
        faltando.append("a paleta de cores (as caixas nascem sem fundo)")
    if not re.search(r"(?:^|\n|\})\s*body\s*\{", css):
        faltando.append("a base do corpo (o texto sai com fonte serifada)")
    if re.search(r"(?:^|\n)\.nav-itens\{display:none\}", css):
        faltando.append("a regra de celular vazou para fora do bloco (some com as abas)")
    print("conferência:", "tudo no lugar" if not faltando else "FALTA " + "; ".join(faltando))


if __name__ == "__main__":
    main()
