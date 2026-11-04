(function () {
  // Traducción: los textos marcados con data-i18n se cargan desde lang/<idioma>.json
  var dict = {};
  var cache = {};
  var lang = 'es';
  var langBtn = document.getElementById('lang-btn');
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');
  document.documentElement.classList.add('js');

  function t(key, vars) {
    var s = dict[key] || '';
    for (var v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  }

  function apply() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      var v = dict[el.getAttribute('data-i18n')];
      if (v != null) el.innerHTML = v;
    });
    ['alt', 'aria-label', 'content'].forEach(function (attr) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-' + attr + ']'), function (el) {
        var v = dict[el.getAttribute('data-i18n-' + attr)];
        if (v != null) el.setAttribute(attr, v);
      });
    });
    document.documentElement.lang = lang;
    langBtn.lang = lang === 'es' ? 'en' : 'es';
    updateCount();
    copyState.textContent = '';
  }

  function setLang(next, animate) {
    function done(data) {
      cache[next] = data;
      dict = data;
      lang = next;
      // Cambio de idioma con fundido nativo (View Transitions) y, después,
      // se vuelven a dibujar los trazos de birome que están a la vista.
      // El texto cambia de largo: se deshacen los splits, se traduce, se vuelven a
      // partir y ScrollTrigger vuelve a medir todo.
      function swap() {
        scroll.beforeTranslate();
        apply();
        if (animate) redraw();
        scroll.afterTranslate();
      }
      if (animate && !reduce && document.startViewTransition) {
        document.startViewTransition(swap);
      } else {
        swap();
      }
      try { localStorage.setItem('lang', next); } catch (e) {}
    }
    if (cache[next]) return done(cache[next]);
    fetch('lang/' + next + '.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw r; return r.json(); })
      .then(done)
      .catch(function () { console.warn('No se pudo cargar lang/' + next + '.json'); });
  }

  var bays = Array.prototype.slice.call(document.querySelectorAll('.bay'));
  var log = document.getElementById('lot-log');
  var count = document.getElementById('lot-count');
  var tags = { autorizado: 'AUT', no_autorizado: 'NO', no_verificable: 'N/V' };
  var results = ['autorizado', 'autorizado', 'no_autorizado', 'no_verificable'];
  var last = null;

  function updateCount() {
    var free = bays.filter(function (b) { return b.dataset.state !== 'ocupado'; }).length;
    count.textContent = t('ui.free', { free: free, total: bays.length }) || free + ' libres de ' + bays.length;
  }

  function step() {
    var b;
    do { b = bays[Math.floor(Math.random() * bays.length)]; } while (b === last && bays.length > 1);
    last = b;
    var occupied = b.dataset.state !== 'ocupado';
    b.dataset.state = occupied ? 'ocupado' : 'libre';
    var lines = ['POST /api/eventos · plaza ' + b.dataset.n + ' → ' + b.dataset.state];
    var tag = b.querySelector('.tag');
    if (b.dataset.res) {
      if (occupied) {
        var r = results[Math.floor(Math.random() * results.length)];
        b.dataset.auth = r;
        tag.textContent = tags[r];
        lines.push('POST /api/lecturas · plaza ' + b.dataset.n + ' → ' + r);
      } else {
        b.dataset.auth = 'no_aplica';
        tag.textContent = '';
      }
    }
    bays.forEach(function (x) { x.classList.remove('just'); });
    void b.offsetWidth;
    b.classList.add('just');
    log.innerHTML = lines.join('<br>');
    updateCount();
  }

  updateCount();
  // Solo se anuncia por lector de pantalla cuando el evento lo dispara la persona
  document.getElementById('lot-step').addEventListener('click', function () {
    log.setAttribute('aria-live', 'polite');
    step();
  });
  // Evento disparado por el scroll (no por un timer): no se anuncia, para no
  // llenar el lector de pantalla mientras la persona solo está bajando.
  function autoStep() {
    log.setAttribute('aria-live', 'off');
    step();
  }

  // ─── Scroll: revelados, riel, escenas (js/main.js · sección "scroll") ───
  var scroll = setupScroll();

  // Tras cambiar de idioma el texto cambia de largo: los trazos visibles se rehacen
  function redraw() {
    if (!scroll.revealOn) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-draw].in, [data-wipe].in'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      el.classList.remove('in');
      el.getBoundingClientRect(); // fuerza el recálculo (offsetWidth no existe en SVG)
      el.classList.add('in');
    });
  }

  // ─── Portada: fotos sueltas sobre la mesa ───
  var stage = document.getElementById('cover-stage');
  var pile = document.getElementById('pile');
  var resetBtn = document.getElementById('pile-reset');
  var snaps = Array.prototype.map.call(pile.querySelectorAll('.snap'), function (el) {
    return { el: el, x: 0, y: 0, vx: 0, vy: 0, rot: 0, raf: 0 };
  });
  var order = snaps.slice(); // el último está arriba

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function render(s) { s.el.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px) rotate(' + s.rot.toFixed(2) + 'deg)'; }
  function stack() {
    order.forEach(function (s, i) { s.el.style.zIndex = i + 1; });
    resetBtn.style.zIndex = order.length + 1;
  }
  function toFront(s) { order.splice(order.indexOf(s), 1); order.push(s); stack(); }
  function toBack(s) { order.splice(order.indexOf(s), 1); order.unshift(s); stack(); }
  function isTop(s) { return order[order.length - 1] === s; }
  function touched() { resetBtn.hidden = false; }

  // Límites para que la foto no salga de la lámina (aprox. con su caja girada)
  function bounds(s) {
    var st = stage.getBoundingClientRect();
    var r = s.el.getBoundingClientRect();
    var left = r.left - s.x, top = r.top - s.y;
    return { minX: st.left - left, maxX: st.right - (left + r.width), minY: st.top - top, maxY: st.bottom - (top + r.height) };
  }
  function keepInside(s) {
    var b = bounds(s);
    s.x = clamp(s.x, b.minX, b.maxX);
    s.y = clamp(s.y, b.minY, b.maxY);
  }

  // Inercia: la foto sigue deslizando sobre el papel y frena por rozamiento
  function glide(s) {
    var b = bounds(s), last = performance.now();
    cancelAnimationFrame(s.raf);
    (function frame(now) {
      var dt = Math.min(32, now - last); last = now;
      var f = Math.pow(0.9, dt / 16.7);
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < b.minX || s.x > b.maxX) { s.x = clamp(s.x, b.minX, b.maxX); s.vx *= -0.35; }
      if (s.y < b.minY || s.y > b.maxY) { s.y = clamp(s.y, b.minY, b.maxY); s.vy *= -0.35; }
      s.vx *= f; s.vy *= f; s.rot *= f;
      render(s);
      if (Math.abs(s.vx) + Math.abs(s.vy) > 0.02 || Math.abs(s.rot) > 0.1) s.raf = requestAnimationFrame(frame);
      else { s.rot = 0; render(s); }
    })(last);
  }

  snaps.forEach(function (s) {
    var el = s.el, drag = null, wasTop = false, moved = false;

    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      wasTop = isTop(s);
      moved = false;
      toFront(s);
      if (e.pointerType === 'touch') return; // en touch: tocar = mezclar, el scroll queda libre
      e.preventDefault();
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add('held');
      drag = { px: e.clientX, py: e.clientY, x: s.x, y: s.y, t: performance.now(), b: bounds(s) };
      s.vx = s.vy = 0;
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.px, dy = e.clientY - drag.py;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!moved) { moved = true; touched(); }
      var now = performance.now(), dt = Math.max(1, now - drag.t);
      var nx = clamp(drag.x + dx, drag.b.minX, drag.b.maxX);
      var ny = clamp(drag.y + dy, drag.b.minY, drag.b.maxY);
      // velocidad suavizada (px/ms) para soltar con impulso
      s.vx = s.vx * 0.6 + ((nx - s.x) / dt) * 0.4;
      s.vy = s.vy * 0.6 + ((ny - s.y) / dt) * 0.4;
      drag.t = now;
      s.x = nx; s.y = ny;
      // el papel se inclina hacia donde lo arrastrás
      if (!reduce) s.rot = s.rot * 0.8 + clamp(s.vx * 6, -8, 8) * 0.2;
      if (!s.raf) s.raf = requestAnimationFrame(function () { s.raf = 0; render(s); });
    });
    function release() {
      if (!drag) return;
      drag = null;
      el.classList.remove('held');
      if (reduce) { s.vx = s.vy = 0; s.rot = 0; render(s); return; }
      glide(s);
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);

    // Click o toque sin arrastre: si ya estaba arriba, va al fondo de la pila
    el.addEventListener('click', function () {
      if (moved) return;
      if (wasTop) toBack(s);
      touched();
    });

    // Teclado: flechas mueven, Enter/Espacio mezcla
    el.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 48 : 16;
      var k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (k) {
        e.preventDefault();
        cancelAnimationFrame(s.raf);
        s.x += k[0]; s.y += k[1];
        keepInside(s);
        render(s);
        toFront(s);
        touched();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isTop(s)) toBack(s); else toFront(s);
        touched();
      }
    });
  });

  resetBtn.addEventListener('click', function () {
    order = snaps.slice();
    stack();
    snaps.forEach(function (s) {
      cancelAnimationFrame(s.raf);
      s.x = s.y = s.vx = s.vy = s.rot = 0;
      s.el.style.transition = reduce ? '' : 'transform var(--d-slow) var(--ease), rotate var(--d-mid) var(--ease)';
      render(s);
      setTimeout(function () { s.el.style.transition = ''; }, 800);
    });
    resetBtn.hidden = true;
    snaps[0].el.focus({ preventScroll: true });
  });

  var resizeT;
  addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { snaps.forEach(function (s) { keepInside(s); render(s); }); }, 150);
  });

  // ─── Respuestas al cursor (solo mouse, sin reduced-motion) ───
  if (finePointer && !reduce) {
    // "PORTFOLIO" de fondo se corre como una fotocopia mal registrada
    var ghost = stage.querySelector('.ghost'), gRaf = 0, gx = 0, gy = 0;
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      gx = ((e.clientX - r.left) / r.width - 0.5) * -14;
      gy = ((e.clientY - r.top) / r.height - 0.5) * -8;
      if (!gRaf) gRaf = requestAnimationFrame(function () {
        gRaf = 0;
        ghost.style.setProperty('--gx', gx.toFixed(1) + 'px');
        ghost.style.setProperty('--gy', gy.toFixed(1) + 'px');
      });
    });
    stage.addEventListener('pointerleave', function () {
      ghost.style.setProperty('--gx', '0px');
      ghost.style.setProperty('--gy', '0px');
    });

    // Fotos pegadas con cinta: se inclinan apenas hacia el cursor
    Array.prototype.forEach.call(document.querySelectorAll('.taped'), function (el) {
      var raf = 0, tx = 0, ty = 0;
      el.classList.add('tilt');
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 7;
        ty = ((e.clientY - r.top) / r.height - 0.5) * -7;
        if (!raf) raf = requestAnimationFrame(function () {
          raf = 0;
          el.style.setProperty('--tx', tx.toFixed(2) + 'deg');
          el.style.setProperty('--ty', ty.toFixed(2) + 'deg');
        });
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--tx', '0deg');
        el.style.setProperty('--ty', '0deg');
      });
    });
  }

  // ════════ Scroll ════════
  // Tres modos, decididos con gsap.matchMedia():
  //  · desk  (≥1100 px, mouse, sin reduced-motion): escenas sticky que avanzan con el scroll.
  //  · lite  (celular, touch, pantallas bajas): solo revelados cortos y contenido ligado al scroll, sin escenas largas.
  //  · reduce (prefers-reduced-motion): nada se mueve; todo queda en su estado final.
  // Sin JS o si GSAP no carga, la página es la misma, vertical y completa.
  function setupScroll() {
    var root = document.documentElement;
    var api = { revealOn: false, beforeTranslate: function () {}, afterTranslate: function () {} };
    if (!window.gsap || !window.ScrollTrigger) { root.classList.remove('motion'); return api; }
    gsap.registerPlugin(ScrollTrigger);
    var canSplit = !!window.SplitText;
    if (canSplit) gsap.registerPlugin(SplitText);

    var DESK = '(min-width: 1100px) and (min-height: 680px) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
    function $(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
    function q(sel, ctx) { return (ctx || document).querySelector(sel); }
    var scenes = {
      parkex: q('[data-scene="parkex"]'), itspace: q('[data-scene="itspace"]'),
      coded: q('[data-scene="coded"]'), escaneo: q('[data-scene="escaneo"]'), cinni: q('[data-scene="cinni"]')
    };
    // Rango de una escena sticky: de que su tope toca el tope de la pantalla a que su fondo toca el fondo
    function sceneST(el, scrub) { return { trigger: el, start: 'top top', end: 'bottom bottom', scrub: scrub == null ? 0.4 : scrub, invalidateOnRefresh: true }; }

    // ─── Riel: marca con la birome el proyecto que está en pantalla (en todos los modos; es estado, no movimiento) ───
    var railLinks = $('.rail a');
    $('.proj').forEach(function (art, i) {
      ScrollTrigger.create({
        trigger: art, start: 'top 55%', end: 'bottom 55%',
        onToggle: function (self) {
          if (!self.isActive) return;
          railLinks.forEach(function (a, j) {
            if (j === i) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
          });
        }
      });
    });

    // ─── Frases manuscritas de cada proyecto: SplitText por palabra (se rehace al traducir) ───
    var mode = 'reduce', splits = [], ledeTweens = [];
    function splitLedes() {
      if (!canSplit || mode === 'reduce') return;
      $('[data-split]').forEach(function (el) {
        var s = SplitText.create(el, { type: 'words', aria: 'auto' });
        splits.push(s);
        if (el.dataset.seen) return; // ya se leyó: después de traducir queda quieta
        ledeTweens.push(gsap.from(s.words, {
          opacity: 0, y: 10, rotation: -3, duration: 0.5, ease: 'power2.out', stagger: 0.07,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true, onEnter: function () { el.dataset.seen = '1'; } }
        }));
      });
    }
    function killLedes() {
      ledeTweens.forEach(function (t) { if (t.scrollTrigger) t.scrollTrigger.kill(); t.kill(); });
      splits.forEach(function (s) { s.revert(); });
      ledeTweens = []; splits = [];
    }
    api.beforeTranslate = killLedes;
    api.afterTranslate = function () { splitLedes(); ScrollTrigger.refresh(); };

    // ─── Revelados heredados del PR #1 (láminas, brush, trazos): ahora con ScrollTrigger en vez de IntersectionObserver ───
    function reveals() {
      ScrollTrigger.batch('.plate:not(.cover), [data-wipe], [data-draw]', {
        start: 'top 92%', once: true,
        onEnter: function (els) { els.forEach(function (el) { el.classList.add('in'); }); }
      });
    }

    // ─── ParkEx: los eventos del plano los dispara el scroll (no un timer) ───
    function lotEvents(desk) {
      var lot = q('.lot', scenes.parkex), n = desk ? 8 : 4, last = -1;
      ScrollTrigger.create({
        trigger: desk ? scenes.parkex : lot,
        start: desk ? 'top top' : 'top 75%',
        end: desk ? 'bottom bottom' : 'bottom 25%',
        onUpdate: function (self) {
          var k = Math.min(n - 1, Math.floor(self.progress * n));
          if (k !== last) { if (last !== -1) autoStep(); last = k; }
        }
      });
    }

    // Hojas que se deslizan desde el costado y se apilan sobre la anterior
    function stackSheets(tl, sheets, at, span) {
      sheets.forEach(function (sh, k) {
        if (k === 0) return;
        var t = at + (k - 1) * span;
        tl.fromTo(sh, { xPercent: 112, yPercent: 6, rotation: 7, opacity: 0 },
          { xPercent: 0, yPercent: 0, rotation: 0, opacity: 1, duration: span * 0.85, ease: 'power2.out' }, t);
        for (var m = 0; m < k; m++) {
          tl.to(sheets[m], { scale: 1 - 0.035 * (k - m), y: -14 * (k - m), duration: span * 0.85, ease: 'power1.out' }, t);
        }
      });
    }

    // ─── Escenas de escritorio ───
    function plates() {
      var arts = $('.proj');
      arts.forEach(function (art, i) {
        var side = i % 2 ? 1 : -1;
        // La lámina se desliza sobre la mesa desde un costado y se asienta
        gsap.fromTo(art, { x: side > 0 ? 110 : -50, rotation: side * 2.2, opacity: 0.25 }, {
          x: 0, rotation: 0, opacity: 1, ease: 'power2.out',
          scrollTrigger: { trigger: art, start: 'top bottom', end: 'top 30%', scrub: 0.6 }
        });
        // y cuando llega la siguiente, la anterior se achica apenas y se corre: queda abajo de la pila
        var next = arts[i + 1];
        if (next) gsap.to(art, {
          scale: 0.965, xPercent: side * -1.2, transformOrigin: '50% 100%', ease: 'none',
          scrollTrigger: { trigger: next, start: 'top bottom', end: 'top 30%', scrub: 0.6 }
        });
      });
      // Cambio de composición: el riel entra desde la izquierda cuando empiezan los proyectos
      gsap.fromTo('.rail', { x: -24, opacity: 0 }, { x: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.run', start: 'top 75%', end: 'top 25%', scrub: 0.5 } });
      // Progreso: el trazo del riel se revela con dos traslaciones opuestas (solo transform)
      var wipe = q('.rail-wipe');
      gsap.timeline({ scrollTrigger: { trigger: '.sheaf', start: 'top 55%', end: 'bottom bottom', scrub: 0.3 } })
        .fromTo(wipe, { yPercent: -100 }, { yPercent: 0, ease: 'none' }, 0)
        .fromTo(q('svg', wipe), { yPercent: 100 }, { yPercent: 0, ease: 'none' }, 0);
    }

    function parkexScene() {
      var tl = gsap.timeline({ scrollTrigger: sceneST(scenes.parkex) });
      stackSheets(tl, $('.sheets > .sheet', scenes.parkex), 0.14, 0.34);
      tl.to({}, { duration: 0.12 });
    }

    function itspaceScene(cleanups) {
      var gal = q('.gallery', scenes.itspace), track = q('.track', gal);
      function dist() {
        var pad = parseFloat(getComputedStyle(gal).paddingLeft) || 0;
        return Math.max(0, track.offsetWidth - (gal.clientWidth - 2 * pad));
      }
      // La escena mide lo que tiene que recorrer la cinta: 1 px vertical = 1 px horizontal
      function size() { scenes.itspace.style.setProperty('--h', Math.round(innerHeight + dist()) + 'px'); }
      size();
      ScrollTrigger.addEventListener('refreshInit', size);
      cleanups.push(function () {
        ScrollTrigger.removeEventListener('refreshInit', size);
        scenes.itspace.style.removeProperty('--h');
      });
      gsap.to(track, { x: function () { return -dist(); }, ease: 'none', scrollTrigger: sceneST(scenes.itspace, 0.3) });
    }

    function termPrint(desk) {
      var lines = $('.term .l', scenes.escaneo);
      var tl = gsap.timeline({
        scrollTrigger: desk ? sceneST(scenes.escaneo, 0.2)
          : { trigger: q('.term', scenes.escaneo), start: 'top 85%', end: 'bottom 55%', scrub: 0.2 }
      });
      var span = desk ? 0.5 : 1;
      lines.forEach(function (l, k) {
        if (k === 0) return; // el prompt ya está escrito; lo demás se imprime al bajar
        tl.fromTo(l, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: 'none' }, (k / lines.length) * span);
      });
      if (desk) {
        stackSheets(tl, $('.sheets > .sheet', scenes.escaneo), 0.56, 0.2);
        tl.to({}, { duration: 0.06 });
      }
    }

    function codedScene(desk) {
      var scene = scenes.coded, ph = q('.playhead', scene), host = ph.parentNode;
      var clips = $('.clips:not(.audio) .clip', scene), monI = q('#mon-i'), monClip = q('#mon-clip'), cur = -1;
      function monitor(p) {
        var i = Math.min(clips.length - 1, Math.floor(p * clips.length));
        if (i === cur) return;
        cur = i;
        clips.forEach(function (c, j) { c.classList.toggle('on', j === i); });
        monI.textContent = ('0' + (i + 1)).slice(-2);
        monClip.textContent = clips[i].textContent;
      }
      var tl = gsap.timeline({
        scrollTrigger: desk ? sceneST(scene, 0.3)
          : { trigger: q('.tl-wrap', scene), start: 'top 85%', end: 'bottom 35%', scrub: 0.3 },
        onUpdate: function () { monitor(this.progress()); }
      });
      // El playhead recorre la pista de video de punta a punta
      tl.fromTo(ph, { x: 0 }, { x: function () { return host.clientWidth - 2; }, ease: 'none', duration: 1 }, 0);
      monitor(0);
      // La cita se "enciende" palabra por palabra
      var quote = q('[data-quote]', scene);
      if (canSplit && quote) {
        var words = SplitText.create(quote, { type: 'words', aria: 'auto' }).words;
        if (desk) tl.fromTo(words, { opacity: 0.12 }, { opacity: 1, duration: 0.05, stagger: 0.45 / words.length, ease: 'none' }, 0.04);
        else gsap.from(words, { opacity: 0.12, stagger: 0.08, duration: 0.4, scrollTrigger: { trigger: quote, start: 'top 85%', once: true } });
      }
    }

    function cinniScene() {
      var frame = q('.lp-frame', scenes.cinni), img = q('img', frame);
      // La página impresa sube dentro del marco: se "lee" de arriba abajo mientras se baja
      gsap.to(img, { y: function () { return -Math.max(0, img.offsetHeight - frame.clientHeight + 20); }, ease: 'none', scrollTrigger: sceneST(scenes.cinni, 0.4) });
    }

    var mm = gsap.matchMedia();
    mm.add({ desk: DESK, reduce: '(prefers-reduced-motion: reduce)', any: '(min-width: 0px)' }, function (ctx) {
      var c = ctx.conditions, cleanups = [];
      if (c.reduce) { mode = 'reduce'; api.revealOn = false; root.classList.remove('motion', 'reveal'); return; }
      mode = c.desk ? 'desk' : 'lite';
      root.classList.toggle('motion', !!c.desk);
      root.classList.add('reveal');
      api.revealOn = true;
      if (c.desk) { plates(); parkexScene(); itspaceScene(cleanups); cinniScene(); }
      termPrint(c.desk);
      codedScene(c.desk);
      lotEvents(c.desk);
      reveals();
      splitLedes();
      return function () {
        killLedes();
        cleanups.forEach(function (f) { f(); });
        root.classList.remove('motion', 'reveal');
      };
    });

    // Los hash (#parkex…) siguen siendo anchors nativos. Si la página se abrió con uno,
    // se vuelve a llevar ahí cuando ScrollTrigger termina de medir (las escenas cambian de alto),
    // salvo que la persona ya se haya movido.
    var moved = false;
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      addEventListener(ev, function () { moved = true; }, { once: true, passive: true });
    });
    ScrollTrigger.addEventListener('refresh', function () {
      if (moved || !location.hash) return;
      var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) t.scrollIntoView({ behavior: 'instant' });
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    return api;
  }

  var copyBtn = document.getElementById('copy-mail');
  var copyState = document.getElementById('copy-state');
  copyBtn.addEventListener('click', function () {
    var mail = 'luciofacchin.dev@gmail.com';
    function fallback() { copyState.textContent = t('ui.copyFail', { mail: mail }); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(mail).then(function () {
          copyState.textContent = t('ui.copied');
        }, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  });

  langBtn.addEventListener('click', function () { setLang(lang === 'es' ? 'en' : 'es', true); });
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) {}
  setLang(saved === 'en' ? 'en' : 'es');
})();
