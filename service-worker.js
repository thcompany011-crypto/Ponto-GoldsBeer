const cacheName = 'ponto-pro-v7';

const assets = [
    './',
    './index.html',
    './login.html',
    './dashboard.html',
    './css/style.css',
    './css/responsive-golds.css',
    './js/firebase.js',
    './js/auth.js',
    './js/login.js',
    './js/dashboard.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(cacheName).then(cache => cache.addAll(assets))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== cacheName)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Para navegação e arquivos do próprio sistema, tenta a versão online primeiro.
    // Assim as próximas publicações não ficam presas ao cache antigo.
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const mesmaOrigem = url.origin === self.location.origin;

    if (!mesmaOrigem) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.ok) {
                    const copia = response.clone();
                    caches.open(cacheName).then(cache => cache.put(event.request, copia));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
