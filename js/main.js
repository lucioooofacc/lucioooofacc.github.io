(function () {
  // Traducción: los textos marcados con data-i18n se cargan desde lang/<idioma>.json
  var dict = {};
  var cache = {};
  var lang = 'es';
  var langBtn = document.getElementById('lang-btn');

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

  function setLang(next) {
    function done(data) {
      cache[next] = data;
      dict = data;
      lang = next;
      apply();
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
  document.getElementById('lot-step').addEventListener('click', step);

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    setInterval(function () { if (!document.hidden) step(); }, 3200);
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
    if (target) target.scrollIntoView();
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

  langBtn.addEventListener('click', function () { setLang(lang === 'es' ? 'en' : 'es'); });
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) {}
  setLang(saved === 'en' ? 'en' : 'es');
})();
