import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";

const db = getFirestore(app);

// Agora a função exige receber o UID de quem clicou no botão
export const registrarPonto = async (tipo, uid) => {
    if (!uid) {
        alert("Erro de comunicação: UID do usuário não foi enviado!");
        return;
    }

    try {
        await addDoc(collection(db, "batidas"), {
            uid: uid,
            tipo: tipo,
            data: new Date().toISOString()
        });
        alert("Ponto de " + tipo + " registrado com sucesso!");
    } catch (error) {
        alert("Erro ao registrar ponto: " + error.message);
    }
};
