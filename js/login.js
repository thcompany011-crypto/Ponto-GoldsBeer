import {
    getAuth,
    signInWithEmailAndPassword,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import { app } from "./firebase.js";


const auth = getAuth(app);


// =====================================================
// ELEMENTOS
// =====================================================

const formLogin =
    document.getElementById("formLogin");

const emailInput =
    document.getElementById("email");

const senhaInput =
    document.getElementById("senha");

const btnVerSenha =
    document.getElementById("btnVerSenha");

const btnAcesso =
    document.getElementById("btnAcesso");

const msgErro =
    document.getElementById("msgErro");


// REDEFINIÇÃO

const btnAbrirRedefinir =
    document.getElementById("btnAbrirRedefinir");

const btnCancelarRedefinir =
    document.getElementById("btnCancelarRedefinir");

const btnRedefinirSenha =
    document.getElementById("btnRedefinirSenha");

const areaRedefinirSenha =
    document.getElementById("areaRedefinirSenha");

const emailRedefinir =
    document.getElementById("emailRedefinir");

const msgRedefinir =
    document.getElementById("msgRedefinir");


// =====================================================
// MOSTRAR / OCULTAR SENHA
// =====================================================

if (btnVerSenha) {

    btnVerSenha.addEventListener("click", () => {

        if (senhaInput.type === "password") {

            // MOSTRAR
            senhaInput.type = "text";

            btnVerSenha.innerHTML =
                '<i class="fa-solid fa-eye-slash"></i>';

            btnVerSenha.title =
                "Ocultar senha";

            btnVerSenha.setAttribute(
                "aria-label",
                "Ocultar senha"
            );

        } else {

            // OCULTAR
            senhaInput.type = "password";

            btnVerSenha.innerHTML =
                '<i class="fa-solid fa-eye"></i>';

            btnVerSenha.title =
                "Mostrar senha";

            btnVerSenha.setAttribute(
                "aria-label",
                "Mostrar senha"
            );

        }

    });

}


// =====================================================
// LOGIN
// =====================================================

if (formLogin) {

    formLogin.addEventListener(
        "submit",
        async (e) => {

            e.preventDefault();


            const email =
                emailInput.value.trim();

            const password =
                senhaInput.value;


            // LIMPA ERRO

            msgErro.style.display = "none";


            // DESABILITA BOTÃO

            btnAcesso.disabled = true;

            btnAcesso.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> ENTRANDO...';


            try {

                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


                // LOGIN REALIZADO

                window.location.href =
                    "index.html";


            } catch (error) {

                console.error(
                    "Erro no login:",
                    error
                );


                // MOSTRA MENSAGEM

                msgErro.style.display =
                    "block";


                // Mensagens específicas

                if (
                    error.code ===
                    "auth/user-not-found"
                ) {

                    msgErro.textContent =
                        "Usuário não encontrado.";

                } else if (
                    error.code ===
                    "auth/wrong-password"
                ) {

                    msgErro.textContent =
                        "Senha incorreta.";

                } else if (
                    error.code ===
                    "auth/invalid-credential"
                ) {

                    msgErro.textContent =
                        "E-mail ou senha incorretos.";

                } else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    msgErro.textContent =
                        "Digite um e-mail válido.";

                } else if (
                    error.code ===
                    "auth/too-many-requests"
                ) {

                    msgErro.textContent =
                        "Muitas tentativas. Aguarde alguns minutos.";

                } else {

                    msgErro.textContent =
                        "Não foi possível realizar o login.";

                }

            } finally {

                btnAcesso.disabled = false;

                btnAcesso.innerHTML =
                    '<i class="fa-solid fa-right-to-bracket"></i> ENTRAR';

            }

        }
    );

}


// =====================================================
// ABRIR REDEFINIÇÃO DE SENHA
// =====================================================

if (btnAbrirRedefinir) {

    btnAbrirRedefinir.addEventListener(
        "click",
        () => {

            areaRedefinirSenha.classList.add(
                "ativo"
            );


            // Se já digitou o e-mail no login,
            // copia automaticamente para redefinição

            if (emailInput.value.trim() !== "") {

                emailRedefinir.value =
                    emailInput.value.trim();

            }


            emailRedefinir.focus();

        }
    );

}


// =====================================================
// CANCELAR REDEFINIÇÃO
// =====================================================

if (btnCancelarRedefinir) {

    btnCancelarRedefinir.addEventListener(
        "click",
        () => {

            areaRedefinirSenha.classList.remove(
                "ativo"
            );

            msgRedefinir.textContent = "";

        }
    );

}


// =====================================================
// REDEFINIR SENHA
// =====================================================

if (btnRedefinirSenha) {

    btnRedefinirSenha.addEventListener(
        "click",
        async () => {

            const email =
                emailRedefinir.value.trim();


            // LIMPA MENSAGEM

            msgRedefinir.textContent = "";

            msgRedefinir.className =
                "msg-redefinir";


            // VALIDA E-MAIL

            if (!email) {

                msgRedefinir.textContent =
                    "Digite seu e-mail.";

                msgRedefinir.classList.add(
                    "erro"
                );

                emailRedefinir.focus();

                return;
            }


            if (
                !email.includes("@") ||
                !email.includes(".")
            ) {

                msgRedefinir.textContent =
                    "Digite um e-mail válido.";

                msgRedefinir.classList.add(
                    "erro"
                );

                emailRedefinir.focus();

                return;
            }


            // DESABILITA BOTÃO

            btnRedefinirSenha.disabled =
                true;

            btnRedefinirSenha.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> ENVIANDO...';


            try {

                await sendPasswordResetEmail(
                    auth,
                    email
                );


                // SUCESSO

                msgRedefinir.textContent =
                    "Link enviado! Verifique sua caixa de entrada e também a pasta de spam.";

                msgRedefinir.classList.add(
                    "sucesso"
                );


                emailRedefinir.value = "";


            } catch (error) {

                console.error(
                    "Erro ao redefinir senha:",
                    error
                );


                if (
                    error.code ===
                    "auth/user-not-found"
                ) {

                    msgRedefinir.textContent =
                        "Não encontramos uma conta com esse e-mail.";

                } else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    msgRedefinir.textContent =
                        "Digite um e-mail válido.";

                } else {

                    msgRedefinir.textContent =
                        "Não foi possível enviar o link. Tente novamente.";

                }


                msgRedefinir.classList.add(
                    "erro"
                );

            } finally {

                btnRedefinirSenha.disabled =
                    false;

                btnRedefinirSenha.innerHTML =
                    '<i class="fa-solid fa-paper-plane"></i> ENVIAR LINK';

            }

        }
    );

}
