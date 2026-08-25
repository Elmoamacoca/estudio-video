"""Trava de sanidade: roda antes de publicar e antes de cada rodada.

POR QUE EXISTE: em 18/08/2026 uma reescrita de funcao apagou duas constantes junto, e
o erro so' apareceu quando a rodada 106 quebrou no ar, com os perfis parados e o
registro dizendo "sem avanco". Nada aqui na bancada tinha reclamado: o arquivo
continuava valido em sintaxe, e o nome perdido so' estoura quando a linha e' executada.

Esta trava importa cada programa de verdade e executa os caminhos principais com dados
de mentira. Nao toca no Instagram, nao grava no acervo, nao demora.
"""
import ast
import builtins
import pathlib
import sys

# ESTE ARQUIVO VIVE EM DOIS MUNDOS, e por isso ele e' a unica excecao a' trava do
# `caminhos`. Aqui na bancada ele roda dentro de `motor/`, com o `caminhos` ao lado. No
# acervo ele roda na raiz de um repositorio plano, onde o `caminhos` nao existe e nao deve
# existir: os seis fluxos do GitHub rodam `python rodada.py` da raiz, e mover programa para
# subpasta la' quebraria os seis de uma vez.
#
# ISTO JA' QUEBROU UMA VEZ, em 22/08/2026, e durou uma publicacao: a arrumacao das pastas
# poz um `import caminhos` aqui, o arquivo subiu assim, e a esteira passou a estourar em
# `python conferir.py` antes de varrer qualquer perfil. Se voce mexer neste topo, lembre que
# metade das vezes que este arquivo abre, ele esta' sozinho.
try:
    import caminhos
    ONDE_ESTA_A_TELA = caminhos.TELA
    ONDE_ESTA_O_PROGRAMA = caminhos.MOLDE_PROGRAMA
    ONDE_ESTA_A_FOLHA = caminhos.MOLDE_ESTILO
    # AS PECAS DE QUE A TELA NASCE. So' existem na bancada: no acervo o `index.html` ja'
    # chega montado, e comparar data la' nao quer dizer nada.
    PECAS_DA_TELA = [caminhos.MOLDE_PROGRAMA, caminhos.MOLDE_CORPO,
                     caminhos.MOLDE_ESTILO] + sorted(caminhos.PECAS.glob("*"))
except ImportError:
    AQUI = pathlib.Path(__file__).resolve().parent
    ONDE_ESTA_A_TELA = AQUI / "index.html"
    ONDE_ESTA_O_PROGRAMA = AQUI / "tela.js"
    ONDE_ESTA_A_FOLHA = AQUI / "estilo.css"
    PECAS_DA_TELA = []

# TODO PROGRAMA QUE RODA NO AR ENTRA AQUI. fundo, resgate, guardar, drive, posto e
# vaga_edicao entraram em 25/08/2026: eles rodam na VPS ou nas vagas e ficavam fora
# da varredura, o mesmo filme do fundo/atividade de 22/08 (o que vive nos dois mundos
# sem vigia quebra no ar sem aviso). A varredura de nomes e' barata e roda em ambos.
PROGRAMAS = ["minerar.py", "rodada.py", "selecionar.py", "atividade.py",
             "baixar.py", "limpar.py", "registro.py", "etiquetar.py",
             "catalogo.py", "oficina.py",
             "fundo.py", "resgate.py", "guardar.py", "drive.py", "posto.py",
             "vaga_edicao.py"]


def nomes_perdidos(caminho: str) -> list[str]:
    """Constantes usadas e nunca definidas. E' o que uma reescrita desastrada deixa."""
    arvore = ast.parse(pathlib.Path(caminho).read_text(encoding="utf-8"))
    # TODO ALVO DE ATRIBUICAO CONTA, e nao so' o `X = 1` simples: `LARGURA, ALTURA =
    # 1080, 1920` (tupla), `for X in`, `with ... as X` e `X: int = 1` definem nome do
    # mesmo jeito, e a versao antiga os dava como perdidos, barrando publicacao boa.
    # Trava que grita a' toa e' trava que se aprende a desligar.
    definidos = {n.id for n in ast.walk(arvore)
                 if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)}
    definidos |= {f.name for f in ast.walk(arvore)
                  if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))}
    definidos |= {(a.asname or a.name).split(".")[0] for i in ast.walk(arvore)
                  if isinstance(i, (ast.Import, ast.ImportFrom)) for a in i.names}
    return sorted({n.id for n in ast.walk(arvore)
                   if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)
                   and n.id.isupper() and n.id not in definidos
                   and not hasattr(builtins, n.id)})


def main() -> int:
    erros = []
    for prog in PROGRAMAS:
        if not pathlib.Path(prog).exists():
            continue
        perdidos = nomes_perdidos(prog)
        if perdidos:
            erros.append(f"{prog}: nome usado e nunca definido: {', '.join(perdidos)}")

    # o caminho que a esteira percorre em toda rodada, com o acervo como ele estiver
    try:
        import rodada
        rodada.pendentes(rodada.contas_pedidas())
        rodada.regua()
        for f in ([], ["reels"], ["carrossel"], ["reels", "post", "carrossel"]):
            r = {"formatos": f}
            rodada.so_reels(r)
            rodada.rotulo_dos_formatos(r)
            rodada.ja_basta({"posts": [{"formato": "reels"}] * 5, "vistas": 5}, r)
    except Exception as e:
        erros.append(f"rodada.py: {type(e).__name__}: {e}")

    try:
        import selecionar
        selecionar.selecionar()
    except Exception as e:
        erros.append(f"selecionar.py: {type(e).__name__}: {e}")

    try:
        import atividade
        atividade.rotulo()
        atividade.contas_na_lista()
    except Exception as e:
        erros.append(f"atividade.py: {type(e).__name__}: {e}")

    # A SINTAXE DA TELA, quando ha' com que conferir.
    #
    # O que esta conferencia pega e' a classe de defeito mais cara desta tela: um erro de
    # sintaxe no `tela.js` nao quebra um pedaco, quebra o arquivo inteiro, e a pagina abre
    # pintada uma vez e congelada para sempre. Ja' aconteceu duas vezes. Em 18/08/2026 um
    # bloco com `await` caiu dentro de uma funcao comum, por um substituir que pegou tres
    # lugares em vez de um, e nada em Python veria isso.
    #
    # Se nao houver node na maquina, a conferencia passa em silencio: ela e' um ganho,
    # nao uma exigencia de ambiente.
    import shutil
    import subprocess
    tela = ONDE_ESTA_O_PROGRAMA
    if shutil.which("node") and tela.exists():
        r = subprocess.run(["node", "--check", str(tela)], capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            primeira = [l for l in (r.stderr or "").splitlines() if "Error" in l]
            erros.append(f"tela.js: {primeira[0] if primeira else 'sintaxe invalida'}")

    # O NOME PERDIDO DA TELA, que a sintaxe nao pega.
    #
    # E' o mesmo defeito do bloco de cima, do outro lado: em 20/08/2026 tres reescritas
    # seguidas do passo 3 apagaram estado que outra funcao ainda citava (`CAIXAS`,
    # `TIQUE`, `LEG`, `RETOMAR`). O `node --check` passou nas quatro, porque a gramatica
    # estava certa, e o erro so' apareceu quando o Gabriel abriu uma leva: a oficina
    # entrava sem galeria e sem o cartao de liberar a pasta.
    if tela.exists():
        try:
            import nomes
            perdidos = nomes.soltos(tela)
            if perdidos:
                erros.append("tela.js: nome usado e nunca declarado: "
                             + ", ".join(perdidos))
            # E A FUNCAO CHAMADA QUE NINGUEM ESCREVEU, que e' a metade que faltava.
            #
            # ISTO CUSTOU A FERRAMENTA INTEIRA, e em silencio. So' o nome em MAIUSCULA era
            # vigiado, porque a regra da casa diz que e' la' que mora o estado da tela. O
            # botao Montar, que e' o ultimo passo do sistema, chamava `nomeLivre(...)`, uma
            # funcao que nunca foi escrita: nome minusculo, passou por aqui todas as vezes.
            # Toda montagem estourava na primeira linha. O disco contava: 292 recortes
            # prontos e a pasta `edicoes` vazia, sem um unico arquivo.
            sem_dono = nomes.funcoes_soltas(tela)
            if sem_dono:
                erros.append("tela.js: funcao chamada e nunca escrita: "
                             + ", ".join(sem_dono))
        except ImportError:
            pass          # ganho, e nao exigencia: sem o `nomes.py` a trava so' nao roda
        except Exception as e:
            erros.append(f"nomes.py: {type(e).__name__}: {e}")

    # E OS ELEMENTOS QUE A TELA PEDE E A PAGINA NAO TEM. `$("x")` de um id que nao existe
    # devolve nulo, e a linha seguinte estoura do mesmo jeito.
    indice = ONDE_ESTA_A_TELA
    if tela.exists() and indice.exists():
        import re
        ids = set(re.findall(r'id="([^"]+)"', indice.read_text(encoding="utf-8")))
        js = tela.read_text(encoding="utf-8")
        faltam = sorted({p for p in re.findall(r'\$\("([A-Za-z0-9_]+)"\)', js)
                         if p not in ids})
        if faltam:
            erros.append("tela.js pede id que a pagina nao tem: " + ", ".join(faltam))

    # E O `hidden` QUE NAO ESCONDE, que e' o erro mais caro dos tres.
    #
    # O QUE ACONTECEU EM 21/08/2026: a janela da chave nascia aberta na tela do Gabriel e
    # nao fechava com nada. Clicar no X punha `hidden` no elemento, e `hidden` nao fazia
    # efeito, porque `.pop{display:flex}` e' regra do autor e vence `[hidden]{display:none}`
    # do navegador POR ORIGEM, e nao por especificidade. O painel estava sempre la', e nao
    # havia como fechar o que nunca tinha aberto.
    #
    # A CASA JA' SABIA DISSO: ha' vinte regras `.alguma-coisa[hidden]{display:none}` nesta
    # folha, escritas exatamente por este motivo. O que faltava era alguem conferindo, em
    # vez de cada um lembrar.
    #
    # POR QUE A MINHA PROVA NAO PEGOU: eu li o ATRIBUTO (`el.hidden`), que mudava certinho,
    # e nunca li o `display` que a tela aplica de verdade. Conferir a intencao em vez do
    # resultado e' o mesmo que nao conferir.
    folha = ONDE_ESTA_A_FOLHA
    if indice.exists() and folha.exists():
        import re
        pagina = indice.read_text(encoding="utf-8")
        css = folha.read_text(encoding="utf-8")
        # A CONTA E' POR ELEMENTO, E NAO POR CLASSE SOLTA, e isto e' conserto de um
        # alarme falso da primeira versao desta trava. Um elemento costuma ter mais de uma
        # classe: `<div class="caixa apl-obra" hidden>` esconde direito, porque
        # `.apl-obra[hidden]` existe, mesmo que `.caixa` mande em `display` e nao tenha
        # regra propria. So' e' defeito quando NENHUM dos nomes do elemento, classe ou id,
        # devolve o comando ao `hidden`.
        # SO' A REGRA SIMPLES CONTA, quer dizer, aquela cujo seletor e' o proprio nome e
        # mais nada. `.cfg-duas > .caixa{display:flex}` tambem venceria o `hidden`, mas so'
        # dentro daquele pai; contar essas encheria a conferencia de alarme falso, e
        # conferencia que grita a toa e' conferencia que ninguem le'.
        def manda_em_display(nome):
            return re.search(r"(?:^|[};])\s*%s\s*\{[^{}]*display\s*:"
                             % re.escape(nome), css, re.M)

        def devolve_ao_hidden(nome):
            return re.search(r"%s(?![\w-])\[hidden\]" % re.escape(nome), css)

        # `aria-hidden` NAO E' `hidden`, e confundir os dois foi o primeiro alarme falso
        # desta trava: ela acusou tres svg de enfeite que nunca estiveram escondidos.
        cegas = []
        for tag in re.findall(r"<[a-zA-Z][^>]*(?<![-\w])hidden(?=[\s>=/])[^>]*>", pagina):
            mc = re.search(r'class="([^"]*)"', tag)
            mi = re.search(r'id="([^"]*)"', tag)
            nomes_css = ["." + c for c in (mc.group(1).split() if mc else [])]
            if mi:
                nomes_css.append("#" + mi.group(1))
            if not nomes_css or any(devolve_ao_hidden(n) for n in nomes_css):
                continue                      # alguem ja' desliga: o elemento esconde
            culpadas = [n for n in nomes_css if manda_em_display(n)]
            if culpadas and culpadas[0] not in cegas:
                cegas.append(culpadas[0])
        if cegas:
            erros.append("regra de `display` sem `[hidden]` para desligar, entao o "
                         "elemento nunca esconde: " + ", ".join(cegas))

    # A TELA MONTADA TEM DE SER MAIS NOVA QUE AS PECAS DELA. Trava 4 do CLAUDE.md.
    #
    # POR QUE ESTA CONFERENCIA GANHOU ISTO. A trava ja' era vigiada em tres lugares: o
    # posto avisa, o `ver.py` se recusa a fotografar e o `provar.py` reprova. Faltava
    # justamente o caminho da PUBLICACAO: o `publicar.py` chama esta conferencia e mais
    # nada, entao mexer no `tela.js` e publicar sem montar subia a tela da semana passada
    # com tudo verde. E' o pior tipo de erro daqui, porque nada reclama.
    if PECAS_DA_TELA and ONDE_ESTA_A_TELA.exists():
        montada = ONDE_ESTA_A_TELA.stat().st_mtime
        velhas = [p.name for p in PECAS_DA_TELA
                  if p.is_file() and p.stat().st_mtime > montada]
        if velhas:
            erros.append("a tela montada e' mais velha que " + ", ".join(velhas)
                         + ". Rode `python montar.py` antes de publicar.")

    for e in erros:
        print("  FALHA:", e)
    print("conferencia:", "tudo passou" if not erros else f"{len(erros)} problema(s)")
    return 1 if erros else 0


if __name__ == "__main__":
    raise SystemExit(main())
