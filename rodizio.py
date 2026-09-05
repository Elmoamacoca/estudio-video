# -*- coding: utf-8 -*-
"""O rodizio das contas descartaveis, e as travas que nao deixam queimar nenhuma.

A conta descartavel e' um recurso que se gasta. Este arquivo decide se ele vai ter contas
na semana que vem ou vai recadastrar tudo toda segunda.

O QUE ELE RESOLVE, com N contas no cofre: qual trabalha agora, quanto ela pode ler por dia,
quanto espera entre uma pagina e outra, e o que acontece quando uma cai.

SAO DOIS TETOS, E ELES MEDEM COISAS DIFERENTES:

  por CONTA, aqui         quanto uma conta descartavel trabalha por dia
  por PERFIL, no livro    quantas vezes o MESMO perfil e' relido por dia
                          (`casa.TETO_DIARIO_POR_PERFIL`)

Tirar o do perfil faz N contas lerem N vezes o mesmo perfil no dia. Tirar o da conta faz
uma conta so' carregar a fila inteira ate' cair. Os dois valem ao mesmo tempo.

E A RESPOSTA DELE SOBRE A ESTEIRA, dada em 04/09/2026: "pra ate' eu repor". Com todas as
contas fora, a esteira do acervo PARA de varrer. Quem escreve a marca disso e' a casa,
porque a esteira roda nas vinte maquinas do GitHub e nao enxerga o cofre.
"""
from __future__ import annotations

import random
import time

import cofre

# QUANTAS LEITURAS UMA CONTA FAZ POR DIA. Seis e' o mesmo numero do teto por perfil, e a
# razao e' a mesma: e' quanto uma conta de verdade leria sem parecer robo. Ele sobe quando
# a auditoria da gentileza medir que da', e nao por intuicao.
TETO_DIARIO_POR_CONTA = 6

# UMA CONTA DE CADA VEZ. Duas lendo ao MESMO TEMPO e' o desenho que o Instagram reconhece:
# duas sessoes diferentes, do mesmo endereco, no mesmo segundo. A passagem le' ate' dois
# perfis e usa uma conta por perfil, em sequencia.
POR_PASSAGEM = 2

# AS PAUSAS SAO SORTEADAS, e nao fixas. Pausa fixa e' assinatura de robo: o intervalo entre
# pedidos vira uma reta perfeita, e isso e' visivel do outro lado. A de conta e' maior que
# a de pagina porque trocar de sessao e' o gesto mais caro que existe aqui.
PAUSA_PAGINA = (2.5, 4.5)
PAUSA_CONTA = (15.0, 25.0)

# OS TRES SINAIS DE BLOQUEIO, nomeados. "Parece bloqueada" nao e' criterio: ou o Instagram
# respondeu uma destas tres coisas, ou a conta continua boa.
SINAIS_DE_BLOQUEIO = (429, 403)
PAGINA_DE_VERIFICACAO = "challenge_required"

# A MARCA DE QUE NAO HA' CONTA VIVA, escrita pela casa no acervo e lida pela vaga antes de
# varrer. O nome do arquivo mora aqui porque quem decide caminho DENTRO do acervo e' quem
# escreve nele; o caminho em disco de tudo o mais mora no `caminhos.py` (trava 10).
MARCA_SEM_CONTA = "dados/contas-fora.json"


def _hoje() -> str:
    return time.strftime("%Y-%m-%d")


def contar_hoje(ficha: dict) -> int:
    """Quantas leituras esta CONTA ja' fez hoje.

    O CONTADOR VIVE NO COFRE, E A DATA VAI JUNTO. Contador so' em memoria zera quando o
    computador dele reinicia, e a conta le' o dobro sem ninguem ver, que e' a forma
    silenciosa de queimar uma conta.
    """
    d = ficha.get("leituras_hoje") or {}
    return int(d.get("quantas") or 0) if d.get("dia") == _hoje() else 0


def somar_leitura(ficha: dict) -> None:
    """Uma leitura a mais para esta conta, hoje.

    O DIA VIRA PELA MEIA-NOITE DO RELOGIO DESTE COMPUTADOR. "Meia-noite da conta" nao e'
    mensuravel: a conta nao tem fuso e o Instagram nao publica a janela.
    """
    ficha["leituras_hoje"] = {"dia": _hoje(), "quantas": contar_hoje(ficha) + 1}
    ficha["ultima_leitura"] = int(time.time())


def vivas(contas: list) -> list:
    """As contas que podem trabalhar agora: vivas, com sessao, e com cota do dia."""
    return [c for c in contas
            if c.get("estado") == "viva"
            and c.get("sessao")
            and contar_hoje(c) < TETO_DIARIO_POR_CONTA]


def escolher(contas: list) -> dict | None:
    """A conta que trabalha agora: a MENOS usada recentemente entre as vivas.

    POR QUE A MENOS USADA, e nao a primeira da lista: uma conta carregando tudo e' a que
    cai. Espalhar o trabalho e' o unico jeito de N contas durarem mais do que uma.

    O CRITERIO DE DESEMPATE E' O CADASTRO, e nao o acaso: conta que nunca leu tem
    `ultima_leitura` nulo e vai na frente, o que tambem a estreia mais cedo.
    """
    livres = vivas(contas)
    if not livres:
        return None
    return min(livres, key=lambda c: (int(c.get("ultima_leitura") or 0),
                                      str(c.get("usuario") or "")))


def dormir_entre_paginas(dorme=time.sleep) -> float:
    return _dormir(PAUSA_PAGINA, dorme)


def dormir_entre_contas(dorme=time.sleep) -> float:
    return _dormir(PAUSA_CONTA, dorme)


def _dormir(faixa, dorme) -> float:
    quanto = random.uniform(*faixa)
    dorme(quanto)
    return quanto


def marcar_vencida(contas: list, usuario: str) -> None:
    """401 vira Vencida, e a conta NAO e' apagada.

    Assim ele renova a senha sem recadastrar apelido nem perder o historico dela. Apagar
    resolveria o sintoma e cobraria o cadastro inteiro de novo.
    """
    for c in _achar(contas, usuario):
        c["estado"] = "vencida"
        c["sessao"] = None


def marcar_bloqueada(contas: list, usuario: str) -> None:
    """Sinal de bloqueio vira Bloqueada, e ela NAO e' tentada de novo sozinha.

    Insistir numa conta bloqueada e' o caminho mais curto para perde-la de vez, e para
    respingar no endereco residencial dele.
    """
    for c in _achar(contas, usuario):
        c["estado"] = "bloqueada"


# O TETO DO BOTAO TESTAR AGORA, e ele NAO e' o teto de leitura da conta. Sao tres por dia
# por conta, e o criterio 15 da espec da sub-aba diz por que: com seis leituras por dia,
# seis cliques no botao zerariam a cota antes de a mineracao comecar. Sem teto proprio, o
# botao vira o caminho mais curto por onde ele mesmo queima a conta clicando.
TETO_DO_TESTE = 3

# QUEM SE PERGUNTA E' A PROPRIA CONTA, e nao um perfil. Este endereco devolve quem e' o
# dono da sessao e nada mais: ele nao passa por perfil nenhum, entao testar nao gasta
# leitura de trabalho nem esbarra no teto por perfil do livro.
ONDE_ME_PERGUNTO = "https://www.instagram.com/api/v1/accounts/current_user/"


def contar_testes_hoje(ficha: dict) -> int:
    """Quantos testes esta conta ja' levou HOJE. Contador proprio, com a data gravada.

    A DATA VIAJA JUNTO pelo mesmo motivo do contador de leituras: sem ela, o numero de
    ontem valeria hoje e o botao apareceria travado de manha.
    """
    d = (ficha or {}).get("testes_hoje")
    if not isinstance(d, dict):
        return 0
    return int(d.get("quantas") or 0) if d.get("dia") == _hoje() else 0


def somar_teste(ficha: dict) -> None:
    ficha["testes_hoje"] = {"dia": _hoje(), "quantas": contar_testes_hoje(ficha) + 1}


def testar_a_sessao(ficha: dict, pergunta=None) -> tuple:
    """A sessao desta conta ainda vale? Devolve (passou, motivo).

    ELA RODA NO COMPUTADOR DELE, e nunca na casa: e' leitura logada, e leitura logada de
    endereco de datacenter e' o que o Instagram mais pune (a terceira linha do `casa.py`).
    Quem a chama e' a ponta, cumprindo o botao Testar Agora da sub-aba.

    O TETO E' CONFERIDO AQUI, e nao na tela. Trava conferida so' no navegador e' trava que
    some quando alguem chama a rota direto, e o preco de furar esta e' a conta dele.

    `pergunta` existe para a prova: sem ela o caminho e' o de verdade, com o cliente de
    navegador do `casa.py`, que e' o unico que o Instagram nao recusa por aperto de mao.
    """
    if contar_testes_hoje(ficha) >= TETO_DO_TESTE:
        return False, (f"esta conta já foi testada {TETO_DO_TESTE} vezes hoje; "
                       "o teste conta como uma visita e o limite é por dia")
    sessao = cofre.sessao_da_ficha(ficha)
    if not sessao:
        return False, "esta conta não tem sessão guardada"
    somar_teste(ficha)
    if pergunta is None:
        import casa
        pergunta = casa.pegar_logado
    try:
        codigo, d = pergunta(ONDE_ME_PERGUNTO, sessao)
    except Exception as e:                      # noqa: BLE001
        # FALHA DE AMBIENTE NAO E' VEREDITO SOBRE A CONTA (a regra 2 da auditoria de
        # 25/08/2026). Rede caida marcaria a conta como vencida e cobraria dele um
        # cadastro que nunca foi preciso.
        return False, f"não consegui perguntar ao Instagram agora ({type(e).__name__})"
    if e_bloqueio(codigo, d):
        return False, "o Instagram pediu verificação nesta conta"
    if codigo in (401, 403):
        return False, "o Instagram não aceitou mais esta sessão"
    if codigo != 200 or not isinstance(d, dict):
        return False, f"o Instagram respondeu {codigo}"
    return True, "o Instagram respondeu, e a conta continua valendo"


def e_bloqueio(codigo, corpo=None) -> bool:
    """A resposta e' um dos TRES sinais nomeados de bloqueio?

    Os tres, e nenhum outro: resposta 429, resposta 403, ou a pagina de verificacao de
    seguranca. "Pareceu estranho" nao entra: marcar conta boa como bloqueada custa a conta
    do mesmo jeito que nao marcar a ruim.
    """
    if codigo in SINAIS_DE_BLOQUEIO:
        return True
    texto = corpo if isinstance(corpo, str) else str(corpo or "")
    return PAGINA_DE_VERIFICACAO in texto


def _achar(contas: list, usuario: str):
    alvo = str(usuario or "").strip().lstrip("@").lower()
    return [c for c in contas
            if str(c.get("usuario") or "").strip().lstrip("@").lower() == alvo]


class Passagem:
    """Uma passagem do rodizio: ate' `POR_PASSAGEM` perfis, uma conta por vez.

    ELA NAO LE' NADA SOZINHA. Quem le' e' quem chama, passando uma funcao: assim a mesma
    regra de rodizio serve a leitura logada de hoje e a da ponta de amanha, e a prova
    consegue medir a ORDEM das contas sem falar com o Instagram.
    """

    def __init__(self, contas: list, dorme=time.sleep):
        self.contas = contas
        self.dorme = dorme
        self.usadas: list[str] = []
        self.caidas: list[str] = []
        self.parou_por = ""

    def rodar(self, perfis: list, ler) -> list:
        """Le' ate' dois perfis, uma conta por perfil, em sequencia. Devolve os resultados.

        `ler(conta, perfil)` devolve `{"codigo": ..., "corpo": ..., "ok": bool}`.

        DUAS CONTAS CAINDO NA MESMA PASSAGEM PARAM A PASSAGEM, e nao a fila. A passagem le'
        no maximo dois perfis, entao parar custa dois perfis e nao a leva (trava 7). E duas
        juntas e' sinal de que o problema NAO e' a conta: e' o endereco, ou o momento.
        """
        fora = []
        for n, perfil in enumerate(perfis[:POR_PASSAGEM]):
            if len(self.caidas) >= 2:
                self.parou_por = ("duas contas cairam nesta passagem; o problema "
                                  "provavelmente nao e' a conta")
                break
            conta = escolher(self.contas)
            if conta is None:
                self.parou_por = "nenhuma conta viva com cota do dia"
                break
            if n > 0:
                # A PAUSA ENTRE CONTAS VEM ANTES DA SEGUNDA, e nao depois da primeira:
                # depois, a ultima passagem dormiria a' toa antes de terminar.
                dormir_entre_contas(self.dorme)
            self.usadas.append(conta["usuario"])
            r = ler(conta, perfil) or {}
            somar_leitura(conta)
            if r.get("codigo") in (401,):
                marcar_vencida(self.contas, conta["usuario"])
                self.caidas.append(conta["usuario"])
            elif e_bloqueio(r.get("codigo"), r.get("corpo")):
                marcar_bloqueada(self.contas, conta["usuario"])
                self.caidas.append(conta["usuario"])
            fora.append({"perfil": perfil, "conta": conta["usuario"], **r})
        # E A PARADA E' DITA MESMO QUANDO ELA COINCIDE COM O FIM DA PASSAGEM. Com
        # `POR_PASSAGEM = 2`, duas contas caindo esgotam a lista de perfis no mesmo
        # instante em que o guarda do topo passaria a valer: o guarda nunca chegava a
        # rodar, e a passagem terminava com `parou_por` vazio, como se tivesse acabado
        # normalmente. O motivo e' o que a sub-aba mostra; sem ele, duas contas mortas
        # somem numa passagem que parece ter dado certo.
        if len(self.caidas) >= 2 and not self.parou_por:
            self.parou_por = ("duas contas cairam nesta passagem; o problema "
                              "provavelmente nao e' a conta")
        return fora


# ------------------------------------------------------------------ a virada
#
# A ORDEM DELE, em 04/09/2026: "o principal tem que ser a conta vinculada. O anonimo ele
# vira fallback." A versao 2 desta atividade escrevia o CONTRARIO com o nome trocado.

PONTA = "ponta"
ANONIMO = "anonimo"
PARAR = "parar"

# AS FALHAS QUE SAO DA CONTA. Elas trocam de conta, e NAO caem para o anonimo: cair
# esconderia que a conta morreu, e ele descobriria dias depois, com todas mortas.
FALHAS_DA_CONTA = ("sessao_morta", "bloqueada", "vencida")

# AS QUE NAO SAO DELA. Essas caem para o anonimo, porque a conta continua boa e o que
# faltou foi a rede, o tempo ou o computador dele estar desligado.
FALHAS_DE_FORA = ("rede", "tempo_esgotado", "ponta_desligada")


def qual_caminho(contas: list, ponta_ligada: bool, falha: str | None = None) -> str:
    """Por onde este perfil e' lido AGORA. Devolve `ponta`, `anonimo` ou `parar`.

    ELA E' A UNICA QUE DECIDE ISSO, e os dois chamadores de mineracao a chamam. Escrita
    duas vezes, ela divergiria: e' a trava 60, e nesta atividade ela ja' mordeu no
    `vias_do_feed` e no leitor do cofre.

    A ORDEM, como ele decidiu:

        ha' conta viva e a ponta ligada?  --> a PONTA le', logado, do endereco residencial
        falhou por motivo que NAO e' da conta? --> o ANONIMO tenta, como reserva
        falhou por motivo que E' da conta? --> troca de conta, e NAO cai para o anonimo
        nao ha' conta viva? --> o ANONIMO tenta

    E `parar` NAO E' A MESMA COISA QUE `anonimo`. Ele so' aparece quando a marca da casa
    diz que nao ha' conta viva NENHUMA: ai' a esteira para, por ordem dele ("pra ate' eu
    repor"), em vez de gastar rodada num caminho que ja' foi medido em 401.
    """
    if falha in FALHAS_DA_CONTA:
        # TROCA DE CONTA, e nao cai para o anonimo. Se ainda ha' outra viva, e' ela que
        # entra; se nao ha', o anonimo assume, porque parar por causa de UMA conta seria
        # parar cedo demais.
        return PONTA if vivas(contas) else ANONIMO
    if falha in FALHAS_DE_FORA:
        # A CONTA CONTINUA BOA: o que faltou foi a rede, o tempo ou o computador dele
        # estar desligado. Insistir na ponta aqui seria bater na mesma porta fechada; o
        # anonimo e' de graca e nao gasta conta, entao ele tenta.
        #
        # ESTE RAMO FALTAVA na primeira versao, e o criterio 4 o pegou: as tres falhas de
        # fora caiam no ramo de baixo e voltavam `ponta`, ou seja, o fallback que ele
        # mandou existir nunca era acionado por elas.
        return ANONIMO
    if ponta_ligada and vivas(contas):
        return PONTA
    return ANONIMO


def todas_fora(contas: list) -> bool:
    """Nao sobrou conta viva com sessao? Entao a ponta para, e a esteira tambem.

    ATENCAO AO QUE ISTO NAO OLHA: a cota do dia. Conta viva que ja' leu seis vezes hoje
    volta amanha sozinha; conta vencida ou bloqueada NAO volta sem ele. Parar a esteira
    porque a cota acabou seria parar todo fim de tarde.
    """
    return not any(c.get("estado") == "viva" and c.get("sessao") for c in contas)


def quais_estao_fora(contas: list) -> list:
    """Quais cairam, e por que, para a sub-aba poder dizer em vez de ficar muda.

    Parar calado e' o defeito que custou a tarde de 04/09/2026: ele passou uma hora
    olhando uma tela que descrevia um sistema funcionando enquanto nada acontecia.
    """
    return [{"usuario": c.get("usuario"), "apelido": c.get("apelido"),
             "estado": c.get("estado")}
            for c in contas if c.get("estado") in ("vencida", "bloqueada")]


def marca_de_parada(contas: list) -> dict | None:
    """O que a casa grava no acervo quando nao sobra conta. None quando ha' conta viva.

    ORDEM DELE: "pra ate' eu repor". Com todas fora, a esteira PARA de varrer, em vez de
    continuar rodando de meia em meia hora a' toa.
    """
    if not todas_fora(contas):
        return None
    # O CAMPO `parada` E' QUEM DIZ, e nao a existencia do arquivo. Limpar a marca apagando
    # o arquivo do acervo custaria uma rota de apagar que nao existe; escrever um arquivo
    # "vazio" sem este campo faria o leitor parar do mesmo jeito, porque ele veria um dicio-
    # nario e concluiria parada. Quem carrega o significado e' o campo.
    return {"parada": True,
            "quando": int(time.time()),
            "por_que": "nenhuma conta descartavel viva",
            "quais": quais_estao_fora(contas)}


def esteira_deve_parar(marca, ilegivel: bool = False) -> tuple:
    """A vaga pergunta isto ANTES de varrer. Devolve (para, motivo).

    TRES ESTADOS, E NAO DOIS (trava 3):

      marca ausente    operacao normal: ela nunca foi escrita
      marca presente   todas as contas cairam, e a esteira para
      marca ILEGIVEL   para TAMBEM, e o motivo dito e' outro

    Tratar ilegivel como ausente faria a esteira varrer com todas as contas mortas, que e'
    exatamente o que esta decisao evita. E o motivo tem de ser OUTRO, senao a sub-aba diria
    "as contas cairam" quando o que houve foi um arquivo rasgado.
    """
    if ilegivel:
        return True, ("a marca das contas existe e nao deu para ler; paro por seguranca "
                      "ate' alguem olhar")
    if not isinstance(marca, dict) or not marca.get("parada"):
        return False, ""
    return True, "nenhuma conta descartavel viva; a esteira espera voce repor uma"
