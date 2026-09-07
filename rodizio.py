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

# O `cofre` NAO E' IMPORTADO AQUI EM CIMA, e a razao e' o acervo (07/09/2026).
#
# ELE ENTRA SO' DENTRO DO `testar_a_sessao`, que e' a unica funcao daqui que precisa dele, e
# que roda EXCLUSIVAMENTE no computador dele, cumprindo o botao Testar Agora. Tudo o mais
# neste arquivo trabalha com fichas que ja' chegaram prontas.
#
# O QUE ACONTECE COM O IMPORT NO TOPO: desde a virada, o `rodada.py` importa este arquivo,
# e o `rodada.py` roda nas vinte maquinas do GitHub, a partir do acervo PLANO. O `cofre.py`
# nao sobe para la', de proposito, porque ele e' o leitor das senhas e nao tem o que fazer
# na nuvem. Com o import em cima, as vinte vagas quebrariam com `ModuleNotFoundError` na
# primeira rodada depois da publicacao. A prova do acervo plano pegou isso antes de subir.
#
# E' O MESMO PADRAO DO `import casa` LOGO ABAIXO, na mesma funcao, pela mesma razao.

# ============================================================ o teto que ELE mandou tirar
#
# ATE' 06/09/2026 ISTO ERA `TETO_DIARIO_POR_CONTA = 6`, e o comentario ao lado dizia, com
# todas as letras, que o numero subiria "quando a auditoria da gentileza medir que da', e
# nao por intuicao". A auditoria nunca rodou, e o seis ficou. Ele leu isso na tela e
# mandou tirar:
#
#     "remove esse teto de seguranca, nao faz sentido, vou colocar o maximo de contas que
#      eu puder porra, mas coloca um sistema que identifica quando uma conta esta' dando
#      muito bug ou ate' mesmo desconectado muito, que ai' vamos descobrir o teto real"
#
# ELE ESTA' CERTO NA RAIZ: um numero chutado nao protege conta nenhuma, so' limita o
# trabalho e finge que protegeu. O que protege e' olhar o que a conta responde.
#
# O QUE ENTROU NO LUGAR, e por que nao e' "nada": a conta nao para por contagem, para por
# COMPORTAMENTO. Cada tropeco vira registro datado na ficha; tropeco demais numa janela
# curta poe a conta DE MOLHO sozinha, com o motivo escrito; e a ficha guarda a MELHOR
# MARCA de cada conta, que e' quantas leituras ela aguentou num dia sem tropecar. Essa
# marca e' o teto real que ele quer descobrir, e ela e' medida, nao chutada.
TROPECOS_PARA_O_MOLHO = 3        # tropecos dentro da janela abaixo poem a conta de molho
JANELA_DO_TROPECO = 60 * 60      # uma hora: tropeco mais velho que isso nao conta mais
MOLHO = 2 * 60 * 60              # duas horas de descanso, e depois ela volta sozinha
TROPECOS_GUARDADOS = 40          # o historico tem teto, senao a ficha cresce para sempre

# UMA CONTA DE CADA VEZ. Duas lendo ao MESMO TEMPO e' o desenho que o Instagram reconhece:
# duas sessoes diferentes, do mesmo endereco, no mesmo segundo. A passagem usa uma conta por
# perfil, em SEQUENCIA, e e' isso que protege: o numero abaixo nao afrouxa nada disso.
#
# ELE ERA DOIS E VIROU QUATRO EM 07/09/2026, com a virada de prioridade. Enquanto a leitura
# logada era o resgate, ela so' pegava o que a nuvem tinha desistido de ler, e dois bastava.
# Virando o caminho principal, dois viraria o gargalo. O que nao cabe na passagem continua
# na proxima, dez minutos depois: aqui nada fica para amanha.
POR_PASSAGEM = 4

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


# ==================================================================== a saude da conta
#
# ELA MORA NA FICHA, NO COFRE, e nao na memoria: o computador dele reinicia, e um vigia
# que esquece o que viu antes de reiniciar e' um vigia que nunca acumula prova nenhuma.
# E' a mesma razao do contador de leituras.


def tropecos(ficha: dict, agora: float | None = None) -> list:
    """Os tropecos desta conta dentro da janela que ainda conta."""
    agora = time.time() if agora is None else agora
    todos = (ficha.get("saude") or {}).get("tropecos") or []
    return [t for t in todos
            if isinstance(t, dict) and agora - float(t.get("quando") or 0)
            <= JANELA_DO_TROPECO]


def anotar_tropeco(ficha: dict, motivo: str, agora: float | None = None) -> bool:
    """Registra um tropeco e devolve se ele foi o que mandou a conta de molho.

    O MOTIVO E' TEXTO PARA A TELA, e nao codigo: e' ele que responde "por que essa conta
    esta' descansando", que e' a pergunta que ele vai fazer olhando a tabela.
    """
    agora = time.time() if agora is None else agora
    s = ficha.setdefault("saude", {})
    lista = [t for t in (s.get("tropecos") or []) if isinstance(t, dict)]
    lista.append({"quando": int(agora), "motivo": str(motivo or "")[:120],
                  # QUANTAS LEITURAS ELA JA' TINHA FEITO QUANDO TROPECOU. E' o dado que
                  # transforma o historico em resposta: "essa conta tropeca sempre depois
                  # da decima quinta" e' uma frase que so' existe com este numero.
                  "leituras_no_dia": contar_hoje(ficha)})
    s["tropecos"] = lista[-TROPECOS_GUARDADOS:]
    if len(tropecos(ficha, agora)) >= TROPECOS_PARA_O_MOLHO:
        s["de_molho_ate"] = int(agora + MOLHO)
        s["motivo_do_molho"] = str(motivo or "")[:120]
        return True
    return False


def de_molho(ficha: dict, agora: float | None = None) -> bool:
    """Esta conta esta' descansando agora?

    LE' OS DOIS DESENHOS DE FICHA, e isso nao e' frouxidao: a ficha do COFRE guarda a
    saude aninhada (`saude.de_molho_ate`), e a ficha que viaja pela rede sai do
    `cofre.sem_segredo`, que ACHATA a saude em tres numeros no topo e apaga o `saude`.
    Sao o mesmo dado com duas caras, e a de cima e' a que a esteira do GitHub enxerga.
    Ler so' a aninhada faria toda conta de molho parecer disponivel do lado de la'.
    """
    agora = time.time() if agora is None else agora
    aninhado = (ficha.get("saude") or {}).get("de_molho_ate")
    return float(aninhado or ficha.get("de_molho_ate") or 0) > agora


def com_sessao(ficha: dict) -> bool:
    """Esta conta tem sessao guardada? Tambem le' os dois desenhos, pelo mesmo motivo.

    No cofre o campo e' `sessao` e carrega o cookie; no resumo que viaja ele virou
    `tem_sessao`, sim ou nao, porque o valor NUNCA sai do disco dele (trava 60).
    """
    return bool(ficha.get("sessao") or ficha.get("tem_sessao"))


def marcar_melhor_dia(ficha: dict) -> None:
    """Guarda a maior marca limpa desta conta: leituras num dia SEM tropeco.

    ESTE E' O NUMERO QUE ELE PEDIU. Ele so' sobe quando o dia fecha sem tropeco nenhum,
    entao ele nunca conta um dia em que a conta apanhou: e' a melhor marca CONFIAVEL, e
    nao o recorde de teimosia.
    """
    s = ficha.setdefault("saude", {})
    if tropecos(ficha):
        return
    hoje = contar_hoje(ficha)
    if hoje > int(s.get("melhor_dia") or 0):
        s["melhor_dia"] = hoje


def vivas(contas: list, agora: float | None = None) -> list:
    """As contas que podem trabalhar agora: vivas, com sessao, e fora do molho.

    A COTA DO DIA SAIU DAQUI EM 06/09/2026, por ordem dele. O que sobrou no lugar nao e'
    "nada": e' o molho, que para a conta por COMPORTAMENTO e nao por contagem.
    """
    return [c for c in contas
            if c.get("estado") == "viva"
            and com_sessao(c)
            and not de_molho(c, agora)]


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
    import cofre
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


# AS RESPOSTAS QUE SAO TROPECO, e nao queda. Tropeco e' a conta indo mal sem morrer, e ele
# existe porque ate' 06/09/2026 o sistema so' enxergava DOIS estados: deu certo, ou a conta
# caiu. Entre os dois ha' uma faixa larga que ninguem olhava, e e' nela que a conta avisa
# que esta' sendo apertada, antes de ser derrubada.
#
# 401 E BLOQUEIO NAO ENTRAM AQUI de proposito: aqueles ja' tiram a conta de circulacao
# sozinhos, e conta-los duas vezes so' embaralharia a contagem do molho.
def e_tropeco(resposta: dict) -> str:
    """Devolve o motivo do tropeco, em portugues, ou "" quando a leitura foi limpa."""
    r = resposta if isinstance(resposta, dict) else {}
    codigo = r.get("codigo")
    if codigo == 429:
        return "o Instagram pediu para ir mais devagar"
    if isinstance(codigo, int) and codigo >= 500:
        return f"o Instagram respondeu com erro {codigo}"
    if r.get("ok") is False and codigo not in (401,) and not e_bloqueio(codigo,
                                                                       r.get("corpo")):
        return "a leitura não veio inteira"
    # A REGRA DO VAZIO, que ja' e' lei nesta casa desde 25/08/2026: resposta 200 com nada
    # dentro e' recusa disfarcada ate' prova em contrario. Aqui ela nao encerra o perfil,
    # so' conta como tropeco DA CONTA, que e' o que ela de fato indica quando a leitura e'
    # logada: uma conta boa nao recebe pagina vazia de um perfil que tem publicacao.
    if codigo == 200 and r.get("vazio") is True:
        return "veio uma página vazia, que costuma ser recusa disfarçada"
    return ""


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
        # QUEM FOI DORMIR NESTA PASSAGEM. Separado das caidas de proposito: conta de molho
        # volta sozinha em duas horas, conta caida espera ele fazer alguma coisa. Misturar
        # as duas na tela faria ele ir renovar senha de conta que so' estava cansada.
        self.demolho: list[str] = []
        self.parou_por = ""
        # O FREIO DE QUEM LE'. Nasce solto e so' quem le' o levanta, devolvendo
        # `{"parar": "<motivo>"}`: a passagem termina o perfil corrente e nao pega outro.
        self.pedido_de_parada = ""

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
            if self.pedido_de_parada:
                # QUEM LE' TAMBEM PODE PARAR A PASSAGEM (07/09/2026). O leitor da casa
                # grava no acervo a cada perfil, e acervo que recusa escrita e' motivo de
                # parar: sem ele, cada passagem refaz as mesmas paginas logadas sem nada
                # ser contado, que e' o martelar medido na auditoria de 25/08/2026.
                #
                # E O MOTIVO VEM DE QUEM VIU, e nao daqui: esta classe nao sabe o que e'
                # um acervo. Ela so' respeita o pedido e guarda a frase para a sub-aba.
                break
            conta = escolher(self.contas)
            if conta is None:
                # O MOTIVO DIZ QUAL DOS DOIS CASOS E', porque eles pedem coisas
                # diferentes dele: sem conta nenhuma ele cadastra; com todas de molho ele
                # so' espera. Ate' 06/09/2026 os dois saiam como "sem cota do dia", que
                # era a frase de um teto que nem existe mais.
                descansando = [c for c in self.contas
                               if c.get("estado") == "viva" and de_molho(c)]
                self.parou_por = (
                    f"as {len(descansando)} contas vivas estão de molho, descansando "
                    "depois de tropeçar" if descansando
                    else "nenhuma conta viva com sessão")
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
            else:
                # O VIGIA MORA AQUI, no lugar do teto que saiu. Leitura limpa levanta a
                # melhor marca da conta; leitura torta vira tropeco, e o terceiro numa
                # hora manda a conta descansar sozinha.
                motivo = e_tropeco(r)
                if motivo:
                    if anotar_tropeco(conta, motivo):
                        self.demolho.append(conta["usuario"])
                else:
                    marcar_melhor_dia(conta)
            if r.get("parar"):
                self.pedido_de_parada = str(r["parar"])
                if not self.parou_por:
                    self.parou_por = self.pedido_de_parada
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
    return not any(c.get("estado") == "viva" and com_sessao(c) for c in contas)


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
