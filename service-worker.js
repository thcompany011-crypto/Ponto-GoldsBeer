const cacheName = 'ponto-pro-v5';

const assets = [

    './',

    './index.html',

    './login.html',

    './dashboard.html',

    './css/style.css',

    './js/firebase.js',

    './js/auth.js',

    './js/login.js',

    './js/dashboard.js'

];


self.addEventListener('install', (e) => {

    self.skipWaiting();

    e.waitUntil(

        caches
            .open(cacheName)
            .then(cache => cache.addAll(assets))

    );

});


self.addEventListener('activate', (e) => {

    e.waitUntil(

        caches
            .keys()
            .then(chaves =>

                Promise.all(

                    chaves

                        .filter(
                            chave => chave !== cacheName
                        )

                        .map(
                            chave => caches.delete(chave)
                        )

                )

            )

    );

    self.clients.claim();

});


self.addEventListener('fetch', (e) => {

    e.respondWith(

        caches
            .match(e.request)
            .then(

                response =>
                    response ||
                    fetch(e.request)

            )

    );

});
