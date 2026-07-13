import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { app } from "./firebase.js";

const auth = getAuth(app);

// Seleciona o formulário de login no arquivo login.html
const formLogin = document.getElementById('formLogin');

if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault(); // Impede que a página recarregue ao clicar em ENTRAR

        const email = document.getElementById('email').value;
        const password = document.getElementById('senha').value; 
        const msgErro = document.getElementById('msgErro');

        try {
            // Tenta logar no Firebase
            await signInWithEmailAndPassword(auth, email, password);
            
            // Se o login for bem-sucedido, redireciona para a página principal
            // Verifique se o nome do seu arquivo principal é index.html ou dashboard.html
            window.location.href = "index.html"; 
        } catch (error) {
            console.error("Erro no login:", error);
            // Se houver erro, exibe a mensagem de erro que já está no HTML
            if (msgErro) {
                msgErro.style.display = "block";
            }
        }
    });
}

