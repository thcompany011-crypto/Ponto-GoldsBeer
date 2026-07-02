import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { cadastrarColaborador } from "./auth.js";
import { registrarPonto } from "./ponto.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Variável global para guardar o ID do usuário após o login
let usuarioLogadoUid = null;

document.addEventListener("DOMContentLoaded", () => {
    
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        // Armazena o ID aqui
        usuarioLogadoUid = user.uid;

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");

            if (userDoc.exists() && userDoc.data().role === "admin") {
                secaoCadastro.style.display = "block"; 
            }

            carregarHistorico(usuarioLogadoUid);

        } catch (error) {
            console.error("Erro ao carregar painel:", error);
        }
    });

    // Agora usamos a variável global usuarioLogadoUid
    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");

    if (btnEntrada) {
        btnEntrada.addEventListener("click", async () => {
            if(usuarioLogadoUid) {
                await registrarPonto("Entrada", usuarioLogadoUid);
                carregarHistorico(usuarioLogadoUid);
            } else {
                alert("Aguarde o carregamento do sistema...");
            }
        });
    }
    if (btnSaida) {
        btnSaida.addEventListener("click", async () => {
            if(usuarioLogadoUid) {
                await registrarPonto("Saída", usuarioLogadoUid);
                carregarHistorico(usuarioLogadoUid);
            } else {
                alert("Aguarde o carregamento do sistema...");
            }
        });
    }

    // ... (o restante do seu código do formCadastro continua igual)
    const formCadastro = document.getElementById("form-cadastro-colaborador");
    if (formCadastro) {
        formCadastro.addEventListener("submit", async (e) => {
            e.preventDefault(); 
            const nome = document.getElementById("cad-nome").value;
            const email = document.getElementById("cad-email").value;
            const senha = document.getElementById("cad-senha").value;

            try {
                alert("Processando...");
                await cadastrarColaborador(nome, email, senha);
                alert("Sucesso!");
                formCadastro.reset(); 
            } catch (error) {
                alert("Erro: " + error.message);
            }
        });
    }
});

async function carregarHistorico(uid) {
    // ... (sua função carregarHistorico pode continuar exatamente como está)
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;

    try {
        const q = query(collection(db, "batidas"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 
        
        if (querySnapshot.empty) {
            lista.innerHTML = "<li style='padding:10px;'>Nenhum ponto registrado.</li>";
            return;
        }

        const pontos = [];
        querySnapshot.forEach((doc) => pontos.push(doc.data()));
        pontos.sort((a, b) => new Date(b.data) - new Date(a.data));

        pontos.forEach((ponto) => {
            const dataFormatada = new Date(ponto.data).toLocaleString("pt-BR");
            const li = document.createElement("li");
            li.style.padding = "10px";
            li.style.borderBottom = "1px solid #333";
            const cor = ponto.tipo === "Entrada" ? "#28a745" : "#dc3545";
            li.innerHTML = `<strong style="color: ${cor};">${ponto.tipo}</strong>: <br> ${dataFormatada}`;
            lista.appendChild(li);
        });
    } catch (error) {
        console.error(error);
    }
}
