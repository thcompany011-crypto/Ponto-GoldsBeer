import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { cadastrarColaborador } from "./auth.js";

const auth = getAuth(app);
const db = getFirestore(app);

let usuarioLogadoUid = null;
let ehAdmin = false;

// usuariosMap: uid -> nome (mantido por compatibilidade com o restante da UI)
let usuariosMap = {};
// perfisMap: uid -> { nome, email, cargo, jornadaSemanal:[7], valorHoraExtra, ativo }
let perfisMap = {};
// feriadosSet: conjunto de datas (formato "yyyy-mm-dd") tratadas como feriado (carga prevista = 0, então qualquer trabalho no dia vira hora extra)
let feriadosSet = new Set();
let feriadosLista = []; // [{id, data, descricao}]

let dadosRelatorioAtual = null; // dados usados para exportar PDF/CSV do último fechamento gerado
let minhasBatidasCache = []; // últimas batidas do colaborador logado, para popular o modal de solicitação

const JORNADA_PADRAO = [0, 8, 8, 8, 8, 8, 0]; // usada apenas se o colaborador ainda não tiver jornada cadastrada

// Localização do bar Golds Beer, usada para só permitir bater ponto perto do local.
const BAR_LATITUDE = -16.373970;
const BAR_LONGITUDE = -48.979419;
const RAIO_PERMITIDO_METROS = 150; // ajuste esse valor se o GPS de dentro do bar variar muito
const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DIAS_SEMANA_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function chaveMes(date) {
    return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
}

function labelMes(date) {
    return `${NOMES_MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

function criarCabecalhoMes(date) {
    const li = document.createElement("li");
    li.style.background = "transparent";
    li.style.padding = "18px 4px 6px 4px";
    li.style.margin = "0";
    li.style.borderLeft = "none";
    li.innerHTML = `<div style="display:flex; align-items:center; gap:10px;">
        <span style="color:#fff; font-weight:700; font-size:0.95rem; text-transform:uppercase; letter-spacing:0.5px;">${labelMes(date)}</span>
        <div style="flex:1; height:1px; background:#334155;"></div>
    </div>`;
    return li;
}

// ==========================================================
// Utilidades
// ==========================================================

function showToast(mensagem, tipo = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const classeTipo = tipo === "sucesso" ? "toast-sucesso" : tipo === "erro" ? "toast-erro" : "toast-info";
    const icone = tipo === "sucesso" ? "fa-circle-check" : tipo === "erro" ? "fa-circle-exclamation" : "fa-circle-info";

    const toast = document.createElement("div");
    toast.className = `toast ${classeTipo}`;
    toast.innerHTML = `<i class="fa-solid ${icone}"></i><span>${mensagem}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}

function showConfirm(mensagem) {
    return new Promise((resolve) => {
        const modal = document.getElementById("modal-confirm");
        document.getElementById("modal-confirm-mensagem").textContent = mensagem;
        modal.style.display = "block";

        const btnSim = document.getElementById("btnConfirmSim");
        const btnNao = document.getElementById("btnConfirmNao");

        const limpar = () => {
            modal.style.display = "none";
            btnSim.removeEventListener("click", onSim);
            btnNao.removeEventListener("click", onNao);
        };
        const onSim = () => { limpar(); resolve(true); };
        const onNao = () => { limpar(); resolve(false); };

        btnSim.addEventListener("click", onSim);
        btnNao.addEventListener("click", onNao);
    });
}

function showPrompt(mensagem, valorPadrao = "") {
    return new Promise((resolve) => {
        const modal = document.getElementById("modal-prompt");
        document.getElementById("modal-prompt-mensagem").textContent = mensagem;
        const input = document.getElementById("modal-prompt-input");
        input.value = valorPadrao;
        modal.style.display = "block";
        input.focus();

        const btnOk = document.getElementById("btnPromptOk");
        const btnCancelar = document.getElementById("btnPromptCancelar");

        const limpar = () => {
            modal.style.display = "none";
            btnOk.removeEventListener("click", onOk);
            btnCancelar.removeEventListener("click", onCancelar);
        };
        const onOk = () => { const valor = input.value; limpar(); resolve(valor); };
        const onCancelar = () => { limpar(); resolve(null); };

        btnOk.addEventListener("click", onOk);
        btnCancelar.addEventListener("click", onCancelar);
    });
}

function mostrarListaCarregando(listaEl) {
    if (listaEl) listaEl.innerHTML = `<li class="lista-carregando"><div class="spinner"></div> Carregando...</li>`;
}

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
    // Fórmula de Haversine — distância em linha reta entre duas coordenadas
    const R = 6371000; // raio da Terra em metros
    const toRad = (graus) => (graus * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function obterLocalizacaoAtual() {
    return new Promise((resolve, reject) => {
        if (!("geolocation" in navigator)) {
            reject(new Error("Seu dispositivo ou navegador não suporta geolocalização."));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (posicao) => resolve({ lat: posicao.coords.latitude, lng: posicao.coords.longitude }),
            (erro) => {
                if (erro.code === erro.PERMISSION_DENIED) {
                    reject(new Error("Você precisa permitir o acesso à localização para bater o ponto."));
                } else {
                    reject(new Error("Não foi possível obter sua localização. Tente novamente."));
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

async function verificarSeEstaNoBar() {
    try {
        const { lat, lng } = await obterLocalizacaoAtual();
        const distancia = calcularDistanciaMetros(lat, lng, BAR_LATITUDE, BAR_LONGITUDE);
        if (distancia <= RAIO_PERMITIDO_METROS) return true;
        showToast(`Você está a ${Math.round(distancia)}m do bar. Só é possível bater ponto no local.`, "erro");
        return false;
    } catch (error) {
        showToast(error.message, "erro");
        return false;
    }
}

// ==========================================================
// Lembretes de ponto (locais — funcionam com o app aberto, sem backend)
// ==========================================================

let intervaloLembretes = null;
let lembretesDisparados = new Set(); // evita repetir o mesmo aviso várias vezes na mesma sessão

function tocarBip() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
    } catch (error) {
        // ambiente sem suporte a áudio — ignora silenciosamente
    }
}

function dispararLembrete(mensagem) {
    showToast(mensagem, "info");
    tocarBip();
    if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification("Ponto Golds Beer", {
                body: mensagem,
                icon: "https://cdn-icons-png.flaticon.com/512/2933/2933158.png"
            });
        } catch (error) {
            console.error("Erro ao mostrar notificação:", error);
        }
    }
}

function atualizarVisibilidadeBotaoLembretes() {
    const btn = document.getElementById("btnAtivarLembretes");
    if (!btn) return;
    if (!("Notification" in window)) { btn.style.display = "none"; return; }
    btn.style.display = Notification.permission === "default" ? "inline-flex" : "none";
}

function verificarLembretePonto() {
    const banner = document.getElementById("avisoProximoCompromisso");
    if (!banner || !usuarioLogadoUid) return;

    const horariosSemanais = perfisMap[usuarioLogadoUid] && perfisMap[usuarioLogadoUid].horariosSemanais;
    if (!Array.isArray(horariosSemanais)) { banner.style.display = "none"; return; }

    const agora = new Date();
    const horarioHoje = horariosSemanais[agora.getDay()];
    if (!horarioHoje || (!horarioHoje.entrada && !horarioHoje.saida)) {
        banner.style.display = "none";
        return;
    }

    const hojeStr = agora.toLocaleDateString("pt-BR");
    const jaTemEntradaHoje = minhasBatidasCache.some(b => b.tipo === "Entrada" && new Date(b.data).toLocaleDateString("pt-BR") === hojeStr);
    const jaTemSaidaHoje = minhasBatidasCache.some(b => b.tipo === "Saída" && new Date(b.data).toLocaleDateString("pt-BR") === hojeStr);

    let tipoAlvo = null;
    let horarioAlvo = null;
    if (horarioHoje.entrada && !jaTemEntradaHoje) {
        tipoAlvo = "Entrada";
        horarioAlvo = horarioHoje.entrada;
    } else if (horarioHoje.saida && !jaTemSaidaHoje) {
        tipoAlvo = "Saída";
        horarioAlvo = horarioHoje.saida;
    }

    banner.style.display = "block";

    if (!tipoAlvo) {
        banner.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Sem mais pontos previstos por hoje.`;
        return;
    }

    const [h, m] = horarioAlvo.split(":").map(Number);
    const alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), h, m, 0);
    const diffMin = (alvo - agora) / 60000;

    if (diffMin > 0) {
        banner.innerHTML = `<i class="fa-solid fa-clock" style="color:#3b82f6;"></i> Sua ${tipoAlvo.toLowerCase()} é às ${horarioAlvo} (em ${Math.ceil(diffMin)} min)`;
    } else {
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> Você já deveria ter batido a ${tipoAlvo.toLowerCase()} (${Math.abs(Math.round(diffMin))} min atrás)`;
    }

    const dataISO = chaveDiaISO(agora);
    const chave15min = `${dataISO}_${tipoAlvo}_15min`;
    const chaveAgora = `${dataISO}_${tipoAlvo}_agora`;

    if (diffMin <= 15 && diffMin > 0 && !lembretesDisparados.has(chave15min)) {
        dispararLembrete(`Faltam ${Math.ceil(diffMin)} minutos para sua ${tipoAlvo.toLowerCase()}!`);
        lembretesDisparados.add(chave15min);
    }
    if (diffMin <= 0 && diffMin > -5 && !lembretesDisparados.has(chaveAgora)) {
        dispararLembrete(`Hora de bater sua ${tipoAlvo.toLowerCase()}!`);
        lembretesDisparados.add(chaveAgora);
    }
}

function iniciarMonitorDeLembretes() {
    if (intervaloLembretes) return; // já está rodando, evita duplicar
    verificarLembretePonto();
    intervaloLembretes = setInterval(verificarLembretePonto, 30000);
}

// ==========================================================
// Exportar horários para a agenda do celular (.ics)
// ==========================================================
// Gera lembretes recorrentes semanais nativos do telefone (Google Agenda / Calendário do
// iPhone). Funciona mesmo com o app fechado ou sem internet, diferente do lembrete local acima.

const DIAS_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // códigos de dia da semana no padrão iCalendar

function formatarDataICS(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function criarEventoICS({ uid, titulo, diaSemanaIndex, horaMinuto, minutosAntes }) {
    const [h, m] = horaMinuto.split(":").map(Number);
    const agora = new Date();
    // Acha a próxima ocorrência desse dia da semana a partir de hoje, pra servir de DTSTART da recorrência
    const proxima = new Date(agora);
    const diasAteOalvo = (diaSemanaIndex - agora.getDay() + 7) % 7;
    proxima.setDate(agora.getDate() + diasAteOalvo);
    proxima.setHours(h, m, 0, 0);

    return [
        "BEGIN:VEVENT",
        `UID:pontogoldsbeer-${uid}-${diaSemanaIndex}-${horaMinuto.replace(":", "")}@goldsbeer`,
        `DTSTAMP:${formatarDataICS(agora)}Z`,
        `DTSTART:${formatarDataICS(proxima)}`,
        `DTEND:${formatarDataICS(new Date(proxima.getTime() + 5 * 60000))}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${DIAS_ICS[diaSemanaIndex]}`,
        `SUMMARY:${titulo}`,
        "BEGIN:VALARM",
        `TRIGGER:-PT${minutosAntes}M`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${titulo}`,
        "END:VALARM",
        "END:VEVENT"
    ].join("\r\n");
}

function exportarHorariosParaAgenda() {
    const perfil = perfisMap[usuarioLogadoUid];
    const horariosSemanais = perfil && perfil.horariosSemanais;

    if (!Array.isArray(horariosSemanais) || horariosSemanais.every(h => !h || (!h.entrada && !h.saida))) {
        showToast("Seus horários ainda não foram cadastrados pelo admin. Peça pra configurarem antes de exportar.", "erro");
        return;
    }

    const eventos = [];
    horariosSemanais.forEach((horario, diaSemanaIndex) => {
        if (!horario) return;
        if (horario.entrada) {
            eventos.push(criarEventoICS({
                uid: usuarioLogadoUid,
                titulo: "Bater ponto — Entrada (Golds Beer)",
                diaSemanaIndex,
                horaMinuto: horario.entrada,
                minutosAntes: 10
            }));
        }
        if (horario.saida) {
            eventos.push(criarEventoICS({
                uid: usuarioLogadoUid,
                titulo: "Bater ponto — Saída (Golds Beer)",
                diaSemanaIndex,
                horaMinuto: horario.saida,
                minutosAntes: 5
            }));
        }
    });

    if (eventos.length === 0) {
        showToast("Nenhum horário de entrada/saída cadastrado ainda.", "erro");
        return;
    }

    const conteudoICS = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Ponto Golds Beer//PT-BR",
        "CALSCALE:GREGORIAN",
        ...eventos,
        "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([conteudoICS], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meus-horarios-golds-beer.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Arquivo baixado! Abra ele no celular pra importar na sua agenda.", "sucesso");
}

function formatarTempo(horasDecimais) {
    const sinal = horasDecimais < 0 ? "-" : "";
    horasDecimais = Math.abs(horasDecimais);
    let h = Math.floor(horasDecimais);
    let m = Math.round((horasDecimais - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    if (h === 0) return `${sinal}${m}m`;
    if (m === 0) return `${sinal}${h}h`;
    return `${sinal}${h}h ${m}m`;
}

function formatarMoeda(valor) {
    return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

function chaveDiaISO(date) {
    // yyyy-mm-dd em horário local, usado para comparar com feriados
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function ehFeriado(date) {
    return feriadosSet.has(chaveDiaISO(date));
}

function getJornadaSemanal(uid) {
    const perfil = perfisMap[uid];
    if (perfil && Array.isArray(perfil.jornadaSemanal) && perfil.jornadaSemanal.length === 7) {
        return perfil.jornadaSemanal;
    }
    return JORNADA_PADRAO;
}

function getValorHoraExtra(uid) {
    const perfil = perfisMap[uid];
    return (perfil && typeof perfil.valorHoraExtra === "number") ? perfil.valorHoraExtra : 0;
}

/**
 * Agrupa uma lista de batidas (Entrada/Saída) em turnos (jornadas) e soma o tempo
 * trabalhado por dia. Centraliza a lógica que antes estava duplicada em 3 funções.
 *
 * @param {Array<{tipo:string, data:string, id?:string}>} batidas
 * @returns {{ jornadas: Array, tempoTotalDiaMs: Object }}
 *   jornadas: lista de {dataReferencia, entrada, saida} ordenada da mais recente pra mais antiga
 *   tempoTotalDiaMs: mapa "dd/mm/aaaa" -> milissegundos trabalhados naquele dia
 */
function processarBatidas(batidas) {
    const ordenadas = [...batidas].sort((a, b) => new Date(a.data) - new Date(b.data));
    const jornadas = [];
    const tempoTotalDiaMs = {};
    let entradaPendente = null;

    ordenadas.forEach((batida) => {
        if (batida.tipo === "Entrada") {
            if (entradaPendente) {
                jornadas.push({ dataReferencia: new Date(entradaPendente.data), entrada: entradaPendente, saida: null });
            }
            entradaPendente = batida;
        } else if (batida.tipo === "Saída") {
            if (entradaPendente) {
                const dateRef = new Date(entradaPendente.data);
                jornadas.push({ dataReferencia: dateRef, entrada: entradaPendente, saida: batida });
                const chave = dateRef.toLocaleDateString("pt-BR");
                const duracaoMs = new Date(batida.data) - dateRef;
                tempoTotalDiaMs[chave] = (tempoTotalDiaMs[chave] || 0) + duracaoMs;
                entradaPendente = null;
            } else {
                jornadas.push({ dataReferencia: new Date(batida.data), entrada: null, saida: batida });
            }
        }
    });

    if (entradaPendente) {
        jornadas.push({ dataReferencia: new Date(entradaPendente.data), entrada: entradaPendente, saida: null });
    }

    jornadas.sort((a, b) => b.dataReferencia - a.dataReferencia);
    return { jornadas, tempoTotalDiaMs };
}

function calcularBadgeExtra(totalDiaHoras, cargaDiaria) {
    if (totalDiaHoras > cargaDiaria && cargaDiaria > 0) {
        return { classe: "badge-positivo", texto: `+ ${formatarTempo(totalDiaHoras - cargaDiaria)} Extra` };
    } else if (totalDiaHoras < cargaDiaria && cargaDiaria > 0) {
        return { classe: "badge-negativo", texto: `- ${formatarTempo(cargaDiaria - totalDiaHoras)} Pendente` };
    } else if (cargaDiaria > 0) {
        return { classe: "badge-neutro", texto: "Carga Exata" };
    } else if (cargaDiaria === 0 && totalDiaHoras > 0) {
        return { classe: "badge-positivo", texto: `+ ${formatarTempo(totalDiaHoras)} Extra (Folga)` };
    }
    return null;
}

// ==========================================================
// Registro de ponto
// ==========================================================

async function registrarPonto(tipo, uid, dataHoraManual = null) {
    try {
        const dataBatida = dataHoraManual ? new Date(dataHoraManual).toISOString() : new Date().toISOString();
        await addDoc(collection(db, "batidas"), { uid: uid, tipo: tipo, data: dataBatida });
        showToast(`Ponto de ${tipo} registrado com sucesso!`, "sucesso");
    } catch (error) {
        console.error("Erro ao registrar:", error);
        showToast("Não foi possível registrar o ponto. Verifique sua conexão e tente novamente.", "erro");
        throw error;
    }
}

// ==========================================================
// Inicialização
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = "login.html"; return; }
        usuarioLogadoUid = user.uid;

        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");
            const painelAvancado = document.getElementById("painel-avancado-admin");
            const secaoColaboradores = document.getElementById("secao-colaboradores-admin");
            const secaoSolicitacoesAdmin = document.getElementById("secao-solicitacoes-admin");

            const dadosBanco = userDoc.exists() ? userDoc.data() : {};
            // Padronizado: o único campo válido é "cargo". Mantemos leitura de "role" só
            // para não travar contas antigas que ainda não migraram, mas nunca mais escrevemos nele.
            ehAdmin = dadosBanco.cargo === "admin" || dadosBanco.role === "admin";
            const ehEmailAdminMaster = user.email === "thcompany011@gmail.com" || user.email === "admin@teste.com";
            if (ehEmailAdminMaster) ehAdmin = true;

            await Promise.all([mapearUsuarios(), carregarFeriados()]);

            if (ehAdmin) {
                if (secaoCadastro) secaoCadastro.style.display = "block";
                if (painelAvancado) painelAvancado.style.display = "block";
                if (secaoColaboradores) secaoColaboradores.style.display = "block";
                if (secaoSolicitacoesAdmin) secaoSolicitacoesAdmin.style.display = "block";
                popularSelectColaboradores();
                renderizarListaColaboradores();
                renderizarListaFeriados();
                carregarPainelAdmin();
                carregarSolicitacoesPendentes();
            }
            carregarHistorico(usuarioLogadoUid);
            carregarMinhasSolicitacoes(usuarioLogadoUid);
            atualizarVisibilidadeBotaoLembretes();
            iniciarMonitorDeLembretes();
        } catch (error) {
            console.error("Erro no auth:", error);
        }
    });

    // --- Registro de ponto (colaborador) ---
    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");
    if (btnEntrada) {
        btnEntrada.addEventListener("click", async () => {
            btnEntrada.disabled = true;
            showToast("Verificando sua localização...", "info");
            const permitido = await verificarSeEstaNoBar();
            btnEntrada.disabled = false;
            if (!permitido) return;
            await registrarPonto("Entrada", usuarioLogadoUid);
            carregarHistorico(usuarioLogadoUid);
            if (ehAdmin) carregarPainelAdmin();
        });
    }
    if (btnSaida) {
        btnSaida.addEventListener("click", async () => {
            btnSaida.disabled = true;
            showToast("Verificando sua localização...", "info");
            const permitido = await verificarSeEstaNoBar();
            btnSaida.disabled = false;
            if (!permitido) return;
            await registrarPonto("Saída", usuarioLogadoUid);
            carregarHistorico(usuarioLogadoUid);
            if (ehAdmin) carregarPainelAdmin();
        });
    }

    // --- Espelho de ponto (colaborador) ---
    const btnToggleHistorico = document.getElementById("btnToggleHistorico");
    const historicoDiario = document.getElementById("historico-diario");
    if (btnToggleHistorico && historicoDiario) {
        btnToggleHistorico.addEventListener("click", () => {
            const abrir = historicoDiario.style.display === "none";
            historicoDiario.style.display = abrir ? "block" : "none";
            if (abrir) historicoDiario.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // --- Lançamento manual (admin) ---
    const btnSalvarManual = document.getElementById("btnSalvarManual");
    if (btnSalvarManual) {
        btnSalvarManual.addEventListener("click", async () => {
            const colabUid = document.getElementById("selectColaboradorManual").value;
            const tipo = document.getElementById("selectTipoManual").value;
            const dataHora = document.getElementById("inputDataManual").value;
            if (!colabUid || !dataHora) return showToast("Selecione o colaborador e a data/hora.", "erro");
            await registrarPonto(tipo, colabUid, dataHora);
            carregarPainelAdmin();
            if (colabUid === usuarioLogadoUid) carregarHistorico(usuarioLogadoUid);
        });
    }

    // --- Relatório / Fechamento ---
    const btnGerarRelatorio = document.getElementById("btnGerarRelatorio");
    if (btnGerarRelatorio) btnGerarRelatorio.addEventListener("click", () => gerarRelatorio());

    const btnExportarPDF = document.getElementById("btnExportarPDF");
    if (btnExportarPDF) btnExportarPDF.addEventListener("click", () => exportarParaPDF());

    const btnExportarCSV = document.getElementById("btnExportarCSV");
    if (btnExportarCSV) btnExportarCSV.addEventListener("click", () => exportarParaCSV());

    // --- Edição de batida ---
    const btnSalvarEdicao = document.getElementById("btnSalvarEdicao");
    const btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
    if (btnSalvarEdicao) {
        btnSalvarEdicao.addEventListener("click", async () => {
            const id = document.getElementById("editBatidaId").value;
            const tipo = document.getElementById("editTipo").value;
            const dataLocal = document.getElementById("editData").value;
            if (!id || !dataLocal) return;
            await updateDoc(doc(db, "batidas", id), { tipo: tipo, data: new Date(dataLocal).toISOString() });
            document.getElementById("modal-editar").style.display = "none";
            carregarPainelAdmin();
            carregarHistorico(usuarioLogadoUid);
        });
    }
    if (btnCancelarEdicao) btnCancelarEdicao.addEventListener("click", () => document.getElementById("modal-editar").style.display = "none");

    // --- Cadastro / edição de colaborador ---
    const btnNovoColaborador = document.getElementById("btnNovoColaborador");
    if (btnNovoColaborador) btnNovoColaborador.addEventListener("click", () => abrirModalColaborador());

    const btnSalvarColaborador = document.getElementById("btnSalvarColaborador");
    if (btnSalvarColaborador) btnSalvarColaborador.addEventListener("click", () => salvarColaborador());

    const btnCancelarColaborador = document.getElementById("btnCancelarColaborador");
    if (btnCancelarColaborador) btnCancelarColaborador.addEventListener("click", () => document.getElementById("modal-colaborador").style.display = "none");

    // --- Feriados ---
    const btnAdicionarFeriado = document.getElementById("btnAdicionarFeriado");
    if (btnAdicionarFeriado) btnAdicionarFeriado.addEventListener("click", () => adicionarFeriado());

    // --- Solicitação de ajuste de ponto (colaborador) ---
    const btnAbrirSolicitacao = document.getElementById("btnAbrirSolicitacao");
    if (btnAbrirSolicitacao) btnAbrirSolicitacao.addEventListener("click", () => abrirModalSolicitacao());

    // --- Lembretes locais de ponto ---
    const btnAtivarLembretes = document.getElementById("btnAtivarLembretes");
    if (btnAtivarLembretes) {
        btnAtivarLembretes.addEventListener("click", async () => {
            if (!("Notification" in window)) {
                showToast("Seu navegador não suporta notificações.", "erro");
                return;
            }
            const permissao = await Notification.requestPermission();
            atualizarVisibilidadeBotaoLembretes();
            if (permissao === "granted") {
                showToast("Lembretes ativados! Você será avisado perto do seu horário.", "sucesso");
            } else {
                showToast("Sem permissão de notificação, mas o aviso na tela continua funcionando.", "info");
            }
        });
    }

    const btnExportarAgenda = document.getElementById("btnExportarAgenda");
    if (btnExportarAgenda) btnExportarAgenda.addEventListener("click", () => exportarHorariosParaAgenda());

    const solicitacaoAcao = document.getElementById("solicitacaoAcao");
    if (solicitacaoAcao) solicitacaoAcao.addEventListener("change", () => atualizarCamposModalSolicitacao());

    const btnEnviarSolicitacao = document.getElementById("btnEnviarSolicitacao");
    if (btnEnviarSolicitacao) btnEnviarSolicitacao.addEventListener("click", () => enviarSolicitacao());

    const btnCancelarSolicitacao = document.getElementById("btnCancelarSolicitacao");
    if (btnCancelarSolicitacao) btnCancelarSolicitacao.addEventListener("click", () => document.getElementById("modal-solicitacao").style.display = "none");

    // --- Busca de colaboradores ---
    const buscaColaborador = document.getElementById("buscaColaborador");
    if (buscaColaborador) buscaColaborador.addEventListener("input", () => renderizarListaColaboradores());

    // --- Filtros da Auditoria de Turnos ---
    const filtroAuditoriaColaborador = document.getElementById("filtroAuditoriaColaborador");
    const filtroAuditoriaInicio = document.getElementById("filtroAuditoriaInicio");
    const filtroAuditoriaFim = document.getElementById("filtroAuditoriaFim");
    const btnLimparFiltroAuditoria = document.getElementById("btnLimparFiltroAuditoria");
    if (filtroAuditoriaColaborador) filtroAuditoriaColaborador.addEventListener("change", () => renderizarPainelAdmin());
    if (filtroAuditoriaInicio) filtroAuditoriaInicio.addEventListener("change", () => renderizarPainelAdmin());
    if (filtroAuditoriaFim) filtroAuditoriaFim.addEventListener("change", () => renderizarPainelAdmin());
    if (btnLimparFiltroAuditoria) {
        btnLimparFiltroAuditoria.addEventListener("click", () => {
            if (filtroAuditoriaColaborador) filtroAuditoriaColaborador.value = "";
            if (filtroAuditoriaInicio) filtroAuditoriaInicio.value = "";
            if (filtroAuditoriaFim) filtroAuditoriaFim.value = "";
            renderizarPainelAdmin();
        });
    }

    // --- Instalação do PWA ---
    const jaInstalado = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const ehIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    if (!jaInstalado && ehIOS) {
        const aviso = document.getElementById("avisoInstalarIOS");
        if (aviso) aviso.style.display = "block";
    }

    let promptDeInstalacao = null;
    window.addEventListener("beforeinstallprompt", (evento) => {
        evento.preventDefault();
        promptDeInstalacao = evento;
        const btnInstalar = document.getElementById("btnInstalarApp");
        if (btnInstalar) btnInstalar.style.display = "inline-flex";
    });

    const btnInstalarApp = document.getElementById("btnInstalarApp");
    if (btnInstalarApp) {
        btnInstalarApp.addEventListener("click", async () => {
            if (!promptDeInstalacao) return;
            promptDeInstalacao.prompt();
            const escolha = await promptDeInstalacao.userChoice;
            if (escolha.outcome === "accepted") showToast("App instalado com sucesso!", "sucesso");
            promptDeInstalacao = null;
            btnInstalarApp.style.display = "none";
        });
    }
});

// ==========================================================
// Usuários / Perfis
// ==========================================================

async function mapearUsuarios() {
    const qSnap = await getDocs(collection(db, "usuarios"));
    usuariosMap = {};
    perfisMap = {};
    qSnap.forEach((docSnap) => {
        const d = docSnap.data();
        usuariosMap[docSnap.id] = d.nome || d.email || "(sem nome)";
        perfisMap[docSnap.id] = {
            nome: d.nome || d.email || "(sem nome)",
            email: d.email || "",
            cargo: d.cargo || d.role || "colaborador",
            jornadaSemanal: Array.isArray(d.jornadaSemanal) ? d.jornadaSemanal : null,
            horariosSemanais: Array.isArray(d.horariosSemanais) ? d.horariosSemanais : null,
            valorHoraExtra: typeof d.valorHoraExtra === "number" ? d.valorHoraExtra : 0,
            ativo: d.ativo !== false
        };
    });
}

function popularSelectColaboradores() {
    const select = document.getElementById("selectColaboradorManual");
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    for (const uid in usuariosMap) {
        const opt = document.createElement("option");
        opt.value = uid;
        opt.textContent = usuariosMap[uid];
        select.appendChild(opt);
    }
}

function renderizarListaColaboradores() {
    const lista = document.getElementById("lista-colaboradores");
    if (!lista) return;
    lista.innerHTML = "";

    const termoBusca = (document.getElementById("buscaColaborador")?.value || "").trim().toLowerCase();
    const entradasFiltradas = Object.entries(perfisMap).filter(([, perfil]) =>
        !termoBusca || perfil.nome.toLowerCase().includes(termoBusca) || perfil.email.toLowerCase().includes(termoBusca)
    );

    if (entradasFiltradas.length === 0) {
        lista.innerHTML = `<li style="justify-content:center; color: var(--text-muted);">Nenhum colaborador encontrado para "${termoBusca}".</li>`;
        return;
    }

    entradasFiltradas.forEach(([uid, perfil]) => {
        const li = document.createElement("li");
        const jornadaTexto = (perfil.jornadaSemanal || JORNADA_PADRAO)
            .map((h, i) => `${DIAS_SEMANA_ABREV[i]}:${h}h`)
            .join(" ");

        const info = document.createElement("div");
        info.innerHTML = `
            <strong style="color:#fff;">${perfil.nome}</strong>
            <span style="color:#94a3b8; margin:0 6px;">•</span>
            <span style="color:${perfil.cargo === 'admin' ? '#f59e0b' : '#94a3b8'};">${perfil.cargo === 'admin' ? 'Admin' : 'Colaborador'}</span>
            ${perfil.ativo === false ? '<span class="badge badge-negativo" style="margin-left:8px;">Inativo</span>' : ''}
            <div style="color:#64748b; font-size:0.85em; margin-top:4px;">
                ${jornadaTexto} &nbsp;•&nbsp; Hora normal: ${formatarMoeda(perfil.valorHoraExtra)}
                ${!perfil.jornadaSemanal ? ' &nbsp;<span style="color:#f59e0b;">(usando jornada padrão — configure a real)</span>' : ''}
            </div>
        `;

        const btnGroup = document.createElement("div");
        btnGroup.className = "acoes-batida";
        const btnEditar = document.createElement("button");
        btnEditar.className = "btn-acao";
        btnEditar.innerHTML = '<i class="fa-solid fa-pen"></i>';
        btnEditar.onclick = () => abrirModalColaborador(uid);
        btnGroup.appendChild(btnEditar);

        li.appendChild(info);
        li.appendChild(btnGroup);
        lista.appendChild(li);
    });
}

function abrirModalColaborador(uid = null) {
    const modal = document.getElementById("modal-colaborador");
    const titulo = document.getElementById("tituloModalColaborador");
    const camposNovo = document.getElementById("camposNovoColaborador");

    document.getElementById("colabUidEditando").value = uid || "";

    if (uid && perfisMap[uid]) {
        const perfil = perfisMap[uid];
        titulo.textContent = `Editar: ${perfil.nome}`;
        camposNovo.style.display = "none"; // não dá pra trocar e-mail/senha por aqui
        document.getElementById("colabCargo").value = perfil.cargo || "colaborador";
        document.getElementById("colabValorHora").value = perfil.valorHoraExtra || 0;
        document.getElementById("colabAtivo").checked = perfil.ativo !== false;
        const jornada = perfil.jornadaSemanal || JORNADA_PADRAO;
        const horarios = perfil.horariosSemanais || [];
        DIAS_SEMANA_ABREV.forEach((_, i) => {
            document.getElementById(`jornadaDia${i}`).value = jornada[i];
            document.getElementById(`horarioEntradaDia${i}`).value = (horarios[i] && horarios[i].entrada) || "";
            document.getElementById(`horarioSaidaDia${i}`).value = (horarios[i] && horarios[i].saida) || "";
        });
    } else {
        titulo.textContent = "Novo Colaborador";
        camposNovo.style.display = "block";
        document.getElementById("colabNome").value = "";
        document.getElementById("colabEmail").value = "";
        document.getElementById("colabSenha").value = "";
        document.getElementById("colabCargo").value = "colaborador";
        document.getElementById("colabValorHora").value = 0;
        document.getElementById("colabAtivo").checked = true;
        JORNADA_PADRAO.forEach((h, i) => {
            document.getElementById(`jornadaDia${i}`).value = h;
            document.getElementById(`horarioEntradaDia${i}`).value = "";
            document.getElementById(`horarioSaidaDia${i}`).value = "";
        });
    }

    modal.style.display = "block";
}

async function salvarColaborador() {
    const uidEditando = document.getElementById("colabUidEditando").value;
    const cargo = document.getElementById("colabCargo").value;
    const valorHoraExtra = Number(document.getElementById("colabValorHora").value) || 0;
    const ativo = document.getElementById("colabAtivo").checked;
    const jornadaSemanal = DIAS_SEMANA_ABREV.map((_, i) => Number(document.getElementById(`jornadaDia${i}`).value) || 0);
    const horariosSemanais = DIAS_SEMANA_ABREV.map((_, i) => ({
        entrada: document.getElementById(`horarioEntradaDia${i}`).value || null,
        saida: document.getElementById(`horarioSaidaDia${i}`).value || null
    }));

    try {
        if (uidEditando) {
            await updateDoc(doc(db, "usuarios", uidEditando), { cargo, jornadaSemanal, horariosSemanais, valorHoraExtra, ativo });
        } else {
            const nome = document.getElementById("colabNome").value.trim();
            const email = document.getElementById("colabEmail").value.trim();
            const senha = document.getElementById("colabSenha").value;
            if (!nome || !email || !senha) return showToast("Preencha nome, e-mail e senha.", "erro");
            if (senha.length < 6) return showToast("A senha precisa ter pelo menos 6 caracteres.", "erro");
            await cadastrarColaborador(nome, email, senha, cargo, jornadaSemanal, valorHoraExtra, horariosSemanais);
        }

        document.getElementById("modal-colaborador").style.display = "none";
        await mapearUsuarios();
        popularSelectColaboradores();
        renderizarListaColaboradores();
        carregarPainelAdmin();
        showToast("Colaborador salvo com sucesso!", "sucesso");
    } catch (error) {
        console.error("Erro ao salvar colaborador:", error);
        showToast("Erro ao salvar colaborador: " + (error.message || error), "erro");
    }
}

// ==========================================================
// Feriados
// ==========================================================

async function carregarFeriados() {
    feriadosSet = new Set();
    feriadosLista = [];
    try {
        const qSnap = await getDocs(collection(db, "feriados"));
        qSnap.forEach((docSnap) => {
            const d = docSnap.data();
            if (d.data) {
                feriadosSet.add(d.data); // esperado no formato "yyyy-mm-dd"
                feriadosLista.push({ id: docSnap.id, data: d.data, descricao: d.descricao || "" });
            }
        });
        feriadosLista.sort((a, b) => a.data.localeCompare(b.data));
    } catch (error) {
        console.error("Erro ao carregar feriados (a coleção pode ainda não existir):", error);
    }
}

function renderizarListaFeriados() {
    const lista = document.getElementById("lista-feriados");
    if (!lista) return;
    lista.innerHTML = "";
    feriadosLista.forEach((f) => {
        const li = document.createElement("li");
        const [ano, mes, dia] = f.data.split("-");
        const info = document.createElement("div");
        info.innerHTML = `<strong style="color:#fff;">${dia}/${mes}/${ano}</strong> <span style="color:#94a3b8; margin-left:8px;">${f.descricao}</span>`;

        const btnGroup = document.createElement("div");
        const btnDel = document.createElement("button");
        btnDel.className = "btn-acao";
        btnDel.style.color = "#ef4444";
        btnDel.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btnDel.onclick = async () => {
            if (!(await showConfirm(`Remover feriado de ${dia}/${mes}/${ano}?`))) return;
            await deleteDoc(doc(db, "feriados", f.id));
            await carregarFeriados();
            renderizarListaFeriados();
        };
        btnGroup.appendChild(btnDel);

        li.appendChild(info);
        li.appendChild(btnGroup);
        lista.appendChild(li);
    });
}

async function adicionarFeriado() {
    const inputData = document.getElementById("inputDataFeriado");
    const inputDescricao = document.getElementById("inputDescricaoFeriado");
    if (!inputData.value) return showToast("Selecione a data do feriado.", "erro");

    await addDoc(collection(db, "feriados"), {
        data: inputData.value, // já vem como "yyyy-mm-dd" do <input type="date">
        descricao: inputDescricao.value.trim() || "Feriado"
    });

    inputData.value = "";
    inputDescricao.value = "";
    await carregarFeriados();
    renderizarListaFeriados();
}

// ==========================================================
// Solicitações de ajuste de ponto
// ==========================================================
// Em vez de o colaborador editar o próprio ponto direto, ele PEDE um ajuste
// (registrar esquecido / corrigir horário / excluir), e o admin aprova ou rejeita.
// O admin continua podendo editar/excluir direto pela Auditoria de Turnos, quando necessário.

function abrirModalSolicitacao() {
    const modal = document.getElementById("modal-solicitacao");
    document.getElementById("solicitacaoAcao").value = "criar";
    document.getElementById("solicitacaoMotivo").value = "";
    document.getElementById("solicitacaoData").value = "";
    document.getElementById("solicitacaoTipo").value = "Entrada";

    const selectBatida = document.getElementById("solicitacaoBatidaId");
    selectBatida.innerHTML = "";
    minhasBatidasCache.slice(0, 40).forEach((batida) => {
        const opt = document.createElement("option");
        opt.value = batida.id;
        const dataFormatada = new Date(batida.data).toLocaleString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        opt.textContent = `${batida.tipo} — ${dataFormatada}`;
        selectBatida.appendChild(opt);
    });

    atualizarCamposModalSolicitacao();
    modal.style.display = "block";
}

function atualizarCamposModalSolicitacao() {
    const acao = document.getElementById("solicitacaoAcao").value;
    const campoBatida = document.getElementById("campoSelecionarBatida");
    const camposNovoOuEditado = document.getElementById("camposNovoOuEditado");

    // "criar" = ponto esquecido (não existe batida pra escolher, precisa de tipo+data novos)
    // "editar" = escolhe uma batida existente E informa o novo tipo/data
    // "excluir" = só escolhe a batida; não precisa de tipo/data
    campoBatida.style.display = (acao === "editar" || acao === "excluir") ? "block" : "none";
    camposNovoOuEditado.style.display = (acao === "criar" || acao === "editar") ? "block" : "none";

    if ((acao === "editar" || acao === "excluir") && minhasBatidasCache.length === 0) {
        showToast("Você ainda não tem nenhum ponto registrado para corrigir ou excluir.", "erro");
    }
}

async function enviarSolicitacao() {
    const acao = document.getElementById("solicitacaoAcao").value;
    const motivo = document.getElementById("solicitacaoMotivo").value.trim();
    if (!motivo) return showToast("Descreva o motivo da solicitação.", "erro");

    const solicitacao = {
        uid: usuarioLogadoUid,
        nome: usuariosMap[usuarioLogadoUid] || "Colaborador",
        acao: acao,
        motivo: motivo,
        status: "pendente",
        criadoEm: new Date().toISOString(),
        respondidoEm: null,
        respostaAdmin: null,
        batidaId: null,
        tipoOriginal: null,
        dataOriginal: null,
        tipoNovo: null,
        dataNova: null
    };

    if (acao === "criar") {
        const dataInformada = document.getElementById("solicitacaoData").value;
        if (!dataInformada) return showToast("Informe a data e hora do ponto esquecido.", "erro");
        solicitacao.tipoNovo = document.getElementById("solicitacaoTipo").value;
        solicitacao.dataNova = new Date(dataInformada).toISOString();
    } else {
        const batidaId = document.getElementById("solicitacaoBatidaId").value;
        if (!batidaId) return showToast("Selecione qual ponto você quer ajustar.", "erro");
        const batidaOriginal = minhasBatidasCache.find(b => b.id === batidaId);
        solicitacao.batidaId = batidaId;
        solicitacao.tipoOriginal = batidaOriginal ? batidaOriginal.tipo : null;
        solicitacao.dataOriginal = batidaOriginal ? batidaOriginal.data : null;

        if (acao === "editar") {
            const dataInformada = document.getElementById("solicitacaoData").value;
            if (!dataInformada) return showToast("Informe a data e hora corretas.", "erro");
            solicitacao.tipoNovo = document.getElementById("solicitacaoTipo").value;
            solicitacao.dataNova = new Date(dataInformada).toISOString();
        }
    }

    try {
        await addDoc(collection(db, "solicitacoes"), solicitacao);
        document.getElementById("modal-solicitacao").style.display = "none";
        showToast("Solicitação enviada! O admin vai revisar em breve.", "sucesso");
        await carregarMinhasSolicitacoes(usuarioLogadoUid);
    } catch (error) {
        console.error("Erro ao enviar solicitação:", error);
        showToast("Não foi possível enviar a solicitação. Tente novamente.", "erro");
    }
}

function descreverSolicitacao(sol) {
    const fmt = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "--";
    if (sol.acao === "criar") return `Registrar <strong>${sol.tipoNovo}</strong> em ${fmt(sol.dataNova)}`;
    if (sol.acao === "editar") return `Corrigir <strong>${sol.tipoOriginal || '?'}</strong> de ${fmt(sol.dataOriginal)} para <strong>${sol.tipoNovo}</strong> em ${fmt(sol.dataNova)}`;
    if (sol.acao === "excluir") return `Excluir <strong>${sol.tipoOriginal || '?'}</strong> registrado em ${fmt(sol.dataOriginal)}`;
    return "Ajuste de ponto";
}

async function carregarMinhasSolicitacoes(uid) {
    const lista = document.getElementById("lista-minhas-solicitacoes");
    if (!lista) return;
    mostrarListaCarregando(lista);

    const q = query(collection(db, "solicitacoes"), where("uid", "==", uid));
    const querySnapshot = await getDocs(q);
    const solicitacoes = [];
    querySnapshot.forEach((docSnap) => solicitacoes.push({ id: docSnap.id, ...docSnap.data() }));
    solicitacoes.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

    lista.innerHTML = "";
    if (solicitacoes.length === 0) {
        lista.innerHTML = `<li style="justify-content:center; color: var(--text-muted);">Nenhuma solicitação enviada ainda.</li>`;
        return;
    }

    solicitacoes.forEach((sol) => {
        const li = document.createElement("li");
        const badgeMap = {
            pendente: { classe: "badge-neutro", texto: "Pendente" },
            aprovado: { classe: "badge-positivo", texto: "Aprovado" },
            rejeitado: { classe: "badge-negativo", texto: "Rejeitado" }
        };
        const badge = badgeMap[sol.status] || badgeMap.pendente;

        const info = document.createElement("div");
        info.innerHTML = `
            <div>${descreverSolicitacao(sol)} <span class="badge ${badge.classe}" style="margin-left:8px;">${badge.texto}</span></div>
            <div style="color:#64748b; font-size:0.85em; margin-top:4px;">Motivo: ${sol.motivo}</div>
            ${sol.status === "rejeitado" && sol.respostaAdmin ? `<div style="color:#ef4444; font-size:0.85em; margin-top:4px;">Resposta do admin: ${sol.respostaAdmin}</div>` : ""}
        `;
        li.appendChild(info);

        if (sol.status === "pendente") {
            const btnGroup = document.createElement("div");
            const btnCancelar = document.createElement("button");
            btnCancelar.className = "btn-acao";
            btnCancelar.style.color = "#ef4444";
            btnCancelar.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            btnCancelar.title = "Cancelar solicitação";
            btnCancelar.onclick = async () => {
                if (!(await showConfirm("Cancelar esta solicitação?"))) return;
                await deleteDoc(doc(db, "solicitacoes", sol.id));
                carregarMinhasSolicitacoes(uid);
            };
            btnGroup.appendChild(btnCancelar);
            li.appendChild(btnGroup);
        }

        lista.appendChild(li);
    });
}

async function carregarSolicitacoesPendentes() {
    const lista = document.getElementById("lista-solicitacoes-pendentes");
    const contador = document.getElementById("contadorSolicitacoesPendentes");
    if (!lista) return;
    mostrarListaCarregando(lista);

    const q = query(collection(db, "solicitacoes"), where("status", "==", "pendente"));
    const querySnapshot = await getDocs(q);
    const solicitacoes = [];
    querySnapshot.forEach((docSnap) => solicitacoes.push({ id: docSnap.id, ...docSnap.data() }));
    solicitacoes.sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm)); // mais antigas primeiro

    if (contador) {
        contador.textContent = `${solicitacoes.length} pendente(s)`;
        contador.className = `badge ${solicitacoes.length > 0 ? 'badge-negativo' : 'badge-neutro'}`;
    }

    lista.innerHTML = "";
    if (solicitacoes.length === 0) {
        lista.innerHTML = `<li style="justify-content:center; color: var(--text-muted);">Nenhuma solicitação pendente. 🎉</li>`;
        return;
    }

    solicitacoes.forEach((sol) => {
        const li = document.createElement("li");
        const info = document.createElement("div");
        info.innerHTML = `
            <strong style="color:#fff;">${sol.nome}</strong>
            <span style="color:#94a3b8; margin: 0 6px;">•</span>
            ${descreverSolicitacao(sol)}
            <div style="color:#64748b; font-size:0.85em; margin-top:4px;">Motivo: ${sol.motivo}</div>
        `;

        const btnGroup = document.createElement("div");
        btnGroup.className = "acoes-batida";

        const btnAprovar = document.createElement("button");
        btnAprovar.className = "btn-acao";
        btnAprovar.style.color = "#10b981";
        btnAprovar.innerHTML = '<i class="fa-solid fa-check"></i>';
        btnAprovar.title = "Aprovar";
        btnAprovar.onclick = () => aprovarSolicitacao(sol);
        btnGroup.appendChild(btnAprovar);

        const btnRejeitar = document.createElement("button");
        btnRejeitar.className = "btn-acao";
        btnRejeitar.style.color = "#ef4444";
        btnRejeitar.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        btnRejeitar.title = "Rejeitar";
        btnRejeitar.onclick = () => rejeitarSolicitacao(sol);
        btnGroup.appendChild(btnRejeitar);

        li.appendChild(info);
        li.appendChild(btnGroup);
        lista.appendChild(li);
    });
}

async function aprovarSolicitacao(sol) {
    if (!(await showConfirm(`Aprovar a solicitação de ${sol.nome}?`))) return;

    try {
        if (sol.acao === "criar") {
            await addDoc(collection(db, "batidas"), { uid: sol.uid, tipo: sol.tipoNovo, data: sol.dataNova });
        } else if (sol.acao === "editar") {
            await updateDoc(doc(db, "batidas", sol.batidaId), { tipo: sol.tipoNovo, data: sol.dataNova });
        } else if (sol.acao === "excluir") {
            await deleteDoc(doc(db, "batidas", sol.batidaId));
        }

        await updateDoc(doc(db, "solicitacoes", sol.id), {
            status: "aprovado",
            respondidoEm: new Date().toISOString()
        });

        carregarSolicitacoesPendentes();
        carregarPainelAdmin();
        if (sol.uid === usuarioLogadoUid) carregarHistorico(usuarioLogadoUid);
    } catch (error) {
        console.error("Erro ao aprovar solicitação:", error);
        showToast("Não foi possível aprovar a solicitação.", "erro");
    }
}

async function rejeitarSolicitacao(sol) {
    const motivo = await showPrompt(`Motivo da rejeição para ${sol.nome}:`, "");
    if (motivo === null) return; // admin cancelou

    try {
        await updateDoc(doc(db, "solicitacoes", sol.id), {
            status: "rejeitado",
            respostaAdmin: motivo.trim() || "Sem motivo informado.",
            respondidoEm: new Date().toISOString()
        });
        carregarSolicitacoesPendentes();
    } catch (error) {
        console.error("Erro ao rejeitar solicitação:", error);
        showToast("Não foi possível rejeitar a solicitação.", "erro");
    }
}

// ==========================================================
// Histórico do colaborador (Espelho de Ponto)
// ==========================================================

async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;
    mostrarListaCarregando(lista);

    const q = query(collection(db, "batidas"), where("uid", "==", uid));
    const querySnapshot = await getDocs(q);
    const batidas = [];
    querySnapshot.forEach((docSnap) => batidas.push({ id: docSnap.id, ...docSnap.data() }));

    // Cache usado para popular o seletor de "qual ponto" no modal de solicitação de ajuste
    minhasBatidasCache = [...batidas].sort((a, b) => new Date(b.data) - new Date(a.data));

    const { jornadas, tempoTotalDiaMs } = processarBatidas(batidas);
    const jornadaSemanal = getJornadaSemanal(uid);

    lista.innerHTML = "";
    let mesAtual = null;
    jornadas.forEach((jornada) => {
        const chaveDoMes = chaveMes(jornada.dataReferencia);
        if (chaveDoMes !== mesAtual) {
            mesAtual = chaveDoMes;
            lista.appendChild(criarCabecalhoMes(jornada.dataReferencia));
        }

        const li = document.createElement("li");
        li.style.background = "#1e293b";
        li.style.padding = "15px 20px";
        li.style.borderRadius = "12px";
        li.style.display = "flex";
        li.style.flexDirection = "column";
        li.style.gap = "8px";
        li.style.borderLeft = (jornada.entrada && jornada.saida) ? "4px solid #10b981" : "4px solid #f59e0b";

        const diaTexto = DIAS_SEMANA[jornada.dataReferencia.getDay()];
        const dataFormatada = jornada.dataReferencia.toLocaleDateString("pt-BR");
        const horaEntrada = jornada.entrada ? new Date(jornada.entrada.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "--:--";
        const horaSaida = jornada.saida ? new Date(jornada.saida.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "Trabalhando...";

        let turnoDuracao = "";
        let badgeHtml = "";

        if (jornada.entrada && jornada.saida) {
            const duracaoTurnoHoras = (new Date(jornada.saida.data) - new Date(jornada.entrada.data)) / 3600000;
            turnoDuracao = `<span style="color:#94a3b8; font-size: 0.9em; margin-left: 6px;">(Duração: ${formatarTempo(duracaoTurnoHoras)})</span>`;

            const totalDiaHoras = (tempoTotalDiaMs[dataFormatada] || 0) / 3600000;
            const cargaDiaria = ehFeriado(jornada.dataReferencia) ? 0 : jornadaSemanal[jornada.dataReferencia.getDay()];
            const badge = calcularBadgeExtra(totalDiaHoras, cargaDiaria);
            if (badge) badgeHtml = `<span style="background: rgba(0,0,0,0.001);" class="badge ${badge.classe}">${badge.texto}</span>`;
        } else if (jornada.entrada && !jornada.saida) {
            const parcialHoras = (new Date() - new Date(jornada.entrada.data)) / 3600000;
            turnoDuracao = `<span style="color:#fbbf24; font-size: 0.9em; font-style: italic; margin-left:6px;">(${formatarTempo(parcialHoras)} até o momento)</span>`;
        }

        li.innerHTML = `
            <div style="display:flex; justify-content: space-between; align-items: center;">
                <strong style="color:#3b82f6; font-size:1.1rem;">${diaTexto} (${dataFormatada})${ehFeriado(jornada.dataReferencia) ? ' <span style="color:#f59e0b; font-size:0.75em;">(Feriado)</span>' : ''}</strong>
                ${badgeHtml}
            </div>
            <div style="color:#e2e8f0; font-size: 1.05rem; margin-top: 5px;">
                <i class="fa-regular fa-clock" style="margin-right: 5px; color:#94a3b8;"></i>
                ${horaEntrada} às ${horaSaida}
                ${turnoDuracao}
            </div>
        `;
        lista.appendChild(li);
    });
}

// ==========================================================
// Painel Admin / Auditoria de turnos
// ==========================================================

let jornadasAdminCache = []; // cache das jornadas de todos os colaboradores, para aplicar filtro sem refazer a consulta

async function carregarPainelAdmin() {
    const listaGeral = document.getElementById("lista-geral-pontos");
    if (!listaGeral) return;
    mostrarListaCarregando(listaGeral);

    const querySnapshot = await getDocs(collection(db, "batidas"));
    const batidasPorUsuario = {};
    querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!batidasPorUsuario[data.uid]) batidasPorUsuario[data.uid] = [];
        batidasPorUsuario[data.uid].push({ id: docSnap.id, ...data });
    });

    const jornadasParaExibir = [];
    for (const uid in batidasPorUsuario) {
        const { jornadas, tempoTotalDiaMs } = processarBatidas(batidasPorUsuario[uid]);
        jornadas.forEach((j) => jornadasParaExibir.push({ ...j, uid, tempoTotalDiaMs }));
    }
    jornadasParaExibir.sort((a, b) => b.dataReferencia - a.dataReferencia);

    jornadasAdminCache = jornadasParaExibir;
    popularSelectFiltroAuditoria();
    renderizarPainelAdmin();
}

function popularSelectFiltroAuditoria() {
    const select = document.getElementById("filtroAuditoriaColaborador");
    if (!select) return;
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todos os colaboradores</option>';
    for (const uid in usuariosMap) {
        const opt = document.createElement("option");
        opt.value = uid;
        opt.textContent = usuariosMap[uid];
        select.appendChild(opt);
    }
    select.value = valorAtual; // mantém a seleção ao recarregar
}

function renderizarPainelAdmin() {
    const listaGeral = document.getElementById("lista-geral-pontos");
    if (!listaGeral) return;

    const filtroColaborador = document.getElementById("filtroAuditoriaColaborador")?.value || "";
    const filtroInicio = document.getElementById("filtroAuditoriaInicio")?.value || "";
    const filtroFim = document.getElementById("filtroAuditoriaFim")?.value || "";

    let jornadasFiltradas = jornadasAdminCache;

    if (filtroColaborador) {
        jornadasFiltradas = jornadasFiltradas.filter(j => j.uid === filtroColaborador);
    }
    if (filtroInicio) {
        const inicio = new Date(filtroInicio + "T00:00:00");
        jornadasFiltradas = jornadasFiltradas.filter(j => j.dataReferencia >= inicio);
    }
    if (filtroFim) {
        const fim = new Date(filtroFim + "T23:59:59");
        jornadasFiltradas = jornadasFiltradas.filter(j => j.dataReferencia <= fim);
    }

    listaGeral.innerHTML = "";

    if (jornadasFiltradas.length === 0) {
        listaGeral.innerHTML = `<li style="justify-content:center; color: var(--text-muted);">Nenhum registro encontrado para esse filtro.</li>`;
        return;
    }

    let mesAtualAdmin = null;
    jornadasFiltradas.forEach((jornada) => {
        const chaveDoMes = chaveMes(jornada.dataReferencia);
        if (chaveDoMes !== mesAtualAdmin) {
            mesAtualAdmin = chaveDoMes;
            listaGeral.appendChild(criarCabecalhoMes(jornada.dataReferencia));
        }

        const nomeColaborador = usuariosMap[jornada.uid] || "Desconhecido";
        const li = document.createElement("li");
        li.style.borderLeft = (jornada.entrada && jornada.saida) ? "4px solid #10b981" : "4px solid #f59e0b";

        const diaTexto = DIAS_SEMANA[jornada.dataReferencia.getDay()];
        const dataFormatada = jornada.dataReferencia.toLocaleDateString("pt-BR");
        const horaEntrada = jornada.entrada ? new Date(jornada.entrada.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "--:--";
        const horaSaida = jornada.saida ? new Date(jornada.saida.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "Trabalhando...";

        let turnoDuracao = "";
        let badgeHtml = "";

        if (jornada.entrada && jornada.saida) {
            const duracaoTurnoHoras = (new Date(jornada.saida.data) - new Date(jornada.entrada.data)) / 3600000;
            turnoDuracao = `<span style="color:#94a3b8; font-size: 0.9em; margin-left: 6px;">(${formatarTempo(duracaoTurnoHoras)})</span>`;

            const totalDiaHoras = (jornada.tempoTotalDiaMs[dataFormatada] || 0) / 3600000;
            const cargaDiaria = ehFeriado(jornada.dataReferencia) ? 0 : getJornadaSemanal(jornada.uid)[jornada.dataReferencia.getDay()];
            const badge = calcularBadgeExtra(totalDiaHoras, cargaDiaria);
            if (badge) badgeHtml = `<span class="badge ${badge.classe}">${badge.texto}</span>`;
        }

        const infoTexto = document.createElement("div");
        infoTexto.innerHTML = `
            <strong style="color:#fff;">${nomeColaborador}</strong>
            <span style="color:#94a3b8; margin: 0 6px;">•</span>
            <span style="color:#3b82f6; font-weight:600;">${diaTexto} (${dataFormatada})</span>
            <span style="color:#94a3b8; margin: 0 6px;">•</span>
            <span style="color:#e2e8f0;">${horaEntrada} às ${horaSaida}</span>
            ${turnoDuracao}
            <span style="margin-left: 8px;">${badgeHtml}</span>
        `;

        const btnGroup = document.createElement("div");
        btnGroup.className = "acoes-batida";

        const registroParaEditar = jornada.entrada || jornada.saida;
        if (registroParaEditar) {
            const btnEdit = document.createElement("button");
            btnEdit.innerHTML = '<i class="fa-solid fa-pen"></i>';
            btnEdit.className = "btn-acao";
            btnEdit.onclick = () => abrirEdicao(registroParaEditar.id, registroParaEditar.tipo, registroParaEditar.data);
            btnGroup.appendChild(btnEdit);
        }

        const btnDel = document.createElement("button");
        btnDel.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btnDel.className = "btn-acao";
        btnDel.style.color = "#ef4444";
        btnDel.onclick = async () => {
            if (!(await showConfirm(`Excluir turno de ${nomeColaborador}?`))) return;
            if (jornada.entrada) await deleteDoc(doc(db, "batidas", jornada.entrada.id));
            if (jornada.saida) await deleteDoc(doc(db, "batidas", jornada.saida.id));
            carregarPainelAdmin();
            carregarHistorico(usuarioLogadoUid);
        };
        btnGroup.appendChild(btnDel);

        li.appendChild(infoTexto);
        li.appendChild(btnGroup);
        listaGeral.appendChild(li);
    });
}

window.abrirEdicao = function (id, tipo, dataIso) {
    const modal = document.getElementById("modal-editar");
    modal.style.display = "block";
    document.getElementById("editBatidaId").value = id;
    document.getElementById("editTipo").value = tipo;
    const d = new Date(dataIso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById("editData").value = d.toISOString().slice(0, 16);
};

// ==========================================================
// Relatório / Fechamento financeiro (dia a dia, hora extra a valor fixo por colaborador)
// ==========================================================

async function gerarRelatorio() {
    const container = document.getElementById("container-relatorio");
    const inputInicio = document.getElementById("dataInicioRelatorio").value;
    const inputFim = document.getElementById("dataFimRelatorio").value;
    if (!inputInicio || !inputFim) return showToast("Selecione as datas.", "erro");

    const inicio = new Date(inputInicio + "T00:00:00");
    const fim = new Date(inputFim + "T23:59:59");
    if (inicio > fim) return showToast("A data de início precisa ser antes da data de fim.", "erro");

    container.innerHTML = `<div class="lista-carregando"><div class="spinner"></div> Calculando fechamento...</div>`;

    // Tolerância para turnos que atravessam a virada do período (ex: entrada 23h50 do último dia)
    const limiteTolerancia = new Date(fim.getTime() + (14 * 60 * 60 * 1000));

    const querySnapshot = await getDocs(collection(db, "batidas"));
    const batidasPorUsuario = {};
    Object.keys(usuariosMap).forEach(uid => batidasPorUsuario[uid] = []);

    querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dataPonto = new Date(data.data);
        if (dataPonto >= inicio && dataPonto <= limiteTolerancia) {
            if (batidasPorUsuario[data.uid]) batidasPorUsuario[data.uid].push(data);
        }
    });

    dadosRelatorioAtual = {
        inicioStr: inicio.toLocaleDateString('pt-BR'),
        fimStr: fim.toLocaleDateString('pt-BR'),
        linhas: [],
        totais: { trabalhadas: 0, prevista: 0, excedenteHoras: 0, valorExtra: 0, pendenteHoras: 0 }
    };

    for (const uid in batidasPorUsuario) {
        const jornadaSemanal = getJornadaSemanal(uid);
        const valorHora = getValorHoraExtra(uid);
        const { tempoTotalDiaMs } = processarBatidas(batidasPorUsuario[uid]);

        let totalTrabalhadoHoras = 0;
        let totalPrevistoHoras = 0;
        let totalExcedenteHoras = 0;
        let totalPendenteHoras = 0;
        let totalValorExtra = 0;
        const detalheDiario = [];

        const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
        const fimLoop = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
        while (cursor <= fimLoop) {
            const chaveDia = cursor.toLocaleDateString('pt-BR');
            const diaSemana = cursor.getDay();
            const feriado = ehFeriado(cursor);
            const cargaDia = feriado ? 0 : jornadaSemanal[diaSemana];
            const trabalhadoHoras = (tempoTotalDiaMs[chaveDia] || 0) / 3600000;

            let excedenteDia = 0;
            let pendenteDia = 0;
            let valorExtraDia = 0;

            if (trabalhadoHoras > cargaDia) {
                excedenteDia = trabalhadoHoras - cargaDia;
                // Valor fixo por hora extra (contrato informal, sem adicional CLT de 50%/100%)
                valorExtraDia = excedenteDia * valorHora;
            } else if (trabalhadoHoras < cargaDia) {
                pendenteDia = cargaDia - trabalhadoHoras;
            }

            totalTrabalhadoHoras += trabalhadoHoras;
            totalPrevistoHoras += cargaDia;
            totalExcedenteHoras += excedenteDia;
            totalPendenteHoras += pendenteDia;
            totalValorExtra += valorExtraDia;

            if (trabalhadoHoras > 0 || cargaDia > 0) {
                detalheDiario.push({
                    data: chaveDia,
                    diaSemana: DIAS_SEMANA_ABREV[diaSemana],
                    feriado,
                    trabalhadoHoras,
                    cargaDia,
                    excedenteDia,
                    pendenteDia,
                    valorExtraDia
                });
            }

            cursor.setDate(cursor.getDate() + 1);
        }

        dadosRelatorioAtual.linhas.push({
            uid,
            nome: usuariosMap[uid],
            trabalhadas: totalTrabalhadoHoras,
            prevista: totalPrevistoHoras,
            excedente: totalExcedenteHoras,
            pendente: totalPendenteHoras,
            valorExtra: totalValorExtra,
            detalheDiario
        });

        dadosRelatorioAtual.totais.trabalhadas += totalTrabalhadoHoras;
        dadosRelatorioAtual.totais.prevista += totalPrevistoHoras;
        dadosRelatorioAtual.totais.excedenteHoras += totalExcedenteHoras;
        dadosRelatorioAtual.totais.valorExtra += totalValorExtra;
        dadosRelatorioAtual.totais.pendenteHoras += totalPendenteHoras;
    }

    renderizarRelatorioNaTela(container);

    const btnExportarPDF = document.getElementById("btnExportarPDF");
    if (btnExportarPDF) btnExportarPDF.style.display = "inline-block";
    const btnExportarCSV = document.getElementById("btnExportarCSV");
    if (btnExportarCSV) btnExportarCSV.style.display = "inline-block";
}

function renderizarRelatorioNaTela(container) {
    const d = dadosRelatorioAtual;
    let html = `<div style="margin-bottom: 15px; color: var(--text-muted);">Fechamento de: <strong>${d.inicioStr}</strong> a <strong>${d.fimStr}</strong></div>`;
    html += `<div class="table-wrapper"><table>
        <tr><th>Colaborador</th><th>Trabalhadas</th><th>Prevista</th><th>Pendente</th><th>Hora Extra</th><th>A Receber</th></tr>`;

    d.linhas.forEach((linha) => {
        html += `<tr>
            <td style="color:#fff;">${linha.nome}</td>
            <td><strong style="color:var(--accent-color);">${linha.trabalhadas.toFixed(2)}h</strong></td>
            <td style="color:var(--text-muted);">${linha.prevista.toFixed(2)}h</td>
            <td>${linha.pendente > 0 ? `<span class="badge badge-negativo">${linha.pendente.toFixed(2)}h</span>` : '-'}</td>
            <td>${linha.excedente > 0 ? `<span class="badge badge-positivo">${linha.excedente.toFixed(2)}h</span>` : '-'}</td>
            <td style="color:#fff; font-weight:600;">${linha.valorExtra > 0 ? formatarMoeda(linha.valorExtra) : '-'}</td>
        </tr>`;
    });

    html += `<tr style="background:#0f172a; font-weight:700;">
        <td style="color:#fff;">TOTAL GERAL</td>
        <td style="color:var(--accent-color);">${d.totais.trabalhadas.toFixed(2)}h</td>
        <td style="color:var(--text-muted);">${d.totais.prevista.toFixed(2)}h</td>
        <td style="color:#ef4444;">${d.totais.pendenteHoras.toFixed(2)}h</td>
        <td style="color:#10b981;">${d.totais.excedenteHoras.toFixed(2)}h</td>
        <td style="color:#fff;">${formatarMoeda(d.totais.valorExtra)}</td>
    </tr>`;
    html += `</table></div>`;
    html += `<div style="color:var(--text-muted); font-size:0.85em; margin-top:10px;">
        Hora extra calculada a valor fixo (definido por colaborador), igual em qualquer dia.
    </div>`;
    container.innerHTML = html;
}

// ==========================================================
// Exportação PDF
// ==========================================================

function exportarParaPDF() {
    if (!dadosRelatorioAtual) return showToast("Gere o relatório primeiro.", "erro");

    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF();
    const d = dadosRelatorioAtual;

    const adicionarRodape = () => {
        const paginas = docPdf.internal.getNumberOfPages();
        for (let i = 1; i <= paginas; i++) {
            docPdf.setPage(i);
            docPdf.setFontSize(8);
            docPdf.setTextColor(150);
            docPdf.text(`Página ${i} de ${paginas} — Documento gerado automaticamente pelo Ponto Golds Beer`, 14, 290);
        }
    };

    docPdf.setFontSize(16);
    docPdf.text(`Ponto Golds Beer — Fechamento Financeiro`, 14, 20);
    docPdf.setFontSize(11);
    docPdf.text(`Período de Apuração: ${d.inicioStr} a ${d.fimStr}`, 14, 28);
    docPdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 34);

    const cabecalho = [["Colaborador", "Trabalhadas", "Prevista", "Pendente", "Extra (h)", "A Receber"]];
    const corpoTabela = d.linhas.map(l => [
        l.nome,
        `${l.trabalhadas.toFixed(2)}h`,
        `${l.prevista.toFixed(2)}h`,
        l.pendente > 0 ? `${l.pendente.toFixed(2)}h` : '-',
        l.excedente > 0 ? `${l.excedente.toFixed(2)}h` : '-',
        l.valorExtra > 0 ? formatarMoeda(l.valorExtra) : '-'
    ]);
    corpoTabela.push([
        "TOTAL GERAL",
        `${d.totais.trabalhadas.toFixed(2)}h`,
        `${d.totais.prevista.toFixed(2)}h`,
        `${d.totais.pendenteHoras.toFixed(2)}h`,
        `${d.totais.excedenteHoras.toFixed(2)}h`,
        formatarMoeda(d.totais.valorExtra)
    ]);

    docPdf.autoTable({
        startY: 42,
        head: cabecalho,
        body: corpoTabela,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 9, cellPadding: 4 },
        didParseCell: (dataCell) => {
            if (dataCell.row.index === corpoTabela.length - 1) {
                dataCell.cell.styles.fontStyle = 'bold';
                dataCell.cell.styles.fillColor = [230, 230, 230];
            }
        }
    });

    // Detalhamento diário por colaborador (apêndice)
    d.linhas.forEach((linha) => {
        if (!linha.detalheDiario.length) return;
        docPdf.addPage();
        docPdf.setFontSize(13);
        docPdf.text(`Detalhamento diário — ${linha.nome}`, 14, 18);

        const corpoDetalhe = linha.detalheDiario.map(item => [
            `${item.diaSemana} ${item.data}${item.feriado ? ' (Feriado)' : ''}`,
            `${item.trabalhadoHoras.toFixed(2)}h`,
            `${item.cargaDia.toFixed(2)}h`,
            item.excedenteDia > 0 ? `+${item.excedenteDia.toFixed(2)}h` : (item.pendenteDia > 0 ? `-${item.pendenteDia.toFixed(2)}h` : '-'),
            item.valorExtraDia > 0 ? formatarMoeda(item.valorExtraDia) : '-'
        ]);

        docPdf.autoTable({
            startY: 24,
            head: [["Dia", "Trabalhado", "Previsto", "Saldo", "Extra"]],
            body: corpoDetalhe,
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 8, cellPadding: 3 }
        });
    });

    // Área de assinatura
    docPdf.addPage();
    docPdf.setFontSize(11);
    docPdf.text("Assinaturas", 14, 20);
    docPdf.line(14, 60, 100, 60);
    docPdf.text("Responsável / RH", 14, 66);
    docPdf.line(120, 60, 196, 60);
    docPdf.text("Colaborador (ciente)", 120, 66);

    adicionarRodape();

    const nomeArquivo = `Fechamento_${d.inicioStr.replace(/\//g, '-')}_a_${d.fimStr.replace(/\//g, '-')}.pdf`;
    docPdf.save(nomeArquivo);
}

// ==========================================================
// Exportação CSV
// ==========================================================

function exportarParaCSV() {
    if (!dadosRelatorioAtual) return showToast("Gere o relatório primeiro.", "erro");
    const d = dadosRelatorioAtual;

    const linhasCSV = [
        ["Colaborador", "Horas Trabalhadas", "Horas Previstas", "Horas Pendentes", "Horas Extras", "Valor Extra (R$)"]
    ];
    d.linhas.forEach(l => {
        linhasCSV.push([
            l.nome,
            l.trabalhadas.toFixed(2).replace('.', ','),
            l.prevista.toFixed(2).replace('.', ','),
            l.pendente.toFixed(2).replace('.', ','),
            l.excedente.toFixed(2).replace('.', ','),
            l.valorExtra.toFixed(2).replace('.', ',')
        ]);
    });
    linhasCSV.push([
        "TOTAL GERAL",
        d.totais.trabalhadas.toFixed(2).replace('.', ','),
        d.totais.prevista.toFixed(2).replace('.', ','),
        d.totais.pendenteHoras.toFixed(2).replace('.', ','),
        d.totais.excedenteHoras.toFixed(2).replace('.', ','),
        d.totais.valorExtra.toFixed(2).replace('.', ',')
    ]);

    const csvConteudo = linhasCSV.map(linha => linha.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    // BOM para o Excel reconhecer acentuação em UTF-8 corretamente
    const blob = new Blob(["\uFEFF" + csvConteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Fechamento_${d.inicioStr.replace(/\//g, '-')}_a_${d.fimStr.replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
