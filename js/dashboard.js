import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { registrarPonto } from "./ponto.js";

const auth = getAuth(app);
const db = getFirestore(app);
let usuarioLogadoUid = null;
let usuariosMap = {}; 

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = "login.html"; return; }
        usuarioLogadoUid = user.uid;

        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");
            const painelAvancado = document.getElementById("painel-avancado-admin");

            // --- LOGS DE DIAGNÓSTICO ---
            console.log("Seu UID de login atual é:", user.uid);
            console.log("Seu e-mail de login atual é:", user.email);
            console.log("O usuário existe no banco?", userDoc.exists());
            if (userDoc.exists()) {
                console.log("Dados que vieram do banco:", userDoc.data());
            }
            // ---------------------------

            // VERIFICAÇÃO DUPLA: Se o cargo for admin OU se for o seu e-mail específico de administrador
            const ehAdminNoBanco = userDoc.exists() && userDoc.data().cargo === "admin";
            const ehEmailAdminMaster = user.email === "thcompany011@gmail.com";

            if (ehAdminNoBanco || ehEmailAdminMaster) {
                console.log("✅ Sistema reconheceu como ADMIN!"); 
                if (secaoCadastro) secaoCadastro.style.display = "block";
                if (painelAvancado) painelAvancado.style.display = "flex"; 
                
                await mapearUsuarios();
                popularSelectColaboradores();
                carregarPainelAdmin();
            } else {
                console.log("👤 Sistema reconheceu como COLABORADOR!"); 
                if (secaoCadastro) secaoCadastro.style.display = "none";
                if (painelAvancado) painelAvancado.style.display = "none";
            }
            carregarHistorico(usuarioLogadoUid);
        } catch (error) { console.error("Erro no dashboard:", error); }
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

            if (!colabUid || !dataHora) { alert("Preencha todos os campos do registro manual."); return; }

            await registrarPonto(tipo, colabUid, dataHora);
            carregarPainelAdmin();
            if (colabUid === usuarioLogadoUid) carregarHistorico(usuarioLogadoUid);
        });
    }

    const btnGerarRelatorio = document.getElementById("btnGerarRelatorio");
    if (btnGerarRelatorio) {
        btnGerarRelatorio.addEventListener("click", () => gerarRelatorioSemanal());
    }
});

async function mapearUsuarios() {
    const querySnapshot = await getDocs(collection(db, "usuarios"));
    usuariosMap = {};
    querySnapshot.forEach((doc) => {
        usuariosMap[doc.id] = doc.data().nome || doc.data().email;
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

async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;
    try {
        const q = query(collection(db, "batidas"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 
        const pontos = [];
        querySnapshot.forEach((doc) => pontos.push(doc.data()));
        pontos.sort((a, b) => new Date(b.data) - new Date(a.data));
        pontos.forEach((ponto) => {
            const li = document.createElement("li");
            li.innerHTML = `<strong>${ponto.tipo}</strong>: ${new Date(ponto.data).toLocaleString("pt-BR")}`;
            lista.appendChild(li);
        });
    } catch (error) { console.error(error); }
}

async function carregarPainelAdmin() {
    const listaGeral = document.getElementById("lista-geral-pontos");
    if (!listaGeral) return;
    try {
        const querySnapshot = await getDocs(collection(db, "batidas"));
        listaGeral.innerHTML = "";
        const todosPontos = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            todosPontos.push({
                nome: usuariosMap[data.uid] || "Desconhecido",
                tipo: data.tipo,
                data: data.data
            });
        });
        todosPontos.sort((a, b) => new Date(b.data) - new Date(a.data));
        todosPontos.forEach((ponto) => {
            const li = document.createElement("li");
            li.style.borderBottom = "1px solid #333";
            li.style.padding = "5px 0";
            li.innerHTML = `<span style="color: #3498db;">${ponto.nome}</span> - <strong>${ponto.tipo}</strong>: ${new Date(ponto.data).toLocaleString("pt-BR")}`;
            listaGeral.appendChild(li);
        });
    } catch (error) { console.error(error); }
}

function obterIntervaloSemanal() {
    const hoje = new Date();
    const diaSemana = hoje.getDay(); 
    
    let diasParaAtras = diaSemana - 3; 
    if (diasParaAtras < 0) diasParaAtras += 7; 
    
    const quartaFeira = new Date(hoje);
    quartaFeira.setDate(hoje.getDate() - diasParaAtras);
    quartaFeira.setHours(0, 0, 0, 0);
    
    const tercaFeira = new Date(quartaFeira);
    tercaFeira.setDate(quartaFeira.getDate() + 6);
    tercaFeira.setHours(23, 59, 59, 999);
    
    return { inicio: quartaFeira, fim: tercaFeira };
}

async function gerarRelatorioSemanal() {
    const container = document.getElementById("container-relatorio");
    if (!container) return;
    try {
        const querySnapshot = await getDocs(collection(db, "batidas"));
        const { inicio, fim } = obterIntervaloSemanal();
        const horasPorUsuario = {};

        Object.keys(usuariosMap).forEach(uid => horasPorUsuario[uid] = []);

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dataPonto = new Date(data.data);
            if (dataPonto >= inicio && dataPonto <= fim) {
                if (horasPorUsuario[data.uid]) horasPorUsuario[data.uid].push({ tipo: data.tipo, data: dataPonto });
            }
        });

        let html = `<table border="1" style="width:100%; border-collapse:collapse; background:#222; color:white; text-align:left;">
                    <tr style="background:#444;"><th style="padding:8px;">Colaborador</th><th style="padding:8px;">Horas Trabalhadas</th></tr>`;

        for (const uid in horasPorUsuario) {
            const pontos = horasPorUsuario[uid];
            pontos.sort((a, b) => a.data - b.data); 

            let totalMS = 0;
            let entradaAtiva = null;

            pontos.forEach((p) => {
                if (p.tipo === "Entrada") entradaAtiva = p.data;
                else if (p.tipo === "Saída" && entradaAtiva) {
                    totalMS += (p.data - entradaAtiva);
                    entradaAtiva = null;
                }
            });

            const totalHoras = (totalMS / (1000 * 60 * 60)).toFixed(2);
            html += `<tr><td style="padding:8px;">${usuariosMap[uid]}</td><td style="padding:8px;"><strong>${totalHoras} hrs</strong></td></tr>`;
        }
        html += `</table>`;
        container.innerHTML = `<h4>Período: ${inicio.toLocaleDateString("pt-BR")} até ${fim.toLocaleDateString("pt-BR")} (Terça)</h4>` + html;
    } catch (error) { console.error(error); }
}
