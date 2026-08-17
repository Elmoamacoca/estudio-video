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
  // pelo endereço cru, e não pela porta de programação do GitHub: aquela corta em
  // 60 consultas por hora sem identificação, e a tela se atualiza sozinha o tempo todo.
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

/* ---------------------------------------------------------------- registro ao vivo */
const NOMES = { queued: "na fila", in_progress: "trabalhando", success: "pronto",
                failure: "falhou", cancelled: "cancelado", skipped: "pulado",
                waiting: "esperando", pending: "na fila" };
let relogio = null, vistos = new Set();

function anotar(texto, tipo) {
  const reg = $("registro");
  if (vistos.has(texto)) return;
  vistos.add(texto);
  const ln = document.createElement("div");
  ln.className = "ln" + (tipo ? " " + tipo : "");
  ln.innerHTML = `<span class="hora">${new Date().toLocaleTimeString("pt-BR")}</span>`
               + `<span class="txt">${texto}</span>`;
  reg.prepend(ln);
  while (reg.children.length > 120) reg.lastChild.remove();
}

async function aoVivo() {
  let d;
  try { d = await (await fetch(PONTE + "/andamento?t=" + Date.now())).json(); }
  catch { return; }

  if (!d.elos || !d.elos.length) {
    $("vivo_titulo").textContent = "Esteira parada";
    $("vivo_resumo").textContent = "Nenhuma rodada em andamento. Ela acorda sozinha "
      + "de meia em meia hora, ou agora se você mandar varrer.";
    $("vivo_elos").innerHTML = "";
    return;
  }

  const feitos = d.elos.filter(e => e.situacao === "success").length;
  const agora = d.elos.find(e => e.situacao === "in_progress");

  $("vivo_titulo").textContent = d.rodando
    ? (agora ? "Lendo agora: " + agora.nome : "A esteira está trabalhando")
    : "Rodada " + d.numero + " encerrada";
  $("vivo_resumo").textContent = d.rodando
    ? `${feitos} de ${d.elos.length} máquinas concluídas. Cada uma lê 12 posts com `
      + `endereço próprio, porque o Instagram só libera uma leitura por endereço.`
    : `${feitos} de ${d.elos.length} máquinas trouxeram posts. Os números abaixo já estão atualizados.`;
  $("vivo_quando").textContent = d.comecou
    ? "começou " + new Date(d.comecou).toLocaleTimeString("pt-BR") : "";

  $("vivo_elos").innerHTML = d.elos
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt", { numeric: true }))
    .map(e => {
      const c = e.situacao === "success" ? "feito"
              : e.situacao === "in_progress" ? "agora"
              : e.situacao === "failure" ? "falhou" : "";
      return `<div class="elo ${c}"><span class="luz"></span>${e.nome}`
           + `<span class="qual">${NOMES[e.situacao] || e.situacao}</span></div>`;
    }).join("");

  d.elos.filter(e => e.situacao === "success" && e.fim)
    .forEach(e => anotar(`${e.nome} concluída`, "bom"));
  if (agora) anotar(`${agora.nome} lendo uma página`, "");

  if (d.rodando && !relogio) relogio = setInterval(() => { aoVivo(); atualizar(); }, 7000);
  if (!d.rodando && relogio) { clearInterval(relogio); relogio = null; atualizar(); }
}


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
};

function situacaoDe(p) {
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
  // a foto do Instagram vence em horas, então a inicial é o fundo e a foto entra por
  // cima. Se ela falhar, a inicial continua lá e ninguém vê um quadrado quebrado.
  const ini = (p.conta || "?")[0].toUpperCase();
  const foto = p.avatar
    ? `<img src="${p.avatar}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="pcard-retrato"><span class="pcard-avatar">${ini}${foto}</span></span>`;
}

function desenhaMinerados() {
  const q = ($("min-q").value || "").trim().toLowerCase();
  const est = $("min-estado").value;
  const ordem = $("min-ordem").value;
  const por = parseInt($("min-por").value, 10) || 10;

  let fila = MINERADOS.filter(p => {
    if (q && !((p.conta || "") + " " + (p.nome || "")).toLowerCase().includes(q)) return false;
    if (est && situacaoDe(p) !== est) return false;
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
    const x = chaves[ordem](a), y = chaves[ordem](b);
    return typeof x === "string" ? x.localeCompare(y, "pt") : x - y;
  });

  const paginas = Math.max(1, Math.ceil(fila.length / por));
  if (minPagina > paginas) minPagina = paginas;
  const pedaco = fila.slice((minPagina - 1) * por, minPagina * por);

  $("min-vazio").hidden = fila.length > 0;
  $("min-pag").hidden = fila.length <= por;
  $("min-onde").textContent = fila.length
    ? `${(minPagina - 1) * por + 1} a ${Math.min(minPagina * por, fila.length)} de ${fila.length}`
    : "";
  $("min-antes").disabled = minPagina <= 1;
  $("min-depois").disabled = minPagina >= paginas;
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
      <td class="tab-num">${num(p.publicacoes)}</td>
      <td class="tab-num">${num(p.lidos)}</td>
      <td class="tab-num">${cob}%</td>
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

["min-q", "min-estado", "min-ordem", "min-por"].forEach(id =>
  $(id).addEventListener("input", () => { minPagina = 1; desenhaMinerados(); }));
$("min-antes").onclick = () => { minPagina--; desenhaMinerados(); };
$("min-depois").onclick = () => { minPagina++; desenhaMinerados(); };

/* ---------------------------------------------------------------- desenhos */
function desenhaPerfis(p) {
  if (!p || !p.length) {
    $("perfis").innerHTML = '<div class="vazio">Nenhum perfil varrido ainda.</div>';
    return;
  }
  $("perfis").innerHTML = p.map(x => {
    const pct = x.publicacoes ? Math.min(100, Math.round(100 * x.lidos / x.publicacoes)) : 0;
    const desde = x.mais_antigo
      ? new Date(x.mais_antigo * 1000).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      : null;
    // completo com menos posts que o total não é falha: o Instagram corta a leitura
    // anônima por profundidade, e o que sobra é histórico antigo demais para servir.
    const parcial = x.completo && x.publicacoes && x.lidos < x.publicacoes;
    const marca = x.completo
      ? `<span class="tag ok">${parcial ? "varrido até o limite" : "completo"}</span>`
      : '<span class="tag trab">varrendo</span>';
    return `<div class="perfil-linha">
      <div class="perfil-topo"><span><b>@${x.conta}</b> ${marca}</span>
        <span class="nota">${num(x.lidos)} de ${num(x.publicacoes)} · ${pct}%</span></div>
      <div class="barra"><i style="width:${pct}%"></i></div>
      ${desde ? `<p class="nota" style="margin-top:8px;font-size:12.5px">${
        parcial ? `O Instagram fecha a leitura por profundidade. Chegamos até <b>${desde}</b>.`
                : `Cobre desde ${desde}.`}</p>` : ""}
    </div>`;
  }).join("");
}

function desenhaProntos(sel, perfis) {
  const alvo = $("prontos");
  if (!perfis || !perfis.length) {
    alvo.innerHTML = '<div class="vazio">Nenhum perfil varrido ainda.</div>';
    return;
  }
  const corte = parseFloat($("corte").value) || 1.5;
  const itens = (sel && sel.itens) || [];

  alvo.innerHTML = perfis.map(p => {
    const meus = itens.filter(i => i.conta === p.conta);
    const reels = meus.filter(i => i.formato === "reels" && i.arquivo);
    const acima = meus.filter(i => i.indice >= corte).length;
    const baixaveis = reels.filter(i => i.indice >= corte).length;
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
        <div><b>${corte.toString().replace(".", ",")}x</b><span>régua usada</span></div>
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
async function atualizar() {
  const [estado, sel, fontes, retratos] = await Promise.all([
    ler("dados/estado.json"), ler("dados/selecao.json"), ler("dados/fontes.json"),
    // arquivo à parte: o do perfil varrido passa de 1 MB e a via de leitura corta ali
    ler("dados/retratos.json")]);

  const vivo = estado !== null;
  const selo = $("estado");
  selo.className = "status " + (vivo ? "online" : "offline");
  selo.querySelector(".rotulo").textContent = vivo ? "no ar" : "sem resposta";

  const perfis = (estado && estado.perfis) || (sel && sel.perfis) || [];
  $("n_contas").textContent = fontes && fontes.contas ? fontes.contas.length : 0;
  $("n_lidos").textContent = num(perfis.reduce((a, b) => a + (b.lidos || 0), 0));
  $("n_sel").textContent = num(sel && sel.itens ? sel.itens.length : 0);
  $("n_completos").textContent = perfis.filter(p => p.completo).length;

  if (fontes && fontes.contas && !$("fontes").dataset.tocado)
    $("fontes").value = fontes.contas.join("\n");

  // a tabela quer o que a varredura descobriu, e não só o avanço
  const itens = (sel && sel.itens) || [];
  MINERADOS = perfis.map(p => {
    const meus = itens.filter(i => i.conta === p.conta);
    const r = (retratos && retratos[p.conta]) || {};
    // formato vem do que foi VARRIDO (o seletor conta); `acima` é o que passou na régua
    return { ...p, nome: p.nome || r.nome, avatar: p.avatar || r.avatar,
             acima: meus.length };
  });
  desenhaMinerados();

  desenhaPerfis(perfis);
  desenhaProntos(sel, perfis);
  desenhaLotes(estado && estado.lotes);
}

/* ---------------------------------------------------------------- comandos */
$("fontes").addEventListener("input", () => { $("fontes").dataset.tocado = "1"; });

$("salvar").onclick = async () => {
  const contas = $("fontes").value.split("\n")
    .map(s => s.trim().replace(/^@/, "").replace(/\/+$/, "").split("/").pop())
    .filter(Boolean);
  $("recado").textContent = "salvando";
  anotar("salvando " + contas.length + " contas de origem");
  try {
    const d = await mandar("/contas", { contas });
    (d.novos || []).filter(n => n.ok).forEach(n =>
      anotar(`@${n.conta} identificado: ${num(n.publicacoes)} publicações`, "bom"));
    await mandar("/varrer");
    $("recado").textContent = d.contas + " contas salvas, esteira acionada";
    anotar("esteira acionada", "bom");
    setTimeout(() => { aoVivo(); atualizar(); }, 2500);
  } catch (e) { $("recado").textContent = e.message; anotar(e.message, "ruim"); }
};

$("varrer").onclick = async () => {
  $("recado").textContent = "chamando a esteira";
  try {
    await mandar("/varrer");
    $("recado").textContent = "esteira acionada";
    anotar("esteira acionada", "bom");
    setTimeout(aoVivo, 2500);
  } catch (e) { $("recado").textContent = e.message; anotar(e.message, "ruim"); }
};

document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-baixar]");
  if (!b) return;
  b.disabled = true;
  $("recado_baixar").textContent = "montando o lote de @" + b.dataset.baixar;
  try {
    await mandar("/baixar", {
      formatos: "reels", corte: $("corte").value, quantos: $("quantos").value,
      conta: b.dataset.baixar,
    });
    $("recado_baixar").textContent = "lote em preparo, aparece abaixo ao terminar";
  } catch (e) { $("recado_baixar").textContent = e.message; }
  setTimeout(() => { b.disabled = false; atualizar(); }, 6000);
});

$("corte").addEventListener("change", atualizar);

atualizar(); aoVivo();
setInterval(atualizar, 25000);
setInterval(aoVivo, 15000);
