/* O comportamento da tela do Estúdio.
   Nada de acesso mora aqui: as ordens vão para a ponte, e é ela que guarda a chave. */

const DONO = "Elmoamacoca", REPO = "estudio-video";
const CRU = `https://raw.githubusercontent.com/${DONO}/${REPO}/main`;
const PONTE = "https://estudio-ponte.gabrieltorres.workers.dev";
const $ = id => document.getElementById(id);
let PRONTA = false;                // o arquivo terminou de ser lido?
const num = n => (n || 0).toLocaleString("pt-BR");

/* ---------------------------------------------------------------- troca de aba
   Página única, então a aba troca a seção em vez de pedir outro arquivo. A pílula
   do cabeçalho continua a mesma, só passa a seguir a aba escolhida. */
function irPara(chave, empurrar) {
  document.querySelectorAll(".aba").forEach(s => {
    s.hidden = s.id !== "aba-" + chave;
  });
  document.querySelectorAll("[data-aba]").forEach(a => {
    a.classList.toggle("ativo", a.dataset.aba === chave && a.classList.contains("ativo") || false);
  });
  document.querySelectorAll(".nav-itens a, .nav-menu a").forEach(a => {
    a.classList.toggle("ativo", a.dataset.aba === chave);
  });
  if (empurrar !== false) history.replaceState(null, "", "#" + chave);
  // O TIRA-DÚVIDAS É SÓ DA ABA DE BAIXAR, e quem o esconde nas outras é esta linha.
  // Ele mora fora das seções de aba de propósito: `.aba` tem animação de entrada com
  // `transform`, e elemento assim vira âncora para quem é `position:fixed`. Posta lá
  // dentro, a gaveta parava na altura da seção em vez de ir de topo a rodapé da tela.
  const bolha = document.getElementById("faq_abre");
  if (bolha) bolha.hidden = chave !== "baixar";
  // SAIR DA ABA SAI DO MODO FOCADO. A classe vive no `body`, entao ela sobreviveria a
  // troca de aba e deixaria o sistema inteiro sem cabecalho, sem nada explicando.
  if (chave !== "editar") document.body.classList.remove("ed-focado");
  // A ABA DE CONFIGURACOES SE PINTA AO SER ABERTA, e nao no carregamento da pagina: ela
  // depende da pasta do Estudio, que so' e' liberada na aba de Edicao.
  if (chave === "config" && PRONTA) { retomarPastaEler(); }
  // A FAIXA DE "ABERTO PELA INTERNET" DEPENDE DA ABA, e trocar de aba aqui usa
  // `replaceState`, que NAO dispara `hashchange`. Sem esta linha a faixa ficaria
  // congelada na decisao da primeira aba aberta. O `PRONTA` segura a chamada ate' o
  // arquivo terminar de ser lido: `EM_CASA` so' nasce la' embaixo.
  if (PRONTA) cuidarDaFaixaDeFora();
  const folha = document.getElementById("faq_folha");
  if (folha && !folha.hidden) {
    folha.hidden = true;
    document.getElementById("faq_fundo").hidden = true;
    bolha.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  // A ABA QUE ACABOU DE APARECER PRECISA SER OLHADA. Enquanto estava
  // escondida, nenhuma secao dela cruzava a tela, entao o observador nao
  // tinha o que ver. Aqui ele rearma, e a trava da primeira tela garante
  // que o que ja esta' visivel apareca sem esperar animacao.
  if (typeof revelar === "function") revelar();
  window.scrollTo({ top: 0, behavior: "instant" });
}
document.addEventListener("click", ev => {
  const a = ev.target.closest("[data-aba]");
  if (!a) return;
  ev.preventDefault();
  irPara(a.dataset.aba);
  document.getElementById("menu")?.classList.remove("aberto");
});
irPara((location.hash || "#minerar").slice(1), false);

/* ---------------------------------------------------------------- conversa */
/* A LEITURA CORRE OS DOIS CAMINHOS AO MESMO TEMPO, e a ponte tem preferência por dois
   segundos e meio.

   POR QUE ISSO MUDOU. A ponte era o caminho único, porque o endereço cru do GitHub tem
   cache de borda e já fez a tela mostrar a rodada anterior. Só que a ponte é lenta com
   arquivo grande: medido em 19/08/2026, `selecao.json`, que tem 638 KB, leva 15,8
   segundos por ela e 1,0 segundo pelo cru. Como a tela lê os seis arquivos juntos e
   espera todos, cada volta custava dezesseis segundos, e a primeira pintura da página
   demorava vinte e seis. Era isso que fazia tudo parecer travado.

   Agora os dois pedidos saem juntos. Se a ponte responder rápido, vale ela, e a leitura
   continua sendo a do commit do momento. Se ela demorar, vale quem chegar primeiro. */
const PACIENCIA = 2500;

/* A LEITURA PERGUNTA "MUDOU?" EM VEZ DE BAIXAR TUDO DE NOVO.

   MEDIDO EM 19/08/2026, com a tela lenta a ponto de o Gabriel achar que tinha travado:
   a cada vinte e cinco segundos ela rebaixava os sete arquivos do acervo, e um deles,
   `selecao.json`, tem 824 KB. Vezes duas vias, dá 1,7 MB por volta, uns 4 MB por minuto
   de aba aberta, para trazer quase sempre exatamente o mesmo conteúdo.

   A CULPA ERA DE DUAS LINHAS QUE DESLIGAVAM O CACHE DO NAVEGADOR: `cache: "no-store"` e
   um `?t=` com a hora no fim de cada endereço. As duas juntas garantem que nada nunca é
   reaproveitado. Elas existiam por um motivo real, que era não ver arquivo velho, mas
   resolviam isso do jeito mais caro possível.

   `cache: "no-cache"` faz o certo: o navegador PERGUNTA ao servidor toda vez, mas usa o
   que já tem quando a resposta é "não mudou". Nunca se vê dado velho, e não se baixa o
   mesmo byte duas vezes.

   E POR QUE NÃO FAZER A PERGUNTA NA MÃO. Foi o que tentei primeiro, mandando eu mesmo o
   cabeçalho de etiqueta. Não dá, e medi os dois motivos: o GitHub responde 403 à pergunta
   de permissão que o navegador faz antes de deixar um cabeçalho desses atravessar
   domínios, e ele também não libera a leitura da etiqueta pelo programa. Feito na mão,
   quebra tudo; deixado com o navegador, funciona.

   A PONTE ADOECE, E QUANDO ADOECE ELA SEGURA em vez de recusar. Foi o outro lado do
   problema de hoje: medi a mesma leitura levando 57 s e terminando em erro, depois 7 s,
   depois 0,4 s. Segurar é pior que recusar, porque o navegador só abre seis ligações por
   endereço: com pedidos pendurados por um minuto, os seguintes ficam na fila sem nem
   sair, e a tela inteira parece travada.

   Duas defesas, e as duas nasceram dessa medição:

     1. o pedido à ponte é CORTADO quando a paciência acaba, em vez de ficar pendurado.
        Sem isto, cada volta deixa mais uma ligação presa, e em poucos minutos não sobra
        nenhuma vaga para o caminho que funciona.
     2. depois de três tropeços seguidos, a tela PARA DE CHAMAR a ponte para leitura por
        três minutos e vai direto na fonte. A ponte continua servindo para mandar pedido,
        que é o trabalho que só ela faz. */
let PONTE_TROPECOS = 0;
let PONTE_DE_CAMA_ATE = 0;
const TROPECOS_ATE_DEITAR = 3;
const DESCANSO_DA_PONTE = 3 * 60 * 1000;

const ponteDeCama = () => Date.now() < PONTE_DE_CAMA_ATE;
function ponteTropecou() {
  if (++PONTE_TROPECOS >= TROPECOS_ATE_DEITAR)
    PONTE_DE_CAMA_ATE = Date.now() + DESCANSO_DA_PONTE;
}
function ponteFirme() { PONTE_TROPECOS = 0; PONTE_DE_CAMA_ATE = 0; }

/** A fonte, sempre revalidada e sem `?t=`: sem endereço único não há o que reaproveitar.
 *
 * COM CORTE DE TEMPO, e a razão é o log que ficava girando para sempre. O `fetch` sem
 * prazo tem um `.catch` para o erro, mas erro não é o caso perigoso: é a conexão que abre
 * e nunca responde. Aí a promessa não resolve nem rejeita, e o `await daFonte` lá embaixo
 * espera a vida inteira, deixando o cartão preso em "buscando o histórico" sem uma palavra.
 * A ponte já tinha corte pelo `freio`; a fonte não tinha, e era o buraco. Passado o prazo,
 * o pedido é abortado e vira "fonte muda", que o resto do código já sabe tratar. */
const PACIENCIA_FONTE = 12000;
const pegarDaFonte = caminho => {
  const corte = new AbortController();
  const t = setTimeout(() => corte.abort(), PACIENCIA_FONTE);
  return fetch(`${CRU}/${caminho}`, { cache: "no-cache", signal: corte.signal })
    .then(r => r.ok ? r.json().then(d => ({ tem: true, d, via: "fonte" }))
                    : { tem: false, sumiu: r.status === 404, via: "fonte" })
    .catch(() => ({ tem: false, via: "fonte" }))
    .finally(() => clearTimeout(t));
};

const pegarDaPonte = (dentro, sinal) =>
  fetch(`${PONTE}/dados/${dentro}?t=${Date.now()}`, { cache: "no-store", signal: sinal })
    .then(r => r.ok ? r.json().then(d => ({ tem: true, d, via: "ponte" }))
                    : { tem: false, sumiu: r.status === 404, via: "ponte" })
    .catch(() => ({ tem: false, via: "ponte" }));

/* FALHA NÃO GANHA CORRIDA. Sem isto, uma via que quebra em vinte milissegundos venceria
   a outra que ia responder certo em duzentos, e a leitura devolveria nada tendo o dado
   disponível. A promessa que nunca se resolve tira a perdedora da disputa sem cancelá-la:
   ela continua valendo lá embaixo, para o caso de a outra também falhar. */
const sóQuemResponde = p => p.then(x => (x.tem || x.sumiu) ? x : new Promise(() => {}));

/* ARQUIVOS QUE NUNCA SOMEM NÃO PRECISAM DA PONTE.

   A ponte serve para uma coisa na leitura: dizer com autoridade que um arquivo foi
   APAGADO, porque a fonte tem cache de borda e chegou a servir por minutos levas que
   tinham acabado de ser limpas. Arquivo que nunca é apagado não tem essa dúvida.

   E há um motivo medido para tirar o `selecao.json` dela em especial: 824 KB é grande
   demais para a ponte. Medido hoje, um por um: `estado.json` 0,48 s, `retratos.json`
   0,53 s, `fontes.json` 0,84 s, `catalogo.json` 0,42 s, os dois índices 0,42 s. E o
   `selecao.json`, TRINTA SEGUNDOS, quando não termina em erro 500 com "Network
   connection lost". Um pedido desses fica pendurado ocupando uma das seis ligações que o
   navegador dá por endereço, e é o que fazia a tela inteira parecer travada. */
const SEM_PONTE = new Set(["dados/selecao.json", "dados/estado.json",
                           "dados/retratos.json", "dados/fontes.json"]);

/* DEPOIS DE ESCREVER, O ENDEREÇO CRU MENTE POR CINCO MINUTOS, E ESSE ERA O ATRASO.

   MEDIDO EM 25/08/2026, direto no cabeçalho do `raw.githubusercontent.com`:
   `Cache-Control: max-age=300`, e `X-Cache: HIT` mesmo quando o pedido vai com
   `Cache-Control: no-cache`. A borda da Fastly serve a cópia dela e não pergunta nada
   ao GitHub. Ou seja: gravar e reler pelo endereço cru devolve o passado por até cinco
   minutos, e nenhuma quantidade de voltas de vinte e cinco segundos conserta isso,
   porque toda volta bate na mesma cópia guardada.

   O QUE O GABRIEL VIU: ele adicionou um perfil, a ponte gravou o cartão no mesmo
   segundo (conferido no acervo), e a tela ficou minutos sem mostrar cartão nenhum.
   A ponte lê pela via de programação do GitHub, que não tem essa borda e sempre traz o
   agora. Então, na janela em que o passado ainda está sendo servido, estes três
   arquivos pequenos vêm SÓ pela ponte, com autoridade, e não por corrida.

   SÃO SÓ OS TRÊS QUE DESENHAM O CARTÃO, e todos foram medidos rápidos na ponte:
   `fontes.json` 0,84 s, a capa do livro 0,42 s e os retratos 0,53 s. O `selecao.json`,
   que leva trinta segundos por lá, continua fora e continua na corrida. */
const SO_PELA_PONTE = new Set(["dados/fontes.json", "dados/atividade/indice.json",
                               "dados/retratos.json"]);
const VALIDADE_DO_CRU = 300 * 1000;
let ESCRITA_ATE = 0;
const escritaRecente = () => Date.now() < ESCRITA_ATE;
const acabeiDeEscrever = () => { ESCRITA_ATE = Date.now() + VALIDADE_DO_CRU + 30000; };

async function ler(caminho) {
  // O CAMINHO DE DENTRO SOBREVIVE. Antes ficava só o nome do arquivo, e pedir
  // `dados/atividade/vinci.society.json` virava `dados/vinci.society.json`, que não
  // existe. O livro de atividade mora em pasta própria e precisa da pasta.
  const dentro = caminho.replace(/^dados\//, "");

  // A JANELA DA VERDADE. Fora dela nada muda: a corrida continua valendo, porque a
  // borda só atrapalha quando alguém acabou de gravar. Se a ponte não responder aqui,
  // o pedido cai no caminho de sempre em vez de a tela ficar sem dado.
  //
  // COM CORTE DE TEMPO, PORQUE AQUI NÃO HÁ CORRIDA PARA SALVAR. Na corrida lá embaixo
  // a ponte pendurada é só uma perdedora; aqui a tela espera SÓ ela, e um `fetch` que
  // abre e nunca responde não resolve nem rejeita. Sem o corte, esta leitura seguraria
  // o `Promise.all` da volta inteira e a tela congelava, que é pior do que o atraso que
  // este trecho veio consertar.
  // O BILHETE DE ANDAMENTO ENTRA NA MESMA REGRA ENQUANTO HÁ QUEM O ESCREVA.
  //
  // Ele é reescrito por cada vaga da esteira, de meio em meio minuto, e é ELE que
  // sustenta a frase "varrendo agora". Lido pelo endereço cru, chega com até cinco
  // minutos de atraso, e cinco minutos é justamente a validade do bilhete: a tela
  // declarava "Sem Sinal Da Esteira Há 5 Min" com dezenove vagas gravando naquele
  // instante, conferido nos commits do acervo em 25/08/2026. Com a esteira parada o
  // bilhete não muda, e aí a cópia guardada está certa: só se paga a ponte quando há
  // rodada no ar, e são duzentos bytes por perfil ativo.
  const bilheteDeQuemTrabalha = caminho.startsWith("dados/andamento/") && ESTEIRA_NO_AR;

  if (((SO_PELA_PONTE.has(caminho) && escritaRecente()) || bilheteDeQuemTrabalha)
      && !ponteDeCama()) {
    const corte = new AbortController();
    const t = setTimeout(() => corte.abort(), PACIENCIA);
    const p = await pegarDaPonte(dentro, corte.signal).finally(() => clearTimeout(t));
    if (p.tem) { ponteFirme(); return p.d; }
    if (p.sumiu) { ponteFirme(); return null; }
    ponteTropecou();
  }

  const daFonte = pegarDaFonte(caminho);

  // COM A PONTE DE CAMA, NEM SE BATE NA PORTA DELA. Abrir o pedido só para ele ficar
  // pendurado é o que entope as vagas de ligação do navegador.
  if (SEM_PONTE.has(caminho) || ponteDeCama()) {
    const f = await daFonte;
    return f.tem ? f.d : null;
  }

  /* A CORRIDA É ENTRE AS DUAS VIAS DE VERDADE, e não entre uma via e um cronômetro.

     Antes a tela esperava a ponte por dois segundos e meio antes de sequer olhar para a
     resposta da fonte, mesmo quando a fonte já tinha respondido em sessenta
     milissegundos. Medido hoje, com a ponte acordando: 3.970 ms na primeira chamada e
     uns 400 ms depois, contra 58 ms da fonte. Ou seja, a tela ficava parada esperando a
     via lenta com o dado na mão.

     Agora vence quem responder primeiro. A ponte continua na disputa porque ela é a
     única que sabe dizer com certeza que um arquivo foi APAGADO: a fonte tem cache de
     borda e chegou a servir por minutos levas que tinham acabado de ser limpas. Quando
     ela ganha, a autoridade dela vale; quando perde, o dado da fonte serve, e a volta
     seguinte, vinte e cinco segundos depois, corrige se for o caso. */
  const freio = new AbortController();
  const daPonte = pegarDaPonte(dentro, freio.signal);
  const tarde = new Promise(r => setTimeout(() => r({ tarde: true }), PACIENCIA));

  const primeiro = await Promise.race([sóQuemResponde(daPonte),
                                       sóQuemResponde(daFonte), tarde]);
  if (primeiro.tem || primeiro.sumiu) {
    if (primeiro.via === "ponte") ponteFirme();
    else freio.abort();          // a fonte resolveu: solta a vaga de ligação da ponte
    return primeiro.tem ? primeiro.d : null;
  }

  // NINGUÉM RESPONDEU NO PRAZO. Aí sim a ponte levou tropeço, e a espera continua pelas
  // duas, na ordem de quem costuma acertar.
  freio.abort();
  ponteTropecou();
  const f = await daFonte;
  if (f.tem) return f.d;
  const b = await daPonte;
  return b.tem ? b.d : null;
}

async function mandar(rota, corpo) {
  /* A SENHA DA CASA VAI EM TODA ORDEM, desde 25/08/2026 (bloco da ponte). As rotas
     de ordem da ponte passaram a exigir X-Estudio-Ponte, e a tela nao pode carregar
     a senha no fonte, que e' publico: ela chega pelo /vivo do posto, so' com sessao
     aberta, e mora em memoria. O `postoDePe()` garante o CASA_INFO fresco (ele tem
     validade de 15 s); sem posto ou sem sessao a ordem sai sem senha e a propria
     ponte responde com o recado de entrar. */
  await postoDePe();
  const cab = { "Content-Type": "application/json" };
  if (CASA_INFO && CASA_INFO.ponte) cab["X-Estudio-Ponte"] = CASA_INFO.ponte;
  else if (POSTO_DE_PE && CASA_INFO && CASA_INFO.sessao === "vencida") {
    /* QUEM SABE O MOTIVO DIZ O MOTIVO. Sem estes dois desvios, a ponte responderia
       "abra a tela pelo endereço do Estúdio" para quem JÁ está nela, que é conselho
       inútil. Aqui a tela conhece o estado do posto e fala do que dá para fazer. */
    throw new Error("A sessão desta página venceu, e é ela que autoriza esta ordem. "
      + "Recarregue a página e entre com a senha; nada foi perdido.");
  } else if (!POSTO_DE_PE) {
    throw new Error("O posto do Estúdio não atende, e é ele que guarda a senha desta "
      + "ordem. Ele volta sozinho em até cinco minutos; recarregue a página e tente "
      + "de novo.");
  }
  const r = await fetch(PONTE + rota, {
    method: "POST", headers: cab,
    body: JSON.stringify(corpo || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.erro) throw new Error(d.erro || "a esteira não respondeu, tente de novo");
  // TODA ORDEM QUE PASSA POR AQUI ESCREVE NO ACERVO, e a partir deste instante o
  // endereço cru passa a servir o passado. A janela abre aqui, uma vez só, para
  // qualquer ordem: não vale confiar na memória de quem escreveu o próximo botão.
  acabeiDeEscrever();
  return d;
}

/* O /contas TRABALHA EM PARCELAS, desde 25/08/2026: a Cloudflare corta a ponte em 50
   subpedidos por chamada, entao ela olha poucos nomes por vez e devolve o resto em
   `ficaram`. Aqui se manda de novo ate' esvaziar, somando as respostas numa so', e a
   regua (quando ha') vai apenas na primeira, porque gravar duas vezes seria a mesma
   verdade escrita em dobro. O teto de voltas e' rede de seguranca contra uma ponte
   que devolvesse sempre a mesma fila. */
async function mandarContas(contas, regua) {
  let fila = contas, soma = null;
  for (let volta = 0; volta < 40 && fila.length; volta++) {
    const d = await mandar("/contas",
      volta === 0 && regua ? { contas: fila, regua } : { contas: fila });
    if (!soma) soma = d;
    else {
      soma.novos = (soma.novos || []).concat(d.novos || []);
      soma.bloqueados = (soma.bloqueados || []).concat(d.bloqueados || []);
      if (d.avisos) soma.avisos = (soma.avisos || []).concat(d.avisos);
      if (d.contas != null) soma.contas = d.contas;
    }
    fila = d.ficaram || [];
  }
  return soma || { novos: [], bloqueados: [] };
}

/* ---------------------------------------------------------- sinal de carregamento

   O componente que o Gabriel escolheu, traduzido para esta tela. Os atrasos de cada
   célula são calculados pelas MESMAS contas do arquivo dele, e não copiados já
   resolvidos: assim, mexer numa constante continua mudando o desenho.

     galo    o atraso cresce com a coluna e com a distância da linha do meio, então a
             onda entra pela esquerda e sai pela direita em forma de seta
     órbita  a borda é percorrida em volta, célula por célula, e o miolo fica apagado

   O relógio anda de décimo em décimo de segundo e vira minutos depois de sessenta,
   igual ao de lá. Ele existe para o carregamento longo não parecer travado. */
const GALO = Array.from({ length: 9 }, (_, i) =>
  ((i % 3) + Math.abs(Math.floor(i / 3) - 1)) * 90);
const VOLTA = [0, 1, 2, 5, 8, 7, 6, 3];
const ORBITA = Array.from({ length: 9 }, (_, i) => {
  const k = VOLTA.indexOf(i);
  return k === -1 ? null : k * 110;
});
const FEITIOS = {
  onda:   { atrasos: GALO,   classe: "" },
  bolas:  { atrasos: GALO,   classe: "redondo" },
  orbita: { atrasos: ORBITA, classe: "orbita" },
};

function tempoCorrido(decimos) {
  const t = decimos / 10;
  return t < 60 ? t.toFixed(1).replace(".", ",") + "s"
                : `${Math.floor(t / 60)}m ${(t % 60).toFixed(1).replace(".", ",")}s`;
}

const RELOGIOS = new Map();

/** Põe o sinal de carregamento dentro de um elemento e começa a contar.
 *
 * `desde` é opcional e recebe um instante já passado. Serve para o que começou antes
 * da tela abrir: uma rodada da esteira que já está no ar há dois minutos deve mostrar
 * dois minutos, e não zero. */
function carregando(id, rotulo, feitio, desde) {
  const alvo = $(id);
  if (!alvo) return;
  parado(id);
  const f = FEITIOS[feitio] || FEITIOS.onda;
  const celulas = f.atrasos.map(a => a === null
    ? '<i class="apagado"></i>'
    : `<i style="--atraso:${a}ms"></i>`).join("");
  const zero = desde ? new Date(desde).getTime() : Date.now();
  const conta = () => Math.max(0, Math.round((Date.now() - zero) / 100));
  alvo.innerHTML = `<span class="pixota">`
    + `<span class="pix-grade ${f.classe}" aria-hidden="true">${celulas}</span>`
    + `<span class="pix-rotulo">${rotulo}</span>`
    + `<span class="pix-tempo">${tempoCorrido(conta())}</span></span>`;
  const marcador = alvo.querySelector(".pix-tempo");
  RELOGIOS.set(id, setInterval(() => {
    marcador.textContent = tempoCorrido(conta());
  }, 100));
}

/** Tira o sinal e deixa no lugar o texto do resultado. */
function parado(id, texto) {
  const r = RELOGIOS.get(id);
  if (r) { clearInterval(r); RELOGIOS.delete(id); }
  if (texto !== undefined && $(id)) $(id).textContent = texto;
}

/* ------------------------------------------------------------------ o selo do topo

   ELE DIZ "AO VIVO", e não "no ar", e a diferença não é de palavra.
   "No ar" respondia só se a ponte estava respondendo, o que é quase sempre verdade e
   por isso não informa nada: o selo ficava verde com a esteira parada havia dois dias.
   Este aqui é o mesmo selo do Social Tracker, com a mesma régua de lá: ele conta desde
   a última rodada que fechou, e muda de cor sozinho quando ela envelhece.

     até 3 horas   ao vivo, verde        (a esteira acorda de meia em meia hora)
     até 26 horas  desatualizado, âmbar  (perdeu rodadas, mas o dado ainda serve)
     acima disso   fora do ar, vermelho  (alguma coisa parou e precisa de olho)

   Ele também envelhece com a página aberta: o relógio reclassifica de 15 em 15
   segundos, então uma aba esquecida na tela não continua dizendo "ao vivo" para
   sempre. */
const HORAS_NO_RITMO = 3, HORAS_ATE_MORTO = 26;
let ultimaColeta = null;

/* A SAÚDE DA ESTEIRA, escrita pelo fiscal dela no acervo (`dados/saude.json`).
   Em 24/08/2026 o fiscal reprovou 26 rodadas seguidas e o selo continuou verde,
   porque a régua dele era só a idade da última rodada FECHADA: rodada que reprova
   também carimba hora, e o selo lia o carimbo sem ler o veredito. Agora o veredito
   manda: fiscal reprovando, o selo cai para o vermelho na hora, com o motivo.
   Arquivo ausente é nulo, e nulo não muda nada: estado não se inventa. */
let SAUDE = null;

/** O motivo do fiscal, curto o bastante para caber no selo do topo. */
function motivoCurto(m) {
  const s = String(m || "o fiscal reprovou a rodada").trim();
  return s.length > 60 ? s.slice(0, 57).trimEnd() + "…" : s;
}

function quanto(h) {
  if (h < 0.017) return "agora";
  if (h < 1) return Math.round(h * 60) + " min";
  if (h < 24) return (h < 10 ? h.toFixed(1).replace(".", ",") : Math.round(h)) + " h";
  return Math.round(h / 24) + " d";
}

function selar(estado) {
  if (estado && estado.ultima_rodada) ultimaColeta = estado.ultima_rodada;
  const selo = $("estado"), rotulo = selo.querySelector(".rotulo");
  // O VEREDITO DO FISCAL VENCE O RELÓGIO. Uma rodada reprovada fechou há minutos e
  // por isso é "fresca" para a régua de idade, mas fresca e podre ao mesmo tempo:
  // sem esta linha, o selo dizia "ao vivo" com a esteira quebrando a cada meia hora.
  if (SAUDE && SAUDE.fiscal === "reprovou") {
    selo.className = "status offline";
    rotulo.textContent = "Esteira Parada: " + motivoCurto(SAUDE.motivo);
    return;
  }
  if (estado === null && ultimaColeta === null) {
    selo.className = "status offline";
    rotulo.textContent = "sem resposta";
    return;
  }
  if (!ultimaColeta) {
    selo.className = "status offline";
    rotulo.textContent = "nunca coletou";
    return;
  }
  const h = (Date.now() / 1000 - ultimaColeta) / 3600;
  if (h > HORAS_ATE_MORTO) {
    selo.className = "status offline";
    rotulo.textContent = "fora do ar há " + quanto(h);
  } else if (h > HORAS_NO_RITMO) {
    selo.className = "status degraded";
    rotulo.textContent = "desatualizado há " + quanto(h);
  } else {
    selo.className = "status online";
    const quando = quanto(h);
    // "coletou há agora" é o que sai quando se junta a preposição com a palavra que já
    // é advérbio de tempo. Aqui ela cai fora.
    rotulo.textContent = "ao vivo · coletou "
      + (quando === "agora" ? "agora" : "há " + quando);
  }
}
setInterval(() => selar(null), 15000);

/* O AVISO DA ABA DE MINERAÇÃO quando o fiscal reprova. O selo do topo é pequeno e
   corta o motivo; aqui ele sai inteiro, com a rodada e a hora, no alto da aba onde o
   olho chega primeiro. Aviso que depende de a pessoa ir até ele não é aviso. */
function avisarSaude() {
  const aviso = $("saude_aviso");
  if (!aviso) return;
  const parada = SAUDE && SAUDE.fiscal === "reprovou";
  aviso.hidden = !parada;
  if (!parada) return;
  const pedacos = ["Esteira Parada: "
    + String(SAUDE.motivo || "o fiscal reprovou a rodada").trim()];
  if (SAUDE.rodada) pedacos.push(`rodada ${SAUDE.rodada}`);
  if (SAUDE.quando) pedacos.push(`reprovada em ${dataHora(SAUDE.quando)}`);
  // texto como TEXTO, e não como marcação: o motivo vem de arquivo do acervo, e
  // conteúdo de arquivo montado dentro de HTML é como se abre buraco numa tela.
  aviso.textContent = pedacos.join(" · ");
}

/* ---------------------------------------------------------------- registro ao vivo */
const NOMES = { queued: "na fila", in_progress: "trabalhando", success: "pronto",
                failure: "falhou", cancelled: "cancelado", skipped: "pulado",
                waiting: "esperando", pending: "na fila" };
let relogio = null;

/* AQUI MORAVA O FLUXO DE MENSAGENS DA SESSÃO, e ele saiu por decisão do Gabriel em
   17/08. Era uma lista corrida de "conferir concluída", "fechar concluída", que vivia
   na memória do navegador, sumia ao recarregar e não dizia nada sobre perfil nenhum.
   O que ficou no lugar dele é o histórico por conta, que mora no acervo.

   O retorno de cada comando continua aparecendo: ele é escrito ao lado do título da
   seção que o Gabriel acabou de usar, que é onde o olho já está. */

/* ------------------------------------------------------- sub-abas da Mineração
   Mesma mecânica das pastilhas da aba de Contas: trocam o painel de baixo e nada mais.
   Não mexem no endereço da página, porque a aba de cima já manda nele. */
document.getElementById("sub-menu").addEventListener("click", ev => {
  const b = ev.target.closest("[data-sub]");
  if (!b) return;
  document.querySelectorAll("#sub-menu .ct-item").forEach(i => {
    const meu = i === b;
    i.classList.toggle("ativo", meu);
    i.setAttribute("aria-selected", meu ? "true" : "false");
  });
  document.getElementById("sub-p-minerar").hidden = b.dataset.sub !== "minerar";
  document.getElementById("sub-p-minerados").hidden = b.dataset.sub !== "minerados";
  if (b.dataset.sub === "minerados") desenhaMinerados();
});

/* ------------------------------------------------------------ tabela de minerados
   SEM ANIMAÇÃO DE ENTRADA nas linhas, e isso está medido no sistema de origem: a
   animação da casa desloca, reduz e DESFOCA cada peça. Numa galeria compensa; numa
   tabela custou quadro de 61 ms ao rolar, fez a barra de rolagem piscar e deixou
   artefato preto na passagem do mouse. Tabela não é galeria. */
let MINERADOS = [], minPagina = 1;
/* AS FICHAS DE CARROSSEL DA RÉGUA, e só elas. O pedido do pacote leva a lista de lâminas
   dentro (a casa não lê o acervo do GitHub), então a tela precisa guardá-la entre a carga e
   o clique. Guardar `sel.itens` inteiro seria carregar quinhentos itens com a legenda de
   2.200 caracteres dentro; carrossel é um punhado. */
let CARROSSEIS_DA_REGUA = [];

/* AS DUAS LISTAS DO SISTEMA: os mercados e as etiquetas que existem.
   Elas nascem vazias e são preenchidas pelo acervo a cada volta. Enquanto não chegam, a
   folha de marcação abre dizendo que não há nada criado, que é a verdade daquele
   instante, e não um campo em branco pedindo para ser inventado. */
let CATALOGO = { nichos: [], etiquetas: [] };

const ESTADOS = {
  completo: ['<span class="pino ok">concluído</span>', "completo"],
  limite: ['<span class="pino ok">até o limite</span>', "limite"],
  varrendo: ['<span class="pino">varrendo</span>', "varrendo"],
  relendo: ['<span class="pino">relendo</span>', "relendo"],
};

function situacaoDe(p) {
  // a releitura vem primeiro: um perfil encerrado que foi pedido de novo está
  // trabalhando agora, e mostrar "até o limite" enquanto uma vaga lê ele é o que
  // fazia a conta não fechar para quem olhava a esteira.
  if (p.relendo) return "relendo";
  if (!p.completo) return "varrendo";
  // "ATÉ O LIMITE" É SOBRE O INSTAGRAM TER CORTADO A LEITURA, e não sobre ter lido
  // menos que o total de publicações do perfil. Numa busca de reels, ler 294 de 2.256
  // publicações é o esperado: as outras 1.962 são imagem e carrossel, e nunca seriam
  // lidas. Os dois perfis apareciam como "até o limite" tendo chegado ao último reel.
  const filtrado = rotuloDosFormatos(null, LIVRO.find(c => c.conta === p.conta))
                     !== "publicações";
  if (filtrado) return "completo";
  return (p.publicacoes && p.lidos < p.publicacoes) ? "limite" : "completo";
}

function quando(ts) {
  if (!ts) return '<span class="tab-nulo">nunca</span>';
  const d = new Date(ts * 1000), h = (Date.now() / 1000 - ts) / 3600;
  if (h < 1) return "há " + Math.max(1, Math.round(h * 60)) + " min";
  if (h < 24) return "há " + Math.round(h) + " h";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function retrato(p) {
  // O RETRATO É FUNDO DA CAIXA, E NÃO UMA IMAGEM DENTRO DELA.
  // Esta é a mecânica do Social Tracker, copiada como é lá: a caixa redonda recebe a
  // foto como fundo, com `cover` e centro, e a folha dele já traz essas duas regras em
  // `span.pcard-avatar[class*="av-"]`. Por isso a classe `av-foto` está aqui: é ela
  // que faz a regra copiada pegar.
  //
  // AQUI TINHA UMA IMAGEM SOLTA, e ela saía toda errada. A caixa tem 78 pixels e a foto
  // do Instagram vem com 320: sem regra de tamanho, o navegador desenha os 320 e a caixa
  // corta o excedente. O resultado é o miolo da foto ampliado quatro vezes, que foi o
  // que apareceu na tela: do @boletimdamorte só a arcada dentária, do @vinci.society um
  // pedaço do símbolo. Como fundo, `cover` encaixa a foto inteira na caixa.
  //
  // A INICIAL SÓ ENTRA QUANDO NÃO HÁ FOTO, e é assim lá também: a conta com foto tem a
  // caixa vazia, a conta sem foto tem a letra. Desenhar as duas juntas poria a letra
  // POR CIMA da foto, porque o fundo fica atrás do texto e não na frente dele.
  if (!p.foto) {
    const ini = (p.conta || "?")[0].toUpperCase();
    return `<span class="pcard-retrato"><span class="pcard-avatar">${ini}</span></span>`;
  }
  const endereco = `${PONTE}/retrato/${encodeURIComponent(p.conta)}`;
  return `<span class="pcard-retrato"><span class="pcard-avatar av-foto"
            style="background-image:url('${endereco}')"></span></span>`;
}

/* Os três controles são o componente do sistema, montado pela função copiada de lá.
   O `select` do navegador abre a lista do sistema operacional, que não pertence a
   esta tela: era o retângulo branco com faixa azul no meio da tabela escura. */
let minEstado = "", minOrdem = "varridos", minPor = 10;

window.montarSelect("min-estado", [
  { v: "", r: "Todos Os Estados" },
  { v: "completo", r: "Concluídos" },
  { v: "limite", r: "Varridos Até O Limite" },
  { v: "varrendo", r: "Ainda Varrendo" },
], "", v => { minEstado = v; minPagina = 1; desenhaMinerados(); });

window.montarSelect("min-ordem", [
  { v: "varridos", r: "Mais Varridos" },
  { v: "cobertura", r: "Maior Cobertura" },
  { v: "acima", r: "Mais Acima Da Régua" },
  { v: "reels", r: "Mais Reels" },
  { v: "conta", r: "Nome Do Perfil" },
], "varridos", v => { minOrdem = v; minPagina = 1; desenhaMinerados(); });

window.montarSelect("min-por", [
  { v: "10", r: "10" }, { v: "25", r: "25" }, { v: "50", r: "50" },
], "10", v => { minPor = parseInt(v, 10) || 10; minPagina = 1; desenhaMinerados(); });

/* ------------------------------ o estado da fileira de Baixar

   ELE MORA AQUI EM CIMA, e não junto do desenho, porque a montagem dos dois
   filtros logo abaixo já o usa. Declarado depois, o `const` fica na zona morta
   do JavaScript e a montagem estoura na abertura, matando o arquivo inteiro. */
const ESCOLHIDOS = new Set();
let bxNicho = "", bxEtiquetas = [];
// o que a última pintura mostrou, para a contagem ao marcar não precisar de uma leitura
let ULTIMOS_PRONTOS = [];

// As duas listas são MUTÁVEIS de propósito. Os componentes de lá guardam a referência
// que receberam e a releem toda vez que a lista abre; trocá-la por outra obrigaria a
// remontar o componente, e remontar significa pendurar os mesmos ouvintes de novo.
const NICHOS_BX = [{ v: "", r: "Todos Os Nichos" }];
const ETIQUETAS_BX = [];

// O recado do pedido não é atropelado pela contagem: a tela se redesenha de 25 em 25
// segundos, e "lote em preparo" sumia antes de dar tempo de ler.
let travaDoRecado = 0;

const CERTO_FILEIRA = '<span class="fperfil-certo"><svg viewBox="0 0 24 24">'
  + '<path d="M20 6 9 17l-5-5"/></svg></span>';

/* OS DOIS FILTROS DA ABA DE BAIXAR, montados uma vez só, na abertura.
   As listas de opção são as mesmas variáveis que a fileira reescreve a cada leitura do
   acervo: por isso são montados aqui, com a lista vazia, e não a cada volta. Remontar
   penduraria um ouvinte novo em cima do antigo, e cada clique valeria por dois. */
window.montarSelect("bx-nicho", NICHOS_BX, "", v => {
  bxNicho = v;
  desenhaProntos(MINERADOS);
});
window.montarMulti("bx-etq", ETIQUETAS_BX, "Todas as etiquetas", vs => {
  bxEtiquetas = vs;
  desenhaProntos(MINERADOS);
});

/* --------------------------------------------- AS TRÊS COLUNAS DE CONTROLE

   MERCADO E ETIQUETA SÃO COLUNAS, e não mais duas pastilhas espremidas embaixo do nome
   do perfil. Dali não se comparava dois perfis nem se ordenava por elas, que é para o
   que servem.

   E A MARCAÇÃO SE FAZ NA PRÓPRIA CÉLULA. Havia um botão "Marcar" na ponta da linha, que
   o Gabriel não pediu e mandou tirar em 19/08/2026. A função dele não morre junto:
   clicar no mercado ou na etiqueta abre a mesma folha, que é onde ela já devia estar.
   Sem isso os dois filtros da aba de Baixar ficariam sem ninguém para alimentá-los. */

/** O mercado do perfil. Célula clicável: vazia ela convida, cheia ela edita. */
function celulaMercado(p) {
  return `<span class="tab-toque" role="button" tabindex="0"
      data-etiquetar="${p.conta}" title="Definir o mercado de @${p.conta}">${
    p.mercado ? `<span class="mercado">${p.mercado}</span>`
              : '<span class="sem">definir</span>'}</span>`;
}

/** As etiquetas, na pastilha do sistema de origem, com a cor saindo do próprio nome. */
function celulaEtiqueta(p) {
  const etq = (p.etiquetas || []).map(e => window.etiquetaHTML(e)).join("");
  return `<span class="tab-toque tab-etqs" role="button" tabindex="0"
      data-etiquetar="${p.conta}" title="Etiquetar @${p.conta}">${
    etq || '<span class="sem">definir</span>'}</span>`;
}

/* ONDE CADA PERFIL ESTÁ NA ABA DE BAIXAR.
   As contas de baixáveis e restantes vêm do seletor, que já desconta o que desceu. A
   leva vem do registro, que é quem sabe se alguma está correndo agora e se o pacote já
   foi guardado no computador, que é o fim de verdade do caminho. */
let LEVAS_POR_CONTA = {};

function anotarLevas(indice) {
  const mapa = {};
  // A LEVA PEDIDA HÁ SEGUNDOS ENTRA PRIMEIRO, e ela ainda não existe no acervo: a
  // esteira leva perto de um minuto para gravar a primeira linha. Sem ela aqui, a tabela
  // diria "a baixar" para um perfil que já está descendo.
  const pedida = LEVA_PEDIDA
    ? [{ numero: null, estado: "pedida", contas: LEVA_PEDIDA.contas }] : [];
  for (const l of [...((indice && indice.lotes) || []), ...pedida]) {
    for (const c of (l.contas || [])) {
      const antes = mapa[c];
      // a que está correndo manda sobre todas; fora isso, manda a mais recente
      const andando = l.estado === "em curso" || l.estado === "pedida";
      if (!antes || andando || (l.numero || 0) > (antes.numero || 0))
        mapa[c] = { numero: l.numero, estado: l.estado, guardado: !!l.guardado,
                    // ENTREGUE É O FIM DA LINHA, e é o que ele pediu para ver aqui:
                    // "a gente voltaria lá pra tabela de minerados e atualizaria: olha,
                    // esse perfil aqui foi 100% concluído". Quem escreve esta marca no
                    // acervo é a etapa 4.2, e só depois de o arquivo ter chegado ao
                    // Drive. Sem esta linha a marca existia e a tabela não a via, que é
                    // trabalho feito no escuro.
                    entregue: !!l.entregue };
    }
  }
  LEVAS_POR_CONTA = mapa;
}

/* A PASTILHA E O NÚMERO ANDAM LADO A LADO, NUMA LINHA SÓ.
   Na primeira versão o número ficava embaixo, no molde de duas linhas que a coluna de
   cobertura usa. O Gabriel reprovou em 19/08 e estava certo: as outras células desta
   tabela são de uma linha e ficam no meio da altura, e uma célula de duas linhas
   encostada no topo desalinha a fileira inteira. O olho corre a linha e tropeça nela. */
function pinoBaixar(cor, oque, aoLado) {
  return `<span class="tab-lado"><span class="pino ${cor}">${oque}</span>`
       + (aoLado ? `<i>${aoLado}</i>` : "") + "</span>";
}

function celulaBaixar(p) {
  const podem = p.baixaveis || 0;
  const restam = p.restam != null ? p.restam : podem;
  const veio = podem - restam;
  const leva = LEVAS_POR_CONTA[p.conta];
  if (leva && (leva.estado === "em curso" || leva.estado === "pedida"))
    return pinoBaixar("indo", "em curso", leva.numero ? `leva ${leva.numero}` : "");
  if (!podem) {
    /* "SEM MATERIAL" ERA MENTIRA EM PERFIL DE CARROSSEL, e foi essa a queixa que abriu a
       espec `carrossel-de-ponta-a-ponta`: a coluna contava os carrosséis certinho ali ao
       lado e, na hora de coletar, dizia que não havia nada. Havia: o que faltava era
       caminho para baixar.

       E A PALAVRA "REELS" SAIU DAQUI TAMBÉM, algumas linhas abaixo. Um perfil de doze
       carrosséis chegou a dizer "a baixar · 12 reels", com a palavra cravada no código. */
    const carr = p.carrosseis_baixaveis || 0;
    if (carr) return pinoBaixar("", "no pacote",
      `${num(carr)} ${carr === 1 ? "carrossel" : "carrosséis"}`);
    return pinoBaixar("off", "sem material", "");
  }
  if (restam === 0) {
    /* TRÊS FINAIS DIFERENTES, e eles não querem dizer a mesma coisa:

         concluído  a leva saiu da esteira
         guardado   ela chegou ao computador dele
         entregue   os vídeos subiram para o Drive, com descrição

       Mostrar "concluído" para os três é o que fazia a coluna esconder metade do
       caminho. "Entregue" é o único que quer dizer 100% pronto. */
    const onde = leva && leva.entregue ? "entregue"
      : (leva && leva.guardado ? "guardado" : "concluído");
    return pinoBaixar("ok", onde, num(veio) + (leva ? ` · leva ${leva.numero}` : ""));
  }
  if (veio) return pinoBaixar("meio", "pela metade", `${num(veio)} de ${num(podem)}`);
  /* "REELS" NÃO SE ESCREVE AQUI À MÃO. Esta conta é a da esteira, e a esteira é de vídeo,
     mas a palavra cravada já mentiu: perfil de doze carrosséis dizia "a baixar · 12 reels".
     Hoje `baixaveis` conta só reels de propósito (o carrossel tem número próprio), então o
     rótulo é o do formato, e não a palavra. */
  return pinoBaixar("", "a baixar", `${num(restam)} reels`);
}

/* =============================================== O PACOTE DE CARROSSÉIS (02/09/2026)

   Espec `carrossel-de-ponta-a-ponta`. O carrossel NÃO passa pela esteira do GitHub: a casa
   baixa direto, monta um PDF por carrossel e empacota num ZIP por perfil. A tela fala com
   três rotas do posto: `POST /carrossel`, `GET /carrossel?id=` e `GET /carrossel-pacote`.

   O PEDIDO LEVA OS CARROSSÉIS DENTRO. A casa não lê o acervo do GitHub, e a tela já tem a
   lista em memória (é dela que sai a coluna). Mandar a lista pronta evita a casa precisar
   de token e evita uma segunda cópia da régua do lado de lá, que divergiria na primeira
   mudança. */
const CARR_VIGIA = { id: null, relogio: null, conta: null };

/** Quantos carrosséis dá para baixar de cada perfil, e se a régua já sabe disso. */
function carrosseisDosPerfis(perfis) {
  const todos = perfis || [];
  const lista = todos.filter(p => (p.carrosseis_baixaveis || 0) > 0);
  /* TRÊS ESTADOS DE LEITURA, E NÃO DOIS (trava 2). Ficha SEM o campo quer dizer que a régua
     ainda não rodou depois desta mudança; ficha COM o campo em zero quer dizer que não há
     carrossel. Desenhar "não tem" para os dois esconderia o único caso que tem conserto:
     rodar a varredura com carrossel marcado.

     E O TERCEIRO ESTADO É A LISTA VAZIA, que é o que este `houvePerfil` guarda. Sem ele,
     uma leitura que falhasse (`selecao.json` e `estado.json` fora do ar, e aí `perfis` vem
     `[]`) mandava ele rodar uma varredura inteira por causa de um arquivo que não desceu.
     Achado pelo revisor de tela em 02/09/2026, medido com `desenhaCarrossel([])`. */
  const houvePerfil = todos.length > 0;
  const jaContou = todos.some(p => p.carrosseis_baixaveis != null);
  return { lista, jaContou, houvePerfil };
}

function desenhaCarrossel(perfis) {
  const caixa = $("cx_carrossel");
  if (!caixa) return;
  const { lista, jaContou, houvePerfil } = carrosseisDosPerfis(perfis);
  // NÃO OCUPA ESPAÇO quando não há carrossel coletado (critério 20 da espec). O `hidden`
  // sozinho não bastaria: a folha tem `display` próprio para `.cx-carr`, e o esconder do
  // navegador perde para ela. A linha irmã `.cx-carr[hidden]` é quem faz valer.
  caixa.hidden = !lista.length;
  /* "NÃO TEM" E "NÃO LI" SÃO COISAS DIFERENTES, e mostrar a mesma tela para as duas é a
     trava 2 escrita no dado. Ficha sem o campo quer dizer que a régua não rodou depois
     desta mudança, e isso tem conserto: marcar carrossel na varredura. Ficha com o campo em
     zero quer dizer que não há, e aí não há o que fazer. O recado tem elemento próprio, e
     não emprestado, porque quando ele vale o cartão está escondido. */
  const naoLido = $("carr_naolido");
  if (naoLido) {
    // SEM PERFIL NENHUM, ELE NÃO DIZ NADA: não saber é diferente de saber que não há, e
    // mandar minerar de novo por causa de uma leitura que falhou é pior que ficar calado.
    const dizer = houvePerfil && !jaContou;
    naoLido.hidden = !dizer;
    naoLido.textContent = dizer ? "A régua ainda não contou carrossel neste acervo. "
      + "Rode uma varredura com carrossel marcado para o pacote aparecer aqui." : "";
  }
  if (!lista.length) return;
  const html = lista.map(p => `
    <div class="carr-perfil" data-conta="${p.conta}">
      <span class="carr-nome">@${p.conta}</span>
      <span class="carr-quantos">${num(p.carrosseis_baixaveis)} ${
        p.carrosseis_baixaveis === 1 ? "carrossel" : "carrosséis"}</span>
      <span class="dir">
        <button class="acao forte" type="button" data-carr="${p.conta}">
          <!-- CAIXA FECHANDO, e nunca a seta de baixar.
               Os dois botoes deste cartao tinham o MESMO fundo, o MESMO texto e o MESMO
               desenho de seta para baixo, a 126 pixels um do outro: um comeca um trabalho
               de minutos a horas, o outro grava o arquivo, e clicar no errado recomeca a
               coleta inteira. Achado pelo revisor de tela em 02/09/2026. -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8M2 4h20v4H2zM10 12h4"/></svg>
          Montar O Pacote</button>
      </span>
    </div>`).join("");
  const alvo = $("carr_perfis");
  // Desenho igual não se redesenha, a mesma regra da fileira acima: reescrever apagaria o
  // botão sob o cursor a cada volta de vinte e cinco segundos.
  if (alvo.dataset.desenho !== html) {
    alvo.innerHTML = html;
    alvo.dataset.desenho = html;
  }
  // E O QUE JÁ ESTÁ NO DISCO VOLTA À TELA, mesmo depois do F5. Só quando não há trabalho
  // em curso: a vigia é mais nova que o disco e não pode ser atropelada por ele.
  if (!CARR_VIGIA.relogio) acharPacoteNoDisco(lista);
}

/** Pergunta ao posto que perfis já têm pacote pronto, e redesenha o botão de baixar. */
async function acharPacoteNoDisco(lista) {
  if (!(await postoDePe())) return;
  let r;
  try {
    r = await noPosto("/carrossel-pacotes");
  } catch (e) {
    return;                      // silêncio de uma volta não é falha, e não apaga nada
  }
  const feitos = (r && r.d) || {};
  const meu = (lista || []).map(p => p.conta).find(c => feitos[c]);
  if (!meu || CARR_VIGIA.relogio) return;
  /* O NÚMERO DE CARROSSÉIS NÃO SE INVENTA AQUI. O disco sabe o tamanho do arquivo e a hora,
     e não quantos carrosséis entraram: dizer um número seria a trava 2. O botão diz o que
     dá para medir, e o resto fica de fora. */
  const mb = (feitos[meu].bytes || 0) / 1048576;
  $("carr_baixar_txt").textContent = `Baixar O Pacote De @${meu} · `
    + `${mb.toFixed(1).replace(".", ",")} MB`;
  $("carr_baixar").dataset.conta = meu;
  $("carr_pe").hidden = false;
  $("carr_conta").textContent = `@${meu}: pacote pronto, montado ${quando(feitos[meu].quando)}.`;
}

/** As fichas dos carrosséis de um perfil, na ordem da régua. */
function carrosseisDaConta(conta) {
  return CARROSSEIS_DA_REGUA.filter(x => x.conta === conta).map((x, i) => ({
    codigo: x.codigo, legenda: x.legenda || "", ordem: i + 1, pecas: x.pecas || [],
  }));
}

async function pedirOPacote(conta) {
  const recado = $("carr_recado");
  recado.textContent = "";
  const carrosseis = carrosseisDaConta(conta);
  if (!carrosseis.length) {
    return dizNoCarrossel("A régua conta carrosséis neste perfil, mas nenhum deles tem a "
      + "lista de lâminas gravada. Rode a varredura de novo com carrossel marcado.");
  }
  const id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const b = document.querySelector(`[data-carr="${conta}"]`);
  if (b) b.disabled = true;
  try {
    /* PACIÊNCIA MAIOR QUE A PADRÃO: o corpo leva a lista de lâminas de todos os
       carrosséis do perfil, que é o segundo maior pedido do sistema depois da montagem. */
    const r = await noPosto("/carrossel", { id, conta, carrosseis }, 60000);
    // ACORDEI FALSO NÃO É FALHA: o pedido ficou gravado e a resposta diz o que fazer. O
    // recado aparece e a vigia começa mesmo assim, porque um `--fila` na casa o cumpre.
    if (r && r.erro) dizNoCarrossel(r.erro);
    vigiarOPacote(id, conta, carrosseis.length);
  } catch (e) {
    // O `noPosto` já traduz o 409 do clique repetido e o 401 da sessão vencida na
    // mensagem do erro; escrever outra por cima esconderia a que sabe o motivo.
    dizNoCarrossel(String((e && e.message) || e));
  } finally {
    if (b) b.disabled = false;
  }
}

function dizNoCarrossel(texto) {
  const caixa = $("carr_recado");
  caixa.textContent = "";
  if (!texto) return;
  /* O TEXTO ENTRA COMO TEXTO, e nunca por `innerHTML`. Ele vem do posto e de erros do
     sistema de arquivos: um caminho com sinal de menor dentro quebrava o cartão inteiro, e
     o recado que existe para explicar o problema virava o problema. Achado pelo revisor de
     tela em 02/09/2026. O desenho é fixo, então ele sim se monta aqui. */
  const marca = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  marca.setAttribute("viewBox", "0 0 24 24");
  for (const d of ["M12 9v5M12 17.5v.01",
                   "M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"]) {
    const risco = document.createElementNS("http://www.w3.org/2000/svg", "path");
    risco.setAttribute("d", d);
    marca.appendChild(risco);
  }
  const frase = document.createElement("span");
  frase.textContent = texto;
  caixa.append(marca, frase);
}

/** Desenha a barra: uma marca por carrossel, no lugar dele na fila. */
function desenhaAsMarcas(marcas, total) {
  const trilha = $("carr_trilha");
  /* COM MENOS DE TRÊS, A BARRA NÃO EXISTE. Com um item a marca mede a barra inteira e vira
     exatamente a tarja que a trava 37 proibiu: uma tarja diz a fração, uma marca por peça
     diz quantas são e quais deram problema, e com uma peça só as duas coisas são a mesma.
     A linha de texto ao lado já diz tudo. Medido pelo revisor de tela: 1 item = 1186px de
     verde de ponta a ponta. */
  trilha.hidden = total < 3;
  if (trilha.hidden) return;
  /* O VÃO ENCOLHE ANTES DA MARCA, e quem decide é o programa porque só ele sabe quantos
     são. Com 180 itens e vão de 1,5px o vão comia 41% da barra e o verde virava chuvisco
     (trava 39); e marca com largura mínima EMPURRA em vez de dividir, que foi o que jogou
     o placar da fase 6 para 930 pixels (trava 70a). */
  trilha.style.setProperty("--carr-vao", total > 60 ? "0.5px" : "2px");
  if (trilha.children.length !== total) {
    trilha.innerHTML = Array.from({ length: total },
      () => '<i class="carr-marca"></i>').join("");
  }
  [...trilha.children].forEach((m, i) => {
    const c = (marcas || "")[i];
    if (c && c !== ".") m.dataset.m = c; else m.removeAttribute("data-m");
  });
}

function desenhaOPacote(a, conta, total) {
  const feitas = a.feitas || 0;
  const quantos = a.total || total;
  const parciais = a.parciais || 0;
  const falhados = a.falhados || 0;
  const deuErro = a.estado === "erro";
  desenhaAsMarcas(a.marcas || "", quantos);
  /* A BARRA DESBOTA QUANDO O PACOTE FALHOU. Ela continua dizendo a verdade peça a peça (as
     lâminas desceram mesmo), mas cheia e verde ela é a coisa maior e mais clara da caixa, e
     afirmava sucesso com o cartão vermelho logo abaixo dizendo o contrário. Achado pelo
     revisor de tela, fotografado nos dois temas. */
  $("carr_trilha").dataset.erro = deuErro ? "sim" : "nao";

  /* O NOME DO PERFIL VEM NA FRENTE, sempre. Com três perfis na fileira, a barra, a conta e
     o botão eram de UM deles e não diziam qual: lido de cima para baixo, "40 carrosséis"
     seguido de "7 de 7 carrosséis" era a lista contradizendo o recado ao lado. Achado pelo
     revisor de tela em 02/09/2026, medido com três perfis. */
  const quem = conta ? `@${conta}: ` : "";
  $("carr_conta").textContent = quem
    + `${num(feitas)} de ${num(quantos)} ${quantos === 1 ? "carrossel" : "carrosséis"}`
    + (parciais ? ` · ${num(parciais)} com lâmina faltando` : "")
    + (falhados ? ` · ${num(falhados)} não saíram` : "")
    + (deuErro ? " · o pacote não foi montado" : "");
  // E A LINHA DO PERFIL DE QUE A BARRA FALA FICA ACESA, para o olho achar de qual é.
  document.querySelectorAll("#carr_perfis .carr-perfil").forEach(L => {
    L.dataset.escolhido = L.dataset.conta === conta ? "sim" : "nao";
  });

  const pe = $("carr_pe");
  const pacote = a.pacote || {};
  const pronto = a.estado === "pronto" && pacote.ok;
  pe.hidden = !pronto;
  if (pronto) {
    /* OS DOIS NÚMEROS SAEM DO DISCO, e nunca de uma soma feita aqui (critério 21 e trava
       2). O ZIP comprime, então somar o que entrou mostraria no botão um peso que o
       download desmente no minuto seguinte. */
    const mb = (pacote.bytes || 0) / 1048576;
    $("carr_baixar_txt").textContent = `Baixar O Pacote De @${conta} · `
      + `${num((a.completos || 0) + parciais)} carrosséis, `
      + `${mb.toFixed(1).replace(".", ",")} MB`;
    $("carr_baixar").dataset.conta = conta;
  }
  if (deuErro) dizNoCarrossel(a.erro || "O pacote não foi montado.");
}

function vigiarOPacote(id, conta, total) {
  if (CARR_VIGIA.relogio) clearInterval(CARR_VIGIA.relogio);
  CARR_VIGIA.id = id;
  CARR_VIGIA.conta = conta;
  dizNoCarrossel("");
  desenhaAsMarcas(".".repeat(total), total);
  /* TODA ESPERA TEM NOME nesta casa ("Abrindo O Reel", "Medindo O Reel", "Descendo A
     Filmagem"): tela parada e calada ele chama de bugada, e está certo. Aqui a primeira
     lâmina leva dezenas de segundos, e a versão anterior dizia apenas "0 de 2 carrosséis"
     por quase um minuto. Achado pelo revisor de tela, cronometrado. */
  $("carr_conta").textContent = `Baixando As Lâminas De @${conta} · 0 de ${num(total)} `
    + (total === 1 ? "carrossel" : "carrosséis");
  $("carr_trilha").dataset.erro = "nao";
  $("carr_pe").hidden = true;

  const olhar = async () => {
    let r;
    try {
      r = await noPosto(`/carrossel?id=${encodeURIComponent(id)}`);
    } catch (e) {
      /* SILÊNCIO DE UMA VOLTA NÃO É FALHA. O posto atende várias linhas e o download está
         ocupando a rede; desistir na primeira tosse pintaria erro num trabalho em curso. */
      return;
    }
    if (r && r.ilegivel) {
      clearInterval(CARR_VIGIA.relogio);
      return dizNoCarrossel(r.erro || "o andamento existe mas não deu para ler");
    }
    const a = (r && r.d) || null;
    if (!a) return;
    if (a.fila) {
      $("carr_conta").textContent = "Na fila, esperando a casa pegar o pedido.";
      return;
    }
    desenhaOPacote(a, conta, total);
    if (a.estado === "pronto" || a.estado === "erro") {
      clearInterval(CARR_VIGIA.relogio);
      CARR_VIGIA.relogio = null;
    }
  };
  olhar();
  CARR_VIGIA.relogio = setInterval(olhar, 1500);
}

/* OS DOIS CLIQUES DO CARTÃO. `data-carr` é atributo NOVO, e não emprestado de outro gesto:
   em 27/08/2026 o Abrir do cardzinho reusou o `data-abrir` dos links de pasta e o ouvinte
   global do documento atendeu junto, escrevendo "essa pasta mora na casa do Estúdio" dentro
   do botão. Atributo com ouvinte global nunca se reusa. */
document.addEventListener("click", ev => {
  const montar = ev.target.closest("[data-carr]");
  if (montar) return pedirOPacote(montar.dataset.carr);
  const baixar = ev.target.closest("#carr_baixar");
  if (!baixar || !baixar.dataset.conta) return;
  /* O DOWNLOAD VAI PELO NAVEGADOR, e não por `fetch`. O ZIP tem dezenas de megabytes e
     buscá-lo por programa poria tudo na memória da aba antes de gravar. A rota manda
     `Content-Disposition: attachment`, então o navegador grava direto, com barra própria. */
  window.location.assign(
    POSTO + "/carrossel-pacote?conta=" + encodeURIComponent(baixar.dataset.conta));
});

function desenhaMinerados() {
  const q = ($("min-q").value || "").trim().toLowerCase();
  const por = minPor;

  let fila = MINERADOS.filter(p => {
    if (q && !((p.conta || "") + " " + (p.nome || "")).toLowerCase().includes(q)) return false;
    if (minEstado && situacaoDe(p) !== minEstado) return false;
    return true;
  });

  const chaves = {
    varridos: p => -(p.lidos || 0),
    cobertura: p => -(p.publicacoes ? p.lidos / p.publicacoes : 0),
    acima: p => -(p.acima || 0),
    reels: p => -(p.reels || 0),
    conta: p => p.conta || "",
  };
  fila.sort((a, b) => {
    const x = chaves[minOrdem](a), y = chaves[minOrdem](b);
    return typeof x === "string" ? x.localeCompare(y, "pt") : x - y;
  });

  const paginas = Math.max(1, Math.ceil(fila.length / por));
  if (minPagina > paginas) minPagina = paginas;
  const pedaco = fila.slice((minPagina - 1) * por, minPagina * por);

  $("min-vazio").hidden = fila.length > 0;
  $("min-pag").hidden = fila.length === 0;
  $("min-conta").textContent = `Pág. ${minPagina}/${paginas} · ${num(fila.length)}`
    + (fila.length === 1 ? " perfil" : " perfis");
  $("min-ini").disabled = $("min-ant").disabled = minPagina <= 1;
  $("min-prox").disabled = $("min-fim").disabled = minPagina >= paginas;
  $("min-sub").textContent = `${MINERADOS.length} ${MINERADOS.length === 1 ? "perfil varrido" : "perfis varridos"}`;
  $("sub-conta").textContent = MINERADOS.length;

  $("min-corpo").innerHTML = pedaco.map(p => {
    // A COBERTURA DE UMA VARREDURA FILTRADA NÃO É SOBRE AS PUBLICAÇÕES DO PERFIL.
    //
    // Aqui saía "13%" para um perfil com 294 reels e 2.256 publicações, e "0%" para
    // outro cujo total de publicações o Instagram não informou. Nenhum dos dois diz o
    // que interessa: numa busca de reels, o que importa é se ela chegou ao último reel.
    //
    // Chegou: mostra "todos". Não chegou: mostra a contagem, sem inventar fração de um
    // total que ninguém conhece, porque quantos reels um perfil tem só se sabe no fim.
    const filtrado = rotuloDosFormatos(null, LIVRO.find(c => c.conta === p.conta))
                       !== "publicações";
    const cob = p.publicacoes ? Math.round(100 * p.lidos / p.publicacoes) : 0;
    const coluna = filtrado
      // A CONTAGEM E' DO FORMATO QUE O ROTULO NOMEIA. Com `p.lidos` a coluna dizia
      // "todos / 395 carrosséis" num perfil de 395 reels e zero carrossel (03/09/2026);
      // a ficha do perfil ja' traz `reels`, `imagens` e `carrosseis` separados.
      ? (p.completo
          ? `<span class="tab-dupla">todos<i>${num(lidosDoPerfil(p))} ${
              rotuloDosFormatos(null, LIVRO.find(c => c.conta === p.conta))}</i></span>`
          : `<span class="tab-dupla">em curso<i>${num(p.lidos)} até agora</i></span>`)
      : p.publicacoes
        ? `<span class="tab-dupla">${cob}%<i>de ${num(p.publicacoes)}</i></span>`
        : `<span class="tab-dupla tab-nulo">sem total<i>o Instagram não informa</i></span>`;
    const [selo] = ESTADOS[situacaoDe(p)];
    const ate = p.mais_antigo
      ? new Date(p.mais_antigo * 1000).toLocaleDateString("pt-BR",
          { month: "short", year: "numeric" })
      : '<span class="tab-nulo">sem data</span>';
    return `<tr class="tab-linha">
      <td class="tab-perfil"><div class="tab-perfil-in">${retrato(p)}
        <span class="tab-quem"><b>@${p.conta}</b>
          <span>${p.nome || "sem nome no perfil"}</span></span></div></td>
      <td class="tab-marc">${celulaMercado(p)}</td>
      <td class="tab-marc tab-marc-etq">${celulaEtiqueta(p)}</td>
      <td class="tab-num">${num(p.lidos)}</td>
      <td class="tab-num">${coluna}</td>
      <td>${ate}</td>
      <td class="tab-num">${num(p.reels)}</td>
      <td class="tab-num">${num(p.imagens)}</td>
      <td class="tab-num">${num(p.carrosseis)}</td>
      <td class="tab-num">${num(p.acima)}</td>
      <td class="tab-baixa">${celulaBaixar(p)}</td>
      <td>${selo}</td>
      <td>${quando(p.atualizado)}</td>
      <td class="tab-acao"><a class="acao" target="_blank"
          rel="noopener" href="https://www.instagram.com/${p.conta}/">Instagram</a></td>
    </tr>`;
  }).join("");
}

$("min-q").addEventListener("input", () => { minPagina = 1; desenhaMinerados(); });
$("min-ini").onclick = () => { minPagina = 1; desenhaMinerados(); };
$("min-ant").onclick = () => { minPagina--; desenhaMinerados(); };
$("min-prox").onclick = () => { minPagina++; desenhaMinerados(); };
$("min-fim").onclick = () => { minPagina = 1e9; desenhaMinerados(); };

/* AQUI MORAVA O BOTÃO DE MINERAR DE NOVO, e ele saiu por decisão do Gabriel em
   17/08: perfil já extraído não se extrai outra vez. A esteira continua sabendo reler
   um perfil encerrado, porque é ela quem atende um pedido gravado no acervo, mas a tela
   não oferece mais esse pedido a ninguém. */

/* --------------------------------------------------- as três medidas do cartão

   ELAS CONTAM O LIVRO, e não a sessão do navegador. Contavam as mensagens que tinham
   aparecido na tela desde que a página abriu: fechar a aba zerava tudo, e o número
   respondia "quanto tempo esta janela está aberta" em vez de "o que aconteceu".

   O traço embaixo é a atividade dos últimos catorze dias, um ponto por dia. Sem
   movimento ele sai reto e apagado, que é a verdade daquele período. */
const DIAS_DO_TRACO = 14;

function medir(eventos) {
  const contas = { falha: 0, aviso: 0, evento: 0 };
  const dia = t => Math.floor(t / 86400);
  const hoje = dia(Date.now() / 1000);
  const series = { falha: [], aviso: [], evento: [] };
  for (const g of Object.keys(series))
    series[g] = new Array(DIAS_DO_TRACO).fill(0);

  // A TERCEIRA COLUNA É O TOTAL, e não a terceira fatia. "Registros: 13" ao lado de
  // "avisos: 2" fazia parecer que havia 15 coisas em três caixas, quando a leitura
  // certa é: quinze registros, dos quais dois são aviso e nenhum é falha.
  for (const e of eventos) {
    const atras = hoje - dia(e.quando);
    const dentro = atras >= 0 && atras < DIAS_DO_TRACO;
    contas.evento += 1;
    if (dentro) series.evento[DIAS_DO_TRACO - 1 - atras] += 1;
    const peso = pesoDe(e);
    if (peso === "falha" || peso === "aviso") {
      contas[peso] += 1;
      if (dentro) series[peso][DIAS_DO_TRACO - 1 - atras] += 1;
    }
  }

  for (const g of Object.keys(contas)) {
    $("k_" + g).textContent = num(contas[g]);
    const alvo = $("t_" + g), serie = series[g], teto = Math.max(...serie, 0);
    if (!teto) {
      alvo.classList.add("parado");
      alvo.querySelector("path").setAttribute("d", "M0 19H100");
      continue;
    }
    alvo.classList.remove("parado");
    const passo = 100 / (serie.length - 1);
    alvo.querySelector("path").setAttribute("d", serie.map((v, i) =>
      `${i ? "L" : "M"}${(i * passo).toFixed(1)} ${(19 - (v / teto) * 17).toFixed(1)}`
    ).join(" "));
  }
}

/* ========================================================= O LIVRO DE ATIVIDADE

   UM CARTÃO POR PERFIL. Fechado, ele diz quem é e quando foi a última coisa feita.
   Aberto, mostra o histórico inteiro daquele perfil: cada varredura, quantas máquinas
   trabalharam nela, quantas páginas, o que deu errado e onde a leitura fechou.

   A CAPA E O MIOLO SÃO ARQUIVOS SEPARADOS, e isso é o que faz a lista abrir rápido:
   o índice traz o resumo de todos os perfis e pesa alguns quilobytes; o histórico de
   um perfil só é buscado quando o cartão é aberto, e fica guardado depois disso.

   E ELES VIVEM NO ACERVO, não no navegador. Recarregar a página não perde nada, e o
   que foi feito hoje continua aqui daqui a noventa dias. */
const POR_LEVA = 10;
let LIVRO = [], livroMostra = POR_LEVA, livroTipo = "", livroDesde = 0;
const HISTORICOS = new Map();

/* O CARTÃO NASCE NO CLIQUE, e não na leitura que vem depois.

   Mesmo com a leitura já vindo fresca pela ponte, entre apertar Iniciar e o acervo
   responder passam SEGUNDOS: a ponte ainda vai perguntar quem é o perfil ao Instagram,
   e essa consulta sozinha demora. Nesse buraco a lista não mostrava nada, e a leitura
   óbvia de uma lista vazia é que o clique não funcionou.

   É o mesmo remédio já usado no registro de lotes: pediu, tem cartão. O cartão local
   vive até a leitura trazer o de verdade, e aí some, porque o verdadeiro tomou o lugar
   dele. Ele não inventa número nenhum: nasce dizendo que está na fila, e só ganha nome
   e contagem quando a própria resposta da ponte os traz. */
const PEDIDAS = new Map();

function anotarPedida(conta, dados) {
  const cartao = {
    conta, nome: null, primeiro: 0, ultimo: 0, eventos: 0, falhas: 0, avisos: 0,
    ultimo_tipo: "aguardando", lidos: 0, publicacoes: 0, completo: false,
    aguardando: true, naFila: Math.floor(Date.now() / 1000),
    // ESTE CARTÃO NÃO PEDE INSISTÊNCIA. Quem decide a quem insistir é a lista de
    // verdade, que chega em seguida; sem esta marca, o cartão local dispararia uma
    // segunda identificação do mesmo perfil enquanto a primeira ainda está no ar.
    local: true, ...(dados || {}),
  };
  PEDIDAS.set(conta, cartao);
  LIVRO = [cartao, ...LIVRO.filter(c => c.conta !== conta)];
}
/* QUAIS CARTÕES ESTÃO ABERTOS, guardado fora do desenho.

   A lista inteira é reescrita a cada volta dos relógios, e a mais rápida delas roda de
   dez em dez segundos. Como o estado de aberto vivia só na classe do elemento, o
   redesenho apagava o elemento e o cartão fechava sozinho: quem clicava via ele abrir e
   fechar na cara. Agora quem manda é este conjunto, e o desenho obedece a ele. */
const ABERTOS = new Set();
/* A RÉGUA QUE ESTÁ VALENDO, para a tela não depender do bilhete para saber o modo.
   O bilhete só ganha o campo "modo" na rodada seguinte à publicação, e enquanto isso a
   tela ficaria contando reels contra o total de publicações do perfil, que é a conta
   errada e assusta. A régua está no acervo desde o Iniciar. */
let REGUA_VALENDO = null;
const NOMES_FORMATO = { reels: "reels", carrossel: "carrosséis", post: "posts isolados" };

/** Como chamar o que está sendo buscado, na combinação que o Gabriel escolheu. */
function rotuloDosFormatos(bilhete, ficha) {
  if (bilhete && bilhete.rotulo) return bilhete.rotulo;
  if (ficha && ficha.rotulo) return ficha.rotulo;
  const f = (REGUA_VALENDO && REGUA_VALENDO.formatos) || [];
  if (!f.length || f.length === 3) return "publicações";
  const nomes = ["reels", "carrossel", "post"].filter(x => f.includes(x))
    .map(x => NOMES_FORMATO[x]);
  return nomes.length === 1 ? nomes[0]
    : nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
}
const filtrando = () => {
  const f = (REGUA_VALENDO && REGUA_VALENDO.formatos) || [];
  return f.length > 0 && f.length < 3;
};

/* O PRIMEIRO NUMERO DA SITUACAO, e ele conta O QUE O ROTULO AO LADO DIZ QUE CONTA.

   O QUE ELE VIU EM 03/09/2026: "406 carrosséis varridos", com ONZE carrosséis no acervo.
   O rótulo vem dos formatos da régua (`rotuloDosFormatos`, que vira "carrosséis" com a
   régua marcada só nele) e o número somava `lidos`, que é TODO post já gravado do perfil,
   incluindo os 395 reels do @leisdamentemilionaria varridos semanas antes com outra
   régua. A soma: 395 + 9 + 2 = 406.

   ELE LEU O PAINEL E DISSE, COM RAZAO, "existe MUITO MAIS CARROSSEIS em ambos os casos":
   a tela tinha acabado de lhe dizer que havia quatrocentos e seis.

   A FICHA DE CADA PERFIL JA' TINHA A CONTA CERTA. O `selecionar.py` grava `reels`,
   `imagens` e `carrosseis` desde sempre, e do que foi VARRIDO, não do que passou na
   régua, justamente para a tabela não dizer zero quando o corte é de outro formato.
   Faltava só o painel usá-la. Sem filtro de formato o rótulo é "publicações varridas", e
   aí `lidos` é exatamente o número certo.

   MORA FORA DO `atualizar()` PARA PODER SER PROVADO: aquela função busca meia dúzia de
   arquivos na rede antes de chegar aqui, e prova que precisa da rede inteira de pé para
   medir uma soma é prova que ninguém escreve. */
const NOME_DA_CONTA_DE = { reels: "reels", post: "imagens", carrossel: "carrosseis" };

/** Quantos daquele perfil, contando SO' os formatos que a régua pede. */
function lidosDoPerfil(p) {
  const formatos = (REGUA_VALENDO && REGUA_VALENDO.formatos) || [];
  return filtrando()
    ? formatos.reduce((a, f) => a + (p[NOME_DA_CONTA_DE[f]] || 0), 0)
    : (p.lidos || 0);
}

function lidosDoPainel(perfis) {
  return (perfis || []).reduce((a, p) => a + lidosDoPerfil(p), 0);
}

/* A GRAVIDADE É DECIDIDA AQUI, e não lida do que ficou gravado.
   O tipo do evento é o dado; a gravidade é opinião sobre ele, e opinião muda. "Rodada
   sem avanço" já foi classificada como falha e não é: com menos perfis do que vagas,
   várias vagas caem no mesmo perfil e as últimas voltam vazias, que é o rodízio de
   endereços funcionando. Se a tela lesse a marca gravada, o histórico inteiro
   continuaria vermelho depois da correção. */
const PESO = {
  sem_avanco: "aviso", limite: "aviso", aguardando: "aviso", vazio: "aviso",
};
/* TIPO DESCONHECIDO HERDA A GRAVIDADE GRAVADA NO EVENTO, e nao um neutro mudo: o
   resgate da VPS e o vigia escrevem tipos novos com a gravidade dentro, e pintar
   falha deles de "evento" esconderia exatamente o que a lei manda mostrar. */
const pesoDe = e => PESO[e.tipo] || e.gravidade || "evento";

/* COMO CADA EVENTO SE CHAMA NA TELA, e por que a lista tem de estar COMPLETA.

   Em 03/09/2026 o Gabriel fotografou os dois perfis dele com a pastilha escrita
   `sem_leitura`, com sublinhado e tudo: a chave interna do programa, na cara dele. Sete
   dos treze tipos que o `atividade.py` grava não tinham tradução aqui, e o desenho cai no
   próprio tipo quando não acha. Os que faltavam eram justamente os ramos de FALHA, ou
   seja, os únicos que ele lê quando algo dá errado.

   QUEM MANDA NA LISTA É O `GRAVIDADE` do `atividade.py`, e a prova cruza os dois: chave
   gravada lá sem tradução aqui reprova. Lista escrita à mão dos dois lados diverge no
   primeiro tipo novo, e foi exatamente o que aconteceu. */
const TIPOS = {
  aguardando: "aguardando identificação",
  vazio: "sem posts públicos",
  alvo: "alvo atingido",
  identificado: "identificação",
  varredura: "varredura",
  concluido: "conclusão",
  limite: "limite do Instagram",
  sem_avanco: "sem avanço",
  lote: "lote baixado",
  sem_leitura: "o Instagram recusou",
  falha_abertura: "não abriu pelo arroba",
  estouro: "a vaga estourou",
  vigia: "reaberto pelo vigia",
  casa: "lido pela casa",
  resgate: "resgate",
};

// OS TRES JEITOS DE O INSTAGRAM DIZER NAO. Para quem olha a tela, "quem está preso?" é
// uma pergunta só, e o filtro precisa respondê-la sem exigir que ele saiba os três nomes.
const RECUSAS = new Set(["sem_leitura", "falha_abertura", "estouro"]);

/* A FRASE QUANDO A RECUSA JÁ VIROU PAREDE, e vazio quando ainda é rodízio.

   O `rodada.py` grava no evento quantas RODADAS seguidas ficaram sem página e quantas
   vagas foram recusadas na atual. Uma vaga vazia entre outras que leram é o rodízio de
   endereços funcionando; todas vazias, rodada após rodada, é o Instagram fechado para
   este perfil, e chamar isso de revezamento faz quem lê esperar calmo por uma coisa que
   não vai acontecer. Foi o que ele leu por uma hora em 03/09/2026. */
function recusaSeguida(b) {
  // O NUMERO MORA NA CAPA DO LIVRO, e nao no bilhete: o bilhete conta o que a vaga leu,
  // e aqui a pergunta é sobre as vagas que NÃO leram.
  const c = LIVRO.find(x => x.conta === (b && b.conta)) || {};
  const rodadas = Number(c.sem_pagina || 0);
  const vagas = Number(c.vagas_recusadas || 0);
  if (rodadas < 2) return "";
  return `O Instagram está recusando este perfil de todos os endereços da esteira: `
    + `${num(rodadas)} rodadas seguidas sem página`
    + (vagas > 1 ? `, ${num(vagas)} vagas recusadas na última.` : ".");
}

/* A PASTILHA DIZ O ESTADO DO PERFIL, e o motivo vai ao lado.

   O QUE ELE VIU EM 03/09/2026: dois perfis que JA' TINHAM LIDO 9 e 2 posts, marcados
   "sem leitura". Os dois estavam sendo varridos; o que não tinha lido nada era a ÚLTIMA
   VAGA, que é outra coisa. É a trava 2 na etiqueta: "não consegui ler agora" e "não leu
   nada" são estados diferentes, e mostrar a mesma palavra para os dois esconde qual é.

   A ORDEM É: já leu e acabou; já leu e continua; nunca leu. O tipo do último evento
   continua aparecendo, mas como MOTIVO, e não como estado. */
function etiquetaDoPerfil(c) {
  const motivo = TIPOS[c.ultimo_tipo] || c.ultimo_tipo || "";
  if (c.completo) return TIPOS.concluido;
  if (c.lidos > 0) {
    // RECUSA NUMA VAGA NÃO APAGA O QUE JÁ FOI LIDO: o perfil está varrendo, e a recusa é
    // o que aconteceu na última tentativa.
    return motivo && c.ultimo_tipo !== "varredura"
      ? `Varrendo · ${motivo}` : "Varrendo";
  }
  return motivo || "na fila";
}

function dataHora(ts) {
  return new Date(ts * 1000).toLocaleString("pt-BR",
    { day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit" });
}

function haQuanto(ts) {
  const h = (Date.now() / 1000 - ts) / 3600;
  if (h < 1) return "há " + Math.max(1, Math.round(h * 60)) + " min";
  if (h < 24) return "há " + Math.round(h) + " h";
  const d = Math.round(h / 24);
  return d < 30 ? `há ${d} ${d === 1 ? "dia" : "dias"}`
                : `há ${Math.round(d / 30)} ${d < 60 ? "mês" : "meses"}`;
}

/** Só a hora, para carimbo dentro de frase: "último sinal às 14:32". */
function horaCurta(ts) {
  return new Date(ts * 1000).toLocaleTimeString("pt-BR",
    { hour: "2-digit", minute: "2-digit" });
}

/* QUANDO A ESTEIRA ACORDA DE NOVO. O relógio dela é de meia em meia hora, no minuto
   cheio, e o card de quem espera diz a hora da próxima batida em vez de pedir fé:
   "esperando" sem prazo é o mesmo silêncio que escondeu 24 horas de esteira parada
   em 24/08/2026. */
function proximaRodadaAs() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* MAS O RELÓGIO DE MEIA EM MEIA HORA NÃO É A HISTÓRIA INTEIRA, E DIZER SÓ ELE ASSUSTA.

   A esteira EMENDA A PRÓPRIA RODADA: o último passo do fluxo (`Emendar a proxima
   rodada`) chama a ponte assim que a rodada fecha, e a seguinte sobe em segundos. As
   travas são duas, e só elas: emenda se ainda há perfil pela metade E se esta rodada
   trouxe post novo. Se não trouxe nada, o Instagram fechou para os endereços de agora e
   insistir é desperdício, então o horário marcado tenta mais tarde.

   CONFERIDO NO ACERVO em 25/08/2026: a rodada 314 subiu às 19:50 pela tela, e a 315
   subiu às 20:02, logo no fim dela, por emenda e não por horário. O relógio de trinta
   minutos é o PISO de quando ela volta se tudo parar, não o ritmo de trabalho.

   Enquanto a tela mostrava só o horário, a leitura óbvia era "vou esperar meia hora
   para minerar um perfil", que não é o que acontece. Aqui ela diz o que está valendo. */
let ESTEIRA_NO_AR = false;
const quandoAEsteiraVolta = () => ESTEIRA_NO_AR
  ? "a esteira está no ar agora"
  : `a esteira emenda ao fim de cada rodada, ou às ${proximaRodadaAs()} se parar`;

/* ------------------------------------------------------------- o que acontece AGORA

   Cada vaga da esteira deixa um bilhete de duzentos bytes com onde a varredura está
   naquele segundo: quantos posts já entraram, qual vaga escreveu, quando. A tela lê
   esses bilhetes de dez em dez segundos, e SÓ dos perfis que ainda têm página por ler.

   POR QUE NÃO LER O ARQUIVO DO PERFIL: ele tem o mesmo número e passa de 2 MB depois de
   algumas rodadas. Ninguém baixa isso de dez em dez segundos para ver um contador. */
const BATIMENTOS = new Map();

/* O BILHETE SÓ SUSTENTA "AGORA" ENQUANTO É FRESCO.

   Cada bilhete traz o carimbo de hora no campo `quando`, escrito pela esteira a cada
   página lida. Em 24/08/2026 a esteira falhou 26 rodadas seguidas no fiscal e a tela
   continuou dizendo "varrendo agora" em cima de bilhetes de horas atrás: afirmação de
   presente sustentada por evidência morta, que é a falha silenciosa mais cara deste
   sistema. A régua: bilhete com mais de cinco minutos não sustenta "minerando" nenhum.
   O número lido continua valendo, porque aconteceu de verdade; o que o bilhete velho
   perde é o direito de afirmar o presente. */
const VALIDADE_DO_BILHETE = 5 * 60;
const bilheteFresco = b =>
  !!b && (Date.now() / 1000 - (b.quando || 0)) < VALIDADE_DO_BILHETE;

async function ouvirBatimentos() {
  /* TODO CARD ATIVO TEM BILHETE DESDE O NASCIMENTO: a ponte grava um bilhete de
     andamento no aceite da conta (fase "aceito", zero lido) e o resgate tambem,
     entao perguntar "como esta'?" nunca leva 404. A idade do bilhete conta a
     verdade sozinha: fresco e' vida, velho e' espera, e o card diz qual dos dois.
     So' o card provisorio da fila (fontes sem ficha nenhuma) fica de fora. */
  const ativos = LIVRO.filter(c => !c.completo && !c.naFila);
  if (!ativos.length) return;
  await Promise.all(ativos.map(async c => {
    const b = await ler(`dados/andamento/${c.conta}.json`);
    if (b && b.conta) BATIMENTOS.set(c.conta, b);
  }));
  desenhaLivro();
  for (const cartao of document.querySelectorAll(".liv-cartao.aberto")) {
    const agora = cartao.querySelector(".liv-agora");
    const b = BATIMENTOS.get(cartao.dataset.conta);
    if (agora && b) agora.replaceWith(linhaDoAgora(b));
  }
}
setInterval(ouvirBatimentos, 10000);

/** A linha de "acontecendo agora", que só existe enquanto há o que ler. */
function linhaDoAgora(b) {
  const ln = document.createElement("div");
  ln.className = "liv-ev agora liv-agora";
  const pct = b.publicacoes ? Math.round(100 * b.lidos / b.publicacoes) : null;
  const quando = Math.round((Date.now() / 1000) - (b.quando || 0));
  ln.innerHTML = `<i></i><span class="oque"><b></b>`
    + `<span class="dados"><span><b>${num(b.lidos)}</b>${
        b.publicacoes ? ` de ${num(b.publicacoes)} ${rotuloDosFormatos(b)}`
                      : ` ${rotuloDosFormatos(b)}`}</span>`
    + (pct !== null ? `<span><b>${pct}%</b></span>` : "")
    + (b.vaga ? `<span>vaga <b>${b.vaga}</b></span>` : "")
    + `</span></span>`
    + `<span class="data">${quando < 90 ? "agora" : "há " + Math.round(quando / 60) + " min"}</span>`;
  // SILENCIO NAO E' PARADA, e a tela precisa dizer isso.
  //
  // As vagas se escalonam de 35 em 35 segundos e boa parte volta de mãos vazias, porque
  // o endereço daquela máquina já tinha sido usado. Com dois perfis dividindo as vinte
  // vagas, passam minutos entre uma página e outra. A linha dizia só "varrendo agora" e
  // a hora congelada logo ao lado, e a leitura óbvia era que tinha travado.
  const paradoHa = Math.round((Date.now() / 1000) - (b.quando || 0));
  // MAS SILÊNCIO LONGO TAMBÉM NÃO É TRABALHO. Passados cinco minutos sem bilhete novo,
  // a linha para de explicar o revezamento e diz a única coisa que pode provar: não há
  // sinal, e a última prova de vida tem hora marcada. O ponto sai do verde pulsante
  // junto, porque a bolinha piscando afirma vida tanto quanto o texto.
  const semSinal = !b.completo && !bilheteFresco(b);
  if (semSinal) ln.className = "liv-ev aviso liv-agora";
  ln.querySelector(".oque > b").textContent = b.completo
    ? "Leitura encerrada, aguardando o fechamento da rodada"
    : semSinal
      ? `Sem Sinal Da Esteira Há ${Math.max(1, Math.round(paradoHa / 60))} Min: `
        + `o último sinal gravado é das ${horaCurta(b.quando || 0)}. `
        // COM A RODADA NO AR, "sem sinal" É ESPERA DE VAGA, E NÃO ESTEIRA MORTA. As
        // vinte máquinas se revezam e a que pega endereço já usado volta sem página:
        // mandar esperar meia hora nessa hora é conselho errado, e assusta.
        + (ESTEIRA_NO_AR
            // RODIZIO E PAREDE NAO SAO A MESMA COISA, e a frase precisa saber qual das
            // duas esta' vendo. Rodizio e' UMA vaga vazia entre outras que leram; parede
            // e' todas vazias. Em 03/09/2026 dez vagas por rodada levaram 401 no mesmo
            // perfil e a tela chamava isso de revezamento, o que faz quem le' esperar
            // calmo por uma coisa que nao vai acontecer. O livro ja' guarda o numero.
            ? (recusaSeguida(b) ? recusaSeguida(b)
               : "A rodada está no ar agora: as vagas se revezam, e a que volta sem "
                 + "página é endereço já usado.")
            : `A esteira emenda ao fim de cada rodada, ou às ${proximaRodadaAs()} se parar`)
      : paradoHa > 90
        ? `Varredura em curso: última página há ${Math.round(paradoHa / 60)} min. `
          + "As vagas se revezam, e a que volta sem página é endereço já usado."
        : `Varrendo agora: a esteira está buscando ${rotuloDosFormatos(b)} deste perfil`;
  return ln;
}

/* -------------------------------------------------- o cabeçalho do bloco ao vivo

   ELE SÓ AFIRMA O QUE PODE PROVAR.

   Esta linha já disse "varrendo" toda vez que havia uma corrida aberta no GitHub. Só
   que a rodada abre com uma máquina que apenas CONFERE se há trabalho e fecha com outra
   que carimba a hora: com os perfis todos em dia, a tela anunciava leitura sem ninguém
   ter tocado no Instagram. Parecer que relê o que já foi lido é o pior defeito que este
   sistema pode ter, e ele custa a confiança de quem olha mesmo quando é só aparência.

   Agora a leitura é afirmada por uma coisa só: existe ELO EM ANDAMENTO neste momento.
   Conferir e fechar têm nome próprio na tela, porque é isso que eles são.

   Sem resposta da ponte, o cabeçalho fica com o texto que já estava. Chute nenhum. */
const ANDANDO = new Set(["in_progress", "queued", "waiting", "pending", "requested"]);

async function aoVivo() {
  // OS BILHETES PRIMEIRO, A CORRIDA DO GITHUB DEPOIS.
  //
  // O bilhete é escrito pela máquina que está lendo, a cada página: é prova do
  // trabalho. O estado da corrida é indício, e indício erra. Numa rodada disparada
  // enquanto outra ainda trabalhava, a ponte devolveu a corrida NOVA, que estava na
  // fila e sem máquina nenhuma, e a tela anunciou "rodada concluída, nada a ler" com o
  // cartão logo abaixo dizendo "varrendo agora, 24 de 2.252". Duas frases contrárias na
  // mesma tela, e a errada era a de cima.
  await ouvirBatimentos();
  // A JANELA É A MESMA RÉGUA DO CARD, cinco minutos. Já foi dez, e a diferença criava
  // a contradição de sempre em roupa nova: o card dizia "sem sinal há 6 min" e o
  // cabeçalho, com o MESMO bilhete velho, anunciava "uma máquina buscando reels".
  // Duas frases contrárias na mesma tela, uma régua só resolve. E declarar morte cedo
  // demais não acontece: sem bilhete fresco, o ramo seguinte ainda afirma leitura
  // pelos elos em andamento no GitHub, que é evidência viva de outra fonte.
  const segundos = Date.now() / 1000;
  const batendo = [...BATIMENTOS.values()]
    .filter(b => !b.completo && (segundos - (b.quando || 0)) < VALIDADE_DO_BILHETE);

  let d = null;
  try {
    const r = await fetch(`${PONTE}/andamento?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) d = await r.json();
  } catch (e) { /* sem sinal agora: o relógio tenta de novo em quinze segundos */ }

  if (d && !d.erro) {
    // QUEM SABE SE A ESTEIRA ESTÁ NO AR É ESTA RESPOSTA, e ela vem pela ponte, que
    // pergunta ao GitHub na hora. Duas partes da tela dependem disso: o texto que fala
    // da próxima rodada (dizer só o horário fixo com a esteira trabalhando é assustar
    // à toa) e a leitura do bilhete, que precisa vir fresca enquanto há quem o escreva.
    // Sem resposta, o valor anterior fica: silêncio da ponte não é prova de esteira
    // parada, e trocar um pelo outro é a mentira que este arquivo inteiro combate.
    ESTEIRA_NO_AR = !!d.rodando;
    const elos = Array.isArray(d.elos) ? d.elos : [];
    const emPe = e => ANDANDO.has(e.situacao);
    const lendo = elos.filter(e => /^elo/.test(e.nome || "") && emPe(e));
    const conferindo = elos.some(e => e.nome === "conferir" && emPe(e));
    const fechando = elos.some(e => e.nome === "fechar" && emPe(e));
    const rodada = d.numero ? `rodada ${d.numero}` : "";

    let titulo = "Esteira parada", resumo = "Nenhuma rodada em andamento.";
    let selo = "parada", viva = false, desde = null;

    // NINGUÉM ESTÁ LENDO ENQUANTO NÃO SE SABE QUEM É O PERFIL, e a tela precisa dizer
    // isso com todas as letras. Aqui aparecia "19 máquinas lendo ao mesmo tempo" com
    // zero posts entrando, porque as vinte máquinas realmente sobem: elas é que não
    // conseguem descobrir o identificador do perfil, levam 429 e desligam. Anunciar
    // leitura nesse momento é a tela contando uma coisa e o Instagram fazendo outra.
    const esperando = LIVRO.filter(c => c.aguardando);
    const nenhumPronto = esperando.length && esperando.length === LIVRO.length;

    if (batendo.length) {
      viva = true; selo = "ao vivo";
      const alvoDoTexto = rotuloDosFormatos(batendo[0]);
      titulo = (batendo.length === 1 ? "Uma máquina" : `${batendo.length} máquinas`)
        + (filtrando() || (batendo[0] && batendo[0].rotulo
                           && batendo[0].rotulo !== "publicações")
            ? ` buscando ${alvoDoTexto}` : " lendo o Instagram");
      resumo = batendo.map(b => {
        const nome = rotuloDosFormatos(b);
        return `@${b.conta}: ${num(b.lidos)}`
          + (b.publicacoes ? ` de ${num(b.publicacoes)} ${nome}` : ` ${nome}`);
      }).join(" · ");
      desde = lendo.map(e => e.inicio).filter(Boolean).sort()[0];
    } else if (nenhumPronto) {
      viva = true; selo = "identificando";
      titulo = esperando.length === 1 ? "Abrindo o perfil pelo arroba"
                                      : `Abrindo ${esperando.length} perfis pelo arroba`;
      resumo = "A primeira chamada traz o identificador e os doze primeiros posts de "
        + "uma vez. Cada vaga da esteira abre um perfil.";
    } else if (lendo.length && LIVRO.some(c => {
      // O BILHETE MANDA TAMBÉM AQUI. A capa do livro só é reescrita quando a rodada
      // fecha, então um perfil que acabou de terminar continua marcado como pendente
      // por mais alguns minutos, e a tela anunciava "onze máquinas lendo" com a
      // varredura encerrada.
      const b = BATIMENTOS.get(c.conta);
      return b ? !b.completo : !c.completo;
    })) {
      // A RESSALVA IMPORTA: as vinte máquinas sobem e ficam no ar até o fim da rodada,
      // mesmo quando já não há o que ler. Sem esta condição a tela anunciava leitura com
      // todos os perfis fechados, que é a mesma mentira de sempre em roupa nova.
      viva = true; selo = "ao vivo";
      titulo = lendo.length === 1 ? "Uma máquina lendo o Instagram"
                                  : `${lendo.length} máquinas lendo ao mesmo tempo`;
      resumo = "Cada uma lê uma página de doze posts e passa a vez"
             + (rodada ? `, ${rodada}.` : ".");
      desde = lendo.map(e => e.inicio).filter(Boolean).sort()[0];
    } else if (conferindo) {
      viva = true; selo = "conferindo";
      titulo = "Conferindo se há página por ler";
      resumo = "Uma máquina só. As outras vinte não sobem se estiver tudo em dia.";
    } else if (fechando) {
      viva = true; selo = "fechando";
      titulo = "Fechando a rodada";
      resumo = "Aplicando a régua, separando os links e carimbando o registro.";
    } else if (LIVRO.length && LIVRO.every(c => {
      const b = BATIMENTOS.get(c.conta);
      return b ? b.completo : c.completo;
    })) {
      titulo = LIVRO.length === 1 ? "Perfil varrido, nada pendente"
                                  : `${LIVRO.length} perfis varridos, nada pendente`;
      resumo = "A esteira só volta a trabalhar quando entrar perfil novo.";
    } else if (d.rodando) {
      // CORRIDA ABERTA SEM MÁQUINA NENHUMA é fila, e não conclusão. O GitHub segura uma
      // rodada enquanto a anterior trabalha, de propósito, para as duas não gravarem por
      // cima uma da outra. Sem este ramo, essa espera era anunciada como rodada pronta.
      viva = true; selo = "na fila";
      titulo = `Rodada ${d.numero} esperando a vez`;
      resumo = "A anterior ainda está no ar, e duas não gravam ao mesmo tempo.";
    } else if (!LIVRO.length) {
      // BANCO VAZIO FALA DO VAZIO. Sem isto, a tela zerada abria anunciando a última
      // rodada que existiu, com as vinte máquinas dela: número grande de trabalho antigo
      // em cima de um banco sem um perfil sequer, que é a leitura errada mais fácil de
      // fazer nesta tela.
      titulo = "Nenhum perfil no banco";
      resumo = "Escreva as contas no campo acima e aperte Iniciar.";
    } else if (d.numero) {
      // SKIPPED É A PORTA TENDO FUNCIONADO, e não falha: quando não há o que ler, as
      // vinte vagas são puladas de propósito. Dizer isso com todas as letras.
      const subiram = elos.filter(e => /^elo/.test(e.nome || "")
                                    && e.situacao !== "skipped").length;
      titulo = d.resultado === "failure" ? `Rodada ${d.numero} terminou com falha`
                                         : `Rodada ${d.numero} concluída`;
      resumo = subiram
        ? `${subiram} ${subiram === 1 ? "máquina leu" : "máquinas leram"} nesta rodada.`
        : "Nada a ler: todos os perfis estavam em dia.";
    }

    $("vivo_titulo").textContent = titulo;
    $("vivo_resumo").textContent = resumo;
    const corrido = desde ? Math.round((Date.now() - new Date(desde).getTime()) / 60000) : 0;
    $("vivo_quando").innerHTML = `<span class="kon-vivo${viva ? " ativa" : ""}"><i></i>`
      + selo + (corrido > 0 ? ` · ${corrido} min` : "") + "</span>";
  }
}

/* ------------------------------------------ A INSISTÊNCIA PELA IDENTIFICAÇÃO

   POR QUE ISTO PRECISA EXISTIR, com o que foi medido em 17/08/2026:

     - do GitHub, o Instagram devolve 429 nas DUAS vias. Está no log da rodada 67:
       "identificacao via 1 recusou (429)", idem via 2, nas vinte máquinas. Quer dizer
       que a esteira NÃO identifica perfil nenhum, por mais vagas que tenha;
     - da ponte, ele responde, mas não sempre: quatro chamadas seguidas ao mesmo perfil
       deram três recusas e um acerto.

   Junte os dois e aparece o beco: se as quatro tentativas do Iniciar caírem todas no
   lado ruim do rodízio, ninguém mais tenta, e o perfil fica parado na fila para sempre
   sem nada acontecer. Foi exatamente isso que apareceu como "adicionei e não deu nada".

   Então quem insiste é a tela, de quarenta e cinco em quarenta e cinco segundos,
   enquanto houver perfil sem identificação. Não é elegante; é o que funciona com o
   material que existe. Cada tentativa aparece no cartão, com o número dela.

   TRÊS FREIOS, porque cada tentativa deixa duas gravações no acervo:
     1. teto de vinte e cinco tentativas por perfil, e depois disso ele espera o Iniciar;
     2. uma de cada vez, sem empilhar chamada em cima de chamada;
     3. só enquanto existir perfil sem identificação, que é o único caso que precisa. */
const TENTATIVAS = new Map();
const ULTIMA_TENTATIVA = new Map();
// TRÊS, E NÃO VINTE E CINCO. Este laço já foi a única saída para um perfil travado, e
// por isso insistia muito. Não é mais: quem abre o perfil é a esteira, pelo arroba, e
// ela passa sempre. O que a ponte ainda acrescenta é o total de publicações e o retrato,
// que o caminho do arroba não traz. Isso é enfeite, e enfeite não justifica gravar no
// acervo de quarenta em quarenta segundos, ainda mais com dez perfis de uma vez.
const TETO_TENTATIVAS = 3;
let insistindo = false;
// RÁPIDO NO COMEÇO, e não a cada quarenta e cinco segundos desde a primeira. Com uma
// espera fixa, o perfil recém-adicionado ficava quase um minuto marcando "tentativa 0",
// que é a tela dizendo que não está fazendo nada. As cinco primeiras saem de oito em
// oito segundos, e só depois o intervalo abre.
const ESPERA_CURTA = 8000, ESPERA_LONGA = 40000, TENTATIVAS_RAPIDAS = 1;

async function insistirIdentificacao() {
  // SEM EXIGIR A ABA À VISTA. A trava de visibilidade parecia prudente e era um tiro no
  // pé: o normal é deixar esta tela aberta numa aba de fundo e ir fazer outra coisa, que
  // é justamente quando o perfil precisa ser identificado sozinho. Quem limita o gasto é
  // o teto de tentativas, que já basta: vinte e cinco chamadas e acabou.
  if (insistindo) return;
  // CARTÃO DO CLIQUE NÃO ENTRA AQUI. Ele existe para preencher os segundos em que a
  // resposta ainda está no ar; insistir sobre ele seria pedir a mesma identificação
  // duas vezes ao mesmo tempo. Quem manda nesta lista é a leitura de verdade.
  const alvos = LIVRO.filter(c => c.aguardando && !c.local).map(c => c.conta)
    .filter(c => (TENTATIVAS.get(c) || 0) < TETO_TENTATIVAS);
  if (!alvos.length) return;

  insistindo = true;
  try {
    for (const c of alvos) {
      TENTATIVAS.set(c, (TENTATIVAS.get(c) || 0) + 1);
      ULTIMA_TENTATIVA.set(c, Date.now());
    }
    desenhaLivro();
    const d = await mandarContas(alvos);
    const passaram = (d.novos || []).filter(n => n.ok);
    if (passaram.length) {
      // o perfil nasceu: a esteira tem o que ler, e o cartão tem o que mostrar
      HISTORICOS.clear();
      await mandar("/varrer").catch(() => {});
      await atualizar();
    } else {
      desenhaLivro();
    }
  } catch (e) { /* a ponte não respondeu agora; o relógio seguinte tenta */ }
  insistindo = false;
  marcarProximaTentativa();
}

/** Marca a próxima tentativa, curta no começo e longa depois. */
let relogioDaInsistencia = null;
function marcarProximaTentativa() {
  clearTimeout(relogioDaInsistencia);
  const esperando = LIVRO.filter(c => c.aguardando && !c.local);
  if (!esperando.length) return;
  const voltas = Math.max(...esperando.map(c => TENTATIVAS.get(c.conta) || 0));
  if (voltas >= TETO_TENTATIVAS) return;
  relogioDaInsistencia = setTimeout(insistirIdentificacao,
    voltas < TENTATIVAS_RAPIDAS ? ESPERA_CURTA : ESPERA_LONGA);
}

function livroFiltrado() {
  const q = ($("liv_q").value || "").trim().toLowerCase();
  return LIVRO.filter(c => {
    if (q && !((c.conta || "") + " " + (c.nome || "")).toLowerCase().includes(q))
      return false;
    // "Recusados" e' um GRUPO, e nao um tipo: os tres ramos em que o Instagram diz
    // nao sao a mesma pergunta para quem olha.
    if (livroTipo === "recusados") {
      if (!RECUSAS.has(c.ultimo_tipo)) return false;
    } else if (livroTipo && c.ultimo_tipo !== livroTipo) return false;
    if (livroDesde && c.ultimo < livroDesde) return false;
    return true;
  });
}

function desenhaLivro() {
  const fila = livroFiltrado();
  const pedaco = fila.slice(0, livroMostra);

  $("liv_vazio").hidden = fila.length > 0;
  $("liv_mais").hidden = fila.length <= livroMostra;
  $("liv_mais").textContent = `Ver Mais ${Math.min(POR_LEVA, fila.length - livroMostra)}`;
  $("exp_tela").textContent = `${fila.length} de ${LIVRO.length} perfis`;

  const html = pedaco.map(bruto => {
    // O BILHETE MANDA quando ele é mais novo que a capa do livro. A capa é escrita no
    // fim da rodada; o bilhete, a cada página. Um perfil entrando agora tem capa dizendo
    // zero e bilhete dizendo cento e trinta e dois.
    const b = BATIMENTOS.get(bruto.conta);
    // "VIVO" SÓ COM BILHETE FRESCO. O número lido continua valendo, porque aconteceu;
    // a afirmação de presente é que exige carimbo de hora dentro do prazo. Bilhete
    // velho rebaixa o card para "sem sinal", com a hora do último sinal, em vez de um
    // "varrendo agora" que ninguém pode provar.
    const c = b && b.quando > (bruto.ultimo || 0)
      ? { ...bruto, lidos: b.lidos, publicacoes: b.publicacoes || bruto.publicacoes,
          modo: b.modo, completo: b.completo, ultimo: b.quando,
          vivo: !b.completo && bilheteFresco(b),
          semSinal: !b.completo && !bilheteFresco(b) ? (b.quando || 0) : 0 }
      : bruto;
    const grave = c.falhas ? "falha" : c.avisos ? "aviso" : "";
    // O TOTAL DE PUBLICAÇÕES É OPCIONAL. O caminho que abre o perfil (o feed pedido
    // pelo arroba) não informa quantas publicações a conta tem, e isso não atrapalha
    // varrer: sem o total, mostra-se o que foi lido, sem fração inventada.
    const nome = rotuloDosFormatos(b, bruto);
    // POR FORMATO, O TOTAL DE PUBLICAÇÕES NÃO É O TOTAL DAQUELE FORMATO. O
    // @leisdamentemilionaria tem 398 publicações, mas isso soma posts e carrosséis; o
    // Instagram não diz quantos REELS o perfil tem. Mostrar "132 de 398 reels (33%)" é a
    // conta errada que assusta, ainda por cima com o mesmo card dizendo "398 publicações"
    // no evento logo abaixo. Só se conta contra o total quando se varre TUDO
    // ("publicações"); filtrando formato, mostra-se o lido daquele formato, sem
    // denominador nem porcentagem, que seriam contra o total errado.
    const contraOTotal = nome === "publicações" && !!c.publicacoes;
    // A esteira para ao ATINGIR o alvo, e a última página costuma passar dele: pedir
    // duzentos e trazer duzentos e quatro é o normal. Mostrar "102%" faz parecer conta
    // errada, então a porcentagem só existe no caminho contra o total.
    const cob = contraOTotal ? Math.round(100 * c.lidos / c.publicacoes) : null;
    const quanto = !c.lidos
      // sem número nenhum: conta fechada, sem publicação, ou ainda nada varrido.
      ? (c.ultimo_tipo === "vazio" ? "sem publicação pública"
         : c.completo ? "nada a varrer" : "")
      : !contraOTotal
        // por formato (ou sem total conhecido): só o que foi lido daquele formato.
        ? `${num(c.lidos)} ${nome}${c.completo ? `, acabaram os ${nome} do perfil` : " lidos"}`
      // VARREDURA ENCERRADA NÃO MOSTRA PORCENTAGEM DE MEIO CAMINHO: um perfil que fecha
      // em 53% do alvo só acabou os reels dele, não parou no meio.
      : c.completo
        ? (cob >= 100 ? `${num(c.lidos)} ${nome}, alvo de ${num(c.publicacoes)} cumprido`
                      : `${num(c.lidos)} ${nome}, acabaram os ${nome} do perfil`)
      : `${num(c.lidos)} de ${num(c.publicacoes)} ${nome} (${cob}%)`;
    // A MARCA DE ABERTO NASCE JUNTO COM O CARTÃO.
    // Aplicá-la depois, no laço lá de baixo, fazia o cartão nascer fechado e abrir no
    // quadro seguinte: de dez em dez segundos ele piscava na cara de quem estava lendo.
    const jaAberto = ABERTOS.has(c.conta);
    return `<div class="liv-cartao ${grave}${jaAberto ? " aberto" : ""}" data-conta="${c.conta}">
      <button class="liv-cabeca" type="button" aria-expanded="${jaAberto}">
        <span class="liv-ponto"></span>
        <span class="liv-id">
          <span class="liv-nome"><b>${c.nome
            || (c.aguardando ? "Perfil ainda não identificado" : "sem nome no perfil")}</b>
            <span class="liv-etq">${
              // O CARD PROVISÓRIO TEM NOME DE FILA, e não de identificação: conta que
              // só existe na lista de origem ainda não foi tocada pela esteira, e o
              // rótulo diz exatamente em que degrau ela está.
              c.aguardando ? "Na Fila, Esperando A Esteira"
              : etiquetaDoPerfil(c)}</span></span>
          <span class="liv-sub">@${c.conta} · ${
            c.vivo ? '<b class="liv-vivo">varrendo agora</b>'
            // SEM SINAL NOVO NO PRAZO, o card rebaixa a afirmação sozinho: diz há
            // quanto tempo a esteira calou e a hora datada do último sinal.
            : c.semSinal
              ? `Sem Sinal Da Esteira Há ${
                  Math.max(1, Math.round((Date.now() / 1000 - c.semSinal) / 60))
                } Min · último sinal às ${horaCurta(c.semSinal)} · ${quandoAEsteiraVolta()}`
            // O CARD DA FILA DIZ AS DUAS PONTAS DO TEMPO: quando a conta entrou (a hora
            // gravada no fontes.json) e quando a esteira acorda de novo. Sem prazo,
            // "esperando" é o mesmo silêncio que escondeu a esteira parada por 24 horas.
            : c.naFila
              ? `na fila desde ${horaCurta(c.naFila)} · ${quandoAEsteiraVolta()}`
            // sem marca de tempo nenhuma, "há" quanto tempo daria meio século
            : c.ultimo ? haQuanto(c.ultimo)
            : "esperando a esteira abrir"}${
            quanto ? ` · ${quanto}` : ""} · ${
            c.eventos} ${c.eventos === 1 ? "registro" : "registros"}</span>
        </span>
        <svg class="liv-seta" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="liv-corpo"><div class="liv-caixa">carregando</div></div>
    </div>`;
  }).join("");

  // DESENHO IGUAL NÃO SE REDESENHA.
  //
  // Esta lista é reconstruída a cada dez segundos pelo relógio dos bilhetes. Quando nada
  // mudou, trocar o HTML por outro idêntico destrói e recria os elementos à toa: o
  // cartão aberto fecha e reabre, o texto que estava sendo lido salta, e a rolagem
  // pula. Comparar antes custa nada e resolve o piscar na raiz.
  const lista = $("liv_lista");
  if (lista.dataset.desenho === html) return;
  lista.dataset.desenho = html;
  lista.innerHTML = html;

  // o conteúdo dos abertos é repintado; a marca de aberto já veio no HTML
  for (const cartao of lista.querySelectorAll(".liv-cartao.aberto")) abrirCartao(cartao);
}

/** Junta os eventos de todos os perfis e alimenta as três medidas do topo.
 *
 * Busca o histórico de cada um, o que é uma requisição por perfil. Isso é barato
 * porque cada arquivo é pequeno e fica guardado depois da primeira vez: abrir um
 * cartão em seguida não custa nada. */
async function medirLivro() {
  const todos = [];
  for (const c of LIVRO) todos.push(...await historicoDe(c.conta));
  medir(todos);
}

/** O histórico de um perfil, buscado só quando o cartão abre. */
async function historicoDe(conta) {
  // VAZIO NÃO SE GUARDA.
  //
  // Este era o defeito que fazia o cartão dizer "1 registro" no cabeçalho e "nada
  // registrado" ao abrir: nos primeiros segundos de um perfil novo a ficha ainda não
  // existe no acervo, a busca voltava vazia, e a resposta vazia ficava guardada para
  // sempre. A ficha nascia meio minuto depois e ninguém mais ia olhar.
  const guardado = HISTORICOS.get(conta);
  if (guardado && guardado.length) return guardado;
  const d = await ler(`dados/atividade/${conta}.json`);
  const ev = (d && d.eventos) || [];
  if (ev.length) HISTORICOS.set(conta, ev);
  return ev;
}

/** Pinta o histórico dentro da caixa do cartão.
 *
 * O texto de cada evento entra como TEXTO, e não como marcação: ele vem do acervo, e
 * conteúdo de arquivo montado dentro de HTML é como se abre buraco numa tela.
 * Do mais novo para o mais antigo, que é como se lê histórico. */
function pintarEventos(caixa, eventos) {
  caixa.innerHTML = "";
  if (!eventos.length) {
    caixa.innerHTML = '<div class="liv-ev"><i></i><span class="oque">'
      + "<b>Nada registrado para este perfil ainda.</b></span></div>";
    return;
  }
  for (const e of [...eventos].reverse()) {
    const d = e.detalhe || {};
    const dados = [];
    if (d.maquinas) dados.push(`<b>${d.maquinas}</b> máquinas`);
    if (d.gravacoes) dados.push(`<b>${num(d.gravacoes)}</b> páginas`);
    if (d.novos) dados.push(`<b>+${num(d.novos)}</b> novos`);
    if (d.total) dados.push(`total <b>${num(d.total)}</b>`);
    if (d.rodada) dados.push(`rodada <b>${d.rodada}</b>`);
    if (d.seguidores) dados.push(`<b>${num(d.seguidores)}</b> seguidores`);
    if (d.origem) dados.push(`<em>${d.origem}</em>`);

    const ln = document.createElement("div");
    ln.className = "liv-ev " + pesoDe(e);
    // CADA DADO NUM ELEMENTO PRÓPRIO. Juntos numa string só, o respiro do arranjo não
    // tinha onde pegar e saía "3 páginastotal 281histórico", tudo grudado.
    ln.innerHTML = `<i></i><span class="oque"><b></b>`
      + (dados.length
          ? `<span class="dados">${dados.map(x => `<span>${x}</span>`).join("")}</span>`
          : "")
      + `</span><span class="data">${dataHora(e.quando)}</span>`;
    ln.querySelector(".oque > b").textContent = e.texto;
    caixa.appendChild(ln);

    // AS PÁGINAS DAQUELA RODADA, uma linha cada, com a hora e a máquina que gravou.
    // É o nível que faltava: o resumo dizia "4 máquinas, 8 páginas" e parava aí, sem
    // mostrar o trabalho. Cada linha destas é um commit real no acervo.
    for (const passo of [...(d.passos || [])].reverse()) {
      const sub = document.createElement("div");
      sub.className = "liv-ev passo";
      sub.innerHTML = `<i></i><span class="oque"><b></b></span>`
        + `<span class="data">${dataHora(passo.quando)}</span>`;
      sub.querySelector(".oque > b").textContent =
        "página lida e gravada pela " + (passo.maquina || "esteira");
      caixa.appendChild(sub);
    }
  }
}

/* O OUVINTE E' DA LISTA DE PERFIS, E NAO DA PAGINA INTEIRA.
   O registro do lote, na aba de Baixar, usa o mesmo molde de cartao: sem o endereco da
   lista aqui, clicar num lote caia neste ouvinte, que ia buscar o historico de um perfil
   chamado `undefined` e escrevia "nada registrado para este perfil" dentro do cartao do
   lote. Dois donos para o mesmo clique. */
document.addEventListener("click", ev => {
  const cabeca = ev.target.closest("#liv_lista .liv-cabeca");
  if (!cabeca) return;
  const cartao = cabeca.closest(".liv-cartao");
  const conta = cartao.dataset.conta;
  if (ABERTOS.has(conta)) { ABERTOS.delete(conta); fecharCartao(cartao); }
  else { ABERTOS.add(conta); abrirCartao(cartao); }
});

function fecharCartao(cartao) {
  cartao.classList.remove("aberto");
  cartao.querySelector(".liv-cabeca").setAttribute("aria-expanded", "false");
}

async function abrirCartao(cartao) {
  cartao.classList.add("aberto");
  cartao.querySelector(".liv-cabeca").setAttribute("aria-expanded", "true");
  const caixa = cartao.querySelector(".liv-caixa");
  const conta = cartao.dataset.conta;
  // "buscando" só quando realmente vai buscar: com o histórico já na mão, essa linha
  // piscava a cada repintura e dava a impressão de que o cartão estava recarregando.
  const guardado = HISTORICOS.get(conta);
  if (!guardado) caixa.textContent = "buscando o histórico";
  const eventos = await historicoDe(conta);
  const ficha = LIVRO.find(c => c.conta === conta);

  // CARTÃO SEM HISTÓRICO EXPLICA A ESPERA, em vez de dizer "nada registrado". Perfil
  // que a ponte não conseguiu identificar cai exatamente aqui, e o vazio dele não é
  // ausência de trabalho: é trabalho em curso, do lado da esteira.
  if (ficha && ficha.aguardando && !eventos.length) explicarEspera(caixa);
  // O RESUMO DIZ QUE HÁ REGISTROS, MAS A LEITURA DO LOG NÃO VOLTOU: não minta "nada
  // registrado" nem deixe o cartão girando calado. Diz que não carregou e que tenta
  // sozinho, porque a lista se repinta a cada dez segundos e a próxima volta costuma
  // trazer. É o par do corte de tempo da fonte: juntos, o log nunca fica mudo para sempre.
  else if (!eventos.length && ficha && ficha.eventos > 0)
    caixa.innerHTML = '<div class="liv-ev aviso"><i></i><span class="oque">'
      + '<b>Não consegui carregar o log agora. Tento de novo em instantes.</b>'
      + "</span></div>";
  else pintarEventos(caixa, eventos);

  const b = BATIMENTOS.get(conta);
  if (b && !b.completo) caixa.prepend(linhaDoAgora(b));
}

/** O que está acontecendo com um perfil que entrou na lista e ainda não tem ficha. */
function explicarEspera(caixa) {
  const linhas = [
    ["Perfil na lista de origem",
     "Ele já está gravado no acervo e não se perde ao fechar a tela."],
    ["A esteira vai abri-lo pelo arroba",
     "A primeira chamada descobre quem é o perfil e já traz os doze primeiros posts, "
     + "sem depender da consulta de identificação que o Instagram recusa."],
    ["Falta a esteira chegar neste perfil",
     "Ela acorda a cada rodada e atende um perfil por vaga. Assim que abrir este, o "
     + "nome e a contagem aparecem neste cartão sozinhos."],
  ];
  caixa.innerHTML = "";
  for (const [titulo, texto] of linhas) {
    const ln = document.createElement("div");
    ln.className = "liv-ev";
    ln.innerHTML = '<i></i><span class="oque"><b></b><span class="dados"></span></span>';
    ln.querySelector(".oque > b").textContent = titulo;
    ln.querySelector(".dados").textContent = texto;
    caixa.appendChild(ln);
  }
}

$("liv_q").addEventListener("input", () => { livroMostra = POR_LEVA; desenhaLivro(); });
$("liv_mais").onclick = () => { livroMostra += POR_LEVA; desenhaLivro(); };

window.montarSelect("liv-tipo", [
  { v: "", r: "Toda A Atividade" },
  { v: "varredura", r: "Em Varredura" },
  { v: "limite", r: "Fechados No Limite" },
  { v: "concluido", r: "Concluídos" },
  // O ROTULO DIZ O QUE O PROPRIO CODIGO DIZ NAO SER FALHA: `sem_avanco` e' AVISO na
  // tabela de gravidade ("varias vagas caem no mesmo perfil e as ultimas voltam
  // vazias, que e' o rodizio funcionando").
  { v: "sem_avanco", r: "Sem Avanço Na Última" },
  // E A PERGUNTA QUE ELE FAZ olhando esta tela e' "quem esta' preso?". Nenhuma das
  // seis opcoes respondia: os tres tipos de recusa (`sem_leitura`, `falha_abertura`
  // e `estouro`) nao estavam na lista, entao os dois perfis travados dele nao
  // apareciam em filtro nenhum, em 03/09/2026.
  { v: "recusados", r: "Recusados Pelo Instagram" },
  { v: "sem_leitura", r: "Sem Página Na Última" },
  { v: "falha_abertura", r: "Não Abriram Pelo Arroba" },
  { v: "identificado", r: "Só Identificados" },
], "", v => { livroTipo = v; livroMostra = POR_LEVA; desenhaLivro(); });

window.montarSelect("liv-quando", [
  { v: "0", r: "Desde O Começo" },
  { v: "1", r: "Últimas 24 Horas" },
  { v: "7", r: "Últimos 7 Dias" },
  { v: "30", r: "Últimos 30 Dias" },
  { v: "90", r: "Últimos 90 Dias" },
], "0", v => {
  const dias = parseInt(v, 10) || 0;
  livroDesde = dias ? Math.floor(Date.now() / 1000) - dias * 86400 : 0;
  livroMostra = POR_LEVA;
  desenhaLivro();
});

/* ------------------------------------------------------------------ a exportação
   Planilha, e não arquivo de programa: ele abre no Excel com dois cliques. O ponto e
   vírgula é o separador que o Excel em português entende sem perguntar nada, e o BOM
   na frente é o que faz o acento aparecer certo lá dentro. */
$("liv_exportar").onclick = () => { $("liv_folha").hidden = false; };
// as datas só aparecem quando a opção de período é a escolhida
document.querySelectorAll('input[name="exp"]').forEach(r => r.addEventListener("change",
  () => $("exp_datas").classList.toggle("aberto", r.value === "periodo" && r.checked)));
$("exp_cancelar").onclick = () => { $("liv_folha").hidden = true; };
$("liv_folha").addEventListener("click", ev => {
  if (ev.target === $("liv_folha")) $("liv_folha").hidden = true;
});

$("exp_baixar").onclick = async () => {
  const modo = document.querySelector('input[name="exp"]:checked').value;
  const botao = $("exp_baixar");
  botao.disabled = true;
  botao.textContent = "montando";

  let contas = modo === "tela" ? livroFiltrado() : LIVRO;
  let de = 0, ate = Infinity;
  if (modo === "periodo") {
    if ($("exp_de").value) de = new Date($("exp_de").value + "T00:00").getTime() / 1000;
    if ($("exp_ate").value) ate = new Date($("exp_ate").value + "T23:59").getTime() / 1000;
  }

  const linhas = [["perfil", "nome", "quando", "tipo", "gravidade", "descrição",
                   "máquinas", "páginas", "posts novos", "total lido", "rodada"]];
  for (const c of contas) {
    for (const e of await historicoDe(c.conta)) {
      if (e.quando < de || e.quando > ate) continue;
      const d = e.detalhe || {};
      linhas.push([c.conta, c.nome || "", dataHora(e.quando), TIPOS[e.tipo] || e.tipo,
                   pesoDe(e), e.texto, d.maquinas || "", d.gravacoes || "",
                   d.novos || "", d.total || "", d.rodada || ""]);
    }
  }

  const csv = linhas.map(l => l.map(v =>
    `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const arquivo = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(arquivo);
  // O DIA DAQUI TAMBEM NO NOME DO ARQUIVO, senao o que ele salva as 22h leva a data de
  // amanha e a pasta de downloads fica com duas datas para o mesmo dia de trabalho.
  a.download = `atividade-estudio-${hojeAqui()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);

  botao.disabled = false;
  botao.textContent = "Baixar Planilha";
  $("liv_folha").hidden = true;
};

/* ---------------------------------------------------------------- desenhos

   AQUI MORAVA `desenhaPerfis`, e ela era um defeito de verdade, não sobra inofensiva.
   Ela escrevia numa caixa `#perfis` que deixou de existir quando o avanço de cada
   perfil virou coluna da tabela de Minerados. Escrever em caixa que não existe é erro
   que INTERROMPE quem chamou: `atualizar()` morria ali, a cada 25 segundos, e as duas
   linhas seguintes nunca rodavam. Era por isso que a aba de Baixar dizia "nenhum perfil
   varrido ainda" com dois perfis varridos e mil e quinhentas peças acima da régua. */
/* ==================================================== O QUE HÁ PARA BAIXAR

   O TAMANHO DO LOTE É CONTADO, E NÃO DIGITADO.
   Aqui houve um campo de quantidade, e ele obrigava a decidir duas coisas para pedir
   uma: de quem e quantos. Agora a decisão é uma só. Os perfis são marcados na fileira,
   e a soma do que eles têm esperando é o lote.

   A FILEIRA MOSTRA O QUE FALTA, e não o acervo. Perfil cujo conteúdo já veio inteiro
   sai dela: é isso que faz a lista encolher a cada lote em vez de repetir para sempre
   os mesmos três cartões. */
function desenhaProntos(perfis) {
  const alvo = $("prontos");
  /* A FILEIRA DE BAIXAR FALA DE REELS, SEMPRE, e por isso ela nao usa o rotulo da regua.

     O numero que ela mostra e' `restam`, e o `selecionar.py` o calcula so' com
     `x["formato"] == "reels"` (trava 73d: carrossel tem conta propria porque quem o
     baixa e' a casa, e nao a esteira). Com a regua marcada em carrossel, a frase saia
     "40 carrosseis esperando" para um numero que nunca teve um carrossel dentro. */
  const nome = "reels";
  // O SALDO VEM DO SELETOR, mas a tela sabe se virar sem ele. `restam` nasceu hoje, e
  // o acervo so' passa a trazer o campo depois que o seletor rodar de novo: sem esta
  // saida, a fileira abriria vazia dizendo que tudo ja' foi baixado, que e' o contrario
  // da verdade.
  const saldoDe = p => (p.restam != null ? p.restam : (p.baixaveis || 0));
  const comSaldo = (perfis || []).filter(p => saldoDe(p) > 0);

  // AS OPÇÕES SAEM DO PRÓPRIO CONTEÚDO, que é a regra do sistema de origem: mercado ou
  // etiqueta que nenhum perfil tem não vira opção, porque só saberia devolver lista
  // vazia. Hoje nenhum perfil tem nenhum dos dois, e por isso os dois nascem apagados.
  const nichos = [...new Set(comSaldo.map(p => p.mercado).filter(Boolean))].sort();
  const etiquetas = [...new Set(comSaldo.flatMap(p => p.etiquetas || []))].sort();
  NICHOS_BX.length = 1;
  NICHOS_BX.push(...nichos.map(n => ({ v: n, r: n })));
  ETIQUETAS_BX.length = 0;
  ETIQUETAS_BX.push(...etiquetas.map(e => ({ v: e, r: e })));
  $("bx-nicho").parentElement.dataset.inerte = nichos.length ? "false" : "true";
  $("bx-etq").parentElement.dataset.inerte = etiquetas.length ? "false" : "true";
  const semRotulo = !nichos.length && !etiquetas.length;
  $("recado_filtros").hidden = !semRotulo;
  if (semRotulo) {
    $("recado_filtros").textContent = "Mercado e etiqueta ainda não são gravados na "
      + "mineração, então os dois filtros acima ficam apagados. Assim que um perfil "
      + "entrar com essa marcação, eles acendem sozinhos.";
  }

  const filtrados = comSaldo.filter(p =>
    (!bxNicho || p.mercado === bxNicho)
    && (!bxEtiquetas.length || (p.etiquetas || []).some(e => bxEtiquetas.includes(e))));

  // marcação de perfil que saiu da fileira não fica pendurada: o lote seria montado com
  // um perfil que ninguém está mais vendo.
  //
  // MAS LEITURA RUIM NAO APAGA ESCOLHA. Esta função roda a cada volta com o que a
  // leitura trouxe, e uma leitura que falha ou volta vazia trazia lista nenhuma: a
  // limpeza abaixo entendia "todo mundo saiu da fileira" e apagava a marcação que o
  // Gabriel tinha acabado de fazer, sozinha, sem ele encostar em nada. Sem perfil
  // nenhum na mão não há como saber quem saiu de verdade, então a escolha dele fica
  // como está; a volta seguinte, com a lista de verdade, é quem decide.
  if ((perfis || []).length) {
    const visiveis = new Set(filtrados.map(p => p.conta));
    for (const c of [...ESCOLHIDOS]) if (!visiveis.has(c)) ESCOLHIDOS.delete(c);
  }

  const html = filtrados.length
    ? filtrados.map(p => `<div class="fperfil${ESCOLHIDOS.has(p.conta) ? " marcado" : ""}"
         data-conta="${p.conta}" title="@${p.conta}">${CERTO_FILEIRA}${retrato(p)}
         <div class="fperfil-pe"><b>${num(saldoDe(p))}</b><span>${nome}</span></div>
       </div>`).join("")
    : `<div class="vazio">${comSaldo.length
        ? "Nenhum perfil com essa marcação."
        : !(perfis || []).length
          ? "Nenhum perfil varrido ainda."
          /* VAZIO TEM DOIS MOTIVOS, e eles não se confundem: ou tudo já desceu, ou nunca
             houve arquivo. Só reels têm arquivo de vídeo; imagem e carrossel passam da
             régua e não têm o que baixar. Dizer "já foi baixado" no segundo caso seria
             a tela inventando um lote que nunca existiu. */
          : (perfis.some(p => (p.baixaveis || 0) > 0)
              ? "Tudo o que passou da régua já foi baixado."
              : "Nenhum arquivo de vídeo à vista: só reels têm arquivo, e imagem e "
                + "carrossel entram na conta da régua sem ter o que baixar.")}</div>`;

  // desenho igual não se redesenha: reescrever a fileira a cada volta apagava o cartão
  // aberto sob o cursor e piscava a marcação.
  if (alvo.dataset.desenho !== html) {
    alvo.innerHTML = html;
    alvo.dataset.desenho = html;
  }
  // guardado ja com o saldo resolvido, para a contagem nao repetir a conta
  ULTIMOS_PRONTOS = filtrados.map(p => ({ ...p, restam: saldoDe(p) }));
  contarLote(ULTIMOS_PRONTOS, nome);
  /* O CARTÃO DO CARROSSEL LÊ DE `perfis`, E NÃO DE `comSaldo`. Perfil só de carrossel tem
     `baixaveis` zero de propósito (a conta de reels é da esteira, e carrossel não passa por
     ela), então filtrar pelo saldo esconderia justamente o caso que este cartão existe para
     resolver. */
  desenhaCarrossel(perfis);
}

/** A conta do lote: quantos perfis estão marcados e quanto eles somam. */
function contarLote(filtrados, nome) {
  const marcados = (filtrados || []).filter(p => ESCOLHIDOS.has(p.conta));
  const total = marcados.reduce((a, p) => a + (p.restam || 0), 0);
  const espera = (filtrados || []).reduce((a, p) => a + (p.restam || 0), 0);

  const b = $("lote_vai");
  b.disabled = !total;
  b.textContent = total ? `Montar leva de ${num(total)}` : "Montar leva";

  $("recado_baixar").textContent = espera
    ? `${num(espera)} ${nome} esperando, em ${filtrados.length} `
      + (filtrados.length === 1 ? "perfil" : "perfis")
    : "";
  if (Date.now() < travaDoRecado) return;
  $("recado_lote").textContent = !espera
    ? "Nada esperando. Cada leva que sai apaga daqui o que ela levou."
    : total
      ? `${num(total)} ${nome} de ${marcados.length} `
        + (marcados.length === 1 ? "perfil marcado" : "perfis marcados")
      : "Marque um perfil na fileira abaixo para montar a leva.";
}

/* A marcação da fileira. O ouvinte é da página, e não de cada cartão: a fileira é
   redesenhada, e ouvinte preso a um cartão morre junto com ele. */
document.addEventListener("click", ev => {
  const card = ev.target.closest("#prontos .fperfil");
  if (!card) return;
  const conta = card.dataset.conta;
  if (ESCOLHIDOS.has(conta)) ESCOLHIDOS.delete(conta);
  else ESCOLHIDOS.add(conta);
  card.classList.toggle("marcado", ESCOLHIDOS.has(conta));
  contarLote(ULTIMOS_PRONTOS, "reels");
});

/* ---------------------------------------------------------------- atualização */
let primeiraCarga = true;

async function atualizar() {
  // SÓ NA PRIMEIRA VEZ o sinal aparece. Das seguintes em diante a tela já tem números
  // na frente do Gabriel, e trocá-los por um sinal de carregamento de 25 em 25 segundos
  // seria pisca-pisca: quem já viu o dado não precisa ver que ele está sendo conferido.
  if (primeiraCarga) carregando("carga", "Buscando o acervo", "onda");

  const [estado, sel, fontes, retratos, livro, lotes, cat, saude] = await Promise.all([
    ler("dados/estado.json"), ler("dados/selecao.json"), ler("dados/fontes.json"),
    // arquivo à parte: o do perfil varrido passa de 1 MB e a via de leitura corta ali
    ler("dados/retratos.json"),
    // a capa do livro de atividade: só o resumo por perfil, o histórico vem ao abrir
    ler("dados/atividade/indice.json"),
    // a capa dos lotes: estado e contagem de cada um, sem os passos
    ler("dados/lotes/indice.json"),
    // as duas listas do sistema. Vêm só com os nomes: quantos perfis usam cada um é
    // conta que a própria tela faz, porque ela já tem todos os perfis na mão.
    ler("dados/catalogo.json"),
    // o veredito do fiscal sobre a última rodada: é ele que derruba o selo do topo
    ler("dados/saude.json")]);

  if (primeiraCarga) { parado("carga", ""); primeiraCarga = false; }
  if (cat) CATALOGO = cat;
  // O VEREDITO ENTRA ANTES DO SELO, porque o selo lê a saúde ao pintar. Arquivo
  // ausente vira nulo e nada muda: estado não se inventa, nem para o bem.
  SAUDE = saude;
  selar(estado);
  avisarSaude();

  // a seleção é quem calcula os números da tabela; o estado é a cópia dela
  const perfis = (sel && sel.perfis) || (estado && estado.perfis) || [];
  /* A REGUA VALENDO E' LIDA ANTES DOS NUMEROS, e nao seiscentas linhas abaixo deles.

     Lida depois, a PRIMEIRA pintura contava com a régua da volta anterior (nula, na
     carga), e o painel abria dizendo "406 carrosséis varridos" ao lado de um rótulo que
     já dizia "carrosséis": o número da régua velha embaixo do rótulo da régua nova. Só
     a volta seguinte, vinte e cinco segundos depois, se corrigia, e quem olha nesses
     vinte e cinco segundos vê a coisa errada.

     E' PALAVRA POR PALAVRA a lição que o rótulo ao lado já tinha aprendido, no comentário
     logo abaixo: dois valores que se leem juntos precisam ser calculados juntos. */
  REGUA_VALENDO = (sel && sel.criterio) || REGUA_VALENDO;
  // OS QUATRO NÚMEROS DA SITUAÇÃO, e nenhum deles é decorativo.
  // Saíram daqui dois que não mediam nada: a contagem de contas de origem, que a
  // pastilha de Minerados já mostra ao lado do nome, e o tamanho do lote montado, que
  // tem teto de 500 e por isso marcava 500 para sempre. Estes quatro mudam quando o
  // trabalho anda, que é a única razão para um número ficar grande na tela.
  $("n_lidos").textContent = num(lidosDoPainel(perfis));
  $("n_completos").textContent = perfis.filter(p => p.completo).length;
  // O QUE ESTA' ACIMA DA REGUA, no formato que foi pedido. Este numero contava so'
  // reels baixaveis: numa varredura de carrossel ele marcava zero para sempre, e zero
  // num painel quer dizer "nao achou nada", que era o contrario da verdade.
  $("n_reels").textContent = num(perfis.reduce((a, b) => a + (b.acima || 0), 0));
  // O NÚMERO É DO QUE FOI TRATADO E ENTREGUE, e não do que desceu. Arquivo que baixou e
  // reprovou na limpeza não virou peça: contá-lo aqui inflaria o acervo com o que foi
  // apagado antes de sair.
  $("n_baixados").textContent = num(((lotes && lotes.lotes) || [])
    .reduce((a, b) => a + (b.limpos || 0), 0));

  // AQUI MORAVA A LINHA DO RODAPÉ ("N perfis minerados · última rodada em ..."), e ela
  // saiu por decisão do dono em 24/08/2026. O elemento saiu junto, na montagem do
  // `montar.py`: contagem de situação no pé da página repetia o painel lá de cima.

  // O CAMPO NÃO É MAIS PREENCHIDO COM O QUE JÁ FOI MINERADO.
  // Aqui ele era reabastecido com a lista inteira do sistema a cada 25 segundos. O
  // efeito era o campo devolver eternamente os mesmos perfis que já estavam no banco,
  // como se nada tivesse sido registrado: apagar não adiantava, o relógio seguinte
  // trazia de volta. O campo é de entrada, o banco é a aba de Minerados.

  // a tabela quer o que a varredura descobriu, e não só o avanço
  const itens = (sel && sel.itens) || [];
  // A ORDEM AQUI É A DA RÉGUA, e é ela que vira o número da pasta no pacote (critério 12).
  // A seleção já chega ordenada por desempenho; reordenar depois faria o carrossel 07 do
  // ZIP não ser o sétimo que ele viu na tela.
  CARROSSEIS_DA_REGUA = itens.filter(
    x => x.formato === "carrossel" && (x.pecas || []).some(q => q && q.arquivo));
  MINERADOS = perfis.map(p => {
    const meus = itens.filter(i => i.conta === p.conta);
    const r = (retratos && retratos[p.conta]) || {};
    // A IMAGEM NÃO VEM DAQUI, só o aviso de que ela existe. O arquivo guarda nome e
    // números; a foto tem endereço próprio na ponte, porque o que o Instagram devolve
    // vence em horas. Sem este aviso a tabela não sabe se desenha a foto ou a inicial.
    // tudo já vem contado pelo seletor, por perfil e sem teto de lote
    return { ...p, nome: p.nome || r.nome, foto: !!r.foto,
             acima: p.acima != null ? p.acima : meus.length };
  });
  // A COLUNA "BAIXAR" LÊ DAQUI, e por isso o mapa é montado antes de a tabela desenhar.
  // Montado depois, ele chegaria uma volta atrasado: a leva começaria a correr e a
  // tabela continuaria dizendo "a baixar" por vinte e cinco segundos.
  anotarLevas(lotes);
  desenhaMinerados();

  // O CARTÃO NASCE DA LISTA DE CONTAS, e não da identificação no Instagram.
  //
  // Aqui o registro só mostrava quem já tinha ficha aberta pela ponte, e a ficha só era
  // aberta depois que o Instagram confirmasse quem é o perfil. Quando ele recusa, e ele
  // recusa com frequência porque limita por endereço de saída, a conta entrava na lista
  // e sumia da tela: o Gabriel adicionava um perfil, lia "o Instagram recusou", e não
  // via cartão nenhum, como se o perfil não tivesse entrado em lugar algum.
  //
  // Entrou na lista de origem, tem cartão. O que falta é o conteúdo dele, e é isso que
  // o cartão diz enquanto falta.
  const doLivro = (livro && livro.contas) || [];
  const comFicha = new Set(doLivro.map(c => c.conta));
  // A HORA DA FILA VEM DO PRÓPRIO FONTES.JSON, do campo `atualizado`, que a gravação
  // da lista carimba. É a única marca de tempo que uma conta sem ficha tem, e o card
  // provisório a mostra em vez de um "esperando" sem data: dado sem carimbo de hora
  // não afirma nada nesta tela. Ele vem como texto de data, e a conta abaixo o
  // transforma em segundos; se vier torto, cai em zero e o card volta ao texto neutro.
  const naFila = fontes && fontes.atualizado
    ? Math.floor(new Date(fontes.atualizado).getTime() / 1000) || 0
    : 0;
  const naLista = ((fontes && fontes.contas) || [])
    .map(c => String(c).trim().replace(/^@/, "")).filter(Boolean);

  // O CARTÃO LOCAL MORRE QUANDO O DE VERDADE CHEGA, e não por relógio. Enquanto a
  // conta não aparece nem na lista de origem nem na capa do livro, o cartão do clique
  // continua de pé: some por ter sido substituído, nunca por prazo vencido.
  const chegaram = new Set([...comFicha, ...naLista]);
  for (const c of [...PEDIDAS.keys()]) if (chegaram.has(c)) PEDIDAS.delete(c);

  const aguardando = naLista
    .filter(c => !comFicha.has(c))
    .map(conta => ({ conta, nome: null, primeiro: 0, ultimo: 0, eventos: 0,
                     falhas: 0, avisos: 0, ultimo_tipo: "aguardando",
                     lidos: 0, publicacoes: 0, completo: false, aguardando: true,
                     naFila }));
  LIVRO = [...PEDIDAS.values(), ...aguardando, ...doLivro];
  // O RÓTULO SÓ DEPOIS DA LISTA CHEGAR. Calculado antes, ele lia a lista da volta
  // anterior: na primeira carga a lista está vazia, e o painel abria dizendo
  // "publicações varridas" numa varredura de carrossel, corrigindo-se 25 segundos
  // depois. Quem olha nesses 25 segundos vê a coisa errada.
  /* O ROTULO SAI DA MESMA AUTORIDADE QUE O NUMERO, e por isso ignora a ficha.

     `lidosDoPainel` soma pelos formatos de `REGUA_VALENDO`; passando a ficha aqui, o
     rótulo tomava um atalho pelo `rotulo` gravado dela (o do PRIMEIRO perfil da lista, o
     que já é arbitrário) e os dois lados da frase podiam discordar. Dois valores que se
     leem juntos respondem a uma autoridade só. */
  const rot = rotuloDosFormatos(null, null);
  $("rot_lidos").textContent = rot === "publicações" ? "publicações varridas"
                                                     : rot + " varridos";
  // COMEÇA NA HORA: se há perfil sem identificação, a primeira tentativa sai agora, e
  // não daqui a quarenta e cinco segundos.
  if (aguardando.length) marcarProximaTentativa();
  desenhaLivro();
  medirLivro();

  desenhaProntos(MINERADOS);

  desenhaRegistroDeLotes(lotes);
  // A ABA DE EDIÇÃO LÊ A MESMA CAPA: leva que fica pronta aparece lá
  // sozinha, sem precisar recarregar a página.
  desenhaLevasDaEdicao(lotes).catch(() => {});
  // O LOTE EM CURSO É REBUSCADO A CADA VOLTA, aberto ou não: é dele que a cabeça do
  // registro fala, e é ele que muda. Os fechados não mudam mais, então só são buscados
  // quando alguém abre.
  const andando = ((lotes && lotes.lotes) || []).find(l => l.estado === "em curso");
  if (andando) await buscarPassos(andando.numero);
  else for (const n of LOTES_ABERTOS) await buscarPassos(n);

}

/* ---------------------------------------------------------------- comandos */
$("fontes").addEventListener("input", () => { $("fontes").dataset.tocado = "1"; });

/* ============================================================== INICIAR A MINERAÇÃO

   UM BOTÃO SÓ, e a escolha antes da leitura. Havia dois comandos aqui, "Salvar e
   varrer" e "Acordar a esteira", e a régua morava noutra aba onde a esteira nem a lia.
   Agora: escreve os perfis, aperta Iniciar, escolhe como medir, e o processo inteiro
   começa: identificação, varredura, régua e separação dos links. */

function reguaEscolhida() {
  const formatos = ["reels", "post", "carrossel"].filter(f => $("f_" + f).checked);
  /* ZERO E' UM NUMERO, E NAO UM CAMPO VAZIO.

     O QUE ACONTECEU EM 03/09/2026. Ele pos a regua em zero para trazer todo o carrossel
     que a varredura tinha achado, e o `n > 0` a trocou por 1,5 aqui, calado. O acervo
     recebeu 1,5, o cartao do pacote passou a oferecer 4 dos 9 carrosseis do @omatheusdaia
     e NENHUM dos 2 do @liamjohnston.ai (perfil recem-posto tem poucos posts lidos, e com
     mediana de dois nada fica 1,5 vez acima dela). Do lado dele: "n esta funcionando".

     TROCAR O QUE ELE DIGITOU, EM SILENCIO, E' A TRAVA 2 NA ENTRADA. A tela nao pode
     afirmar um numero que ele nao escolheu, do mesmo jeito que nao pode mostrar um numero
     que nao mediu. O que o campo recusa e' o que nao e' numero e o que e' negativo; zero
     passa, e quer dizer que tudo entra. */
  const numero = campo => {
    const n = parseFloat(String($(campo).value).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 1.5;
  };
  return {
    formatos,
    por_formato: $("por_formato").checked,
    corte: numero("corte_unico"),
    cortes: { reels: numero("c_reels"), post: numero("c_post"),
              carrossel: numero("c_carrossel") },
  };
}

/* O ARROBA E' O PEDACO DEPOIS DE instagram.com, E NAO O ULTIMO PEDACO DO CAMINHO.

   O QUE ACONTECIA ATE' 24/08/2026. A leitura era `split("/").pop()`: pegava o ultimo
   pedaco do endereco. So' que o endereco que o navegador copia quando se esta' olhando os
   reels de um perfil termina JUSTAMENTE na aba:

     https://www.instagram.com/nasa/reels/   ->  "reels"
     https://www.instagram.com/nasa/         ->  "nasa"     (este dava certo)

   E "REELS" VIRAVA UM PERFIL. Entrava na lista de origem, o Instagram nao tinha o que
   identificar, e o registro ficava parado em "esperando a esteira abrir pelo arroba".
   Nenhum erro aparecia na tela. Do lado dele: "fui tentar minerar um perfil e deu erro,
   nao aconteceu nada".

   CONFERIDO NO ACERVO em 24/08/2026: `dados/fontes.json` tinha "reels" na lista, gravado
   as 15:43, e `dados/atividade/reels.json` tinha o evento de espera. Era o unico registro
   da tentativa dele, e por isso a tela nao tinha o que mostrar.

   AGORA A REGRA E' A DO INSTAGRAM: o arroba e' o primeiro pedaco depois do dominio. O
   resto do caminho e' aba, e aba nao e' perfil. */
const ABAS_DO_PERFIL = new Set(["reels", "reel", "p", "tv", "tagged", "feed", "saved",
                                "channel", "guide", "live", "explore", "stories"]);

function umArroba(texto) {
  let s = (texto || "").trim();
  if (!s) return "";
  // ENDERECO COMPARTILHADO VEM COM RABO: "?igsh=..." e "#..." nao fazem parte do nome.
  s = s.split("?")[0].split("#")[0];
  const doDominio = s.match(/instagram\.com\/([^/?#]+)/i);
  if (doDominio) {
    const quem = doDominio[1].replace(/^@/, "");
    // instagram.com/reels/ sozinho e' a vitrine geral, e nao o perfil de ninguem.
    return ABAS_DO_PERFIL.has(quem.toLowerCase()) ? "" : quem;
  }
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  const partes = s.split("/").filter(Boolean);
  // "nasa/reels" escrito na mao cai aqui: tira a aba e fica o perfil.
  while (partes.length > 1 && ABAS_DO_PERFIL.has(partes[partes.length - 1].toLowerCase())) {
    partes.pop();
  }
  const nome = partes[partes.length - 1] || "";
  return ABAS_DO_PERFIL.has(nome.toLowerCase()) ? "" : nome;
}

function contasEscritas() {
  return $("fontes").value.split("\n").map(umArroba).filter(Boolean);
}

/** Mostra só as réguas dos formatos escolhidos, e troca entre única e separada. */
function ajustarFolha() {
  const separada = $("por_formato").checked;
  $("cortes_separados").hidden = !separada;
  $("cortes_juntos").hidden = separada;
  document.querySelectorAll(".cortes label").forEach(l => {
    l.hidden = !$("f_" + l.dataset.de).checked;
  });
  // A LINHA QUE DIZ ATE' ONDE VAI, e ela muda conforme os formatos marcados.
  // Só Reels tem caminho próprio no Instagram, e por isso é rápido. Com imagem no meio,
  // o feed vem misturado e a esteira precisa ler tudo para achar o que interessa.
  const fs = ["reels", "post", "carrossel"].filter(f => $("f_" + f).checked);
  const soReels = fs.length === 1 && fs[0] === "reels";
  const nomes = ["reels", "carrossel", "post"].filter(x => fs.includes(x))
    .map(x => NOMES_FORMATO[x]);
  const rot = nomes.length === 1 ? nomes[0]
    : nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
  // A ESTEIRA VAI ATÉ O FIM, e este texto diz isso e diz quanto custa.
  //
  // Aqui houve um recado dizendo que ela parava em duzentos, e ele fez o Gabriel parar
  // no meio do trabalho, com razão: num perfil de mil reels, os melhores podem estar em
  // qualquer ponto do histórico, e escolher entre os duzentos mais recentes é escolher o
  // melhor de uma amostra, não o melhor do perfil.
  //
  // Os tempos são medidos, não estimados: 204 reels em 12 minutos pelo caminho de reels,
  // e cerca de 25 publicações por minuto no histórico misturado.
  $("ini_ate").textContent = !fs.length
    ? "escolha ao menos um formato acima"
    : soReels
      ? "Reels tem caminho próprio no Instagram, então a esteira busca reels puros, sem "
        + "imagem nem carrossel no meio, e vai até o último reel do perfil. Medido: cerca "
        + "de 17 reels por minuto, ou uma hora para mil reels. Ela trabalha sozinha."
      : fs.length === 3
        ? "A esteira lê o histórico inteiro do perfil, do mais novo para o mais antigo. "
          + "Medido: cerca de 25 publicações por minuto, ou uma hora e meia para duas mil."
        : `A esteira guarda só ${rot} e vai até o fim do histórico. O Instagram entrega `
          + `tudo misturado e não deixa pedir esses formatos separados, então ela lê do `
          + `mais novo para o mais antigo, guarda ${rot} e descarta o resto. Medido: cerca `
          + `de 25 publicações lidas por minuto.`;

  const n = contasEscritas().length;
  $("ini_quantos").textContent = n === 1 ? "1 perfil escrito acima"
    : n ? `${n} perfis escritos acima` : "escreva ao menos um perfil acima";
}

$("iniciar").onclick = () => {
  if (!contasEscritas().length) {
    parado("recado", "escreva ao menos um perfil acima");
    return;
  }
  parado("ini_recado", "");
  ajustarFolha();
  $("ini_folha").hidden = false;
};
$("ini_cancelar").onclick = () => { $("ini_folha").hidden = true; };
$("ini_folha").addEventListener("click", ev => {
  if (ev.target === $("ini_folha")) $("ini_folha").hidden = true;
});
["por_formato", "f_reels", "f_post", "f_carrossel"].forEach(id =>
  $(id).addEventListener("change", ajustarFolha));

$("ini_vai").onclick = async () => {
  const contas = contasEscritas();
  const regua = reguaEscolhida();
  if (!regua.formatos.length) {
    parado("ini_recado", "escolha ao menos um formato");
    return;
  }
  $("ini_vai").disabled = true;
  $("ini_cancelar").disabled = true;
  // PEDIU, TEM CARTÃO, E ANTES DE QUALQUER IDA À REDE. Daqui até a resposta da ponte
  // passam segundos, porque ela ainda vai perguntar quem é o perfil ao Instagram; sem
  // isto, a lista abaixo continua vazia durante todo esse tempo.
  contas.forEach(c => anotarPedida(c));
  desenhaLivro();
  // A ESPERA ACONTECE AQUI DENTRO, que é onde o Gabriel está olhando. Identificar cada
  // perfil no Instagram leva alguns segundos, e a folha sem sinal parecia travada.
  carregando("ini_recado", contas.length === 1 ? "Identificando o perfil"
                                               : `Identificando ${contas.length} perfis`, "onda");
  try {
    const d = await mandarContas(contas, regua);
    const barrados = d.bloqueados || [];
    let entraram = (d.novos || []).filter(n => n.ok);
    let teimosos = (d.novos || []).filter(n => !n.ok).map(n => n.conta);

    // TENTAR DE NOVO, PORQUE A RECUSA É DE MOMENTO E NÃO DE PERFIL.
    //
    // Medido em 17/08: pedindo o mesmo @brandsdecoded__ quatro vezes seguidas pela
    // ponte, três voltaram sem identificação e a quarta trouxe as 2.252 publicações.
    // O Instagram limita por endereço de saída, e o endereço da ponte é compartilhado:
    // é sorte de rodízio, não perfil inexistente.
    //
    // Antes disto, a primeira recusa era o fim. O perfil entrava na lista de origem, a
    // esteira NÃO era chamada, e a tela ainda dizia "os 0 perfis já estão minerados".
    // Foi exatamente esse silêncio que apareceu como perfil adicionado sem nada
    // acontecer na tela.
    for (let volta = 2; volta <= 4 && teimosos.length; volta++) {
      carregando("ini_recado",
        `O Instagram recusou a consulta, tentativa ${volta} de 4`, "orbita");
      await new Promise(ok => setTimeout(ok, 4000));
      const outra = await mandarContas(teimosos);
      entraram = entraram.concat((outra.novos || []).filter(n => n.ok));
      teimosos = (outra.novos || []).filter(n => !n.ok).map(n => n.conta);
    }

    // A PRÓPRIA RESPOSTA JÁ TRAZ O QUE FALTAVA NO CARTÃO, e ela é mais nova que
    // qualquer leitura: quem foi identificado ganha nome e contagem agora, e quem foi
    // barrado por já estar no banco perde o cartão do clique, senão apareceria duas
    // vezes, uma como pedido e outra como perfil de verdade.
    for (const c of barrados) {
      PEDIDAS.delete(c);
      LIVRO = LIVRO.filter(x => !(x.local && x.conta === c));
    }
    const agoraSeg = Math.floor(Date.now() / 1000);
    for (const n of entraram)
      anotarPedida(n.conta, { aguardando: false, ultimo_tipo: "identificado",
                              publicacoes: n.publicacoes || 0, eventos: 1,
                              primeiro: agoraSeg, ultimo: agoraSeg });
    desenhaLivro();

    // A ESTEIRA É CHAMADA MESMO SEM IDENTIFICAÇÃO. Quem entrou na lista de origem é
    // trabalho pendente para ela, e as vinte máquinas dela têm vinte endereços de saída
    // próprios: onde a ponte apanhou, alguma delas passa.
    if (entraram.length || teimosos.length) await mandar("/varrer");

    $("fontes").value = "";
    delete $("fontes").dataset.tocado;
    parado("ini_recado", "");
    $("ini_folha").hidden = true;
    const recado = [];
    if (entraram.length)
      recado.push(entraram.length === 1 ? "1 perfil na fila"
                                        : `${entraram.length} perfis na fila`);
    if (teimosos.length)
      recado.push(teimosos.length === 1
        ? `@${teimosos[0]} entrou sem identificação, a esteira tenta pelos endereços dela`
        : `${teimosos.length} entraram sem identificação, a esteira tenta pelos endereços dela`);
    if (barrados.length)
      recado.push(barrados.length === 1 ? `@${barrados[0]} já estava no banco`
                                        : `${barrados.length} já estavam no banco`);
    parado("recado", recado.join(" · ")
      + (entraram.length || teimosos.length ? ", acompanhe no registro abaixo" : ""));
    // o cartão de cada perfil já existe no acervo neste ponto: a ponte o abre junto
    // com a identificação, então a lista mostra o perfil antes da primeira página.
    setTimeout(() => { aoVivo(); atualizar(); }, 1200);
  } catch (e) {
    parado("ini_recado", e.message);
  }
  $("ini_vai").disabled = false;
  $("ini_cancelar").disabled = false;
};



/* ================================================ O REGISTRO DO LOTE, AO VIVO

   Mesmo molde do registro da mineração. A diferença é a fonte: lá cada vaga da esteira
   grava; aqui cada fase do trabalho de baixar grava, e são cinco (pedido, régua, baixa,
   limpeza, fim). Entre uma e outra passam minutos, e é isso que a tela conta.

   OS PASSOS DE UM LOTE SÓ SÃO BUSCADOS QUANDO ELE ABRE, e o que está em curso é
   rebuscado a cada volta. Buscar o histórico dos doze a cada vinte e cinco segundos
   seriam doze leituras por volta para mostrar uma. */
let LOTES = [];
const LOTES_ABERTOS = new Set();
const PASSOS = new Map();

/* O CARTÃO NASCE NO CLIQUE, e não quando a esteira responde.
   Entre apertar o botão e a esteira gravar o primeiro passo passam de quarenta segundos
   a um minuto e meio: máquina para criar, programas para conferir, e só então a primeira
   escrita. Nesse buraco a tela não mostrava absolutamente nada, e a leitura óbvia é que
   o clique não funcionou. É o mesmo defeito que a aba de Mineração já teve, e a solução
   é a mesma de lá: pediu, tem cartão. O cartão local vive até o acervo trazer uma leva
   aberta depois do clique, e aí some, porque a de verdade tomou o lugar dele. */
let LEVA_PEDIDA = null;
let ULTIMO_INDICE = null;

/* E O RELÓGIO ACELERA ENQUANTO HÁ LEVA ANDANDO. De vinte e cinco em vinte e cinco
   segundos é ritmo de tela parada; com trabalho em curso, seis segundos. */
let relogioRapido = null;

function acelerar(minutos = 6) {
  if (relogioRapido) clearInterval(relogioRapido);
  const ate = Date.now() + minutos * 60000;
  relogioRapido = setInterval(() => {
    if (Date.now() > ate) { clearInterval(relogioRapido); relogioRapido = null; return; }
    atualizar();
  }, 6000);
}

/* OS RÓTULOS SÃO NUMERADOS, E ISSO CONSERTA UM ERRO DE LEITURA REAL.

   Eles eram só palavras: escolha, régua, baixa, preparo, tratando, tratamento, entrega,
   entregue. Duas delas quase repetiam a anterior, "tratando" e "tratamento", "entrega" e
   "entregue", e o Gabriel leu a lista em 19/08 sem conseguir dizer qual vinha antes de
   qual. A ordem no arquivo sempre esteve certa; o que faltava era ela estar visível.

   Com o número na frente, a sequência se lê sozinha, e as duas etapas que têm duas
   linhas dividem o mesmo número de propósito: são a mesma etapa, uma começando e a
   outra terminando. */
const ETAPAS = {
  escolha:  "1 · perfis escolhidos",
  pedido:   "1 · pedido",
  selecao:  "2 · régua aplicada",
  baixa:    "3 · baixando do Instagram",
  preparo:  "4 · preparo do tratamento",
  tratando: "5 · tratando",
  limpeza:  "5 · tratado",
  entrega:  "6 · montando o pacote",
  fim:      "7 · pacote entregue",
  // SÃO DUAS BAIXAS COM O MESMO NOME, e foi isso que fez o registro parecer mentiroso:
  // o passo 3 é a máquina da esteira puxando os reels do Instagram, o passo 8 é este
  // computador puxando o pacote pronto da esteira. Por isso nenhum dos dois diz só
  // "baixando": cada um diz de onde para onde.
  buscando: "8 · trazendo para a casa do Estúdio",
  guardado: "8 · guardado na casa do Estúdio",
  falha:    "falhou",
};

function desenhaRegistroDeLotes(indice) {
  ULTIMO_INDICE = indice || ULTIMO_INDICE;
  const doAcervo = (indice && indice.lotes) || [];
  // a leva de verdade nasceu: o cartão local já não tem função
  if (LEVA_PEDIDA && doAcervo.some(l => (l.inicio || 0) >= LEVA_PEDIDA.quando - 5))
    LEVA_PEDIDA = null;
  LOTES = LEVA_PEDIDA
    ? [{ numero: null, estado: "pedida", contas: LEVA_PEDIDA.contas, baixados: 0,
         limpos: 0, reprovados: 0, mb: 0, inicio: LEVA_PEDIDA.quando }, ...doAcervo]
    : doAcervo;
  const alvo = $("lot_lista");
  $("lot_vazio").hidden = LOTES.length > 0;

  const atual = LOTES[0];
  const emCurso = atual && (atual.estado === "em curso" || atual.estado === "pedida");
  // A ESPERA PELA ETAPA 8 TAMBÉM É TRABALHO ANDANDO, e o relógio lento não servia para
  // ela: a leva ficava pronta, a busca para o computador levava dois minutos, e a linha
  // com o link só entrava na volta seguinte de vinte e cinco segundos. Com o relógio
  // rápido, ela aparece em até seis.
  const esperandoAPasta = atual && atual.estado === "pronto" && !atual.guardado;
  // com trabalho andando, a tela relê de seis em seis segundos
  if ((emCurso || esperandoAPasta) && !relogioRapido) acelerar();
  $("lot_vivo").innerHTML = `<span class="kon-vivo${emCurso ? " ativa" : ""}"><i></i>${
    emCurso ? "trabalhando" : "parado"}</span>`;

  if (!atual) {
    $("lot_titulo").textContent = "Nenhuma Leva Ainda";
    $("lot_resumo").textContent = "Marque os perfis acima e aperte Montar leva.";
    for (const k of ["lot_baixados", "lot_limpos", "lot_reprovados"])
      $(k).textContent = "0";
    if (alvo.dataset.desenho !== "") { alvo.dataset.desenho = ""; alvo.innerHTML = ""; }
    return;
  }

  $("lot_baixados").textContent = num(atual.baixados || 0);
  $("lot_limpos").textContent = num(atual.limpos || 0);
  $("lot_reprovados").textContent = num(atual.reprovados || 0);

  const de = (atual.contas || []).length
    ? "de @" + atual.contas.join(", @")
    : "dos melhores de todos os perfis";
  $("lot_titulo").textContent = atual.estado === "pedida"
    ? "Leva pedida · acordando a esteira"
    : `Leva ${atual.numero} · ${
        atual.estado === "em curso" ? "em curso" :
        atual.estado === "pronto" ? "pronto" : "falhou"}`;
  $("lot_resumo").textContent = atual.estado === "pedida"
    ? `Pedida ${de}. A máquina leva perto de um minuto para acordar, e a partir daí `
      + "cada passo aparece aqui."
    : atual.estado === "em curso"
      ? `Trabalhando ${de}. ${num(atual.baixados || 0)} baixados, ${
          num(atual.limpos || 0)} tratados até agora.`
      // ENTREGUE NÃO É O FIM DO CAMINHO, e a tela dizia que era.
      //
      // Ela parava em "41 peças tratadas, 441 MB", que é verdade e é incompleta: naquele
      // instante o material só existe na esteira, e a oitava etapa, a busca para o seu
      // computador, ainda não aconteceu. O Gabriel olhou um cartão nesse estado em
      // 19/08, viu o selo "pronto" e perguntou onde estava o último passo, o que aponta
      // para a pasta. Ele não estava faltando: ainda não tinha chegado a hora dele.
      //
      // Agora o cartão distingue as duas coisas, e o que falta é dito enquanto falta.
      : (atual.guardado
          ? `${num(atual.limpos || 0)} peças tratadas, ${atual.mb || 0} MB, ${de}. `
            + "Já estão em C:\\Users\\Gabri\\Estudio\\levas\\leva-" + atual.numero
          : `${num(atual.limpos || 0)} peças tratadas, ${atual.mb || 0} MB, ${de}. `
            + "Falta a última etapa: trazer para a casa do Estúdio, o que acontece "
            + "sozinho em poucos minutos.")
        + (atual.reprovados ? ` ${num(atual.reprovados)} reprovados na limpeza.` : "");

  const html = LOTES.map(l => {
    // A LEVA PEDIDA AINDA NÃO TEM NÚMERO NEM PASSOS: ela é um cartão que não abre, e
    // dizer isso é melhor do que abrir e mostrar vazio.
    if (l.estado === "pedida") {
      return `<div class="liv-cartao"><div class="liv-cabeca" style="cursor:default">
        <span class="liv-ponto"></span>
        <span class="liv-id"><span class="liv-nome"><b>Leva a caminho</b>
          <span class="liv-etq">pedida</span></span>
          <span class="liv-sub">${(l.contas || []).length
            ? "@" + l.contas.join(", @") : "todos os perfis"} · ${quando(l.inicio)}</span>
        </span></div></div>`;
    }
    const aberto = LOTES_ABERTOS.has(l.numero);
    const grave = l.estado === "falhou" ? "falha" : l.reprovados ? "aviso" : "";
    const quem = (l.contas || []).length ? "@" + l.contas.join(", @") : "todos os perfis";
    return `<div class="liv-cartao ${grave}${aberto ? " aberto" : ""}"
        data-lote="${l.numero}">
      <button class="liv-cabeca" type="button" aria-expanded="${aberto}">
        <span class="liv-ponto"></span>
        <span class="liv-id">
          <!-- O SELO DIZ ATÉ ONDE A LEVA CHEGOU, e "pronto" cobria dois estados bem
               diferentes: o pacote saiu da esteira, e o pacote já está no computador.
               São os passos 7 e 8, e a diferença importa, porque o pacote da esteira
               vence em catorze dias e o do computador não. -->
          <span class="liv-nome"><b>Leva ${l.numero}</b>
            <span class="liv-etq">${l.estado === "pronto"
              ? (l.guardado ? "guardado" : "entregue") : l.estado}</span></span>
          <!-- NA ORDEM EM QUE ACONTECE, e não ao contrário. Aqui estava escrito "41
               tratados de 41 baixados", que põe o tratamento na frente da baixa e diz o
               oposto do caminho. Foi essa linha que fez o Gabriel perguntar, em 19/08,
               como a leva podia começar tratando e depois baixar. -->
          <span class="liv-sub">${quem} · baixou ${num(l.baixados || 0)}, tratou ${
            num(l.limpos || 0)}${l.mb ? ` · ${l.mb} MB` : ""} · ${
            quando(l.fim || l.inicio)}</span>
        </span>
        <svg class="liv-seta" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="liv-corpo"><div class="liv-caixa">${
        passosEmHtml(PASSOS.get(l.numero), l)}</div></div>
    </div>`;
  }).join("");

  if (alvo.dataset.desenho !== html) {
    alvo.dataset.desenho = html;
    alvo.innerHTML = html;
  }
}

/* O CAMINHO DA PASTA VIRA UM LINK QUE ABRE O EXPLORADOR, e ele não é `file://`.

   O navegador PROÍBE que uma página servida por `https` navegue para um endereço
   `file://`. A proibição é de segurança e não tem contorno: o link fica escrito com o
   caminho certo, o clique não faz nada, e nem erro aparece. Quem testa só com o olho
   jura que funcionou.

   POR QUE O ENDERECO PROPRIO NAO SERVE MAIS.

   ELE ESTA' REGISTRADO NO WINDOWS, e isso foi conferido no registro em 23/08/2026:
   `HKCU\Software\Classes\estudio\shell\open\command` existe e manda rodar
   `pythonw.exe "...\Ferramenta 1\abrir.py" "%1"`.

   O QUE NAO EXISTE E' O `abrir.py`. A pasta do projeto tem `motor`, `telas`, `docs`,
   `marca` e `provas`, e mais nada. O `pythonw.exe` sobe, nao acha o arquivo, e morre
   calado: `pythonw` nao tem console, entao nao ha' onde a mensagem de erro apareca.
   O clique some no vazio, que foi exatamente o que ele descreveu.

   E POR ISSO QUEM ABRE PASSOU A SER O POSTO. Ele ja' roda, ja' e' deste projeto, e nao
   depende de registro do Windows nem de arquivo fora do `motor`. Ver `abrirNoComputador`
   aqui e `_abrir_a_pasta` no `posto.py`.

   E FICA O BOTÃO DE COPIAR AO LADO, porque o endereço só existe nesta máquina: aberta
   de outro computador ou do celular, a página continua entregando o caminho. */
function paraOndeFoi(p, numero) {
  // O CAMINHO PODE SER DOS DOIS MUNDOS: `C:\...` quando a casa era o Windows, e
  // `/home/...` desde que ela mora na VPS. Sem a segunda forma, o passo escrito pela
  // casa nova saía como texto morto, sem link e sem botão de copiar.
  const caminho = (p.texto.match(/([A-Za-z]:\\[^\s.]*(?:\\[^\s.]*)*|\/[^\s]*\/leva-\d+)/)
                   || [])[1];
  if (!caminho || !numero) return `<span>${p.texto}</span>`;
  const antes = p.texto.slice(0, p.texto.indexOf(caminho));
  return `<span>${antes}</span><a class="liv-pasta" href="#"
      data-abrir="levas/leva-${numero}"
      title="Abrir a pasta">${caminho}</a>`
    + `<button type="button" class="liv-copiar" data-copiar="${caminho}"
        title="Copiar o caminho">copiar</button>`;
}

/* A ETAPA 8 APARECE ENQUANTO ELA ACONTECE, e não só depois de pronta.

   Ela é a única do caminho que roda na casa do Estúdio, e não na esteira: por isso
   ela é a única que a esteira não consegue anunciar quando começa. O registro ficava
   parado no 7 durante os dois a três minutos da busca, sem uma linha explicando, e a
   leitura era de log incompleto. Ele reclamou três vezes disso, e as três estavam certas:
   o que o sistema está fazendo tem de aparecer enquanto está fazendo.

   Esta linha é montada pela tela, e não vem do acervo. Ela nasce no instante em que a
   leva fica pronta sem estar guardada, e é substituída pela linha de verdade, com o
   link, assim que a pasta local existir. */
/* E A RODA NÃO GIRA PARA SEMPRE. Quem busca é um programa da casa do Estúdio,
   que passa de minuto em minuto: dez minutos sem a busca nem começar não é espera, é
   algo errado (computador desligado na hora marcada, tarefa agendada parada, GitHub
   fora do ar). A roda ficava girando sem mensagem e sem desistir; passado o prazo, a
   tela agora diz o que houve e oferece tentar de novo. O ponto de partida da conta é
   a hora em que a leva ficou pronta, e não a abertura da página: aberta horas depois,
   ela já abre dizendo a verdade em vez de girar. */
const ESPERA_DA_BUSCA = new Map();     // número da leva -> desde quando (ms) se espera
const BUSCA_PACIENCIA_MIN = 10;

function etapaOitoEmCurso(leva, passos) {
  if (!leva || leva.estado !== "pronto" || leva.guardado) {
    if (leva) ESPERA_DA_BUSCA.delete(leva.numero);
    return "";
  }
  // Assim que o computador começa, ele mesmo escreve a linha, com os megabytes andando.
  // Esta aqui é só para o intervalo entre a esteira terminar e ele acordar.
  if ((passos || []).some(p => p.tipo === "buscando")) {
    ESPERA_DA_BUSCA.delete(leva.numero);
    return "";
  }
  if (!ESPERA_DA_BUSCA.has(leva.numero))
    ESPERA_DA_BUSCA.set(leva.numero, leva.fim ? leva.fim * 1000 : Date.now());
  const desde = ESPERA_DA_BUSCA.get(leva.numero);
  const min = Math.floor((Date.now() - desde) / 60000);
  if (min >= BUSCA_PACIENCIA_MIN) {
    const faz = min < 120 ? `${min} min` : `${Math.round(min / 60)} h`;
    return `<div class="liv-ev falha"><i></i><div class="oque">
      <b>${ETAPAS.buscando}</b>
      <div class="dados"><span>A leva está pronta na esteira há ${faz} e a busca não
        começou. Quem busca é um programa da casa do Estúdio: confira se ele
        estava ligado na hora e se há internet. Nada se perdeu, o pacote fica na
        esteira por catorze dias. </span>
        <button type="button" class="liv-copiar" data-buscar-de-novo="${leva.numero}"
          title="Voltar a esperar a busca">tentar de novo</button></div></div>
      <span class="data">${quando(Math.floor(desde / 1000))}</span></div>`;
  }
  return `<div class="liv-ev indo"><i></i><div class="oque">
      <b>${ETAPAS.buscando}</b>
      <div class="dados"><span>A leva está pronta na esteira. A casa do Estúdio olha de
        minuto em minuto e vai trazer os ${leva.mb || 0} MB: quando começar, os megabytes
        aparecem aqui andando.</span></div></div>
    <span class="data"><span class="liv-girando"></span></span></div>`;
}

/* O "tentar de novo" rearma a espera: o prazo passa a contar do clique, a roda volta, e
   a tela releia depressa. Se a busca sair, a linha some sozinha; se não sair, a mensagem
   honesta volta em dez minutos. */
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-buscar-de-novo]");
  if (!b) return;
  ev.preventDefault();
  ev.stopPropagation();
  ESPERA_DA_BUSCA.set(parseInt(b.dataset.buscarDeNovo, 10), Date.now());
  acelerar();
  atualizar();
});

function passosEmHtml(passos, leva) {
  const numero = leva && leva.numero;
  if (!passos) return '<div class="liv-ev"><div class="oque">carregando</div></div>';
  if (!passos.length) return '<div class="liv-ev"><div class="oque">sem passos gravados</div></div>';
  // O MAIS RECENTE EM CIMA, a pedido do Gabriel em 19/08. A leva termina no passo que
  // interessa, o que diz onde o material parou, e ele ficava no fim de uma lista de dez
  // linhas: para ver o desfecho era preciso rolar até embaixo. Invertido, o cartão abre
  // já mostrando em que pé a leva está.
  //
  // A CÓPIA É DE PROPÓSITO: `reverse` vira a lista no lugar, e a lista aqui é a mesma
  // que fica guardada em `PASSOS`. Sem a cópia, cada redesenho viraria a ordem de novo,
  // e o registro ficaria piscando entre as duas.
  //
  // O PASSO DE UMA CONTA LEVA O NOME DELA NO RÓTULO. Numa leva de cinquenta perfis são
  // cinquenta linhas de baixa e cinquenta de tratamento, e sem o arroba no rótulo elas
  // seriam cem linhas iguais.
  return etapaOitoEmCurso(leva, passos) + [...passos].reverse().map(p =>
    `<div class="liv-ev ${p.tipo === "falha" ? "falha"
                        : p.tipo === "buscando" ? "indo" : ""}">
    <i></i><div class="oque"><b>${ETAPAS[p.tipo] || p.tipo}${
      p.conta ? ` · @${p.conta}` : ""}</b>
      <div class="dados">${p.tipo === "guardado" ? paraOndeFoi(p, numero)
                                                 : `<span>${p.texto}</span>`}</div></div>
    <span class="data">${p.tipo === "buscando"
      ? '<span class="liv-girando"></span>' : quando(p.quando)}</span></div>`).join("");
}

/* Copiar o caminho, para quem estiver noutra máquina. O aviso vive dois segundos no
   próprio botão: um recado que aparece longe de onde se clicou não é lido. */
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-copiar]");
  if (!b) return;
  ev.preventDefault();
  ev.stopPropagation();
  try {
    await navigator.clipboard.writeText(b.dataset.copiar);
    const antes = b.textContent;
    b.textContent = "copiado";
    setTimeout(() => { b.textContent = antes; }, 2000);
  } catch (e) { b.textContent = "não deu"; }
});

async function buscarPassos(numero) {
  const d = await ler(`dados/lotes/${numero}.json`);
  PASSOS.set(numero, (d && d.passos) || []);
  const cartao = document.querySelector(`[data-lote="${numero}"] .liv-caixa`);
  // A LEVA INTEIRA, e não só o número: é dela que sai a linha da etapa 8 em curso, que
  // depende de saber se a leva está pronta e se já foi guardada.
  if (cartao) cartao.innerHTML = passosEmHtml(PASSOS.get(numero),
    LOTES.find(x => x.numero === numero));
}

document.addEventListener("click", ev => {
  const cabeca = ev.target.closest("#lot_lista .liv-cabeca");
  if (!cabeca) return;
  const cartao = cabeca.closest(".liv-cartao");
  const numero = parseInt(cartao.dataset.lote, 10);
  const abre = !cartao.classList.contains("aberto");
  cartao.classList.toggle("aberto", abre);
  cabeca.setAttribute("aria-expanded", abre);
  if (abre) { LOTES_ABERTOS.add(numero); buscarPassos(numero); }
  else LOTES_ABERTOS.delete(numero);
});

/* ================================================= MERCADO, ETIQUETA E AS DUAS LISTAS

   ELAS SAO A UNICA COISA DESTA TELA QUE NAO E' MEDIDA: sao a leitura do Gabriel sobre o
   perfil, e ninguem tem como deduzi-las do que o Instagram devolve. Por isso ha' um
   lugar para escrevê-las, e ele fica na tabela de Minerados, que e' o cadastro dos
   perfis. Os dois filtros da aba de Baixar leem daqui.

   ATE' 19/08/2026 ISTO ERAM DOIS CAMPOS DE TEXTO LIVRE, e a lista de nomes era o que
   estivesse escrito nos perfis. Dois furos nisso, e os dois doem: nao dava para criar um
   nome antes de usar (o primeiro perfil de um nicho era digitado no vazio, e "financas"
   e "finanças" viravam dois nichos na primeira letra errada), nem apagar um nome (ele so'
   sumia quando o ultimo perfil que o carregava fosse reescrito na mao).

   AGORA HA' UM CATALOGO, e o desenho e' o da aba de Configuracoes do Social Tracker,
   como o Gabriel pediu. Com ele veio a regra que la' nasceu em 14/08: APAGAR SEMPRE PODE,
   E A PERGUNTA E' PARA ONDE VAO OS PERFIS. Trancar nome em uso nao protege ninguem, so'
   empurra o trabalho para fora da tela.

   O PEDIDO VIAJA COMO TEXTO SIMPLES, pelo mesmo canal do lote:
     etiquetar:<conta>|<mercado>|<etq>;<etq>
     catalogo:criar|nicho|luxo
     catalogo:remover|etiqueta|hot|<destino ou vazio>                                  */

let etqConta = null;
let etqMercado = "";                 // o que esta' escolhido na folha, ainda nao salvo
let etqEtiquetas = new Set();

/* A LEITURA DE ESPERA NAO PASSA PELO ENDERECO CRU.
   O `ler` corre os dois caminhos e aceita quem responder primeiro, o que e' certo para
   pintar a tela e errado para esperar uma mudanca: o endereco cru tem cache de borda e
   serve por minutos o arquivo de antes. Quem espera precisa da resposta do momento, ou
   fica esperando para sempre uma coisa que ja' aconteceu. */
async function lerFresco(caminho) {
  // ESTA VAI SÓ PELA PONTE DE PROPÓSITO: ela existe para perguntar ao acervo se a
  // mudança já entrou, e a fonte tem cache de borda que responderia o valor velho.
  //
  // O FREIO É NOVO, e a razão é a mesma da leitura comum: ponte doente segura o pedido
  // por até um minuto, e esta função é chamada de três em três segundos enquanto a tela
  // espera. Sem cortar, cada espera de quatro minutos deixava oitenta pedidos pendurados.
  const dentro = caminho.replace(/^dados\//, "");
  const freio = new AbortController();
  const corte = setTimeout(() => freio.abort(), 8000);
  try {
    const r = await fetch(`${PONTE}/dados/${dentro}?t=${Date.now()}`,
                          { cache: "no-store", signal: freio.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
  finally { clearTimeout(corte); }
}

/** Quantos perfis carregam cada nome hoje. Sai da tabela, que ja' tem todos. */
function usoDoCatalogo() {
  const nichos = {}, etiquetas = {};
  const k = s => (s || "").trim().toLowerCase();
  for (const p of MINERADOS) {
    if (p.mercado) nichos[k(p.mercado)] = (nichos[k(p.mercado)] || 0) + 1;
    for (const e of (p.etiquetas || [])) etiquetas[k(e)] = (etiquetas[k(e)] || 0) + 1;
  }
  return { nichos, etiquetas };
}

function listaDo(o) { return (CATALOGO[o === "nicho" ? "nichos" : "etiquetas"] || []); }
function nomesDo(o) { return listaDo(o).map(x => x.nome); }

document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-etiquetar]");
  if (b) abrirMarcacao(b.dataset.etiquetar);
});

function abrirMarcacao(conta) {
  const p = MINERADOS.find(x => x.conta === conta);
  if (!p) return;
  etqConta = conta;
  etqMercado = p.mercado || "";
  etqEtiquetas = new Set(p.etiquetas || []);
  $("etq_quem").textContent = "@" + conta;
  $("etq_recado").textContent = "";
  $("etq_folha").hidden = false;
  desenhaFolha();
}

/** Redesenha a folha inteira a partir do catálogo: os dois escolhedores e as duas listas. */
function desenhaFolha() {
  desenhaMercadoDaFolha();
  desenhaEtiquetasDaFolha();
  document.querySelectorAll(".cfg-cat").forEach(desenhaCatalogo);
}

/* O MERCADO É UM SELETOR, E NÃO UM CAMPO. Ele é um só por perfil: isso é uma escolha
   entre nomes que existem, não uma frase para escrever. */
function desenhaMercadoDaFolha() {
  const caixa = $("etq_merc");
  const menu = caixa.querySelector(".psel-menu");
  const opcoes = [{ v: "", r: "Sem Mercado" },
                  ...nomesDo("nicho").map(n => ({ v: n, r: n }))];
  if (!opcoes.some(o => o.v === etqMercado)) etqMercado = "";
  caixa.querySelector(".psel-b span").textContent =
    opcoes.find(o => o.v === etqMercado).r;
  menu.innerHTML = opcoes.map(o =>
    `<button type="button" role="option" data-v="${escapa(o.v)}"${
      o.v === etqMercado ? ' class="on"' : ""}>${escapa(o.r)}<i>✓</i></button>`).join("");
}

function desenhaEtiquetasDaFolha() {
  const todas = nomesDo("etiqueta");
  $("etq_sem_etq").hidden = todas.length > 0;
  // CLICAR NA PASTILHA MARCA E DESMARCA. A não escolhida fica apagada, e é o mesmo
  // desenho: uma caixa de seleção ao lado roubaria a etiqueta do olho.
  $("etq_lista").innerHTML = todas.map(n =>
    `<button type="button" class="etq-op${etqEtiquetas.has(n) ? " on" : ""}"
        data-etq="${escapa(n)}">${window.etiquetaHTML(n)}</button>`).join("");
}

const escapa = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

$("etq_merc").querySelector(".psel-b").addEventListener("click", ev => {
  ev.stopPropagation();
  const m = $("etq_merc").querySelector(".psel-menu");
  const abre = !m.classList.contains("aberto");
  m.classList.toggle("aberto", abre);
  ev.currentTarget.setAttribute("aria-expanded", abre ? "true" : "false");
});
$("etq_merc").querySelector(".psel-menu").addEventListener("click", ev => {
  ev.stopPropagation();
  const b = ev.target.closest("button[data-v]");
  if (!b) return;
  etqMercado = b.dataset.v;
  $("etq_merc").querySelector(".psel-menu").classList.remove("aberto");
  $("etq_merc").querySelector(".psel-b").setAttribute("aria-expanded", "false");
  desenhaMercadoDaFolha();
});
$("etq_lista").addEventListener("click", ev => {
  const b = ev.target.closest("[data-etq]");
  if (!b) return;
  const n = b.dataset.etq;
  if (etqEtiquetas.has(n)) etqEtiquetas.delete(n); else etqEtiquetas.add(n);
  desenhaEtiquetasDaFolha();
});
// clicar em qualquer outro lugar fecha as listas suspensas que estiverem abertas
document.addEventListener("click", () => {
  document.querySelectorAll("#etq_folha .psel-menu.aberto").forEach(m => {
    m.classList.remove("aberto");
    m.parentNode.querySelector(".psel-b").setAttribute("aria-expanded", "false");
  });
});

$("etq_cancelar").onclick = () => { $("etq_folha").hidden = true; };

$("etq_vai").onclick = async () => {
  if (!etqConta) return;
  $("etq_vai").disabled = true;
  carregando("etq_recado", "Gravando a marcação", "bolas");
  try {
    await mandar("/baixar", { quantos: `etiquetar:${etqConta}|${etqMercado}|`
      + [...etqEtiquetas].join(";") });
    // A TABELA MUDA AGORA, pelo mesmo motivo do apagar: reler o acervo traria de volta o
    // arquivo do cache de borda, que é o de antes. A esteira leva perto de um minuto e a
    // volta de vinte e cinco segundos confirma sozinha.
    const p = MINERADOS.find(x => x.conta === etqConta);
    if (p) { p.mercado = etqMercado || null; p.etiquetas = [...etqEtiquetas].sort(); }
    desenhaMinerados();
    parado("etq_recado", "gravado.");
    setTimeout(() => { $("etq_folha").hidden = true; }, 1400);
  } catch (e) { parado("etq_recado", e.message); }
  $("etq_vai").disabled = false;
};

/* ------------------------------------------------------------ AS DUAS LISTAS

   O DESENHO É O DA ABA DE CONFIGURAÇÕES DO SOCIAL TRACKER, item "Nichos e etiquetas":
   uma linha por nome, quantos perfis o usam à direita, o xis aparecendo só ao passar o
   mouse, e a linha de criar encostada no pé, separada por um fio.

   A ESPERA É DIFERENTE DA DE LÁ, e tinha de ser. Lá o pedido entra numa fila na
   Cloudflare e o computador de casa passa nela de minuto em minuto, então a tela
   pergunta pelo número do pedido até ele ficar pronto. Aqui quem executa é a esteira do
   GitHub, que não devolve número nenhum: a tela dispara e passa a reler o próprio
   catálogo até ele mudar. O sinal para quem olha é o mesmo, roda e cronômetro, porque a
   espera é real e uma tela parada nesse intervalo é indistinguível de uma travada. */
const CAT_ESPERA_MAX = 240;                       // segundos antes de desistir de esperar

function desenhaCatalogo(caixa) {
  const o = caixa.dataset.o;
  const uso = usoDoCatalogo()[o === "nicho" ? "nichos" : "etiquetas"];
  const itens = listaDo(o);
  const lista = caixa.querySelector(".cfg-cat-lista");
  // O CONTADOR É O DA PRÓPRIA CAIXA. Ele era procurado por identificador fixo, e isso
  // valia enquanto havia um par de caixas só. Agora há dois pares, um na folha de
  // etiquetar perfil e outro no passo do template, e por identificador os quatro
  // escreviam no mesmo lugar.
  const conta = (caixa.closest(".caixa") || document).querySelector(".cfg-cat-conta");

  if (conta) conta.textContent = itens.length
    + (o === "nicho" ? (itens.length === 1 ? " mercado" : " mercados")
                     : (itens.length === 1 ? " etiqueta" : " etiquetas"));

  if (!itens.length) {
    lista.innerHTML = '<div class="cfg-cat-vazio">Nenhum'
      + (o === "nicho" ? " mercado criado" : "a etiqueta criada") + " ainda.</div>";
    return;
  }
  lista.innerHTML = itens.map(x => {
    const n = uso[(x.nome || "").toLowerCase()] || 0;
    return `<div class="cfg-cat-l" data-n="${escapa(x.nome)}">
      <span class="cfg-cat-n">${escapa(x.nome)}</span>
      <span class="cfg-cat-uso">${n ? n + (n === 1 ? " perfil" : " perfis")
                                    : "sem uso"}</span>
      <button type="button" class="cfg-cat-x" title="apagar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button></div>`;
  }).join("");
}

/** O que a caixa está dizendo: uma frase parada, verde ou vermelha. */
function catDiz(caixa, txt, tom) {
  const diz = caixa.querySelector(".cfg-cat-diz");
  if (diz._relogio) { clearInterval(diz._relogio); diz._relogio = null; }
  diz.textContent = txt || "";
  diz.className = "cfg-cat-diz" + (tom ? " " + tom : "");
}

/** A espera, com roda, três pontos e cronômetro andando de segundo em segundo. */
function catEsperando(caixa, rotulo, desde) {
  const diz = caixa.querySelector(".cfg-cat-diz");
  const tique = () => {
    const alvo = diz.querySelector(".cfg-cronometro");
    if (alvo) alvo.textContent = Math.round((Date.now() - desde) / 1000) + "s";
  };
  if (!diz._relogio) {
    diz.className = "cfg-cat-diz cfg-indo";
    diz.innerHTML = '<span class="cfg-girando"></span><span class="cfg-rotulo"></span>'
      + '<span class="cfg-pontos"><i></i><i></i><i></i></span>'
      + '<span class="cfg-cronometro"></span>';
    diz._relogio = setInterval(tique, 1000);
  }
  diz.querySelector(".cfg-rotulo").textContent = rotulo;
  tique();
}

function catTravar(caixa, v) {
  caixa.dataset.ocupado = v ? "1" : "";
  caixa.querySelector(".cfg-cat-btn").disabled = v;
  caixa.querySelector(".cfg-cat-novo input").disabled = v;
}

/** Dispara o pedido e espera o catálogo do acervo refletir o que foi pedido. */
async function catPedir(caixa, texto, pronto, aoFim) {
  catTravar(caixa, true);
  const desde = Date.now();
  catEsperando(caixa, "enviando", desde);
  try {
    await mandar("/baixar", { quantos: texto });
  } catch (e) {
    catTravar(caixa, false);
    return catDiz(caixa, "não deu para deixar o pedido: " + e.message, "ruim");
  }
  catEsperando(caixa, "a esteira está aplicando", desde);
  while ((Date.now() - desde) / 1000 < CAT_ESPERA_MAX) {
    await new Promise(r => setTimeout(r, 3000));
    const d = await lerFresco("dados/catalogo.json");
    if (d && pronto(d)) {
      CATALOGO = d;
      catTravar(caixa, false);
      // O QUE ACONTECEU VEM ANTES DO REDESENHO, e a ordem contrária já enganou uma vez:
      // é `aoFim` quem refaz na memória da tela a mesma troca que a esteira acabou de
      // fazer nos perfis. Chamado depois de desenhar, ele mexia num dado que ninguém ia
      // mais ler, e a tabela ficava dizendo o contrário do recado logo ao lado: "os
      // perfis passaram para luxo" e, na linha de baixo, "luxo, sem uso".
      aoFim();
      desenhaFolha();
      // OS FILTROS DE BAIXAR LEEM O MESMO CATÁLOGO, e quem os enche é o `desenhaProntos`.
      //
      // AQUI ESTAVA ESCRITO `encherFiltros()`, que era o nome antigo desta mesma tarefa e
      // não existe mais em lugar nenhum. A linha estourava, e a de baixo, que redesenha a
      // tabela da Mineração, nunca chegava a rodar: ele mudava o mercado de um perfil, a
      // folha dizia "gravado", e a tabela continuava mostrando o valor de antes.
      desenhaProntos(MINERADOS);
      // a tabela e os filtros de Baixar leem daqui, então mudam junto
      return desenhaMinerados();
    }
    catEsperando(caixa, "a esteira está aplicando", desde);
  }
  catTravar(caixa, false);
  catDiz(caixa, "passaram quatro minutos e a esteira não confirmou. O pedido não se "
    + "perdeu: se ela terminar, a mudança aparece sozinha na próxima volta da tela.",
    "ruim");
}

const temNome = (d, o, nome) => (d[o === "nicho" ? "nichos" : "etiquetas"] || [])
  .some(x => x.nome.toLowerCase() === nome.toLowerCase());

document.querySelectorAll(".cfg-cat").forEach(caixa => {
  const o = caixa.dataset.o;
  const campo = caixa.querySelector(".cfg-cat-novo input");
  const botao = caixa.querySelector(".cfg-cat-btn");
  const oA = o === "nicho" ? "o" : "a";

  function criar() {
    if (caixa.dataset.ocupado) return;
    const nome = (campo.value || "").replace(/[|;]/g, " ").trim().slice(0, 28);
    if (!nome) { campo.focus(); return catDiz(caixa, "escreva um nome primeiro.", "ruim"); }
    const igual = listaDo(o).find(x => x.nome.toLowerCase() === nome.toLowerCase());
    if (igual) return catDiz(caixa, `“${igual.nome}” já está na lista.`, "ruim");
    catPedir(caixa, `catalogo:criar|${o}|${nome}`,
      d => temNome(d, o, nome),
      () => { campo.value = ""; catDiz(caixa, `“${nome}” criad${oA}.`, "bom"); });
  }
  botao.addEventListener("click", criar);
  campo.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); criar(); }
  });

  caixa.querySelector(".cfg-cat-lista").addEventListener("click", ev => {
    const linha = ev.target.closest(".cfg-cat-l");
    if (!linha || !ev.target.closest(".cfg-cat-x") || caixa.dataset.ocupado) return;
    const nome = linha.dataset.n;
    const usados = usoDoCatalogo()[o === "nicho" ? "nichos" : "etiquetas"];
    const quantos = usados[nome.toLowerCase()] || 0;
    // VAZIO SAI DIRETO; COM PERFIL, PERGUNTA PARA ONDE ELES VÃO.
    if (quantos > 0) abrirMover(caixa, linha, nome, quantos);
    else apagarDoCatalogo(caixa, linha, nome, "");
  });
});

/* O PAINEL DE MOVER, que abre dentro da própria linha e não numa caixa flutuante: quem
   está decidindo o destino precisa continuar vendo, logo acima, o nome que vai sumir. */
function abrirMover(caixa, linha, nome, quantos) {
  if (linha.querySelector(".cfg-mover")) return;
  const o = caixa.dataset.o;
  const semNada = o === "nicho" ? "deixar sem mercado" : "só tirar a etiqueta";
  const opcoes = [{ v: "", r: semNada },
                  ...nomesDo(o).filter(n => n !== nome).map(n => ({ v: n, r: n }))];
  let destino = "";

  const painel = document.createElement("div");
  painel.className = "cfg-mover";
  painel.innerHTML =
    `<span>${quantos} ${quantos === 1 ? "perfil vai" : "perfis vão"} para</span>`
    + '<div class="psel cfg-sel"><button type="button" class="psel-b" '
    + `aria-haspopup="listbox" aria-expanded="false"><span>${escapa(semNada)}</span>`
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
    + '</button><div class="psel-menu" role="listbox">'
    + opcoes.map((x, i) => `<button type="button" role="option" data-v="${escapa(x.v)}"${
        i === 0 ? ' class="on"' : ""}>${escapa(x.r)}<i>✓</i></button>`).join("")
    + '</div></div>'
    + '<button type="button" class="cfg-cat-btn cfg-vermelho cfg-ok">Apagar</button>'
    + '<button type="button" class="cfg-cat-btn cfg-fraco cfg-nao">Cancelar</button>';
  linha.classList.add("cfg-abrindo");
  linha.appendChild(painel);

  const bsel = painel.querySelector(".psel-b");
  const msel = painel.querySelector(".psel-menu");
  painel.addEventListener("click", e => e.stopPropagation());
  bsel.addEventListener("click", () => {
    const abre = !msel.classList.contains("aberto");
    msel.classList.toggle("aberto", abre);
    bsel.setAttribute("aria-expanded", abre ? "true" : "false");
  });
  msel.addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    destino = b.dataset.v;
    bsel.querySelector("span").textContent = b.textContent.replace("✓", "");
    msel.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    msel.classList.remove("aberto");
    bsel.setAttribute("aria-expanded", "false");
  });
  painel.querySelector(".cfg-nao").addEventListener("click", () => {
    desenhaCatalogo(caixa); catDiz(caixa, "");
  });
  painel.querySelector(".cfg-ok").addEventListener("click", () => {
    apagarDoCatalogo(caixa, linha, nome, destino);
  });
}

function apagarDoCatalogo(caixa, linha, nome, destino) {
  const o = caixa.dataset.o;
  const oA = o === "nicho" ? "o" : "a";
  linha.classList.add("esperando");
  catPedir(caixa, `catalogo:remover|${o}|${nome}|${destino}`,
    d => !temNome(d, o, nome),
    () => {
      mexerNosPerfisDaTela(o, nome, destino);
      let fim = `“${nome}” apagad${oA}.`;
      if (destino) fim += ` Os perfis passaram para “${destino}”.`;
      catDiz(caixa, fim, "bom");
    });
}

/* A MESMA TROCA QUE A ESTEIRA FEZ, REFEITA AQUI NA MEMÓRIA DA TELA.

   Sem isto a tela ficava uma volta atrasada, e de um jeito que se lê como erro: apagar
   "luxo" mandando o perfil para "moda" respondia "os perfis passaram para moda" e logo
   ao lado a lista dizia "moda, sem uso". As duas frases na mesma tela, uma negando a
   outra.

   NÃO DÁ PARA SÓ RELER O ACERVO, e é aí que está o detalhe. A leitura corre dois
   caminhos, a ponte e o endereço cru, e vale quem responder primeiro; o `selecao.json`
   tem 638 KB e leva quinze segundos pela ponte contra um pelo cru, então quem responde é
   sempre o cru, que tem cache de borda e serve por minutos o arquivo de antes. Reler
   traria de volta o estado anterior com cara de estado atual.

   A troca é simples e conhecida: é exatamente a que o `catalogo.py` acabou de aplicar
   nos perfis do acervo, e as duas estão escritas lado a lado de propósito. */
function mexerNosPerfisDaTela(o, nome, destino) {
  const k = s => (s || "").trim().toLowerCase();
  for (const p of MINERADOS) {
    if (o === "nicho") {
      if (k(p.mercado) === k(nome)) p.mercado = destino || null;
    } else if ((p.etiquetas || []).some(e => k(e) === k(nome))) {
      const resto = p.etiquetas.filter(e => k(e) !== k(nome));
      if (destino && !resto.some(e => k(e) === k(destino))) resto.push(destino);
      p.etiquetas = resto.sort((a, b) => a.localeCompare(b, "pt"));
    }
  }
  // E A FOLHA ABERTA SEGUE O PERFIL DELA. O nome que estava escolhido ali em cima pode
  // ser justamente o que acabou de sumir: sem esta linha, apagar "luxo" mandando para
  // "moda" deixava o seletor do perfil em "sem mercado", e salvar em seguida apagaria a
  // marcação que a própria remoção tinha acabado de fazer.
  const eu = MINERADOS.find(x => x.conta === etqConta);
  if (eu) { etqMercado = eu.mercado || ""; etqEtiquetas = new Set(eu.etiquetas || []); }
}

/* ============================================================ PEDIR O LOTE

   O PEDIDO VIAJA NO CAMPO `quantos`, E ISSO NÃO É DESLEIXO.
   Quem fala com o GitHub é a ponte, e ela copia campo a campo: só o que está na lista
   dela atravessa. Medido em 18/08/2026, com uma sonda que imprimiu o pedido do lado de
   lá: mandando `contas`, `perfis`, `quem`, `alvo`, `conta`, `lista`, `selecionados` e
   `de`, os oito chegaram vazios. `quantos` chegou inteiro, com o texto que foi mandado.

   A ponte não pode ser mexida daqui (a chave dela é da Cloudflare, e não está nesta
   máquina), então o canal que existe é esse. A esteira do outro lado sabe ler os dois
   formatos: um número é teto de arquivos, uma lista de nomes é de quais perfis. */
document.addEventListener("click", async ev => {
  if (!ev.target.closest("#lote_vai")) return;
  const b = $("lote_vai");
  const contas = [...ESCOLHIDOS];
  if (!contas.length) return;
  b.disabled = true;
  travaDoRecado = Date.now() + 30000;
  carregando("recado_lote", `Montando a leva de ${contas.length} `
    + (contas.length === 1 ? "perfil" : "perfis"), "bolas");
  try {
    // formato e corte não vão daqui: vêm da régua gravada no acervo, a mesma escolhida
    // ao iniciar. Mandar outra por aqui criaria duas verdades.
    await mandar("/baixar", { quantos: contas.join(",") });
    parado("recado_lote", "leva pedida. O registro aqui embaixo conta cada passo, "
      + "e o que vier some da fileira.");
    // O CARTÃO APARECE AGORA, com o que a própria tela já sabe.
    LEVA_PEDIDA = { quando: Math.floor(Date.now() / 1000), contas };
    ESCOLHIDOS.clear();
    desenhaRegistroDeLotes(ULTIMO_INDICE);
    // A COLUNA "BAIXAR" DA OUTRA ABA VIRA NO MESMO INSTANTE. Sem estas duas linhas ela
    // continuaria dizendo "a baixar" até a esteira gravar a primeira linha do registro,
    // que leva perto de um minuto: quem trocasse de aba veria a tabela negar o que
    // acabou de acontecer na tela ao lado.
    anotarLevas(ULTIMO_INDICE);
    desenhaMinerados();
    acelerar();
  } catch (e) { parado("recado_lote", e.message); }
  setTimeout(() => { b.disabled = false; atualizar(); }, 8000);
});


/* ============================================================ O TIRA-DÚVIDAS

   A BOLHA NÃO PRECISA DE PROGRAMA PARA APARECER SÓ AQUI: ela mora dentro da seção da
   aba de Baixar, e trocar de aba esconde a seção inteira. O que precisa de programa é
   abrir, fechar e não deixar a página rolar por baixo da folha aberta.

   O FUNDO E A TECLA DE ESCAPE FECHAM, as duas. Painel que só fecha por um botãozinho no
   canto é painel que fica aberto. */
function ajudaAbre(abrir) {
  $("faq_folha").hidden = !abrir;
  $("faq_fundo").hidden = !abrir;
  $("faq_abre").setAttribute("aria-expanded", abrir ? "true" : "false");
  // a página parada por trás: rolar o fundo com a folha aberta faz a leitura se perder
  document.body.style.overflow = abrir ? "hidden" : "";
  if (abrir) $("faq_fecha").focus();
}

$("faq_abre").onclick = () => ajudaAbre(true);
$("faq_fecha").onclick = () => ajudaAbre(false);
$("faq_fundo").onclick = () => ajudaAbre(false);
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !$("faq_folha").hidden) ajudaAbre(false);
});

/* ============================================================ A ABA DE EDIÇÃO

   TRÊS TELAS: a portaria, a escolha da leva e a oficina. Uma de cada vez, cada uma
   ocupando a tela sozinha. Foi o Gabriel quem pediu assim, em 19/08/2026, olhando a
   primeira versão: lá a escolha da leva estava solta no meio do passo 1, junto do trilho
   e da galeria, e nada dizia por onde começar.

   O TRILHO É O DO EXEMPLO QUE ELE MANDOU: número, uma linha vertical fina que preenche, e
   ao lado o título e a descrição. Passo por vir fica a meia opacidade. Ao entrar na
   oficina as barras desenham do zero, e é essa animação que diz "começou".

   O PROBLEMA QUE ESTA ABA TEM E AS OUTRAS NÃO:
   os vídeos moram na casa do Estúdio (na VPS, desde 25/08/2026), e as outras abas só
   precisam de números, que cabem no acervo; aqui é preciso ver o vídeo. Quem serve os
   vídeos é o posto, em pedaços; a permissão de pasta do navegador que resolvia isso no
   mundo local virou o plano B de quando a casa é esta própria máquina. Página nenhuma
   pode abrir sozinha um arquivo do disco de quem a visita, e ainda bem: se pudesse,
   qualquer site conseguiria.

   Ele aponta a pasta uma vez. O navegador entrega um crachá daquela pasta, o crachá fica
   guardado aqui do lado de cá, e nas próximas visitas a tela pede a permissão de volta em
   vez de pedir a pasta de novo. Nada sobe para lugar nenhum.                            */

let EDIT_PASSO = 1;
let EDIT_LEVA = null;              // a leva escolhida, como está na capa do acervo
let EDIT_PASTA = null;             // a pasta `levas`, se já tivermos
let EDIT_RAIZ = null;              // a pasta `Estudio`, uma acima: templates e pedidos
let EDIT_PECAS = [];               // os arquivos BRUTOS da leva escolhida
let EDIT_RECORTES = [];            // os B-rolls recortados no passo 2, quando já existem
let RECORTADO = null;              // { pecas, pasta, link } do recorte cumprido

/* DE ONDE O TEMPLATE TIRA AS PEÇAS. Desde que o recorte virou o passo 2, o passo do
   template trabalha em cima dos recortes e não mais do bruto: é o B-roll que entra na
   moldura, e ele já está sozinho no arquivo. Enquanto não houver recorte, o bruto serve,
   e assim nada quebra numa leva que ainda não passou pelo passo 2. */
/* AS PECAS DA LEVA QUE CONTINUAM VALENDO, no passo 1. */
function pecas1() { return EDIT_PECAS.filter(p => !EXCLUIDAS.has(p.nome)); }

/* AS PECAS DAS FASES DE DEPOIS. O filtro se repete aqui de proposito: quem foi tirado
   depois de o recorte ja' ter rodado continua com arquivo na pasta de recortes, e sem
   esta linha ele voltaria para a galeria da IA e para a montagem. */
function pecas3() {
  const base = EDIT_RECORTES.length ? EDIT_RECORTES : EDIT_PECAS;
  return base.filter(p => !EXCLUIDAS.has(p.nome));
}
let EDIT_RASCUNHO = null;          // o rascunho aberto, se veio de um
/* ELE PEDIU UMA EDIÇÃO NOVA DESTA LEVA, e não voltar à que já existe.

   Vale por UMA gravação: assim que o registro novo nasce com id próprio, `EDIT_RASCUNHO`
   passa a apontar para ele e a marca se apaga. Se ela ficasse de pé, cada gravação
   seguinte criaria mais um, e a leva 31 acabaria com um rascunho por segundo, que é uma
   versão pior do defeito que a trava 57 fechou. */
let EDICAO_NOVA = false;
/* AS LEVAS QUE JA' ACABARAM. Ver a nota dentro de `salvarRascunho`.
   Ela vive na aba, e nao no cofre, de proposito: quem manda de verdade e' a marca no
   acervo, que a tabela de minerados le'. Esta aqui so' impede a ressurreicao dentro da
   sessao em que a entrega aconteceu, que e' onde o relogio de 600 ms esta' armado. */
const ENCERRADAS = new Set();
/* O RASCUNHO QUE AINDA VAI SER RESTAURADO, e a declaracao mora aqui em cima de
   proposito: o `salvarRascunho`, logo abaixo, precisa consultar ele, e uma declaracao
   la' no fim do arquivo deixaria essa consulta na zona morta durante o carregamento. */
let RETOMAR = null;

const TEM_PORTA = typeof window.showDirectoryPicker === "function";

/* -------------------------------------------- o guarda-volumes do navegador

   Guarda duas coisas: o crachá da pasta, que é um objeto vivo e não cabe num lugar de
   texto simples, e os rascunhos.

   OS RASCUNHOS FICAM AQUI, E NÃO NO ACERVO, e isso é escolha com motivo. Escrever no
   acervo passa pela esteira, que leva de trinta a sessenta segundos por gravação: um
   rascunho que se salva sozinho a cada mexida não pode custar isso. O preço é que eles
   vivem neste navegador, nesta máquina. Se um dia precisarem seguir o Gabriel para outro
   computador, aí vale o custo de mandá-los para o acervo. */
const COFRE = { banco: "estudio", portas: "portas", rascunhos: "rascunhos", chave: "pasta-levas" };

function abrirCofre() {
  return new Promise((ok, erro) => {
    const p = indexedDB.open(COFRE.banco, 2);
    p.onupgradeneeded = () => {
      const db = p.result;
      if (!db.objectStoreNames.contains(COFRE.portas)) db.createObjectStore(COFRE.portas);
      if (!db.objectStoreNames.contains(COFRE.rascunhos))
        db.createObjectStore(COFRE.rascunhos, { keyPath: "id" });
    };
    p.onsuccess = () => ok(p.result);
    p.onerror = () => erro(p.error);
  });
}

async function noCofre(caixa, escrever, oQue) {
  try {
    const db = await abrirCofre();
    const t = db.transaction(caixa, escrever ? "readwrite" : "readonly");
    return await new Promise(ok => {
      const p = oQue(t.objectStore(caixa));
      p.onsuccess = () => ok(p.result);
      p.onerror = () => ok(null);
    });
  } catch (e) { return null; }
}

/* GUARDAR E CONFERIR QUE GUARDOU. A primeira versão só mandava gravar e seguia em
   frente, e o `noCofre` engole erro: se o guarda-volumes estivesse bloqueado, o crachá
   não ficava e ninguém sabia. Na visita seguinte a tela pedia a pasta de novo, como se a
   escolha nunca tivesse acontecido, e não havia como distinguir isso de "o navegador
   esqueceu". Agora ele lê de volta e diz na hora se não colou. */
async function guardarCracha(h) {
  await noCofre(COFRE.portas, true, s => s.put(h, COFRE.chave));
  const volta = await pegarCracha();
  return !!volta;
}
const pegarCracha = () => noCofre(COFRE.portas, false, s => s.get(COFRE.chave));

/** A pasta ainda vale? Devolve o crachá só quando a permissão está de pé.

   LER DEIXOU DE BASTAR EM 19/08/2026, e o motivo é o passo 2. Até aqui a tela só olhava
   os vídeos; agora ela guarda templates, deixa pedidos de montagem e lê o andamento
   deles, tudo dentro da pasta do Estúdio. Isso é GRAVAR, e o navegador trata as duas
   permissões como coisas separadas: quem tem uma não tem a outra.

   O preço é um clique a mais na primeira vez de cada visita, no mesmo cartão que já
   existia. Não há como pedir gravação sem o dedo dele, e não deveria haver. */
async function pastaValendo(handle, pedir) {
  if (!handle) return null;
  try {
    if (await handle.queryPermission({ mode: "readwrite" }) === "granted") return handle;
    // PEDIR DE NOVO SÓ COM O DEDO DELE NO BOTÃO. O navegador recusa o pedido feito
    // sozinho, ao abrir a página, e a recusa vem calada: parece que a pasta se perdeu.
    if (pedir && await handle.requestPermission({ mode: "readwrite" }) === "granted")
      return handle;
  } catch (e) { /* crachá velho de uma pasta que não existe mais */ }
  return null;
}

/* ------------------------------------------------- a raiz do Estúdio e a pasta `levas`

   O QUE A TELA APONTA MUDOU DE `levas` PARA `Estudio`, um nível acima. Antes bastava
   `levas`, porque só se lia vídeo. Agora o passo 2 precisa alcançar mais três pastas
   irmãs dela:

       Estudio/levas/leva-28/     os vídeos brutos, que nada aqui altera
       Estudio/templates/         o acervo, com as imagens e a ficha de cada uma
       Estudio/pedidos/           os pedidos de montagem e o andamento deles
       Estudio/edicoes/leva-28/   as peças montadas

   O CRACHÁ ANTIGO CONTINUA SERVINDO PARA O PASSO 1, e isso não é gentileza: é evitar que
   ele abra a aba e encontre a galeria vazia sem entender por quê. A diferença é
   descoberta olhando: se dentro do que ele apontou existe uma subpasta `levas`, aquilo é
   a raiz do Estúdio; se não existe, aquilo É a `levas` do crachá antigo, e o passo 2
   pede a pasta de cima quando for a hora. */
async function abrirRaiz(h) {
  if (!h) return { raiz: null, levas: null };
  try {
    return { raiz: h, levas: await h.getDirectoryHandle("levas") };
  } catch (e) { /* não tem `levas` dentro: é o crachá antigo */ }
  return { raiz: null, levas: h };
}

/** Uma pasta irmã dentro da raiz do Estúdio. Devolve null se a raiz não estiver na mão. */
async function pastaDo(nome, criar) {
  // NA CASA REMOTA A PASTA LOCAL É O DISCO ERRADO, e este é o ponto único que corta o
  // plano B inteiro de uma vez (auditoria de 25/08/2026): com a casa na VPS, ler ou
  // gravar na pasta desta máquina pintaria dado do mundo velho como se fosse da casa,
  // e um pedido gravado aqui nunca seria atendido por ninguém.
  if (SEM_PASTA_AQUI) return null;
  if (!EDIT_RAIZ) return null;
  try { return await EDIT_RAIZ.getDirectoryHandle(nome, { create: !!criar }); }
  catch (e) { return null; }
}

/* UM NOME DE PASTA QUE AINDA NÃO EXISTE, para montar de novo não apagar o que já estava.

   ESTA FUNÇÃO NÃO EXISTIA, e a falta dela custou a ferramenta inteira. O botão Montar,
   que é o último passo do sistema e o que entrega a peça pronta, chamava `nomeLivre(...)`
   na primeira linha, e nenhum lugar deste arquivo declarava esse nome. Toda montagem
   estourava ali, antes mesmo de deixar o pedido, e o recado que aparecia era o erro cru
   do navegador, em inglês, dentro da caixinha de "não deu para deixar o pedido". O disco
   conta o resto: 292 recortes prontos e a pasta `edicoes` completamente vazia.

   NADA PEGAVA. O `node --check` só olha gramática, e a gramática estava certa. O
   `conferir.py` e o `nomes.py` só vigiavam nome em MAIÚSCULA, porque a regra da casa diz
   que é lá que mora o estado da tela; nome de função é minúsculo e passava batido. E o
   `provar.py` não chegava a apertar esse botão. O `nomes.py` foi consertado junto com
   isto, e hoje ele acusa função chamada que ninguém escreveu.

   O FORMATO TEM DE BATER COM O `abrir.py`, que é quem abre essas pastas quando ele clica
   no link da tela: `leva-N` na primeira vez, e `leva-N (2)`, `leva-N (3)` nas seguintes.
   Mudar o formato aqui sem mudar lá faz o clique abrir a janela errada. */
async function nomeLivre(pasta, base) {
  for (let n = 1; n <= 99; n++) {
    const nome = n === 1 ? base : `${base} (${n})`;
    try {
      await pasta.getDirectoryHandle(nome);      // existe: tenta o próximo
    } catch (e) {
      // SÓ "NÃO EXISTE" LIBERA O NOME. Qualquer outro erro é o disco falando, e tratar
      // ele como pasta livre faria a montagem seguir para gravar onde não pode.
      if (e && e.name === "NotFoundError") return { nome, n };
      throw e;
    }
  }
  throw new Error(`já existem 99 montagens da ${base} na pasta de edições. `
    + `Apague as que não servem antes de montar de novo.`);
}

/* -------------------------------------------------------------- os rascunhos

   O RASCUNHO PASSOU A MORAR NA CASA EM 02/09/2026, e a pergunta dele foi a certa: "o
   rascunho nao fica salvo na VPS? Que sentido tem isso?". Nenhum.

   O QUE ACONTECEU. Todo o resto da leva ja' morava na casa: os recortes, as frases que a
   IA escreveu, os templates, as pecas montadas. So' o mapa de onde ele parou e o trabalho
   de mao (o enquadramento peca a peca, o ajuste de cada caixa, quais ele deu por prontas)
   dependia do guarda-volumes DESTE navegador. Esse banco some ao limpar dados do site, na
   janela anonima e em qualquer outra maquina. Sumiu, com a leva 31 dentro.

   O NAVEGADOR CONTINUA GUARDANDO A COPIA. Gravar nos dois e' de proposito: a casa e' a
   verdade, e o navegador e' quem responde quando ela nao atende (a vitrine do GitHub
   Pages e a pagina aberta de arquivo nao tem posto nenhum atras). */
let RASCUNHOS_DE = null;      // "casa" | "navegador" | null enquanto ninguém perguntou
let RASCUNHO_NA_CASA = null;  // a última gravação chegou na casa? null = não tentei

/* OS DOIS LADOS SE JUNTAM, e nao um substitui o outro.

   POR QUE JUNTAR E NAO TROCAR: no dia em que a casa virou a verdade, tudo o que ele ja'
   tinha estava SO' no navegador. Ler so' a casa faria a portaria abrir vazia para quem
   tinha rascunho, que e' exatamente o susto que originou esta mudanca, agora causado pelo
   conserto dele. Vale o mais recente de cada id, pela hora da ultima mexida.

   E O QUE SO' EXISTE AQUI SOBE, uma vez por visita: rascunho que continua so' no navegador
   continua a um clique de limpar dados do site de sumir para sempre. */
const RASCUNHOS_QUE_SUBIRAM = new Set();
async function listarRascunhos() {
  let daCasa = null;
  if (await postoDePe()) {
    try {
      const r = await noPosto("/rascunhos");
      if (r && Array.isArray(r.itens)) daCasa = r.itens;
    } catch (e) {
      /* A CASA ATENDE MAS NAO DEU: nao e' hora de dizer que nao ha' rascunho. Vale
         olhar a copia do navegador antes de concluir qualquer coisa. */
    }
  }
  const daqui = await noCofre(COFRE.rascunhos, false, s => s.getAll());
  if (daCasa === null && daqui === null) { RASCUNHOS_DE = null; return null; }
  RASCUNHOS_DE = daCasa === null ? "navegador" : "casa";
  const por = new Map();
  for (const r of (daqui || [])) if (r && r.id) por.set(r.id, r);
  for (const r of (daCasa || [])) {
    if (!r || !r.id) continue;
    const tem = por.get(r.id);
    if (!tem || (r.mexido || 0) >= (tem.mexido || 0)) por.set(r.id, r);
  }
  if (daCasa !== null) {
    const naCasa = new Set(daCasa.map(r => r && r.id));
    for (const r of (daqui || [])) {
      if (!r || !r.id || naCasa.has(r.id) || RASCUNHOS_QUE_SUBIRAM.has(r.id)) continue;
      RASCUNHOS_QUE_SUBIRAM.add(r.id);
      noPosto("/rascunhos", { r }).catch(() => RASCUNHOS_QUE_SUBIRAM.delete(r.id));
    }
  }
  return [...por.values()];
}

/* GRAVAR NOS DOIS, e dizer quando um dos dois nao aceitou. Gravacao que falha calada e' a
   propria doenca que esta secao existe para curar. */
async function guardarRascunho(r) {
  await noCofre(COFRE.rascunhos, true, s => s.put(r));
  if (!(await postoDePe())) { RASCUNHO_NA_CASA = null; return; }
  try {
    const d = await noPosto("/rascunhos", { r });
    RASCUNHO_NA_CASA = !!(d && d.ok);
  } catch (e) { RASCUNHO_NA_CASA = false; }
}

/* APAGAR NOS DOIS. Apagar so' de um lado ressuscita o rascunho na visita seguinte, que e'
   o mesmo defeito que ja' fez leva entregue voltar para a portaria. */
async function apagarRascunho(id) {
  await noCofre(COFRE.rascunhos, true, s => s.delete(id));
  if (!(await postoDePe())) return;
  try { await noPosto("/rascunho-apagar", { id }); } catch (e) { /* fica para a proxima */ }
}

/* A GRAVACAO DO RASCUNHO E' UMA POR VEZ, em fila. A fabrica dos repetidos morava
   aqui: na PRIMEIRA entrada de uma leva, a gravacao da entrada e a do relogio de
   600 ms disparavam quase juntas; as duas procuravam o rascunho da leva, nenhuma
   achava (a outra ainda nao tinha gravado), e cada uma criava o seu, com id proprio.
   "Sempre fica gerando 2", 26/08/2026. Na fila, a segunda ja' encontra o da primeira. */
let RASCUNHO_NA_VEZ = Promise.resolve();
function salvarRascunho() {
  const vez = RASCUNHO_NA_VEZ.then(() => salvarRascunhoDeVerdade());
  RASCUNHO_NA_VEZ = vez.catch(() => {});
  return vez;
}

async function salvarRascunhoDeVerdade() {
  if (!EDIT_LEVA) return;
  /* ENQUANTO A RESTAURACAO NAO ACONTECEU, ESTA TELA NAO TEM O QUE GRAVAR.

     ABRIR UM RASCUNHO ANTES DE LIBERAR A PASTA APAGAVA O RASCUNHO. O `entrarNaOficina`
     pendura o que deve ser restaurado em `RETOMAR` e, na mesma volta, grava. So' que
     nesse instante `ESCRITO` e `AJUSTES` ainda estao vazios e `TPL` ainda e' nulo: a
     restauracao so' acontece depois que as pecas chegam, e as pecas so' chegam depois da
     permissao da pasta. Resultado: ele clicava no cartao do rascunho, o navegador ainda
     nao tinha liberado nada, e a gravacao passava por cima com o vazio. As frases da IA
     iam junto, e refazer 107 frases custa 107 pedidos de uma cota que tem teto por dia.

     QUEM DESTRAVA E' O PROPRIO `tentarRetomar`: ele zera o `RETOMAR` antes de trabalhar
     e grava no fim. Se a restauracao nunca acontecer, o rascunho fica intocado no disco,
     que e' exatamente o certo. */
  if (RETOMAR) return;
  /* LEVA ENCERRADA NAO VOLTA A SER RASCUNHO, e sem esta linha ela voltava.

     O QUE ELE VIU, DUAS VEZES: "nao sei por que ainda aparece como rascunho, sendo que
     deveria estar ja' como finalizado" e depois "quando em tese finalizou tudo, a aba de
     rascunho nao foi finalizada".

     E APAGAR O REGISTRO NAO RESOLVIA. Esta funcao e' chamada de quatorze lugares, mais um
     relogio de 600 ms a cada mexida na tela. Quando ela nao acha um rascunho da leva, ela
     CRIA UM NOVO. Entao apagar so' adiantava ate' a proxima mexida, e o rascunho
     ressuscitava com outro numero, parecendo que o apagar nunca tinha funcionado.

     A MARCA E' DA LEVA, E NAO DO REGISTRO. Enquanto o registro pode ser apagado e
     recriado, o numero da leva encerrada fica, e e' ele que fecha a porta. */
  if (ENCERRADAS.has(EDIT_LEVA.numero)) return;
  // RASCUNHO DE OUTRA LEVA NO BOLSO NAO SERVE: entrar na leva 31 com o registro da 30
  // ainda carregado reescreveria o registro da 30 como se fosse da 31, e a portaria
  // ganharia um repetido convertido.
  if (EDIT_RASCUNHO && EDIT_RASCUNHO.leva !== EDIT_LEVA.numero) EDIT_RASCUNHO = null;
  // UM RASCUNHO POR LEVA, e não um por vez que ele abre a leva; havendo mais de um no
  // cofre (herança dos repetidos), vale o MAIS RECENTE, nunca o primeiro que aparecer.
  //
  // MENOS QUANDO ELE PEDIU UMA EDIÇÃO NOVA (02/09/2026). A adoção aqui é a defesa contra
  // o repetido que nasce SOZINHO, e ela vale enquanto ninguém pediu o contrário: com
  // `EDICAO_NOVA` esta gravação cria o registro dela, com id próprio, e o trabalho que
  // já existia fica intacto na portaria. Sem esta linha o botão "Começar Do Zero" seria
  // teatro: a primeira gravação adotaria o rascunho antigo e escreveria por cima dele.
  if (!EDIT_RASCUNHO && !EDICAO_NOVA) {
    const todos = (await listarRascunhos()) || [];
    EDIT_RASCUNHO = todos.filter(x => x.leva === EDIT_LEVA.numero)
                         .sort((a, b) => (b.mexido || 0) - (a.mexido || 0))[0] || null;
  }
  /* O RASCUNHO GUARDA ONDE ELE PAROU, e não só o número do passo.

     ELE NÃO GUARDAVA NADA DISSO, e o Gabriel bateu de frente com isso em 20/08/2026: ele
     tinha parado no último sub-passo, já com o template pronto, e ao abrir o rascunho no
     dia seguinte voltou para o começo, com tudo perdido. A frase foi certeira: "assim o
     rascunho nem tem serventia, nem faz sentido existir".

     O RECORTE NÃO PRECISA SER GUARDADO AQUI, porque ele mora em disco, na pasta
     `recortes/leva-N`.

     O DESENHO DO TEMPLATE PRECISA, e até 22/08/2026 não era. O comentário que ficava
     aqui dizia que o template morava em disco e que guardar cópia seria arriscar duas
     versões discordando. Só que ele SÓ chega ao disco quando o Gabriel clica em
     "Guardar no acervo" ou em "Montar": até lá a cor de fundo e as caixas de texto
     existem apenas na memória desta aba. Ele escolheu a cor, escreveu as caixas, deu F5
     e voltou para um template preto e vazio. A frase dele, em 22/08/2026: "eu avancei
     ali da etapa de escolher a cor, de colocar texto. Dou um F5, aquilo não fica salvo".

     AS DUAS VERSÕES CONTINUAM PODENDO DISCORDAR, e por isso vai junto a hora da última
     mexida na bancada. Quem retoma compara essa hora com a data do arquivo no acervo e
     fica com a mais nova, em vez de escolher no chute.

     A IMAGEM NÃO ENTRA AQUI, só o nome dela: o arquivo em si já foi para o acervo no
     instante em que ele a soltou na tela. */
  /* O DESENHO DA BANCADA SÓ É SUBSTITUÍDO POR OUTRO DESENHO DE VERDADE.

     Enquanto a pasta do Estúdio não é liberada, entrar no passo do template cria uma
     composição vazia, com identificador novo. Sem esta guarda, essa composição vazia
     gravaria por cima do desenho que ele tinha feito, e o F5 continuaria apagando tudo,
     agora por outro caminho. */
  let desenho = EDIT_RASCUNHO ? (EDIT_RASCUNHO.desenho || null) : null;
  let desenhoEm = EDIT_RASCUNHO ? (EDIT_RASCUNHO.desenhoEm || 0) : 0;
  if (TPL && ((TPL.elementos || []).length || !desenho || desenho.id === TPL.id)) {
    desenho = JSON.parse(JSON.stringify(TPL));
    desenhoEm = Date.now();
  }
  const r = {
    id: EDIT_RASCUNHO ? EDIT_RASCUNHO.id : `e${Date.now()}`,
    leva: EDIT_LEVA.numero,
    // A VERSÃO DA NUMERAÇÃO DOS PASSOS. Em 20/08/2026 o recorte entrou como passo 2 e
    // empurrou template para 3 e legenda para 4. Rascunho gravado antes disso guarda um
    // "2" que quer dizer template, e abriria no recorte: com a marca aqui, o restaurador
    // sabe deslocar. Sem ela o rascunho velho abriria no passo errado em silêncio.
    v: 3,
    /* O QUE A IA ESCREVEU E O QUE ELE AJUSTOU ENTRAM AQUI, e antes não entravam.

       ELE PERGUNTOU POR QUE O RASCUNHO NÃO GUARDAVA O TEXTO NEM A IMAGEM, e a resposta era
       feia: o rascunho guardava só ONDE ele tinha parado, e nada do que ele tinha feito.
       Um F5 depois de a IA escrever 107 frases jogava fora as 107, e refazê-las custa 107
       pedidos de uma cota que tem teto por dia. Perder trabalho é ruim; perder trabalho que
       custa cota é pior, porque não dá para simplesmente refazer na hora.

       O TEMPLATE PASSOU A ENTRAR AQUI TAMBÉM, logo abaixo, pelo mesmo motivo: ele só vai
       para o disco quando ele manda, e antes disso mora só na memória desta aba. */
    escrito: Object.fromEntries(ESCRITO),
    ajustes: Object.fromEntries(AJUSTES),
    /* A ETAPA 4 TAMBÉM MORA AQUI, pelo mesmo motivo de tudo o mais nesta lista: cada
       descrição custou um pedido de uma cota que tem teto por dia, e um F5 sem isto
       jogaria fora cento e sete delas. O fecho vai junto porque é escolha dele, e
       reescrever a mesma frase toda vez que a página abre é trabalho repetido à toa. */
    descricoes: Object.fromEntries(DESCRICOES),
    rodape: RODAPE == null ? RODAPE_PADRAO : RODAPE,
    // O TETO DA DESCRIÇÃO TAMBÉM É ESCOLHA DELE: sem esta linha, um F5 devolvia 500
    // com ele trabalhando em outro número. Auditoria de 25/08/2026.
    limite: Number(($("dsc_max") || {}).value) || 500,
    subLeg: LEG_SUB,
    // O ENQUADRAMENTO E QUEM MEXEU. Mesma razao dos de cima: mora so' nesta aba ate'
    // o pedido de montagem sair, e um F5 no meio jogaria fora o trabalho de mao.
    enquadres: Object.fromEntries(ENQUADRES),
    aMao: [...A_MAO],
    // AS QUE ELE JA' ASSINOU. Ver a nota em `PRONTAS`.
    prontas: [...PRONTAS],
    // AS PECAS QUE ELE TIROU DA LEVA. Sem isto, um F5 trazia de volta os dez reels que
    // ele tinha acabado de descartar, e eles voltariam a passar por todas as etapas.
    excluidas: [...EXCLUIDAS],
    contas: EDIT_LEVA.contas || [],
    // O CARTAO DA PORTARIA MOSTRA ESTE NUMERO, entao ele e' o das pecas que vao
    // sair, e nao o das que estao na pasta. Rascunho dizendo 107 e a tela dizendo
    // 94 sao dois numeros contrarios sobre a mesma leva.
    pecas: pecas1().length,
    passo: EDIT_PASSO,
    sub: TPL_SUB,
    /* O CARIMBO DA NUMERACAO. Em 26/08/2026 o passo 3 ganhou uma fase na frente e todas
       as outras deslizaram um numero. Rascunho gravado antes disso nao tem este campo, e
       e' por essa falta que a retomada sabe que precisa somar um. */
    subv: 2,
    /* O DESENHO INTEIRO, e não só o nome dele. Ver o comentário lá em cima. */
    desenho, desenhoEm,
    template: desenho ? desenho.id : (TPL ? TPL.id : null),
    /* OS VIGIAS EM CURSO, desde 25/08/2026. Um F5 no meio de um recorte, de uma
       montagem ou de uma entrega perdia a vigia: a oficina seguia trabalhando e a
       tela voltava muda, como se nada tivesse sido pedido. O rascunho guarda o id
       de cada pedido vigiado; quem retoma so' rearma o que ainda esta' vivo, e o
       que ja' fechou fica com o re-scan de cada passo, que e' quem diz o fim de
       verdade. Escrever e descrever ficam de fora porque o produto deles ja' entra
       aqui em cima a cada olhada (escrito, descricoes). */
    vigias: {
      rec: REC_OBRA ? { id: REC_OBRA.id, total: REC_OBRA.total,
                        desde: REC_OBRA.desde } : null,
      mont: OBRA ? { id: OBRA.id, total: OBRA.total, qual: OBRA.qual,
                     desde: OBRA.desde } : null,
      ent: ENT_OBRA ? { id: ENT_OBRA.id, total: ENT_OBRA.total,
                        subir: ENT_OBRA.subir, desde: ENT_OBRA.desde } : null,
    },
    mexido: Math.floor(Date.now() / 1000),
  };
  if (!EDIT_RASCUNHO) r.aberto = r.mexido;
  else r.aberto = EDIT_RASCUNHO.aberto || r.mexido;
  EDIT_RASCUNHO = r;
  // A MARCA VALE POR UMA GRAVAÇÃO SÓ. O registro novo já nasceu com id próprio na linha
  // de cima; deixá-la de pé faria a gravação seguinte criar mais um, e mais um, porque o
  // que a adoção impede é justamente isso.
  EDICAO_NOVA = false;
  await guardarRascunho(r);
  // A LISTA SÓ SE REDESENHA QUANDO ELA ESTÁ NA FRENTE DELE. Redesenhar a portaria a cada
  // gravação significa reler o banco do navegador inteiro no meio de um arrasto.
  if (!$("ed_portaria").hidden) desenhaRascunhos();
}

/* GRAVAR DEPOIS QUE A MÃO PARA, e não a cada quadro do arrasto. Mexer no enquadramento
   dispara dezenas de mudanças por segundo; gravar em todas encheria o banco do navegador
   de escrita à toa e engasgaria o arrasto. Seiscentos milissegundos de silêncio bastam
   para saber que ele parou de mexer. */
let RELOGIO_DO_RASCUNHO = null;
function anotarMexida() {
  if (RELOGIO_DO_RASCUNHO) clearTimeout(RELOGIO_DO_RASCUNHO);
  RELOGIO_DO_RASCUNHO = setTimeout(() => {
    RELOGIO_DO_RASCUNHO = null;
    salvarRascunho();
  }, 600);
}

/** A frase do cartão: onde ele parou, em palavras, e não "no passo 2". */
function ondeParou(r) {
  const passo = r.passo || 1;
  if (passo < 2) return "vendo as peças da leva";
  if (passo === 2) return "no recorte do B-roll";
  if (passo >= 4) return "na legenda";
  return ["", "escolhendo o template", "montando o template",
          "pronto para montar"][r.sub || 1] || "no template";
}

/* "NAO CONSEGUI LER" E "NAO EXISTE" SAO COISAS DIFERENTES (trava 4).
   O `noCofre` engole a falha e devolve nada, e esta lista transformava esse nada em
   "nenhum rascunho guardado". Guarda-volumes bloqueado pelo navegador, aba anônima ou
   banco corrompido davam a MESMA frase de uma leva que nunca foi começada, e o trabalho
   de dias parecia ter sumido sem deixar rastro. Agora a tela diz qual dos dois é. */
async function desenhaRascunhos() {
  const bruta = await listarRascunhos();
  const naoLeu = bruta === null;
  const lista = bruta || [];
  lista.sort((a, b) => (b.mexido || 0) - (a.mexido || 0));
  $("ed_rasc_vazio").textContent = naoLeu
    ? "Não consegui ler nem o Estúdio nem o guarda-volumes deste navegador, então não "
      + "sei dizer se há rascunho. Isto não apaga nada. Recarregue a página; se voltar "
      + "esta mesma linha, o Estúdio está fora do ar."
    : "Nenhum rascunho guardado. O que você começar fica no Estúdio, e some só quando "
      + "você mandar.";
  $("ed_rasc_vazio").classList.toggle("alerta", naoLeu);
  $("ed_rasc_vazio").hidden = lista.length > 0;
  /* ONDE ELES ESTAO GUARDADOS FICA ESCRITO, e nao e' detalhe: rascunho que mora so' no
     navegador some com uma limpeza de dados do site, e ele tem o direito de saber disso
     ANTES de perder a leva, e nao depois. */
  $("ed_rasc_conta").textContent = lista.length
    ? `${lista.length} ${lista.length === 1 ? "guardado" : "guardados"}`
      + (RASCUNHOS_DE === "casa" ? " no Estúdio" : " só neste navegador")
    : "";
  const aviso = $("ed_rasc_onde");
  if (aviso) {
    const soAqui = !naoLeu && RASCUNHOS_DE === "navegador";
    const naoColou = RASCUNHO_NA_CASA === false;
    aviso.hidden = !(soAqui || naoColou);
    aviso.classList.toggle("alerta", naoColou);
    if (naoColou) {
      aviso.textContent = "O Estúdio não aceitou a última gravação do rascunho. Ele "
        + "ainda está guardado neste navegador, mas não saia daqui sem conferir: "
        + "guardado só no navegador some se você limpar os dados do site.";
    } else if (soAqui) {
      aviso.textContent = "O Estúdio não respondeu, então estes rascunhos são a cópia "
        + "deste navegador. Ela some se você limpar os dados do site.";
    }
  }
  $("ed_rasc_lista").innerHTML = lista.map(r => `
    <div class="ed-rasc" data-rasc="${r.id}">
      <span class="ed-rasc-n">Leva ${r.leva}</span>
      <span class="ed-rasc-quem">${(r.contas || []).length
        ? "@" + r.contas.join(", @") : "todos os perfis"}</span>
      <span class="ed-rasc-onde">${ondeParou(r)}${
        r.pecas ? ` · ${r.pecas} peças` : ""}</span>
      <span class="ed-rasc-quando">${quando(r.mexido)}</span>
      <button class="ed-rasc-x" type="button" data-apagar="${r.id}"
              title="Apagar o rascunho">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>`).join("");
}

$("ed_rasc_lista").addEventListener("click", async ev => {
  const x = ev.target.closest("[data-apagar]");
  if (x) {
    ev.stopPropagation();
    await apagarRascunho(x.dataset.apagar);
    return desenhaRascunhos();
  }
  const linha = ev.target.closest("[data-rasc]");
  if (!linha) return;
  const todos = (await listarRascunhos()) || [];
  const r = todos.find(x => x.id === linha.dataset.rasc);
  if (!r) return;
  EDIT_RASCUNHO = r;
  EDIT_LEVA = (LOTES || []).find(l => l.numero === r.leva) || { numero: r.leva };
  await entrarNaOficina(r.passo || 1, r);
});

/* ----------------------------------------------------- trocar de tela

   A OFICINA TIRA O CABECALHO DE CENA. Pedido do Gabriel em 19/08/2026, e a razao e' boa:
   editar quarenta e uma pecas e' trabalho de tela cheia, e a barra com Mineracao, Baixar
   e Edicao ali em cima nao serve para nada enquanto ele esta' dentro de uma leva. Sai a
   barra, sai o rodape, e a oficina ocupa o vidro inteiro.

   Com o cabecalho fora, a saida passa a ser responsabilidade desta tela: e' o botao
   `ed_sair`, no alto. Sem ele, o unico jeito de voltar seria recarregar a pagina. */
function focar(sim) {
  document.body.classList.toggle("ed-focado", !!sim);
}

/* A TELA QUE SAI TAMBÉM SE MEXE, e é isso que faz a troca parecer fluida em vez de um
   corte. Antes uma sumia e a outra aparecia no mesmo quadro: o olho perde o fio e a
   impressão é de tranco, por mais bonita que seja a entrada da seguinte.

   São 130 milissegundos de saída, curtos de propósito: o suficiente para o olho
   acompanhar, pouco o bastante para não virar espera. */
const TELAS = { portaria: "ed_portaria", escolha: "ed_escolha", oficina: "ed_oficina" };

function trocarAgora(qual) {
  for (const [nome, id] of Object.entries(TELAS)) {
    const el = $(id);
    el.hidden = nome !== qual;
    el.classList.remove("saindo");
  }
  focar(qual === "oficina");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function mostrarTela(qual, jaJa) {
  const saindo = Object.values(TELAS).map(id => $(id)).find(el => !el.hidden);
  if (jaJa || !saindo || saindo.id === TELAS[qual]) return trocarAgora(qual);
  saindo.classList.add("saindo");
  setTimeout(() => trocarAgora(qual), 130);
}

$("ed_nova").onclick = () => {
  EDIT_RASCUNHO = null;
  EDIT_LEVA = null;
  desenhaLevasDaEdicao(ULTIMO_INDICE).catch(() => {});
  mostrarTela("escolha");
};
$("ed_volta_portaria").onclick = () => mostrarTela("portaria");
$("ed_sair").onclick = () => {
  salvarRascunho();
  try { localStorage.removeItem("estudio.leva.aberta"); } catch (e) {}
  mostrarTela("portaria");
};
$("ed_volta_escolha").onclick = () => {
  try { localStorage.removeItem("estudio.leva.aberta"); } catch (e) {}
  desenhaLevasDaEdicao(ULTIMO_INDICE).catch(() => {});
  mostrarTela("escolha");
};

/* ------------------------------------------------- a escolha da leva

   A LISTA VEM DO ACERVO, e não da pasta. É o acervo que sabe o que cada leva é: de quais
   perfis, quantas peças, se já foi guardada. A pasta sabe só que há arquivos dentro dela.
   Leva que ainda não chegou à casa do Estúdio aparece na lista, apagada, dizendo por quê:
   escondê-la faria o Gabriel procurar uma leva que ele sabe que existe. */
/* O TRABALHO JA' FEITO APARECE NO CARTAO, E A ESCOLHA E' DELE.

   O QUE ELE ENCONTROU EM 02/09/2026: "clica em iniciar nova edicao, selecionar leva, ele
   ja' vai la' pra aba la' da frente. Nao deveria acontecer isso." Estava certo, e o botao
   estava mentindo: chamava-se Iniciar Nova Edicao e nunca iniciava nada, porque a escolha
   da leva SEMPRE retomava o rascunho mais recente dela.

   O COMPORTAMENTO NAO ERA BOBAGEM, e por isso ele nao morre: ele nasceu na trava 57, para
   matar os rascunhos repetidos que a corrida de duas gravacoes fabricava ("sempre fica
   gerando 2"). Retomar era o jeito de nao criar registro novo ao lado do existente.

   A DIFERENCA E' ACIDENTE E INTENCAO. O que a trava 57 impede continua impedido: dois
   rascunhos nascidos sozinhos, sem ninguem pedir. O que ela nao devia impedir e' ele
   PEDIR uma edicao nova. Agora a leva com trabalho salvo diz isso no proprio cartao e
   oferece os dois caminhos, antes de entrar: o cartao continua sendo "voltar ao
   trabalho", e o botao ao lado comeca do zero sem tocar no que ja' existe. */
async function desenhaLevasDaEdicao(indice) {
  const levas = ((indice && indice.lotes) || [])
    .filter(l => l.estado === "pronto" && l.limpos);
  if (!$("ed_sem_leva")) return;
  $("ed_sem_leva").hidden = levas.length > 0;
  // O QUE JA' EXISTE, POR LEVA. Falhou a leitura, o cartao sai sem a linha: dizer "nao
  // ha' trabalho salvo" sem ter conseguido perguntar seria a mentira da trava 2.
  let salvos = null;
  try { salvos = (await listarRascunhos()) || []; } catch (e) { salvos = null; }
  const oQueTem = (n) => salvos === null ? null
    : salvos.filter(x => x.leva === n).sort((a, b) => (b.mexido || 0) - (a.mexido || 0));
  $("ed_levas").innerHTML = levas.map(l => {
    const jaTem = oQueTem(l.numero);
    const antes = jaTem && jaTem.length ? jaTem[0] : null;
    const contas = l.contas || [];
    const aqui = !!l.guardado;
    // O RETRATO DO PERFIL, o mesmo que a tabela e a fileira usam. Uma leva é sempre de
    // alguém, e reconhecer de quem pela cara é mais rápido do que ler o arroba.
    const caras = contas.slice(0, 3).map(c =>
      retrato(MINERADOS.find(p => p.conta === c) || { conta: c, foto: false })).join("");
    // O QUE O RASCUNHO DIZ, em palavra dele: o passo por nome, e quando foi a última
    // mexida. "Passo 3" sozinho não diz nada a quem não conta passo de cabeça.
    const NOME_DO_PASSO = { 1: "a seleção da leva", 2: "o recorte do B-roll",
                            3: "a montagem da peça", 4: "a legenda e a entrega" };
    const conta = antes
      ? `você parou n${NOME_DO_PASSO[antes.passo] ? "" : "o passo "}`
        + `${NOME_DO_PASSO[antes.passo] || antes.passo}, ${quando(antes.mexido)}`
      : "";
    return `<div class="ed-leva-linha">
      <button type="button" class="ed-leva${!aqui ? " longe" : ""}"
        data-leva="${l.numero}"${aqui ? "" : " disabled"}>
      <span class="ed-leva-caras">${caras}</span>
      <span class="ed-leva-corpo">
        <span class="ed-leva-n">Leva ${l.numero}</span>
        <span class="ed-leva-quem">${contas.length
          ? "@" + contas.join(", @") : "todos os perfis"}</span>
        <span class="ed-leva-num"><b>${num(l.limpos)}</b> peças
          <i>·</i> ${l.mb || 0} MB <i>·</i> ${quando(l.fim || l.inicio)}</span>
        ${antes ? `<span class="ed-leva-antes">${escapa(conta)}</span>` : ""}
      </span>
      <span class="ed-leva-pe">${!aqui ? "ainda não chegou à casa do Estúdio"
        : antes ? "voltar a este trabalho" : "na casa do Estúdio"}</span>
      </button>
      ${aqui && antes ? `<button type="button" class="acao ed-leva-nova"
        data-nova="${l.numero}"
        title="Começa uma edição do zero, sem tocar no trabalho que já está salvo">
        Começar Do Zero</button>` : ""}
    </div>`;
  }).join("");
}

$("ed_levas").addEventListener("click", async ev => {
  /* COMEÇAR DO ZERO E' PEDIDO, E NAO ACIDENTE (02/09/2026).
     O rascunho que ja' existe fica onde esta', inteiro, e continua na portaria: esta
     edicao nasce ao lado dele, com id proprio. `EDICAO_NOVA` e' o que impede a gravacao
     de ADOTAR o antigo no caminho, que e' o que fazia toda edicao nova virar a mesma. */
  const zero = ev.target.closest("[data-nova]");
  if (zero) {
    ev.stopPropagation();
    const n = Number(zero.dataset.nova);
    EDIT_LEVA = (LOTES || []).find(l => l.numero === n) || { numero: n };
    EDIT_RASCUNHO = null;
    EDICAO_NOVA = true;
    esquecerOsPassos();
    await entrarNaOficina(1, undefined);
    return;
  }
  const b = ev.target.closest("[data-leva]");
  if (!b) return;
  const n = Number(b.dataset.leva);
  EDIT_LEVA = (LOTES || []).find(l => l.numero === n) || { numero: n };
  EDICAO_NOVA = false;
  b.classList.add("indo");
  /* ESCOLHER A LEVA E' VOLTAR AO TRABALHO DELA, quando ja' ha' trabalho: o caminho da
     escolha entrava sempre zerado, criando registro novo ao lado do existente e
     jogando fora o passo em que ele estava. Um rascunho por leva vale tambem aqui:
     havendo um, ele abre no passo salvo, com os vigias; sem nenhum, comeca do um. */
  const todos = (await listarRascunhos()) || [];
  const r = todos.filter(x => x.leva === n)
                 .sort((a, b) => (b.mexido || 0) - (a.mexido || 0))[0] || null;
  EDIT_RASCUNHO = r;
  await entrarNaOficina(r ? (r.passo || 1) : 1, r || undefined);
});

/* ------------------------------------------------- entrar na oficina

   A ANIMAÇÃO NÃO É ENFEITE: ela é o que separa "escolhi" de "comecei". As barras do
   trilho nascem em zero e sobem, e os passos entram um atrás do outro. Sem isso a troca
   de tela é um pisca, e a oficina parece que já estava aberta. */
async function entrarNaOficina(passo, rasc) {
  // ENTRAR NA OFICINA NÃO ESPERA NADA, e essa foi a queixa do Gabriel em 19/08/2026:
  // depois dos ajustes de fluidez ele sentiu a troca MAIS lenta, e estava certo. Eu
  // tinha somado 130 milissegundos de saída da tela anterior a 380 de entrada desta,
  // mais uma gravação de rascunho esperada antes de qualquer pixel. Meio segundo entre
  // o clique e o primeiro sinal de vida é tempo demais para uma troca de tela.
  //
  // A saída suave continua valendo para os outros caminhos, onde não há nada carregando
  // atrás. Aqui não: clicou na leva, a oficina está lá.
  mostrarTela("oficina", true);
  /* A LEVA ABERTA FICA ANOTADA NO NAVEGADOR, e e' ela que o F5 reabre sozinho: ele
     deu F5 no meio do recorte e a tela o largou na portaria, sem leva e sem status
     ("saiu da pagina que eu estava"). Sair da edicao ou trocar de leva desanota. */
  try { localStorage.setItem("estudio.leva.aberta", String(EDIT_LEVA.numero)); }
  catch (e) {}
  $("ed_r1").textContent = `leva ${EDIT_LEVA.numero}`;
  $("ed_p1_titulo").lastChild.textContent = `Leva ${EDIT_LEVA.numero}`;
  $("ed_p1_n").textContent = num(EDIT_LEVA.limpos || 0);
  $("ed_p1_qual").textContent = (EDIT_LEVA.limpos === 1) ? "peça" : "peças";

  // as barras voltam a zero antes de subir, senão não há o que animar na segunda entrada
  document.querySelectorAll("#ed_trilho .ed-barra b").forEach(b => b.style.height = "0%");
  $("ed_trilho").classList.remove("entrou");
  void $("ed_trilho").offsetWidth;          // força o navegador a aceitar o recomeço
  $("ed_trilho").classList.add("entrou");

  // O QUE RETOMAR FICA GUARDADO AQUI ATÉ O ACERVO ABRIR. O passo 2 só consegue voltar
  // ao lugar certo depois de ler o acervo de templates, que mora numa pasta do disco e
  // demora alguns milissegundos. Guardar o rascunho num canto e deixar o passo 2 pegá-lo
  // quando estiver pronto evita uma corrida entre as duas coisas.
  RETOMAR = rasc || null;
  /* A MONTAGEM DE UMA LEVA NAO PODE APARECER DENTRO DE OUTRA.

     O `esquecerOsPassos` so' rodava para leva NOVA. Entrando por um rascunho, o
     `MONTADO` da leva anterior continuava pendurado na memoria da aba: a leva 29 abria
     ja' dizendo "41 pecas montadas", com o botao de montar escondido, porque a 28 tinha
     sido montada minutos antes. O rascunho tem passo e template proprios, mas nao tem
     montagem: ela mora no disco, na pasta `edicoes`.

     ENTAO ZERA SEMPRE, e quem sabe se ja' houve montagem desta leva e' o disco. */
  MONTADO = null;
  if (!rasc) esquecerOsPassos();     // leva nova entra limpa, sem herdar a anterior
  // RASCUNHO DA NUMERAÇÃO ANTIGA se desloca um passo para a frente: o que era template
  // virou 3, o que vinha depois virou 4, e o recorte tomou o 2.
  if (rasc && !rasc.v && passo >= 2) passo = passo + 1;

  // AS PEÇAS PRIMEIRO. Sem elas não há vídeo de exemplo para retomar, e o passo 2 fica
  // preso no sub-passo 1 por falta de peça, que era exatamente o sintoma.
  await mostrarPecas();
  irParaPasso(passo || 1);
  if ((passo || 1) < 2) salvarRascunho();
}

/** Esquece os passos 2, 3 e 4. Leva nova entra limpa, sem herdar nada da anterior. */
function esquecerOsPassos() {
  EXCLUIDAS = new Set();          // leva nova nao herda o que foi tirado da anterior
  MONTADO = null;
  RECORTADO = null;
  EDIT_RECORTES = [];
  // AS PECAS E A FICHA DA LEVA ANTERIOR TAMBEM MORREM AQUI, achado da auditoria de
  // 25/08/2026: sem estas tres linhas, abrir uma leva que ainda nao chegou deixava a
  // galeria vazia com pecas1() cheio da leva anterior, e o passo 2 oferecia recortar
  // os arquivos errados; SEM_FRASE e BROLL_DE atravessavam junto.
  EDIT_PECAS = [];
  SEM_FRASE = null;
  BROLL_DE = null;
  MODO_DE = null;
  REC_NOME = "";
  REC_ACHADO = null;
  TPL = null;
  TPL_SUB = 1;
  ED_BROLL_I = -1;
  // O ESTADO DA FASE 1 TAMBEM MORRE AQUI (revisao de 27/08/2026): MP_PECA da leva
  // anterior apontava peca que a nova nao tem, a conta caia no padrao de tela cheia e
  // o recado afirmava a escolha de uma peca fantasma.
  MP_CONTA = "";
  MP_PECA = -1;
  MP_VAR = null;
  ESCRITO.clear();
  AJUSTES.clear();
  // A FASE 5 TAMBEM ZERA. Sem isto, o enquadramento de uma leva atravessaria para a
  // proxima e o B-roll de outra peca abriria torto, sem ninguem ter pedido.
  ENQUADRES.clear();
  A_MAO.clear();
  PRONTAS.clear();
  AJ_I = 0;
  AJ_SEL = null;
  desenhaFeito();
}

/* -------------------------------------------------------------- o trilho */
function irParaPasso(n) {
  EDIT_PASSO = n;
  document.querySelectorAll("#ed_trilho .ed-ponto").forEach(p => {
    const q = Number(p.dataset.passo);
    p.classList.toggle("ativo", q <= n);
    // ONDE ELE ESTA' AGORA, que é diferente de por onde ele já passou. `ativo` marca
    // todos os passos vencidos; `agora` marca um só, e é ele que abre a lista de
    // subetapas. Sem esta linha o trilho mostrava as subetapas do 3 com ele no 4.
    p.classList.toggle("agora", q === n);
    // A BARRA CHEIA É PASSO RESOLVIDO; a do passo atual mostra o quanto dele já foi
    // feito. No passo 1, resolvido quer dizer leva escolhida, e ela já está.
    const barra = p.querySelector(".ed-barra b");
    if (barra) barra.style.height = q < n ? "100%" : q === n ? (EDIT_LEVA ? "100%" : "0%") : "0%";
  });
  document.querySelectorAll(".ed-etapa").forEach(s =>
    s.hidden = Number(s.dataset.passo) !== n);
  if (n === 2) entrarNoRecorte();
  if (n === 3) entrarNoTemplate();
  if (n === 4) entrarNaLegenda();
  porOModoEsteira();
  window.scrollTo({ top: 0, behavior: "instant" });
}

/* CLICAR NO PASSO 4 TEM DE FAZER ALGUMA COISA, nem que seja explicar por que não dá.

   O QUE HAVIA: `if (n > 3 && !MONTADO) return;`. Um `return` calado. Quem clicasse no
   passo 4 sem o `MONTADO` na memória da aba via a tela não se mexer, sem erro e sem
   aviso, e foi exatamente o que ele descreveu em 23/08/2026: "eu clico na opção 4 e não
   consigo, ele recarrega a página da subetapa peça a peça".

   E ERA UM NÓ, não uma trava: quem descobre a montagem no disco é `procurarMontagem`, e
   até 23/08 ela só era chamada de dentro do passo 4. Sem entrar não se descobria, e sem
   descobrir não se entrava. Bastava a busca da carga falhar uma vez (pasta não liberada
   ainda, leva aberta por outro caminho) para o passo 4 ficar trancado com as peças
   montadas na pasta ao lado.

   AGORA O CLIQUE SEMPRE ENTRA, e quem pergunta ao disco é o próprio passo 4:
   `entrarNaLegenda` chama `procurarMontagem` quando o `MONTADO` está vazio. Não havendo
   montagem nenhuma, ele entra assim mesmo e a tela DIZ que não achou, e o que fazer para
   resolver. Botão que não faz nada é pior do que botão nenhum, porque promete. */
document.querySelectorAll("#ed_trilho .ed-ponto").forEach(p => {
  p.addEventListener("click", async () => {
    const n = Number(p.dataset.passo);
    // VOLTAR SEMPRE PODE; AVANÇAR, SÓ COM O PASSO ANTERIOR RESOLVIDO. É o que faz disto
    // um passo a passo e não um menu com quatro páginas soltas.
    if (n > 1 && !EDIT_LEVA) return;
    // SEM B-ROLL RECORTADO NÃO HÁ O QUE TEMPLATAR, e o clique barrado explica em vez
    // de morrer calado: o silêncio aqui era convite a achar a tela quebrada.
    if (n > 2 && !RECORTADO) {
      irParaPasso(2);
      $("rec_diz").textContent = "o template e a legenda trabalham em cima do recorte: "
        + "faça o passo 2 primeiro.";
      return;
    }
    irParaPasso(n);
    salvarRascunho();
  });
});

/* --------------------------------------------------- passo 1 · ver os vídeos */
async function mostrarPecas() {
  if (!EDIT_LEVA) return;
  const gal = $("ed_galeria");

  // O POSTO PRIMEIRO, desde 25/08/2026: com a casa na VPS, o disco de quem olha nem tem
  // os arquivos. A pasta liberada do navegador virou o plano B de quando o posto está
  // fora, e é só nesse caso que o cartão da porta volta a aparecer.
  if (await postoDePe()) {
    $("ed_porta").hidden = true;
    gal.innerHTML = '<div class="ed-carregando">abrindo a pasta da leva</div>';
    try {
      const r = await noPosto(`/pecas?leva=${EDIT_LEVA.numero}`);
      if (!r.tem) {
        // A LISTA MORRE JUNTO COM O RECADO: sem isto, pecas1() seguia devolvendo a
        // leva anterior e o passo 2 oferecia recortar os arquivos errados.
        EDIT_PECAS = [];
        gal.innerHTML = `<div class="ed-carregando">a pasta leva-${EDIT_LEVA.numero} `
          + "ainda não está na casa do Estúdio. O guardar busca a leva pronta de minuto "
          + "em minuto; espere um pouco e tente de novo.</div>";
        return;
      }
      EDIT_PECAS = (r.nomes || []).map(nome => ({ nome }));
      EDIT_PECAS.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
      await procurarRecortes();
      await procurarMontagem();
      desenhaPecas();
      await tentarRetomar();
      salvarRascunho();
    } catch (e) {
      EDIT_PECAS = [];
      gal.innerHTML = `<div class="ed-carregando">não consegui ler a leva na casa do `
        + `Estúdio: ${e.message}</div>`;
    }
    return;
  }

  // NA CASA REMOTA NAO HA' PORTA A OFERECER: a pasta desta máquina é o disco errado.
  // Posto fora aqui é espera, e não caixa de escolher pasta.
  if (SEM_PASTA_AQUI) {
    $("ed_porta").hidden = true;
    gal.innerHTML = '<div class="ed-carregando">' + SEM_POSTO + "</div>";
    return;
  }

  if (!TEM_PORTA) {
    $("ed_porta").hidden = false;
    $("ed_abrir_pasta").disabled = true;
    parado("ed_recado_pasta", "o posto do Estúdio não está atendendo, e este navegador "
      + "não sabe abrir pasta como plano B. Recarregue a página em um minuto.");
    return;
  }

  // O CRACHÁ E A PERMISSÃO SÃO DUAS COISAS, e confundir as duas foi o que fez a tela
  // pedir a pasta de novo depois de ele já ter escolhido.
  //
  //   o crachá     diz QUAL é a pasta. Fica guardado e dura.
  //   a permissão  diz se PODE LER agora. Volta para "perguntar" a cada vez que a
  //                página abre, por decisão do navegador, e não dá para desligar daqui.
  //
  // Com crachá na mão, o que falta é um clique de confirmação, sem janela de arquivos.
  // Sem crachá, aí sim é escolher a pasta. O cartão mostra um ou outro.
  const cracha = EDIT_RAIZ || EDIT_PASTA || await pegarCracha();
  const valendo = await pastaValendo(cracha, false);
  if (!valendo) {
    EDIT_RAIZ = EDIT_PASTA = null;
    desenhaPorta(cracha);
    gal.innerHTML = "";
    return;
  }
  ({ raiz: EDIT_RAIZ, levas: EDIT_PASTA } = await abrirRaiz(valendo));
  $("ed_porta").hidden = true;

  gal.innerHTML = '<div class="ed-carregando">abrindo a pasta da leva</div>';
  try {
    const pasta = await EDIT_PASTA.getDirectoryHandle(`leva-${EDIT_LEVA.numero}`);
    const arquivos = [];
    for await (const [nome, h] of pasta.entries())
      if (h.kind === "file" && nome.toLowerCase().endsWith(".mp4"))
        arquivos.push({ nome, h });
    arquivos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    EDIT_PECAS = arquivos;
    // O ESTADO DO PASSO 2 VEM DO DISCO, e não da memória da tela. Se a pasta
    // `recortes/leva-N` já existe com a ficha dentro, esta leva foi recortada, e isso
    // vale mesmo que a página tenha sido fechada e reaberta no dia seguinte.
    await procurarRecortes();
    // E SE ESTA LEVA JA' FOI MONTADA, o disco e' quem sabe. Sem isto o `MONTADO`
    // nascia nulo depois de um F5, e o passo 4 ficava trancado com as 107 pecas
    // montadas na pasta ao lado. Ver a nota em `procurarMontagem`.
    await procurarMontagem();
    desenhaPecas();
    // AS PEÇAS CHEGARAM: se havia rascunho esperando por elas, agora ele pode abrir.
    await tentarRetomar();
    salvarRascunho();
  } catch (e) {
    gal.innerHTML = "";
    $("ed_porta").hidden = false;
    parado("ed_recado_pasta", `não achei a pasta leva-${EDIT_LEVA.numero}. Aponte a `
      + "pasta `Estudio`, que é a que tem `levas` dentro dela.");
  }
}

/* O NOME DO ARQUIVO CARREGA O DESEMPENHO, e ele é a razão de o reel estar aqui:
   `0043.53x_vinci.society_DOtEWPVjcIM.mp4` é quarenta e três vezes a mediana do perfil.
   Mostrar o nome cru seria esconder isso dentro de um monte de caractere. */
function lerNome(nome) {
  const p = nome.replace(/\.mp4$/i, "").split("_");
  const x = parseFloat(p[0]);
  return { indice: isNaN(x) ? null : x, conta: p[1] || "", codigo: p[2] || "" };
}

function desenhaPecas() {
  // A CONTA E' DO QUE VAI PASSAR, e nao do que esta' na pasta. Tirou dez de cento e
  // sete, o cabecalho diz noventa e sete, que e' o numero de pecas que vao sair no fim.
  const valendo = pecas1().length;
  const fora = EDIT_PECAS.length - valendo;
  $("ed_p1_n").textContent = num(valendo);
  $("ed_p1_qual").textContent = valendo === 1 ? "peça" : "peças";
  $("ed_fora_linha").hidden = !fora;
  if (fora) {
    $("ed_fora_diz").innerHTML = `<b>${num(fora)}</b> ${fora === 1 ? "peça tirada" : "peças tiradas"} da leva. ${fora === 1 ? "Ela não passa" : "Elas não passam"} pelo recorte, nem pela IA, nem pela montagem. O arquivo continua guardado na casa do Estúdio.`;
  }

  // O VÍDEO CARREGA SÓ O CABEÇALHO, e o quadro mostrado é o do segundo e meio. Pedir os
  // quarenta e um arquivos inteiros de uma vez travaria a aba por vários segundos, e o
  // primeiro quadro de um reel costuma ser preto.
  $("ed_galeria").innerHTML = EDIT_PECAS.map((a, i) => {
    const n = lerNome(a.nome);
    // A PEÇA É O VÍDEO, e nada em volta. O rodapé trazia o índice de desempenho e o
    // código do post, e os dois já cumpriram o papel deles lá atrás, na régua: aqui o
    // que se faz é olhar imagem. O tempo fica, porque duração muda o que se decide.
    const fora = EXCLUIDAS.has(a.nome);
    return `<div class="ed-peca${fora ? " fora" : ""}" data-i="${i}"
        data-nome="${escapa(a.nome)}" title="${n.indice != null
        ? n.indice.toFixed(2).replace(".", ",") + "x acima da mediana" : a.nome}">
      <div class="ed-quadro"><video preload="metadata" muted playsinline
        data-arquivo="${i}"></video>
        <span class="ed-play"><svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/></svg></span>
        <button type="button" class="ed-tira" data-tira="${escapa(a.nome)}"
          aria-label="${fora ? "Trazer esta peça de volta para a leva"
                             : "Tirar esta peça da leva"}"
          title="${fora ? "Trazer de volta" : "Tirar da leva"}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
            stroke-linecap="round">${fora
              ? '<path d="M3 12h14M11 6l6 6-6 6"/>'
              : '<path d="M6 6l12 12M18 6L6 18"/>'}</svg>
        </button>
        <span class="ed-dur"></span></div>
    </div>`;
  }).join("");

  async function abrirPeca(v) {
    if (v.src) return;
    try {
      v.src = await urlDaMidia(EDIT_PECAS[Number(v.dataset.arquivo)], pastaDaLeva())
        + "#t=1.5";
    } catch (err) { /* arquivo sumiu da pasta desde a leitura */ }
  }

  // UM DE CADA VEZ, e só quando entra na tela. Quarenta e um pedidos de arquivo ao mesmo
  // tempo fazem o navegador engasgar e o disco trabalhar para nada.
  const olho = new IntersectionObserver((entradas, obs) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      abrirPeca(e.target);
    }
  }, { rootMargin: "300px" });

  // A PRIMEIRA FILEIRA ABRE SEM ESPERAR O OBSERVADOR, e isso é rede e não pressa. Ele só
  // dispara quando o navegador está de fato pintando a página: numa aba de fundo ou logo
  // depois de trocar de aba, pode não disparar nenhuma vez, e a galeria fica com doze
  // retângulos pretos sem nada explicando.
  const PRIMEIRAS = 12;
  document.querySelectorAll("#ed_galeria video[data-arquivo]").forEach(v => {
    if (Number(v.dataset.arquivo) < PRIMEIRAS) abrirPeca(v);
    v.addEventListener("loadedmetadata", () => {
      const s = Math.round(v.duration || 0);
      const alvo = v.parentNode.querySelector(".ed-dur");
      // SÓ O TEMPO. A resolução saiu: ela não muda decisão nenhuma aqui, e enchia o
      // selo de número a ponto de ele competir com a imagem.
      if (alvo) alvo.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    });
    olho.observe(v);
  });

  // AS PECAS SOBEM, uma atras da outra. E' a animacao que o Gabriel pediu ao escolher a
  // leva, e ela mora aqui e nao na troca de tela: entre uma coisa e outra pode entrar a
  // caixa de permissao do navegador, que segura tudo por alguns segundos. Animando na
  // troca de tela, ele nunca veria; animando quando as pecas aparecem, ele sempre ve'.
  const palco = $("ed_galeria");
  palco.classList.remove("subindo");
  void palco.offsetWidth;                 // forca o navegador a aceitar o recomeco
  palco.classList.add("subindo");

}

/* Clicar na peça toca ali mesmo. Abrir num tocador à parte seria mais uma janela para
   fechar, e o que se quer aqui é bater o olho em quarenta e um vídeos depressa. */
$("ed_galeria").addEventListener("click", ev => {
  // O BOTAO DE TIRAR VEM ANTES DO TOCAR, senao o clique nele tocaria o video junto.
  const tira = ev.target.closest("[data-tira]");
  if (tira) {
    ev.stopPropagation();
    const nome = tira.dataset.tira;
    if (EXCLUIDAS.has(nome)) EXCLUIDAS.delete(nome);
    else {
      EXCLUIDAS.add(nome);
      const v = tira.closest(".ed-peca").querySelector("video");
      if (v && !v.paused) { v.pause(); v.parentNode.classList.remove("tocando"); }
    }
    // SO' A PECA E A CONTA SE REDESENHAM, e nao a galeria inteira: redesenhar tudo
    // descarregaria os cento e sete videos e a fileira piscaria a cada clique.
    const caixa = tira.closest(".ed-peca");
    const fora = EXCLUIDAS.has(nome);
    caixa.classList.toggle("fora", fora);
    tira.title = fora ? "Trazer de volta" : "Tirar da leva";
    tira.setAttribute("aria-label", fora ? "Trazer esta peça de volta para a leva"
                                          : "Tirar esta peça da leva");
    tira.querySelector("svg").innerHTML = fora
      ? '<path d="M3 12h14M11 6l6 6-6 6"/>' : '<path d="M6 6l12 12M18 6L6 18"/>';
    contaDaLeva();
    // O PASSO 2 LE' A MESMA CONTA, e ele pode estar montado atras deste. Sem esta
    // linha, ir para la' depois de tirar mostrava o numero de antes ate' a proxima
    // entrada, que e' como os dois numeros contrarios apareceram na tela dele.
    resumoDoRecorte();
    anotarMexida();
    return;
  }
  const peca = ev.target.closest(".ed-peca");
  if (!peca) return;
  if (peca.classList.contains("fora")) return;   // peca tirada nao toca
  const v = peca.querySelector("video");
  if (!v || !v.src) return;
  document.querySelectorAll("#ed_galeria video").forEach(o => {
    if (o !== v) { o.pause(); o.parentNode.classList.remove("tocando"); }
  });
  if (v.paused) { v.play(); v.parentNode.classList.add("tocando"); }
  else { v.pause(); v.parentNode.classList.remove("tocando"); }
});

/** Só a conta do cabeçalho e a linha do que ficou fora, sem mexer na galeria. */
function contaDaLeva() {
  const valendo = pecas1().length;
  const fora = EDIT_PECAS.length - valendo;
  $("ed_p1_n").textContent = num(valendo);
  $("ed_p1_qual").textContent = valendo === 1 ? "peça" : "peças";
  $("ed_fora_linha").hidden = !fora;
  if (fora) {
    $("ed_fora_diz").innerHTML = `<b>${num(fora)}</b> ${fora === 1 ? "peça tirada" : "peças tiradas"} da leva. ${fora === 1 ? "Ela não passa" : "Elas não passam"} pelo recorte, nem pela IA, nem pela montagem. O arquivo continua guardado na casa do Estúdio.`;
  }
}

$("ed_fora_voltar").onclick = () => {
  if (!EXCLUIDAS.size) return;
  EXCLUIDAS.clear();
  desenhaPecas();
  resumoDoRecorte();
  anotarMexida();
};

/** Qual das duas caras o cartão mostra: escolher a pasta, ou só liberar a leitura. */
function desenhaPorta(cracha) {
  const caixa = $("ed_porta");
  caixa.hidden = false;
  const jaTem = !!cracha;
  caixa.dataset.estado = jaTem ? "liberar" : "nunca";
  caixa.querySelector(".ed-porta-nunca").hidden = jaTem;
  caixa.querySelector(".ed-porta-liberar").hidden = !jaTem;
  if (jaTem) $("ed_porta_nome").textContent = cracha.name;
}

/* LIBERAR A PASTA DE FORA DA ABA DE EDIÇÃO. A aba de Configurações precisa gravar
   `ia.json`, e o navegador só escreve no disco com a permissão dada por um clique. Quando
   já existe crachá, um clique basta; quando não existe, abre a janela de arquivos. */
async function pedirPasta() {
  if (EDIT_RAIZ) return EDIT_RAIZ;
  // NA CASA REMOTA NÃO SE PEDE PASTA: a pasta desta máquina é o disco errado, e o que
  // falta é o posto voltar. Auditoria de 25/08/2026.
  if (SEM_PASTA_AQUI) throw new Error(SEM_POSTO);
  if (!TEM_PORTA) throw new Error("Este navegador não abre pastas do computador.");

  // A ARMADILHA DO CRACHÁ VELHO, e ela custou uma tarde ao Gabriel: "a chave não está
  // ficando salva". O crachá guardado podia apontar para `Estudio\levas`, de uma versão
  // em que a tela só lia vídeo. Liberar dava certo, o navegador dizia sim, e mesmo assim
  // `EDIT_RAIZ` continuava nulo, porque a raiz do Estúdio é UM NÍVEL ACIMA de `levas` e
  // não há como subir a partir de uma pasta liberada. Resultado: gravar falhava sempre, e
  // o recado dizia "libere a pasta", que era justamente o que ele acabara de fazer.
  const cracha = CRACHA_NA_MAO || await pegarCracha();
  if (cracha) {
    const h = await pastaValendo(cracha, true);
    if (h) {
      const { raiz, levas } = await abrirRaiz(h);
      if (raiz) {
        EDIT_RAIZ = raiz;
        EDIT_PASTA = levas;
        return EDIT_RAIZ;
      }
      // o crachá aponta para dentro: pede a pasta certa em vez de fingir que deu
    }
  }
  const h = await window.showDirectoryPicker({ id: "estudio-raiz", mode: "readwrite" });
  const { raiz, levas } = await abrirRaiz(h);
  if (!raiz) {
    throw new Error(`Essa é a pasta "${h.name}", e o que eu preciso é a pasta `
      + `"Estudio", um nível acima (a que tem levas, recortes e pedidos dentro).`);
  }
  EDIT_RAIZ = raiz;
  EDIT_PASTA = levas;
  await guardarCracha(h);
  return EDIT_RAIZ;
}

/** Escolher a pasta pela janela de arquivos. Só quando ainda não há crachá nenhum. */
async function escolherPasta() {
  if (SEM_PASTA_AQUI) {
    return parado("ed_recado_pasta", SEM_POSTO);
  }
  try {
    const h = await window.showDirectoryPicker({ id: "estudio-raiz", mode: "readwrite" });
    // APONTAR A PASTA DE DENTRO NÃO LIGA NADA, e antes isso passava calado: a tela dizia
    // "pasta ligada" e a raiz continuava nula, porque não há como subir um nível a partir
    // de uma pasta liberada. Foi o que deixou a chave da IA sem conseguir gravar.
    const { raiz, levas } = await abrirRaiz(h);
    if (!raiz) {
      return parado("ed_recado_pasta", `essa é a pasta "${h.name}". Aponte a pasta `
        + `"Estudio", um nível acima, que é a que tem levas, recortes e pedidos dentro.`);
    }
    EDIT_RAIZ = raiz;
    EDIT_PASTA = levas;
    const colou = await guardarCracha(h);
    parado("ed_recado_pasta", colou ? "pasta ligada."
      : "pasta ligada, mas o navegador não deixou guardar a escolha: na próxima visita "
        + "ele vai pedir a pasta de novo. Isso costuma ser navegação anônima.");
    await mostrarPecas();
  } catch (e) {
    // desistir de escolher não é erro, e não merece recado vermelho
    if (e && e.name !== "AbortError")
      parado("ed_recado_pasta", "não deu para abrir: " + e.message);
  }
}

$("ed_abrir_pasta").onclick = escolherPasta;
$("ed_trocar_pasta").onclick = escolherPasta;

/* LIBERAR É UM CLIQUE, e não uma escolha de novo. O crachá já diz qual pasta é; o que o
   navegador quer é o dedo dele autorizando a leitura nesta sessão. */
$("ed_liberar").onclick = async () => {
  const cracha = EDIT_RAIZ || EDIT_PASTA || await pegarCracha();
  if (!cracha) return desenhaPorta(null);
  const h = await pastaValendo(cracha, true);
  if (!h) return parado("ed_recado_pasta", "o navegador não liberou. Tente de novo, ou "
    + "aponte a pasta outra vez.");
  const { raiz, levas } = await abrirRaiz(h);
  if (!raiz) {
    return parado("ed_recado_pasta", `a pasta guardada é "${h.name}", de uma versão `
      + `antiga. Clique em trocar de pasta e aponte a "Estudio", um nível acima.`);
  }
  EDIT_RAIZ = raiz;
  EDIT_PASTA = levas;
  parado("ed_recado_pasta", "");
  await mostrarPecas();
};


/* O MELHOR CARTÃO DE PERMISSÃO É O QUE NUNCA APARECE.

   O navegador só aceita o pedido de liberar a pasta com o dedo da pessoa na tela. Então o
   primeiro clique dela dentro da aba de Edição, qualquer um, serve de gancho: clicou em
   "iniciar uma nova edição", já pedimos junto. Quando dá certo, o cartão nem chega a ser
   desenhado, e a experiência é a que o Gabriel esperava: apontou a pasta uma vez, e daí
   em diante é só usar.

   UMA VEZ POR CARREGAMENTO, e não a cada clique. O pedido abre uma caixinha do navegador;
   insistir a cada clique seria transformar proteção em praga. Recusou, o cartão explica e
   ele libera quando quiser. */
let JA_PEDIU_A_PASTA = false;
let CRACHA_NA_MAO = null;                 // lido na abertura, sem depender de clique

(async () => { CRACHA_NA_MAO = await pegarCracha(); })();

document.addEventListener("click", async ev => {
  if (!ev.target.closest("#aba-editar") && !ev.target.closest('[data-aba="editar"]')) return;
  desenhaRascunhos();
  if (EDIT_PASTA || !TEM_PORTA || JA_PEDIU_A_PASTA) return;
  // COM O POSTO DE PÉ NÃO HÁ PASTA A PEDIR: quem enxerga o disco é ele. E na casa
  // remota não há pasta a pedir NUNCA: a desta máquina é o disco errado.
  if (SEM_PASTA_AQUI) return;
  if (await postoDePe()) return;
  const cracha = CRACHA_NA_MAO || await pegarCracha();
  if (!cracha) return;                    // nunca apontou: o cartão pede, não o clique
  JA_PEDIU_A_PASTA = true;
  const h = await pastaValendo(cracha, true);
  if (!h) return;
  // A RAIZ, QUANDO DER. Com o cracha novo isto poe `EDIT_RAIZ` na mao e os passos 2 a 5
  // passam a funcionar sem mais um clique. Com o cracha velho so' ha' `levas`, e ai' o
  // passo 1 anda e os outros pedem a pasta certa quando chegar a vez.
  const { raiz, levas } = await abrirRaiz(h);
  if (raiz) { EDIT_RAIZ = raiz; EDIT_PASTA = levas; } else { EDIT_PASTA = h; }
  if (EDIT_LEVA) await mostrarPecas();
});

/* A PRIMEIRA PINTURA DA PORTARIA ESPERA O PROGRAMA TERMINAR DE SER LIDO.

   POR QUE A LINHA SOLTA NAO SERVE MAIS: desde 02/09/2026 a lista de rascunhos pergunta
   ao posto, e quem guarda a resposta do posto (`POSTO_DE_PE`) só nasce duas mil linhas
   abaixo desta. Chamada aqui, direto, ela morria com "não dá para acessar antes de
   existir" e levava junto todo o resto do programa, que ainda nem tinha sido lido: a aba
   de edição abria pela metade, e o único sinal era uma linha no console.

   A MICROTAREFA RESOLVE SEM ADIAR NADA: ela roda assim que a leitura do arquivo acaba,
   antes de qualquer pintura, e aí o programa inteiro já existe. */
queueMicrotask(desenhaRascunhos);

/* O F5 VOLTA PARA A LEVA ABERTA, no passo em que ele estava, com os vigias armados.
   O caminho e' o MESMO do cartao de rascunho da portaria; a unica diferenca e' que
   ninguem precisa clicar. So' age na aba de edicao e so' quando ha' leva anotada. */
async function retomarLevaAberta() {
  let n = null;
  try { n = Number(localStorage.getItem("estudio.leva.aberta")) || null; }
  catch (e) {}
  if (!n || EDIT_LEVA || ENCERRADAS.has(n)) return;
  /* O RASCUNHO E' O MAIS RECENTE DA LEVA, e nao o primeiro que aparecer: leva antiga
     pode ter rascunho velho parado no passo 1, e o F5 dele caiu exatamente nesse,
     jogando o Gabriel na etapa 1 com o recorte correndo invisivel (26/08/2026). */
  const todos = (await listarRascunhos()) || [];
  const r = todos.filter(x => x.leva === n)
                 .sort((a, b) => (b.mexido || 0) - (a.mexido || 0))[0];
  if (!r) return;
  /* E A ABA E' A DA EDICAO, mesmo que o endereco tenha perdido a ancora: leva aberta
     quer dizer trabalho no meio, e o F5 tem de devolver a pagina em que ele estava,
     nunca a tela inicial. Sair da edicao ou trocar de leva desanotam, e ai' o F5
     volta a respeitar a aba do endereco. */
  if ((location.hash || "").slice(1) !== "editar") irPara("editar", false);
  EDIT_RASCUNHO = r;
  EDIT_LEVA = (LOTES || []).find(l => l.numero === n) || { numero: n };
  await entrarNaOficina(r.passo || 1, r);
}
/* A VARREDURA DOS REPETIDOS QUE JA' NASCERAM: fica o mais recente de cada leva, os
   outros saem. Roda uma vez por carga, antes da retomada, para o F5 nunca mais ter
   dois candidatos. Falhar aqui nao derruba nada: e' faxina, nao fundacao. */
async function limparRascunhosRepetidos() {
  try {
    const todos = (await listarRascunhos()) || [];
    const dono = new Map();
    for (const r of todos) {
      const atual = dono.get(r.leva);
      if (!atual || (r.mexido || 0) > (atual.mexido || 0)) dono.set(r.leva, r);
    }
    let saiu = 0;
    for (const rep of todos) {
      if (dono.get(rep.leva).id !== rep.id) {
        await apagarRascunho(rep.id);
        saiu++;
      }
    }
    if (saiu && !$("ed_portaria").hidden) desenhaRascunhos();
  } catch (e) {}
}
limparRascunhosRepetidos().then(() => retomarLevaAberta()).catch(() => {});

/* ------------------------------------------------------------------- a partida

   OS RELÓGIOS SÃO LIGADOS ANTES DA PRIMEIRA PINTURA, de propósito.

   Estas três linhas já foram na ordem contrária, e por causa disso a tela passou a
   pintar uma vez e congelar. Uma função tinha trocado de nome numa reforma e as chamadas
   ficaram apontando para o nome velho; o erro estourava na primeira linha e o arquivo
   parava ali, então os dois relógios abaixo nunca chegavam a existir. Nada na tela
   dizia isso: os números certos da abertura ficavam parados para sempre.

   Com os relógios primeiro, um tropeço custa uma volta de vinte e cinco segundos, e
   não o dia inteiro. */
setInterval(atualizar, 25000);
setInterval(aoVivo, 15000);
// NA ABERTURA, UM DEPOIS DO OUTRO. Quem lê os bilhetes precisa saber quais perfis
// existem, e essa lista é justamente o que a primeira busca do acervo traz. Chamados
// juntos, o leitor de bilhetes rodava com a lista ainda vazia, desistia na hora, e a
// tela abria mostrando zero post num perfil que já tinha sessenta lidos.
atualizar().then(aoVivo);

/* ==========================================================================
   PASSO 2 · O RECORTE DO B-ROLL

   O QUE ACONTECE AQUI: cada reel da leva é medido, o retângulo da filmagem é achado, e
   grava-se só ele numa pasta nova. O arroba e a legenda de quem postou ficam de fora.

   POR QUE ELE VEM ANTES DO TEMPLATE, e é a correção de um erro de desenho meu. Enquanto o
   recorte morava dentro do passo do template, ele era obrigado a caber na proporção da
   moldura, e por isso comia pedaço do B-roll. O Gabriel viu sorteando vídeo por vídeo: "o
   enquadramento não está pegando o vídeo inteiro", "tem B-roll que são maiores, B-rolls
   que são menores". Sem template no caminho não há proporção a obedecer.

   UM CLIQUE, TODAS AS PEÇAS. Não há aqui um vídeo por vez para ajustar na mão, e é
   pedido explícito: "que eu clique no botão e ele aplique em tudo, que eu não precise
   estar fazendo esse processo manual com cada vídeo". O vídeo desta tela serve só para
   conferir o método antes de soltar na leva inteira. */

/* QUAL PECA ESTA' SENDO CONFERIDA, PELO NOME e nao pelo indice.

   O indice apontava para dentro de `EDIT_PECAS`, a lista crua. Tirando um reel no
   passo 1, a lista que vale encolhe e o mesmo indice passa a apontar para outro video:
   o passo 2 mostraria como exemplo justamente uma peca que ele acabou de descartar, ou
   trocaria de exemplo sozinho sem ninguem ter pedido. O nome do arquivo nao se desloca. */
let REC_NOME = "";                 // qual peça está sendo conferida
let REC_PROXIMO = "";              // o reel que o posto já está medindo de antemão
let REC_ACHADO = null;             // o B-roll medido nela
let REC_OBRA = null;               // o pedido de recorte em curso

async function entrarNoRecorte() {
  // A PASTA DE DESTINO SAIU DA TELA em 25/08/2026, por decisão do dono: "não preciso
  // mais saber disso, já que tudo agora está indo para a VPS". Quando a casa era o disco
  // dele, o caminho respondia "onde vou achar isso depois?"; com uma casa só, a pergunta
  // não existe mais e a linha era mobília.
  await procurarRecortes();
  desenhaRecortado();
  resumoDoRecorte();
  desenhaOFechoDoRecorte();
  if (!EDIT_PECAS.length) {
    $("rec_diz").textContent = "as peças da leva ainda não chegaram: volte ao passo 1 "
      + "para as abrir, e então eu meço.";
    return;
  }
  // A PECA DO EXEMPLO TEM DE CONTINUAR NA LEVA. Se ele tirou justamente essa no passo
  // 1, o passo 2 sorteia outra em vez de medir uma que nao vai ser recortada.
  if (!REC_NOME || !pecas1().some(x => x.nome === REC_NOME)) await verOutroReel();
}

/** Sorteia um reel da leva e mede o B-roll dele, para conferência. */
async function verOutroReel() {
  // SO' SORTEIA ENTRE AS QUE FICARAM NA LEVA. Ver a nota em `REC_NOME`.
  const lista = pecas1();
  if (!lista.length) return;
  let i = Math.floor(Math.random() * lista.length);
  // O SORTEIO PREFERE QUEM JA' FOI MEDIDO. O clique anterior deixou o posto medindo um
  // reel de antemao; se ele ainda esta' na leva, e' ele que entra, e a espera da medida
  // some. Se ele saiu da leva no passo 1, o sorteio comum decide.
  if (REC_PROXIMO && REC_PROXIMO !== REC_NOME) {
    const j = lista.findIndex(x => x.nome === REC_PROXIMO);
    if (j >= 0) i = j;
  }
  REC_PROXIMO = "";
  if (lista.length > 1) {
    let voltas = 0;
    while (lista[i].nome === REC_NOME && voltas++ < 30)
      i = Math.floor(Math.random() * lista.length);
  }
  REC_NOME = lista[i].nome;
  rotuloDoReel(REC_NOME);
  const v = $("rec_video");
  // O MEDINDO DEIXOU DE SER PALAVRA E VIROU VARREDURA, pedido de 25/08/2026. E desde
  // 26/08 ha' DUAS esperas com nome: "Abrindo O Reel" na esquerda enquanto o video
  // desce pela rede, e "Medindo O Reel" na direita ate' a medida chegar. As classes tem
  // de desligar em TODOS os fins possiveis, senao a varredura roda para sempre.
  $("rec_diz").textContent = "";
  $("rec_diz").classList.remove("ruim");
  $("rec_fonte").classList.add("medindo", "abrindo");
  $("rec_saida").classList.add("medindo");
  $("rec_marca").hidden = true;
  // A PROMESSA NASCE AQUI FORA porque ela é colhida lá embaixo, depois do `try`. Dentro
  // dele, `const` fica presa ao bloco e a colheita daria erro de nome, que o `node
  // --check` não pega: ele confere gramática, não escopo.
  let medida = Promise.resolve(null);
  try {
    const u = await urlDaMidia(lista[i], pastaDaLeva());
    if (v.dataset.url) URL.revokeObjectURL(v.dataset.url);
    // SEM ISTO O CANVAS FICA CONTAMINADO na vitrine do GitHub Pages (o vídeo vem do
    // posto local, que é outra origem) e o medidor devolvia nulo para todo reel. O
    // posto já ecoa o cabeçalho de origem para as telas conhecidas; em mesma origem o
    // atributo é inofensivo.
    v.crossOrigin = "anonymous";
    v.dataset.url = u;
    v.src = u;
    // A MEDIDA SAI JUNTO COM O VIDEO, e nao depois dele. As duas esperas nao dependem
    // uma da outra: o posto mede lendo o disco dele, e o navegador abre o arquivo pela
    // rede. Enfileiradas, somavam; lado a lado, vale a mais demorada das duas.
    //
    // E A DO VIDEO E' A MAIOR, por um detalhe do arquivo: o indice do mp4 (o `moov`)
    // fica no FIM, depois dos dados, entao o navegador pede o comeco, ve o tamanho e
    // precisa de um SEGUNDO pedido no fim so' para saber onde cada quadro mora. Medido
    // em 25/08/2026 neste caminho: de 1,6 a 4,2 s so' para abrir.
    medida = medirOBroll(lista[i]);
    // O "MEDINDO" TEM PRAZO. Vídeo que o navegador não decodifica (arquivo pela
    // metade, codec que ele não lê) pode nunca disparar `loadedmetadata` nem o
    // `error`: esta espera ficava pendurada e o passo 2 dizia "medindo…" para
    // sempre, sem erro e sem saída. Quinze segundos é folga larga para ler o
    // cabeçalho de um arquivo local; passou disso, a resposta honesta é que o
    // vídeo não abre, e há outro reel para conferir no botão ao lado.
    const abriu = await new Promise(ok => {
      if (v.readyState >= 1) return ok(true);
      const prazo = setTimeout(() => ok(false), 15000);
      v.addEventListener("loadedmetadata",
        () => { clearTimeout(prazo); ok(true); }, { once: true });
      v.addEventListener("error",
        () => { clearTimeout(prazo); ok(false); }, { once: true });
    });
    if (!abriu) {
      $("rec_fonte").classList.remove("medindo", "abrindo");
      $("rec_saida").classList.remove("medindo");
      // O RECADO NAO CHUTA CULPADO. Ele acusava o arquivo de estar estragado, e em
      // 25/08/2026 o Gabriel viu essa frase com o CABO DA INTERNET desconectado: o
      // arquivo estava inteiro do outro lado. Daqui nao da' para separar arquivo ruim
      // de ligacao caida, entao o recado diz as duas e manda conferir a mais provavel.
      $("rec_diz").textContent = "não consegui abrir este vídeo aqui. Pode ser a ligação "
        + "com a casa do Estúdio, ou o próprio arquivo. Confira a internet e clique em "
        + "Ver Outro Reel.";
      return;
    }
  } catch (e) {
    $("rec_fonte").classList.remove("medindo", "abrindo");
    $("rec_saida").classList.remove("medindo");
    $("rec_diz").textContent = "não consegui abrir este arquivo.";
    return;
  }
  $("rec_fonte").classList.remove("medindo", "abrindo");
  v.play().catch(() => {});
  REC_ACHADO = await medida;
  $("rec_saida").classList.remove("medindo");
  desenhaRecorteExemplo();

  /* A DEMORA DO MEDINDO, vista por ele em 25/08/2026: "so' to' achando bem lento". A
     medida do posto leva um a quatro segundos por video na primeira vez, e ZERO nas
     seguintes, porque o posto guarda por arquivo. Entao o proximo sorteado ja' fica
     escolhido AGORA, e o posto mede enquanto ele ainda olha este; o clique seguinte
     acha a medida pronta. A resposta morre aqui: o ganho e' so' esquentar a guarda. */
  const resto = lista.filter(x => x.nome !== REC_NOME);
  if (resto.length) {
    const px = resto[Math.floor(Math.random() * resto.length)];
    REC_PROXIMO = px.nome;
    esquentarAMedida(px);
  }
}

/* O ESPELHO EXATO DO QUE O `oficina.py` GRAVA: o mesmo retângulo, na esquerda marcado
   sobre o reel e na direita já sozinho. Se os dois lados discordassem, a conferência
   desta tela não valeria nada. */
function desenhaRecorteExemplo() {
  const v = $("rec_video");
  const lar = v.videoWidth || 1080, alt = v.videoHeight || 1920;
  const b = REC_ACHADO || { x: 0, y: 0, w: 1, h: 1, modo: "tela cheia" };
  /* AS FRACOES DA MEDIDA SAO DO QUADRO DO VIDEO, e o quadro da tela e' 9:16 com
     `object-fit:contain`: video fora de 9:16 aparece com faixas, e uma porcentagem
     aplicada ao ELEMENTO cai na faixa, nao no video. A marca e o recorte ficavam
     deslocados e menores exatamente nos reels fora da medida. A caixa do conteudo
     converte: primeiro onde o video mora dentro do quadro, depois a fracao dentro
     do video. */
  const qa = TELA.w / TELA.h, va = lar / alt;
  const cw = va >= qa ? 1 : va / qa;
  const ch = va >= qa ? qa / va : 1;
  const ce = (1 - cw) / 2, ct = (1 - ch) / 2;
  const m = $("rec_marca");
  m.hidden = false;
  m.style.left = ((ce + b.x * cw) * 100) + "%";
  m.style.top = ((ct + b.y * ch) * 100) + "%";
  m.style.width = (b.w * cw * 100) + "%";
  m.style.height = (b.h * ch * 100) + "%";

  /* O LADO DIREITO É A PEÇA DE REELS INTEIRA, e não o retângulo recortado. O Gabriel
     corrigiu isso em 20/08/2026: "era pra pegar o formato do reel e só jogar um fundo
     preto". O B-roll fica onde está, do tamanho que está, e o resto do quadro é preto.
     A tela mostrava o retângulo sozinho, que era o comportamento de uma versão anterior,
     e por isso ela discordava do arquivo que o programa grava. */
  const saida = $("rec_saida"), c = $("rec_corte");
  saida.style.width = "";
  saida.style.height = "";
  saida.style.aspectRatio = TELA.w + "/" + TELA.h;
  /* O ESPELHO NAO BAIXA UMA SEGUNDA COPIA DO VIDEO. Ele era um segundo <video> com o
     mesmo endereco: o navegador abria OUTRA descarga do mesmo arquivo, e numa conexao
     de casa ela ficava para tras: a medida chegava, a marca aparecia na esquerda e a
     direita seguia PRETA, calada. Visto ao vivo em 26/08/2026. Agora a direita e' uma
     PINTURA do video da esquerda, quadro a quadro, com a forma medida por cima: uma
     descarga so', os dois lados sempre no mesmo instante. A caixa do conteudo continua
     valendo: o desenho ocupa o lugar exato do quadro do video. */
  c.style.width = (cw * 100) + "%";
  c.style.height = (ch * 100) + "%";
  c.style.left = (ce * 100) + "%";
  c.style.top = (ct * 100) + "%";
  pintarOEspelho(v, c, b, lar, alt);

  // O RODAPE DE MEDIDAS SAIU em 25/08/2026: "esse rodape' que voce colocou, reels tem
  // tanto e a peca sai por tanto, nao quero isso". A medida nao mudava decisao nenhuma
  // dele; quem precisa dela e' o programa, que a tem de outro jeito.
  // NÃO CONSEGUI MEDIR NÃO É TELA CHEIA. O `acharBrollAqui` devolve nulo em várias
  // falhas de leitura (vídeo que não decodifica, quadro que não chega no prazo), e
  // afirmar "não tem card" a partir do nulo era inventar. Quem mede de verdade é a
  // oficina, na hora de gravar; esta tela é só conferência. Trava 2 do CLAUDE.md.
  /* A DESCRICAO DE SUCESSO SAIU, e a linha ficou. O pedido foi direto: "achei o card,
     so' a filmagem, sem a marca de quem postou: nao entendi que porra de descricao e'
     essa? Remove isso". Ela contava, em palavra, o que os dois videos ao lado ja'
     mostram.

     O QUE NAO PODE SUMIR E' O PROBLEMA. Quando nao da' para medir, o desenho da direita
     fica igual ao da esquerda e nada na tela diz por que: e' tela muda, que e' o defeito
     que este projeto passou dois dias cacando. Entao a linha aparece so' aqui. */
  const diz = $("rec_diz");
  diz.classList.toggle("ruim", !REC_ACHADO);
  diz.textContent = REC_ACHADO ? "" :
    "não consegui medir este vídeo daqui. Quem mede de verdade é a oficina, na hora de "
    + "gravar; clique em Ver Outro Reel para conferir o método com outra peça.";
}

/** A forma do B-roll como caminho de desenho: desce pela borda esquerda e volta
    pela direita. Canto arredondado sai arredondado, como sai no arquivo gravado. */
function formaDoRecorte(b, lar, alt) {
  const forma = new Path2D();
  const linhas = b.linhas;
  if (!linhas || !linhas.length) {
    forma.rect(b.x * lar, b.y * alt, b.w * lar, b.h * alt);
    return forma;
  }
  // UM PONTO A CADA POUCAS LINHAS BASTA: o contorno tem uma linha por pixel da analise,
  // e um caminho com trezentos pares e' peso a' toa para uma curva que o olho le igual.
  const passo = Math.max(1, Math.round(linhas.length / 60));
  const esq = [], dir = [];
  for (let i = 0; i < linhas.length; i += passo) {
    if (!linhas[i]) continue;
    const y = (b.y + b.h * (i + 0.5) / linhas.length) * alt;
    esq.push([linhas[i][0] * lar, y]);
    dir.push([linhas[i][1] * lar, y]);
  }
  if (esq.length < 2) {
    forma.rect(b.x * lar, b.y * alt, b.w * lar, b.h * alt);
    return forma;
  }
  forma.moveTo(esq[0][0], esq[0][1]);
  for (let i = 1; i < esq.length; i++) forma.lineTo(esq[i][0], esq[i][1]);
  for (let i = dir.length - 1; i >= 0; i--) forma.lineTo(dir[i][0], dir[i][1]);
  forma.closePath();
  return forma;
}

/* O PINTOR DO ESPELHO. Um laco por quadro do video: limpa, recorta pela forma medida e
   desenha o quadro da esquerda. A GERACAO mata o laco antigo quando outro reel assume:
   sem ela, dois lacos pintariam o mesmo quadro com formas de reels diferentes. */
let ESPELHO_GERACAO = 0;
function pintarOEspelho(v, c, b, lar, alt) {
  const minha = ++ESPELHO_GERACAO;
  c.width = lar;
  c.height = alt;
  const g = c.getContext("2d");
  const forma = formaDoRecorte(b, lar, alt);
  const pinta = () => {
    if (minha !== ESPELHO_GERACAO) return;
    g.clearRect(0, 0, lar, alt);
    g.save();
    g.clip(forma);
    try { g.drawImage(v, 0, 0, lar, alt); } catch (e) {}
    g.restore();
    // O LACO ACOMPANHA OS QUADROS DO VIDEO quando o navegador sabe avisar deles; nos
    // que nao sabem, pinta a cada poucos quadros de tela, que para conferencia basta.
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => pinta());
    else setTimeout(() => requestAnimationFrame(pinta), 40);
  };
  pinta();
}

$("rec_sortear").onclick = () => verOutroReel();

/* -------------------------------------------------- o que já foi recortado */

/* AS FRASES DA CASA DE VOLTA PARA A TELA.

   A CONTA E' SIMPLES E A LICAO CUSTOU CARO: a `oficina` grava cada frase aceita em
   `_textos.json`, ao lado dos recortes, desde 22/08/2026. Ela gravava e ninguem lia. Em
   02/09/2026 o rascunho dele sumiu do navegador e as 180 frases da leva 31 sumiram junto
   PARA A TELA, com o arquivo inteiro parado no disco da casa o tempo todo. A unica saida
   era mandar a IA escrever tudo de novo. A cota do dia nao volta; o arquivo sempre esteve
   la'.

   O QUE ESTA' NA MAO DELE VENCE SEMPRE. Só entra frase onde a peça ainda não tem nenhuma:
   o rascunho retomado e o que ele digitou são mais novos que o disco, e sobrescrever
   seria desfazer trabalho a pretexto de recuperar trabalho. */
let FRASES_DA_CASA = null;   // o `_textos.json` da leva aberta, como o disco o entregou

/* COMPLETA O QUE FALTA, e não mexe no que já existe.

   PRECISA SER CHAMÁVEL DE NOVO porque `tentarRetomar` limpa o `ESCRITO` e o repovoa a
   partir do rascunho: sem esta segunda passada, o `escrito` vazio de um rascunho gravado
   antes de a IA escrever ganhava das frases que o disco tinha acabado de devolver. */
function completarComAsFrasesDaCasa() {
  if (!FRASES_DA_CASA) return 0;
  let voltaram = 0;
  for (const [nome, campos] of Object.entries(FRASES_DA_CASA)) {
    if (!campos || typeof campos !== "object") continue;
    const tem = ESCRITO.get(nome);
    // JA' TEM FRASE E' JA' TEM FRASE, venha ela do rascunho ou da mao dele.
    if (tem && Object.values(tem).some(v => String(v || "").trim())) continue;
    ESCRITO.set(nome, { ...campos });
    voltaram++;
  }
  return voltaram;
}

function recuperarAsFrases(r) {
  const linha = $("ia_volta");
  if (!r) return 0;
  if (r.textos_ilegiveis) {
    FRASES_DA_CASA = null;
    /* NAO LI NAO E' NAO TEM (trava 4): calado aqui, a fase da IA abriria com as pecas em
       branco, como se ela nunca tivesse passado, e ele pagaria a cota de novo sem saber
       que havia frase guardada. */
    if (linha) {
      linha.hidden = false;
      linha.textContent = "As frases guardadas desta leva existem no Estúdio, mas o "
        + "arquivo delas não abriu. Antes de mandar a IA escrever tudo de novo, vale "
        + "conferir: escrever de novo gasta a cota do dia pela segunda vez.";
      linha.classList.add("alerta");
    }
    return 0;
  }
  const guardadas = r.textos;
  if (!guardadas || typeof guardadas !== "object") {
    FRASES_DA_CASA = null;
    if (linha) { linha.hidden = true; linha.classList.remove("alerta"); }
    return 0;
  }
  FRASES_DA_CASA = guardadas;
  const voltaram = completarComAsFrasesDaCasa();
  if (linha) {
    linha.classList.remove("alerta");
    linha.hidden = voltaram === 0;
    if (voltaram) {
      linha.textContent = voltaram === 1
        ? "1 frase que a IA já tinha escrito voltou do Estúdio, sem gastar a cota."
        : `${voltaram} frases que a IA já tinha escrito voltaram do Estúdio, sem gastar `
          + "a cota.";
    }
  }
  return voltaram;
}

/** Procura na pasta `recortes` uma leva já recortada e a carrega. */
async function procurarRecortes() {
  // SEM ONDE OLHAR, NÃO SE APAGA O QUE JÁ SE SABE. A primeira versão zerava o estado
  // antes de conferir se dava para conferir, e aí bastava a pasta não estar liberada
  // naquele instante para o passo 3 destravar o passo 4 e depois trancá-lo de novo. O
  // que se sabe só é substituído depois de olhar de verdade na pasta.
  if (!EDIT_LEVA) return;
  // O POSTO PRIMEIRO, desde 25/08/2026: com a casa na VPS, os recortes moram lá. A
  // resposta dele é "olhar de verdade": só ela substitui o que se sabe. Ficha ilegível
  // volta como erro (500) e cai no catch, sem apagar nada, pela mesma regra de sempre.
  if (await postoDePe()) {
    let r = null;
    try { r = await noPosto(`/recortes?leva=${EDIT_LEVA.numero}`); }
    catch (e) {
      // A FICHA ILEGÍVEL FALA, E NÃO SOME: o posto manda 500 de propósito para a
      // tela PARAR, mas o catch mudo fazia o passo 2 parecer "nunca recortou" e
      // oferecer recortar as 107 de novo, horas de máquina refazendo o pronto. O
      // estado não é apagado (certo), e agora a causa fica escrita onde se olha.
      const aviso = $("rec_diz");
      if (aviso) {
        aviso.textContent = "não consegui ler os recortes desta leva: "
          + (e && e.message ? e.message : "falha ao falar com o posto")
          + " — recarregue e tente de novo antes de recortar qualquer coisa.";
      }
      return;
    }
    EDIT_RECORTES = [];
    RECORTADO = null;
    const nomeDaLeva = "leva-" + EDIT_LEVA.numero;
    if (!r.tem || !r.ficha || !(r.nomes || []).length) return;
    SEM_FRASE = null;
    try {
      const sem = new Set();
      const onde = new Map();
      const modos = new Map();
      for (const x of (r.ficha.pecas || [])) {
        if (!x.frase) sem.add(x.arquivo);
        if (x.broll && typeof x.broll.y === "number") onde.set(x.arquivo, x.broll);
        if (x.modo) modos.set(x.arquivo, x.modo);
      }
      SEM_FRASE = sem;
      BROLL_DE = onde;
      MODO_DE = modos;
    } catch (e) { SEM_FRASE = null; BROLL_DE = null; MODO_DE = null; }
    const doPosto = (r.nomes || []).map(n => ({ nome: n }));
    doPosto.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    EDIT_RECORTES = doPosto;
    RECORTADO = { pecas: doPosto.length, pasta: nomeDaLeva,
                  onde: "recortes/" + nomeDaLeva };
    /* AS FRASES JÁ PAGAS VOLTAM DA CASA, desde 02/09/2026.

       O QUE ACONTECEU EM 02/09: o rascunho dele sumiu do navegador, e com ele as 180
       frases que a IA já tinha escrito. Elas estavam inteiras no disco da casa, em
       `_textos.json`, e não havia caminho de volta: a única saída era mandar a IA
       escrever tudo outra vez, queimando a cota do dia pela segunda vez na mesma leva.

       O QUE ESTÁ NA MÃO DELE VENCE. Só entra frase onde a peça ainda não tem nenhuma:
       o rascunho retomado e o que ele escreveu na mão são mais novos que o disco, e
       sobrescrever seria desfazer trabalho para "recuperar" trabalho. */
    recuperarAsFrases(r);
    return;
  }
  if (!EDIT_RAIZ) return;
  const raiz = await pastaDo("recortes", false);
  if (!raiz) return;
  EDIT_RECORTES = [];
  RECORTADO = null;
  const nome = "leva-" + EDIT_LEVA.numero;
  let pasta = null;
  try { pasta = await raiz.getDirectoryHandle(nome); } catch (e) { return; }
  const arquivos = [];
  let ficha = null;
  for await (const [n, h] of pasta.entries()) {
    if (h.kind !== "file") continue;
    if (n === "_origem.json") ficha = h;
    else if (n.toLowerCase().endsWith(".mp4")) arquivos.push({ nome: n, h });
  }
  if (!ficha || !arquivos.length) return;
  /* QUAIS PECAS TEM FRASE PARA A IA LER, e a resposta vem da ficha que o recorte
     escreveu, e nao de palpite. So' a peca que era um card de noticia tem a faixa de
     frase guardada; a que veio em tela cheia nao tem frase nenhuma.

     SEM ISTO A TELA MANDAVA TODAS PARA A IA, e cada peca sem frase gastava um pedido da
     cota do dia para a IA responder do nada: ou inventando uma manchete, ou dizendo SEM
     FRASE. Na leva 29 sao 15 de 107, e elas voltavam a gastar todo dia, porque o botao
     so' olhava se a caixa estava vazia.

     FICHA ILEGIVEL NAO E' FICHA SEM FRASE. Nesse caso `SEM_FRASE` fica nulo e ninguem e'
     pulado: e' melhor gastar cota do que deixar de escrever uma leva inteira por causa
     de um arquivo que nao deu para ler. */
  SEM_FRASE = null;
  try {
    const d = JSON.parse(await (await ficha.getFile()).text());
    const sem = new Set();
    const onde = new Map();
    for (const x of (d.pecas || [])) {
      if (!x.frase) sem.add(x.arquivo);
      // O RETANGULO DA FILMAGEM, para o texto nao ser desenhado em cima dela.
      if (x.broll && typeof x.broll.y === "number") onde.set(x.arquivo, x.broll);
    }
    SEM_FRASE = sem;
    BROLL_DE = onde;
  } catch (e) { SEM_FRASE = null; BROLL_DE = null; }
  arquivos.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  EDIT_RECORTES = arquivos;
  RECORTADO = { pecas: arquivos.length, pasta: nome,
                onde: "recortes/" + nome };
}

/* DEPOIS DE RECORTAR NÃO SE OFERECE RECORTAR DE NOVO, pela mesma razão que valeu no
   passo do template: "eu já apliquei uma vez, por que vai ser aplicado novamente?". O
   botão fica escondido enquanto houver recorte pronto desta leva, e no lugar dele vêm
   abrir a pasta e seguir para o template. */
function desenhaRecortado() {
  const tem = !!RECORTADO;
  /* RECORTE PELA METADE NAO E' RECORTE PRONTO.

     O botao de recortar sumia assim que existisse UM recorte na pasta. Se doze das 107
     tivessem falhado, a tela dizia "95 recortes prontos", escondia o botao, e nao havia
     mais como pedir as doze que faltaram: as pecas iam para a montagem sem elas, e ele
     so' descobriria contando os arquivos no fim. */
  // A CONTA DO QUE FALTA É POR NOME, e não por subtração de totais: recorte de peça
  // depois tirada da leva mascarava peça que ficou SEM recorte, e ela sumia calada das
  // fases seguintes. O nome do arquivo atravessa a leva inteira, então ele é a chave.
  const temRec = new Set(EDIT_RECORTES.map(r => r.nome));
  const faltam = tem ? pecas1().filter(p => !temRec.has(p.nome)).length : 0;
  /* A CONTA DAS TIRADAS MUDOU DE LUGAR, e nao sumiu. Ela morava numa linha de resumo no
     meio do passo 2, que saiu em 25/08/2026 junto com as outras descricoes. A licao que
     ela guardava e' de 22/08 e continua valendo: ele tirou treze reels, o passo 1 passou
     a dizer 94 e o passo 2 seguia oferecendo "107 pecas para recortar", e a frase foi
     "voce nao disse que havia arrumado?". Aqui, na linha do passo 2 da trilha, a
     informacao fica onde se olha para saber em que pe' esta' cada passo, sem voltar a ser
     bloco de texto no meio da tela. */
  // CADA UMA CUIDA DO SEU ESTADO: aqui mora o "ja' recortou", e o "falta recortar" mora
  // no `resumoDoRecorte`, logo abaixo. Escritas as duas no mesmo lugar, a que roda antes
  // apagava a outra e a linha saia dizendo "o B-roll de cada video" com tres pecas na
  // leva, que e' o passo 2 encolhendo calado de novo.
  const r2 = $("ed_r2");
  if (r2 && tem) {
    r2.textContent = num(RECORTADO.pecas)
      + (RECORTADO.pecas === 1 ? " recorte pronto" : " recortes prontos")
      + (faltam ? `, ${num(faltam)} sem recorte` : "");
  }
  $("rec_aplicar").hidden = tem && !faltam;
  if (faltam) {
    dizNoBotao("rec_aplicar", `Recortar As ${num(faltam)} Que Faltaram`);
  }
  $("rec_feito").hidden = !tem;
  if (!tem) return;
  // A LINHA DE RESUMO SAIU com a descricao: a contagem ja' esta' escrita no proprio
  // botao e no passo 2 da trilha, e repetida aqui era a terceira copia do mesmo numero.
  $("rec_pasta").dataset.abrir = RECORTADO.onde;
}

/* A BARRA CONCLUIDA NASCE DO RE-SCAN DO DISCO, e nao da memoria de um vigia.

   O VIGIA MORRE NO FECHO: quando o recorte termina, a gravacao seguinte do rascunho
   escreve o vigia como nulo, e a retomada ficava sem o que retomar: F5 depois do fim
   mostrava os botoes e NENHUMA barra ("cade a barra informando que esta' concluido?",
   26/08/2026). O que nunca morre e' o disco: os recortes e a ficha deles estao na
   casa, com o modo de cada peca. Entao o fecho se desenha DELES, toda vez que o passo
   2 abre com recorte pronto e nenhuma obra em curso: cada peca com a sua cor, na
   posicao dela na leva, e o caminho da pasta embaixo. */
function desenhaOFechoDoRecorte() {
  if (!RECORTADO || REC_OBRA) return;
  const lista = pecas1();
  if (!lista.length) return;
  const temRec = new Set(EDIT_RECORTES.map(r => r.nome));
  let marcas = "";
  for (const p of lista) {
    if (!temRec.has(p.nome)) { marcas += "."; continue; }
    const modo = MODO_DE ? MODO_DE.get(p.nome) : null;
    marcas += modo === "card" ? "c"
      : modo === "nao consegui olhar" ? "?"
      : modo ? "v" : "c";
  }
  const feitas = [...marcas].filter(x => x !== ".").length;
  if (!feitas) return;
  // TUDO PRONTO ABRE DIRETO NO SELO: quem chega pelo F5 nao precisa ver a barra
  // sumir, precisa saber que pode avancar.
  if (feitas === lista.length) return seloDoFecho(feitas, lista.length);
  $("rec_obra").hidden = false;
  desenhaTiras({ total: lista.length, marcas, fim: true, feitos: feitas });
  $("rec_obra_tempo").textContent = "";
  $("rec_obra_txt").textContent = num(feitas)
    + (feitas === 1 ? " recorte pronto" : " recortes prontos")
    + (feitas < lista.length
       ? ", " + num(lista.length - feitas) + " sem recorte" : "");
  $("rec_obra_nota").innerHTML = "estão em <a href=\"#\" data-abrir=\""
    + escapa(RECORTADO.onde) + "\">" + escapa(RECORTADO.pasta)
    + "</a>. Os brutos continuam onde estavam, intactos.";
}

/* A BARRA DE OBRA E' UMA SO', EM TRES LUGARES: recorte, escrita e fabricacao.

   ELE PEDIU EM 29/08/2026 que a escrita e a fabricacao seguissem "o mesmo modelo do
   recorte, aquele bonita com animacao no final". Em vez de copiar o desenho tres vezes,
   as tres usam as mesmas classes e este mesmo pintor: uma marca por peca, os selos da
   conta e o fecho que se desenha. Copiar seria tres lugares para divergirem.

   O RECORTE TEM PINTOR PROPRIO (`desenhaTiras`) porque ele sabe de QUAL tipo cada peca
   e' (card, tela cheia, cega), coisa que a escrita e a montagem nao tem. Aqui a marca
   sai da contagem: as feitas primeiro, depois as que nao tinham frase, depois as que
   falharam. */
function pintarObra(pre, d, rotulo) {
  const tiras = $(pre + "_tiras");
  const total = Number(d.total) || 0;
  if (!tiras || !total) return;
  // A BARRA SO' SE REMONTA QUANDO O TAMANHO MUDA: refazer 180 elementos de tres em tres
  // segundos jogaria fora a transicao de cor de cada marca.
  if (tiras.children.length !== total) {
    tiras.innerHTML = "";
    for (let i = 0; i < total; i++) tiras.appendChild(document.createElement("i"));
  }
  const feitos = Math.max(0, Math.min(total, Number(d.feitos) || 0));
  const sem = Math.max(0, Math.min(total - feitos, Number(d.sem) || 0));
  const falhas = Math.max(0, Math.min(total - feitos - sem, Number(d.falhas) || 0));
  for (let i = 0; i < total; i++) {
    const classe = i < feitos ? "card"
      : i < feitos + sem ? "cheio"
        : i < feitos + sem + falhas ? "falhou" : "";
    if (tiras.children[i].className !== classe) tiras.children[i].className = classe;
  }
  tiras.classList.toggle("andando", !d.fim);
  const poe = (id, texto) => { const e = $(pre + id); if (e) e.textContent = texto; };
  poe("_feitas", num(feitos));
  poe("_de", " de " + num(total) + " " + rotulo);
  poe("_atual", d.fim ? "" : (d.atual || ""));
  poe("_s_feitas", num(feitos));
  poe("_s_sem", num(sem));
  poe("_s_falhou", num(falhas));
  poe("_s_tempo", emTempo(Number(d.segundos) || 0));
}

/** A caixa volta a andar: o miolo reaparece e o selo do fecho sai da frente. */
function reabrirObra(pre) {
  const caixa = $(pre + "_obra"), fecho = $(pre + "_fecho");
  if (caixa) caixa.classList.remove("fechada");
  if (fecho) fecho.hidden = true;
}

/** O fecho: o miolo recolhe e sobra o verificado, com a conta e o que vem depois. */
function fecharObra(pre, texto) {
  const caixa = $(pre + "_obra"), fecho = $(pre + "_fecho");
  if (!caixa || !fecho) return;
  caixa.hidden = false;
  fecho.hidden = false;
  const b = $(pre + "_fecho_txt");
  if (b) b.textContent = texto;
  caixa.classList.add("fechada");
}

/* O SELO DO FECHO: a barra recolhe e sobra o verificado com a conta e a ordem de
   seguir. So' quando esta' TUDO pronto; faltando peca ou com falha, a barra fica,
   porque numero vermelho escondido atras de um selo verde seria mentira. */
function seloDoFecho(feitas, total) {
  const caixa = $("rec_obra"), fecho = $("rec_fecho");
  if (!caixa || !fecho) return;
  caixa.hidden = false;
  fecho.hidden = false;
  $("rec_fecho_txt").textContent = num(total)
    + (total === 1 ? " Recorte Pronto" : " Recortes Prontos")
    + ", 100%: Pode Avançar";
  caixa.classList.add("fechada");
}

function resumoDoRecorte() {
  if (RECORTADO) return;
  /* A CONTA E' DA LEVA DEPOIS DO XIS, e nao da pasta.

     ELE PEGOU ISTO NA MESMA HORA, em 22/08/2026: tirou treze reels no passo 1, o
     cabecalho de la' passou a dizer 94, e o passo 2 continuava oferecendo "107 pecas
     para recortar". Os dois numeros na mesma tela, um negando o outro. O pedido que ia
     para o programa ja' estava certo desde o comeco, com as 94; era esta linha que
     mostrava outra coisa, e a frase dele foi "voce nao disse que havia arrumado?".

     A LICAO E' DE ONDE VEM O NUMERO. Quem manda e' `pecas1()`, e nao `EDIT_PECAS`:
     `EDIT_PECAS` e' o que existe na pasta, e so' serve para saber se a pasta foi
     liberada. Toda conta que ele le' sai do filtro. */
  const n = pecas1().length;
  const fora = EDIT_PECAS.length - n;
  // O NUMERO MORA NO BOTAO, e num lugar so'. Ele diz o que vai acontecer e quanta coisa
  // e', que e' tudo o que a linha de resumo dizia antes de sair.
  dizNoBotao("rec_aplicar", "Recortar " + (n === 1 ? "A Peça" : "As " + num(n) + " Peças"));
  $("rec_aplicar").disabled = !n;
  /* E A CONTA DAS TIRADAS VAI PARA A LINHA DO PASSO 2 NA TRILHA. Ela morava numa linha
     de resumo no meio da tela, que saiu em 25/08/2026 com as outras descricoes. A licao
     que ela guarda e' de 22/08: ele tirou treze reels, o passo 1 passou a dizer 94 e o
     passo 2 seguia oferecendo "107 pecas para recortar", e a frase foi "voce nao disse
     que havia arrumado?". Na trilha ela fica onde se olha para saber o pe' de cada
     passo, sem voltar a ser bloco de texto no meio do caminho. */
  const r2 = $("ed_r2");
  if (r2) {
    r2.textContent = !n ? "o B-roll de cada vídeo"
      : num(n) + (n === 1 ? " peça" : " peças")
        + (fora ? `, ${num(fora)} ${fora === 1 ? "tirada" : "tiradas"} no passo 1` : "");
  }
}


/* ============================================ A BARRA DO RECORTE: UMA MARCA POR PECA

   O PEDIDO DELE, em 25/08/2026: "faca a proposta de como vai ficar a barra de
   carregamento, porque as barras que tem agora dentro do sistema de edicao eu nao to'
   curtindo". Uma tarja que enche diz UMA coisa, a fracao. Uma marca por peca diz tres de
   uma vez: quantas sao, quantas ja' foram e QUAIS deram problema.

   O DESENHO SO' E' POSSIVEL PORQUE O MOTOR PASSOU A CONTAR PECA A PECA. O andamento
   ganhou o campo `marcas`, uma letra por peca, escrito pelo `oficina.py` a cada uma que
   fecha: `.` ainda nao, `c` recortada pelo card, `v` sem card (video inteiro), `?` nao
   consegui olhar, `f` falhou. Sem isso a barra so' saberia contagem, e a cor da falha
   nao teria onde pousar.

   AS PECAS NAO ACABAM EM ORDEM, e a barra nao finge que acabam: com varias rodando
   juntas, a terceira fecha antes da primeira, e a marca acende no lugar DELA na leva.
   Por isso nao existe "ponta viva" aqui: ponta viva seria afirmar uma posicao que nao
   existe. Quem prova vida e' o campo que anda e o relogio ao lado. */
const MARCA_DA_PECA = { c: "card", v: "cheio", "?": "cega", f: "falhou" };

function desenhaTiras(d) {
  const tiras = $("rec_tiras");
  if (!tiras) return;
  const total = Number(d.total) || (REC_OBRA && REC_OBRA.total) || 0;
  if (!total) return;
  // A BARRA SO' SE REMONTA QUANDO O TAMANHO MUDA: reconstruir 180 elementos de tres em
  // tres segundos jogaria fora a transicao de cor de cada marca, que e' o que faz a
  // barra parecer viva em vez de piscar inteira.
  if (tiras.children.length !== total) {
    tiras.innerHTML = "";
    for (let i = 0; i < total; i++) tiras.appendChild(document.createElement("i"));
  }
  const marcas = String(d.marcas || "");
  const conta = { card: 0, cheio: 0, cega: 0, falhou: 0 };
  let feitas = 0;
  for (let i = 0; i < total; i++) {
    const classe = MARCA_DA_PECA[marcas[i]] || "";
    if (tiras.children[i].className !== classe) tiras.children[i].className = classe;
    if (classe) { conta[classe]++; feitas++; }
  }
  /* MOTOR VELHO NAO MANDA `marcas`, e a barra nao pode ficar vazia por isso. Sem o
     campo, ela pinta as primeiras `feitos` de verde: e' menos verdade (perde QUAIS
     falharam) mas continua sendo o avanco certo, e nao um retangulo morto. */
  if (!marcas && d.feitos) {
    const ate = Math.min(total, Number(d.feitos) || 0);
    for (let i = 0; i < ate; i++) tiras.children[i].className = "card";
    feitas = ate;
    conta.card = ate;
  }
  tiras.classList.toggle("andando", !d.fim);

  $("rec_feitas").textContent = num(feitas);
  $("rec_de").textContent = " de " + num(total)
    + (total === 1 ? " peça recortada" : " peças recortadas");
  $("rec_atual").textContent = d.fim ? "" : (d.atual || "");
  $("rec_s_card").textContent = num(conta.card);
  $("rec_s_cheio").textContent = num(conta.cheio + conta.cega);
  $("rec_s_falhou").textContent = num(conta.falhou);

  const seg = Number(d.segundos) || 0;
  $("rec_s_tempo").textContent = emTempo(seg);
  // FALTA QUANTO SO' DEPOIS DA PRIMEIRA PECA: dividir por zero devolveria infinito, e
  // "falta Infinity" e' pior do que nao dizer nada.
  $("rec_s_falta").textContent = d.fim ? "acabou"
    : (feitas && seg ? emTempo(Math.round(seg / feitas * (total - feitas)))
                     : "calculando");
}

/** Segundos em palavra curta, para caber ao lado do numero. */
function emTempo(s) {
  if (s < 60) return Math.round(s) + "s";
  const m = Math.floor(s / 60);
  return m + " min " + Math.round(s % 60) + "s";
}

/* ====================================================== A TRILHA QUE RECOLHE

   "Aquela barra daquela timeline deveria ser aquele tipo de timeline que eu consigo
   fechar e abrir, tipo esconder e abrir, porque ai' eu consigo deixar essa tela aqui
   centralizada."  25/08/2026.

   O ESTADO MORA NO NAVEGADOR, e nao no rascunho da leva: ele e' preferencia de quem
   olha, e nao dado do trabalho. Rascunho e' por leva; isto vale para todas. E o `try`
   existe porque navegador com armazenamento bloqueado ATIRA ao ler, e uma preferencia
   de tela nao pode derrubar a oficina. */
const CHAVE_DA_TRILHA = "estudio.trilho.fechado";

function pintarTrilha(fechado) {
  const tela = document.querySelector("#ed_oficina .ed-tela") || $("ed_oficina");
  if (tela) tela.classList.toggle("trilho-fechado", fechado);
  const b = $("ed_puxador");
  if (b) {
    const dizer = fechado ? "Abrir a trilha" : "Recolher a trilha";
    b.title = dizer;
    b.setAttribute("aria-label", dizer);
  }
}

function lembrarDaTrilha() {
  let fechado = false;
  try { fechado = localStorage.getItem(CHAVE_DA_TRILHA) === "1"; } catch (e) {}
  pintarTrilha(fechado);
}

if ($("ed_puxador")) {
  $("ed_puxador").onclick = () => {
    let fechado = false;
    try { fechado = localStorage.getItem(CHAVE_DA_TRILHA) === "1"; } catch (e) {}
    fechado = !fechado;
    try { localStorage.setItem(CHAVE_DA_TRILHA, fechado ? "1" : "0"); } catch (e) {}
    pintarTrilha(fechado);
  };
  lembrarDaTrilha();
}

/* ---------------------------------------------------------- deixar o pedido

   A TELA NÃO RECORTA NADA: ela escreve o pedido e passa a olhar o andamento. Quem recorta
   é o `oficina.py`, que roda na casa do Estúdio de minuto em minuto. Por isso a primeira
   frase que aparece é sobre a espera: sem ela, o minuto entre o clique e o primeiro sinal
   de vida é indistinguível de tela travada. */
$("rec_aplicar").onclick = async () => {
  // `pecas1()` E NAO `EDIT_PECAS`: tirando todas as pecas da leva, nao ha' o que pedir.
  if (!EDIT_LEVA || REC_OBRA || !pecas1().length) return;
  $("rec_aplicar").disabled = true;
  try {
    /* SEM SAIDA NAO PODE, e este era um beco.

       O CRACHA VELHO aponta para `Estudio\\levas`, de uma versao em que a tela so' lia
       video. Com ele, os videos da leva aparecem certinho e o passo 1 inteiro funciona,
       mas a raiz do Estudio nunca entra na mao e este passo falha sempre com "a pasta
       nao esta' liberada". O botao de apontar a pasta mora no cartao do passo 1, que a
       essa altura ja' saiu da tela: ele lia que faltava liberar a pasta, com a pasta
       liberada e sem nada para clicar. Foi uma tarde dele.

       `pedirPasta` E' QUEM SABE DESFAZER ISSO: ela reconhece o cracha velho e abre a
       janela de arquivos na pasta certa. Chamada de dentro do clique, ainda tem o gesto
       do usuario na mao, que e' o que o navegador exige para abrir essa janela. */
    // SO' AS QUE FALTAM, quando já houve recorte: o botão promete "Recortar as N que
    // faltaram" e o pedido cumpre a promessa, em vez de pagar a leva inteira de novo.
    // Quem protege a ficha é a oficina, fundindo a `_origem.json` nova com a que já
    // existe. Sem recorte nenhum, vão todas as que ficaram na leva.
    const jaTem = new Set(EDIT_RECORTES.map(x => x.nome));
    const alvos = RECORTADO ? pecas1().filter(x => !jaTem.has(x.nome)) : pecas1();
    if (!alvos.length) { $("rec_aplicar").disabled = false; return; }
    const id = "r" + Date.now();
    const pedido = {
      id, tipo: "recorte", leva: EDIT_LEVA.numero,
      pasta: "leva-" + EDIT_LEVA.numero, destino: "leva-" + EDIT_LEVA.numero,
      tela: { w: 1080, h: 1920 },
      // SEM RETÂNGULO ESCRITO AQUI: cada peça é medida na hora de gravar, porque cada
      // reel põe a filmagem num lugar e num tamanho diferentes. Mandar um retângulo só
      // para as cento e sete seria justamente o erro que este passo veio consertar.
      // SO' O QUE ELE DEIXOU NA LEVA. Peca tirada no passo 1 nao entra no recorte, e
      // por isso nao existe recorte dela para as fases seguintes usarem.
      pecas: alvos.map(p => ({ arquivo: p.nome }))
    };
    // O POSTO PRIMEIRO, desde 25/08/2026: este era um dos dois pedidos que só sabiam a
    // pasta, e com a casa na VPS a pasta desta máquina não leva a lugar nenhum. O plano
    // B da pasta continua, com o resgate do crachá velho que já custou uma tarde.
    if (await postoDePe()) {
      await noPosto("/pedido", pedido);
    } else {
      let pedidos = await pastaDo("pedidos", true);
      if (!pedidos) {
        await pedirPasta();
        pedidos = await pastaDo("pedidos", true);
      }
      if (!pedidos) throw new Error("o posto do Estúdio está fora e a pasta não está liberada. Recarregue a página em um minuto e tente de novo.");
      await pastaDo("recortes", true);
      const h = await pedidos.getFileHandle(id + ".json", { create: true });
      const w = await h.createWritable();
      await w.write(JSON.stringify(pedido, null, 1));
      await w.close();
    }

    REC_OBRA = { id, desde: Date.now(), total: alvos.length, relogio: null };
    $("rec_obra").hidden = false;
    // OBRA NOVA DESFAZ O SELO: a caixa volta a ser barra viva.
    $("rec_obra").classList.remove("fechada");
    $("rec_fecho").hidden = true;
    desenhaTiras({ total: alvos.length, marcas: "", fim: false });
    $("rec_obra_txt").textContent = "pedido deixado";
    $("rec_obra_nota").textContent = "o recorte começa em até um minuto, que é o passo do "
      + "programa que faz esse trabalho na casa do Estúdio.";
    REC_OBRA.relogio = setInterval(olharORecorte, 3000);
    olharORecorte();
    // O VIGIA VAI PARA O RASCUNHO NA HORA. Sem esta linha, um F5 logo depois do
    // clique perdia o pedido: a esteira trabalhava e a tela voltava muda, que foi
    // exatamente o que o Gabriel viu em 26/08/2026.
    salvarRascunho();
  } catch (e) {
    $("rec_aplicar").disabled = false;
    $("rec_obra").hidden = false;
    $("rec_obra_txt").textContent = "não deu para deixar o pedido";
    $("rec_obra_nota").textContent = e.message;
  }
};

async function olharORecorte() {
  if (!REC_OBRA) return;
  const seg = Math.round((Date.now() - REC_OBRA.desde) / 1000);
  $("rec_obra_tempo").textContent = seg < 60 ? seg + "s"
    : Math.floor(seg / 60) + " min " + (seg % 60) + "s";

  /* A RODA NAO PODE GIRAR PARA SEMPRE. E' a terceira e ultima copia desta nota; as
     outras duas estao em `olharAEscrita` e `olharAObra`, e valem igual aqui: quem
     recorta e' o `oficina.py`, entao perder o contato nao quer dizer que parou. Avisa,
     segue tentando, e desiste depois de tres minutos mudos. */
  const semContato = (porque) => {
    REC_OBRA.mudo = (REC_OBRA.mudo || 0) + 1;
    if (REC_OBRA.mudo * 3 < 25) return;
    if (REC_OBRA.mudo * 3 >= 180) {
      const viu = REC_OBRA.jaViu;
      return pararORecorte(viu
        ? "perdi o contato com o programa no meio do recorte. Recarregue a página (F5): o que ele já recortou está na pasta."
        : "a oficina do Estúdio não pegou o pedido em três minutos. Confira se ela está de pé (a passagem de montar edições, de minuto em minuto).");
    }
    $("rec_obra_txt").textContent = "sem contato com o programa";
    $("rec_obra_nota").textContent = porque + " Continuo tentando; o recorte pode estar acontecendo mesmo assim.";
  };

  // O ANDAMENTO VEM DO POSTO desde 25/08/2026, como nas fases mais novas; a pasta
  // liberada é o plano B de quando ele está fora.
  let d = null;
  if (await postoDePe()) {
    try {
      const r = await noPosto("/pedido?id=" + REC_OBRA.id);
      d = r.tem ? r.d : null;
    } catch (e) {
      return semContato("Não consegui ler o andamento: " + (e.message || e) + ".");
    }
  } else {
    const p = await pastaDo("pedidos", false);
    if (!p) return semContato("O posto está fora e a pasta do Estúdio não está liberada nesta aba.");
    try {
      const f = await (await p.getFileHandle(REC_OBRA.id + ".andamento.json")).getFile();
      d = JSON.parse(await f.text());
    } catch (e) {
      return semContato("Não consegui ler o andamento: " + (e.message || e) + ".");
    }
  }
  if (!d) return semContato("O programa ainda não pegou o pedido.");
  REC_OBRA.mudo = 0;
  REC_OBRA.jaViu = true;

  // NA FILA NÃO É SUMIDO, mesma regra do olharAObra: o posto responde `fila` quando
  // o pedido existe e a oficina ainda está ocupada com outro trabalho.
  if (d.fila) {
    REC_OBRA.mudo = 0;
    $("rec_obra_txt").textContent = "na fila, atrás de um trabalho em curso";
    $("rec_obra_nota").textContent = "a oficina termina o que está fazendo e pega "
      + "este pedido em seguida.";
    return;
  }
  if (d.erro) return pararORecorte("não deu: " + d.erro);
  const feitos = d.feitos || 0, total = d.total || REC_OBRA.total;
  desenhaTiras(d);
  if (!d.fim) {
    // A ESTEIRA APARECE COMO ESTEIRA, e não como "recortando 1 de 107" com dezesseis
    // vagas trabalhando em paralelo (auditoria de 25/08/2026).
    if (d.esteira && d.esteira.vagas) {
      $("rec_obra_txt").textContent = "na esteira: " + (d.esteira.colhidas || 0)
        + " de " + d.esteira.vagas + " vagas colhidas";
    } else {
      $("rec_obra_txt").textContent = "recortando " + (feitos + 1) + " de " + total;
    }
    $("rec_obra_nota").textContent = d.atual ? "agora: " + d.atual : "";
    return;
  }
  // A DESISTÊNCIA DA ESTEIRA NÃO SOME: as peças que não voltaram viraram um pedido
  // local (mesmo id com "r"), e a vigia SEGUE nele em vez de declarar vitória com a
  // leva pela metade (auditoria de 25/08/2026).
  if (d.aviso && !REC_OBRA.id.endsWith("r")) {
    $("rec_obra_txt").textContent = "a esteira devolveu parte da leva";
    $("rec_obra_nota").textContent = d.aviso
      + ". Sigo acompanhando as peças que voltaram para esta máquina.";
    REC_OBRA.id = REC_OBRA.id + "r";
    REC_OBRA.mudo = 0;
    REC_OBRA.jaViu = false;
    return;
  }
  clearInterval(REC_OBRA.relogio);
  REC_OBRA = null;
  // O GIRO PARA QUANDO ACABA. Ele continuava rodando com os 107 recortes prontos na
  // pasta, e um símbolo de carregando em cima de um trabalho terminado diz que ainda
  // falta alguma coisa. Terminou, é aviso parado.
  desenhaTiras(d);
  const cards = d.cards || 0;
  $("rec_obra_txt").textContent = feitos
    + (feitos === 1 ? " recorte pronto" : " recortes prontos")
    + (d.falhas ? ", " + d.falhas + " falharam" : "");
  // A CONTA TEM DE FECHAR, E "NAO CONSEGUI OLHAR" NAO E' "TELA CHEIA". O programa passou
  // a separar os dois; aqui a tela mostra os tres, para o numero do meio parar de
  // engordar com peca que ninguem conseguiu medir.
  // A CONTA DOS TRES ESTADOS VIVE NA PROPRIA BARRA desde 25/08/2026, com uma cor cada:
  // recortada pelo card, sem card (video inteiro) e a que nao abriu. O bloco de texto
  // que dizia a mesma coisa saiu junto com a coluna lateral.
  await procurarRecortes();
  desenhaRecortado();
  // O BOTÃO VOLTA À VIDA NO FIM: com falhas, o desenhaRecortado o deixa visível
  // dizendo "Recortar as N que faltaram", e ele estava preso no disabled do clique
  // até um F5. Auditoria de 25/08/2026.
  $("rec_aplicar").disabled = false;
  const onde = RECORTADO ? RECORTADO.onde : "";
  $("rec_obra_nota").innerHTML = "estão em <a href=\"#\" data-abrir=\""
    + escapa(onde) + "\">" + escapa(d.pasta || "")
    + "</a>. Os brutos continuam onde estavam, intactos.";
  // O FECHO AO VIVO: a barra termina de acender, respira um instante, e ai' recolhe
  // no selo. So' com a leva INTEIRA sem falha; sobrou vermelho, a barra fica.
  if (!d.falhas && total && feitos >= total) {
    setTimeout(() => { if (!REC_OBRA) seloDoFecho(feitos, total); }, 1200);
  }
  salvarRascunho();
}

function pararORecorte(recado) {
  if (REC_OBRA && REC_OBRA.relogio) clearInterval(REC_OBRA.relogio);
  REC_OBRA = null;
  $("rec_aplicar").disabled = false;
  $("rec_obra_txt").textContent = recado;
}

$("rec_segue").onclick = () => irParaPasso(3);

/* ------------------------------------------------- ajudantes do passo 2 */

/* O TEXTO DO BOTAO ANIMADO MORA DENTRO DELE, e nao nele.

   O `.btn` da edicao tem quatro filhos (o circulo que engole, duas setas e o texto), e
   `botao.textContent = "..."` APAGA os quatro e deixa so' a palavra: o botao continua
   funcionando e perde a animacao inteira, calado. Como so' o passo 2 troca o texto de um
   botao em tempo de uso, o desvio vive aqui. */
function dizNoBotao(id, texto) {
  const b = $(id);
  if (!b) return;
  const dentro = b.querySelector(".txt");
  if (dentro) dentro.textContent = texto;
  else b.textContent = texto;
}

/* O ROTULO DO REEL LEVA O ARROBA DE QUEM POSTOU, por pedido dele em 25/08/2026: "voce
   pode trocar esses titulos para tipo, o reel, ai' bota o arroba do Instagram". O nome do
   arquivo de leva e' `0001.50x_conta_CODIGO.mp4`, entao a conta e' o miolo. Quando o nome
   nao segue o molde, fica so' "Reel": inventar arroba errado e' pior que nao ter. */
function rotuloDoReel(nome) {
  const alvo = $("rec_rot_a");
  if (!alvo) return;
  // O SUBLINHADO VAI ENTRE COLCHETES de proposito. Colado no parenteses, o conferidor
  // casa le' a expressao como CHAMADA de uma funcao chamada `x_` e reprova o arquivo
  // inteiro. `x[_](` casa exatamente o mesmo e nao parece chamada de nada.
  const m = /^[\d.]+x[_](.+)[_][^_]+\.mp4$/i.exec(String(nome || ""));
  alvo.innerHTML = m
    ? 'Reel <span class="arroba">@' + m[1].replace(/[<>&]/g, "") + "</span>"
    : "Reel";
}

/* PULA PARA UM INSTANTE DO VÍDEO E ESPERA ELE CHEGAR LÁ. Sem esperar o `seeked`, o
   quadro lido no canvas é o anterior, e a análise mede a mesma imagem dez vezes. */
function irNoTempo(v, t) {
  return new Promise(ok => {
    let venceu = true;
    const pronto = () => { v.removeEventListener("seeked", chegou); ok(venceu); };
    const chegou = () => { venceu = false; pronto(); };
    v.addEventListener("seeked", chegou);
    v.currentTime = t;
    // O PRAZO SUBIU DE 1,8 s PARA 5 s em 25/08/2026: com o vídeo vindo da casa da VPS
    // em pedaços, o salto de quadro pode esperar a rede, e o prazo curto fazia a
    // análise ler o mesmo quadro várias vezes numa ligação lenta.
    //
    // E AGORA ELE DIZ QUE VENCEU, em vez de mentir por omissão. Quando o prazo estourava,
    // a análise seguia em frente e desenhava o quadro ANTERIOR no canvas: dois quadros
    // iguais, máscara de movimento encolhida, janela errada, e nada disso aparecia na
    // tela. Medido em 25/08/2026 num navegador sem aceleração: CINCO dos dez saltos
    // bateram no teto numa rodada só, e o recorte torto passou por medida boa.
    setTimeout(pronto, 5000);
  });
}

/* QUEM MEDE E' QUEM GRAVA, e a tela só pergunta.

   O QUE ACONTECIA ATE' 25/08/2026: a aba media o vídeo DENTRO do navegador, com dez
   saltos no arquivo, um por quadro de análise. Medido num Chrome de verdade contra a
   casa da VPS: cada clique em Ver Outro Reel virava DEZESSEIS pedidos e baixava 6,95 MB
   de um arquivo de 7,58 MB, para amostrar dez quadros de 160 por 284 pontos. E o piso
   do caminho é a distância, não o byte: com ping de 184 ms, dez idas e voltas custam
   4,18 s nem que a carga fosse zero. Eram os cinco a dez segundos que o Gabriel
   cronometrou.

   Agora é uma pergunta só ao posto, que tem o arquivo no disco e o ffmpeg do lado.

   E ISSO MATA A SEGUNDA IMPLEMENTAÇÃO. O mesmo algoritmo vivia em dois lugares, no
   `oficina.py` que GRAVA e aqui, que só conferia. Duas contas do mesmo número é a
   receita de elas discordarem, e esta tela podia estar mostrando um retângulo diferente
   do que ia ser gravado. O medidor local abaixo continua existindo para UM caso: a pasta
   liberada pelo navegador, plano B de quando o posto está fora, onde não há caminho para
   o posto medir. */
async function medirOBroll(item) {
  // PASTA DO NAVEGADOR NÃO TEM CAMINHO NA CASA: aí o jeito é medir aqui mesmo.
  if (item && item.h) return acharBrollAqui($("rec_video"));
  try {
    const onde = pastaDaLeva() + "/" + item.nome;
    const r = await fetch(POSTO + "/broll?onde=" + encodeURIComponent(onde),
                          { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    // NÃO MEDIR NÃO É TELA CHEIA: nulo aqui faz o `desenhaRecorteExemplo` dizer que não
    // conseguiu, em vez de afirmar que o reel não tem card. Trava 2 do CLAUDE.md.
    return (r.ok && d.tem && d.d) ? d.d : null;
  } catch (e) {
    return null;
  }
}

/** Pede ao posto a medida de um reel que AINDA nao esta' na tela, so' para ele
    guardar. Pela pasta do navegador nao ha' o que esquentar: a medida e' local. */
function esquentarAMedida(item) {
  if (!item || item.h) return;
  try {
    const onde = pastaDaLeva() + "/" + item.nome;
    fetch(POSTO + "/broll?onde=" + encodeURIComponent(onde)).catch(() => {});
  } catch (e) {}
}

/* A JANELA DO B-ROLL, aqui no navegador, pelo mesmo método do `oficina.py`.

   OS REELS MINERADOS SÃO CARTÕES DE NOTÍCIA: em cima o arroba e a legenda de quem postou,
   pintados uma vez e parados; embaixo, dentro de um retângulo, a filmagem.

   POR QUE NÃO BASTA MEDIR MOVIMENTO, que era a primeira versão: movimento acha o que se
   MEXE dentro da janela, e não a janela. Quando o fundo da filmagem é parado, uma cortina
   ou uma parede, e só o rosto se move, o retângulo encolhia para o rosto.

   TRÊS TEMPOS: o que se mexe é a semente, a cor do card sai da margem de cima e de baixo,
   e a janela é o trecho contínuo de linhas e colunas que não são a cor do card. */
async function acharBrollAqui(v) {
  const N = 10, LARG = 160;
  if (!v || !v.videoWidth || !isFinite(v.duration) || v.duration <= 0) return null;
  const ALT = Math.max(8, Math.round(LARG * v.videoHeight / v.videoWidth));
  const c = document.createElement("canvas");
  c.width = LARG; c.height = ALT;
  const g = c.getContext("2d", { willReadFrequently: true });
  const antes = v.currentTime, tocava = !v.paused;
  v.pause();
  const quadros = [];
  try {
    // AS PONTAS FICAM DE FORA. A legenda de muitos reels ENTRA animada nos primeiros
    // segundos, e nesse intervalo ela se mexe igual à filmagem: o detector a incluía no
    // B-roll e ela ia parar dentro da peça. Do primeiro sexto até quase o fim ela já está
    // parada. Visto na tela antes de ir para o ar.
    const INI = 0.15, FIM = 0.88;
    for (let i = 0; i < N; i++) {
      // SALTO QUE NÃO CHEGOU DERRUBA A MEDIDA INTEIRA. Ver a nota no `irNoTempo`: seguir
      // com o quadro anterior devolve um retângulo errado com cara de certo, e é melhor
      // dizer que não deu do que mostrar medida inventada.
      if (await irNoTempo(v, v.duration * (INI + (FIM - INI) * (i + 0.5) / N)))
        return null;
      g.drawImage(v, 0, 0, LARG, ALT);
      quadros.push(g.getImageData(0, 0, LARG, ALT).data);
    }
  } catch (e) { return null; }
  finally {
    v.currentTime = antes;
    if (tocava) v.play().catch(() => {});
  }
  if (quadros.length < 3) return null;
  const inteiro = { x: 0, y: 0, w: 1, h: 1, modo: "tela cheia" };
  const n = LARG * ALT;

  // 1 ..... a semente: o que se mexe. Linha ou coluna só conta se boa parte dela mexeu;
  // um ponto solto variando por ruído de compressão existe em toda parte.
  const mexe = new Uint8Array(n);
  for (let k = 0, p = 0; k < n; k++, p += 4) {
    let mn = 255, mx = 0;
    for (const q of quadros) {
      const cz = (q[p] * 299 + q[p + 1] * 587 + q[p + 2] * 114) / 1000;
      if (cz < mn) mn = cz;
      if (cz > mx) mx = cz;
    }
    mexe[k] = (mx - mn) > 10 ? 1 : 0;
  }
  const linhaDe = m => { const r = new Float32Array(ALT);
    for (let y = 0; y < ALT; y++) { let s = 0;
      for (let x = 0; x < LARG; x++) s += m[y * LARG + x]; r[y] = s / LARG; } return r; };
  const colunaDe = (m, a, b) => { const r = new Float32Array(LARG), h = b - a + 1;
    for (let x = 0; x < LARG; x++) { let s = 0;
      for (let y = a; y <= b; y++) s += m[y * LARG + x]; r[x] = s / h; } return r; };

  const pm = linhaDe(mexe);
  let y0 = -1, y1 = -1, x0 = -1, x1 = -1;
  for (let y = 0; y < ALT; y++) if (pm[y] > 0.18) { if (y0 < 0) y0 = y; y1 = y; }
  const pmx = colunaDe(mexe, 0, ALT - 1);
  for (let x = 0; x < LARG; x++) if (pmx[x] > 0.18) { if (x0 < 0) x0 = x; x1 = x; }
  if (y0 < 0 || x0 < 0) return null;

  // 2 ..... a cor do card, tirada da margem de cima e da de baixo. São as duas que num
  // card são SEMPRE fundo: o arroba mora no alto e o retângulo nunca encosta na borda
  // superior. A esquerda e a direita não servem, porque há janela que vai de ponta a
  // ponta na largura.
  const m = Math.max(2, Math.round(ALT * 0.02));
  const meio = (h, total) => { let acc = 0;
    for (let i = 0; i < 256; i++) { acc += h[i]; if (acc * 2 >= total) return i; } return 0; };
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let quantos = 0;
  const naBorda = f => { for (let y = 0; y < m; y++) for (const yy of [y, ALT - 1 - y])
      for (let x = 0; x < LARG; x++) f((yy * LARG + x) * 4); };
  for (const q of quadros) naBorda(p => {
    hist[0][q[p]]++; hist[1][q[p + 1]]++; hist[2][q[p + 2]]++; quantos++;
  });
  const cor = [meio(hist[0], quantos), meio(hist[1], quantos), meio(hist[2], quantos)];
  const hl = new Uint32Array(256);
  let ql = 0;
  for (const q of quadros) naBorda(p => {
    hl[Math.max(Math.abs(q[p] - cor[0]), Math.abs(q[p + 1] - cor[1]),
                Math.abs(q[p + 2] - cor[2]))]++; ql++;
  });
  const liso = meio(hl, ql);
  if (liso > 26) return inteiro;                  // margem viva: não há card

  // 3 ..... o que NÃO é o fundo do card. A tolerância acompanha o quanto a margem é
  // lisa: card preto cravado aceita desvio pequeno como sinal.
  const tol = Math.max(10, liso * 2 + 8);
  const janela = new Uint8Array(n);
  for (let k = 0, p = 0; k < n; k++, p += 4) {
    let d = 0;
    for (const q of quadros) {
      const e = Math.max(Math.abs(q[p] - cor[0]), Math.abs(q[p + 1] - cor[1]),
                         Math.abs(q[p + 2] - cor[2]));
      if (e > d) d = e;
    }
    janela[k] = (d > tol || mexe[k]) ? 1 : 0;
  }

  // 4 ..... a janela é o TRECHO CONTÍNUO de linhas cheias em volta da semente, mais a
  // RAMPA das pontas. Um limite só era frágil pelos dois lados: limite alto parava dentro
  // da filmagem quando o topo dela era escuro, limite baixo vazava para a legenda.
  const trecho = (perfil, centro, chao, beira) => {
    const lim = Math.max(chao, perfil[centro] * 0.6);
    let a = centro, b = centro;
    while (a > 0 && perfil[a - 1] >= lim) a--;
    while (b < perfil.length - 1 && perfil[b + 1] >= lim) b++;
    while (a > 0 && perfil[a - 1] > beira) a--;
    while (b < perfil.length - 1 && perfil[b + 1] > beira) b++;
    return [a, b];
  };
  const cy = (y0 + y1) >> 1, cx = (x0 + x1) >> 1;
  [y0, y1] = trecho(linhaDe(janela), cy, 0.30, 0.10);
  // NA LARGURA O CHÃO É BAIXO DE PROPÓSITO: dentro da faixa de linhas da janela, a coluna
  // de fundo do card dá zero cravado, então qualquer sinal já é janela. Com chão alto,
  // filmagem escura (o interior de um carro) virava fundo e o recorte comia a lateral.
  [x0, x1] = trecho(colunaDe(janela, y0, y1), cx, 0.15, 0.04);
  const pd = new Float32Array(ALT), largura = x1 - x0 + 1;
  for (let y = 0; y < ALT; y++) { let s = 0;
    for (let x = x0; x <= x1; x++) s += janela[y * LARG + x]; pd[y] = s / largura; }
  [y0, y1] = trecho(pd, cy, 0.30, 0.10);

  if ((y1 - y0 + 1) * (x1 - x0 + 1) > 0.92 * ALT * LARG) return inteiro;

  // A FORMA, e não só a caixa em volta dela. Linha por linha, dentro da caixa, o primeiro
  // e o último ponto que não são fundo. É o mesmo cálculo do `oficina.py`, e serve para a
  // tela mostrar o recorte com a borda que ele vai ter de verdade: canto arredondado sai
  // arredondado aqui também, e não um retângulo que mente sobre o arquivo.
  const linhas = [];
  const larg = x1 - x0 + 1;
  for (let y = y0; y <= y1; y++) {
    let a = -1, b = -1;
    for (let x = x0; x <= x1; x++) if (janela[y * LARG + x]) { if (a < 0) a = x; b = x; }
    linhas.push(a < 0 || (b - a + 1) < Math.max(2, larg * 0.03) ? null : [a, b + 1]);
  }
  /* O MIOLO É RETO POR CONSTRUÇÃO, e as pontas só estreitam. Num card a janela é uma
     faixa de largura fixa que curva nos quatro cantos. Sem isto, filmagem escura perto
     da borda fazia a linha perder o limite e o contorno entrava na imagem: a máscara
     saía com dentes na lateral. É o mesmo cálculo do `oficina.py`. */
  const cheios = [];
  for (let i = 0; i < linhas.length; i++) if (linhas[i]) cheios.push(i);
  if (cheios.length) {
    const corte = Math.max(1, Math.floor(cheios.length / 5));
    const corpo = cheios.slice(corte, cheios.length - corte);
    const miolo = corpo.length ? corpo : cheios;
    let fe = Infinity, fd = -Infinity;
    for (const i of miolo) { fe = Math.min(fe, linhas[i][0]); fd = Math.max(fd, linhas[i][1]); }
    for (const i of miolo) { linhas[i][0] = fe; linhas[i][1] = fd; }
    for (const i of cheios) {
      linhas[i][0] = Math.max(linhas[i][0], fe);
      linhas[i][1] = Math.min(linhas[i][1], fd);
    }
  }
  for (const i of cheios) { linhas[i] = [linhas[i][0] / LARG, linhas[i][1] / LARG]; }
  return { x: x0 / LARG, y: y0 / ALT, w: (x1 - x0 + 1) / LARG,
           h: (y1 - y0 + 1) / ALT, modo: "card", linhas };
}

/* ==================================================================== O PASSO 3

   O TEMPLATE EM QUATRO FASES, na ordem que o Gabriel desenhou em 20/08/2026:

     1. o texto      onde ele fica, com que letra, e o cadeado
     2. as imagens   logo e PNG, com cadeado de posição
     3. a IA escreve lê a frase do card e escreve uma nova para cada peça
     4. os ajustes   a IA acerta tamanho e posição peça a peça, e monta

   A ORDEM ESTÁ INVERTIDA EM RELAÇÃO À PRIMEIRA VERSÃO. Antes o template trazia uma
   moldura e o vídeo era recortado para caber nela. Agora o B-roll já chega pronto do
   passo 2, na posição e no tamanho originais, e o template é construído EM VOLTA dele:
   "o que vai ditar como o template vai ser trabalhado agora é o B-roll".

   AS COORDENADAS SÃO FRAÇÃO DA TELA, e não pixel, para o mesmo template servir a
   qualquer tamanho de peça e a tela do editor ter a largura que couber. */

/* AS PECAS QUE ELE TIROU DA LEVA, pelo nome do arquivo.

   O PEDIDO DELE, em 22/08/2026: "esse reels daqui eu nao quero que ele passe. Ai' que
   eu tenho um xzinho aonde eu excluo esse reels, esse reels nao passa por toda essa
   etapa de edicao ate' sair a peca final".

   PELO NOME, E NAO PELA POSICAO. O indice muda quando a lista e' reordenada ou quando
   uma peca some da pasta, e um rascunho guardado por indice passaria a excluir outro
   video no dia seguinte, calado. O nome do arquivo e' o mesmo do comeco ao fim da
   linha: e' ele que vai no pedido de recorte, e' ele que nomeia o recorte, e e' ele que
   a IA e a montagem usam.

   TIRAR NAO APAGA NADA DO DISCO. O video bruto continua na pasta da leva; o que muda e'
   que ele nao entra em pedido nenhum daqui para a frente. */
let EXCLUIDAS = new Set();

// AS PECAS QUE NAO TEM FRASE PARA A IA LER. Nulo quer dizer "nao sei", e nesse caso
// ninguem e' pulado. Ver a nota em `procurarRecortes`.
let SEM_FRASE = null;

/* ONDE O B-ROLL FICA DENTRO DE CADA PECA, em fracao da tela.

   E' UM RETANGULO DIFERENTE EM CADA UMA, e isso e' o coracao do problema. Medido na leva
   29 dele: uma peca tem a filmagem comecando a 40,2% da altura, outra a 37,1%, outra a
   38,3%. O template e' um so' e as caixas de texto ficam paradas no mesmo lugar; a
   filmagem e' que sobe e desce. Onde ela sobe mais, o texto cai em cima dela.

   QUEM MEDE E' O PASSO 2, e ele ja' escreve isso na ficha `_origem.json` de cada leva.
   Nada aqui e' estimado: e' o mesmo retangulo que o programa usa para abrir o buraco na
   camada do template na hora de montar. */
let BROLL_DE = null;                // nome do arquivo -> {x, y, w, h}
let MODO_DE = null;                 // nome do arquivo -> modo do recorte (a ficha)
let TPL_SUB = 1;
const ACERVO = { itens: [] };

let TPL = null;                    // a composição que está na bancada
let ED_IMGS = new Map();           // arquivo -> blob URL, para desenhar sem reler o disco
let ED_BROLL_I = -1;               // qual recorte está servindo de conferência

const TELA = { w: 1080, h: 1920 };
const novoId = () => "e" + Math.random().toString(36).slice(2, 8);

/* AS FONTES DA PEÇA. Eram sete, e o Gabriel abriu o seletor e disse o óbvio: "aqui
   deveria ter vários outros tipos de fonte, e não tem". As sete eram as do Windows mais
   duas dele, e faltava justamente a família que um reel de página escura usa, que é
   manchete pesada e condensada.

   AS NOVE NOVAS VÊM DO GOOGLE FONTS, licença aberta, sem custo. Elas precisam existir nos
   dois lados: aqui o navegador as busca para mostrar, e na hora de gravar o `oficina.py`
   lê os mesmos arquivos de `Estudio/fontes`. Fonte que existisse só de um lado faria a
   peça sair diferente do que ele viu na tela, e é por isso que as duas listas são a
   mesma. O `g` agrupa a lista na aba de Configurações e o seletor ignora. */
const FONTES = [
  { v: "anton", r: "Anton", g: "Manchete" },
  { v: "bebas", r: "Bebas Neue", g: "Manchete" },
  { v: "archivobk", r: "Archivo Black", g: "Manchete" },
  { v: "impact", r: "Impact", g: "Manchete" },
  { v: "arialblack", r: "Arial Black", g: "Manchete" },
  { v: "segoeblack", r: "Segoe UI Black", g: "Manchete" },
  { v: "franklin", r: "Franklin Gothic", g: "Manchete" },
  { v: "oswald", r: "Oswald", g: "Condensada" },
  { v: "robotocond", r: "Roboto Condensed", g: "Condensada" },
  { v: "barlowcond", r: "Barlow Condensed", g: "Condensada" },
  { v: "arialn", r: "Arial Narrow", g: "Condensada" },
  { v: "bahnschrift", r: "Bahnschrift", g: "Condensada" },
  { v: "montserrat", r: "Montserrat", g: "Sem serifa" },
  { v: "poppins", r: "Poppins", g: "Sem serifa" },
  { v: "inter", r: "Inter", g: "Sem serifa" },
  { v: "segoe", r: "Segoe UI", g: "Sem serifa" },
  { v: "arial", r: "Arial", g: "Sem serifa" },
  { v: "verdana", r: "Verdana", g: "Sem serifa" },
  { v: "tahoma", r: "Tahoma", g: "Sem serifa" },
  { v: "trebuchet", r: "Trebuchet MS", g: "Sem serifa" },
  { v: "calibri", r: "Calibri", g: "Sem serifa" },
  { v: "candara", r: "Candara", g: "Sem serifa" },
  { v: "corbel", r: "Corbel", g: "Sem serifa" },
  { v: "georgia", r: "Georgia", g: "Com serifa" },
  { v: "times", r: "Times New Roman", g: "Com serifa" },
  { v: "cambria", r: "Cambria", g: "Com serifa" },
  { v: "constantia", r: "Constantia", g: "Com serifa" },
  { v: "garamond", r: "Apple Garamond", g: "Com serifa" },
  { v: "izmir", r: "Izmir", g: "Com serifa" },
  { v: "consolas", r: "Consolas", g: "De máquina" },
  { v: "courier", r: "Courier New", g: "De máquina" },
];
const PESOS = [{ v: "400", r: "Normal" }, { v: "700", r: "Negrito" }];

function tplVazio() {
  return { id: "c" + Date.now(), tipo: "composicao", nome: "", mercado: "", etiqueta: "",
           w: TELA.w, h: TELA.h, criado: Date.now(),
           fundoCor: "#000000", fundoImagem: null,
           /* A CONTA ESCOLHIDA NA FASE 1, desde 27/08/2026: as variacoes DELA vestem
              a leva, peca a peca, pela medida. `arte` e `janela` sao da era da escolha
              unica e ficam para o rascunho antigo nao quebrar. */
           contaModelo: null, arte: null, janela: null, elementos: [] };
}

/* ------------------------------------------------------ as peças de tela

   SÃO AS MESMAS DO RESTO DO SISTEMA, e não widgets do navegador. O `psel` já existe na
   Mineração e em Baixar; aqui ele ganha uma função que o monta em qualquer lugar. */

function pselNovo(alvo, opcoes, valor, aoEscolher) {
  const atual = opcoes.find(o => o.v === String(valor)) || opcoes[0];
  alvo.innerHTML = '<button type="button" class="psel-b" aria-haspopup="listbox" '
    + `aria-expanded="false"><span>${escapa(atual ? atual.r : "")}</span>`
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
    + '</button><div class="psel-menu" role="listbox">'
    + opcoes.map(o => `<button type="button" role="option" data-v="${escapa(o.v)}"${
        atual && o.v === atual.v ? ' class="on"' : ""}>${escapa(o.r)}<i>✓</i></button>`).join("")
    + "</div>";
  const b = alvo.querySelector(".psel-b"), m = alvo.querySelector(".psel-menu");
  b.onclick = e => {
    e.stopPropagation();
    const abre = !m.classList.contains("aberto");
    fecharPseis();
    m.classList.toggle("aberto", abre);
    b.setAttribute("aria-expanded", abre ? "true" : "false");
  };
  m.onclick = e => {
    const x = e.target.closest("button[data-v]");
    if (!x) return;
    b.querySelector("span").textContent = x.textContent.replace("✓", "");
    m.querySelectorAll("button").forEach(y => y.classList.toggle("on", y === x));
    m.classList.remove("aberto");
    b.setAttribute("aria-expanded", "false");
    aoEscolher(x.dataset.v);
  };
}

function fecharPseis() {
  document.querySelectorAll(".psel-menu.aberto").forEach(m => {
    m.classList.remove("aberto");
    const b = m.parentElement.querySelector(".psel-b");
    if (b) b.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", fecharPseis);

/** Menos, valor, mais. Substitui a barra de arrastar do navegador. */
function passoNovo(alvo, min, max, salto, valor, rotulo, aoMudar) {
  alvo.innerHTML = '<button type="button" data-d="-1">−</button>'
    + `<b>${rotulo(valor)}</b><button type="button" data-d="1">+</button>`;
  alvo.onclick = e => {
    const b = e.target.closest("button[data-d]");
    if (!b) return;
    const novo = Math.min(max, Math.max(min, valor + salto * Number(b.dataset.d)));
    if (novo === valor) return;
    valor = novo;
    alvo.querySelector("b").textContent = rotulo(valor);
    aoMudar(valor);
  };
}

/* ---------------------------------------------------------- o acervo */

async function lerAcervo() {
  // O POSTO PRIMEIRO, desde 25/08/2026: o acervo mora na casa, e a casa está na VPS. A
  // pasta liberada segue de plano B. Nos dois mundos vale a mesma tolerância: acervo
  // novo em folha não tem ficha ainda, e isso é lista vazia, não erro.
  if (await postoDePe()) {
    try {
      const r = await noPosto("/acervo");
      ACERVO.itens = (r.tem && r.d && Array.isArray(r.d.itens)) ? r.d.itens : [];
      ACERVO.falhou = "";
      registrarAsLetrasDele();
      return true;
    } catch (e) {
      // LEITURA QUE FALHOU NÃO É ACERVO VAZIO: o motivo fica guardado e trava a
      // gravação (gravarAcervo), senão um catálogo ilegível seria reescrito vazio por
      // cima, levando os templates dele junto. Trava 3 do CLAUDE.md.
      ACERVO.itens = [];
      ACERVO.falhou = e.message || String(e);
      return null;
    }
  }
  const p = await pastaDo("templates", true);
  if (!p) { ACERVO.itens = []; return null; }
  try {
    const f = await (await p.getFileHandle("templates.json")).getFile();
    const d = JSON.parse(await f.text());
    ACERVO.itens = Array.isArray(d.itens) ? d.itens : [];
  } catch (e) { ACERVO.itens = []; }   // acervo novo em folha não tem ficha ainda
  registrarAsLetrasDele();
  return p;
}

/* AS LETRAS DELE ENTRAM NO NAVEGADOR ASSIM QUE O ACERVO CHEGA, e não na primeira vez que
   uma peça tenta desenhar com elas. Registrar na hora de pintar chega tarde: a peça já
   foi desenhada com a letra de reserva, e só a repintura seguinte acertaria. O registro
   é uma vez por arquivo, e o `cdRegistrarFonte` guarda quem já entrou. */
function registrarAsLetrasDele() {
  for (const f of (ACERVO.itens || [])) {
    if (f && f.tipo === "fonte" && f.arquivo) cdRegistrarFonte(f);
  }
}

async function gravarAcervo() {
  // ACERVO QUE NÃO FOI LIDO NÃO SE GRAVA POR CIMA: se a última leitura falhou, gravar
  // agora apagaria itens que só o disco conhece. O recado sobe para quem clicou.
  if (ACERVO.falhou) throw new Error("não gravei o acervo: " + ACERVO.falhou);
  // PELO POSTO A CONFERÊNCIA É DELE: ele grava inteiro, relê o disco e responde com o
  // que ficou. Falha vira erro aqui, nunca silêncio.
  if (await postoDePe()) {
    await noPosto("/acervo", { itens: ACERVO.itens });
    return;
  }
  const p = await pastaDo("templates", true);
  if (!p) throw new Error(SEM_POSTO);
  const h = await p.getFileHandle("templates.json", { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify({ itens: ACERVO.itens }, null, 1));
  await w.close();
}

async function arquivoDoAcervo(nome) {
  if (!nome) return null;
  // O ARQUIVO VEM DO POSTO como um Blob com a hora de modificação colada, porque quem
  // compara rascunho com acervo (tentarRetomar) olha o `lastModified` dele.
  if (await postoDePe()) {
    try {
      const r = await fetch(urlDoArquivo("templates/" + nome), { cache: "no-store" });
      if (!r.ok) return null;
      const b = await r.blob();
      b.lastModified = Date.parse(r.headers.get("Last-Modified") || "") || 0;
      return b;
    } catch (e) { return null; }
  }
  const p = await pastaDo("templates", false);
  if (!p) return null;
  try { return await (await p.getFileHandle(nome)).getFile(); }
  catch (e) { return null; }
}

async function guardarNoAcervo(nome, dado) {
  // PELO POSTO O ARQUIVO VIAJA EM BASE64, porque a caixa dele fala JSON; e a prova de
  // gravado é o tamanho que o disco devolveu, nunca o eco do que foi mandado.
  if (await postoDePe()) {
    const bytes = typeof dado === "string"
      ? new TextEncoder().encode(dado)
      : new Uint8Array(dado instanceof ArrayBuffer
          ? dado : await new Response(dado).arrayBuffer());
    let cru = "";
    for (let i = 0; i < bytes.length; i += 32768) {
      cru += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    const r = await noPosto("/guardar-no-acervo", { nome, dado64: btoa(cru) });
    if (r.bytes !== bytes.length) {
      throw new Error(`gravei ${bytes.length} bytes e o disco devolveu ${r.bytes}`);
    }
    return nome;
  }
  const p = await pastaDo("templates", true);
  if (!p) throw new Error("o posto está fora e a pasta do Estúdio não está liberada");
  const h = await p.getFileHandle(nome, { create: true });
  const w = await h.createWritable();
  await w.write(dado);
  await w.close();
  return nome;
}

async function enderecoDo(nome) {
  if (!nome) return null;
  if (ED_IMGS.has(nome)) return ED_IMGS.get(nome);
  const f = await arquivoDoAcervo(nome);
  if (!f) return null;
  const u = URL.createObjectURL(f);
  ED_IMGS.set(nome, u);
  return u;
}

/* ---------------------------------------------------------- a peça na tela */

const soTexto = () => (TPL ? TPL.elementos.filter(e => e.tipo === "texto") : []);
const soImagem = () => (TPL ? TPL.elementos.filter(e => e.tipo === "imagem") : []);

const FONTE_CSS = {
  anton: "'Anton',sans-serif", bebas: "'Bebas Neue',sans-serif",
  archivobk: "'Archivo Black',sans-serif", impact: "Impact,sans-serif",
  arialblack: "'Arial Black',Arial,sans-serif",
  segoeblack: "'Segoe UI Black','Segoe UI',sans-serif",
  franklin: "'Franklin Gothic Medium',Arial,sans-serif",
  oswald: "'Oswald',sans-serif", robotocond: "'Roboto Condensed',sans-serif",
  barlowcond: "'Barlow Condensed',sans-serif",
  arialn: "'Arial Narrow',Arial,sans-serif", bahnschrift: "'Bahnschrift',sans-serif",
  montserrat: "'Montserrat',sans-serif", poppins: "'Poppins',sans-serif",
  inter: "'Inter',sans-serif", segoe: "'Segoe UI',sans-serif", arial: "Arial,sans-serif",
  verdana: "Verdana,sans-serif", tahoma: "Tahoma,sans-serif",
  trebuchet: "'Trebuchet MS',sans-serif", calibri: "Calibri,sans-serif",
  candara: "Candara,sans-serif", corbel: "Corbel,sans-serif",
  georgia: "Georgia,serif", times: "'Times New Roman',serif", cambria: "Cambria,serif",
  constantia: "Constantia,serif", garamond: "'Apple Garamond',Georgia,serif",
  izmir: "Izmir,'Segoe UI',sans-serif", consolas: "Consolas,monospace",
  courier: "'Courier New',monospace",
};

function fonteCss(n) {
  if (FONTE_CSS[n]) return FONTE_CSS[n];
  /* A LETRA DELE TAMBEM E' LETRA. Sem esta volta, tudo o que ele subiu no cadastro do
     template desenhava em Segoe UI na previa, calado, e ele so' descobria olhando a peca
     pronta lado a lado com o que tinha escolhido. */
  const dele = fonteDoAcervo(n);
  if (dele) { cdRegistrarFonte(dele); return cdCssDaFonte(dele); }
  return "'Segoe UI',sans-serif";
}

/* ---------------------------------------------------------- o B-roll de conferência

   O B-ROLL DE VERDADE ENQUANTO ELE ESCOLHE, e não um retângulo cinza fazendo as vezes:
   a fase 1 sorteia uma peça da leva para servir de conferência dentro da variação. */

function sortearBroll() {
  const n = EDIT_RECORTES.length;
  return n ? Math.floor(Math.random() * n) : -1;
}

/* ------------------------------------------------- 3.3 · a IA escreve

   ELA LÊ A FRASE DO CARD ORIGINAL. O passo 2 guarda essa faixa como imagem antes de o
   preto cobrir o quadro, porque é o único momento em que ela ainda existe. Gabriel,
   20/08/2026: "o vídeo sempre tem uma frasezinha. Pega essa frase, interpreta a frase,
   cria algo equivalente ou parecido".

   O QUE FALTA PARA ELA RODAR SOZINHA é uma credencial, e não código: nenhuma chave de IA
   gratuita está guardada nesta máquina. Enquanto ela não vem, o texto pode ser escrito
   aqui na mão e o resto do caminho funciona igual. */

let ESCRITO = new Map();           // arquivo -> { idDaCaixa: texto }
/* O CAMPO DA LEVA, que e' o que a IA vai preencher.

   O LIMITE SAI DA FAIXA MAIS APERTADA das variacoes da conta, e nao da primeira: o que
   cabe na menor cabe em todas. Com a maior, frase comprida demais so' apareceria peca a
   peca, depois de gasta a cota do dia. */
function abertas() {
  const base = soTexto().filter(e => !e.trava);
  const vars = (TPL && TPL.contaModelo) ? variacoesDaConta(TPL.contaModelo) : [];
  const comFaixa = vars.filter(v => v.escrita);
  if (!comFaixa.length) return base;
  const menor = comFaixa.reduce(
    (a, b) => ((a.escrita.altura || 0) <= (b.escrita.altura || 0) ? a : b));
  return base.concat([campoDaFaixa(menor.escrita, fonteDaArte(menor))]);
}

/* ============================================== FASE 3 · A IA ESCREVE, E SÓ ISSO

   ELA NÃO PERGUNTA MAIS NADA. Até 21/08/2026 esta fase abria uma lista de 107 caixas de
   texto, uma por peça, com a frase do card ao lado, e esperava que ele escrevesse ou
   revisasse cada uma. O Gabriel leu isso na tela e cortou: "não é pra esse momento eu
   falar qual o texto dessa peça, está louco? Remove. Eu cheguei na etapa da IA escrever,
   é pra literalmente eu ter apenas a tela de carregamento da IA escrevendo, algo parecido
   com o recorte... e no final eu vou conseguir pegar e avaliar cada um desses. Mas não é
   pra eu colocar um por um, não faz sentido".

   ENTÃO SÃO TRÊS ESTADOS e mais nada: falta caixa aberta, falta chave, ou está pronta
   para começar. Terminada a escrita, a tela vai sozinha para a galeria da fase 4. */

async function entrarNaIA() {
  await lerIA();
  const campos = abertas();
  const vivas = IA.chaves.filter(c => c.chave && !estaEsgotada(c));
  const temChave = vivas.length > 0;
  $("ia_sem_campo").hidden = !!campos.length;
  $("ia_sem_chave").hidden = !campos.length || temChave;
  $("ia_corpo").hidden = !campos.length || !temChave;
  contaEscrito();
  if (!campos.length || !temChave) return;
  const n = pecas3().length;
  $("ia_quem").textContent = "Escrevendo com " + nomeDoServico(vivas[0].servico);
  $("ia_quanto").textContent =
    `${campos.length} ${campos.length === 1 ? "caixa aberta" : "caixas abertas"}, `
    + `em ${n} ${n === 1 ? "peça" : "peças"}`
    + (vivas.length > 1
       ? `. Se ela bater o limite, as outras ${vivas.length - 1} da fila assumem sozinhas.`
       : ". É a única chave da fila hoje.");
  const faltam = faltamEscrever().length;
  $("ia_escrever").disabled = !!IA_OBRA || !faltam;
  $("ia_escrever").textContent = !faltam ? "Todas escritas"
    : faltam === n ? "Escrever" : `Escrever as ${faltam} que faltam`;
}

function contaEscrito() {
  const campos = abertas(), n = pecas3().length;
  let cheias = 0;
  for (const p of pecas3()) {
    const g = ESCRITO.get(p.nome) || {};
    if (campos.length && campos.every(c => (g[c.id] || "").trim())) cheias++;
  }
  $("ed_conta_ia").innerHTML = `<b>${cheias}</b> de ${n} `
    + (n === 1 ? "peça escrita" : "peças escritas");
  // O BOTAO DE APAGAR SO' EXISTE QUANDO HA' O QUE APAGAR.
  const apagar = $("ia_apagar");
  if (apagar) apagar.hidden = !cheias;
}

/* APAGAR O QUE A IA ESCREVEU, e comecar aquela fase do zero.

   O PEDIDO DELE, em 22/08/2026: "apaga ai' o que a IA fez". O texto morava so' na memoria
   desta aba e no rascunho, dentro do navegador: nao ha' arquivo para ele apagar na mao, e
   por isso o botao tem de existir aqui.

   APAGA O TEXTO E O ACERTO JUNTOS, porque um sem o outro nao serve: o acerto e' o tamanho
   de letra calculado PARA aquele texto. O template, o recorte e os reels tirados da leva
   nao sao tocados.

   DOIS CLIQUES, e nao um. Cada frase apagada custa um pedido da cota do dia para voltar,
   e a cota tem teto. Um clique sem volta em cima de trinta e sete frases ja' pagas seria
   uma armadilha. */
let IA_APAGA_PEDIDO = false;

$("ia_apagar").onclick = () => {
  if (IA_OBRA) return;                       // esta escrevendo agora: nao mexo
  const b = $("ia_apagar");
  if (!IA_APAGA_PEDIDO) {
    IA_APAGA_PEDIDO = true;
    b.textContent = "Clique de novo para apagar mesmo";
    const quantas = pecas3().filter(p => (ESCRITO.get(p.nome) || {})).length;
    parado("ia_recado", "Isto apaga as frases que a IA já escreveu e o acerto de letra "
      + "delas. Cada frase custa um pedido da cota do dia para voltar. O template e os "
      + "recortes não são tocados.");
    setTimeout(() => {
      if (!IA_APAGA_PEDIDO) return;
      IA_APAGA_PEDIDO = false;
      b.textContent = "Apagar O Que A IA Escreveu";
    }, 6000);
    return;
  }
  IA_APAGA_PEDIDO = false;
  b.textContent = "Apagar O Que A IA Escreveu";
  // SO' AS PECAS DESTA LEVA, e nao o mapa inteiro: ele pode ter outra leva aberta.
  let n = 0;
  for (const p of pecas3()) {
    if (ESCRITO.delete(p.nome)) n++;
    AJUSTES.delete(p.nome);
    // O ENQUADRAMENTO VAI JUNTO: ele foi escolhido olhando aquele texto.
    ENQUADRES.delete(p.nome);
    A_MAO.delete(p.nome);
    // SEM TEXTO ELA NAO ESTA' PRONTA: ele assinou embaixo de uma peca que nao existe mais.
    PRONTAS.delete(p.nome);
  }
  contaEscrito();
  desenhaGaleria();
  salvarRascunho();
  parado("ia_recado", `${n} ${n === 1 ? "frase apagada" : "frases apagadas"}. `
    + "Clique em escrever para a IA fazer de novo.");
};

/* A TELA NÃO CHAMA A IA. Ela deixa o pedido e passa a olhar o andamento, igual ao
   recorte. Quem chama é o `oficina.py`, e por um motivo que não é de gosto: as imagens
   das frases dos cards estão no disco, e uma leva de 107 não pode depender de esta aba
   continuar aberta. */
/** As peças que ainda não têm texto em TODAS as caixas abertas. */
function faltamEscrever() {
  const campos = abertas();
  if (!campos.length) return [];
  return pecas3().filter(p => {
    // PECA SEM FRASE NAO VAI PARA A IA: nao ha' o que ela leia, e o pedido gastaria um
    // da cota do dia para receber "SEM FRASE" de volta. Ver `procurarRecortes`.
    if (SEM_FRASE && SEM_FRASE.has(p.nome)) return false;
    const g = ESCRITO.get(p.nome) || {};
    return !campos.every(c => (g[c.id] || "").trim());
  });
}

/* ATE' ONDE O TEXTO DESTA CAIXA PODE DESCER, NESTA PECA.

   TRES SITUACOES, e so' a primeira precisa de conta:

     a caixa comeca ACIMA da filmagem   o texto tem de parar antes de encostar nela
     a caixa comeca DENTRO da filmagem  ele mesmo pos ali de proposito, nao mexo
     a caixa comeca ABAIXO da filmagem  nao ha' o que atropelar, so' o pe' da tela

   A FOLGA DE 1% E' UM DEDO DE DISTANCIA, cerca de dezenove pixels em 1920. Encostado nao
   e' em cima, mas parece. */
const FOLGA_DO_BROLL = 0.012;

function ateOndeDesce(campo, nome) {
  /* O TETO E' A FILMAGEM DA PECA MONTADA, e ela mora no FURO DA ARTE desde 29/08/2026.
     Ler aqui o retangulo do reel BAIXADO era o mesmo engano que punha a filmagem no
     lugar errado, so' que do outro lado: na peca 0001 da leva 31 o furo comeca em 25,8%
     e o reel comecava em 32%, entao o texto podia descer seis por cento para dentro da
     filmagem sem ninguem reclamar. */
  const b = janelaDaArte(nome) || (BROLL_DE && BROLL_DE.get(nome));
  if (!b) return 1;                       // sem ficha, nao invento limite nenhum
  if (campo.y >= b.y) return 1;           // a caixa ja' nasce dentro ou abaixo dela
  return Math.max(campo.y + 0.02, b.y - FOLGA_DO_BROLL);
}

/** Quantas peças desta leva não têm frase para a IA ler. */
function quantasSemFrase() {
  if (!SEM_FRASE) return 0;
  return pecas3().filter(p => SEM_FRASE.has(p.nome)).length;
}

async function pedirEscrita() {
  if (IA_OBRA) return;
  const campos = abertas();
  /* SÓ O QUE FALTA, E NUNCA O QUE JÁ ESTÁ ESCRITO.

     ELE PERGUNTOU O QUE ACONTECE COM OS VÍDEOS QUE FICARAM SEM TEXTO QUANDO A COTA ACABA, e
     a resposta era ruim: nada. Ficavam sem texto, e mandar escrever de novo recomeçava as
     107 do zero, gastando de novo a cota nas que já estavam prontas. Numa conta com teto
     por dia, isso é não terminar nunca.

     Agora o pedido leva só as que faltam. Acabou a cota no meio? Amanhã, ou com outra
     chave, ele clica de novo e continua de onde parou. */
  const alvos = faltamEscrever();
  if (!campos.length || !alvos.length) return;
  try {
    const id = "e" + Date.now();
    const pedido = {
      id, tipo: "escrever", leva: EDIT_LEVA.numero,
      pasta: `leva-${EDIT_LEVA.numero}`,
      // CADA CAIXA LEVA O SEU LIMITE. Ele sai da largura da caixa e do tamanho da letra
      // que ele escolheu: é quanto texto cabe ali sem nada precisar encolher depois.
      campos: campos.map(c => ({ id: c.id, limite: cabemAqui(c) })),
      pecas: alvos.map(p => ({ arquivo: p.nome })),
    };
    // PELO POSTO, QUE É COMO ELE USA A FERRAMENTA. A pasta liberada fica de plano B.
    if (await postoDePe()) {
      await noPosto("/pedido", pedido);
    } else {
      const pedidos = await pastaDo("pedidos", true);
      if (!pedidos) throw new Error(SEM_POSTO);
      const h = await pedidos.getFileHandle(`${id}.json`, { create: true });
      const w = await h.createWritable();
      await w.write(JSON.stringify(pedido, null, 1));
      await w.close();
    }

    IA_OBRA = { id, desde: Date.now(), total: alvos.length, relogio: null,
                // HA' QUANTO TEMPO NAO CONSIGO OLHAR, e se ja' vi andar alguma vez.
                // Ver a nota dentro de `olharAEscrita`.
                mudo: 0, jaViu: false };
    $("ia_escrever").disabled = true;
    $("ia_obra").hidden = false;
    reabrirObra("ia");
    pintarObra("ia", { total: alvos.length, feitos: 0 }, "peças escritas");
    document.querySelector("#ia_obra .cfg-girando").style.display = "";
    $("ia_obra_txt").textContent = "Pedido Deixado";
    $("ia_obra_nota").textContent = "A escrita começa em até um minuto, que é o passo do "
      + "programa da casa do Estúdio que fala com a IA.";
    IA_OBRA.relogio = setInterval(olharAEscrita, 3000);
    olharAEscrita();
  } catch (e) {
    parado("ia_recado", e.message);
  }
}
$("ia_escrever").onclick = () => pedirEscrita();

/** Quantos caracteres cabem na caixa, com a fonte e o tamanho que ele escolheu. */
function cabemAqui(campo) {
  const c = document.createElement("canvas").getContext("2d");
  c.font = `${campo.peso} ${Math.round(campo.tamanho * TELA.h)}px ${fonteCss(campo.fonte)}`;
  const larguraDeUm = c.measureText("n").width || 10;
  const porLinha = (campo.w * TELA.w) / larguraDeUm;
  return Math.max(20, Math.round(porLinha * 2.6));    // duas linhas e meia de folga
}

/* A BOLINHA NAO PODE GIRAR PARA SEMPRE.

   CADA CAMINHO DE ERRO AQUI TERMINAVA EM `return` CALADO: o posto fora do ar, a pasta
   revogada, o arquivo de andamento ilegivel. O relogio continuava batendo de tres em
   tres segundos e a tela seguia dizendo que estava escrevendo, sem nunca ter conseguido
   olhar uma vez sequer. E' a mesma familia do selo verde que nao gravava nada.

   E NAO PODE DESISTIR DEPRESSA TAMBEM. O programa passa na pasta de minuto em minuto,
   entao os primeiros segundos sem noticia sao normais, e mesmo depois disso o trabalho
   continua acontecendo do lado de la' ainda que esta tela nao esteja conseguindo olhar:
   quem escreve e' o `oficina.py`, e nao o navegador. Por isso ela avisa que perdeu o
   contato, segue tentando, e so' para de girar depois de tres minutos mudos. */
async function olharAEscrita() {
  if (!IA_OBRA) return;
  const seg = Math.round((Date.now() - IA_OBRA.desde) / 1000);
  $("ia_obra_tempo").textContent = seg < 60 ? seg + "s"
    : Math.floor(seg / 60) + " min " + (seg % 60) + "s";

  const semContato = (porque) => {
    IA_OBRA.mudo++;
    if (IA_OBRA.mudo * 3 < 25) return;          // ainda dentro do normal
    if (IA_OBRA.mudo * 3 >= 180) {
      clearInterval(IA_OBRA.relogio);
      const viu = IA_OBRA.jaViu;
      IA_OBRA = null;
      document.querySelector("#ia_obra .cfg-girando").style.display = "none";
      $("ia_escrever").disabled = false;
      $("ia_obra_txt").textContent = "Perdi o contato com o programa";
      $("ia_obra_nota").textContent = (viu
        ? "Ele estava escrevendo e parei de conseguir olhar. O que ele já tinha escrito está guardado. "
        : "Não consegui olhar nenhuma vez em três minutos. ")
        + "Recarregue a página (F5): se o trabalho terminou, o texto aparece; se não, peça de novo, que só as peças sem texto são pedidas.";
      return;
    }
    $("ia_obra_txt").textContent = "Sem contato com o programa";
    $("ia_obra_nota").textContent = porque + " Continuo tentando; o trabalho pode estar acontecendo mesmo assim, porque quem escreve é o programa e não esta tela.";
  };

  let d = null;
  try {
    if (await postoDePe()) {
      const r = await noPosto("/pedido?id=" + encodeURIComponent(IA_OBRA.id));
      d = r.tem ? r.d : null;
    } else {
      const p = await pastaDo("pedidos", false);
      if (!p) return semContato("O posto do Estúdio não atende e a pasta não está liberada nesta aba.");
      const f = await (await p.getFileHandle(`${IA_OBRA.id}.andamento.json`)).getFile();
      d = JSON.parse(await f.text());
    }
  } catch (e) {
    return semContato("Não consegui ler o andamento: " + (e.message || e) + ".");
  }
  // ARQUIVO QUE AINDA NAO EXISTE E' O PROGRAMA QUE AINDA NAO PEGOU O PEDIDO, e isso e'
  // esperado no primeiro minuto. Passa a contar como silencio depois disso.
  if (!d) return semContato("O programa ainda não pegou o pedido.");
  IA_OBRA.mudo = 0;
  IA_OBRA.jaViu = true;

  /* AS FRASES ENTRAM NO RASCUNHO NA HORA EM QUE CHEGAM, e não só no fim.

     Cada frase custou um pedido de uma cota que tem teto por dia. Antes a tela só
     guardava o que veio quando o andamento dizia "fim": um F5 no meio da escrita
     jogava fora as frases já pagas, porque a página recarregada não volta a olhar
     este pedido, e o que o programa tinha escrito até ali morria sem dono. Agora
     qualquer olhada que traga texto grava no mesmo instante, pelo `salvarRascunho`
     direto e não pelo relógio de 600 ms: o que custou cota não espera nem os
     seiscentos milissegundos. Olhada sem texto novo não grava nada, para o banco do
     navegador não levar uma escrita a cada três segundos à toa. */
  let chegouFrase = false;
  for (const [arq, textos] of Object.entries(d.textos || {})) {
    const g = ESCRITO.get(arq) || {};
    for (const [caixa, t] of Object.entries(textos)) {
      if (g[caixa] !== t) { g[caixa] = t; chegouFrase = true; }
    }
    ESCRITO.set(arq, g);
  }
  // no fim quem grava é o `salvarRascunho` que já está lá embaixo, depois do acerto
  // de cabimento: gravar duas vezes na mesma volta seria escrita repetida.
  if (chegouFrase && !d.fim) salvarRascunho();

  const parar = () => {
    clearInterval(IA_OBRA.relogio);
    IA_OBRA = null;
    document.querySelector("#ia_obra .cfg-girando").style.display = "none";
    $("ia_escrever").disabled = false;
  };
  if (d.erro) {
    parar();
    $("ia_obra_txt").textContent = "Não deu: " + d.erro;
    return;
  }
  const feitos = d.feitos || 0, total = d.total || IA_OBRA.total;
  pintarObra("ia", { total, feitos, falhas: d.falhas, sem: d.sem_frase,
                     atual: d.atual, segundos: d.segundos, fim: d.fim },
             "peças escritas");
  if (!d.fim) {
    $("ia_obra_txt").textContent = `Escrevendo ${Math.min(feitos + 1, total)} de ${total}`;
    $("ia_obra_nota").textContent = d.atual ? `Agora: ${d.atual}` : "";
    return;
  }
  parar();
  const semFrase = Number(d.sem_frase || 0) || quantasSemFrase();
  $("ia_obra_txt").textContent = `${feitos} ${feitos === 1 ? "peça escrita" : "peças escritas"}`
    + (d.falhas ? `, ${d.falhas} falharam` : "")
    // A CONTA TEM DE FECHAR. Sem esta parcela, 92 escritas de 107 pareciam 15 sumidas.
    + (semFrase ? `, ${semFrase} sem frase para ler` : "");
  // O RECADO DE QUANDO A COTA ACABA TEM DE DIZER O QUE FAZER, e não só que deu erro. O
  // programa avisa quantas ficaram, e daqui ele volta amanhã e clica de novo no mesmo botão.
  const ruim = (d.diario || []).find(x => x.erro);
  $("ia_obra_nota").textContent = d.parou_por
    ? `${d.parou_por} Faltam ${d.restantes} de ${d.total}. Clique em Escrever de novo `
      + "quando tiver cota: ele continua de onde parou, sem refazer as que já estão prontas."
    : (ruim ? ruim.erro : "");
  /* O SELO SO' APARECE QUANDO NAO FALTA NADA. Com falha ou peca sem frase, a barra
     fica de pe' com os numeros: um verificado verde por cima de uma conta que nao
     fechou seria a tela afirmando o que nao aconteceu. */
  if (!d.falhas && !semFrase && feitos >= total) {
    fecharObra("ia", num(total) + (total === 1 ? " Frase Escrita" : " Frases Escritas")
               + ", 100%: Pode Revisar");
  }
  // O QUE ELA ESCREVEU JÁ VOLTOU PARA AS CAIXAS lá em cima, na chegada de cada olhada:
  // ver a nota "AS FRASES ENTRAM NO RASCUNHO NA HORA EM QUE CHEGAM".
  /* O ACERTO DE CABIMENTO RODA SOZINHO, e antes ele esperava um clique.

     ELE PERGUNTOU POR QUE O TEXTO NAO TINHA SIDO AJUSTADO: "o texto ali nao teve ajuste
     de disposicao". Tinha o botao, no fim da fase, e ninguem diz que ele existe. Como a
     IA escreve com um limite de LETRAS e a caixa tem uma LARGURA, uma palavra comprida
     estoura a caixa mesmo dentro do limite: acertar e' parte de escrever, e nao um extra.

     ELE CONTINUA PODENDO CLICAR, para quando ele mesmo mexer no texto depois. */
  if ($("ajs_acertar") && !$("ajs_acertar").hidden) $("ajs_acertar").onclick();
  // GRAVA NA HORA, e não daqui a pouco. O que acabou de chegar custou cota; um F5 antes da
  // próxima gravação jogaria fora frases que não dá para refazer de graça.
  salvarRascunho();
  contaEscrito();
  await lerUsoDaIA();
  if (feitos) irParaSub(4);          // terminou de escrever: mostra as peças prontas
}


/* ==================================================== A IA, E ONDE ELA SE CONFIGURA

   AQUI FICA O ESTADO; A TELA DELA MORA NA ABA DE CONFIGURAÇÕES. O Gabriel foi específico
   em 21/08/2026: "a função de configuração não deve aparecer dentro do momento de editar,
   nunca. Era pra ser uma aba na headline que a gente tem, no cabeçalho, antes de tudo,
   antes de clicar na aba de editar... e a gente configurava lá dentro, validava lá
   dentro: está funcionando a API? Qual o limite da API atual?".

   A CHAVE NÃO MORA NO NAVEGADOR. Ela vai para `Estudio/ia.json`, no computador dele. Quem
   chama a IA para valer é o `oficina.py`; a única chamada que sai daqui é a prova, e ela
   existe justamente para a resposta ser imediata. */

const IA_SERVICOS = [
  { v: "gemini", r: "Google Gemini", modelo: "gemini-2.0-flash",
    onde: "aistudio.google.com",
    lista: chave => "https://generativelanguage.googleapis.com/v1beta/models?key="
                    + encodeURIComponent(chave) },
  { v: "groq", r: "Groq", modelo: "meta-llama/llama-4-scout-17b-16e-instruct",
    onde: "console.groq.com",
    lista: () => "https://api.groq.com/openai/v1/models" },
  { v: "openrouter", r: "OpenRouter", modelo: "google/gemma-4-31b-it:free",
    onde: "openrouter.ai",
    lista: () => "https://openrouter.ai/api/v1/models" },
];

/* COMO SE ESCOLHE O MODELO, e por que não por uma lista escrita aqui.

   O QUE ACONTECEU EM 21/08/2026: eu tinha `gemini-2.5-flash` como recomendado, escrito à
   mão neste arquivo. O Gabriel criou a chave dele, clicou em Provar, e o Google respondeu:
   "This model is no longer available to new users. Please update your code to use
   models/gemini-3.6-flash". Ou seja, o nome que eu escrevi já estava morto para quem
   estava criando conta naquele dia, e eu não tinha como saber.

   ENTÃO A LISTA VEM DO CATÁLOGO DA CHAVE DELE, e a ordem sai de regras que não envelhecem:
   versão mais nova primeiro, linha `flash` na frente da `pro` (é a que serve para reescrever
   uma frase curta: rápida e com cota folgada), e nome limpo na frente de `preview` e `exp`.
   Nenhuma versão aparece escrita aqui. O que sobrou de lista fixa é só o último recurso,
   para quando ainda não há chave e o catálogo não pode ser lido. */

const ULTIMO_RECURSO = {
  gemini: ["gemini-flash-latest", "gemini-2.0-flash"],
  groq: ["meta-llama/llama-4-scout-17b-16e-instruct"],
  openrouter: ["google/gemma-4-31b-it:free"],
};

/* O QUE NÃO É DESTA TAREFA, por família e não por versão: medir semelhança, gerar imagem,
   gerar vídeo, falar, transcrever, moderar. Nenhum deles olha um card e escreve uma frase. */
const OUTRA_FUNCAO =
  /embedding|imagen|veo|image-generation|tts|speech|audio|whisper|guard|safety|moderat|rerank|aqa|learnlm|robotics|live-/i;
/* AS QUE LEEM IMAGEM, por família. Serve para pôr na frente, e não para excluir: quando a
   família é desconhecida ela continua na lista, atrás. */
const FAMILIA_QUE_VE = /gemini|gemma|llama-4|scout|maverick|vision|-vl|omni|pixtral/i;

/** A versão que o nome carrega, para o mais novo subir. `gemini-3.6-flash` vale 306. */
function versaoDo(nome) {
  const m = String(nome).match(/(\d+)\.(\d+)/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
}

/** Quanto o nome pesa para ESTA tarefa. Menor vem primeiro. */
function pesoDoModelo(nome) {
  const n = String(nome).toLowerCase();
  let p = 0;
  if (!FAMILIA_QUE_VE.test(n)) p += 1000;              // família que talvez não veja
  if (/preview|exp|thinking|-\d{4}$|-\d{3}$/.test(n)) p += 200;   // versão de teste
  if (/lite|nano|small|mini|8b|4b/.test(n)) p += 60;   // pequeno demais escreve pior
  if (/\bpro\b|-pro/.test(n)) p += 20;                 // pro é mais lento e come mais cota
  p -= versaoDo(n);                                    // mais novo sobe
  return p;
}

/* A LISTA VEM DO PRÓPRIO SERVIÇO. "É pra poder selecionar o modelo, não escrever. É pra
   escolher o modelo a depender do serviço, a depender de qual é a empresa." Escrever o
   nome à mão era pedir para ele decorar `meta-llama/llama-4-scout-17b-16e-instruct`, e
   ainda por cima o meu padrão do OpenRouter já tinha saído do ar sem eu saber. */
const MODELOS_JA_BUSCADOS = new Map();    // servico+chave -> lista já buscada

async function modelosDe(servico, chave) {
  const ficha = fichaDoServico(servico);
  const marca = servico + "|" + (chave || "");
  if (MODELOS_JA_BUSCADOS.has(marca)) return MODELOS_JA_BUSCADOS.get(marca);
  const reserva = (ULTIMO_RECURSO[servico] || [ficha.modelo])
    .map((m, i) => ({ v: m, r: m + (i === 0 ? "  ·  recomendado" : "") }));
  if (servico !== "openrouter" && !chave) return reserva;   // sem chave não há catálogo
  let nomes = [];
  try {
    const cabeca = servico === "gemini" ? {} : { Authorization: "Bearer " + chave };
    const r = await fetch(ficha.lista(chave), { headers: cabeca });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    if (servico === "gemini") {
      nomes = (d.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => String(m.name || "").replace(/^models\//, ""));
    } else if (servico === "groq") {
      nomes = (d.data || []).map(m => String(m.id || ""));
    } else {
      nomes = (d.data || [])
        .filter(m => String(m.id || "").endsWith(":free"))
        .filter(m => ((m.architecture || {}).input_modalities || []).includes("image"))
        .map(m => String(m.id));
    }
  } catch (e) { return reserva; }
  // O CATÁLOGO PASSA PELO CRIVO DA TAREFA. No Gemini e no Groq, sobra só o que está na
  // lista de recomendados, na ordem dela; uma versão com data no nome
  // (`gemini-2.5-flash-preview-...`) entra atrás da versão limpa. No OpenRouter o próprio
  // catálogo declara quem lê imagem, e o filtro já foi feito lá em cima.
  nomes = nomes.filter(n => !OUTRA_FUNCAO.test(n));
  nomes.sort((a, b) => pesoDoModelo(a) - pesoDoModelo(b) || a.localeCompare(b));
  if (!nomes.length) return reserva;
  const lista = nomes.map((n, i) => ({ v: n, r: n + (i === 0 ? "  ·  recomendado" : "") }));
  MODELOS_JA_BUSCADOS.set(marca, lista);
  return lista;
}

const IA_PROMPT_PADRAO =
  "Voce le a frase de um card de noticia e escreve OUTRA frase equivalente, para um "
  + "perfil diferente publicar.\nREGRAS:\n"
  + "1. Mesma noticia, mesmo sentido, palavras diferentes.\n"
  + "2. Uma linha so, no maximo {limite} caracteres.\n"
  + "3. Portugues do Brasil, direto, sem aspas, sem emoji, sem hashtag.\n"
  + "4. Nao invente numero, nome nem data que nao esteja na imagem.\n"
  + "5. Se a imagem nao tiver frase legivel, responda exatamente: SEM FRASE.\n"
  + "Responda SO com a frase.";

/* A FILA DE CHAVES, e não mais principal e reserva.

   "EU PRECISO TER UM SISTEMA DE ROTACIONAMENTO, caso alguma chave, alguma coisa aqui bata
   o limite." Duas chaves não são um rodízio, são um plano B: quando a segunda cai também,
   a leva para. Aqui a fila tem o tamanho que ele quiser, e cada uma mostra o próprio
   estado, porque com rodízio a pergunta que importa não é quanto se gastou no total, e sim
   qual delas ainda funciona. */

let IA = { chaves: [], prompt: "" };
let IA_OBRA = null;
let IA_USO = null;
/* TRES ESTADOS TAMBEM AQUI, e nao dois. E' a mesma licao da trava 3 do CLAUDE.md, na
   conta do dia: "li", "li e nao tinha nada" e "NAO CONSEGUI LER".

   O QUE ACONTECIA ATE' 22/08/2026: quando a leitura falhava, `IA_USO` virava nulo,
   ninguem aparecia esgotado, e o rodape afirmava "A fila inteira esta' de pe'". Uma
   afirmacao construida a partir da AUSENCIA de dado, que e' exatamente o falso positivo
   que ele mandou vigiar: "muito cuidado com os falsos positivos". */
let USO_LIDO = false;             // false = nao sei o que aconteceu hoje
let IA_LIDA = false;

function fichaDoServico(v) { return IA_SERVICOS.find(x => x.v === v) || IA_SERVICOS[0]; }
function nomeDoServico(v) { return fichaDoServico(v).r; }
const novaChaveId = () => "k" + Math.random().toString(36).slice(2, 8);

/* A FICHA ANTIGA CONTINUA SENDO LIDA e vira fila de duas na entrada, do mesmo jeito que o
   `oficina.py` faz do lado de lá. Ninguém reconfigura nada por causa de uma mudança
   minha, e as duas pontas leem o arquivo igual. */
function viraFila(d) {
  if (Array.isArray(d.chaves)) {
    return { chaves: d.chaves.filter(c => c && c.chave)
                       .map(c => ({ id: c.id || novaChaveId(), servico: c.servico || "gemini",
                                    chave: c.chave, modelo: c.modelo || "" })),
             prompt: d.prompt || "" };
  }
  const fila = [];
  for (const parte of [d, d.reserva || {}]) {
    if (parte.chave) fila.push({ id: parte.id || novaChaveId(),
                                 servico: parte.servico || "gemini",
                                 chave: parte.chave, modelo: parte.modelo || "" });
  }
  return { chaves: fila, prompt: d.prompt || "" };
}

/* RETOMAR A PASTA SEM PERGUNTAR. Quando a permissão desta visita já foi dada, o crachá
   ainda vale e dá para reabrir a pasta calado, sem caixinha nenhuma. Sem isto, abrir a
   aba de Configurações mostrava a fila vazia mesmo com as chaves gravadas no disco, e
   parecia que elas tinham sumido. */
/* O POSTO, e por que ele existe.

   A FRASE DELE, na terceira rodada do mesmo problema: "A CHAVE NÃO ESTÁ FICANDO SALVA
   PORRA". Três consertos meus, e o arquivo continuava sem existir no disco.

   A CAUSA NÃO ERA UM BUG A MAIS, era o desenho. Para gravar no disco, o navegador exige
   que ele APONTE a pasta numa caixa do sistema, e essa permissão não atravessa um F5
   sozinha: em toda visita ele teria de apontar a pasta de novo antes de qualquer coisa
   ser guardada. Fechou a aba, perdeu. Deu F5, perdeu. Nenhum conserto dentro dessa regra
   ia sobreviver, e eu estava insistindo numa trava do navegador em vez de sair dela.

   ENTÃO A TELA PAROU DE ESCREVER NO DISCO. Quem escreve é o `posto.py`, um programa deste
   computador, que já tem acesso à pasta e sobe junto com o Windows. A tela só conversa com
   ele aqui em casa, em 127.0.0.1, e o que ela pede ele grava. Não há mais caixa de pasta e
   não há mais permissão para perder.

   AS CHAVES CONTINUAM SEM SAIR DA MÁQUINA: o posto escuta só no endereço de casa, e só
   responde para as telas do Estúdio. Nada disso passa pela internet. */
/* O POSTO E' O ENDERECO DE ONDE A TELA VEIO, quando ela veio de casa.

   POR QUE NAO E' UM NUMERO FIXO: a pagina e' servida pelo proprio posto, entao perguntar a
   ele e' perguntar a quem abriu a porta. Escrever 8787 na pedra impedia uma coisa que o
   projeto precisava: subir um posto de ENSAIO noutra porta, com uma pasta descartavel, para
   as provas gravarem, apagarem e corromperem arquivo sem chegar perto do Estudio de
   verdade. Com esta linha, a tela de ensaio fala com o posto de ensaio sozinha. */
/* A REGRA VIROU DE LADO EM 24/08/2026, quando a tela ganhou casa propria na VPS
   (estudio.borusa.com.br). Antes: so' localhost era o posto, e qualquer outro endereco
   caia em 127.0.0.1:8787, o que na VPS mandaria o pedido para o computador de quem
   estiver OLHANDO a pagina, e nao para o servidor que a serviu. Agora: quem serve a
   pagina E' o posto (em casa direto, na VPS atras do Caddy), e as unicas excecoes sao
   as moradas que nao tem posto proprio: a vitrine do GitHub Pages e a pagina aberta
   de arquivo, que continuam falando com o posto local de quem olha. */
/* A PONTE NAO E' POSTO, achado da auditoria de 25/08/2026: ela serve a mesma tela e
   responde /vivo com 200, mas nao tem /pecas, /recortes, /arquivo nem /pedido. Sem esta
   linha, a tela aberta pela morada da ponte achava que o posto atendia e a edicao
   inteira quebrava com "rota desconhecida", sem nunca cair no plano B. */
const POSTO = (location.hostname.endsWith("github.io")
    || location.hostname.endsWith("workers.dev")
    || !/^https?:$/.test(location.protocol))
  ? "http://127.0.0.1:8787"
  : location.origin;
let POSTO_DE_PE = null;                 // null = ainda não perguntei, ou a resposta venceu
let POSTO_PERGUNTADO = 0;
const VALIDADE_DO_POSTO = 15000;        // 15 s: o posto reinicia sozinho a cada 5 minutos

/* A RESPOSTA DO POSTO TEM VALIDADE, e antes não tinha. Ela era guardada para a visita
   inteira, e bastava o posto reiniciar, coisa que a tarefa agendada faz, para a tela
   passar horas convencida de que estava gravando no disco enquanto nada chegava lá. */
/* O CORPO DO BATIMENTO FICA GUARDADO, desde 25/08/2026: o /vivo conta onde a casa mora,
   se esta máquina abre pastas no Explorador (só o Windows abre) e se a sessão deste
   navegador ainda vale. É o que deixa a tela esconder botão de abrir pasta onde ele não
   funciona e avisar de bilhete vencido antes de uma gravação ser recusada. */
let CASA_INFO = null;
async function postoDePe() {
  if (POSTO_DE_PE !== null && Date.now() - POSTO_PERGUNTADO < VALIDADE_DO_POSTO) {
    return POSTO_DE_PE;
  }
  try {
    // COM PRAZO DE CORTE, desde 25/08/2026: conexão aceita e nunca respondida (máquina
    // saturada, Caddy pendurado) não rejeita nem resolve, e sem o corte a tela inteira
    // congelava no primeiro "await postoDePe()". Erro rejeita; conexão muda pendura.
    const r = await fetch(POSTO + "/vivo",
      { cache: "no-store", signal: AbortSignal.timeout(4000) });
    POSTO_DE_PE = r.ok;
    try { CASA_INFO = await r.json(); } catch (e) { /* corpo velho, sem os campos */ }
  } catch (e) { POSTO_DE_PE = false; }
  POSTO_PERGUNTADO = Date.now();
  return POSTO_DE_PE;
}

/** Um pedido ao posto. Sem `corpo` é leitura; com `corpo` é escrita. */
async function noPosto(rota, corpo, paciencia) {
  const opcoes = corpo === undefined
    ? { cache: "no-store" }
    : { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo) };
  /* O PRAZO DE CORTE anda junto com o do postoDePe: sem ele, uma conexão pendurada
     (aceita e nunca respondida) congelava o fluxo para sempre, sem recado.

     TRINTA SEGUNDOS NÃO SERVEM PARA TODO MUNDO, e isso apareceu na casa da rua: o
     pedido da montagem é o maior corpo do sistema e sai logo depois de a IA escrever a
     leva inteira, com a máquina ainda ocupada. Quem tem corpo grande pede a própria
     paciência; o resto continua nos trinta. */
  opcoes.signal = AbortSignal.timeout(paciencia || 30000);
  let r;
  try {
    r = await fetch(POSTO + rota, opcoes);
  } catch (e) {
    // O ERRO DO NAVEGADOR É "Failed to fetch", em inglês e sem dizer nada a quem lê. E a
    // resposta velha sobre o posto morre aqui: da próxima vez ele pergunta de novo.
    POSTO_DE_PE = null;
    throw new Error("O posto do Estúdio parou de atender. Nada foi gravado. Ele volta "
      + "sozinho em até cinco minutos; recarregue a página e confira.");
  }
  let d = {};
  try { d = await r.json(); } catch (e) { /* resposta sem corpo */ }
  // SESSÃO VENCIDA TEM RECADO PRÓPRIO: o 401 cru dizia "entre primeiro" sem dizer
  // como, e só a aba de Configurações sabia traduzir. O socorro é um só: recarregar.
  if (r.status === 401) {
    throw new Error("A sessão desta página venceu. Recarregue a página e entre com "
      + "a senha; nada foi perdido.");
  }
  if (!r.ok) throw new Error(d.erro || `o posto do Estúdio respondeu ${r.status}`);
  return d;
}

/* A MÍDIA PELO POSTO, desde 25/08/2026. Com a casa na VPS, vídeo, máscara e imagem não
   moram mais no disco de quem olha: quem os serve é o posto, pela rota /arquivo, em
   pedaços. A pasta liberada continua valendo como plano B de quando o posto está fora,
   e por isso cada peça carrega OU o `h` (o crachá do arquivo local) OU só o `nome` (e
   aí o posto serve). Revogar uma URL de posto não faz nada, e não precisa fazer. */
function urlDoArquivo(rel) {
  return POSTO + "/arquivo?onde=" + encodeURIComponent(rel);
}

/** A URL de um vídeo ou imagem de peça: crachá local quando há, posto quando não. */
async function urlDaMidia(item, pastaRel) {
  if (item && item.h) return URL.createObjectURL(await item.h.getFile());
  return urlDoArquivo(pastaRel + "/" + item.nome);
}

/* DEVOLVER O ENDERECO DE QUEM DESISTIU. Quando a pintura envelhece no meio do caminho,
   o endereco que ela ja' pegou nao pode ficar largado: o do cracha local e' um blob, e
   blob largado segura o arquivo inteiro na memoria ate' a pagina fechar. O do posto e'
   so' um endereco de rede, nao ha' o que devolver, e por isso a checagem. */
function devolverEndereco(u) {
  if (u && String(u).startsWith("blob:")) URL.revokeObjectURL(u);
}

/** A pasta (relativa à casa) de onde saem as peças do passo em curso. */
function pastaDaLeva() { return "levas/leva-" + EDIT_LEVA.numero; }
function pastaDosRecortes() { return "recortes/leva-" + EDIT_LEVA.numero; }
function pastaDasPecas3() {
  return EDIT_RECORTES.length ? pastaDosRecortes() : pastaDaLeva();
}

/* O RECADO DE QUANDO O POSTO NÃO ATENDE, e ele precisa dizer o endereço certo.

   POR QUE O ENDEREÇO IMPORTA: aberto pela internet, o Chrome não deixa esta página falar
   com um programa da própria máquina, e diz isso em inglês no console, onde ele nunca vai
   olhar. Aberto em 127.0.0.1, a página já está dentro da máquina e não há fronteira
   nenhuma. É a mesma tela; muda só a porta por onde ela entra. */
/* A CASA OFICIAL E' A DA VPS desde 25/08/2026, e a regra de "estar em casa" virou tres
   pecas, porque tres perguntas diferentes estavam espremidas numa so':

     EM_CASA        a pagina foi servida pelo proprio posto? Vale no 127.0.0.1 E na
                    casa da VPS. E' quem decide recado e selo.
     EM_CASA_LOCAL  a casa e' ESTA maquina? So' 127.0.0.1/localhost. E' quem decide se
                    a pasta do navegador serve de plano B: fora daqui, a pasta local e'
                    o disco ERRADO (o da VPS e' outro), e ler dela pintaria numero do
                    mundo velho como se fosse da casa.
     CASA_DO_ESTUDIO  o endereco que se recomenda a quem esta' fora (vitrine, arquivo). */
const CASA_DO_ESTUDIO = "https://estudio.borusa.com.br";
const EM_CASA = POSTO === location.origin;
const EM_CASA_LOCAL = location.hostname === "127.0.0.1" || location.hostname === "localhost";
const SEM_PASTA_AQUI = EM_CASA && !EM_CASA_LOCAL;
const SEM_POSTO = !EM_CASA
  ? "Aberto por este endereço, a tela não grava em lugar nenhum. Abra o Estúdio em "
    + CASA_DO_ESTUDIO + " e tudo fica guardado na casa dele."
  : EM_CASA_LOCAL
    ? "O posto do Estúdio não está atendendo. Ele sobe junto com o Windows e se levanta "
      + "sozinho a cada cinco minutos; espere um pouco e recarregue a página."
    : "O posto da casa do Estúdio não respondeu. Ele se levanta sozinho em segundos; "
      + "espere um pouco e recarregue a página.";

async function retomarPastaEler() {
  // O QUE O DISCO RECUSOU NAO SE APAGA AO TROCAR DE ABA. Antes, sair e voltar relia o
  // arquivo por cima, sumia com a chave que ele tinha acabado de colar e ainda apagava o
  // recado vermelho que explicava o que havia acontecido: erro sem rastro nenhum.
  if (MUDANCA_PENDENTE) { desenhaCfgIA(); return; }
  // COM O POSTO DE PÉ NÃO HÁ PASTA A PEDIR, e nem aviso a dar: ele lê do disco e pronto.
  if (await postoDePe()) {
    IA_LIDA = false;
    await lerIA();
    desenhaCfgIA();
    if (!LEITURA_FALHOU) recadoDaIA("", "");
    return;
  }
  if (!EDIT_RAIZ && TEM_PORTA && !SEM_PASTA_AQUI) {
    try {
      const cracha = CRACHA_NA_MAO || await pegarCracha();
      const h = cracha ? await pastaValendo(cracha, false) : null;   // sem pedir
      if (h) {
        const { raiz, levas } = await abrirRaiz(h);
        if (raiz) { EDIT_RAIZ = raiz; EDIT_PASTA = levas; }
      }
    } catch (e) { /* segue sem a pasta, e o aviso abaixo explica */ }
  }
  await lerIA();
  desenhaCfgIA();
  recadoDaIA(EDIT_RAIZ ? "" : SEM_POSTO, EDIT_RAIZ ? "" : "ruim");
}

/* TRES ESTADOS, E NAO DOIS: li, li e não tinha nada, e NÃO CONSEGUI LER.

   Confundir os dois últimos foi o defeito mais perigoso desta tela, e ele só apareceu numa
   auditoria que o reproduziu: o posto reinicia, a leitura cai, o `catch` engole calado, a
   tela desenha "a fila está vazia" com o selo verde de "gravando no disco", ele acrescenta
   uma chave, e a gravação apaga as três que estavam no arquivo. Verde do início ao fim.

   Enquanto for "não consegui ler", nada é gravado e a tela diz isso em vermelho. */
let LEITURA_FALHOU = "";          // vazio = leitura em ordem; com texto = o motivo
let MUDANCA_PENDENTE = false;     // o disco recusou algo que ainda está na tela

async function lerIA() {
  if (IA_LIDA) return;
  if (await postoDePe()) {
    try {
      const d = await noPosto("/ia");
      IA = viraFila((d.tem && d.d) || {});   // disco vazio deixa a tela vazia também
      LEITURA_FALHOU = "";
      IA_LIDA = true;
      await lerUsoDaIA();
      desenhaCfgIA();
      return;
    } catch (e) {
      LEITURA_FALHOU = e.message || String(e);
      IA_LIDA = false;
      desenhaCfgIA();
      recadoDaIA("NÃO CONSEGUI LER as chaves que já estão no disco. Não acrescente nem "
        + "remova nada agora, porque salvar apagaria o que está lá. " + LEITURA_FALHOU,
        "ruim");
      return;
    }
  }
  if (!EDIT_RAIZ) {
    // SEM POSTO E SEM PASTA, A TELA NAO SABE NADA. Dizer "a fila esta' vazia" aqui e' o
    // mesmo engano de antes com outra roupa: ela nao leu coisa alguma.
    LEITURA_FALHOU = SEM_POSTO;
    IA_LIDA = false;
    desenhaCfgIA();
    desenhaUsoDaIA();
    return;
  }
  /* AQUI TAMBEM SAO TRES ESTADOS, e este caminho ainda tratava dois.

     O `catch` engolia tudo igual: arquivo que nao existe (fila vazia de verdade) e
     arquivo que nao deu para ler (nao sei o que tem la'). No segundo caso a tela
     desenhava a fila vazia, marcava que tinha lido, e a proxima gravacao apagava as
     chaves do disco. E' o mesmo defeito que apagou tres chaves numa auditoria, e que a
     trava 3 do CLAUDE.md descreve: ele so' estava consertado do lado do posto. */
  try {
    const f = await (await EDIT_RAIZ.getFileHandle("ia.json")).getFile();
    IA = viraFila(JSON.parse(await f.text()) || {});
    LEITURA_FALHOU = "";
  } catch (e) {
    if (!(e && e.name === "NotFoundError")) {
      LEITURA_FALHOU = "Não consegui ler o ia.json da pasta liberada: "
        + (e.message || String(e));
      IA_LIDA = false;
      desenhaCfgIA();
      recadoDaIA("NÃO CONSEGUI LER as chaves que já estão no disco. Não acrescente nem "
        + "remova nada agora, porque salvar apagaria o que está lá. " + LEITURA_FALHOU,
        "ruim");
      return;
    }
    LEITURA_FALHOU = "";        // não existe ainda: a fila nasce vazia, e isso se sabe
  }
  IA_LIDA = true;
  await lerUsoDaIA();
  desenhaCfgIA();
}

async function gravarIA() {
  /* TELA QUE NAO LEU O DISCO NAO ESCREVE POR CIMA DELE.

     A PRIMEIRA VERSAO DESTA TRAVA NAO TRANCAVA NADA, e a auditoria pegou: ela exigia que a
     fila TAMBEM estivesse vazia, e a fila nunca está vazia na hora de salvar, porque a
     chave que ele acabou de colar já entrou nela. A condição certa é uma só: se esta tela
     não leu o arquivo, ela não tem o direito de escrever por cima dele. */
  if (!IA_LIDA) {
    throw new Error("Esta tela ainda não leu o arquivo do disco, então salvar agora "
      + "apagaria o que está lá. Recarregue a página (F5) e faça de novo.");
  }
  if (await postoDePe()) {
    // A PROVA VEM DO DISCO. O posto grava, lê de volta o arquivo que o programa vai ler, e
    // devolve o que encontrou lá. "Não pode ser front-end só bonitinho": o que aparece na
    // tela é o conteúdo do arquivo, e não o que ela tinha na mão um instante antes.
    /* UMA SEGUNDA TENTATIVA, e uma so'.

       O POSTO E' LEVANTADO DE CINCO EM CINCO MINUTOS por uma tarefa do Windows, e ele
       tambem cai e volta sozinho. A resposta sobre estar de pe' vale quinze segundos,
       entao existe uma fresta: perguntar, ouvir que sim, e a gravacao chegar no exato
       instante em que ele reiniciou. Era uma chave perdida por um piscar de olhos.

       GRAVAR DUAS VEZES NAO FAZ MAL: o posto escreve o arquivo inteiro de uma vez, num
       arquivo ao lado que so' depois toma o lugar do bom. A segunda gravacao escreve o
       mesmo conteudo da primeira.

       E NAO CAI PARA O CAMINHO DA PASTA AQUI, de proposito. A pasta que ele liberou no
       navegador pode nao ser a que o programa le', e daqui nao ha' como saber (ver a nota
       em `gravarIA`, no fim). Gravar la' diria "guardado" com o programa continuando sem
       ver a chave, que e' exatamente o falso positivo que custou a noite dele. */
    try {
      const d = await noPosto("/ia", IA);
      return viraFila(d.d || {});
    } catch (e) {
      POSTO_DE_PE = null;
      if (!(await postoDePe())) throw e;    // caiu de vez: o recado dele ja' esta' certo
      const d = await noPosto("/ia", IA);
      return viraFila(d.d || {});
    }
  }
  if (!EDIT_RAIZ) throw new Error(SEM_POSTO);
  const h = await EDIT_RAIZ.getFileHandle("ia.json", { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify(IA, null, 1));
  await w.close();
  /* A PROVA DE QUE CHEGOU: le' de volta o arquivo e devolve o que encontrou la'. Sem
     isso, "guardado" e' so' uma palavra na tela.

     O QUE ESTA PROVA NAO PROVA, e o comentario antigo prometia que provava: que esta e'
     a pasta que o PROGRAMA le'. Quem aponta a pasta e' ele, no seletor do navegador, e
     daqui nao ha' como saber o caminho dela em disco: o navegador nao conta. Se ele
     apontar a pasta errada, a gravacao da' certo e o programa continua sem ver a chave.
     Quem sabe o caminho de verdade e' o posto, e por isso este caminho aqui e' o de
     emergencia, usado so' quando ele esta' fora do ar. */
  const f = await (await EDIT_RAIZ.getFileHandle("ia.json")).getFile();
  return JSON.parse(await f.text());
}

/* A PASTA SE LIBERA AQUI TAMBÉM. Ela era liberada só na aba de Edição, e quem chegasse
   primeiro nas Configurações via o Guardar falhar sem entender por quê. */
$("ia_liberar").onclick = async () => {
  try {
    if (await postoDePe()) {
      IA_LIDA = false;
      await lerIA();
      desenhaCfgIA();
      return recadoDaIA("Não precisa: o posto do Estúdio está de pé e já grava direto "
        + "no disco da casa do Estúdio.", "boa");
    }
    await pedirPasta();
    IA_LIDA = false;
    await lerIA();
    desenhaCfgIA();
    parado("ia_cfg_recado", "Pasta liberada.");
  } catch (e) {
    parado("ia_cfg_recado", e.message || "A liberação foi cancelada.");
  }
};

/* SAIR É IR ATÉ A PORTA, e não um pedido de bastidor: quem apaga o bilhete é o posto,
   pela rota /sair, e ela responde com um desvio para a página de entrar. Navegar até lá
   faz o navegador guardar a ordem de apagar o biscoito, coisa que um pedido de bastidor
   não garante. O rascunho é gravado antes, porque a página vai embora em seguida. */
if ($("cfg_sair")) {
  $("cfg_sair").onclick = async () => {
    try { await salvarRascunho(); } catch (e) { /* sem leva aberta, nada a gravar */ }
    location.href = POSTO + "/sair";
  };
}

/* QUE DIA E' HOJE, NO RELOGIO DESTE COMPUTADOR.

   `toISOString()` DEVOLVE O DIA EM UTC, e era isso que estava escrito aqui. O programa
   grava a conta com `time.strftime` do Python, que usa a hora DAQUI. No Brasil sao tres
   horas de diferenca, entao das 21h em diante os dois discordavam: a tela pedia a folha
   de amanha, nao achava, e desenhava a aba inteira como se nada tivesse acontecido no
   dia. Ele viu isso as 22h50 de 22/08/2026, com cem pedidos na conta: "aqui nao traz
   nenhum veredito referente ao Google Gemini". Nao era a chave, e nem o rodizio: era a
   tela olhando para o dia errado durante as tres ultimas horas de todo dia.

   TRES HORAS POR DIA E' UM OITAVO DO TEMPO, e justamente o pedaco em que ele trabalha. */
function hojeAqui() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

async function lerUsoDaIA() {
  if (await postoDePe()) {
    try {
      const d = await noPosto("/uso");
      const hoje = hojeAqui();          // no relogio daqui, e nao em UTC
      IA_USO = (d.tem && d.d && d.d.dia === hoje) ? d.d : null;
      USO_LIDO = true;            // o posto respondeu: folha vazia tambem e' resposta
      desenhaUsoDaIA();
      return;
    } catch (e) { /* segue pela pasta */ }
  }
  try {
    const f = await (await EDIT_RAIZ.getFileHandle("ia-uso.json")).getFile();
    const d = JSON.parse(await f.text());
    const hoje = hojeAqui();            // no relogio daqui, e nao em UTC
    IA_USO = (d && d.dia === hoje) ? d : null;   // folha de ontem não conta como hoje
    USO_LIDO = true;
  } catch (e) {
    // ARQUIVO QUE AINDA NAO EXISTE E' UM DIA SEM USO, e isso se sabe. Qualquer outro
    // erro e' nao saber, e nao saber nao pode virar "esta' tudo de pe'".
    IA_USO = null;
    USO_LIDO = (e && e.name === "NotFoundError");
  }
  desenhaUsoDaIA();
}

function desenhaUsoDaIA() {
  const u = IA_USO || {};
  const linha = (r, v) => `<div class="cfg-par"><span>${r}</span><b>${v}</b></div>`;
  const quando = u.dia ? "Em " + u.dia.split("-").reverse().join("/") : "Hoje";
  $("ia_uso_dia").textContent = quando;
  $("ia_uso_dia2").textContent = quando;
  // ZERO E "NAO SEI" SAO COISAS DIFERENTES, e mostrar zero para as duas e' inventar.
  const naoSei = "<i>não consegui ler</i>";
  $("ia_uso").innerHTML =
    linha("Frases pedidas", USO_LIDO ? num(u.pedidos || 0) : naoSei)
    + linha("Recusadas por limite", USO_LIDO ? num(u.sem_cota || 0) : naoSei)
    + linha("Outros erros", USO_LIDO ? num(u.erros || 0) : naoSei)
    + linha("Chaves que ainda respondem",
            !USO_LIDO ? naoSei
            : IA.chaves.length
              ? `${IA.chaves.filter(c => !estaEsgotada(c)).length} de ${IA.chaves.length}`
              : "Nenhuma na fila");
}

/* O GASTO, SEPARADO POR EMPRESA.

   O PEDIDO, com as palavras dele: "controle de gastos, visual, para saber o quanto aquela
   API já gastou, separado por empresa". E o aviso que manda neste bloco: "muito cuidado
   com os falsos positivos".

   ENTÃO NADA AQUI É ESTIMADO. Cada número é uma frase que saiu deste computador e voltou.
   A barra compara as empresas ENTRE SI, e não com um teto: nenhum dos três publica quanto
   resta por programa, e desenhar "quanto falta" seria inventar. Onde o serviço manda o
   saldo na própria resposta, e o Groq manda, ele aparece com o número que veio de lá. */

function usoDaChave(c) { return ((IA_USO || {}).chaves || {})[c.id] || {}; }
function estaEsgotada(c) { return !!usoDaChave(c).esgotada; }

/* O SALDO QUE O SERVICO MANDA NAO E' O TETO QUE PARA A LEVA.

   O GROQ MANDA O SALDO DE PEDIDOS, e a tela mostrava "999 de 1.000 restando" como se
   houvesse folga de sobra. O que parou a leva de 22/08/2026 foi outro teto, o de FICHAS
   por dia: 200.000, e um card custa cerca de 1.500. Restavam 966 pedidos dos mil quando
   o trabalho parou na peca 37 de 91. Numero verdadeiro que leva a conclusao errada e' a
   pior especie de numero, e a trava 2 do CLAUDE.md existe por causa disso.

   ENTAO O SALDO SO' APARECE COM O NOME DO QUE ELE MEDE, e some quando a chave ja' parou
   por outro motivo, que a linha de cima explica. */
function saldoDaChave(c) {
  const u = usoDaChave(c);
  if (u.esgotada) return null;
  const l = u.limites || {};
  if (l.restam_pedidos && l.teto_pedidos) {
    return `${num(Number(l.restam_pedidos))} de ${num(Number(l.teto_pedidos))} pedidos`;
  }
  if (l.restam_pedidos) return `${num(Number(l.restam_pedidos))} pedidos restando`;
  return null;
}

function desenhaGastoPorEmpresa() {
  const alvo = $("ia_gasto");
  if (!IA.chaves.length) {
    alvo.innerHTML = '<p class="nota mini">Nenhuma chave na fila ainda.</p>';
    return;
  }
  // junta as chaves da mesma empresa
  const porEmpresa = new Map();
  for (const c of IA.chaves) {
    const u = usoDaChave(c);
    const e = porEmpresa.get(c.servico) || { frases: 0, recusas: 0, chaves: [], dePe: 0 };
    e.frases += Number(u.pedidos || 0) - Number(u.sem_cota || 0) - Number(u.erros || 0);
    e.recusas += Number(u.sem_cota || 0);
    e.chaves.push(c);
    if (!estaEsgotada(c)) e.dePe++;
    porEmpresa.set(c.servico, e);
  }
  const maior = Math.max(1, ...[...porEmpresa.values()].map(e => e.frases));

  alvo.innerHTML = [...porEmpresa.entries()].map(([servico, e]) => {
    const largura = Math.round(Math.max(e.frases > 0 ? 4 : 0, e.frases / maior * 100));
    const saldos = e.chaves.map(saldoDaChave).filter(Boolean);
    return `<div class="gasto-linha${e.dePe ? "" : " parada"}">
      <div class="gasto-topo">
        <b>${escapa(nomeDoServico(servico))}</b>
        <span class="gasto-n">${num(Math.max(0, e.frases))}</span>
        <span class="gasto-un">${e.frases === 1 ? "frase" : "frases"}</span>
      </div>
      <div class="gasto-barra"><i style="width:${largura}%"></i></div>
      <div class="gasto-pe">
        <span>${e.chaves.length} ${e.chaves.length === 1 ? "chave" : "chaves"}, `
      + `${e.dePe} de pé</span>
        <span>${e.recusas ? num(e.recusas) + " recusadas por limite" : "nenhuma recusa"}</span>
        <span class="gasto-saldo">${saldos.length ? escapa(saldos.join(" · "))
          : "<i>este serviço não publica o saldo</i>"}</span>
      </div>
    </div>`;
  }).join("");
}

/** A chave escondida no meio, para dar para reconhecer sem expor. */
function pontinhos(chave) {
  const c = String(chave || "");
  if (c.length <= 10) return "•".repeat(Math.max(4, c.length));
  return c.slice(0, 4) + "••••••" + c.slice(-4);
}

function desenhaCfgIA() {
  const fila = $("ia_fila");
  $("ia_n_chaves").textContent = IA.chaves.length
    ? IA.chaves.length + (IA.chaves.length === 1 ? " chave" : " chaves") : "Nenhuma";
  // O SELO DIZ QUEM ESTÁ GRAVANDO, e não se uma pasta foi apontada. Com o posto de pé
  // não há pasta nenhuma envolvida, e mostrar "Pasta não liberada" ali seria um susto à
  // toa exatamente na tela em que ele já brigou três vezes.
  // E O BILHETE VENCIDO TEM SELO PRÓPRIO: o batimento (/vivo) responde 200 mesmo sem
  // sessão, e o selo verde só descobriria a porta fechada na primeira gravação
  // recusada. Falso positivo é o pior erro desta tela. Auditoria de 25/08/2026.
  const sessaoVencida = !!(POSTO_DE_PE && CASA_INFO && CASA_INFO.sessao === "vencida");
  const selo = $("ia_selo_pasta");
  selo.textContent = LEITURA_FALHOU ? "Não consegui ler o arquivo"
    : sessaoVencida ? "Sessão Vencida"
    : POSTO_DE_PE ? "Gravando na casa do Estúdio"
    : EDIT_RAIZ ? "Pasta liberada" : "Posto Fora Do Ar";
  selo.classList.toggle("badge-ruim",
    !!LEITURA_FALHOU || sessaoVencida || (!POSTO_DE_PE && !EDIT_RAIZ));
  if (sessaoVencida) {
    recadoDaIA("A sessão desta página venceu: recarregue e entre com a senha de novo. "
      + "Nada foi perdido.", "ruim");
  }
  /* O SAIR SÓ EXISTE ONDE HÁ SESSÃO PARA ENCERRAR, desde 25/08/2026. A casa na VPS pede
     senha e guarda o bilhete por trinta dias; sem esta porta, quem abrisse a tela num
     computador emprestado não tinha como fechar. No PC (sem senha configurada) e com a
     sessão já vencida não há o que encerrar, e o botão fica fora da tela. */
  if ($("cfg_sair")) {
    $("cfg_sair").hidden = !(POSTO_DE_PE && CASA_INFO && CASA_INFO.sessao === "aberta");
  }
  // BOTAO QUE NAO TEM O QUE FAZER SAI DA TELA. Com o posto de pé não há pasta a liberar, e
  // um botão inútil ao lado do texto que diz "não há pasta a liberar" é convite a pensar
  // que faltou clicar nele. Sobrou clique a menos, e não a mais, nesta tela.
  $("ia_liberar").hidden = !!POSTO_DE_PE || !!EDIT_RAIZ;
  $("ia_prompt").value = IA.prompt || IA_PROMPT_PADRAO;

  // "VAZIA" SO' QUANDO O DISCO DISSE QUE ESTA' VAZIA. Se a leitura falhou, dizer vazia e'
  // mentir, e ainda convida a acrescentar uma chave, que e' o gesto que apaga o arquivo.
  $("ia_add").disabled = !!LEITURA_FALHOU;
  if (LEITURA_FALHOU) {
    fila.innerHTML = '<div class="ia-vazia"><b>Não consegui ler o arquivo do disco.</b>'
      + '<span class="nota">Não sei quais chaves estão guardadas, então não mostro nenhuma '
      + 'e não deixo salvar: gravar agora apagaria o que está lá. Recarregue a página '
      + '(F5). Se continuar, a cópia anterior está em <b>ia.json.anterior</b>, na pasta do '
      + 'Estúdio.</span></div>';
  } else if (!IA.chaves.length) {
    fila.innerHTML = '<div class="ia-vazia"><b>A fila está vazia.</b><span class="nota">'
      + 'Acrescente uma chave abaixo. A gratuita do Google Gemini sai em '
      + '<b>aistudio.google.com</b>, a do Groq em <b>console.groq.com</b> e a do '
      + 'OpenRouter em <b>openrouter.ai</b>.</span></div>';
    $("ia_fila_diz").textContent = "";
    desenhaGastoPorEmpresa();
    desenhaUsoDaIA();
    return;
  }

  fila.innerHTML = IA.chaves.map((c, i) => {
    const u = usoDaChave(c), ficha = fichaDoServico(c.servico);
    /* O SELO DIZ QUAL TETO BATEU, e nao so' que bateu.

       SAO QUATRO TETOS DIFERENTES e cada um pede uma coisa: fichas por minuto passa
       sozinho em segundos, fichas por dia so' zera amanha, e pedidos por dia daquele
       modelo se resolve trocando de modelo na mesma chave, o que o programa ja' faz.
       "Bateu o limite hoje" nao separava nenhum dos tres, e foi o que ele cobrou em
       22/08/2026: "aqui nao traz nenhum veredito referente ao Google Gemini". */
    const selo = u.esgotada ? '<span class="ia-selo ruim">Bateu o limite hoje</span>'
      : u.pedidos ? '<span class="ia-selo boa">Respondendo</span>'
      : '<span class="ia-selo">Ainda não usada</span>';
    // A MESMA CONTA DO PAINEL DE CIMA. A linha mostrava `pedidos` cru e o painel mostrava
    // o que saiu escrito; com 128 pedidos e 8 recusas, um dizia 128 e o outro 120, para a
    // mesma chave. Dois números para a mesma coisa é pior que número nenhum.
    const escritas = Math.max(0, Number(u.pedidos || 0) - Number(u.sem_cota || 0)
                                 - Number(u.erros || 0));
    const conta = u.pedidos
      ? `${num(escritas)} ${escritas === 1 ? "frase" : "frases"} hoje`
        + (u.sem_cota ? `, ${num(u.sem_cota)} recusadas` : "")
      : "Sem uso hoje";
    return `<div class="ia-chave" data-i="${i}">
      <div class="ia-chave-n">${i + 1}</div>
      <div class="ia-chave-corpo">
        <div class="ia-chave-topo"><b>${escapa(ficha.r)}</b>${selo}</div>
        <div class="ia-chave-resumo">${escapa(pontinhos(c.chave))}
          <i>·</i> ${escapa(u.modelo_agora || c.modelo || "Modelo padrão")}${
            u.modelo_agora && u.modelo_agora !== c.modelo
              ? ` <span class="nota">(trocado sozinho)</span>` : ""}
          <i>·</i> ${escapa(conta)}</div>
        ${u.motivo ? `<div class="ia-chave-porque">Parou por <b>${escapa(u.motivo)}</b>.${
          (u.modelos_gastos || []).length
            ? ` Já rodou ${num((u.modelos_gastos || []).length)} modelo${(u.modelos_gastos || []).length === 1 ? "" : "s"} desta chave hoje.` : ""
        }</div>` : ""}
        <div class="ia-chave-diz" data-diz="${i}"></div>
      </div>
      <span class="ia-chave-botoes">
        <button class="acao mini" data-acao="provar" type="button">Provar</button>
        <button class="acao mini" data-acao="editar" type="button">Editar</button>
        <button class="ia-mover" data-acao="sobe" type="button"
                aria-label="Subir na fila"${i === 0 ? " disabled" : ""}>&uarr;</button>
        <button class="ia-mover" data-acao="desce" type="button"
                aria-label="Descer na fila"${i === IA.chaves.length - 1 ? " disabled" : ""}>&darr;</button>
        <button class="ia-mover perigo" data-acao="tira" type="button"
                aria-label="Tirar da fila">&times;</button>
      </span>
    </div>`;
  }).join("");

  desenhaGastoPorEmpresa();
  // SO' AFIRMA O QUE FOI LIDO. Ver `USO_LIDO`, la' em cima, e a trava 2 do CLAUDE.md.
  const vivas = IA.chaves.filter(c => !estaEsgotada(c)).length;
  $("ia_fila_diz").textContent = !USO_LIDO
    ? "Não consegui ler a conta do dia, então não sei quais chaves ainda respondem."
    : vivas === IA.chaves.length
    ? "A fila inteira está de pé."
    : `${vivas} de ${IA.chaves.length} ainda respondem hoje; as outras voltam quando o dia virar.`;
  desenhaUsoDaIA();
}

/* MEXEU, GRAVOU. E esta é a linha que faltava, seis rodadas atrás.

   O QUE O REGISTRO DO POSTO MOSTROU, e é prova e não palpite: em 22/08 ele abriu a tela
   local às 15:01 e às 15:09, e nas duas o programa serviu a página e leu o arquivo. Não
   chegou UM pedido de gravação. Nenhum. A tela nunca tentou escrever.

   POR QUE: acrescentar uma chave punha ela na lista da TELA, e gravar no disco era outro
   botão, no pé da página, atrás de uma linha de texto miúda dizendo "clique em Guardar".
   Dois passos onde a cabeça dele tinha um: clicou em Acrescentar, viu a chave na fila,
   entendeu, com toda a razão, que estava guardada. Dava F5 e sumia.

   O CONSERTO NÃO É AVISAR MELHOR, é tirar o segundo passo. Acrescentar grava. Remover
   grava. Mudar a ordem grava. Mexer no prompt grava ao sair do campo. O que estiver na
   tela é o que está no arquivo, sempre, sem ninguém ter de lembrar de nada. */
async function salvarFila(oQueMudou) {
  try {
    // O QUE ESTÁ NA TELA VAI JUNTO, e o prompt é parte disso. Sem esta linha, acrescentar
    // uma chave gravava o arquivo com o prompt vazio, e o recado dizia "um prompt de 0
    // caracteres" com o texto inteiro à vista logo abaixo. O programa se vira com o padrão
    // quando o campo está vazio, então nada quebrava; parecia quebrado, que é pior.
    const campo = $("ia_prompt");
    IA.prompt = (campo && campo.value.trim()) || IA.prompt || IA_PROMPT_PADRAO;
    const mandei = (IA.chaves || []).length;
    const g = await gravarIA();
    const n = (g.chaves || []).length;
    // CONFERIR O QUE VOLTOU, e nao so' imprimir. O verde tem de sair da comparacao entre o
    // que foi mandado e o que o disco devolveu, senao ele e' so' uma palavra bonita.
    if (n !== mandei) {
      throw new Error(`mandei ${mandei} e o arquivo voltou com ${n}. `
        + "Recarregue a página e confira antes de mexer em mais nada.");
    }
    IA_LIDA = true;
    MUDANCA_PENDENTE = false;
    desenhaCfgIA();
    recadoDaIA(`${oQueMudou} Estudio/ia.json tem agora `
      + `${n} ${n === 1 ? "chave" : "chaves"} e um prompt de `
      + `${(g.prompt || "").length} caracteres. É deste arquivo que o programa lê.`, "boa");
    return true;
  } catch (e) {
    // O QUE ESTÁ NA TELA NÃO SE APAGA quando o disco recusa: ele acabou de digitar isso.
    // Some o "guardado", fica o vermelho, e a chave continua onde ele a pôs.
    MUDANCA_PENDENTE = true;
    desenhaCfgIA();
    recadoDaIA("NÃO FOI SALVO NO DISCO. " + (e.message || e), "ruim");
    return false;
  }
}

let FILA_OCUPADA = false;

$("ia_fila").addEventListener("click", async ev => {
  const b = ev.target.closest("[data-acao]");
  if (!b) return;
  // UM DE CADA VEZ. Dois cliques seguidos enquanto a gravacao anterior ainda corria
  // mexiam na chave errada, porque a linha e' identificada pela posicao e a posicao muda.
  if (FILA_OCUPADA) return;
  FILA_OCUPADA = true;
  try { await umCliqueNaFila(ev, b); } finally { FILA_OCUPADA = false; }
});

async function umCliqueNaFila(ev, b) {
  const i = Number(b.closest(".ia-chave").dataset.i);
  const acao = b.dataset.acao;
  if (acao === "tira") {
    IA.chaves.splice(i, 1);
    await salvarFila("Chave removida.");
    return;
  }
  if (acao === "editar") { abrirJanelaDaChave(i); return; }
  if (acao === "sobe" && i > 0) {
    [IA.chaves[i - 1], IA.chaves[i]] = [IA.chaves[i], IA.chaves[i - 1]];
    await salvarFila("Ordem da fila mudada.");
    return;
  }
  if (acao === "desce" && i < IA.chaves.length - 1) {
    [IA.chaves[i], IA.chaves[i + 1]] = [IA.chaves[i + 1], IA.chaves[i]];
    await salvarFila("Ordem da fila mudada.");
    return;
  }
  if (acao === "provar") await provarChave(i, b);
}

$("ia_add").onclick = () => abrirJanelaDaChave(-1);

/* O PROMPT TAMBÉM GRAVA SOZINHO, ao sair do campo. `change` num campo de texto só dispara
   quando o texto mudou E o cursor saiu dele, então não grava a cada letra digitada. */
$("ia_prompt").onchange = async () => {
  IA.prompt = $("ia_prompt").value.trim();
  await salvarFila("Prompt guardado.");
};
$("ia_prompt_padrao").onclick = async () => {
  $("ia_prompt").value = IA_PROMPT_PADRAO;
  IA.prompt = IA_PROMPT_PADRAO;
  await salvarFila("Prompt de volta ao padrão.");
};

$("ia_guardar").onclick = async () => {
  IA.prompt = $("ia_prompt").value.trim();
  const b = $("ia_guardar");
  b.disabled = true;
  try {
    // GUARDAR LIBERA A PASTA SOZINHO. Antes ele exigia um clique anterior noutro botão e,
    // sem esse clique, falhava. Exigir um passo escondido para o botão principal
    // funcionar é desenho errado: o clique dele em Guardar já é a permissão que o
    // navegador quer.
    if (!EDIT_RAIZ && !await postoDePe()) {
      recadoDaIA("Liberando a pasta do Estúdio...", "");
      await pedirPasta();
      IA_LIDA = false;
      await juntarComOQueJaEstava();
    }
    const gravado = await gravarIA();
    IA_LIDA = true;
    desenhaCfgIA();
    // O RECADO DIZ O QUE FOI PARAR NO ARQUIVO, lido de volta dele. É a resposta à
    // pergunta "salvar aqui vai impactar no back-end": foi para lá, e é isto que está lá.
    const n = (gravado.chaves || []).length;
    recadoDaIA(`Salvo em Estudio/ia.json: `
      + `${n} ${n === 1 ? "chave" : "chaves"} na fila e um prompt de `
      + `${(gravado.prompt || "").length} caracteres. É deste arquivo que o programa lê.`,
      "boa");
  } catch (e) {
    // FECHAR A JANELA DE PASTAS NAO E' ERRO, e o recado tem de dizer o que falta fazer em
    // vez de repetir a palavra que o navegador usou.
    recadoDaIA(e && e.name === "AbortError"
      ? "A janela de pastas foi fechada sem escolher. O navegador só grava no disco "
        + "depois que você aponta a pasta Estudio uma vez."
      : "Não deu para salvar: " + e.message, "ruim");
  }
  b.disabled = false;
};

/* O RECADO APARECE EM CIMA, e não só na linha do rodapé. Quando gravar falha, o motivo
   tem de estar onde o olho está, e não a uma rolagem de distância. */
function recadoDaIA(txt, tom) {
  const alto = $("ia_alerta");
  alto.textContent = txt;
  alto.className = "ia-alerta " + (tom || "");
  alto.hidden = !txt;
  parado("ia_cfg_recado", txt);
  // RECADO QUE ELE NÃO VÊ NÃO É RECADO. Este mora no alto da página, e ele costuma estar
  // lá embaixo, na fila ou no prompt, quando a resposta chega.
  if (txt && tom) alto.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* NUNCA SOBRESCREVER O QUE NÃO FOI LIDO. Se a fila do disco tem chaves e a da tela não as
   conhece, gravar por cima apagaria as dele. Então o que está no arquivo é lido e juntado
   ao que está na tela, e não o contrário. */
async function juntarComOQueJaEstava() {
  let doDisco = { chaves: [], prompt: "" };
  try {
    const f = await (await EDIT_RAIZ.getFileHandle("ia.json")).getFile();
    doDisco = viraFila(JSON.parse(await f.text()) || {});
  } catch (e) { IA_LIDA = true; return; }
  const daTela = IA.chaves.slice();
  const juntas = doDisco.chaves.slice();
  for (const c of daTela) {
    if (!juntas.some(x => x.chave === c.chave && x.servico === c.servico)) juntas.push(c);
  }
  IA = { chaves: juntas, prompt: IA.prompt || doDisco.prompt || "" };
  IA_LIDA = true;
  desenhaCfgIA();
}


/* ------------------------------------------------ a janela da chave

   ACRESCENTAR E EDITAR SÃO A MESMA JANELA, e a diferença é só o que ela traz preenchido e
   o que diz o botão do canto. `CH_QUAL` guarda qual linha está sendo mexida: -1 quer dizer
   uma chave nova. */

let CH_QUAL = -1;
let CH_RASCUNHO = null;
let CH_DE_RESERVA = true;

function abrirJanelaDaChave(i) {
  CH_QUAL = i;
  const c = i >= 0 ? IA.chaves[i] : { servico: "gemini", chave: "", modelo: "" };
  CH_RASCUNHO = { servico: c.servico, chave: c.chave, modelo: c.modelo };
  $("ch_titulo").textContent = i >= 0 ? `Chave ${i + 1} da fila` : "Nova chave";
  $("ch_ok").disabled = false;          // ele fica travado apos um salvamento que deu certo
  // SALVAR, E NAO "ACRESCENTAR". "Acrescentar" descreve o que acontece com a lista da
  // tela, e foi por isso que ele clicou dez vezes achando que tinha salvado. O botao tem
  // de dizer o que ele quer que aconteca, que e' a chave ficar guardada.
  $("ch_ok").textContent = "Salvar";
  $("ch_chave").value = c.chave || "";
  $("ch_diz").textContent = "";
  $("ch_diz").className = "pop-diz";
  pselNovo($("ch_servico"), IA_SERVICOS, c.servico, v => {
    CH_RASCUNHO.servico = v;
    CH_RASCUNHO.modelo = "";
    desenhaOndePegar();
    encherModelos();
  });
  desenhaOndePegar();
  encherModelos();
  $("ch_fundo").hidden = false;
  $("ch_pop").hidden = false;
  setTimeout(() => $("ch_chave").focus(), 30);
}

function desenhaOndePegar() {
  const ficha = fichaDoServico(CH_RASCUNHO.servico);
  $("ch_onde").innerHTML = `A chave gratuita do <b>${escapa(ficha.r)}</b> sai em `
    + `<b>${escapa(ficha.onde)}</b>. A lista de modelos traz só os que leem imagem e `
    + `servem para reescrever a frase do card; o primeiro é o recomendado.`;
}

/* A LISTA SE ENCHE SOZINHA, com o catálogo do serviço quando ele responde e com a lista
   curta de reserva quando não responde. Trocar a chave refaz a busca, porque o catálogo
   do Gemini e o do Groq dependem dela. */
async function encherModelos() {
  const alvo = $("ch_modelo");
  alvo.innerHTML = '<span class="ch-carregando">Buscando os modelos...</span>';
  const chave = $("ch_chave").value.trim();
  let lista = await modelosDe(CH_RASCUNHO.servico, chave);
  // A LISTA DE RESERVA É PALPITE MEU; a do catálogo é a verdade daquela chave. Guardar
  // qual delas está na tela permite conferir antes de gravar.
  CH_DE_RESERVA = !MODELOS_JA_BUSCADOS.has(CH_RASCUNHO.servico + "|" + chave);
  /* O MODELO QUE ELE JA' ESCOLHEU NAO SE PERDE PORQUE O SERVICO NAO ATENDEU AGORA.

     O QUE ACONTECIA ATE' 22/08/2026: abrir "Editar" so' para conferir a chave, com o
     servico fora do ar, caia na lista de reserva; o modelo guardado nao estava nela, e
     a tela escolhia o primeiro da reserva calada. Bastava clicar em Salvar e a chave
     passava a trabalhar com um modelo que ele nunca escolheu.

     AGORA ELE ENTRA NA LISTA, marcado como o que ja' estava guardado. */
  if (CH_RASCUNHO.modelo && !lista.some(m => m.v === CH_RASCUNHO.modelo)) {
    lista = [{ v: CH_RASCUNHO.modelo, r: CH_RASCUNHO.modelo + " (o que já estava)" }]
      .concat(lista);
  }
  const atual = lista.some(m => m.v === CH_RASCUNHO.modelo)
    ? CH_RASCUNHO.modelo : lista[0].v;
  CH_RASCUNHO.modelo = atual;
  pselNovo(alvo, lista, atual, v => { CH_RASCUNHO.modelo = v; });
  $("ch_quantos").textContent = (lista.length === 1
    ? "1 modelo" : `${lista.length} modelos`)
    + (CH_DE_RESERVA ? ", sem resposta do serviço agora" : "");
}

/* TROCOU A CHAVE, TROCA O CATÁLOGO. Espera ele parar de digitar para não pedir a lista a
   cada tecla. */
let CH_ESPERA = null;
$("ch_chave").oninput = () => {
  clearTimeout(CH_ESPERA);
  CH_ESPERA = setTimeout(encherModelos, 600);
};

/* FECHAR NAO PODE JOGAR A CHAVE FORA CALADO.

   O CAMINHO QUE EXISTIA ATE' 22/08/2026: ele colava a chave, clicava em Provar, lia
   "Funcionou" em verde, e fechava a janela satisfeito. Nada tinha sido gravado: Provar
   fala com o servico, Salvar e' que escreve no disco. O verde dizia a verdade sobre a
   chave e mentia sobre o destino dela. Ele passou uma noite inteira nesse tipo de
   engano, e a licao ja' esta' na trava 1 do CLAUDE.md: nao vale conferir a intencao.

   O AVISO E' UM SEGUNDO CLIQUE, e nao uma janela nova. Fechar com coisa por salvar diz
   o que vai se perder; fechar de novo descarta. */
let CH_DESCARTE_PEDIDO = false;

function chavePorSalvar() {
  const agora = $("ch_chave").value.trim();
  if (!agora) return false;
  const antes = CH_QUAL >= 0 ? (IA.chaves[CH_QUAL] || {}) : null;
  if (!antes) return true;                        // chave nova, nunca gravada
  return agora !== (antes.chave || "")
      || CH_RASCUNHO.servico !== antes.servico
      || (CH_RASCUNHO.modelo || "") !== (antes.modelo || "");
}

function fecharJanelaDaChave(forcar) {
  if (forcar !== true && !CH_DESCARTE_PEDIDO && chavePorSalvar()) {
    CH_DESCARTE_PEDIDO = true;
    $("ch_diz").className = "pop-diz ruim";
    $("ch_diz").textContent = "Esta chave ainda NÃO foi guardada no disco. Provar só fala com o serviço; quem grava é o Salvar. Feche de novo para descartar mesmo.";
    return;
  }
  CH_DESCARTE_PEDIDO = false;
  CH_QUAL = -1;
  $("ch_fundo").hidden = true;
  $("ch_pop").hidden = true;
}
$("ch_fechar").onclick = () => fecharJanelaDaChave();
$("ch_fundo").onclick = () => fecharJanelaDaChave();
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !$("ch_pop").hidden) fecharJanelaDaChave();
});

const leJanela = () => ({
  servico: CH_RASCUNHO.servico,
  chave: $("ch_chave").value.trim(),
  modelo: CH_RASCUNHO.modelo || "",
});

$("ch_ok").onclick = async () => {
  /* O BOTAO TRANCA NA PRIMEIRA LINHA, e nao depois da busca do catalogo.

     ENTRE O CLIQUE E A TRANCA HAVIA UMA ESPERA INTEIRA: quando a lista ainda era a de
     reserva, o codigo ia buscar o catalogo do servico antes de trancar o botao, e nesses
     segundos um segundo clique entrava. Os dois seguiam adiante e a mesma chave era
     acrescentada duas vezes na fila. */
  if ($("ch_ok").disabled) return;
  $("ch_ok").disabled = true;
  const d = leJanela();
  if (!d.chave) {
    $("ch_diz").className = "pop-diz ruim";
    $("ch_diz").textContent = "Falta colar a chave.";
    $("ch_ok").disabled = false;
    return;
  }
  // COLOU E CLICOU NO MESMO SEGUNDO: a lista ainda era a de reserva, e ele gravaria um
  // modelo que eu escrevi em vez de um que a chave dele tem. Busca o catálogo antes.
  if (CH_DE_RESERVA) {
    $("ch_diz").className = "pop-diz";
    $("ch_diz").textContent = "Conferindo os modelos desta chave...";
    clearTimeout(CH_ESPERA);
    await encherModelos();
    d.modelo = CH_RASCUNHO.modelo || "";
    $("ch_diz").textContent = "";
  }
  const editando = CH_QUAL >= 0;
  if (editando) Object.assign(IA.chaves[CH_QUAL], d);
  else IA.chaves.push(Object.assign({ id: novaChaveId() }, d));

  // GRAVA ANTES DE FECHAR A JANELA, para o erro, se houver, aparecer aqui dentro, onde os
  // olhos dele estão. Só fecha depois de o disco ter confirmado.
  $("ch_diz").className = "pop-diz";
  $("ch_diz").textContent = "Salvando...";
  const deu = await salvarFila(editando ? "Chave alterada." : "Chave salva.");
  // SO' RELIGA NO CAMINHO DO ERRO. Religar depois de dar certo deixava a janela aberta por
  // um segundo com o botao vivo, e um segundo clique gravava a mesma chave outra vez.
  if (!deu) {
    $("ch_ok").disabled = false;
    $("ch_diz").className = "pop-diz ruim";
    $("ch_diz").textContent = "Não deu para salvar. O motivo está no alto da página, "
      + "atrás desta janela. A chave continua aqui, não se perdeu.";
    return;
  }
  // A RESPOSTA APARECE AQUI DENTRO, e a janela espera um instante antes de fechar. Fechar
  // na hora joga a confirmacao para o alto de uma pagina onde ele nem estava olhando.
  $("ch_diz").className = "pop-diz boa";
  $("ch_diz").textContent = "Salva em ia.json, na pasta do Estúdio.";
  setTimeout(() => fecharJanelaDaChave(true), 1100);   // gravou: pode fechar direto
};

/* PROVAR DENTRO DA JANELA, antes de a chave entrar na fila. Chave errada, modelo que não
   existe e cota estourada aparecem aqui em segundos, e não no meio de 107 peças. */
$("ch_provar").onclick = async () => {
  const b = $("ch_provar"), diz = $("ch_diz");
  const d = leJanela();
  b.disabled = true;
  const antes = b.textContent;
  b.textContent = "Provando...";
  diz.className = "pop-diz";
  diz.textContent = "";
  try {
    if (!d.chave) throw new Error("Falta colar a chave.");
    const frase = "Bolsa fecha em alta de 2% nesta terça, puxada pelos bancos";
    const dito = await chamarIA(d.servico, d.chave, d.modelo,
      IA_PROMPT_PADRAO.replace("{limite}", "70"), await imagemDeProva(frase));
    diz.className = "pop-diz boa";
    // O VERDE DIZ O QUE FOI PROVADO, E TAMBEM O QUE NAO FOI. Provar fala com o servico;
    // quem escreve no disco e' o Salvar, e sem essa frase o verde parecia dizer as duas
    // coisas. Ver a nota em `fecharJanelaDaChave`.
    diz.innerHTML = `Funcionou. Da frase <i>${escapa(frase)}</i> ela escreveu: `
      + `<b>${escapa(dito)}</b>`
      + (chavePorSalvar()
         ? ' <span class="nota">Ela ainda não está guardada: clique em '
           + '<b>Salvar</b>.</span>' : "");
  } catch (e) {
    diz.className = "pop-diz ruim";
    diz.textContent = e.message;
  }
  b.disabled = false;
  b.textContent = antes;
};

/* A PROVA QUE ATRAVESSA, e é a única que responde à pergunta que importa: o que eu
   guardei aqui chegou no programa? A prova da janela fala com o serviço a partir desta
   aba, e por isso prova a chave e mais nada. Aqui a tela só deixa o pedido; quem abre o
   `ia.json`, monta a fila e chama a IA é o programa da casa do Estúdio, e o que volta é o
   que ELE conseguiu. */
let BACK_OBRA = null;

$("ia_provar_back").onclick = async () => {
  if (BACK_OBRA) return;
  const b = $("ia_provar_back");
  try {
    // PELO POSTO, QUE E' POR ONDE ELE USA A FERRAMENTA. Este botao continuava exigindo a
    // pasta liberada, numa tela que esconde o botao de liberar a pasta: era um botao que
    // nao tinha como funcionar. A pasta fica de plano B, para quando o posto nao atender.
    const id = "v" + Date.now();
    if (await postoDePe()) {
      await noPosto("/pedido", { id, tipo: "provar-ia" });
    } else {
      const pedidos = await pastaDo("pedidos", true);
      if (!pedidos) throw new Error(SEM_POSTO);
      const h = await pedidos.getFileHandle(`${id}.json`, { create: true });
      const w = await h.createWritable();
      await w.write(JSON.stringify({ id, tipo: "provar-ia" }, null, 1));
      await w.close();
    }
    BACK_OBRA = { id, desde: Date.now(), relogio: null };
    b.disabled = true;
    parado("ia_back_diz", "Pedido deixado. O programa passa na pasta de minuto em "
      + "minuto, então a resposta chega em até um minuto.");
    BACK_OBRA.relogio = setInterval(olharAProva, 2500);
  } catch (e) { parado("ia_back_diz", e.message); }
};

async function olharAProva() {
  if (!BACK_OBRA) return;
  // O RELOGIO CONTA ANTES DE QUALQUER VOLTA ANTECIPADA. Ele ficava girando para sempre
  // quando a pasta sumia no meio, porque a contagem vinha depois do `return`.
  const seg = Math.round((Date.now() - BACK_OBRA.desde) / 1000);
  const desistir = (porque) => {
    clearInterval(BACK_OBRA.relogio); BACK_OBRA = null;
    $("ia_provar_back").disabled = false;
    parado("ia_back_diz", porque);
  };
  let d = null;
  try {
    if (await postoDePe()) {
      const r = await noPosto("/pedido?id=" + encodeURIComponent(BACK_OBRA.id));
      if (!r.tem) throw new Error("ainda não");
      d = r.d;
    } else {
      const p = await pastaDo("pedidos", false);
      if (!p) {
        if (seg > 180) desistir("Perdi o caminho até a pasta no meio da prova. "
          + "Recarregue a página e tente de novo.");
        return;
      }
      const f = await (await p.getFileHandle(`${BACK_OBRA.id}.andamento.json`)).getFile();
      d = JSON.parse(await f.text());
    }
  } catch (e) {
    if (seg > 180) {
      desistir("O programa não pegou o pedido em três minutos. Confira se a tarefa "
        + "oficina do Estúdio está de pé na casa dele.");
    }
    return;
  }
  if (!d.fim) {
    parado("ia_back_diz", d.passo ? "O programa " + d.passo : "O programa pegou o pedido...");
    return;
  }
  clearInterval(BACK_OBRA.relogio);
  BACK_OBRA = null;
  $("ia_provar_back").disabled = false;
  if (d.erro) {
    parado("ia_back_diz", "O programa leu o arquivo, mas não conseguiu escrever: " + d.erro);
    return;
  }
  $("ia_back_diz").innerHTML = "<b>Chegou.</b> O programa abriu o arquivo, achou "
    + `${d.chaves} ${d.chaves === 1 ? "chave" : "chaves"}, usou a de nº `
    + `<b>${escapa(String(d.chave))}</b> no <b>${escapa(nomeDoServico(d.servico))}</b>, `
    + `e da frase <i>${escapa(d.frase || "")}</i> ela escreveu: `
    + `<b>${escapa(d.dito || "")}</b>`;
  await lerUsoDaIA();
  desenhaCfgIA();
}

/* A PROVA DE UMA CHAVE QUE JÁ ESTÁ NA FILA, a partir da lista. */
async function provarChave(i, botao) {
  const c = IA.chaves[i];
  if (!c) return;
  const diz = $("ia_fila").querySelector(`[data-diz="${i}"]`);
  botao.disabled = true;
  const antes = botao.textContent;
  botao.textContent = "Provando...";
  if (diz) { diz.textContent = ""; diz.className = "ia-chave-diz"; }
  try {
    if (!c.chave) throw new Error("Esta chave está vazia.");
    const frase = "Bolsa fecha em alta de 2% nesta terça, puxada pelos bancos";
    const dito = await chamarIA(c.servico, c.chave, c.modelo,
      IA_PROMPT_PADRAO.replace("{limite}", "70"), await imagemDeProva(frase));
    if (diz) { diz.className = "ia-chave-diz boa"; diz.textContent = "Respondeu: " + dito; }
  } catch (e) {
    if (diz) { diz.className = "ia-chave-diz ruim"; diz.textContent = e.message; }
  }
  botao.disabled = false;
  botao.textContent = antes;
}

/** Desenha a frase numa imagem, que é a forma como a IA vê o card de verdade. */
async function imagemDeProva(frase) {
  const c = document.createElement("canvas");
  c.width = 720; c.height = 200;
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#111111"; x.font = "bold 34px Arial, sans-serif";
  let linha = "", y = 70;
  for (const p of frase.split(" ")) {
    if (x.measureText(linha + " " + p).width > 660 && linha) {
      x.fillText(linha, 30, y); y += 46; linha = p;
    } else linha = linha ? linha + " " + p : p;
  }
  x.fillText(linha, 30, y);
  return c.toDataURL("image/png").split(",")[1];
}

/** Uma chamada à IA, no formato que cada serviço pede. É o mesmo do `oficina.py`. */
/* O TETO DE FICHAS, e nada mais que isso.

   ELE ERA 200, e por isso o Gabriel recebia "sem texto (motivo: MAX_TOKENS)": o modelo não
   cabia dentro do orçamento e devolvia o quadro vazio. Subir o teto não muda como a IA
   trabalha, muda só o quanto ela pode escrever antes de ser cortada.

   E NADA ALÉM DISSO. Eu tinha acrescentado um campo que desligava o raciocínio do modelo,
   e ele cortou na hora: "deixa a IA gratuita funcionar normal". Estava certo: mexer no
   funcionamento dela para caber num teto meu é consertar o lado errado. O teto é meu, o
   jeito de trabalhar é dela. */
const TETO_DE_FICHAS = 4096;

/* O MODELO DO GROQ PARA DE PENSAR EM VOZ ALTA, decidido com ele, com número na mesa.
   Medido em 22/08/2026, mesma chave e mesmo card: como estava, 700 fichas queimadas e
   resposta vazia; sem pensar alto, 15 fichas e "Bancos levam bolsa a alta de 2% na terça".
   Vale só no Groq: o Gemini já responde certo e não recebe campo nenhum a mais. */
const SEM_PENSAR_ALTO = { groq: { reasoning_effort: "none" } };

function corpoDoPedido(servico, modelo, prompt, b64) {
  if (servico === "gemini") {
    const partes = [{ text: prompt }];
    if (b64) partes.push({ inline_data: { mime_type: "image/png", data: b64 } });
    return { contents: [{ parts: partes }],
             generationConfig: { temperature: 0.9, maxOutputTokens: TETO_DE_FICHAS } };
  }
  const conteudo = [{ type: "text", text: prompt }];
  if (b64) conteudo.push({ type: "image_url",
                           image_url: { url: "data:image/png;base64," + b64 } });
  // O MESMO AJUSTE DO PROGRAMA, para o botão Provar responder o que a leva vai responder.
  // Se aqui e lá pedirem coisas diferentes, provar deixa de provar.
  return Object.assign(
    { model: modelo, temperature: 0.9, max_tokens: TETO_DE_FICHAS,
      messages: [{ role: "user", content: conteudo }] },
    SEM_PENSAR_ALTO[servico] || {});
}

/* SERVIÇO OCUPADO NÃO É CHAVE RUIM.

   O QUE ELE VIU: "O serviço respondeu 503: This model is currently experiencing high
   demand. Spikes in demand are usually temporary. Please try again later." A chave estava
   boa, o modelo estava vivo, e mesmo assim a linha ficou vermelha como se ele tivesse
   errado alguma coisa. Não errou: os servidores do Google estavam cheios naquele minuto.

   ENTÃO ELE MESMO TENTA DE NOVO, duas vezes, esperando dois e depois seis segundos, que é
   o tempo em que um pico desses costuma passar. Só se as três tentativas caírem é que o
   recado aparece, e ele diz o que de fato aconteceu em vez de um número solto. */
const OCUPADO = /high demand|overload|unavailable|try again later|capacity|busy|temporarily/i;
const ESPERAS_DO_OCUPADO = [2000, 6000];
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function chamarIA(servico, chave, modelo, prompt, b64, tentativa = 0) {
  const ficha = fichaDoServico(servico);
  modelo = modelo || ficha.modelo;
  let url;
  const cabeca = { "Content-Type": "application/json" };
  if (servico === "gemini") {
    url = "https://generativelanguage.googleapis.com/v1beta/models/"
      + encodeURIComponent(modelo) + ":generateContent?key=" + encodeURIComponent(chave);
  } else {
    url = servico === "groq" ? "https://api.groq.com/openai/v1/chat/completions"
                             : "https://openrouter.ai/api/v1/chat/completions";
    cabeca.Authorization = "Bearer " + chave;
  }
  const corpo = corpoDoPedido(servico, modelo, prompt, b64);
  let r;
  try {
    r = await fetch(url, { method: "POST", headers: cabeca, body: JSON.stringify(corpo) });
  } catch (e) {
    throw new Error("não consegui falar com o serviço daqui do navegador. A chave pode "
      + "estar certa mesmo assim: quem chama de verdade é o programa do Estúdio.");
  }
  const txt = await r.text();
  if (!r.ok) {
    // O RECADO É O DO SERVIÇO, e não o meu. Antes eu resumia tudo a "o serviço recusou a
    // chave ou o modelo (400)", e o Gabriel testou as duas chaves e recebeu isso nas
    // duas: "já deu erro, nem sei que erro é esse". Resumo que esconde a causa não é
    // resumo, é apagar a única informação útil que veio de volta.
    let dito = "";
    try {
      const d = JSON.parse(txt);
      dito = (d.error && (d.error.message || d.error.code)) || d.message || "";
    } catch (e) { dito = txt.slice(0, 200); }
    if (r.status === 429 || r.status === 402) {
      throw new Error("Esta chave bateu o limite. O serviço disse: " + dito);
    }
    if (r.status >= 500 || OCUPADO.test(dito)) {
      if (tentativa < ESPERAS_DO_OCUPADO.length) {
        await dormir(ESPERAS_DO_OCUPADO[tentativa]);
        return chamarIA(servico, chave, modelo, prompt, b64, tentativa + 1);
      }
      throw new Error(`O ${nomeDoServico(servico)} está ocupado agora, e isso não é `
        + `problema da sua chave. Tentei três vezes. Costuma passar em alguns minutos.`);
    }
    throw new Error(`O serviço respondeu ${r.status}: ${dito}`);
  }
  let d;
  try { d = JSON.parse(txt); } catch (e) { throw new Error("resposta ilegível"); }
  const dito = servico === "gemini"
    ? d.candidates?.[0]?.content?.parts?.[0]?.text
    : d.choices?.[0]?.message?.content;
  if (!dito) {
    const razao = String(d.candidates?.[0]?.finishReason
                         || d.choices?.[0]?.finish_reason || "");
    throw new Error("O serviço respondeu sem texto"
      + (razao ? ` (motivo: ${razao})` : "") + ". Tente outro modelo da lista.");
  }
  return soAFrase(dito);
}

/* O QUE É A FRASE E O QUE É O MODELO PENSANDO ALTO. Alguns modelos abrem a resposta com uma
   etiqueta <think> e despejam dentro dela o próprio raciocínio antes de entregar a frase, e
   isso iria parar escrito no card. Não muda nada em como a IA trabalha: ela pensa o que
   quiser, e o pensamento não vira peça. */
function soAFrase(texto) {
  let t = String(texto || "").replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  if (/^\s*<(think|thinking|reasoning)>/i.test(t)) t = "";   // ficou aberto, cortado no meio
  return t.trim().replace(/^"|"$/g, "").trim();
}


/* ---------------------------------------------------- a aba de Configurações

   O MENU DA ESQUERDA TROCA A PÁGINA DA DIREITA, e é o mesmo desenho do Social Tracker. */

function irParaCfg(pg) {
  document.querySelectorAll("#aba-config .cfg-pagina").forEach(p =>
    p.classList.toggle("cfg-ativa", p.dataset.pg === pg));
  document.querySelectorAll("#aba-config .cfg-item").forEach(a =>
    a.classList.toggle("cfg-ativo", a.dataset.cfg === pg));
  if (pg === "fontes") desenhaAsFontes();
  if (pg === "pastas") desenhaAsPastas();
  if (pg === "motor") desenhaOMotor();
}
document.querySelectorAll("#aba-config .cfg-item").forEach(a => {
  a.onclick = ev => { ev.preventDefault(); irParaCfg(a.dataset.cfg); };
});
document.querySelector('#aba-config .cfg-item').classList.add("cfg-ativo");

/* CADA FONTE ESCRITA NA PRÓPRIA FONTE. Uma lista de nomes não diz nada: o que se escolhe
   ali é o desenho da letra, então ele precisa estar na tela. */
function desenhaAsFontes() {
  $("fon_n").textContent = FONTES.length + " famílias";
  $("fon_lista").innerHTML = FONTES.map(f =>
    `<div class="cfg-fonte"><i>${escapa(f.g || "")}</i>`
    + `<b style="font-family:${fonteCss(f.v)}">${escapa(f.r)}</b></div>`).join("");
}

function desenhaOMotor() {
  // O SELO NÃO AFIRMA PLACA QUE NÃO MEDIU: quem testa a placa é a oficina, a cada
  // recorte, na máquina da casa. Aqui fica a regra, não um palpite de hardware.
  $("mot_onde").textContent = "Na Casa Do Estúdio";
}

async function desenhaAsPastas() {
  const selo = $("pas_selo"), lista = $("pas_lista");
  const quadros = [
    ["levas", "Os reels baixados, ainda inteiros"],
    ["recortes", "O B-roll de cada reel, já em 1080 por 1920"],
    ["edicoes", "As peças montadas, prontas para publicar"],
    ["templates", "Os templates guardados"],
    ["fontes", "As fontes que o programa usa para desenhar o texto"],
    ["pedidos", "A fila entre esta tela e o programa da casa"],
  ];
  const pintar = (rotulo, de) => {
    lista.innerHTML = quadros.map(([nome, diz]) => {
      const selo2 = de(nome);
      return '<div class="cfg-linha"><div><div class="cfg-nome">Estudio/' + nome
        + '</div><div class="cfg-desc">' + diz + '</div></div><div class="dir">'
        + '<span class="badge badge-secondary">' + selo2 + "</span></div></div>";
    }).join("");
    selo.textContent = rotulo;
  };
  // O POSTO PRIMEIRO, desde 25/08/2026: quem conta é quem enxerga o disco da casa. E a
  // contagem tem três estados por pasta, como manda a regra da leitura: contei, não
  // existe, e NÃO CONSEGUI CONTAR.
  if (await postoDePe()) {
    try {
      const r = await noPosto("/contagem");
      pintar("Na casa do Estúdio", nome => {
        const p = (r.pastas || {})[nome];
        if (!p || p.estado === "nao_existe") return "Não existe";
        if (p.estado !== "ok") return "Não consegui contar";
        return num(p.itens) + (p.itens === 1 ? " item" : " itens");
      });
    } catch (e) {
      selo.textContent = "Não consegui ler";
      lista.innerHTML = '<div class="cfg-linha"><div><div class="cfg-nome">'
        + 'Não consegui contar as pastas</div><div class="cfg-desc">'
        + escapa(e.message || String(e)) + '</div></div></div>';
    }
    return;
  }
  if (SEM_PASTA_AQUI || !EDIT_RAIZ) {
    selo.textContent = SEM_PASTA_AQUI ? "Posto fora do ar" : "Não liberada";
    lista.innerHTML = '<div class="cfg-linha"><div><div class="cfg-nome">'
      + (SEM_PASTA_AQUI
        ? 'O posto da casa não respondeu</div><div class="cfg-desc">'
          + escapa(SEM_POSTO)
        : 'O posto está fora e a pasta não foi liberada</div><div class="cfg-desc">'
          + 'Espere um minuto e recarregue a página; ou abra a aba de Edição e libere '
          + 'a pasta do Estúdio, que é o plano B para o navegador enxergar o disco.')
      + '</div></div></div>';
    return;
  }
  const contar = async nome => {
    try {
      const d = await EDIT_RAIZ.getDirectoryHandle(nome);
      let n = 0;
      for await (const _ of d.values()) n++;
      return n;
    } catch (e) { return null; }
  };
  const contados = {};
  for (const [nome] of quadros) contados[nome] = await contar(nome);
  pintar("Liberada", nome => {
    const n = contados[nome];
    return n === null ? "Não existe" : num(n) + (n === 1 ? " item" : " itens");
  });
}

/* ============================================ FASE 4 · AS PEÇAS PRONTAS

   ELE OLHA, AJUSTA, E SÓ ENTÃO MANDA FABRICAR. A forma foi decidida por ele em
   21/08/2026, respondendo à única pergunta que eu não podia responder sozinho: as peças
   aparecem já fabricadas ou desenhadas na tela? "A tela mostrando como ficou, para no
   mais tardar eu ajustar na mão, depois clicar em um botão para fabricar."

   POR QUE ISSO NÃO É DETALHE: fabricar as 107 antes de ele olhar custa uma rodada inteira
   de conversão, e cada ajuste depois obrigaria a refazer tudo. Desenhadas, elas aparecem
   na hora, ele mexe à vontade, e a conversão roda uma vez só, no fim, já aprovada. */

let AJUSTES = new Map();          // arquivo -> { idDaCaixa: { tamanho, x, y, fonte } }

/* O ENQUADRAMENTO DO B-ROLL DE CADA PECA: quanto ela cresce e para onde ela anda.

   O BURACO NAO SE MEXE, A FILMAGEM SE MEXE. O recorte do passo 2 decide onde fica a
   janela do B-roll naquela peca, e essa janela e' a mesma na tela e no arquivo. O que
   este mapa muda e' o que aparece DENTRO dela: `z` e' o quanto a filmagem cresce em
   cima do proprio centro, `dx` e `dy` sao o quanto ela desliza, em fracao do quadro.

   POR QUE ELE PEDIU, em 23/08/2026: "pegaria alguns b-rolls, reajustaria o
   enquadramento deles". Reel baixado nao tem enquadramento combinado com ninguem: o
   assunto as vezes cai fora da janela, e sem isto a unica saida era descartar a peca.

   O MESMO CALCULO ACONTECE NAS DUAS PONTAS. Aqui e' `transform`; no `oficina.py` e' o
   par `scale` mais `crop` do ffmpeg, com o mesmo deslocamento. Se um dia mudar de um
   lado, tem de mudar do outro, senao a peca sai diferente do que ele aprovou. */
let ENQUADRES = new Map();        // arquivo -> { z, dx, dy }

/* AS PECAS QUE ELE MEXEU COM A PROPRIA MAO.

   ISTO EXISTE PARA A CONTA NAO MENTIR. A tela dizia "62 com ajuste seu" e ele
   perguntou, com razao, o que aquilo significava: ele nao tinha ajustado nada. Os 62
   vinham do encolhimento automatico que roda sozinho depois de a IA escrever. Chamar
   de "seu" o que a maquina fez e' o tipo de numero que faz procurar defeito onde nao
   ha'. Agora sao duas contas separadas, e cada uma diz quem fez. */
let A_MAO = new Set();

/* AS PECAS QUE ELE JA' DEU POR PRONTAS.

   O PEDIDO, de 23/08/2026: "toda vez que eu clicar em avancar pro proximo, ele ja' pega
   e salva: essa e' a definicao final, essa e' a versao final, e' assim que vai ficar".
   E junto veio a conta que ele quer ver: "quantos estao prontos... e quantos falta pra
   ver?".

   ISTO NAO FILTRA A FABRICACAO. Marcar como pronta e' ele assinando embaixo daquela
   peca, nao e' escolher quais vao ser feitas; ele nao pediu para deixar as outras de
   fora, e deixar seria decidir por ele. */
let PRONTAS = new Set();

let AJ_I = 0;                     // qual peca esta' aberta na fase 5
let AJ_SEL = null;                // qual item do molde esta' escolhido
let AJ_VIVO = null;               // o UNICO video aberto nesta fase
const MASCARAS = new Map();       // arquivo -> endereço da máscara já virada em alfa

/* O RECORTE É PRETO POR FORA, E VÍDEO NÃO TEM TRANSPARÊNCIA. Foi isso que fez a cor de
   fundo não aparecer: o Gabriel escolhia verde, escolhia laranja, e a tela continuava
   preta, porque o retângulo preto do vídeo cobre o fundo inteiro. "Não sei o que está
   acontecendo aqui, mas olha o que acontece, olha onde é que aparece o verde."

   A MÁSCARA JÁ EXISTIA NO DISCO para exatamente isto, e o preview simplesmente não a
   usava: o arquivo gravado saía com a cor certa e a tela mostrava outra coisa. Aqui ela
   vira um alfa e recorta o vídeo, então o que se vê é o que sai.

   A VOLTA PELO CANVAS É NECESSÁRIA. A máscara no disco é preta e branca, opaca inteira, e
   `mask-image` do navegador olha o ALFA e não o brilho. Sem esta conversão a máscara seria
   opaca de ponta a ponta e não recortaria nada. */
async function mascaraDe(nome) {
  if (MASCARAS.has(nome)) return MASCARAS.get(nome);
  let url = null;
  // O POSTO PRIMEIRO, desde 25/08/2026: a máscara mora na casa, ao lado do recorte. A
  // resposta 404 é peça de tela cheia, que não tem máscara e nem precisa.
  if (await postoDePe()) {
    try {
      const r = await fetch(urlDoArquivo(pastaDosRecortes() + "/_mascaras/"
        + nome.replace(/\.[^.]+$/, ".png")));
      if (r.ok) {
        const b = await r.blob();
        url = MASCARA_POR_LUZ ? URL.createObjectURL(b) : await alfaDaMascara(b);
        MASCARAS.set(nome, url);
        return url;
      }
      // SÓ O 404 VIRA "NÃO TEM MÁSCARA" GUARDADO (peça de tela cheia). Posto
      // reiniciando ou bilhete vencido é falha passageira: sem guardar, a próxima
      // chamada tenta de novo, em vez de a peça ficar sem furo para sempre.
      if (r.status === 404) MASCARAS.set(nome, null);
      return null;
    } catch (e) { return null; }
  }
  try {
    const raiz = await pastaDo("recortes", false);
    const pasta = await (await raiz.getDirectoryHandle("leva-" + EDIT_LEVA.numero))
      .getDirectoryHandle("_mascaras");
    const arq = await (await pasta.getFileHandle(nome.replace(/\.[^.]+$/, ".png"))).getFile();
    // O CAMINHO CURTO E' SO' ABRIR O ARQUIVO. Ver a nota em `MASCARA_POR_LUZ`.
    url = MASCARA_POR_LUZ ? URL.createObjectURL(arq) : await alfaDaMascara(arq);
  } catch (e) { url = null; }     // peça de tela cheia não tem máscara, e nem precisa
  MASCARAS.set(nome, url);
  return url;
}

function alfaDaMascara(arquivo) {
  return new Promise(pronto => {
    const img = new Image();
    const de = URL.createObjectURL(arquivo);
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i + 3] = d.data[i];     // branco vira opaco, preto vira furo
          d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
        }
        x.putImageData(d, 0, 0);
        c.toBlob(b => { URL.revokeObjectURL(de); pronto(b ? URL.createObjectURL(b) : null); });
      } catch (e) { URL.revokeObjectURL(de); pronto(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(de); pronto(null); };
    img.src = de;
  });
}

/* O NAVEGADOR SABE LER A MASCARA PELO BRILHO, e isso muda tudo no peso.

   O QUE SE FAZIA ANTES: a mascara vem do disco como PNG em tons de cinza, branco onde a
   filmagem aparece e preto onde ela some. O `mask-image` do CSS olha o canal ALFA, e
   nao o brilho, entao havia um passo de conversao em JavaScript: desenhar o PNG num
   canvas, ler os pixels de volta, copiar o vermelho para o alfa, escrever de novo e
   gravar outro arquivo em memoria.

   QUANTO ISSO CUSTAVA: a mascara e' 1080 por 1920, que da' 2.073.600 pixels. O laco
   andava de quatro em quatro sobre 8.294.400 numeros, POR PECA. Em noventa e duas
   pecas sao setecentos e sessenta milhoes de escritas, mais noventa e dois `getImageData`
   e noventa e dois `toBlob`, tudo na mesma linha de execucao que desenha a tela. Era
   isto o "esta' bem pesado".

   `mask-mode: luminance` MANDA O NAVEGADOR OLHAR O BRILHO DIRETO, que e' exatamente o
   que o PNG ja' traz. A conversao inteira deixa de existir, e quem faz a conta e' a
   placa de video. Onde a propriedade nao existir, o caminho velho continua valendo. */
const MASCARA_POR_LUZ = typeof CSS !== "undefined" && !!CSS.supports
  && CSS.supports("mask-mode", "luminance");

function vestirMascara(v, url) {
  v.style.webkitMaskImage = url ? `url(${url})` : "";
  v.style.maskImage = url ? `url(${url})` : "";
  v.style.webkitMaskSize = "100% 100%";
  v.style.maskSize = "100% 100%";
  // BRANCO MOSTRA, PRETO ESCONDE: a mesma leitura que a conversao antiga fazia na mao.
  v.style.maskMode = url && MASCARA_POR_LUZ ? "luminance" : "";
  v.style.webkitMaskSourceType = url && MASCARA_POR_LUZ ? "luminance" : "";
}

/** O texto que esta peça mostra nesta caixa: o da IA se ela escreveu, senão o do molde. */
function textoDaPeca(el, nome) {
  if (el.trava) return el.texto || "";
  const g = ESCRITO.get(nome) || {};
  return (g[el.id] || el.texto || "");
}

/** O acerto desta peça para este elemento, com o do molde como piso. */
function medidaDaPeca(el, nome) {
  const a = (AJUSTES.get(nome) || {})[el.id] || {};
  return { tamanho: a.tamanho != null ? a.tamanho : el.tamanho,
           x: a.x != null ? a.x : el.x, y: a.y != null ? a.y : el.y,
           // A FONTE TAMBEM PODE SER SO' DESTA PECA. Ver `ENQUADRES` para o porque.
           fonte: a.fonte != null ? a.fonte : el.fonte,
           /* E O ALINHAMENTO, desde 02/09/2026. Ele pediu em 29/08 ("uma opcao de
              selecionar se eu quero que a caixa de texto fique centralizada, pro lado,
              pro outro lado") e nao foi feito. A frase nascia centralizada e nao havia
              como discordar, peca nenhuma. */
           alinha: a.alinha != null ? a.alinha : (el.alinha || "centro"),
           mexido: a.tamanho != null || a.x != null || a.y != null || a.fonte != null
                   || a.alinha != null };
}

/* O ENQUADRAMENTO DO B-ROLL DESTA PEÇA. São duas coisas diferentes, e confundi-las foi
   o defeito de 23/08/2026.

     mx, my   ONDE A JANELA FICA na peça. Move o buraco inteiro, com a filmagem junto.
     z        quanto a filmagem cresce DENTRO da janela.
     dx, dy   que pedaço da filmagem aparece dentro da janela, depois de crescida.

   ELE PEDIU O PRIMEIRO E EU TINHA FEITO SÓ OS OUTROS: "o que era pra eu conseguir mover
   a posição de onde tá todo o quadradinho verde, eu só consigo mexer dentro do
   quadrado. Eu não consigo mexer todo o quadrado, ou seja, todo o B-roll". */
function enquadreDe(nome) {
  const e = ENQUADRES.get(nome) || {};
  return { z: e.z || 1, dx: e.dx || 0, dy: e.dy || 0,
           mx: e.mx || 0, my: e.my || 0,
           // `es` E' O TAMANHO DA JANELA, e cresce a partir do centro dela. Nao
           // confundir com `z`, que aproxima a filmagem DENTRO da janela.
           es: e.es || 1,
           /* A FOLGA E A MOLDURA PASSARAM A SER DESTA PECA em 29/08/2026, e as duas
              pelo mesmo motivo: eram decisao global e ele nao tinha como discordar
              numa peca so'.

              `folga`    quanto a filmagem entra maior que o furo. Nasce em 1,12, que
                         e' a constante calibrada para esconder o canto arredondado que
                         vem gravado no reel baixado; peca sem canto nenhum pagava esses
                         12% a toa. Medido nas 180 da leva 31: a folga sozinha corta
                         20,3% da filmagem, e sem ela a perda mediana cai de 26,1% para
                         7,3%.
              `moldura`  o ID da variacao que ELE escolheu. Nulo quer dizer "o que a
                         medida escolher", que continua sendo o caminho de quase toda
                         peca. Ver `variacaoDaPeca`.

     E O NOME NAO E' `arte` DE PROPOSITO, que era o obvio: `enquadre.arte` ja' existe no
     PEDIDO e la' ele e' o NOME DO ARQUIVO da variacao, nao o id. Dois campos com o mesmo
     apelido guardando coisas diferentes e' a armadilha que custou o dia 29/08/2026 com
     a palavra "janela", e ela nao se repete aqui. */
           folga: e.folga != null ? e.folga : FOLGA_DO_ENCAIXE,
           /* O ENCAIXE DESTA PEÇA, desde 29/08/2026: `caber` mostra o B-roll inteiro,
              `cobrir` tapa o furo com ele. Ficha sem o campo cabe, que é o padrão novo
              da casa. Ver `kencDoEncaixe` para a medição que mudou a regra. */
           encaixe: e.encaixe === "cobrir" ? "cobrir" : "caber",
           moldura: e.moldura || null };
}

/** Onde a janela do B-roll desta peça está de fato, já com o que ele moveu. */
function janelaDe(nome) {
  const r = BROLL_DE && BROLL_DE.get(nome);
  if (!r) return null;
  const e = enquadreDe(nome);
  // ELA CRESCE A PARTIR DO PROPRIO CENTRO, e nao do canto: puxar uma alca nao pode
  // fazer o lado de la' sair andando junto.
  const w = r.w * e.es, h = r.h * e.es;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return { x: cx - w / 2 + e.mx, y: cy - h / 2 + e.my, w, h };
}

/* Põe a janela no lugar, sem repintar a peça.

   O `clip-path` NÃO É TOCADO AQUI, e é de propósito: ele guarda o retângulo de origem,
   o mesmo que a máscara desenha. Quem muda a janela de lugar é o `transform`, que leva
   os dois juntos. Recortar de novo num lugar diferente do da máscara foi o defeito. */
function porJanelaNoLugar(alvo, nome) {
  const j = janelaDe(nome);
  if (!j) return;
  const e = enquadreDe(nome);
  const caixa = alvo.querySelector(".gal-broll");
  const marca = alvo.querySelector(".gal-broll-marca");
  if (caixa) caixa.style.transform = transformDaJanela(e);
  if (marca) {
    marca.style.left = (j.x * 100) + "%";
    marca.style.top = (j.y * 100) + "%";
    marca.style.width = (j.w * 100) + "%";
    marca.style.height = (j.h * 100) + "%";
  }
  porMoldura();
}

/* A CONTA DO ENQUADRAMENTO, num lugar so'.

   A ORDEM IMPORTA E NAO E' A QUE SE LE. O navegador aplica da direita para a esquerda:
   primeiro a filmagem cresce em cima do proprio centro, depois desliza. E o `translate`
   em porcentagem mede a CAIXA, nao a imagem crescida, entao `dx` de 10% desloca dez por
   cento do quadro, cresca ela o quanto crescer. E' assim que o ffmpeg tambem faz. */
/* O QUE O VÍDEO CARREGA: só o que acontece DENTRO da janela, isto é, a aproximação e o
   deslize. A mudança de lugar da janela não entra aqui, e essa separação é o conserto
   de 23/08/2026. Ver `transformDaJanela`. */
function transformDo(e) {
  const x = e.dx || 0, y = e.dy || 0;
  if (e.z === 1 && !x && !y) return "";
  return `translate(${x * 100}%, ${y * 100}%) scale(${e.z})`;
}

/* O QUE A CAIXA DA FILMAGEM CARREGA: a mudança de lugar da janela, e mais nada.

   ESTE FOI O DEFEITO, e vale escrito por extenso porque a primeira tentativa parecia
   certa. A caixa carrega DUAS coisas que definem onde a filmagem aparece: o `clip-path`,
   que é o retângulo, e a máscara, que é o formato exato com os cantos arredondados.

   EU MOVIA SÓ O `clip-path`. A máscara é esticada sobre a caixa inteira e ficava onde
   sempre esteve, então o que aparecia na tela era a INTERSEÇÃO das duas: arrastar a
   janela para baixo deixava visível só a fatia onde o retângulo novo ainda encostava na
   máscara velha. Ele descreveu exatamente isso, e estava certo: "piorou".

   AGORA QUEM ANDA É A CAIXA. O `transform` move o elemento já desenhado, com recorte e
   máscara juntos, e as duas não têm como se separar de novo: são propriedades do mesmo
   elemento que o `transform` leva embora inteiro. O vídeo lá dentro vem de carona. */
function transformDaJanela(e) {
  const x = e.mx || 0, y = e.my || 0, s = e.es || 1;
  if (!x && !y && s === 1) return "";
  // A ORDEM LIDA E' `translate` DEPOIS `scale`, mas o navegador aplica de tras para a
  // frente: primeiro cresce em cima da origem, depois anda. A origem e' posta no centro
  // da janela em `pintaPeca`, e nao no centro do quadro.
  return `translate(${x * 100}%, ${y * 100}%) scale(${s})`;
}

/* FECHA O VIDEO DE UMA PECA E DEVOLVE A MEMORIA.

   ELE DISSE: "o meu PC nao tem memoria RAM, entao vai ficar travando muito". Estava
   certo, e o defeito era meu: `acenderPeca` abria um `blob:` por peca e ninguem nunca
   fechava. Rolar as noventa e duas deixava noventa e dois videos vivos na aba ate' o F5.
   Tirar o `src` sem revogar o endereco tambem nao adianta: o arquivo continua presa. */
function apagarPeca(v) {
  if (!v || !v.dataset.aceso) return;
  const de = v.src;
  try { v.pause(); } catch (e) { /* ja' estava parado */ }
  v.removeAttribute("src");
  try { v.load(); } catch (e) { /* a aba esta' fechando */ }
  if (de && de.startsWith("blob:")) URL.revokeObjectURL(de.split("#")[0]);
  delete v.dataset.aceso;
}

/* DESENHA UMA PEÇA numa caixa 9 por 16. É o mesmo cálculo do editor e o mesmo que o
   `oficina.py` faz na hora de gravar: o tamanho da letra é fração da ALTURA da peça, e é
   `container-type:size` no CSS que faz `cqh` significar isso aqui. */
async function pintaPeca(alvo, peca, indice, interativa, escolhido) {
  if (!TPL) return;
  const sel = escolhido === undefined ? null : escolhido;
  alvo.style.background = TPL.fundoCor || "#000000";
  alvo.querySelectorAll("video").forEach(apagarPeca);
  alvo.innerHTML = "";
  /* A JANELA DO B-ROLL E O VIDEO SAO DOIS ELEMENTOS, e nao um.

     ERAM UM SO' ATE' 23/08/2026, com o recorte e a mascara no proprio video. Isso
     impedia o reenquadramento por construcao: mover o video moveria junto o buraco por
     onde ele aparece, e o efeito na tela seria nenhum. Agora a caixa segura a janela,
     que nao sai do lugar, e o video anda por dentro dela. */
  const caixa = document.createElement("div");
  caixa.className = "gal-broll";
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.loop = true; v.preload = "metadata";
  v.dataset.arq = indice;
  caixa.appendChild(v);
  /* A FILMAGEM APARECE SO' ONDE ELA VAI APARECER DE VERDADE.

     A GALERIA MOSTRAVA O VIDEO OCUPANDO O QUADRO INTEIRO, e a peca montada nao e' assim:
     na montagem o template cobre tudo e abre um buraco no formato da filmagem, que ocupa
     so' um retangulo. Quem olhava aqui via um enquadramento que nao existe, e por isso
     nao dava para perceber que o texto ia cair em cima dela: aqui ela estava embaixo do
     texto de qualquer jeito.

     `clip-path` RECORTA A EXIBICAO e nao mexe no arquivo. O video continua escalado para
     o quadro inteiro, que e' exatamente o que o `ffmpeg` faz na montagem. */
  /* O RECORTE FICA NO RETÂNGULO DE ORIGEM, que é o mesmo que a máscara desenha. Se ele
     for cortado num lugar e a máscara ficar em outro, o que aparece é só a interseção
     dos dois. A mudança de lugar entra logo abaixo, no `transform`. */
  const b = BROLL_DE && BROLL_DE.get(peca.nome);
  // O FURO DA ARTE MANDA, QUANDO EXISTE. Ver a nota em `lugarDaFilmagem`.
  const lugar = lugarDaFilmagem(peca.nome);
  if (lugar) {
    recortarNaJanela(caixa, lugar.jan, lugar, b);
    porFilmagemNoLugar(v, lugar);
  } else if (b) {
    const dir = Math.max(0, 1 - b.x - b.w) * 100;
    const bai = Math.max(0, 1 - b.y - b.h) * 100;
    caixa.style.clipPath = `inset(${b.y * 100}% ${dir}% ${bai}% ${b.x * 100}%)`;
    // CRESCER A PARTIR DO CENTRO DA JANELA, e nao do centro da peca: sem esta linha a
    // janela saltaria para outro lugar ao mudar de tamanho.
    caixa.style.transformOrigin = `${(b.x + b.w / 2) * 100}% ${(b.y + b.h / 2) * 100}%`;
    caixa.style.transform = transformDaJanela(enquadreDe(peca.nome));
    v.style.transform = transformDo(enquadreDe(peca.nome));
  }
  alvo.appendChild(caixa);
  /* A MARCA DO RECORTE, e ela existe por um motivo bem concreto.

     ELE DISSE QUE NAO CONSEGUIA CLICAR NA FILMAGEM. Conseguia: medido, o clique
     selecionava e a classe entrava. O que nao acontecia era ele VER que selecionou.

     A CAIXA DA FILMAGEM E' O QUADRO INTEIRO (648 pixels de 650 medidos), e o que a faz
     aparecer so' na janela e' o `clip-path`. Acontece que `clip-path` corta TUDO, e o
     contorno de selecao e' desenhado na borda do elemento, isto e', na borda do quadro
     inteiro: cem por cento dele caia fora do recorte e sumia. Selecao sem sinal na tela
     e' selecao que nao existe para quem esta' olhando.

     ENTAO A MARCA E' OUTRO ELEMENTO, irmao e nao filho, posto exatamente sobre a janela
     e sem recorte nenhum. Ela nao recebe clique: quem recebe continua sendo a caixa. */
  const jm = lugar ? lugar.jan : (b ? (janelaDe(peca.nome) || b) : null);
  if (jm) {
    const j = jm;   // com furo de arte e' o furo; sem ele, a janela que ele moveu
    const marca = document.createElement("div");
    marca.className = "gal-broll-marca";
    marca.style.left = (j.x * 100) + "%";
    marca.style.top = (j.y * 100) + "%";
    marca.style.width = (j.w * 100) + "%";
    marca.style.height = (j.h * 100) + "%";
    alvo.appendChild(marca);
  }
  /* A MOLDURA DA PECA, e ela faltava.

     A PREVIA MOSTRAVA A FILMAGEM SOBRE PRETO, e o Gabriel leu o que estava la': "so' me
     move para a proxima etapa, que e' previa de resultado, mas nao tem previa nenhuma".
     Eram 180 retangulos pretos, porque a arte nunca foi desenhada aqui: no desenho
     antigo o quadro era a cor de fundo mais as caixas de texto, e a moldura so' aparecia
     no arquivo montado.

     A ORDEM E' A DA PECA MONTADA: filmagem embaixo, arte por cima dela (com o furo dela,
     que e' por onde a filmagem aparece) e a frase por cima de tudo. `pointer-events` fica
     desligado para o clique continuar chegando na filmagem, que e' quem se arrasta. */
  const varDaPeca = variacaoDaPeca(peca.nome);
  const arteDaPeca = varDaPeca ? varDaPeca.arquivo : (TPL.fundoImagem || null);
  if (arteDaPeca) {
    /* A PECA NAO ESPERA A ARTE DESCER. Esperar aqui, com `await`, parava a pintura no
       meio: a filmagem e a janela entravam, e a frase (que vem depois) so' aparecia
       quando o endereco chegasse da rede. Na revisao isso se via, medido em 29/08/2026:
       a peca abria com a moldura e SEM O TEXTO. O quadro entra vazio na ordem certa e
       se pinta sozinho quando o endereco chega. */
    const im = document.createElement("img");
    im.className = "gal-arte";
    im.alt = "";
    alvo.appendChild(im);
    enderecoDo(arteDaPeca).then(u => { if (u) im.src = u; }).catch(() => {});
  }

  /* A MOLDURA DAS ALCAS, uma so' para tudo o que se pode redimensionar.

     ELA E' ELEMENTO SEPARADO DE PROPOSITO. Pendurar as alcas dentro da caixa de texto
     nao funciona: o texto e' escrito com `textContent`, que apaga os filhos, e cada
     tecla digitada varreria as alcas embora. Aqui elas ficam por cima, medidas a partir
     do que estiver escolhido, seja texto, imagem ou a janela do B-roll. */
  if (interativa) {
    const moldura = document.createElement("div");
    moldura.className = "aj-moldura";
    moldura.hidden = true;
    for (const canto of ["nw", "ne", "sw", "se"]) {
      const i = document.createElement("i");
      i.dataset.canto = canto;
      moldura.appendChild(i);
    }
    alvo.appendChild(moldura);
  }

  for (const el of elementosDaPeca(peca.nome)) {
    const m = medidaDaPeca(el, peca.nome);
    const d = document.createElement("div");
    d.className = "gal-el" + (interativa && el.id === sel ? " sel" : "");
    d.dataset.id = el.id;
    d.style.left = (m.x * 100) + "%";
    d.style.top = (m.y * 100) + "%";
    d.style.width = (el.w * 100) + "%";
    if (el.tipo === "texto") {
      d.style.color = el.cor;
      d.style.fontFamily = fonteCss(m.fonte);
      d.style.fontWeight = el.peso;
      d.style.textAlign = alinhamentoCss(m.alinha);
      d.style.fontSize = (m.tamanho * 100) + "cqh";
      d.textContent = textoDaPeca(el, peca.nome) || " ";
    } else {
      d.style.height = (el.h * 100) + "%";
      const u = await enderecoDo(el.arquivo);
      if (u) { const i = document.createElement("img"); i.src = u; d.appendChild(i); }
    }
    alvo.appendChild(d);
  }
  return v;
}

/** Abre o vídeo do disco e veste a máscara. Só quando a peça entra na tela. */
async function acenderPeca(v) {
  if (v.dataset.aceso) return;
  v.dataset.aceso = "1";
  const p = pecas3()[Number(v.dataset.arq)];
  if (!p) return;
  try {
    v.src = await urlDaMidia(p, pastaDasPecas3()) + "#t=1.5";
    /* COM FURO DE ARTE NAO HA' MASCARA A VESTIR, e e' o que o motor faz.

       A MASCARA DO PASSO 2 E' O FORMATO DO CARD DO REEL BAIXADO, no lugar em que ele
       estava la'. O furo da arte e' outro formato em outro lugar. Vestir os dois
       deixava na tela a INTERSECAO deles, que nao e' nem um nem outro: e' de onde saiam
       as linhas cortando a peca. O `camada_da_peca` do motor ja' pula a mascara quando a
       arte tem furo proprio, e agora a tela pula pelo mesmo motivo. */
    if (!janelaDaArte(p.nome)) {
      // A MASCARA VESTE A CAIXA, e nao o video: e' a janela que tem forma, e ela fica
      // parada enquanto a filmagem se reenquadra por dentro.
      vestirMascara(v.parentElement || v, await mascaraDe(p.nome));
    }
  } catch (e) { /* o arquivo saiu da pasta desde a leitura */ }
}

/* A CONTA DA LEVA ANTES DE FABRICAR, e nada mais desenhado.

   AS PREVIAS SAIRAM EM 29/08/2026, por ordem dele: "remova todas as previas e deixe so'
   o botao de fabricar". Desenhar 180 pecas custava a memoria da aba (ele ja' tinha dito
   que o PC dele nao aguenta) e nao decidia nada que a Revisao Peca A Peca nao decida
   melhor, uma de cada vez. O que fica aqui e' a CONTA: quantas escritas, quantas
   ajustadas, quantas ele deu por prontas. */
async function desenhaGaleria() {
  const pecas = pecas3();
  const campos = abertas();
  let escritas = 0, aMao = 0, encolhidas = 0, prontas = 0;
  for (const p of pecas) {
    const t = ESCRITO.get(p.nome) || {};
    if (campos.length && campos.every(c => (t[c.id] || "").trim())) escritas++;
    // QUEM MEXEU: ele ou o programa. Ver a nota em `A_MAO`.
    if (A_MAO.has(p.nome)) aMao++;
    else if (AJUSTES.has(p.nome) || ENQUADRES.has(p.nome)) encolhidas++;
    if (PRONTAS.has(p.nome)) prontas++;
  }
  $("gal_conta").innerHTML = `<b>${pecas.length}</b> `
    + (pecas.length === 1 ? "peça" : "peças")
    + (campos.length ? `, <b>${escritas}</b> com texto da IA` : "")
    + (encolhidas ? `, <b>${encolhidas}</b> com o texto ajustado para caber` : "")
    + (aMao ? `, <b>${aMao}</b> ajustadas por você` : "")
    + (prontas ? `, <b>${prontas}</b> que você já deu por prontas` : "") + ".";

  resumoDeAplicar();
}

/* ------------------------------------------------ o acerto de cabimento, em bloco

   TÍTULO LONGO NÃO CABE ONDE O CURTO CABIA. A IA escreve com um limite de caracteres, mas
   limite não é largura: uma palavra comprida estoura a caixa mesmo dentro do limite. Aqui
   a letra encolhe até o texto caber em três linhas, peça por peça, e o que está travado
   não é tocado. */
/* ============================================== 3.5 · A PEÇA A PEÇA, UMA DE CADA VEZ

   POR QUE ESTA FASE EXISTE. Ele pediu em 23/08/2026, e disse as duas razões na mesma
   frase: "faria um por um com a tela dedicada" porque quer trabalhar a peça, e "não deve
   aparecer todos de uma vez... o meu PC não tem memória RAM" porque a grade travava a aba.

   A DIFERENÇA PARA A LUPA DA OLHADA GERAL não é de tamanho, é de alcance. Na lupa dava
   para mover e encolher o que já estava escrito. Aqui dá para trocar o texto na mão,
   trocar a fonte, e reenquadrar a filmagem, que eram justamente as três coisas que antes
   obrigavam a descartar a peça e seguir.

   UM VÍDEO VIVO POR VEZ, e é a regra desta fase inteira. Todo caminho que troca de peça
   passa por `desenhaAjuste`, e ele fecha o anterior antes de abrir o próximo. */

let AJ_VEZ = 0;                   // guarda contra ele pular de peça antes de a atual abrir

/* AS MOLDURAS DESCEM ANTES DE ELE CHEGAR NA PRIMEIRA PECA.

   ELE CRONOMETROU: "nem sequer o template de fato apareceu... ele veio aparecer agora,
   depois de quanto tempo". Sao quatro arquivos de 95 kB no acervo dele, entao a espera
   nunca foi o tamanho: era a ORDEM. A moldura so' era pedida no meio do desenho da
   peca, junto com o video daquela peca, e ficava atras dele na fila do navegador.

   PEDIR TODAS DE UMA VEZ AO ENTRAR conserta pelo lado certo: sao poucas, se repetem de
   peca em peca e `enderecoDo` ja' guarda o endereco depois da primeira. Medido na casa
   do Estudio: 1,4 s na primeira peca com a memoria da aba vazia, 104 ms nas seguintes. */
function descerAsMolduras() {
  if (!TPL || !TPL.contaModelo) return;
  // SEM `await`: quem espera e' a peca, e ela ja' sabe se pintar quando o endereco chega.
  for (const v of variacoesDaConta(TPL.contaModelo)) enderecoDo(v.arquivo);
}

/* ===================== O EDITOR DA REVISAO (29/08/2026) =========================

   POR QUE ELE EXISTE. Cinco pedidos seguidos de ajuste na revisao nao saiam do lugar,
   e ele foi direto: "eu quero que seja um layout exatamente como o Canva, onde o nivel
   de edicao e' o nivel de edicao do Canva". O desenho antigo era feito de retangulos
   posicionados na pagina com quatro alcas de canto penduradas por fora; ele mesmo
   comparou com o Paint. Medido no arquivo: 12.029 linhas de tela e 24 pontos que
   respondem a mouse ou toque na tela inteira.

   O QUE MUDA. A peca passa a ser desenhada numa TELA DE PINTURA, com a Fabric por
   baixo: cada parte da peca vira um objeto de verdade, com alca em todo canto e em
   todo lado, selecao pelo clique, escrita no proprio lugar e camadas. O gesto ganha o
   acabamento que a biblioteca ja' traz, em vez de ser remendado a mao.

   O QUE NAO MUDA, E ISSO E' O IMPORTANTE. Quem GRAVA continua sendo `mexerEnquadre` e
   `mexerItem`, exatamente como antes: o editor traduz o gesto para os mesmos `z`, `dx`,
   `dy`, `x`, `y` e `tamanho` que o motor ja' entende, e nao inventa um segundo cofre.
   As contas do encaixe continuam vindo de `encaixeNaJanela`, que e' a mesma do
   `encaixe_na_janela` do oficina.py. A licao da trava 60 continua de pe': mexeu numa,
   mexe na outra.

   E RASCUNHO SEM FURO DE ARTE NAO ENTRA AQUI. Sem furo, a peca veste a mascara do
   passo 2, que e' um recorte de imagem do navegador e nao existe em tela de pintura.
   Esse caminho segue no desenho antigo (`pintaPeca`), que e' o mesmo `else` que o
   motor tem. */

let EDT = null;                   // { tela, filmagem, moldura, frase, marca, nome }
let EDT_ALVO = null;              // qual objeto esta' escolhido, por nome de camada
const EDT_ENTRELINHA = 1.22;      // a mesma que o motor usa em `pintar_camadas`

/** Fecha a tela de pintura e devolve o vídeo, se houver um aberto. */
function fecharOEditor() {
  if (!EDT) return;
  try { EDT.tela.dispose(); } catch (e) { /* a aba esta' fechando */ }
  EDT = null;
  EDT_ALVO = null;
}

/** O tamanho da letra em fração da ALTURA da peça, que é a régua do motor. */
function corpoDaFrase(el, nome) { return medidaDaPeca(el, nome).tamanho; }

/* DESENHA A PECA NA TELA DE PINTURA. A ordem e' a da peca montada: filmagem embaixo,
   moldura por cima com o furo dela, e a frase por cima de tudo. */
async function abrirOEditor(alvo, peca, indice) {
  fecharOEditor();
  alvo.querySelectorAll("video").forEach(apagarPeca);
  alvo.innerHTML = "";
  /* PALCO SEM MEDIDA E' FASE QUE AINDA NAO APARECEU, e nao peca sem desenho.

     A tela de pintura precisa do tamanho em pixels, e o navegador so' sabe dize-lo
     depois de a fase estar visivel. Desistir aqui deixaria a peca sem existir: foi o
     que a prova do texto na mao pegou, porque ela mexe na revisao sem abrir a fase, e
     a peca simplesmente nao era desenhada.

     ENTAO O PALCO NASCE NA MEDIDA DE REFERENCIA, que e' a mesma do CSS (altura de 700
     e a largura saindo da proporcao do quadro). Quando ele entra na fase de verdade,
     `entrarNoAjuste` redesenha com a medida real, e como tudo aqui e' fracao do quadro
     o desenho e' o mesmo em qualquer tamanho. */
  const A = alvo.clientHeight || 700;
  const L = alvo.clientWidth || Math.round(A * 9 / 16);

  const lona = document.createElement("canvas");
  alvo.appendChild(lona);
  const tela = new fabric.Canvas(lona, {
    width: L, height: A, backgroundColor: "#000000",
    preserveObjectStacking: true, selection: false, uniformScaling: true
  });

  /* O VIDEO CONTINUA SENDO UM ELEMENTO DA PAGINA, e nao um desenho solto: e' ele que
     `acenderPeca` abre, que `apagarPeca` fecha e devolve a memoria, e que o resto da
     tela ja' sabe cuidar. A tela de pintura so' o COPIA quadro a quadro. */
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.loop = true; v.preload = "metadata";
  v.dataset.arq = indice;
  /* O VIDEO NAO PODE SER `display:none`, e isto custou uma sonda em 29/08/2026:
     elemento escondido assim para de decodificar quadro, e a tela de pintura passa
     a copiar preto. Ele fica de um pixel, invisivel e fora do caminho do dedo, mas
     VIVO. Medido na proposta publicada: com `display:none` o pixel do meio da peca
     dava zero em todo canal, com o video inteiro carregado do lado. */
  v.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;"
    + "opacity:.01;pointer-events:none";
  alvo.appendChild(v);
  await acenderPeca(v);

  /* A PECA NAO ESPERA A FILMAGEM DESCER, e essa e' a mesma licao da moldura em
     `pintaPeca`: esperar aqui parava o desenho no meio, e a peca so' aparecia quando o
     arquivo chegasse da rede. Medido na bancada com o video dando 404: o editor ficava
     tres segundos sem existir, e quem olhasse veria o quadro preto sem moldura nem
     frase, que e' o que ele chama de bugado.

     O QUADRO ENTRA VAZIO NA ORDEM CERTA e se preenche quando o video abre. As medidas
     de origem comecam no tamanho do quadro da peca (1080 por 1920), que e' o de todo
     recorte desta casa, e sao corrigidas na hora em que o arquivo diz as dele. */
  /* O ELEMENTO PRECISA DIZER O TAMANHO DELE, e este foi o defeito irmao do de
     cima: a tela de pintura desenha a partir do `width` e do `height` DO
     ELEMENTO, e video sem esses atributos traz zero nos dois. Desenhar com
     largura zero nao da' erro nenhum, da' PRETO, que e' o pior tipo de defeito
     para achar: tudo o mais na peca continua certo. */
  medirOElemento(v);
  /* O RECORTE DA FILMAGEM, e ele é a mesma regra do `recortarNaJanela` do desenho
     antigo: a filmagem só aparece dentro do furo E dentro do retângulo do B-roll. Sem
     ele, com o encaixe de caber, entrariam nas beiradas o canto arredondado e a barra
     do aplicativo que vêm gravados no reel. O retângulo é reposto a cada `porNoLugar`. */
  const recorte = new fabric.Rect({
    originX: "left", originY: "top", absolutePositioned: true,
    left: 0, top: 0, width: L, height: A
  });
  const filmagem = new fabric.FabricImage(v, {
    objectCaching: false, originX: "left", originY: "top",
    width: v.width, height: v.height,
    lockRotation: true, hasRotatingPoint: false,
    /* AS ALÇAS DE FÁBRICA FICAM DESLIGADAS. Elas nascem nos cantos da FILMAGEM, e a
       filmagem é maior que o palco: os quatro cantos caem fora da tela, e não havia
       como pegar nenhum. Foi isso que ele encontrou como "não consigo diminuir, ele
       fica prendendo". Quem redimensiona agora são os punhos do B-roll, que ficam
       sempre dentro do furo; arrastar continua sendo no corpo da imagem. */
    hasControls: false, clipPath: recorte
  });
  filmagem.nome = "Filmagem";
  filmagem.larNat = v.width;
  filmagem.altNat = v.height;
  tela.add(filmagem);
  if (v.readyState < 2) {
    v.addEventListener("loadeddata", () => {
      // OUTRA PECA JA' ABRIU ENQUANTO ESTA DESCIA: mexer aqui pintaria por cima dela.
      if (!EDT || EDT.video !== v) return;
      medirOElemento(v);
      filmagem.larNat = v.width;
      filmagem.altNat = v.height;
      filmagem.set({ width: v.width, height: v.height });
      editorPorNoLugar();
      v.play().catch(() => {});
    }, { once: true });
  } else v.play().catch(() => {});

  /* A MOLDURA TAMBEM NAO SEGURA A PECA. Ela desce por tras e se poe no lugar dela
     quando chega: entre a filmagem e a frase, que e' a ordem da peca montada. Esperar
     por ela aqui deixaria a revisao sem texto ate' a rede responder, que e' o defeito
     que `pintaPeca` ja' tinha consertado em 29/08/2026. */
  const varDaPeca = variacaoDaPeca(peca.nome);
  const arteDaPeca = varDaPeca ? varDaPeca.arquivo : (TPL.fundoImagem || null);
  let moldura = null;
  if (arteDaPeca) {
    enderecoDo(arteDaPeca).then(u => {
      if (!u) return;
      const i = new Image();
      i.onload = () => {
        if (!EDT || EDT.tela !== tela) return;   // outra peca abriu no meio do caminho
        moldura = new fabric.FabricImage(i, {
          left: 0, top: 0, selectable: false, evented: false,
          scaleX: L / (i.naturalWidth || 1080), scaleY: A / (i.naturalHeight || 1920)
        });
        moldura.nome = "Moldura";
        EDT.moldura = moldura;
        // O LUGAR E' LOGO ACIMA DA FILMAGEM, e nao o fim da pilha: por cima de tudo ela
        // taparia a frase, que na peca montada fica em cima da arte.
        tela.insertAt(tela.getObjects().indexOf(filmagem) + 1, moldura);
        tela.requestRenderAll();
        desenhaAsCamadas();
      };
      i.src = u;
    }).catch(() => {});
  }

  /* A MARCA DO B-ROLL, e ela e' a mesma ideia da marca do desenho antigo: mostrar ONDE
     a filmagem esta' de verdade, inclusive o pedaco que fica fora do furo. Sem ela o
     que se perde no encaixe e' invisivel, e foi o que ele nao conseguia ver. */
  const marca = new fabric.Rect({
    fill: "transparent", stroke: "#3F7D53", strokeWidth: 2, strokeDashArray: [7, 5],
    strokeUniform: true, selectable: false, evented: false, visible: false
  });
  tela.add(marca);

  const campos = elementosDaPeca(peca.nome).filter(e => e.tipo === "texto");
  const campo = campos[0] || null;
  let frase = null;
  if (campo) {
    const m = medidaDaPeca(campo, peca.nome);
    frase = new fabric.Textbox(textoDaPeca(campo, peca.nome) || " ", {
      left: m.x * L, top: m.y * A, width: campo.w * L,
      fontFamily: fonteCss(m.fonte).split(",")[0].replace(/["']/g, ""),
      fontSize: m.tamanho * A, fill: campo.cor || "#FFFFFF",
      fontWeight: campo.peso || 700, lineHeight: EDT_ENTRELINHA,
      textAlign: alinhamentoCss(m.alinha),
      lockRotation: true, hasRotatingPoint: false, editable: true
    });
    frase.nome = "Frase";
    frase.campo = campo;
    tela.add(frase);
  }

  EDT = { tela, filmagem, moldura, frase, marca, recorte,
          video: v, nome: peca.nome, L, A };
  editorAlcas(filmagem);
  if (frase) editorAlcas(frase);

  /* A FICHA E' GUARDADA ANTES DO GESTO, e nao depois: o caminho de volta precisa do
     estado anterior, e depois de arrastar ele ja' se foi. `before:transform` dispara
     uma vez por gesto, no primeiro toque, e nao a cada movimento do dedo. */
  tela.on("before:transform", guardarOGesto);
  tela.on("object:modified", () => { editorGuardaGesto(); editorMede(); });
  tela.on("object:moving", editorMede);
  tela.on("object:scaling", editorMede);
  tela.on("selection:created", () => editorEscolhido(tela.getActiveObject()));
  tela.on("selection:updated", () => editorEscolhido(tela.getActiveObject()));
  tela.on("selection:cleared", () => editorEscolhido(null));
  if (frase) frase.on("changed", () => {
    if (!EDT || !EDT.frase) return;
    escreverAMao(peca, campo, EDT.frase.text);
    const t = $("ajt_" + campo.id);
    if (t && document.activeElement !== t) t.value = EDT.frase.text;
  });

  editorPorNoLugar();
  editorGirar(++EDT_GERACAO);
  return v;
}

/* O TAMANHO DO ELEMENTO DE VIDEO, escrito nos atributos que a tela de pintura le'.

   `videoWidth` E `width` SAO COISAS DIFERENTES: o primeiro e' o que o arquivo tem, e
   so' existe depois de o video abrir; o segundo e' o atributo do elemento, e nasce
   ZERO. Quem desenha le' o segundo. Enquanto o arquivo nao abriu, vale o quadro desta
   casa (1080 por 1920), que e' o de todo recorte daqui. */
function medirOElemento(v) {
  v.width = v.videoWidth || 1080;
  v.height = v.videoHeight || 1920;
}

/** As alças no padrão da casa: brasa da paleta, redondas, com contorno claro. */
function editorAlcas(o) {
  o.set({ borderColor: "#3F7D53", cornerColor: "#3F7D53", cornerStrokeColor: "#FFFFFF",
          cornerSize: 11, transparentCorners: false, cornerStyle: "circle",
          borderScaleFactor: 1.6, padding: 0 });
}

/* O LACO QUE FAZ A FILMAGEM ANDAR. Tela de pintura nao tem video: ela tem o quadro que
   estava la' na hora em que se pediu para desenhar. Sem este laco a peca fica no
   primeiro quadro e parece travada, que e' o que ele chama de bugado.

   A GERACAO MATA O LACO ANTIGO, e ela e' a mesma ideia do `MP_GERACAO` da fase 1:
   trocar de peca fecha um editor e abre outro, e sem a marca os dois lacos ficariam
   girando ao mesmo tempo, cada um pedindo um quadro por vez na maquina que ele ja'
   disse ser curta de memoria. */
let EDT_GERACAO = 0;

function editorGirar(geracao) {
  if (!EDT || geracao !== EDT_GERACAO) return;
  if (EDT.video && !EDT.video.paused) EDT.tela.requestRenderAll();
  fabric.util.requestAnimFrame(() => editorGirar(geracao));
}

/* PÕE A FILMAGEM E A FRASE ONDE A FICHA DIZ, sem remontar nada.

   E' O CAMINHO DE VOLTA da ficha para o desenho, e ele existe para os dois lados nunca
   discordarem: quem mexe nos botoes do painel, quem troca a moldura e quem desfaz caem
   todos aqui, em vez de cada um mexer no desenho do seu jeito. */
function editorPorNoLugar() {
  if (!EDT) return;
  const { filmagem, frase, marca, recorte, L, A, nome } = EDT;
  const lugar = lugarDaFilmagem(nome);
  if (lugar && filmagem) {
    filmagem.set({ left: lugar.x * L, top: lugar.y * A });
    filmagem.scaleX = lugar.k * L / filmagem.larNat;
    filmagem.scaleY = lugar.k * A / filmagem.altNat;
    filmagem.setCoords();
    // O RECORTE É O FURO **E** O B-ROLL. Ver a nota em `recortarNaJanela`.
    if (recorte) {
      const b = (BROLL_DE && BROLL_DE.get(nome)) || { x: 0, y: 0, w: 1, h: 1 };
      const j = lugar.jan, r = RESPIRO_DO_FURO;
      const fx = (j.x - r) * L, fy = (j.y - r) * A;
      const fd = (j.x + j.w + r) * L, ff = (j.y + j.h + r) * A;
      const bx = (lugar.x + lugar.k * b.x) * L, by = (lugar.y + lugar.k * b.y) * A;
      const bd = bx + lugar.k * b.w * L, bf = by + lugar.k * b.h * A;
      const ex = Math.max(fx, bx), ey = Math.max(fy, by);
      recorte.set({ left: ex, top: ey,
                    width: Math.max(0, Math.min(fd, bd) - ex),
                    height: Math.max(0, Math.min(ff, bf) - ey) });
      recorte.setCoords();
    }
  }
  if (frase && frase.campo) {
    const m = medidaDaPeca(frase.campo, nome);
    frase.set({ left: m.x * L, top: m.y * A, fontSize: m.tamanho * A,
                scaleX: 1, scaleY: 1, width: frase.campo.w * L,
                fontFamily: fonteCss(m.fonte).split(",")[0].replace(/["']/g, "") });
    frase.setCoords();
  }
  editorMede();
  EDT.tela.requestRenderAll();
}

/* QUANTO DO B-ROLL SOBREVIVE, medido no desenho que esta' na tela.

   E' MEDIDO E NAO ESTIMADO (trava 2): a conta sai da posicao real do objeto, entao ela
   anda junto com o dedo dele enquanto arrasta. O numero do lado e' o que a outra folga
   daria, no encaixe limpo, para ele nao precisar ligar e desligar para comparar. */
function editorMede() {
  if (!EDT) return;
  const { filmagem, marca, L, A, nome } = EDT;
  const b = BROLL_DE && BROLL_DE.get(nome);
  const jan = janelaDaArte(nome);
  if (!b || !jan || !filmagem) return;
  const lar = filmagem.getScaledWidth(), alt = filmagem.getScaledHeight();
  const bx = filmagem.left + lar * b.x, by = filmagem.top + alt * b.y;
  const bl = lar * b.w, ba = alt * b.h;
  const jx = jan.x * L, jy = jan.y * A, jl = jan.w * L, ja = jan.h * A;
  const ix = Math.max(0, Math.min(bx + bl, jx + jl) - Math.max(bx, jx));
  const iy = Math.max(0, Math.min(by + ba, jy + ja) - Math.max(by, jy));
  const pct = (bl > 0 && ba > 0) ? Math.round(100 * (ix * iy) / (bl * ba)) : 0;
  const caixa = $("aj_med");
  if (caixa) {
    $("aj_med_n").textContent = pct + "%";
    caixa.className = "aj-medida " + (pct >= 88 ? "bom" : pct >= 70 ? "" : "ruim");
  }
  /* A SEGUNDA MEDIDA E' O PRECO DO ENCAIXE, e nao mais o que a outra folga daria.

     O QUE FALTAVA ERA JUSTAMENTE O PRECO: mostrar inteiro nao corta nada, e a pergunta
     que sobra e' quanto do furo fica com o fundo da arte. Sem esse numero do lado, a
     escolha do encaixe seria as cegas. */
  const vazio = vazioNoFuroDaPeca(nome);
  const c2 = $("aj_med2");
  if (c2 && vazio != null) {
    $("aj_med2_n").textContent = vazio + "%";
    $("aj_med2_r").textContent = "Do Furo Com O Fundo";
    c2.className = "aj-medida " + (vazio > 25 ? "ruim" : "");
  }
  porOsPunhosNoLugar();
  /* A MARCA APARECE COM A FILMAGEM ESCOLHIDA, e some quando ele solta.

     ELA E' O UNICO JEITO DE VER O QUE SE PERDE. O que cai fora do furo simplesmente
     nao e' desenhado, entao o corte e' invisivel: ele via a peca bonita e o B-roll
     cortado pela metade, sem nada na tela explicando de onde vinha o corte. Deixa-la
     acesa o tempo todo poria um tracejado por cima de toda peca, inclusive na hora de
     julgar a arte, que e' quando ele quer ver a peca limpa. */
  if (marca) {
    marca.set({ left: bx, top: by, width: bl, height: ba, scaleX: 1, scaleY: 1,
                visible: EDT.tela.getActiveObject() === filmagem });
    marca.setCoords();
  }
}

/* Quanto do B-roll sobra no encaixe LIMPO, com a folga que se pedir.

   O ENCAIXE CENTRALIZA OS DOIS RETANGULOS, entao a sobra de cada lado e' o menor dos
   dois. Esta conta nao olha o desenho: ela responde "e se", que e' a pergunta que o
   numero do lado faz. */
function aproveitamentoLimpo(nome, folga, encaixe) {
  const b = BROLL_DE && BROLL_DE.get(nome);
  const jan = janelaDaArte(nome);
  if (!b || !jan || !b.w || !b.h) return null;
  const e = enquadreDe(nome);
  const k = kencDoEncaixe(b, jan, folga, encaixe || e.encaixe) * e.z;
  const bl = k * b.w, ba = k * b.h;
  return Math.round(100 * (Math.min(bl, jan.w) / bl) * (Math.min(ba, jan.h) / ba));
}

/* QUANTO DO FURO ESTA' SEM FILMAGEM AGORA, medido no desenho que está na tela.

   E' O IRMAO DO `aproveitamentoLimpo`: um diz quanto do B-roll sobrou, o outro quanto
   do furo ficou vazio. Os dois juntos são a peça inteira contada dos dois lados. */
function vazioNoFuroDaPeca(nome) {
  const jan = janelaDaArte(nome);
  const lugar = lugarDaFilmagem(nome);
  const b = BROLL_DE && BROLL_DE.get(nome);
  if (!jan || !lugar || !b || !b.w || !b.h) return null;
  // O QUE APARECE NO FURO E' SO' O B-ROLL: fora dele o recorte não deixa passar.
  const bx = lugar.x + lugar.k * b.x, by = lugar.y + lugar.k * b.y;
  const bl = lugar.k * b.w, ba = lugar.k * b.h;
  const ix = Math.max(0, Math.min(bx + bl, jan.x + jan.w) - Math.max(bx, jan.x));
  const iy = Math.max(0, Math.min(by + ba, jan.y + jan.h) - Math.max(by, jan.y));
  return Math.max(0, Math.round(100 * (1 - (ix * iy) / (jan.w * jan.h))));
}

/* QUANTO DO FURO FICA COM O FUNDO DA ARTE, no encaixe de caber. É o preço da regra
   nova, e é ele que a tela mostra ao lado do ganho: sem o preço na frente, trocar o
   encaixe seria uma escolha às cegas. */
function sobraDoFuro(nome) {
  const b = BROLL_DE && BROLL_DE.get(nome);
  const jan = janelaDaArte(nome);
  if (!b || !jan || !b.w || !b.h) return null;
  const k = Math.min(jan.w / b.w, jan.h / b.h);
  return Math.max(0, Math.round(100 * (1 - (k * b.w * k * b.h) / (jan.w * jan.h))));
}

/* O GESTO VIRA FICHA. Traduz o que ele fez na tela de pintura para os mesmos numeros
   que o motor le', e grava pelo caminho de sempre.

   A CONTA E' A INVERSA DO `encaixeNaJanela`, e tem de ser: se ela divergir, a peca sai
   diferente da que ele aprovou. Da ida: k = kenc vezes z, e o canto e' o centro do furo
   menos o centro do B-roll crescido, mais o deslize na regua do encaixe. */
function editorGuardaGesto() {
  if (!EDT) return;
  const { filmagem, frase, L, A, nome } = EDT;
  const alvo = EDT.tela.getActiveObject();
  if (alvo === filmagem) {
    const b = BROLL_DE && BROLL_DE.get(nome);
    const jan = janelaDaArte(nome);
    if (!b || !jan) return;
    const e = enquadreDe(nome);
    const kenc = kencDoEncaixe(b, jan, e.folga, e.encaixe);
    /* AS TRES MEDIDAS SE LEEM DE UMA VEZ, ANTES DE GRAVAR QUALQUER UMA.

       O DEFEITO QUE ISTO CONSERTA, e ele custou uma sonda inteira: `mexerEnquadre`
       redesenha a peca a partir da ficha, entao a PRIMEIRA gravacao ja' devolvia a
       filmagem para o encaixe limpo. As duas leituras seguintes viam a posicao
       reposta, e nao a que o dedo dele tinha deixado: o arrasto media zero e a ficha
       era apagada por "nada mudou". Na tela o gesto simplesmente voltava sozinho. */
    const k = filmagem.getScaledWidth() / L;
    const esq = filmagem.left / L, alto = filmagem.top / A;
    const z = Math.max(Z_MINIMO, Math.min(4, k / kenc));
    const kz = kenc * z;
    const dx = (esq - jan.x - jan.w / 2 + kz * (b.x + b.w / 2)) / kenc;
    const dy = (alto - jan.y - jan.h / 2 + kz * (b.y + b.h / 2)) / kenc;
    // A APROXIMACAO ENTRA PRIMEIRO: o deslize se prende na regua dela, e gravar o
    // deslize com o `z` velho poria a filmagem num lugar que o arquivo nao teria.
    mexerEnquadre(nome, "z", z, true);
    mexerEnquadre(nome, "dx", dx, true);
    mexerEnquadre(nome, "dy", dy);
    editorPorNoLugar();       // a ficha prende o gesto na sobra; o desenho obedece a ela
    desenhaAjustePainel();
    return;
  }
  if (alvo === frase && frase && frase.campo) {
    /* A ALCA DE CANTO MUDA A ESCALA, e a de lado muda a largura. O tamanho da peca e'
       fracao da ALTURA, entao a escala vertical e' quem manda na letra; devolver a
       escala para um depois de somar ela na letra deixa a caixa com a medida real. */
    const corpo = (frase.fontSize * (frase.scaleY || 1)) / A;
    const esq = frase.left / L, alto = frase.top / A;   // ver a nota da filmagem
    mexerItem(nome, frase.campo, "tamanho", corpo, true);
    mexerItem(nome, frase.campo, "x", esq, true);
    mexerItem(nome, frase.campo, "y", alto);
    editorPorNoLugar();
    desenhaAjustePainel();
  }
}

/* =============================== OS PUNHOS DO B-ROLL ==============================

   POR QUE ELES EXISTEM. Em 29/08/2026 ele tentou diminuir a filmagem e não conseguiu:
   "eu selecionei o vídeo, a gente fez todo esse trabalho pra que eu pudesse ajustar o
   B-roll, e cara, eu não consigo". A causa não era trava nenhuma: as alças da biblioteca
   nascem nos cantos da FILMAGEM, e a filmagem entra maior que o furo, então os quatro
   cantos caem fora da borda do palco. Alça invisível é alça que não existe.

   ESTES FICAM NOS CANTOS DO B-ROLL, que está sempre dentro do furo, e moram na página em
   vez da tela de pintura: continuam do tamanho do dedo mesmo com a peça pequena. */

/** O retângulo do B-roll na tela, em pixels do palco. */
function retanguloDoBroll() {
  if (!EDT || !EDT.filmagem) return null;
  const b = BROLL_DE && BROLL_DE.get(EDT.nome);
  if (!b || !b.w || !b.h) return null;
  const lar = EDT.filmagem.getScaledWidth(), alt = EDT.filmagem.getScaledHeight();
  return { x: EDT.filmagem.left + lar * b.x, y: EDT.filmagem.top + alt * b.y,
           w: lar * b.w, h: alt * b.h };
}

/** Põe os quatro punhos nos cantos do B-roll, e some quando ele não está escolhido. */
function porOsPunhosNoLugar() {
  const casa = $("aj_punhos");
  if (!casa) return;
  const ligado = !!(EDT && EDT.tela && EDT.tela.getActiveObject() === EDT.filmagem
                    && janelaDaArte(EDT.nome));
  casa.hidden = !ligado;
  if (!ligado) return;
  const r = retanguloDoBroll();
  if (!r) { casa.hidden = true; return; }
  const onde = { nw: [r.x, r.y], ne: [r.x + r.w, r.y],
                 se: [r.x + r.w, r.y + r.h], sw: [r.x, r.y + r.h] };
  for (const p of casa.children) {
    const [x, y] = onde[p.dataset.c] || [0, 0];
    p.style.left = x + "px";
    p.style.top = y + "px";
  }
}

/** Muda o tamanho da filmagem deixando um canto do B-roll parado. */
function escalarPeloPunho(z1, ax, ay, ladoX, ladoY) {
  if (!EDT) return;
  const nome = EDT.nome;
  const b = BROLL_DE && BROLL_DE.get(nome);
  const jan = janelaDaArte(nome);
  if (!b || !jan) return;
  const e = enquadreDe(nome);
  const kenc = kencDoEncaixe(b, jan, e.folga, e.encaixe);
  const z = Math.max(Z_MINIMO, Math.min(4, z1));
  // A CONTA E' A INVERSA DA IDA: o canto esquerdo do B-roll vale
  // `jcx - kenc*z*b.w/2 + kenc*dx`, então o deslize que segura a âncora sai daí.
  const dx = (ax / EDT.L - (jan.x + jan.w / 2)) / kenc + ladoX * z * b.w / 2;
  const dy = (ay / EDT.A - (jan.y + jan.h / 2)) / kenc + ladoY * z * b.h / 2;
  mexerEnquadre(nome, "z", z, true);
  mexerEnquadre(nome, "dx", dx, true);
  mexerEnquadre(nome, "dy", dy);
  desenhaAjustePainel();
}

/* O GESTO E' SEGUIDO NA JANELA, e não no próprio punho com captura de ponteiro: a
   captura falha calada quando o dedo sai do elemento ou quando o navegador entrega o
   gesto como mouse em vez de ponteiro. Ouvir na janela não depende de nada disso. */
(function ligarOsPunhos() {
  const casa = $("aj_punhos");
  if (!casa) return;
  let arr = null;
  const anda = ev => {
    if (!arr || !EDT) return;
    const r = $("aj_tela").getBoundingClientRect();
    const nova = Math.max(8, Math.abs(ev.clientX - r.left - arr.ax));
    escalarPeloPunho(arr.z0 * (nova / arr.l0), arr.ax, arr.ay, arr.lx, arr.ly);
  };
  const solta = () => {
    if (!arr) return;
    arr = null;
    window.removeEventListener("pointermove", anda);
    window.removeEventListener("mousemove", anda);
    anotarMexida();
  };
  casa.addEventListener("pointerdown", ev => {
    const p = ev.target.closest("[data-c]");
    if (!p || !EDT) return;
    const r = retanguloDoBroll();
    if (!r) return;
    // A ÂNCORA É O CANTO OPOSTO, e o lado diz de que lado dela o B-roll cresce.
    const a = { nw: [r.x + r.w, r.y + r.h, -1, -1], ne: [r.x, r.y + r.h, 1, -1],
                se: [r.x, r.y, 1, 1], sw: [r.x + r.w, r.y, -1, 1] }[p.dataset.c];
    arr = { ax: a[0], ay: a[1], lx: a[2], ly: a[3],
            l0: r.w, z0: enquadreDe(EDT.nome).z };
    guardarOGesto();
    window.addEventListener("pointermove", anda);
    window.addEventListener("mousemove", anda);
    window.addEventListener("pointerup", solta, { once: true });
    window.addEventListener("mouseup", solta, { once: true });
    window.addEventListener("pointercancel", solta, { once: true });
    ev.preventDefault();
  });
})();

/* A RODA DO MOUSE APROXIMA E AFASTA, no ponto onde o dedo está. É o gesto que todo
   editor tem, e sem ele o único caminho para o tamanho seria um botão. */
(function ligarARoda() {
  const palco = $("aj_tela");
  if (!palco) return;
  let ultimoGesto = 0;
  palco.addEventListener("wheel", ev => {
    if (!EDT || !janelaDaArte(EDT.nome)) return;
    ev.preventDefault();
    const nome = EDT.nome;
    const b = BROLL_DE && BROLL_DE.get(nome);
    const jan = janelaDaArte(nome);
    if (!b || !jan) return;
    // UM PASSO POR RAJADA na pilha do desfazer: rolar a roda são dezenas de eventos, e
    // guardar um por evento faria o desfazer precisar de trinta cliques para voltar um
    // gesto só, que é o mesmo defeito dos botões de mais e menos.
    const agora = performance.now();
    if (agora - ultimoGesto > 900) guardarOGesto();
    ultimoGesto = agora;
    const e = enquadreDe(nome);
    const kenc = kencDoEncaixe(b, jan, e.folga, e.encaixe);
    const r = palco.getBoundingClientRect();
    const cx = (ev.clientX - r.left) / EDT.L, cy = (ev.clientY - r.top) / EDT.A;
    const k0 = kenc * e.z;
    const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    const jcx = jan.x + jan.w / 2, jcy = jan.y + jan.h / 2;
    // ONDE O DEDO ESTÁ, em fração da própria filmagem: é esse ponto que fica parado.
    const u = (cx - (jcx - k0 * bcx + kenc * e.dx)) / k0;
    const v = (cy - (jcy - k0 * bcy + kenc * e.dy)) / k0;
    const z = Math.max(Z_MINIMO, Math.min(4, e.z * (ev.deltaY < 0 ? 1.06 : 1 / 1.06)));
    const k1 = kenc * z;
    mexerEnquadre(nome, "z", z, true);
    mexerEnquadre(nome, "dx", (cx - jcx + k1 * (bcx - u)) / kenc, true);
    mexerEnquadre(nome, "dy", (cy - jcy + k1 * (bcy - v)) / kenc);
    desenhaAjustePainel();
  }, { passive: false });
})();

/** Guarda quem está escolhido e acende a camada dele na lista. */
function editorEscolhido(o) {
  EDT_ALVO = o ? o.nome : null;
  AJ_SEL = (o && o.nome === "Frase" && o.campo) ? o.campo.id
    : (o && o.nome === "Filmagem") ? "_broll" : null;
  editorMede();                 // a marca do B-roll acende com a filmagem escolhida
  if (EDT) EDT.tela.requestRenderAll();
  desenhaAsCamadas();
  desenhaAjustePainel();
}

/** Escolhe uma camada pelo nome, do lado do painel. */
function editorEscolher(nome) {
  if (!EDT) return;
  const o = nome === "Filmagem" ? EDT.filmagem : nome === "Frase" ? EDT.frase : null;
  if (!o || !o.selectable) return;
  EDT.tela.setActiveObject(o);
  EDT.tela.requestRenderAll();
}

/* A LISTA DE CAMADAS, de cima para baixo, como no desenho da peca.

   A MOLDURA APARECE TRAVADA em vez de sumir: ela e' o quadro da peca e esta' por cima
   da filmagem, entao quem clica no meio pega sempre ela. Dizer que existe e que nao se
   move explica o que o clique fez, e some com a impressao de tela quebrada. */
function desenhaAsCamadas() {
  const casa = $("aj_camadas");
  if (!casa) return;
  if (!EDT) { casa.innerHTML = ""; return; }
  const camadas = [];
  if (EDT.frase) camadas.push({ nome: "Frase", travada: false });
  if (EDT.moldura) camadas.push({ nome: "Moldura", travada: true });
  camadas.push({ nome: "Filmagem", travada: false });
  casa.innerHTML = camadas.map(c =>
    `<button type="button" class="aj-cam${c.travada ? " travada" : ""}`
    + `${!c.travada && EDT_ALVO === c.nome ? " on" : ""}" data-camada="${c.nome}">`
    + `<i></i>${c.nome}${c.travada ? " (Travada)" : ""}</button>`).join("");
  for (const b of casa.querySelectorAll("[data-camada]"))
    b.onclick = () => editorEscolher(b.dataset.camada);
}

/* AS MOLDURAS DA CONTA, com a que a medida sugeriu marcada.

   O SELO DIZ QUAL A MAQUINA ESCOLHERIA, e o clique dele vence. Sem o selo a troca
   viraria escolha no escuro: ele nao saberia de onde a peca veio nem para onde volta. */
function desenhaAsMolduras() {
  const casa = $("aj_molduras");
  const bloco = $("aj_bloco_moldura");
  if (!casa || !bloco) return;
  const p = pecas3()[AJ_I];
  const todas = (TPL && TPL.contaModelo) ? variacoesDaConta(TPL.contaModelo) : [];
  bloco.hidden = !p || todas.length < 2;
  if (bloco.hidden) { casa.innerHTML = ""; return; }
  const daPeca = variacaoDaPeca(p.nome);
  const sugerida = melhorVariacao(BROLL_DE && BROLL_DE.get(p.nome), todas);
  // O RÓTULO É A ORDEM, E NUNCA O NOME GRAVADO. Trava 62b, com as palavras dele:
  // "Quadrado, horizontal, vertical e tela cheia? Não, irmão... não é pra ter esses
  // nomes." O `v.nome` das variações que ele cadastrou é exatamente isso ("Teste ·
  // Quadrado", "Teste · Horizontal"), e ele estava sendo escrito aqui, embaixo de cada
  // miniatura, com o comentário do estilo logo acima jurando o contrário. Quem separa
  // uma variação da outra é o DESENHO que ele vê na miniatura.
  const rotulo = (i) => "Variação " + (i + 1);
  casa.innerHTML = todas.map((v, i) =>
    `<button type="button" class="aj-mold${daPeca && v.id === daPeca.id ? " on" : ""}" `
    + `data-arte="${escapa(v.id)}" title="${escapa(rotulo(i))}">`
    + `<img alt="" data-arte-img="${escapa(v.arquivo)}">`
    + `<span>${escapa(rotulo(i))}</span>`
    + (sugerida && v.id === sugerida.id ? `<em class="aj-selo">Sugerida</em>` : "")
    + "</button>").join("");
  for (const im of casa.querySelectorAll("[data-arte-img]"))
    enderecoDo(im.dataset.arteImg).then(u => { if (u) im.src = u; }).catch(() => {});
  for (const b of casa.querySelectorAll("[data-arte]"))
    b.onclick = () => trocarAMoldura(b.dataset.arte);
}

/* Troca a moldura desta peça e refaz o desenho a partir da ficha nova. */
function trocarAMoldura(id) {
  const p = pecas3()[AJ_I];
  if (!p) return;
  const atual = variacaoDaPeca(p.nome);
  if (atual && atual.id === id) return;
  guardarOGesto();
  const e = enquadreDe(p.nome);
  e.moldura = id;
  /* A MOLDURA NOVA TEM OUTRO FURO, entao o enquadramento velho nao vale: `dx` e `dy`
     eram medidos na regua do furo anterior e cairiam em outro lugar. A peca volta ao
     encaixe limpo da moldura escolhida, que e' de onde ele ajusta de novo. */
  e.dx = 0; e.dy = 0; e.z = 1;
  ENQUADRES.set(p.nome, e);
  A_MAO.add(p.nome);
  anotarMexida();
  desenhaAjuste();
}

/* A CHAVE DA FOLGA, e ela vale só desta peça.

   POR QUE NAO E' UM BOTAO DE LIGAR PARA A LEVA INTEIRA: as duas respostas convivem na
   mesma leva. Peca cujo reel veio com card arredondado precisa dos 12%; peca de card
   reto paga por um problema que nao tem. Medido nas 180 da leva 31, a folga sozinha
   custa 20,3% da filmagem em toda peca. */
function virarAFolga() {
  const p = pecas3()[AJ_I];
  if (!p) return;
  const e = enquadreDe(p.nome);
  e.folga = e.folga > 1 ? 1 : FOLGA_DO_ENCAIXE;
  // A SOBRA DO DESLIZE MUDA COM ELA: sem folga a filmagem entra justa e `dx` que
  // sobrava abriria tarja preta dentro do furo. `mexerEnquadre` prende no limite novo.
  ENQUADRES.set(p.nome, e);
  mexerEnquadre(p.nome, "z", e.z);
  editorPorNoLugar();
  desenhaAjustePainel();
}

/* ------------------------------------------------- desfazer e refazer o gesto

   A PILHA GUARDA A FICHA, e nao o desenho. Guardar o desenho obrigaria a saber
   remontar objeto de tela de pintura a partir de texto, e o que decide a peca e' a
   ficha: com ela de volta, o desenho se refaz sozinho por `editorPorNoLugar`. */
let AJ_PILHA = [], AJ_REFEITOS = [];

function fichaDaPeca(nome) {
  return JSON.stringify({ e: ENQUADRES.get(nome) || null,
                          a: AJUSTES.get(nome) || null,
                          t: ESCRITO.get(nome) || null });
}

function porFichaDaPeca(nome, texto) {
  const d = JSON.parse(texto);
  if (d.e) ENQUADRES.set(nome, d.e); else ENQUADRES.delete(nome);
  if (d.a) AJUSTES.set(nome, d.a); else AJUSTES.delete(nome);
  if (d.t) ESCRITO.set(nome, d.t); else ESCRITO.delete(nome);
}

function guardarOGesto() {
  const p = pecas3()[AJ_I];
  if (!p) return;
  AJ_PILHA.push({ nome: p.nome, ficha: fichaDaPeca(p.nome) });
  AJ_REFEITOS.length = 0;
  // TETO DE SESSENTA: a pilha e' conforto, nao arquivo. Sem teto ela cresce com o dia
  // inteiro de trabalho dentro, na memoria da aba que ele ja' disse ser curta.
  if (AJ_PILHA.length > 60) AJ_PILHA.shift();
  desenhaAjustePainel();
}

async function voltarUmGesto(de, para) {
  const m = de.pop();
  if (!m) return;
  para.push({ nome: m.nome, ficha: fichaDaPeca(m.nome) });
  porFichaDaPeca(m.nome, m.ficha);
  A_MAO.add(m.nome);
  anotarMexida();
  const onde = pecas3().findIndex(p => p.nome === m.nome);
  if (onde >= 0 && onde !== AJ_I) { AJ_I = onde; AJ_SEL = null; }
  await desenhaAjuste();
}

/* DEVOLVE A PROMESSA DO DESENHO, e antes engolia: quem chamava com `await` seguia em
   frente com a peca ainda abrindo. Nao aparecia enquanto a peca era um punhado de
   retangulos (o navegador os poe na mesma rodada), e passou a aparecer com a tela de
   pintura, que espera o video e a moldura descerem. A prova do texto na mao leu a peca
   antes de ela existir e disse que a tela nao tinha redesenhado. */
function entrarNoAjuste() {
  const n = pecas3().length;
  if (!n) return parado("aj_recado", "Não há peça nenhuma nesta leva.");
  if (AJ_I >= n) AJ_I = 0;
  descerAsMolduras();
  return desenhaAjuste();
}

async function desenhaAjuste() {
  const p = pecas3()[AJ_I];
  if (!p || !TPL) return;
  const vez = ++AJ_VEZ;
  if (AJ_VIVO) { apagarPeca(AJ_VIVO); AJ_VIVO = null; }
  fecharOEditor();
  desenhaAjustePainel();
  /* COM FURO DE ARTE A PECA VAI PARA A TELA DE PINTURA, que e' o editor de 29/08/2026.
     Sem furo ela segue no desenho antigo, pelo mesmo motivo que o motor tem dois
     caminhos: sem furo a peca veste a mascara do passo 2, que e' recorte de imagem do
     navegador e nao existe em tela de pintura. */
  const v = janelaDaArte(p.nome)
    ? await abrirOEditor($("aj_tela"), p, AJ_I)
    : await pintaPeca($("aj_tela"), p, AJ_I, true, AJ_SEL);
  // ELE JÁ PULOU PARA OUTRA ENQUANTO ESTA ABRIA. Sem esta guarda, o vídeo da peça velha
  // ficaria vivo por cima da nova, que é exatamente o vazamento que se está consertando.
  if (vez !== AJ_VEZ) return apagarPeca(v);
  if (v) { await acenderPeca(v); v.play().catch(() => {}); AJ_VIVO = v; }
  /* AS ALCAS VOLTAM DEPOIS DE REPINTAR.

     `pintaPeca` REFAZ A PECA INTEIRA, e a moldura nasce escondida junto com ela.
     Sem esta linha, tudo o que repinta a peca (trocar de peca, trocar a fonte,
     desfazer) apagava as alcas de quem continuava escolhido, e elas so' voltavam
     no proximo clique. */
  marcarEscolhido();
}

/* Marca na peça desenhada qual item está escolhido, sem repintar nada.

   A FILMAGEM ENTRA NA CONTA, e antes não entrava: "selecionar o recorte do B-roll eu
   não consigo". Ela não é `.gal-el` porque não é item do molde, então precisa da linha
   própria. `_broll` como nome não colide com id nenhum: os ids do molde saem do
   `novoId`, que só faz letra e número. */
function marcarEscolhido() {
  $("aj_tela").querySelectorAll(".gal-el").forEach(d =>
    d.classList.toggle("sel", d.dataset.id === AJ_SEL));
  const b = $("aj_tela").querySelector(".gal-broll");
  if (b) b.classList.toggle("sel", AJ_SEL === "_broll");
  // QUEM ACENDE E' A MARCA, e nao a caixa: ver a nota em `pintaPeca`.
  $("aj_tela").classList.toggle("broll-sel", AJ_SEL === "_broll");
  porMoldura();
}

/* POE A MOLDURA DAS ALCAS EM CIMA DO QUE ESTA' ESCOLHIDO.

   MEDE O ELEMENTO NA TELA em vez de recalcular a posicao dele pela ficha, porque para
   texto a altura depende de quantas linhas a frase ocupou, e isso so' o navegador sabe
   depois de desenhar. */
function porMoldura() {
  const tela = $("aj_tela");
  const m = tela.querySelector(".aj-moldura");
  if (!m) return;
  const alvo = AJ_SEL === "_broll"
    ? tela.querySelector(".gal-broll-marca")
    : (AJ_SEL ? tela.querySelector(`.gal-el[data-id="${AJ_SEL}"]`) : null);
  if (!alvo) { m.hidden = true; return; }
  const a = alvo.getBoundingClientRect(), t = tela.getBoundingClientRect();
  if (!t.width || !t.height) return;
  m.hidden = false;
  m.style.left = ((a.left - t.left) / t.width * 100) + "%";
  m.style.top = ((a.top - t.top) / t.height * 100) + "%";
  m.style.width = (a.width / t.width * 100) + "%";
  m.style.height = (a.height / t.height * 100) + "%";
}

/* O NUMERO QUE MUDA PISCA UMA VEZ. Sem isto, assinar uma peça mexe num número no alto
   da tela e ninguém vê que ele mexeu: o gesto acontece longe de onde ele está olhando. */
function porNumeroDaRevisao(id, valor) {
  const el = $(id);
  if (!el || el.textContent === String(valor)) return;
  const primeira = el.textContent === "" || el.textContent === "0" && valor === 0;
  el.textContent = valor;
  const pai = el.closest(".aj-num");
  if (!pai || primeira) return;
  pai.classList.remove("mudou");
  void pai.offsetWidth;                    // reinicia a animação
  pai.classList.add("mudou");
}

/* A LEVA INTEIRA NUMA TIRA, uma marca por peça.

   UMA TARJA QUE ENCHE DIZ A FRAÇÃO; uma marca por peça diz quantas são, quais já foram,
   quais ele mexeu, e leva até cada uma com um clique. Com 15 peças ou com 180 ela é a
   mesma tira: o que muda é a largura de cada marca. */
function desenhaATrilha(pecas) {
  const casa = $("aj_trilha");
  if (!casa) return;
  // O VÃO ENCOLHE ANTES DA MARCA, e é o programa que decide porque só ele sabe
  // quantas peças são. Com 180 e o vão fixo de 2px a tira pedia 920px de largura
  // mínima e EMPURRAVA o placar de 267 para 930, jogando ele no meio do cabeçalho:
  // é a mesma conta da trava 39, agora no lugar onde ela não tinha sido feita.
  casa.style.setProperty("--aj-vao",
    (pecas.length > 60 ? 0.5 : pecas.length > 24 ? 1 : 2) + "px");
  if (casa.children.length !== pecas.length) {
    casa.innerHTML = "";
    pecas.forEach((p, k) => {
      const m = document.createElement("i");
      m.title = "Peça " + (k + 1);
      m.onclick = () => { AJ_I = k; AJ_SEL = null; desenhaAjuste(); };
      casa.appendChild(m);
    });
  }
  pecas.forEach((p, k) => {
    const classe = (PRONTAS.has(p.nome) ? "pronta "
      : (A_MAO.has(p.nome) || ENQUADRES.has(p.nome)) ? "tocada " : "")
      + (k === AJ_I ? "agora" : "");
    if (casa.children[k].className !== classe) casa.children[k].className = classe;
  });
}

function desenhaAjustePainel() {
  const pecas = pecas3();
  const p = pecas[AJ_I];
  if (!p || !TPL) return;

  /* ------------------------------------------------------- onde ele está, e o placar

     O NOME DO ARQUIVO SAIU DAQUI. Era um seletor com as 92 peças listadas pelo nome, e
     alem de ele não querer ver `.mp4` na tela, esse menu media 3.183 pixels de altura e
     era o que empurrava a página para baixo. No lugar ficou o número da peça, grande,
     que é o que ele precisa saber. */
  $("aj_conta").textContent = String(AJ_I + 1);
  $("aj_total").textContent = `de ${pecas.length}`;
  /* O RODAPÉ DIZ ONDE ELE ESTÁ E O QUE ELE JÁ FEZ NESTA PEÇA.

     O ANEL É A LEVA INTEIRA, e o número no meio dele é a peça de agora: assinar uma
     peça faz o anel andar, que é o retorno que faltava ao gesto. */
  $("aj_pe_titulo").innerHTML = `Peça ${AJ_I + 1} `
    + `<span id="aj_total">de ${pecas.length}</span>`;
  const volta = 2 * Math.PI * 22;
  const feito = pecas.length ? PRONTAS.size / pecas.length : 0;
  $("aj_anel_cheio").setAttribute(
    "stroke-dasharray", `${(volta * feito).toFixed(1)} ${volta.toFixed(1)}`);
  const mexeu = A_MAO.has(p.nome) || ENQUADRES.has(p.nome);
  const sub = $("aj_pe_sub");
  sub.textContent = PRONTAS.has(p.nome) ? "Você já assinou esta peça"
    : mexeu ? "Ajustada por você" : "Nenhum ajuste nesta peça";
  sub.classList.toggle("tocada", mexeu && !PRONTAS.has(p.nome));
  // A LEVA E A CONTA FICAM ESCRITAS NO TOPO. A conta entra com inicial maiúscula, que é
  // a lei de toda palavra de tela desta casa: ele cadastrou "conta teste" em caixa baixa
  // e o topo saía "Leva 31 · conta teste", que ao lado de "Revisão Peça A Peça" parece
  // texto solto e não rótulo.
  const cab = $("aj_cab_leva");
  if (cab) {
    const conta = (TPL && TPL.contaModelo || "").replace(/(^|\s)(\p{Ll})/gu,
      (t, antes, letra) => antes + letra.toUpperCase());
    cab.textContent = "Leva " + ((EDIT_LEVA && EDIT_LEVA.numero) || "")
      + (conta ? " · " + conta : "");
  }
  const faltam = pecas.length - PRONTAS.size;
  /* O TERCEIRO NUMERO E' O DAS AJUSTADAS, e ele entrou a pedido dele em 29/08/2026:
     "tem que ter tres cards aqui em cima: prontas, para ver e quantas tiveram ajuste".
     Sem ele nao havia como saber, no fim da leva, em quantas peças ele tinha posto a
     mão. A conta é a mesma da galeria: peça com ficha guardada é peça mexida. */
  const mexidas = pecas.filter(x => A_MAO.has(x.nome) || ENQUADRES.has(x.nome)).length;
  porNumeroDaRevisao("aj_kpi_pronta", PRONTAS.size);
  porNumeroDaRevisao("aj_kpi_falta", faltam);
  porNumeroDaRevisao("aj_kpi_mexida", mexidas);
  $("aj_kpi_pronta_b").classList.toggle("zerado", !PRONTAS.size);
  $("aj_kpi_mexida_b").classList.toggle("zerado", !mexidas);
  desenhaATrilha(pecas);
  desenhaAsVizinhas(pecas);
  // O BOTAO DIZ O QUE FAZ, e o que ele faz é assinar E SEGUIR: é um gesto só, e por
  // isso ele é o único com fundo cheio e movimento próprio (lei 8 do Portal).
  $("aj_pronta_txt").textContent = PRONTAS.has(p.nome) ? "Já Pronta, Seguir"
                                                       : "Pronta E Seguir";
  /* COM TUDO PRONTO, "Pronta" SAI E "Fabricar" OCUPA O LUGAR DELE.

     PEDIDO DELE: "já que tem as 92 prontas, o botão substituía, o botão que tinha
     antes, pro botão de fabricar". E faz sentido além do pedido: marcar como pronta o
     que já está pronto não faz nada, e botão que não faz nada só atrapalha a escolha.
     A ação seguinte passa a ser uma só, e ela fica em destaque. */
  const todasProntas = pecas.length > 0 && PRONTAS.size >= pecas.length;
  $("aj_pronta").hidden = todasProntas;
  // CHAMANDO PELO ÚLTIMO PASSO: com a leva inteira assinada, fabricar deixa de ser
  // mais um botão na barra e passa a respirar sozinho.
  $("aj_montar").classList.toggle("chama", todasProntas);
  $("aj_montar").disabled = $("apl_montar").disabled;
  $("aj_ant").disabled = AJ_I <= 0;
  const ir = $("aj_ir");
  ir.max = pecas.length;
  if (document.activeElement !== ir) ir.value = AJ_I + 1;
  $("aj_g_num").textContent = String(AJ_I + 1);

  /* ---------------------------------------------------------------- o texto na mão */
  const campos = abertas();
  $("aj_sem_texto").hidden = !!campos.length;
  $("aj_textos").innerHTML = campos.map(c =>
    `<div class="aj-campo"><label for="ajt_${c.id}">`
    + `${escapa(c.id === ID_DA_FRASE ? "A Frase Desta Peça"
                : (c.texto || "a caixa aberta"))}</label>`
    + `<textarea id="ajt_${c.id}" rows="3"></textarea></div>`).join("");
  for (const c of campos) {
    const t = $("ajt_" + c.id);
    t.value = textoDaPeca(c, p.nome);
    t.oninput = () => escreverAMao(p, c, t.value);
  }

  /* ---------------------------------------------------------------- a fonte */
  // OS TEXTOS DESTA PECA, e nao os do template: desde a excisao das caixas quem tem
  // texto e' a faixa da variacao, e ela nasce por peca. Lendo `TPL.elementos` esta
  // lista ficava vazia para sempre e a troca de fonte na revisao morria junto.
  const textos = elementosDaPeca(p.nome).filter(e => e.tipo === "texto");
  $("aj_fonte_alvo").innerHTML = textos.map(e =>
    `<button type="button" class="aj-alvo${e.id === AJ_SEL ? " sel" : ""}" `
    + `data-el="${e.id}">`
    + escapa((textoDaPeca(e, p.nome) || "caixa de texto").slice(0, 20)) + "</button>").join("");
  const alvo = textos.find(e => e.id === AJ_SEL);
  $("aj_fonte_sem").hidden = !!alvo;
  $("aj_fonte").hidden = !alvo;
  $("aj_fonte_todas").disabled = !alvo;
  /* O ALINHAMENTO DA CAIXA, pedido dele em 29/08/2026 e feito em 02/09. Ele vive na
     linha da frase porque é a mesma caixa escolhida que manda nos dois, e some pelo
     mesmo motivo: sem caixa escolhida não há o que alinhar. */
  const tira = $("aj_alinha");
  if (tira) {
    tira.hidden = !alvo;
    if (alvo) {
      const agora = medidaDaPeca(alvo, p.nome).alinha;
      tira.innerHTML = ALINHAMENTOS.map(a =>
        `<button type="button" data-a="${a.v}" title="${a.r}"`
        + `${a.v === agora ? ' class="on"' : ""}>${a.svg}</button>`).join("");
    }
  }
  desenhaAsFontes(alvo && medidaDaPeca(alvo, p.nome).fonte);

  /* ---------------------------------------------------------------- o B-roll */
  const b = BROLL_DE && BROLL_DE.get(p.nome);
  $("aj_broll_sem").hidden = !!b;
  for (const id of ["aj_zoom", "aj_bx", "aj_by"]) $(id).hidden = !b;
  $("aj_broll_todas").disabled = !b;
  if (b) {
    const e = enquadreDe(p.nome);
    const jan = janelaDaArte(p.nome);
    /* A DICA DIZ O QUE O GESTO FAZ NESTA PECA, e sao dois casos porque o motor tambem
       tem dois. Com furo de arte a janela e' o furo e nao anda: o arrasto desliza a
       filmagem la' dentro. Sem furo, o arrasto leva a janela inteira. */
    $("aj_broll_dica").textContent = jan
      ? "Arraste a filmagem para escolher que pedaço dela aparece dentro da moldura. "
        + "Puxe um punho verde para mudar o tamanho, ou role a roda do mouse na peça."
      : "Arraste a filmagem na peça para mudar a janela de lugar. Os botões abaixo "
        + "escolhem que pedaço dela aparece dentro da janela.";
    $("aj_broll_dica").hidden = false;
    /* A ESCOLHA DO ENCAIXE, e ela se explica com o número DESTA peça.

       Só existe onde há furo de arte: sem furo não há o que caber nem o que cobrir. */
    const caixaEnc = $("aj_encaixe");
    if (caixaEnc) {
      caixaEnc.hidden = !jan;
      for (const bt of caixaEnc.children) bt.classList.toggle("on", bt.dataset.e === e.encaixe);
    }
    const diz = $("aj_encaixe_diz");
    if (diz) {
      diz.hidden = !jan;
      if (jan) {
        const cobrindo = aproveitamentoLimpo(p.nome, FOLGA_DO_ENCAIXE, "cobrir");
        const sobra = sobraDoFuro(p.nome);
        diz.innerHTML = e.encaixe === "caber"
          ? `Aparece <b>100%</b> do B-roll, e <b>${sobra}%</b> do furo fica com o fundo `
            + `da arte. Cobrindo, esta peça mostraria <b>${cobrindo}%</b>.`
          : `Aparece <b>${cobrindo}%</b> do B-roll: o resto fica fora do furo. Mostrando `
            + `inteiro, seriam <b>100%</b>, com <b>${sobra}%</b> de furo sobrando.`;
      }
    }
    const regua = $("aj_regua");
    if (regua) {
      regua.hidden = !jan;
      if (document.activeElement !== regua) regua.value = Math.round(e.z * 100);
    }
    // O PISO DESCEU DE 100 PARA 20: com o encaixe de caber a peça nasce abaixo de cem,
    // e o botão que só subia era o mesmo "não deixa diminuir" que ele encontrou na alça.
    passoNovo($("aj_zoom"), 20, 400, 5, Math.round(e.z * 100),
              v => "Aproximar " + v + "%", v => mexerEnquadre(p.nome, "z", v / 100));
    /* COM FURO DE ARTE, DESLIZAR SEMPRE TEM PARA ONDE IR desde 29/08/2026: a trava da
       sobra saiu junto com o encaixe de caber, porque era ela que prendia o gesto. Sem
       furo o limite antigo continua valendo, que é o da aproximação. */
    const sobra = jan ? true : folgaDoEnquadre(e.z) > 0.001;
    $("aj_bx").classList.toggle("apagado", !sobra);
    $("aj_by").classList.toggle("apagado", !sobra);
    /* OS DOIS DIZIAM "CONTEÚDO", LADO A LADO E COM O MESMO NÚMERO: não havia como saber
       qual mexia para os lados e qual mexia para cima. Cada um diz agora o que faz. */
    passoNovo($("aj_bx"), -60, 60, 2, Math.round(e.dx * 100),
              v => "Lado A Lado " + (v > 0 ? "+" : "") + v + "%",
              v => mexerEnquadre(p.nome, "dx", v / 100));
    passoNovo($("aj_by"), -60, 60, 2, Math.round(e.dy * 100),
              v => "Cima E Baixo " + (v > 0 ? "+" : "") + v + "%",
              v => mexerEnquadre(p.nome, "dy", v / 100));
  }

  /* ---------------------------------------------------------------- tamanho e posição */
  const item = elementoDaPeca(p.nome, AJ_SEL);
  $("aj_item").hidden = !item;
  if (item) {
    const m = medidaDaPeca(item, p.nome);
    if (item.tipo === "texto") {
      $("aj_tam").hidden = false;
      passoNovo($("aj_tam"), 10, 140, 2, Math.round(m.tamanho * 1000),
                v => "Letra " + (v / 10).toFixed(1) + "%",
                v => mexerItem(p.nome, item, "tamanho", v / 1000));
    } else $("aj_tam").hidden = true;
    passoNovo($("aj_x"), -20, 100, 1, Math.round(m.x * 100),
              v => "Esquerda " + v + "%", v => mexerItem(p.nome, item, "x", v / 100));
    passoNovo($("aj_y"), -20, 100, 1, Math.round(m.y * 100),
              v => "Topo " + v + "%", v => mexerItem(p.nome, item, "y", v / 100));
  }

  /* ------------------------------------------- a folga, a moldura e as camadas

     TUDO O QUE E' DO EDITOR SE DESENHA DE UMA VEZ, e a partir da ficha: assim o painel
     nunca discorda do que esta' na peca, seja quem for que mudou (o gesto, o botao, a
     troca de moldura ou o desfazer). */
  const eq = enquadreDe(p.nome);
  const temFuro = !!janelaDaArte(p.nome);
  const chave = $("aj_folga");
  if (chave) {
    chave.classList.toggle("on", eq.folga > 1);
    chave.setAttribute("aria-pressed", eq.folga > 1 ? "true" : "false");
    /* A FOLGA SÓ EXISTE EM COBRIR. Cabendo, o que ficaria de fora do B-roll não entra
       na peça, porque o recorte para no próprio B-roll: a chave não teria efeito
       nenhum, e chave sem efeito é a definição de tela que mente. */
    chave.hidden = !temFuro || eq.encaixe !== "cobrir";
  }
  /* O QUE A CHAVE FAZ, ESCRITO COM O NÚMERO DESTA PEÇA. "Folga de segurança" não
     dizia nada: ele perguntou o que era, em 29/08/2026. O nome virou o que ela faz
     (cobrir a borda do reel) e a linha abaixo diz o preço em imagem. */
  const dizFolga = $("aj_folga_diz");
  if (dizFolga) {
    dizFolga.hidden = !!$("aj_folga").hidden;
    if (!dizFolga.hidden) {
      const com = aproveitamentoLimpo(p.nome, FOLGA_DO_ENCAIXE, "cobrir");
      const sem = aproveitamentoLimpo(p.nome, 1, "cobrir");
      dizFolga.innerHTML = "O reel vem com um canto arredondado gravado nos pixels. "
        + `Ligada, ela o esconde crescendo a filmagem 12%: aparecem <b>${com}%</b> `
        + `dela. Desligada, aparecem <b>${sem}%</b>, e o canto pode surgir na moldura.`;
    }
  }
  /* AS MEDIDAS SO' EXISTEM ONDE HA' O QUE MEDIR (trava 2). Sem furo de arte nao ha'
     janela nenhuma para comparar, e deixar o numero da peca anterior na tela seria a
     tela afirmando o que nao mediu, que e' o pior erro possivel aqui. */
  const medidas = document.querySelector(".aj-medidas");
  if (medidas) medidas.hidden = !temFuro;
  desenhaAsMolduras();
  desenhaAsCamadas();
  $("aj_voltar_gesto").disabled = !AJ_PILHA.length;
  $("aj_refazer_gesto").disabled = !AJ_REFEITOS.length;
}

/* ESCREVER NA MÃO POR CIMA DO QUE A IA ESCREVEU.

   A PEÇA MUDA NA HORA, MAS SEM REPINTAR. Repintar recriaria o vídeo e o cursor sairia do
   meio da frase a cada tecla. Só o texto daquela caixa é trocado no lugar. */
let AJ_RELOGIO = null;

function escreverAMao(p, campo, texto) {
  const g = ESCRITO.get(p.nome) || {};
  g[campo.id] = texto;
  ESCRITO.set(p.nome, g);
  A_MAO.add(p.nome);
  const d = $("aj_tela").querySelector(`.gal-el[data-id="${campo.id}"]`);
  if (d) d.textContent = texto || " ";
  /* E NO EDITOR A FRASE E' UM OBJETO, e nao um elemento da pagina.

     SEM ESTA LINHA, digitar na caixa do painel gravava e nao aparecia na peca: o que a
     prova pegou como "nao redesenhou". O caminho de volta tem de existir nos dois
     sentidos, senao o painel e a peca contam historias diferentes da mesma frase.

     `isEditing` GUARDA O CASO DE ELE ESTAR DIGITANDO NA PROPRIA PECA: ali o texto ja'
     e' o dele, e escrever por cima moveria o cursor para o comeco a cada tecla. */
  if (EDT && EDT.nome === p.nome && EDT.frase && EDT.frase.campo
      && EDT.frase.campo.id === campo.id && !EDT.frase.isEditing) {
    EDT.frase.set("text", texto || " ");
    EDT.tela.requestRenderAll();
  }
  if (AJ_RELOGIO) clearTimeout(AJ_RELOGIO);
  AJ_RELOGIO = setTimeout(() => {
    AJ_RELOGIO = null;
    caberDeNovo(p, campo);
    // O `caberDeNovo` MUDA A FICHA (o topo e o tamanho da letra), e no editor quem
    // desenha a partir dela e' o `editorPorNoLugar`. Sem esta linha a frase caberia
    // no arquivo e continuaria transbordando na tela, que e' mentira de previa.
    if (EDT && EDT.nome === p.nome) editorPorNoLugar();
    contaEscrito();
    anotarMexida();
  }, 700);
}

/* DEPOIS QUE A MÃO PARA, O TEXTO VOLTA A CABER.

   Texto escrito na mão é mais longo ou mais curto que o da IA, e a letra que cabia pode
   não caber mais, ou pode ter sobrado espaço. A conta é a mesma de sempre: cabe na largura
   da caixa e o pé para antes do topo da filmagem daquela peça.

   NÃO DESFAZ O QUE ELE ESCOLHEU A DEDO. Se ele mexeu na letra desta caixa, `aMao` está
   marcado e o programa não discute. */
function caberDeNovo(p, campo) {
  const a = AJUSTES.get(p.nome) || {};
  if (a[campo.id] && a[campo.id].aMao) return;
  const texto = ((ESCRITO.get(p.nome) || {})[campo.id] || campo.texto || "").trim();
  if (!texto) return;
  // A MESMA ORDEM DE SEMPRE: sobe primeiro, encolhe só se não houver jeito.
  const acerto = acertarTexto(campo, texto, ateOndeDesce(campo, p.nome));
  const novo = Object.assign({}, a[campo.id]);
  delete novo.y; delete novo.tamanho;
  Object.assign(novo, acerto);
  if (Object.keys(novo).length) a[campo.id] = novo; else delete a[campo.id];
  if (Object.keys(a).length) AJUSTES.set(p.nome, a); else AJUSTES.delete(p.nome);
  const d = $("aj_tela").querySelector(`.gal-el[data-id="${campo.id}"]`);
  if (d) {
    const m = medidaDaPeca(campo, p.nome);
    d.style.fontSize = (m.tamanho * 100) + "cqh";
    d.style.top = (m.y * 100) + "%";
  }
}

/** Mexe num item desta peça só, e move o que está na tela sem repintar o vídeo. */
/* `calado` E' PARA O ARRASTO: ele chama isto a cada movimento do dedo, e quem grava e
   redesenha o painel e' o soltar. Sem ele, o cofre escreveria dezenas de vezes por
   segundo e o painel se remontaria embaixo da mao. */
function mexerItem(nome, el, chave, valor, calado) {
  const a = AJUSTES.get(nome) || {};
  const novo = Object.assign({}, a[el.id], { [chave]: valor });
  if (chave === "tamanho") novo.aMao = true;      // ver `caberDeNovo`
  a[el.id] = novo;
  AJUSTES.set(nome, a);
  A_MAO.add(nome);
  const d = $("aj_tela").querySelector(`.gal-el[data-id="${el.id}"]`);
  if (d) {
    const m = medidaDaPeca(el, nome);
    d.style.left = (m.x * 100) + "%";
    d.style.top = (m.y * 100) + "%";
    if (el.tipo === "texto") {
      d.style.fontSize = (m.tamanho * 100) + "cqh";
      d.style.fontFamily = fonteCss(m.fonte);
    }
  }
  porMoldura();          // as alcas acompanham o que acabou de mudar de tamanho
  // E NO EDITOR QUEM DESENHA E' ELE, pela ficha que acabou de mudar. Ver `mexerEnquadre`.
  if (EDT && EDT.nome === nome && !calado) editorPorNoLugar();
  if (!calado) anotarMexida();
}

/* QUANTO A FILMAGEM PODE DESLIZAR PARA CADA LADO, em fração do quadro.

   A CONTA É A MESMA DO PROGRAMA QUE GRAVA, e tem de ser. Lá o `crop` só pode andar
   entre zero e a sobra que o `scale` criou, senão o quadro sairia da imagem e abriria
   tarja preta. Aqui o arrasto para no mesmo lugar; se um lado permitisse mais que o
   outro, a peça sairia diferente da que ele aprovou na tela.

   NO TAMANHO EXATO DA JANELA A SOBRA É ZERO, e arrastar não faz nada. É por isso que a
   dica pede para aproximar primeiro, em vez de deixar ele arrastar no vazio. */
function folgaDoEnquadre(z) { return Math.max(0, (z - 1) / 2); }


/* A FICHA SO' SE APAGA QUANDO NAO HA' NADA DELE GUARDADO NELA.

   O DEFEITO QUE ISTO CONSERTA, pego pela prova em 29/08/2026: a regra antiga era "z em
   um, sem deslize, sem janela movida, entao apaga", e ela nasceu quando a ficha so'
   guardava enquadramento. Com a folga e a moldura morando aqui, virar a chave da folga
   gravava o campo e a chamada seguinte apagava a ficha inteira, levando a folga junto.
   Na tela o gesto simplesmente nao acontecia, e a razao era invisivel.

   APAGAR CONTINUA IMPORTANDO: ficha vazia e' o que diz "esta peca nao foi mexida", e e'
   dela que sai a conta de ajustadas na galeria. */
function fichaSoDoPadrao(e) {
  return (e.z || 1) === 1 && !e.dx && !e.dy && !e.mx && !e.my && (e.es || 1) === 1
    && !e.moldura && e.encaixe !== "cobrir"
    && Math.abs((e.folga != null ? e.folga : FOLGA_DO_ENCAIXE)
                - FOLGA_DO_ENCAIXE) < 1e-9;
}

/** Reenquadra a filmagem desta peça. A janela não sai do lugar: quem anda é o vídeo. */
function mexerEnquadre(nome, chave, valor, calado) {
  const e = enquadreDe(nome);
  e[chave] = valor;
  const jan = janelaDaArte(nome);
  const r = BROLL_DE && BROLL_DE.get(nome);
  if (jan) {
    /* COM FURO DE ARTE A JANELA NAO SE MEXE, e o motor diz isso por extenso: "es, mx e
       my nao entram aqui; a janela agora e' o furo da arte, que nao se move". Escrever
       esses tres seria guardar um ajuste que o arquivo nunca vai ter. */
    e.es = 1; e.mx = 0; e.my = 0;
    /* O DESLIZE NÃO SE PRENDE MAIS, desde 29/08/2026.

       A TRAVA ERA O QUE ELE CHAMAVA DE "PRENDENDO": ela existia para impedir que
       sobrasse vazio dentro do furo, e o preço era a peça voltar sozinha para onde a
       conta achava certo, no meio do gesto dele. Com o encaixe de caber a peça já nasce
       menor que o furo, então a trava zerava todo arraste antes mesmo de começar.

       QUEM AVISA É A TELA, e não a trava: `editorMede` diz quanto do furo ficou sem
       filmagem, e a decisão continua sendo de quem está olhando. */
    e.z = Math.max(Z_MINIMO, Math.min(4, e.z || 1));
    if (fichaSoDoPadrao(e)) ENQUADRES.delete(nome);
    else ENQUADRES.set(nome, e);
    A_MAO.add(nome);
    porFilmagemNoLugar(AJ_VIVO, lugarDaFilmagem(nome));
    // COM O EDITOR ABERTO QUEM DESENHA E' ELE, e a partir da mesma ficha: os botoes do
    // painel e o gesto na peca chegam aqui pelo mesmo caminho e saem no mesmo lugar.
    if (EDT && EDT.nome === nome) editorPorNoLugar();
    if (!calado) anotarMexida();
    return;
  }
  // O DESLIZE DENTRO DA JANELA NUNCA PASSA DA SOBRA que a aproximação criou.
  const folga = folgaDoEnquadre(e.z);
  e.dx = Math.max(-folga, Math.min(folga, e.dx));
  e.dy = Math.max(-folga, Math.min(folga, e.dy));
  if (r) {
    // A JANELA CABE NA PECA: nem menor que um quarto, nem maior que o quadro.
    e.es = Math.max(0.25, Math.min(Math.min(1 / r.w, 1 / r.h), e.es));
    // E NAO SAI DELA: metade para fora seria B-roll cortado pela borda.
    const w = r.w * e.es, h = r.h * e.es;
    const x0 = r.x + r.w / 2 - w / 2, y0 = r.y + r.h / 2 - h / 2;
    e.mx = Math.max(-x0, Math.min(1 - w - x0, e.mx));
    e.my = Math.max(-y0, Math.min(1 - h - y0, e.my));
  } else { e.mx = 0; e.my = 0; e.es = 1; }
  if (fichaSoDoPadrao(e)) ENQUADRES.delete(nome);
  else ENQUADRES.set(nome, e);
  A_MAO.add(nome);
  if (AJ_VIVO) AJ_VIVO.style.transform = transformDo(e);
  porJanelaNoLugar($("aj_tela"), nome);
  if (!calado) anotarMexida();
}

/* ---------------------------------------------------------------- os botões da fase */

/* A CHAVE DA FOLGA, O DESFAZER E O REFAZER.

   OS TRES GUARDAM A FICHA ANTES DE MEXER, pelo mesmo motivo do gesto: sem o estado
   anterior nao ha' caminho de volta, e o unico jeito de voltar seria zerar a peca
   inteira, levando junto tudo o que ele ja' tinha acertado nela. */
$("aj_folga").onclick = () => { guardarOGesto(); virarAFolga(); };

/* O ENCAIXE DA PEÇA: mostrar inteiro ou cobrir o furo.

   TROCAR ZERA O TAMANHO E O DESLIZE, e é de propósito: a régua muda de zero junto com o
   encaixe, e cem por cento passa a querer dizer outra coisa. Guardar o `z` antigo poria
   a filmagem num tamanho que ele não pediu. */
/* O ALINHAMENTO ENTRA NA PILHA DO DESFAZER como qualquer outro gesto: ele pediu o
   caminho de volta para tudo o que se mexe na peça, e meio caminho de volta é pior do
   que nenhum, porque ensina a confiar. */
$("aj_alinha").onclick = ev => {
  const b = ev.target.closest("[data-a]");
  if (!b) return;
  const p = pecas3()[AJ_I];
  if (!p) return;
  const alvo = elementosDaPeca(p.nome).find(e => e.id === AJ_SEL && e.tipo === "texto");
  if (!alvo || medidaDaPeca(alvo, p.nome).alinha === b.dataset.a) return;
  guardarOGesto();
  mexerItem(p.nome, alvo, "alinha", b.dataset.a);
  desenhaAjuste();
};

$("aj_encaixe").onclick = ev => {
  const b = ev.target.closest("[data-e]");
  if (!b) return;
  const p = pecas3()[AJ_I];
  if (!p || enquadreDe(p.nome).encaixe === b.dataset.e) return;
  guardarOGesto();
  mexerEnquadre(p.nome, "encaixe", b.dataset.e, true);
  mexerEnquadre(p.nome, "z", 1, true);
  mexerEnquadre(p.nome, "dx", 0, true);
  mexerEnquadre(p.nome, "dy", 0);
  desenhaAjustePainel();
};

/* A RÉGUA DO TAMANHO. Um passo por rajada na pilha, como na roda do mouse. */
let AJ_REGUA_GESTO = 0;
$("aj_regua").oninput = () => {
  const p = pecas3()[AJ_I];
  if (!p) return;
  /* O VALOR SE LÊ ANTES DE GUARDAR O GESTO, e a prova pegou o porquê: `guardarOGesto`
     redesenha o painel, e o painel reescreve a régua com o tamanho ANTIGO. Lendo
     depois, o primeiro movimento do arraste voltava sozinho para onde estava. É o
     mesmo defeito das três medidas do gesto na tela de pintura, e a lição é a mesma:
     leia tudo o que o dedo deixou antes de mexer em qualquer coisa. */
  const alvo = Math.max(Z_MINIMO, Math.min(4, +$("aj_regua").value / 100));
  const agora = performance.now();
  if (agora - AJ_REGUA_GESTO > 900) guardarOGesto();
  AJ_REGUA_GESTO = agora;
  mexerEnquadre(p.nome, "z", alvo);
  desenhaAjustePainel();
};
$("aj_voltar_gesto").onclick = () => voltarUmGesto(AJ_PILHA, AJ_REFEITOS);
$("aj_refazer_gesto").onclick = () => voltarUmGesto(AJ_REFEITOS, AJ_PILHA);

function irParaAPeca(k) {
  const total = pecas3().length;
  if (!total) return;
  const alvo = Math.max(0, Math.min(total - 1, k));
  if (alvo === AJ_I) return;
  AJ_I = alvo; AJ_SEL = null;
  desenhaAjuste();
}

$("aj_ant").onclick = () => irParaAPeca(AJ_I - 1);
$("aj_viz_ant").onclick = () => irParaAPeca(AJ_I - 1);
$("aj_viz_prox").onclick = () => irParaAPeca(AJ_I + 1);

// PULAR PARA UMA PECA PELO NUMERO. Ele mora dentro da fila, e nao no rodape: e' ali
// que a pergunta "para onde eu vou" esta' sendo feita.
$("aj_ir").onchange = () => {
  const n = Number($("aj_ir").value);
  const total = pecas3().length;
  if (!Number.isFinite(n) || n < 1 || n > total) { $("aj_ir").value = AJ_I + 1; return; }
  irParaAPeca(n - 1);
  fecharAFila();
};

/* ============================================== A ESTEIRA, VERSÃO 4

   O QUE ELE APROVOU EM 29/08/2026 e cobrou em 02/09: a peça ocupa a tela, a anterior e
   a próxima ficam de lado para a fila se ver andando, aprovar é um gesto só, e as
   ferramentas moram numa gaveta que empurra a peça em vez de cobri-la.

   A fonte do desenho é `docs/propostas/esteira-v2/`. Mudou aqui, muda lá. */

/* AS VIZINHAS SÃO A FILA EM PESSOA, e não um número dizendo que ela existe.

   ELAS DESENHAM A ARTE DA PEÇA, e não a filmagem: a filmagem exige baixar o vídeo
   inteiro para tirar um quadro, e são duas por peça, a cada troca. A arte já está na
   mão (a moldura desceu no começo da fase) e é ela que diz de relance qual peça é. */
function desenhaAsVizinhas(pecas) {
  const por = (botao, k) => {
    if (!botao) return;
    const p = pecas[k];
    botao.classList.toggle("oculta", !p);
    if (!p) { botao.innerHTML = ""; return; }
    const v = variacaoDaPeca(p.nome);
    const marca = PRONTAS.has(p.nome) ? " · pronta" : "";
    const arte = v && ED_IMGS.get(v.arquivo);
    botao.innerHTML = (arte ? `<img src="${arte}" alt="">` : `<span class="vazio"></span>`)
      + `<span>${k + 1}${marca}</span>`;
    botao.title = "Ir para a peça " + (k + 1);
  };
  por($("aj_viz_ant"), AJ_I - 1);
  por($("aj_viz_prox"), AJ_I + 1);
}

/* ------------------------------------------------------------------- a gaveta

   ELA EMPURRA, E NÃO COBRE. Cobrir a peça no exato momento em que ele ajusta a peça
   era o pior lugar possível para pousar. */
function abrirGaveta() {
  $("aj_gaveta").classList.add("aberta");
  const casa = $("aj_tela").closest(".aj-esteira");
  if (casa) casa.classList.add("com-gaveta");
  // A PEÇA MUDA DE TAMANHO ao ser empurrada, e o editor precisa saber: sem isto a
  // filmagem fica desenhada no tamanho de antes, e o gesto mira no lugar errado.
  setTimeout(() => { if (typeof editorMede === "function") editorMede(); }, 360);
}
function fecharGaveta() {
  $("aj_gaveta").classList.remove("aberta");
  const casa = $("aj_tela").closest(".aj-esteira");
  if (casa) casa.classList.remove("com-gaveta");
  setTimeout(() => { if (typeof editorMede === "function") editorMede(); }, 360);
}
$("aj_abrir_gaveta").onclick = () => {
  if ($("aj_gaveta").classList.contains("aberta")) return fecharGaveta();
  desenhaAjustePainel();
  abrirGaveta();
};
$("aj_g_fechar").onclick = fecharGaveta;

/* ELA SE ARRASTA PELA BORDA, que foi o pedido dele: quem está mexendo em fonte quer a
   lista larga, quem está só conferindo quer a peça grande. O limite de baixo é o que
   cabe a lista de fontes sem virar uma fresta; o de cima é metade da tela. */
(function ligarOPuxador() {
  const puxador = $("aj_puxador");
  if (!puxador) return;
  let pegando = false;
  const largura = x => {
    const nova = Math.max(300, Math.min(window.innerWidth * 0.52, window.innerWidth - x));
    const casa = document.getElementById("ed_oficina");
    if (casa) casa.style.setProperty("--aj-gaveta", Math.round(nova) + "px");
  };
  const anda = ev => { if (pegando) largura(ev.clientX); };
  const solta = () => {
    if (!pegando) return;
    pegando = false;
    document.body.classList.remove("aj-arrastando");
    const casa = $("aj_tela").closest(".aj-esteira");
    if (casa) casa.classList.remove("arrastando");
    if (typeof editorMede === "function") editorMede();
  };
  puxador.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    pegando = true;
    document.body.classList.add("aj-arrastando");
    const casa = $("aj_tela").closest(".aj-esteira");
    if (casa) casa.classList.add("arrastando");
  });
  // OS OUVINTES MORAM NA JANELA, e não no puxador: `setPointerCapture` é frágil quando
  // o elemento é redesenhado no meio do gesto, e o arrasto morria calado.
  window.addEventListener("pointermove", anda);
  window.addEventListener("mousemove", anda);
  window.addEventListener("pointerup", solta);
  window.addEventListener("mouseup", solta);
  window.addEventListener("pointercancel", solta);
})();

/* ------------------------------------------------------------------- as fontes

   CADA NOME ESCRITO NA PRÓPRIA FONTE: é o desenho da letra que se escolhe, e não o
   nome dela. A lista é a mesma do cadastro do template, com o mesmo filtro de
   personalizada e de favorita, porque duas bibliotecas para a mesma coisa acabam
   discordando. */
let AJ_FONTE_FILTRO = "todas";
function desenhaAsFontes(escolhida) {
  const casa = $("aj_fonte");
  if (!casa) return;
  const busca = ($("aj_fonte_busca").value || "").trim().toLowerCase();
  const lista = cdBiblioteca()
    .map(f => ({ ...f, valor: f.minha ? f.arquivo : f.chave }))
    .filter(f => {
      if (AJ_FONTE_FILTRO === "minhas" && !f.minha) return false;
      if (AJ_FONTE_FILTRO === "favoritas" && !f.favorita) return false;
      return !busca || f.nome.toLowerCase().includes(busca);
    });
  casa.innerHTML = lista.map(f =>
    `<button class="aj-fonte-b${f.valor === escolhida ? " on" : ""}" type="button"`
    + ` data-f="${escapa(f.valor)}">`
    + `<span class="aj-estrela${f.favorita ? " on" : ""}" data-fav="${escapa(f.chave)}">`
    + `<svg viewBox="0 0 24 24"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8`
    + ` 5.8 21.1 7 14.2 2 9.3l6.9-1z"/></svg></span>`
    + `<b style="font-family:${f.css}">${escapa(f.nome)}</b>`
    + `<span class="tipo${f.minha ? " minha" : ""}">${f.minha ? "Minha" : "Da Casa"}`
    + `</span></button>`).join("");
  const nada = $("aj_fonte_nada");
  nada.hidden = lista.length > 0;
  nada.textContent = busca
    ? `Nenhuma fonte com "${busca}" neste filtro.`
    : "Nenhuma fonte neste filtro.";
}
$("aj_fonte_filtro").onclick = ev => {
  const b = ev.target.closest("[data-q]");
  if (!b) return;
  AJ_FONTE_FILTRO = b.dataset.q;
  for (const x of $("aj_fonte_filtro").children) x.classList.toggle("on", x === b);
  desenhaAjustePainel();
};
$("aj_fonte_busca").oninput = () => desenhaAjustePainel();
$("aj_fonte").onclick = ev => {
  const estrela = ev.target.closest("[data-fav]");
  const p = pecas3()[AJ_I];
  if (estrela) {
    ev.stopPropagation();
    const ficha = cdFichaDasFavoritas();
    const chave = estrela.dataset.fav;
    const onde = ficha.chaves.indexOf(chave);
    if (onde >= 0) ficha.chaves.splice(onde, 1); else ficha.chaves.push(chave);
    gravarAcervo().catch(() => {});
    return desenhaAjustePainel();
  }
  const b = ev.target.closest("[data-f]");
  if (!b || !p) return;
  const alvo = elementoDaPeca(p.nome, AJ_SEL);
  if (!alvo) return;
  guardarOGesto();
  mexerItem(p.nome, alvo, "fonte", b.dataset.f);
  desenhaAjuste();
};

/* VOLTAR AO ENCAIXE: desfaz o tamanho e o deslize de uma vez, sem tocar na frase, na
   fonte nem na moldura. É o "reset" desta peça que ele procurava no botão de zerar,
   que apagava tudo. */
$("aj_encaixar").onclick = () => {
  const p = pecas3()[AJ_I];
  if (!p) return;
  guardarOGesto();
  mexerEnquadre(p.nome, "z", 1, true);
  mexerEnquadre(p.nome, "dx", 0, true);
  mexerEnquadre(p.nome, "dy", 0);
  desenhaAjustePainel();
};

/* --------------------------------------------------------------------- a fila

   COM QUINZE OU COM CENTO E OITENTA ELA É A MESMA FOLHA, e some assim que ele escolhe
   para onde ir. Os três números do placar abrem ela já filtrada: o número responde
   QUANTAS, e o clique responde QUAIS. */
let AJ_FILA_FILTRO = "todas";
function estadoDaPeca(nome) {
  if (PRONTAS.has(nome)) return "pronta";
  return (A_MAO.has(nome) || ENQUADRES.has(nome)) ? "ajuste" : "para-ver";
}
function desenhaAFila() {
  const casa = $("aj_folha_grade");
  if (!casa) return;
  const pecas = pecas3();
  const dentro = pecas.map((p, k) => ({ p, k }))
    .filter(({ p }) => AJ_FILA_FILTRO === "todas"
      || (AJ_FILA_FILTRO === "para-ver" && !PRONTAS.has(p.nome))
      || estadoDaPeca(p.nome) === AJ_FILA_FILTRO);
  casa.innerHTML = dentro.map(({ p, k }) => {
    const v = variacaoDaPeca(p.nome);
    const arte = v && ED_IMGS.get(v.arquivo);
    const estado = estadoDaPeca(p.nome);
    return `<button class="aj-cartao${k === AJ_I ? " agora" : ""}" type="button"`
      + ` data-k="${k}">`
      + (arte ? `<img src="${arte}" alt="">` : `<span class="vazio"></span>`)
      + `<span class="num">${k + 1}</span>`
      + (estado === "pronta"
        ? `<span class="sinal"><svg viewBox="0 0 24 24" fill="none"><path d="m20 6-11 11-5-5"/></svg></span>` : "")
      + (estado === "ajuste" ? `<span class="toque">Ajustada</span>` : "")
      + `</button>`;
  }).join("");
  const ir = $("aj_ir");
  ir.max = pecas.length;
  ir.value = AJ_I + 1;
}
function abrirAFila(filtro) {
  AJ_FILA_FILTRO = filtro || "todas";
  for (const b of $("aj_filtros").children) {
    b.classList.toggle("on", b.dataset.f === AJ_FILA_FILTRO);
  }
  desenhaAFila();
  $("aj_folha").hidden = false;
}
const fecharAFila = () => { $("aj_folha").hidden = true; };
$("aj_ver_fila").onclick = () => abrirAFila("todas");
$("aj_f_fechar").onclick = fecharAFila;
$("aj_folha").onclick = ev => { if (ev.target === $("aj_folha")) fecharAFila(); };
$("aj_filtros").onclick = ev => {
  const b = ev.target.closest("[data-f]");
  if (b) abrirAFila(b.dataset.f);
};
$("aj_folha_grade").onclick = ev => {
  const b = ev.target.closest("[data-k]");
  if (!b) return;
  fecharAFila();
  irParaAPeca(Number(b.dataset.k));
};
for (const [id, filtro] of [["aj_kpi_pronta_b", "pronta"], ["aj_kpi_falta_b", "para-ver"],
                            ["aj_kpi_mexida_b", "ajuste"]]) {
  $(id).onclick = () => abrirAFila(filtro);
}

/* ----------------------------------------------------------------- fabricar

   É O FIM DA LINHA, e por isso ele pergunta antes, com o número na frente. O aviso do
   navegador não serve: ele não é desta casa, e não sabe dizer quantas peças faltam
   assinar. */
function abrirOFabricar() {
  const pecas = pecas3();
  const faltam = pecas.length - PRONTAS.size;
  $("aj_fab_tit").textContent = faltam
    ? `Fabricar Com ${faltam} ${faltam === 1 ? "Peça" : "Peças"} Por Ver?`
    : "Fabricar As " + pecas.length + " Peças?";
  $("aj_fab_txt").textContent = faltam
    ? `Você assinou ${PRONTAS.size} de ${pecas.length}. As que faltam vão do jeito que `
      + "estão, com o enquadramento que a medida escolheu."
    : "Todas as peças estão assinadas. A fabricação começa agora e você acompanha a "
      + "barra aqui embaixo.";
  $("aj_folha_fab").hidden = false;
}
$("aj_fab_nao").onclick = () => { $("aj_folha_fab").hidden = true; };
$("aj_folha_fab").onclick = ev => {
  if (ev.target === $("aj_folha_fab")) $("aj_folha_fab").hidden = true;
};

/* ------------------------------------------------------------- o teclado

   TRÊS TECLAS, E TODAS DIZEM O QUE FAZEM NA TELA: Enter assina e segue, A abre a
   gaveta, Esc fecha o que estiver aberto. Atalho que não está escrito em lugar nenhum
   é atalho que só quem escreveu usa. */
window.addEventListener("keydown", ev => {
  if ($("ed_oficina").hidden || TPL_SUB !== 6 || EDIT_PASSO !== 3) return;
  const onde = ev.target;
  const escrevendo = onde && (onde.tagName === "TEXTAREA" || onde.tagName === "INPUT"
    || onde.isContentEditable);
  if (ev.key === "Escape") {
    if (!$("aj_folha_fab").hidden) return void ($("aj_folha_fab").hidden = true);
    if (!$("aj_folha").hidden) return fecharAFila();
    if ($("aj_gaveta").classList.contains("aberta")) return fecharGaveta();
    return;
  }
  if (escrevendo) return;
  if (ev.key === "Enter" && !$("aj_pronta").hidden) { ev.preventDefault(); $("aj_pronta").click(); }
  else if (ev.key === "a" || ev.key === "A") { ev.preventDefault(); $("aj_abrir_gaveta").click(); }
  else if (ev.key === "ArrowLeft") irParaAPeca(AJ_I - 1);
  else if (ev.key === "ArrowRight") irParaAPeca(AJ_I + 1);
});

/* ================================================ ARRASTAR A PEÇA COM O DEDO

   A QUEIXA, DE 23/08/2026: "nem a imagem que eu subi, nem o texto eu consigo arrastar.
   Só tem, tipo, se for lá por aquelas opções que tem tamanho e posição, assim eu não
   curto. Isso também inclui o recorte." Tinha razão nas três: acertar posição clicando
   em mais e menos é desenhar de olhos fechados.

   TRÊS ALVOS, DUAS CONTAS. Texto e imagem são itens do molde e andam mudando `x` e `y`
   daquela peça. A filmagem não anda: quem anda é o que aparece dentro da janela dela,
   que é o `dx` e o `dy` do enquadramento. O gesto é o mesmo, o efeito é diferente.

   `setPointerCapture` SEGURA O GESTO ATÉ SOLTAR. Sem ele, tirar o dedo de cima do item
   no meio do arrasto entrega o movimento para quem estiver embaixo, e o item para no
   meio do caminho. `pointer` e não `mouse` para o gesto valer igual no toque.

   NADA É GRAVADO NO MEIO DO GESTO: `anotarMexida` só é chamado ao soltar. Gravar a cada
   pixel poria o cofre para escrever dezenas de vezes por segundo. */
let AJ_ARRASTO = null;

$("aj_tela").addEventListener("pointerdown", ev => {
  if (ev.button != null && ev.button !== 0) return;   // só o botão principal
  const p = pecas3()[AJ_I];
  if (!p || !TPL) return;
  const caixa = $("aj_tela").getBoundingClientRect();
  /* A ALCA VEM ANTES DE TUDO, senao o clique nela cai no ramo de baixo e desmarca o
     que ele acabou de escolher: a moldura nao e' nem `.gal-el` nem `.gal-broll`. */
  const canto = ev.target.dataset ? ev.target.dataset.canto : null;
  if (canto && AJ_SEL) {
    const e = enquadreDe(p.nome);
    const el = AJ_SEL === "_broll" ? null : elementoDaPeca(p.nome, AJ_SEL);
    if (AJ_SEL !== "_broll" && !el) return;
    AJ_ARRASTO = { tipo: "tamanho", canto, nome: p.nome, quem: AJ_SEL, el, caixa,
                   x0: ev.clientX, y0: ev.clientY, es0: e.es, z0: e.z,
                   janela: !!janelaDaArte(p.nome),
                   tam0: el ? medidaDaPeca(el, p.nome).tamanho : 0, andou: false };
    $("aj_tela").classList.add("arrastando");
    try { ev.target.setPointerCapture(ev.pointerId); } catch (x) { /* rato sumiu */ }
    AJ_ARRASTO.alvo = ev.target;
    AJ_ARRASTO.dedo = ev.pointerId;
    ev.preventDefault();
    return;
  }
  const item = ev.target.closest(".gal-el");
  const broll = item ? null : ev.target.closest(".gal-broll");
  if (!item && !broll) { AJ_SEL = null; marcarEscolhido(); desenhaAjustePainel(); return; }

  if (item) {
    const el = elementoDaPeca(p.nome, item.dataset.id);
    if (!el) return;
    const m = medidaDaPeca(el, p.nome);
    AJ_ARRASTO = { tipo: "item", el, nome: p.nome, x0: ev.clientX, y0: ev.clientY,
                   ox: m.x, oy: m.y, caixa, andou: false };
    AJ_SEL = el.id;
  } else {
    /* ARRASTAR O B-ROLL MOVE A JANELA INTEIRA, com a filmagem dentro.

       A PRIMEIRA VERSÃO MOVIA A FILMAGEM DENTRO DE UMA JANELA PARADA, e era a coisa
       errada: "eu só consigo mexer dentro do quadrado, eu não consigo mexer todo o
       quadrado, ou seja, todo o B-roll". Pior, sem aproximar antes não havia sobra e o
       gesto não fazia nada, então parecia quebrado.

       AGORA O GESTO É O ÓBVIO: pegar e levar, o buraco e o vídeo juntos. Sempre funciona,
       sem depender de aproximação nenhuma. Quem escolhe o pedaço da filmagem que aparece
       lá dentro continua sendo o par aproximar mais deslizar, nos botões ao lado. */
    /* COM FURO DE ARTE, ARRASTAR DESLIZA A FILMAGEM DENTRO DO FURO.

       O QUE MUDOU EM 29/08/2026: a janela passou a ser o furo da arte, e furo nao anda.
       Arrastar continuava escrevendo `mx` e `my`, que o motor ignora desde que a arte
       ganhou variacoes: a tela mostrava a filmagem num lugar e o arquivo sairia com ela
       noutro. Agora o gesto escreve `dx` e `dy`, que e' o que o motor obedece. */
    const e = enquadreDe(p.nome);
    const lug = lugarDaFilmagem(p.nome);
    AJ_ARRASTO = { tipo: "broll", nome: p.nome, x0: ev.clientX, y0: ev.clientY,
                   janela: !!lug, kenc: lug ? lug.kenc : 1,
                   ox: lug ? e.dx : e.mx, oy: lug ? e.dy : e.my, caixa, andou: false };
    AJ_SEL = "_broll";
  }
  marcarEscolhido();
  desenhaAjustePainel();
  $("aj_tela").classList.add("arrastando");
  try { ev.target.setPointerCapture(ev.pointerId); } catch (e) { /* rato sumiu */ }
  AJ_ARRASTO.alvo = ev.target;
  AJ_ARRASTO.dedo = ev.pointerId;
  ev.preventDefault();
});

$("aj_tela").addEventListener("pointermove", ev => {
  const a = AJ_ARRASTO;
  if (!a) return;
  // EM FRAÇÃO DO QUADRO, e não em pixels: a peça na tela é uma redução do arquivo, e
  // tudo o que se guarda dela é fração. Assim o arrasto vale igual em qualquer tamanho.
  const fx = (ev.clientX - a.x0) / a.caixa.width;
  const fy = (ev.clientY - a.y0) / a.caixa.height;
  if (!a.andou && Math.abs(fx) < 0.002 && Math.abs(fy) < 0.002) return;
  a.andou = true;
  if (a.tipo === "tamanho") {
    /* AUMENTAR E DIMINUIR PELA ALCA.

       A CONTA SAI DA LARGURA, e nao da diagonal: puxar de lado e puxar na diagonal dao
       o mesmo resultado, que e' o que a mao espera de uma alca de canto. O sinal vem do
       canto: alca da esquerda cresce quando o dedo vai para a esquerda.

       O TEXTO CRESCE PELA LETRA, e nao pela caixa. Caixa de texto mais larga com a mesma
       letra nao e' "texto maior" para quem olha; e' a letra que se ve'. */
    const px = a.canto.includes("w") ? -1 : 1;
    if (a.quem === "_broll") {
      if (a.janela) {
        /* O FURO NAO MUDA DE TAMANHO, entao a alca APROXIMA a filmagem: e' o unico
           tamanho que existe nesta peca e e' o que o botao ao lado ja' mexia. */
        const z = Math.max(1, Math.min(3, a.z0 * (1 + fx * px * 2)));
        mexerEnquadre(a.nome, "z", Math.round(z * 100) / 100, true);
        return;
      }
      const r = BROLL_DE && BROLL_DE.get(a.nome);
      if (!r) return;
      mexerEnquadre(a.nome, "es",
                    Math.round((a.es0 + (fx * px) / r.w) * 1000) / 1000, true);
    } else {
      const fator = 1 + (fx * px) / Math.max(0.05, a.el.w);
      const t = Math.max(0.008, Math.min(0.25, a.tam0 * fator));
      mexerItem(a.nome, a.el, "tamanho", Math.round(t * 10000) / 10000, true);
    }
  } else if (a.tipo === "item") {
    mexerItem(a.nome, a.el, "x", Math.round((a.ox + fx) * 1000) / 1000, true);
    mexerItem(a.nome, a.el, "y", Math.round((a.oy + fy) * 1000) / 1000, true);
  } else if (a.janela) {
    /* A FILMAGEM DESLIZA DENTRO DO FURO. O dedo anda em fracao do QUADRO e `dx` mede na
       regua do encaixe, entao a conversao e' a divisao pelo `kenc`: sem ela, uma
       filmagem que entrou 25% maior andaria 25% mais do que o dedo. O limite de nao
       abrir tarja mora no `mexerEnquadre`, num lugar so'. */
    mexerEnquadre(a.nome, "dx", Math.round((a.ox + fx / a.kenc) * 1000) / 1000, true);
    mexerEnquadre(a.nome, "dy", Math.round((a.oy + fy / a.kenc) * 1000) / 1000, true);
  } else {
    // A JANELA VAI PARA ONDE O DEDO LEVA. O limite de não sair da peça mora no
    // `mexerEnquadre`, num lugar só, porque os botões também precisam dele.
    mexerEnquadre(a.nome, "mx", Math.round((a.ox + fx) * 1000) / 1000, true);
    mexerEnquadre(a.nome, "my", Math.round((a.oy + fy) * 1000) / 1000, true);
  }
});

function largarOArrasto() {
  const a = AJ_ARRASTO;
  if (!a) return;
  AJ_ARRASTO = null;
  $("aj_tela").classList.remove("arrastando");
  try { a.alvo.releasePointerCapture(a.dedo); } catch (e) { /* já soltou */ }
  // SÓ AGORA VAI PARA O COFRE, e só se de fato andou: um clique para escolher o item
  // não é uma mexida e não deve gravar rascunho nenhum.
  if (a.andou) { desenhaAjustePainel(); anotarMexida(); }
}
$("aj_tela").addEventListener("pointerup", largarOArrasto);
$("aj_tela").addEventListener("pointercancel", largarOArrasto);

$("aj_fonte_alvo").addEventListener("click", ev => {
  const b = ev.target.closest("[data-el]");
  if (!b) return;
  AJ_SEL = b.dataset.el;
  marcarEscolhido();
  desenhaAjustePainel();
});

$("aj_fonte_todas").onclick = () => {
  const p = pecas3()[AJ_I];
  const el = p ? elementoDaPeca(p.nome, AJ_SEL) : null;
  if (!p || !el) return;
  const fonte = medidaDaPeca(el, p.nome).fonte;
  let n = 0;
  for (const outra of pecas3()) {
    const a = AJUSTES.get(outra.nome) || {};
    a[el.id] = Object.assign({}, a[el.id], { fonte });
    AJUSTES.set(outra.nome, a);
    A_MAO.add(outra.nome);
    n++;
  }
  parado("aj_recado", `A fonte passou para ${n} ${n === 1 ? "peça" : "peças"}.`);
  anotarMexida();
};

$("aj_broll_todas").onclick = () => {
  const p = pecas3()[AJ_I];
  if (!p) return;
  const e = enquadreDe(p.nome);
  const zerado = e.z === 1 && !e.dx && !e.dy;
  let n = 0;
  for (const outra of pecas3()) {
    // PEÇA SEM JANELA NÃO TEM O QUE REENQUADRAR, e escrever nela deixaria lixo no pedido.
    if (!BROLL_DE || !BROLL_DE.get(outra.nome)) continue;
    if (zerado) ENQUADRES.delete(outra.nome);
    else ENQUADRES.set(outra.nome, { z: e.z, dx: e.dx, dy: e.dy });
    A_MAO.add(outra.nome);
    n++;
  }
  parado("aj_recado", `O enquadramento passou para ${n} ${n === 1 ? "peça" : "peças"}.`);
  anotarMexida();
};

/* AVANCAR E' ASSINAR EMBAIXO, e por isso grava na hora.

   `salvarRascunho` DIRETO, e nao `anotarMexida`. O segundo espera seiscentos
   milissegundos a mao parar, o que e' certo para quem esta' arrastando um controle e
   errado aqui: ele clica em avancar e a proxima peca ja' esta' na tela, com a mao longe
   do assunto. Um F5 nessa fresta perderia a aprovacao que ele acabou de dar. */
$("aj_pronta").onclick = () => {
  const pecas = pecas3();
  const p = pecas[AJ_I];
  if (!p) return;
  PRONTAS.add(p.nome);
  salvarRascunho();
  /* O SIM ELE VÉ ACONTECER. Sem isto o clique some sem resposta, e um botão que não
     responde é um botão que ele aperta de novo achando que falhou. */
  const bt = $("aj_pronta");
  bt.classList.remove("assinou");
  void bt.offsetWidth;
  bt.classList.add("assinou");
  if (AJ_I < pecas.length - 1) {
    AJ_I++; AJ_SEL = null;
    desenhaAjuste();
    return;
  }
  desenhaAjustePainel();
  const faltam = pecas.length - PRONTAS.size;
  parado("aj_recado", faltam
    ? `Era a última da fila. Ainda faltam ${faltam} para você ver.`
    : "Todas as peças foram vistas. Pode fabricar.");
};

$("aj_zerar").onclick = () => {
  const p = pecas3()[AJ_I];
  if (!p) return;
  AJUSTES.delete(p.nome);
  ENQUADRES.delete(p.nome);
  A_MAO.delete(p.nome);
  PRONTAS.delete(p.nome);      // voltou ao molde: nao esta' mais aprovada
  parado("aj_recado", "Esta peça voltou ao molde. O texto escrito continua como está.");
  desenhaAjuste();
  anotarMexida();
};

$("ajs_acertar").onclick = () => {
  const campos = abertas();
  if (!campos.length) return parado("apl_resumo", "As variações desta conta não têm "
    + "faixa de escrita: abra o cadastro do template e arraste a faixa na arte.");
  let mexidas = 0, subidas = 0, encolhidas = 0;
  for (const p of pecas3()) {
    const g = ESCRITO.get(p.nome) || {};
    for (const c of campos) {
      const texto = (g[c.id] || c.texto || "").trim();
      if (!texto) continue;
      // TAMANHO ESCOLHIDO A DEDO NAO SE DESFAZ SOZINHO. Se ele abriu a peca na fase 5
      // e mexeu na letra, o automatico passar por cima seria o programa discutindo com
      // ele. Quem mexeu com a mao manda, e este botao pula a peca.
      const ja = (AJUSTES.get(p.nome) || {})[c.id];
      if (ja && ja.aMao) continue;
      const acerto = acertarTexto(c, texto, ateOndeDesce(c, p.nome));
      const a = AJUSTES.get(p.nome) || {};
      // O ACERTO VELHO SAI ANTES DE O NOVO ENTRAR. Texto que ficou mais curto tem de
      // poder voltar ao tamanho e ao lugar do molde, e nao carregar o aperto antigo.
      const novo = Object.assign({}, a[c.id]);
      const antes = JSON.stringify(novo);
      delete novo.y; delete novo.tamanho;
      Object.assign(novo, acerto);
      if (JSON.stringify(novo) === antes) continue;
      if (Object.keys(novo).length) a[c.id] = novo; else delete a[c.id];
      if (Object.keys(a).length) AJUSTES.set(p.nome, a); else AJUSTES.delete(p.nome);
      if (acerto.tamanho != null) encolhidas++; else if (acerto.y != null) subidas++;
      mexidas++;
    }
  }
  desenhaGaleria();
  // E VAI PARA O RASCUNHO, como toda outra mexida da galeria. Este botao pode mexer nas
  // 107 pecas de uma vez e era o unico da fase que nao gravava nada: bastava um F5 para
  // o acerto inteiro sumir e ele ter de clicar de novo.
  if (mexidas) anotarMexida();
  // O RECADO DIZ O QUE FOI FEITO, e a diferenca importa: subir e' de graca, encolher
  // custa a manchete. Ele tem de saber em quantas o programa precisou apelar.
  parado("apl_resumo", mexidas
    ? [subidas ? `${subidas} ${subidas === 1 ? "subiu" : "subiram"} para caber` : "",
       encolhidas ? `${encolhidas} ${encolhidas === 1 ? "precisou" : "precisaram"} `
         + "encolher, porque nem no alto cabia" : ""].filter(Boolean).join(", ") + "."
    : "Todos os textos já cabem do jeito que estão.");
};

/* QUANTO A LETRA PRECISA ENCOLHER para o texto caber em três linhas dentro da caixa. A
   medida sai do próprio navegador, com a fonte e o peso reais, então bate com o que o
   `oficina.py` vai desenhar. */
/* QUANTO A LETRA PRECISA ENCOLHER para o texto caber na caixa E NAO ENCOSTAR NO B-ROLL.

   ATE' 22/08/2026 ESTA CONTA SO' OLHAVA A LARGURA. Ela encolhia a letra ate' o texto
   caber em tres linhas, e tres linhas de letra grande descem muito: onde a filmagem
   comecava mais alto, a terceira linha caia em cima dela. A frase dele, olhando a leva
   montada: "o texto ta' caindo em cima do B-roll, nao teve um ajuste nenhum de
   disposicao".

   AGORA SAO DUAS CONTAS AO MESMO TEMPO: cabe na largura da caixa, e o pe' do texto para
   antes de `limite`, que e' o topo da filmagem DAQUELA peca. Ver `ateOndeDesce`.

   ENTRELINHA DE 1,22, e o numero nao e' escolha minha: e' o que a folha de estilo usa em
   `.gal-el` e o que o `oficina.py` desenha, na linha `altura_linha = int(tamanho *
   1.22)`. Medir com um numero e desenhar com outro daria texto certo na tela e errado no
   arquivo, que e' o pior tipo de erro daqui. Se mudar num lugar, muda nos tres. */
const ENTRELINHA = 1.22;

function tamanhoQueCabe(campo, texto, limite) {
  const c = document.createElement("canvas").getContext("2d");
  const larguraPx = campo.w * TELA.w;
  const LINHAS = 3;
  // A ALTURA QUE SOBRA ENTRE O TOPO DA CAIXA E O QUE VEM DEPOIS DELA.
  const alturaPx = ((limite == null ? 1 : limite) - campo.y) * TELA.h;
  let t = campo.tamanho;
  for (let volta = 0; volta < 60; volta++) {
    const px = Math.round(t * TELA.h);
    c.font = `${campo.peso} ${px}px ${fonteCss(campo.fonte)}`;
    let linhas = 1, larg = 0;
    for (const palavra of String(texto).split(/\s+/)) {
      const m = c.measureText((larg ? " " : "") + palavra).width;
      if (larg + m > larguraPx && larg) { linhas++; larg = c.measureText(palavra).width; }
      else larg += m;
    }
    if (linhas <= LINHAS && linhas * px * ENTRELINHA <= alturaPx) return t;
    t *= 0.94;
  }
  return t;
}

/* MEDE O TEXTO NUM TAMANHO: quantas linhas dá, e quanta altura ocupa.

   A MESMA MEDIDA QUE O `tamanhoQueCabe` FAZ POR DENTRO, separada para poder ser
   perguntada sem que nada encolha. É o que permite descobrir que o texto CABE, só
   está no lugar errado. */
function medirTexto(campo, texto, tamanho) {
  const c = document.createElement("canvas").getContext("2d");
  const px = Math.round(tamanho * TELA.h);
  c.font = `${campo.peso} ${px}px ${fonteCss(campo.fonte)}`;
  const larguraPx = campo.w * TELA.w;
  let linhas = 1, larg = 0;
  for (const palavra of String(texto).split(/\s+/)) {
    const m = c.measureText((larg ? " " : "") + palavra).width;
    if (larg + m > larguraPx && larg) { linhas++; larg = c.measureText(palavra).width; }
    else larg += m;
  }
  return { linhas, altura: (linhas * px * ENTRELINHA) / TELA.h };
}

/* O MAIS ALTO QUE O TEXTO PODE SUBIR. Acima disto ele encosta na borda de cima da peça,
   e o que se ganha de espaço se perde de acabamento. */
const TETO_DO_TEXTO = 0.02;

/* O QUE ESTA PEÇA PRECISA PARA O TEXTO CABER SEM BATER NO B-ROLL.

   ELE CORRIGIU A ORDEM, em 23/08/2026: "não era pra encolher, é pra ajustar". Estava
   certo, e o defeito era de raciocínio: o programa tratava a letra grande como o
   problema, quando o problema era o texto estar começando baixo demais. Encolher a
   manchete é estragar a peça para resolver o que uma subida resolvia.

   ENTÃO A ORDEM PASSOU A SER OUTRA, e é sempre esta:

     1. cabe onde está    não mexe em nada
     2. cabe mais acima   sobe o texto, e a letra fica do tamanho do molde
     3. não cabe nem no alto   aí sim encolhe, do topo, e o mínimo possível

   DEVOLVE SEMPRE O ACERTO INTEIRO, e um objeto vazio quando não precisa de nada. Quem
   chama apaga o acerto velho antes de pôr este, senão um texto que ficou mais curto
   continuaria carregando o encolhimento de quando era longo. */
function acertarTexto(campo, texto, limite) {
  const teto = limite == null ? 1 : limite;
  const m = medirTexto(campo, texto, campo.tamanho);
  if (m.linhas <= 3 && campo.y + m.altura <= teto) return {};        // 1
  if (m.linhas <= 3) {
    const y = teto - m.altura;
    if (y >= TETO_DO_TEXTO) return { y: Math.round(y * 1000) / 1000 };   // 2
  }
  const doAlto = Object.assign({}, campo, { y: TETO_DO_TEXTO });          // 3
  return { y: TETO_DO_TEXTO, tamanho: tamanhoQueCabe(doAlto, texto, teto) };
}

/* ------------------------------------------------- as fases */

function podeIrAoSub(n) {
  // A FASE DA IA E' A 4 desde que o modelo do template virou a 1 (26/08/2026). Escrito
  // como `>= 3` a trava passou a barrar a tela de IMAGENS, que nao tem nada com texto.
  // NO CAMINHO DA CONTA (trava 62) nao ha' caixa avulsa: a escrita de cada peca vem da
  // VARIACAO dela (topo e altura), entao conta definida vale como texto para a IA.
  if (n >= 4 && !soTexto().length && !(TPL && TPL.contaModelo)) return false;
  return true;
}

// AS FASES DO PASSO 3 SAO QUATRO desde 27/08/2026 a' noite ("remover essas duas
// coisas da subetapa"): Caixas De Texto (2) e Imagens Do Template (3) sairam do
// caminho, e a faxina do mesmo dia levou as telas e o editor de elementos junto.
// Os numeros 2 e 3 NAO se reaproveitam: rascunho antigo ainda os guarda, e quem
// apontar para eles cai na escrita. A barrinha conta pela POSICAO no trilho.
/* A ORDEM DA BARRINHA NAO E' A DOS NUMEROS. Os numeros das telas ficaram como
   nasceram (mexer neles quebraria rascunho gravado); o que mudou em 29/08/2026 foi o
   LUGAR de cada uma no caminho: com as previas fora, a revisao peca a peca vem antes e
   a fabricacao passa a ser a ultima parada. */
const POSICAO_DA_SUB = { 1: 0, 4: 1, 6: 2, 5: 3 };

/* O MODO ESTEIRA VALE PARA UMA FASE SÓ, e por isso ele se decide a partir das DUAS
   coordenadas, e não de uma. Amarrado só ao sub-passo, ele sobrevivia à volta para o
   passo 1: a lista das 180 peças abria em tela cheia, sem trilho e sem cabeçalho, com
   cara de outra tela. Vale a pena chamar de todo lugar que muda passo ou sub-passo. */
function porOModoEsteira() {
  const tela = document.getElementById("ed_oficina");
  const naEsteira = EDIT_PASSO === 3 && TPL_SUB === 6;
  if (tela) tela.classList.toggle("esteira-aberta", naEsteira);

  /* O SAIR ENTRA NA FILEIRA DO CABEÇALHO, e para de flutuar por cima dela.

     A VERSÃO ANTERIOR ERA UM NÚMERO MÁGICO: o botão ficava `position:fixed` no canto e
     o cabeçalho reservava um tanto de espaço para ele não cair em cima do "Fabricar A
     Leva". Medido em 02/09/2026 com a gaveta ABERTA: o Fabricar terminava em 1400 e o
     Sair começava em 1381, dezenove pixels DENTRO dele. A reserva de 142px tinha sido
     calculada com o botão de 112, e ele passou a medir 143 ao ganhar a roupa nova.

     RESERVA ESCRITA À MÃO ENVELHECE COM O TEXTO DO BOTÃO. Aqui ele vira o quarto item
     do `.aj-cab-dir`, e a fileira se resolve sozinha: sem reserva, sem `right` composto
     para fugir da gaveta, e sem como colidir. É também o que a maquete faz com os
     controles dela, que estão todos no fluxo. */
  const sair = document.querySelector(".ed-sair");
  if (!sair) return;
  const naFileira = document.querySelector(".ed-sub-tela[data-sub='6'] .aj-cab-dir");
  const casaAntiga = document.getElementById("ed_oficina");
  if (naEsteira && naFileira) {
    if (sair.parentElement !== naFileira) naFileira.appendChild(sair);
  } else if (!naEsteira && casaAntiga && sair.parentElement !== casaAntiga) {
    // VOLTA PARA A OFICINA quando ele sai da fase: nas outras fases o botão é o canto
    // solto de sempre, e deixá-lo dentro de um cabeçalho escondido some com ele.
    casaAntiga.insertBefore(sair, casaAntiga.firstChild);
  }
}

function irParaSub(n) {
  if (n === 2 || n === 3) n = 4;
  if (!podeIrAoSub(n)) return;
  TPL_SUB = n;
  document.querySelectorAll('.ed-etapa[data-passo="3"] .ed-sub-tela').forEach(t =>
    t.hidden = Number(t.dataset.sub) !== n);
  /* AS FASES DESLIZARAM UM NUMERO em 26/08/2026, quando o modelo do template virou a 1:
     4 a IA, 5 a previa, 6 a peca a peca. Os `n !==` sao os que APAGAM video: errar
     neles nao da' erro na tela, deixa filmagem viva atras dela. */
  // SAIR DA PECA A PECA FECHA O VIDEO. Sem isto ele fica vivo atras da tela.
  //
  // A GRADE DA PREVIA SAIU EM 29/08/2026 e com ela a segunda linha desta limpeza: nao
  // ha' mais 180 videos desenhados de uma vez, e o unico que fica vivo e' o da revisao.
  if (n !== 6 && AJ_VIVO) { apagarPeca(AJ_VIVO); AJ_VIVO = null; }
  if (n !== 1) pararOModelo();
  if (n === 1) entrarNoModelo();
  if (n === 4) entrarNaIA();
  if (n === 5) desenhaGaleria();
  moverAObraPara(n);
  /* A REVISÃO TOMA A TELA, e as outras fases devolvem.

     A MAQUETE QUE ELE APROVOU É A TELA INTEIRA: peça no meio, vizinhas dos lados,
     rodapé de comando embaixo. Dentro da grade de duas colunas da oficina ela nascia
     com o trilho comendo 250 pixels e a peça sobrando com o resto, que foi exatamente
     a diferença que ele fotografou em 02/09/2026 ("não tá nada igual"). */
  porOModoEsteira();
  if (n !== 6) { fecharGaveta(); fecharAFila(); $("aj_folha_fab").hidden = true; }
  if (n === 6) entrarNoAjuste();
  desenhaSubTrilho();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function desenhaSubTrilho() {
  document.querySelectorAll("#ed_sub3 li").forEach(li => {
    const q = Number(li.dataset.sub);
    li.classList.toggle("agora", q === TPL_SUB);
    li.classList.toggle("feito", q < TPL_SUB);
  });
  /* O RESUMO CONTA O QUE EXISTE HOJE: pecas escritas, e nao caixas de texto. Ele
     ficou preso em "a montar" para sempre quando as caixas sairam, porque contava
     justamente o que tinha sido excisado. */
  const campos = abertas();
  const total = pecas3().length;
  let escritas = 0;
  if (campos.length) {
    for (const p of pecas3()) {
      const g = ESCRITO.get(p.nome) || {};
      if (campos.every(c => (g[c.id] || "").trim())) escritas++;
    }
  }
  $("ed_r3").textContent = !total ? "a montar"
    : !TPL.contaModelo ? "sem modelo"
    : escritas ? `${escritas} de ${total} escritas`
    : `${total} ${total === 1 ? "peça" : "peças"}, sem frase ainda`;
  const b = document.querySelector('#ed_trilho .ed-ponto[data-passo="3"] .ed-barra b');
  // SEIS FASES, ENTAO O DENOMINADOR E' CINCO. Ele nao e' constante generica: e' "quantas
  // fases menos uma", e ficou em quatro quando a sexta entrou.
  if (b && EDIT_PASSO === 3) {
    b.style.height = ((POSICAO_DA_SUB[TPL_SUB] || 0) / 3 * 100) + "%";
  }
}

document.querySelectorAll("#ed_sub3 li").forEach(li => {
  li.onclick = () => irParaSub(Number(li.dataset.sub));
});
$("ed_vai_ajuste").onclick = () => irParaSub(5);
// O VOLTAR DA ESCRITA LEVA AO MODELO. Ele levava a's Imagens Do Template, que nao
// existem mais, e desde a excisao era um botao que nao fazia nada.
$("ed_volta_imagens").onclick = () => irParaSub(1);
$("ed_volta_ia").onclick = () => irParaSub(4);
$("ajs_um_a_um").onclick = () => irParaSub(6);
// O VOLTAR A' VISAO GERAL SAIU COM A VISAO GERAL (29/08/2026). Fabricar e' o botao
// ao lado, e o trilho continua levando a qualquer fase.
/* FABRICAR SEM SAIR DAQUI. O botao e a barra de progresso moram na primeira olhada, e
   duplicar aquela maquinaria toda so' para ter um segundo botao seria duas verdades
   sobre a mesma obra. Entao ele volta e clica: uma linha, e o que ele ve' e' o mesmo. */
/* A OBRA SE MUDA PARA A FASE ONDE ELE ESTA'.

   O QUE ELE VIU, em 23/08/2026: "cliquei em fabricar... ah, ele volta pra etapa
   anterior, é? Não entendi, tá meio bugado. Era pra ele avançar". Tinha razão. Mandar
   fabricar da fase 5 chutava ele de volta para a primeira olhada, porque a barra de
   progresso e o aviso de terminado moravam lá. Ele pediu o óbvio: fabricar dali mesmo,
   "e apareceria uma barra abaixo, que nem é feita na etapa da IA escreve".

   MUDAR O ELEMENTO DE LUGAR, e não fazer uma segunda barra. Duas barras seriam dois
   conjuntos de identificadores para o mesmo estado, e a montagem escreveria em um
   enquanto ele olharia o outro. Aqui é o mesmo elemento, com o mesmo nome, morando ora
   numa fase ora na outra. O que já estava escrito nele continua valendo. */
function moverAObraPara(sub) {
  const casa = sub === 6 ? $("aj_obra_casa") : $("apl_obra_casa");
  const obra = $("apl_obra"), feito = $("apl_feito");
  if (obra && obra.parentElement !== casa) casa.appendChild(obra);
  // O AVISO DE TERMINADO SEGUE A OBRA na fase 5; na primeira olhada ele volta para o
  // pé, ao lado do resumo, que é onde foi desenhado para ficar.
  const casaDoFeito = sub === 6 ? casa : $("apl_feito_casa");
  if (feito && feito.parentElement !== casaDoFeito) casaDoFeito.appendChild(feito);
}

/* FABRICAR DAQUI LEVA O OLHO ATÉ A OBRA.

   ELE PEDIU EM 29/08/2026: "quando clicar em fabricar, eu também quero o loading, que
   nem tem na etapa de recorte". A barra já existia e já se mudava para esta fase, mas
   ela mora no PÉ, abaixo da peça: clicar no topo e não ver nada acontecer é o mesmo que
   não ter barra nenhuma. Agora a página desce até ela e a caixa acende por um instante,
   que é o que diz "é aqui que a coisa está acontecendo". */
/* FABRICAR PERGUNTA ANTES, com o número das que faltam na frente: é o fim da linha
   da leva inteira, e não dá para desfazer clicando de novo. */
$("aj_montar").onclick = abrirOFabricar;
$("aj_fab_sim").onclick = () => {
  $("aj_folha_fab").hidden = true;
  fecharGaveta();
  $("apl_montar").click();
  requestAnimationFrame(() => {
    const caixa = $("apl_obra");
    if (!caixa) return;
    caixa.classList.remove("chegou");
    void caixa.offsetWidth;
    caixa.classList.add("chegou");
  });
};

/* RETOMAR UM RASCUNHO. O que se recupera é onde ele parou e qual template estava na
   bancada; o resto vem do disco, que é onde ele de fato mora. Enquanto as peças não
   chegam, o pedido de retomada fica pendurado: a permissão da pasta só é dada depois de
   um clique, e sem pasta não há recorte nem acervo para abrir. Foi exatamente esse o
   sintoma que travou o rascunho no primeiro sub-passo. A declaracao de `RETOMAR` mora
   la' em cima, junto do `EDIT_RASCUNHO`, porque o `salvarRascunho` consulta ela. */

async function tentarRetomar() {
  if (!RETOMAR) return;
  if (!EDIT_PECAS.length) return;         // espera a pasta ser liberada
  const r = RETOMAR;
  RETOMAR = null;
  if (!ACERVO.itens.length) await lerAcervo();
  /* DE ONDE VEM O DESENHO DO TEMPLATE: do rascunho ou do acervo, o que for mais novo.

     O acervo só recebe o template quando ele clica em "Guardar no acervo" ou em
     "Montar". O rascunho recebe a cada mexida. Na esmagadora maioria das vezes o
     rascunho é o mais novo, e é ele que traz de volta a cor de fundo e as caixas de
     texto que ele acabou de fazer. O arquivo ainda ganha quando for mais recente, o que
     acontece se a mesma composição tiver sido gravada por fora depois da última
     mexida aqui. Comparar as duas horas é o único jeito honesto de escolher.

     ATÉ 22/08/2026 SÓ O ARQUIVO EXISTIA AQUI, e por isso quem tinha desenhado sem
     clicar em guardar voltava para um template preto e vazio. */
  if (r.template) {
    let doArquivo = null, arquivoEm = 0;
    const arq = await arquivoDoAcervo(r.template + ".json");
    if (arq) {
      try {
        doArquivo = JSON.parse(await arq.text());
        arquivoEm = arq.lastModified || 0;
      } catch (e) { doArquivo = null; }
    }
    const doRascunho = (r.desenho && r.desenho.id === r.template) ? r.desenho : null;
    TPL = (doRascunho && (!doArquivo || (r.desenhoEm || 0) >= arquivoEm))
      ? doRascunho : doArquivo;
    if (TPL) {
      TPL.id = r.template;
      TPL.elementos = TPL.elementos || [];
    }
  }
  // O TRABALHO VOLTA ANTES DA TELA SE DESENHAR, senão a galeria pinta as peças vazias e
  // só depois descobre que havia texto: ele veria tudo em branco por um instante.
  ESCRITO.clear();
  for (const [k, v] of Object.entries(r.escrito || {})) ESCRITO.set(k, v);
  /* E O QUE A CASA GUARDA COMPLETA O QUE FALTAR.
     Retomar limpa o `ESCRITO` e o repovoa a partir do rascunho, entao ele passava por
     cima das frases que o disco tinha acabado de devolver: rascunho gravado ANTES de a
     IA escrever (ou de antes deste conserto) traz `escrito` vazio, e o vazio dele ganhava
     das 180 frases ja' pagas. Aqui elas voltam para as pecas que ficaram sem nenhuma. */
  completarComAsFrasesDaCasa();
  AJUSTES.clear();
  for (const [k, v] of Object.entries(r.ajustes || {})) AJUSTES.set(k, v);
  ENQUADRES.clear();
  for (const [k, v] of Object.entries(r.enquadres || {})) ENQUADRES.set(k, v);
  A_MAO = new Set(r.aMao || []);
  // A ETAPA 4 VOLTA JUNTO. Rascunho de antes de 23/08/2026 não tem estes campos, e o
  // vazio é a resposta certa: a etapa não existia quando ele foi gravado.
  DESCRICOES.clear();
  for (const [k, v] of Object.entries(r.descricoes || {})) DESCRICOES.set(k, v);
  RODAPE = r.rodape != null ? r.rodape : RODAPE_PADRAO;
  if ($("dsc_max")) $("dsc_max").value = r.limite || 500;
  LEG_SUB = Math.min(2, Math.max(1, r.subLeg || 1));
  // RASCUNHO VELHO NAO TEM ESTE CAMPO, e a lista vazia e' a resposta certa: nenhuma
  // peca foi dada por pronta porque a fase de dar por pronta nao existia ainda.
  PRONTAS = new Set(r.prontas || []);
  EXCLUIDAS = new Set(r.excluidas || []);
  desenhaPecas();                 // a galeria volta com as tiradas apagadas
  if (TPL) {
    await entrarNoTemplate();
    /* O TETO E' O NUMERO DE FASES, e ele ja' estava errado antes desta mexida: com cinco
       fases o teto era quatro, e quem dava F5 na peca a peca voltava na previa.

       E RASCUNHO VELHO E' TRADUZIDO: gravado antes de 26/08/2026 ele guarda a numeracao
       de cinco fases, em que 1 era o texto. Sem o `subv`, soma-se um, senao quem parou
       na previa (4) reabre na fase da IA. */
    const velho = !r.subv;
    const guardado = Math.max(1, r.sub || 1);
    const alvo = Math.min(6, velho ? guardado + 1 : guardado);
    if (alvo > 1) irParaSub(alvo);
  }
  /* OS VIGIAS VOLTAM DEPOIS DO F5, desde 25/08/2026. O rascunho guarda o id dos
     pedidos vigiados (ver `salvarRascunho`); aqui so' se rearma o que ainda esta'
     em curso. Pedido ja' fechado (ou sumido) NAO rearma: o re-scan de cada passo
     mostra o resultado, e rearmar em cima dele pintaria um erro falso de contato
     perdido num trabalho que terminou dias atras. */
  const vigias = r.vigias || {};
  /* VIVO E FECHADO SAO DUAS RETOMADAS, e nao uma. O rearme so' tratava pedido em
     curso: quem dava F5 DEPOIS do fim voltava para uma tela sem barra nenhuma, como
     se nada tivesse sido pedido ("um loading que nem sequer mais aparece como
     concluido", 26/08/2026). Pedido fechado agora rearma SEM relogio e olha uma vez:
     o proprio olhar desenha a barra cheia, os selos e o caminho da pasta. */
  const estadoDoPedido = async id => {
    try {
      let d = null;
      if (await postoDePe()) {
        const p = await noPosto("/pedido?id=" + encodeURIComponent(id));
        d = (p.tem && p.d) ? p.d : null;
      } else {
        const p = await pastaDo("pedidos", false);
        if (!p) return null;
        d = JSON.parse(await (await
          (await p.getFileHandle(id + ".andamento.json")).getFile()).text());
      }
      if (!d || d.erro) return null;
      return d.fim ? "fechado" : "vivo";
    } catch (e) { return null; }
  };
  if (vigias.rec && !REC_OBRA) {
    const como = await estadoDoPedido(vigias.rec.id);
    if (como === "vivo") {
      REC_OBRA = { id: vigias.rec.id, desde: vigias.rec.desde || Date.now(),
                   total: vigias.rec.total || 0, relogio: null };
      $("rec_obra").hidden = false;
      $("rec_obra").classList.remove("fechada");
      $("rec_fecho").hidden = true;
      desenhaTiras({ total: REC_OBRA.total, marcas: "", fim: false });
      $("rec_obra_txt").textContent = "trabalho em curso, vigia retomada";
      REC_OBRA.relogio = setInterval(olharORecorte, 3000);
      olharORecorte();
    } else if (como === "fechado") {
      REC_OBRA = { id: vigias.rec.id, desde: vigias.rec.desde || Date.now(),
                   total: vigias.rec.total || 0, relogio: null };
      $("rec_obra").hidden = false;
      olharORecorte();       // ve o fim e desenha a barra concluida, uma vez so'
    }
  }
  if (vigias.mont && !OBRA) {
    const como = await estadoDoPedido(vigias.mont.id);
    if (como === "vivo" || como === "fechado") {
      OBRA = { id: vigias.mont.id, desde: vigias.mont.desde || Date.now(),
               total: vigias.mont.total || 0, qual: vigias.mont.qual, relogio: null };
      $("apl_obra").hidden = false;
      document.querySelector("#apl_obra .cfg-girando").style.display =
        como === "vivo" ? "" : "none";
      $("apl_obra_txt").textContent = como === "vivo"
        ? "trabalho em curso, vigia retomada" : "";
      if (como === "vivo") OBRA.relogio = setInterval(olharAObra, 3000);
      olharAObra();
    }
  }
  if (vigias.ent && !ENT_OBRA) {
    const como = await estadoDoPedido(vigias.ent.id);
    if (como === "vivo" || como === "fechado") {
      ENT_OBRA = { id: vigias.ent.id, desde: vigias.ent.desde || Date.now(),
                   total: vigias.ent.total || 0, relogio: null, mudo: 0,
                   subir: vigias.ent.subir !== false };
      if (como === "vivo") {
        $("ent_subir").disabled = $("ent_so_pacote").disabled = true;
        $("ent_feito").hidden = true;
      }
      $("ent_obra").hidden = false;
      document.querySelector("#ent_obra .cfg-girando").style.display =
        como === "vivo" ? "" : "none";
      $("ent_obra_txt").textContent = como === "vivo"
        ? "trabalho em curso, vigia retomada" : "";
      const olhar = olharOPedido(ENT_OBRA, andouAEntrega, terminouAEntrega);
      if (como === "vivo") ENT_OBRA.relogio = setInterval(olhar, 3000);
      olhar();
    }
  }
  salvarRascunho();
}

/* ============================================ 3.1 · O MODELO DO TEMPLATE

   O QUE ESTA FASE FAZ, desde 27/08/2026: ele escolhe a CONTA, e nao uma arte. "Nao e'
   pra eu selecionar mais o template... vai ser uma separacao a nivel de conta. Essa
   conta vai ter os templates dela, vai ter as variacoes dela." As variacoes da conta
   vestem a leva PECA A PECA: para cada recorte, a montagem escolhe a variacao cujo
   furo melhor encaixa aquele B-roll.

   POR QUE POR MEDIDA E NAO POR NOME. As variacoes tinham nome de formato (Quadrado,
   Horizontal, Vertical, Tela Cheia) e ele cortou: "nao e' pra ter esses nomes". O que
   separa uma variacao da outra e' o furo dela, e o furo e' medido do arquivo; o
   recorte tambem e' medido (o retangulo do B-roll, do passo 2). Casar as duas medidas
   e' a mesma lei da trava 60: quem responde e' o arquivo, e nao um rotulo.

   O QUADRO DA DIREITA E' PROVA, e nao ilustracao: o video ali e' um recorte de
   verdade desta leva, na variacao que a medida escolheu, encaixado pela mesma conta
   que o motor vai refazer na hora de gravar. Trocar de peca troca de variacao quando
   a medida pede, e e' assim que ele VE o mecanismo escolhendo. */

let MP_CONTA = "";             // a conta na tela
let MP_PECA = -1;              // qual recorte veste o quadro da direita
let MP_VAR = null;             // a variacao que a medida escolheu para o recorte da vez
let MP_GERACAO = 0;            // quem pinta por ultimo manda; pintura velha desiste
let MP_VIDEO = null;           // o elemento do video, guardado uma vez
let MP_RETENTA = 0;            // tentativas de baixar de novo a arte que nao desceu
const MP_FURO_MINIMO = 0.02;

/* O VIDEO DO PALCO NAO SE PROCURA PELO ID toda vez: limpar o quadro tira a caixa da
   janela da pagina COM o video dentro, e ate' a proxima pintura o getElementById
   devolve nada; a pintura seguinte estourava encaixando um nulo. O elemento nasce uma
   vez no HTML, entao guardar a referencia resolve de vez. */
function videoDoModelo() {
  if (!MP_VIDEO) MP_VIDEO = $("mp_video");
  return MP_VIDEO;
}   // furo menor que isto e' respiro do desenho, nao janela

function artesDoAcervo() {
  return (ACERVO.itens || []).filter(x => x && x.tipo === "arte" && x.arquivo);
}

/** TODAS as contas com template, prontas ou nao. Esconder a conta sem furo foi o
    engano de 27/08/2026: ele cadastrou o Teste com artes exportadas sem o fundo
    transparente e a fase 1 disse "nenhuma conta com template ainda", com o template
    dele intacto no acervo. E' o falso relato da trava 2: a conta capenga APARECE,
    marcada, com a tela dizendo o que falta; sumir e' que nao pode. */
function contasComModelo() {
  return [...new Set((ACERVO.itens || [])
    .filter(x => x && x.tipo === "template" && x.conta)
    .map(x => x.conta))].sort();
}

/** As artes da conta como ELE as ve, com ou sem furo: e' por elas que a conta se
    reconhece no cartao, e e' nelas que o aviso de sem-furo aponta. */
function artesDaConta(conta) {
  const meus = new Set((ACERVO.itens || [])
    .filter(x => x && x.tipo === "template" && x.conta === conta).map(x => x.id));
  return artesDoAcervo().filter(a => meus.has(a.template));
}

/** As variacoes da conta: as artes COM FURO de todos os templates dela.

    DOIS TEMPLATES DA MESMA CONTA SOMAM num conjunto so', porque foi assim que ele
    descreveu ("essa conta vai ter os templates dela, vai ter as variacoes dela"): a
    peca procura o melhor furo entre tudo que a conta oferece. Arte sem furo nao entra,
    pela lei da trava 60: sem furo nao ha' onde a filmagem aparecer. */
function variacoesDaConta(conta) {
  const meus = new Set((ACERVO.itens || [])
    .filter(x => x && x.tipo === "template" && x.conta === conta).map(x => x.id));
  return artesDoAcervo().filter(a => meus.has(a.template) && a.furo && a.janela);
}

/* O TAMANHO LIMPO DA FILMAGEM, no encaixe que a peça pedir.

   COBRIR ERA A ÚNICA REGRA ATÉ 29/08/2026, e era ela que comia o B-roll. A justificativa
   escrita nos dois lados era "tarja preta dentro da moldura apareceria na peça pronta,
   beirada de filmagem perdida não". A premissa caiu quando ele olhou peça a peça: a arte
   dele JÁ TEM barra preta desenhada, então a tarja não é defeito, é o fundo do template.

   MEDIDO NAS 180 PEÇAS DA LEVA 31, com o retângulo do passo 2 e as quatro variações:

     cobrindo com a folga de 12%   73,9% do B-roll na mediana, 61,9% na pior
     cobrindo sem a folga          92,7% na mediana
     cabendo                       100% em todas, sem exceção

   E o preço de caber é pequeno: o furo fica com 7,3% de fundo da arte na mediana, 93%
   das peças ficam abaixo de dez por cento, e só UMA em 180 passa de vinte. A proporção
   do B-roll é quase a do furo que a medida escolhe (0,97 contra 1,05), e mesmo assim a
   regra mandava ampliar até transbordar.

   POR ISSO CABER VIROU O PADRÃO, e cobrir virou a escolha. Ficha sem `encaixe` é ficha
   nova: cabe. */
function kencDoEncaixe(b, jan, folga, encaixe) {
  const rw = jan.w / b.w, rh = jan.h / b.h;
  // A FOLGA SÓ EXISTE EM COBRIR: cabendo, o que fica de fora do B-roll não entra na
  // peça, porque o recorte para no próprio B-roll. Ver `recortarNaJanela`.
  return encaixe === "cobrir"
    ? Math.max(rw, rh) * (folga != null ? folga : FOLGA_DO_ENCAIXE)
    : Math.min(rw, rh);
}

/** Onde a filmagem entra: o retangulo do B-roll da peca posto DENTRO da janela da arte.
    Devolve o canto e o tamanho do video em fracao do quadro, a mesma conta dos dois lados. */
function encaixeNaJanela(broll, jan, z, dx, dy, folga, encaixe) {
  const b = (broll && broll.w > 0 && broll.h > 0) ? broll : { x: 0, y: 0, w: 1, h: 1 };
  const kenc = kencDoEncaixe(b, jan, folga, encaixe);
  /* APROXIMAR E DESLIZAR ENTRAM AQUI DESDE 29/08/2026, e antes nao entravam porque esta
     conta so' era usada na fase 1, onde nada foi ajustado ainda. A revisao precisa dela
     COM o ajuste, senao a peca desenhada nao e' a que vai sair do motor.

     O DESLIZE ANDA NA REGUA DO ENCAIXE (`kenc`) e nao na do quadro, exatamente como no
     `encaixe_na_janela` do oficina.py. Duas reguas diferentes para o mesmo `dx` fariam
     a tela e o arquivo discordarem calados. */
  const k = kenc * (z || 1);
  return { k, kenc,
           x: jan.x + jan.w / 2 - k * (b.x + b.w / 2) + kenc * (dx || 0),
           y: jan.y + jan.h / 2 - k * (b.y + b.h / 2) + kenc * (dy || 0) };
}

/* QUANTO A FILMAGEM PODE DESLIZAR DENTRO DO FURO DA ARTE.

   A SOBRA JA' EXISTE SEM APROXIMAR NADA, e era jogada fora. A filmagem entra doze por
   cento maior que o furo (a folga do encaixe, logo abaixo), e esses doze por cento sao
   margem de verdade: na peca 0001 da leva 31 dao 4,8% do quadro de um lado e 4,4% do
   outro. O limite velho, `(z - 1) / 2`, vem do tempo em que nao havia furo de arte
   nenhum, e com furo ele zera o gesto: arrastar a filmagem sem aproximar antes nao fazia
   nada, e gesto que nao faz nada se le como quebrado.

   O LIMITE E' NAO ABRIR TARJA. A filmagem anda ate' a borda dela encostar na borda do
   furo; um passo alem e o preto de fora entra na peca pronta. */
function folgaDoDeslize(broll, jan, z, folga) {
  const b = (broll && broll.w > 0 && broll.h > 0) ? broll : { x: 0, y: 0, w: 1, h: 1 };
  const kenc = Math.max(jan.w / b.w, jan.h / b.h) * (folga != null ? folga : FOLGA_DO_ENCAIXE);
  const k = kenc * (z || 1);
  return { fx: Math.max(0, (k * b.w - jan.w) / (2 * kenc)),
           fy: Math.max(0, (k * b.h - jan.h) / (2 * kenc)) };
}

/* A FOLGA DO ENCAIXE, caso real de 27/08/2026 a' noite: o recorte da fase 2
   preserva o reel INTEIRO de proposito ("e' para capturar 100% como e' o original"),
   entao a moldura arredondada e o preto do proprio reel vem gravados nos pixels da
   filmagem. Sem folga, o retangulo do B-roll cobria a janela mas os cantos redondos
   ALHEIOS apareciam dentro dela: "olha a borda curvada que nao ta' aparecendo... a
   diferenca entre esses dois ta' ficando preta". A filmagem entra 12% maior do que o
   justo, e esses cantos caem fora da moldura. Calibrado ao vivo na casa da rua, peca
   a peca: 1.10 esconde o canto do reel, 1.12 fica com margem; o preco e' perder ate'
   6% de beirada por lado, e beirada perdida nao aparece, preto alheio aparece. */
const FOLGA_DO_ENCAIXE = 1.12;

/* ATÉ ONDE A FILMAGEM DIMINUI. O piso era 1 nos dois lados, com a justificativa de que
   "menos que 1 deixaria borda preta dentro da janela". Com o encaixe de caber a peça
   nasce abaixo de 1 por definição, e o piso passa a ser só um limite de sanidade. */
const Z_MINIMO = 0.15;

/** O preco de vestir este B-roll com esta janela. Menor preco, melhor encaixe.

    SAO DUAS PENAS, e sao as duas queixas dele nas referencias de 27/08/2026. A de
    PROPORCAO: encaixar um B-roll quase de tela cheia numa janela media "perde muito do
    B-roll", porque cobrir corta o que a proporcao nao deixa entrar. A de TAMANHO:
    encaixar um B-roll pequeno numa janela grande fica "muito esticado, feio", porque a
    filmagem amplia alem do que o material tem. O logaritmo poe as duas na mesma regua:
    dobrar custa o mesmo que cair pela metade, para qualquer lado. */
function custoDoEncaixe(broll, jan) {
  const b = (broll && broll.w > 0 && broll.h > 0) ? broll : { x: 0, y: 0, w: 1, h: 1 };
  const proporcao = Math.abs(Math.log((b.w / b.h) / (jan.w / jan.h)));
  // O TAMANHO PAGA COM A FOLGA JUNTO, porque e' com ela que a filmagem vai vestir.
  const tamanho = Math.abs(Math.log(
    FOLGA_DO_ENCAIXE * Math.max(jan.w / b.w, jan.h / b.h)));
  return proporcao + tamanho;
}

/** A variacao que melhor veste este B-roll. Nulo quando nao ha' variacao nenhuma. */
function melhorVariacao(broll, variacoes) {
  let melhor = null, menor = Infinity;
  for (const v of (variacoes || [])) {
    const custo = custoDoEncaixe(broll, v.janela);
    if (custo < menor) { menor = custo; melhor = v; }
  }
  return melhor;
}

/** A variacao que veste ESTA peca da leva, pela conta gravada no rascunho.

    A ESCOLHA MORA AQUI, NUM LUGAR SO'. Ela e' feita na tela e viaja no pedido, peca a
    peca (arquivo e janela da variacao); o motor so' obedece. Duas implementacoes da
    escolha divergiriam caladas, que e' a mesma razao do encaixeNaJanela ser um so'. */
function variacaoDaPeca(nome) {
  if (!TPL || !TPL.contaModelo) return null;
  const todas = variacoesDaConta(TPL.contaModelo);
  /* A ESCOLHA DELE VENCE A DA MEDIDA, desde 29/08/2026.

     ATE' ENTAO NAO HAVIA COMO DISCORDAR. Ele fotografou um B-roll quadrado que saiu
     cortado e disse: "por algum motivo o sistema escolheu a variacao de template mais
     pequena, resultado: eu to com um B-roll cortado pela metade". A medida acertava a
     variacao de maior aproveitamento em 175 das 180 pecas da leva 31, mas jogava 147
     delas na MESMA variacao, e nao havia botao nenhum para trocar.

     A ESCOLHA GRAVADA QUE NAO EXISTE MAIS CAI FORA sozinha: variacao tirada do
     cadastro nao pode deixar a peca sem moldura, entao a medida volta a decidir. */
  const posta = (ENQUADRES.get(nome) || {}).moldura;
  if (posta) {
    const dele = todas.find(v => v.id === posta);
    if (dele) return dele;
  }
  return melhorVariacao(BROLL_DE && BROLL_DE.get(nome), todas);
}

/* ONDE A FILMAGEM APARECE NA PECA PRONTA, e foi aqui que a revisao mentia.

   O DEFEITO, MEDIDO EM 29/08/2026 na peca 0001 da leva 31 e nao suposto: o furo da arte
   vai de 0 a 100% da largura e de 25,8% a 79,6% da altura; a revisao desenhava a
   filmagem de 5,3% a 94,7% de largura e de 29,2% a 81,0% de altura. A diferenca e' o que
   ele fotografou: duas tarjas pretas de 5,3% dentro do furo, uma de cada lado, 3,4% de
   preto em cima e 1,4% de filmagem passando por baixo do furo. As "linhas cortando" sao
   essas beiradas, e o "recorte fora do lugar" e' a mesma medida vista de longe.

   SAO DOIS RETANGULOS DIFERENTES E EU USAVA UM PELO OUTRO:

     BROLL_DE      onde o B-roll estava no reel BAIXADO, medido pelo passo 2.
     janela        o furo da ARTE, medido do PNG no cadastro. E' a janela da peca.

   A PECA MONTADA ESTICA O PRIMEIRO ATE' COBRIR O SEGUNDO (`encaixe_na_janela`, no
   oficina.py) e nao aplica mascara nenhuma, porque o furo da propria arte ja' e' o
   formato. Agora a revisao faz a mesma coisa, com a mesma conta.

   RASCUNHO SEM FURO NENHUM cai fora daqui e segue pelo caminho velho, que e' o mesmo
   `else` que o motor tem: sem janela, mascara do passo 2 e a filmagem onde ela estava. */
function janelaDaArte(nome) {
  const v = variacaoDaPeca(nome);
  if (v && v.janela) return v.janela;
  return (TPL && TPL.janela) ? TPL.janela : null;
}

/** O retangulo da filmagem desta peca, ja' com o que ele aproximou e deslizou. */
function lugarDaFilmagem(nome) {
  const jan = janelaDaArte(nome);
  if (!jan) return null;
  const e = enquadreDe(nome);
  const enc = encaixeNaJanela(BROLL_DE && BROLL_DE.get(nome), jan,
                              e.z, e.dx, e.dy, e.folga, e.encaixe);
  return { jan, k: enc.k, kenc: enc.kenc, x: enc.x, y: enc.y };
}

/* UM DEDO ALEM DO FURO, para o serrilhado da arte nao virar linha.

   O FURO E' MEDIDO PELO PIXEL TOTALMENTE VAZIO, e a borda de um PNG desenhado tem uma
   fileira de pixels meio transparentes logo depois dela. Cortar a filmagem exatamente no
   retangulo medido deixaria essa fileira misturando arte com o PRETO do palco em vez de
   com a filmagem: um fio escuro em volta do furo, que e' o tipo de linha que ele viu. */
const RESPIRO_DO_FURO = 0.01;

/* RECORTA A CAIXA DA FILMAGEM NO FURO **E** NO B-ROLL, desde 29/08/2026.

   O QUE SOBRA DO REEL NÃO É PEÇA. Fora do retângulo do B-roll mora o resto do quadro do
   Instagram: canto arredondado, barra do aplicativo, nome de perfil. Cobrindo o furo
   isso nunca aparecia, porque o B-roll tapava tudo. Com o encaixe de caber apareceria
   nas beiradas, e a peça teria trocado corte por lixo. Cortando nos dois, o furo mostra
   B-roll ou o fundo da arte, e mais nada. */
function recortarNaJanela(caixa, jan, lugar, broll) {
  const r = RESPIRO_DO_FURO;
  let e = jan.x - r, t = jan.y - r;
  let d = jan.x + jan.w + r, f = jan.y + jan.h + r;
  if (lugar && broll && broll.w > 0 && broll.h > 0) {
    const bx = lugar.x + lugar.k * broll.x, by = lugar.y + lugar.k * broll.y;
    e = Math.max(e, bx); t = Math.max(t, by);
    d = Math.min(d, bx + lugar.k * broll.w);
    f = Math.min(f, by + lugar.k * broll.h);
  }
  caixa.style.clipPath = `inset(${t * 100}% ${(1 - d) * 100}% ${(1 - f) * 100}% `
    + `${e * 100}%)`;
  caixa.style.transformOrigin = "";
  caixa.style.transform = "";
}

/** Poe a filmagem no lugar dela dentro da peca. Em fracao do quadro, como o motor. */
function porFilmagemNoLugar(v, lugar) {
  if (!v || !lugar) return;
  // O `transform` SAI DE CENA: com furo de arte, aproximar e deslizar ja' estao na
  // medida. Deixa-lo aqui aplicaria a mesma aproximacao duas vezes.
  v.style.transform = "";
  v.style.left = (lugar.x * 100) + "%";
  v.style.top = (lugar.y * 100) + "%";
  v.style.width = (lugar.k * 100) + "%";
  v.style.height = (lugar.k * 100) + "%";
  // `inset:0` NO CSS PRENDE OS QUATRO LADOS, e canto mais tamanho ja' bastam.
  v.style.right = "auto";
  v.style.bottom = "auto";
}

/* A FRASE DA PECA MORA NA FAIXA DA VARIACAO, e nao mais numa caixa de template.

   O QUE MUDOU E POR QUE. Ate' 27/08/2026 quem dizia onde o texto ia era uma caixa
   desenhada na fase "Caixas De Texto". Essa fase saiu por ordem dele ("pode excluir de
   tudo"), e com ela foi embora o unico lugar que dizia onde escrever: a fase da IA
   passou a nao mostrar nada e a previa a mostrar 180 retangulos pretos.

   QUEM DIZ AGORA E' A PROPRIA ARTE. No cadastro, cada variacao tem uma faixa arrastavel
   ("A Escrita Fica Aqui"), e como cada peca veste a variacao que melhor lhe cabe, cada
   peca tem a sua faixa, sem ele escolher nada peca a peca.

   ELA VIRA UM ELEMENTO DE TEXTO NA HORA DE USAR, com id fixo `frase`. Assim tudo o que
   ja' existia continua valendo sem uma linha de mudanca: o pedido para a IA, o acerto
   do que nao coube, o tamanho e a fonte so' desta peca, o desenho da previa e o do
   motor. Um elemento sintetizado no lugar de um sistema paralelo. */
const ID_DA_FRASE = "frase";
const MARGEM_DA_FRASE = 0.06;      // um dedo de cada lado, para o texto nao encostar

/** A faixa de escrita da variacao que ESTA peca veste. Nula quando nao ha' variacao. */
function faixaDaPeca(nome) {
  const v = variacaoDaPeca(nome);
  return v && v.escrita ? v.escrita : null;
}

/* AS TRES PALAVRAS DO ALINHAMENTO, num lugar so'.

   O MOTOR SO' SABE ESTAS TRES (`alinha` em `pintar_camadas`: esquerda, direita e, em
   qualquer outro caso, centro). Oferecer uma quarta na tela seria botao que mente: a
   previa mostraria uma coisa e o arquivo sairia outra. */
const linhasDo = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ALINHAMENTOS = [
  { v: "esquerda", r: "À Esquerda", svg: linhasDo('<path d="M3 6h18M3 12h11M3 18h15"/>') },
  { v: "centro", r: "Centralizada", svg: linhasDo('<path d="M3 6h18M6 12h12M5 18h14"/>') },
  { v: "direita", r: "À Direita", svg: linhasDo('<path d="M3 6h18M10 12h11M6 18h15"/>') },
  { v: "justificado", r: "Justificada",
    svg: linhasDo('<path d="M3 6h18M3 12h18M3 18h18"/>') },
];
function alinhamentoCss(a) {
  return a === "esquerda" ? "left" : a === "direita" ? "right"
       : a === "justificado" ? "justify" : "center";
}

/* A LETRA QUE ELE SUBIU NO CADASTRO, achada pelo id OU pelo arquivo.

   POR QUE OS DOIS: o acervo guarda o id no template (`fonte: "f178..."`), e quem desenha
   de verdade quer o ARQUIVO. O `achar_fonte` do motor procura em `templates/` por nome de
   arquivo, e a folha de estilo desta tela registra a letra por id. Um so' dos dois nunca
   ia bastar. */
function fonteDoAcervo(v) {
  if (!v) return null;
  return (ACERVO.itens || []).find(
    x => x && x.tipo === "fonte" && (x.id === v || x.arquivo === v)) || null;
}

/* A BIBLIOTECA QUE A REVISAO OFERECE: as dele primeiro, depois as da casa.

   O QUE ELE DISSE EM 29/08/2026: "as fontes personalizadas que eu subi no cadastro de
   template deveriam aparecer". Nao apareciam: o painel oferecia a lista fixa de trinta
   familias da casa, e as dele so' existiam na tela de cadastro. */
function fontesParaEscolher() {
  const minhas = (ACERVO.itens || [])
    .filter(x => x && x.tipo === "fonte" && x.arquivo)
    .map(f => ({ v: f.arquivo, r: f.nome || f.arquivo, g: "Minhas" }));
  return minhas.concat(FONTES);
}

/** A fonte do template de onde saiu esta arte, já no nome que quem desenha entende.

    ELA SAIA COMO ID DO ACERVO, e ninguém sabia ler isso: `fonteCss` caía no Segoe UI da
    prévia e o `achar_fonte` do motor caía no `segoeui.ttf` do fim da fila. A letra que ele
    subiu no cadastro NUNCA foi usada, nem na tela nem no arquivo entregue, e em lugar
    nenhum aparecia erro. Achado em 02/09/2026, no template Teste da conta dele. */
function fonteDaArte(arte) {
  const t = arte && ACERVO.itens.find(x => x.id === arte.template);
  const v = (t && t.fonte) || "anton";
  const dele = fonteDoAcervo(v);
  return dele && dele.arquivo ? dele.arquivo : v;
}

/* O CAMPO SAI DA FAIXA, e as contas sao estas:

     o topo e a altura     vem da faixa, em por cento da peca, do jeito que ele arrastou
     a largura             a peca inteira menos um dedo de cada lado
     o tamanho da letra    DUAS LINHAS dentro da altura da faixa, com a entrelinha de
                           1,22 que a tela e o motor usam. Frase comprida encolhe
                           depois, no "Ajustar O Texto Que Nao Coube", que ja' existe.

   A COR E' BRANCA E O ALINHAMENTO E' CENTRAL. Nao ha' de onde tirar isso: a cor e o
   alinhamento eram da caixa, e a caixa morreu. Branco centralizado e' o que essas artes
   pedem, e ele muda peca a peca na fase de revisao. */
function campoDaFaixa(faixa, fonte) {
  if (!faixa) return null;
  return {
    id: ID_DA_FRASE, tipo: "texto", texto: "", trava: false,
    x: MARGEM_DA_FRASE, y: (faixa.topo || 0) / 100, w: 1 - MARGEM_DA_FRASE * 2,
    tamanho: Math.max(0.02, ((faixa.altura || 12) / 100) / (2 * 1.22)),
    fonte: fonte || "anton", peso: 700, cor: "#FFFFFF", alinha: "centro"
  };
}

/** Os elementos que ESTA peca desenha: os do template mais a frase da faixa dela. */
function elementosDaPeca(nome) {
  const base = (TPL && TPL.elementos) || [];
  const v = variacaoDaPeca(nome);
  const campo = v && campoDaFaixa(v.escrita, fonteDaArte(v));
  return campo ? base.concat([campo]) : base;
}

/** Um elemento desta peca pelo id, que pode ser a frase sintetizada. */
function elementoDaPeca(nome, id) {
  return elementosDaPeca(nome).find(x => x.id === id) || null;
}

/** Mede a arte subida: tamanho, retangulo do furo transparente e se ha' furo. */
async function medirAArte(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, nao) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => nao(new Error("não consegui abrir a arte"));
      i.src = url;
    });
    const lar = 200;
    const alt = Math.max(1, Math.round(lar * img.naturalHeight / img.naturalWidth));
    const c = document.createElement("canvas");
    c.width = lar; c.height = alt;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, lar, alt);
    const d = g.getImageData(0, 0, lar, alt).data;
    let x0 = lar, y0 = alt, x1 = -1, y1 = -1, vazios = 0;
    for (let y = 0; y < alt; y++) {
      for (let x = 0; x < lar; x++) {
        if (d[(y * lar + x) * 4 + 3] < 16) {
          vazios++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const furo = vazios > lar * alt * MP_FURO_MINIMO && x1 >= x0 && y1 >= y0;
    const arr = v => Math.round(v * 1e5) / 1e5;
    return {
      w: img.naturalWidth, h: img.naturalHeight, furo,
      janela: furo ? { x: arr(x0 / lar), y: arr(y0 / alt),
                       w: arr((x1 - x0 + 1) / lar), h: arr((y1 - y0 + 1) / alt) } : null
    };
  } finally { URL.revokeObjectURL(url); }
}

function desenhaAsContas() {
  const contas = contasComModelo();
  const l = $("mp_lista");
  // LEITURA QUE FALHOU NAO E' ACERVO VAZIO, trava 2: dizer "nenhuma conta" com os
  // templates dele intactos no disco e' o falso relato classico. O motivo aparece.
  if (ACERVO.falhou) {
    l.innerHTML = '<p class="nota mini ed-nada">não consegui ler o acervo: '
      + escapa(ACERVO.falhou) + "</p>";
    return;
  }
  if (!contas.length) {
    l.innerHTML = '<p class="nota mini ed-nada">nenhuma conta com template ainda</p>';
    return;
  }
  /* SEM PREVIEW, POR ORDEM DELE: "eu nao quero que apareca um preview da conta... no
     mais tardar apenas um cardzinho" (27/08/2026). O cardzinho diz a conta e lista os
     templates dela, cada um com o Abrir que leva ao cadastro carregado, para ver e
     mudar o que esta' gravado. Quem quer VER as variacoes abre: la' estao todas.
     O ATRIBUTO E' data-editar, e NAO data-abrir: data-abrir pertence aos links de
     abrir pasta, e um ouvinte no documento inteiro os atende; com o mesmo nome, o
     clique no Abrir do cardzinho caia la' tambem, e na casa que nao abre pastas o
     aviso "essa pasta mora na casa do Estudio" tomava o lugar do texto do botao e
     estourava o cartao de lado (o bug do cartao, 27/08/2026 a' noite). */
  l.innerHTML = contas.map(c => {
    const vs = variacoesDaConta(c);
    const meus = (ACERVO.itens || [])
      .filter(x => x && x.tipo === "template" && x.conta === c);
    return `<div class="mp-cartao mp-cartinha${c === MP_CONTA ? " sel" : ""}"
      data-conta="${escapa(c)}" title="${escapa(c)}">
      <div class="mp-cab"><b>${escapa(c)}</b>
        ${vs.length ? "" : '<span class="mp-sem-solto">Sem Furo</span>'}</div>
      <span class="mp-qtas">${vs.length === 1 ? "1 Variação"
        : vs.length ? vs.length + " Variações" : "nenhuma arte com furo"}</span>
      ${meus.map(m => `<div class="mp-tpl">
        <span>${escapa(m.nome || "sem nome")}</span>
        <button class="acao mini" type="button"
          data-editar="${escapa(m.id)}">Abrir</button></div>`).join("")}
      </div>`;
  }).join("");
}

/** Pinta o par: a variacao que a medida escolheu, crua e vestida com o recorte da vez. */
async function pintarOModelo(deNovo) {
  if (!deNovo) MP_RETENTA = 0;         // gesto novo zera a conta das retentativas
  /* DUAS PINTURAS SE ATROPELAM: a limpeza e' sincrona e o desenho vem depois de um
     await (a arte desce da rede na primeira vez). Dois cliques rapidos em Ver Outra
     Peça deixavam os quadros com as duas artes empilhadas, e a de baixo com o recado
     da outra (revisao de 27/08/2026). A geracao resolve: quem envelheceu desiste. */
  const ger = ++MP_GERACAO;
  const vars = variacoesDaConta(MP_CONTA);
  const qArte = $("mp_arte"), qPeca = $("mp_peca"), v = videoDoModelo();
  $("mp_usar").disabled = !vars.length;
  // SEM CONTA NENHUMA e' um caso; CONTA CAPENGA e' outro, e confundi-los foi o engano
  // de 27/08/2026: o Teste dele, com as quatro artes opacas, caia aqui como se nao
  // existisse, e ele leu "nenhuma conta" com o template intacto no acervo.
  if (!MP_CONTA) {
    MP_VAR = null;
    qArte.querySelectorAll(".mp-arte,.mp-vazia").forEach(x => x.remove());
    qPeca.querySelectorAll(".mp-arte,.mp-jan").forEach(x => x.remove());
    $("mp_recado").textContent = ACERVO.falhou
      ? "não consegui ler o acervo; os templates continuam no disco."
      : "Cadastre um template com variações para vestir esta leva.";
    return;
  }
  // A CONTA CAPENGA MOSTRA A PROPRIA ARTE E O MOTIVO. So' o recado, sem a arte na
  // frente, deixaria ele sem saber DE QUAL arquivo a tela esta' falando.
  if (!vars.length) {
    MP_VAR = null;
    const cara = artesDaConta(MP_CONTA)[0];
    const urlCrua = cara ? await enderecoDo(cara.arquivo) : null;
    if (ger !== MP_GERACAO) return;
    qArte.querySelectorAll(".mp-arte,.mp-vazia").forEach(x => x.remove());
    qPeca.querySelectorAll(".mp-arte,.mp-jan").forEach(x => x.remove());
    if (urlCrua) {
      const cru = document.createElement("img");
      cru.className = "mp-arte"; cru.alt = ""; cru.src = urlCrua;
      qArte.appendChild(cru);
    }
    $("mp_recado").textContent = "As artes de " + MP_CONTA + " estão sem o furo "
      + "transparente, e sem ele a filmagem não tem onde entrar: exporte cada PNG "
      + "com a janela vazada e troque as artes no cadastro.";
    return;
  }
  const peca = (MP_PECA >= 0 && EDIT_RECORTES[MP_PECA]) || null;
  MP_VAR = melhorVariacao(peca && BROLL_DE && BROLL_DE.get(peca.nome), vars) || vars[0];
  const url = await enderecoDo(MP_VAR.arquivo);
  if (ger !== MP_GERACAO) return;      // outra pintura assumiu enquanto a arte descia
  /* A ARTE QUE NAO DESCEU NAO VIRA IMAGEM QUEBRADA, caso real de 27/08/2026 na casa
     da rua: o posto engasgou por um instante, o endereco veio nulo, e a tela pintou os
     dois quadros com o icone de imagem quebrada dizendo por cima qual variacao vestia
     melhor (trava 2: a tela nao afirma o que nao mediu). A falta se diz, e a propria
     tela tenta baixar de novo, ate' tres vezes, antes de parar com o motivo na tela. */
  if (!url) {
    qArte.querySelectorAll(".mp-arte,.mp-vazia").forEach(x => x.remove());
    qPeca.querySelectorAll(".mp-arte,.mp-jan").forEach(x => x.remove());
    if (CASA_INFO && CASA_INFO.sessao === "vencida") {
      $("mp_recado").textContent = "A sessão venceu, e sem ela o posto não entrega "
        + "as artes: recarregue a página e entre de novo.";
      return;
    }
    if (MP_RETENTA < 3) {
      MP_RETENTA += 1;
      POSTO_DE_PE = null;              // o batimento se refaz na proxima tentativa
      $("mp_recado").textContent = "A arte da variação não desceu do posto; "
        + "vou tentar de novo em instantes.";
      setTimeout(() => { if (ger === MP_GERACAO) pintarOModelo(true); }, 2500);
    } else {
      $("mp_recado").textContent = "A arte da variação não desceu do posto, mesmo "
        + "tentando de novo: confira se ele está no ar e recarregue a página.";
    }
    return;
  }
  MP_RETENTA = 0;
  /* O PALCO SO' SE MEXE DEPOIS DA ESPERA, tudo de uma vez. Limpar antes do await
     deixava o video FORA da pagina no vao da descarga: a pintura seguinte procurava
     `mp_video` e achava nada, estourando no encaixe. Limpeza e desenho juntos, sem
     espera no meio, nao abrem esse vao. */
  qArte.querySelectorAll(".mp-arte,.mp-vazia").forEach(x => x.remove());
  qPeca.querySelectorAll(".mp-arte,.mp-jan").forEach(x => x.remove());
  const jan = MP_VAR.janela;

  // O QUADRO DA ESQUERDA: a variacao como ela e'. O furo aparece como encaixe vazio, e
  // nao como buraco preto, senao arte de fundo escuro parece imagem quebrada.
  const vazio = document.createElement("div");
  vazio.className = "mp-vazia";
  vazio.style.left = (jan.x * 100) + "%";
  vazio.style.top = (jan.y * 100) + "%";
  vazio.style.width = (jan.w * 100) + "%";
  vazio.style.height = (jan.h * 100) + "%";
  qArte.appendChild(vazio);
  const i1 = document.createElement("img");
  i1.className = "mp-arte"; i1.alt = ""; i1.src = url;
  /* O ENDERECO PODE ESTAR MORTO SEM SER NULO (foto devolvida por engano, cache velho):
     se a imagem nao abrir, o endereco sai do cache e a pintura se refaz pelo mesmo
     caminho da falta, com recado e com o mesmo teto de tentativas. */
  i1.onerror = () => {
    if (ger !== MP_GERACAO) return;
    ED_IMGS.delete(MP_VAR.arquivo);
    try { URL.revokeObjectURL(url); } catch (e) { /* endereco ja' devolvido */ }
    if (MP_RETENTA >= 3) {
      $("mp_recado").textContent = "A arte da variação não abre como imagem: "
        + "troque a arte no cadastro ou recarregue a página.";
      return;
    }
    MP_RETENTA += 1;
    pintarOModelo(true);
  };
  qArte.appendChild(i1);

  // O QUADRO DA DIREITA: a mesma variacao com a filmagem encaixada na janela.
  const caixa = document.createElement("div");
  caixa.className = "mp-jan";
  caixa.style.left = (jan.x * 100) + "%";
  caixa.style.top = (jan.y * 100) + "%";
  caixa.style.width = (jan.w * 100) + "%";
  caixa.style.height = (jan.h * 100) + "%";
  caixa.appendChild(v);
  // A FILMAGEM QUE AINDA NAO ABRIU SE DIZ: os recortes moram na casa da rua e podem
  // levar segundos descendo; quadro preto mudo parecia tela travada ("ta' tudo
  // cinza... que delay e' esse"). O aviso some no primeiro quadro do video.
  const espera = document.createElement("span");
  espera.className = "mp-descendo";
  espera.textContent = "Descendo A Filmagem…";
  caixa.appendChild(espera);
  qPeca.appendChild(caixa);
  const i2 = document.createElement("img");
  i2.className = "mp-arte"; i2.alt = ""; i2.src = url;
  qPeca.appendChild(i2);
  await vestirORecorte(ger);
  const qual = vars.indexOf(MP_VAR) + 1;
  $("mp_recado").textContent = vars.length === 1
    ? "A única variação de " + MP_CONTA + " veste esta peça."
    : "A variação " + qual + " de " + vars.length + " é a que melhor veste esta peça.";
}

/** Poe no quadro da direita o recorte da vez, encaixado na janela da variacao.

   O `ger` E' O DA PINTURA QUE CHAMOU, e ele existe por causa de um estrago de
   27/08/2026 na casa da rua: aqui morava um `if (!CAD) return`, guarda do CADASTRO,
   que nesta tela e' sempre nulo com o pop fechado. Resultado: a filmagem descia
   inteira e era jogada fora, e o "Descendo A Filmagem" ficava eterno ("aqui nao esta'
   carregando nada, fica em descendo filmagem faz mais de 1 minuto"). O guarda certo e'
   o da GERACAO, o mesmo do resto da pintura: quem envelheceu desiste, quem esta' na
   vez veste. */
async function vestirORecorte(ger) {
  const v = videoDoModelo();
  if (!MP_VAR || !EDIT_RECORTES.length || MP_PECA < 0 || !EDIT_RECORTES[MP_PECA]) {
    v.removeAttribute("src");
    return;
  }
  const peca = EDIT_RECORTES[MP_PECA];
  const jan = MP_VAR.janela;
  const e = encaixeNaJanela(BROLL_DE && BROLL_DE.get(peca.nome), jan);
  // O VIDEO E' POSICIONADO DENTRO DA CAIXA DA JANELA, entao a medida vira porcentagem
  // dela, e nao do quadro: e' a mesma conta, so' que na regua da caixa.
  v.style.width = (e.k / jan.w * 100) + "%";
  v.style.height = (e.k / jan.h * 100) + "%";
  v.style.left = ((e.x - jan.x) / jan.w * 100) + "%";
  v.style.top = ((e.y - jan.y) / jan.h * 100) + "%";
  try {
    const u = await urlDaMidia(peca, pastaDosRecortes());
    // QUEM ENVELHECEU NAO VESTE, e devolve o endereco que acabou de pegar
    if (ger !== undefined && ger !== MP_GERACAO) { devolverEndereco(u); return; }
    if (v.dataset.url) URL.revokeObjectURL(v.dataset.url);
    v.dataset.url = u;
    const aviso = () => document.querySelector("#mp_peca .mp-descendo");
    v.onplaying = () => { const a = aviso(); if (a) a.hidden = true; };
    v.onerror = () => {
      const a = aviso();
      if (a) a.textContent = "A Filmagem Não Desceu";
    };
    v.src = u;
    v.play().catch(() => {});
  } catch (e2) {}
}

async function entrarNoModelo() {
  if (!EDIT_RECORTES.length) await procurarRecortes();
  if (!ACERVO.itens.length) await lerAcervo();
  const contas = contasComModelo();
  if (!contas.includes(MP_CONTA)) {
    MP_CONTA = (TPL && TPL.contaModelo && contas.includes(TPL.contaModelo))
      ? TPL.contaModelo : (contas[0] || "");
  }
  // O INDICE ENVELHECIDO TAMBEM SE CONSERTA AQUI: cinto alem do zerar da troca de
  // leva, porque um F5 no meio pode trazer MP_PECA maior que a leva reaberta.
  if ((MP_PECA < 0 || MP_PECA >= EDIT_RECORTES.length) && EDIT_RECORTES.length) {
    MP_PECA = sortearBroll();
  }
  if (!EDIT_RECORTES.length) MP_PECA = -1;
  desenhaAsContas();
  await pintarOModelo();
  marcaOModelo();
}

/** Sair da fase FECHA o video. Sem isto ele fica vivo atras da tela, gastando rede. */
function pararOModelo() {
  // QUEM SAIU NAO REPINTA: a retentativa agendada por pintarOModelo morre aqui, senao
  // ela dispararia com a fase escondida e ressuscitaria o video atras da tela.
  MP_GERACAO++;
  const v = videoDoModelo();
  if (!v) return;
  v.pause();
  if (v.dataset.url) { URL.revokeObjectURL(v.dataset.url); delete v.dataset.url; }
  v.removeAttribute("src");
  v.load();
}

/** O selo do fecho: olhar uma conta e' um gesto, fechar a leva nela e' outro. */
function marcaOModelo() {
  const fechado = !!(MP_CONTA && TPL && TPL.contaModelo === MP_CONTA);
  $("mp_arte").classList.toggle("mp-escolhida", fechado);
  $("mp_peca").classList.toggle("mp-escolhida", fechado);
  const t = $("mp_usar").querySelector(".txt");
  if (t) t.textContent = fechado ? "Modelo Definido" : "Usar Nesta Leva";
  $("mp_usar").classList.toggle("brasa", !fechado);
}

/* A APLICACAO SE VE, pedido de 27/08/2026: "que eu consiga acompanhar como e' que
   ta' sendo feito tudo isso... e que no final ali me informa que o template foi
   aplicado em todos os recortes". A conta que acende aqui e' a MESMA variacaoDaPeca
   que o pedido de montagem manda, peca a peca: e' o encaixe de verdade, nao teatro. */
async function aplicarOModelo() {
  const painel = $("mp_aplicando");
  const par = $("mp_par");
  const acoes = par ? par.parentElement.querySelector(".rec-acoes") : null;
  const vars = variacoesDaConta(MP_CONTA);
  pararOModelo();
  // O `hidden` PERDE para regra de display com classe (a mesma armadilha que o
  // conferidor pegou no proprio painel): o par e as acoes se apagam por estilo em
  // linha, senao o painel abria escondido EMBAIXO do par, fora da dobra.
  if (par) par.style.display = "none";
  if (acoes) acoes.style.display = "none";
  painel.classList.remove("feita");
  painel.hidden = false;
  $("mp_apl_titulo").textContent = "Aplicando O Template";
  const total = EDIT_RECORTES.length;
  for (let i = 0; i < total; i++) {
    const nome = EDIT_RECORTES[i].nome;
    const v = variacaoDaPeca(nome);
    const qual = v ? vars.findIndex(x => x.arquivo === v.arquivo) + 1 : 0;
    $("mp_apl_diz").textContent = nome + (qual ? " veste a Variação " + qual : "");
    $("mp_apl_barra").style.width = ((i + 1) / Math.max(1, total) * 100) + "%";
    $("mp_apl_conta").textContent = (i + 1) + " De " + total;
    await new Promise(r => setTimeout(r, 12));
  }
  painel.classList.add("feita");
  $("mp_apl_titulo").textContent = "O Template Foi Aplicado Em Todos Os Recortes";
  $("mp_apl_diz").textContent = "Cada peça vestiu a variação que melhor lhe cabe. "
    + "Agora vem a escrita das frases.";
  await new Promise(r => setTimeout(r, 1400));
  painel.hidden = true;
  if (par) par.style.display = "";
  if (acoes) acoes.style.display = "";
}

async function usarOModelo() {
  if (!MP_CONTA || !variacoesDaConta(MP_CONTA).length || !TPL) return;
  $("mp_usar").disabled = true;
  TPL.contaModelo = MP_CONTA;
  // OS CAMPOS DA ESCOLHA UNICA MORREM AQUI: a moldura passou a ser por peca, e um
  // rascunho com arte global faria a bancada e o pedido brigarem sobre quem manda.
  TPL.arte = null;
  TPL.fundoImagem = null;
  TPL.janela = null;
  marcaOModelo();
  await salvarRascunho();
  await aplicarOModelo();
  $("mp_usar").disabled = false;
  irParaSub(4);
}

$("mp_lista").addEventListener("click", async ev => {
  // O ABRIR LEVA AO CADASTRO CARREGADO, para ver tudo que foi gravado e mudar.
  const editar = ev.target.closest("[data-editar]");
  if (editar) {
    await abrirCadastro(editar.dataset.editar);
    return;
  }
  const li = ev.target.closest("[data-conta]");
  if (!li) return;
  MP_CONTA = li.dataset.conta;
  desenhaAsContas();
  await pintarOModelo();
  marcaOModelo();
});
$("mp_outra").onclick = async () => {
  if (EDIT_RECORTES.length < 2) return;
  MP_PECA = (MP_PECA + 1) % EDIT_RECORTES.length;
  // A PECA NOVA PODE PEDIR OUTRA VARIACAO, entao o par inteiro se repinta.
  await pintarOModelo();
};
$("mp_usar").onclick = () => usarOModelo();
$("mp_novo").onclick = () => abrirCadastro();

/* ============================================ O CADASTRO DO TEMPLATE

   O QUE MUDOU: ate' 26/08/2026 a arte entrava por "Subir Arte" e entrava crua. Ele
   cortou o nome e a coisa junto: "eu nao quero que tenha esse nome, Subir arte... na hora
   que eu for subir o template, a gente precisa fazer um cadastramento completo".

   O QUE UM TEMPLATE TEM, e cada item saiu de uma frase dele:
     a marca       o nome e a CONTA, criavel aqui dentro (a etiqueta saiu em 27/08)
     a escrita     o desenho da letra e quantas linhas a frase pode ocupar
     a marca d'agua um PNG transparente posto por cima do B-roll
     as variacoes  quantas artes ele quiser, SEM nome de formato: o que separa uma da
                   outra e' o furo medido do arquivo ("nao e' pra ter esses nomes")

   O QUE NAO ENTRA, POR ORDEM DELE: cor, cor de destaque, sublinhado, caixa, alinhamento e
   tamanho de letra. "Isso vai ser a etapa da IA, no momento que ela vai escrever." O que
   fica do lado do template e' o que e' decisao da ARTE, e nao do texto.

   ONDE ISSO MORA: no acervo, junto dos templates, e nao numa memoria desta aba. Conta,
   etiqueta, fonte e marca d'agua sao itens proprios, porque ele reusa os quatro no
   template seguinte; a variacao e' uma arte com o template dela anotado. */

/* AS FRASES DE TESTE. Fonte se julga escrevendo, e uma frase so' esconde o que importa: a
   curta cabe em qualquer desenho, a longa e' a que estoura o maximo de linhas. */
const CD_FRASES = [
  "o corte que ninguém mostra",
  "o corte que ninguém mostra antes da hora",
  "três minutos por peça, e não trinta",
  "a conta que o dono nunca fez, e que aparece no fim do mês",
];

// O TETO E' O QUE O ALVO DA SUBIDA PROMETE NA TELA. Prometer 5 MB e aceitar 40 faria a
// gravacao estourar no posto, longe do clique, com o erro chegando sem nome.
const CD_TETO = 5 * 1024 * 1024;

const CD_ESTRELA = '<svg viewBox="0 0 24 24" stroke-linejoin="round">'
  + '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'
  + "</svg>";

let CAD = null;                 // o cadastro em curso; nulo com a janela fechada
let CD_ARRASTO = null;          // o que esta' sendo arrastado agora, faixa ou marca

const cdDoAcervo = tipo => (ACERVO.itens || []).filter(x => x && x.tipo === tipo);
const cdNomes = tipo => cdDoAcervo(tipo).map(x => x.nome).filter(Boolean);

/** A ficha das favoritas. Uma so' no acervo, com as chaves das fontes estreladas. */
function cdFichaDasFavoritas() {
  let f = (ACERVO.itens || []).find(x => x && x.tipo === "favoritas");
  if (!f) { f = { id: "favfontes", tipo: "favoritas", chaves: [] }; ACERVO.itens.push(f); }
  if (!Array.isArray(f.chaves)) f.chaves = [];
  return f;
}

/* A BIBLIOTECA INTEIRA: as da casa (as mesmas que o motor sabe desenhar) e as que ele
   subiu. `minha` e' o que separa as duas, e e' por ela que o filtro de personalizadas
   trabalha. */
function cdBiblioteca() {
  const fav = cdFichaDasFavoritas().chaves;
  const daCasa = FONTES.map(f => ({
    chave: f.v, nome: f.r, arquivo: f.g, css: fonteCss(f.v), minha: false,
    favorita: fav.includes(f.v)
  }));
  const minhas = cdDoAcervo("fonte").map(f => ({
    chave: f.id, nome: f.nome || f.arquivo, arquivo: f.arquivo, css: cdCssDaFonte(f),
    minha: true, favorita: fav.includes(f.id)
  }));
  return minhas.concat(daCasa);
}

/* A FONTE SUBIDA PRECISA SER REGISTRADA NO NAVEGADOR para aparecer escrita nela mesma.
   Sem isto a lista mostraria todas as personalizadas com a letra do sistema, que e'
   exatamente o que a biblioteca existe para nao fazer. O registro e' uma vez so' por
   arquivo: `document.fonts` guarda, e registrar de novo a cada pintura penduraria uma
   descarga por clique de filtro. */
const CD_FONTES_POSTAS = new Set();
function cdCssDaFonte(f) { return '"cdf' + f.id + '",sans-serif'; }
async function cdRegistrarFonte(f) {
  if (!f || !f.arquivo || CD_FONTES_POSTAS.has(f.id)) return;
  CD_FONTES_POSTAS.add(f.id);
  try {
    const u = await enderecoDo(f.arquivo);
    if (!u) { CD_FONTES_POSTAS.delete(f.id); return; }
    const cara = new FontFace("cdf" + f.id, "url(" + u + ")");
    await cara.load();
    document.fonts.add(cara);
  } catch (e) { CD_FONTES_POSTAS.delete(f.id); }
}

/* ------------------------------------------------------------- abrir e fechar */

/* ABRE VAZIO PARA CADASTRAR, ou CARREGADO PARA VER E MUDAR. "Cria uma opcao que eu
   possa clicar, abrir e visualizar tudo que foi cadastrado, mudar talvez os dados"
   (27/08/2026): com um id de template, cada aba abre mostrando o que esta' gravado, e
   o fecho SALVA POR CIMA do mesmo template em vez de criar outro. */
async function abrirCadastro(idTpl) {
  if (!ACERVO.itens.length) await lerAcervo();
  const dele = idTpl
    ? (ACERVO.itens || []).find(x => x && x.tipo === "template" && x.id === idTpl)
    : null;
  CAD = {
    passo: 1, nome: dele ? (dele.nome || "") : "",
    conta: dele ? (dele.conta || "") : (cdNomes("conta")[0] || ""),
    fonte: dele && dele.fonte ? dele.fonte
         : (cdBiblioteca()[0] ? cdBiblioteca()[0].chave : "anton"),
    frase: 1, filtro: "todas", busca: "",
    marca: dele ? (dele.marca || null) : ((cdDoAcervo("marca")[0] || {}).id || null),
    marcaPos: dele && dele.marcaPos ? { ...dele.marcaPos }
            : { dir: 6, baixo: 6, larg: 42, alt: 13 },
    /* AS VARIACOES NASCEM VAZIAS E CRESCEM SEM TETO: "se eu quiser adicionar mais
       modelos, eu devo conseguir adicionar mais" (27/08/2026). Cada arte subida vira
       uma variacao; `qual` negativo quer dizer que a proxima subida ACRESCENTA. */
    vars: [],
    qual: -1, gravando: false,
    editando: dele ? dele.id : null
  };
  if (dele) {
    // AS VARIACOES GRAVADAS ENTRAM COMO ESTAO: a arte vem do acervo (sem re-subir no
    // salvar), a medida vem da ficha, e `novo` marca o que ainda nao mora no disco.
    for (const va of (dele.variacoes || [])) {
      const a = artesDoAcervo().find(x => x.id === va.arte);
      if (!a) continue;
      CAD.vars.push({
        blob: null, novo: false, id: a.id, arquivo: a.arquivo,
        nome: a.nome || "", url: null,
        medida: { w: a.w, h: a.h, furo: !!a.furo, janela: a.janela || null },
        escrita: { ...(va.escrita || a.escrita || { topo: 78, altura: 13 }) }
      });
    }
  }
  $("cd_titulo").textContent = dele ? "Editar Template" : "Cadastrar Template";
  $("cd_nome").value = CAD.nome;
  $("cd_busca").value = "";
  $("cd_conta_nova").classList.remove("abre");
  $("cd_girando").hidden = true;
  $("cd_avancar").disabled = false;
  $("cd_corpo").style.opacity = "";
  $("cd_corpo").style.pointerEvents = "";
  cdSeletoresDaMarca();
  pselNovo($("cd_frase_sel"), CD_FRASES.map((f, i) => ({ v: String(i), r: f })),
           String(CAD.frase), v => { CAD.frase = Number(v); cdPintaFrase(); });
  cdPintaFiltro();
  cdPintaVars();
  cdMostraPasso(1);
  /* O ABRIR ABRE NA HORA ("voce clicar em abrir tem que abrir, porra", 27/08/2026):
     a janela aparece primeiro, e as cargas lentas descem por tras, cada uma pintando
     quando chega. Se ele fechar antes, a guarda do CAD faz a carga velha desistir. */
  $("cd_fundo").hidden = false;
  $("cd_pop").hidden = false;
  const esse = CAD;
  (async () => {
    /* A CARGA NAO ATROPELA O GESTO (painel adversario de 27/08/2026): a lista e'
       uma COPIA (o Tirar encurta o array no meio do laco); variacao ja' trocada ou
       ja' pintada nao recebe resposta atrasada; cada arte pinta quando chega; e
       recado vivo (erro de salvar, roda da gravacao) nao morre no repinte. */
    for (const v of [...esse.vars]) {
      const arq = v.arquivo;
      if (!arq || v.url) continue;
      const u = await enderecoDo(arq);
      if (CAD !== esse) return;
      if (v.arquivo !== arq || v.url || !u) continue;
      v.url = u;
      if (CAD.gravando) continue;
      const aviso = $("cd_diz");
      const texto = aviso.textContent;
      const classe = aviso.className;
      cdPintaVars();
      if (texto && (classe.includes("ruim") || classe.includes("boa"))) {
        aviso.textContent = texto;
        aviso.className = classe;
      }
    }
  })();
  (async () => {
    await cdPintaFontes();
    if (CAD !== esse) return;
    cdPintaFrase();
  })();
  (async () => {
    cdPintaMarcas();
    await cdPintaOBrollDaMarca();
  })();
  setTimeout(() => { $("cd_nome").focus(); cdPintaFrase(); }, 40);
}

function fecharCadastro() {
  // FECHAR NAO INTERROMPE GRAVACAO. O X, o fundo e o Esc ficam fora do cd_corpo que a
  // gravacao trava, e fechar no meio deixava CAD nulo com o cdCadastrar por terminar:
  // a retomada estourava lendo o nulo, o redesenho da fase 1 nunca vinha, e no caminho
  // de falha o proprio recado de erro morria (revisao de 27/08/2026). O rodape ja' diz
  // qual variacao esta' subindo; e' essa a resposta para o clique impaciente.
  if (CAD && CAD.gravando) return;
  /* AS FOTOS SOLTAS SAO DEVOLVIDAS, MAS SO' AS NOSSAS: arte subida aqui dentro tem
     endereco proprio; variacao carregada para EDICAO (a que tem v.arquivo) usa o
     endereco que mora no cache ED_IMGS, o mesmo que a fase 1 usa. Devolve-lo matava a
     foto para o cache inteiro: Abrir, fechar, e o modelo pintava os dois quadros com
     o icone de imagem quebrada (o bug das imagens de 27/08/2026 a' noite). */
  if (CAD) {
    for (const v of CAD.vars) {
      if (v.url && !v.arquivo) URL.revokeObjectURL(v.url);
    }
  }
  const v = $("cd_marca_video");
  if (v) {
    v.pause();
    if (v.dataset.url) { URL.revokeObjectURL(v.dataset.url); delete v.dataset.url; }
    v.removeAttribute("src");
    v.load();
  }
  CAD = null;
  CD_ARRASTO = null;
  $("cd_fundo").hidden = true;
  $("cd_pop").hidden = true;
}

$("cd_fechar").onclick = () => fecharCadastro();
$("cd_fundo").onclick = () => fecharCadastro();
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !$("cd_pop").hidden) fecharCadastro();
});

function cdMostraPasso(n) {
  if (!CAD) return;
  CAD.passo = n;
  document.querySelectorAll("#cd_pop .cd-tela").forEach(x => {
    x.hidden = Number(x.dataset.p) !== n;
  });
  document.querySelectorAll("#cd_trilha .cd-passo").forEach(x => {
    x.classList.toggle("on", Number(x.dataset.p) === n);
  });
  $("cd_voltar").disabled = n === 1;
  $("cd_avancar").textContent = n !== 4 ? "Avançar"
    : (CAD.editando ? "Salvar Template" : "Cadastrar Template");
  if (n === 2) cdPintaFrase();
  cdDiz();
}

/* O RECADO DO RODAPE CONTA O QUE FALTA, e nao o que ja' foi feito: o que falta e' a unica
   coisa que muda a decisao dele de clicar em cadastrar. */
function cdDiz(texto, classe) {
  const d = $("cd_diz");
  if (texto !== undefined) { d.textContent = texto; d.className = "pop-diz " + (classe || ""); return; }
  d.className = "pop-diz";
  if (!CAD) { d.textContent = ""; return; }
  const semFuro = CAD.vars.filter(x => x.medida && !x.medida.furo).length;
  d.textContent = CAD.passo === 4 && CAD.vars.length
    ? (CAD.vars.length === 1 ? "1 Variação No Template"
       : CAD.vars.length + " Variações No Template")
      + (semFuro ? ", " + semFuro + " Sem O Furo Transparente" : "") : "";
  // O SEM-FURO PINTA O RODAPE DE VERMELHO: foi o aviso que faltou em 27/08/2026,
  // quando ele cadastrou quatro artes opacas so' com o selo no canto de cada cartao e
  // foi descobrir na fase 1, achando que o cadastro tinha sumido.
  if (semFuro && CAD.passo === 4) d.className = "pop-diz ruim";
}

$("cd_trilha").addEventListener("click", ev => {
  const b = ev.target.closest("[data-p]");
  if (b) cdMostraPasso(Number(b.dataset.p));
});
$("cd_voltar").onclick = () => { if (CAD && CAD.passo > 1) cdMostraPasso(CAD.passo - 1); };
$("cd_avancar").onclick = () => {
  if (!CAD) return;
  if (CAD.passo < 4) { cdMostraPasso(CAD.passo + 1); return; }
  cdCadastrar();
};
$("cd_nome").addEventListener("input", ev => { if (CAD) CAD.nome = ev.target.value; });

/* ------------------------------------------------- 01 · a conta e a etiqueta */

function cdSeletoresDaMarca() {
  cdSeletor("cd_conta", cdNomes("conta"), CAD.conta, "nenhuma conta criada",
            v => { CAD.conta = v; });
}

/* LISTA VAZIA NAO VIRA CAMPO EM BRANCO. Ela diz que nao ha' nada criado, que e' a verdade
   daquele instante, e o botao ao lado e' o caminho. Mesma lei da folha de marcacao. */
function cdSeletor(alvo, nomes, atual, vazio, aoTrocar) {
  const ops = nomes.length ? nomes.map(n => ({ v: n, r: n }))
                           : [{ v: "", r: vazio }];
  pselNovo($(alvo), ops, nomes.includes(atual) ? atual : ops[0].v, aoTrocar);
}

async function cdCriar(tipo, texto, caixa, campo, redesenha) {
  const nome = (($(campo).value) || "").trim();
  if (!nome) return;
  if (cdNomes(tipo).some(x => x.toLowerCase() === nome.toLowerCase())) {
    cdDiz("Já existe " + texto + " com esse nome.", "ruim");
    return;
  }
  try {
    ACERVO.itens.push({ id: tipo[0] + Date.now() + "_" + novoId(), tipo, nome,
                        criado: Date.now() });
    await gravarAcervo();
  } catch (e) {
    ACERVO.itens.pop();
    cdDiz("não consegui guardar: " + e.message, "ruim");
    return;
  }
  CAD.conta = nome;
  $(campo).value = "";
  $(caixa).classList.remove("abre");
  redesenha();
  // A CONFIRMACAO SE VE. Ele criou e ficou sem saber ("uai, nao criou?"): a lista
  // mudava de longe e nada dizia que o clique valeu. Agora o rodape diz, na hora.
  cdDiz("A conta " + nome + " foi criada e já está escolhida.", "boa");
}

$("cd_nova_conta").onclick = () => {
  $("cd_conta_nova").classList.toggle("abre");
  if ($("cd_conta_nova").classList.contains("abre")) $("cd_conta_txt").focus();
};
$("cd_conta_ok").onclick = () =>
  cdCriar("conta", "uma conta", "cd_conta_nova", "cd_conta_txt", cdSeletoresDaMarca);

/* ------------------------------------------------------------ 02 · a escrita */

function cdCabeNoFiltro(f) {
  if (CAD.filtro === "minhas" && !f.minha) return false;
  if (CAD.filtro === "favoritas" && !f.favorita) return false;
  if (CAD.busca && (f.nome + " " + f.arquivo).toLowerCase().indexOf(CAD.busca) < 0) {
    return false;
  }
  return true;
}

function cdPintaFiltro() {
  document.querySelectorAll("#cd_filtro button").forEach(b => {
    b.classList.toggle("on", b.dataset.q === CAD.filtro);
  });
}

async function cdPintaFontes() {
  const todas = cdBiblioteca();
  const vistas = todas.filter(cdCabeNoFiltro);
  $("cd_fontes").innerHTML = vistas.map(f => `<div class="cd-fonte${
      f.chave === CAD.fonte ? " on" : ""}" data-f="${escapa(f.chave)}">
      <button class="cd-estrela${f.favorita ? " on" : ""}" type="button"
        data-fav="${escapa(f.chave)}" aria-label="Favoritar">${CD_ESTRELA}</button>
      <b style="font-family:${escapa(f.css)}">${escapa(f.nome)}</b>
      <span class="cd-tipo${f.minha ? " minha" : ""}">${
        f.minha ? "Personalizada" : "Da Casa"}</span>
      <i>${escapa(f.arquivo)}</i></div>`).join("");
  $("cd_sem_fonte").hidden = vistas.length > 0;
  for (const f of cdDoAcervo("fonte")) await cdRegistrarFonte(f);
}

$("cd_filtro").addEventListener("click", async ev => {
  const b = ev.target.closest("[data-q]");
  if (!b || !CAD) return;
  CAD.filtro = b.dataset.q;
  cdPintaFiltro();
  await cdPintaFontes();
});
$("cd_busca").addEventListener("input", async ev => {
  if (!CAD) return;
  CAD.busca = (ev.target.value || "").trim().toLowerCase();
  await cdPintaFontes();
});

$("cd_fontes").addEventListener("click", async ev => {
  if (!CAD) return;
  const estrela = ev.target.closest("[data-fav]");
  if (estrela) {
    const ficha = cdFichaDasFavoritas();
    const k = estrela.dataset.fav;
    const i = ficha.chaves.indexOf(k);
    if (i >= 0) ficha.chaves.splice(i, 1); else ficha.chaves.push(k);
    await cdPintaFontes();
    try { await gravarAcervo(); }
    catch (e) { cdDiz("a estrela não foi guardada: " + e.message, "ruim"); }
    return;
  }
  const d = ev.target.closest("[data-f]");
  if (!d) return;
  CAD.fonte = d.dataset.f;
  await cdPintaFontes();
  cdPintaFrase();
});

/* QUANTAS LINHAS A FRASE OCUPOU E' MEDIDO NA TELA, e nao chutado pelo numero de letras: a
   mesma frase ocupa duas linhas numa condensada e tres numa larga, e e' justamente essa
   diferenca que ele esta' olhando aqui. */
function cdPintaFrase() {
  if (!CAD) return;
  const f = $("cd_frase");
  const escolhida = cdBiblioteca().find(x => x.chave === CAD.fonte);
  f.style.fontFamily = escolhida ? escolhida.css : fonteCss("anton");
  f.textContent = CD_FRASES[CAD.frase] || CD_FRASES[0];
  const est = getComputedStyle(f);
  const alt = parseFloat(est.lineHeight) || 1;
  const folga = parseFloat(est.paddingTop) + parseFloat(est.paddingBottom);
  const n = Math.max(1, Math.round((f.scrollHeight - folga) / alt));
  // QUANTAS LINHAS NAO E' MAIS ESCOLHA DO CADASTRO ("quem vai decidir isso vai
  // ser a IA na hora de escrever", 27/08/2026): aqui so' se MEDE a frase de prova.
  const u = $("cd_linhas_diz");
  u.textContent = n + (n === 1 ? " Linha" : " Linhas");
  u.classList.remove("demais");
}

$("cd_subir_fonte").onclick = () => $("cd_fonte_arq").click();
$("cd_fonte_arq").addEventListener("change", async ev => {
  // A SELECAO INTEIRA SOBE DE UMA VEZ. "So' consigo selecionar uma por vez, porra?"
  // (27/08/2026): o campo aceita a leva, e cada arquivo entra na biblioteca.
  const fs = [...(ev.target.files || [])];
  ev.target.value = "";
  await cdReceberLote(fs, cdSubirFonte);
});

/* O LOTE PRESTA CONTA NO FIM. Arquivo recusado no meio da selecao era engolido: o
   proximo arquivo bom repintava e o recado da recusa durava um piscar. Cada subida
   devolve o MOTIVO da recusa (ou nada), e quem chama o lote junta os que ficaram de
   fora num aviso que fica na tela (revisao de 27/08/2026). */
async function cdReceberLote(fs, subir) {
  const deFora = [];
  for (const f of fs) {
    const motivo = await subir(f);
    if (motivo) deFora.push(f.name + " (" + motivo + ")");
  }
  if (deFora.length) cdDiz("Ficou de fora: " + deFora.join("; "), "ruim");
}

async function cdSubirFonte(f) {
  if (!/\.(ttf|otf)$/i.test(f.name)) {
    cdDiz("essa fonte não é TTF nem OTF, e o motor só desenha esses dois.", "ruim");
    return "não é TTF nem OTF";
  }
  if (f.size > CD_TETO) {
    cdDiz("essa fonte passa dos 5 MB.", "ruim");
    return "passa dos 5 MB";
  }
  try {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    // O NOME NO DISCO E' NOSSO, e o dele fica de rotulo: nome vindo de fora abriria a
    // porta para um arquivo sobrescrever o outro em silencio. Mesma lei das artes.
    const arquivo = "fonte" + Date.now() + "_" + novoId() + ext;
    await guardarNoAcervo(arquivo, await f.arrayBuffer());
    const item = { id: "f" + Date.now() + "_" + novoId(), tipo: "fonte",
                   nome: f.name.replace(/\.[^.]+$/, ""), arquivo, criado: Date.now() };
    ACERVO.itens.push(item);
    await gravarAcervo();
    await cdRegistrarFonte(item);
    CAD.fonte = item.id;
    CAD.filtro = "todas";
    CAD.busca = "";
    $("cd_busca").value = "";
    cdPintaFiltro();
    await cdPintaFontes();
    cdPintaFrase();
    cdDiz("");
  } catch (e) {
    cdDiz("não consegui guardar a fonte: " + e.message, "ruim");
  }
}

/* --------------------------------------------------------- 03 · a marca d'água */

function cdPintaMarcas() {
  const marcas = cdDoAcervo("marca");
  const alvo = $("cd_marcas");
  if (!marcas.length) {
    alvo.innerHTML = '<span class="cd-marca-nada">nenhuma marca subida ainda</span>';
  } else {
    alvo.innerHTML = marcas.map(m => `<div class="cd-marca-item${
        m.id === CAD.marca ? " on" : ""}" data-m="${escapa(m.id)}"
        title="${escapa(m.nome || m.arquivo)}"><img alt=""
        data-marca="${escapa(m.arquivo)}"></div>`).join("");
    alvo.querySelectorAll("img[data-marca]").forEach(async img => {
      // endereco nulo (arte que nao desceu) nao vira icone de imagem quebrada
      try {
        const u = await enderecoDo(img.dataset.marca);
        if (u) img.src = u;
      } catch (e) { /* sem a miniatura; o title do cartao segue dizendo qual e' */ }
    });
  }
  cdPintaAMarcaNoPalco();
}

async function cdPintaAMarcaNoPalco() {
  const m = cdDoAcervo("marca").find(x => x.id === CAD.marca);
  const caixa = $("cd_marca");
  caixa.hidden = !m;
  if (!m) return;
  const p = CAD.marcaPos;
  caixa.style.right = p.dir + "%";
  caixa.style.bottom = p.baixo + "%";
  caixa.style.width = p.larg + "%";
  caixa.style.height = p.alt + "%";
  try {
    const u = await enderecoDo(m.arquivo);
    // a resposta atrasada de um pop fechado (ou de outra marca) nao pinta o palco
    if (u && CAD && CAD.marca === m.id) $("cd_marca_img").src = u;
  } catch (e) { /* sem a previa; a caixa segue mostrando o lugar dela */ }
}

/* O FUNDO E' UM RECORTE DESTA LEVA, e nao um desenho de exemplo: e' por cima da filmagem
   que a marca vai ficar, e uma marca clara sobre um retangulo preto de mentira parece
   legivel em qualquer lugar. Sem recorte a tela DIZ que nao tem, em vez de fingir um. */
async function cdPintaOBrollDaMarca() {
  const v = $("cd_marca_video");
  const peca = (MP_PECA >= 0 && EDIT_RECORTES[MP_PECA]) || EDIT_RECORTES[0] || null;
  $("cd_sem_broll").hidden = !!peca;
  if (!peca) { v.removeAttribute("src"); return; }
  try {
    const u = await urlDaMidia(peca, pastaDosRecortes());
    // O POP FECHOU ENQUANTO O RECORTE DESCIA: aqui, sim, o guarda e' o do cadastro.
    if (!CAD) { devolverEndereco(u); return; }
    if (v.dataset.url) URL.revokeObjectURL(v.dataset.url);
    v.dataset.url = u;
    v.src = u;
    v.play().catch(() => {});
  } catch (e) { $("cd_sem_broll").hidden = false; }
}

$("cd_marcas").addEventListener("click", ev => {
  const d = ev.target.closest("[data-m]");
  if (!d || !CAD) return;
  CAD.marca = d.dataset.m;
  cdPintaMarcas();
});

$("cd_subir_marca").onclick = () => $("cd_marca_arq").click();
$("cd_marca_arq").addEventListener("change", async ev => {
  const f = (ev.target.files || [])[0];
  ev.target.value = "";
  if (f) await cdSubirMarca(f);
});

async function cdSubirMarca(f) {
  if (!/\.png$/i.test(f.name)) {
    return cdDiz("a marca d'água tem de ser PNG, que é o que guarda o fundo transparente.",
                 "ruim");
  }
  if (f.size > CD_TETO) return cdDiz("essa marca passa dos 5 MB.", "ruim");
  try {
    const medida = await medirAArte(f);
    const arquivo = "marca" + Date.now() + "_" + novoId() + ".png";
    await guardarNoAcervo(arquivo, await f.arrayBuffer());
    const item = { id: "m" + Date.now() + "_" + novoId(), tipo: "marca",
                   nome: f.name.replace(/\.[^.]+$/, ""), arquivo,
                   w: medida.w, h: medida.h, criado: Date.now() };
    ACERVO.itens.push(item);
    await gravarAcervo();
    CAD.marca = item.id;
    cdPintaMarcas();
    cdDiz("");
  } catch (e) {
    cdDiz("não consegui guardar a marca: " + e.message, "ruim");
  }
}

/* ---------------------------------------------------------- 04 · as variações */

function cdPintaVars() {
  /* SEM NOME DE FORMATO. "Aqui so' tem quadrado, horizontal, vertical e tela cheia.
     Nao, irmao... e' so' pra ter as variacoes de como se comporta de formas
     diferentes" (27/08/2026). O numero e' referencia de ordem, nao categoria: o que
     separa uma variacao da outra e' a arte e onde a escrita fica nela. */
  const cartoes = CAD.vars.map((v, i) => {
    const semFuro = v.medida && !v.medida.furo;
    return `<div class="cd-var${i === CAD.qual ? " on" : ""}" data-i="${i}">
      <div class="cd-var-cab">Variação ${i + 1}</div>
      <div class="cd-palco" data-palco="${i}">
        <img class="cd-var-arte" alt="" src="${escapa(v.url)}">
        ${semFuro ? '<span class="cd-sem-furo">Sem Furo</span>' : ""}
        <div class="cd-txt" data-v="${i}" style="top:${v.escrita.topo}%;height:${
          v.escrita.altura}%">A Escrita Fica Aqui<span class="cd-alca"></span></div>
      </div>
      <div class="cd-var-pe">
        <button class="acao mini" type="button" data-subir="${i}">Trocar Arte</button>
        <button class="acao mini" type="button" data-tirar="${i}">Tirar</button>
      </div></div>`;
  });
  // O FORMATO ACEITO FICA NUMA LINHA SO' DE ASPAS: o vigia de nomes le' texto de crase
  // linha a linha, e sigla em caixa alta no meio de crase multilinha vira alarme falso.
  const aceita = "PNG, JPG Ou WEBP, Até 5 MB";
  cartoes.push(`<div class="cd-solta cd-var-mais" id="cd_var_mais">
    <span class="cd-mais">+</span><b>Acrescentar Variação</b>
    <em>${aceita}</em></div>`);
  $("cd_vars").innerHTML = cartoes.join("");
  cdDiz();
}

$("cd_vars").addEventListener("click", async ev => {
  if (!CAD) return;
  const tirar = ev.target.closest("[data-tirar]");
  if (tirar) {
    const i = Number(tirar.dataset.tirar);
    const v = CAD.vars[i];
    // arte de edicao EMPRESTA o endereco do cache ED_IMGS: nao e' nosso para devolver
    if (v && v.url && !v.arquivo) URL.revokeObjectURL(v.url);
    CAD.vars.splice(i, 1);
    CAD.qual = -1;
    cdPintaVars();
    return;
  }
  const s = ev.target.closest("[data-subir]");
  if (s) {
    CAD.qual = Number(s.dataset.subir);
    $("cd_var_arq").click();
    return;
  }
  if (ev.target.closest("#cd_var_mais")) {
    CAD.qual = -1;
    $("cd_var_arq").click();
    return;
  }
  const c = ev.target.closest(".cd-var");
  if (c) { CAD.qual = Number(c.dataset.i); cdPintaVars(); }
});

$("cd_var_arq").addEventListener("change", async ev => {
  const fs = [...(ev.target.files || [])];
  ev.target.value = "";
  if (!fs.length) return;
  // TROCAR troca UMA; ACRESCENTAR aceita a selecao inteira, uma variacao por arquivo.
  if (CAD.qual >= 0) { await cdPorArteNaVariacao(fs[0]); return; }
  await cdReceberLote(fs, cdPorArteNaVariacao);
});

async function cdPorArteNaVariacao(f) {
  if (!/\.(png|jpe?g|webp)$/i.test(f.name)) {
    cdDiz("essa arte não é PNG, JPG nem WEBP.", "ruim");
    return "não é PNG, JPG nem WEBP";
  }
  if (f.size > CD_TETO) {
    cdDiz("essa arte passa dos 5 MB.", "ruim");
    return "passa dos 5 MB";
  }
  try {
    const medida = await medirAArte(f);
    let v = CAD.qual >= 0 ? CAD.vars[CAD.qual] : null;
    if (v && v.url && v.url.startsWith("blob:") && !v.arquivo) URL.revokeObjectURL(v.url);
    if (!v) {
      v = { escrita: { topo: 78, altura: 13 } };
      CAD.vars.push(v);
    }
    v.novo = true;                         // trocar poe arquivo novo no lugar
    v.arquivo = null;
    v.blob = f;
    v.nome = f.name.replace(/\.[^.]+$/, "");
    v.medida = medida;
    v.url = URL.createObjectURL(f);
    cdPintaVars();
    // O AVISO DO FURO SAI NA HORA, e nao no fim: descobrir no botao de cadastrar que a
    // arte nao serve seria descobrir tarde demais, com as outras ja' escolhidas. Arte
    // boa devolve o rodape para a CONTA de variacoes, em vez de apagar o recado.
    if (medida.furo) cdDiz();
    else cdDiz("essa arte não tem o furo transparente, e sem ele a filmagem não sabe "
               + "onde entrar: exporte o PNG com a janela vazada.", "ruim");
  } catch (e) {
    cdDiz("não consegui ler a arte: " + e.message, "ruim");
    return "não deu para ler";
  }
}

/* A FAIXA DA ESCRITA ARRASTA DE VERDADE, e a alca de baixo muda a altura dela: e' o
   indicativo que ele pediu, e indicativo que nao se mexe nao marca nada. A marca d'agua
   usa o mesmo gesto, e por isso os dois passam pelo mesmo par de laços. */
function cdPegar(ev, alvo, palco, campos) {
  ev.preventDefault();
  const r = palco.getBoundingClientRect();
  CD_ARRASTO = Object.assign({ alvo, palco: r, x: ev.clientX, y: ev.clientY,
                               alto: !!ev.target.closest(".cd-alca") }, campos);
}

$("cd_vars").addEventListener("mousedown", ev => {
  const faixa = ev.target.closest(".cd-txt");
  if (!faixa || !CAD) return;
  ev.stopPropagation();
  const i = Number(faixa.dataset.v);
  cdPegar(ev, faixa, faixa.parentElement,
          { quem: "faixa", i, topo: CAD.vars[i].escrita.topo,
            altura: CAD.vars[i].escrita.altura });
});

$("cd_marca").addEventListener("mousedown", ev => {
  if (!CAD) return;
  const p = CAD.marcaPos;
  cdPegar(ev, $("cd_marca"), $("cd_marca_palco"),
          { quem: "marca", dir: p.dir, baixo: p.baixo, larg: p.larg, alt: p.alt });
});

window.addEventListener("mousemove", ev => {
  const g = CD_ARRASTO;
  if (!g || !CAD) return;
  const dx = (ev.clientX - g.x) / g.palco.width * 100;
  const dy = (ev.clientY - g.y) / g.palco.height * 100;
  if (g.quem === "faixa") {
    const e = CAD.vars[g.i].escrita;
    if (g.alto) {
      e.altura = Math.max(6, Math.min(100 - g.topo, g.altura + dy));
      g.alvo.style.height = e.altura + "%";
    } else {
      e.topo = Math.max(0, Math.min(100 - g.altura, g.topo + dy));
      g.alvo.style.top = e.topo + "%";
    }
    return;
  }
  const p = CAD.marcaPos;
  if (g.alto) {
    p.larg = Math.max(14, Math.min(90, g.larg + dx));
    p.alt = Math.max(6, Math.min(40, g.alt + dy));
    g.alvo.style.width = p.larg + "%";
    g.alvo.style.height = p.alt + "%";
  } else {
    p.dir = Math.max(0, Math.min(80, g.dir - dx));
    p.baixo = Math.max(0, Math.min(80, g.baixo - dy));
    g.alvo.style.right = p.dir + "%";
    g.alvo.style.bottom = p.baixo + "%";
  }
});
window.addEventListener("mouseup", () => { CD_ARRASTO = null; });

/* ------------------------------------------------------------- gravar o cadastro

   A ORDEM IMPORTA: primeiro os arquivos das artes, depois a ficha de cada uma, e so' no
   fim o template que as amarra. Gravar o template antes deixaria uma ficha apontando para
   arquivo que talvez nao chegasse ao disco, que e' o tipo de mentira que so' aparece na
   hora de montar a leva. */
async function cdCadastrar() {
  if (!CAD || CAD.gravando) return;
  const nome = (CAD.nome || "").trim();
  if (!nome) { cdMostraPasso(1); return cdDiz("o template precisa de um nome.", "ruim"); }
  if (!(CAD.conta || "").trim()) {
    cdMostraPasso(1);
    return cdDiz("escolha ou crie a conta: é ela que agrupa os templates.", "ruim");
  }
  if (!CAD.vars.length) {
    cdMostraPasso(4);
    return cdDiz("acrescente pelo menos uma variação: sem arte não há template.", "ruim");
  }
  CAD.gravando = true;
  $("cd_avancar").disabled = true;
  $("cd_voltar").disabled = true;
  $("cd_corpo").style.opacity = ".55";
  $("cd_corpo").style.pointerEvents = "none";
  // O TRABALHO SE VE. "Eu nao sei se ta salvando ou nao ta, se bugou ou nao bugou":
  // a roda gira, e o recado diz qual variacao esta' subindo, uma a uma.
  $("cd_girando").hidden = false;
  // EDITANDO, O ID E' O MESMO: salvar por cima nao pode virar um segundo template, e o
  // rascunho que aponta a conta continua valendo. As fichas antigas ficam guardadas
  // para a volta em caso de falha.
  const idTpl = CAD.editando || ("t" + Date.now() + "_" + novoId());
  const fichasAntes = CAD.editando
    ? ACERVO.itens.filter(x => x.id === idTpl
        || (x.tipo === "arte" && x.template === idTpl))
    : [];
  const guardadas = [];
  try {
    for (const [n, v] of CAD.vars.entries()) {
      if (v.novo === false && v.id) {
        // ARTE QUE JA' MORA NO DISCO NAO SOBE DE NOVO: so' a ficha viaja, com a
        // escrita do jeito que ficou.
        guardadas.push({
          id: v.id, tipo: "arte", nome: nome + " · Variação " + (n + 1),
          arquivo: v.arquivo, w: v.medida.w, h: v.medida.h,
          furo: v.medida.furo, janela: v.medida.janela,
          template: idTpl, escrita: { ...v.escrita }, criado: Date.now()
        });
        continue;
      }
      cdDiz("guardando a variação " + (n + 1) + " de " + CAD.vars.length + "…");
      const ext = "." + (v.blob.type === "image/webp" ? "webp"
                       : v.blob.type === "image/jpeg" ? "jpg" : "png");
      const arquivo = "arte" + Date.now() + "_" + novoId() + ext;
      await guardarNoAcervo(arquivo, await v.blob.arrayBuffer());
      guardadas.push({
        id: "a" + Date.now() + "_" + novoId(), tipo: "arte",
        nome: nome + " · Variação " + (n + 1), arquivo,
        w: v.medida.w, h: v.medida.h, furo: v.medida.furo, janela: v.medida.janela,
        template: idTpl, escrita: { ...v.escrita },
        criado: Date.now()
      });
    }
    cdDiz("guardando o template…");
    // NA EDICAO AS FICHAS VELHAS SAEM ANTES DAS NOVAS ENTRAREM: variacao tirada some
    // do catalogo (o arquivo dela fica no disco, sem rota de apagar), e o template
    // regravado ocupa o lugar do antigo, com o mesmo id.
    if (CAD.editando) {
      ACERVO.itens = ACERVO.itens.filter(x => !fichasAntes.includes(x));
    }
    ACERVO.itens.push(...guardadas);
    ACERVO.itens.push({
      id: idTpl, tipo: "template", nome, conta: CAD.conta || "",
      fonte: CAD.fonte,
      marca: CAD.marca || null, marcaPos: { ...CAD.marcaPos },
      variacoes: guardadas.map(a => ({ arte: a.id, escrita: a.escrita })),
      criado: Date.now()
    });
    await gravarAcervo();
  } catch (e) {
    // O ACERVO DA TELA VOLTA AO QUE ERA: metade de um template na lista seria pior que
    // nenhum, porque ele escolheria uma arte que o disco nao tem.
    ACERVO.itens = ACERVO.itens.filter(
      x => x.id !== idTpl && !guardadas.some(g => g.id === x.id));
    ACERVO.itens.push(...fichasAntes.filter(x => !ACERVO.itens.includes(x)));
    CAD.gravando = false;
    $("cd_girando").hidden = true;
    $("cd_avancar").disabled = false;
    $("cd_voltar").disabled = false;
    $("cd_corpo").style.opacity = "";
    $("cd_corpo").style.pointerEvents = "";
    return cdDiz("não consegui salvar: " + e.message, "ruim");
  }
  $("cd_girando").hidden = true;
  // A GRAVACAO ACABOU, e o fecho de fechar precisa saber: com `gravando` ligado, o
  // proprio guarda que segura o X durante a subida seguraria a saida automatica.
  CAD.gravando = false;
  cdDiz(CAD.editando ? "Template Salvo" : "Template Cadastrado", "boa");
  MP_CONTA = CAD.conta;
  // O FECHO SE VE ANTES DE FECHAR: um instante com o recado bom, e a janela sai
  // sozinha, com a conta nova ja' escolhida na lista.
  setTimeout(async () => {
    fecharCadastro();
    desenhaAsContas();
    await pintarOModelo();
    marcaOModelo();
  }, 900);
}

async function entrarNoTemplate() {
  if (!EDIT_RECORTES.length) await procurarRecortes();
  if (!ACERVO.itens.length) await lerAcervo();
  if (!TPL) TPL = tplVazio();
  // O PASSO ANOTADO SOBREVIVE AO F5: quem entra por "Ir Para O Passo 3" nao passa pelo
  // salvarRascunho do trilho, e ate 27/08/2026 quem anotava a mexida aqui era o desenho
  // do editor de elementos, que morreu com as fases de texto e imagens.
  anotarMexida();
  irParaSub(TPL_SUB || 1);
}


/* ---------------------------------------------------- a montagem

   NÃO HÁ MAIS "TODAS OU ALGUMAS". A escolha existia quando a fase 4 era uma pergunta; ela
   agora é a galeria, onde as peças estão todas na tela e o que se faz é olhar e ajustar.
   Montar é sempre a leva inteira. */

let OBRA = null;
let MONTADO = null;                // { pecas, pasta, link } da montagem cumprida

function alvosDaMontagem() { return pecas3().map((_, i) => i); }

function resumoDeAplicar() {
  const n = alvosDaMontagem().length;
  $("apl_montar").disabled = !n || !TPL || !!OBRA;
  // O BOTAO DA FASE 5 E' UM ATALHO PARA O MESMO: se um nao pode, o outro tambem nao.
  if ($("aj_montar")) $("aj_montar").disabled = $("apl_montar").disabled;
  if (MONTADO) return desenhaFeito();
  $("apl_resumo").innerHTML = TPL
    ? `<b>${n}</b> ${n === 1 ? "peça" : "peças"}, em ${TELA.w} por ${TELA.h}.`
    : "Monte o template nas fases anteriores.";
}

$("apl_montar").onclick = async () => {
  if (!TPL || OBRA) return;
  const alvos = alvosDaMontagem();
  if (!alvos.length) return;
  $("apl_montar").disabled = true;
  try {
    // O POSTO PRIMEIRO, desde 25/08/2026: este era o outro pedido que só sabia a
    // pasta. O nome livre em `edicoes` passa a sair de quem enxerga o disco de
    // verdade, para duas abas não poderem escolher o mesmo destino.
    let destino = null, qual = 1;
    if (await postoDePe()) {
      // O TEMPLATE DA BANCADA VAI PARA O ACERVO ANTES DE MONTAR, porque quem monta lê
      // do disco. Sem esta gravação, montar um template recém-mexido usaria a versão
      // anterior e a peça sairia diferente do que ele viu na tela.
      await guardarNoAcervo(TPL.id + ".json", JSON.stringify(TPL, null, 1));
      const livre = await noPosto(`/nome-livre?base=leva-${EDIT_LEVA.numero}`);
      destino = livre.nome;
      qual = livre.n;
    } else {
      // O MESMO BECO DO PASSO 2, e a mesma saida. Ver a nota em `rec_aplicar`.
      let pedidos = await pastaDo("pedidos", true);
      let edicoes = await pastaDo("edicoes", true);
      if (!pedidos || !edicoes) {
        await pedirPasta();
        pedidos = await pastaDo("pedidos", true);
        edicoes = await pastaDo("edicoes", true);
      }
      if (!pedidos || !edicoes) throw new Error("o posto do Estúdio está fora e a "
        + "pasta não está liberada. Recarregue a página em um minuto e tente de novo.");
      await guardarNoAcervo(TPL.id + ".json", JSON.stringify(TPL, null, 1));
      const livre = await nomeLivre(edicoes, `leva-${EDIT_LEVA.numero}`);
      destino = livre.nome;
      qual = livre.n;
    }

    const id = "p" + Date.now();
    const pedido = {
      id, leva: EDIT_LEVA.numero,
      pasta: `leva-${EDIT_LEVA.numero}`, destino,
      template: TPL.id + ".json", tela: { w: TELA.w, h: TELA.h },
      // CADA PEÇA LEVA O SEU TEXTO E O SEU ACERTO. `textos` é o que foi escrito nas
      // caixas abertas; `ajustes` é o tamanho de letra que faz aquele texto caber.
      // Caixa travada não aparece em nenhum dos dois, e por isso nunca muda.
      pecas: alvos.map(i => {
        const nome = pecas3()[i].nome;
        const p = { arquivo: nome, textos: ESCRITO.get(nome) || {} };
        const a = AJUSTES.get(nome);
        if (a) p.ajustes = a;
        /* O ENQUADRAMENTO DO B-ROLL DESTA PECA. Sem ele o ffmpeg poe a filmagem no
           quadro cheio e parada, e o que ele fez na tela sumiria.

           A JANELA DE ORIGEM VAI JUNTO, e sem ela o motor nao consegue refazer a conta:
           mover e redimensionar acontecem em cima do CENTRO da janela, e o centro so' se
           sabe conhecendo o retangulo que o passo 2 mediu. */
        const e = ENQUADRES.get(nome);
        /* A MOLDURA E' POR PECA desde 27/08/2026: a variacao que a medida escolheu para
           ESTE recorte viaja no pedido, arquivo e janela, e o motor so' obedece. A
           escolha mora na tela, num lugar so' (variacaoDaPeca), pela mesma razao do
           encaixeNaJanela ser um so': duas implementacoes divergiriam caladas. Rascunho
           antigo, de arte unica, segue mandando o TPL.janela gravado. */
        const varDaPeca = variacaoDaPeca(nome);
        const janela = varDaPeca ? varDaPeca.janela
                     : (TPL && TPL.janela ? TPL.janela : null);
        /* A FRASE VIAJA PRONTA, e nao como faixa para o motor remontar. A conta de
           onde a letra fica, de que tamanho e com que fonte mora num lugar so' (aqui),
           pela mesma razao do `encaixeNaJanela`: duas implementacoes divergiriam
           caladas, e o arquivo sairia diferente do que ele aprovou na previa. */
        const frase = varDaPeca
          ? campoDaFaixa(varDaPeca.escrita, fonteDaArte(varDaPeca)) : null;
        if (e || janela || frase) {
          p.enquadre = Object.assign({}, e || {});
          const r = BROLL_DE && BROLL_DE.get(nome);
          if (r) p.enquadre.base = { x: r.x, y: r.y, w: r.w, h: r.h };
          if (janela) p.enquadre.janela = janela;
          if (varDaPeca) p.enquadre.arte = varDaPeca.arquivo;
          if (frase) p.enquadre.escrita = frase;
        }
        return p;
      })
    };
    await deixarPedido(pedido);

    OBRA = { id, desde: Date.now(), total: alvos.length, qual, relogio: null };
    $("apl_obra").hidden = false;
    reabrirObra("apl");
    pintarObra("apl", { total: alvos.length, feitos: 0 }, "peças montadas");
    document.querySelector("#apl_obra .cfg-girando").style.display = "";
    $("apl_obra_txt").textContent = "pedido deixado";
    $("apl_obra_nota").textContent = "a montagem começa em até um minuto, que é o passo "
      + "do programa que faz esse trabalho na casa do Estúdio.";
    OBRA.relogio = setInterval(olharAObra, 3000);
    olharAObra();
    salvarRascunho();          // o vigia sobrevive ao F5; mesma razao do recorte
  } catch (e) {
    $("apl_montar").disabled = false;
    $("apl_obra").hidden = false;
    $("apl_obra_txt").textContent = "não deu para deixar o pedido";
    // O RECADO DIZ O QUE FAZER, e nao so' o que houve: nada foi montado, nada se
    // perdeu, e o botao ja' esta' destravado. Sem esta linha ele recarregava a pagina,
    // que e' o gesto que apaga a prova do que aconteceu.
    $("apl_obra_nota").textContent = e.message
      + " Nenhuma peça foi montada e o texto escrito continua guardado: pode clicar em "
      + "Fabricar As Peças de novo.";
  }
};

async function olharAObra() {
  if (!OBRA) return;
  const seg = Math.round((Date.now() - OBRA.desde) / 1000);
  $("apl_obra_tempo").textContent = seg < 60 ? seg + "s"
    : Math.floor(seg / 60) + " min " + (seg % 60) + "s";

  /* A RODA NAO PODE GIRAR PARA SEMPRE, e aqui todos os caminhos de erro terminavam num
     `return` calado: a pasta revogada, o arquivo ainda inexistente, o arquivo ilegivel.
     A mesma nota esta' em `olharAEscrita`, e vale igual: quem monta e' o `oficina.py`, e
     nao esta tela, entao perder o contato nao quer dizer que o trabalho parou. Ela avisa,
     segue tentando, e so' desiste depois de tres minutos mudos. */
  const semContato = (porque) => {
    OBRA.mudo = (OBRA.mudo || 0) + 1;
    if (OBRA.mudo * 3 < 25) return;
    if (OBRA.mudo * 3 >= 180) {
      const viu = OBRA.jaViu;
      pararDeOlhar(false);
      $("apl_montar").disabled = false;
      $("apl_obra_txt").textContent = "perdi o contato com o programa";
      $("apl_obra_nota").textContent = (viu
        ? "ele estava montando e parei de conseguir olhar. "
        : "não consegui olhar nenhuma vez em três minutos. ")
        + "Recarregue a página (F5) e confira a pasta de edições: se as peças estão lá, a montagem terminou.";
      return;
    }
    $("apl_obra_txt").textContent = "sem contato com o programa";
    $("apl_obra_nota").textContent = porque + " Continuo tentando; a montagem pode estar acontecendo mesmo assim.";
  };

  // O ANDAMENTO VEM DO POSTO desde 25/08/2026; a pasta liberada é o plano B. Nos dois
  // mundos, andamento que ainda não existe é FILA, e não defeito: o programa que monta
  // olha a fila de minuto em minuto, e a paciência de oitenta segundos logo abaixo é
  // quem decide quando a ausência vira assunto.
  let d = null;
  if (await postoDePe()) {
    try {
      const r = await noPosto("/pedido?id=" + OBRA.id);
      d = r.tem ? r.d : null;
    } catch (e) {
      return semContato("Não consegui ler o andamento: " + (e.message || e) + ".");
    }
  } else {
    const p = await pastaDo("pedidos", false);
    if (!p) return semContato("O posto está fora e a pasta do Estúdio não está liberada nesta aba.");
    try {
      const f = await (await p.getFileHandle(`${OBRA.id}.andamento.json`)).getFile();
      d = JSON.parse(await f.text());
    } catch (e) {
      /* ARQUIVO QUE AINDA NÃO EXISTE NÃO É DEFEITO, É FILA.

         O QUE ELE VIU: "Não consegui ler o andamento: A requested file or directory
         could not be found at the time an operation was processed." Isso é o recado do
         sistema para um arquivo que ainda não foi criado, e ele não foi criado porque o
         programa que monta olha a fila DE MINUTO EM MINUTO. Nos primeiros sessenta
         segundos a ausência do arquivo é o estado normal, e mostrá-la como erro em
         inglês faz procurar defeito onde não há. */
      if (!e || e.name !== "NotFoundError")
        return semContato("Não consegui ler o andamento: " + (e.message || e) + ".");
    }
  }
  if (!d) {
    OBRA.mudo = (OBRA.mudo || 0) + 1;
    // OITENTA SEGUNDOS DE PACIENCIA, que é o minuto do programa mais folga. Depois
    // disso, aí sim, alguma coisa está errada e vale dizer.
    if (OBRA.mudo * 3 < 80) {
      $("apl_obra_txt").textContent = "na fila, esperando o programa pegar";
      $("apl_obra_nota").textContent = "ele olha a fila de minuto em minuto. "
        + "Assim que pegar, a barra começa a andar sozinha.";
      return;
    }
    return semContato("O programa não pegou o pedido em mais de um minuto.");
  }
  OBRA.mudo = 0;
  OBRA.jaViu = true;

  // NA FILA NÃO É SUMIDO: o posto responde `fila` quando o pedido existe e a oficina
  // ainda não o pegou (uma leva longa na frente segura a fila por horas). Antes, três
  // minutos mudos terminavam em "confira se a oficina está de pé" com ela viva e
  // trabalhando (auditoria de 25/08/2026).
  if (d.fila) {
    OBRA.mudo = 0;
    $("apl_obra_txt").textContent = "na fila, atrás de um trabalho em curso";
    $("apl_obra_nota").textContent = "a oficina termina o que está fazendo e pega "
      + "este pedido em seguida; a barra anda sozinha quando chegar a vez.";
    return;
  }
  if (d.erro) {
    pararDeOlhar(false);          // a barra fica onde parou: ver a nota em pararDeOlhar
    $("apl_obra_txt").textContent = "não deu: " + d.erro;
    return;
  }
  const feitos = d.feitos || 0, total = d.total || OBRA.total;
  pintarObra("apl", { total, feitos, falhas: d.falhas, atual: d.atual,
                      segundos: d.segundos, fim: d.fim }, "peças montadas");
  if (!d.fim) {
    // A ESTEIRA APARECE COMO ESTEIRA: com as vagas trabalhando, "montando 1 de 107"
    // lia como máquina parada na primeira peça (auditoria de 25/08/2026).
    if (d.esteira && d.esteira.vagas) {
      $("apl_obra_txt").textContent = "na esteira: " + (d.esteira.colhidas || 0)
        + " de " + d.esteira.vagas + " vagas colhidas";
    } else {
      $("apl_obra_txt").textContent = `montando ${feitos + 1} de ${total}`;
    }
    $("apl_obra_nota").textContent = d.atual ? `agora: ${d.atual}` : "";
    return;
  }
  // A DESISTÊNCIA DA ESTEIRA NÃO SOME: as peças que não voltaram viraram um pedido
  // local (mesmo id com "r" no fim), e a vigia SEGUE nele em vez de declarar vitória
  // com a leva pela metade (auditoria de 25/08/2026).
  if (d.aviso && !OBRA.id.endsWith("r")) {
    $("apl_obra_txt").textContent = "a esteira devolveu parte da leva";
    $("apl_obra_nota").textContent = d.aviso
      + ". Sigo acompanhando as peças que voltaram para esta máquina.";
    OBRA.id = OBRA.id + "r";
    OBRA.mudo = 0;
    OBRA.jaViu = false;
    return;
  }
  // O FIM DE VERDADE VEM DO RE-SCAN, e não do andamento montado à mão: o andamento
  // final traz a pasta como caminho ABSOLUTO do disco da casa e não traz a lista de
  // arquivos, e o MONTADO manual deixava a etapa 4 abrir zerada até um F5 (auditoria
  // de 25/08/2026). O procurarMontagem devolve pasta relativa, peças e arquivos.
  MONTADO = null;
  try { await procurarMontagem(); } catch (e) { /* o fallback abaixo cobre */ }
  if (!MONTADO) {
    MONTADO = { pecas: feitos, pasta: "", arquivos: [], onde: "edicoes/" };
  }
  pararDeOlhar(true);
  $("apl_obra_txt").textContent = `${feitos} ${feitos === 1 ? "peça montada" : "peças montadas"}`
    + (d.falhas ? `, ${d.falhas} falharam` : "");
  // O ENDEREÇO É O data-abrir, como no recorte: a versão anterior lia uma variável
  // `link` que nunca existiu, o fim de toda montagem estourava aqui e a tela nem
  // avançava sozinha ao passo 4. Achado da auditoria de 25/08/2026 (o vigia de nomes
  // só olhava função chamada, não variável lida).
  $("apl_obra_nota").innerHTML = 'estão em <a href="#" data-abrir="'
    + escapa(MONTADO.onde) + '">' + escapa(MONTADO.pasta || "a pasta da montagem")
    + "</a>. Os recortes continuam onde estavam, intactos."
    // O DIARIO DAS QUE FALHARAM, peca a peca: sem ele o "3 falharam" acima
    // obrigava a perguntar quais e por que (fecho de 25/08/2026).
    + linhasDoDiario(d.diario);
  /* O SELO DO FECHO, igual ao do recorte, e so' quando a conta fecha. Peca que falhou
     mantem a barra de pe' com os numeros: verificado verde por cima de falha seria a
     tela afirmando o que nao aconteceu. */
  if (!d.falhas && feitos >= total) {
    fecharObra("apl", num(total) + (total === 1 ? " Peça Montada" : " Peças Montadas")
               + ", 100%: Pode Entregar");
  }
  desenhaFeito();
  irParaPasso(4);
}

/* DEPOIS DE MONTAR NÃO SE OFERECE MONTAR DE NOVO. "Eu já apliquei uma vez, por que vai
   ser aplicado novamente? não faz sentido." O botão fica escondido enquanto houver
   montagem cumprida desta leva, e não apagado, pela ressalva dele de que um dia talvez
   volte. */
function desenhaFeito() {
  const tem = !!MONTADO;
  $("apl_montar").hidden = tem;
  $("ajs_acertar").hidden = tem;
  $("apl_feito").hidden = !tem;
  if (!tem) return;
  $("apl_pasta").dataset.abrir = MONTADO.onde;
  $("apl_resumo").innerHTML = `<b>${num(MONTADO.pecas)}</b> `
    + (MONTADO.pecas === 1 ? "peça montada" : "peças montadas") + ".";
}

$("apl_segue").onclick = () => irParaPasso(4);

/* A BARRA CHEIA E' UM FIM FELIZ, e por isso ela saiu daqui.

   ESTA FUNCAO E' CHAMADA NOS DOIS FINAIS, o bom e o ruim, e ela enchia a barra nos dois.
   A montagem estourava na peca 12 de 107, a barra pulava para cheia, e ao lado dela o
   texto dizia "nao deu". Quem olhasse de longe veria uma barra cheia e iria embora. */
function pararDeOlhar(cheia) {
  // O TOTAL E' GUARDADO ANTES DE A OBRA MORRER: e' ele que diz quantas marcas encher.
  const OBRA_TOTAL = OBRA ? OBRA.total : 0;
  if (OBRA && OBRA.relogio) clearInterval(OBRA.relogio);
  OBRA = null;
  // A BARRA CHEIA agora e' a fileira inteira marcada, e nao um retangulo esticado.
  if (cheia && OBRA_TOTAL) {
    pintarObra("apl", { total: OBRA_TOTAL, feitos: OBRA_TOTAL, fim: true },
               "peças montadas");
  }
  document.querySelector("#apl_obra .cfg-girando").style.display = "none";
  resumoDeAplicar();
}


/* ==================================================================== O PASSO 4

   O QUE ELE FAZ, DEFINIDO POR ELE EM 23/08/2026, e são duas subetapas em ordem:

     4.1  as descrições. "Pegar o arquivo, a descrição original do post, apenas
          adaptá-la. Depois disso a gente coloca um padrão pra toda a descrição, por
          exemplo com CTA, pedindo pra seguir."
     4.2  a entrega. "Compactar, separar cada vídeo em sua devida pasta... dentro dessa
          pasta vai ter tanto o vídeo quanto o arquivo da descrição... upar dentro de uma
          pasta do Drive, botar uma nomenclatura específica."

   E O FIM DA LINHA: "a gente voltaria lá pra tabela de minerados e atualizaria aqui:
   olha, esse perfil aqui foi 100% concluído". Quem marca é a 4.2, e só depois de os
   arquivos terem chegado ao Drive de verdade. Marcar antes seria relatório falso. */

let LEG_SUB = 1;                   // em qual subetapa do passo 4 ele está
let DESCRICOES = new Map();        // arquivo -> a descrição pronta do post
let ORIGEM_DA_PECA = new Map();    // arquivo -> { legenda, endereco } do post original
let ORIGEM_FALHOU = "";            // o motivo, quando a leitura do _lote.json falhou
let RODAPE = null;                 // o fecho que vai em todas; null = ainda não lido
let DSC_OBRA = null;               // o pedido de escrita das descrições, em curso
let ENT_OBRA = null;               // o pedido de entrega, em curso
let ENTREGUE = null;               // o que a entrega devolveu, quando terminou
let DRIVE = null;                  // a última resposta do posto sobre o Drive
let RELOGIO_DO_DRIVE = null;

/* O MESMO FECHO QUE O `oficina.py` USA, e os dois textos precisam bater. Ele vive nos
   dois lados porque a tela mostra o valor de partida antes de existir pedido nenhum, e o
   programa precisa de um padrão para quando o pedido vier sem fecho. A prova `fecho`
   compara os dois: se um mudar sozinho, ela acusa. */
const RODAPE_PADRAO = "Siga para acompanhar.";

/* UM OLHEIRO SÓ PARA OS DOIS PEDIDOS NOVOS, e não um por fase.

   A FASE 3 TEM O DELA, `olharAEscrita`, com sessenta linhas de tratamento de silêncio
   que custaram caro para acertar. Copiar aquilo duas vezes seria três verdades sobre a
   mesma coisa, e a terceira ficaria velha na primeira correção. Este aqui é a versão
   enxuta que serve às duas fases novas: quem chama diz o que fazer a cada notícia e o
   que fazer no fim.

   O SILÊNCIO DO COMEÇO É NORMAL: o programa passa na pasta de pedidos de minuto em
   minuto, então o arquivo de andamento não existe nos primeiros segundos. Só depois de
   três minutos mudos é que ele desiste, e mesmo aí diz que o trabalho pode estar
   acontecendo do lado de lá, porque quem trabalha é o `oficina.py` e não esta aba. */
function olharOPedido(obra, aoAndar, aoTerminar) {
  const parar = () => { clearInterval(obra.relogio); obra.morto = true; };
  return async function () {
    if (obra.morto) return;
    const seg = Math.round((Date.now() - obra.desde) / 1000);
    obra.tempo = seg < 60 ? seg + "s"
      : Math.floor(seg / 60) + " min " + (seg % 60) + "s";
    let d = null;
    try {
      if (await postoDePe()) {
        const r = await noPosto("/pedido?id=" + encodeURIComponent(obra.id));
        d = r.tem ? r.d : null;
      } else {
        const p = await pastaDo("pedidos", false);
        if (!p) throw new Error("o posto não atende e a pasta não está liberada aqui");
        const f = await (await p.getFileHandle(`${obra.id}.andamento.json`)).getFile();
        d = JSON.parse(await f.text());
      }
    } catch (e) { d = null; obra.porque = e.message || String(e); }
    if (!d) {
      obra.mudo = (obra.mudo || 0) + 1;
      if (obra.mudo * 3 >= 180) {
        parar();
        aoTerminar({ erro: "Perdi o contato com o programa. Recarregue a página (F5): "
          + "se o trabalho terminou, o resultado aparece." });
        return;
      }
      if (obra.mudo * 3 >= 25) aoAndar({ semContato: true, tempo: obra.tempo });
      return;
    }
    obra.mudo = 0;
    if (d.erro) { parar(); aoTerminar({ erro: d.erro }); return; }
    if (!d.fim) { aoAndar(Object.assign({ tempo: obra.tempo }, d)); return; }
    parar();
    aoTerminar(Object.assign({ tempo: obra.tempo }, d));
  };
}

/** Deixa um pedido na caixa do programa. Pelo posto, e a pasta liberada de plano B. */
/* DEIXAR O PEDIDO E' O GESTO MAIS CARO DA TELA, e por isso ele insiste.

   O QUE ACONTECEU EM 29/08/2026, 02:19: ele clicou em Fabricar depois de a IA escrever
   as 180. A composicao foi gravada e o nome da pasta foi reservado (as duas coisas
   ficaram no registro da casa), e o pedido nao chegou. Trinta e sete segundos depois
   ele recarregou a pagina. Nada ficou de pe' para dizer por que.

   ENTAO SAO TRES MUDANCAS, e cada uma cobre uma parte do que pode ter sido: paciencia
   de noventa segundos (o corpo e' de 89 KB e a casa estava ocupada), uma segunda
   tentativa com o batimento refeito no meio, e o recado dizendo que pode clicar de
   novo. REPETIR E' SEGURO: o pedido leva id proprio e o segundo envio grava por cima
   do mesmo arquivo, entao nao existe leva montada duas vezes. */
const PACIENCIA_DO_PEDIDO = 90000;

async function deixarPedido(pedido) {
  if (await postoDePe()) {
    try {
      await noPosto("/pedido", pedido, PACIENCIA_DO_PEDIDO);
    } catch (e) {
      await new Promise(r => setTimeout(r, 1500));
      POSTO_DE_PE = null;              // o batimento se refaz antes de insistir
      if (!(await postoDePe())) throw e;
      await noPosto("/pedido", pedido, PACIENCIA_DO_PEDIDO);
    }
    return;
  }
  const pedidos = await pastaDo("pedidos", true);
  if (!pedidos) throw new Error(SEM_POSTO);
  const h = await pedidos.getFileHandle(`${pedido.id}.json`, { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify(pedido, null, 1));
  await w.close();
}

/* PROCURA NO DISCO SE ESTA LEVA JA' FOI MONTADA, e e' o disco quem responde.

   O `MONTADO` so' existia na memoria desta aba: recarregar a pagina depois de montar
   107 pecas trazia o passo 4 dizendo "0 pecas montadas", com as 107 na pasta ao lado.
   Zero e' um numero, e numero na tela e' medido, nao deduzido. Trava 2 do CLAUDE.md. */
async function procurarMontagem() {
  if (!EDIT_LEVA) return;
  // O POSTO PRIMEIRO, desde 25/08/2026: as edições moram na casa, e a casa está na
  // VPS. O passo da sequência (leva-N, leva-N (2)...) é o mesmo nos dois mundos.
  if (await postoDePe()) {
    try {
      const r = await noPosto(`/montagem?leva=${EDIT_LEVA.numero}`);
      if (!r.tem) return;
      MONTADO = { pecas: (r.nomes || []).length, pasta: r.pasta,
                  arquivos: (r.nomes || []).slice().sort(),
                  onde: "edicoes/" + r.pasta };
    } catch (e) { /* sem olhar de verdade, nada se apaga */ }
    return;
  }
  if (!EDIT_RAIZ) return;
  const raiz = await pastaDo("edicoes", false);
  if (!raiz) return;
  // O MESMO FORMATO DO `nomeLivre` E DO `abrir.py`: leva-N, leva-N (2), leva-N (3).
  const base = `leva-${EDIT_LEVA.numero}`;
  let achada = null;
  for (let n = 1; n <= 99; n++) {
    const nome = n === 1 ? base : `${base} (${n})`;
    let pasta = null;
    try { pasta = await raiz.getDirectoryHandle(nome); }
    catch (e) { break; }                 // acabou a sequencia
    // OS NOMES, E NÃO SÓ A CONTAGEM. A etapa 4 precisa saber QUAIS peças foram
    // montadas: são elas que ganham descrição e são elas que sobem. Contar dizia
    // quantas, e a etapa seguinte ficava sem saber para quem escrever.
    const nomes = [];
    for await (const [x, h] of pasta.entries()) {
      if (h.kind === "file" && x.toLowerCase().endsWith(".mp4")) nomes.push(x);
    }
    if (nomes.length) achada = { pecas: nomes.length, pasta: nome, n,
                                 arquivos: nomes.sort() };
  }
  if (!achada) return;
  MONTADO = { pecas: achada.pecas, pasta: achada.pasta, arquivos: achada.arquivos,
              onde: "edicoes/" + achada.pasta };
}

/* A LEGENDA ORIGINAL DE CADA POST, lida do `_lote.json` da leva.

   FOI ELE QUEM ACHOU ISTO, em 23/08/2026, e com razão de estar irritado: eu tinha dado
   o dado por perdido e proposto recomeçar a leva. "Te vira, porra. Eu sei que os links
   dos posts foram salvos". Estavam: o `_lote.json` guarda legenda e endereço de cada
   post, e as duas levas no disco foram refeitas a partir do acervo da mineração. As 148
   peças das levas 28 e 29 têm as 148 legendas.

   O PROGRAMA LÊ ISTO SOZINHO quando vai escrever; aqui é para a tela saber contar e para
   ele poder ver a original ao lado da nova, que é o único jeito de julgar se ficou boa. */
async function lerAOrigem() {
  ORIGEM_DA_PECA.clear();
  if (!EDIT_LEVA) return;
  ORIGEM_FALHOU = "";
  try {
    let d = null;
    // O POSTO PRIMEIRO, desde 25/08/2026: o `_lote.json` mora na leva, e a leva na casa.
    if (await postoDePe()) {
      const r = await fetch(urlDoArquivo(pastaDaLeva() + "/_lote.json"),
        { cache: "no-store" });
      if (!r.ok) {
        // 404 é leva antiga sem lote; qualquer outra recusa é leitura que falhou, e
        // os dois não podem virar a mesma frase na tela.
        if (r.status !== 404) ORIGEM_FALHOU = "o posto respondeu " + r.status;
        return;
      }
      d = await r.json();
    } else {
      const levas = await pastaDo("levas", false);
      if (!levas) return;
      const pasta = await levas.getDirectoryHandle(`leva-${EDIT_LEVA.numero}`);
      const f = await (await pasta.getFileHandle("_lote.json")).getFile();
      d = JSON.parse(await f.text());
    }
    for (const x of (d.itens || [])) {
      if (x.arquivo_local) {
        ORIGEM_DA_PECA.set(x.arquivo_local, {
          legenda: (x.legenda || "").trim(), endereco: x.endereco || "" });
      }
    }
  } catch (e) {
    // FALHA DE LEITURA NÃO É AUSÊNCIA. O fetch que rejeita (posto reiniciando,
    // resposta truncada) caía aqui sem marcar nada, e a etapa 4.1 afirmava "sem
    // legenda de origem" sobre um dado que existe: o mesmo falso positivo já
    // consertado no ramo dos status. Só o caminho da pasta local (leva antiga sem
    // lote, NotFoundError) segue em silêncio, que aí é ausência de verdade.
    if (!(e && e.name === "NotFoundError")) {
      ORIGEM_FALHOU = (e && e.message) ? e.message : "a leitura falhou";
    }
  }
}

async function entrarNaLegenda() {
  if (!MONTADO) await procurarMontagem();
  if (!ORIGEM_DA_PECA.size) await lerAOrigem();
  if (RODAPE == null) RODAPE = RODAPE_PADRAO;
  // O RESUMO DA MONTAGEM É PINTADO AQUI, e não só quando a 4.2 abre.
  //
  // ELE MORA NA 4.2, mas quem responde "quantas peças existem" é o passo inteiro. Com a
  // pintura presa à subetapa, entrar no passo 4 pela 4.1 deixava o número intocado, e o
  // que ficava na tela era o "0" que estava escrito no molde: um zero que ninguém mediu.
  // "Não sei" e "zero" são respostas diferentes, e trocar uma pela outra é a trava 2 do
  // CLAUDE.md. Quem pegou foi a prova `montagem`.
  mostrarAMontagem();
  irParaSubLeg(LEG_SUB || 1);
}

/** O que a montagem deixou: quantas peças, em que pasta, e como abri-la. */
function mostrarAMontagem() {
  if (!MONTADO) {
    // NÃO SEI NÃO É ZERO. Ver a nota em `procurarMontagem`.
    $("pos_n").textContent = "—";
    $("pos_pasta").textContent = "Não achei nenhuma montagem desta leva na pasta de "
      + "edições. Se você montou agora, espere a montagem terminar; se o posto estiver "
      + "fora, confira se a pasta do Estúdio está liberada nesta aba.";
    delete $("pos_abrir").dataset.abrir;
    return;
  }
  $("pos_n").textContent = num(MONTADO.pecas);
  $("pos_pasta").textContent = MONTADO.pasta;
  $("pos_abrir").dataset.abrir = MONTADO.onde;
}

/** As peças que a etapa 4 trata: as que a montagem produziu, e mais nenhuma. */
function pecasDaEntrega() {
  return (MONTADO && MONTADO.arquivos) ? MONTADO.arquivos : [];
}

function irParaSubLeg(n) {
  LEG_SUB = n;
  document.querySelectorAll('.ed-etapa[data-passo="4"] .ed-sub-tela').forEach(t =>
    t.hidden = Number(t.dataset.sub) !== n);
  if (n === 1) entrarNasDescricoes();
  if (n === 2) entrarNaEntrega();
  desenhaSubTrilho4();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function desenhaSubTrilho4() {
  document.querySelectorAll("#ed_sub4 li").forEach(li => {
    const q = Number(li.dataset.sub);
    li.classList.toggle("agora", q === LEG_SUB);
    li.classList.toggle("feito", q < LEG_SUB);
  });
  const prontas = quantasDescritas();
  const total = pecasDaEntrega().length;
  // "ENTREGUE" NO TRILHO SÓ COM A CONFERÊNCIA DO DRIVE; só empacotar diz "empacotada",
  // que é o que foi medido. Auditoria de 25/08/2026.
  $("ed_r4").textContent = ENTREGUE
    ? (ENTREGUE.verificado ? "entregue" : "empacotada, sem subir")
    : total ? `${prontas} de ${total} descritas` : "depois da montagem";
  const b = document.querySelector('#ed_trilho .ed-ponto[data-passo="4"] .ed-barra b');
  if (b && EDIT_PASSO === 4) {
    b.style.height = (ENTREGUE && ENTREGUE.verificado)
      ? "100%" : ((LEG_SUB - 1) * 50) + "%";
  }
}

document.querySelectorAll("#ed_sub4 li").forEach(li => {
  li.onclick = () => irParaSubLeg(Number(li.dataset.sub));
});

const quantasDescritas = () =>
  pecasDaEntrega().filter(a => (DESCRICOES.get(a) || "").trim()).length;

/* ---------------------------------------------------- 4.1 · as descrições */

async function entrarNasDescricoes() {
  /* A CONFIGURAÇÃO DA IA É LIDA ANTES DE PERGUNTAR SE ELA EXISTE, e a primeira versão
     desta função não fazia isso: ela olhava `IA.chaves` na hora, e quem entrasse no
     passo 4 antes de a aba ter lido o arquivo via "Nenhuma IA configurada" com as duas
     chaves dele configuradas. É a mesma ordem da fase 3, em `entrarNaIA`.

     E CHAVE ESGOTADA NÃO É CHAVE. Contar a que já bateu o teto do dia faria a tela
     oferecer o botão e o pedido voltar sem nada escrito. `estaEsgotada` é quem sabe. */
  await lerIA();
  const pecas = pecasDaEntrega();
  const comOrigem = pecas.filter(a => (ORIGEM_DA_PECA.get(a) || {}).legenda).length;
  const vivas = (IA.chaves || []).filter(c => c.chave && !estaEsgotada(c));
  const temChave = vivas.length > 0;
  // TRÊS ESTADOS, E CADA UM PEDE UMA COISA DIFERENTE. Sem origem não há o que adaptar;
  // sem chave não há quem escreva; com os dois, trabalha.
  $("dsc_sem_pecas").hidden = !!pecas.length;
  // LEITURA QUE FALHOU NÃO É LEVA SEM ORIGEM: quando o posto recusou o _lote.json
  // (que não seja o 404 de leva antiga), a caixa diz o motivo em vez de afirmar que a
  // leva nunca guardou a legenda. Trava 2 do CLAUDE.md, auditoria de 25/08/2026.
  const semOrigem = pecas.length && !comOrigem;
  $("dsc_sem_origem").hidden = !semOrigem;
  if (semOrigem && ORIGEM_FALHOU) {
    $("dsc_sem_origem").innerHTML = "<b>Não consegui ler a legenda de origem.</b>"
      + '<p class="nota">' + escapa(ORIGEM_FALHOU)
      + ". Recarregue a página e tente de novo.</p>";
  }
  $("dsc_sem_chave").hidden = !(comOrigem && !temChave);
  $("dsc_corpo").hidden = !(comOrigem && temChave);
  if ($("dsc_rodape").value !== (RODAPE == null ? RODAPE_PADRAO : RODAPE)) {
    $("dsc_rodape").value = RODAPE == null ? RODAPE_PADRAO : RODAPE;
  }
  // O MESMO NOME QUE A FASE 3 MOSTRA, pela mesma função. Dois jeitos de escrever o nome
  // do mesmo serviço na mesma tela é duas verdades sobre quem está trabalhando.
  if (temChave) {
    $("dsc_quem").textContent = "Escrevendo com " + nomeDoServico(vivas[0].servico);
    $("dsc_quanto").textContent = (comOrigem === pecas.length
      ? `${pecas.length} ${pecas.length === 1 ? "peça" : "peças"} com legenda de origem`
      : `${comOrigem} de ${pecas.length} com legenda de origem`)
      + (vivas.length > 1
         ? `. Se ela bater o limite, as outras ${vivas.length - 1} da fila assumem.`
         : ". É a única chave da fila hoje.");
  }
  desenhaDescricoes();
  contaDescricoes();
}

function contaDescricoes() {
  const total = pecasDaEntrega().length, prontas = quantasDescritas();
  $("dsc_conta").innerHTML = total
    ? `<b>${num(prontas)}</b> de ${num(total)} descritas`
    : "nenhuma peça montada ainda";
  $("dsc_escrever").disabled = !!DSC_OBRA || prontas === total || !total;
  $("dsc_escrever").textContent = !total ? "Nada para escrever"
    : prontas === total ? "Todas escritas"
    : prontas ? (total - prontas === 1 ? "Escrever a que falta"
                 : `Escrever as ${num(total - prontas)} que faltam`)
    : "Escrever as descrições";
  $("dsc_apagar").hidden = !prontas;
  $("dsc_vai_entrega").disabled = !total;
  desenhaSubTrilho4();
}

/* O QUE ELA ESCREVEU, ABERTO PARA ELE LER E MEXER.

   DESCRIÇÃO NÃO SE APROVA NO ESCURO: é o texto que vai junto do post, e mostrar só a
   contagem seria a mesma cegueira da galeria antes de existir a primeira olhada. A
   original fica ao lado, porque sem ela não há como julgar se a nova tem a ver. */
function desenhaDescricoes() {
  const casa = $("dsc_lista");
  /* SÓ APARECE O QUE JÁ FOI ESCRITO, e a lista não existe antes disso.

     ELE JÁ TINHA CORTADO ISTO UMA VEZ, na fase 3: "eu cheguei na etapa da IA escrever,
     é pra literalmente eu ter apenas a tela de carregamento da IA escrevendo". E eu
     repeti o mesmo erro aqui, cento e sete caixas de texto vazias esperando ele digitar.
     A frase dele em 23/08/2026 foi direta: "era só pra ter um botão e eu conseguir
     acompanhar, ter a tela de loading, e depois eu olhar a descrição de cada vídeo".

     ENTÃO A ORDEM É: botão, barra, e só então a leitura. Antes de escrever não há o que
     olhar, e uma caixa vazia na tela é um pedido para ele fazer o trabalho da máquina. */
  const escritas = pecasDaEntrega().filter(a => (DESCRICOES.get(a) || "").trim());
  if (!escritas.length) { casa.innerHTML = ""; return; }
  const ordem = pecasDaEntrega();
  casa.innerHTML = escritas.map(a => {
    const texto = DESCRICOES.get(a) || "";
    const o = ORIGEM_DA_PECA.get(a) || {};
    // QUAL VÍDEO É ESTE. O nome do arquivo ele mandou tirar da tela em 23/08 ("não quero
    // que isso fique aparecendo"), e "peça 7" sozinho não diz de que trata. Quem diz é a
    // primeira linha da legenda original: é o assunto do vídeo, escrito por quem o fez.
    const dica = (o.legenda || "").split(/\r?\n/)[0].slice(0, 70);
    return `<div class="dsc-item" data-arq="${escapar(a)}">
      <div class="dsc-item-topo">
        <b>peça ${ordem.indexOf(a) + 1}</b>
        <i>${escapar(dica)}</i>
        <span>${texto.length} caracteres</span>
      </div>
      <textarea data-desc="${escapar(a)}" rows="4">${escapar(texto)}</textarea>
    </div>`;
  }).join("");
}

/* ESCAPAR O QUE VEM DE FORA, sempre. A legenda vem do Instagram e o nome do arquivo vem
   do disco: os dois são texto de terceiro entrando num pedaço de página montado com
   `innerHTML`. Sem isto, uma legenda com `<` quebra a lista, e uma com `<img onerror>`
   faz bem pior do que quebrar. */
function escapar(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// MEXEU NO TEXTO, VALE O DELE. Um ouvinte só para a lista inteira: são até cento e sete
// caixas, e ligar evento em cada uma é ligar cento e sete eventos que renascem a cada
// redesenho.
$("dsc_lista").addEventListener("input", ev => {
  const t = ev.target.closest("textarea[data-desc]");
  if (!t) return;
  const arq = t.dataset.desc;
  const v = t.value.trim();
  if (v) DESCRICOES.set(arq, t.value); else DESCRICOES.delete(arq);
  const item = t.closest(".dsc-item");
  if (item) {
    item.classList.toggle("sem", !v);
    const conta = item.querySelector(".dsc-item-topo span");
    if (conta) conta.textContent = v ? v.length + " caracteres" : "por escrever";
  }
  contaDescricoes();
  anotarMexida();
});

$("dsc_rodape").addEventListener("input", () => {
  RODAPE = $("dsc_rodape").value;
  anotarMexida();
});

$("dsc_apagar").onclick = () => {
  if (!confirm("Apagar as descrições escritas? O que você mexeu à mão vai junto.")) return;
  DESCRICOES.clear();
  desenhaDescricoes();
  contaDescricoes();
  salvarRascunho();
};

/* SÓ O QUE FALTA, E NUNCA O QUE JÁ ESTÁ ESCRITO. Mesma regra da fase 3, pelo mesmo
   motivo: numa cota com teto por dia, refazer o que já está pronto é não terminar
   nunca. Acabou a cota no meio? Ele clica de novo amanhã e continua de onde parou. */
async function pedirDescricoes() {
  if (DSC_OBRA) return;
  const alvos = pecasDaEntrega().filter(a =>
    !(DESCRICOES.get(a) || "").trim() && (ORIGEM_DA_PECA.get(a) || {}).legenda);
  if (!alvos.length) return;
  try {
    const id = "d" + Date.now();
    await deixarPedido({
      id, tipo: "descrever", leva: EDIT_LEVA.numero,
      // A PASTA DA LEVA, e não a da edição: é lá que mora o `_lote.json` com as legendas
      // originais. O programa lê de lá; ver `originais_da_leva` no `oficina.py`.
      pasta: `leva-${EDIT_LEVA.numero}`,
      pecas: alvos.map(a => ({ arquivo: a })),
      // O TETO REAL DA LEGENDA DO INSTAGRAM É 2200 COM O FECHO DENTRO: o programa cola
      // o fecho depois do texto da IA, então o limite pedido desconta o fecho, senão a
      // soma estoura e o Instagram corta o fim. Auditoria de 25/08/2026.
      limite: (() => {
        const fecho = (RODAPE == null ? RODAPE_PADRAO : RODAPE).trim();
        const teto = 2200 - (fecho ? fecho.length + 2 : 0);
        return Math.max(120, Math.min(teto, Number($("dsc_max").value) || 500));
      })(),
      rodape: (RODAPE == null ? RODAPE_PADRAO : RODAPE).trim(),
    });
    DSC_OBRA = { id, desde: Date.now(), total: alvos.length, relogio: null, mudo: 0 };
    $("dsc_escrever").disabled = true;
    $("dsc_obra").hidden = false;
    $("dsc_barra").style.width = "0%";
    document.querySelector("#dsc_obra .cfg-girando").style.display = "";
    $("dsc_obra_txt").textContent = "Pedido Deixado";
    $("dsc_obra_nota").textContent = "A escrita começa em até um minuto, que é o passo do "
      + "programa da casa do Estúdio que fala com a IA.";
    const olhar = olharOPedido(DSC_OBRA, andouADescricao, terminouADescricao);
    DSC_OBRA.relogio = setInterval(olhar, 3000);
    olhar();
  } catch (e) {
    parado("dsc_recado", e.message);
  }
}
$("dsc_escrever").onclick = () => pedirDescricoes();

function andouADescricao(d) {
  $("dsc_obra_tempo").textContent = d.tempo || "";
  if (d.semContato) {
    $("dsc_obra_txt").textContent = "Sem contato com o programa";
    $("dsc_obra_nota").textContent = "Continuo tentando. O trabalho pode estar "
      + "acontecendo mesmo assim, porque quem escreve é o programa e não esta tela.";
    return;
  }
  const total = d.total || DSC_OBRA.total, feitos = d.feitos || 0;
  $("dsc_barra").style.width = Math.round(feitos / Math.max(1, total) * 100) + "%";
  $("dsc_obra_txt").textContent = `Escrevendo ${Math.min(feitos + 1, total)} de ${total}`;
  $("dsc_obra_nota").textContent = d.atual ? `Agora: ${d.atual}` : "";
  // CADA LEGENDA PAGA ENTRA NO RASCUNHO ASSIM QUE APARECE, como a escrita já faz: o
  // andamento passou a carregar os textos (25/08/2026), e sem esta absorção um F5 no
  // meio jogava fora o que a cota do dia já tinha pago.
  let chegou = false;
  for (const [arq, texto] of Object.entries(d.textos || {})) {
    if (texto && !DESCRICOES.get(arq)) { DESCRICOES.set(arq, texto); chegou = true; }
  }
  if (chegou) { desenhaDescricoes(); contaDescricoes(); salvarRascunho(); }
}

async function terminouADescricao(d) {
  DSC_OBRA = null;
  document.querySelector("#dsc_obra .cfg-girando").style.display = "none";
  $("dsc_escrever").disabled = false;
  if (d.erro) { $("dsc_obra_txt").textContent = "Não deu: " + d.erro; return; }
  for (const [arq, texto] of Object.entries(d.textos || {})) {
    if (texto) DESCRICOES.set(arq, texto);
  }
  const feitos = d.feitos || 0;
  $("dsc_barra").style.width = "100%";
  $("dsc_obra_txt").textContent = `${feitos} ${feitos === 1 ? "descrição escrita" : "descrições escritas"}`
    + (d.falhas ? `, ${d.falhas} falharam` : "")
    // A CONTA TEM DE FECHAR: sem esta parcela, 92 de 107 pareceriam 15 sumidas.
    + (d.sem_original ? `, ${d.sem_original} sem legenda de origem` : "");
  $("dsc_obra_nota").textContent = d.parou_por
    ? `${d.parou_por} Faltam ${d.restantes} de ${d.total}. Clique de novo quando tiver `
      + "cota: ele continua de onde parou, sem refazer as que já estão prontas."
    : "";
  // GRAVA NA HORA. O que acabou de chegar custou cota, e um F5 antes da próxima
  // gravação jogaria fora texto que não dá para refazer de graça.
  desenhaDescricoes();
  contaDescricoes();
  await salvarRascunho();
  if (typeof lerUsoDaIA === "function") await lerUsoDaIA();
}

$("dsc_volta").onclick = () => irParaPasso(3);
$("dsc_vai_entrega").onclick = () => irParaSubLeg(2);

/* ---------------------------------------------------- 4.2 · a entrega */

async function entrarNaEntrega() {
  if (!MONTADO) await procurarMontagem();
  mostrarAMontagem();
  const total = pecasDaEntrega().length, prontas = quantasDescritas();
  $("ent_nome").textContent = nomeDaEntrega();
  $("ent_quantas").textContent = `${num(total)} ${total === 1 ? "peça" : "peças"}`
    + (prontas < total ? `, ${num(total - prontas)} sem descrição` : ", todas descritas");
  // AVISAR ANTES, E NÃO DEPOIS. Subir cento e sete vídeos e só então descobrir que
  // quinze foram sem legenda é descobrir tarde: desfazer isso é apagar no Drive.
  $("ent_aviso").textContent = prontas < total
    ? "As peças sem descrição sobem assim mesmo, só com o vídeo. Volte às descrições se "
      + "quiser escrevê-las antes."
    : "";
  $("ent_subir").disabled = !!ENT_OBRA || !total;
  $("ent_so_pacote").disabled = !!ENT_OBRA || !total;
  // "ENTREGUE" SÓ COM A CONFERÊNCIA DO DRIVE: sem `verificado`, o que houve foi
  // empacotamento, e a palavra tem de medir isso. Auditoria de 25/08/2026.
  $("ent_conta").innerHTML = ENTREGUE
    ? `<b>${num(ENTREGUE.feitos || 0)}</b> ${ENTREGUE.verificado ? "entregues" : "empacotadas"}`
    : `<b>${num(prontas)}</b> de ${num(total)} descritas`;
  verODrive();
  desenhaSubTrilho4();
}

/* O NOME NO DRIVE. Ele deu o exemplo: "leva 29 de thenews.business". O mesmo cálculo
   mora no `oficina.py`, em `nome_da_entrega`, e é ele quem manda: este aqui só mostra
   antes, para ele saber onde a coisa vai cair. A prova `entrega` compara os dois. */
function nomeDaEntrega() {
  const contas = (EDIT_LEVA && EDIT_LEVA.contas) || [];
  const n = EDIT_LEVA ? EDIT_LEVA.numero : "?";
  const quem = !contas.length ? "sem conta"
    : contas.length === 1 ? contas[0]
    : contas.length === 2 ? `${contas[0]} e ${contas[1]}`
    : `${contas[0]} e mais ${contas.length - 1}`;
  return `leva ${n} de ${quem}`;
}

/* O DRIVE, E O ÚNICO PONTO DO SISTEMA QUE DEPENDE DELE.

   ENTRAR NA CONTA DO GOOGLE É COISA QUE SÓ O DONO DA CONTA PODE FAZER. Todo o resto do
   Estúdio roda sem ele, e essa é a regra da casa; esta é a exceção, e é uma vez só. O
   botão dá a partida e o navegador abre com a tela do Google já no lugar certo: o que
   sobra para ele é clicar em "permitir".

   NADA DA CONTA DELE PASSA POR AQUI. Quem guarda a permissão é o rclone, no arquivo de
   configuração dele. Esta tela pergunta "já está autorizado?" e recebe sim ou não. */
async function verODrive() {
  try {
    if (!await postoDePe()) {
      DRIVE = { instalado: false, autorizado: false,
                recado: "o posto do Estúdio não está atendendo" };
    } else {
      DRIVE = await noPosto("/drive");
    }
  } catch (e) {
    DRIVE = { instalado: false, autorizado: false, recado: e.message };
  }
  desenhaODrive();
  // ENQUANTO ELE ESTÁ AUTORIZANDO, A TELA OLHA SOZINHA. Sem isto ele permitiria no
  // navegador e voltaria para uma tela que continua dizendo "falta autorizar".
  if (DRIVE.autorizando && !RELOGIO_DO_DRIVE) {
    RELOGIO_DO_DRIVE = setInterval(verODrive, 3000);
  } else if (!DRIVE.autorizando && RELOGIO_DO_DRIVE) {
    clearInterval(RELOGIO_DO_DRIVE);
    RELOGIO_DO_DRIVE = null;
  }
}

function desenhaODrive() {
  const d = DRIVE || {};
  const pino = $("ent_drive_pino"), txt = $("ent_drive_txt");
  $("ent_drive_abrir").hidden = !d.autorizado;
  if (d.link) $("ent_drive_abrir").href = d.link;
  $("ent_autorizar").hidden = !!d.autorizado || !d.instalado;
  $("ent_autorizar").disabled = !!d.autorizando;
  if (d.autorizando) {
    pino.className = "pino indo";
    pino.textContent = "autorizando";
    // NA CASA DA VPS NÃO HÁ NAVEGADOR PARA O GOOGLE ABRIR: a janela abriria no
    // servidor, que não tem tela. A autorização de lá se faz uma vez, por SSH, e o
    // texto tem de dizer isso em vez de prometer uma janela que nunca vem.
    txt.textContent = (CASA_INFO && CASA_INFO.abre_pastas === false)
      ? "A casa do Estúdio fica num servidor sem navegador, então a janela do Google "
        + "não abre sozinha: a autorização de lá se faz uma vez, por SSH (rclone). Se "
        + "o Drive já estava autorizado antes, nada muda."
      : "Uma janela do Google abriu no seu navegador. Entre na sua conta e "
        + "clique em permitir; esta tela percebe sozinha quando terminar.";
    return;
  }
  if (d.autorizado) {
    pino.className = "pino ok";
    pino.textContent = "autorizado";
    txt.textContent = `Os arquivos vão para ${d.pasta || "a pasta do Drive"}.`;
    return;
  }
  if (!d.instalado) {
    pino.className = "pino off";
    pino.textContent = "indisponível";
    txt.textContent = d.recado || "não consegui falar com o programa daqui.";
    return;
  }
  pino.className = "pino";
  pino.textContent = "falta autorizar";
  txt.textContent = "Uma vez só: você entra na sua conta do Google e autoriza. Depois "
    + "disso o Estúdio sobe sozinho, sem perguntar de novo."
    + (d.ultimo_erro ? ` A última tentativa não foi: ${d.ultimo_erro}` : "");
}

$("ent_autorizar").onclick = async () => {
  $("ent_autorizar").disabled = true;
  try {
    await noPosto("/drive", { autorizar: true });
  } catch (e) {
    $("ent_drive_txt").textContent = e.message;
    $("ent_autorizar").disabled = false;
    return;
  }
  verODrive();
};

async function pedirEntrega(subir) {
  if (ENT_OBRA || !MONTADO) return;
  const soAsDaLeva = {};
  for (const a of pecasDaEntrega()) {
    const t = (DESCRICOES.get(a) || "").trim();
    if (t) soAsDaLeva[a] = t;
  }
  try {
    const id = "g" + Date.now();
    await deixarPedido({
      id, tipo: "entregar", leva: EDIT_LEVA.numero,
      edicao: MONTADO.pasta, contas: EDIT_LEVA.contas || [],
      descricoes: soAsDaLeva, subir: !!subir,
    });
    ENT_OBRA = { id, desde: Date.now(), total: pecasDaEntrega().length,
                 relogio: null, mudo: 0, subir: !!subir };
    ENTREGUE = null;
    $("ent_subir").disabled = $("ent_so_pacote").disabled = true;
    $("ent_feito").hidden = true;
    $("ent_obra").hidden = false;
    $("ent_barra").style.width = "0%";
    document.querySelector("#ent_obra .cfg-girando").style.display = "";
    $("ent_obra_txt").textContent = "Pedido Deixado";
    $("ent_obra_nota").textContent = "O empacotamento começa em até um minuto.";
    const olhar = olharOPedido(ENT_OBRA, andouAEntrega, terminouAEntrega);
    ENT_OBRA.relogio = setInterval(olhar, 3000);
    olhar();
    salvarRascunho();          // o vigia sobrevive ao F5; mesma razao do recorte
  } catch (e) {
    parado("ent_aviso", e.message);
    $("ent_subir").disabled = $("ent_so_pacote").disabled = false;
  }
}
$("ent_subir").onclick = () => pedirEntrega(true);
$("ent_so_pacote").onclick = () => pedirEntrega(false);

const FASES = { empacotando: "Empacotando", subindo: "Subindo para o Drive",
                anotando: "Anotando no acervo",
                // AS DUAS ULTIMAS SAO NOVAS, DE 24/08/2026, e existem porque a entrega
                // passou a APAGAR o video daqui depois de subir. Conferir e apagar sao
                // dois momentos em que o trabalho pode parar; sem nome na tela, ele veria
                // a barra cheia e nada acontecendo.
                conferindo: "Conferindo no Drive", apagando: "Apagando a cópia daqui" };

function andouAEntrega(d) {
  $("ent_obra_tempo").textContent = d.tempo || "";
  if (d.semContato) {
    $("ent_obra_txt").textContent = "Sem contato com o programa";
    $("ent_obra_nota").textContent = "Continuo tentando; o trabalho pode estar "
      + "acontecendo mesmo assim.";
    return;
  }
  const total = d.total || ENT_OBRA.total, feitos = d.feitos || 0;
  $("ent_barra").style.width = Math.round(feitos / Math.max(1, total) * 100) + "%";
  $("ent_obra_txt").textContent = `${FASES[d.fase] || "Trabalhando"} `
    + `${Math.min(feitos + 1, total)} de ${total}`;
  $("ent_obra_nota").textContent = d.atual ? `Agora: ${d.atual}` : "";
}

/* O FECHO DA ENTREGA, UMA NOTICIA POR LINHA.

   ELE REPROVOU O PARAGRAFO em 24/08/2026: "olha como é que tá essa parada como um todo,
   olha tipo o texto grudado". Eram quatro notícias diferentes numa frase só, e para
   descobrir se a tabela de minerados tinha sido marcada era preciso ler até o fim.

   A ORDEM É A DO CAMINHO QUE O ARQUIVO FEZ: subiu, caiu em tal pasta, a tabela soube,
   e o que sobrou na casa do Estúdio. A última linha é a que ele passou a pedir agora,
   quando mandou apagar a cópia local depois do envio. */
function umaLinha(rotulo, valor) {
  return `<div class="ent-linha"><span class="ed-rot">${escapar(rotulo)}</span>`
       + `<b>${escapar(valor)}</b></div>`;
}

/* O DIÁRIO DO FECHO, desde 25/08/2026. "104 peças, 3 falharam" obrigava a perguntar
   QUAIS três e POR QUÊ, e a resposta já estava gravada: o andamento final carrega o
   diário peça a peça. Aqui entram só as linhas de ERRO, porque as dezenas que deram
   certo enterrariam as que importam, e os avisos já têm resumo próprio (o "sem
   descrição", por exemplo). O teto de vinte segura o fecho de uma leva que falhou
   inteira: acima disso a lista vira contagem. */
function linhasDoDiario(diario) {
  const ruins = (diario || []).filter(x => x && x.erro && x.arquivo);
  if (!ruins.length) return "";
  let html = ruins.slice(0, 20).map(x =>
    `<div class="ent-linha"><span class="ed-rot">${escapar(x.arquivo)}</span>`
    + `<b>${escapar(String(x.erro))}</b></div>`).join("");
  if (ruins.length > 20) {
    html += `<div class="ent-linha"><span class="ed-rot">e mais</span>`
      + `<b>${num(ruins.length - 20)} peças falharam; o diário completo está no `
      + `andamento da leva</b></div>`;
  }
  return html;
}

function linhasDoFecho(d, queria) {
  const pecas = `${num(d.feitos || 0)} ${d.feitos === 1 ? "peça" : "peças"}`;
  if (!d.subiu && d.rclone_ok) {
    /* SUBIU MAS NAO DEU PARA CONFERIR. Nem sucesso nem fracasso: os arquivos podem estar
       la', so' que ninguem confirmou. Nada e' marcado e nada e' apagado, e a tela diz
       exatamente isso em vez de escolher um dos dois lados. */
    return umaLinha("O rclone disse", `${num(d.subiu_agora || 0)} enviadas nesta rodada`)
      + umaLinha("A conferência", d.porque_nao || "não respondeu")
      + umaLinha("Na tabela", "não marquei, porque não confirmei")
      + umaLinha("A cópia na casa","mantida, até dar para conferir");
  }
  if (!d.subiu) {
    /* NAO SUBIU NAO E' MEIO ENTREGUE. O pacote existe aqui e nada foi apagado: dizer as
       duas coisas evita que ele vá procurar no Drive o que está no disco. */
    return umaLinha("Na casa do Estúdio", `${pecas} em "${d.rotulo}"`)
      + (queria ? umaLinha("Não subiu", d.drive || "o Drive não respondeu") : "")
      + umaLinha("A cópia na casa","mantida, porque nada subiu");
  }
  /* O NUMERO DO DRIVE E' O QUE O DRIVE CONTOU. Ate' 24/08/2026 esta linha mostrava o
     numero de EMPACOTADAS, que e' medida deste lado: dizia 92 mesmo que o rclone tivesse
     transferido zero por ja' estarem la'. Agora sao os dois numeros, e eles sao
     diferentes de proposito: o que existe la', e o que foi enviado nesta rodada. */
  let html = umaLinha("No Drive", `${num(d.conferidos || 0)} de ${pecas}, conferidas`)
           + umaLinha("Enviadas agora", d.subiu_agora === 0
               ? "nenhuma, as peças já estavam lá"
               : `${num(d.subiu_agora || 0)} nesta rodada`)
           + umaLinha("A pasta", d.rotulo || "")
           + umaLinha("Na tabela", d.marcado
               ? "o perfil ficou marcado como concluído"
               : (d.marca || "a marca no acervo não foi"));
  /* O QUE SOBROU AQUI. Apagar é ordem dele; mas a trava é minha e é dura: só apaga
     depois de o Drive ter respondido quantos vídeos recebeu. Quando a conferência não
     bate, o arquivo FICA, e esta linha diz por quê em vez de sumir com o assunto. */
  html += umaLinha("A cópia na casa",d.apagou
    ? `apagada, ${num(d.liberado_mb || 0)} MB livres no disco da casa`
    : (d.nao_apagou || "mantida"));
  if (d.sem_descricao) {
    html += umaLinha("Sem descrição", `${num(d.sem_descricao)} `
      + (d.sem_descricao === 1 ? "peça subiu só com o vídeo"
                               : "peças subiram só com o vídeo"));
  }
  return html;
}

async function terminouAEntrega(d) {
  const queria = ENT_OBRA ? ENT_OBRA.subir : true;
  ENT_OBRA = null;
  document.querySelector("#ent_obra .cfg-girando").style.display = "none";
  $("ent_subir").disabled = $("ent_so_pacote").disabled = false;
  if (d.erro) { $("ent_obra_txt").textContent = "Não deu: " + d.erro; return; }
  ENTREGUE = d;
  $("ent_barra").style.width = "100%";
  $("ent_obra_txt").textContent = `${d.feitos || 0} `
    + ((d.feitos === 1) ? "peça empacotada" : "peças empacotadas")
    + (d.sem_descricao ? `, ${d.sem_descricao} sem descrição` : "");
  $("ent_obra_nota").textContent = "";
  /* O QUE DEU E O QUE NÃO DEU, SEPARADOS. Empacotar é local e acontece sempre; subir
     depende do Drive estar autorizado. Dizer "entregue" com os vídeos parados no disco
     seria relatório falso, e é o tipo de mentira que só aparece dias depois. */
  $("ent_feito").hidden = false;
  /* TRES FINAIS, E NAO DOIS. A auditoria de 24/08/2026 achou o titulo mentindo: ele
     dizia "Entregue No Drive" com base no codigo de saida do rclone, que sai zero
     tambem quando nao transfere nada. Agora "entregue" quer dizer conferido do lado
     de la'; subir sem conseguir conferir e' um terceiro estado, e tem nome proprio. */
  $("ent_feito_tit").textContent = d.verificado ? "Entregue No Drive"
    : d.rclone_ok ? "Subiu, Mas Não Consegui Conferir"
    : "Empacotado Na Casa, Ainda Não Subiu";
  $("ent_feito_linhas").innerHTML = linhasDoFecho(d, queria) + linhasDoDiario(d.diario);
  if (d.onde) $("ent_feito_pasta").dataset.abrir = d.onde;
  /* O BOTAO DA PASTA DAQUI SOME QUANDO A PASTA DAQUI NAO EXISTE MAIS. Desde 24/08/2026 a
     entrega apaga a copia local depois de conferir no Drive; deixar o botao no lugar era
     oferecer um clique que abre o vazio, e ele ficaria procurando onde foi parar. */
  $("ent_feito_pasta").hidden = !!d.apagou;
  // O LINK DO DRIVE TAMBÉM APARECE NO "SUBIU, MAS NÃO CONSEGUI CONFERIR": é
  // justamente quando olhar o Drive com o próprio olho tira a dúvida.
  $("ent_feito_drive").hidden = !(d.subiu || d.rclone_ok);
  if (d.drive_link) $("ent_feito_drive").href = d.drive_link;
  // A MONTAGEM APAGADA SAI DO CARTÃO: a entrega apaga também a pasta montada de
  // origem, e o "107 em leva-N" continuaria afirmando uma pasta que não existe mais.
  if (d.apagou) { MONTADO = null; mostrarAMontagem(); }
  // A PORTA DE AUTORIZAR APARECE AQUI SE FOI ISSO QUE FALTOU, para ele não ter de
  // procurar o que fazer em seguida.
  if (d.autorizar) verODrive();
  $("ent_conta").innerHTML = `<b>${num(d.feitos || 0)}</b> `
    + (d.verificado ? "entregues" : "empacotadas");
  desenhaSubTrilho4();

  /* ENTREGUE E MARCADO NAO E' MAIS RASCUNHO, e ate 24/08/2026 continuava sendo.

     O QUE ELE VIU: entregou a leva, voltou para a portaria, e ela estava la' na lista de
     rascunhos como se o trabalho estivesse pela metade. "Nao sei por que ainda aparece
     como rascunho, sendo que deveria estar ja' como finalizado."

     E ELE JA' TINHA DITO ISSO ANTES, em 23/08: "ela, em tese, ja' deveria nao aparecer
     mais, porque ja' foi finalizado, ja' foi upada, entao isso nao e' mais rascunho". Na
     epoca ficou de proposito, porque a leva 29 era a cobaia do conserto de layout. O
     layout ficou pronto; a excecao venceu junto.

     RASCUNHO E' TRABALHO EM ANDAMENTO. Quando os arquivos chegaram ao Drive e a tabela
     de minerados foi marcada, nao ha' mais andamento nenhum: ha' um trabalho concluido.
     Deixa-lo na lista e' pedir para ele reabrir uma leva que nao tem o que ser feito.

     SO' COM A MARCA, E NAO SO' COM A SUBIDA. `marcado` quer dizer que os arquivos
     chegaram LA' e o acervo registrou. Empacotamento local, ou subida sem marca, deixam
     o rascunho onde esta': o trabalho ainda tem ponta solta. */
  if (d.marcado) {
    // A MARCA VEM ANTES DE APAGAR. Sem ela, o relogio de 600 ms recria o registro
    // que acabou de ser apagado. Ver a nota em `salvarRascunho`.
    if (EDIT_LEVA) ENCERRADAS.add(EDIT_LEVA.numero);
    try {
      const todos = (await listarRascunhos()) || [];
      // TODOS OS DESTA LEVA, e nao so' o que esta' aberto: rodadas anteriores podem ter
      // deixado registros orfaos, e sao eles que reaparecem na portaria.
      for (const r of todos) {
        if (r.leva === (EDIT_LEVA && EDIT_LEVA.numero) || r.id === (EDIT_RASCUNHO || {}).id) {
          await apagarRascunho(r.id);
        }
      }
      EDIT_RASCUNHO = null;
    } catch (e) { /* nao deu para apagar: fica, e e' o mal menor */ }
  } else {
    await salvarRascunho();
  }

  /* E A PORTA DE SAIDA APARECE. Ver a nota no `corpo.html`. */
  $("ent_feito_sair").hidden = !d.marcado;
  // A TABELA DE MINERADOS FICOU VELHA no instante em que o acervo foi marcado. Reler é
  // o que faz o "100% concluído" dele aparecer sem um F5. Quem relê é a `atualizar`,
  // que é a mesma volta que o relógio da aba dá sozinho de 25 em 25 segundos.
  if (d.marcado && typeof atualizar === "function") atualizar();
}

$("ent_volta").onclick = () => irParaSubLeg(1);

/* SAIR DA LEVA ENTREGUE. Nao salva rascunho na saida, ao contrario do `ed_sair`: a leva
   acabou de deixar de ser rascunho, e gravar de novo aqui a ressuscitaria. */
$("ent_feito_sair").onclick = () => {
  EDIT_RASCUNHO = null;
  EDIT_LEVA = null;
  ENTREGUE = null;
  mostrarTela("portaria");
  if (typeof desenhaRascunhos === "function") desenhaRascunhos();
};


/* ABRIR UMA PASTA NO COMPUTADOR.

   O QUE ESTAVA ERRADO, e nao era nenhuma das duas primeiras suspeitas. Os botoes
   apontavam para `estudio://edicao/29`, e clicar nao fazia nada.

   O PROTOCOLO ESTA' REGISTRADO, conferido no registro em 23/08/2026: a chave
   `HKCU\Software\Classes\estudio` existe e manda rodar `pythonw.exe` com
   `Ferramenta 1\abrir.py`. E o `abrir.py` EXISTE, conferido no disco na mesma data.

   O ERRADO E' O CAMINHO REGISTRADO: ele aponta para a raiz do projeto, e o arquivo
   mora em `Ferramenta 1\motor\abrir.py`, uma pasta abaixo. O `pythonw` sobe, procura
   onde mandaram, nao acha, e morre sem console e sem mensagem. "Botao bugado e nao
   funciona", ele disse, e era isso: um clique caindo no vazio.

   E O CAMINHO DIRETO TAMBEM NAO SERVIRIA: navegador nao segue `file://` a partir de
   uma pagina servida por `http://`. Quem pode abrir e' o posto, que ja' roda, ja' e'
   deste projeto, e nao depende de registro do Windows nem de arquivo nenhum fora do
   `motor`; a tela so' pede.

   UM OUVINTE SO' PARA TODOS OS BOTOES, e nao um por botao: um deles e' escrito dentro
   de um recado que se redesenha, e ligar evento em elemento que renasce e' ligar
   evento que se perde. */
async function abrirNoComputador(relativo, ondeAvisar, elemento) {
  // SEM LUGAR DE AVISO, O AVISO TOMA O LUGAR DO LINK: metade dos botões de abrir não
  // tem `data-avisa`, e o clique deles morria calado. O link que não pode cumprir o
  // que promete vira o próprio recado. Auditoria de 25/08/2026.
  const avisa = (t) => {
    if (ondeAvisar && $(ondeAvisar)) return parado(ondeAvisar, t);
    if (elemento) {
      elemento.textContent = t;
      elemento.removeAttribute("data-abrir");
      elemento.removeAttribute("href");
    }
  };
  if (!relativo) return avisa("Ainda não sei qual pasta abrir.");
  if (!(await postoDePe()))
    return avisa("O posto do Estúdio não está no ar, então não consigo abrir a pasta "
                 + "daqui. O caminho está escrito acima: copie e cole no explorador.");
  // A CASA DA VPS NÃO TEM EXPLORADOR A ABRIR: em vez de um clique que morre num erro,
  // a resposta honesta é o caminho completo na casa, para achar por SSH ou esperar a
  // entrega descer. O batimento (/vivo) conta se a casa abre pastas.
  if (CASA_INFO && CASA_INFO.abre_pastas === false) {
    const casa = (CASA_INFO.casa || "a casa do Estúdio").replace(/[\\/]+$/, "");
    return avisa("Essa pasta mora na casa do Estúdio, no servidor: "
      + casa + "/" + relativo);
  }
  try {
    const r = await noPosto("/abrir?onde=" + encodeURIComponent(relativo));
    if (!r || !r.ok) avisa("Não consegui abrir: " + ((r && r.erro) || "sem resposta"));
  } catch (e) {
    avisa("Não consegui abrir: " + (e.message || e));
  }
}

document.addEventListener("click", ev => {
  const a = ev.target.closest("[data-abrir]");
  if (!a) return;
  ev.preventDefault();
  abrirNoComputador(a.dataset.abrir, a.dataset.avisa || null, a);
});

/* ---------------------------------------------------------------- o fim da leitura

   DAQUI PARA BAIXO NAO HA' MAIS DECLARACAO NENHUMA, entao a partir desta linha qualquer
   parte da tela pode ser pintada com seguranca. A aba que ja' estava aberta no endereco
   se pinta agora, e nao la' no comeco, quando metade do estado ainda nao existia. */
/* A BARRA NAO PERGUNTA SE O POSTO ESTA' DE PE': a pergunta em si e' o que o navegador
   recusa quando a tela vem da internet, e e' justamente por isso que o endereco esta'
   errado. O endereco basta como resposta.

   MAS SO' NAS ABAS QUE PRECISAM DO DISCO, e nao em todas. Mineracao e Baixar funcionam
   perfeitamente pela internet: elas leem o acervo e falam com a ponte, e nada ali toca
   nesta maquina. A faixa aparecia nas quatro, avisando de um problema que aquelas duas
   nao tem, e alarme que soa onde nao ha' fogo e' alarme que se aprende a ignorar. */
const ABAS_QUE_PRECISAM_DO_DISCO = ["editar", "config"];
function cuidarDaFaixaDeFora() {
  // A CASA PROPRIA TAMBEM E' CASA, desde 25/08/2026: servida pelo posto (em 127.0.0.1
  // ou na VPS atras do Caddy), a tela fala com quem a serviu, e nao ha' faixa a
  // mostrar. A faixa e' so' das moradas sem posto proprio: a vitrine do GitHub Pages e
  // a pagina aberta de arquivo.
  if (POSTO === location.origin || !$("fora_de_casa")) return;
  const aba = (location.hash || "#minerar").slice(1);
  $("fora_ir").href = CASA_DO_ESTUDIO + "/" + (location.hash || "");
  $("fora_de_casa").hidden = !ABAS_QUE_PRECISAM_DO_DISCO.includes(aba);
}
cuidarDaFaixaDeFora();
window.addEventListener("hashchange", cuidarDaFaixaDeFora);

/* O SELO DA ABA DE CONFIGURACOES NAO PODE ENVELHECER NA TELA PARADA.

   A RESPOSTA SOBRE O POSTO VALE QUINZE SEGUNDOS, e quem a renova e' um clique dele. Com
   a aba aberta e a mao longe do mouse, o posto podia cair e o selo continuar dizendo
   "Gravando no disco" pelo tempo que fosse. E' um selo verde afirmando algo que deixou
   de ser verdade, que e' o erro que ele mandou vigiar: "muito cuidado com os falsos
   positivos". Trava 2 do CLAUDE.md.

   SO' NA ABA QUE MOSTRA O SELO, e so' com a janela na frente: perguntar de quinze em
   quinze segundos numa aba escondida seria bater na porta do posto a' toa o dia inteiro.

   E NAO MEXE COM COISA POR SALVAR NA TELA. Se o disco recusou algo que ainda esta' na
   mao dele, redesenhar aqui apagaria o recado vermelho que explica o que houve. */
setInterval(async () => {
  if (document.hidden) return;
  if ((location.hash || "").slice(1) !== "config") return;
  if (MUDANCA_PENDENTE) return;
  const antes = POSTO_DE_PE;
  POSTO_DE_PE = null;                       // a resposta guardada vence agora
  const agora = await postoDePe();
  if (agora === antes) return;
  // VOLTOU DEPOIS DE UMA LEITURA QUE FALHOU: le' de novo, e o vermelho sai sozinho.
  if (agora && !IA_LIDA) await lerIA();
  desenhaCfgIA();
}, 15000);

PRONTA = true;
if ((location.hash || "").slice(1) === "config") retomarPastaEler();


/* ==================================================== A ENTRADA DOS ELEMENTOS

   PORTADO DO SOCIAL TRACKER, a pedido dele em 24/08/2026: "adicione em todos os
   elementos que tem aqui a nivel de estudio a questao de animacao de entrada. Essa
   animacao de entrada voce consegue pegar como referencia tambem uma que ja existe
   dentro do Social Tracker".

   A TRAVA DA PRIMEIRA TELA E' O CORACAO DISTO, e nao um detalhe. Ela vem escrita no
   Social Tracker, que ja passou pelo problema: o que JA ESTA visivel quando a aba abre
   entra SEM transicao. Animar o primeiro ecra a cada troca e' meio segundo de espera
   para ver o que ja estava pronto, e faz a troca PARECER lenta mesmo quando a pagina
   chega depressa. Ele abriu esta sessao reclamando de lentidao na troca de etapa: portar
   a animacao sem esta trava teria piorado justamente o que ele mandou consertar.

   DA ROLAGEM PARA BAIXO O EFEITO E' INTEIRO. A trava vale para o que ja esta' na tela,
   nao para o que ainda vai chegar nela. */
/* `var`, E NAO `let`, E ISTO NAO E' DESCUIDO.

   O `irPara` roda no carregamento da pagina, la' em cima, para abrir a aba do endereco.
   Ele chama `revelar()`, e o motor mora aqui embaixo, no fim do arquivo. Com `let`, ler
   uma variavel ANTES da linha que a declara e' erro duro do JavaScript, e a tela morria
   no carregamento com "Cannot access 'OLHO_SECAO' before initialization".

   E A GUARDA `typeof revelar === "function"` NAO SEGURAVA ISSO: declaracao de funcao e'
   içada e ja existe; a variavel `let` existe mas nao PODE ser lida. Com `var` ela nasce
   valendo indefinido, `revelar()` sai pela primeira linha, e quem revela a aba inicial
   e' o proprio `montarOsOlhos()` no fim do arquivo. Pego no navegador em 24/08/2026. */
var OLHO_SECAO = null;
var OLHO_PECA = null;
var PRIMEIRA_LEVA = true;      // a primeira rodada depois de cada troca de aba

function podeAnimar() {
  return "IntersectionObserver" in window
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function semTransicao(el) {
  // MOSTRAR AGORA, E SEM ANIMAR. Tira a transicao, marca como visto, e devolve a
  // transicao no quadro seguinte: assim o elemento aparece pronto e continua animavel
  // depois, se a tela mexer nele de novo.
  el.style.transition = "none";
  const filhos = [...el.children];
  filhos.forEach(f => { f.style.transition = "none"; });
  el.dataset.visto = "1";
  requestAnimationFrame(() => {
    el.style.transition = "";
    filhos.forEach(f => { f.style.transition = ""; });
  });
}

function montarOsOlhos() {
  if (!podeAnimar()) return;
  document.documentElement.classList.add("com-revelar");

  OLHO_SECAO = new IntersectionObserver(itens => {
    itens.forEach(it => {
      if (!it.isIntersecting) return;
      if (PRIMEIRA_LEVA) semTransicao(it.target);
      else it.target.dataset.visto = "1";
      OLHO_SECAO.unobserve(it.target);
    });
    PRIMEIRA_LEVA = false;
  }, { rootMargin: "0px 0px -40px 0px", threshold: 0 });

  OLHO_PECA = new IntersectionObserver(itens => {
    itens.forEach(it => it.target.classList.toggle("entrou", it.isIntersecting));
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });

  revelar();
}

/* ==================================================== A REDE DE SEGURANCA

   POR QUE ELA EXISTE, e nao e' zelo excessivo. A animacao de entrada funciona ESCONDENDO
   tudo por padrao (`opacity:0` no estilo) e mandando o JavaScript revelar. Isso quer
   dizer que, se o revelador falhar, o Estudio nao fica sem animacao: fica EM BRANCO.

   E ISSO JA ACONTECEU NESTA BASE. Esta' escrito no comentario do `entra-aba`, la em cima:
   uma animacao emprestada do Social Tracker terminava em opacidade 0,10 e deixou "o corpo
   inteiro da tela permanentemente a 10%, um texto fantasma que parecia site quebrado".

   O OBSERVADOR PODE NAO DISPARAR por motivos que nao dependem deste codigo: aba que nunca
   chega a ter altura, janela minimizada, o navegador decidindo que nada esta visivel.
   Conferido em 24/08/2026: com as abas escondidas, as sete secoes ficaram com opacidade
   zero e nenhuma marcada.

   ENTAO DEPOIS DE UM SEGUNDO E MEIO, QUEM NAO FOI REVELADO E' REVELADO NA FORCA. O pior
   caso passa a ser "a animacao nao tocou", que ninguem nota, em vez de "a tela sumiu",
   que para o trabalho. Animacao e' enfeite; ver o que se esta' fazendo, nao e'. */
let RELOGIO_DA_REDE = null;

function redeDeSeguranca() {
  if (RELOGIO_DA_REDE) clearTimeout(RELOGIO_DA_REDE);
  RELOGIO_DA_REDE = setTimeout(() => {
    RELOGIO_DA_REDE = null;
    document.querySelectorAll(".secao:not([data-visto])").forEach(s => {
      // SO' O QUE ESTA' NUMA ABA ABERTA. Secao de aba escondida nao precisa aparecer
      // agora; ela sera' revelada quando a aba dela abrir, e o `revelar` rearma a rede.
      const aba = s.closest(".aba");
      if (aba && aba.hidden) return;
      semTransicao(s);
    });
    document.querySelectorAll(".entra:not(.entrou)").forEach(el => {
      const aba = el.closest(".aba");
      if (aba && aba.hidden) return;
      const r = el.getBoundingClientRect();
      // so' o que esta' dentro da janela: o resto anima na rolagem, como deve
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("entrou");
    });
  }, 1500);
}


/* Chamado a cada troca de aba e sempre que a tela cria conteudo novo.

   SECAO JA' VISTA NAO VOLTA A ESCONDER. `data-visto` fica no elemento, entao voltar a
   uma aba ja aberta nao repete a animacao: ela e' entrada, e nao piscada. */
function revelar(raiz) {
  if (!OLHO_SECAO) return;
  PRIMEIRA_LEVA = true;
  (raiz || document).querySelectorAll(".secao").forEach(s => {
    if (!s.dataset.visto) OLHO_SECAO.observe(s);
  });
  redeDeSeguranca();
  (raiz || document).querySelectorAll(
    ".gal-grade > *, .ed-galeria > *, .liv-cartao, .ed-rasc").forEach(el => {
      if (!el.classList.contains("entra")) {
        el.classList.add("entra");
        OLHO_PECA.observe(el);
      }
    });
}

montarOsOlhos();
