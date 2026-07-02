import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { cadastrarColaborador } from "./auth.js";
import { registrarPonto } from "./ponto.js";

const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Controle de Visibilidade e Busca de Histórico
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");

            if (userDoc.exists() && userDoc.data().role === "admin") {
                secaoCadastro.style.display = "block"; 
            }

            carregarHistorico(user.uid);

        } catch (error) {
            console.error("Erro ao carregar painel:", error);
        }
    });

    // 2. Conectar os botões enviando o UID do usuário (NOVIDADE AQUI)
    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");

    if (btnEntrada) {
        btnEntrada.addEventListener("click", async () => {
            if(auth.currentUser) {
                await registrarPonto("Entrada", auth.currentUser.uid);
                carregarHistorico(auth.currentUser.uid);
            }
        });
    }
    if (btnSaida) {
        btnSaida.addEventListener("click", async () => {
            if(auth.currentUser) {
                await registrarPonto("Saída", auth.currentUser.uid);
                carregarHistorico(auth.currentUser.uid);
            }
        });
    }

    // 3. Lógica do Formulário de Cadastro
    const formCadastro = document.getElementById("form-cadastro-colaborador");
    if (formCadastro) {
        formCadastro.addEventListener("submit", async (e) => {
            e.preventDefault(); 
            const nome = document.getElementById("cad-nome").value;
            const email = document.getElementById("cad-email").value;
            const senha = document.getElementById("cad-senha").value;

            try {
                alert("Processando cadastro...");
                await cadastrarColaborador(nome, email, senha);
                alert(`Colaborador ${nome} cadastrado com sucesso!`);
                formCadastro.reset(); 
            } catch (error) {
                alert("Erro ao cadastrar: " + error.message);
            }
        });
    }
});

// 4. Função que busca o histórico
async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;

    try {
        const q = query(collection(db, "batidas"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        
        lista.innerHTML = ""; 
        
        if (querySnapshot.empty) {
            lista.innerHTML = "<li style='padding: 10px; border-bottom: 1px solid #333;'>Nenhum ponto registrado.</li>";
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
        lista.innerHTML = "<li>Erro ao buscar histórico.</li>";
        console.error(error);
    }
}
