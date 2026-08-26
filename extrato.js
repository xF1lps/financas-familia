import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const listaExtrato = document.getElementById("lista-extrato");
    const toast = document.getElementById("toast");
    const toastMensagem = document.getElementById("toast-mensagem");
    const toastBotaoAcao = document.getElementById("toast-botao-acao");
    const extratoVazio = document.getElementById("extrato-vazio");
    const filtroMes = document.getElementById("filtro-mes");
    const filtroValor = document.getElementById("filtro-valor");
    const filtroTexto = document.getElementById("filtro-texto");
    const limparFiltroMes = document.getElementById("limpar-filtro-mes");

    let uidAtual = null;
    let todosOsLancamentos = []; // guarda tudo que veio do Firestore, sem filtro

    // Se a pessoa chegou aqui pelo link "Ver extrato completo" da tela inicial,
    // a URL já vem com ?mes=2026-08 — pré-preenche o filtro de mês com isso.
    // Se veio de um clique no gráfico da tela inicial, também vem ?categoria=X
    const parametros = new URLSearchParams(window.location.search);
    const mesDaUrl = parametros.get("mes");
    if (mesDaUrl) filtroMes.value = mesDaUrl;

    const categoriaDaUrl = parametros.get("categoria");
    if (categoriaDaUrl) filtroTexto.value = categoriaDaUrl;

    // Remove acentos, pra "salario" encontrar "Salário" e vice-versa
    function removerAcentos(texto) {
        return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
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
    filtroTexto.addEventListener("input", aplicarFiltrosERenderizar);

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

        const textoBuscado = removerAcentos(filtroTexto.value.trim().toLowerCase());
        if (textoBuscado) {
            filtrados = filtrados.filter((documento) => {
                const dados = documento.data();
                const campos = removerAcentos([dados.descricao, dados.categoria, dados.meta].filter(Boolean).join(" ").toLowerCase());
                return campos.includes(textoBuscado);
            });
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
            item.className = `item-lancamento tipo-${dados.tipo}${dados.categoria === "Guardar Dinheiro" ? " tipo-cofre" : ""}`;
            item._dadosOriginais = dados;

            const ehCofrinho = dados.categoria === "Guardar Dinheiro";
            const tituloGrande = ehCofrinho
                ? (dados.meta || "Guardado")
                : (dados.descricao || dados.categoria);

            item.innerHTML = `
                <span class="ponto-categoria"></span>
                <div class="info-lancamento">
                    <div class="descricao-lancamento">${tituloGrande}</div>
                    <div class="meta-lancamento">${dados.categoria} · ${dataFormatada} às ${horaFormatada}</div>
                </div>
                <span class="valor-lancamento">${sinal} ${formatarMoeda(dados.valor)}</span>
                <button class="botao-excluir" data-id="${documento.id}" data-categoria="${dados.categoria}" aria-label="Excluir lançamento">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                    </svg>
                </button>
            `;
            listaExtrato.appendChild(item);
        });
    }

    let timeoutToast = null;

    function mostrarToastComAcao(mensagem, textoBotao, aoClicar, duracaoMs = 5000) {
        if (timeoutToast) clearTimeout(timeoutToast);
        toastMensagem.textContent = mensagem;
        toastBotaoAcao.textContent = textoBotao;
        toastBotaoAcao.hidden = false;
        toastBotaoAcao.onclick = () => {
            clearTimeout(timeoutToast);
            toast.hidden = true;
            aoClicar();
        };
        toast.hidden = false;
        timeoutToast = setTimeout(() => { toast.hidden = true; }, duracaoMs);
    }

    listaExtrato.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;

        // Itens do cofrinho ("Guardar Dinheiro") só podem ser excluídos pela
        // tela "Saldo Guardado" — evita desbalancear o total guardado
        if (botao.dataset.categoria === "Guardar Dinheiro") {
            window.alert("Esse lançamento faz parte do seu Saldo Guardado. Pra excluir ou ajustar, vai em Saldo Guardado no menu lateral.");
            return;
        }

        const confirmou = window.confirm("Tem certeza de que deseja excluir este lançamento?");
        if (!confirmou) return;

        const itemPai = botao.closest(".item-lancamento");
        const dadosParaDesfazer = itemPai && itemPai._dadosOriginais ? { ...itemPai._dadosOriginais } : null;

        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));

        if (dadosParaDesfazer) {
            mostrarToastComAcao("Lançamento excluído.", "Desfazer", async () => {
                await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                    tipo: dadosParaDesfazer.tipo,
                    valor: dadosParaDesfazer.valor,
                    categoria: dadosParaDesfazer.categoria,
                    descricao: dadosParaDesfazer.descricao || "",
                    data: dadosParaDesfazer.data,
                    criadoEm: serverTimestamp()
                });
            });
        }
    });

    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
