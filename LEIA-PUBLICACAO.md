# Por que existe um arquivo `.nojekyll` aqui

O GitHub Pages passa tudo por um montador de site chamado Jekyll antes de publicar.
Ele trata `{{ ... }}` e `{% ... %}` como comandos dele, e a tela deste projeto tem
essas sequências dentro do JavaScript.

Em 18/08/2026 isso derrubou quatro publicações seguidas: o acervo recebia o arquivo
novo, o Pages tentava montar, falhava com "Page build failed", e continuava servindo a
versão anterior. Da tela, parecia demora de propagação; o arquivo publicado estava
certo e simplesmente não ia para o ar.

O arquivo `.nojekyll`, vazio, desliga esse montador. Os arquivos passam a ser servidos
como estão, que é o que este projeto precisa: aqui não há site para montar, só uma
página pronta.
