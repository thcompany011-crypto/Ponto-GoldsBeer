import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);

// === LÓGICA DE LOGIN (login.html) ===
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('senha').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = "dashboard.html";
        } catch (error) {
            alert("Erro no login: " + error.message);
        }
    });
}

// === LÓGICA DE CADASTRO (dashboard.html) ===
export async function cadastrarColaborador(nome, email, senha) {
    // Cria uma app secundária temporária para não deslogar o Admin
    const configAtual = app.options;
    const secondaryApp = initializeApp(configAtual, "SecondaryApp_" + Math.random().toString(36).substring(7));
    const secondaryAuth = getAuth(secondaryApp);

    try {
        // Cria o usuário na autenticação
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
        const novoUsuario = userCredential.user;

        // Salva o perfil no banco de dados
       await setDoc(doc(db, "usuarios", userCredential.user.uid), {
    nome: nome,
    email: email,
    role: "colaborador" // ou "admin"
});

        // Faz o logout da instância secundária para limpar a memória
        await signOut(secondaryAuth);
        
        return { sucesso: true };
    } catch (error) {
        console.error("Erro ao cadastrar colaborador:", error);
        throw error;
    }
}
