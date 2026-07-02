import { cadastrarColaborador } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
    const formCadastro = document.getElementById("form-cadastro-colaborador");

    if (formCadastro) {
        formCadastro.addEventListener("submit", async (e) => {
            e.preventDefault(); // Evita que a página recarregue ao enviar o formulário

            const nome = document.getElementById("cad-nome").value;
            const email = document.getElementById("cad-email").value;
            const senha = document.getElementById("cad-senha").value;

            try {
                alert("Processando cadastro, aguarde...");
                
                await cadastrarColaborador(nome, email, senha);
                
                alert(`Colaborador ${nome} cadastrado com sucesso!`);
                formCadastro.reset(); // Limpa os campos após sucesso
                
            } catch (error) {
                alert("Erro ao cadastrar: " + error.message);
            }
        });
    }
});
