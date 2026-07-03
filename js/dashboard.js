import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";
import { registrarPonto } from "./ponto.js"; // Importação única

const auth = getAuth(app);
const db = getFirestore(app);
let usuarioLogadoUid = null;

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = "login.html"; return; }
        usuarioLogadoUid = user.uid;

        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));
            const secaoCadastro = document.getElementById("secao-cadastro-admin");

            if (userDoc.exists() && userDoc.data().role === "admin") {
                secaoCadastro.style.display = "block";
            } else {
                secaoCadastro.style.display = "none";
            }
            carregarHistorico(usuarioLogadoUid);
        } catch (error) { console.error(error); }
    });

    const btnEntrada = document.getElementById("btnEntrada");
    const btnSaida = document.getElementById("btnSaida");

    if (btnEntrada) btnEntrada.addEventListener("click", () => registrarPonto("Entrada", usuarioLogadoUid).then(() => carregarHistorico(usuarioLogadoUid)));
    if (btnSaida) btnSaida.addEventListener("click", () => registrarPonto("Saída", usuarioLogadoUid).then(() => carregarHistorico(usuarioLogadoUid)));
});

async function carregarHistorico(uid) {
    const lista = document.getElementById("lista-pontos");
    if (!lista) return;

    try {
        const q = query(collection(db, "batidas"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        lista.innerHTML = ""; 
        
        if (querySnapshot.empty) { lista.innerHTML = "<li>Nenhum ponto registrado.</li>"; return; }

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
