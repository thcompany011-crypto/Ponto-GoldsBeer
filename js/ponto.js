import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { app } from "./firebase.js";

const db = getFirestore(app);
const auth = getAuth(app);

export const registrarPonto = async (tipo) => {
    const user = auth.currentUser;
    if (!user) {
        alert("Usuário não logado!");
        return;
    }

    try {
        await addDoc(collection(db, "batidas"), {
            uid: user.uid,
            tipo: tipo,
            data: new Date().toISOString()
        });
        alert("Ponto de " + tipo + " registrado com sucesso!");
    } catch (error) {
        alert("Erro ao registrar ponto: " + error.message);
    }
};

