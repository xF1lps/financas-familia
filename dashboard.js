// ==========================================================================
// Importa a conexão com o Firebase e as funções específicas que vamos usar
// ==========================================================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, addDoc, deleteDoc, doc, getDoc, getDocs,
    query, where, orderBy, onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================================================
// CATEGORIAS PADRÃO (fixas)
// Essas já vêm prontas pra qualquer usuário novo, sem precisar cadastrar nada.
// As categorias CRIADAS pela pessoa (customizadas) ficam salvas no Firestore,
// dentro de usuarios/{uid}/categorias, e se somam a essa lista abaixo.
// ==========================================================================
const CATEGORIAS_PADRAO = {
    gasto: ["Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Besteiras", "Contas Fixas", "Outros"],
    ganho: ["Salário", "Extra", "Presente", "Outros"]
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

    const tipoGastoBtn = document.getElementById("tipo-gasto");
    const tipoGanhoBtn = document.getElementById("tipo-ganho");

    const formulario = document.getElementById("formulario-lancamento");
    const campoValor = document.getElementById("campo-valor");
    const campoCategoria = document.getElementById("campo-categoria");
    const campoNovaCategoriaWrapper = document.getElementById("campo-nova-categoria-wrapper");
    const campoNovaCategoria = document.getElementById("campo-nova-categoria");
    const campoDescricao = document.getElementById("campo-descricao");
    const campoData = document.getElementById("campo-data");
    const mensagemAviso = document.getElementById("mensagem-aviso-modal");
    const botaoSalvar = document.getElementById("botao-salvar-lancamento");
    const textoBotaoSalvar = botaoSalvar.querySelector(".texto-botao");
    const spinnerSalvar = botaoSalvar.querySelector(".spinner-botao");

    // ==========================================================================
    // 2. ESTADO DA TELA (variáveis que mudam conforme a pessoa usa o app)
    // ==========================================================================
    let uidAtual = null;                 // ID do usuário logado
    let mesSelecionado = new Date();     // Mês que está sendo exibido no momento
    let tipoSelecionado = "gasto";       // Aba ativa no modal: "gasto" ou "ganho"
    let categoriasCustomizadas = { gasto: [], ganho: [] }; // Vêm do Firestore
    let pararDeEscutar = null;           // Função pra "desligar" o listener em tempo real do mês anterior
    let rendaEhDiaria = false;           // true se a pessoa marcou "Diarista" no onboarding

    // ==========================================================================
    // 3. VERIFICAR LOGIN — se não estiver logado, manda pra tela de login
    // ==========================================================================
    onAuthStateChanged(auth, async (usuario) => {
        if (!usuario) {
            window.location.href = "index.html";
            return;
        }

        uidAtual = usuario.uid;
        emailUsuario.textContent = usuario.email;

        // Confere se o onboarding já foi preenchido — se não, manda pra lá antes
        const perfilSnapshot = await getDoc(doc(db, "usuarios", uidAtual));
        if (!perfilSnapshot.exists() || perfilSnapshot.data().onboardingCompleto !== true) {
            window.location.href = "onboarding.html";
            return;
        }
        rendaEhDiaria = perfilSnapshot.data().renda === "diaria";

        await carregarCategoriasCustomizadas();
        atualizarRotuloMes();
        escutarLancamentosDoMes();
    });

    botaoSair.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "index.html";
    });

    // ==========================================================================
    // 4. NAVEGAÇÃO ENTRE MESES
    // ==========================================================================
    mesAnteriorBtn.addEventListener("click", () => mudarMes(-1));
    mesProximoBtn.addEventListener("click", () => mudarMes(1));

    function mudarMes(direcao) {
        // Cria uma nova data baseada no mês atual, somando ou subtraindo 1 mês
        mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + direcao, 1);
        atualizarRotuloMes();
        escutarLancamentosDoMes();
    }

    function atualizarRotuloMes() {
        rotuloMes.textContent = `${NOMES_MESES[mesSelecionado.getMonth()]} ${mesSelecionado.getFullYear()}`;
    }

    // ==========================================================================
    // 5. CATEGORIAS — carregar as customizadas e popular o <select> do modal
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

        // Opção especial no final, pra criar uma categoria nova na hora
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
    // 6. ALTERNAR ENTRE AS ABAS "GASTO" E "GANHO" DENTRO DO MODAL
    // ==========================================================================
    function selecionarTipo(tipo) {
        tipoSelecionado = tipo;
        tipoGastoBtn.classList.toggle("ativa", tipo === "gasto");
        tipoGanhoBtn.classList.toggle("ativa", tipo === "ganho");
        popularSelectCategorias();
    }

    tipoGastoBtn.addEventListener("click", () => selecionarTipo("gasto"));
    tipoGanhoBtn.addEventListener("click", () => selecionarTipo("ganho"));

    // ==========================================================================
    // 7. ABRIR E FECHAR O MODAL
    // ==========================================================================
    function abrirModal() {
        formulario.reset();
        esconderAviso();
        selecionarTipo("gasto");
        campoNovaCategoriaWrapper.hidden = true;

        // Preenche a data com o dia de hoje, no formato que o input[type=date] espera (AAAA-MM-DD)
        const hoje = new Date();
        campoData.value = hoje.toISOString().split("T")[0];

        fundoModal.classList.add("aberto");
    }

    function fecharModal() {
        fundoModal.classList.remove("aberto");
    }

    botaoAbrirModal.addEventListener("click", abrirModal);
    botaoFecharModal.addEventListener("click", fecharModal);

    // Clicar no fundo escurecido (fora do cartão branco) também fecha
    fundoModal.addEventListener("click", (evento) => {
        if (evento.target === fundoModal) fecharModal();
    });

    // ==========================================================================
    // 8. MENSAGENS DE AVISO/ERRO DENTRO DO MODAL
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
    // 9. SALVAR UM NOVO LANÇAMENTO (o coração do dashboard)
    // ==========================================================================
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        esconderAviso();

        const valor = parseFloat(campoValor.value);
        if (!valor || valor <= 0) {
            mostrarAviso("Digita um valor maior que zero.");
            return;
        }

        let categoriaFinal = campoCategoria.value;

        // Se a pessoa escolheu "+ Nova categoria", valida e usa o texto digitado
        if (categoriaFinal === "__nova__") {
            const nomeNovaCategoria = campoNovaCategoria.value.trim();
            if (!nomeNovaCategoria) {
                mostrarAviso("Digita o nome da nova categoria.");
                return;
            }
            categoriaFinal = nomeNovaCategoria;
        }

        definirCarregando(true);

        try {
            // Se for uma categoria nova, salva ela primeiro, pra aparecer nas próximas vezes
            if (campoCategoria.value === "__nova__") {
                await addDoc(collection(db, "usuarios", uidAtual, "categorias"), {
                    nome: categoriaFinal,
                    tipo: tipoSelecionado
                });
                categoriasCustomizadas[tipoSelecionado].push(categoriaFinal);
            }

            // Converte a data digitada (texto "AAAA-MM-DD") num horário válido do dia,
            // e depois num Timestamp do Firestore (formato que ele entende)
            const dataEscolhida = new Date(`${campoData.value}T12:00:00`);

            await addDoc(collection(db, "usuarios", uidAtual, "lancamentos"), {
                tipo: tipoSelecionado,
                valor: valor,
                categoria: categoriaFinal,
                descricao: campoDescricao.value.trim(),
                data: Timestamp.fromDate(dataEscolhida),
                criadoEm: serverTimestamp()
            });

            fecharModal();

        } catch (erro) {
            mostrarAviso("Não deu pra salvar agora. Confere sua internet e tenta de novo.");
        } finally {
            definirCarregando(false);
        }
    });

    // ==========================================================================
    // 10. ESCUTAR OS LANÇAMENTOS DO MÊS SELECIONADO, EM TEMPO REAL
    // "Em tempo real" quer dizer: se um lançamento for salvo ou excluído, a lista
    // e os totais atualizam sozinhos na tela, sem precisar recarregar a página.
    // ==========================================================================
    function escutarLancamentosDoMes() {
        // Se já existia um listener rodando (de um mês anterior), desliga ele antes
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
    // BANNER DO DIARISTA — mostra só se: a pessoa marcou "Diarista" no
    // onboarding, o mês exibido é o mês atual, e ainda não tem nenhum ganho
    // lançado com data de hoje.
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
            const dataLancamento = dados.data.toDate();
            return dados.tipo === "ganho"
                && dataLancamento.toDateString() === hoje.toDateString();
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

    // Um único listener de clique na lista inteira (mais eficiente do que
    // colocar um listener em cada botão de excluir individualmente)
    listaLancamentos.addEventListener("click", async (evento) => {
        const botao = evento.target.closest(".botao-excluir");
        if (!botao) return;

        const idLancamento = botao.dataset.id;
        await deleteDoc(doc(db, "usuarios", uidAtual, "lancamentos", idLancamento));
    });

    // ==========================================================================
    // 12. CALCULAR OS TOTAIS DO MÊS (ganhos, gastos, saldo)
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
    // 13. FORMATAR NÚMERO COMO MOEDA BRASILEIRA (ex: 1234.5 → "R$ 1.234,50")
    // ==========================================================================
    function formatarMoeda(valor) {
        return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

});
