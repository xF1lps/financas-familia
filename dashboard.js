import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, orderBy, onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================================================
// CATEGORIAS PADRÃO
// Só sobrou "Outros" — todo o resto vem da opção "+ Nova categoria", que a
// pessoa cria na hora e fica salva pras próximas vezes.
// ==========================================================================
const CATEGORIAS_PADRAO = {
    gasto: ["Outros"],
    ganho: ["Outros"]
};

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

document.addEventListener("DOMContentLoaded", function () {

    // ==========================================================================
    // 1. REFERÊNCIAS AOS ELEMENTOS DA TELA
    // ==========================================================================
    const emailUsuario = document.getElementById("email-usuario");
    const botaoSair = document.getElementById("botao-sair");

    const botaoHamburguer = document.getElementById("botao-hamburguer");
    const overlayMenu = document.getElementById("overlay-menu");
    const painelMenu = document.getElementById("painel-menu");
    const botaoFecharMenuLateral = document.getElementById("botao-fechar-menu-lateral");

    const anoAnteriorBtn = document.getElementById("ano-anterior");
    const anoProximoBtn = document.getElementById("ano-proximo");
    const mesAnteriorBtn = document.getElementById("mes-anterior");
    const mesProximoBtn = document.getElementById("mes-proximo");
    const rotuloMes = document.getElementById("rotulo-mes");

    const totalGanhosEl = document.getElementById("total-ganhos");
    const totalGastosEl = document.getElementById("total-gastos");
    const totalSaldoEl = document.getElementById("total-saldo");

    const listaLancamentos = document.getElementById("lista-lancamentos");
    const listaVazia = document.getElementById("lista-vazia");

    const bannerDiarista = document.getElementById("banner-diarista");
    const valorDiarioInput = document.getElementById("valor-diario");
    const botaoRegistrarDiario = document.getElementById("registrar-diario");

    const botaoAbrirModal = document.getElementById("botao-abrir-modal");
    const botaoFecharModal = document.getElementById("botao-fechar-modal");
    const fundoModal = document.getElementById("fundo-modal");

    const etapaEscolha = document.getElementById("etapa-escolha");
    const perguntaEscolha = document.getElementById("pergunta-escolha");
    const botoesEscolha = document.querySelectorAll(".botao-escolha-tipo");
    const botaoTrocarTipo = document.getElementById("botao-trocar-tipo");

    const formulario = document.getElementById("formulario-lancamento");
    const rotuloValor = document.getElementById("rotulo-valor");
    const campoValor = document.getElementById("campo-valor");
    const campoParcelasWrapper = document.getElementById("campo-parcelas-wrapper");
    const campoParcelas = document.getElementById("campo-parcelas");
    const campoCategoria = document.getElementById("campo-categoria");
    const campoNovaCategoriaWrapper = document.getElementById("campo-nova-categoria-wrapper");
    const campoNovaCategoria = document.getElementById("campo-nova-categoria");
    const campoDescricao = document.getElementById("campo-descricao");
    const campoData = document.getElementById("campo-data");
    const opcoesEspeciaisGasto = document.getElementById("opcoes-especiais-gasto");
    const campoFixo = document.getElementById("campo-fixo");
    const campoParcelado = document.getElementById("campo-parcelado");
    const mensagemAviso = document.getElementById("mensagem-aviso-modal");
    const botaoSalvar = document.getElementById("botao-salvar-lancamento");
    const textoBotaoSalvar = botaoSalvar.querySelector(".texto-botao");
    const spinnerSalvar = botaoSalvar.querySelector(".spinner-botao");

    // ==========================================================================
    // 2. ESTADO DA TELA
    // ==========================================================================
    let uidAtual = null;
    let mesSelecionado = new Date();
    let tipoSelecionado = "gasto";
    let categoriasCustomizadas = { gasto: [], ganho: [] };
    let pararDeEscutar = null;
    let rendaEhDiaria = false;
    let primeiroNome = "";

    // ==========================================================================
    // 3. VERIFICAR LOGIN
    // ==========================================================================
    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }

        uidAtual = usuario.uid;
        emailUsuario.textContent = usuario.email;

        const perfilSnapshot = await getDoc(doc(db, "usuarios", uidAtual));
        if (!perfilSnapshot.exists() || perfilSnapshot.data().onboardingCompleto !== true) {
            window.location.href = "onboarding.html";
            return;
        }

        const perfil = perfilSnapshot.data();
        rendaEhDiaria = perfil.renda === "diaria";
        primeiroNome = (perfil.nome || "").trim().split(" ")[0] || "";

        await carregarCategoriasCustomizadas();
        atualizarRotuloMes();
        escutarLancamentosDoMes();
    });

    botaoSair.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "index.html";
    });

    // ==========================================================================
    // 4. MENU LATERAL (hambúrguer)
    // ==========================================================================
    function abrirMenuLateral() {
        painelMenu.classList.add("aberto");
        overlayMenu.classList.add("aberto");
    }

    function fecharMenuLateral() {
        painelMenu.classList.remove("aberto");
        overlayMenu.classList.remove("aberto");
    }

    botaoHamburguer.addEventListener("click", abrirMenuLateral);
    botaoFecharMenuLateral.addEventListener("click", fecharMenuLateral);
    overlayMenu.addEventListener("click", fecharMenuLateral);

    // ==========================================================================
    // 5. NAVEGAÇÃO ENTRE MESES E ANOS
    // ==========================================================================
    mesAnteriorBtn.addEventListener("click", () => mudarPeriodo(-1));
    mesProximoBtn.addEventListener("click", () => mudarPeriodo(1));
    anoAnteriorBtn.addEventListener("click", () => mudarPeriodo(-12));
    anoProximoBtn.addEventListener("click", () => mudarPeriodo(12));

    function mudarPeriodo(mesesParaSomar) {
        mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + mesesParaSomar, 1);
        atualizarRotuloMes();
        escutarLancamentosDoMes();
    }

    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;
    }

    // ==========================================================================
    // 6. CATEGORIAS
    // ==========================================================================
    async function carregarCategoriasCustomizadas() {
        const referencia = collection(db, "usuarios", uidAtual, "categorias");
        const resultado = await getDocs(referencia);

        categoriasCustomizadas = { gasto: [], ganho: [] };
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "gasto" || dados.tipo === "ganho") {
                categoriasCustomizadas[dados.tipo].push(dados.nome);
            }
        });
    }

    function popularSelectCategorias() {
        const listaCompleta = [...CATEGORIAS_PADRAO[tipoSelecionado], ...categoriasCustomizadas[tipoSelecionado]];

        campoCategoria.innerHTML = "";
        listaCompleta.forEach((nomeCategoria) => {
            const opcao = document.createElement("option");
            opcao.value = nomeCategoria;
            opcao.textContent = nomeCategoria;
            campoCategoria.appendChild(opcao);
        });

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova categoria";
        campoCategoria.appendChild(opcaoNova);
    }

    campoCategoria.addEventListener("change", () => {
        const criandoNova = campoCategoria.value === "__nova__";
        campoNovaCategoriaWrapper.hidden = !criandoNova;
        campoNovaCategoria.required = criandoNova;
    });

    // ==========================================================================
    // 7. MODAL — ETAPA 1 (escolha) E ETAPA 2 (formulário)
    // ==========================================================================
    function abrirModal() {
        // Sempre volta pra etapa 1 quando abre, mesmo que tenha ficado no meio
        // do preenchimento da última vez
        etapaEscolha.hidden = false;
        formulario.hidden = true;
        formulario.reset();
        esconderAviso();
        campoNovaCategoriaWrapper.hidden = true;
        campoParcelasWrapper.hidden = true;
        campoFixo.checked = false;
        campoParcelado.checked = false;

        perguntaEscolha.textContent = primeiroNome
            ? `${primeiroNome}, deseja registrar um:`
            : "Deseja registrar um:";

        fundoModal.classList.add("aberto");
    }

    function fecharModal() {
        fundoModal.classList.remove("aberto");
    }

    function irParaFormulario(tipo) {
        tipoSelecionado = tipo;
        etapaEscolha.hidden = true;
        formulario.hidden = false;

        botaoTrocarTipo.textContent = tipo === "gasto" ? "← Gasto (trocar)" : "← Ganho (trocar)";
        rotuloValor.textContent = "Valor";
        opcoesEspeciaisGasto.hidden = tipo !== "gasto";

        popularSelectCategorias();

        const hoje = new Date();
        campoData.value = hoje.toISOString().split("T")[0];
        campoValor.focus();
    }

    botoesEscolha.forEach((botao) => {
        botao.addEventListener("click", () => irParaFormulario(botao.dataset.tipo));
    });

    botaoTrocarTipo.addEventListener("click", () => {
        etapaEscolha.hidden = false;
        formulario.hidden = true;
    });

    botaoAbrirModal.addEventListener("click", abrirModal);
    botaoFecharModal.addEventListener("click", fecharModal);

    fundoModal.addEventListener("click", (evento) => {
        if (evento.target === fundoModal) fecharModal();
    });

    // Gasto fixo e parcelamento são mutuamente exclusivos — marcar um desmarca o outro
    campoFixo.addEventListener("change", () => {
        if (campoFixo.checked) campoParcelado.checked = false;
        atualizarVisibilidadeParcelas();
    });

    campoParcelado.addEventListener("change", () => {
        if (campoParcelado.checked) campoFixo.checked = false;
        atualizarVisibilidadeParcelas();
    });

    function atualizarVisibilidadeParcelas() {
        const parcelando = campoParcelado.checked;
        campoParcelasWrapper.hidden = !parcelando;
        campoParcelas.required = parcelando;
        rotuloValor.textContent = parcelando ? "Valor total da compra" : "Valor";
    }

    // ==========================================================================
    // 8. MENSAGENS DE AVISO
    // ==========================================================================
    function mostrarAviso(texto) {
        mensagemAviso.textContent = texto;
        mensagemAviso.classList.add("visivel");
    }

    function esconderAviso() {
        mensagemAviso.classList.remove("visivel");
    }

    function definirCarregando(carregando) {
        botaoSalvar.disabled = carregando;
        spinnerSalvar.hidden = !carregando;
        textoBotaoSalvar.style.opacity = carregando ? "0.7" : "1";
    }

    // ==========================================================================
    // 9. SALVAR LANÇAMENTO (normal, fixo ou parcelado)
    // ==========================================================================
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        esconderAviso();

        const valorDigitado = parseFloat(campoValor.value);
        if (!valorDigitado || valorDigitado <= 0) {
            mostrarAviso("Digita um valor maior que zero.");
            return;
        }

        let categoriaFinal = campoCategoria.value;
        if (categoriaFinal === "__nova__") {
            const nomeNovaCategoria = campoNovaCategoria.value.trim();
            if (!nomeNovaCategoria) {
                mostrarAviso("Digita o nome da nova categoria.");
                return;
            }
            categoriaFinal = nomeNovaCategoria;
        }

        const ehParcelado = tipoSelecionado === "gasto" && campoParcelado.checked;
        const numeroParcelas = ehParcelado ? parseInt(campoParcelas.value, 10) : 1;

        if (ehParcelado && (!numeroParcelas || numeroParcelas < 2)) {
            mostrarAviso("Informa um número de parcelas válido (mínimo 2).");
            return;
        }

        definirCarregando(true);

        try {
            if (campoCategoria.value === "__nova__") {
                await addDoc(collection(db, "usuarios", uidAtual, "categorias"), {
                    nome: categoriaFinal,
                    tipo: tipoSelecionado
                });
                categoriasCustomizadas[tipoSelecionado].push(categoriaFinal);
            }

            const dataEscolhida = new Date(`${campoData.value}T12:00:00`);
            const descricaoBase = campoDescricao.value.trim();

            if (ehParcelado) {
                await salvarParcelado(valorDigitado, numeroParcelas, categoriaFinal, descricaoBase, dataEscolhida);
            } else if (campoFixo.checked) {
                await salvarFixo(valorDigitado, categoriaFinal, descricaoBase, dataEscolhida);
            } else {
                await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                    tipo: tipoSelecionado,
                    valor: valorDigitado,
                    categoria: categoriaFinal,
                    descricao: descricaoBase,
                    data: Timestamp.fromDate(dataEscolhida),
                    criadoEm: serverTimestamp()
                });
            }

            fecharModal();

        } catch (erro) {
            mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
        } finally {
            definirCarregando(false);
        }
    });

    // Divide o valor total em N parcelas iguais, lançando uma em cada mês
    // seguinte. A última parcela absorve a diferença de centavos do
    // arredondamento, pra soma bater certinho com o valor total.
    async function salvarParcelado(valorTotal, numeroParcelas, categoria, descricaoBase, dataInicial) {
        const valorParcela = Math.floor((valorTotal / numeroParcelas) * 100) / 100;
        const diferencaCentavos = Math.round((valorTotal - valorParcela * numeroParcelas) * 100) / 100;
        const grupoId = `parc_${Date.now()}`;

        for (let indice = 0; indice < numeroParcelas; indice++) {
            const dataDaParcela = new Date(dataInicial.getFullYear(), dataInicial.getMonth() + indice, dataInicial.getDate(), 12);
            const ehUltima = indice === numeroParcelas - 1;
            const valorDessaParcela = ehUltima ? valorParcela + diferencaCentavos : valorParcela;
            const descricaoFinal = `${descricaoBase || categoria} (Parcela ${indice + 1}/${numeroParcelas})`;

            await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                tipo: "gasto",
                valor: valorDessaParcela,
                categoria,
                descricao: descricaoFinal,
                data: Timestamp.fromDate(dataDaParcela),
                grupoParcelamentoId: grupoId,
                criadoEm: serverTimestamp()
            });
        }
    }

    // Repete o mesmo gasto pelos próximos 12 meses (contando o mês atual).
    // Ajusta o dia automaticamente se o mês de destino for mais curto
    // (ex: lançado dia 31, em fevereiro cai no último dia do mês).
    async function salvarFixo(valor, categoria, descricaoBase, dataInicial) {
        const grupoId = `fixo_${Date.now()}`;
        const diaOriginal = dataInicial.getDate();

        for (let indice = 0; indice < 12; indice++) {
            const anoDestino = dataInicial.getFullYear();
            const mesDestino = dataInicial.getMonth() + indice;
            const ultimoDiaDoMes = new Date(anoDestino, mesDestino + 1, 0).getDate();
            const diaFinal = Math.min(diaOriginal, ultimoDiaDoMes);
            const dataDoMes = new Date(anoDestino, mesDestino, diaFinal, 12);

            await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                tipo: "gasto",
                valor,
                categoria,
                descricao: descricaoBase || categoria,
                data: Timestamp.fromDate(dataDoMes),
                fixo: true,
                grupoFixoId: grupoId,
                criadoEm: serverTimestamp()
            });
        }
    }

    // ==========================================================================
    // 10. ESCUTAR OS LANÇAMENTOS DO MÊS SELECIONADO, EM TEMPO REAL
    // ==========================================================================
    function escutarLancamentosDoMes() {
        if (pararDeEscutar) pararDeEscutar();

        const inicioMes = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth(), 1);
        const inicioProximoMes = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 1);

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(
            referencia,
            where("data", ">=", Timestamp.fromDate(inicioMes)),
            where("data", "<", Timestamp.fromDate(inicioProximoMes)),
            orderBy("data", "desc")
        );

        pararDeEscutar = onSnapshot(consulta, (snapshot) => {
            renderizarLista(snapshot.docs);
            calcularTotais(snapshot.docs);
            atualizarBannerDiarista(snapshot.docs);
        });
    }

    // ==========================================================================
    // BANNER DO DIARISTA
    // ==========================================================================
    function atualizarBannerDiarista(documentos) {
        if (!rendaEhDiaria) {
            bannerDiarista.hidden = true;
            return;
        }

        const hoje = new Date();
        const ehMesAtual = mesSelecionado.getFullYear() === hoje.getFullYear()
            && mesSelecionado.getMonth() === hoje.getMonth();

        if (!ehMesAtual) {
            bannerDiarista.hidden = true;
            return;
        }

        const jaTemGanhoHoje = documentos.some((documento) => {
            const dados = documento.data();
            return dados.tipo === "ganho" && dados.data.toDate().toDateString() === hoje.toDateString();
        });

        bannerDiarista.hidden = jaTemGanhoHoje;
    }

    botaoRegistrarDiario.addEventListener("click", async () => {
        const valor = parseFloat(valorDiarioInput.value);
        if (!valor || valor <= 0) return;

        botaoRegistrarDiario.disabled = true;

        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Diária",
            descricao: "",
            data: Timestamp.fromDate(new Date()),
            criadoEm: serverTimestamp()
        });

        valorDiarioInput.value = "";
        botaoRegistrarDiario.disabled = false;
    });

    // ==========================================================================
    // 11. DESENHAR A LISTA DE LANÇAMENTOS NA TELA
    // ==========================================================================
    function renderizarLista(documentos) {
        listaLancamentos.innerHTML = "";
        listaVazia.hidden = documentos.length > 0;

        documentos.forEach((documento) => {
            const dados = documento.data();
            const dataFormatada = dados.data.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const sinal = dados.tipo === "ganho" ? "+" : "-";

            const item = document.createElement("li");
            item.className = `item-lancamento tipo-${dados.tipo}`;
            item.innerHTML = `
                <span class="ponto-categoria"></span>
                <div class="info-lancamento">
                    <div class="descricao-lancamento">${dados.descricao || dados.categoria}</div>
                    <div class="meta-lancamento">${dados.categoria} · ${dataFormatada}</div>
                </div>
                <span class="valor-lancamento">${sinal} ${formatarMoeda(dados.valor)}</span>
                <button class="botao-excluir" data-id="${documento.id}" aria-label="Excluir lançamento">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                    </svg>
                </button>
            `;
            listaLancamentos.appendChild(item);
        });
    }

    listaLancamentos.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;

        const idLancamento = botao.dataset.id;
        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", idLancamento));
    });

    // ==========================================================================
    // 12. CALCULAR OS TOTAIS DO MÊS
    // ==========================================================================
    function calcularTotais(documentos) {
        let totalGanhos = 0;
        let totalGastos = 0;

        documentos.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "ganho") {
                totalGanhos += dados.valor;
            } else {
                totalGastos += dados.valor;
            }
        });

        totalGanhosEl.textContent = formatarMoeda(totalGanhos);
        totalGastosEl.textContent = formatarMoeda(totalGastos);
        totalSaldoEl.textContent = formatarMoeda(totalGanhos - totalGastos);
    }

    // ==========================================================================
    // 13. FORMATAR MOEDA
    // ==========================================================================
    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
