import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);
let usuarioLogadoUid = null;
let usuariosMap = {}; 

// ==========================================
// FUNÇÃO AUXILIAR: REGISTRAR PONTO
// ==========================================
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
        console.error("Erro ao registrar ponto:", error);
        alert("Erro ao registrar o ponto. Verifique o console.");
    }
}

// ==========================================
// INICIALIZAÇÃO DO DASHBOARD
// ==========================================
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
            
            // SEU EMAIL DE ADMIN MASTER (Se o email logado for este, ele SEMPRE libera o painel)
            const ehEmailAdminMaster = user.email === "thcompany011@gmail.com" || user.email === "admin@teste.com"; 

            if (ehAdminNoBanco || ehEmailAdminMaster) {
                if (secaoCadastro) secaoCadastro.style.display = "block";
                if (painelAvancado) painelAvancado.style.display = "block"; // CORRIGIDO para block para renderizar o Grid corretamente
                
                await mapearUsuarios();
                popularSelectColaboradores();
                carregarPainelAdmin();
            } else {
                if (secaoCadastro) secaoCadastro.style.display = "none";
                if (painelAvancado) painelAvancado.style.display = "none";
            }
            carregarHistorico(usuarioLogadoUid);
        } catch (error) { console.error("Erro no dashboard:", error); }
    });

    // Configuração dos Botões de Batida Rápida
    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");
    if (btnEntrada) btnEntrada.addEventListener("click", () => registrarPonto("Entrada", usuarioLogadoUid).then(() => { carregarHistorico(usuarioLogadoUid); carregarPainelAdmin(); }));
    if (btnSaida) btnSaida.addEventListener("click", () => registrarPonto("Saída", usuarioLogadoUid).then(() => { carregarHistorico(usuarioLogadoUid); carregarPainelAdmin(); }));

    // Lançamento Manual pelo Administrador
    const btnSalvarManual = document.getElementById("btnSalvarManual");
    if (btnSalvarManual) {
        btnSalvarManual.addEventListener("click", async () => {
            const colabUid = document.getElementById("selectColaboradorManual").value;
            const tipo = document.getElementById("selectTipoManual").value;
            const dataHora = document.getElementById("inputDataManual").value;

            if (!colabUid || !dataHora) { alert("Preencha todos os campos do registro manual."); return; }

            await registrarPonto(tipo, colabUid, dataHora);
            carregarPainelAdmin();
            if (colabUid === usuarioLogadoUid) carregarHistorico(usuarioLogadoUid);
        });
    }

    // Botão de Processar Relatório Financeiro
    const btnGerarRelatorio = document.getElementById("btnGerarRelatorio");
    if (btnGerarRelatorio) {
        btnGerarRelatorio.addEventListener("click", () => gerarRelatorio());
    }

    // Modal de Edição de Ponto Aberto pelo Admin
    const btnSalvarEdicao = document.getElementById("btnSalvarEdicao");
    const btnCancelarEdicao = document.getElementById("btnCancelarEdicao");
    const modalEditar = document.getElementById("modal-editar");

    if (btnSalvarEdicao) {
        btnSalvarEdicao.addEventListener("click", async () => {
            const id = document.getElementById("editBatidaId").value;
            const tipo = document.getElementById("editTipo").value;
            const dataLocal = document.getElementById("editData").value;
            
            if(!id || !dataLocal) { alert("Preencha a data e hora!"); return; }
            
            try {
                await updateDoc(doc(db, "batidas", id), {
                    tipo: tipo,
                    data: new Date(dataLocal).toISOString()
                });
                alert("Batida corrigida com sucesso!");
                modalEditar.style.display = "none";
                carregarPainelAdmin();
                carregarHistorico(usuarioLogadoUid); 
            } catch (error) { console.error("Erro ao editar:", error); }
        });
    }

    if (btnCancelarEdicao) {
        btnCancelarEdicao.addEventListener("click", () => {
            modalEditar.style.display = "none";
        });
    }
});

// ==========================================
// FUNÇÕES DE MAPEAMENTO E HISTÓRICO
// ==========================================
async function mapearUsuarios() {
    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        usuariosMap = {};
        querySnapshot.forEach((doc) => {
            const dados = doc.data();
            usuariosMap[doc.id] = dados.nome || dados.email || `Usuário (${doc.id.substring(0, 5)})`;
        });
    } catch (error) {
        console.error("Erro ao buscar colaboradores:", error);
    }
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

async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;
    try {
        const q = query(collection(db, "batidas"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 
        const pontos = [];
        querySnapshot.forEach((doc) => pontos.push(doc.data()));
        
        pontos.sort((a, b) => new Date(a.data) - new Date(b.data));
        
        pontos.forEach((ponto) => {
            const li = document.createElement("li");
            li.className = ponto.tipo === "Entrada" ? "is-entrada" : "is-saida";
            li.innerHTML = `<strong>${ponto.tipo}</strong>: ${new Date(ponto.data).toLocaleString("pt-BR")}`;
            lista.appendChild(li);
        });
    } catch (error) { console.error(error); }
}

// ==========================================
// AUDITORIA E GERENCIAMENTO ADMIN
// ==========================================
async function carregarPainelAdmin() {
    const listaGeral = document.getElementById("lista-geral-pontos");
    if (!listaGeral) return;
    try {
        const querySnapshot = await getDocs(collection(db, "batidas"));
        listaGeral.innerHTML = "";
        const todosPontos = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            todosPontos.push({ id: doc.id, nome: usuariosMap[data.uid] || "Desconhecido", tipo: data.tipo, data: data.data });
        });
        
        todosPontos.sort((a, b) => new Date(b.data) - new Date(a.data)); 
        
        todosPontos.forEach((ponto) => {
            const li = document.createElement("li");
            li.className = ponto.tipo === "Entrada" ? "is-entrada" : "is-saida";
            
            const infoTexto = document.createElement("div");
            infoTexto.innerHTML = `<strong style="color:#fff;">${ponto.nome}</strong> 
                                   <span style="color:#94a3b8; margin: 0 8px;">•</span> 
                                   <span style="color:${ponto.tipo === 'Entrada' ? '#10b981' : '#ef4444'}; font-weight:600;">${ponto.tipo}</span> 
                                   <span style="color:#94a3b8; margin: 0 8px;">•</span> 
                                   ${new Date(ponto.data).toLocaleString("pt-BR")}`;
            
            const btnGroup = document.createElement("div");
            btnGroup.className = "acoes-batida";

            const btnEdit = document.createElement("button");
            btnEdit.innerHTML = '<i class="fa-solid fa-pen"></i>';
            btnEdit.className = "btn-acao";
            btnEdit.title = "Editar Batida";
            btnEdit.onclick = () => abrirEdicao(ponto.id, ponto.tipo, ponto.data);

            const btnDel = document.createElement("button");
            btnDel.innerHTML = '<i class="fa-solid fa-trash"></i>';
            btnDel.className = "btn-acao";
            btnDel.style.color = "#ef4444";
            btnDel.title = "Excluir Batida";
            btnDel.onclick = async () => {
                if(confirm(`Tem certeza que deseja apagar a batida de ${ponto.nome}?`)) {
                    await deleteDoc(doc(db, "batidas", ponto.id));
                    carregarPainelAdmin();
                    carregarHistorico(usuarioLogadoUid);
                }
            };

            btnGroup.appendChild(btnEdit);
            btnGroup.appendChild(btnDel);
            li.appendChild(infoTexto);
            li.appendChild(btnGroup);
            listaGeral.appendChild(li);
        });
    } catch (error) { console.error(error); }
}

window.abrirEdicao = function(id, tipo, dataIso) {
    const modal = document.getElementById("modal-editar");
    modal.style.display = "block";
    
    document.getElementById("editBatidaId").value = id;
    document.getElementById("editTipo").value = tipo;
    
    const d = new Date(dataIso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    document.getElementById("editData").value = d.toISOString().slice(0, 16);
    
    modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ==========================================
// RELATÓRIOS FINANCEIROS & REGRAS DE JORNADA
// ==========================================
async function gerarRelatorio() {
    const container = document.getElementById("container-relatorio");
    if (!container) return;

    const inputInicio = document.getElementById("dataInicioRelatorio").value;
    const inputFim = document.getElementById("dataFimRelatorio").value;
    
    if (!inputInicio || !inputFim) {
        alert("Por favor, selecione as datas de início e fim.");
        return;
    }

    let inicio = new Date(inputInicio + "T00:00:00");
    let fim = new Date(inputFim + "T23:59:59");
    
    // Regra da Tolerância de Madrugada: Busca batidas até 14 horas após o fim do domingo
    const limiteTolerancia = new Date(fim.getTime() + (14 * 60 * 60 * 1000));
    
    let horasEsperadasNoPeriodo = 0;
    const jornadaSemanal = [7, 6, 0, 6, 6, 9.5, 9.5]; // Escala customizada TH Company
    
    let dataAtualLoop = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const dataFimLoop = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());

    while (dataAtualLoop <= dataFimLoop) {
        horasEsperadasNoPeriodo += jornadaSemanal[dataAtualLoop.getDay()];
        dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
    }

    try {
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

        let html = `<div style="margin-bottom:15px; color:var(--text-muted); font-size:0.9rem;">
                        Fechamento de: <strong style="color:white;">${inicio.toLocaleDateString("pt-BR")}</strong> a <strong style="color:white;">${fim.toLocaleDateString("pt-BR")}</strong>
                    </div>
                    <div class="table-wrapper">
                    <table>
                    <tr>
                        <th>Colaborador</th>
                        <th>Trabalhadas</th>
                        <th>Carga Prevista</th>
                        <th>Status / Fechamento</th>
                    </tr>`;

        for (const uid in horasPorUsuario) {
            const pontos = horasPorUsuario[uid];
            pontos.sort((a, b) => a.data - b.data); 

            let totalMS = 0;
            let entradaAtiva = null;

            pontos.forEach((p) => {
                if (p.tipo === "Entrada") {
                    if (p.data <= fim) { entradaAtiva = p.data; }
                } else if (p.tipo === "Saída" && entradaAtiva) {
                    totalMS += (p.data - entradaAtiva);
                    entradaAtiva = null; 
                }
            });

            const totalHorasDecimal = totalMS / (1000 * 60 * 60);
            const totalHoras = totalHorasDecimal.toFixed(2);
            let htmlSaldo = "";
            
            if (totalHorasDecimal > horasEsperadasNoPeriodo) {
                const excedente = totalHorasDecimal - horasEsperadasNoPeriodo;
                const valorReais = (excedente * 11).toFixed(2).replace('.', ',');
                htmlSaldo = `<span class="badge badge-positivo">+ ${excedente.toFixed(2)}h (R$ ${valorReais})</span>`;
            } else if (totalHorasDecimal < horasEsperadasNoPeriodo && horasEsperadasNoPeriodo > 0) {
                const debito = horasEsperadasNoPeriodo - totalHorasDecimal;
                htmlSaldo = `<span class="badge badge-negativo">- ${debito.toFixed(2)}h pendentes</span>`;
            } else {
                htmlSaldo = `<span class="badge badge-neutro">Carga Exata</span>`;
            }

            html += `<tr>
                        <td style="font-weight: 500; color: #fff;">${usuariosMap[uid]}</td>
                        <td><strong style="color: var(--accent-color);">${totalHoras} hrs</strong></td>
                        <td style="color: var(--text-muted);">${horasEsperadasNoPeriodo.toFixed(2)} hrs</td>
                        <td>${htmlSaldo}</td>
                     </tr>`;
        }
        html += `</table></div>`;
        container.innerHTML = html;
    } catch (error) { console.error(error); }
}
