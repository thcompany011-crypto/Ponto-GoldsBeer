const cacheName = 'ponto-pro-v8';

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyCqijJwChfAwb3BRF71U7SkuaUcxCPLH1I',
    authDomain: 'sistemadeponto-2a85d.firebaseapp.com',
    projectId: 'sistemadeponto-2a85d',
    storageBucket: 'sistemadeponto-2a85d.appspot.com',
    messagingSenderId: '849213562202',
    appId: '1:849213562202:web:b2c54de90144e8997a763'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || data.title || "Gold's Beer";
    const body = notification.body || data.body || "Você tem um aviso da sua jornada.";

    self.registration.showNotification(title, {
        body,
        icon: './logo.png',
        badge: './logo.png',
        vibrate: [250, 120, 250],
        silent: false,
        tag: data.tag || 'golds-jornada',
        renotify: true,
        requireInteraction: false,
        data: { url: data.url || './dashboard.html' }
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const destino = new URL(event.notification.data?.url || './dashboard.html', self.location.origin).href;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
            for (const cliente of lista) {
                if ('focus' in cliente) {
                    cliente.navigate(destino);
                    return cliente.focus();
                }
            }
            return clients.openWindow(destino);
        })
    );
});

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
