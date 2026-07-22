/* ============================================================
   Abertura cinematográfica — motor (canvas + GSAP/ScrollTrigger/Lenis)
   Camada ANTERIOR ao login. Preserva 100% da lógica do app:
   - usa um scroller próprio (não toca no scroll da página/app);
   - reutiliza o login real (ids loginUser/loginPass/loginErro + fazerLogin());
   - embrulha render(): com token, some; no logout, reaparece no painel de login;
   - se os vídeos de intro/media/ não existirem, o app segue como hoje.
   Os quadros vêm de 3 vídeos reais (Higgsfield Cinema Studio 3.0),
   escrubados diretamente pelo scroll (video.currentTime), sem sequência
   de imagens. Desative com ?intro=off. Respeita prefers-reduced-motion.
   ============================================================ */
(function () {
  'use strict';
  var ROOT = document.documentElement;
  var BASE = 'intro/';
  var unlockApp = function () { ROOT.classList.remove('intro-pending'); };

  try {
    if (new URLSearchParams(location.search).get('intro') === 'off') { unlockApp(); return; }
    // a abertura só existe antes do login: exige o gate real do app
    if (typeof CONFIG === 'undefined' || !CONFIG.appsScript || !CONFIG.exigirLogin ||
        typeof render !== 'function' || typeof getToken !== 'function') { unlockApp(); return; }
    if (getToken()) { unlockApp(); return; } // já autenticado: app direto, como hoje
  } catch (e) { unlockApp(); return; }

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SCENES = window.INTRO_SCENES || [];
  var videos = [];         // videos[i] = { el:<video>, ready:false }
  var overlay, scroller, track, canvas, ctx, loginPanel, loader, loaderBar, videoBox;
  var textEls = [], capEl, countEl, hintEl, progEl;
  var lenis = null, master = null, tickFn = null;
  var visible = false, engineOn = false, destroyed = false;
  var lastFrameDrawn = null;

  var origRender = window.render;
  window.render = function () {
    var tk = ''; try { tk = getToken(); } catch (e) {}
    if (tk) { if (visible) hide(); origRender(); return; }
    if (destroyed) { origRender(); return; }
    // sem token e intro ativa: o app fica vazio por baixo (evita ids duplicados de login)
    var app = document.getElementById('app'); if (app) app.innerHTML = '';
    if (!visible && overlay) showAtLogin();
  };

  if (!SCENES.length) { unlockApp(); }
  else {
    build();
    preloadAll()
      .then(function () { if (!destroyed) start(); })
      .catch(function (e) { console.warn('intro: desativada (' + e.message + ')'); abort(); });
  }

  // aborta com segurança: o app volta a se comportar exatamente como hoje
  function abort() {
    destroyed = true; visible = false;
    if (overlay && overlay.parentNode) overlay.remove();
    unlockApp();
    try { origRender(); } catch (e) {}
  }

  /* ---------- DOM ---------- */
  function build() {
    overlay = document.createElement('div');
    overlay.id = 'intro';
    var texts = SCENES.map(function (s, i) {
      if (s.pos === 'login') return '';
      return '<div class="intro-text pos-' + s.pos + '" data-scene="' + i + '">' +
        '<div class="kicker">' + s.kicker + '</div><h2>' + s.h + '</h2>' +
        (s.p ? '<p>' + s.p + '</p>' : '') +
        (s.chips.length ? '<div class="intro-chips">' + s.chips.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>' : '') +
        '</div>';
    }).join('');
    var usuarios = (CONFIG.usuarios || []).map(function (u) { return '<option>' + u + '</option>'; }).join('');
    var videoTags = SCENES.map(function (s) {
      return '<video src="' + BASE + s.video + '" preload="auto" muted playsinline></video>';
    }).join('');
    overlay.innerHTML =
      '<div class="intro-stage"><canvas id="introCanvas"></canvas>' +
        '<div class="intro-vignette"></div><div class="intro-grain"></div></div>' +
      '<div class="intro-videos" aria-hidden="true">' + videoTags + '</div>' +
      '<div class="intro-scroller" tabindex="0"><div class="intro-track"></div></div>' +
      '<div class="intro-texts">' + texts + '</div>' +
      '<div class="intro-login" role="dialog" aria-label="Entrar no Gestor — Controle de Obras">' +
        '<div class="il-head"><img src="assets/logo_gestor.png" alt="Gestor Engenharia">' +
          '<div class="t">Gestor — Controle de Obras</div><div class="s">Entre para acompanhar e lançar</div></div>' +
        '<label for="loginUser">Usuário</label><select id="loginUser">' + usuarios + '</select>' +
        '<label for="loginPass">Senha</label>' +
        '<input type="password" id="loginPass" placeholder="••••••••" autocomplete="current-password" ' +
          'onkeyup="if(event.key===\'Enter\')fazerLogin()">' +
        '<div class="il-erro" id="loginErro"></div>' +
        '<button type="button" onclick="fazerLogin()">Entrar</button></div>' +
      '<div class="intro-ui">' +
        '<div class="intro-progress"><i></i></div>' +
        '<div class="intro-logo"><img src="assets/logo_gestor.png" alt=""><b>Gestor</b></div>' +
        '<button class="intro-skip" type="button">Pular apresentação →</button>' +
        '<div class="intro-cap"></div><div class="intro-count"></div>' +
        '<div class="intro-hint"><div class="wheel"></div><span>Role para conhecer</span></div></div>' +
      '<div class="intro-loader"><img src="assets/logo_gestor.png" alt="">' +
        '<div class="lt">Gestor — Controle de Obras</div><div class="lb"><i></i></div></div>';
    document.body.appendChild(overlay);

    scroller = overlay.querySelector('.intro-scroller');
    track = overlay.querySelector('.intro-track');
    canvas = overlay.querySelector('#introCanvas');
    ctx = canvas.getContext('2d');
    loginPanel = overlay.querySelector('.intro-login');
    loader = overlay.querySelector('.intro-loader');
    loaderBar = loader.querySelector('.lb i');
    videoBox = overlay.querySelector('.intro-videos');
    videos = [].slice.call(videoBox.querySelectorAll('video')).map(function (el) {
      return { el: el, ready: false, seeking: false, seekTimer: null, pendingT: null };
    });
    videos.forEach(function (v) {
      v.el.addEventListener('seeked', function () {
        if (v.seekTimer) { clearTimeout(v.seekTimer); v.seekTimer = null; }
        v.seeking = false;
        drawMedia(v.el);
        if (v.pendingT != null) {
          var t = v.pendingT;
          v.pendingT = null;
          doSeek(v, t);
        }
      });
      v.el.addEventListener('loadedmetadata', function () { v.ready = true; });
      v.el.addEventListener('canplay', function () { v.ready = true; });
      v.el.addEventListener('loadeddata', function () { v.ready = true; });
    });
    textEls = [].slice.call(overlay.querySelectorAll('.intro-text'));
    capEl = overlay.querySelector('.intro-cap');
    countEl = overlay.querySelector('.intro-count');
    hintEl = overlay.querySelector('.intro-hint');
    progEl = overlay.querySelector('.intro-progress i');
    overlay.querySelector('.intro-skip').addEventListener('click', skipToLogin);
    track.style.height = (SCENES.length * 120) + 'vh';
    visible = true;
    resize();
    window.addEventListener('resize', resize);
  }

  /* ---------- desenho (canvas <- imagem ou vídeo, sempre "cover") ---------- */
  function mediaSize(m) {
    if (!m) return [0, 0];
    if (m.videoWidth) return [m.videoWidth, m.videoHeight];
    if (m.width) return [m.width, m.height];
    if (m.naturalWidth) return [m.naturalWidth, m.naturalHeight];
    return [0, 0];
  }
  function resize() {
    if (!canvas) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    if (lastFrameDrawn) drawMedia(lastFrameDrawn);
  }
  function drawMedia(m, alpha) {
    if (!m) return;
    var sz = mediaSize(m); if (!sz[0]) return;
    lastFrameDrawn = m;
    var cw = canvas.width, ch = canvas.height;
    var s = Math.max(cw / sz[0], ch / sz[1]);
    var w = sz[0] * s, h = sz[1] * s;
    if (alpha != null) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(m, (cw - w) / 2, (ch - h) / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(m, (cw - w) / 2, (ch - h) / 2, w, h);
    }
  }

  /* ---------- pré-carregamento e extração de quadros em fila (sequencial) ---------- */
  function extractFrames(vObj, count) {
    count = count || 36;
    var el = vObj.el;
    if (!el || !el.duration || el.duration <= 0) return Promise.resolve();
    vObj.frames = [];
    var dur = el.duration;
    var step = dur / count;
    var tmpC = document.createElement('canvas');
    tmpC.width = Math.min(1280, el.videoWidth || 1280);
    tmpC.height = Math.min(720, el.videoHeight || 720);
    var tmpCtx = tmpC.getContext('2d');

    var p = Promise.resolve();
    for (var i = 0; i < count; i++) {
      (function(idx) {
        p = p.then(function() {
          return new Promise(function(resolve) {
            var targetT = Math.min(dur - 0.04, idx * step);
            var onSeeked = function() {
              try {
                tmpCtx.drawImage(el, 0, 0, tmpC.width, tmpC.height);
                if (window.createImageBitmap) {
                  createImageBitmap(tmpC).then(function(bmp) {
                    vObj.frames[idx] = bmp;
                    resolve();
                  }).catch(function() { resolve(); });
                } else {
                  resolve();
                }
              } catch(e) { resolve(); }
            };
            el.addEventListener('seeked', onSeeked, { once: true });
            setTimeout(onSeeked, 80);
            try { el.currentTime = targetT; } catch(e) { resolve(); }
          });
        });
      })(i);
    }
    return p;
  }

  function preloadAll() {
    var total = videos.length;
    var iv = setInterval(function () {
      var done = 0;
      videos.forEach(function (v) {
        if (v.frames && v.frames.length > 0) done += v.frames.length / 36;
        else if (v.ready || v.el.readyState >= 1) done += 0.3;
      });
      if (loaderBar) loaderBar.style.width = Math.min(100, Math.round((done / total) * 100)) + '%';
    }, 60);

    var chain = Promise.resolve();
    videos.forEach(function (v, idx) {
      chain = chain.then(function () {
        return new Promise(function (res) {
          var startExtract = function () {
            v.ready = true;
            extractFrames(v, 36).then(function () { res(); });
          };
          if (v.el.readyState >= 1) {
            startExtract();
          } else {
            v.el.addEventListener('loadedmetadata', startExtract, { once: true });
            v.el.addEventListener('error', function () { res(); }, { once: true });
            setTimeout(function () { startExtract(); }, idx === 0 ? 3000 : 1500);
          }
        });
      });
    });

    return chain.then(function () {
      clearInterval(iv);
      if (loaderBar) loaderBar.style.width = '100%';
    });
  }

  function doSeek(v, t) {
    if (!v.el || !v.el.duration) return;
    if (Math.abs(v.el.currentTime - t) < 0.015) {
      drawMedia(v.el);
      return;
    }
    v.seeking = true;
    if (v.seekTimer) clearTimeout(v.seekTimer);
    v.seekTimer = setTimeout(function () {
      v.seeking = false;
      v.seekTimer = null;
      if (v.pendingT != null) {
        var pt = v.pendingT;
        v.pendingT = null;
        doSeek(v, pt);
      }
    }, 120);
    try {
      v.el.currentTime = t;
    } catch (e) {
      v.seeking = false;
    }
  }

  function seekTo(v, t) {
    if (!v.el || !v.el.duration) return;
    t = Math.max(0, Math.min(v.el.duration - 0.04, t));
    if (v.seeking) {
      v.pendingT = t;
      return;
    }
    doSeek(v, t);
  }

  var N = 0;
  function update(p) {
    N = SCENES.length;
    var si = Math.min(N - 1, Math.floor(p * N));
    var local = p * N - si;
    var vObj = videos[si];

    // Transição cinematográfica (film dissolve) entre a cena anterior e a atual
    var prevObj = si > 0 ? videos[si - 1] : null;
    var crossFadeAlpha = (si > 0 && local < 0.12 && prevObj && prevObj.frames && prevObj.frames.length > 0) ? (local / 0.12) : 1;

    if (crossFadeAlpha < 1 && prevObj && prevObj.frames.length > 0) {
      var prevLastFrame = prevObj.frames[prevObj.frames.length - 1];
      if (prevLastFrame) drawMedia(prevLastFrame, 1.0);
    }

    if (vObj && vObj.frames && vObj.frames.length > 0) {
      var fIdx = Math.min(vObj.frames.length - 1, Math.floor(local * vObj.frames.length));
      var frame = vObj.frames[fIdx];
      if (frame) {
        drawMedia(frame, crossFadeAlpha);
      } else if (vObj.el.readyState >= 1) {
        drawMedia(vObj.el, crossFadeAlpha);
      }
    } else if (vObj && vObj.el.readyState >= 1 && vObj.el.duration) {
      var t = Math.min(vObj.el.duration - 0.04, Math.max(0, local * vObj.el.duration));
      seekTo(vObj, t);
      drawMedia(vObj.el, crossFadeAlpha);
    }

    // textos sincronizados (fade por progresso local da cena)
    textEls.forEach(function (te) {
      var tsi = +te.dataset.scene;
      var o = 0, y = 26;
      if (tsi === si) {
        var inStart = tsi === 0 ? -0.2 : 0.08; // 1ª cena: título visível já na abertura
        var fin = ease01((local - inStart) / 0.16), fout = 1 - ease01((local - 0.74) / 0.2);
        o = Math.min(fin, fout); y = 26 * (1 - fin) - 18 * (1 - fout);
      }
      te.style.opacity = o.toFixed(3);
      te.style.translate = '0 ' + y.toFixed(1) + 'px';
    });

    // painel de login (última cena): a câmera desacelera e o vidro surge
    var lp = 0;
    if (si === N - 1) lp = ease01((local - 0.25) / 0.45);
    loginPanel.style.opacity = lp.toFixed(3);
    loginPanel.style.transform = 'translate(-50%,' + (-46 + 6 * ease01(lp)) + '%) scale(' + (0.97 + 0.03 * lp).toFixed(4) + ')';
    loginPanel.classList.toggle('on', lp > 0.6);

    // UI
    progEl.style.width = (p * 100).toFixed(2) + '%';
    capEl.textContent = String(si + 1).padStart(2, '0') + ' — ' + SCENES[si].label;
    countEl.textContent = String(si + 1).padStart(2, '0') + ' · ' + String(N).padStart(2, '0');
    hintEl.style.opacity = p < 0.02 ? '1' : '0';
  }
  function ease01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  /* ---------- motor de rolagem ---------- */
  function start() {
    loader.style.opacity = '0';
    setTimeout(function () { if (loader.parentNode) loader.remove(); }, 800);
    unlockApp();
    var app = document.getElementById('app'); if (app) app.innerHTML = ''; // evita ids duplicados
    if (REDUCED) { startStatic(); return; }
    startEngine();
    update(0);
    scroller.focus({ preventScroll: true });
  }
  function startEngine() {
    if (engineOn) return;
    gsap.registerPlugin(ScrollTrigger);
    lenis = new Lenis({ wrapper: scroller, content: track, duration: 0.85, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    tickFn = function (t) { lenis.raf(t * 1000); };
    gsap.ticker.add(tickFn);
    gsap.ticker.lagSmoothing(0);
    master = ScrollTrigger.create({
      scroller: scroller, trigger: track, start: 'top top', end: 'bottom bottom',
      scrub: 0.25, onUpdate: function (self) { update(self.progress); }
    });
    engineOn = true;
    document.addEventListener('visibilitychange', onVisibility);
  }
  // se a aba ficar oculta (troca de app/aba/painel), o rAF do navegador pausa e o
  // Lenis para de tickar — mas o wheel continua chegando e fica "engavetado" no alvo
  // interno do Lenis, causando um salto brusco quando a aba volta (o "trava e pula"
  // relatado). Pausamos o Lenis por completo enquanto oculto e resincronizamos ao voltar.
  function onVisibility() {
    if (!engineOn || !lenis) return;
    if (document.hidden) { lenis.stop(); return; }
    lenis.start();
    requestAnimationFrame(function () {
      ScrollTrigger.refresh();
      var range = track.scrollHeight - scroller.clientHeight;
      var p = range > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / range)) : 0;
      update(p);
    });
  }
  function stopEngine() {
    if (!engineOn) return;
    if (master) { master.kill(); master = null; }
    if (tickFn) { gsap.ticker.remove(tickFn); tickFn = null; }
    if (lenis) { lenis.destroy(); lenis = null; }
    document.removeEventListener('visibilitychange', onVisibility);
    engineOn = false;
  }
  function skipToLogin() {
    if (REDUCED || !lenis) return;
    var end = track.scrollHeight - scroller.clientHeight;
    lenis.scrollTo(end, { duration: 2.4, easing: function (t) { return 1 - Math.pow(1 - t, 3); } });
  }

  /* modo estático (prefers-reduced-motion): fundo fixo + login imediato */
  function startStatic() {
    overlay.classList.add('intro-static');
    var s0 = SCENES[0];
    var st = document.createElement('div');
    st.className = 'intro-text pos-static';
    st.innerHTML = '<div class="kicker">' + s0.kicker + '</div><h2>' + s0.h + '</h2><p>' + s0.p + '</p>' +
      '<div class="intro-chips">' + SCENES.slice(1, SCENES.length - 1).map(function (s) { return '<span>' + s.h + '</span>'; }).join('') + '</div>';
    overlay.querySelector('.intro-texts').appendChild(st);
    var v = videos[0] && videos[0].el;
    if (v) { v.addEventListener('seeked', function () { drawMedia(v); }, { once: true }); try { v.currentTime = 0; } catch (e) {} drawMedia(v); }
    loginPanel.classList.add('on');
    scroller.style.display = 'none';
    overlay.querySelector('.intro-skip').style.display = 'none';
  }

  /* ---------- transições com o app ---------- */
  function hide() {
    visible = false;
    overlay.classList.add('intro-fade');
    stopEngine();
    setTimeout(function () { overlay.classList.add('intro-hidden'); overlay.classList.remove('intro-fade'); }, 950);
  }
  function showAtLogin() {
    // logout → retorno à abertura, já no painel de entrada (dá para rolar de volta)
    visible = true;
    overlay.classList.remove('intro-hidden', 'intro-fade');
    if (REDUCED) { loginPanel.classList.add('on'); return; }
    startEngine();
    requestAnimationFrame(function () {
      var end = track.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = end;
      if (lenis) lenis.scrollTo(end, { immediate: true });
      ScrollTrigger.refresh();
      update(1);
    });
  }
})();
