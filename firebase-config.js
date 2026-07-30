// ==========================================================================
// CONFIGURAÇÃO DO FIREBASE
// Este arquivo só tem uma responsabilidade: conectar o app ao seu projeto
// Firebase e disponibilizar essa conexão pronta para os outros arquivos usarem.
// ==========================================================================

// Importa as ferramentas do Firebase direto de um CDN do Google — não precisa
// instalar nada (nada de "npm install"), o navegador baixa isso sozinho.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Essas são as "chaves de identidade" do SEU projeto Firebase — foram geradas
// automaticamente quando você registrou o app no console (não são segredo
// crítico, tipo senha: o que realmente protege seus dados são as REGRAS DE
// SEGURANÇA que configuramos no Firestore, não essas chaves).
const firebaseConfig = {
  apiKey: "AIzaSyDVvPLhZxdHP4iCIkD9UzQT0k9SisDNVZQ",
  authDomain: "financas-familia-f2104.firebaseapp.com",
  projectId: "financas-familia-f2104",
  storageBucket: "financas-familia-f2104.firebasestorage.app",
  messagingSenderId: "245258925018",
  appId: "1:245258925018:web:3cb80e5559c4d744ba06e3"
};

// Inicializa a conexão com o Firebase usando essas chaves
const app = initializeApp(firebaseConfig);

// Exporta duas "ferramentas prontas para uso" que outras páginas vão importar:
// - auth: cuida de login, cadastro e "quem está logado agora"
// - db: é a porta de entrada para o banco de dados (Firestore), onde os
//   lançamentos financeiros vão ser salvos nas próximas telas
export const auth = getAuth(app);
export const db = getFirestore(app);
