const cacheName = 'ponto-pro-v2';
const assets = [
  '/',
  '/index.html',
  '/login.html',
  '/dashboard.html',
  '/css/style.css',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/login.js',
  '/js/dashboard.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});

self.addEventListener('activate', (e) => {
  // Remove caches de versões antigas para evitar servir JS obsoleto para os usuários
  e.waitUntil(
    caches.keys().then(chaves =>
      Promise.all(chaves.filter(c => c !== cacheName).map(c => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(response => response || fetch(e.request)));
});
