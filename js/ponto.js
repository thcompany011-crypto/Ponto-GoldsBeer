import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { app } from "./firebase.js";

const db = getFirestore(app);

export const registrarPonto = async (tipo, uid) => {
    try {
        await addDoc(collection(db, "batidas"), {
            uid: uid,
            tipo: tipo,
            data: new Date().toISOString()
        });
        alert("Ponto de " + tipo + " registrado com sucesso!");
    } catch (error) {
        console.error("Erro ao registrar ponto:", error);
        throw error;
    }
};
