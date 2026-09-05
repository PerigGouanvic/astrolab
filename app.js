// astrolab — strate 2 : Swiss Ephemeris + astéroïdes à la demande
//   - Sun→Pluto + Chiron + Ceres/Pallas/Juno/Vesta
//   - Astéroïdes MPC arbitraires (fetch à la demande via proxy CORS)
//   - Modes maintenant / natal
//   - Couches soustractives : signes, maisons, planètes, mi-points, astéroïdes, aspects
//   - Aspects majeurs (conjonction, opposition, trigone, carré, sextile)
//   - Rétrogrades ℞

// jsDelivr +esm : bundle self-contained avec process.browser=true.
// esm.sh polyfille process.versions.node truthy → swisseph tente createRequire() → boom.
const SWE_URL = 'https://cdn.jsdelivr.net/npm/@kuntay/swisseph@0.2.2/+esm';

// URL du proxy CORS pour les fichiers .se1 d'astéroïdes.
// Format attendu : préfixe auquel on concatène l'URL upstream complète.
// - Défaut : proxy.cors.sh — service public, marche out of the box.
// - Alternative : ton propre Deno Deploy — voir proxy/README.md.
const PROXY_URL = localStorage.getItem('astrolab.proxyUrl') || 'https://proxy.cors.sh/';
const UPSTREAM = 'https://ephe.scryr.io/ephe';

const CATALOG_URL = 'asteroids.json';

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
    console.warn('loadEphemeris a échoué — fallback Moshier :', e.message);
  }
  return swe;
}

// ---------- Lieux et modes ----------
const MONTREAL = { latitude: 45.5017, longitude: -73.5673, tz: 'America/Montreal', label: 'Montréal' };

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
// U+FE0E (VS15) force la présentation "text" des glyphes Unicode,
// évitant le rendu emoji couleur des fonts système sur mobile (Noto Color,
// Apple Color Emoji…). Sans ça, les signes ressortent en couleur alors
// que tout le reste de la charte est monochrome.
const VS15 = '︎';
const PLANETS = [
  { key: 'sun',     idx: 0,  glyph: '☉' + VS15 },
  { key: 'moon',    idx: 1,  glyph: '☽' + VS15 },
  { key: 'mercury', idx: 2,  glyph: '☿' + VS15 },
  { key: 'venus',   idx: 3,  glyph: '♀' + VS15 },
  { key: 'mars',    idx: 4,  glyph: '♂' + VS15 },
  { key: 'jupiter', idx: 5,  glyph: '♃' + VS15 },
  { key: 'saturn',  idx: 6,  glyph: '♄' + VS15 },
  { key: 'uranus',  idx: 7,  glyph: '♅' + VS15 },
  { key: 'neptune', idx: 8,  glyph: '♆' + VS15 },
  { key: 'pluto',   idx: 9,  glyph: '♇' + VS15 },
];
const EXTENDED = [
  { key: 'chiron',  idx: 15, glyph: '⚷' + VS15 },
  { key: 'ceres',   idx: 17, glyph: '⚳' + VS15 },
  { key: 'pallas',  idx: 18, glyph: '⚴' + VS15 },
  { key: 'juno',    idx: 19, glyph: '⚵' + VS15 },
  { key: 'vesta',   idx: 20, glyph: '⚶' + VS15 },
];
const SIGN_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'].map(g => g + VS15);

// ---------- Astéroïdes : catalogue + fetch/mount à la demande ----------
let catalogPromise;
async function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL).then(r => r.ok ? r.json() : []);
  }
  return catalogPromise;
}

const mountedAsteroids = new Set();

function asteroidFileName(mpc) {
  return { folder: `ast${Math.floor(mpc / 1000)}`, file: `se${String(mpc).padStart(5, '0')}s.se1` };
}

async function mountAsteroid(mpc) {
  if (mountedAsteroids.has(mpc)) return true;
  const { folder, file } = asteroidFileName(mpc);
  const upstream = `${UPSTREAM}/${folder}/${file}`;
  const url = PROXY_URL + upstream;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Astéroïde ${mpc} : HTTP ${res.status} via proxy ${PROXY_URL}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  swe.mountEphemeris({ [file]: bytes });
  mountedAsteroids.add(mpc);
  return true;
}

// ---------- Géométrie ----------
// Refonte : glyphes planètes à l'extérieur de la ceinture, ceinture 2× plus fine,
// pas de cercle central, aspects tracés dans l'espace vide intérieur.
// viewBox 1040×1040 (marge 20 pour accueillir les glyphes extérieurs).
const R_ZODIAC_OUT   = 380;   // bord extérieur ceinture des signes
const R_ZODIAC_IN    = 350;   // bord intérieur ceinture (épaisseur 30, 2× plus fine)
const R_HOUSE_END    = 400;   // cusps de maisons dépassent 20 au-delà de la ceinture
const R_ANGLE_EXTEND = 510;   // axes ASC/DSC/MC/IC traversent tout le viewBox
const R_HOUSE_NUM    = 335;   // numéros de maisons juste sous la ceinture (dans l'anneau)
const R_MIDPOINT     = R_ZODIAC_IN - 8;  // ticks mi-points côté intérieur ceinture
const R_PLANET_TICK  = R_ZODIAC_OUT;     // tick de position sur le bord extérieur
const R_PLANET_TICK_END = R_ZODIAC_OUT + 8;
const R_PLANET       = 415;   // glyphes planètes à l'extérieur
const R_PLANET_DEG   = 448;   // degrés au-delà du glyphe
const R_ASTEROID_DOT = 465;   // astéroïdes encore plus à l'extérieur
const R_ASTEROID_LBL = 488;   // labels courts
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

// ---------- Mi-points (uniquement entre planètes majeures) ----------
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

// ---------- Aspects par harmonique (1 à 9) ----------
// Chaque harmonique n regroupe les aspects nouveaux qu'elle apporte, c'est-à-dire
// les angles k × (360/n) non déjà couverts par une harmonique inférieure. Ainsi
// activer H1..H4 seulement donne les majeurs classiques, ajouter H6 ajoute le
// sextile (le 120° est déjà en H3, le 180° en H2), etc.
const HARMONICS_BY_N = {
  1: [{ key: 'conjunction',    angle:   0,     orb: 8   }],
  2: [{ key: 'opposition',     angle: 180,     orb: 8   }],
  3: [{ key: 'trine',          angle: 120,     orb: 6   }],
  4: [{ key: 'square',         angle:  90,     orb: 6   }],
  5: [
    { key: 'quintile',         angle:  72,     orb: 2   },
    { key: 'biquintile',       angle: 144,     orb: 2   },
  ],
  6: [{ key: 'sextile',        angle:  60,     orb: 4   }],
  7: [
    { key: 'septile',          angle: 360/7,   orb: 1.5 },   // ≈ 51.43
    { key: 'biseptile',        angle: 720/7,   orb: 1.5 },   // ≈ 102.86
    { key: 'triseptile',       angle: 1080/7,  orb: 1.5 },   // ≈ 154.29
  ],
  8: [
    { key: 'semisquare',       angle:  45,     orb: 2   },
    { key: 'sesquisquare',     angle: 135,     orb: 2   },
  ],
  9: [
    { key: 'novile',           angle:  40,     orb: 1.5 },
    { key: 'binovile',         angle:  80,     orb: 1.5 },
    { key: 'quadnovile',       angle: 160,     orb: 1.5 },
  ],
};
function angularSeparation(lonA, lonB) {
  const d = normDeg(lonA - lonB);
  return d > 180 ? 360 - d : d;
}
function computeAspectsForHarmonics(bodies, harmonicsSet) {
  // harmonicsSet : Set<number> des n activés (sous-ensemble de 1..9).
  // Retourne un aspect avec { a, b, type, n, orb } — n est le numéro d'harmonique
  // qui a produit le match (utilisé comme chiffre en mode d'affichage 'digits').
  // Ordre : par n croissant, pour que les harmoniques fondamentales priment.
  const activeSets = [];
  for (const n of [...harmonicsSet].sort((a, b) => a - b)) {
    for (const a of (HARMONICS_BY_N[n] || [])) activeSets.push({ ...a, n });
  }
  const out = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = angularSeparation(bodies[i].lon, bodies[j].lon);
      for (const a of activeSets) {
        const delta = Math.abs(sep - a.angle);
        if (delta <= a.orb) {
          out.push({ a: bodies[i], b: bodies[j], type: a.key, n: a.n, orb: delta });
          break;
        }
      }
    }
  }
  return out;
}

// ---------- Rendu SVG ----------
// Refonte : le cercle est ouvert à l'intérieur (plus de sous-cercle central),
// la ceinture des signes est fine, les astres vivent à l'extérieur, les
// aspects traversent l'espace vide central de bord intérieur à bord intérieur.
// La logique soustractive reste le moteur : chaque couche est indépendamment
// affichable / masquable via `layers` (aucun élément DOM si masquée).
function drawChart({ cusps, ascendant, midheaven, bodies, asteroids }, layers) {
  const container = document.getElementById('chart');
  container.innerHTML = '';
  const ascLon = ascendant;

  // Anneaux de fond : bord extérieur + bord intérieur de la ceinture (fine)
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_OUT, class: 'zodiac-ring' }));
  container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ZODIAC_IN,  class: 'zodiac-ring' }));

  // Signes : ticks 1° très fins (subdivision de chaque signe) puis séparateurs
  // 30° foncés (démarcation des signes) puis glyphes centrés dans la ceinture.
  if (layers.signs) {
    // Ticks 1° côté intérieur, sauf multiples de 30 (déjà tracés en séparateurs)
    for (let d = 0; d < 360; d++) {
      if (d % 30 === 0) continue;
      const p1 = project(d, ascLon, R_ZODIAC_IN);
      const p2 = project(d, ascLon, R_ZODIAC_IN + 3);
      container.appendChild(svg('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'degree-tick' }));
    }
    // Séparateurs 30° : traversent toute la ceinture, foncés
    for (let i = 0; i < 12; i++) {
      const lon = i * 30;
      const p1 = project(lon, ascLon, R_ZODIAC_IN);
      const p2 = project(lon, ascLon, R_ZODIAC_OUT);
      container.appendChild(svg('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'zodiac-divider' }));
    }
    // Glyphes signes centrés dans la ceinture (au milieu de chaque tranche 30°)
    for (let i = 0; i < 12; i++) {
      const gp = project(i * 30 + 15, ascLon, (R_ZODIAC_IN + R_ZODIAC_OUT) / 2);
      container.appendChild(svg('text', { x: gp.x, y: gp.y, class: 'sign-symbol' }, SIGN_GLYPHS[i]));
    }
  }

  // Maisons : cusps du centre au-delà de la ceinture ; axes ASC/DSC/MC/IC
  // traversent tout le viewBox pour évoquer l'ossature-base de la carte.
  if (layers.houses) {
    for (let i = 0; i < 12; i++) {
      const lon = cusps[i];
      if (lon == null) continue;
      const isAngle = (i === 0 || i === 3 || i === 6 || i === 9);
      if (isAngle) {
        // Axe complet : de -R_ANGLE_EXTEND à +R_ANGLE_EXTEND sur l'axe (traverse le viewBox)
        const p1 = project(lon,                ascLon, R_ANGLE_EXTEND);
        const p2 = project(normDeg(lon + 180), ascLon, R_ANGLE_EXTEND);
        container.appendChild(svg('line', {
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'house-cusp-angle',
        }));
      } else {
        // Cusp normal : du centre à R_HOUSE_END (dépasse au-delà de la ceinture)
        container.appendChild(svg('line', {
          x1: 0, y1: 0,
          x2: project(lon, ascLon, R_HOUSE_END).x,
          y2: project(lon, ascLon, R_HOUSE_END).y,
          class: 'house-cusp',
        }));
      }
      // Numéro de maison au milieu de la tranche, juste sous la ceinture
      const nextLon = cusps[(i + 1) % 12];
      if (nextLon != null) {
        const arc = normDeg(nextLon - lon);
        const midLon = normDeg(lon + arc / 2);
        const np = project(midLon, ascLon, R_HOUSE_NUM);
        container.appendChild(svg('text', { x: np.x, y: np.y, class: 'house-number' }, String(i + 1)));
      }
    }
    // Labels ASC/MC/DSC/IC au bout des axes (juste à l'intérieur du viewBox)
    const angleLabels = [
      { lon: ascLon, text: 'ASC' }, { lon: midheaven, text: 'MC' },
      { lon: normDeg(ascLon + 180), text: 'DSC' }, { lon: normDeg(midheaven + 180), text: 'IC' },
    ];
    for (const l of angleLabels) {
      const p = project(l.lon, ascLon, R_ANGLE_EXTEND - 15);
      container.appendChild(svg('text', { x: p.x, y: p.y, class: 'angle-label' }, l.text));
    }
  }

  // Mi-points entre planètes majeures (ticks fins côté intérieur de la ceinture)
  if (layers.midpoints && layers.planets) {
    for (const m of computeMidpoints(bodies)) {
      const t1 = project(m.lon, ascLon, R_ZODIAC_IN);
      const t2 = project(m.lon, ascLon, R_ZODIAC_IN - 8);
      container.appendChild(svg('line', { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, class: 'midpoint-tick' }));
    }
  }

  // Aspects : cordes de bord intérieur à bord intérieur, dans l'espace vide central.
  // Unifiés par harmonique (1..9) — les majeurs classiques sont juste H1..H4.
  // Deux styles de rendu (state.aspectStyle) :
  //   - 'lines'  : corde continue, palette par harmonique (aspect-h${n})
  //   - 'digits' : chiffre d'harmonique répété le long du segment (aspect-digit-${n})
  if (layers.planets && state.harmonics.size > 0) {
    const aspects = computeAspectsForHarmonics(bodies, state.harmonics);
    const useDigits = state.aspectStyle === 'digits';
    for (const asp of aspects) {
      const p1 = project(asp.a.lon, ascLon, R_ZODIAC_IN);
      const p2 = project(asp.b.lon, ascLon, R_ZODIAC_IN);
      if (useDigits) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        // Pas de 10 unités entre chiffres — assez dense pour lire la corde,
        // assez espacé pour rester lisible en mode zoom.
        const step = 10;
        const k = Math.max(2, Math.floor(len / step));
        for (let i = 1; i < k; i++) {
          const t = i / k;
          container.appendChild(svg('text', {
            x: p1.x + dx * t, y: p1.y + dy * t,
            class: `aspect-digit aspect-digit-${asp.n}`,
          }, String(asp.n)));
        }
      } else {
        container.appendChild(svg('line', {
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          class: `aspect aspect-h${asp.n}`,
        }));
      }
    }
  }

  // Astéroïdes : tick sur la ceinture pour marquer la position exacte,
  // puis dot + label plus à l'extérieur (au-delà de l'anneau planétaire)
  if (layers.asteroids) {
    for (const a of asteroids) {
      const tk1 = project(a.lon, ascLon, R_ZODIAC_OUT);
      const tk2 = project(a.lon, ascLon, R_ZODIAC_OUT + 6);
      container.appendChild(svg('line', { x1: tk1.x, y1: tk1.y, x2: tk2.x, y2: tk2.y, class: 'asteroid-tick' }));
      const pt = project(a.lon, ascLon, R_ASTEROID_DOT);
      container.appendChild(svg('circle', { cx: pt.x, cy: pt.y, r: 3, class: 'asteroid-dot' }));
      const lp = project(a.lon, ascLon, R_ASTEROID_LBL);
      container.appendChild(svg('text', { x: lp.x, y: lp.y, class: 'asteroid-label' }, a.name.slice(0, 8)));
    }
  }

  // Planètes : glyphes à l'extérieur de la ceinture (plus gros, plus lisibles).
  // Tick de position sur le bord extérieur de la ceinture pour ancrer visuellement
  // la longitude exacte du corps. Décalage radial si plusieurs planètes serrées.
  if (layers.planets) {
    const sorted = [...bodies].sort((a, b) => normDeg(a.lon - ascLon) - normDeg(b.lon - ascLon));
    const MIN_SEP = 8;
    let lastLon = -999, ringOffset = 0;
    for (const p of sorted) {
      const sep = normDeg(p.lon - lastLon);
      if (sep < MIN_SEP && lastLon > -999) ringOffset += 28; else ringOffset = 0;
      const rGlyph = R_PLANET + ringOffset;
      const rDeg   = R_PLANET_DEG + ringOffset;
      const pt = project(p.lon, ascLon, rGlyph);
      const tk1 = project(p.lon, ascLon, R_PLANET_TICK);
      const tk2 = project(p.lon, ascLon, R_PLANET_TICK_END);
      container.appendChild(svg('line', { x1: tk1.x, y1: tk1.y, x2: tk2.x, y2: tk2.y, class: 'planet-tick' }));
      container.appendChild(svg('text', { x: pt.x, y: pt.y, class: 'planet-symbol' }, p.glyph));
      const degInSign = Math.floor(p.lon % 30);
      const dp = project(p.lon, ascLon, rDeg);
      container.appendChild(svg('text', { x: dp.x, y: dp.y, class: 'planet-degree' }, degInSign + '°' + (p.retro ? ' ℞' : '')));
      lastLon = p.lon;
    }
  }
}

// ---------- Table ----------
function formatSign(lon) {
  const idx = Math.floor(normDeg(lon) / 30);
  const deg = Math.floor(lon % 30);
  const min = Math.floor((lon % 1) * 60);
  return `${deg}° ${SIGN_GLYPHS[idx]} ${String(min).padStart(2, '0')}'`;
}
function drawDataTable({ ascendant, midheaven }, bodies, asteroids) {
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
  if (asteroids.length) {
    rows.push('<tr><td colspan="2" style="padding-top:1rem;font-style:italic;text-align:center;">Astéroïdes</td></tr>');
    for (const a of asteroids) {
      const suffix = a.retro ? ' <span style="opacity:.7">℞</span>' : '';
      rows.push(`<tr><td class="glyph" style="font-size:.9rem;">(${a.mpc}) ${a.name}</td><td>${formatSign(a.lon)}${suffix}</td></tr>`);
    }
  }
  rows.push('</table>');
  container.innerHTML = rows.join('');
}

// ---------- État + persistance ----------
const STORAGE_KEY    = 'astrolab.asteroids';
const LAYERS_KEY     = 'astrolab.layers';
const HARMONICS_KEY  = 'astrolab.harmonics';
const ASPECT_STYLE_KEY = 'astrolab.aspectStyle';
const DEFAULT_LAYERS = {
  signs: true, houses: true, planets: true,
  midpoints: false, asteroids: true,
};
const DEFAULT_HARMONICS = [1, 2, 3, 4];  // majeurs classiques (conj, opp, tri, carré)
function loadStored(key, defaults) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '{}');
    return { ...defaults, ...stored };
  } catch { return { ...defaults }; }
}
function loadHarmonics() {
  try {
    const arr = JSON.parse(localStorage.getItem(HARMONICS_KEY));
    if (Array.isArray(arr)) {
      return new Set(arr.filter(n => Number.isInteger(n) && n >= 1 && n <= 9));
    }
  } catch {}
  return new Set(DEFAULT_HARMONICS);
}
let state = {
  mode: 'now',
  layers: loadStored(LAYERS_KEY, DEFAULT_LAYERS),
  harmonics: loadHarmonics(),
  aspectStyle: localStorage.getItem(ASPECT_STYLE_KEY) || 'lines',  // 'lines' | 'digits'
  asteroids: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
};
function saveAsteroids()   { localStorage.setItem(STORAGE_KEY,       JSON.stringify(state.asteroids)); }
function saveLayers()      { localStorage.setItem(LAYERS_KEY,        JSON.stringify(state.layers));    }
function saveHarmonics()   { localStorage.setItem(HARMONICS_KEY,     JSON.stringify([...state.harmonics].sort((a,b)=>a-b))); }
function saveAspectStyle() { localStorage.setItem(ASPECT_STYLE_KEY,  state.aspectStyle); }

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

function computeAsteroids(jd) {
  const out = [];
  for (const [mpc, name] of state.asteroids) {
    if (!mountedAsteroids.has(mpc)) continue;
    try {
      const r = swe.calc(jd, sweMod.asteroidBody(mpc));
      out.push({ mpc, name, lon: r.longitude, retro: r.longitudeSpeed < 0 });
    } catch (e) {
      console.warn(`astéroïde (${mpc}) ${name} :`, e.message);
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
  const asteroids = computeAsteroids(config.jd);
  drawChart(
    { cusps: H.cusps, ascendant: H.ascendant, midheaven: H.midheaven, bodies, asteroids },
    state.layers,
  );
  drawDataTable({ ascendant: H.ascendant, midheaven: H.midheaven }, bodies, asteroids);
  renderAsteroidChips();
}

// ---------- UI astéroïdes ----------
function renderAsteroidChips() {
  const box = document.getElementById('asteroid-chips');
  if (!box) return;
  box.innerHTML = '';
  for (const [mpc, name] of state.asteroids) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span>(${mpc}) ${name}</span><button title="Retirer" data-mpc="${mpc}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => removeAsteroid(mpc));
    box.appendChild(chip);
  }
}

async function addAsteroid(mpc, name) {
  if (state.asteroids.some(([m]) => m === mpc)) return;
  try {
    await mountAsteroid(mpc);
    state.asteroids.push([mpc, name]);
    saveAsteroids();
    await render();
  } catch (e) {
    showError(`Impossible d'ajouter (${mpc}) ${name} : ${e.message}`);
  }
}

async function removeAsteroid(mpc) {
  state.asteroids = state.asteroids.filter(([m]) => m !== mpc);
  saveAsteroids();
  await render();
}

async function wireAsteroidSearch() {
  const input = document.getElementById('asteroid-search');
  const dropdown = document.getElementById('asteroid-dropdown');
  if (!input || !dropdown) return;

  let catalog;
  let debounceTimer;

  async function ensureCatalog() {
    if (!catalog) catalog = await loadCatalog();
    return catalog;
  }

  function updateDropdown(q) {
    if (!catalog || !q) { dropdown.hidden = true; dropdown.innerHTML = ''; return; }
    const term = q.trim().toLowerCase();
    const isNumeric = /^\d+$/.test(term);
    const matches = [];
    const limit = 20;
    if (isNumeric) {
      const n = parseInt(term, 10);
      for (const [mpc, name] of catalog) {
        if (String(mpc).startsWith(term)) matches.push([mpc, name]);
        if (matches.length >= limit) break;
      }
    } else {
      for (const [mpc, name] of catalog) {
        if (name.toLowerCase().startsWith(term)) matches.push([mpc, name]);
        if (matches.length >= limit) break;
      }
    }
    dropdown.innerHTML = matches.length
      ? matches.map(([m, n]) => `<div class="option" data-mpc="${m}" data-name="${n.replace(/"/g,'&quot;')}"><b>(${m})</b> ${n}</div>`).join('')
      : '<div class="option empty">Aucun résultat</div>';
    dropdown.hidden = false;
    dropdown.querySelectorAll('.option[data-mpc]').forEach(el => {
      el.addEventListener('click', () => {
        addAsteroid(+el.dataset.mpc, el.dataset.name);
        input.value = '';
        dropdown.hidden = true;
      });
    });
  }

  input.addEventListener('focus', () => { ensureCatalog().then(() => updateDropdown(input.value)); });
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => ensureCatalog().then(() => updateDropdown(input.value)), 120);
  });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.hidden = true, 200); });
}

function wireControls() {
  document.querySelectorAll('.controls button[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.controls button[data-mode]').forEach(b => b.classList.toggle('active', b === btn));
      render().catch(e => showError('render error: ' + e.message));
    });
  });
  document.querySelectorAll('.layers input[data-layer]').forEach(inp => {
    const key = inp.dataset.layer;
    inp.checked = !!state.layers[key];
    inp.addEventListener('change', e => {
      state.layers[key] = e.target.checked;
      saveLayers();
      render().catch(err => showError('render error: ' + err.message));
    });
  });
  wireAspectsMenu();
  wireAsteroidSearch();
  wireProxySettings();
}

function wireAspectsMenu() {
  const toggle = document.querySelector('.aspects-toggle');
  const panel  = document.querySelector('.aspects-panel');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  // Fermeture au clic extérieur (pour cohérence mobile)
  document.addEventListener('click', e => {
    if (panel.hidden) return;
    if (toggle.contains(e.target) || panel.contains(e.target)) return;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  });

  // Checkboxes 1..9 : init depuis state + toggle sur change
  document.querySelectorAll('.aspects-panel input[data-harmonic]').forEach(inp => {
    const n = parseInt(inp.dataset.harmonic, 10);
    inp.checked = state.harmonics.has(n);
    inp.addEventListener('change', e => {
      if (e.target.checked) state.harmonics.add(n);
      else                  state.harmonics.delete(n);
      saveHarmonics();
      updateAspectsSummary();
      render().catch(err => showError('render error: ' + err.message));
    });
  });

  // Segmented control ligne / chiffre
  document.querySelectorAll('.aspects-panel [data-aspect-style]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.aspectStyle === state.aspectStyle);
    btn.addEventListener('click', () => {
      state.aspectStyle = btn.dataset.aspectStyle;
      saveAspectStyle();
      document.querySelectorAll('.aspects-panel [data-aspect-style]').forEach(b =>
        b.classList.toggle('active', b === btn));
      render().catch(err => showError('render error: ' + err.message));
    });
  });

  updateAspectsSummary();
}

function updateAspectsSummary() {
  const el = document.querySelector('.aspects-summary');
  if (!el) return;
  const active = [...state.harmonics].sort((a, b) => a - b);
  el.textContent = active.length ? active.join('·') : '—';
}

async function remountSavedAsteroids() {
  if (!state.asteroids.length) return;
  await Promise.all(state.asteroids.map(([mpc, name]) =>
    mountAsteroid(mpc).catch(e => console.warn(`skip (${mpc}) ${name}:`, e.message))
  ));
}

function wireProxySettings() {
  const btn = document.getElementById('proxy-settings');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = localStorage.getItem('astrolab.proxyUrl') || PROXY_URL;
    const next = prompt(
      'URL du proxy CORS (préfixe auquel on concatène l\'URL upstream) :\n\n' +
      '• Défaut : https://proxy.cors.sh/\n' +
      '• Ton Deno Deploy : https://<toi>.deno.dev/\n\n' +
      'Laisse vide pour restaurer le défaut.',
      current
    );
    if (next === null) return;
    if (next.trim() === '') localStorage.removeItem('astrolab.proxyUrl');
    else localStorage.setItem('astrolab.proxyUrl', next.trim());
    location.reload();
  });
}

async function main() {
  await initSwe();
  wireControls();
  await remountSavedAsteroids();
  await render();
}

main().catch(e => showError('main() error: ' + (e.stack || e.message || e)));
