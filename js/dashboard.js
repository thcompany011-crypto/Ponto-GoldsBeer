import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { app } from "./firebase.js";
import { registrarPonto } from "./ponto.js";

const auth = getAuth(app);

document.getElementById('btnEntrada').addEventListener('click', () => registrarPonto('entrada'));
document.getElementById('btnSaida').addEventListener('click', () => registrarPonto('saida'));

// Adicionar um botão de sair para segurança
// Você pode adicionar <button id="logoutBtn">Sair</button> no dashboard.html se quiser

