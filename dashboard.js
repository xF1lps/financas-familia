import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, updateDoc, setDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, orderBy, onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CATEGORIAS_PADRAO = {
    gasto: ["Outros"],
    ganho: ["Outros"]
};

// Cores usadas no gráfico de gastos por categoria (cicla se tiver mais categorias que cores)
const PALETA_GRAFICO = ["#D97757", "#34D399", "#60A5FA", "#F5D76E", "#C084FC", "#F87171", "#5EEAD4", "#FDBA74"];

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Mostramos só os últimos N lançamentos na tela inicial — o resto fica no Extrato Completo
const LIMITE_ITENS_LISTA_INICIAL = 4;

// Navegação do calendário travada até dezembro do ano corrente
const LIMITE_NAVEGACAO = new Date(new Date().getFullYear(), 11, 1);

document.addEventListener("DOMContentLoaded", function () {

    // ==========================================================================
    // 1. REFERÊNCIAS AOS ELEMENTOS DA TELA
    // ==========================================================================
    const telaCarregamento = document.getElementById("tela-carregamento");
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
    const linkExtrato = document.getElementById("link-extrato");

    const fundoModalConselho = document.getElementById("fundo-modal-conselho");
    const botaoFecharConselho = document.getElementById("botao-fechar-conselho");
    const bannerSalario = document.getElementById("banner-salario");
    const valorSalarioBanner = document.getElementById("valor-salario-banner");
    const botaoConfirmarSalario = document.getElementById("confirmar-salario");
    const perguntaSalario = document.getElementById("pergunta-salario");

    const graficoDonut = document.getElementById("grafico-donut");
    const legendaGrafico = document.getElementById("legenda-grafico");
    const graficoVazio = document.getElementById("grafico-vazio");

    const botaoAbrirModal = document.getElementById("botao-abrir-modal");
    const botaoFecharModal = document.getElementById("botao-fechar-modal");
    const fundoModal = document.getElementById("fundo-modal");
    const tituloModal = document.getElementById("titulo-modal");

    const etapaEscolha = document.getElementById("etapa-escolha");
    const perguntaEscolha = document.getElementById("pergunta-escolha");
    const botoesEscolha = document.querySelectorAll(".botao-escolha-tipo");
    const botaoEscolhaExtra = document.getElementById("botao-escolha-extra");
    const botaoTrocarTipo = document.getElementById("botao-trocar-tipo");

    const formulario = document.getElementById("formulario-lancamento");
    const rotuloValor = document.getElementById("rotulo-valor");
    const campoValor = document.getElementById("campo-valor");
    const campoParcelasWrapper = document.getElementById("campo-parcelas-wrapper");
    const campoParcelas = document.getElementById("campo-parcelas");
    const campoCategoriaWrapper = document.getElementById("campo-categoria-wrapper");
    const campoCategoria = document.getElementById("campo-categoria");
    const botaoExcluirCategoria = document.getElementById("botao-excluir-categoria");
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
    let pararDeEscutarSalario = null;
    let salarioPadrao = 0;
    let primeiroNome = "";
    let idEmEdicao = null; // null = criando novo | string = editando esse lançamento
    let saldoAtualDoMes = 0; // usado pra impedir guardar mais do que o saldo permite
    let modoGuardar = false; // true = a pessoa escolheu "Guardar" no modal

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
        primeiroNome = (perfil.nome || "").trim().split(" ")[0] || "";
        salarioPadrao = perfil.salarioPadrao || 0;

        // Pro perfil Diarista, o botão do meio continua mostrando "Ganho";
        // pra todo mundo, mostra "Extra"
        const ehDiarista = Array.isArray(perfil.profissoes) && perfil.profissoes.includes("Diarista");
        botaoEscolhaExtra.textContent = ehDiarista ? "Ganho" : "Extra";

        await carregarCategoriasCustomizadas();
        atualizarRotuloMes();
        escutarLancamentosDoMes();
        verificarConselhoMensal(perfil);

        // O banner de salário roda numa consulta separada, olhando pro mês
        // atual de verdade — independente de qual mês está sendo navegado
        if (salarioPadrao > 0) escutarSalarioDoMes();

        telaCarregamento.classList.add("oculto");
    });

    botaoSair.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "index.html";
    });

    // ==========================================================================
    // 4. MENU LATERAL
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
    // 5. NAVEGAÇÃO ENTRE MESES E ANOS (com limite até dezembro do ano corrente)
    // ==========================================================================
    mesAnteriorBtn.addEventListener("click", () => mudarPeriodo(-1));
    mesProximoBtn.addEventListener("click", () => mudarPeriodo(1));
    anoAnteriorBtn.addEventListener("click", () => mudarPeriodo(-12));
    anoProximoBtn.addEventListener("click", () => mudarPeriodo(12));

    function mudarPeriodo(mesesParaSomar) {
        const novaData = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + mesesParaSomar, 1);

        // Não deixa passar de dezembro do ano corrente
        if (novaData > LIMITE_NAVEGACAO) {
            mesSelecionado = new Date(LIMITE_NAVEGACAO);
        } else {
            mesSelecionado = novaData;
        }

        atualizarRotuloMes();
        escutarLancamentosDoMes();
    }

    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;

        const jaNoLimite = mesSelecionado.getFullYear() === LIMITE_NAVEGACAO.getFullYear()
            && mesSelecionado.getMonth() === LIMITE_NAVEGACAO.getMonth();

        mesProximoBtn.disabled = jaNoLimite;
        anoProximoBtn.disabled = jaNoLimite;

        // O link "Ver extrato completo" da tela inicial sempre abre já filtrado
        // no mês que está sendo visto no momento (o extrato em si permite trocar
        // o filtro depois, incluindo ver todos os meses)
        const mesParaUrl = String(mesSelecionado.getMonth() + 1).padStart(2, "0");
        linkExtrato.href = `extrato.html?mes=${mesSelecionado.getFullYear()}-${mesParaUrl}`;
    }

    // ==========================================================================
    // CONSELHO FINANCEIRO — checa se o total guardado (histórico completo) está
    // zerado, e mostra um aviso amigável uma vez por mês (nos primeiros dias)
    // ==========================================================================
    async function verificarConselhoMensal(perfil) {
        const hoje = new Date();
        if (hoje.getDate() > 3) return; // só nos primeiros dias do mês

        const chaveDoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
        if (perfil.ultimoAvisoConselho === chaveDoMes) return; // já mostrou esse mês

        // consulta simples, sem índice composto: soma tudo que já foi guardado
        const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
        const consultaGuardado = query(referenciaLancamentos, where("categoria", "==", "Guardar Dinheiro"));
        const resultado = await getDocs(consultaGuardado);

        let totalGuardado = 0;
        resultado.forEach((documento) => { totalGuardado += documento.data().valor; });

        if (totalGuardado <= 0) {
            fundoModalConselho.classList.add("aberto");
        }

        // Marca que já verificou esse mês, pra não mostrar de novo até o próximo
        await setDoc(doc(db, "usuarios", uidAtual), { ultimoAvisoConselho: chaveDoMes }, { merge: true });
    }

    botaoFecharConselho.addEventListener("click", () => {
        fundoModalConselho.classList.remove("aberto");
    });

    // ==========================================================================
    // 6. CATEGORIAS
    // ==========================================================================
    async function carregarCategoriasCustomizadas() {
        const referencia = collection(db, "usuarios", uidAtual, "categorias");
        const resultado = await getDocs(referencia);

        // Guarda {nome, id} de cada categoria customizada — o id é o que
        // permite excluir depois lá no Firestore
        categoriasCustomizadas = { gasto: [], ganho: [] };
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.tipo === "gasto" || dados.tipo === "ganho") {
                categoriasCustomizadas[dados.tipo].push({ nome: dados.nome, id: documento.id });
            }
        });
    }

    function popularSelectCategorias(categoriaAtual) {
        campoCategoria.innerHTML = "";

        // Categorias fixas (Outros, etc.) — nunca têm lixeira
        CATEGORIAS_PADRAO[tipoSelecionado].forEach((nomeCategoria) => {
            const opcao = document.createElement("option");
            opcao.value = nomeCategoria;
            opcao.textContent = nomeCategoria;
            campoCategoria.appendChild(opcao);
        });

        // Categorias criadas pela pessoa — essas sim podem ser excluídas
        categoriasCustomizadas[tipoSelecionado].forEach((categoria) => {
            const opcao = document.createElement("option");
            opcao.value = categoria.nome;
            opcao.textContent = categoria.nome;
            opcao.dataset.customizada = "true";
            opcao.dataset.categoriaId = categoria.id;
            campoCategoria.appendChild(opcao);
        });

        // Se a categoria do item sendo editado não estiver em nenhuma lista
        // (ex: já foi excluída depois), adiciona ela também, senão o select
        // perde o valor e some silenciosamente
        const todasAsOpcoes = [...campoCategoria.options].map((opcao) => opcao.value);
        if (categoriaAtual && !todasAsOpcoes.includes(categoriaAtual)) {
            const opcao = document.createElement("option");
            opcao.value = categoriaAtual;
            opcao.textContent = categoriaAtual;
            campoCategoria.appendChild(opcao);
        }

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova categoria";
        campoCategoria.appendChild(opcaoNova);

        if (categoriaAtual) campoCategoria.value = categoriaAtual;
        atualizarBotaoExcluirCategoria();
    }

    // Mostra a lixeira só quando a categoria selecionada no momento for uma
    // que a própria pessoa criou (nunca nas fixas, tipo "Outros")
    function atualizarBotaoExcluirCategoria() {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        botaoExcluirCategoria.hidden = !opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true";
    }

    campoCategoria.addEventListener("change", () => {
        const criandoNova = campoCategoria.value === "__nova__";
        campoNovaCategoriaWrapper.hidden = !criandoNova;
        campoNovaCategoria.required = criandoNova;
        atualizarBotaoExcluirCategoria();
    });

    botaoExcluirCategoria.addEventListener("click", async () => {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        if (!opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true") return;

        const confirmou = window.confirm(`Tem certeza de que deseja excluir a categoria "${opcaoSelecionada.value}"? Lançamentos antigos que usam ela continuam salvos normalmente no extrato.`);
        if (!confirmou) return;

        const categoriaId = opcaoSelecionada.dataset.categoriaId;
        await deleteDoc(doc(db, "usuarios", uidAtual, "categorias", categoriaId));

        categoriasCustomizadas[tipoSelecionado] = categoriasCustomizadas[tipoSelecionado].filter((c) => c.id !== categoriaId);
        popularSelectCategorias();
        campoCategoria.value = "Outros";
        atualizarBotaoExcluirCategoria();
    });

    // ==========================================================================
    // 7. MODAL — ABRIR PARA CRIAR
    // ==========================================================================
    function abrirModalNovo() {
        idEmEdicao = null;
        modoGuardar = false;
        tituloModal.textContent = "Novo lançamento";
        textoBotaoSalvar.textContent = "Salvar lançamento";

        etapaEscolha.hidden = false;
        formulario.hidden = true;
        formulario.reset();
        esconderAviso();
        campoCategoriaWrapper.hidden = false;
        campoCategoria.required = true;
        campoNovaCategoriaWrapper.hidden = true;
        campoParcelasWrapper.hidden = true;
        campoFixo.checked = false;
        campoFixo.disabled = false;
        campoParcelado.checked = false;
        campoParcelado.disabled = false;

        perguntaEscolha.textContent = primeiroNome
            ? `${primeiroNome}, deseja registrar um:`
            : "Deseja registrar um:";

        fundoModal.classList.add("aberto");
    }

    // ==========================================================================
    // MODAL — ABRIR PARA EDITAR (a partir de um clique num item da lista)
    // ==========================================================================
    function abrirModalEdicao(idLancamento, dados) {
        idEmEdicao = idLancamento;
        modoGuardar = false;
        tituloModal.textContent = "Editar lançamento";
        textoBotaoSalvar.textContent = "Salvar alterações";

        tipoSelecionado = dados.tipo;
        etapaEscolha.hidden = true;
        formulario.hidden = false;
        esconderAviso();

        botaoTrocarTipo.hidden = true; // não dá pra trocar o tipo de um lançamento já existente
        rotuloValor.textContent = "Valor";
        opcoesEspeciaisGasto.hidden = true; // editar não deve gerar novas parcelas/repetições
        campoCategoriaWrapper.hidden = false;
        campoCategoria.required = true;

        popularSelectCategorias(dados.categoria);
        campoValor.value = dados.valor;
        campoDescricao.value = dados.descricao || "";
        campoData.value = dados.data.toDate().toISOString().split("T")[0];
        campoNovaCategoriaWrapper.hidden = true;

        fundoModal.classList.add("aberto");
    }

    function fecharModal() {
        fundoModal.classList.remove("aberto");
        botaoTrocarTipo.hidden = false;
    }

    function irParaFormulario(tipoClicado) {
        // "guardar" não é um tipo de lançamento de verdade — por baixo dos
        // panos ele é um "ganho" com categoria fixa "Guardar Dinheiro".
        // "extra" também é só o nome do botão — internamente é "ganho" também.
        modoGuardar = tipoClicado === "guardar";
        tipoSelecionado = tipoClicado === "gasto" ? "gasto" : "ganho";

        etapaEscolha.hidden = true;
        formulario.hidden = false;

        const rotulosBotaoTrocar = {
            gasto: "← Gasto (trocar)",
            extra: `← ${botaoEscolhaExtra.textContent} (trocar)`,
            guardar: "← Guardar (trocar)"
        };
        botaoTrocarTipo.textContent = rotulosBotaoTrocar[tipoClicado];
        rotuloValor.textContent = "Valor";
        opcoesEspeciaisGasto.hidden = tipoClicado !== "gasto";

        // No modo Guardar, a categoria já é fixa — não faz sentido escolher.
        // Importante: precisa desligar o "required" também, senão o navegador
        // bloqueia o envio do formulário por causa de um campo obrigatório
        // que está escondido (isso que causava o "bloqueio" depois do 1º uso)
        campoCategoriaWrapper.hidden = modoGuardar;
        campoCategoria.required = !modoGuardar;
        campoNovaCategoriaWrapper.hidden = true;

        if (!modoGuardar) popularSelectCategorias();

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

    botaoAbrirModal.addEventListener("click", abrirModalNovo);
    botaoFecharModal.addEventListener("click", fecharModal);

    fundoModal.addEventListener("click", (evento) => {
        if (evento.target === fundoModal) fecharModal();
    });

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

    // Junta a data escolhida no calendário com o horário real de agora —
    // resolve dois pontos ao mesmo tempo: mostra a que horas a pessoa
    // realmente registrou aquilo, e faz lançamentos do mesmo dia ficarem
    // ordenados certinho (do mais recente pro mais antigo)
    function construirDataComHorarioReal(dataDoCampo) {
        const agora = new Date();
        const horas = String(agora.getHours()).padStart(2, "0");
        const minutos = String(agora.getMinutes()).padStart(2, "0");
        return new Date(`${dataDoCampo}T${horas}:${minutos}:00`);
    }

    // ==========================================================================
    // 9. SALVAR (criar novo, ou editar um existente)
    // ==========================================================================
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        esconderAviso();

        const valorDigitado = parseFloat(campoValor.value);
        if (!valorDigitado || valorDigitado <= 0) {
            mostrarAviso("Digita um valor maior que zero.");
            return;
        }

        if (modoGuardar && valorDigitado > saldoAtualDoMes) {
            mostrarAviso(`Esse valor é maior do que o seu saldo atual (${formatarMoeda(saldoAtualDoMes)}). Não dá pra guardar mais do que você tem.`);
            return;
        }

        let categoriaFinal = campoCategoria.value;
        if (modoGuardar) {
            categoriaFinal = "Guardar Dinheiro";
        } else if (categoriaFinal === "__nova__") {
            const nomeNovaCategoria = campoNovaCategoria.value.trim();
            if (!nomeNovaCategoria) {
                mostrarAviso("Digita o nome da nova categoria.");
                return;
            }
            categoriaFinal = nomeNovaCategoria;
        }

        // ---- Fluxo de EDIÇÃO ----
        if (idEmEdicao) {
            const confirmou = window.confirm("Tem certeza de que deseja salvar as alterações deste lançamento?");
            if (!confirmou) return;

            definirCarregando(true);
            try {
                if (campoCategoria.value === "__nova__" && !modoGuardar) {
                    const referenciaCategoria = await addDoc(collection(db, "usuarios", uidAtual, "categorias"), {
                        nome: categoriaFinal,
                        tipo: tipoSelecionado
                    });
                    categoriasCustomizadas[tipoSelecionado].push({ nome: categoriaFinal, id: referenciaCategoria.id });
                }

                await updateDoc(doc(db, "usuarios", uidAtual, "lancamentos", idEmEdicao), {
                    valor: valorDigitado,
                    categoria: categoriaFinal,
                    descricao: campoDescricao.value.trim(),
                    data: Timestamp.fromDate(construirDataComHorarioReal(campoData.value))
                });

                fecharModal();
            } catch (erro) {
                mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
            } finally {
                definirCarregando(false);
            }
            return;
        }

        // ---- Fluxo de CRIAÇÃO ----
        const ehParcelado = tipoSelecionado === "gasto" && campoParcelado.checked;
        const numeroParcelas = ehParcelado ? parseInt(campoParcelas.value, 10) : 1;

        if (ehParcelado && (!numeroParcelas || numeroParcelas < 2)) {
            mostrarAviso("Informa um número de parcelas válido (mínimo 2).");
            return;
        }

        definirCarregando(true);

        try {
            if (campoCategoria.value === "__nova__" && !modoGuardar) {
                const referenciaCategoria = await addDoc(collection(db, "usuarios", uidAtual, "categorias"), {
                    nome: categoriaFinal,
                    tipo: tipoSelecionado
                });
                categoriasCustomizadas[tipoSelecionado].push({ nome: categoriaFinal, id: referenciaCategoria.id });
            }

            const dataEscolhida = construirDataComHorarioReal(campoData.value);
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

    async function salvarParcelado(valorTotal, numeroParcelas, categoria, descricaoBase, dataInicial) {
        const valorParcela = Math.floor((valorTotal / numeroParcelas) * 100) / 100;
        const diferencaCentavos = Math.round((valorTotal - valorParcela * numeroParcelas) * 100) / 100;
        const grupoId = `parc_${Date.now()}`;

        for (let indice = 0; indice < numeroParcelas; indice++) {
            const dataDaParcela = new Date(
                dataInicial.getFullYear(), dataInicial.getMonth() + indice, dataInicial.getDate(),
                dataInicial.getHours(), dataInicial.getMinutes()
            );
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

    async function salvarFixo(valor, categoria, descricaoBase, dataInicial) {
        const grupoId = `fixo_${Date.now()}`;
        const diaOriginal = dataInicial.getDate();

        for (let indice = 0; indice < 12; indice++) {
            const anoDestino = dataInicial.getFullYear();
            const mesDestino = dataInicial.getMonth() + indice;
            const ultimoDiaDoMes = new Date(anoDestino, mesDestino + 1, 0).getDate();
            const diaFinal = Math.min(diaOriginal, ultimoDiaDoMes);
            const dataDoMes = new Date(anoDestino, mesDestino, diaFinal, dataInicial.getHours(), dataInicial.getMinutes());

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
            renderizarGrafico(snapshot.docs);
        });
    }

    // ==========================================================================
    // BANNER DE SALÁRIO — consulta própria, olhando pro mês corrente de
    // verdade, independente de qual mês está sendo exibido na tela
    // ==========================================================================
    function escutarSalarioDoMes() {
        if (pararDeEscutarSalario) pararDeEscutarSalario();

        const hoje = new Date();
        const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const inicioProximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(
            referencia,
            where("data", ">=", Timestamp.fromDate(inicioMesAtual)),
            where("data", "<", Timestamp.fromDate(inicioProximoMes)),
            where("categoria", "==", "Salário")
        );

        pararDeEscutarSalario = onSnapshot(consulta, (snapshot) => {
            bannerSalario.hidden = !snapshot.empty;
        });

        perguntaSalario.textContent = primeiroNome
            ? `Olá, ${primeiroNome}! Já recebeu seu salário deste mês?`
            : "Já recebeu seu salário deste mês?";
        valorSalarioBanner.value = salarioPadrao;
    }

    botaoConfirmarSalario.addEventListener("click", async () => {
        const valor = parseFloat(valorSalarioBanner.value);
        if (!valor || valor <= 0) return;

        botaoConfirmarSalario.disabled = true;

        await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "ganho",
            valor: valor,
            categoria: "Salário",
            descricao: "",
            data: Timestamp.fromDate(new Date()),
            criadoEm: serverTimestamp()
        });

        botaoConfirmarSalario.disabled = false;
    });

    // ==========================================================================
    // 11. DESENHAR A LISTA (só os últimos N, o resto fica no Extrato Completo)
    // ==========================================================================
    function renderizarLista(documentos) {
        listaLancamentos.innerHTML = "";

        // A "Retirada" (valor negativo em "Guardar Dinheiro") é só um registro
        // interno de controle do cofrinho — quem representa o dinheiro voltando
        // pro saldo, de forma visível pra pessoa, é a "Retirada da Reserva"
        const documentosParaExibir = documentos.filter(
            (documento) => !(documento.data().categoria === "Guardar Dinheiro" && documento.data().valor < 0)
        );

        listaVazia.hidden = documentosParaExibir.length > 0;

        const documentosVisiveis = documentosParaExibir.slice(0, LIMITE_ITENS_LISTA_INICIAL);

        documentosVisiveis.forEach((documento) => {
            const dados = documento.data();
            const dataObj = dados.data.toDate();
            const dataFormatada = dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const horaFormatada = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
            const sinal = dados.tipo === "ganho" ? "+" : "-";

            const item = document.createElement("li");
            item.className = `item-lancamento tipo-${dados.tipo}`;
            item.dataset.id = documento.id;
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
            item.dataset.dados = JSON.stringify({ tipo: dados.tipo, valor: dados.valor, categoria: dados.categoria, descricao: dados.descricao || "" });
            item._dadosOriginais = dados;
            listaLancamentos.appendChild(item);
        });
    }

    // Clique no lançamento (fora do botão de excluir) abre edição
    listaLancamentos.addEventListener("click", async (evento) => {
        const botaoExcluir = evento.target.closest(".botao-excluir");
        if (botaoExcluir) {
            const confirmou = window.confirm("Tem certeza de que deseja excluir este lançamento?");
            if (!confirmou) return;
            await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botaoExcluir.dataset.id));
            return;
        }

        const item = evento.target.closest(".item-lancamento");
        if (item && item._dadosOriginais) {
            abrirModalEdicao(item.dataset.id, item._dadosOriginais);
        }
    });

    // ==========================================================================
    // 12. CALCULAR OS TOTAIS DO MÊS
    // ==========================================================================
    function calcularTotais(documentos) {
        let totalGanhos = 0;
        let totalGastos = 0;

        documentos.forEach((documento) => {
            const dados = documento.data();

            // "Guardar Dinheiro" tem uma regra própria, pra fechar a conta certinho:
            // - Depósito (valor positivo): reduz o saldo, como se fosse um gasto —
            //   o dinheiro "saiu" do disponível e foi pra reserva.
            // - Retirada (valor negativo, gerado automaticamente ao resgatar): NÃO
            //   mexe no saldo aqui — quem devolve o dinheiro é o lançamento separado
            //   "Retirada da Reserva" (esse sim conta como ganho normal). Se
            //   contássemos os dois, o valor voltaria em dobro.
            if (dados.categoria === "Guardar Dinheiro") {
                if (dados.valor > 0) totalGastos += dados.valor;
                return;
            }

            if (dados.tipo === "ganho") {
                totalGanhos += dados.valor;
            } else {
                totalGastos += dados.valor;
            }
        });

        totalGanhosEl.textContent = formatarMoeda(totalGanhos);
        totalGastosEl.textContent = formatarMoeda(totalGastos);
        saldoAtualDoMes = totalGanhos - totalGastos;
        totalSaldoEl.textContent = formatarMoeda(saldoAtualDoMes);
    }

    // ==========================================================================
    // FORMATAR MOEDA
    // ==========================================================================
    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    // ==========================================================================
    // GRÁFICO DE ROSCA — gastos por categoria do mês selecionado
    // Desenhado em SVG puro (sem biblioteca externa), pra não depender de
    // internet extra nem pesar o app.
    // ==========================================================================
    function renderizarGrafico(documentos) {
        const totaisPorCategoria = {};

        documentos.forEach((documento) => {
            const dados = documento.data();

            // Dinheiro guardado entra como uma fatia própria do gráfico, pra
            // mostrar o quanto foi poupado ao lado do que foi gasto
            if (dados.categoria === "Guardar Dinheiro") {
                totaisPorCategoria["Guardado"] = (totaisPorCategoria["Guardado"] || 0) + dados.valor;
                return;
            }

            if (dados.tipo !== "gasto") return;
            totaisPorCategoria[dados.categoria] = (totaisPorCategoria[dados.categoria] || 0) + dados.valor;
        });

        const categorias = Object.keys(totaisPorCategoria)
            .map((nome) => ({ nome, valor: totaisPorCategoria[nome] }))
            .filter((item) => item.valor > 0)
            .sort((a, b) => b.valor - a.valor);

        const totalGeral = categorias.reduce((soma, item) => soma + item.valor, 0);

        graficoDonut.innerHTML = "";
        legendaGrafico.innerHTML = "";

        if (totalGeral === 0) {
            graficoVazio.hidden = false;
            graficoDonut.closest(".cartao-grafico").hidden = true;
            return;
        }

        graficoVazio.hidden = true;
        graficoDonut.closest(".cartao-grafico").hidden = false;

        const raio = 50;
        const circunferencia = 2 * Math.PI * raio;
        let deslocamentoAcumulado = 0;

        categorias.forEach((item, indice) => {
            const percentual = item.valor / totalGeral;
            const cor = item.nome === "Guardado" ? "#34D399" : PALETA_GRAFICO[indice % PALETA_GRAFICO.length];
            const comprimentoFatia = percentual * circunferencia;

            const circulo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circulo.setAttribute("cx", "60");
            circulo.setAttribute("cy", "60");
            circulo.setAttribute("r", String(raio));
            circulo.setAttribute("fill", "none");
            circulo.setAttribute("stroke", cor);
            circulo.setAttribute("stroke-width", "16");
            circulo.setAttribute("stroke-dasharray", `${comprimentoFatia} ${circunferencia - comprimentoFatia}`);
            circulo.setAttribute("stroke-dashoffset", String(-deslocamentoAcumulado));
            graficoDonut.appendChild(circulo);

            deslocamentoAcumulado += comprimentoFatia;

            const itemLegenda = document.createElement("li");
            itemLegenda.className = "item-legenda";
            itemLegenda.innerHTML = `
                <span class="ponto-legenda" style="background-color: ${cor}"></span>
                <span class="nome-legenda">${item.nome}</span>
                <span class="percentual-legenda">${Math.round(percentual * 100)}%</span>
            `;
            legendaGrafico.appendChild(itemLegenda);
        });
    }

});
