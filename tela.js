/* O comportamento da tela do Estúdio.
   Nada de acesso mora aqui: as ordens vão para a ponte, e é ela que guarda a chave. */

const DONO = "Elmoamacoca", REPO = "estudio-video";
const CRU = `https://raw.githubusercontent.com/${DONO}/${REPO}/main`;
const PONTE = "https://estudio-ponte.gabrieltorres.workers.dev";
const $ = id => document.getElementById(id);
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
async function ler(caminho) {
  // PELA PONTE, e não pelo endereço cru do GitHub. O cru tem cache de borda de alguns
  // minutos: a tela lia a rodada anterior e mostrava zero em coluna que já tinha valor
  // gravado. A ponte responde o commit do momento.
  // O CAMINHO DE DENTRO SOBREVIVE. Antes ficava só o nome do arquivo, e pedir
  // `dados/atividade/vinci.society.json` virava `dados/vinci.society.json`, que não
  // existe. O livro de atividade mora em pasta própria e precisa da pasta.
  const dentro = caminho.replace(/^dados\//, "");
  try {
    const r = await fetch(`${PONTE}/dados/${dentro}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) return await r.json();
  } catch (e) { /* cai para o endereço cru */ }
  try {
    const r = await fetch(`${CRU}/${caminho}?t=${Date.now()}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function mandar(rota, corpo) {
  const r = await fetch(PONTE + rota, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.erro) throw new Error(d.erro || "a esteira não respondeu, tente de novo");
  return d;
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

function quanto(h) {
  if (h < 0.017) return "agora";
  if (h < 1) return Math.round(h * 60) + " min";
  if (h < 24) return (h < 10 ? h.toFixed(1).replace(".", ",") : Math.round(h)) + " h";
  return Math.round(h / 24) + " d";
}

function selar(estado) {
  if (estado && estado.ultima_rodada) ultimaColeta = estado.ultima_rodada;
  const selo = $("estado"), rotulo = selo.querySelector(".rotulo");
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
  { v: "", r: "Todos os estados" },
  { v: "completo", r: "Concluídos" },
  { v: "limite", r: "Varridos até o limite" },
  { v: "varrendo", r: "Ainda varrendo" },
], "", v => { minEstado = v; minPagina = 1; desenhaMinerados(); });

window.montarSelect("min-ordem", [
  { v: "varridos", r: "Mais varridos" },
  { v: "cobertura", r: "Maior cobertura" },
  { v: "acima", r: "Mais acima da régua" },
  { v: "reels", r: "Mais reels" },
  { v: "conta", r: "Nome do perfil" },
], "varridos", v => { minOrdem = v; minPagina = 1; desenhaMinerados(); });

window.montarSelect("min-por", [
  { v: "10", r: "10" }, { v: "25", r: "25" }, { v: "50", r: "50" },
], "10", v => { minPor = parseInt(v, 10) || 10; minPagina = 1; desenhaMinerados(); });

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
    const cob = p.publicacoes ? Math.round(100 * p.lidos / p.publicacoes) : 0;
    const [selo] = ESTADOS[situacaoDe(p)];
    const ate = p.mais_antigo
      ? new Date(p.mais_antigo * 1000).toLocaleDateString("pt-BR",
          { month: "short", year: "numeric" })
      : '<span class="tab-nulo">sem data</span>';
    return `<tr class="tab-linha">
      <td class="tab-perfil"><div class="tab-perfil-in">${retrato(p)}
        <span class="tab-quem"><b>@${p.conta}</b>
          <span>${p.nome || "sem nome no perfil"}</span></span></div></td>
      <td class="tab-num">${num(p.lidos)}</td>
      <td class="tab-num"><span class="tab-dupla">${cob}%
        <i>de ${num(p.publicacoes)}</i></span></td>
      <td>${ate}</td>
      <td class="tab-num">${num(p.reels)}</td>
      <td class="tab-num">${num(p.imagens)}</td>
      <td class="tab-num">${num(p.carrosseis)}</td>
      <td class="tab-num">${num(p.acima)}</td>
      <td>${selo}</td>
      <td>${quando(p.atualizado)}</td>
      <td class="tab-acao"><a class="acao" target="_blank" rel="noopener"
        href="https://www.instagram.com/${p.conta}/">Instagram</a></td>
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
    if (e.gravidade === "falha" || e.gravidade === "aviso") {
      contas[e.gravidade] += 1;
      if (dentro) series[e.gravidade][DIAS_DO_TRACO - 1 - atras] += 1;
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

const TIPOS = {
  identificado: "identificação",
  varredura: "varredura",
  concluido: "conclusão",
  limite: "limite do Instagram",
  sem_avanco: "sem avanço",
  lote: "lote baixado",
};

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

/* ------------------------------------------------------------- o que acontece AGORA

   Cada vaga da esteira deixa um bilhete de duzentos bytes com onde a varredura está
   naquele segundo: quantos posts já entraram, qual vaga escreveu, quando. A tela lê
   esses bilhetes de dez em dez segundos, e SÓ dos perfis que ainda têm página por ler.

   POR QUE NÃO LER O ARQUIVO DO PERFIL: ele tem o mesmo número e passa de 2 MB depois de
   algumas rodadas. Ninguém baixa isso de dez em dez segundos para ver um contador. */
const BATIMENTOS = new Map();

async function ouvirBatimentos() {
  const ativos = LIVRO.filter(c => !c.completo);
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
  const pct = b.publicacoes ? Math.round(100 * b.lidos / b.publicacoes) : 0;
  const quando = Math.round((Date.now() / 1000) - (b.quando || 0));
  ln.innerHTML = `<i></i><span class="oque"><b></b>`
    + `<span class="dados"><span><b>${num(b.lidos)}</b> de ${num(b.publicacoes)}</span>`
    + `<span><b>${pct}%</b></span>`
    + (b.vaga ? `<span>vaga <b>${b.vaga}</b></span>` : "")
    + `</span></span>`
    + `<span class="data">${quando < 90 ? "agora" : "há " + Math.round(quando / 60) + " min"}</span>`;
  ln.querySelector(".oque > b").textContent = b.completo
    ? "Leitura encerrada, aguardando o fechamento da rodada"
    : "Varrendo agora: a esteira está lendo as páginas deste perfil";
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
  let d = null;
  try {
    const r = await fetch(`${PONTE}/andamento?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) d = await r.json();
  } catch (e) { /* sem sinal agora: o relógio tenta de novo em quinze segundos */ }

  if (d && !d.erro) {
    const elos = Array.isArray(d.elos) ? d.elos : [];
    const emPe = e => ANDANDO.has(e.situacao);
    const lendo = elos.filter(e => /^elo/.test(e.nome || "") && emPe(e));
    const conferindo = elos.some(e => e.nome === "conferir" && emPe(e));
    const fechando = elos.some(e => e.nome === "fechar" && emPe(e));
    const rodada = d.numero ? `rodada ${d.numero}` : "";

    let titulo = "Esteira parada", resumo = "Nenhuma rodada em andamento.";
    let selo = "parada", viva = false, desde = null;

    if (lendo.length) {
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

  ouvirBatimentos();
}

function livroFiltrado() {
  const q = ($("liv_q").value || "").trim().toLowerCase();
  return LIVRO.filter(c => {
    if (q && !((c.conta || "") + " " + (c.nome || "")).toLowerCase().includes(q))
      return false;
    if (livroTipo && c.ultimo_tipo !== livroTipo) return false;
    if (livroDesde && c.ultimo < livroDesde) return false;
    return true;
  });
}

function desenhaLivro() {
  const fila = livroFiltrado();
  const pedaco = fila.slice(0, livroMostra);

  $("liv_vazio").hidden = fila.length > 0;
  $("liv_mais").hidden = fila.length <= livroMostra;
  $("liv_mais").textContent = `Ver mais ${Math.min(POR_LEVA, fila.length - livroMostra)}`;
  $("exp_tela").textContent = `${fila.length} de ${LIVRO.length} perfis`;

  $("liv_lista").innerHTML = pedaco.map(bruto => {
    // O BILHETE MANDA quando ele é mais novo que a capa do livro. A capa é escrita no
    // fim da rodada; o bilhete, a cada página. Um perfil entrando agora tem capa dizendo
    // zero e bilhete dizendo cento e trinta e dois.
    const b = BATIMENTOS.get(bruto.conta);
    const c = b && b.quando > (bruto.ultimo || 0)
      ? { ...bruto, lidos: b.lidos, publicacoes: b.publicacoes || bruto.publicacoes,
          completo: b.completo, ultimo: b.quando, vivo: !b.completo }
      : bruto;
    const grave = c.falhas ? "falha" : c.avisos ? "aviso" : "";
    const cob = c.publicacoes ? Math.round(100 * c.lidos / c.publicacoes) : null;
    return `<div class="liv-cartao ${grave}" data-conta="${c.conta}">
      <button class="liv-cabeca" type="button" aria-expanded="false">
        <span class="liv-ponto"></span>
        <span class="liv-id">
          <span class="liv-nome"><b>${c.nome || "sem nome no perfil"}</b>
            <span class="liv-etq">${TIPOS[c.ultimo_tipo] || c.ultimo_tipo}</span></span>
          <span class="liv-sub">@${c.conta} · ${
            c.vivo ? '<b class="liv-vivo">varrendo agora</b>' : haQuanto(c.ultimo)}${
            cob !== null ? ` · ${num(c.lidos)} de ${num(c.publicacoes)} posts (${cob}%)` : ""} · ${
            c.eventos} ${c.eventos === 1 ? "registro" : "registros"}</span>
        </span>
        <svg class="liv-seta" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="liv-corpo"><div class="liv-caixa">carregando</div></div>
    </div>`;
  }).join("");
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
  if (HISTORICOS.has(conta)) return HISTORICOS.get(conta);
  const d = await ler(`dados/atividade/${conta}.json`);
  const ev = (d && d.eventos) || [];
  HISTORICOS.set(conta, ev);
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
    if (d.novos) dados.push(`<b>+${num(d.novos)}</b> posts`);
    if (d.total) dados.push(`total <b>${num(d.total)}</b>`);
    if (d.rodada) dados.push(`rodada <b>${d.rodada}</b>`);
    if (d.seguidores) dados.push(`<b>${num(d.seguidores)}</b> seguidores`);
    if (d.origem) dados.push(`<em>${d.origem}</em>`);

    const ln = document.createElement("div");
    ln.className = "liv-ev " + e.gravidade;
    // CADA DADO NUM ELEMENTO PRÓPRIO. Juntos numa string só, o respiro do arranjo não
    // tinha onde pegar e saía "3 páginastotal 281histórico", tudo grudado.
    ln.innerHTML = `<i></i><span class="oque"><b></b>`
      + (dados.length
          ? `<span class="dados">${dados.map(x => `<span>${x}</span>`).join("")}</span>`
          : "")
      + `</span><span class="data">${dataHora(e.quando)}</span>`;
    ln.querySelector(".oque > b").textContent = e.texto;
    caixa.appendChild(ln);
  }
}

document.addEventListener("click", async ev => {
  const cabeca = ev.target.closest(".liv-cabeca");
  if (!cabeca) return;
  const cartao = cabeca.closest(".liv-cartao");
  const abrir = !cartao.classList.contains("aberto");
  cartao.classList.toggle("aberto", abrir);
  cabeca.setAttribute("aria-expanded", abrir ? "true" : "false");
  if (!abrir) return;
  const caixa = cartao.querySelector(".liv-caixa");
  caixa.textContent = "buscando o histórico";
  pintarEventos(caixa, await historicoDe(cartao.dataset.conta));
  const b = BATIMENTOS.get(cartao.dataset.conta);
  if (b && !b.completo) caixa.prepend(linhaDoAgora(b));
});

$("liv_q").addEventListener("input", () => { livroMostra = POR_LEVA; desenhaLivro(); });
$("liv_mais").onclick = () => { livroMostra += POR_LEVA; desenhaLivro(); };

window.montarSelect("liv-tipo", [
  { v: "", r: "Toda a atividade" },
  { v: "varredura", r: "Em varredura" },
  { v: "limite", r: "Fechados no limite" },
  { v: "concluido", r: "Concluídos" },
  { v: "sem_avanco", r: "Com falha na última" },
  { v: "identificado", r: "Só identificados" },
], "", v => { livroTipo = v; livroMostra = POR_LEVA; desenhaLivro(); });

window.montarSelect("liv-quando", [
  { v: "0", r: "Desde o começo" },
  { v: "1", r: "Últimas 24 horas" },
  { v: "7", r: "Últimos 7 dias" },
  { v: "30", r: "Últimos 30 dias" },
  { v: "90", r: "Últimos 90 dias" },
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
                   e.gravidade, e.texto, d.maquinas || "", d.gravacoes || "",
                   d.novos || "", d.total || "", d.rodada || ""]);
    }
  }

  const csv = linhas.map(l => l.map(v =>
    `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const arquivo = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(arquivo);
  a.download = `atividade-estudio-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);

  botao.disabled = false;
  botao.textContent = "Baixar planilha";
  $("liv_folha").hidden = true;
};

/** A régua em vigor, escrita por extenso na aba de Baixar. Ela não se edita ali: quem
 *  escolhe é a folha de Iniciar, e este texto existe para não haver dúvida de qual
 *  régua produziu os números da tela. */
function mostrarRegua(cr) {
  if (!cr) {
    $("regua_titulo").textContent = "Nenhuma régua gravada ainda";
    $("regua_texto").textContent = "Ela é escolhida ao iniciar a primeira mineração, "
      + "na aba de Mineração.";
    return;
  }
  const nomes = { reels: "reels", post: "post isolado", carrossel: "carrossel" };
  const formatos = (cr.formatos || []).map(f => nomes[f] || f);
  $("regua_titulo").textContent = cr.por_formato
    ? (cr.formatos || []).map(f =>
        `${nomes[f] || f} ${String(cr.cortes[f]).replace(".", ",")}x`).join(" · ")
    : `${String(cr.corte).replace(".", ",")}x para todos os formatos`;
  $("regua_texto").textContent = `Entram ${formatos.join(", ")}. `
    + (cr.por_formato
        ? "A mediana é calculada separada para cada formato."
        : "A mediana é uma só, calculada com todos os formatos juntos.")
    + ` Máximo de ${num(cr.teto)} peças por lote.`;
}

/* ---------------------------------------------------------------- desenhos

   AQUI MORAVA `desenhaPerfis`, e ela era um defeito de verdade, não sobra inofensiva.
   Ela escrevia numa caixa `#perfis` que deixou de existir quando o avanço de cada
   perfil virou coluna da tabela de Minerados. Escrever em caixa que não existe é erro
   que INTERROMPE quem chamou: `atualizar()` morria ali, a cada 25 segundos, e as duas
   linhas seguintes nunca rodavam. Era por isso que a aba de Baixar dizia "nenhum perfil
   varrido ainda" com dois perfis varridos e mil e quinhentas peças acima da régua. */
function desenhaProntos(sel, perfis) {
  const alvo = $("prontos");
  if (!perfis || !perfis.length) {
    alvo.innerHTML = '<div class="vazio">Nenhum perfil varrido ainda.</div>';
    return;
  }
  // A RÉGUA VEM DO ACERVO, e não de um campo nesta aba. Havia dois lugares para editar
  // a mesma coisa, e o desta aba não chegava à esteira.
  const cr = (sel && sel.criterio) || {};
  const corte = cr.por_formato
    ? Math.min(...Object.values(cr.cortes || { reels: 1.5 }))
    : (cr.corte || 1.5);
  const itens = (sel && sel.itens) || [];

  alvo.innerHTML = perfis.map(p => {
    // OS DOIS NÚMEROS VÊM CONTADOS DO SELETOR, e não desta lista aqui.
    // Contar daqui era o mesmo defeito que a tabela tinha: `sel.itens` é o LOTE, com
    // teto de 500 peças, e o teto é global. O primeiro perfil levava as 500 vagas e
    // aparecia com "500 acima da régua"; o segundo aparecia com zero, e o botão de
    // baixar nascia desligado nos dois. O seletor conta perfil a perfil, sem teto.
    const meus = itens.filter(i => i.conta === p.conta);
    const acima = p.acima != null ? p.acima
                : meus.filter(i => i.indice >= corte).length;
    const baixaveis = p.baixaveis != null ? p.baixaveis
                : meus.filter(i => i.formato === "reels" && i.arquivo && i.indice >= corte).length;
    return `<div class="pronto">
      <div class="pronto-topo">
        <span class="quem">@${p.conta}</span>
        <button class="acao" data-baixar="${p.conta}" ${baixaveis ? "" : "disabled"}>
          Baixar ${baixaveis || 0} reels</button>
      </div>
      <div class="pronto-numeros">
        <div><b>${num(p.publicacoes)}</b><span>posts na conta</span></div>
        <div><b>${num(p.lidos)}</b><span>varridos</span></div>
        <div><b>${num(acima)}</b><span>acima da régua</span></div>
        <div><b>${String(corte).replace(".", ",")}x</b><span>régua usada</span></div>
      </div>
      <div class="travado">
        <span>O destino é o <b>Google Drive</b>, e ele ainda não foi autorizado. Enquanto
        isso o lote fica guardado no serviço e pode ser puxado de lá. Para ligar o Drive
        é preciso uma autorização da sua conta Google, que só você pode dar.</span>
      </div>
    </div>`;
  }).join("");
}

function desenhaLotes(l) {
  if (!l || !l.length) {
    $("lotes").innerHTML = '<div class="vazio">Nenhum lote ainda.</div>';
    return;
  }
  $("lotes").innerHTML = l.map(x => `<div class="pronto">
    <div class="pronto-topo">
      <span class="quem">Lote ${x.numero}</span>
      <a class="acao" target="_blank" rel="noopener"
         href="https://github.com/${DONO}/${REPO}/actions/runs/${x.execucao}">Abrir</a>
    </div>
    <div class="pronto-numeros">
      <div><b>${num(x.arquivos)}</b><span>arquivos</span></div>
      <div><b>${x.mb} MB</b><span>tamanho</span></div>
      <div><b>${x.criterio || "-"}</b><span>critério</span></div>
    </div></div>`).join("");
}

/* ---------------------------------------------------------------- atualização */
let primeiraCarga = true;

async function atualizar() {
  // SÓ NA PRIMEIRA VEZ o sinal aparece. Das seguintes em diante a tela já tem números
  // na frente do Gabriel, e trocá-los por um sinal de carregamento de 25 em 25 segundos
  // seria pisca-pisca: quem já viu o dado não precisa ver que ele está sendo conferido.
  if (primeiraCarga) carregando("carga", "Buscando o acervo", "onda");

  const [estado, sel, fontes, retratos, livro] = await Promise.all([
    ler("dados/estado.json"), ler("dados/selecao.json"), ler("dados/fontes.json"),
    // arquivo à parte: o do perfil varrido passa de 1 MB e a via de leitura corta ali
    ler("dados/retratos.json"),
    // a capa do livro de atividade: só o resumo por perfil, o histórico vem ao abrir
    ler("dados/atividade/indice.json")]);

  if (primeiraCarga) { parado("carga", ""); primeiraCarga = false; }
  selar(estado);

  // a seleção é quem calcula os números da tabela; o estado é a cópia dela
  const perfis = (sel && sel.perfis) || (estado && estado.perfis) || [];
  // OS QUATRO NÚMEROS DA SITUAÇÃO, e nenhum deles é decorativo.
  // Saíram daqui dois que não mediam nada: a contagem de contas de origem, que a
  // pastilha de Minerados já mostra ao lado do nome, e o tamanho do lote montado, que
  // tem teto de 500 e por isso marcava 500 para sempre. Estes quatro mudam quando o
  // trabalho anda, que é a única razão para um número ficar grande na tela.
  const lotes = (estado && estado.lotes) || [];
  $("n_lidos").textContent = num(perfis.reduce((a, b) => a + (b.lidos || 0), 0));
  $("n_completos").textContent = perfis.filter(p => p.completo).length;
  $("n_reels").textContent = num(perfis.reduce((a, b) => a + (b.baixaveis || 0), 0));
  $("n_baixados").textContent = num(lotes.reduce((a, b) => a + (b.arquivos || 0), 0));

  // a linha do rodapé conta o que ele tem de útil: quantos perfis e desde quando
  const quandoRodou = estado && estado.ultima_rodada
    ? new Date(estado.ultima_rodada * 1000).toLocaleString("pt-BR",
        { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  $("rodape_linha").textContent = perfis.length
    ? `${perfis.length} ${perfis.length === 1 ? "perfil minerado" : "perfis minerados"}`
      + (quandoRodou ? ` · última rodada em ${quandoRodou}` : "")
    : "nenhum perfil minerado ainda";

  // O CAMPO NÃO É MAIS PREENCHIDO COM O QUE JÁ FOI MINERADO.
  // Aqui ele era reabastecido com a lista inteira do sistema a cada 25 segundos. O
  // efeito era o campo devolver eternamente os mesmos perfis que já estavam no banco,
  // como se nada tivesse sido registrado: apagar não adiantava, o relógio seguinte
  // trazia de volta. O campo é de entrada, o banco é a aba de Minerados.

  // a tabela quer o que a varredura descobriu, e não só o avanço
  const itens = (sel && sel.itens) || [];
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
  desenhaMinerados();

  mostrarRegua((sel && sel.criterio) || null);
  LIVRO = (livro && livro.contas) || [];
  desenhaLivro();
  medirLivro();

  desenhaProntos(sel, perfis);
  desenhaLotes(estado && estado.lotes);
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
  const numero = campo => {
    const n = parseFloat(String($(campo).value).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 1.5;
  };
  return {
    formatos,
    por_formato: $("por_formato").checked,
    corte: numero("corte_unico"),
    cortes: { reels: numero("c_reels"), post: numero("c_post"),
              carrossel: numero("c_carrossel") },
  };
}

function contasEscritas() {
  return $("fontes").value.split("\n")
    .map(s => s.trim().replace(/^@/, "").replace(/\/+$/, "").split("/").pop())
    .filter(Boolean);
}

/** Mostra só as réguas dos formatos escolhidos, e troca entre única e separada. */
function ajustarFolha() {
  const separada = $("por_formato").checked;
  $("cortes_separados").hidden = !separada;
  $("cortes_juntos").hidden = separada;
  document.querySelectorAll(".cortes label").forEach(l => {
    l.hidden = !$("f_" + l.dataset.de).checked;
  });
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
  // A ESPERA ACONTECE AQUI DENTRO, que é onde o Gabriel está olhando. Identificar cada
  // perfil no Instagram leva alguns segundos, e a folha sem sinal parecia travada.
  carregando("ini_recado", contas.length === 1 ? "Identificando o perfil"
                                               : `Identificando ${contas.length} perfis`, "onda");
  try {
    const d = await mandar("/contas", { contas, regua });
    const barrados = d.bloqueados || [];
    const entraram = (d.novos || []).filter(n => n.ok);
    if (entraram.length) await mandar("/varrer");

    $("fontes").value = "";
    delete $("fontes").dataset.tocado;
    parado("ini_recado", "");
    $("ini_folha").hidden = true;
    parado("recado",
      entraram.length && barrados.length
        ? `${entraram.length} entrou, ${barrados.length} já estava no banco`
      : entraram.length
        ? (entraram.length === 1 ? "1 perfil na fila, acompanhe no registro abaixo"
             : `${entraram.length} perfis na fila, acompanhe no registro abaixo`)
      : barrados.length === 1
        ? `@${barrados[0]} já está minerado, nada a fazer`
        : `os ${barrados.length} perfis já estão minerados, nada a fazer`);
    // o cartão de cada perfil já existe no acervo neste ponto: a ponte o abre junto
    // com a identificação, então a lista mostra o perfil antes da primeira página.
    setTimeout(() => { aoVivo(); atualizar(); }, 1200);
  } catch (e) {
    parado("ini_recado", e.message);
  }
  $("ini_vai").disabled = false;
  $("ini_cancelar").disabled = false;
};

document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-baixar]");
  if (!b) return;
  b.disabled = true;
  // baixar um lote leva minutos, e é o carregamento mais longo do sistema
  carregando("recado_baixar", "Montando o lote de @" + b.dataset.baixar, "bolas");
  try {
    // sem números soltos aqui: a esteira lê a régua do acervo, a mesma que foi
    // escolhida ao iniciar. Mandar outra por aqui criaria duas verdades.
    await mandar("/baixar", { conta: b.dataset.baixar });
    parado("recado_baixar", "lote em preparo, aparece abaixo ao terminar");
  } catch (e) { parado("recado_baixar", e.message); }
  setTimeout(() => { b.disabled = false; atualizar(); }, 6000);
});


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
atualizar();
aoVivo();
