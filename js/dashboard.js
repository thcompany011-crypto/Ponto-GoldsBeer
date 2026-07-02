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
            // Verifica o perfil para mostrar a tela de Admin
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");

            if (userDoc.exists() && userDoc.data().role === "admin") {
                secaoCadastro.style.display = "block"; // Revela apenas se for Admin
            }

            // Carrega a lista de pontos do usuário logado
            carregarHistorico(user.uid);

        } catch (error) {
            console.error("Erro ao carregar painel:", error);
        }
    });

    // 2. Conectar os botões de Bater Ponto
    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");

    if (btnEntrada) {
        btnEntrada.addEventListener("click", async () => {
            await registrarPonto("Entrada");
            carregarHistorico(auth.currentUser.uid); // Atualiza a lista na hora
        });
    }
    if (btnSaida) {
        btnSaida.addEventListener("click", async () => {
            await registrarPonto("Saída");
            carregarHistorico(auth.currentUser.uid); // Atualiza a lista na hora
        });
    }

    // 3. Lógica do Formulário de Cadastro (Apenas Admin verá)
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

// Função auxiliar para buscar e montar a lista de pontos na tela
async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;

    try {
        const q = query(collection(db, "batidas"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        
        lista.innerHTML = ""; // Limpa a mensagem de "Carregando..."
        
        if (querySnapshot.empty) {
            lista.innerHTML = "<li style='padding: 10px; border-bottom: 1px solid #333;'>Nenhum ponto registrado.</li>";
            return;
        }

        // Ordena os registros do mais recente para o mais antigo via JavaScript
        const pontos = [];
        querySnapshot.forEach((doc) => pontos.push(doc.data()));
        pontos.sort((a, b) => new Date(b.data) - new Date(a.data));

        pontos.forEach((ponto) => {
            const dataFormatada = new Date(ponto.data).toLocaleString("pt-BR");
            const li = document.createElement("li");
            li.style.padding = "10px";
            li.style.borderBottom = "1px solid #333";
            
            // Define a cor baseada no tipo (Verde para entrada, Vermelho para saída)
            const cor = ponto.tipo === "Entrada" ? "#28a745" : "#dc3545";
            li.innerHTML = `<strong style="color: ${cor};">${ponto.tipo}</strong>: <br> ${dataFormatada}`;
            
            lista.appendChild(li);
        });

    } catch (error) {
        lista.innerHTML = "<li>Erro ao buscar histórico.</li>";
        console.error(error);
    }
}
