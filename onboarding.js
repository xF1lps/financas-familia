import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const formulario = document.getElementById("formulario-onboarding");
    const campoNome = document.getElementById("campo-nome");
    const campoIdade = document.getElementById("campo-idade");
    const listaProfissoes = document.getElementById("lista-profissoes");
    const mensagemAviso = document.getElementById("mensagem-aviso");
    const botaoEnviar = document.getElementById("botao-enviar");
    const textoBotao = botaoEnviar.querySelector(".texto-botao");
    const spinnerBotao = botaoEnviar.querySelector(".spinner-botao");

    let uidAtual = null;
    const telaCarregamento = document.getElementById("tela-carregamento");

    // Limita a seleção a no máximo 2 profissões marcadas ao mesmo tempo:
    // quando já tem 2 marcadas, desativa as demais até uma ser desmarcada.
    const checkboxesProfissao = listaProfissoes.querySelectorAll("input[type=checkbox]");
    checkboxesProfissao.forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const marcados = listaProfissoes.querySelectorAll("input[type=checkbox]:checked");
            const atingiuLimite = marcados.length >= 2;

            checkboxesProfissao.forEach((outro) => {
                if (!outro.checked) {
                    outro.disabled = atingiuLimite;
                }
            });
        });
    });

    // Sem login, não tem como preencher onboarding — manda pra tela de login
    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        telaCarregamento.classList.add("oculto");
    });

    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        mensagemAviso.classList.remove("visivel");

        const nome = campoNome.value.trim();
        const idade = parseInt(campoIdade.value, 10);

        // Pega todas as caixinhas marcadas e monta uma lista com os valores delas
        const checkboxesMarcados = listaProfissoes.querySelectorAll("input[type=checkbox]:checked");
        const profissoes = Array.from(checkboxesMarcados).map((checkbox) => checkbox.value);

        if (!nome || !idade) {
            mensagemAviso.textContent = "Preenche nome e idade pra continuar.";
            mensagemAviso.classList.add("visivel");
            return;
        }

        if (profissoes.length === 0) {
            mensagemAviso.textContent = "Marca pelo menos uma profissão.";
            mensagemAviso.classList.add("visivel");
            return;
        }

        botaoEnviar.disabled = true;
        spinnerBotao.hidden = false;
        textoBotao.style.opacity = "0.7";

        try {
            // "renda" vira "diaria" se Diarista estiver entre as marcadas (mesmo
            // combinada com outras profissões), senão fica "mensal". O dashboard
            // usa esse campo pra decidir se libera o fluxo de ganho diário.
            const renda = profissoes.includes("Diarista") ? "diaria" : "mensal";

            await setDoc(doc(db, "usuarios", uidAtual), {
                nome,
                idade,
                profissoes,
                renda,
                onboardingCompleto: true,
                atualizadoEm: serverTimestamp()
            }, { merge: true });

            window.location.href = "dashboard.html";

        } catch (erro) {
            mensagemAviso.textContent = "Não deu pra salvar agora. Tenta de novo.";
            mensagemAviso.classList.add("visivel");
            botaoEnviar.disabled = false;
            spinnerBotao.hidden = true;
            textoBotao.style.opacity = "1";
        }
    });

});
