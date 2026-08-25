import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const listaOrcamentos = document.getElementById("lista-orcamentos");
    const orcamentosVazio = document.getElementById("orcamentos-vazio");
    const botaoSalvar = document.getElementById("botao-salvar-orcamentos");
    const textoBotao = botaoSalvar.querySelector(".texto-botao");
    const spinnerBotao = botaoSalvar.querySelector(".spinner-botao");

    let uidAtual = null;

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        await carregarCategoriasEOrcamentos();
    });

    async function carregarCategoriasEOrcamentos() {
        // Categorias fixas de gasto + as que a própria pessoa criou
        const categorias = ["Outros"];
        const referenciaCategorias = collection(db, "usuarios", uidAtual, "categorias");
        const resultadoCategorias = await getDocs(referenciaCategorias);
        resultadoCategorias.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "gasto") categorias.push(dados.nome);
        });

        // Limites já configurados anteriormente
        const referenciaOrcamentos = collection(db, "usuarios", uidAtual, "orcamentos");
        const resultadoOrcamentos = await getDocs(referenciaOrcamentos);
        const limitesAtuais = {};
        resultadoOrcamentos.forEach((documento) => {
            limitesAtuais[documento.id] = documento.data().limite;
        });

        renderizarLista(categorias, limitesAtuais);
    }

    function renderizarLista(categorias, limitesAtuais) {
        listaOrcamentos.innerHTML = "";
        orcamentosVazio.hidden = categorias.length > 0;

        categorias.forEach((categoria) => {
            const idSeguro = categoria.replace(/[^a-zA-Z0-9]/g, "_");
            const limiteExistente = limitesAtuais[categoria];

            const item = document.createElement("li");
            item.className = "item-orcamento";
            item.innerHTML = `
                <span class="nome-categoria-orcamento">${categoria}</span>
                <div class="campo-limite-orcamento">
                    <span>R$</span>
                    <input type="number" min="0" step="0.01" placeholder="Sem limite"
                           data-categoria="${categoria}" id="limite-${idSeguro}"
                           value="${limiteExistente || ""}">
                </div>
            `;
            listaOrcamentos.appendChild(item);
        });
    }

    botaoSalvar.addEventListener("click", async () => {
        botaoSalvar.disabled = true;
        spinnerBotao.hidden = false;

        const campos = listaOrcamentos.querySelectorAll("input[data-categoria]");

        for (const campo of campos) {
            const categoria = campo.dataset.categoria;
            const valor = parseFloat(campo.value);
            const referenciaDoc = doc(db, "usuarios", uidAtual, "orcamentos", categoria);

            if (!valor || valor <= 0) {
                // Campo vazio ou zerado = sem limite pra essa categoria
                await deleteDoc(referenciaDoc).catch(() => {}); // ignora se não existia
            } else {
                await setDoc(referenciaDoc, { categoria, limite: valor });
            }
        }

        spinnerBotao.hidden = true;
        botaoSalvar.disabled = false;
        textoBotao.textContent = "Salvo!";
        setTimeout(() => { textoBotao.textContent = "Salvar limites"; }, 1800);
    });

});
