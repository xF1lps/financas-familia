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

    // Chave do mês atual, tipo "2026-08" — usada pra saber se o "pago" ainda
    // vale ou se já é de um mês anterior (e portanto a conta voltou a vencer)
    const hoje = new Date();
    const mesAtualChave = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

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
                const jaPagaEsseMes = dados.pagoEm === mesAtualChave;

                const item = document.createElement("li");
                item.className = "item-conta";
                item.innerHTML = `
                    <div class="info-conta">
                        <div class="nome-conta">${dados.nome}</div>
                        <div class="meta-conta">Vence todo dia ${dados.diaVencimento}</div>
                    </div>
                    <span class="valor-conta">${formatarMoeda(dados.valor || 0)}</span>
                    <div class="status-conta">
                        <button class="botao-marcar-pago ${jaPagaEsseMes ? "pago" : ""}" data-id="${documento.id}" data-pago="${jaPagaEsseMes}">
                            ${jaPagaEsseMes ? "✓ Paga" : "Marcar como paga"}
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

    // Marcar/desmarcar como paga (clique alterna) e excluir
    listaAnotacoes.addEventListener("click", async (evento) => {
        const botaoPago = evento.target.closest(".botao-marcar-pago");
        if (botaoPago) {
            const estavaPago = botaoPago.dataset.pago === "true";
            await updateDoc(doc(db, "usuarios", uidAtual, "anotacoes", botaoPago.dataset.id), {
                pagoEm: estavaPago ? null : mesAtualChave
            });
            return;
        }

        const botaoExcluir = evento.target.closest(".botao-excluir-conta");
        if (botaoExcluir) {
            const confirmou = window.confirm("Tem certeza de que deseja excluir essa conta?");
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
            pagoEm: null,
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
