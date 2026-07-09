import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
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

            let dadosBanco = userDoc.exists() ? userDoc.data() : {};
            const ehAdminNoBanco = dadosBanco.cargo === "admin" || dadosBanco.role === "admin";
            const ehEmailAdminMaster = user.email === "thcompany011@gmail.com";

            if (ehAdminNoBanco || ehEmailAdminMaster) {
                if (secaoCadastro) secaoCadastro.style.display = "block";
                if (painelAvancado) painelAvancado.style.display = "flex"; 
                
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
        btnGerarRelatorio.addEventListener("click", () => gerarRelatorio());
    }

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

async function mapearUsuarios() {
    try {
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        usuariosMap = {};
        querySnapshot.forEach((doc) => {
            const dados = doc.data();
            usuariosMap[doc.id] = dados.nome || dados.email || `Usuário (${doc.id.substring(0, 5)})`;
        });
    } catch (error) {
        console.error("Erro de permissão ao buscar colaboradores.", error);
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
        
        todosPontos.sort((a, b) => new Date(a.data) - new Date(b.data)); // Mais recente primeiro
        
        todosPontos.forEach((ponto) => {
            const li = document.createElement("li");
            li.className = ponto.tipo === "Entrada" ? "is-entrada" : "is-saida";
            
            const infoTexto = document.createElement("div");
            infoTexto.
