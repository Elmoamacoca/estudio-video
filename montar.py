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

# QUEM DECIDE CAMINHO E' O `caminhos`, e mais ninguem. Trava do CLAUDE.md da raiz.
import caminhos

BASE = caminhos.CODIGO
PECAS = caminhos.PECAS
MARCA = caminhos.MARCA

# AS ABAS, na ordem que o Gabriel definiu. "Tratamento" saiu em 18/08, porque o
# tratamento deixou de ser uma etapa à parte: acontece dentro de Baixar, antes do
# download. Aba para uma etapa que não tem espera nem escolha era mais um lugar para
# olhar sem nada para decidir.
#
# CONFIGURAÇÕES ENTROU EM 21/08, e entrou aqui e não dentro da Edição. A chave da IA
# estava numa gaveta da fase 3, no meio do trabalho, e ele foi direto ao ponto: "a função
# de configuração não deve aparecer dentro do momento de editar, nunca; era pra ser uma
# aba no cabeçalho, antes de tudo". É o mesmo lugar que ela ocupa no Social Tracker.
ABAS = [
    ("minerar", "Mineração"),
    # "BAIXAR" ERA VERBO NO MEIO DE TRES SUBSTANTIVOS, e destoava: Mineracao,
    # Baixar, Edicao, Configuracoes. "Coleta" e a acao que a aba faz e entra na
    # mesma familia das outras tres. Trocado em 24/08/2026, no pedido dele de
    # arrumar "as nomenclaturas que nao fazem sentido, nadas profissionais".
    ("baixar", "Coleta"),
    ("editar", "Edição"),
    ("config", "Configurações"),
]

# Fica fora do molde da página porque o molde é texto formatado, e chave de programa
# no meio dele viraria buraco de preenchimento.
TEMA = ('(function(){var s=null;'
        'try{s=localStorage.getItem("st-tema")}catch(e){}'
        'document.documentElement.setAttribute("data-theme",'
        's==="light"?"light":"dark");})();')


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


def rodape() -> str:
    """O rodapé do sistema, na mesma anatomia do Social Tracker.

    Selo da marca num círculo, os destinos embaixo e os atalhos no pé. Os dois atalhos
    aqui não são os de lá: "sair" não existe neste sistema, que não tem porta, e a pasta
    do Drive ainda não foi autorizada. Ficam o acervo, que é onde os lotes baixados
    esperam, e a esteira, que é onde se vê o que cada rodada fez.
    """
    itens = "".join(f'<a href="#{c}" data-aba="{c}">{r}</a>' for c, r in ABAS)
    return f"""
<footer class="rodape-pagina">
  <div class="rodape-pilha">
    <div class="rodape-selo">
      <img class="marca marca-clara" src="{embutir(MARCA / 'marca-clara.png')}" alt="">
      <img class="marca marca-escura" src="{embutir(MARCA / 'marca-escura.png')}" alt="">
    </div>
    <nav class="rodape-menu">{itens}</nav>
    <div class="rodape-botoes">
      <a href="https://github.com/Elmoamacoca/estudio-video/tree/main/dados" target="_blank"
         rel="noopener" aria-label="Abrir o acervo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0
             2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0
             0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></a>
      <a href="https://github.com/Elmoamacoca/estudio-video/actions" target="_blank"
         rel="noopener" aria-label="Abrir a esteira">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.9
             4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3
             7.7l2.8-2.8"/></svg></a>
    </div>
  </div>
</footer>
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
    # sistema.css sai do extrair.py, que preserva blocos condicionais inteiros. A
    # extração achatada anterior soltou `.nav-itens{display:none}` de dentro do bloco
    # de celular e escondeu as abas em qualquer largura.
    css = sem_comentario((PECAS / "sistema.css").read_text(encoding="utf-8", errors="replace"))
    proprio = (BASE / "estilo.css").read_text(encoding="utf-8")
    defs = (PECAS / "defs.svg").read_text(encoding="utf-8", errors="replace")
    js_cab = (PECAS / "cab.js").read_text(encoding="utf-8", errors="replace")
    js_cab = re.sub(r"/\*.*?\*/", "", js_cab, flags=re.S)
    js_sel = (PECAS / "sel.js").read_text(encoding="utf-8", errors="replace")
    js_sel = re.sub(r"/\*.*?\*/", "", js_sel, flags=re.S)
    # A BIBLIOTECA DO EDITOR DA REVISAO, e ela e' a unica peca que NAO veio do Social
    # Tracker. E' a Fabric 6.7.1, que desenha a peca em tela de pintura e traz as alcas
    # de canto, a selecao direta e a escrita no proprio lugar: o nivel de edicao que ele
    # pediu em 29/08/2026 depois de cinco rodadas de ajuste no desenho antigo.
    #
    # ELA VEM EMBUTIDA, e nao de fora, pela mesma razao da marca: a tela e' servida de um
    # lugar so'. Sao 308 kB que fazem a pagina passar de 990 kB para 1,3 MB, e por isso o
    # Caddy da casa passou a comprimir na saida (vps/Caddyfile), o que devolve o tamanho
    # com folga. Sem o comentario tirado ela nao encolhe: e' arquivo ja' minificado.
    js_fabric = (PECAS / "fabric.js").read_text(encoding="utf-8", errors="replace")
    corpo = (BASE / "corpo.html").read_text(encoding="utf-8")
    js = (BASE / "tela.js").read_text(encoding="utf-8")

    html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Estúdio</title>
<!-- O FAVICON, EM DUAS VERSOES. A mesma marca do Social Tracker, para os
     dois sistemas terem a mesma cara na aba do navegador. A versao clara
     e a escura existem porque um icone escuro some numa aba escura, e
     vice-versa; o terceiro link e' o desempate para navegador que nao
     entende a pergunta do tema. -->
<link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAATaUlEQVR42u1de3Bc5XX/nfPdXVs2tqX1AwwGIfvurrx+kQgIDXEuDAmUR1NKug2TMIUmpQmhwHRKIdMGmE6ZJqWh7aSBtDRtKIUUEKZMOpgSoK7aOlMMsgjYa+29a2GZgrDBAgs/JO1+3+kf+q56veyuJMuyZXvPjEY7Wu3de8/7nO88CNMXyPM8tWjRImlvb9cV3leu6yYcx2kCkBCRBgACgIwxJQADsVjsg8HBwb09PT17q3yH8jyPOjo6DABzTB5yuiEdANvXo0hvbm6eGY/H0wDOAbAGQCsRnSkipxHRbAAziWj0WUQEIlIEMEREHwLYLSI7AeSJaIuIvDF37tygs7PzQDnBjzYxaDpxe0dHRyn8Q0tLy6mO41zMzJcbY9YSUYtSKorg0ddVL2ppUv7bGAMReUtENgN4SUReKhQKuchH2eLGWKk6YQlwCOJd152hlLoUwJdF5DJmbiKiEGEQkZJFJNl7pxrPIWWvRSy1iMghIoQ/WusSEXWKyDPM/HR3d7cfVVNTSYhjRQDKZrMc6nbXdRcqpa4H8FUiWh7h0mEiEhEpR3g1jo+qsLGezViCCBE5zAxL7EER+ZmIPBQEwfoI4lVULR7PBBh9ENd1FzLzTQC+wcyLRQTGmBIRKRqBQ1THIewtcsjfoyrJvtYiIhGi1HrWUEJMSAx7rVeMMT8IguAxe88hcc3xSIAo18fS6fQ3ANxORGeFyIvo6IMA+gD0isg7RPQOgH4AA0SkracjIjJTKTVHRE4FcLqInElEZwI4LeRoS1SIiLbfMR5iGADElhLGmFeJ6E/y+fxPASCbzaoqntm0JcAo1yeTyc8y8/eUUucBgNYaIrJLRDYz88+JaJOI+KeccsrbnZ2dxYl+UTqdnlMqlc5SSq0kovNF5JcArGHmWRHVpsvUVVU1ZVWUssR8hojutDaCQ8mZ7gRwAJSam5tnzpgx47tKqdss4gMA/wZgveM4m3K5XH+Fz3I2m6Xdu3ePeZ8dHR1SzVim0+mzicjTWl9NRBcrpeZZyQjVjhoHIcDMLCIDAO7K5/PfPxK2YSoJEHKYdl33AmZ+nJmbjTHrmPnheDy+4fXXX98fRbbneWwRKZPgLrLeFVvC6Oh1ksnkGUR0NRH9JhGdb6UiJF5NQljJUcwMY8xPh4aGvt7b2/uu53lO1IWeDgSg8KGTyeTtzPz7RPQvxWLxL7Zv314I/8nqUhwFfzsk7iFBVmtr66XGmFuI6CrrAZlIHFCDDqKVUo4xZgcRfSWfz//8cIlAU4X8pUuXznMc59sAFiml7t62bVvv0Q5yxhv0pVKpz4jIHyqlLreqSY+llkSkxMwOgCFjzA1BEDx+OESYEgKcddZZjTNnzrwKwJu+7/83ANibO2Y5lxrOQah+kEqlfhXAvUqplVrrUDJ5DNvAzAyt9a1BEPx1aPMmcgNHHBYuXBifO3fua1u2bNkRfkdvb++x4niM5f/be6Q9e/Z0NzQ0POw4jgC4kIiUiJSs61pV2kXEKKWuTCQSH+3Zs2ej53mOfd5j7gXxNOP4cbvLqVTqQgB/w8wrbapC1cCXADBKKaW1vtn3/QfHq47UEdD3VIOwguMLxNoIZ/Pmzb0LFix4FMASZv6E/H/Wr9rzkogYZr6qsbFxa1dX15aIipsSCaDIxek4RPZEpOEOZv4z6yTVsgthbmmoWCx+tqen59Wx4gSehGoRAJRKpS50XTc+Dc8WJgvaPpPyff8+Y8yXAAxbe2DGYOiGWCz2ZCaTSYRpjSNJAAZgXNedkU6nvwvgo0KhMIQTEwSAbmtri/m+/6SIXCkiB8YgAhtjSszcUiwW/x6AeJ6njpQNYABmyZIlDbFY7FljzPNBELwQyZmfkNDX12fa2tpiW7ZsKcyfP/9/iCgLIBZqgQppcTbGlBzHyTQ2Nu7q6uraVM0e8ETVTiaTic+aNWsDEb1VKBQe9TzPmYo8+XSDzs7OopWEfy+VSl+0Wdmq6RIiUlprw8x/vnz58uZqtkNN0NtRiUTiOQDJNWvWXLRixQpev369wUkCoSRs3brVTyQSvUqpa2yauxIjk40PZmqtz+7v7388YjsnJAFkdZhJpVKPOI5ziTHm2kg+XHASQSgJQRA8Yoy5VynlhEellaTAGKOVUle7rnspAJ3NZtWE3NAwoEgmk9+Jx+PfKhaLj/m+f92RPJQ4DmE0n5RKpZ5VSl1RKpWq5Y80MyutdWcQBJ8qz/TSOJF/g+M4PzbGDBhjPhEEwZuRhNrJCoyRpONCx3FeI6LTbLDGldLYSiklItl8Pv9UNEqupYLYIv8cInrQXuiRIAh6stksn+TIHw3Ienp6dovIjfaETWqUx4gx5k6LVzOWDSAAtGTJkgYiepSZG7TW+4aHh78HgNrb2wV1AADteZ4TBMGzxph/tFxesYrPGCNKqXNTqdRFAExoCyoSwHK4njVr1n3MvMJm/Np37NjRW+d+lB+FGgBcKpXuMMa8z8wVVbM9+hQA36xphEPjmkwm1zLzf9oPQmt9bqFQeC08ZqyjvqKtvEUp9X2tdSWDLNY13Q8gHQTB2wCYKqmetrY2NTAw8Cozr7JnphuDIFh7HKaXj2aJJ2UyGadYLL7BzMlKBllESo7jOFrr3/V9/wHP8xyuoHrMwMDA1x3HWS0iw1akHrGU5jquK+eMPM/jXC43TET3WpxJpco9GYFrQvVF5epo1apVjUNDQ9uIaKGIkIjsj8ViyVwu925dAsaWAtd1Y0T0BjO7FaQgzB0dJCI3n8+/wxE9pgDI4ODgN5VSp4pI0VLyv+rIH78UFAqFIRF5gJlJPl66TTYmaABwYdQLoo6ODt3c3NxIRLfagqWwNvO5aJ1NHcb0iIiZH9Naf2gNsVSq2jbGeKMECLk/Ho9fp5RaZMsyYlpro5TaAECiwUMdqgdn2WyWfd9/H8AzSimUxwVExLaw+DwAFK0eUwB+x1aJhaXeO5jZPxmTbpO1B8aYn1hEcwU1BBFxV65cuYjDg4J0Or2WmVdFmhgAoCuXyw3bqK1OgHFAe3u7ASD79+/fqLV+q8LpGYkImLlpaGgozZ7nkdVJX2FmiIgJCSAiXQAwnuLYOhxijJ2+vr4DAF6I4jSqqqyGSXNHR0dp9erVswFcYYwBEbH1V8HMb0Qqj+swUYNgzPOhQqlkiIkoyQAwODj4KaXU6ZZSFCaPALxZ1/+H7Q1Ba/2yMWawijcEETk7NBCfs0Gaiej/Aa31u3UCHHaqGjt27NgpIn6Yji63AwAWs6XEWuv3j4bQItI/b968D+u4xGEn6GyRVlcFO0CW0RO8dOnSRQAyliIckYAPIi1CdQk4fPhFjRL32ew4zkpmTlj3kyIG4iNMrnruZLcDoSbJ23igkic5gwGstu+ZsnbPA9N0nMHxVFUHx3F6rUNT6cBeGMDyKueY9UOXI0CAAwcO7AHwUQVDPKJeRMStc/qUwocABqrY0iEmosXRYCFUVXb8S90ATxJ6e3uHRWRvlUBsH4vIvCqfnVUnwORVkLWtg+U22KZ63mcAc8rCZbJWuzHaB1DHJybTBjxYRpTw91u15iYkMpnMrDoOJ0+Aag4NERWqVfUCQKPWekHdQE8+JSEis8vwGGqZbZUkgGy6dIYx5sw6ASatfghALHI8LNb7HDLGbGEiKlWq4rKTWlptXqNOgMOETCYTAxB1dMQa5J0i0sO1ggSMDMirw+TOBOYAmBtRPWI9oM2FQmGIbaBwCAHCAxki+mTkzLgOh6GCRGQBEc2JqiDL8BvCRNu7FfJEbA+OV7W0tJxad0UPnwDGmDOJyAkNsu0d08z8HyGid1QIuMIColOUUucDo2WLdcC4zwNCCXAj5wHGFrt15fN5PyxLyVcbimPHOl4G1A/mDxeUUqvLcQpgXdg/TMlk8gpmfjZyHhA9uWdjTCEWi63I5XLDJ+hIgqlUQZJMJjcqpT5tS9aZiIa11isKhcJ2AMxEtM0Ys78Cctm6o26xWLwgnHpYx+v4kZ9KpRYQ0QprgMWOOnuhUChsv+eeexiAYd/3dwLYbv1+qRQPENF1dc7HRBv4QERtzDzPNrmwrZj7AQDkcjkK/1ET0Wbrm5oKfa4QkS9mMpmEbUut24LxG+DPW51fZGbSWndt3779RYz02elRSonIhiopBzLGaMdxEsVi8cuRQt46oOZ5sAagROQyy8Bsq6a/Y9u71CG+ajqdPtsYkyeieAWf3xARGWOCWCy2KpfLlY7EwNIT2fEBoJctW/ZJx3FeFRHNzE5Zo/Yhbaqcz+d3EFFnOKm3QlBmlFIprXUWgKlLwdjqh5mztkkjDMDujMwgOnSeplVD66wdkCopajHG3J3JZOJhI0Id3R/HU0dHh16yZEkDgGttb3Bca/2U7/svVZqeNdq1HYvF2rXW1eoY2RhjlFKp4eHhm+pSUJX7FQCZPXv2FUqps0d41uwVkd+rFkNx2LWdy+V2isjzNmzWVTr8DDPfnclkTgsblOto/3hRrojcYnGlANxeKBT+t1qPXXkf64MW11xlFJcopRKlUul+KwV1ApRt2kgmk2sBrLVZhKd93/+RbXDRVUeW5XI5AcD9/f1vNjU1XaWUWmyNB1fob9LMvKapqen1zZs356z0nPQeUTab5VwuJ/Pnz3/IcZykMabHcZxfee+994Zq4YfK2+1TqdRvMPMTVdrtR91SEXmfiM7J5/N99dE1I8Y1lUpdwsw/E5EhEfF8339l3GMrbfDAvu8/pbXuVCMriyp9MMwRLTTGRDvoT1aviLLZbIiX7zAzG2O+5vv+K+OZp3dIF3c2mw05+VtjUVxrXXIc55JkMnl/R0dHqa2tzTlZPZ/29nadSqVuisfj5xWLxT8IguCfxzu6mKqJk+u66xzHuaaGKoKIlOwc/Zt933+wra0tdjhrR47zpJtZtmzZmY7j7DTG3BcEwZ2YwAR1rjY/GcBtxpi91QZPRIfSEdEDrutmw4F2J9NsCBv1PmOMeSCCfD2Z8fUCQPX39+9tamra5TjO1RbJXO0miEiI6Neamppe27p167a2trZYX1+fORm4P5VK/SkR7QqC4JYI8mVCeesKoLPZrCoUCj8ulUpPOI5TdTSjTVOQ3b+1znXdX+/s7CxaA0Qn8sA+13U/LyJ9vu/fGvF25Eht0CAAtHTp0jmO47zMzOla9iBSbgERudn3/R9OxeKz6QKLFy+eNXfu3GX5fP6NyUySofGIWWtr60oR2YiRSmoZY3w7bBbwvnw+fyciq6xO5OPHSR2d1QDjeZ7T3d29pVgsXjuO9VJhLYxm5jvS6fT6dDp9ukX+8aySai2qkEmfXY6RYCp5nuf09PQ8p7W+3iaYzBgz9FWpVCoR0eUAXl62bNkXLBHE2objLcqtxnRy1FYZRiYD3sjMD4WbSGsR0eaNQpvxI6XUXXb61pRtJ52qpaPGmOEam7mnTgLKJSEIgr/TWl8X1g1VGVQ6GieIiLGpi98ulUqddonnqK9sM4U0jVSNio7mTKfTX2Xmiw8ePFicivS7mmDDmfE8z+nq6vpFY2PjJma+kpln2RW0NafwWrswj4iuSiQSVyxYsODDPXv2bMvlciaUsN7e3mPVk8ae56nIqi1Jp9NfSCQSPwTg+77/8L59+4pTcW80mUGlrutmlFI/YeY1emTz2VgbSsXWRyqrojYZYx5k5qfz+fxHZdeXKdy2N7pvsmy5nEqn01cA+CMROVVEbgyC4MWprAikyW5JzWQyp2it/4qIvhZZyOyMdzup9Zp6iegJInqyu7u7s1xKPc+jSSz5pAjCw+vosm2raRG5mohuUEq1lkqlfx0cHLx+586dH0xmUefRWOTGkTWAXyKi+5n5DK31RNbESmRDKURkE4D1AF7cu3fva7t27dpfTX1ms9mKRcOLFi2SWktC29raYgMDAysAXEJEvwzgM7FYbGaxWPwIwM2+7//T0XIUCEdwbW1LS8upsVjsjwHcaPPiJrIqcKz97qZstztE5C0R2Qxgkx37sj0ej79dtga3JriuO0MptRhAC4DVInK+iJxLRC6PQLhU+h+I6K58Pv/OkVrWfLRXGUbdtguUUt8GcGUEmWOtAywnxuhe+XA1uda6BGA3EfWJyG4AezAyBmAfERVFRBHRKQDmAEgAWARgMYCFzNwQXifcR29fb7Dryjcc6XXlx2KXJEVduGQy+Tkiug3AlUopCteJR8Y5jocY4XY6BsAhQcqWI5THH4e8tj9FImJmVvb9jQD+Mp/Pr4seqh9tL4ymsjo4tA/pdPpcAL8lItcw82kRxITcTpE9wxjH9tOw30HG+j8iciziYYwZsvblb/P5/POVmOZY9bIelX29mUwmUSwWLyOia0TkIqXUgqhasJPFdWRwLI1xnx8jRrnqslLXRURPi8hTvu93TwfE4yg3YHM2m6Wobm1tbZ1vjDkfwCUAPg1gORE1Ws80OjiqomoJVU/5b4vw3QC6AGxg5he6u7s3l0knTZc0CB2DCgK2O2hMmbeykJnTIrIcQCsRtQA4A0ATRhqdZ9rYg0VEE9GwiOwlon4A74hIgYi2MPPWgwcPdvf29n5YIXicbhu9j2kOhrLZLO/evZtsSUxFfd7c3DyzoaFhNoB4sVicrZRyiGhweHj4YENDw/5cLrevRnohjHSnbTn9/wH2ofbCgqchugAAAABJRU5ErkJggg==" media="(prefers-color-scheme: light)">
<link rel="icon" href="data:image/png;base64,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" media="(prefers-color-scheme: dark)">
<link rel="icon" href="data:image/png;base64,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">
<!-- O TEMA, ANTES DE QUALQUER PINTURA.
     A troca do cabeçalho sempre gravou a escolha, mas ninguém a lia de volta: a tela
     abria sem tema nenhum e caía no claro, toda vez, por mais que a chave fosse virada.
     Aqui a escolha guardada é aplicada antes do primeiro quadro, então não há piscada
     branca ao abrir no escuro.

     E O PADRÃO É O ESCURO. O sistema de origem pergunta ao sistema operacional quando
     não há escolha gravada; aqui o padrão é fixo, porque foi ele que o Gabriel pediu. -->
<script>{TEMA}</script>
<!-- A Manrope é a fonte do sistema, e ela vem de fora. Sem estes três links a paleta
     e as medidas continuam certas, mas o texto cai na fonte serifada do navegador e a
     tela inteira parece quebrada, que foi o que aconteceu na primeira montagem. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<!-- AS FONTES DA PEÇA, que são outra coisa: estas não desenham a tela, elas desenham o
     reel. Entraram em 21/08 porque o seletor tinha sete opções e o Gabriel disse o
     óbvio, "era pra ter vários outros tipos de fonte".

     ELAS PRECISAM EXISTIR NOS DOIS LADOS. Aqui o navegador as busca no Google para
     mostrar; na hora de gravar quem desenha é o `oficina.py`, que lê os mesmos arquivos
     de `Estudio/fontes`. Fonte que existisse só de um lado faria a peça sair diferente
     do que ele viu na tela, e é por isso que a lista dos dois lados é a mesma. -->
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Barlow+Condensed:wght@400;700&family=Bebas+Neue&family=Inter:wght@400;700&family=Montserrat:wght@400;700&family=Oswald:wght@400;700&family=Poppins:wght@400;700&family=Roboto+Condensed:wght@400;700&display=swap">
<style>
{css}
{proprio}
</style>
</head>
<body>
<!-- A BARRA DO ENDERECO ERRADO, e ela mora fora das abas de proposito.

     POR QUE ELA EXISTE: o recado que eu tinha posto ficava dentro da aba de
     Configuracoes, e so' aparecia para quem chegasse la'. O Gabriel voltou pela terceira
     vez dizendo "a chave ainda nao foi salva", com o Estudio aberto pelo endereco da
     internet, que e' justamente o que nao grava no disco. Aviso que depende de a pessoa
     ir ate' ele nao e' aviso. -->
<div class="fora" id="fora_de_casa" hidden>
  <span><b>Esta tela está aberta pela internet.</b> Por aqui o navegador não deixa ela
    gravar no disco desta máquina, então chave e ajuste não ficam guardados.</span>
  <a class="acao forte" id="fora_ir" href="http://127.0.0.1:8787/">Abrir o Estúdio aqui</a>
</div>
{defs}
{cabecalho()}
<main class="corpo">
{corpo}
</main>
{rodape()}
<script>
{js_cab}
</script>
<script>
{js_sel}
</script>
<script>
{js_fabric}
</script>
<script>
{js}
</script>
</body>
</html>
"""
    # A TELA MONTADA MORA EM `telas/`, e nao ao lado do programa que a monta. Pasta de
    # codigo com produto gerado dentro convida a editar o produto, que some na montagem
    # seguinte sem aviso.
    destino = caminhos.criar(caminhos.TELAS) / "index.html"
    destino.write_text(html, encoding="utf-8")
    return destino


if __name__ == "__main__":
    p = montar()
    print(f"tela montada: {p} ({p.stat().st_size // 1024} KB)")
