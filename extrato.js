import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, deleteDoc, doc, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const telaCarregamento = document.getElementById("tela-carregamento");
    const listaExtrato = document.getElementById("lista-extrato");
    const extratoVazio = document.getElementById("extrato-vazio");
    const filtroMes = document.getElementById("filtro-mes");
    const filtroValor = document.getElementById("filtro-valor");
    const limparFiltroMes = document.getElementById("limpar-filtro-mes");

    let uidAtual = null;
    let todosOsLancamentos = []; // guarda tudo que veio do Firestore, sem filtro

    // Se a pessoa chegou aqui pelo link "Ver extrato completo" da tela inicial,
    // a URL já vem com ?mes=2026-08 — pré-preenche o filtro de mês com isso
    const parametros = new URLSearchParams(window.location.search);
    const mesDaUrl = parametros.get("mes");
    if (mesDaUrl) filtroMes.value = mesDaUrl;

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
            todosOsLancamentos = snapshot.docs;
            aplicarFiltrosERenderizar();
        });
    }

    // ==========================================================================
    // FILTROS — por mês (input type=month) e por valor (busca numérica)
    // ==========================================================================
    filtroMes.addEventListener("change", aplicarFiltrosERenderizar);
    filtroValor.addEventListener("input", aplicarFiltrosERenderizar);

    limparFiltroMes.addEventListener("click", () => {
        filtroMes.value = "";
        aplicarFiltrosERenderizar();
    });

    function aplicarFiltrosERenderizar() {
        // A "Retirada" (valor negativo em "Guardar Dinheiro") é só um registro
        // interno de controle do cofrinho — não aparece pra pessoa em lugar
        // nenhum das listas normais, só a "Retirada da Reserva" (verde) aparece
        let filtrados = todosOsLancamentos.filter(
            (documento) => !(documento.data().categoria === "Guardar Dinheiro" && documento.data().valor < 0)
        );

        if (filtroMes.value) {
            const [anoFiltro, mesFiltro] = filtroMes.value.split("-").map(Number);
            filtrados = filtrados.filter((documento) => {
                const dataObj = documento.data().data.toDate();
                return dataObj.getFullYear() === anoFiltro && (dataObj.getMonth() + 1) === mesFiltro;
            });
        }

        if (filtroValor.value) {
            const valorBuscado = parseFloat(filtroValor.value);
            if (!isNaN(valorBuscado)) {
                filtrados = filtrados.filter((documento) => {
                    const valorLancamento = documento.data().valor;
                    // Compara arredondado a 2 casas, pra bater com o que a pessoa digitou
                    return Math.round(valorLancamento * 100) === Math.round(valorBuscado * 100);
                });
            }
        }

        renderizarLista(filtrados);
    }

    // ==========================================================================
    // RENDERIZAÇÃO
    // ==========================================================================
    function renderizarLista(documentos) {
        listaExtrato.innerHTML = "";
        extratoVazio.hidden = documentos.length > 0;

        documentos.forEach((documento) => {
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
    }

    listaExtrato.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;
        const confirmou = window.confirm("Tem certeza de que deseja excluir este lançamento?");
        if (!confirmou) return;
        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
    });

    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
