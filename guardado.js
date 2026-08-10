import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, deleteDoc, doc, query, where, onSnapshot, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const totalGuardadoEl = document.getElementById("total-guardado");
    const listaGuardado = document.getElementById("lista-guardado");
    const guardadoVazio = document.getElementById("guardado-vazio");

    const botaoAbrirRetirada = document.getElementById("botao-abrir-retirada");
    const botaoFecharRetirada = document.getElementById("botao-fechar-retirada");
    const fundoModalRetirada = document.getElementById("fundo-modal-retirada");
    const textoDisponivelRetirada = document.getElementById("texto-disponivel-retirada");
    const campoValorRetirada = document.getElementById("campo-valor-retirada");
    const mensagemAvisoRetirada = document.getElementById("mensagem-aviso-retirada");
    const botaoConfirmarRetirada = document.getElementById("botao-confirmar-retirada");
    const spinnerRetirada = botaoConfirmarRetirada.querySelector(".spinner-botao");

    let uidAtual = null;
    let totalAtual = 0;

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
        // Sem orderBy aqui de propósito: um "where" sozinho não precisa de
        // índice composto no Firestore. Ordenamos do lado do app mesmo.
        const consulta = query(referencia, where("categoria", "==", "Guardar Dinheiro"));

        onSnapshot(consulta, (snapshot) => {
            let total = 0;
            listaGuardado.innerHTML = "";
            guardadoVazio.hidden = snapshot.docs.length > 0;

            const documentosOrdenados = [...snapshot.docs].sort(
                (a, b) => b.data().data.toDate() - a.data().data.toDate()
            );

            documentosOrdenados.forEach((documento) => {
                const dados = documento.data();
                total += dados.valor;

                const dataObj = dados.data.toDate();
                const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                const ehRetirada = dados.valor < 0;
                const sinal = ehRetirada ? "−" : "+";

                const item = document.createElement("li");
                item.className = `item-lancamento ${ehRetirada ? "tipo-gasto" : "tipo-ganho"}`;
                item.innerHTML = `
                    <span class="ponto-categoria"></span>
                    <div class="info-lancamento">
                        <div class="descricao-lancamento">${dados.descricao || (ehRetirada ? "Retirada" : "Guardado")}</div>
                        <div class="meta-lancamento">${dataFormatada}</div>
                    </div>
                    <span class="valor-lancamento">${sinal} ${formatarMoeda(Math.abs(dados.valor))}</span>
                    <button class="botao-excluir" data-id="${documento.id}" aria-label="Excluir">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                `;
                listaGuardado.appendChild(item);
            });

            totalAtual = total;
            totalGuardadoEl.textContent = formatarMoeda(total);
        });
    }

    listaGuardado.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;

        const confirmou = window.confirm("Tem certeza de que deseja excluir este registro?");
        if (!confirmou) return;

        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botao.dataset.id));
    });

    // ==========================================================================
    // RETIRAR DINHEIRO — cria 2 registros: um reduzindo o guardado (valor
    // negativo na categoria "Guardar Dinheiro") e outro injetando o mesmo
    // valor de volta no saldo principal (Extra, categoria "Retirada da Reserva")
    // ==========================================================================
    function abrirModalRetirada() {
        campoValorRetirada.value = "";
        mensagemAvisoRetirada.classList.remove("visivel");
        textoDisponivelRetirada.textContent = `Você tem ${formatarMoeda(totalAtual)} guardado.`;
        fundoModalRetirada.classList.add("aberto");
    }

    function fecharModalRetirada() {
        fundoModalRetirada.classList.remove("aberto");
    }

    botaoAbrirRetirada.addEventListener("click", abrirModalRetirada);
    botaoFecharRetirada.addEventListener("click", fecharModalRetirada);
    fundoModalRetirada.addEventListener("click", (evento) => {
        if (evento.target === fundoModalRetirada) fecharModalRetirada();
    });

    botaoConfirmarRetirada.addEventListener("click", async () => {
        const valor = parseFloat(campoValorRetirada.value);
        mensagemAvisoRetirada.classList.remove("visivel");

        if (!valor || valor <= 0) {
            mensagemAvisoRetirada.textContent = "Digita um valor maior que zero.";
            mensagemAvisoRetirada.classList.add("visivel");
            return;
        }

        if (valor > totalAtual) {
            mensagemAvisoRetirada.textContent = "Esse valor é maior do que você tem guardado.";
            mensagemAvisoRetirada.classList.add("visivel");
            return;
        }

        botaoConfirmarRetirada.disabled = true;
        spinnerRetirada.hidden = false;

        const agora = new Date();

        // 1) Reduz o total guardado (valor negativo, mesma categoria)
        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "gasto",
            valor: -valor,
            categoria: "Guardar Dinheiro",
            descricao: "Retirada",
            data: Timestamp.fromDate(agora),
            criadoEm: serverTimestamp()
        });

        // 2) Injeta o valor de volta no saldo principal
        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Retirada da Reserva",
            descricao: "",
            data: Timestamp.fromDate(agora),
            criadoEm: serverTimestamp()
        });

        botaoConfirmarRetirada.disabled = false;
        spinnerRetirada.hidden = true;
        fecharModalRetirada();
    });

    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
