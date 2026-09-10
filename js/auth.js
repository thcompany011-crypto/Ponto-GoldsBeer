import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";

// Observação: o fluxo de LOGIN do sistema vive em js/login.js (usado por login.html).
// Este arquivo cuida apenas do CADASTRO de novos colaboradores pelo painel admin.

const db = getFirestore(app);

/**
 * Cadastra um novo colaborador (ou admin) sem deslogar o usuário admin atual.
 * Cria uma instância secundária e temporária do Firebase Auth só para o signup.
 *
 * @param {string} nome
 * @param {string} email
 * @param {string} senha
 * @param {"colaborador"|"admin"} cargo
 * @param {number[]} jornadaSemanal - array de 7 posições (Dom..Sáb) com horas previstas por dia
 * @param {number} valorHoraExtra - valor base da hora normal, usado para calcular horas extras
 */
export async function cadastrarColaborador(nome, email, senha, cargo = "colaborador", jornadaSemanal = [0, 8, 8, 8, 8, 8, 0], valorHoraExtra = 0) {
    const configAtual = app.options;
    const secondaryApp = initializeApp(configAtual, "SecondaryApp_" + Math.random().toString(36).substring(7));
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, senha);

        // IMPORTANTE: o campo usado para checar admin em TODO o sistema (client E firestore.rules)
        // é "cargo". Não usar mais "role" para evitar o bug de permissão silenciosa.
        await setDoc(doc(db, "usuarios", userCredential.user.uid), {
            nome: nome,
            email: email,
            cargo: cargo,
            jornadaSemanal: jornadaSemanal,
            valorHoraExtra: Number(valorHoraExtra) || 0,
            ativo: true,
            criadoEm: new Date().toISOString()
        });

        await signOut(secondaryAuth);

        return { sucesso: true, uid: userCredential.user.uid };
    } catch (error) {
        console.error("Erro ao cadastrar colaborador:", error);
        throw error;
    }
}
