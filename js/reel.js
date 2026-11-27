// ÍNDICE: riel 3D de proyectos (three.js).
// Seis láminas curvas recorren una espiral horizontal detrás de la palabra ÍNDICE.
// · Escritorio (html.reel-pin): la lámina queda fija y el scroll de la página mueve el riel.
// · Celular / touch: se arrastra de costado; la página sigue bajando normal.
// · Clic o Enter en la lámina del frente: abre la página del proyecto. En una de costado: la trae al frente.
// · reduced-motion: sin ondulación ni curva extra; las flechas y el arrastre cambian al instante.
// main.js lo carga con import() cuando ÍNDICE se acerca a la pantalla.
import {
  WebGLRenderer, Scene, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Mesh,
  CanvasTexture, Raycaster, Vector2, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, FrontSide
} from './vendor/three.reel.min.js';

// ─── Datos: un objeto por proyecto. El contexto se lee del ítem del índice (ya traducido). ───
export const PROJECTS = [
  { id: 'selene', name: 'SELENE', theme: 'space', site: 'selene-space-apps.vercel.app', year: '2026', cover: 'img/selene-logo.webp', art: 'logo' },
  { id: 'parkex', name: 'ParkEx', theme: 'paper', site: 'github.com/facuduarte-dev/ConnectaLab', year: '2026', cover: 'img/proyectos/parkex-tinkercad.webp', art: 'photo' },
  { id: 'itspace', name: 'ITSpace', theme: 'slab', site: 'itspvm.duckdns.org', year: '2026', cover: 'img/proyectos/itspace-inicio.webp', art: 'photo' },
  { id: 'coded-bias', name: 'Coded Bias', theme: 'paper', site: 'documental + speech', year: '2026', cover: null, art: 'timeline' },
  { id: 'escaneo', name: 'Escaneo IP', theme: 'slab', site: 'github.com/lucioooofacc/EscaneoIP', year: '2026', cover: 'img/proyectos/escaneo-web.webp', art: 'terminal' },
  { id: 'cinniminies', name: 'Cinniminies', theme: 'paper', site: 'cinniminies.emprendeuy.com', year: '2026', cover: 'img/proyectos/cinni-inicio.webp', art: 'photo' }
];

// Paleta del sitio (css/styles.css :root y .plate.space)
const THEMES = {
  paper: { bg: '#DCDDD8', ink: '#141414', dim: '#45474C', rule: 'rgba(20,20,20,.38)', accent: '#2340B5' },
  slab: { bg: '#1F1F1F', ink: '#E6E6E1', dim: '#A2A39E', rule: 'rgba(230,230,225,.22)', accent: '#8A9EF2' },
  space: { bg: '#04060B', ink: '#F1EDE4', dim: '#9C978C', rule: 'rgba(191,167,128,.4)', accent: '#BFA780' }
};

// Geometría y cámara
const CARD_W = 2.38, CARD_H = 1.5771, HALF_W = CARD_W / 2;
const SEG_X = 48, SEG_Y = 24;
const FOV = 65.7, CAM_Z = 8.1;
const STEP = 0.73;          // ángulo entre láminas
const PITCH = 0.52;         // subida por lámina, en unidades de la escala de la malla
const BEND = 0.30, BEND_MAX = 0.42;
const TEX_W = 1600, TEX_H = Math.round(TEX_W * CARD_H / CARD_W); // 1060: misma proporción que la lámina

const VERT = `
uniform float uBend;
uniform float uTime;
uniform float uFlex;
varying vec2 vUv;
varying float vCurve;
void main() {
  vUv = uv;
  vec3 p = position;
  float b = max(uBend, 1e-4);
  float ang = (p.x / ${HALF_W.toFixed(2)}) * b;
  float r = ${HALF_W.toFixed(2)} / b;
  p.x = sin(ang) * r;
  p.z += (cos(ang) - 1.0) * r;
  p.z += sin(uv.y * 9.42 + uv.x * 2.0 + uTime * 0.7) * 0.006 * uFlex;
  vCurve = cos(ang);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform sampler2D uMap;
uniform float uSat;
uniform float uAlpha;
uniform vec2 uSize;
uniform float uRadius;
varying vec2 vUv;
varying float vCurve;
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = sdRoundBox(p, uSize * 0.5, uRadius);
  float aa = max(fwidth(d), 1e-4);
  float a = 1.0 - smoothstep(-aa, aa, d);
  if (a <= 0.001) discard;
  vec3 c = texture2D(uMap, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c *= 1.0 - (1.0 - vCurve) * 2.4;
  gl_FragColor = vec4(c, a * uAlpha);
}`;

export function mount(opts) {
  const { stage, view, live, t, isPinned, reduce, onEmpty } = opts;
  const N = PROJECTS.length;
  const reduceMotion = () => reduce.matches;

  const ac = new AbortController();
  const sig = { signal: ac.signal };

  // ─── Renderer ───
  let renderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'reel-gl';
  canvas.setAttribute('aria-hidden', 'true');
  view.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, CAM_Z);

  const geometry = new PlaneGeometry(CARD_W, CARD_H, SEG_X, SEG_Y);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const cards = PROJECTS.map((proj, i) => {
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const tex = new CanvasTexture(cv);
    tex.colorSpace = NoColorSpace; // la textura queda en sRGB y se escribe tal cual al canvas
    tex.anisotropy = maxAniso;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: FrontSide,
      uniforms: {
        uMap: { value: tex },
        uBend: { value: BEND },
        uTime: { value: 0 },
        uFlex: { value: 1 },
        uSat: { value: 1 },
        uAlpha: { value: 1 },
        uSize: { value: new Vector2(CARD_W, CARD_H) },
        uRadius: { value: 0.028 }
      }
    });
    const mesh = new Mesh(geometry, material);
    mesh.rotation.order = 'YXZ';
    mesh.userData.index = i;
    scene.add(mesh);
    return { proj, cv, tex, material, mesh, img: null };
  });

  // ─── Portadas: cada textura es la portada de un sitio, con la tipografía y la paleta del portfolio ───
  function contextOf(id) {
    const v = document.querySelector('#indice .idx a[href="#' + id + '"] .v');
    return v ? v.textContent.trim() : '';
  }
  function loadImg(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  function setFont(ctx, weight, stretch, size, family) {
    ctx.font = weight + ' ' + stretch + ' ' + size + 'px ' + family;
    if ('fontStretch' in ctx) ctx.fontStretch = stretch;
  }
  const SANS = 'Archivo, "Arial Narrow", Arial, sans-serif';
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const BRUSH = '"Sedgwick Ave Display", "Permanent Marker", cursive';
  function track(ctx, em) { if ('letterSpacing' in ctx) ctx.letterSpacing = em + 'px'; }
  function wrap(ctx, text, maxW) {
    const words = text.split(/\s+/), lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  function cover(ctx, img, x, y, w, h, ax = 0.5, ay = 0.5) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) * ax, (img.height - sh) * ay, sw, sh, x, y, w, h);
  }
  function contain(ctx, img, x, y, w, h) {
    const s = Math.min(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function drawCover(card) {
    const { proj, cv, img } = card;
    const ctx = cv.getContext('2d');
    const th = THEMES[proj.theme];
    const W = TEX_W, H = TEX_H, M = 64;
    const i = PROJECTS.indexOf(proj);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    track(ctx, 0);

    // Fondo
    if (proj.theme === 'space') {
      const g = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.9);
      g.addColorStop(0, '#0E1626'); g.addColorStop(0.65, '#04060B');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 140; k++) {
        ctx.fillStyle = k % 9 ? 'rgba(241,237,228,' + (0.25 + rnd() * 0.55).toFixed(2) + ')' : 'rgba(191,167,128,.8)';
        const r = rnd() < 0.85 ? 1.2 : 2;
        ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, r, 0, 6.283); ctx.fill();
      }
    } else {
      ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    }
    if (proj.theme !== 'paper') { // canto de la lámina: se separa del fondo negro de ÍNDICE
      ctx.strokeStyle = 'rgba(230,230,225,.14)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    }

    // Barra de navegación del sitio
    ctx.fillStyle = th.ink; ctx.textBaseline = 'alphabetic';
    setFont(ctx, 900, 'expanded', 28, SANS); track(ctx, 0.5);
    ctx.fillText('LF', M, 78);
    setFont(ctx, 400, 'normal', 19, MONO); track(ctx, 2);
    ctx.fillStyle = th.dim;
    ctx.fillText('LUCIO FACCHIN · PORTFOLIO', M + 70, 76);
    ctx.textAlign = 'right';
    ctx.fillText(proj.site.toUpperCase(), W - M, 76);
    ctx.textAlign = 'left';
    ctx.fillStyle = th.rule; ctx.fillRect(M, 104, W - 2 * M, 2);

    // Título: ocupa el ancho, como los afiches (data-fit)
    ctx.fillStyle = th.ink;
    track(ctx, 0);
    setFont(ctx, 900, 'expanded', 100, SANS);
    const name = proj.name.toUpperCase();
    const nw = ctx.measureText(name).width;
    const size = Math.min(230, (100 * (W - 2 * M) / nw) * 0.99);
    setFont(ctx, 900, 'expanded', size, SANS); track(ctx, -size * 0.02);
    const titleBase = 112 + size * 0.86;
    ctx.fillText(name, M - size * 0.02, titleBase);
    track(ctx, 0);

    // Cuerpo: número fino + contexto a la izquierda, la imagen del proyecto a la derecha
    const bodyTop = titleBase + 44, footY = H - 92;
    const colW = 360;
    setFont(ctx, 100, 'extra-condensed', 220, SANS);
    ctx.fillStyle = th.ink;
    ctx.fillText(String(i + 1), M - 8, bodyTop + 190);
    setFont(ctx, 400, 'normal', 18, MONO); track(ctx, 2);
    ctx.fillStyle = th.dim;
    const ctxLabel = (t('indice.3') || 'Contexto:').replace(':', '').toUpperCase();
    ctx.fillText(ctxLabel, M, bodyTop + 262);
    track(ctx, 0);
    setFont(ctx, 800, 'semi-expanded', 30, SANS);
    ctx.fillStyle = th.ink;
    wrap(ctx, contextOf(proj.id).toUpperCase(), colW - 10).slice(0, 4).forEach((ln, k) => ctx.fillText(ln, M, bodyTop + 306 + k * 36));

    const ax = M + colW + 40, ay = bodyTop + 8, aw = W - M - ax, ah = footY - 34 - ay;
    ctx.save();
    ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
    if (proj.art === 'photo' && img) {
      cover(ctx, img, ax, ay, aw, ah, 0.5, 0.35);
    } else if (proj.art === 'logo' && img) {
      ctx.strokeStyle = 'rgba(191,167,128,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(ax + aw / 2, ay + ah / 2, aw * 0.46, ah * 0.3, -0.18, 0, 6.283); ctx.stroke();
      // el logo viene en un cuadrado blanco: se recorta al círculo de la Luna
      const d = Math.min(aw * 0.6, ah - 20), cx = ax + aw / 2, cy = ay + ah / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, d * 0.455, 0, 6.283); ctx.clip();
      ctx.drawImage(img, cx - d / 2, cy - d / 2, d, d);
      ctx.restore();
    } else if (proj.art === 'terminal') {
      ctx.fillStyle = '#0B0B0B'; ctx.fillRect(ax, ay, aw, ah);
      setFont(ctx, 400, 'normal', 22, MONO);
      const lines = [
        ['$ ./ejecutar.sh', '#E6E6E1'], ['Escaneando 254 direcciones en 192.168.1.0/24...', '#A2A39E'], ['', ''],
        ['IP              MAC                  Estado', '#E6E6E1'],
        ['192.168.1.1     a0:09:2e:••:••:••    Activo', '#9FD0A4'], ['192.168.1.2     5c:e9:31:••:••:••    Activo', '#9FD0A4'],
        ['192.168.1.5     e8:94:f6:••:••:••    Activo', '#9FD0A4'], ['Equipos activos: 11 de 254', '#E6E6E1']
      ];
      lines.forEach((l, k) => { ctx.fillStyle = l[1]; ctx.fillText(l[0], ax + 30, ay + 52 + k * 34); });
      if (img) {
        const iw = aw * 0.62, ih = iw * img.height / img.width;
        ctx.save(); ctx.translate(ax + aw - iw - 24, ay + ah - ih - 24); ctx.rotate(-0.02);
        ctx.fillStyle = '#F0F0EC'; ctx.fillRect(-8, -8, iw + 16, ih + 16);
        ctx.drawImage(img, 0, 0, iw, ih); ctx.restore();
      }
    } else if (proj.art === 'timeline') {
      ctx.fillStyle = th.ink;
      setFont(ctx, 400, 'normal', 76, BRUSH);
      wrap(ctx, '“Prejudice doesn’t disappear. It migrates.”', aw - 20).forEach((ln, k) => ctx.fillText(ln, ax + 6, ay + 82 + k * 86));
      const clips = ['01 OPENING', '02 INTRO', '03 SIDE A', '04 SIDE B', '05 INTERVIEWS', '06 CONCLUSION'];
      const ty = ay + ah - 150, cw = (aw - 70) / clips.length;
      setFont(ctx, 600, 'normal', 15, MONO);
      ctx.fillStyle = th.dim; ctx.fillText('V1', ax, ty + 40); ctx.fillText('A1', ax, ty + 112);
      clips.forEach((c, k) => {
        const x = ax + 56 + k * cw;
        ctx.fillStyle = k === 5 ? th.ink : 'rgba(20,20,20,.1)'; ctx.fillRect(x, ty, cw - 6, 64);
        ctx.strokeStyle = th.ink; ctx.lineWidth = 2; ctx.strokeRect(x + 1, ty + 1, cw - 8, 62);
        ctx.fillStyle = k === 5 ? th.bg : th.ink; ctx.fillText(c.length > 12 ? c.slice(0, 11) + '…' : c, x + 10, ty + 38);
      });
      ctx.fillStyle = 'rgba(20,20,20,.1)'; ctx.fillRect(ax + 56, ty + 82, aw - 62, 44);
      ctx.strokeRect(ax + 57, ty + 83, aw - 64, 42);
      ctx.fillStyle = th.ink; ctx.fillText('07 MUSIC', ax + 66, ty + 110);
      ctx.fillStyle = th.accent; ctx.fillRect(ax + 56 + cw * 5.4, ty - 18, 3, 162);
    }
    ctx.restore();

    // Pie
    ctx.fillStyle = th.rule; ctx.fillRect(M, footY - 2, W - 2 * M, 2);
    setFont(ctx, 400, 'normal', 18, MONO); track(ctx, 2);
    ctx.fillStyle = th.dim;
    ctx.fillText('LUCIOFACCHIN.ME', M, footY + 42);
    ctx.textAlign = 'right';
    ctx.fillText(proj.year + ' · UY', W - M, footY + 42);
    ctx.textAlign = 'left';
    track(ctx, 0);
    card.tex.needsUpdate = true;
  }

  let covered = false;
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all([
        document.fonts.load('900 100px Archivo'), document.fonts.load('100 100px Archivo'),
        document.fonts.load('400 20px "JetBrains Mono"'), document.fonts.load('400 60px "Sedgwick Ave Display"')
      ]).catch(() => {})
    : Promise.resolve();
  Promise.all([fontsReady].concat(cards.map((c) => loadImg(c.proj.cover).then((im) => { c.img = im; }))))
    .then(() => {
      if (destroyed) return;
      cards.forEach(drawCover);
      covered = true;
      canvas.classList.add('on');
      request();
    });

  // ─── Medidas: la lámina del frente ocupa ~37 % del ancho en escritorio y ~77 % en celular ───
  let W = 1, H = 1, scale = 1, R = 1, D = 1;
  const K_R = 3.55, K_D = 2.2;
  function resize() {
    W = Math.max(1, view.clientWidth); H = Math.max(1, view.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const k = Math.min(1, Math.max(0, (W - 600) / 500));
    const frac = 0.77 + (0.37 - 0.77) * k;
    const T = 2 * Math.tan((FOV * Math.PI / 180) / 2) * camera.aspect;
    const chord = 2 * (HALF_W / BEND) * Math.sin(BEND); // ancho real de la lámina curvada
    scale = (frac * T * (CAM_Z + 0.28)) / (chord + frac * T * K_D);
    // que la lámina tampoco se pase del alto disponible
    const Th = 2 * Math.tan((FOV * Math.PI / 180) / 2);
    const sH = (0.62 * Th * (CAM_Z + 0.28)) / (CARD_H + 0.62 * Th * K_D);
    scale = Math.min(scale, sH);
    R = K_R * scale; D = K_D * scale;
    request();
  }

  // ─── Estado ───
  let phase = 0, target = 0, vel = 0, bend = BEND, time = 0;
  let last = 0, raf = 0, running = false, visible = false, destroyed = false;
  let announced = -1;

  function wrapRel(x) { // a [-N/2, N/2)
    return ((((x + N / 2) % N) + N) % N) - N / 2;
  }
  function current() { return ((Math.round(phase) % N) + N) % N; }

  function layout() {
    const reduced = reduceMotion();
    const lean = reduced ? 0 : Math.max(-0.06, Math.min(0.06, -vel * 0.012));
    cards.forEach((c) => {
      const rel = wrapRel(c.mesh.userData.index - phase);
      const th = rel * STEP;
      const m = c.mesh;
      m.scale.setScalar(scale);
      m.position.set(Math.sin(th) * R, rel * PITCH * scale, Math.cos(th) * D - 0.28);
      m.rotation.y = Math.atan2(D * Math.sin(th), R * Math.cos(th));
      m.rotation.x = rel * -0.01;
      m.rotation.z = lean;
      const a = Math.abs(rel);
      m.visible = a < 2.4;
      const u = c.material.uniforms;
      u.uBend.value = bend;
      u.uTime.value = time;
      u.uFlex.value = reduced ? 0 : 1;
      u.uAlpha.value = 1 - smooth(1.55, 2.3, a);
      // como las fotos pegadas del sitio: en gris, y en color la que está al frente
      u.uSat.value = 1 - smooth(0.2, 0.85, a);
    });
  }
  function smooth(a, b, x) { const t2 = Math.min(1, Math.max(0, (x - a) / (b - a))); return t2 * t2 * (3 - 2 * t2); }

  function frame(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const reduced = reduceMotion();
    const prev = phase;
    if (reduced) phase = target;
    else phase += (target - phase) * (1 - Math.exp(-13 * dt));
    if (Math.abs(target - phase) < 1e-4) phase = target;
    const v = dt > 0 ? (phase - prev) / dt : 0;
    vel += (v - vel) * (1 - Math.exp(-10 * dt));
    const bt = reduced ? BEND : BEND + Math.min(BEND_MAX - BEND, Math.abs(vel) * 0.05);
    bend += (bt - bend) * (1 - Math.exp(-8 * dt));
    if (!reduced) time += dt;
    layout();
    renderer.render(scene, camera);
    describe();
    // con reduced-motion no hay ondulación: se dibuja solo cuando algo cambia
    const settled = reduced && phase === target && Math.abs(vel) < 1e-3;
    if (!settled) raf = requestAnimationFrame(frame);
    else running = false;
  }
  function start() {
    if (running || destroyed || !covered || !visible || document.hidden) return;
    running = true;
    last = performance.now(); // al volver no se acumula el tiempo que estuvo quieto
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function request() { if (!running) start(); }

  // Descripción accesible del proyecto actual (la región solo habla cuando la persona usa el teclado)
  function describe() {
    const i = current();
    if (i === announced) return;
    announced = i;
    const p = PROJECTS[i];
    const text = (t('reel.now') || '{i} de {n}: {name}, {ctx}')
      .replace('{i}', i + 1).replace('{n}', N).replace('{name}', p.name).replace('{ctx}', contextOf(p.id));
    view.setAttribute('aria-label', (t('reel.aria') || 'Riel de proyectos') + '. ' + text);
    live.textContent = text;
  }

  // ─── Entrada ───
  // Escritorio: el scroll de la página define el objetivo. El arrastre y el teclado mueven la página.
  const EDGE = 0.04; // un poco de quietud al entrar y al salir
  function sceneRange() {
    const r = stage.parentNode.getBoundingClientRect();
    const top = r.top + window.scrollY;
    return { top, dist: Math.max(1, r.height - window.innerHeight) };
  }
  function phaseFromScroll() {
    const { top, dist } = sceneRange();
    const p = (window.scrollY - top) / dist;
    return Math.min(1, Math.max(0, (p - EDGE) / (1 - 2 * EDGE))) * (N - 1);
  }
  function scrollForPhase(ph) {
    const { top, dist } = sceneRange();
    const p = EDGE + (Math.min(N - 1, Math.max(0, ph)) / (N - 1)) * (1 - 2 * EDGE);
    return top + p * dist;
  }
  function goTo(ph, instant) {
    if (isPinned()) {
      target = Math.min(N - 1, Math.max(0, ph));
      window.scrollTo({ top: scrollForPhase(target), behavior: 'instant' });
    } else {
      target = ph;
    }
    if (instant) phase = target;
    request();
  }
  function onScroll() {
    if (!isPinned() || dragging) return;
    target = phaseFromScroll();
    request();
  }
  addEventListener('scroll', onScroll, { passive: true, signal: ac.signal });

  // Arrastre: a la izquierda o hacia abajo avanza
  let dragging = false, pid = null, sx = 0, sy = 0, startTarget = 0, moved = false, kind = 'mouse';
  function onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true; moved = false; pid = e.pointerId; kind = e.pointerType;
    sx = e.clientX; sy = e.clientY;
    startTarget = isPinned() ? target : Math.round(target);
    try { view.setPointerCapture(pid); } catch (err) {}
  }
  function onMove(e) {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    if (!moved) {
      moved = true;
      view.classList.add('grabbing');
    }
    // con el dedo solo cuenta el gesto de costado: el vertical es para bajar la página
    const delta = -dx / (W * 0.42) + (kind === 'touch' ? 0 : dy / (H * 0.6));
    goTo(startTarget + delta);
  }
  function release(e, cancelled) {
    if (!dragging || (e && e.pointerId !== pid)) return;
    dragging = false;
    try { if (view.hasPointerCapture(pid)) view.releasePointerCapture(pid); } catch (err) {}
    pid = null;
    view.classList.remove('grabbing');
    if (moved || cancelled) { goTo(Math.round(target), reduceMotion()); return; }
    click(e);
  }
  view.addEventListener('pointerdown', onDown, sig);
  view.addEventListener('pointermove', onMove, sig);
  view.addEventListener('pointerup', (e) => release(e, false), sig);
  view.addEventListener('pointercancel', (e) => release(e, true), sig);
  view.addEventListener('lostpointercapture', () => { if (dragging) release(null, true); }, sig);

  const ray = new Raycaster(), ndc = new Vector2();
  function click(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(cards.map((c) => c.mesh).filter((m) => m.visible), false)[0];
    if (!hit) return;
    const i = hit.object.userData.index;
    const rel = wrapRel(i - phase);
    if (Math.abs(rel) < 0.5) open(i);
    else goTo(Math.round(target + rel), reduceMotion());
  }
  // Cada proyecto tiene su página: proyectos/<id>.html
  function open(i) {
    location.href = 'proyectos/' + PROJECTS[i].id + '.html';
  }

  view.addEventListener('keydown', (e) => {
    let next = null;
    const base = Math.round(target);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = base + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = base - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = N - 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(current()); return; }
    if (next === null) return;
    e.preventDefault();
    if (!isPinned() && e.key === 'Home') next = Math.round(target / N) * N; // la vuelta más cercana a SELENE
    live.setAttribute('aria-live', 'polite');
    announced = -1;
    goTo(next, reduceMotion());
  }, sig);
  view.addEventListener('blur', () => live.setAttribute('aria-live', 'off'), sig);

  // ─── Ciclo de vida ───
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) { onScroll(); start(); } else stop();
  });
  io.observe(view);
  function onVis() { if (document.hidden) stop(); else start(); }
  document.addEventListener('visibilitychange', onVis, sig);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { resize(); onScroll(); }) : null;
  if (ro) ro.observe(view); else addEventListener('resize', resize, sig);
  function onReduce() { request(); }
  if (reduce.addEventListener) reduce.addEventListener('change', onReduce, sig);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); destroy(); if (onEmpty) onEmpty(); }, sig);

  resize();
  if (isPinned()) { target = phase = phaseFromScroll(); }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    io.disconnect();
    if (ro) ro.disconnect();
    ac.abort();
    cards.forEach((c) => { c.tex.dispose(); c.material.dispose(); scene.remove(c.mesh); });
    geometry.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return {
    relabel() { if (covered) { cards.forEach(drawCover); announced = -1; request(); } },
    layoutChanged() { resize(); if (isPinned()) { target = phaseFromScroll(); phase = target; } else { target = phase = Math.round(phase); } request(); },
    destroy
  };
}
