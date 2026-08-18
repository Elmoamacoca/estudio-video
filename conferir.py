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

PROGRAMAS = ["minerar.py", "rodada.py", "selecionar.py", "atividade.py", "baixar.py"]


def nomes_perdidos(caminho: str) -> list[str]:
    """Constantes usadas e nunca definidas. E' o que uma reescrita desastrada deixa."""
    arvore = ast.parse(pathlib.Path(caminho).read_text(encoding="utf-8"))
    definidos = {n.id for x in ast.walk(arvore) if isinstance(x, ast.Assign)
                 for n in x.targets if isinstance(n, ast.Name)}
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

    for e in erros:
        print("  FALHA:", e)
    print("conferencia:", "tudo passou" if not erros else f"{len(erros)} problema(s)")
    return 1 if erros else 0


if __name__ == "__main__":
    raise SystemExit(main())
