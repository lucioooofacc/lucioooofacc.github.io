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
      if (!animate && next === document.documentElement.lang) {
        // Carga inicial en el idioma con el que ya viene el HTML: no hay nada que reemplazar
        // (evita reescribir 180 nodos y volver a medir toda la página al cargar).
        updateCount();
      } else if (animate && !reduce && document.startViewTransition) {
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
  function render(s) {
    s.el.style.translate = s.x.toFixed(1) + 'px ' + s.y.toFixed(1) + 'px';
    s.el.style.setProperty('--tilt', s.rot.toFixed(2) + 'deg');
  }
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
      if (s.x < b.minX || s.x > b.maxX) { s.x = clamp(s.x, b.minX, b.maxX); s.vx = 0; }
      if (s.y < b.minY || s.y > b.maxY) { s.y = clamp(s.y, b.minY, b.maxY); s.vy = 0; }
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
      s.el.style.transition = reduce ? '' : 'translate var(--d-slow) var(--ease)';
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
  // · Base (cualquier pantalla, sin reduced-motion): revelados con IntersectionObserver, riel que
  //   marca el proyecto actual y, en celular, mazos que se pasan con el dedo.
  // · Con GSAP 3.15.0 (html.gs), elegido con gsap.matchMedia():
  //     - escritorio (≥1100 px, mouse): escenas sticky que avanzan con el scroll (html.motion);
  //     - celular/touch: movimiento ligado al scroll sin pins ni scroll secuestrado.
  //   En escritorio se carga enseguida; en celular, con el primer gesto de scroll (la portada no lo
  //   necesita y así no compite con la primera carga).
  // · reduced-motion: nada se mueve. Sin JS: todo visible, vertical y completo.
  function setupScroll() {
    var root = document.documentElement;
    function noop() {}
    var api = { revealOn: false, beforeTranslate: noop, afterTranslate: noop };
    var DESK = '(min-width: 1100px) and (min-height: 680px) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
    var CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/';
    var FILES = [
      ['gsap.min.js', 'sha384-XmJ9SoHtVOHoQUcKvFAzVXwdkKo1Ie3bhmSoIAkcdsHGaIrVJIkmozyq0FJeb/Ly'],
      ['ScrollTrigger.min.js', 'sha384-wl5TeDVvOWt30Pbf8aSo2ZrzsOjddu3avOBvHe+p+OhJt9gP6w9YXmDkN5DK2/dF'],
      ['SplitText.min.js', 'sha384-SWJ0lLVRoipvHh59xj0pL7uC7Ih51F+5smaFtrG+2nr+TlDZU5SYJHmxfolbeNTr']
    ];
    var hasIO = 'IntersectionObserver' in window;
    var mql = function (s) { return window.matchMedia ? matchMedia(s) : { matches: false }; };
    var deskMq = mql(DESK), reduceMq = mql('(prefers-reduced-motion: reduce)');
    function onChange(m, f) { if (m.addEventListener) m.addEventListener('change', f); }
    function $(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
    function q(sel, ctx) { return (ctx || document).querySelector(sel); }
    var scenes = {
      parkex: q('[data-scene="parkex"]'), itspace: q('[data-scene="itspace"]'),
      coded: q('[data-scene="coded"]'), escaneo: q('[data-scene="escaneo"]'), cinni: q('[data-scene="cinni"]')
    };
    var deskOn = false; // true mientras las escenas de escritorio están armadas

    // ─── Revelados del PR #1: la clase html.reveal habilita los estados ocultos en CSS ───
    api.revealOn = !reduce && hasIO;
    if (api.revealOn) {
      root.classList.add('reveal');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
      $('.plate:not(.cover), [data-wipe], [data-draw]').forEach(function (el) { io.observe(el); });
    }

    // ─── Riel: la birome encierra el proyecto que cruza la mitad de la pantalla (estado, no movimiento) ───
    var railNow = q('.rail-now');
    if (hasIO) {
      var railLinks = $('.rail a'), arts = $('.proj');
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var i = arts.indexOf(e.target);
          railLinks.forEach(function (a, j) {
            if (j === i) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
          });
          if (railNow) railNow.textContent = q('.nm', railLinks[i]).textContent;
        });
      }, { rootMargin: '-50% 0px -50% 0px' });
      arts.forEach(function (a) { rio.observe(a); });
    }

    // ─── Mazos (celular): se pasan con el dedo; el contador en birome sigue la carta visible ───
    var decks = $('.deck');
    function syncSwipe() {
      var on = !reduceMq.matches && !deskMq.matches;
      root.classList.toggle('swipe', on);
      decks.forEach(function (d) {
        // solo es una parada de teclado cuando de verdad se puede desplazar
        if (on) d.setAttribute('tabindex', '0'); else d.removeAttribute('tabindex');
      });
    }
    syncSwipe();
    onChange(deskMq, syncSwipe);
    onChange(reduceMq, syncSwipe);
    decks.forEach(function (d) {
      var hint = q('.deck-n', d.closest('.stick')), raf = 0, cards = d.children;
      d.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 1;
          var i = Math.round(d.scrollLeft / step);
          if (d.scrollLeft + d.clientWidth >= d.scrollWidth - 4) i = cards.length - 1; // la última, aunque no llegue al snap
          hint.textContent = Math.min(cards.length, i + 1);
        });
      }, { passive: true });
    });

    // ─── ParkEx fuera de escritorio: mientras el plano está a la vista, el scroll dispara eventos ───
    if (!reduce && hasIO) (function () {
      var lot = q('.lot', scenes.parkex), last = -1, listening = false, raf = 0;
      function tick() {
        raf = 0;
        if (deskOn) return; // en escritorio los dispara la escena
        var r = lot.getBoundingClientRect();
        var p = clamp((innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.6), 0, 0.999);
        var k = Math.floor(p * 4);
        if (k !== last) { if (last !== -1) autoStep(); last = k; }
      }
      function onScroll() { if (!raf) raf = requestAnimationFrame(tick); }
      new IntersectionObserver(function (entries) {
        var v = entries[0].isIntersecting;
        if (v && !listening) addEventListener('scroll', onScroll, { passive: true });
        if (!v && listening) removeEventListener('scroll', onScroll);
        listening = v;
      }).observe(lot);
    })();

    // ─── GSAP: se pide una sola vez ───
    var loading = null;
    function loadGsap() {
      if (loading || reduceMq.matches) return;
      loading = new Promise(function (resolve, reject) {
        var left = FILES.length;
        FILES.forEach(function (f) {
          var s = document.createElement('script');
          s.src = CDN + f[0];
          s.integrity = f[1];
          s.crossOrigin = 'anonymous';
          s.async = false; // bajan en paralelo y se ejecutan en orden
          s.onload = function () { if (--left === 0) resolve(); };
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }).then(initGsap).catch(function () {
        root.classList.remove('motion', 'gs');
        console.warn('No se pudo cargar GSAP: el sitio queda sin animaciones de scroll.');
      });
    }
    if (!deskMq.matches) root.classList.remove('motion');
    if (deskMq.matches) loadGsap();
    else if (!reduceMq.matches) {
      // Celular: con el primer gesto. Si la página abrió con #ancla o ya bajada, enseguida.
      var first = function () {
        ['scroll', 'touchstart', 'wheel', 'keydown', 'pointerdown'].forEach(function (ev) { removeEventListener(ev, first); });
        loadGsap();
      };
      ['scroll', 'touchstart', 'wheel', 'keydown', 'pointerdown'].forEach(function (ev) { addEventListener(ev, first, { passive: true }); });
      if (location.hash || scrollY > 0) first();
      // Mientras tanto, se precargan en un momento ocioso: el primer gesto ya los encuentra en caché
      addEventListener('load', function () {
        (window.requestIdleCallback || setTimeout)(function () {
          if (loading) return;
          FILES.forEach(function (f) {
            var l = document.createElement('link');
            l.rel = 'prefetch'; l.as = 'script'; l.crossOrigin = 'anonymous'; l.href = CDN + f[0];
            document.head.appendChild(l);
          });
        });
      });
    }
    onChange(deskMq, function () { if (deskMq.matches) loadGsap(); });

    function initGsap() {
      gsap.registerPlugin(ScrollTrigger);
      var canSplit = !!window.SplitText;
      if (canSplit) gsap.registerPlugin(SplitText);
      // Rango de una escena sticky: de que su tope toca el de la pantalla a que su fondo toca el fondo
      function sceneST(el, scrub) { return { trigger: el, start: 'top top', end: 'bottom bottom', scrub: scrub == null ? 0.4 : scrub, invalidateOnRefresh: true }; }
      // Rango de un elemento que pasa por la pantalla (celular: sin pin)
      function passST(el, start, end, scrub) { return { trigger: el, start: start || 'top 88%', end: end || 'top 40%', scrub: scrub == null ? 0.5 : scrub, invalidateOnRefresh: true }; }

      // Frases manuscritas: SplitText por palabra. Al traducir se deshace, se traduce y se vuelve a partir.
      // En celular se parten recién cuando se acercan a la pantalla, para no medir todo de entrada.
      var splits = [], ledeTriggers = [], mode = null;
      function splitOne(el) {
        var s = SplitText.create(el, { type: 'words', tag: 'span', aria: 'none' });
        splits.push(s);
        if (el.dataset.seen) return; // ya se leyó: después de traducir queda quieta
        var t = gsap.from(s.words, {
          opacity: 0, y: 10, rotation: -3, duration: 0.5, ease: 'power2.out', stagger: 0.07,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true, onEnter: function () { el.dataset.seen = '1'; } }
        });
        ledeTriggers.push(t.scrollTrigger, t);
      }
      function splitLedes() {
        if (!canSplit || !mode) return;
        $('[data-split]').forEach(function (el) {
          if (mode === 'desk') return splitOne(el);
          ledeTriggers.push(ScrollTrigger.create({ trigger: el, start: 'top bottom+=400', once: true, onEnter: function () { splitOne(el); } }));
        });
      }
      function killLedes() {
        ledeTriggers.forEach(function (t) { if (t) t.kill(); });
        splits.forEach(function (s) { s.revert(); });
        ledeTriggers = []; splits = [];
      }
      api.beforeTranslate = killLedes;
      api.afterTranslate = function () { splitLedes(); ScrollTrigger.refresh(); };

      // Hojas que se deslizan desde el costado y se apilan sobre la anterior (escritorio)
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

      // Progreso del riel: una ventana que avanza y un trazo que se queda quieto (dos traslaciones opuestas)
      function railProgress(sel, axis) {
        var wipe = q(sel + ' .rail-wipe'), p = axis === 'x' ? 'xPercent' : 'yPercent';
        var from = {}, to = {}, from2 = {}, to2 = {};
        from[p] = -100; to[p] = 0; from2[p] = 100; to2[p] = 0; to.ease = to2.ease = 'none';
        gsap.timeline({ scrollTrigger: { trigger: '.sheaf', start: axis === 'x' ? 'top top' : 'top 55%', end: 'bottom bottom', scrub: 0.3 } })
          .fromTo(wipe, from, to, 0)
          .fromTo(q('.rail-ink', wipe), from2, to2, 0);
      }

      // Monitor de Coded Bias: muestra el clip que pisa el playhead
      function codedMonitor(scene) {
        var clips = $('.clips:not(.audio) .clip', scene), monI = q('#mon-i'), monClip = q('#mon-clip'), cur = -1;
        var initial = [monI.textContent, monClip.textContent];
        return {
          set: function (p) {
            var i = Math.min(clips.length - 1, Math.floor(p * clips.length));
            if (i === cur) return;
            cur = i;
            clips.forEach(function (c, j) { c.classList.toggle('on', j === i); });
            monI.textContent = ('0' + (i + 1)).slice(-2);
            monClip.textContent = clips[i].textContent;
          },
          reset: function () {
            clips.forEach(function (c) { c.classList.remove('on'); });
            monI.textContent = initial[0]; monClip.textContent = initial[1];
          }
        };
      }

      // Portada: la mesa se vacía. Cada recorte sale hacia su lado según su profundidad (--d)
      // y el nombre queda limpio. En escritorio la portada está fija; en celular pasa sin pin.
      function heroFly(fixed) {
        var pile = q('#pile');
        var tl = gsap.timeline({ scrollTrigger: fixed
          ? { trigger: '.cover', start: 'top top', end: 'bottom bottom', scrub: 0.5, invalidateOnRefresh: true }
          : { trigger: '.cover', start: 'top top', end: 'bottom 20%', scrub: 0.4, invalidateOnRefresh: true } });
        function side(el, axis) {
          var c = axis === 'x' ? el.offsetLeft + el.offsetWidth / 2 - pile.offsetWidth / 2 : el.offsetTop + el.offsetHeight / 2 - pile.offsetHeight / 2;
          return c >= 0 ? 1 : -1;
        }
        $('.snap', pile).forEach(function (el) {
          var d = parseFloat(el.style.getPropertyValue('--d')) || 1;
          tl.to(el, {
            x: function () { return side(el, 'x') * innerWidth * (0.3 + 0.35 * d); },
            y: function () { return (fixed && side(el, 'y') > 0 ? 0.6 : -1) * innerHeight * (0.25 + 0.4 * d); },
            rotation: function () { return side(el, 'x') * (12 + 24 * d); },
            scale: 1 + 0.18 * d,
            ease: 'power1.in',
            duration: 0.5
          }, (1.1 - d) * 0.25);
        });
        tl.to('.cover-note, .cover-down, .pile-reset', { opacity: 0, y: 16, duration: 0.15, ease: 'none' }, 0)
          .to('.cover .ghost', { opacity: 0, duration: 0.4, ease: 'none' }, 0)
          .to('.name', fixed ? { scale: 0.8, y: function () { return -innerHeight * 0.05; }, duration: 0.6, ease: 'power2.inOut' }
                             : { y: function () { return innerHeight * 0.22; }, scale: 0.9, opacity: 0.35, duration: 0.8, ease: 'none' }, 0.2)
          .to('.cover .stroke', fixed ? { scaleX: 0.8, y: function () { return -innerHeight * 0.1; }, duration: 0.6, ease: 'power2.inOut' } : { y: function () { return innerHeight * 0.22; }, opacity: 0.35, duration: 0.8, ease: 'none' }, 0.2)
          .to('.cover-tag', fixed ? { y: function () { return -innerHeight * 0.1; }, duration: 0.6, ease: 'power2.inOut' } : { y: function () { return innerHeight * 0.22; }, opacity: 0.35, duration: 0.8, ease: 'none' }, 0.2);
        if (fixed) tl.to({}, { duration: 0.1 });
      }

      // ═════ Escritorio: escenas sticky ═════
      function desk(cleanups) {
        heroFly(true);
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
        railProgress('.rail-line', 'y');

        // ParkEx: las impresiones se apilan junto al plano; el avance de la escena dispara eventos
        var n = 8, last = -1;
        var tlP = gsap.timeline({
          scrollTrigger: sceneST(scenes.parkex),
          onUpdate: function () {
            var k = Math.min(n - 1, Math.floor(this.progress() * n));
            if (k !== last) { if (last !== -1) autoStep(); last = k; }
          }
        });
        stackSheets(tlP, $('.sheets > .sheet', scenes.parkex), 0.14, 0.34);
        tlP.to({}, { duration: 0.12 });

        // ITSpace: la cinta recorre 1 px horizontal por cada px vertical
        var gal = q('.gallery', scenes.itspace), track = q('.track', gal);
        function dist() {
          var pad = parseFloat(getComputedStyle(gal).paddingLeft) || 0;
          return Math.max(0, track.offsetWidth - (gal.clientWidth - 2 * pad));
        }
        function size() { scenes.itspace.style.setProperty('--h', Math.round(innerHeight + dist()) + 'px'); }
        size();
        ScrollTrigger.addEventListener('refreshInit', size);
        cleanups.push(function () {
          ScrollTrigger.removeEventListener('refreshInit', size);
          scenes.itspace.style.removeProperty('--h');
        });
        gsap.to(track, { x: function () { return -dist(); }, ease: 'none', scrollTrigger: sceneST(scenes.itspace, 0.3) });

        // Coded Bias: el playhead recorre la pista, el monitor sigue el clip y la cita se enciende
        var mon = codedMonitor(scenes.coded), ph = q('.playhead', scenes.coded);
        var tlC = gsap.timeline({ scrollTrigger: sceneST(scenes.coded, 0.3), onUpdate: function () { mon.set(this.progress()); } });
        tlC.fromTo(ph, { x: 0 }, { x: function () { return ph.parentNode.clientWidth - 2; }, ease: 'none', duration: 1 }, 0);
        mon.set(0);
        cleanups.push(mon.reset);
        var quote = q('[data-quote]', scenes.coded);
        if (canSplit && quote) {
          var words = SplitText.create(quote, { type: 'words', tag: 'span', aria: 'none' }).words;
          tlC.fromTo(words, { opacity: 0.12 }, { opacity: 1, duration: 0.05, stagger: 0.45 / words.length, ease: 'none' }, 0.04);
        }

        // Escaneo IP: la terminal imprime y después entran las hojas con el código
        var lines = $('.term .l', scenes.escaneo);
        var tlE = gsap.timeline({ scrollTrigger: sceneST(scenes.escaneo, 0.2) });
        lines.forEach(function (l, k) {
          if (k === 0) return; // el prompt ya está escrito
          tlE.fromTo(l, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: 'none' }, (k / lines.length) * 0.5);
        });
        // y después entra la captura del modo web
        tlE.fromTo(q('.sheets > .sheet', scenes.escaneo), { xPercent: 112, rotation: 7, opacity: 0 }, { xPercent: 0, rotation: 0, opacity: 1, duration: 0.2, ease: 'power2.out' }, 0.58);
        tlE.to({}, { duration: 0.06 });

        cinniPrint(cleanups, sceneST(scenes.cinni, 0.4));
      }

      // Cinniminies: la página impresa sube dentro del marco, se "lee" mientras se baja
      function cinniPrint(cleanups, st) {
        var frame = q('.lp-frame', scenes.cinni), img = q('img', frame);
        frame.removeAttribute('tabindex'); // lo mueve el scroll: no necesita foco
        cleanups.push(function () { frame.setAttribute('tabindex', '0'); });
        gsap.to(img, { y: function () { return -Math.max(0, img.offsetHeight - frame.clientHeight + 20); }, ease: 'none', scrollTrigger: st });
      }

      // Afiche (celular): al bajar, las dos palabras se abren hacia los costados y la foto se acerca
      function posterFly() {
        gsap.timeline({ scrollTrigger: { trigger: '.cover', start: 'top top', end: 'bottom top', scrub: 0.4 } })
          .to('.poster-name .pl:first-child', { xPercent: -38, ease: 'none' }, 0)
          .to('.poster-name .pl:last-child', { xPercent: 38, ease: 'none' }, 0)
          .to('.poster-photo img', { scale: 1.22, yPercent: 6, ease: 'none' }, 0);
      }

      // ═════ Celular / touch: todo pasa mientras se baja, sin pins ═════
      function hand(cleanups, poster) {
        if (poster) posterFly(); else heroFly(false);
        // Láminas: entran deslizándose desde un costado, como papel que se empuja sobre la mesa
        $('.proj').forEach(function (art, i) {
          var side = i % 2 ? 1 : -1;
          gsap.fromTo(art, { x: side * 34, rotation: side * 1.8, opacity: 0.35 },
            { x: 0, rotation: 0, opacity: 1, ease: 'power2.out', scrollTrigger: passST(art, 'top bottom', 'top 55%', 0.4) });
        });
        // Índice: las entradas se reparten una tras otra
        gsap.from('.idx li', { x: -18, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power2.out', scrollTrigger: { trigger: '.idx', start: 'top 85%', once: true } });
        railProgress('.rail-bar', 'x');

        // Fotos pegadas: caen sobre la mesa (las de los mazos se reparten aparte)
        $('.taped').forEach(function (f) {
          if (f.closest('.deck')) return;
          gsap.fromTo(f, { y: -26, rotation: 5, scale: 1.06, opacity: 0.4 },
            { y: 0, rotation: 0, scale: 1, opacity: 1, ease: 'power2.out', scrollTrigger: passST(f, 'top 95%', 'top 60%', 0.5) });
        });

        // Mazos: las cartas se reparten desde la derecha al entrar en pantalla
        decks.forEach(function (d) {
          gsap.fromTo(d.children, { x: function (i) { return 60 + i * 40; }, rotation: function (i) { return 5 + i * 2; }, opacity: 0.25 },
            { x: 0, rotation: 0, opacity: 1, ease: 'power2.out', stagger: 0.06, scrollTrigger: passST(d, 'top 92%', 'top 45%', 0.5) });
        });


        // Terminal: imprime línea por línea mientras pasa
        var term = q('.term', scenes.escaneo), tls = $('.l', term).slice(1);
        gsap.fromTo(tls, { opacity: 0 }, { opacity: 1, ease: 'none', stagger: 0.06, duration: 0.02, scrollTrigger: passST(term, 'top 85%', 'bottom 70%', 0.2) });

        // Coded Bias: el monitor y los clips siguen el scroll; la cita se enciende palabra por palabra
        var mon = codedMonitor(scenes.coded), ph = q('.playhead', scenes.coded);
        var tlC = gsap.timeline({ scrollTrigger: passST(scenes.coded, 'top 70%', 'bottom 75%', 0.3), onUpdate: function () { mon.set(this.progress()); } });
        tlC.fromTo(ph, { x: 0 }, { x: function () { return ph.parentNode.clientWidth - 2; }, ease: 'none', duration: 1 }, 0);
        mon.set(0);
        cleanups.push(mon.reset);
        var quote = q('[data-quote]', scenes.coded);
        if (canSplit && quote) {
          var words = SplitText.create(quote, { type: 'words', tag: 'span', aria: 'none' }).words;
          gsap.fromTo(words, { opacity: 0.12 }, { opacity: 1, ease: 'none', stagger: 0.1, duration: 0.2, scrollTrigger: passST(quote, 'top 85%', 'bottom 45%', 0.3) });
        }

        // Cinniminies: la impresión se lee dentro del marco mientras el marco cruza la pantalla
        cinniPrint(cleanups, passST(q('.lp-frame', scenes.cinni), 'top 85%', 'bottom 15%', 0.4));
      }

      gsap.matchMedia().add({ desk: DESK, ok: '(prefers-reduced-motion: no-preference)', poster: '(max-width: 900px)' }, function (ctx) {
        var c = ctx.conditions, cleanups = [];
        if (!c.ok) return; // reduced-motion: nada
        mode = c.desk ? 'desk' : 'hand';
        deskOn = !!c.desk;
        root.classList.add('gs');
        root.classList.toggle('motion', deskOn);
        if (deskOn) desk(cleanups); else hand(cleanups, !!c.poster);
        splitLedes();
        return function () {
          killLedes();
          cleanups.forEach(function (f) { f(); });
          mode = null; deskOn = false;
          root.classList.remove('motion', 'gs');
        };
      });

      // Los hash (#parkex…) siguen siendo anchors nativos. Si la página se abrió con uno, se vuelve
      // a llevar ahí cuando ScrollTrigger termina de medir, salvo que la persona ya se haya movido.
      var moved = false;
      ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(function (ev) {
        addEventListener(ev, function () { moved = true; }, { once: true, passive: true });
      });
      ScrollTrigger.addEventListener('refresh', function () {
        if (moved || !location.hash) return;
        var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (t) t.scrollIntoView({ behavior: 'instant' });
      });
      // Si una fuente termina de cargar después, cambia el largo de los textos: se vuelve a medir
      if (document.fonts && document.fonts.addEventListener) {
        var fontT;
        document.fonts.addEventListener('loadingdone', function () {
          clearTimeout(fontT);
          fontT = setTimeout(function () { ScrollTrigger.refresh(); }, 120);
        });
      }
    }
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
