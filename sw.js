/* Service worker do Gestor Obras — cache do app; dados sempre de localStorage. */
const CACHE = 'gestor-obras-v7';
const ASSETS = [
  './', './index.html', './manifest.json',
  './dados/_index.js', './dados/ruas-de-terra.js', './dados/teotonio-vilela.js',
  './vendor/pdfjs/pdf.min.js', './vendor/pdfjs/pdf.worker.min.js',
  './assets/logo_gestor.png', './assets/favicon.svg',
  './assets/icon-192.png', './assets/icon-512.png',
  './projetos/agrimensor/agrimensor-pavimentacao.pdf',
  './projetos/agrimensor/agrimensor-drenagem.pdf',
  './projetos/astrogildo/astrogildo-pavimentacao.pdf',
  './projetos/astrogildo/astrogildo-drenagem.pdf',
  './projetos/astrogildo/astrogildo-terraplenagem.pdf'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Só intercepta o mesmo domínio (app). Fontes/CDN externos vão direto pelo browser.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const cp = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
