/* Service worker do Gestor Obras — cache do app; dados sempre de localStorage. */
const CACHE = 'gestor-obras-v18';
const ASSETS = [
  './', './index.html', './manifest.json',
  './dados/_index.js', './dados/ruas-de-terra.js', './dados/teotonio-vilela.js',
  './js/config.js', './js/auth/session.js', './js/sync/db.js', './js/sync/photoQueue.js', './js/sync/outbox.js',
  './js/domain/rdo.js', './js/domain/diario.js', './js/domain/pendencias.js',
  './js/ui/saveBar.js', './js/ui/centralHoje.js', './js/ui/approvalFlow.js', './js/ui/pendenciasScreen.js',
  './js/components/designSystem.js',
  './vendor/pdfjs/pdf.min.js', './vendor/pdfjs/pdf.worker.min.js', './vendor/xlsx/xlsx.bundle.js',
  './vendor/gsap/gsap.min.js', './vendor/gsap/ScrollTrigger.min.js', './vendor/lenis/lenis.min.js',
  './intro/intro.css', './intro/intro.js', './intro/scenes.js',
  './intro/media/scene-01.mp4', './intro/media/scene-02.mp4', './intro/media/scene-03.mp4',
  './assets/logo_gestor.png', './assets/favicon.svg',
  './assets/icon-192.png', './assets/icon-512.png',
  './projetos/agrimensor/agrimensor-pavimentacao.pdf',
  './projetos/agrimensor/agrimensor-drenagem.pdf',
  './projetos/astrogildo/astrogildo-pavimentacao.pdf',
  './projetos/astrogildo/astrogildo-drenagem.pdf',
  './projetos/astrogildo/astrogildo-terraplenagem.pdf'
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return Promise.allSettled(ASSETS.map(url => c.add(url)));
    }).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Só intercepta o mesmo domínio (app). Fontes/CDN externos vão direto pelo browser.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // Requisições Range (stream de vídeo/mídia) passam direto pelo navegador para evitar exceções 206
  if (e.request.headers.has('range')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.status === 200) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

