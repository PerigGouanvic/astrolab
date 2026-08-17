// astrolab — strate 2 (début) : Swiss Ephemeris via @kuntay/swisseph
//   - Sun→Pluto + Chiron + Ceres/Pallas/Juno/Vesta
//   - Modes maintenant / natal + toggle mi-points
//   - Marqueur rétrograde (℞)

const SWE_URL = 'https://esm.sh/@kuntay/swisseph@0.2.2';

// ---------- Erreurs à l'écran ----------
function showError(msg) {
  const box = document.getElementById('error-box');
  if (!box) { alert(msg); return; }
  box.hidden = false;
  box.textContent = (box.textContent ? box.textContent + '\n\n' : '') + msg;
}
window.addEventListener('error', e => {
  showError('window.error: ' + (e.message || e) + (e.filename ? '\n@ ' + e.filename + ':' + e.lineno : ''));
});
window.addEventListener('unhandledrejection', e => {
  showError('unhandled promise: ' + (e.reason && (e.reason.stack || e.reason.message || e.reason)));
});

// ---------- Bootstrap Swiss Ephemeris ----------
let sweMod;
let swe;
async function initSwe() {
  sweMod = await import(SWE_URL);
  swe = await sweMod.createSwissEph();
  try {
    const res = await swe.loadEphemeris(new sweMod.FetchEphemeris(), { fromYear: 1900, toYear: 2100 });
    if (res && res.missing && res.missing.length) {
      console.warn('éphémérides manquantes (fallback Moshier):', res.missing);
    }
  } catch (e) {
    console.warn('loadEphemeris a échoué — fallback Moshier pour Sun→Pluto, Chiron+astéroïdes indisponibles :', e.message);
  }
  return swe;
}

// ---------- Lieux et modes ----------
const MONTREAL = { latitude: 45.5017, longitude: -73.5673, tz: 'America/Montreal', label: 'Montréal' };

// Perig — 22 janvier 1972, 07 h 25 heure locale Montréal (UTC-5 en janvier) → 12 h 25 UT
const NATAL_PERIG = {
  yearUT: 1972, monthUT: 1, dayUT: 22, hourUT: 12 + 25 / 60,
  latitude: MONTREAL.latitude, longitude: MONTREAL.longitude,
  title: 'Natal — Perig',
  info: '22 janvier 1972 · 07 h 25 · Montréal',
};

function nowConfig(place) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: place.tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = {};
  for (const p of parts) if (p.type !== 'literal') g[p.type] = p.value;
  return {
    jd: Date.now() / 86400000 + 2440587.5,
    latitude: place.latitude, longitude: place.longitude,
    title: 'Maintenant',
    info: `${g.day}/${g.month}/${g.year} · ${g.hour} h ${g.minute} · ${place.label}`,
  };
}

function natalConfig() {
  return {
    jd: swe.julianDay(NATAL_PERIG.yearUT, NATAL_PERIG.monthUT, NATAL_PERIG.dayUT, NATAL_PERIG.hourUT),
    latitude: NATAL_PERIG.latitude, longitude: NATAL_PERIG.longitude,
    title: NATAL_PERIG.title, info: NATAL_PERIG.info,
  };
}

// ---------- Corps ----------
// Indices tirés de Body enum : Sun:0..Pluto:9, Chiron:15, Ceres:17..Vesta:20.
const PLANETS = [
  { key: 'sun',     idx: 0,  glyph: '☉' },
  { key: 'moon',    idx: 1,  glyph: '☽' },
  { key: 'mercury', idx: 2,  glyph: '☿' },
  { key: 'venus',   idx: 3,  glyph: '♀' },
  { key: 'mars',    idx: 4,  glyph: '♂' },
  { key: 'jupiter', idx: 5,  glyph: '♃' },
  { key: 'saturn',  idx: 6,  glyph: '♄' },
  { key: 'uranus',  idx: 7,  glyph: '♅' },
  { key: 'neptune', idx: 8,  glyph: '♆' },
  { key: 'pluto',   idx: 9,  glyph: '♇' },
];
const EXTENDED = [
  { key: 'chiron',  idx: 15, glyph: '⚷' },
  { key: 'ceres',   idx: 17, glyph: '⚳' },
  { key: 'pallas',  idx: 18, glyph: '⚴' },
  { key: 'juno',    idx: 19, glyph: '⚵' },
  { key: 'vesta',   idx: 20, glyph: '⚶' },
];
const SIGN_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];

// ---------- Géométrie ----------
const R_ZODIAC_OUT = 440;
const R_ZODIAC_IN  = 380;
const R_HOUSE_TICK = 360;
const R_MIDPOINT   = 350;
const R_PLANET     = 320;
const R_HOUSE_NUM  = 260;
const R_INNER      = 60;
const DEG = Math.PI / 180;

function normDeg(d) { return ((d % 360) + 360) % 360; }
function project(lon, ascLon, radius) {
  const rel = normDeg(lon - ascLon);
  const theta = (180 + rel) * DEG;
  return { x: radius * Math.cos(theta), y: -radius * Math.sin(theta) };
}
function svg(tag, attrs = {}, text = null) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

// ---------- Mi-points ----------
function midpoint(lonA, lonB) {
  const a = normDeg(lonA);
  const b = normDeg(lonB);
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  return normDeg(a + diff / 2);
}
function computeMidpoints(bodies) {
  const out = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      out.push({ a: bodies[i].key, b: bodies[j].key, lon: midpoint(bodies[i].lon, bodies[j].lon) });
    }
  }
  return out;
}

// ---------- Rendu SVG ----------
function drawChart({ cusps, ascendant, midheaven, bodies }, opts = {}) {
  const container = document.getElementById('chart');
  container.innerHTML = '';
  const ascLon = ascendant;

  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_OUT, class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_IN,  class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_INNER,      class: 'zodiac-inner' }));

  // Signes
  for (let i = 0; i < 12; i++) {
    const lon = i * 30;
    const p1 = project(lon, ascLon, R_ZODIAC_IN);
    const p2 = project(lon, ascLon, R_ZODIAC_OUT);
    container.appendChild(svg('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'zodiac-divider' }));
    const gp = project(lon + 15, ascLon, (R_ZODIAC_IN + R_ZODIAC_OUT) / 2);
    container.appendChild(svg('text', { x: gp.x, y: gp.y, class: 'sign-symbol' }, SIGN_GLYPHS[i]));
  }

  // Maisons
  for (let i = 0; i < 12; i++) {
    const lon = cusps[i];
    if (lon == null) continue;
    const isAngle = (i === 0 || i === 3 || i === 6 || i === 9);
    const p1 = project(lon, ascLon, R_INNER);
    const p2 = project(lon, ascLon, R_ZODIAC_IN);
    container.appendChild(svg('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: isAngle ? 'house-cusp house-cusp-angle' : 'house-cusp',
    }));
    const nextLon = cusps[(i + 1) % 12];
    if (nextLon != null) {
      const arc = normDeg(nextLon - lon);
      const midLon = normDeg(lon + arc / 2);
      const np = project(midLon, ascLon, R_HOUSE_NUM);
      container.appendChild(svg('text', { x: np.x, y: np.y, class: 'house-number' }, String(i + 1)));
    }
  }

  // ASC/MC/DSC/IC
  const labels = [
    { lon: ascLon, text: 'ASC' }, { lon: midheaven, text: 'MC' },
    { lon: normDeg(ascLon + 180), text: 'DSC' }, { lon: normDeg(midheaven + 180), text: 'IC' },
  ];
  for (const l of labels) {
    const p = project(l.lon, ascLon, R_ZODIAC_OUT + 20);
    container.appendChild(svg('text', { x: p.x, y: p.y, class: 'angle-label' }, l.text));
  }

  // Mi-points (fond)
  if (opts.showMidpoints) {
    for (const m of computeMidpoints(bodies)) {
      const t1 = project(m.lon, ascLon, R_MIDPOINT);
      const t2 = project(m.lon, ascLon, R_MIDPOINT - 8);
      container.appendChild(svg('line', { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, class: 'midpoint-tick' }));
    }
  }

  // Planètes (triées par longitude relative à l'ASC, écartement anti-collision)
  const sorted = [...bodies].sort((a, b) => normDeg(a.lon - ascLon) - normDeg(b.lon - ascLon));
  const MIN_SEP = 8;
  let lastLon = -999, ringOffset = 0;
  for (const p of sorted) {
    const sep = normDeg(p.lon - lastLon);
    if (sep < MIN_SEP && lastLon > -999) ringOffset += 26; else ringOffset = 0;
    const r = R_PLANET - ringOffset;
    const pt = project(p.lon, ascLon, r);
    const tk1 = project(p.lon, ascLon, R_HOUSE_TICK);
    const tk2 = project(p.lon, ascLon, R_HOUSE_TICK - 12);
    container.appendChild(svg('line', { x1: tk1.x, y1: tk1.y, x2: tk2.x, y2: tk2.y, class: 'planet-tick' }));
    container.appendChild(svg('text', { x: pt.x, y: pt.y, class: 'planet-symbol' }, p.glyph));
    const degInSign = Math.floor(p.lon % 30);
    const dp = project(p.lon, ascLon, r - 22);
    container.appendChild(svg('text', { x: dp.x, y: dp.y, class: 'planet-degree' }, degInSign + '°' + (p.retro ? ' ℞' : '')));
    lastLon = p.lon;
  }
}

// ---------- Table ----------
function formatSign(lon) {
  const idx = Math.floor(normDeg(lon) / 30);
  const deg = Math.floor(lon % 30);
  const min = Math.floor((lon % 1) * 60);
  return `${deg}° ${SIGN_GLYPHS[idx]} ${String(min).padStart(2, '0')}'`;
}
function drawDataTable({ ascendant, midheaven }, bodies) {
  const container = document.getElementById('chart-data');
  const rows = [];
  rows.push('<h2 style="text-align:center;font-weight:400;font-size:1rem;margin-top:0;">Positions</h2>');
  rows.push('<table>');
  rows.push(`<tr><td class="glyph">ASC</td><td>${formatSign(ascendant)}</td></tr>`);
  rows.push(`<tr><td class="glyph">MC</td><td>${formatSign(midheaven)}</td></tr>`);
  for (const b of bodies) {
    const suffix = b.retro ? ' <span style="opacity:.7">℞</span>' : '';
    rows.push(`<tr><td class="glyph">${b.glyph}</td><td>${formatSign(b.lon)}${suffix}</td></tr>`);
  }
  rows.push('</table>');
  container.innerHTML = rows.join('');
}

// ---------- État + boucle ----------
let state = { mode: 'now', showMidpoints: false };

function computeBodies(jd) {
  const out = [];
  for (const b of [...PLANETS, ...EXTENDED]) {
    try {
      const r = swe.calc(jd, b.idx);
      out.push({ key: b.key, glyph: b.glyph, lon: r.longitude, retro: r.longitudeSpeed < 0 });
    } catch (e) {
      console.warn(`${b.key} indisponible :`, e.message);
    }
  }
  return out;
}

async function render() {
  const config = state.mode === 'natal' ? natalConfig() : nowConfig(MONTREAL);
  document.getElementById('chart-title').textContent = config.title;
  document.getElementById('chart-info').textContent = config.info;

  const H = swe.houses(config.jd, config.latitude, config.longitude, sweMod.HouseSystem.Placidus);
  const bodies = computeBodies(config.jd);
  drawChart({ cusps: H.cusps, ascendant: H.ascendant, midheaven: H.midheaven, bodies },
            { showMidpoints: state.showMidpoints });
  drawDataTable({ ascendant: H.ascendant, midheaven: H.midheaven }, bodies);
}

function wireControls() {
  document.querySelectorAll('.controls button[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.controls button[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
      render().catch(e => showError('render error: ' + e.message));
    });
  });
  document.getElementById('show-midpoints').addEventListener('change', e => {
    state.showMidpoints = e.target.checked;
    render().catch(err => showError('render error: ' + err.message));
  });
}

async function main() {
  await initSwe();
  wireControls();
  await render();
}

main().catch(e => showError('main() error: ' + (e.stack || e.message || e)));
