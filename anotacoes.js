import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const listaAnotacoes = document.getElementById("lista-anotacoes");
    const anotacoesVazio = document.getElementById("anotacoes-vazio");

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

    onAuthStateChanged(auth, (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        escutarAnotacoes();
    });

    function escutarAnotacoes() {
        const referencia = collection(db, "usuarios", uidAtual, "anotacoes");

        onSnapshot(referencia, (snapshot) => {
            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => a.data().diaVencimento - b.data().diaVencimento
            );

            listaAnotacoes.innerHTML = "";
            anotacoesVazio.hidden = documentosOrdenados.length > 0;

            documentosOrdenados.forEach((documento) => {
                const dados = documento.data();
                const estaPaga = dados.pago === true;

                // Data/hora em que a anotação foi criada, pra mostrar na tela
                let dataCriacaoTexto = "";
                if (dados.criadoEm) {
                    const dataCriacao = dados.criadoEm.toDate();
                    const dataFormatada = dataCriacao.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                    const horaFormatada = dataCriacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
                    dataCriacaoTexto = ` · Anotado em ${dataFormatada} às ${horaFormatada}`;
                }

                const item = document.createElement("li");
                item.className = "item-conta";
                item.innerHTML = `
                    <div class="info-conta">
                        <div class="nome-conta">${dados.nome}</div>
                        <div class="meta-conta">Vence dia ${dados.diaVencimento}${dataCriacaoTexto}</div>
                    </div>
                    <span class="valor-conta">${formatarMoeda(dados.valor || 0)}</span>
                    <div class="status-conta">
                        <button class="botao-marcar-pago ${estaPaga ? "pago" : ""}" data-id="${documento.id}" data-pago="${estaPaga}">
                            ${estaPaga ? "✓ Paga" : "Marcar como paga"}
                        </button>
                        <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir conta">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                            </svg>
                        </button>
                    </div>
                `;
                listaAnotacoes.appendChild(item);
            });
        });
    }

    // Marcar/desmarcar como paga (fica assim pra sempre, não reseta sozinho
    // no mês seguinte — é uma anotação única, não uma conta fixa recorrente)
    listaAnotacoes.addEventListener("click", async (evento) => {
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
            const confirmou = window.confirm("Tem certeza de que deseja excluir essa anotação?");
            if (!confirmou) return;
            await deleteDoc(doc(db, "usuarios", uidAtual, "anotacoes", botaoExcluir.dataset.id));
        }
    });

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
            mensagemAvisoAnotacao.textContent = "Digita o nome da conta.";
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

        await addDoc(collection(db, "usuarios", uidAtual, "anotacoes"), {
            nome,
            valor,
            diaVencimento: dia,
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
