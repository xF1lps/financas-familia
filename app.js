import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const abaEntrar = document.getElementById("aba-entrar");
    const abaCadastro = document.getElementById("aba-cadastro");
    const campoConfirmar = document.getElementById("campo-confirmar");
    const campoConfirmarSenha = document.getElementById("campo-confirmar-senha");
    const formulario = document.getElementById("formulario-acesso");
    const campoEmail = document.getElementById("campo-email");
    const campoSenha = document.getElementById("campo-senha");
    const botaoEnviar = document.getElementById("botao-enviar");
    const botaoGoogle = document.getElementById("botao-google");
    const textoBotao = botaoEnviar.querySelector(".texto-botao");
    const spinnerBotao = botaoEnviar.querySelector(".spinner-botao");
    const mensagemAviso = document.getElementById("mensagem-aviso");
    const botaoOlho = document.getElementById("botao-olho");
    const botaoOlhoConfirmar = document.getElementById("botao-olho-confirmar");
    const linkEsqueciSenha = document.getElementById("link-esqueci-senha");
    const telaCarregamento = document.getElementById("tela-carregamento");

    // ==========================================================================
    // TELA DE CARREGAMENTO — com rede de segurança
    // A splash fica visível até o Firebase confirmar se a pessoa já está
    // logada. Só que, se por qualquer motivo isso demorar demais (internet
    // ruim, Firebase fora do ar, etc.), o TEMPO_MAXIMO_SEGURANCA garante que
    // ela some sozinha de qualquer jeito — nunca mais fica travada pra sempre.
    // ==========================================================================
    const TEMPO_MINIMO_VISIVEL = 800;   // pra dar tempo da animação aparecer bonita
    const TEMPO_MAXIMO_SEGURANCA = 4000; // rede de segurança: nunca passa disso
    const inicioCarregamento = Date.now();
    let splashJaEscondida = false;

    function esconderSplash() {
        if (splashJaEscondida) return;
        splashJaEscondida = true;

        const decorrido = Date.now() - inicioCarregamento;
        const espera = Math.max(0, TEMPO_MINIMO_VISIVEL - decorrido);
        setTimeout(() => telaCarregamento.classList.add("oculto"), espera);
    }

    // Rede de segurança: dispara sozinha, independente de qualquer outra coisa
    setTimeout(esconderSplash, TEMPO_MAXIMO_SEGURANCA);

    let modoAtual = "entrar";

    function mudarPara(modo) {
        modoAtual = modo;
        esconderAviso();

        const ehCadastro = modo === "cadastro";

        abaEntrar.classList.toggle("ativa", !ehCadastro);
        abaCadastro.classList.toggle("ativa", ehCadastro);
        abaEntrar.setAttribute("aria-selected", String(!ehCadastro));
        abaCadastro.setAttribute("aria-selected", String(ehCadastro));

        campoConfirmar.hidden = !ehCadastro;
        campoConfirmarSenha.required = ehCadastro;

        textoBotao.textContent = ehCadastro ? "Criar conta" : "Entrar";
        campoSenha.placeholder = ehCadastro ? "Crie uma senha (mín. 6 caracteres)" : "Sua senha";
        linkEsqueciSenha.hidden = ehCadastro;
    }

    abaEntrar.addEventListener("click", () => mudarPara("entrar"));
    abaCadastro.addEventListener("click", () => mudarPara("cadastro"));

    botaoOlho.addEventListener("click", () => {
        const estaEscondida = campoSenha.type === "password";
        campoSenha.type = estaEscondida ? "text" : "password";
        botaoOlho.setAttribute("aria-label", estaEscondida ? "Esconder senha" : "Mostrar senha");
    });

    botaoOlhoConfirmar.addEventListener("click", () => {
        const estaEscondida = campoConfirmarSenha.type === "password";
        campoConfirmarSenha.type = estaEscondida ? "text" : "password";
        botaoOlhoConfirmar.setAttribute("aria-label", estaEscondida ? "Esconder senha" : "Mostrar senha");
    });

    function mostrarAviso(texto, tipo = "erro") {
        mensagemAviso.textContent = texto;
        mensagemAviso.classList.add("visivel");
        mensagemAviso.classList.toggle("sucesso", tipo === "sucesso");
    }

    function esconderAviso() {
        mensagemAviso.classList.remove("visivel", "sucesso");
    }

    function traduzirErro(codigoErro) {
        const mensagens = {
            "auth/invalid-email": "Esse e-mail não parece válido. Confere se digitou certinho.",
            "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
            "auth/wrong-password": "Senha incorreta. Tenta de novo.",
            "auth/invalid-credential": "E-mail ou senha incorretos.",
            "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tenta entrar em vez de criar uma nova.",
            "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
            "auth/too-many-requests": "Muitas tentativas seguidas. Espera um pouco antes de tentar de novo.",
            "auth/network-request-failed": "Falha de conexão. Confere sua internet e tenta de novo."
        };
        return mensagens[codigoErro] || "Algo deu errado. Tenta novamente em instantes.";
    }

    // ==========================================================================
    // ESQUECI MINHA SENHA — envia um e-mail com link pra redefinir
    // ==========================================================================
    linkEsqueciSenha.addEventListener("click", async () => {
        esconderAviso();

        const email = campoEmail.value.trim();
        if (!email) {
            mostrarAviso("Digita seu e-mail no campo acima primeiro, depois clica em \"Esqueci minha senha\".");
            return;
        }

        linkEsqueciSenha.disabled = true;

        try {
            await sendPasswordResetEmail(auth, email);
            mostrarAviso("E-mail de redefinição enviado! Confere sua caixa de entrada (e a pasta de spam).", "sucesso");
        } catch (erro) {
            mostrarAviso(traduzirErro(erro.code));
        } finally {
            linkEsqueciSenha.disabled = false;
        }
    });

    function definirCarregando(carregando) {
        botaoEnviar.disabled = carregando;
        spinnerBotao.hidden = !carregando;
        textoBotao.style.opacity = carregando ? "0.7" : "1";
    }

    // ==========================================================================
    // Decide pra onde mandar a pessoa depois do login: se o perfil (nome, idade,
    // profissão) ainda não foi preenchido, vai pro onboarding; se já foi, vai
    // direto pro dashboard.
    // ==========================================================================
    async function rotearAposLogin(uid) {
        const referenciaPerfil = doc(db, "usuarios", uid);
        const instantaneo = await getDoc(referenciaPerfil);

        const perfilCompleto = instantaneo.exists() && instantaneo.data().onboardingCompleto === true;
        window.location.href = perfilCompleto ? "dashboard.html" : "onboarding.html";
    }

    // ==========================================================================
    // LOGIN COM GOOGLE
    // Usa "redirect" (não "popup") de propósito — dentro de um PWA instalado
    // na tela inicial do celular, popups costumam falhar ou nem abrir; o
    // redirect sempre funciona, porque só troca de página normalmente e volta.
    // O reroteamento em si (dashboard ou onboarding) já acontece sozinho pelo
    // onAuthStateChanged lá embaixo, igual no login normal — não precisa de
    // lógica especial nenhuma aqui.
    // ==========================================================================
    botaoGoogle.addEventListener("click", () => {
        const provedorGoogle = new GoogleAuthProvider();
        signInWithRedirect(auth, provedorGoogle);
    });

    // Se o login com Google deu algum erro (ex: já existe uma conta com esse
    // e-mail feita por senha), mostra o aviso assim que a pessoa voltar
    getRedirectResult(auth).catch((erro) => {
        if (erro.code === "auth/account-exists-with-different-credential") {
            mostrarAviso("Já existe uma conta com esse e-mail, feita com senha. Entra normalmente com e-mail e senha.");
        } else if (erro.code && erro.code !== "auth/no-auth-event") {
            mostrarAviso("Não deu pra entrar com o Google agora. Tenta de novo.");
        }
    });

    formulario.addEventListener("submit", async function (evento) {
        evento.preventDefault();
        esconderAviso();

        const email = campoEmail.value.trim();
        const senha = campoSenha.value;

        if (!email || !senha) {
            mostrarAviso("Preenche o e-mail e a senha pra continuar.");
            return;
        }

        if (senha.length < 6) {
            mostrarAviso("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        if (modoAtual === "cadastro") {
            const confirmacao = campoConfirmarSenha.value;
            if (senha !== confirmacao) {
                mostrarAviso("As senhas digitadas não são iguais.");
                return;
            }
        }

        definirCarregando(true);

        try {
            if (modoAtual === "cadastro") {
                await createUserWithEmailAndPassword(auth, email, senha);

                // O Firebase loga a pessoa automaticamente ao criar a conta —
                // aqui a gente desloga de propósito, pra ela precisar entrar
                // manualmente na aba "Entrar" depois.
                await signOut(auth);

                mostrarAviso("Conta criada com sucesso! Vai na aba \"Entrar\" pra fazer login.", "sucesso");
                mudarPara("entrar");
                formulario.reset();
                definirCarregando(false);
                return;
            }

            const credencial = await signInWithEmailAndPassword(auth, email, senha);
            mostrarAviso("Login realizado! Redirecionando...", "sucesso");

            setTimeout(() => {
                rotearAposLogin(credencial.user.uid);
            }, 700);

        } catch (erro) {
            mostrarAviso(traduzirErro(erro.code));
        } finally {
            definirCarregando(false);
        }
    });

    // Se a pessoa já estiver logada (o Firebase lembra sozinho), pula a tela de
    // login e já decide pra onde mandar — a splash fica visível até a página
    // trocar de verdade. Se não estiver logada, esconde a splash e mostra o
    // formulário.
    onAuthStateChanged(auth, (usuario) => {
        if (usuario) {
            rotearAposLogin(usuario.uid);
        } else {
            esconderSplash();
        }
    });

});
