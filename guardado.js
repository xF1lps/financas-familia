import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, deleteDoc, doc, getDoc, setDoc, query, where, onSnapshot, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    let metaAtual = null; // { valor, descricao } | null

    const cartaoMeta = document.getElementById("cartao-meta");
    const descricaoMetaEl = document.getElementById("descricao-meta");
    const barraMeta = document.getElementById("barra-meta");
    const textoProgressoMeta = document.getElementById("texto-progresso-meta");
    const botaoDefinirMeta = document.getElementById("botao-definir-meta");
    const botaoEditarMeta = document.getElementById("botao-editar-meta");
    const botaoRemoverMeta = document.getElementById("botao-remover-meta");
    const fundoModalMeta = document.getElementById("fundo-modal-meta");
    const botaoFecharMeta = document.getElementById("botao-fechar-meta");
    const campoDescricaoMeta = document.getElementById("campo-descricao-meta");
    const campoValorMeta = document.getElementById("campo-valor-meta");
    const mensagemAvisoMeta = document.getElementById("mensagem-aviso-meta");
    const botaoSalvarMeta = document.getElementById("botao-salvar-meta");
    const spinnerMeta = botaoSalvarMeta.querySelector(".spinner-botao");

    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }
        uidAtual = usuario.uid;
        await carregarMeta();
        escutarGuardado();
    });

    async function carregarMeta() {
        const snapshot = await getDoc(doc(db, "usuarios", uidAtual, "configuracoes", "metaEconomia"));
        metaAtual = snapshot.exists() ? snapshot.data() : null;
        atualizarExibicaoMeta();
    }

    function atualizarExibicaoMeta() {
        if (!metaAtual || !metaAtual.valor) {
            cartaoMeta.hidden = true;
            botaoDefinirMeta.hidden = false;
            return;
        }

        cartaoMeta.hidden = false;
        botaoDefinirMeta.hidden = true;

        descricaoMetaEl.textContent = metaAtual.descricao || "Sua meta de economia";

        const percentual = Math.min(100, (totalAtual / metaAtual.valor) * 100);
        barraMeta.style.width = `${percentual}%`;
        barraMeta.className = "barra-orcamento-preenchida";
        if (percentual >= 100) barraMeta.classList.add("estourou"); // aqui "estourou" = bateu a meta, cor de destaque

        textoProgressoMeta.textContent = `${formatarMoeda(totalAtual)} de ${formatarMoeda(metaAtual.valor)} (${Math.round(percentual)}%)`;
    }

    function abrirModalMeta() {
        campoDescricaoMeta.value = metaAtual ? (metaAtual.descricao || "") : "";
        campoValorMeta.value = metaAtual ? metaAtual.valor : "";
        botaoRemoverMeta.hidden = !metaAtual;
        mensagemAvisoMeta.classList.remove("visivel");
        fundoModalMeta.classList.add("aberto");
    }

    function fecharModalMeta() {
        fundoModalMeta.classList.remove("aberto");
    }

    botaoDefinirMeta.addEventListener("click", abrirModalMeta);
    botaoEditarMeta.addEventListener("click", abrirModalMeta);
    botaoFecharMeta.addEventListener("click", fecharModalMeta);
    fundoModalMeta.addEventListener("click", (evento) => {
        if (evento.target === fundoModalMeta) fecharModalMeta();
    });

    botaoSalvarMeta.addEventListener("click", async () => {
        const valor = parseFloat(campoValorMeta.value);
        const descricao = campoDescricaoMeta.value.trim();
        mensagemAvisoMeta.classList.remove("visivel");

        if (!valor || valor <= 0) {
            mensagemAvisoMeta.textContent = "Digita um valor maior que zero pra meta.";
            mensagemAvisoMeta.classList.add("visivel");
            return;
        }

        botaoSalvarMeta.disabled = true;
        spinnerMeta.hidden = false;

        metaAtual = { valor, descricao };
        await setDoc(doc(db, "usuarios", uidAtual, "configuracoes", "metaEconomia"), metaAtual);

        atualizarExibicaoMeta();
        botaoSalvarMeta.disabled = false;
        spinnerMeta.hidden = true;
        fecharModalMeta();
    });

    botaoRemoverMeta.addEventListener("click", async () => {
        const confirmou = window.confirm("Tem certeza de que deseja remover essa meta?");
        if (!confirmou) return;

        await deleteDoc(doc(db, "usuarios", uidAtual, "configuracoes", "metaEconomia"));
        metaAtual = null;
        atualizarExibicaoMeta();
        fecharModalMeta();
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
            atualizarExibicaoMeta();
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

        // 1) Reduz o total guardado (valor negativo, mesma categoria)
        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "gasto",
            valor: -valor,
            categoria: "Guardar Dinheiro",
            descricao: "Retirada",
            data: Timestamp.fromDate(new Date()),
            criadoEm: serverTimestamp()
        });

        // 2) Injeta o valor de volta no saldo principal (horário capturado de
        // novo aqui, pra nunca nascer com o mesmo timestamp exato do registro
        // acima — evita ambiguidade na ordenação por data)
        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Retirada da Reserva",
            descricao: "",
            data: Timestamp.fromDate(new Date()),
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
