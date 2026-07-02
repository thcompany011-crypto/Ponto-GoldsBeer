const cacheName = 'ponto-pro-v1';
const assets = [
  '/',
  '/index.html',
  '/login.html',
  '/dashboard.html',
  '/css/style.css',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/dashboard.js',
  '/js/ponto.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(response => response || fetch(e.request)));
});

