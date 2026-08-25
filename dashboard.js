import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, updateDoc, setDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, orderBy, onSnapshot, Timestamp, serverTimestamp, writeBatch
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

// Navegação do calendário: do início do ano atual até dezembro de 2028 —
// dá espaço suficiente pra parcelamentos longos (até 48x) não ficarem sem
// mês pra "morar"
const LIMITE_NAVEGACAO_SUPERIOR = new Date(2028, 11, 1);
const LIMITE_NAVEGACAO_INFERIOR = new Date(new Date().getFullYear(), 0, 1);

document.addEventListener("DOMContentLoaded", function () {

    // ==========================================================================
    // 1. REFERÊNCIAS AOS ELEMENTOS DA TELA
    // ==========================================================================
    const emailUsuario = document.getElementById("email-usuario");

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
    const listaPendencias = document.getElementById("lista-pendencias");
    const pendenciasVazio = document.getElementById("pendencias-vazio");
    const linkExtrato = document.getElementById("link-extrato");

    const fundoModalEditarCategoria = document.getElementById("fundo-modal-editar-categoria");
    const botaoFecharEditarCategoria = document.getElementById("botao-fechar-editar-categoria");
    const campoNovoNomeCategoria = document.getElementById("campo-novo-nome-categoria");
    const campoLimiteCategoriaWrapper = document.getElementById("campo-limite-categoria-wrapper");
    const campoLimiteCategoria = document.getElementById("campo-limite-categoria");
    const mensagemAvisoEditarCategoria = document.getElementById("mensagem-aviso-editar-categoria");
    const botaoSalvarEditarCategoria = document.getElementById("botao-salvar-editar-categoria");
    const spinnerEditarCategoria = botaoSalvarEditarCategoria.querySelector(".spinner-botao");
    const fundoModalConselho = document.getElementById("fundo-modal-conselho");
    const botaoFecharConselho = document.getElementById("botao-fechar-conselho");
    const fundoModalAniversario = document.getElementById("fundo-modal-aniversario");
    const textoAniversario = document.getElementById("texto-aniversario");
    const botaoFecharAniversario = document.getElementById("botao-fechar-aniversario");
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
    const previewParcela = document.getElementById("preview-parcela");
    const campoCategoriaWrapper = document.getElementById("campo-categoria-wrapper");
    const rotuloCategoria = document.getElementById("rotulo-categoria");
    const rotuloNovaCategoria = document.getElementById("rotulo-nova-categoria");
    const campoCategoria = document.getElementById("campo-categoria");
    const botaoExcluirCategoria = document.getElementById("botao-excluir-categoria");
    const botaoEditarCategoria = document.getElementById("botao-editar-categoria");
    const campoNovaCategoriaWrapper = document.getElementById("campo-nova-categoria-wrapper");
    const campoNovaCategoria = document.getElementById("campo-nova-categoria");
    const campoDescricaoWrapper = document.getElementById("campo-descricao-wrapper");
    const campoDescricao = document.getElementById("campo-descricao");
    const campoData = document.getElementById("campo-data");
    const atalhoHoje = document.getElementById("atalho-hoje");
    const atalhoOntem = document.getElementById("atalho-ontem");
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
    let metasCustomizadas = []; // [{nome, id}] — usadas só no fluxo de Guardar
    let pararDeEscutar = null;
    let pararDeEscutarSalario = null;
    let salarioPadrao = 0;
    let mapaOrcamentos = {}; // {categoria: limite}
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
        await carregarOrcamentos();
        await carregarMetas();
        atualizarRotuloMes();
        escutarLancamentosDoMes();
        escutarPendenciasDoMes();
        buscarGastosMesAnterior();
        verificarConselhoMensal(perfil);
        verificarAniversario(perfil);

        // O banner de salário roda numa consulta separada, olhando pro mês
        // atual de verdade — independente de qual mês está sendo navegado
        if (salarioPadrao > 0) escutarSalarioDoMes();
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

        if (novaData > LIMITE_NAVEGACAO_SUPERIOR) {
            mesSelecionado = new Date(LIMITE_NAVEGACAO_SUPERIOR);
        } else if (novaData < LIMITE_NAVEGACAO_INFERIOR) {
            mesSelecionado = new Date(LIMITE_NAVEGACAO_INFERIOR);
        } else {
            mesSelecionado = novaData;
        }

        atualizarRotuloMes();
        escutarLancamentosDoMes();
        escutarPendenciasDoMes();
        buscarGastosMesAnterior();
    }

    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;

        const noLimiteSuperior = mesSelecionado.getFullYear() === LIMITE_NAVEGACAO_SUPERIOR.getFullYear()
            && mesSelecionado.getMonth() === LIMITE_NAVEGACAO_SUPERIOR.getMonth();
        const noLimiteInferior = mesSelecionado.getFullYear() === LIMITE_NAVEGACAO_INFERIOR.getFullYear()
            && mesSelecionado.getMonth() === LIMITE_NAVEGACAO_INFERIOR.getMonth();

        mesProximoBtn.disabled = noLimiteSuperior;
        anoProximoBtn.disabled = noLimiteSuperior;
        mesAnteriorBtn.disabled = noLimiteInferior;
        anoAnteriorBtn.disabled = noLimiteInferior;

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
    // ANIVERSÁRIO — compara dia/mês de nascimento com hoje; mostra 1x por ano
    // ==========================================================================
    async function verificarAniversario(perfil) {
        if (!perfil.dataNascimento) return;

        const hoje = new Date();
        const anoAtual = String(hoje.getFullYear());
        if (perfil.ultimoParabens === anoAtual) return; // já mostrou esse ano

        // dataNascimento vem como texto "AAAA-MM-DD" do campo de data
        const [, mesNascimento, diaNascimento] = perfil.dataNascimento.split("-").map(Number);

        const ehAniversario = (hoje.getMonth() + 1) === mesNascimento && hoje.getDate() === diaNascimento;
        if (!ehAniversario) return;

        textoAniversario.textContent = primeiroNome
            ? `Feliz aniversário, ${primeiroNome}! Que esse novo ano venha com muita saúde e as finanças sempre no verde. 🎂`
            : "Feliz aniversário! Que esse novo ano venha com muita saúde e as finanças sempre no verde. 🎂";

        fundoModalAniversario.classList.add("aberto");
        await setDoc(doc(db, "usuarios", uidAtual), { ultimoParabens: anoAtual }, { merge: true });
    }

    botaoFecharAniversario.addEventListener("click", () => {
        fundoModalAniversario.classList.remove("aberto");
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

    async function carregarOrcamentos() {
        const referencia = collection(db, "usuarios", uidAtual, "orcamentos");
        const resultado = await getDocs(referencia);

        mapaOrcamentos = {};
        resultado.forEach((documento) => {
            mapaOrcamentos[documento.id] = documento.data().limite;
        });
    }

    async function carregarMetas() {
        const referencia = collection(db, "usuarios", uidAtual, "metas");
        const resultado = await getDocs(referencia);

        metasCustomizadas = [];
        resultado.forEach((documento) => {
            metasCustomizadas.push({ nome: documento.data().nome, id: documento.id });
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

    // Reaproveita o mesmo select da categoria, só que com as metas de
    // "Guardar" no lugar — não tem categorias "fixas" aqui, só as criadas
    function popularSelectMetas() {
        campoCategoria.innerHTML = "";

        const opcaoSemMeta = document.createElement("option");
        opcaoSemMeta.value = "__sem_meta__";
        opcaoSemMeta.textContent = "Sem meta específica";
        campoCategoria.appendChild(opcaoSemMeta);

        metasCustomizadas.forEach((meta) => {
            const opcao = document.createElement("option");
            opcao.value = meta.nome;
            opcao.textContent = meta.nome;
            campoCategoria.appendChild(opcao);
        });

        const opcaoNova = document.createElement("option");
        opcaoNova.value = "__nova__";
        opcaoNova.textContent = "+ Nova meta";
        campoCategoria.appendChild(opcaoNova);
    }

    // Mostra a lixeira e o lápis só quando a categoria selecionada no momento
    // for uma que a própria pessoa criou (nunca nas fixas, tipo "Outros")
    function atualizarBotaoExcluirCategoria() {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        const ehCustomizada = opcaoSelecionada && opcaoSelecionada.dataset.customizada === "true";
        botaoExcluirCategoria.hidden = !ehCustomizada;
        botaoEditarCategoria.hidden = !ehCustomizada;
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
    // EDITAR CATEGORIA — nome e limite mensal, no mesmo lugar em que a
    // categoria é usada (lápis ao lado do select, dentro do formulário)
    // ==========================================================================
    let categoriaEmEdicaoId = null;
    let categoriaEmEdicaoNomeAntigo = null;

    botaoEditarCategoria.addEventListener("click", async () => {
        const opcaoSelecionada = campoCategoria.options[campoCategoria.selectedIndex];
        if (!opcaoSelecionada || opcaoSelecionada.dataset.customizada !== "true") return;

        categoriaEmEdicaoId = opcaoSelecionada.dataset.categoriaId;
        categoriaEmEdicaoNomeAntigo = opcaoSelecionada.value;

        campoNovoNomeCategoria.value = categoriaEmEdicaoNomeAntigo;
        campoLimiteCategoria.value = mapaOrcamentos[categoriaEmEdicaoNomeAntigo] || "";
        mensagemAvisoEditarCategoria.classList.remove("visivel");

        // "Limite mensal" só faz sentido pra categorias de Gasto — não existe
        // "limite" pra Ganho/Extra, então o campo nem aparece nesse caso
        campoLimiteCategoriaWrapper.hidden = tipoSelecionado !== "gasto";

        fundoModalEditarCategoria.classList.add("aberto");
    });

    function fecharModalEditarCategoria() {
        fundoModalEditarCategoria.classList.remove("aberto");
    }

    botaoFecharEditarCategoria.addEventListener("click", fecharModalEditarCategoria);
    fundoModalEditarCategoria.addEventListener("click", (evento) => {
        if (evento.target === fundoModalEditarCategoria) fecharModalEditarCategoria();
    });

    botaoSalvarEditarCategoria.addEventListener("click", async () => {
        const novoNome = campoNovoNomeCategoria.value.trim();
        const novoLimite = parseFloat(campoLimiteCategoria.value);
        mensagemAvisoEditarCategoria.classList.remove("visivel");

        if (!novoNome) {
            mensagemAvisoEditarCategoria.textContent = "Digita um nome pra categoria.";
            mensagemAvisoEditarCategoria.classList.add("visivel");
            return;
        }

        botaoSalvarEditarCategoria.disabled = true;
        spinnerEditarCategoria.hidden = false;

        try {
            const nomeMudou = novoNome !== categoriaEmEdicaoNomeAntigo;

            if (nomeMudou) {
                // 1) Atualiza o nome no documento da própria categoria
                await updateDoc(doc(db, "usuarios", uidAtual, "categorias", categoriaEmEdicaoId), {
                    nome: novoNome
                });

                // 2) Atualiza TODOS os lançamentos antigos que usavam o nome
                // velho, pra manter o histórico consistente (decisão já
                // combinada: atualizar tudo, não deixar "misturado")
                const referenciaLancamentos = collection(db, "usuarios", uidAtual, "lancamentos");
                const consultaAntigos = query(referenciaLancamentos, where("categoria", "==", categoriaEmEdicaoNomeAntigo));
                const lancamentosAntigos = await getDocs(consultaAntigos);

                if (!lancamentosAntigos.empty) {
                    const lote = writeBatch(db);
                    lancamentosAntigos.forEach((documento) => {
                        lote.update(documento.ref, { categoria: novoNome });
                    });
                    await lote.commit();
                }

                // 3) "Move" o orçamento configurado (só existe pro lado Gasto —
                // Firestore não deixa renomear o ID de um documento, então
                // apaga o antigo e cria um novo com o nome atualizado)
                if (tipoSelecionado === "gasto" && mapaOrcamentos[categoriaEmEdicaoNomeAntigo] !== undefined) {
                    await deleteDoc(doc(db, "usuarios", uidAtual, "orcamentos", categoriaEmEdicaoNomeAntigo)).catch(() => {});
                    delete mapaOrcamentos[categoriaEmEdicaoNomeAntigo];
                }
            }

            // Salva (ou remove) o limite mensal, só faz sentido pro lado Gasto
            if (tipoSelecionado === "gasto") {
                const referenciaOrcamento = doc(db, "usuarios", uidAtual, "orcamentos", novoNome);
                if (!novoLimite || novoLimite <= 0) {
                    await deleteDoc(referenciaOrcamento).catch(() => {});
                    delete mapaOrcamentos[novoNome];
                } else {
                    await setDoc(referenciaOrcamento, { categoria: novoNome, limite: novoLimite });
                    mapaOrcamentos[novoNome] = novoLimite;
                }
            }

            // Atualiza o estado local, sem precisar recarregar a página inteira
            const categoriaLocal = categoriasCustomizadas[tipoSelecionado].find((c) => c.id === categoriaEmEdicaoId);
            if (categoriaLocal) categoriaLocal.nome = novoNome;

            popularSelectCategorias();
            campoCategoria.value = novoNome;
            atualizarBotaoExcluirCategoria();

            fecharModalEditarCategoria();

        } catch (erro) {
            mensagemAvisoEditarCategoria.textContent = "Não deu pra salvar agora. Confere sua internet e tenta de novo.";
            mensagemAvisoEditarCategoria.classList.add("visivel");
        } finally {
            botaoSalvarEditarCategoria.disabled = false;
            spinnerEditarCategoria.hidden = true;
        }
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
        previewParcela.hidden = true;

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
        campoData.value = formatarDataParaCampo(dados.data.toDate());
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

        // No modo Guardar, o campo vira "Meta" em vez de "Categoria" —
        // reaproveita o mesmo select, só troca o rótulo e o conteúdo.
        // Importante: precisa desligar o "required" quando o campo tá
        // escondido (isso não acontece mais aqui, mas o padrão se mantém
        // por segurança), senão o navegador bloqueia o envio do formulário
        campoCategoriaWrapper.hidden = false;
        campoCategoria.required = true;
        campoNovaCategoriaWrapper.hidden = true;
        botaoExcluirCategoria.hidden = true;
        botaoEditarCategoria.hidden = true;

        if (modoGuardar) {
            rotuloCategoria.textContent = "Meta";
            rotuloNovaCategoria.textContent = "Nome da nova meta";
            popularSelectMetas();
        } else {
            rotuloCategoria.textContent = "Categoria";
            rotuloNovaCategoria.textContent = "Nome da nova categoria";
            popularSelectCategorias();
        }

        campoDescricaoWrapper.hidden = modoGuardar;
        campoDescricao.required = false;

        const hoje = new Date();
        campoData.value = formatarDataParaCampo(hoje);
        campoValor.focus();
    }

    // Formata pro padrão AAAA-MM-DD que o input[type=date] espera, usando o
    // horário LOCAL do aparelho (evita o bug clássico de virar o dia errado
    // perto da meia-noite, que aconteceria usando toISOString diretamente
    // em fusos negativos como o do Brasil)
    function formatarDataParaCampo(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, "0");
        const dia = String(data.getDate()).padStart(2, "0");
        return `${ano}-${mes}-${dia}`;
    }

    atalhoHoje.addEventListener("click", () => {
        campoData.value = formatarDataParaCampo(new Date());
    });

    atalhoOntem.addEventListener("click", () => {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        campoData.value = formatarDataParaCampo(ontem);
    });

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
        atualizarPreviewParcela();
    }

    // Mostra "= 6x de R$ 8,33" em tempo real, assim que a pessoa digita o
    // valor total e o número de parcelas — evita confusão tipo "coloquei 50
    // e apareceu 8,33" (o app está certo, só faltava deixar isso visível antes)
    function atualizarPreviewParcela() {
        if (!campoParcelado.checked) {
            previewParcela.hidden = true;
            return;
        }

        const total = parseFloat(campoValor.value);
        const numeroParcelas = parseInt(campoParcelas.value, 10);

        if (!total || total <= 0 || !numeroParcelas || numeroParcelas < 2) {
            previewParcela.hidden = true;
            return;
        }

        const valorPorParcela = total / numeroParcelas;
        previewParcela.textContent = `= ${numeroParcelas}x de ${formatarMoeda(valorPorParcela)}`;
        previewParcela.hidden = false;
    }

    campoValor.addEventListener("input", atualizarPreviewParcela);
    campoParcelas.addEventListener("input", atualizarPreviewParcela);

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
    // realmente registrou aquilo, e faz lançamentos ficarem ordenados
    // certinho (do mais recente pro mais antigo), com precisão até o
    // milissegundo — sem isso, dois lançamentos no mesmo minuto "empatavam"
    // e a ordem entre eles ficava meio aleatória
    function construirDataComHorarioReal(dataDoCampo) {
        const agora = new Date();
        const [ano, mes, dia] = dataDoCampo.split("-").map(Number);
        return new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds(), agora.getMilliseconds());
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
        let metaFinal = null;

        if (modoGuardar) {
            if (categoriaFinal === "__nova__") {
                const novaMeta = campoNovaCategoria.value.trim();
                if (!novaMeta) {
                    mostrarAviso("Digita o nome da nova meta.");
                    return;
                }
                metaFinal = novaMeta;
            } else if (categoriaFinal === "__sem_meta__") {
                metaFinal = null;
            } else {
                metaFinal = categoriaFinal;
            }
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

            if (modoGuardar && campoCategoria.value === "__nova__") {
                const referenciaMeta = await addDoc(collection(db, "usuarios", uidAtual, "metas"), {
                    nome: metaFinal
                });
                metasCustomizadas.push({ nome: metaFinal, id: referenciaMeta.id });
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
                    criadoEm: serverTimestamp(),
                    ...(modoGuardar ? { meta: metaFinal } : {})
                });
            }

            fecharModal();

        } catch (erro) {
            mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
        } finally {
            definirCarregando(false);
        }
    });

    // Cria uma "pendência" por parcela — nenhuma delas mexe no saldo ainda.
    // Só quando a pessoa marcar como paga (lá na seção "Pagamentos Pendentes")
    // é que vira um lançamento de verdade.
    async function salvarParcelado(valorTotal, numeroParcelas, categoria, descricaoBase, dataInicial) {
        const valorParcela = Math.floor((valorTotal / numeroParcelas) * 100) / 100;
        const diferencaCentavos = Math.round((valorTotal - valorParcela * numeroParcelas) * 100) / 100;
        const grupoId = `parc_${Date.now()}`;

        for (let indice = 0; indice < numeroParcelas; indice++) {
            const anoDestino = dataInicial.getFullYear();
            const mesDestino = dataInicial.getMonth() + indice;
            const ultimoDiaDoMes = new Date(anoDestino, mesDestino + 1, 0).getDate();
            const diaFinal = Math.min(dataInicial.getDate(), ultimoDiaDoMes);
            const mesReferencia = `${new Date(anoDestino, mesDestino, 1).getFullYear()}-${String(new Date(anoDestino, mesDestino, 1).getMonth() + 1).padStart(2, "0")}`;

            const ehUltima = indice === numeroParcelas - 1;
            const valorDessaParcela = ehUltima ? valorParcela + diferencaCentavos : valorParcela;

            await addDoc(collection(db, "usuarios", uidAtual, "pendencias"), {
                valor: valorDessaParcela,
                categoria,
                descricao: descricaoBase || categoria,
                diaDoMes: diaFinal,
                mesReferencia,
                origem: "parcelado",
                numeroParcela: indice + 1,
                totalParcelas: numeroParcelas,
                grupoId,
                pago: false,
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
            const mesReferencia = `${new Date(anoDestino, mesDestino, 1).getFullYear()}-${String(new Date(anoDestino, mesDestino, 1).getMonth() + 1).padStart(2, "0")}`;

            await addDoc(collection(db, "usuarios", uidAtual, "pendencias"), {
                valor,
                categoria,
                descricao: descricaoBase || categoria,
                diaDoMes: diaFinal,
                mesReferencia,
                origem: "fixo",
                grupoId,
                pago: false,
                criadoEm: serverTimestamp()
            });
        }
    }

    // ==========================================================================
    // PAGAMENTOS PENDENTES — gastos fixos e parcelas do mês selecionado.
    // Ficam separados dos lançamentos normais até serem marcados como pagos.
    // ==========================================================================
    let pararDeEscutarPendencias = null;

    function escutarPendenciasDoMes() {
        if (pararDeEscutarPendencias) pararDeEscutarPendencias();

        const mesReferencia = `${mesSelecionado.getFullYear()}-${String(mesSelecionado.getMonth() + 1).padStart(2, "0")}`;
        const referencia = collection(db, "usuarios", uidAtual, "pendencias");
        const consulta = query(referencia, where("mesReferencia", "==", mesReferencia));

        pararDeEscutarPendencias = onSnapshot(consulta, (snapshot) => {
            const documentosOrdenados = [...snapshot.docs].sort((a, b) => a.data().diaDoMes - b.data().diaDoMes);
            renderizarPendencias(documentosOrdenados);
        });
    }

    function renderizarPendencias(documentos) {
        listaPendencias.innerHTML = "";
        pendenciasVazio.hidden = documentos.length > 0;

        documentos.forEach((documento) => {
            const dados = documento.data();
            const badgeParcela = dados.origem === "parcelado"
                ? `<span class="badge-parcela">Parcela ${dados.numeroParcela}/${dados.totalParcelas}</span>`
                : `<span class="badge-parcela">Fixo</span>`;

            // Só o Gasto Fixo tem a opção de cancelar tudo de uma vez — parcela
            // tem quantidade combinada (fim natural), fixo é indefinido, então
            // faz mais sentido oferecer esse "desligar" aqui
            const linkCancelar = dados.origem === "fixo" && dados.grupoId
                ? `<button class="link-cancelar-recorrencia" data-grupo="${dados.grupoId}">Cancelar recorrência</button>`
                : "";

            const item = document.createElement("li");
            item.className = "item-conta";
            item.innerHTML = `
                <div class="info-conta">
                    <div class="nome-conta">${dados.descricao}${badgeParcela}</div>
                    <div class="meta-conta">${dados.categoria} · Dia ${dados.diaDoMes}</div>
                    ${linkCancelar}
                </div>
                <span class="valor-conta">${formatarMoeda(dados.valor)}</span>
                <div class="status-conta">
                    <button class="botao-marcar-pago ${dados.pago ? "pago" : ""}" data-id="${documento.id}" data-pago="${dados.pago}">
                        ${dados.pago ? "✓ Paga" : "Marcar como paga"}
                    </button>
                    <button class="botao-excluir-conta" data-id="${documento.id}" aria-label="Excluir pendência">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
                        </svg>
                    </button>
                </div>
            `;
            listaPendencias.appendChild(item);
        });
    }

    listaPendencias.addEventListener("click", async (evento) => {
        const botaoCancelarRecorrencia = evento.target.closest(".link-cancelar-recorrencia");
        if (botaoCancelarRecorrencia) {
            const confirmou = window.confirm("Isso cancela as próximas ocorrências desse gasto fixo. As que já foram marcadas como pagas continuam no seu histórico normalmente. Tem certeza?");
            if (!confirmou) return;

            const grupoId = botaoCancelarRecorrencia.dataset.grupo;
            const referenciaPendencias = collection(db, "usuarios", uidAtual, "pendencias");
            const consultaGrupo = query(referenciaPendencias, where("grupoId", "==", grupoId), where("pago", "==", false));
            const pendenciasDoGrupo = await getDocs(consultaGrupo);

            for (const documento of pendenciasDoGrupo.docs) {
                await deleteDoc(documento.ref);
            }
            return;
        }

        const botaoExcluir = evento.target.closest(".botao-excluir-conta");
        if (botaoExcluir) {
            const confirmou = window.confirm("Tem certeza de que deseja excluir essa pendência? Se ela já estava marcada como paga, o lançamento correspondente também será removido do saldo.");
            if (!confirmou) return;

            const referenciaPendenciaExcluir = doc(db, "usuarios", uidAtual, "pendencias", botaoExcluir.dataset.id);
            const snapshotExcluir = await getDoc(referenciaPendenciaExcluir);
            const dadosExcluir = snapshotExcluir.exists() ? snapshotExcluir.data() : null;

            // Se a pendência já tinha sido marcada como paga, o lançamento
            // real vinculado a ela também precisa ser apagado — senão ele
            // fica órfão, do mesmo jeito que o bug de desmarcar que já corrigimos
            if (dadosExcluir && dadosExcluir.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", dadosExcluir.lancamentoId)).catch(() => {});
            }

            await deleteDoc(referenciaPendenciaExcluir);
            return;
        }

        const botaoPago = evento.target.closest(".botao-marcar-pago");
        if (!botaoPago) return;

        const jaEstavaPago = botaoPago.dataset.pago === "true";
        const idPendencia = botaoPago.dataset.id;
        const referenciaPendencia = doc(db, "usuarios", uidAtual, "pendencias", idPendencia);

        if (jaEstavaPago) {
            const confirmouDesmarcar = window.confirm("Tem certeza de que deseja desmarcar esse pagamento? O lançamento correspondente vai ser removido do saldo e do extrato.");
            if (!confirmouDesmarcar) return;

            // Desmarcar precisa apagar o lançamento real que foi criado quando
            // marcou como paga — senão ele fica "preso" pra sempre, afetando o
            // saldo mesmo depois de desmarcado (e duplicando se marcar de novo)
            const snapshotAtual = await getDoc(referenciaPendencia);
            const dadosAtuais = snapshotAtual.exists() ? snapshotAtual.data() : null;

            if (dadosAtuais && dadosAtuais.lancamentoId) {
                await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", dadosAtuais.lancamentoId)).catch(() => {});
            }

            await updateDoc(referenciaPendencia, { pago: false, lancamentoId: null });
            return;
        }

        const confirmouPagar = window.confirm("Tem certeza de que esse pagamento já foi feito? Isso vai descontar o valor do seu saldo.");
        if (!confirmouPagar) return;

        // Marcar como paga: busca os dados da própria pendência pra criar o
        // lançamento de verdade (é isso que desconta do saldo e aparece no extrato)
        const snapshotPendencia = await getDoc(referenciaPendencia);
        if (!snapshotPendencia.exists()) return;
        const dadosPendencia = snapshotPendencia.data();

        const [ano, mes] = dadosPendencia.mesReferencia.split("-").map(Number);
        const agoraDoPagamento = new Date();
        const dataDoPagamento = new Date(
            ano, mes - 1, dadosPendencia.diaDoMes,
            agoraDoPagamento.getHours(), agoraDoPagamento.getMinutes(),
            agoraDoPagamento.getSeconds(), agoraDoPagamento.getMilliseconds()
        );

        const novoLancamento = await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
            tipo: "gasto",
            valor: dadosPendencia.valor,
            categoria: dadosPendencia.categoria,
            descricao: dadosPendencia.descricao,
            data: Timestamp.fromDate(dataDoPagamento),
            criadoEm: serverTimestamp()
        });

        await updateDoc(referenciaPendencia, { pago: true, lancamentoId: novoLancamento.id });
    });

    // ==========================================================================
    // COMPARAÇÃO COM O MÊS ANTERIOR
    // ==========================================================================
    const comparacaoMesAnteriorEl = document.getElementById("comparacao-mes-anterior");
    let gastosMesAnterior = null;
    let totalGastosAtual = 0;

    async function buscarGastosMesAnterior() {
        const anoAnterior = mesSelecionado.getMonth() === 0 ? mesSelecionado.getFullYear() - 1 : mesSelecionado.getFullYear();
        const mesAnteriorIndice = mesSelecionado.getMonth() === 0 ? 11 : mesSelecionado.getMonth() - 1;

        const inicio = new Date(anoAnterior, mesAnteriorIndice, 1);
        const fim = new Date(anoAnterior, mesAnteriorIndice + 1, 1);

        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(
            referencia,
            where("data", ">=", Timestamp.fromDate(inicio)),
            where("data", "<", Timestamp.fromDate(fim))
        );

        const resultado = await getDocs(consulta);
        let total = 0;
        resultado.forEach((documento) => {
            const dados = documento.data();
            if (dados.categoria === "Guardar Dinheiro") {
                if (dados.valor > 0) total += dados.valor;
                return;
            }
            if (dados.tipo === "gasto") total += dados.valor;
        });

        gastosMesAnterior = total;
        atualizarComparacaoMesAnterior();
    }

    // Recalcula toda vez que os totais do mês atual mudam (chamada lá de
    // dentro de calcularTotais), pra manter a comparação sempre correta
    function atualizarComparacaoMesAnterior() {
        if (gastosMesAnterior === null || gastosMesAnterior <= 0 || totalGastosAtual <= 0) {
            comparacaoMesAnteriorEl.hidden = true;
            return;
        }

        const diferencaPercentual = ((totalGastosAtual - gastosMesAnterior) / gastosMesAnterior) * 100;
        const arredondado = Math.round(Math.abs(diferencaPercentual));

        if (arredondado === 0) {
            comparacaoMesAnteriorEl.hidden = true;
            return;
        }

        const gastouMais = diferencaPercentual > 0;
        comparacaoMesAnteriorEl.hidden = false;
        comparacaoMesAnteriorEl.classList.toggle("gastou-mais", gastouMais);
        comparacaoMesAnteriorEl.classList.toggle("gastou-menos", !gastouMais);
        comparacaoMesAnteriorEl.innerHTML = `<span class="seta-comparacao">${gastouMais ? "▲" : "▼"}</span> Você gastou ${arredondado}% ${gastouMais ? "a mais" : "a menos"} que no mês anterior`;
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

        // Só um filtro aqui de propósito (categoria) — evita precisar de
        // índice composto no Firestore, igual já resolvemos no Saldo Guardado.
        // O "é desse mês?" é conferido do lado do app, depois que os dados chegam.
        const referencia = collection(db, "usuarios", uidAtual, "lancamentos");
        const consulta = query(referencia, where("categoria", "==", "Salário"));

        pararDeEscutarSalario = onSnapshot(consulta, (snapshot) => {
            const hoje = new Date();
            const jaTemSalarioEsteMes = snapshot.docs.some((documento) => {
                const dataDoDocumento = documento.data().data.toDate();
                return dataDoDocumento.getFullYear() === hoje.getFullYear()
                    && dataDoDocumento.getMonth() === hoje.getMonth();
            });
            bannerSalario.hidden = jaTemSalarioEsteMes;
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
            const metaTexto = dados.meta ? ` · Meta: ${dados.meta}` : "";
            item.innerHTML = `
                <span class="ponto-categoria"></span>
                <div class="info-lancamento">
                    <div class="descricao-lancamento">${dados.descricao || dados.categoria}</div>
                    <div class="meta-lancamento">${dados.categoria}${metaTexto} · ${dataFormatada} às ${horaFormatada}</div>
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
            const itemPai = botaoExcluir.closest(".item-lancamento");
            const dadosDoItem = itemPai ? itemPai._dadosOriginais : null;

            // Itens do cofrinho ("Guardar Dinheiro") só podem ser excluídos
            // pela tela "Saldo Guardado" — excluir daqui, sem querer, deixava
            // o total do cofrinho desbalanceado (podendo até ficar negativo)
            if (dadosDoItem && dadosDoItem.categoria === "Guardar Dinheiro") {
                window.alert("Esse lançamento faz parte do seu Saldo Guardado. Pra excluir ou ajustar, vai em Saldo Guardado no menu lateral.");
                return;
            }

            const confirmou = window.confirm("Tem certeza de que deseja excluir este lançamento?");
            if (!confirmou) return;
            await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", botaoExcluir.dataset.id));
            return;
        }

        const item = evento.target.closest(".item-lancamento");
        if (item && item._dadosOriginais) {
            if (item._dadosOriginais.categoria === "Guardar Dinheiro") {
                window.alert("Esse lançamento faz parte do seu Saldo Guardado e não pode ser editado por aqui.");
                return;
            }
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

        totalGastosAtual = totalGastos;
        atualizarComparacaoMesAnterior();
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

            const limiteConfigurado = mapaOrcamentos[item.nome];
            let barraHtml = "";
            if (limiteConfigurado && limiteConfigurado > 0) {
                const percentualUsado = Math.min(100, (item.valor / limiteConfigurado) * 100);
                const classeCor = percentualUsado >= 100 ? "estourou" : (percentualUsado >= 80 ? "aviso" : "");
                barraHtml = `
                    <div class="barra-orcamento-item">
                        <div class="barra-orcamento-wrapper">
                            <div class="barra-orcamento-preenchida ${classeCor}" style="width: ${percentualUsado}%"></div>
                        </div>
                        <div class="texto-barra-orcamento">${formatarMoeda(item.valor)} de ${formatarMoeda(limiteConfigurado)}</div>
                    </div>
                `;
            }

            itemLegenda.innerHTML = `
                <span class="ponto-legenda" style="background-color: ${cor}"></span>
                <span class="nome-legenda">${item.nome}</span>
                <span class="percentual-legenda">${Math.round(percentual * 100)}%</span>
                ${barraHtml}
            `;
            legendaGrafico.appendChild(itemLegenda);
        });
    }

});
