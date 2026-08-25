import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener("DOMContentLoaded", function () {

    const botaoSair = document.getElementById("botao-sair");

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
        }
    });

    botaoSair.addEventListener("click", async () => {
        const confirmou = window.confirm("Tem certeza de que deseja encerrar a sessão?");
        if (!confirmou) return;

        await signOut(auth);
        window.location.href = "index.html";
    });

});
