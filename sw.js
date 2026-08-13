// ==========================================================================
// SERVICE WORKER
// Um "service worker" é um script que roda em segundo plano, separado da
// página. Ele é o que permite: (1) o navegador oferecer "Instalar app", e
// (2) o app abrir mesmo com internet fraca, usando uma cópia local (cache)
// dos arquivos principais.
// ==========================================================================

const NOME_DO_CACHE = "financas-familia-v6";

// Arquivos essenciais, guardados localmente no primeiro acesso
const ARQUIVOS_ESSENCIAIS = [
    "index.html",
    "onboarding.html",
    "dashboard.html",
    "extrato.html",
    "guardado.html",
    "anotacoes.html",
    "variaveis.css",
    "style.css",
    "onboarding.css",
    "dashboard.css",
    "extrato.css",
    "manifest.json",
    "icone-192.png",
    "icone-512.png",
    "favicon-32.png",
    "favicon-16.png"
];

// Quando o service worker é instalado pela primeira vez, guarda os arquivos essenciais
self.addEventListener("install", (evento) => {
    evento.waitUntil(
        caches.open(NOME_DO_CACHE).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS))
    );
    self.skipWaiting();
});

// Remove caches antigos, caso a gente publique uma versão nova depois (NOME_DO_CACHE mudando)
self.addEventListener("activate", (evento) => {
    evento.waitUntil(
        caches.keys().then((chaves) =>
            Promise.all(chaves.filter((chave) => chave !== NOME_DO_CACHE).map((chave) => caches.delete(chave)))
        )
    );
    self.clients.claim();
});

// Estratégia: tenta buscar na internet primeiro; se falhar (sem sinal), usa a cópia local
self.addEventListener("fetch", (evento) => {
    // Não mexe em chamadas pro Firebase — essas sempre precisam de internet de verdade
    if (evento.request.url.includes("firestore.googleapis.com") || evento.request.url.includes("identitytoolkit")) {
        return;
    }

    evento.respondWith(
        fetch(evento.request).catch(() => caches.match(evento.request))
    );
});
