import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, deleteDoc, doc, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const telaCarregamento = document.getElementById("tela-carregamento");
    const listaExtrato = document.getElementById("lista-extrato");
    const extratoVazio = document.getElementById("extrato-vazio");

    let uidAtual = null;

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        telaCarregamento.classList.add("oculto");
        escutarTodosOsLancamentos();
    });

    function escutarTodosOsLancamentos() {
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, orderBy("data", "desc"));

        onSnapshot(consulta, (snapshot) => {
            listaExtrato.innerHTML = "";
            extratoVazio.hidden = snapshot.docs.length > 0;

            snapshot.docs.forEach((documento) => {
                const dados = documento.data();
                const dataObj = dados.data.toDate();
                const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const horaFormatada = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
                const sinal = dados.tipo === "ganho" ? "+" : "-";

                const item = document.createElement("li");
                item.className = `item-lancamento tipo-${dados.tipo}`;
                item.innerHTML = `
                    <span class="ponto-categoria"></span>
                    <div class="info-lancamento">
                        <div class="descricao-lancamento">${dados.descricao || dados.categoria}</div>
                        <div class="meta-lancamento">${dados.categoria} · ${dataFormatada} às ${horaFormatada}</div>
                    </div>
                    <span class="valor-lancamento">${sinal} ${formatarMoeda(dados.valor)}</span>
                    <button class="botao-excluir" data-id="${documento.id}" aria-label="Excluir lançamento">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                `;
                listaExtrato.appendChild(item);
            });
        });
    }

    listaExtrato.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;
        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
    });

    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
