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
      if (animate && !reduce && document.startViewTransition) {
        document.startViewTransition(function () { apply(); redraw(); });
      } else {
        apply();
        if (animate) redraw();
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
  var parkex = document.querySelector('#parkex details.proj');

  if (!reduce) {
    setInterval(function () {
      if (document.hidden || !parkex.open) return;
      log.setAttribute('aria-live', 'off');
      step();
    }, 3200);
  }

  function openProject(id) {
    var el = id && document.getElementById(id);
    var d = el && el.querySelector('details.proj');
    if (d) d.open = true;
  }
  Array.prototype.forEach.call(document.querySelectorAll('.idx a'), function (a) {
    a.addEventListener('click', function () { openProject(a.getAttribute('href').slice(1)); });
  });
  if (location.hash) {
    openProject(location.hash.slice(1));
    var target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ behavior: 'instant' });
  }

  // ─── Revelado por scroll ───
  // Sin JS, sin IntersectionObserver o con reduced-motion todo queda visible:
  // la clase html.reveal es la que habilita los estados ocultos en CSS.
  var revealOn = !reduce && 'IntersectionObserver' in window;
  var watched = document.querySelectorAll('.plate:not(.cover), [data-wipe], [data-draw]');
  if (revealOn) {
    document.documentElement.classList.add('reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    Array.prototype.forEach.call(watched, function (el) { io.observe(el); });
  }

  // Tras cambiar de idioma el texto cambia de largo: los trazos visibles se rehacen
  function redraw() {
    if (!revealOn) return;
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
