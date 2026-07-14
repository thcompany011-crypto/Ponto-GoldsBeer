import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);
let usuarioLogadoUid = null;
let usuariosMap = {}; 
let emailsMap = {}; 
let dadosRelatorioAtual = null; // Armazena dados para o PDF

async function registrarPonto(tipo, uid, dataHoraManual = null) {
    try {
        const dataBatida = dataHoraManual ? new Date(dataHoraManual).toISOString() : new Date().toISOString();
        await addDoc(collection(db, "batidas"), {
            uid: uid,
            tipo: tipo,
            data: dataBatida
        });
        alert(`Ponto de ${tipo} registrado com sucesso!`);
    } catch (error) {
        console.error("Erro ao registrar:", error);
    }
}

function formatarTempo(horasDecimais) {
    let h = Math.floor(horasDecimais);
    let m = Math.round((horasDecimais - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = "login.html"; return; }
        usuarioLogadoUid = user.uid;

        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");
            const painelAvancado = document.getElementById("painel-avancado-admin");

            let dadosBanco = userDoc.exists() ? userDoc.data() : {};
            const ehAdminNoBanco = dadosBanco.cargo === "admin" || dadosBanco.role === "admin";
            const ehEmailAdminMaster = user.email === "thcompany011@gmail.com" || user.email === "admin@teste.com"; 

            await mapearUsuarios();

            if (ehAdminNoBanco || ehEmailAdminMaster) {
                if (secaoCadastro) secaoCadastro.style.display = "block";
                if (painelAvancado) painelAvancado.style.display = "block";
                popularSelectColaboradores();
                carregarPainelAdmin();
            }
            carregarHistorico(usuarioLogadoUid);
        } catch (error) { console.error("Erro no auth:", error); }
    });

    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");
    if (btnEntrada) btnEntrada.addEventListener("click", () => registrarPonto("Entrada", usuarioLogadoUid).then(() => { carregarHistorico(usuarioLogadoUid); carregarPainelAdmin(); }));
    if (btnSaida) btnSaida.addEventListener("click", () => registrarPonto("Saída", usuarioLogadoUid).then(() => { carregarHistorico(usuarioLogadoUid); carregarPainelAdmin(); }));

    const btnSalvarManual = document.getElementById("btnSalvarManual");
    if (btnSalvarManual) {
        btnSalvarManual.addEventListener("click", async () => {
            const colabUid = document.getElementById("selectColaboradorManual").value;
            const tipo = document.getElementById("selectTipoManual").value;
            const dataHora = document.getElementById("inputDataManual").value;
            if (!colabUid || !dataHora) return;
            await registrarPonto(tipo, colabUid, dataHora);
            carregarPainelAdmin();
            if (colabUid === usuarioLogadoUid) carregarHistorico(usuarioLogadoUid);
        });
    }

    const btnGerarRelatorio = document.getElementById("btnGerarRelatorio");
    if (btnGerarRelatorio) btnGerarRelatorio.addEventListener("click", () => gerarRelatorio());

    // Botão do PDF
    const btnExportarPDF = document.getElementById("btnExportarPDF");
    if (btnExportarPDF) btnExportarPDF.addEventListener("click", () => exportarParaPDF());

    const btnSalvarEdicao = document.getElementById("btnSalvarEdicao");
    const btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
    if (btnSalvarEdicao) {
        btnSalvarEdicao.addEventListener("click", async () => {
            const id = document.getElementById("editBatidaId").value;
            const tipo = document.getElementById("editTipo").value;
            const dataLocal = document.getElementById("editData").value;
            if(!id || !dataLocal) return;
            await updateDoc(doc(db, "batidas", id), { tipo: tipo, data: new Date(dataLocal).toISOString() });
            document.getElementById("modal-editar").style.display = "none";
            carregarPainelAdmin();
            carregarHistorico(usuarioLogadoUid); 
        });
    }
    if (btnCancelarEdicao) btnCancelarEdicao.addEventListener("click", () => document.getElementById("modal-editar").style.display = "none");
});

async function mapearUsuarios() {
    const qSnap = await getDocs(collection(db, "usuarios"));
    usuariosMap = {}; emailsMap = {};
    qSnap.forEach((doc) => {
        const d = doc.data();
        usuariosMap[doc.id] = d.nome || d.email;
        emailsMap[doc.id] = d.email || ""; 
    });
}

function popularSelectColaboradores() {
    const select = document.getElementById("selectColaboradorManual");
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    for (const uid in usuariosMap) {
        const opt = document.createElement("option");
        opt.value = uid; opt.textContent = usuariosMap[uid];
        select.appendChild(opt);
    }
}

// Histórico Visual Rico (Colaborador)
async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;
    const q = query(collection(db, "batidas"), where("uid", "==", uid));
    const querySnapshot = await getDocs(q);
    lista.innerHTML = ""; 
    
    const batidas = [];
    querySnapshot.forEach((doc) => batidas.push(doc.data()));
    batidas.sort((a, b) => new Date(a.data) - new Date(b.data));

    const jornadasParaExibir = [];
    const tempoTotalDia = {};
    let entradaPendente = null;

    batidas.forEach((batida) => {
        if (batida.tipo === "Entrada") {
            if (entradaPendente) jornadasParaExibir.push({ dataReferencia: new Date(entradaPendente.data), entrada: entradaPendente, saida: null });
            entradaPendente = batida;
        } else if (batida.tipo === "Saída") {
            if (entradaPendente) {
                const dateRef = new Date(entradaPendente.data);
                jornadasParaExibir.push({ dataReferencia: dateRef, entrada: entradaPendente, saida: batida });
                const dataChave = dateRef.toLocaleDateString("pt-BR");
                const duracaoMs = new Date(batida.data) - dateRef;
                if (!tempoTotalDia[dataChave]) tempoTotalDia[dataChave] = 0;
                tempoTotalDia[dataChave] += duracaoMs;
                entradaPendente = null;
            } else {
                jornadasParaExibir.push({ dataReferencia: new Date(batida.data), entrada: null, saida: batida });
            }
        }
    });

    if (entradaPendente) jornadasParaExibir.push({ dataReferencia: new Date(entradaPendente.data), entrada: entradaPendente, saida: null });
    jornadasParaExibir.sort((a, b) => b.dataReferencia - a.dataReferencia);

    const diasSemana = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

    jornadasParaExibir.forEach((jornada) => {
        const li = document.createElement("li");
        li.style.background = "#1e293b";
        li.style.padding = "15px 20px";
        li.style.borderRadius = "12px";
        li.style.display = "flex";
        li.style.flexDirection = "column";
        li.style.gap = "8px";
        
        if (jornada.entrada && jornada.saida) li.style.borderLeft = "4px solid #10b981"; 
        else li.style.borderLeft = "4px solid #f59e0b"; 
        
        const diaTexto = diasSemana[jornada.dataReferencia.getDay()];
        const dataFormatada = jornada.dataReferencia.toLocaleDateString("pt-BR");
        const horaEntrada = jornada.entrada ? new Date(jornada.entrada.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "--:--";
        const horaSaida = jornada.saida ? new Date(jornada.saida.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "Trabalhando...";

        let turnoDuracao = "";
        let badgeExtra = "";

        if (jornada.entrada && jornada.saida) {
            const duracaoTurnoHoras = (new Date(jornada.saida.data) - new Date(jornada.entrada.data)) / (1000 * 60 * 60);
            turnoDuracao = `<span style="color:#94a3b8; font-size: 0.9em; margin-left: 6px;">(Duração: ${formatarTempo(duracaoTurnoHoras)})</span>`;

            const totalDiaHoras = tempoTotalDia[dataFormatada] / (1000 * 60 * 60);
            const emailColab = emailsMap[uid] || "";
            const cargaDiaria = (emailColab === "math3usmoraes@gmail.com") 
                ? [8, 0, 8, 8, 8, 8, 8][jornada.dataReferencia.getDay()] 
                : [7, 6, 0, 6, 6, 9.5, 9.5][jornada.dataReferencia.getDay()];

            if (totalDiaHoras > cargaDiaria && cargaDiaria > 0) {
                badgeExtra = `<span style="background: rgba(16,185,129,0.15); color: #10b981; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; font-weight: 600;">+ ${formatarTempo(totalDiaHoras - cargaDiaria)} Extra</span>`;
            } else if (totalDiaHoras < cargaDiaria && cargaDiaria > 0) {
                badgeExtra = `<span style="background: rgba(239,68,68,0.15); color: #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; font-weight: 600;">- ${formatarTempo(cargaDiaria - totalDiaHoras)} Pendente</span>`;
            } else if (cargaDiaria > 0) {
                badgeExtra = `<span style="background: rgba(59,130,246,0.15); color: #3b82f6; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; font-weight: 600;">Carga Exata</span>`;
            } else if (cargaDiaria === 0 && totalDiaHoras > 0) {
                badgeExtra = `<span style="background: rgba(16,185,129,0.15); color: #10b981; padding: 4px 10px; border-radius: 6px; font-size: 0.85em; font-weight: 600;">+ ${formatarTempo(totalDiaHoras)} Extra (Folga)</span>`;
            }
        } else if (jornada.entrada && !jornada.saida) {
            const parcialHoras = (new Date() - new Date(jornada.entrada.data)) / (1000 * 60 * 60);
            turnoDuracao = `<span style="color:#fbbf24; font-size: 0.9em; font-style: italic; margin-left:6px;">(${formatarTempo(parcialHoras)} até o momento)</span>`;
        }

        li.innerHTML = `
            <div style="display:flex; justify-content: space-between; align-items: center;">
                <strong style="color:#3b82f6; font-size:1.1rem;">${diaTexto} (${dataFormatada})</strong>
                ${badgeExtra}
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

// Painel Admin / Auditoria
async function carregarPainelAdmin() {
    const listaGeral = document.getElementById("lista-geral-pontos");
    if (!listaGeral) return;
    const querySnapshot = await getDocs(collection(db, "batidas"));
    listaGeral.innerHTML = "";
    
    const batidasPorUsuario = {};
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!batidasPorUsuario[data.uid]) batidasPorUsuario[data.uid] = [];
        batidasPorUsuario[data.uid].push({ id: doc.id, ...data });
    });

    const jornadasParaExibir = [];
    const tempoTotalDiaUsuario = {}; 

    for (const uid in batidasPorUsuario) {
        const batidas = batidasPorUsuario[uid];
        batidas.sort((a, b) => new Date(a.data) - new Date(b.data));

        const nomeColaborador = usuariosMap[uid] || "Desconhecido";
        let entradaPendente = null;

        batidas.forEach((batida) => {
            if (batida.tipo === "Entrada") {
                if (entradaPendente) jornadasParaExibir.push({ uid: uid, nome: nomeColaborador, dataReferencia: new Date(entradaPendente.data), entrada: entradaPendente, saida: null });
                entradaPendente = batida;
            } else if (batida.tipo === "Saída") {
                if (entradaPendente) {
                    const dateRef = new Date(entradaPendente.data);
                    jornadasParaExibir.push({ uid: uid, nome: nomeColaborador, dataReferencia: dateRef, entrada: entradaPendente, saida: batida });
                    const chaveDiaUser = `${uid}_${dateRef.toLocaleDateString("pt-BR")}`;
                    if (!tempoTotalDiaUsuario[chaveDiaUser]) tempoTotalDiaUsuario[chaveDiaUser] = 0;
                    tempoTotalDiaUsuario[chaveDiaUser] += (new Date(batida.data) - dateRef);
                    entradaPendente = null;
                } else {
                    jornadasParaExibir.push({ uid: uid, nome: nomeColaborador, dataReferencia: new Date(batida.data), entrada: null, saida: batida });
                }
            }
        });
        if (entradaPendente) jornadasParaExibir.push({ uid: uid, nome: nomeColaborador, dataReferencia: new Date(entradaPendente.data), entrada: entradaPendente, saida: null });
    }

    jornadasParaExibir.sort((a, b) => b.dataReferencia - a.dataReferencia);
    const diasSemana = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

    jornadasParaExibir.forEach((jornada) => {
        const li = document.createElement("li");
        li.style.borderLeft = (jornada.entrada && jornada.saida) ? "4px solid #10b981" : "4px solid #f59e0b";
        
        const diaTexto = diasSemana[jornada.dataReferencia.getDay()];
        const dataFormatada = jornada.dataReferencia.toLocaleDateString("pt-BR");
        const horaEntrada = jornada.entrada ? new Date(jornada.entrada.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "--:--";
        const horaSaida = jornada.saida ? new Date(jornada.saida.data).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' }) : "Trabalhando...";

        let turnoDuracao = "";
        let badgeExtra = "";

        if (jornada.entrada && jornada.saida) {
            const duracaoTurnoHoras = (new Date(jornada.saida.data) - new Date(jornada.entrada.data)) / (1000 * 60 * 60);
            turnoDuracao = `<span style="color:#94a3b8; font-size: 0.9em; margin-left: 6px;">(${formatarTempo(duracaoTurnoHoras)})</span>`;
            
            const totalDiaHoras = tempoTotalDiaUsuario[`${jornada.uid}_${dataFormatada}`] / (1000 * 60 * 60);
            const emailColab = emailsMap[jornada.uid] || "";
            const cargaDiaria = (emailColab === "math3usmoraes@gmail.com") 
                ? [8, 0, 8, 8, 8, 8, 8][jornada.dataReferencia.getDay()] 
                : [7, 6, 0, 6, 6, 9.5, 9.5][jornada.dataReferencia.getDay()];

            if (totalDiaHoras > cargaDiaria && cargaDiaria > 0) {
                badgeExtra = `<span class="badge badge-positivo">+ ${formatarTempo(totalDiaHoras - cargaDiaria)} Extra</span>`;
            } else if (totalDiaHoras < cargaDiaria && cargaDiaria > 0) {
                badgeExtra = `<span class="badge badge-negativo">- ${formatarTempo(cargaDiaria - totalDiaHoras)} Pendente</span>`;
            } else if (cargaDiaria > 0) {
                badgeExtra = `<span class="badge badge-neutro">Carga Exata</span>`;
            } else if (cargaDiaria === 0 && totalDiaHoras > 0) {
                badgeExtra = `<span class="badge badge-positivo">+ ${formatarTempo(totalDiaHoras)} Extra (Folga)</span>`;
            }
        }

        const infoTexto = document.createElement("div");
        infoTexto.innerHTML = `
            <strong style="color:#fff;">${jornada.nome}</strong>
            <span style="color:#94a3b8; margin: 0 6px;">•</span>
            <span style="color:#3b82f6; font-weight:600;">${diaTexto} (${dataFormatada})</span>
            <span style="color:#94a3b8; margin: 0 6px;">•</span>
            <span style="color:#e2e8f0;">${horaEntrada} às ${horaSaida}</span>
            ${turnoDuracao}
            <span style="margin-left: 8px;">${badgeExtra}</span>
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
            if (confirm(`Excluir turno de ${jornada.nome}?`)) {
                if (jornada.entrada) await deleteDoc(doc(db, "batidas", jornada.entrada.id));
                if (jornada.saida) await deleteDoc(doc(db, "batidas", jornada.saida.id));
                carregarPainelAdmin(); carregarHistorico(usuarioLogadoUid);
            }
        };
        btnGroup.appendChild(btnDel);

        li.appendChild(infoTexto);
        li.appendChild(btnGroup);
        listaGeral.appendChild(li);
    });
}

window.abrirEdicao = function(id, tipo, dataIso) {
    const modal = document.getElementById("modal-editar");
    modal.style.display = "block";
    document.getElementById("editBatidaId").value = id;
    document.getElementById("editTipo").value = tipo;
    const d = new Date(dataIso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById("editData").value = d.toISOString().slice(0, 16);
};

// Relatório Aprimorado
async function gerarRelatorio() {
    const container = document.getElementById("container-relatorio");
    const inputInicio = document.getElementById("dataInicioRelatorio").value;
    const inputFim = document.getElementById("dataFimRelatorio").value;
    if (!inputInicio || !inputFim) return alert("Selecione as datas.");

    let inicio = new Date(inputInicio + "T00:00:00");
    let fim = new Date(inputFim + "T23:59:59");
    const limiteTolerancia = new Date(fim.getTime() + (14 * 60 * 60 * 1000));
    
    const querySnapshot = await getDocs(collection(db, "batidas"));
    const horasPorUsuario = {};
    Object.keys(usuariosMap).forEach(uid => horasPorUsuario[uid] = []);

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const dataPonto = new Date(data.data);
        if (dataPonto >= inicio && dataPonto <= limiteTolerancia) {
            if (horasPorUsuario[data.uid]) horasPorUsuario[data.uid].push({ tipo: data.tipo, data: dataPonto });
        }
    });

    let html = `<div style="margin-bottom: 15px; color: var(--text-muted);">Fechamento de: <strong>${inicio.toLocaleDateString('pt-BR')}</strong> a <strong>${fim.toLocaleDateString('pt-BR')}</strong></div>`;
    html += `<div class="table-wrapper"><table><tr><th>Colaborador</th><th>Trabalhadas</th><th>Carga Prevista</th><th>Status / Fechamento</th></tr>`;

    // PREPARA OS DADOS PARA O PDF
    dadosRelatorioAtual = {
        inicioStr: inicio.toLocaleDateString('pt-BR'),
        fimStr: fim.toLocaleDateString('pt-BR'),
        linhas: []
    };

    const diasSemanaNomes = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

    for (const uid in horasPorUsuario) {
        const emailColab = emailsMap[uid] || "";
        const jornadaAplicada = emailColab === "math3usmoraes@gmail.com" ? [8, 0, 8, 8, 8, 8, 8] : [7, 6, 0, 6, 6, 9.5, 9.5];

        let horasEsperadas = 0;
        let dataAtualLoop = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
        const dataFimLoop = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
        while (dataAtualLoop <= dataFimLoop) {
            horasEsperadas += jornadaAplicada[dataAtualLoop.getDay()];
            dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
        }

        const pontos = horasPorUsuario[uid].sort((a, b) => a.data - b.data);
        let totalMS = 0;
        let entradaAtiva = null;

        // Variáveis para mapeamento detalhado (PDF)
        let turnosDetalhados = [];
        let tempoTotalDiaUsuarioRelatorio = {};

        pontos.forEach((p) => {
            if (p.tipo === "Entrada") { 
                if (p.data <= fim) {
                    if (entradaAtiva) turnosDetalhados.push({ entrada: { data: entradaAtiva }, saida: null });
                    entradaAtiva = p.data; 
                } 
            } 
            else if (p.tipo === "Saída" && entradaAtiva) { 
                const duracaoMs = (p.data - entradaAtiva);
                totalMS += duracaoMs; 
                
                turnosDetalhados.push({ entrada: { data: entradaAtiva }, saida: { data: p.data } });
                
                const chaveDia = new Date(entradaAtiva).toLocaleDateString("pt-BR");
                if (!tempoTotalDiaUsuarioRelatorio[chaveDia]) tempoTotalDiaUsuarioRelatorio[chaveDia] = 0;
                tempoTotalDiaUsuarioRelatorio[chaveDia] += duracaoMs;

                entradaAtiva = null; 
            }
        });
        
        if (entradaAtiva) turnosDetalhados.push({ entrada: { data: entradaAtiva }, saida: null });

        // Gera as linhas textuais do espelho de ponto deste usuário para o PDF
        let linhasTurnosPDF = turnosDetalhados.map(t => {
            const dataRef = t.entrada ? new Date(t.entrada.data) : new Date(t.saida.data);
            const diaTexto = diasSemanaNomes[dataRef.getDay()];
            const dataFormatada = dataRef.toLocaleDateString("pt-BR");
            const horaIn = t.entrada ? new Date(t.entrada.data).toLocaleTimeString("pt-BR", {hour:'2-digit', minute:'2-digit'}) : "--:--";
            const horaOut = t.saida ? new Date(t.saida.data).toLocaleTimeString("pt-BR", {hour:'2-digit', minute:'2-digit'}) : "Trabalhando...";

            let duracaoStr = "-";
            let saldoStr = "-";

            if (t.entrada && t.saida) {
                const duracaoHoras = (t.saida.data - t.entrada.data) / (1000 * 60 * 60);
                duracaoStr = formatarTempo(duracaoHoras);

                const totalDiaHoras = tempoTotalDiaUsuarioRelatorio[dataFormatada] / (1000 * 60 * 60);
                const cargaDia = jornadaAplicada[dataRef.getDay()];

                if (totalDiaHoras > cargaDia && cargaDia > 0) saldoStr = `+ ${formatarTempo(totalDiaHoras - cargaDia)} Extra`;
                else if (totalDiaHoras < cargaDia && cargaDia > 0) saldoStr = `- ${formatarTempo(cargaDia - totalDiaHoras)} Pendente`;
                else if (cargaDia > 0) saldoStr = `Carga Exata`;
                else if (cargaDia === 0 && totalDiaHoras > 0) saldoStr = `+ ${formatarTempo(totalDiaHoras)} (Folga)`;
            }

            return [dataFormatada, diaTexto, horaIn, horaOut, duracaoStr, saldoStr];
        });

        const totalHorasDec = totalMS / (1000 * 60 * 60);
        let htmlSaldo = "";
        let excedente = 0;
        let valorExtra = 0;
        
        if (totalHorasDec > horasEsperadas) {
            excedente = totalHorasDec - horasEsperadas;
            valorExtra = excedente * 11; // Base de cálculo R$ 11
            htmlSaldo = `<span class="badge badge-positivo">+ ${excedente.toFixed(2)}h (R$ ${valorExtra.toFixed(2).replace('.', ',')})</span>`;
        } else if (totalHorasDec < horasEsperadas && horasEsperadas > 0) {
            htmlSaldo = `<span class="badge badge-negativo">- ${(horasEsperadas - totalHorasDec).toFixed(2)}h pendentes</span>`;
        } else {
            htmlSaldo = `<span class="badge badge-neutro">Carga Exata</span>`;
        }

        // Armazena dados completos do colaborador para o PDF
        dadosRelatorioAtual.linhas.push({
            nome: usuariosMap[uid],
            trabalhadas: totalHorasDec,
            prevista: horasEsperadas,
            excedente: excedente,
            valorExtra: valorExtra,
            turnos: linhasTurnosPDF // Recebeu a matriz detalhada
        });

        html += `<tr><td style="color:#fff;">${usuariosMap[uid]}</td><td><strong style="color:var(--accent-color);">${totalHorasDec.toFixed(2)}h</strong></td><td style="color:var(--text-muted);">${horasEsperadas.toFixed(2)}h</td><td>${htmlSaldo}</td></tr>`;
    }
    html += `</table></div>`;
    container.innerHTML = html;

    const btnExportarPDF = document.getElementById("btnExportarPDF");
    if(btnExportarPDF) btnExportarPDF.style.display = "inline-block";
}

// NOVA FUNÇÃO: GERA E FAZ O DOWNLOAD DO PDF COM DETALHES DIÁRIOS
function exportarParaPDF() {
    if (!dadosRelatorioAtual) return alert("Gere o relatório primeiro.");
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Cabeçalho Geral
    doc.setFontSize(16);
    doc.text(`Ponto Golds Beer - Fechamento Semanal`, 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Período de Apuração: ${dadosRelatorioAtual.inicioStr} a ${dadosRelatorioAtual.fimStr}`, 14, 28);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 34);

    // 2. Tabela de Resumo Consolidado
    const cabecalhoResumo = [["Colaborador", "Horas Trabalhadas", "Carga Prevista", "Horas Extras", "Total A Receber (R$)"]];
    const corpoResumo = dadosRelatorioAtual.linhas.map(linha => [
        linha.nome,
        `${linha.trabalhadas.toFixed(2)} hrs`,
        `${linha.prevista.toFixed(2)} hrs`,
        linha.excedente > 0 ? `+ ${linha.excedente.toFixed(2)} hrs` : 'Sem extras',
        linha.valorExtra > 0 ? `R$ ${linha.valorExtra.toFixed(2).replace('.', ',')}` : '-'
    ]);

    doc.autoTable({
        startY: 42,
        head: cabecalhoResumo,
        body: corpoResumo,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 10, cellPadding: 4 },
    });

    // 3. Auditoria: Tabelas Detalhadas por Colaborador
    dadosRelatorioAtual.linhas.forEach(usuario => {
        // Se o usuário possui registros de ponto no período
        if (usuario.turnos && usuario.turnos.length > 0) {
            
            // Define o início da nova tabela abaixo da anterior
            let yPos = doc.lastAutoTable.finalY + 15;
            
            // Verifica se está muito perto do final da página para quebrar para a próxima
            if (yPos > doc.internal.pageSize.getHeight() - 20) {
                doc.addPage();
                yPos = 20;
            }

            // Título do funcionário
            doc.setFontSize(12);
            doc.setTextColor(40);
            doc.text(`Espelho de Ponto Detalhado: ${usuario.nome}`, 14, yPos);

            // Cria a tabela de turnos
            doc.autoTable({
                startY: yPos + 5,
                head: [['Data', 'Dia da Semana', 'Entrada', 'Saída', 'Duração do Turno', 'Saldo do Dia']],
                body: usuario.turnos,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] },
                styles: { fontSize: 9, cellPadding: 3 },
                alternateRowStyles: { fillColor: [245, 245, 245] }
            });
        }
    });

    // Gera o arquivo
    const nomeArquivo = `Fechamento_${dadosRelatorioAtual.inicioStr.replace(/\//g, '-')}_a_${dadosRelatorioAtual.fimStr.replace(/\//g, '-')}.pdf`;
    doc.save(nomeArquivo);
}

