import { auth, db } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
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
    const textoBotao = botaoEnviar.querySelector(".texto-botao");
    const spinnerBotao = botaoEnviar.querySelector(".spinner-botao");
    const mensagemAviso = document.getElementById("mensagem-aviso");
    const botaoOlho = document.getElementById("botao-olho");
    const botaoOlhoConfirmar = document.getElementById("botao-olho-confirmar");
    const telaCarregamento = document.getElementById("tela-carregamento");

    // A splash precisa ficar visível por pelo menos esse tempo, mesmo que o
    // Firebase responda mais rápido — evita a sensação de "piscada"
    const TEMPO_MINIMO_SPLASH = 1400;
    const inicioCarregamento = Date.now();

    function esconderSplashComAtraso() {
        const decorrido = Date.now() - inicioCarregamento;
        const restante = Math.max(0, TEMPO_MINIMO_SPLASH - decorrido);
        setTimeout(() => telaCarregamento.classList.add("oculto"), restante);
    }

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
    // login e já decide pra onde mandar — sem nunca revelar o formulário atrás
    // da tela de carregamento. Se não estiver logada, aí sim mostra o login.
    onAuthStateChanged(auth, (usuario) => {
        if (usuario) {
            rotearAposLogin(usuario.uid);
        } else {
            esconderSplashComAtraso();
        }
    });

});
