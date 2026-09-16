(function () {
  var bays = Array.prototype.slice.call(document.querySelectorAll('.bay'));
  var log = document.getElementById('lot-log');
  var count = document.getElementById('lot-count');
  var tags = { autorizado: 'AUT', no_autorizado: 'NO', no_verificable: 'N/V' };
  var results = ['autorizado', 'autorizado', 'no_autorizado', 'no_verificable'];
  var last = null;

  function updateCount() {
    var free = bays.filter(function (b) { return b.dataset.state !== 'ocupado'; }).length;
    count.textContent = free + ' libres de ' + bays.length;
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

  var copyBtn = document.getElementById('copy-mail');
  var copyState = document.getElementById('copy-state');
  copyBtn.addEventListener('click', function () {
    var mail = 'luciofacchin.dev@gmail.com';
    function fallback() { copyState.textContent = 'No se pudo copiar automáticamente: ' + mail; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(mail).then(function () {
          copyState.textContent = 'Mail copiado';
        }, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  });
})();
