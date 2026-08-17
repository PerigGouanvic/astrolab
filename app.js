// astrolab — strate 1 : socle épuré
// Erreurs affichées à l'écran (mobile-first, console peu accessible).

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

// Import dynamique avec fallback default/named
async function loadLib() {
  const url = 'https://esm.sh/circular-natal-horoscope-js';
  const mod = await import(url);
  const Origin = mod.Origin || (mod.default && mod.default.Origin);
  const Horoscope = mod.Horoscope || (mod.default && mod.default.Horoscope);
  if (!Origin || !Horoscope) {
    throw new Error(
      'Origin/Horoscope introuvables dans le module.\n' +
      'Clés module: ' + Object.keys(mod).join(', ') +
      (mod.default ? '\nClés default: ' + Object.keys(mod.default).join(', ') : '')
    );
  }
  return { Origin, Horoscope };
}

const NATAL = {
  year: 1972, month: 0, date: 22,
  hour: 7, minute: 25,
  latitude: 45.5017, longitude: -73.5673,
  label: '22 janvier 1972 · 07 h 25 · Montréal',
};

const SIGN_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const PLANET_GLYPHS = {
  sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂',
  jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇',
  chiron: '⚷', northnode: '☊', southnode: '☋',
};
const PLANET_ORDER = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];

const R_ZODIAC_OUT = 440;
const R_ZODIAC_IN  = 380;
const R_HOUSE_TICK = 360;
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

// Extraction robuste : la lib nested ses propriétés dans plusieurs formes possibles
function getDD(node) {
  if (node == null) return null;
  if (typeof node === 'number') return node;
  if (typeof node.DecimalDegrees === 'number') return node.DecimalDegrees;
  if (node.Ecliptic) return getDD(node.Ecliptic);
  if (node.ChartPosition) return getDD(node.ChartPosition);
  return null;
}
function getBodyLon(body) {
  return getDD(body.ChartPosition) ?? getDD(body);
}
function getHouseLon(house) {
  if (house.ChartPosition && house.ChartPosition.StartPosition) return getDD(house.ChartPosition.StartPosition);
  if (house.StartPosition) return getDD(house.StartPosition);
  if (house.ChartPosition) return getDD(house.ChartPosition);
  if (typeof house.position === 'number') return house.position;
  return null;
}

function drawChart(horoscope) {
  const container = document.getElementById('chart');
  container.innerHTML = '';

  const ascLon = getBodyLon(horoscope.Ascendant);
  const mcLon  = getBodyLon(horoscope.Midheaven);
  if (ascLon == null || mcLon == null) {
    throw new Error('Ascendant/MC introuvables.\nhoroscope keys: ' + Object.keys(horoscope).join(', ') +
                    '\nAscendant sample: ' + JSON.stringify(horoscope.Ascendant, null, 2).slice(0, 500));
  }

  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_OUT, class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_IN,  class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_INNER,      class: 'zodiac-inner' }));

  for (let i = 0; i < 12; i++) {
    const lon = i * 30;
    const p1 = project(lon, ascLon, R_ZODIAC_IN);
    const p2 = project(lon, ascLon, R_ZODIAC_OUT);
    container.appendChild(svg('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'zodiac-divider' }));
    const gp = project(lon + 15, ascLon, (R_ZODIAC_IN + R_ZODIAC_OUT) / 2);
    container.appendChild(svg('text', { x: gp.x, y: gp.y, class: 'sign-symbol' }, SIGN_GLYPHS[i]));
  }

  const houses = horoscope.Houses || [];
  const cusps = houses.map(h => getHouseLon(h));
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

  const labels = [
    { lon: ascLon,               text: 'ASC' },
    { lon: mcLon,                text: 'MC'  },
    { lon: normDeg(ascLon+180),  text: 'DSC' },
    { lon: normDeg(mcLon+180),   text: 'IC'  },
  ];
  for (const l of labels) {
    const p = project(l.lon, ascLon, R_ZODIAC_OUT + 20);
    container.appendChild(svg('text', { x: p.x, y: p.y, class: 'angle-label' }, l.text));
  }

  const bodies = (horoscope.CelestialBodies && horoscope.CelestialBodies.all) || [];
  const placed = [];
  for (const b of bodies) {
    const key = String(b.key || '').toLowerCase();
    if (!PLANET_ORDER.includes(key)) continue;
    const lon = getBodyLon(b);
    if (lon == null) continue;
    placed.push({ key, lon, glyph: PLANET_GLYPHS[key] || key[0].toUpperCase() });
  }
  placed.sort((a, b) => normDeg(a.lon - ascLon) - normDeg(b.lon - ascLon));

  const MIN_SEP = 8;
  let lastLon = -999, ringOffset = 0;
  for (const p of placed) {
    const sep = normDeg(p.lon - lastLon);
    if (sep < MIN_SEP && lastLon > -999) ringOffset += 26; else ringOffset = 0;
    const r = R_PLANET - ringOffset;
    const pt = project(p.lon, ascLon, r);
    const t1 = project(p.lon, ascLon, R_HOUSE_TICK);
    const t2 = project(p.lon, ascLon, R_HOUSE_TICK - 12);
    container.appendChild(svg('line', { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, class: 'planet-tick' }));
    container.appendChild(svg('text', { x: pt.x, y: pt.y, class: 'planet-symbol' }, p.glyph));
    const degInSign = Math.floor(p.lon % 30);
    const dp = project(p.lon, ascLon, r - 22);
    container.appendChild(svg('text', { x: dp.x, y: dp.y, class: 'planet-degree' }, degInSign + '°'));
    lastLon = p.lon;
  }

  return { ascLon, mcLon };
}

function formatSign(lon) {
  const idx = Math.floor(normDeg(lon) / 30);
  const deg = Math.floor(lon % 30);
  const min = Math.floor((lon % 1) * 60);
  return `${deg}° ${SIGN_GLYPHS[idx]} ${String(min).padStart(2,'0')}'`;
}

function drawDataTable(horoscope, ascLon, mcLon) {
  const container = document.getElementById('chart-data');
  const rows = [];
  rows.push('<h2 style="text-align:center;font-weight:400;font-size:1rem;margin-top:0;">Positions</h2>');
  rows.push('<table>');
  rows.push(`<tr><td class="glyph">ASC</td><td>${formatSign(ascLon)}</td></tr>`);
  rows.push(`<tr><td class="glyph">MC</td><td>${formatSign(mcLon)}</td></tr>`);
  const bodies = (horoscope.CelestialBodies && horoscope.CelestialBodies.all) || [];
  for (const b of bodies) {
    const key = String(b.key || '').toLowerCase();
    if (!PLANET_ORDER.includes(key)) continue;
    const g = PLANET_GLYPHS[key] || key;
    const lon = getBodyLon(b);
    if (lon == null) continue;
    rows.push(`<tr><td class="glyph">${g}</td><td>${formatSign(lon)}</td></tr>`);
  }
  rows.push('</table>');
  container.innerHTML = rows.join('');
}

async function main() {
  document.getElementById('chart-info').textContent = NATAL.label;

  const { Origin, Horoscope } = await loadLib();

  const origin = new Origin({
    year: NATAL.year, month: NATAL.month, date: NATAL.date,
    hour: NATAL.hour, minute: NATAL.minute,
    latitude: NATAL.latitude, longitude: NATAL.longitude,
  });

  const horoscope = new Horoscope({
    origin: origin,
    houseSystem: 'placidus',
    zodiac: 'tropical',
    aspectPoints: ['bodies'],
    aspectWithPoints: ['bodies'],
    language: 'en',
  });

  const { ascLon, mcLon } = drawChart(horoscope);
  drawDataTable(horoscope, ascLon, mcLon);
}

main().catch(e => showError('main() error: ' + (e.stack || e.message || e)));
