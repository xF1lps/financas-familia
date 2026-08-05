import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, deleteDoc, doc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const totalGuardadoEl = document.getElementById("total-guardado");
    const listaGuardado = document.getElementById("lista-guardado");
    const guardadoVazio = document.getElementById("guardado-vazio");

    let uidAtual = null;

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        escutarGuardado();
    });

    function escutarGuardado() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, where("categoria", "==", "Guardar Dinheiro"), orderBy("data", "desc"));

        onSnapshot(consulta, (snapshot) => {
            let total = 0;
            listaGuardado.innerHTML = "";
            guardadoVazio.hidden = snapshot.docs.length > 0;

            snapshot.docs.forEach((documento) => {
                const dados = documento.data();
                total += dados.valor;

                const dataObj = dados.data.toDate();
                const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

                const item = document.createElement("li");
                item.className = "item-lancamento tipo-ganho";
                item.innerHTML = `
                    <span class="ponto-categoria"></span>
                    <div class="info-lancamento">
                        <div class="descricao-lancamento">${dados.descricao || "Guardado"}</div>
                        <div class="meta-lancamento">${dataFormatada}</div>
                    </div>
                    <span class="valor-lancamento">+ ${formatarMoeda(dados.valor)}</span>
                    <button class="botao-excluir" data-id="${documento.id}" aria-label="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                `;
                listaGuardado.appendChild(item);
            });

            totalGuardadoEl.textContent = formatarMoeda(total);
        });
    }

    listaGuardado.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;
        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
    });

    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
