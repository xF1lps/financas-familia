import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot,
    query, where, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

document.addEventListener("DOMContentLoaded", function () {

    const rotuloMes = document.getElementById("rotulo-mes");
    const mesAnteriorBtn = document.getElementById("mes-anterior");
    const mesProximoBtn = document.getElementById("mes-proximo");
    const anoAnteriorBtn = document.getElementById("ano-anterior");
    const anoProximoBtn = document.getElementById("ano-proximo");

    const saldoComLembretesEl = document.getElementById("saldo-com-lembretes");

    const listaAnotacoes = document.getElementById("lista-anotacoes");
    const anotacoesVazio = document.getElementById("anotacoes-vazio");

    const botaoAlternarSelecao = document.getElementById("botao-alternar-selecao");
    const barraSelecao = document.getElementById("barra-selecao");
    const contadorSelecao = document.getElementById("contador-selecao");
    const botaoExcluirSelecionados = document.getElementById("botao-excluir-selecionados");

    const botaoAbrirNovaAnotacao = document.getElementById("botao-abrir-nova-anotacao");
    const botaoFecharAnotacao = document.getElementById("botao-fechar-anotacao");
    const fundoModalAnotacao = document.getElementById("fundo-modal-anotacao");
    const campoNomeConta = document.getElementById("campo-nome-conta");
    const campoValorConta = document.getElementById("campo-valor-conta");
    const campoDiaVencimento = document.getElementById("campo-dia-vencimento");
    const mensagemAvisoAnotacao = document.getElementById("mensagem-aviso-anotacao");
    const botaoSalvarAnotacao = document.getElementById("botao-salvar-anotacao");
    const spinnerAnotacao = botaoSalvarAnotacao.querySelector(".spinner-botao");

    let uidAtual = null;
    let mesSelecionado = new Date();
    let modoSelecao = false;
    let ultimoTotalAnotacoes = 0; // usado pra recalcular o saldo quando o saldo real mudar

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        atualizarRotuloMes();
        escutarAnotacoesDoMes();
        escutarSaldoRealDoMes();
    });

    // ==========================================================================
    // NAVEGAÇÃO ENTRE MESES
    // ==========================================================================
    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;
    }

    function mudarPeriodo(mesesParaSomar) {
        mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + mesesParaSomar, 1);
        atualizarRotuloMes();
        sairDoModoSelecao();
        escutarAnotacoesDoMes();
        escutarSaldoRealDoMes();
    }

    mesAnteriorBtn.addEventListener("click", () => mudarPeriodo(-1));
    mesProximoBtn.addEventListener("click", () => mudarPeriodo(1));
    anoAnteriorBtn.addEventListener("click", () => mudarPeriodo(-12));
    anoProximoBtn.addEventListener("click", () => mudarPeriodo(12));

    function chaveDoMesSelecionado() {
        return `${mesSelecionado.getFullYear()}-${String(mesSelecionado.getMonth() + 1).padStart(2, "0")}`;
    }

    // ==========================================================================
    // SALDO REAL DO MÊS (mesma conta da tela inicial: ganhos - gastos,
    // ignorando "Guardar Dinheiro" nos depósitos que ainda não afetam saldo
    // real da mesma forma que o dashboard já faz)
    // ==========================================================================
    let pararDeEscutarSaldoReal = null;
    let saldoRealAtual = 0;

    function escutarSaldoRealDoMes() {
        if (pararDeEscutarSaldoReal) pararDeEscutarSaldoReal();

        const inicioMes = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth(), 1);
        const inicioProximoMes = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 1);

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(
            referencia,
            where("data", ">=", Timestamp.fromDate(inicioMes)),
            where("data", "<", Timestamp.fromDate(inicioProximoMes))
        );

        pararDeEscutarSaldoReal = onSnapshot(consulta, (snapshot) => {
            let totalGanhos = 0;
            let totalGastos = 0;

            snapshot.forEach((documento) => {
                const dados = documento.data();
                if (dados.categoria === "Guardar Dinheiro") {
                    if (dados.valor > 0) totalGastos += dados.valor;
                    return;
                }
                if (dados.tipo === "ganho") totalGanhos += dados.valor;
                else totalGastos += dados.valor;
            });

            saldoRealAtual = totalGanhos - totalGastos;
            atualizarSaldoExibido();
        });
    }

    function atualizarSaldoExibido() {
        const saldoFinal = saldoRealAtual - ultimoTotalAnotacoes;
        saldoComLembretesEl.textContent = formatarMoeda(saldoFinal);
    }

    // ==========================================================================
    // LEMBRETES DO MÊS SELECIONADO
    // ==========================================================================
    function escutarAnotacoesDoMes() {
        const referencia = collection(db, "usuarios", uidAtual, "anotacoes");
        const consulta = query(referencia, where("mesReferencia", "==", chaveDoMesSelecionado()));

        onSnapshot(consulta, (snapshot) => {
            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => a.data().diaVencimento - b.data().diaVencimento
            );

            ultimoTotalAnotacoes = documentosOrdenados.reduce((soma, documento) => soma + (documento.data().valor || 0), 0);
            atualizarSaldoExibido();

            renderizarAnotacoes(documentosOrdenados);
        });
    }

    function renderizarAnotacoes(documentos) {
        listaAnotacoes.innerHTML = "";
        anotacoesVazio.hidden = documentos.length > 0;

        documentos.forEach((documento) => {
            const dados = documento.data();
            const estaPaga = dados.pago === true;

            let dataCriacaoTexto = "";
            if (dados.criadoEm) {
                const dataCriacao = dados.criadoEm.toDate();
                const dataFormatada = dataCriacao.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const horaFormatada = dataCriacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
                dataCriacaoTexto = ` · Anotado em ${dataFormatada} às ${horaFormatada}`;
            }

            const item = document.createElement("li");
            item.className = "item-conta";
            item.dataset.id = documento.id;
            item.innerHTML = `
                ${modoSelecao ? `<input type="checkbox" class="checkbox-selecao" data-id="${documento.id}">` : ""}
                <div class="info-conta">
                    <div class="nome-conta">${dados.nome}</div>
                    <div class="meta-conta">Vence dia ${dados.diaVencimento}${dataCriacaoTexto}</div>
                </div>
                <span class="valor-conta">${formatarMoeda(dados.valor || 0)}</span>
                <div class="status-conta">
                    <button class="botao-marcar-pago ${estaPaga ? "pago" : ""}" data-id="${documento.id}" data-pago="${estaPaga}">
                        ${estaPaga ? "✓ Paga" : "Marcar como paga"}
                    </button>
                    <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir lembrete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                </div>
            `;
            listaAnotacoes.appendChild(item);
        });
    }

    // ==========================================================================
    // MODO SELEÇÃO MÚLTIPLA
    // ==========================================================================
    function entrarNoModoSelecao() {
        modoSelecao = true;
        botaoAlternarSelecao.textContent = "Cancelar";
        barraSelecao.hidden = false;
        atualizarContadorSelecao();
        escutarAnotacoesDoMes(); // re-renderiza já com os checkboxes
    }

    function sairDoModoSelecao() {
        modoSelecao = false;
        botaoAlternarSelecao.textContent = "Selecionar";
        barraSelecao.hidden = true;
    }

    botaoAlternarSelecao.addEventListener("click", () => {
        if (modoSelecao) {
            sairDoModoSelecao();
            escutarAnotacoesDoMes();
        } else {
            entrarNoModoSelecao();
        }
    });

    function atualizarContadorSelecao() {
        const marcados = listaAnotacoes.querySelectorAll(".checkbox-selecao:checked").length;
        contadorSelecao.textContent = `${marcados} selecionado${marcados === 1 ? "" : "s"}`;
    }

    listaAnotacoes.addEventListener("change", (evento) => {
        if (evento.target.classList.contains("checkbox-selecao")) {
            atualizarContadorSelecao();
        }
    });

    botaoExcluirSelecionados.addEventListener("click", async () => {
        const marcados = [...listaAnotacoes.querySelectorAll(".checkbox-selecao:checked")];
        if (marcados.length === 0) return;

        const confirmou = window.confirm(`Tem certeza de que deseja excluir ${marcados.length} lembrete(s)?`);
        if (!confirmou) return;

        for (const checkbox of marcados) {
            await deleteDoc(doc(db, "usuarios", uidAtual, "anotacoes", checkbox.dataset.id));
        }

        sairDoModoSelecao();
    });

    // ==========================================================================
    // MARCAR COMO PAGA / EXCLUIR (individual, fora do modo seleção)
    // ==========================================================================
    listaAnotacoes.addEventListener("click", async (evento) => {
        if (modoSelecao) return; // no modo seleção, o clique é só no checkbox

        const botaoPago = evento.target.closest(".botao-marcar-pago");
        if (botaoPago) {
            const estavaPago = botaoPago.dataset.pago === "true";
            await updateDoc(doc(db, "usuarios", uidAtual, "anotacoes", botaoPago.dataset.id), {
                pago: !estavaPago
            });
            return;
        }

        const botaoExcluir = evento.target.closest(".botao-excluir-conta");
        if (botaoExcluir) {
            const confirmou = window.confirm("Tem certeza de que deseja excluir esse lembrete?");
            if (!confirmou) return;
            await deleteDoc(doc(db, "usuarios", uidAtual, "anotacoes", botaoExcluir.dataset.id));
        }
    });

    // ==========================================================================
    // NOVO LEMBRETE
    // ==========================================================================
    function abrirModalAnotacao() {
        campoNomeConta.value = "";
        campoValorConta.value = "";
        campoDiaVencimento.value = "";
        mensagemAvisoAnotacao.classList.remove("visivel");
        fundoModalAnotacao.classList.add("aberto");
    }

    function fecharModalAnotacao() {
        fundoModalAnotacao.classList.remove("aberto");
    }

    botaoAbrirNovaAnotacao.addEventListener("click", abrirModalAnotacao);
    botaoFecharAnotacao.addEventListener("click", fecharModalAnotacao);
    fundoModalAnotacao.addEventListener("click", (evento) => {
        if (evento.target === fundoModalAnotacao) fecharModalAnotacao();
    });

    botaoSalvarAnotacao.addEventListener("click", async () => {
        const nome = campoNomeConta.value.trim();
        const valor = parseFloat(campoValorConta.value);
        const dia = parseInt(campoDiaVencimento.value, 10);
        mensagemAvisoAnotacao.classList.remove("visivel");

        if (!nome) {
            mensagemAvisoAnotacao.textContent = "Digita o nome do lembrete.";
            mensagemAvisoAnotacao.classList.add("visivel");
            return;
        }
        if (!valor || valor <= 0) {
            mensagemAvisoAnotacao.textContent = "Digita um valor maior que zero.";
            mensagemAvisoAnotacao.classList.add("visivel");
            return;
        }
        if (!dia || dia < 1 || dia > 31) {
            mensagemAvisoAnotacao.textContent = "Digita um dia válido (entre 1 e 31).";
            mensagemAvisoAnotacao.classList.add("visivel");
            return;
        }

        botaoSalvarAnotacao.disabled = true;
        spinnerAnotacao.hidden = false;

        // O lembrete fica salvo no mês que está sendo visto no momento —
        // assim dá pra criar lembretes futuros navegando pra frente antes de salvar
        await addDoc(collection(db, "usuarios", uidAtual, "anotacoes"), {
            nome,
            valor,
            diaVencimento: dia,
            mesReferencia: chaveDoMesSelecionado(),
            pago: false,
            criadoEm: serverTimestamp()
        });

        botaoSalvarAnotacao.disabled = false;
        spinnerAnotacao.hidden = true;
        fecharModalAnotacao();
    });

    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
