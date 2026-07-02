import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { cadastrarColaborador } from "./auth.js";
import { registrarPonto } from "./ponto.js";

const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Proteção de Rota e Controle de Visibilidade
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            // Se não houver usuário logado, manda de volta pro login
            window.location.href = "login.html";
            return;
        }

        try {
            // Busca o perfil do usuário logado no Firestore
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");

            if (userDoc.exists() && userDoc.data().role === "admin") {
                secaoCadastro.style.display = "block"; // Mostra para Admin
            } else {
                secaoCadastro.style.display = "none";  // Esconde para Colaborador
            }
        } catch (error) {
            console.error("Erro ao verificar perfil:", error);
        }
    });

    // 2. Conectar os botões de Bater Ponto
    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");

    if (btnEntrada) {
        btnEntrada.addEventListener("click", () => registrarPonto("Entrada"));
    }
    if (btnSaida) {
        btnSaida.addEventListener("click", () => registrarPonto("Saída"));
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
                alert("Processando cadastro, aguarde...");
                await cadastrarColaborador(nome, email, senha);
                alert(`Colaborador ${nome} cadastrado com sucesso!`);
                formCadastro.reset(); 
            } catch (error) {
                alert("Erro ao cadastrar: " + error.message);
            }
        });
    }
});
