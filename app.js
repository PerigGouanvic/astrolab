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

// crypto.randomUUID n'existe qu'en contexte sécurisé (HTTPS ou localhost).
// Fallback v4-like via Math.random pour servir en http://nom-tailscale sur mobile.
function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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

function nowConfig(place, timeMs = null) {
  // timeMs null = temps réel courant ; sinon date custom (slider temporel).
  const dateObj = timeMs != null ? new Date(timeMs) : new Date();
  const ts      = timeMs != null ? timeMs           : Date.now();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: place.tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(dateObj);
  const g = {};
  for (const p of parts) if (p.type !== 'literal') g[p.type] = p.value;
  const isCustom = timeMs != null;
  return {
    jd: ts / 86400000 + 2440587.5,
    latitude: place.latitude, longitude: place.longitude,
    title: isCustom ? 'Moment choisi' : 'Maintenant',
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

// Scales de glyphes planétaires alimentés par l'atelier de création (modale
// plein écran, voir wireGlyphWorkshop). Chargé depuis localStorage au boot,
// consommé par chaque <text class="planet-symbol"> via --planet-scale inline.
// Voir fiche memory/project_feature_atelier_glyphes.md.
const PLANET_SCALES = {};
const PLANET_SCALES_KEY = 'astrolab.planet-scales';
function loadPlanetScales() {
  try {
    const raw = localStorage.getItem(PLANET_SCALES_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') Object.assign(PLANET_SCALES, parsed);
  } catch (e) {}
}
function savePlanetScales() {
  try { localStorage.setItem(PLANET_SCALES_KEY, JSON.stringify(PLANET_SCALES)); }
  catch (e) {}
}

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
const R_SCRAP_ITEM   = 200;   // items scrapbook dans l'espace vide central
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
      container.appendChild(svg('text', {
        x: pt.x, y: pt.y, class: 'planet-symbol',
        'data-planet': p.key,
        style: `--planet-scale: ${PLANET_SCALES[p.key] || 1}`
      }, p.glyph));
      const degInSign = Math.floor(p.lon % 30);
      const dp = project(p.lon, ascLon, rDeg);
      container.appendChild(svg('text', { x: dp.x, y: dp.y, class: 'planet-degree' }, degInSign + '°' + (p.retro ? ' ℞' : '')));
      lastLon = p.lon;
    }
  }

  // Scrapbook (v1) : cadres textuels visuels positionnés librement dans
  // le SVG via <foreignObject>. Créés au double-tap, éditables inline
  // (contenteditable), déplaçables via poignée, redimensionnables via CSS
  // natif `resize: both`. Filtrés par le temps courant du chart : un item
  // n'apparaît que si createdAt <= chartTime ET (retiredAt null OU
  // chartTime < retiredAt). Ainsi remonter le slider fait réapparaître
  // les items retirés temporellement.
  if (layers.scrapbook && state.scrapbook.length) {
    const t = getChartTime();
    for (const it of state.scrapbook) {
      if (!isItemVisibleAt(it, t)) continue;
      drawScrapItem(container, it);
    }
  }
}

// Temps courant du chart pour le filtre scrapbook. null en mode natal =
// pas de filtre (les items sont montrés indépendamment de la date natale
// de Perig, qui est totalement décorrélée du présent).
function getChartTime() {
  if (state.mode === 'natal') return null;
  return state.chartTime != null ? state.chartTime : Date.now();
}
function isItemVisibleAt(item, t) {
  if (t == null) return true;
  if ((item.createdAt || 0) > t) return false;
  if (item.retiredAt != null && t >= item.retiredAt) return false;
  return true;
}

// Dimensions "canoniques" servant uniquement de référence pour calculer le
// facteur `--scrap-scale` (CSS custom property) qui pilote la taille du
// contenu intérieur. width/height eux restent libres — on peut étirer le
// cadre dans n'importe quel ratio, comme dans toute app graphique.
const SCRAP_BASE_W = 160;
const SCRAP_BASE_H = 70;
const SCRAP_BASE_AREA = SCRAP_BASE_W * SCRAP_BASE_H;

// Facteur appliqué au contenu intérieur (texte, boutons, padding). Racine
// carrée du ratio de surface : étirer un cadre augmente modérément le texte,
// plutôt que linéairement avec une seule dimension.
function scrapContentScale(w, h) {
  return Math.max(0.4, Math.min(5, Math.sqrt((w * h) / SCRAP_BASE_AREA)));
}

// ---------- Scrapbook : rendu d'un item ----------
function drawScrapItem(container, it) {
  // L'item est ancré à sa longitude écliptique (it.lon) et à son rayon
  // (it.radius), pas à (x, y) absolus. Au rendu on dérive (x, y) depuis
  // (lon, radius, ascLon courant) → l'item suit son coin de zodiaque quand
  // les signes tournent (changement de chartTime). (x, y) ne sont qu'un
  // cache de rendu, recalculés à chaque frame.
  if (it.lon != null && it.radius != null && state.currentAscLon != null) {
    const p = project(it.lon, state.currentAscLon, it.radius);
    it.x = p.x - it.width / 2;
    it.y = p.y - it.height / 2;
  }
  const fo = svg('foreignObject', {
    x: it.x, y: it.y, width: it.width, height: it.height,
    class: 'scrap-fo', 'data-id': it.id,
  });
  const frame = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  frame.className = 'scrap-frame';
  frame.style.setProperty('--scrap-scale', scrapContentScale(it.width, it.height));
  frame.innerHTML = `
    <span class="scrap-grip" title="Déplacer" aria-label="Déplacer">⋮⋮</span>
    <button type="button" class="scrap-img"   title="Insérer une image" aria-label="Insérer une image">🖼</button>
    <button type="button" class="scrap-close" title="Supprimer"         aria-label="Supprimer">×</button>
    <input type="file" class="scrap-img-input" accept="image/*" hidden>
    <div class="scrap-text" contenteditable="true" spellcheck="true"></div>
    <span class="scrap-resize" title="Redimensionner" aria-label="Redimensionner">⇲</span>
  `;
  // innerHTML pour préserver les <br> insérés par contenteditable et
  // supporter les images en dataURL. Le contenu est user-généré, stocké
  // localement, jamais rendu depuis une source externe → pas de risque XSS.
  frame.querySelector('.scrap-text').innerHTML = it.html || it.text || '';
  fo.appendChild(frame);
  container.appendChild(fo);
  wireScrapItem(fo, frame, it);
}

// Interactions : édition, drag, resize, suppression.
function wireScrapItem(fo, frame, it) {
  const textEl   = frame.querySelector('.scrap-text');
  const gripEl   = frame.querySelector('.scrap-grip');
  const closeBtn = frame.querySelector('.scrap-close');
  const imgBtn   = frame.querySelector('.scrap-img');
  const imgInput = frame.querySelector('.scrap-img-input');

  // Édition : sauvegarde en innerHTML (préserve sauts de ligne + images).
  // Vide (texte ET images) = suppression auto, SAUF si le file picker vient
  // d'être ouvert (il vole le focus et déclencherait un faux blur-suppressif
  // sur un item encore vide, avant que l'image soit insérée).
  let insertingImageUntil = 0;
  textEl.addEventListener('blur', () => {
    const html = textEl.innerHTML;
    const stripped = textEl.textContent.trim();
    const hasImg = !!textEl.querySelector('img');
    if (!stripped && !hasImg) {
      if (Date.now() < insertingImageUntil) return;
      removeScrapItem(it.id); return;
    }
    updateScrapItem(it.id, { html, text: stripped, updatedAt: Date.now() }, true);
  });

  // Paste d'image depuis le presse-papier (Ctrl/Cmd+V ou coller mobile).
  textEl.addEventListener('paste', ev => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        ev.preventDefault();
        const file = it.getAsFile();
        insertImageFile(textEl, file);
        return;
      }
    }
    // Sinon on laisse le paste par défaut (texte brut).
  });

  // Bouton image → ouvre le file picker. Deux précautions pour éviter que
  // l'item vide s'auto-détruise à cause du blur sur le contenteditable :
  //  1. preventDefault() sur pointerdown : le browser émet un blur AVANT que
  //     notre handler click n'arme le flag, parce que la cible du pointerdown
  //     capture le focus. preventDefault() empêche ce vol de focus.
  //  2. flag temporisé : le file picker natif vole quand même le focus à
  //     l'ouverture — pendant cette grâce de ~1 min, pas de suppression auto.
  imgBtn.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    insertingImageUntil = Date.now() + 60000;
  });
  imgBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    insertingImageUntil = Date.now() + 60000;
    imgInput.click();
  });
  imgInput.addEventListener('change', ev => {
    const file = ev.target.files && ev.target.files[0];
    if (file) insertImageFile(textEl, file);
    ev.target.value = '';  // reset pour permettre de re-uploader la même image
    insertingImageUntil = 0;
  });
  imgInput.addEventListener('cancel', () => { insertingImageUntil = 0; });

  // Suppression : clic court = retrait TEMPOREL (item invisible à partir du
  // chartTime courant, réversible en remontant le slider). Long-press ≥ 700ms
  // = suppression DÉFINITIVE (irréversible, avec confirm renforcé).
  let lpTimer = null;
  let lpFired = false;
  const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  closeBtn.addEventListener('pointerdown', ev => {
    ev.stopPropagation();
    lpFired = false;
    lpTimer = setTimeout(() => {
      lpTimer = null;
      lpFired = true;
      if (confirm('EFFACER DÉFINITIVEMENT ?\n\nCet item disparaîtra aussi du passé, impossible à récupérer via le slider temporel.')) {
        purgeScrapItem(it.id);
      }
    }, 700);
  });
  closeBtn.addEventListener('pointerup', ev => {
    ev.stopPropagation();
    if (lpFired) { lpFired = false; return; }
    clearLp();
    // Clic court = retrait temporel
    retireScrapItem(it.id);
  });
  closeBtn.addEventListener('pointerleave',  clearLp);
  closeBtn.addEventListener('pointercancel', clearLp);
  // Empêcher le 'click' bubbler (déjà géré par pointer)
  closeBtn.addEventListener('click', ev => ev.stopPropagation());

  // Drag depuis le grip : met à jour x,y du foreignObject.
  gripEl.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    gripEl.setPointerCapture(ev.pointerId);
    const svgEl = fo.ownerSVGElement;
    const start = screenToSvg(svgEl, ev.clientX, ev.clientY);
    const originX = it.x, originY = it.y;
    const onMove = e => {
      const cur = screenToSvg(svgEl, e.clientX, e.clientY);
      it.x = originX + (cur.x - start.x);
      it.y = originY + (cur.y - start.y);
      fo.setAttribute('x', it.x);
      fo.setAttribute('y', it.y);
    };
    const onUp = () => {
      gripEl.removeEventListener('pointermove', onMove);
      gripEl.removeEventListener('pointerup', onUp);
      gripEl.removeEventListener('pointercancel', onUp);
      // Recalcule lon et radius à partir du nouveau centre et de l'ascLon
      // courant. Déplacer un item dans la roue déplace sa position zodiacale
      // (donc son segment sur la frise) et son rayon (donc son éloignement
      // du centre, préservé à travers les futurs changements d'ascendant).
      const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
      const cx = it.x + it.width / 2;
      const cy = it.y + it.height / 2;
      it.lon    = xyToLon(cx, cy, ascLon);
      it.radius = Math.hypot(cx, cy);
      updateScrapItem(it.id, { x: it.x, y: it.y, lon: it.lon, radius: it.radius, updatedAt: Date.now() }, true);
    };
    gripEl.addEventListener('pointermove', onMove);
    gripEl.addEventListener('pointerup',   onUp);
    gripEl.addEventListener('pointercancel', onUp);
  });

  // Resize : poignée coin bas-droit → modifie width et height **indépendamment**
  // (ratio libre comme toute app graphique classique). Le contenu intérieur
  // (texte, images, boutons, padding) scale automatiquement via la variable
  // CSS `--scrap-scale` dérivée de la surface du cadre — étirer agrandit
  // modérément le texte, ne pas étirer garde la taille actuelle. Bornes :
  // min 60×40 (lisibilité préservée), max 500 (viewBox).
  const resizeEl = frame.querySelector('.scrap-resize');
  resizeEl.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    resizeEl.setPointerCapture(ev.pointerId);
    const svgEl = fo.ownerSVGElement;
    const start = screenToSvg(svgEl, ev.clientX, ev.clientY);
    const originW = it.width, originH = it.height;
    const onMove = e => {
      const cur = screenToSvg(svgEl, e.clientX, e.clientY);
      const w = Math.max(60, Math.min(500, originW + (cur.x - start.x)));
      const h = Math.max(40, Math.min(500, originH + (cur.y - start.y)));
      it.width = w; it.height = h;
      fo.setAttribute('width',  w);
      fo.setAttribute('height', h);
      frame.style.setProperty('--scrap-scale', scrapContentScale(w, h));
    };
    const onUp = () => {
      resizeEl.removeEventListener('pointermove', onMove);
      resizeEl.removeEventListener('pointerup', onUp);
      resizeEl.removeEventListener('pointercancel', onUp);
      // Resize garde (x, y) top-left fixe mais déplace le centre → recalcule
      // lon et radius depuis le nouveau centre pour que l'ancrage zodiacal
      // suive la nouvelle géométrie et reste stable aux prochains renders.
      const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
      const cx = it.x + it.width / 2;
      const cy = it.y + it.height / 2;
      it.lon    = xyToLon(cx, cy, ascLon);
      it.radius = Math.hypot(cx, cy);
      updateScrapItem(it.id, {
        width: it.width, height: it.height,
        lon: it.lon, radius: it.radius,
        updatedAt: Date.now(),
      }, true);
    };
    resizeEl.addEventListener('pointermove', onMove);
    resizeEl.addEventListener('pointerup',   onUp);
    resizeEl.addEventListener('pointercancel', onUp);
  });
}

function screenToSvg(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

// Lit un fichier image, redimensionne si trop grand, insère comme <img>
// avec src=dataURL au caret courant dans le contenteditable.
function insertImageFile(textEl, file) {
  const reader = new FileReader();
  reader.onload = () => {
    // Downscale : les images très grandes explosent le quota localStorage
    // (~5-10 MB total). Cap à 800 px de large, qualité JPEG raisonnable.
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const insert = document.createElement('img');
      insert.src = dataUrl;
      insert.alt = '';
      insert.style.maxWidth = '100%';
      textEl.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && textEl.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(insert);
        range.collapse(false);
      } else {
        textEl.appendChild(insert);
      }
      textEl.dispatchEvent(new Event('blur'));  // sauvegarde immédiate
      textEl.focus();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
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

// ---------- Frise du temps horizontale ----------
// Vue soustractive complémentaire à la roue. Fenêtre = toute la vie du natif
// (natal → maintenant). Axe X = temps. Axe Y = longitude écliptique (0°
// Bélier en haut, Poissons en bas). Les 5 planètes lentes y tracent leurs
// courbes avec zigzags de rétrogradation. Curseur temporel partagé avec la
// roue via state.chartTime — couplage bidirectionnel gratuit. Items
// scrapbook posés à la longitude écliptique correspondant à leur position
// dans la roue, horodatés à createdAt.

const TL_VB_W = 800;
const TL_VB_H = 260;
const TL_MARGIN_L = 42;
const TL_MARGIN_R = 14;
const TL_MARGIN_T = 10;
const TL_MARGIN_B = 24;
const TL_PLOT_W = TL_VB_W - TL_MARGIN_L - TL_MARGIN_R;
const TL_PLOT_H = TL_VB_H - TL_MARGIN_T - TL_MARGIN_B;
const TL_SIGN_H = TL_PLOT_H / 12;

const SLOW_PLANETS = [
  { key: 'jupiter', idx: 5, glyph: '♃' + VS15 },
  { key: 'saturn',  idx: 6, glyph: '♄' + VS15 },
  { key: 'uranus',  idx: 7, glyph: '♅' + VS15 },
  { key: 'neptune', idx: 8, glyph: '♆' + VS15 },
  { key: 'pluto',   idx: 9, glyph: '♇' + VS15 },
];

function msToJd(ms) { return ms / 86400000 + 2440587.5; }
function jdToMs(jd) { return (jd - 2440587.5) * 86400000; }

// Vie complète du natif (naissance → maintenant). Base invariante utilisée
// par le cache de courbes et comme bornes de clamp pour le zoom.
function fullTimelineRange() {
  const startMs = Date.UTC(
    NATAL_PERIG.yearUT, NATAL_PERIG.monthUT - 1, NATAL_PERIG.dayUT,
    Math.floor(NATAL_PERIG.hourUT),
    Math.round((NATAL_PERIG.hourUT % 1) * 60),
  );
  const endMs = Date.now();
  return { startMs, endMs, startJd: msToJd(startMs), endJd: msToJd(endMs) };
}

const TL_ZOOM_MIN = 1.0;
const TL_ZOOM_MAX = 500;

// Fenêtre VISIBLE sur la frise, dérivée du zoom et de chartTime (ou
// maintenant si pas de curseur posé). zoom=1 → vie complète. zoom>1 →
// sous-fenêtre centrée sur chartTime, clampée aux bornes.
function timelineRange() {
  const full = fullTimelineRange();
  const zoom = Math.max(TL_ZOOM_MIN, Math.min(TL_ZOOM_MAX, state.timeline?.zoom || 1));
  if (zoom <= 1) return full;

  const fullSpan = full.endMs - full.startMs;
  const visibleSpan = fullSpan / zoom;
  // Centre indépendant via state.timeline.tlCenter (posé par pan). Sinon
  // fallback sur chartTime, puis sur maintenant. tlCenter dissocie la vue
  // frise du curseur de la roue : on peut pan sans déplacer le moment observé.
  const center = state.timeline?.tlCenter != null
    ? state.timeline.tlCenter
    : (state.chartTime != null ? state.chartTime : full.endMs);

  let startMs = center - visibleSpan / 2;
  let endMs   = center + visibleSpan / 2;

  // Clamp : si on dépasse à gauche, pousser à droite (et inversement),
  // pour que la fenêtre visible reste de taille constante.
  if (startMs < full.startMs) { endMs += (full.startMs - startMs); startMs = full.startMs; }
  if (endMs   > full.endMs)   { startMs -= (endMs - full.endMs);   endMs   = full.endMs;   }
  startMs = Math.max(startMs, full.startMs);
  endMs   = Math.min(endMs,   full.endMs);

  return { startMs, endMs, startJd: msToJd(startMs), endJd: msToJd(endMs) };
}

// Pas de 14 jours : capture les zigzags de rétrogradation des lentes
// (Jupiter ~1.15°/pas, Pluton ~0.02-0.08°/pas) sans surcharger (~1400 pts
// par planète pour 54 ans de fenêtre).
const TL_STEP_DAYS = 14;

let _tlCache = null;
function sampleSlowCurves() {
  // Toujours échantillonner sur la vie COMPLÈTE (indépendant du zoom), pour
  // que le cache reste stable et que les courbes dépassent la fenêtre
  // visible sans se recouper quand on zoome.
  const { startJd, endJd } = fullTimelineRange();
  const dayKey = Math.floor(endJd);
  if (_tlCache && _tlCache.startJd === startJd && _tlCache.dayKey === dayKey) {
    return _tlCache.curves;
  }
  const curves = SLOW_PLANETS.map(p => ({ ...p, points: [] }));
  for (let jd = startJd; jd <= endJd; jd += TL_STEP_DAYS) {
    for (const c of curves) {
      try {
        const r = swe.calc(jd, c.idx);
        c.points.push({ jd, lon: r.longitude, retro: r.longitudeSpeed < 0 });
      } catch (e) {}
    }
  }
  // Point final exact sur endJd pour que la courbe finisse à "maintenant"
  // plutôt qu'au dernier multiple de 14 jours.
  for (const c of curves) {
    try {
      const r = swe.calc(endJd, c.idx);
      c.points.push({ jd: endJd, lon: r.longitude, retro: r.longitudeSpeed < 0 });
    } catch (e) {}
  }
  _tlCache = { startJd, dayKey, curves };
  return curves;
}

function tlX(ms, range) {
  const { startMs, endMs } = range;
  return TL_MARGIN_L + ((ms - startMs) / (endMs - startMs)) * TL_PLOT_W;
}
function tlY(lon) {
  return TL_MARGIN_T + (normDeg(lon) / 360) * TL_PLOT_H;
}

// Inverse de project(lon, ascLon, r) : étant donné (x, y) coords SVG dans
// la roue (centre en 0,0) et l'ascLon courant, retrouve la longitude
// écliptique du point. Indépendant du rayon.
function xyToLon(x, y, ascLon) {
  const theta = Math.atan2(-y, x);                 // radians
  const rel = (theta / DEG) - 180;                 // degrés depuis asc
  return normDeg(rel + ascLon);
}

function drawTimeline() {
  const svgEl = document.getElementById('timeline');
  if (!svgEl) return;
  svgEl.innerHTML = '';
  const range = timelineRange();

  // Bandes signes alternées + glyphes à gauche + séparateurs horizontaux
  for (let i = 0; i < 12; i++) {
    const y = TL_MARGIN_T + i * TL_SIGN_H;
    if (i % 2 === 0) {
      svgEl.appendChild(svg('rect', {
        x: TL_MARGIN_L, y, width: TL_PLOT_W, height: TL_SIGN_H,
        class: 'tl-sign-band',
      }));
    }
    svgEl.appendChild(svg('text', {
      x: TL_MARGIN_L - 10, y: y + TL_SIGN_H / 2,
      class: 'tl-sign-glyph',
    }, SIGN_GLYPHS[i]));
    svgEl.appendChild(svg('line', {
      x1: TL_MARGIN_L, y1: y, x2: TL_MARGIN_L + TL_PLOT_W, y2: y,
      class: 'tl-sign-sep',
    }));
  }
  svgEl.appendChild(svg('line', {
    x1: TL_MARGIN_L, y1: TL_MARGIN_T + TL_PLOT_H,
    x2: TL_MARGIN_L + TL_PLOT_W, y2: TL_MARGIN_T + TL_PLOT_H,
    class: 'tl-sign-sep',
  }));

  // Graduation années : pas adaptatif (1 an / 5 ans / 10 ans)
  const startYear = new Date(range.startMs).getUTCFullYear();
  const endYear   = new Date(range.endMs).getUTCFullYear();
  const yearSpan = endYear - startYear;
  const labelStep = yearSpan <= 20 ? 1 : (yearSpan <= 60 ? 5 : 10);
  for (let y = startYear; y <= endYear; y++) {
    const ms = Date.UTC(y, 0, 1);
    if (ms < range.startMs || ms > range.endMs) continue;
    const x = tlX(ms, range);
    const isLabeled = (y % labelStep === 0);
    svgEl.appendChild(svg('line', {
      x1: x, y1: TL_MARGIN_T, x2: x, y2: TL_MARGIN_T + TL_PLOT_H,
      class: isLabeled ? 'tl-year-tick-strong' : 'tl-year-tick',
    }));
    if (isLabeled) {
      svgEl.appendChild(svg('text', {
        x, y: TL_MARGIN_T + TL_PLOT_H + 14, class: 'tl-year-label',
      }, String(y)));
    }
  }

  // Courbes des planètes lentes. Path coupé à chaque saut > 180°
  // (traversée 0°/360°) pour éviter les cordes qui traversent le plot.
  const curves = sampleSlowCurves();
  for (const c of curves) {
    if (c.points.length < 2) continue;
    let d = '';
    let prevLon = null;
    for (const pt of c.points) {
      const x = tlX(jdToMs(pt.jd), range);
      const y = tlY(pt.lon);
      if (prevLon == null || Math.abs(pt.lon - prevLon) > 180) {
        d += `M${x.toFixed(1)},${y.toFixed(1)} `;
      } else {
        d += `L${x.toFixed(1)},${y.toFixed(1)} `;
      }
      prevLon = pt.lon;
    }
    svgEl.appendChild(svg('path', { d, class: `tl-curve tl-curve-${c.key}` }));
    const last = c.points[c.points.length - 1];
    svgEl.appendChild(svg('text', {
      x: tlX(jdToMs(last.jd), range) + 2, y: tlY(last.lon),
      class: `tl-curve-glyph tl-curve-${c.key}`,
    }, c.glyph));
  }

  // Items scrapbook : segments horizontaux de createdAt à retiredAt (ou
  // à endMs si toujours vivant). Un item n'est pas un instant mais une
  // durée d'existence — tant qu'il n'a pas été retiré il "occupe" la vie
  // du natif. Hauteur dérivée de la taille width/height de l'item dans la
  // roue (approximation : width → arc écliptique au rayon moyen → degrés
  // de longitude span). En attendant le zoom qui transformera chaque rect
  // en <foreignObject> miniature avec le contenu réel manipulable.
  if (state.layers.scrapbook) {
    for (const it of state.scrapbook) {
      if (it.lon == null || it.createdAt == null) continue;
      if (it.createdAt > range.endMs) continue;
      // Pas de filtre isItemVisibleAt ici : la frise montre la vie entière
      // de chaque item. Le curseur chartTime n'est qu'un œilleton
      // d'observation pour la roue, il ne masque pas les segments de la
      // frise (sinon on perd l'item quand on remonte dans le passé).
      const startMs = Math.max(it.createdAt, range.startMs);
      // Fin du segment = durée d'existence réelle : retiredAt si l'item a
      // été retiré, sinon maintenant (= bord droit de la frise). Le
      // curseur chartTime ne tronque PAS le segment — il indique seulement
      // d'où on observe, pas où l'item cesse d'exister.
      let endSegMs = (it.retiredAt != null && it.retiredAt <= range.endMs)
        ? it.retiredAt
        : range.endMs;
      if (endSegMs <= startMs) endSegMs = startMs + 1;
      const x1 = tlX(startMs, range);
      const x2 = tlX(endSegMs, range);
      // Hauteur ≈ (item.width / radius) rad → deg, projeté sur Y. Rayon
      // = distance au centre de la roue. Simplification : rayon moyen.
      const cx = it.x + it.width / 2;
      const cy = it.y + it.height / 2;
      const radius = Math.max(50, Math.hypot(cx, cy));
      const spanDeg = (it.width / radius) * (180 / Math.PI);
      // Clamp pour rester lisible même pour des items ponctuels.
      const h = Math.max(2.5, Math.min(TL_SIGN_H, (spanDeg / 360) * TL_PLOT_H));
      const w = Math.max(2, x2 - x1);
      const y = tlY(it.lon) - h / 2;
      svgEl.appendChild(svg('rect', {
        x: x1, y, width: w, height: h, rx: 1.5,
        class: 'tl-scrap-seg', 'data-id': it.id,
      }));
    }
  }

  // Curseur temporel vertical, partagé avec state.chartTime
  const cursorMs = state.chartTime != null ? state.chartTime : Date.now();
  if (cursorMs >= range.startMs && cursorMs <= range.endMs) {
    const x = tlX(cursorMs, range);
    svgEl.appendChild(svg('line', {
      x1: x, y1: TL_MARGIN_T, x2: x, y2: TL_MARGIN_T + TL_PLOT_H,
      class: 'tl-cursor',
    }));
  }
}

// Interactions frise :
//  - 1 doigt / clic gauche drag → pose chartTime (curseur de la roue)
//  - molette → zoom temporel autour de chartTime
//  - 2 doigts (mobile) → zoom (écart) + pan (milieu) simultanés, ancrés sur
//    la valeur temporelle qui était sous le milieu au début du geste
//  - clic milieu drag (desktop) → pan de la vue sans toucher chartTime
// Pan = déplacement de state.timeline.tlCenter, indépendant de chartTime.
function wireTimelineInteraction() {
  const svgEl = document.getElementById('timeline');
  if (!svgEl) return;
  const svgXFromClient = (clientX) => {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = 0;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse()).x;
  };
  const pickTime = (clientX) => {
    const range = timelineRange();
    const t01 = (svgXFromClient(clientX) - TL_MARGIN_L) / TL_PLOT_W;
    const clamped = Math.max(0, Math.min(1, t01));
    return range.startMs + clamped * (range.endMs - range.startMs);
  };
  let dragging = false;
  let isPinching = false;
  // Deux schedulers séparés, tous deux coalesced via RAF :
  //  - scheduleTimelineRender : ne redessine QUE la frise (pan/zoom frise).
  //    Pas de swe.houses, pas de computeBodies/Asteroids, pas de drawChart.
  //  - scheduleFullRender : redessine tout (quand on bouge chartTime et donc
  //    la roue). Reste coalesced à 1 frame max.
  let tlRaf = null;
  let fullRaf = null;
  const scheduleTimelineRender = () => {
    if (tlRaf != null) return;
    tlRaf = requestAnimationFrame(() => {
      tlRaf = null;
      try { drawTimeline(); } catch (e) { showError('timeline error: ' + e.message); }
    });
  };
  const scheduleFullRender = () => {
    if (fullRaf != null) return;
    fullRaf = requestAnimationFrame(() => {
      fullRaf = null;
      render().catch(e => showError('render error: ' + e.message));
    });
  };
  const ensureTl = () => { if (!state.timeline) state.timeline = { zoom: 1 }; };

  // Pan middle-click (desktop) : on fixe tlCenter au centre courant au début
  // du drag, puis on soustrait le déplacement souris converti en ms.
  let mousePanStartClientX = null;
  let mousePanStartCenter  = null;

  svgEl.addEventListener('pointerdown', ev => {
    if (ev.button === 1) {
      // Clic milieu = pan
      ev.preventDefault();
      svgEl.setPointerCapture(ev.pointerId);
      const range = timelineRange();
      mousePanStartClientX = ev.clientX;
      mousePanStartCenter  = state.timeline?.tlCenter != null
        ? state.timeline.tlCenter
        : (range.startMs + range.endMs) / 2;
      return;
    }
    if (isPinching) return;
    dragging = true;
    svgEl.setPointerCapture(ev.pointerId);
    const t = pickTime(ev.clientX);
    state.chartTime = (t >= Date.now() - 60000) ? null : t;
    scheduleFullRender();
  });
  svgEl.addEventListener('pointermove', ev => {
    if (mousePanStartClientX != null) {
      const range = timelineRange();
      const dxSvg = svgXFromClient(ev.clientX) - svgXFromClient(mousePanStartClientX);
      const msPerSvg = (range.endMs - range.startMs) / TL_PLOT_W;
      ensureTl();
      state.timeline.tlCenter = mousePanStartCenter - dxSvg * msPerSvg;
      scheduleTimelineRender();
      return;
    }
    if (!dragging || isPinching) return;
    const t = pickTime(ev.clientX);
    state.chartTime = (t >= Date.now() - 60000) ? null : t;
    scheduleFullRender();
  });
  const stop = () => {
    dragging = false;
    mousePanStartClientX = null;
    mousePanStartCenter  = null;
  };
  svgEl.addEventListener('pointerup',     stop);
  svgEl.addEventListener('pointercancel', stop);
  svgEl.addEventListener('pointerleave',  stop);
  // auxclick bouton milieu : empêche l'icône "scroll auto" sur certains browsers
  svgEl.addEventListener('auxclick', ev => { if (ev.button === 1) ev.preventDefault(); });

  // Molette = zoom. Facteur exponentiel pour un ressenti naturel.
  svgEl.addEventListener('wheel', ev => {
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.0015);
    const prev = state.timeline?.zoom || 1;
    const next = Math.max(TL_ZOOM_MIN, Math.min(TL_ZOOM_MAX, prev * factor));
    if (next === prev) return;
    ensureTl();
    state.timeline.zoom = next;
    scheduleTimelineRender();
  }, { passive: false });

  // 2 doigts : zoom (écart entre doigts) + pan (milieu entre doigts),
  // simultanés. On ancre la valeur temporelle qui était sous le milieu au
  // début du geste : elle reste sous le milieu pendant tout le geste, que ce
  // soit par pan ou par pinch.
  let pinchStartDist   = null;
  let pinchStartZoom   = null;
  let pinchAnchorMs    = null;  // valeur temporelle sous le milieu, au start
  svgEl.addEventListener('touchstart', ev => {
    if (ev.touches.length >= 2) {
      isPinching = true;
      dragging = false;
      const t0 = ev.touches[0], t1 = ev.touches[1];
      pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      pinchStartZoom = state.timeline?.zoom || 1;
      pinchAnchorMs  = pickTime((t0.clientX + t1.clientX) / 2);
      ev.preventDefault();
    }
  }, { passive: false });
  svgEl.addEventListener('touchmove', ev => {
    if (ev.touches.length >= 2 && pinchStartDist != null) {
      const t0 = ev.touches[0], t1 = ev.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const ratio = dist / pinchStartDist;
      const nextZoom = Math.max(TL_ZOOM_MIN, Math.min(TL_ZOOM_MAX, pinchStartZoom * ratio));
      ensureTl();
      state.timeline.zoom = nextZoom;

      // Pan ancré : on veut que pinchAnchorMs tombe sous le nouveau milieu.
      // Calcule tlCenter tel que, dans la fenêtre résultante (de span fixe
      // par le zoom), svgMidX corresponde exactement à pinchAnchorMs.
      const midX = (t0.clientX + t1.clientX) / 2;
      const svgMidX = svgXFromClient(midX);
      const t01 = (svgMidX - TL_MARGIN_L) / TL_PLOT_W;
      const full = fullTimelineRange();
      const visibleSpan = (full.endMs - full.startMs) / nextZoom;
      // pinchAnchorMs = newStartMs + t01 * visibleSpan
      const newStartMs = pinchAnchorMs - t01 * visibleSpan;
      state.timeline.tlCenter = newStartMs + visibleSpan / 2;

      scheduleTimelineRender();
      ev.preventDefault();
    }
  }, { passive: false });
  const endPinch = ev => {
    if (!ev.touches || ev.touches.length < 2) {
      pinchStartDist = null;
      pinchStartZoom = null;
      pinchAnchorMs  = null;
      // Léger délai pour que le pointerup final ne redéclenche pas un drag
      setTimeout(() => { isPinching = false; }, 100);
    }
  };
  svgEl.addEventListener('touchend',    endPinch);
  svgEl.addEventListener('touchcancel', endPinch);
}

// Migration des items existants : calcule it.lon à partir de (x+w/2, y+h/2)
// et de l'ascendant qui prévalait à createdAt. Appelée après swe est prêt.
// Pour les items déjà munis d'un lon, no-op.
function migrateScrapbookLon() {
  let dirty = false;
  for (const it of state.scrapbook) {
    if (it.lon != null) continue;
    if (it.createdAt == null) continue;
    try {
      const jd = msToJd(it.createdAt);
      const H = swe.houses(jd, MONTREAL.latitude, MONTREAL.longitude, sweMod.HouseSystem.Placidus);
      const cx = it.x + (it.width || SCRAP_BASE_W) / 2;
      const cy = it.y + (it.height || SCRAP_BASE_H) / 2;
      it.lon = xyToLon(cx, cy, H.ascendant);
      dirty = true;
    } catch (e) { /* skip */ }
  }
  if (dirty) saveScrapbook();
}

// ---------- État + persistance ----------
const STORAGE_KEY    = 'astrolab.asteroids';
const LAYERS_KEY     = 'astrolab.layers';
const HARMONICS_KEY  = 'astrolab.harmonics';
const ASPECT_STYLE_KEY = 'astrolab.aspectStyle';
const SCRAPBOOK_KEY  = 'astrolab.scrapbook';
const DEFAULT_LAYERS = {
  signs: true, houses: true, planets: true,
  midpoints: false, asteroids: true, scrapbook: true, timeline: true,
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
  scrapbook: JSON.parse(localStorage.getItem(SCRAPBOOK_KEY) || '[]'),
  chartTime: null,  // null = temps réel ; sinon ms epoch (slider temporel)
  timeline: { zoom: 1.0 },  // zoom frise, 1 = toute la vie, >1 = zoomé
};
function saveAsteroids()   { localStorage.setItem(STORAGE_KEY,       JSON.stringify(state.asteroids)); }
function saveLayers()      { localStorage.setItem(LAYERS_KEY,        JSON.stringify(state.layers));    }
function saveHarmonics()   { localStorage.setItem(HARMONICS_KEY,     JSON.stringify([...state.harmonics].sort((a,b)=>a-b))); }
function saveAspectStyle() { localStorage.setItem(ASPECT_STYLE_KEY,  state.aspectStyle); }
function saveScrapbook()   { localStorage.setItem(SCRAPBOOK_KEY,     JSON.stringify(state.scrapbook)); }

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
  const config = state.mode === 'natal' ? natalConfig() : nowConfig(MONTREAL, state.chartTime);
  document.getElementById('chart-title').textContent = config.title;
  document.getElementById('chart-info').textContent = config.info;

  const H = swe.houses(config.jd, config.latitude, config.longitude, sweMod.HouseSystem.Placidus);
  state.currentAscLon = H.ascendant;
  const bodies = computeBodies(config.jd);
  const asteroids = computeAsteroids(config.jd);
  drawChart(
    { cusps: H.cusps, ascendant: H.ascendant, midheaven: H.midheaven, bodies, asteroids },
    state.layers,
  );
  drawDataTable({ ascendant: H.ascendant, midheaven: H.midheaven }, bodies, asteroids);
  renderAsteroidChips();
  // Frise : masquer le conteneur si la couche est coupée, sinon redessiner.
  const tlContainer = document.getElementById('timeline-container');
  if (tlContainer) tlContainer.hidden = !state.layers.timeline;
  if (state.layers.timeline) drawTimeline();
}

// ---------- Scrapbook : création / modification / suppression ----------
// Un item = un cadre textuel visuel positionné librement (x, y) dans le SVG.
// Créé au double-tap, édité inline, déplacé via la poignée, redimensionné
// via CSS resize natif, supprimé via × (ou blur si vide).
// La migration sémantique (attraction vers barycentre calculé par LLM +
// couches actives) arrivera en phase B/D — pour l'instant placement libre.

function updateScrapItem(id, patch, skipRender = false) {
  const idx = state.scrapbook.findIndex(x => x.id === id);
  if (idx < 0) return;
  state.scrapbook[idx] = { ...state.scrapbook[idx], ...patch };
  saveScrapbook();
  if (!skipRender) render().catch(e => showError('render error: ' + e.message));
}

// Deux modes d'élimination :
// - retire(): l'item cesse d'exister À PARTIR du chartTime courant. Reste
//   visible si on remonte le slider dans le passé. Réversible via slider.
// - purge(): suppression définitive, l'item disparaît du tableau et de tout
//   le passé. Irréversible.
function retireScrapItem(id) {
  const it = state.scrapbook.find(x => x.id === id);
  if (!it) return;
  // + 1 ms pour que l'item soit invisible dès le moment courant (borne stricte)
  it.retiredAt = (state.chartTime != null ? state.chartTime : Date.now()) + 1;
  saveScrapbook();
  render().catch(e => showError('render error: ' + e.message));
}
function purgeScrapItem(id) {
  state.scrapbook = state.scrapbook.filter(x => x.id !== id);
  saveScrapbook();
  render().catch(e => showError('render error: ' + e.message));
}
// Compat interne : les anciens appels blur (item vide) purgent définitivement.
function removeScrapItem(id) { purgeScrapItem(id); }

function createScrapItemAt(x, y) {
  // Dimensions par défaut modestes — la note démarre petite, l'utilisateur
  // étire via la poignée ⇲ (ratio libre, le texte scale avec la surface).
  const width = 120, height = 50;
  // Longitude écliptique dérivée de la position du tap et de l'ascendant
  // courant. Permet de placer l'item sur la frise à la hauteur du signe
  // correspondant à sa position angulaire dans la roue.
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const lon    = xyToLon(x, y, ascLon);
  const radius = Math.hypot(x, y);
  // Horodatage = chartTime affiché (sinon maintenant). Permet de "revenir
  // dans le passé" via la frise ou le slider et déposer un item au moment
  // qu'on regarde, pas au moment du geste physique. Sans ça, les items
  // créés en mode scrubber s'accumulaient tous à "maintenant" et devenaient
  // invisibles tant qu'on restait dans le passé.
  const stamp = state.chartTime != null ? state.chartTime : Date.now();
  const item = {
    id: genId(),
    createdAt: stamp,
    updatedAt: stamp,
    x: x - width / 2,
    y: y - height / 2,
    width, height,
    lon,
    radius,
    text: '',
  };
  state.scrapbook.push(item);
  saveScrapbook();
  render()
    .then(() => {
      // Focus dans l'éditable pour taper immédiatement.
      const fo = document.querySelector(`.scrap-fo[data-id="${item.id}"]`);
      if (fo) {
        const textEl = fo.querySelector('.scrap-text');
        if (textEl) textEl.focus();
      }
    })
    .catch(e => showError('render error: ' + e.message));
}

// Double-tap détection manuelle (dblclick natif est capricieux sur mobile).
// Deux pointerdown sur le SVG à moins de 400 ms l'un de l'autre = créer un
// item à la position (moyennée pour lisser). Ignoré si la cible est un item
// existant ou un contrôle interactif à l'intérieur du chart.
function wireScrapbookGestures() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  let lastTap = 0;
  let lastPt  = null;
  svgEl.addEventListener('pointerdown', ev => {
    // Ignorer si sur un item existant ou un contrôle intérieur au chart.
    if (ev.target.closest('.scrap-fo, foreignObject')) return;
    const now = Date.now();
    const pt  = screenToSvg(svgEl, ev.clientX, ev.clientY);
    if (now - lastTap < 400 && lastPt && Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) < 40) {
      // Double-tap confirmé — moyenner les deux positions pour lisser.
      const avgX = (pt.x + lastPt.x) / 2;
      const avgY = (pt.y + lastPt.y) / 2;
      lastTap = 0;
      lastPt  = null;
      createScrapItemAt(avgX, avgY);
    } else {
      lastTap = now;
      lastPt  = pt;
    }
  });
}

// Migration : trois formats historiques peuvent coexister dans localStorage.
// (a) phase-A pur : {title, body, house} → placement centre.
// (b) scale-only (bref essai v27) : {x, y, scale, text} → calcule w/h depuis scale.
// (c) format courant : {x, y, width, height, html|text}.
function migrateScrapbookItems() {
  let migrated = false;
  const VIEW = 520;  // demi-largeur du viewBox
  state.scrapbook = state.scrapbook.map(it => {
    // (a) format phase-A pur : pas de x/y encore.
    if (it.x === undefined) {
      migrated = true;
      it = {
        id: it.id || genId(),
        createdAt: it.createdAt || Date.now(),
        updatedAt: it.createdAt || Date.now(),
        x: -SCRAP_BASE_W / 2, y: -SCRAP_BASE_H / 2,
        width: SCRAP_BASE_W, height: SCRAP_BASE_H,
        text: [it.title, it.body].filter(Boolean).join('\n'),
      };
    }
    // (b) format scale-only (v27 éphémère) : reconvertit en width/height.
    if (it.scale !== undefined && it.width === undefined) {
      it.width  = SCRAP_BASE_W * it.scale;
      it.height = SCRAP_BASE_H * it.scale;
      delete it.scale;
      migrated = true;
    }
    // (c) clamp dimensions : min 60×40 (lisibilité), max 500 (viewBox).
    const w = Math.max(60, Math.min(500, it.width  || 120));
    const h = Math.max(40, Math.min(500, it.height || 50));
    if (w !== it.width || h !== it.height) { it.width = w; it.height = h; migrated = true; }
    // Clamp position : dans le viewBox visible.
    const x = Math.max(-VIEW, Math.min(VIEW - w, it.x));
    const y = Math.max(-VIEW, Math.min(VIEW - h, it.y));
    if (x !== it.x || y !== it.y) { it.x = x; it.y = y; migrated = true; }
    // Radius (ancrage zodiacal) : dérivé du centre absolu si absent. Les items
    // phase-A (centre à 0,0) tombent sur radius 0 → placés au centre, inoffensif
    // en l'état mais corrigeable au premier drag utilisateur.
    if (it.radius == null) {
      const cx = it.x + it.width / 2;
      const cy = it.y + it.height / 2;
      it.radius = Math.hypot(cx, cy);
      migrated = true;
    }
    return it;
  });
  if (migrated) saveScrapbook();
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
  wireScrapbookGestures();
  wireTimeSlider();
  wireDataExportImport();
  wireTimelineInteraction();
  wireControlsSheet();
  wireGlyphWorkshop();
}

// Atelier de glyphes : modale plein écran qui harmonise la taille visuelle des
// glyphes planétaires (planètes + extended). Cadre de référence circulaire +
// grille baseline-alignée pour juger l'harmonie globale. Live-update dans la
// modale, persistance + re-render de la carte à la fermeture seulement.
// Zone "corps inventés" présente mais désactivée en v1 (upload SVG à câbler).
// Voir memory/project_feature_atelier_glyphes.md.
const WORKSHOP_BODIES = [...PLANETS, ...EXTENDED];
function wireGlyphWorkshop() {
  const openBtn = document.getElementById('glyph-workshop-open');
  const modal   = document.getElementById('glyph-workshop');
  if (!openBtn || !modal) return;
  const closeBtn    = modal.querySelector('.gw-close');
  const cancelBtn   = modal.querySelector('.gw-cancel');
  const saveBtn     = modal.querySelector('.gw-save');
  const glyphText   = modal.querySelector('.gw-glyph');
  const activeName  = modal.querySelector('.gw-active-name');
  const activeValue = modal.querySelector('.gw-active-value');
  const slider      = modal.querySelector('.gw-slider');
  const resetBtn    = modal.querySelector('.gw-reset-one');
  const grid        = modal.querySelector('.gw-grid');

  let activeKey = WORKSHOP_BODIES[0].key;
  const scaleOf = (key) => PLANET_SCALES[key] != null ? PLANET_SCALES[key] : 1;

  const renderGrid = () => {
    grid.innerHTML = '';
    for (const body of WORKSHOP_BODIES) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'gw-cell' + (body.key === activeKey ? ' is-active' : '');
      cell.dataset.key = body.key;
      cell.setAttribute('aria-label', `${body.key} — scale ${scaleOf(body.key).toFixed(2)}`);
      const g = document.createElement('span');
      g.className = 'gw-cell-glyph';
      g.style.setProperty('--planet-scale', scaleOf(body.key));
      g.textContent = body.glyph;
      const label = document.createElement('span');
      label.className = 'gw-cell-label';
      label.textContent = body.key;
      cell.appendChild(g);
      cell.appendChild(label);
      cell.addEventListener('click', () => {
        activeKey = body.key;
        syncActive();
        renderGrid();
      });
      grid.appendChild(cell);
    }
  };

  const syncActive = () => {
    const body = WORKSHOP_BODIES.find(b => b.key === activeKey);
    glyphText.textContent = body.glyph;
    glyphText.style.setProperty('--planet-scale', scaleOf(activeKey));
    activeName.textContent = activeKey;
    activeValue.textContent = scaleOf(activeKey).toFixed(2);
    slider.value = String(scaleOf(activeKey));
  };

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    PLANET_SCALES[activeKey] = val;
    activeValue.textContent = val.toFixed(2);
    glyphText.style.setProperty('--planet-scale', val);
    const cellGlyph = grid.querySelector(`[data-key="${activeKey}"] .gw-cell-glyph`);
    if (cellGlyph) cellGlyph.style.setProperty('--planet-scale', val);
  });

  resetBtn.addEventListener('click', () => {
    PLANET_SCALES[activeKey] = 1;
    syncActive();
    renderGrid();
  });

  // Snapshot explicite au boot de la modale. ✓ enregistrer = persist + re-render
  // de la carte. × / Esc / backdrop = annulation : on restaure l'état d'avant
  // ouverture (clé par clé, pas réassignation sinon on perd la référence
  // partagée avec le reste du module).
  let snapshotOnOpen = {};
  const restoreSnapshot = () => {
    for (const k of Object.keys(PLANET_SCALES)) delete PLANET_SCALES[k];
    Object.assign(PLANET_SCALES, snapshotOnOpen);
  };
  const hide = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gw-modal-open');
  };
  const open = () => {
    snapshotOnOpen = { ...PLANET_SCALES };
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gw-modal-open');
    syncActive();
    renderGrid();
  };
  const save = () => {
    savePlanetScales();
    hide();
    render().catch(e => showError('render error: ' + e.message));
  };
  const cancel = () => {
    restoreSnapshot();
    hide();
  };

  openBtn.addEventListener('click', open);
  saveBtn.addEventListener('click', save);
  closeBtn.addEventListener('click', cancel);
  cancelBtn.addEventListener('click', cancel);
  modal.addEventListener('click', e => { if (e.target === modal) cancel(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) cancel();
  });
}

// Bottom sheet des contrôles : 4 états mobile (collapsed/peek/mid/expanded),
// draggable par la poignée. Peek expose mode + slider pour manipulation en
// voyant le cercle ; mid ajoute couches/aspects ; expanded tout.
// Sur desktop (≥ 900px), le sheet s'étale horizontalement (voir CSS @media),
// la poignée est masquée et les gestes sont désactivés.
const SHEET_STATES = ['collapsed', 'peek', 'mid', 'expanded'];
const DESKTOP_MQ = '(min-width: 900px)';
function isDesktopViewport() {
  return window.matchMedia && window.matchMedia(DESKTOP_MQ).matches;
}
function sheetHeightFor(name) {
  if (name === 'collapsed') return 32;
  if (name === 'peek')      return 110;
  if (name === 'mid')       return 220;
  return Math.round(window.innerHeight * 0.85);
}
function setSheetState(sheet, name) {
  for (const s of SHEET_STATES) sheet.classList.remove('sheet-' + s);
  sheet.classList.add('sheet-' + name);
  sheet.style.height = '';  // retire le height inline posé par le drag
  const handle = sheet.querySelector('.sheet-handle');
  if (handle) handle.setAttribute('aria-expanded', String(name === 'expanded'));
  try { localStorage.setItem('astrolab.sheet.state', name); } catch (e) {}
}
function wireControlsSheet() {
  const sheet = document.getElementById('controls-sheet');
  if (!sheet) return;
  const handle = sheet.querySelector('.sheet-handle');
  if (!handle) return;

  // Restaure dernier état (peek par défaut).
  const saved = (() => { try { return localStorage.getItem('astrolab.sheet.state'); } catch (e) { return null; } })();
  setSheetState(sheet, SHEET_STATES.includes(saved) ? saved : 'peek');

  // Nettoyage à chaque bascule desktop ↔ mobile : height inline résiduel du
  // drag mobile deviendrait absurde en desktop (et vice versa).
  const mql = window.matchMedia(DESKTOP_MQ);
  const onViewportChange = () => { sheet.style.height = ''; };
  if (mql.addEventListener) mql.addEventListener('change', onViewportChange);
  else if (mql.addListener) mql.addListener(onViewportChange);  // Safari <14

  // Drag : au move, met à jour height inline. Au up, snap au state le plus
  // proche. Si drag quasi-nul (< 6 px total), on considère ça comme un tap et
  // on cycle au state suivant. Sur desktop, tous les handlers early-return —
  // la poignée est de toute façon masquée en CSS mais ceinture + bretelles.
  let dragY = null;
  let dragStartHeight = null;
  let dragMax = 0;
  handle.addEventListener('pointerdown', ev => {
    if (isDesktopViewport()) return;
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);
    dragY = ev.clientY;
    dragStartHeight = sheet.getBoundingClientRect().height;
    dragMax = 0;
    sheet.classList.add('sheet-dragging');
  });
  handle.addEventListener('pointermove', ev => {
    if (isDesktopViewport()) return;
    if (dragY == null) return;
    const dy = ev.clientY - dragY;
    dragMax = Math.max(dragMax, Math.abs(dy));
    const minH = sheetHeightFor('collapsed');
    const maxH = sheetHeightFor('expanded');
    const h = Math.max(minH, Math.min(maxH, dragStartHeight - dy));
    sheet.style.height = h + 'px';
  });
  const endDrag = ev => {
    if (isDesktopViewport()) return;
    if (dragY == null) return;
    const currentHeight = parseFloat(sheet.style.height) || dragStartHeight;
    dragY = null;
    dragStartHeight = null;
    sheet.classList.remove('sheet-dragging');
    if (dragMax < 6) {
      const cur = SHEET_STATES.find(s => sheet.classList.contains('sheet-' + s)) || 'peek';
      const next = SHEET_STATES[(SHEET_STATES.indexOf(cur) + 1) % SHEET_STATES.length];
      setSheetState(sheet, next);
      return;
    }
    let best = SHEET_STATES[0];
    let bestDist = Infinity;
    for (const s of SHEET_STATES) {
      const d = Math.abs(sheetHeightFor(s) - currentHeight);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    setSheetState(sheet, best);
  };
  handle.addEventListener('pointerup',     endDrag);
  handle.addEventListener('pointercancel', endDrag);
}

// Export / Import : snapshot complet du localStorage sous le préfixe
// `astrolab.`, format JSON unique avec dataURL inline pour les images.
// Un seul fichier à transporter = la personne repart avec SES données,
// peut les recharger chez elle ou les partager plus tard. Pas d'infra ZIP
// pour l'instant — tant que les images sont capées à 800 px, le JSON reste
// raisonnable (quelques Mo max pour des dizaines d'items).
const DATA_EXPORT_VERSION = 1;

function collectAstrolabStorage() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('astrolab.')) data[k] = localStorage.getItem(k);
  }
  return data;
}

function exportData() {
  const payload = {
    app: 'astrolab',
    version: DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: collectAstrolabStorage(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `astrolab-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch (e) { throw new Error('fichier JSON invalide : ' + e.message); }
  if (!payload || payload.app !== 'astrolab' || !payload.data) {
    throw new Error('format inattendu — ce JSON ne vient pas d\'un export astrolab.');
  }
  // Écrase les clés astrolab.* existantes avec le contenu importé. Les
  // autres clés localStorage (d'autres apps sur le même domaine) restent
  // intactes. L'utilisateur a confirmé avant d'arriver ici.
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('astrolab.')) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(payload.data)) {
    if (k.startsWith('astrolab.') && typeof v === 'string') localStorage.setItem(k, v);
  }
}

function wireDataExportImport() {
  const exportBtn = document.getElementById('data-export');
  const importBtn = document.getElementById('data-import');
  const fileInput = document.getElementById('data-import-file');
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.addEventListener('click', () => {
    try { exportData(); }
    catch (e) { showError('export : ' + e.message); }
  });

  importBtn.addEventListener('click', () => {
    const n = Object.keys(localStorage).filter(k => k.startsWith('astrolab.')).length;
    const warning = n
      ? `Importer un snapshot ÉCRASE les ${n} entrées locales (scrapbook, astéroïdes, couches, préférences). Continuer ?`
      : 'Importer un snapshot JSON astrolab ?';
    if (!confirm(warning)) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', async ev => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';  // reset pour permettre de ré-importer le même fichier
    if (!file) return;
    try {
      await importData(file);
      location.reload();
    } catch (e) {
      showError('import : ' + e.message);
    }
  });
}

// Slider temporel : permet de naviguer entre le plus ancien createdAt du
// scrapbook (à défaut : now - 30j) et maintenant. En changeant, on met à
// jour state.chartTime et on re-rend. Bouton ↻ = retour au présent (chartTime null).
function wireTimeSlider() {
  const slider = document.getElementById('time-slider');
  const label  = document.getElementById('time-label');
  const reset  = document.getElementById('time-reset');
  if (!slider || !label || !reset) return;

  const range = () => {
    const now = Date.now();
    const oldest = state.scrapbook.length
      ? Math.min(...state.scrapbook.map(x => x.createdAt || now))
      : now - 30 * 86400000;
    return { oldest, now };
  };
  const format = (ms) => {
    const d = new Date(ms);
    return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  };
  const updateLabel = () => {
    if (state.chartTime == null) label.textContent = 'maintenant';
    else                          label.textContent = format(state.chartTime);
  };
  const syncSlider = () => {
    const { oldest, now } = range();
    const t = state.chartTime != null ? state.chartTime : now;
    const t01 = (now - oldest) > 0 ? (t - oldest) / (now - oldest) : 1;
    slider.value = String(Math.round(t01 * 1000));
    updateLabel();
  };
  syncSlider();

  let throttle = null;
  slider.addEventListener('input', () => {
    const { oldest, now } = range();
    const t01 = parseInt(slider.value, 10) / 1000;
    const t   = oldest + t01 * (now - oldest);
    state.chartTime = (t >= now - 60000) ? null : t;  // snap au présent près du max
    updateLabel();
    clearTimeout(throttle);
    throttle = setTimeout(() => render().catch(e => showError('render error: ' + e.message)), 150);
  });
  reset.addEventListener('click', () => {
    state.chartTime = null;
    // Reset aussi la vue frise (zoom et pan) : "retour au présent" = retour
    // à la vue initiale complète. Porte de sortie quand on s'est perdu dans
    // le zoom ou le pan.
    if (state.timeline) {
      state.timeline.zoom = 1;
      state.timeline.tlCenter = null;
    }
    syncSlider();
    render().catch(e => showError('render error: ' + e.message));
  });
}

function wireAspectsMenu() {
  const toggle   = document.querySelector('.aspects-toggle');
  const panel    = document.querySelector('.aspects-panel');
  const backdrop = document.querySelector('.aspects-backdrop');
  if (!toggle || !panel || !backdrop) return;

  const setOpen = (open) => {
    panel.hidden = !open;
    backdrop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  // Trois voies de fermeture combinées pour maximum fiabilité mobile :
  //   1. Bouton × explicite dans le panel (UX standard mobile)
  //   2. Backdrop overlay (click + pointerdown en secours)
  //   3. Toggle du bouton aspects lui-même (déjà géré ci-dessus)
  const closeBtn = document.querySelector('.aspects-close');
  if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click',       () => setOpen(false));
  backdrop.addEventListener('pointerdown', () => setOpen(false));

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
  loadPlanetScales();
  migrateScrapbookItems();
  migrateScrapbookLon();
  wireControls();
  await remountSavedAsteroids();
  await render();
}

main().catch(e => showError('main() error: ' + (e.stack || e.message || e)));
