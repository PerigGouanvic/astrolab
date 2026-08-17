// _astro — strate 1 : socle épuré (cercle, signes, maisons Placidus, planètes)
// Pas de LLM, pas d'analyse. Juste la carte.

import { Origin, Horoscope } from 'https://esm.sh/circular-natal-horoscope-js@1.1.0';

// ---------- Carte natale de démarrage ----------
// 22 janvier 1972 · 07:25 heure locale · Montréal (EST, UTC-5 en janvier)
const NATAL = {
  year: 1972,
  month: 0,          // 0-indexed (janvier = 0)
  date: 22,
  hour: 7,
  minute: 25,
  latitude: 45.5017,
  longitude: -73.5673,
  label: '22 janvier 1972 · 07 h 25 · Montréal',
};

// ---------- Glyphes ----------
const SIGN_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const SIGN_NAMES  = ['Bélier','Taureau','Gémeaux','Cancer','Lion','Vierge','Balance','Scorpion','Sagittaire','Capricorne','Verseau','Poissons'];

const PLANET_GLYPHS = {
  sun:     '☉',
  moon:    '☽',
  mercury: '☿',
  venus:   '♀',
  mars:    '♂',
  jupiter: '♃',
  saturn:  '♄',
  uranus:  '♅',
  neptune: '♆',
  pluto:   '♇',
  chiron:  '⚷',
  northnode: '☊',
  southnode: '☋',
  sirius: '★',
};

const PLANET_ORDER = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];

// ---------- Géométrie ----------
const R_OUTER = 470;          // cercle extérieur (bord SVG)
const R_ZODIAC_OUT = 440;     // bord externe anneau zodiacal
const R_ZODIAC_IN = 380;      // bord interne anneau zodiacal (= extérieur des maisons)
const R_HOUSE_TICK = 360;     // ticks maisons
const R_PLANET = 320;         // couronne des planètes
const R_HOUSE_NUM = 260;      // couronne des numéros de maison
const R_INNER = 60;           // trou central

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function normDeg(d) { return ((d % 360) + 360) % 360; }

// Convertit une longitude écliptique en point SVG.
// Convention : ASC à gauche (angle math 180°), sens antihoraire pour longitudes croissantes.
function project(lon, ascLon, radius) {
  const rel = normDeg(lon - ascLon);           // 0 à l'ASC
  const theta = (180 + rel) * DEG;             // radians dans repère math
  return {
    x: radius * Math.cos(theta),
    y: -radius * Math.sin(theta),              // Y inversé en SVG
  };
}

// ---------- Rendu SVG ----------
function svg(tag, attrs = {}, text = null) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

function drawChart(horoscope) {
  const container = document.getElementById('chart');
  container.innerHTML = '';

  const ascLon = horoscope.Ascendant.ChartPosition.Ecliptic.DecimalDegrees;
  const mcLon  = horoscope.Midheaven.ChartPosition.Ecliptic.DecimalDegrees;

  // 1. Cercles concentriques
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_OUT, class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_IN,  class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_INNER,      class: 'zodiac-inner' }));

  // 2. Divisions zodiacales (12 × 30°)
  for (let i = 0; i < 12; i++) {
    const lon = i * 30;
    const p1 = project(lon, ascLon, R_ZODIAC_IN);
    const p2 = project(lon, ascLon, R_ZODIAC_OUT);
    container.appendChild(svg('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'zodiac-divider',
    }));
    // Glyphe du signe au centre du secteur
    const centerLon = lon + 15;
    const gp = project(centerLon, ascLon, (R_ZODIAC_IN + R_ZODIAC_OUT) / 2);
    container.appendChild(svg('text', {
      x: gp.x, y: gp.y, class: 'sign-symbol',
    }, SIGN_GLYPHS[i]));
  }

  // 3. Cusps de maisons
  const cusps = horoscope.Houses.map(h => h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees);
  for (let i = 0; i < 12; i++) {
    const lon = cusps[i];
    const isAngle = (i === 0 || i === 3 || i === 6 || i === 9);
    const p1 = project(lon, ascLon, R_INNER);
    const p2 = project(lon, ascLon, R_ZODIAC_IN);
    container.appendChild(svg('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: isAngle ? 'house-cusp house-cusp-angle' : 'house-cusp',
    }));
    // Numéro de maison au milieu du secteur
    const nextLon = cusps[(i + 1) % 12];
    let arc = normDeg(nextLon - lon);
    const midLon = normDeg(lon + arc / 2);
    const np = project(midLon, ascLon, R_HOUSE_NUM);
    container.appendChild(svg('text', {
      x: np.x, y: np.y, class: 'house-number',
    }, String(i + 1)));
  }

  // 4. Étiquettes ASC / MC / DSC / IC
  const labels = [
    { lon: ascLon,               text: 'ASC' },
    { lon: mcLon,                text: 'MC'  },
    { lon: normDeg(ascLon+180),  text: 'DSC' },
    { lon: normDeg(mcLon+180),   text: 'IC'  },
  ];
  for (const l of labels) {
    const p = project(l.lon, ascLon, R_ZODIAC_OUT + 20);
    container.appendChild(svg('text', {
      x: p.x, y: p.y, class: 'angle-label',
    }, l.text));
  }

  // 5. Planètes
  const bodies = horoscope.CelestialBodies.all;
  const placed = [];
  for (const b of bodies) {
    const key = b.key.toLowerCase();
    if (!PLANET_ORDER.includes(key)) continue;
    const lon = b.ChartPosition.Ecliptic.DecimalDegrees;
    placed.push({ key, lon, glyph: PLANET_GLYPHS[key] || key[0].toUpperCase() });
  }
  placed.sort((a, b) => normDeg(a.lon - ascLon) - normDeg(b.lon - ascLon));

  // Anti-collision naïf : décale radialement si trop proche du voisin précédent
  const MIN_SEP = 8; // degrés
  let lastLon = -999;
  let ringOffset = 0;
  for (const p of placed) {
    const sep = normDeg(p.lon - lastLon);
    if (sep < MIN_SEP && lastLon > -999) {
      ringOffset += 26;
    } else {
      ringOffset = 0;
    }
    const r = R_PLANET - ringOffset;
    const pt = project(p.lon, ascLon, r);
    // Petit tick sur l'anneau des maisons pour position exacte
    const tick1 = project(p.lon, ascLon, R_HOUSE_TICK);
    const tick2 = project(p.lon, ascLon, R_HOUSE_TICK - 12);
    container.appendChild(svg('line', {
      x1: tick1.x, y1: tick1.y, x2: tick2.x, y2: tick2.y, class: 'planet-tick',
    }));
    container.appendChild(svg('text', {
      x: pt.x, y: pt.y, class: 'planet-symbol',
    }, p.glyph));
    // Degré dans le signe
    const degInSign = Math.floor(p.lon % 30);
    const dp = project(p.lon, ascLon, r - 22);
    container.appendChild(svg('text', {
      x: dp.x, y: dp.y, class: 'planet-degree',
    }, degInSign + '°'));
    lastLon = p.lon;
  }
}

// ---------- Table de données textuelle (accessibilité + lecture rapide) ----------
function formatSign(lon) {
  const idx = Math.floor(normDeg(lon) / 30);
  const deg = Math.floor(lon % 30);
  const minPart = (lon % 1) * 60;
  const min = Math.floor(minPart);
  return `${deg}° ${SIGN_GLYPHS[idx]} ${String(min).padStart(2,'0')}'`;
}

function drawDataTable(horoscope) {
  const container = document.getElementById('chart-data');
  const rows = [];
  rows.push('<h2 style="text-align:center;font-weight:400;font-size:1rem;margin-top:0;">Positions</h2>');
  rows.push('<table>');
  rows.push(`<tr><td class="glyph">ASC</td><td>${formatSign(horoscope.Ascendant.ChartPosition.Ecliptic.DecimalDegrees)}</td></tr>`);
  rows.push(`<tr><td class="glyph">MC</td><td>${formatSign(horoscope.Midheaven.ChartPosition.Ecliptic.DecimalDegrees)}</td></tr>`);
  for (const b of horoscope.CelestialBodies.all) {
    const key = b.key.toLowerCase();
    if (!PLANET_ORDER.includes(key)) continue;
    const g = PLANET_GLYPHS[key] || key;
    rows.push(`<tr><td class="glyph">${g}</td><td>${formatSign(b.ChartPosition.Ecliptic.DecimalDegrees)}</td></tr>`);
  }
  rows.push('</table>');
  container.innerHTML = rows.join('');
}

// ---------- Bootstrap ----------
function main() {
  const info = document.getElementById('chart-info');
  info.textContent = NATAL.label;

  const origin = new Origin({
    year: NATAL.year,
    month: NATAL.month,
    date: NATAL.date,
    hour: NATAL.hour,
    minute: NATAL.minute,
    latitude: NATAL.latitude,
    longitude: NATAL.longitude,
  });

  const horoscope = new Horoscope({
    origin: origin,
    houseSystem: 'placidus',
    zodiac: 'tropical',
    aspectPoints: ['bodies'],
    aspectWithPoints: ['bodies'],
    language: 'en',
  });

  drawChart(horoscope);
  drawDataTable(horoscope);
}

main();
