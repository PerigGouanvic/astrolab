// astrolab — strate 2 : Swiss Ephemeris + astéroïdes à la demande
//   - Sun→Pluto + Chiron + Ceres/Pallas/Juno/Vesta
//   - Astéroïdes MPC arbitraires (fetch à la demande via proxy CORS)
//   - Modes maintenant / natal
//   - Couches soustractives : signes, maisons, planètes, mi-points, astéroïdes, aspects
//   - Aspects majeurs (conjonction, opposition, trigone, carré, sextile)
//   - Rétrogrades ℞

// Source Google Drive pour les fiches planètes (modèle salon à venir).
// Si pas connecté, les fiches sont vides (fallback silencieux).
import * as Drive from './drive.js?v=10';

// jsDelivr +esm : bundle self-contained avec process.browser=true.
// esm.sh polyfille process.versions.node truthy → swisseph tente createRequire() → boom.
const SWE_URL = 'https://cdn.jsdelivr.net/npm/@kuntay/swisseph@0.2.2/+esm';

// URL du proxy CORS pour les fichiers .se1 d'astéroïdes.
// Format attendu : préfixe auquel on concatène l'URL upstream complète.
// Défaut : Deno Deploy sous le compte de Perig, whitelist sur ephe.scryr.io.
// Source : proxy/deno-cors-proxy.ts.
const PROXY_URL = localStorage.getItem('astrolab.proxyUrl') || 'https://astrolab-ephe.periggouanvic.deno.net/';
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

// ---------- Natifs (plusieurs thèmes natals, bascule par le header) ----------
// Un natif = une personne/thème avec date/heure/lieu de naissance. Les items
// scrapbook et observations planétaires sont scopés par natif (ils vivent sur
// le ciel d'un natif donné). Les préférences utilisateur (couches, harmoniques,
// atelier glyphes, astéroïdes montés) restent globales — elles traversent
// les natifs. Stockage : `astrolab.natives` = { natives: [...], currentId }.
const PERIG_SEED = {
  id: 'perig-seed',
  name: 'Perig',
  date: '1972-01-22',      // local
  time: '07:25',           // local
  tzOffset: -5,            // heures depuis UTC (EST = -5)
  latitude: MONTREAL.latitude,
  longitude: MONTREAL.longitude,
  placeLabel: 'Montréal',
};
const NATIVES_KEY = 'astrolab.natives';
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin',
                   'juillet','août','septembre','octobre','novembre','décembre'];

function loadNatives() {
  try {
    const raw = localStorage.getItem(NATIVES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.natives) && parsed.natives.length) {
        const currentId = parsed.natives.find(n => n.id === parsed.currentId)
          ? parsed.currentId : parsed.natives[0].id;
        return { natives: parsed.natives, currentId };
      }
    }
  } catch (e) {}
  return { natives: [PERIG_SEED], currentId: PERIG_SEED.id };
}
let nativesState = loadNatives();

const NATIVES_SAVED_AT_KEY = 'astrolab.natives.savedAt';
function saveNatives() {
  const savedAt = Date.now();
  localStorage.setItem(NATIVES_KEY, JSON.stringify({
    natives: nativesState.natives,
    currentId: nativesState.currentId,
  }));
  localStorage.setItem(NATIVES_SAVED_AT_KEY, String(savedAt));
  scheduleNativesSync(savedAt);
}
function currentNative() {
  return nativesState.natives.find(n => n.id === nativesState.currentId)
      || nativesState.natives[0];
}
function nativeToUt(n) {
  // Local date/time → UT. Normalise le débordement de jour quand l'offset
  // fait passer la minute d'horloge au-dessus/au-dessous du minuit UT.
  const [y, mo, d] = n.date.split('-').map(Number);
  const [h, mi]    = n.time.split(':').map(Number);
  const localH     = h + mi / 60;
  let utH          = localH - n.tzOffset;
  let dayShift     = 0;
  while (utH >= 24) { utH -= 24; dayShift += 1; }
  while (utH <  0)  { utH += 24; dayShift -= 1; }
  const dateObj = new Date(Date.UTC(y, mo - 1, d + dayShift));
  return {
    yearUT:  dateObj.getUTCFullYear(),
    monthUT: dateObj.getUTCMonth() + 1,
    dayUT:   dateObj.getUTCDate(),
    hourUT:  utH,
  };
}
function formatNativeInfo(n) {
  const [y, mo, d] = n.date.split('-').map(Number);
  return `${d} ${MONTHS_FR[mo - 1]} ${y} · ${n.time} · ${n.placeLabel}`;
}

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
  const n = currentNative();
  const u = nativeToUt(n);
  return {
    jd: swe.julianDay(u.yearUT, u.monthUT, u.dayUT, u.hourUT),
    latitude: n.latitude, longitude: n.longitude,
    title: `Natal — ${n.name}`,
    info: formatNativeInfo(n),
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
const BODY_GLYPH = {};
for (const b of [...PLANETS, ...EXTENDED]) BODY_GLYPH[b.key] = b.glyph;

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
// Bi-wheel (2026-10-15) : anneau intérieur = thème choisi (natal), anneau
// extérieur = transits à l'instant courant (null = maintenant, sinon chartTime
// du curseur de frise). Bande zodiacale élargie, les deux anneaux de glyphes
// l'encadrent. Les aspects et mi-points vivent sur l'anneau natal uniquement
// (une étude croisée transit/natal reste à faire en v2).
// viewBox 1040×1040 inchangé.
const R_ZODIAC_OUT   = 365;   // bord extérieur bande zodiacale
const R_ZODIAC_IN    = 268;   // bord intérieur bande (épaisseur 97, +50% depuis 2026-10-15)
const R_HOUSE_END    = 390;   // cusps internes s'arrêtent avant l'anneau transit
const R_ANGLE_EXTEND = 510;   // axes ASC/DSC/MC/IC traversent tout le viewBox
const R_HOUSE_NUM    = 332;   // numéros de maisons au milieu de la bande
const R_MIDPOINT_IN  = R_ZODIAC_IN - 12;  // ticks mi-points côté natal (12 vb units : dépasse les ticks planètes/astéroïdes, sinon illisible)
// Anneau natal (intérieur) — glyphes rapprochés du centre.
const R_PLANET_NATAL      = 230;   // glyphes planètes natal (compressés 2026-10-15 pour bande zodiacale +50%)
const R_PLANET_NATAL_DEG  = 198;   // degrés sous le glyphe natal
const R_PLANET_NATAL_TICK = R_ZODIAC_IN;
const R_PLANET_NATAL_TICK_END = R_ZODIAC_IN - 8;
// Anneau transit (extérieur) — glyphes posés juste au-delà de la bande.
const R_PLANET_TRANSIT      = 410;  // glyphes planètes transit
const R_PLANET_TRANSIT_DEG  = 442;  // degrés plus loin du centre
const R_PLANET_TRANSIT_TICK = R_ZODIAC_OUT;
const R_PLANET_TRANSIT_TICK_END = R_ZODIAC_OUT + 8;
const R_ASPECT       = 180;   // cercle interne des cordes d'aspects (natal only)
// Astéroïdes dans les deux anneaux (choix Perig 2026-10-15).
const R_ASTEROID_NATAL_TICK      = R_ZODIAC_IN;
const R_ASTEROID_NATAL_TICK_END  = R_ZODIAC_IN - 6;
const R_ASTEROID_NATAL_DOT       = 212;
const R_ASTEROID_NATAL_LBL       = 190;
const R_ASTEROID_TRANSIT_TICK      = R_ZODIAC_OUT;
const R_ASTEROID_TRANSIT_TICK_END  = R_ZODIAC_OUT + 6;
const R_ASTEROID_TRANSIT_DOT       = 462;
const R_ASTEROID_TRANSIT_LBL       = 484;
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
// Bi-wheel (2026-10-15) : anneau intérieur = natal, anneau extérieur = transit.
// L'ascendant et les maisons viennent toujours du natal (frame standard astro).
// Les aspects et mi-points vivent sur l'anneau natal uniquement en v1.
// La logique soustractive reste le moteur : chaque couche est indépendamment
// affichable / masquable via `layers` (aucun élément DOM si masquée).
function drawPlanetRing(container, bodies, asteroids, ascLon, layers, params) {
  const { rGlyph, rDeg, rTick, rTickEnd,
          rAstTick, rAstTickEnd, rAstDot, rAstLbl,
          ringClass } = params;
  // Astéroïdes de cet anneau — tick sur la bande + dot/label décalés vers
  // le centre (natal) ou vers l'extérieur du viewBox (transit).
  if (layers.asteroids) {
    for (const a of asteroids) {
      const tk1 = project(a.lon, ascLon, rAstTick);
      const tk2 = project(a.lon, ascLon, rAstTickEnd);
      container.appendChild(svg('line', { x1: tk1.x, y1: tk1.y, x2: tk2.x, y2: tk2.y, class: 'asteroid-tick ' + ringClass }));
      const pt = project(a.lon, ascLon, rAstDot);
      container.appendChild(svg('circle', { cx: pt.x, cy: pt.y, r: 3, class: 'asteroid-dot ' + ringClass }));
      const lp = project(a.lon, ascLon, rAstLbl);
      container.appendChild(svg('text', { x: lp.x, y: lp.y, class: 'asteroid-label ' + ringClass }, a.name.slice(0, 8)));
    }
  }
  // Planètes — tri par longitude relative à ASC, décalage radial si collées.
  // Côté natal (intérieur) le décalage pousse vers le centre ; côté transit
  // (extérieur) il pousse vers l'extérieur, pour que les grappes restent dans
  // leur demi-plan respectif sans mordre la bande.
  if (layers.planets) {
    const outward = ringClass === 'ring-transit' ? +1 : -1;
    const sorted = [...bodies].sort((a, b) => normDeg(a.lon - ascLon) - normDeg(b.lon - ascLon));
    const MIN_SEP = 8;
    let lastLon = -999, ringOffset = 0;
    for (const p of sorted) {
      const sep = normDeg(p.lon - lastLon);
      if (sep < MIN_SEP && lastLon > -999) ringOffset += outward * 28; else ringOffset = 0;
      const rG = rGlyph + ringOffset;
      const rD = rDeg + ringOffset;
      const pt = project(p.lon, ascLon, rG);
      const tk1 = project(p.lon, ascLon, rTick);
      const tk2 = project(p.lon, ascLon, rTickEnd);
      container.appendChild(svg('line', { x1: tk1.x, y1: tk1.y, x2: tk2.x, y2: tk2.y, class: 'planet-tick ' + ringClass }));
      container.appendChild(svg('text', {
        x: pt.x, y: pt.y, class: 'planet-symbol ' + ringClass,
        'data-planet': p.key,
        'data-ring': ringClass === 'ring-transit' ? 'transit' : 'natal',
        style: `--planet-scale: ${PLANET_SCALES[p.key] || 1}`
      }, p.glyph));
      const degInSign = Math.floor(p.lon % 30);
      const dp = project(p.lon, ascLon, rD);
      container.appendChild(svg('text', { x: dp.x, y: dp.y, class: 'planet-degree ' + ringClass }, degInSign + '°' + (p.retro ? ' ℞' : '')));
      lastLon = p.lon;
    }
  }
}

function drawChart({ natal, transit }, layers) {
  const container = document.getElementById('chart');
  container.innerHTML = '';
  // Frame = natal : ascendant, maisons, zodiaque orientés par le natal.
  const { cusps, ascendant, midheaven } = natal;
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

  // Mi-points natal — tick radial + label « ♀|♂ » côté intérieur.
  // Triés par longitude et décalés radialement quand conjoints (même
  // politique que les planètes : MIN_SEP=8°, offset=-28 vers le centre).
  if (layers.midpoints && layers.planets) {
    const midpoints = computeMidpoints(natal.bodies);
    midpoints.sort((a, b) => normDeg(a.lon - ascLon) - normDeg(b.lon - ascLon));
    const MIN_SEP = 8;
    let lastLon = -999, ringOffset = 0;
    for (const m of midpoints) {
      const sep = normDeg(m.lon - lastLon);
      if (sep < MIN_SEP && lastLon > -999) ringOffset -= 28; else ringOffset = 0;
      const rTickEnd = R_MIDPOINT_IN + ringOffset;
      const rLabel   = rTickEnd - 6;
      const t1 = project(m.lon, ascLon, R_ZODIAC_IN);
      const t2 = project(m.lon, ascLon, rTickEnd);
      container.appendChild(svg('line', { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, class: 'midpoint-tick' }));
      const ga = BODY_GLYPH[m.a];
      const gb = BODY_GLYPH[m.b];
      if (ga && gb) {
        const p = project(m.lon, ascLon, rLabel);
        const radAngle = Math.atan2(p.y, p.x) * 180 / Math.PI;
        // Moitié gauche : pivoter de 180° pour ne pas écrire tête en bas.
        const rot = p.x < 0 ? radAngle + 180 : radAngle;
        container.appendChild(svg('text', {
          x: p.x, y: p.y,
          class: 'midpoint-glyph',
          transform: `rotate(${rot.toFixed(1)}, ${p.x.toFixed(1)}, ${p.y.toFixed(1)})`
        }, `${ga}|${gb}`));
      }
      lastLon = m.lon;
    }
  }

  // Aspects natal uniquement en v1 (étude croisée transit→natal à faire plus tard).
  if (layers.planets && state.harmonics.size > 0) {
    container.appendChild(svg('circle', { cx: 0, cy: 0, r: R_ASPECT, class: 'zodiac-ring' }));
    const aspects = computeAspectsForHarmonics(natal.bodies, state.harmonics);
    const useDigits = state.aspectStyle === 'digits';
    for (const asp of aspects) {
      const p1 = project(asp.a.lon, ascLon, R_ASPECT);
      const p2 = project(asp.b.lon, ascLon, R_ASPECT);
      if (useDigits) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
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

  // Anneau natal (intérieur) — glyphes + ticks + astéroïdes natal.
  drawPlanetRing(container, natal.bodies, natal.asteroids, ascLon, layers, {
    rGlyph: R_PLANET_NATAL, rDeg: R_PLANET_NATAL_DEG,
    rTick: R_PLANET_NATAL_TICK, rTickEnd: R_PLANET_NATAL_TICK_END,
    rAstTick: R_ASTEROID_NATAL_TICK, rAstTickEnd: R_ASTEROID_NATAL_TICK_END,
    rAstDot: R_ASTEROID_NATAL_DOT, rAstLbl: R_ASTEROID_NATAL_LBL,
    ringClass: 'ring-natal',
  });
  // Anneau transit (extérieur) — glyphes + ticks + astéroïdes transit.
  // Couche indépendante : toggle `transits` cache planètes+astéroïdes de
  // l'anneau extérieur sans toucher au natal.
  if (layers.transits) {
    drawPlanetRing(container, transit.bodies, transit.asteroids, ascLon, layers, {
      rGlyph: R_PLANET_TRANSIT, rDeg: R_PLANET_TRANSIT_DEG,
      rTick: R_PLANET_TRANSIT_TICK, rTickEnd: R_PLANET_TRANSIT_TICK_END,
      rAstTick: R_ASTEROID_TRANSIT_TICK, rAstTickEnd: R_ASTEROID_TRANSIT_TICK_END,
      rAstDot: R_ASTEROID_TRANSIT_DOT, rAstLbl: R_ASTEROID_TRANSIT_LBL,
      ringClass: 'ring-transit',
    });
  }

  // Scrapbook (v1) : cadres textuels visuels positionnés librement dans
  // le SVG via <foreignObject>. Créés au double-tap, éditables inline
  // (contenteditable), déplaçables via poignée, redimensionnables via CSS
  // natif `resize: both`. Filtrés par le temps courant du chart : un item
  // n'apparaît que si createdAt <= chartTime ET (retiredAt null OU
  // chartTime < retiredAt). Ainsi remonter le slider fait réapparaître
  // les items retirés temporellement.
  if (layers.scrapbook && state.scrapbook.length) {
    for (const it of state.scrapbook) {
      if (!isScrapItemVisible(it)) continue;
      drawScrapItem(container, it);
    }
  }
}

// ---------- Scrapbook : import d'image (redimensionnement) ----------
// Les photos de téléphone pèsent 2–5 Mo ; encodées en dataURL base64 (+33 %)
// elles saturent le quota localStorage (~5 Mo par origine) dès la 2e ou 3e
// image — d'où le QuotaExceededError du 2026-10-23. On ré-encode donc à
// l'import : côté le plus long ramené à SCRAP_IMG_MAX_PX, qualité
// SCRAP_IMG_QUALITY. Une photo de 4 Mo tombe à ~60–120 Ko.
// WebP quand le navigateur le supporte (garde la transparence des PNG),
// JPEG sinon.
const SCRAP_IMG_MAX_PX    = 512;
const SCRAP_IMG_QUALITY   = 0.82;
const SCRAP_IMG_MAX_BYTES = 400 * 1024;   // garde-fou : re-encode plus fort au-delà

let _webpOk = null;
function webpSupported() {
  if (_webpOk != null) return _webpOk;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    _webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch (e) { _webpOk = false; }
  return _webpOk;
}

function loadImageFromSrc(src, revoke) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { if (revoke) URL.revokeObjectURL(src); resolve(img); };
    img.onerror = () => {
      if (revoke) URL.revokeObjectURL(src);
      reject(new Error('format non décodable'));
    };
    img.src = src;
  });
}
function loadImageFromFile(file) {
  return loadImageFromSrc(URL.createObjectURL(file), true);
}

function encodeCanvas(canvas, type, quality) {
  try { return canvas.toDataURL(type, quality); } catch (e) { return null; }
}

// Ré-encode une image déjà décodée. Retourne { dataUrl, width, height }.
function encodeScrapImage(img) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) throw new Error('dimensions inconnues');
  const scale = Math.min(1, SCRAP_IMG_MAX_PX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const type = webpSupported() ? 'image/webp' : 'image/jpeg';
  let dataUrl = encodeCanvas(canvas, type, SCRAP_IMG_QUALITY);
  // Garde-fou : si ça reste lourd (image très détaillée), on redescend.
  if (dataUrl && dataUrl.length > SCRAP_IMG_MAX_BYTES) {
    const smaller = encodeCanvas(canvas, type, 0.6);
    if (smaller && smaller.length < dataUrl.length) dataUrl = smaller;
  }
  if (!dataUrl) throw new Error('encodage impossible');
  return { dataUrl, width: w, height: h };
}

// Retourne { dataUrl, width, height } — image prête à être stockée.
async function prepareScrapImage(file) {
  return encodeScrapImage(await loadImageFromFile(file));
}

// ---------- Scrapbook : variantes pour Drive (thumb + full en Blob) ----------
// Quand Drive est connecté, on stocke 2 variantes par item (jamais en dataURL
// base64, jamais en localStorage) : thumb pour la vue de loin, full pour le
// zoom profond. Le swap selon zoom est fait côté rendu (LOD).
const SCRAP_THUMB_PX = 256;
const SCRAP_FULL_PX  = 2048;
const SCRAP_THUMB_QUALITY = 0.80;
const SCRAP_FULL_QUALITY  = 0.85;

function encodeCanvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('encodage impossible')),
      type, quality
    );
  });
}

async function makeVariantBlob(img, maxPx, quality, type) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) throw new Error('dimensions inconnues');
  const scale = Math.min(1, maxPx / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await encodeCanvasToBlob(canvas, type, quality);
  return { blob, width: w, height: h };
}

// Retourne { thumb: {blob,width,height}, full: {blob,width,height}, mimeType }
// — les deux variantes à uploader vers Drive.
async function prepareScrapImageVariants(file) {
  const img = await loadImageFromFile(file);
  const type = webpSupported() ? 'image/webp' : 'image/jpeg';
  const thumb = await makeVariantBlob(img, SCRAP_THUMB_PX, SCRAP_THUMB_QUALITY, type);
  const full  = await makeVariantBlob(img, SCRAP_FULL_PX,  SCRAP_FULL_QUALITY,  type);
  return { thumb, full, mimeType: type };
}

// Recompression one-shot des items déjà stockés (2026-10-23). Les images
// importées avant le redimensionnement pèsent plusieurs Mo chacune et saturent
// le quota : le scrapbook devient inutilisable (plus aucun ajout possible).
// On ré-encode en place, une seule fois par item (marqueur `imgV: 2`).
// Atomique : le nouveau tableau n'est écrit que s'il tient dans le quota ;
// sinon l'ancien contenu reste intact. Best-effort, non bloquant au boot.
const SCRAP_IMG_VERSION = 2;
async function recompressScrapbookImages() {
  const targets = state.scrapbook.filter(
    it => it.imgDataUrl && it.imgV !== SCRAP_IMG_VERSION
  );
  if (!targets.length) return;
  let changed = 0;
  for (const it of targets) {
    try {
      const img = await loadImageFromSrc(it.imgDataUrl, false);
      const enc = encodeScrapImage(img);
      if (enc.dataUrl.length < it.imgDataUrl.length) {
        it.imgDataUrl = enc.dataUrl;
        it.imgWidth   = enc.width;
        it.imgHeight  = enc.height;
        changed++;
      }
      it.imgV = SCRAP_IMG_VERSION;   // marqué même si déjà compact
    } catch (e) {
      it.imgV = SCRAP_IMG_VERSION;   // indécodable : on ne réessaiera pas
    }
  }
  if (!changed) return;
  const before = state.scrapbook.length;
  if (saveScrapbook()) {
    console.info(`scrapbook : ${changed}/${before} image(s) recompressée(s)`);
    render().catch(e => showError('render error: ' + e.message));
  }
}

// ---------- Scrapbook : rendu d'un item image ----------
// Chaque item est un élément <image> SVG natif, ancré à (lon, radius)
// dans la bande zodiacale. Sa taille en unités viewBox est fixe et petite
// (~8 unités sur le côté le plus long) — en vue 100% c'est minuscule,
// au zoom ça se révèle. Même principe que les mipoints.
// Les images avec transparence (PNG) gardent leur forme naturelle.
const SCRAP_IMG_BASE = 8;  // unités viewBox sur le côté le plus long

// LOD : au-dessus de ce seuil de zoom, on sert le `full` au lieu du `thumb`.
// Thumb 256 px est net tant qu'il tient dans sa case à l'écran. Pour un
// écran 400 px, un item fait ~3.08 × zoom pixels : à zoom 80 → ~246 px,
// à zoom 100 → ~308 px. Au-dessus de 80 on bascule sur full 2048.
const SCRAP_LOD_FULL_ZOOM = 80;

// Cache en mémoire des blobs Drive. Clef = fileId Drive. La valeur est un
// objectURL créé via URL.createObjectURL — à révoquer si on vide le cache,
// mais tant que la page vit on garde (coût mémoire négligeable, ~qq Mo).
// Un deuxième Map suit les Promises en vol pour éviter les doubles fetches
// quand drawScrapItem est appelé plusieurs fois pendant que le blob charge.
const scrapBlobCache  = new Map();  // fileId → objectURL
const scrapBlobInFlight = new Map();  // fileId → Promise<objectURL>

// Pré-charge un blob fraîchement encodé côté client dans le cache, sans
// aller-retour Drive. Appelé juste après l'upload à la création d'item.
function preloadThumbBlob(fileId, blob) {
  if (!fileId || scrapBlobCache.has(fileId)) return;
  scrapBlobCache.set(fileId, URL.createObjectURL(blob));
}

// Résout un fileId Drive en objectURL. Appel synchrone : retourne l'URL si
// déjà en cache, sinon null + lance le fetch en arrière-plan et déclenche
// un render au retour (pour que drawScrapItem repasse et pose l'href).
function getScrapBlobUrl(fileId) {
  if (!fileId) return null;
  if (scrapBlobCache.has(fileId)) return scrapBlobCache.get(fileId);
  if (!scrapBlobInFlight.has(fileId)) {
    const p = Drive.loadBlobFromDrive(fileId)
      .then(blob => {
        const url = URL.createObjectURL(blob);
        scrapBlobCache.set(fileId, url);
        scrapBlobInFlight.delete(fileId);
        render().catch(e => console.warn('render after blob load:', e.message));
        return url;
      })
      .catch(e => {
        scrapBlobInFlight.delete(fileId);
        console.warn('loadBlobFromDrive', fileId, e.message);
      });
    scrapBlobInFlight.set(fileId, p);
  }
  return null;
}

// Choisit la variante selon le zoom courant. Retourne un fileId Drive, ou
// null si l'item n'a pas la variante demandée (ex. thumb absent).
function pickScrapVariant(it) {
  const zoom = (state.chart && state.chart.zoom) || 1;
  const wantsFull = zoom >= SCRAP_LOD_FULL_ZOOM;
  if (wantsFull && it.fullFileId) return it.fullFileId;
  return it.thumbFileId || it.fullFileId || null;
}

// Mode édition d'un item scrapbook (toggled par double-tap sur l'item). Un
// seul item à la fois. Null = pas d'édition. Changer cette valeur ne
// re-render pas tout seul — l'appelant doit lancer render().
let editingScrapId = null;

function drawScrapItem(container, it) {
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const rawR   = it.radius != null ? it.radius : (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
  const dotR   = Math.max(R_ZODIAC_IN, Math.min(R_ZODIAC_OUT, rawR));
  const center = project(it.lon != null ? it.lon : 0, ascLon, dotR);

  const iw = it.imgWidth || 100;
  const ih = it.imgHeight || 100;
  const scale = it.scale || 1;
  const base = SCRAP_IMG_BASE * scale;
  let w, h;
  if (iw >= ih) { w = base; h = base * ih / iw; }
  else          { h = base; w = base * iw / ih; }

  // Résolution de l'href selon la source :
  //  - Drive : variante choisie par LOD, chargée via cache mémoire.
  //  - Legacy localStorage : dataURL inline.
  let href = null;
  if (it.imgSrc === 'drive') {
    const fileId = pickScrapVariant(it);
    if (!fileId) return;
    href = getScrapBlobUrl(fileId);
    if (!href) return;  // chargement en cours, re-render au retour
  } else {
    if (!it.imgDataUrl) return;
    href = it.imgDataUrl;
  }

  const img = svg('image', {
    x: center.x - w / 2, y: center.y - h / 2,
    width: w, height: h,
    href,
    class: 'scrap-img-item',
    'data-id': it.id,
    // Évite que le navigateur WebView traite l'image comme draggable natif
    // (sinon long-press déclenche "enregistrer l'image" sur Android)
    draggable: 'false',
  });
  container.appendChild(img);

  // Overlay d'édition : rect pointillé + poignée resize (coin bas-droit) +
  // bouton retirer (coin haut-droit). Poignées strictement proportionnelles
  // à la petite dimension de l'image (30 %) — si l'item est petit à l'écran,
  // l'utilisateur zoome la vue (pinch libre pendant le mode édition) et les
  // poignées grandissent avec.
  if (editingScrapId === it.id) {
    const handleR = Math.min(w, h) * 0.3;
    const strokeW = handleR * 0.12;
    const dash    = handleR * 0.6;
    const x0 = center.x - w / 2;
    const y0 = center.y - h / 2;

    container.appendChild(svg('rect', {
      x: x0, y: y0, width: w, height: h,
      class: 'scrap-edit-frame',
      'stroke-width': strokeW,
      'stroke-dasharray': `${dash} ${dash * 0.7}`,
    }));

    container.appendChild(svg('circle', {
      cx: x0 + w, cy: y0 + h, r: handleR,
      class: 'scrap-edit-handle',
      'stroke-width': strokeW,
      'data-scrap-handle': 'resize',
      'data-id': it.id,
    }));

    container.appendChild(svg('circle', {
      cx: x0 + w, cy: y0, r: handleR,
      class: 'scrap-edit-delete',
      'stroke-width': strokeW,
      'data-scrap-handle': 'remove',
      'data-id': it.id,
    }));
    container.appendChild(svg('text', {
      x: x0 + w, y: y0,
      class: 'scrap-edit-delete-x',
      style: `font-size:${handleR * 1.6}px`,
    }, '×'));
  }
}

// Visibilité d'un item scrapbook (bi-wheel) :
//  - scope 'natal' = ancré au thème choisi, toujours visible (le natal est
//    maintenant toujours présent en anneau intérieur).
//  - scope 'timed' = ancré à createdAt sur la frise, retiré à retiredAt :
//    visible si chartTime courant tombe dans l'intervalle.
function isScrapItemVisible(item) {
  const scope = item.scope || 'timed';
  if (scope === 'natal') return true;
  const t = state.chartTime != null ? state.chartTime : Date.now();
  if ((item.createdAt || 0) > t) return false;
  if (item.retiredAt != null && t >= item.retiredAt) return false;
  return true;
}


function screenToSvg(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
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
const TL_VB_H = 520;
const TL_MARGIN_L = 42;
const TL_MARGIN_R = 14;
const TL_MARGIN_T = 10;
const TL_MARGIN_B = 40;
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

// Fenêtre de référence autour du natal : -50 ans (contexte générationnel,
// ancêtres) à +150 ans (prospective, transits à long terme). Fixe et large,
// cache de courbes stable. Ce n'est plus un plafond : timelineRange() ne
// clamp plus, le pan peut aller au-delà (courbes vides hors fenêtre, c'est
// assumé). "À volonté dans les deux sens" = pas de butée dure.
const TL_PAST_YEARS = 50;
const TL_FUTURE_YEARS = 150;
const MS_PER_YEAR = 365.25 * 86400000;

// P1 (2026-10-22) : zoom frise par paliers temporels DISCRETS, pas pinch
// continu. Chaque palier porte un span H (fenêtre temporelle visible), un
// span V (ouverture en degrés écliptiques), et un ancrage V ('sun' = position
// Soleil au tlCenter, 'asc' = Ascendant du lieu natal au tlCenter).
//
// Isomorphie H↔V (fiche project_zoom_continu_apories.md) : plus on zoome dans
// le temps, moins on a besoin des 360° du ciel, plus on a besoin d'espace par
// degré pour composer. Au palier `subhour` on étale 2° sur toute la hauteur
// pour poser plusieurs scraps dans un instant précis (P2+).
const TL_PALIERS = ['century','decade','year','month','day','hour','subhour'];
const TL_PALIER_SPEC = {
  century: { spanMs: 100 * MS_PER_YEAR, lonSpan: 360, vAnchor: 'sun', label: 'siècle'    },
  decade:  { spanMs:  10 * MS_PER_YEAR, lonSpan: 360, vAnchor: 'sun', label: 'décennie'  },
  year:    { spanMs:   1 * MS_PER_YEAR, lonSpan: 360, vAnchor: 'sun', label: 'année'     },
  month:   { spanMs:  30 *   86400000, lonSpan: 120, vAnchor: 'sun', label: 'mois'      },
  day:     { spanMs:        86400000, lonSpan:  30, vAnchor: 'asc', label: 'jour'      },
  hour:    { spanMs:         3600000, lonSpan:  10, vAnchor: 'asc', label: 'heure'     },
  subhour: { spanMs:          600000, lonSpan:   2, vAnchor: 'asc', label: 'sous-heure'},
};

// P1 : objets scrap + pinch désactivés. Le code reste intact pour P2+.
// (plan v1 : « grille vivante SANS objets », pinch continu rejeté).
const TL_SHOW_SCRAPS = false;
const PINCH_H_ENABLED = false;
const PINCH_V_ENABLED = false;

function fullTimelineRange() {
  const u = nativeToUt(currentNative());
  const natalMs = Date.UTC(
    u.yearUT, u.monthUT - 1, u.dayUT,
    Math.floor(u.hourUT),
    Math.round((u.hourUT % 1) * 60),
  );
  const startMs = natalMs - TL_PAST_YEARS * MS_PER_YEAR;
  const endMs   = natalMs + TL_FUTURE_YEARS * MS_PER_YEAR;
  return { startMs, endMs, startJd: msToJd(startMs), endJd: msToJd(endMs) };
}

const TL_ZOOM_MIN = 1.0;
// Plafond très haut (10 millions) : à ce zoom, span visible ≈ 0.6s — bien
// au-delà des besoins pratiques (minutes, voire secondes). "Zoom infini"
// roadmap : si on l'atteint, revoir aussi la stratégie de rendu
// (foreignObject des items potentiellement lourds). Perig 2026-10-20 :
// buté à 100 000 "dans la région des heures" → montée à 10M.
const TL_ZOOM_MAX = 10000000;

// Zoom vertical : étire la frise sur l'axe des longitudes. 1 = 12 signes
// visibles, 24 = un demi-signe visible. Pinch à composante verticale
// dominante le pilote. vCenter = longitude au centre de la vue (0..360),
// clampée pour que la fenêtre reste dans [0, 360]. (Perig 2026-10-19)
const TL_V_ZOOM_MIN = 1.0;
const TL_V_ZOOM_MAX = 24;

// Centre temporel courant (ms). Priorité : pan explicite > curseur > now.
function timelineCenter() {
  return state.timeline?.tlCenter != null
    ? state.timeline.tlCenter
    : (state.chartTime != null ? state.chartTime : Date.now());
}

// Palier courant (défaut 'day' au boot — plus proche du geste de dépôt).
function currentPalier() {
  const p = state.timeline?.palier;
  return TL_PALIER_SPEC[p] ? p : 'day';
}

// Centre V par défaut selon ancrage du palier : Soleil (paliers larges) ou
// Ascendant du lieu natal (paliers courts, quand les maisons sont pertinentes).
// Fallback silencieux à 180° si swe pas prêt.
function computeDefaultVCenter(ms, palier) {
  const spec = TL_PALIER_SPEC[palier] || TL_PALIER_SPEC.day;
  try {
    const jd = msToJd(ms);
    if (spec.vAnchor === 'sun') {
      // swisseph SE_SUN = 0.
      return normDeg(swe.calc(jd, 0).longitude);
    } else {
      const n = currentNative();
      const lat = (n && n.latitude != null) ? n.latitude : MONTREAL.latitude;
      const lon = (n && n.longitude != null) ? n.longitude : MONTREAL.longitude;
      return normDeg(swe.houses(jd, lat, lon, sweMod.HouseSystem.Placidus).ascendant);
    }
  } catch (e) {
    return 180;
  }
}

// Ouverture V dérivée du palier. vCenter calé automatiquement sur
// Soleil/Ascendant (voir vAnchor) ; clamp dans [halfSpan, 360-halfSpan] pour
// éviter le wrap (traité plus tard si l'usage le demande).
function lonRange() {
  const palier = currentPalier();
  const spec   = TL_PALIER_SPEC[palier];
  const span   = spec.lonSpan;
  const halfSpan = span / 2;
  const vCenterRaw = (state.timeline && state.timeline.vCenter != null)
    ? state.timeline.vCenter
    : computeDefaultVCenter(timelineCenter(), palier);
  const vCenter = Math.max(halfSpan, Math.min(360 - halfSpan, vCenterRaw));
  return { startLon: vCenter - halfSpan, endLon: vCenter + halfSpan, span };
}

// Fenêtre H VISIBLE, dérivée du palier (span fixe par palier) et du centre
// temporel. Pas de clamp — pan libre dans les deux sens.
function timelineRange() {
  const palier = currentPalier();
  const spec   = TL_PALIER_SPEC[palier];
  const visibleSpan = spec.spanMs;
  const center = timelineCenter();
  const startMs = center - visibleSpan / 2;
  const endMs   = center + visibleSpan / 2;
  return { startMs, endMs, startJd: msToJd(startMs), endJd: msToJd(endMs) };
}

// Bascule palier (−1 = dézoomer vers plus large ; +1 = zoomer plus fin).
// Recalcule vCenter sur le nouveau palier (le centre H reste, le centre V
// se cale sur l'ancrage du palier cible). Rafraîchit l'UI.
function setPalier(delta) {
  if (!state.timeline) state.timeline = { palier: 'day' };
  const cur = currentPalier();
  const i = TL_PALIERS.indexOf(cur);
  const j = Math.max(0, Math.min(TL_PALIERS.length - 1, i + delta));
  if (j === i) return;
  const next = TL_PALIERS[j];
  state.timeline.palier = next;
  // vCenter recalculé automatiquement par lonRange() au prochain draw.
  // On l'efface explicitement pour éviter une persistance d'un vCenter
  // posé à un ancien palier (ex. ASC à un palier court → Soleil à un palier large).
  state.timeline.vCenter = null;
  updatePalierLabel();
  flashPalierTransition();
  try { drawTimeline(); } catch (e) { showError('timeline error: ' + e.message); }
}

// Feedback de transition (P1 2026-10-22) : abandon du zoom fluide — à la
// place, un flash court double-canal signale "la frise a changé d'ontologie,
// pas juste de valeur". A = flash du fond timeline. C = pulse du label palier.
// Les classes CSS portent les transitions ; on les pose, on les retire après
// la durée de l'anim.
function flashPalierTransition() {
  const tl = document.getElementById('timeline');
  const lbl = document.getElementById('timeline-palier-label');
  if (tl) {
    tl.classList.remove('tl-flash');
    void tl.offsetWidth; // force reflow pour redémarrer l'anim si rapide
    tl.classList.add('tl-flash');
    setTimeout(() => tl.classList.remove('tl-flash'), 180);
  }
  if (lbl) {
    lbl.classList.remove('tl-palier-pulse');
    void lbl.offsetWidth;
    lbl.classList.add('tl-palier-pulse');
    setTimeout(() => lbl.classList.remove('tl-palier-pulse'), 420);
  }
}

function updatePalierLabel() {
  const el = document.getElementById('timeline-palier-label');
  if (!el) return;
  const spec = TL_PALIER_SPEC[currentPalier()];
  el.textContent = spec ? spec.label : '';
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
  const { startLon, span } = lonRange();
  return TL_MARGIN_T + ((normDeg(lon) - startLon) / span) * TL_PLOT_H;
}

// Inverses de tlX/tlY : étant donné (svgX, svgY) dans la viewBox de la
// frise, retrouve (ms, lon). Utilisés par le geste de création d'un item
// scrapbook par double-tap dans la frise agrandie (consigne Perig 2026-10-19).
function msFromTlX(svgX, range) {
  const { startMs, endMs } = range;
  const t = (svgX - TL_MARGIN_L) / TL_PLOT_W;
  return startMs + t * (endMs - startMs);
}
function lonFromTlY(svgY) {
  const { startLon, span } = lonRange();
  const t = (svgY - TL_MARGIN_T) / TL_PLOT_H;
  return normDeg(startLon + t * span);
}

// Inverse de project(lon, ascLon, r) : étant donné (x, y) coords SVG dans
// la roue (centre en 0,0) et l'ascLon courant, retrouve la longitude
// écliptique du point. Indépendant du rayon.
function xyToLon(x, y, ascLon) {
  const theta = Math.atan2(-y, x);                 // radians
  const rel = (theta / DEG) - 180;                 // degrés depuis asc
  return normDeg(rel + ascLon);
}

// Lignes horizontales V densifiées par palier (P1 patch 3 2026-10-22).
// Isomorphie V : plus la fenêtre V est étroite (paliers courts), plus on
// densifie les subdivisions pour que le pan V donne un retour visuel immédiat.
// À subhour (lonSpan 2°), il faut des lignes tous les 10' d'arc sinon on a
// l'impression de ne pas bouger.
function drawVerticalGrid(svgEl, lr, palier) {
  const xL = TL_MARGIN_L;
  const xR = TL_MARGIN_L + TL_PLOT_W;
  const mkLine = (lon, cls) => {
    if (lon < lr.startLon || lon > lr.endLon) return;
    const y = tlY(lon);
    svgEl.appendChild(svg('line', { x1: xL, y1: y, x2: xR, y2: y, class: cls }));
  };
  // Degrés : pour chaque entier k° dans la fenêtre, tracer une ligne.
  // Classe 'strong' aux multiples de la cadence 'majeure'.
  const drawDegreeLines = (minor, major) => {
    const start = Math.ceil(lr.startLon / minor) * minor;
    for (let d = start; d <= lr.endLon + 1e-6; d += minor) {
      const isMajor = (Math.abs(d % major) < 1e-6 || Math.abs(major - (d % major)) < 1e-6);
      mkLine(d, isMajor ? 'tl-sign-sep' : 'tl-v-fine');
    }
  };
  if (palier === 'century' || palier === 'decade' || palier === 'year') {
    // Signes (30°) déjà tracés par la boucle principale. Ajout demi-signes (15°).
    for (let i = 0; i < 24; i++) mkLine(i * 15, i % 2 === 0 ? 'tl-sign-sep' : 'tl-v-fine');
    return;
  }
  if (palier === 'month') {
    // Décans (10°) + signes (30°) forts.
    drawDegreeLines(10, 30);
    return;
  }
  if (palier === 'day') {
    // Chaque degré, forts tous les 5°.
    drawDegreeLines(1, 5);
    return;
  }
  if (palier === 'hour') {
    // Chaque degré fort + sous-divisions à 10' (1/6 degré).
    drawDegreeLines(1/6, 1);
    return;
  }
  if (palier === 'subhour') {
    // Chaque 10' d'arc + sous-divisions à 2' (1/30 degré).
    drawDegreeLines(1/30, 1/6);
    return;
  }
}

// Graduation par palier : trait courant (fin, non labellé) + trait parent
// (épais, labellé). Un cran "parent" rend le repère englobant lisible : au
// palier `day`, par ex., chaque heure est tracée et minuit porte la date.
const MONTH_LABELS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
function drawPalierGrid(svgEl, range, palier) {
  const yTop = TL_MARGIN_T;
  const yBot = TL_MARGIN_T + TL_PLOT_H;
  const yLabel = yBot + 20;
  const mkTick = (ms, cls) => {
    const x = tlX(ms, range);
    svgEl.appendChild(svg('line', { x1: x, y1: yTop, x2: x, y2: yBot, class: cls }));
    return x;
  };
  const mkLabel = (x, text, cls) => {
    svgEl.appendChild(svg('text', { x, y: yLabel, class: cls }, text));
  };

  if (palier === 'century') {
    // Trait fin tous les 10 ans, trait fort tous les 100 ans (siècle).
    const sYear = Math.floor(new Date(range.startMs).getUTCFullYear() / 10) * 10;
    const eYear = new Date(range.endMs).getUTCFullYear();
    for (let y = sYear; y <= eYear; y++) {
      if (y % 10 !== 0) continue;
      const ms = Date.UTC(y, 0, 1);
      if (ms < range.startMs || ms > range.endMs) continue;
      const isCent = (y % 100 === 0);
      const x = mkTick(ms, isCent ? 'tl-year-tick-strong' : 'tl-year-tick');
      if (isCent) mkLabel(x, String(y), 'tl-year-label');
    }
    return;
  }

  if (palier === 'decade') {
    // Trait fin chaque année, trait fort toutes les décennies.
    const sYear = new Date(range.startMs).getUTCFullYear();
    const eYear = new Date(range.endMs).getUTCFullYear();
    for (let y = sYear; y <= eYear; y++) {
      const ms = Date.UTC(y, 0, 1);
      if (ms < range.startMs || ms > range.endMs) continue;
      const isDec = (y % 10 === 0);
      const x = mkTick(ms, isDec ? 'tl-year-tick-strong' : 'tl-year-tick');
      if (isDec) mkLabel(x, String(y), 'tl-year-label');
    }
    return;
  }

  if (palier === 'year') {
    // Trait fin chaque mois, trait fort au 1er janvier (année).
    const dStart = new Date(range.startMs);
    let yr = dStart.getUTCFullYear(), mo = dStart.getUTCMonth();
    let ms = Date.UTC(yr, mo, 1);
    while (ms <= range.endMs) {
      if (ms >= range.startMs) {
        const isJan = (mo === 0);
        const x = mkTick(ms, isJan ? 'tl-year-tick-strong' : 'tl-month-tick');
        if (isJan) mkLabel(x, String(yr), 'tl-year-label');
        else       mkLabel(x, MONTH_LABELS_SHORT[mo], 'tl-month-label');
      }
      mo += 1; if (mo > 11) { mo = 0; yr += 1; }
      ms = Date.UTC(yr, mo, 1);
    }
    return;
  }

  if (palier === 'month') {
    // Trait fin chaque jour, trait fort au 1er du mois.
    const dayMs = 86400000;
    let ms = Math.ceil(range.startMs / dayMs) * dayMs;
    while (ms <= range.endMs) {
      const d = new Date(ms);
      const isFirst = (d.getUTCDate() === 1);
      const x = mkTick(ms, isFirst ? 'tl-year-tick-strong' : 'tl-day-tick');
      if (isFirst) mkLabel(x, MONTH_LABELS_SHORT[d.getUTCMonth()] + ' ' + d.getUTCFullYear(), 'tl-month-label');
      else if (d.getUTCDate() % 5 === 0) mkLabel(x, String(d.getUTCDate()), 'tl-day-label');
      ms += dayMs;
    }
    return;
  }

  if (palier === 'day') {
    // Trait fin chaque heure, trait fort à minuit (jour).
    const hourMs = 3600000;
    let ms = Math.ceil(range.startMs / hourMs) * hourMs;
    while (ms <= range.endMs) {
      const d = new Date(ms);
      const isMidnight = (d.getUTCHours() === 0);
      const x = mkTick(ms, isMidnight ? 'tl-year-tick-strong' : 'tl-hour-tick');
      if (isMidnight) mkLabel(x, d.getUTCDate() + ' ' + MONTH_LABELS_SHORT[d.getUTCMonth()], 'tl-month-label');
      else if (d.getUTCHours() % 3 === 0) mkLabel(x, String(d.getUTCHours()).padStart(2,'0') + 'h', 'tl-hour-label');
      ms += hourMs;
    }
    return;
  }

  if (palier === 'hour') {
    // Trait fin tous les 10 min, trait fort chaque heure pile.
    const stepMs = 10 * 60000;
    let ms = Math.ceil(range.startMs / stepMs) * stepMs;
    while (ms <= range.endMs) {
      const d = new Date(ms);
      const isHour = (d.getUTCMinutes() === 0);
      const x = mkTick(ms, isHour ? 'tl-year-tick-strong' : 'tl-hour-tick');
      if (isHour) mkLabel(x, String(d.getUTCHours()).padStart(2,'0') + 'h', 'tl-hour-label');
      else mkLabel(x, ':' + String(d.getUTCMinutes()).padStart(2,'0'), 'tl-day-label');
      ms += stepMs;
    }
    return;
  }

  if (palier === 'subhour') {
    // Trait fin chaque minute, trait fort toutes les 5 min.
    const stepMs = 60000;
    let ms = Math.ceil(range.startMs / stepMs) * stepMs;
    while (ms <= range.endMs) {
      const d = new Date(ms);
      const isFive = (d.getUTCMinutes() % 5 === 0);
      const x = mkTick(ms, isFive ? 'tl-year-tick-strong' : 'tl-hour-tick');
      if (isFive) mkLabel(x, String(d.getUTCHours()).padStart(2,'0') + 'h' + String(d.getUTCMinutes()).padStart(2,'0'), 'tl-hour-label');
      ms += stepMs;
    }
    return;
  }
}

function drawTimeline() {
  const svgEl = document.getElementById('timeline');
  if (!svgEl) return;
  svgEl.innerHTML = '';
  const range = timelineRange();

  // Bandes signes alternées + glyphes à gauche + séparateurs horizontaux.
  // Avec zoom vertical, on ne rend que les signes dont la plage [i*30, (i+1)*30]
  // chevauche la fenêtre visible [startLon, endLon]. Glyphe centré sur la
  // part visible du signe (plus honnête quand on ne voit qu'un bout).
  const lr = lonRange();
  for (let i = 0; i < 12; i++) {
    const signStartLon = i * 30;
    const signEndLon   = (i + 1) * 30;
    if (signEndLon <= lr.startLon || signStartLon >= lr.endLon) continue;
    const visibleStart = Math.max(signStartLon, lr.startLon);
    const visibleEnd   = Math.min(signEndLon,   lr.endLon);
    const y1 = tlY(visibleStart);
    const y2 = tlY(visibleEnd);
    const h  = y2 - y1;
    if (i % 2 === 0) {
      svgEl.appendChild(svg('rect', {
        x: TL_MARGIN_L, y: y1, width: TL_PLOT_W, height: h,
        class: 'tl-sign-band',
      }));
    }
    // Glyphe au centre de la part visible, pour rester lisible même quand
    // on zoome fort et qu'on ne voit qu'un fragment de signe.
    const glyphLon = (visibleStart + visibleEnd) / 2;
    svgEl.appendChild(svg('text', {
      x: TL_MARGIN_L - 10, y: tlY(glyphLon),
      class: 'tl-sign-glyph',
    }, SIGN_GLYPHS[i]));
    // Séparateur à la frontière haute du signe (si elle est visible)
    if (signStartLon >= lr.startLon && signStartLon <= lr.endLon) {
      svgEl.appendChild(svg('line', {
        x1: TL_MARGIN_L, y1, x2: TL_MARGIN_L + TL_PLOT_W, y2: y1,
        class: 'tl-sign-sep',
      }));
    }
  }
  svgEl.appendChild(svg('line', {
    x1: TL_MARGIN_L, y1: TL_MARGIN_T + TL_PLOT_H,
    x2: TL_MARGIN_L + TL_PLOT_W, y2: TL_MARGIN_T + TL_PLOT_H,
    class: 'tl-sign-sep',
  }));

  // Grille V densifiée selon palier — rend le pan V perceptible aux crans
  // étroits (hour/subhour) où attendre le prochain signe reviendrait à
  // paner sans aucun retour visuel.
  drawVerticalGrid(svgEl, lr, currentPalier());

  // Graduation H par palier — palier courant + 1 cran parent (plan v1 P1).
  // Chaque palier a sa propre règle : traits fins au cran courant, traits
  // épais + label au cran parent. Pas d'empilement multi-strates : la
  // graduation varie ontologiquement avec le palier, pas en continu.
  drawPalierGrid(svgEl, range, currentPalier());

  // Courbes des planètes lentes. Path coupé à chaque saut > 180°
  // (traversée 0°/360°) pour éviter les cordes qui traversent le plot.
  // Glyphes masqués par défaut, apparaissent au clic sur la courbe (toggle via
  // state.timeline.visibleGlyphs). Hit-path transparent plus large pour
  // faciliter le tap tactile sur une courbe fine.
  if (!state.timeline.visibleGlyphs) state.timeline.visibleGlyphs = new Set();
  const curves = sampleSlowCurves();
  for (const c of curves) {
    if (c.points.length < 2) continue;
    let d = '';
    let prevLon = null;
    let prevInside = false;
    for (const pt of c.points) {
      const lonN = normDeg(pt.lon);
      const inside = (lonN >= lr.startLon && lonN <= lr.endLon);
      if (!inside) {
        prevLon = pt.lon;
        prevInside = false;
        continue;
      }
      const x = tlX(jdToMs(pt.jd), range);
      const y = tlY(pt.lon);
      if (!prevInside || prevLon == null || Math.abs(pt.lon - prevLon) > 180) {
        d += `M${x.toFixed(1)},${y.toFixed(1)} `;
      } else {
        d += `L${x.toFixed(1)},${y.toFixed(1)} `;
      }
      prevLon = pt.lon;
      prevInside = true;
    }
    svgEl.appendChild(svg('path', { d, class: `tl-curve tl-curve-${c.key}` }));
    const hit = svg('path', { d, class: 'tl-curve-hit' });
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.timeline.visibleGlyphs.has(c.key)) {
        state.timeline.visibleGlyphs.delete(c.key);
      } else {
        state.timeline.visibleGlyphs.add(c.key);
      }
      drawTimeline();
    });
    svgEl.appendChild(hit);
    if (state.timeline.visibleGlyphs.has(c.key)) {
      // Glyphe placé à la position de la planète au moment du curseur
      // (chartTime), ou à défaut au dernier point visible dans la fenêtre.
      const cursorMs = state.chartTime != null ? state.chartTime : Date.now();
      const targetJd = msToJd(cursorMs);
      let anchor = null;
      let bestDt = Infinity;
      for (const pt of c.points) {
        const dt = Math.abs(pt.jd - targetJd);
        if (dt < bestDt) { bestDt = dt; anchor = pt; }
      }
      if (anchor) {
        svgEl.appendChild(svg('text', {
          x: tlX(jdToMs(anchor.jd), range) + 2, y: tlY(anchor.lon),
          class: `tl-curve-glyph tl-curve-${c.key}`,
        }, c.glyph));
      }
    }
  }

  // Items scrapbook : segments horizontaux de createdAt à retiredAt (ou
  // à endMs si toujours vivant). Un item n'est pas un instant mais une
  // durée d'existence — tant qu'il n'a pas été retiré il "occupe" la vie
  // du natif. Hauteur dérivée de la taille width/height de l'item dans la
  // roue (approximation : width → arc écliptique au rayon moyen → degrés
  // de longitude span). En attendant le zoom qui transformera chaque rect
  // en <foreignObject> miniature avec le contenu réel manipulable.
  if (TL_SHOW_SCRAPS && state.layers.scrapbook) {
    for (const it of state.scrapbook) {
      // Items scope='natal' sont hors frise : lieu permanent du natal,
      // pas de dimension temporelle à afficher. Les items legacy sans scope
      // sont 'timed' par défaut (comportement d'avant la refonte préservé).
      if ((it.scope || 'timed') === 'natal') continue;
      if (it.lon == null || it.createdAt == null) continue;
      if (it.createdAt > range.endMs) continue;
      // Skip si longitude hors fenêtre visible (zoom vertical).
      const lonN = normDeg(it.lon);
      if (lonN < lr.startLon || lonN > lr.endLon) continue;
      // Pas de filtre isItemVisibleAt ici : la frise montre la vie entière
      // de chaque item. Le curseur chartTime n'est qu'un œilleton
      // d'observation pour la roue, il ne masque pas les segments de la
      // frise.
      // Items ponctuels (retiredAt == createdAt) : leur largeur temporelle
      // naturelle est zéro → rect invisible. On leur donne une largeur
      // visuelle en durée ABSOLUE (1 mois), centrée sur createdAt. Comme
      // ça la largeur apparente grossit/rétrécit avec le zoom temporel —
      // on peut zoomer H pour « plonger » dans un ponctuel. (Perig
      // 2026-10-19 : "un rect, juste un, avec tout le contenu".)
      const POINT_HALF_W_MS = 15 * 86400000; // 15 jours → rect ~ 1 mois
      const isPoint = (it.retiredAt != null && it.retiredAt === it.createdAt);
      let drawStartMs, drawEndMs;
      if (isPoint) {
        drawStartMs = it.createdAt - POINT_HALF_W_MS;
        drawEndMs   = it.createdAt + POINT_HALF_W_MS;
      } else {
        drawStartMs = Math.max(it.createdAt, range.startMs);
        drawEndMs = (it.retiredAt != null && it.retiredAt <= range.endMs)
          ? it.retiredAt
          : range.endMs;
        if (drawEndMs <= drawStartMs) drawEndMs = drawStartMs + 1;
      }
      const x1 = tlX(drawStartMs, range);
      const x2 = tlX(drawEndMs,   range);
      // Hauteur = span lon de l'item (dérivé de width/radius) rapporté au
      // span lon visible. Grossit naturellement avec le zoom vertical.
      const cx = it.x + it.width / 2;
      const cy = it.y + it.height / 2;
      const radius = Math.max(50, Math.hypot(cx, cy));
      const spanDeg = (it.width / radius) * (180 / Math.PI);
      const h = Math.max(2.5, (spanDeg / lr.span) * TL_PLOT_H);
      const w = Math.max(2, x2 - x1);
      const y = tlY(lonN) - h / 2;
      const rect = svg('rect', {
        x: x1, y, width: w, height: h, rx: 1.5,
        class: 'tl-scrap-seg', 'data-id': it.id,
      });
      // Clic sur le rect → rouvre l'éditeur sur cet item (re-édition).
      // L'éditeur apparaît sous le point cliqué, pas au centre du rect,
      // pour que le geste reste localisé.
      rect.addEventListener('click', (e) => {
        e.stopPropagation();
        openTimelineEditor(it, e.clientX, e.clientY);
      });
      svgEl.appendChild(rect);
      // Contenu via foreignObject : titre (1ère ligne, plus gros) + corps.
      // Pointer-events désactivés sur le contenu pour que le clic traverse
      // vers le rect en-dessous (évite d'avoir à dupliquer le handler).
      if (it.text && w > 10 && h > 10) {
        const fo = svg('foreignObject', {
          x: x1, y, width: w, height: h, 'data-id': it.id,
        });
        fo.classList.add('tl-scrap-fo');
        const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        div.setAttribute('class', 'tl-scrap-content');
        const lines = (it.text || '').split('\n');
        const title = lines[0] || '';
        const body  = lines.slice(1).join('\n').trim();
        if (title) {
          const t = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
          t.setAttribute('class', 'tl-scrap-title');
          t.textContent = title;
          div.appendChild(t);
        }
        if (body) {
          const b = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
          b.setAttribute('class', 'tl-scrap-body');
          b.textContent = body;
          div.appendChild(b);
        }
        fo.appendChild(div);
        svgEl.appendChild(fo);
      }
    }
  }

  // Jalons (dates fondatrices chargées depuis content/jalons.json) : barre
  // verticale pleine hauteur + label vertical en haut + hit-rect large.
  // Cliquer sur un jalon y pose le curseur chartTime (dual du clic
  // "maintenant"). Granularité par catégorie viendra plus tard — pour l'instant
  // toggle global via state.layers.jalons.
  if (state.layers.jalons && state.jalons.length) {
    for (const j of state.jalons) {
      if (j.createdAt < range.startMs || j.createdAt > range.endMs) continue;
      const xj = tlX(j.createdAt, range);
      svgEl.appendChild(svg('line', {
        x1: xj, y1: TL_MARGIN_T, x2: xj, y2: TL_MARGIN_T + TL_PLOT_H,
        class: 'tl-jalon',
      }));
      if (j.label) {
        const t = svg('text', {
          x: xj, y: TL_MARGIN_T + 4,
          class: 'tl-jalon-label',
          transform: `rotate(-90 ${xj} ${TL_MARGIN_T + 4})`,
        }, j.label);
        svgEl.appendChild(t);
      }
      const hit = svg('rect', {
        x: xj - 8, y: TL_MARGIN_T, width: 16, height: TL_PLOT_H,
        class: 'tl-jalon-hit',
        'data-id': j.id,
      });
      if (j.note) {
        const title = svg('title', {}, j.note);
        hit.appendChild(title);
      }
      hit.addEventListener('click', (e) => {
        e.stopPropagation();
        state.chartTime = j.createdAt;
        render().catch(err => showError('render error: ' + err.message));
      });
      svgEl.appendChild(hit);
    }
  }

  // Barre "maintenant" verticale persistante, cliquable pour retourner au
  // présent (= state.chartTime = null, suivi temps réel). Toujours dessinée
  // tant que now est dans la fenêtre visible — permet de distinguer d'un
  // coup d'œil où est le présent même quand le curseur chartTime en est
  // loin. Hit-rect transparent large pour tap mobile facile.
  const nowMs = Date.now();
  if (nowMs >= range.startMs && nowMs <= range.endMs) {
    const xNow = tlX(nowMs, range);
    svgEl.appendChild(svg('line', {
      x1: xNow, y1: TL_MARGIN_T, x2: xNow, y2: TL_MARGIN_T + TL_PLOT_H,
      class: 'tl-now',
    }));
    const hit = svg('rect', {
      x: xNow - 10, y: TL_MARGIN_T, width: 20, height: TL_PLOT_H,
      class: 'tl-now-hit',
    });
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      state.chartTime = null;
      render().catch(err => showError('render error: ' + err.message));
    });
    svgEl.appendChild(hit);
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

  // Poignée triangulaire (HTML overlay) : repositionnée en CSS px à chaque
  // re-render de la frise. Évite de reposer les gestes de drag sur le fond.
  updateTimelineHandlePosition();
}

// Interactions frise :
//  - 1 doigt / clic gauche drag sur le fond → pan de la vue (tlCenter).
//    N'affecte PAS chartTime : la roue reste figée pendant l'exploration.
//  - drag de la poignée triangulaire (#timeline-handle) → chartTime live
//    (seul vecteur pour recalculer la roue), évite les triggers accidentels.
//  - molette → zoom temporel.
//  - 2 doigts (mobile) → zoom (écart) + pan (milieu) simultanés.
//  - clic milieu drag (desktop) → pan (redondant avec 1 doigt, inoffensif).
// Pan = déplacement de state.timeline.tlCenter, indépendant de chartTime.
function wireTimelineInteraction() {
  const svgEl = document.getElementById('timeline');
  if (!svgEl) return;
  const svgXFromClient = (clientX) => {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = 0;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse()).x;
  };
  const svgYFromClient = (clientY) => {
    const pt = svgEl.createSVGPoint();
    pt.x = 0; pt.y = clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse()).y;
  };
  const pickTime = (clientX) => {
    const range = timelineRange();
    const t01 = (svgXFromClient(clientX) - TL_MARGIN_L) / TL_PLOT_W;
    return range.startMs + t01 * (range.endMs - range.startMs);
  };
  let isPinching = false;
  let tlRaf = null;
  const scheduleTimelineRender = () => {
    if (tlRaf != null) return;
    tlRaf = requestAnimationFrame(() => {
      tlRaf = null;
      try { drawTimeline(); } catch (e) { showError('timeline error: ' + e.message); }
    });
  };
  const ensureTl = () => { if (!state.timeline) state.timeline = { palier: 'day' }; };

  // Pan : 1 doigt / clic gauche / clic milieu — tous font pareil (pan).
  // Bi-axe (P1 2026-10-22) : glissement en X déplace tlCenter, glissement en Y
  // déplace vCenter. Un seul geste, intuition « carte à défiler ».
  let panStartClientX = null;
  let panStartClientY = null;
  let panStartCenter  = null;
  let panStartVCenter = null;

  // Cloisonnement : pointer events pour desktop (mouse/pen) UNIQUEMENT.
  // Pour les touches, on laisse les Touch Events gérer, parce que la
  // coexistence pointerdown+setPointerCapture avec touchstart/touchmove à
  // 2 doigts cause des interférences sur Chrome Android (le browser peut
  // ne pas générer les touchevents attendus quand le 2e doigt arrive si le
  // 1er est déjà "capturé"). Perig 2026-10-20 : "pinch capricieux H et V".
  svgEl.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'touch') return;
    if (isPinching) return;
    ev.preventDefault();
    svgEl.setPointerCapture(ev.pointerId);
    const range = timelineRange();
    const lr = lonRange();
    panStartClientX = ev.clientX;
    panStartClientY = ev.clientY;
    panStartCenter  = state.timeline?.tlCenter != null
      ? state.timeline.tlCenter
      : (range.startMs + range.endMs) / 2;
    panStartVCenter = state.timeline?.vCenter != null
      ? state.timeline.vCenter
      : (lr.startLon + lr.endLon) / 2;
  });
  svgEl.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    if (panStartClientX == null || isPinching) return;
    const range = timelineRange();
    const lr = lonRange();
    const dxSvg = svgXFromClient(ev.clientX) - svgXFromClient(panStartClientX);
    const dySvg = svgYFromClient(ev.clientY) - svgYFromClient(panStartClientY);
    const msPerSvg = (range.endMs - range.startMs) / TL_PLOT_W;
    const degPerSvg = lr.span / TL_PLOT_H;
    ensureTl();
    state.timeline.tlCenter = panStartCenter - dxSvg * msPerSvg;
    state.timeline.vCenter  = panStartVCenter - dySvg * degPerSvg;
    scheduleTimelineRender();
  });
  const stop = () => {
    panStartClientX = null;
    panStartClientY = null;
    panStartCenter  = null;
    panStartVCenter = null;
  };
  svgEl.addEventListener('pointerup',     stop);
  svgEl.addEventListener('pointercancel', stop);
  svgEl.addEventListener('pointerleave',  stop);
  // auxclick bouton milieu : empêche l'icône "scroll auto" sur certains browsers
  svgEl.addEventListener('auxclick', ev => { if (ev.button === 1) ev.preventDefault(); });

  // Molette (desktop) = bascule palier discret. deltaY<0 (molette vers le
  // haut) = zoom plus fin (palier↑). Petit throttle pour éviter de sauter
  // plusieurs paliers d'un seul coup de molette.
  let lastWheelMs = 0;
  svgEl.addEventListener('wheel', ev => {
    ev.preventDefault();
    const now = performance.now();
    if (now - lastWheelMs < 180) return;
    lastWheelMs = now;
    setPalier(ev.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  // 2 doigts : pinch décomposé en composantes horizontale et verticale,
  // appliquées simultanément. |Δx| pilote le zoom temporel, |Δy| pilote le
  // zoom vertical (dans la frise). Pan ancré sur les deux axes : le point
  // temporel sous le milieu-X et la longitude sous le milieu-Y restent
  // sous les mêmes coordonnées pendant tout le geste. (Perig 2026-10-19 :
  // "pinch horizontal agrandit le temps, pinch vertical agrandit dedans".)
  const pickLon = (clientY) => {
    const t01 = (svgYFromClient(clientY) - TL_MARGIN_T) / TL_PLOT_H;
    const { startLon, span } = lonRange();
    return normDeg(startLon + t01 * span);
  };
  let pinchStartDistX  = null;
  let pinchStartDistY  = null;
  let pinchStartZoom   = null;
  let pinchStartVZoom  = null;
  let pinchAnchorMs    = null;
  let pinchAnchorLon   = null;
  // Pinch discret (P1 2026-10-22) : au relâchement, si le ratio hypoténuse
  // final/initial dépasse un seuil, on bascule d'un cran de palier (± selon
  // écart/resserrement). Pas de zoom continu — un pinch = un cran, point.
  // Seuils 1.3 / 0.77 (= 1/1.3) : évite les déclenchements au bruit de main.
  let discretePinchStartHypot = null;
  let discretePinchLastHypot  = null;
  const DISCRETE_PINCH_UP   = 1.3;
  const DISCRETE_PINCH_DOWN = 1 / 1.3;
  // Seuil d'activation d'axe : si l'écart initial des doigts sur un axe est
  // en-dessous, cet axe est "mort" (ratio forcé à 1) — on ignore le zoom sur
  // cet axe plutôt que de l'amplifier n'importe comment. Perig 2026-10-20 :
  // le plancher précédent `max(30, dist)` sur distX ET sur pinchStartDistX
  // créait une zone morte où rX restait à 30/30 = 1.00 permanent (pinch H
  // bloqué quand les doigts commençaient serrés). On garde juste un plancher
  // de 1 sur pinchStartDist pour éviter /0.
  const PINCH_AXIS_DEADZONE = 20;
  // IMPORTANT : les listeners touch sont attachés sur WINDOW (pas svgEl),
  // parce que sur Chrome Android, un touchmove dont le target est un enfant
  // SVG (ex: <rect> d'un item scrapbook ou d'un tick) ne bubble pas
  // fiablement jusqu'au svgEl parent — on recevait moveN=1 alors que
  // docMove=52 (symptôme capturé 2026-10-20 : "le pinch bloque dès que les
  // doigts touchent un rect"). En écoutant sur window on reçoit tous les
  // touchmove peu importe la target ; le filtre `pinchStartDistX != null`
  // garantit qu'on ne réagit qu'aux gestes qui ont démarré sur svgEl via
  // le touchstart ci-dessous (lui attaché à svgEl pour la détection initiale).
  svgEl.addEventListener('touchstart', ev => {
    debugPinch.touches = ev.touches.length;
    if (ev.touches.length >= 2) {
      isPinching = true;
      panStartClientX = null;
      panStartCenter  = null;
      const t0 = ev.touches[0], t1 = ev.touches[1];
      // État commun à continu/discret : on l'enregistre toujours ; les
      // modes consomment différemment (continu = move en direct ; discret =
      // ratio au touchend).
      pinchStartDistX = Math.max(1, Math.abs(t0.clientX - t1.clientX));
      pinchStartDistY = Math.max(1, Math.abs(t0.clientY - t1.clientY));
      pinchStartZoom  = state.timeline?.zoom  || 1;
      pinchStartVZoom = state.timeline?.vZoom || 1;
      pinchAnchorMs   = pickTime((t0.clientX + t1.clientX) / 2);
      pinchAnchorLon  = pickLon ((t0.clientY + t1.clientY) / 2);
      discretePinchStartHypot = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      discretePinchLastHypot  = discretePinchStartHypot;
      debugPinch.startDistX = pinchStartDistX.toFixed(0);
      debugPinch.startDistY = pinchStartDistY.toFixed(0);
      debugPinch.lastEvent = 'start-pinch';
      debugPinch.moveCount = 0;
      debugPinch.t0x = t0.clientX.toFixed(0);
      debugPinch.t0y = t0.clientY.toFixed(0);
      debugPinch.t1x = t1.clientX.toFixed(0);
      debugPinch.t1y = t1.clientY.toFixed(0);
      updateDebugPinch();
      ev.preventDefault();
    } else if (ev.touches.length === 1 && !isPinching) {
      // Pan 1 doigt bi-axe (P1 2026-10-22) via Touch Events.
      const t0 = ev.touches[0];
      const range = timelineRange();
      const lr = lonRange();
      panStartClientX = t0.clientX;
      panStartClientY = t0.clientY;
      panStartCenter  = state.timeline?.tlCenter != null
        ? state.timeline.tlCenter
        : (range.startMs + range.endMs) / 2;
      panStartVCenter = state.timeline?.vCenter != null
        ? state.timeline.vCenter
        : (lr.startLon + lr.endLon) / 2;
      debugPinch.lastEvent = 'start-pan';
      updateDebugPinch();
      ev.preventDefault();
    }
  }, { passive: false });
  // capture:true pour recevoir en phase de descente, AVANT qu'un éventuel
  // handler intermédiaire (quelque part entre target et window) ne fasse
  // stopPropagation. Perig 2026-10-20 : docMove=89 en capture document mais
  // moveN=1 en bubble window — preuve qu'un stopPropagation existe quelque
  // part invisible dans mes greps (lib externe ? browser interne ?).
  window.addEventListener('touchmove', ev => {
    debugPinch.winAll++;
    debugPinch.winAllTouches = ev.touches.length;
    // Filtre : ne traiter que les gestes qui ont démarré sur svgEl.
    if (pinchStartDistX == null && panStartClientX == null) {
      debugPinch.winRejected++;
      debugPinch.lastReject = 'no-start';
      updateDebugPinch();
      return;
    }
    debugPinch.winPassed++;
    debugPinch.touches = ev.touches.length;
    if (ev.touches.length >= 2 && pinchStartDistX != null && !(PINCH_H_ENABLED || PINCH_V_ENABLED)) {
      // Mode discret seul : on garde juste l'écart final en mémoire pour le
      // juger au touchend. preventDefault pour bloquer le pinch-zoom du
      // navigateur pendant qu'on compose notre geste.
      const t0 = ev.touches[0], t1 = ev.touches[1];
      discretePinchLastHypot = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      debugPinch.lastEvent = 'move-pinch-discret';
      debugPinch.moveCount++;
      updateDebugPinch();
      ev.preventDefault();
      return;
    }
    if (ev.touches.length >= 2 && pinchStartDistX != null && (PINCH_H_ENABLED || PINCH_V_ENABLED)) {
      const t0 = ev.touches[0], t1 = ev.touches[1];
      const distX = Math.abs(t0.clientX - t1.clientX);
      const distY = Math.abs(t0.clientY - t1.clientY);
      discretePinchLastHypot = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      // Axe mort si l'écart initial est trop petit (geste trop serré sur cet
      // axe pour être lu fiablement). Évite l'amplification du bruit sans
      // bloquer le pinch comme le faisait l'ancien plancher `max(30, dist)`.
      const ratioX = pinchStartDistX < PINCH_AXIS_DEADZONE ? 1 : distX / pinchStartDistX;
      const ratioY = pinchStartDistY < PINCH_AXIS_DEADZONE ? 1 : distY / pinchStartDistY;
      const nextZoom  = Math.max(TL_ZOOM_MIN,   Math.min(TL_ZOOM_MAX,   pinchStartZoom  * ratioX));
      const nextVZoom = Math.max(TL_V_ZOOM_MIN, Math.min(TL_V_ZOOM_MAX, pinchStartVZoom * ratioY));
      ensureTl();
      state.timeline.zoom  = nextZoom;
      state.timeline.vZoom = nextVZoom;

      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

      // Pan ancré horizontal : pinchAnchorMs reste sous le milieu-X.
      const svgMidX = svgXFromClient(midX);
      const t01X = (svgMidX - TL_MARGIN_L) / TL_PLOT_W;
      const full = fullTimelineRange();
      const visibleTimeSpan = (full.endMs - full.startMs) / nextZoom;
      const newStartMs = pinchAnchorMs - t01X * visibleTimeSpan;
      state.timeline.tlCenter = newStartMs + visibleTimeSpan / 2;

      // Pan ancré vertical : pinchAnchorLon reste sous le milieu-Y.
      // Clamp vCenter pour que la fenêtre reste dans [0, 360].
      const svgMidY = svgYFromClient(midY);
      const t01Y = (svgMidY - TL_MARGIN_T) / TL_PLOT_H;
      const visibleLonSpan = 360 / nextVZoom;
      const halfSpan = visibleLonSpan / 2;
      const newStartLon = pinchAnchorLon - t01Y * visibleLonSpan;
      const newCenterLon = newStartLon + halfSpan;
      state.timeline.vCenter = Math.max(halfSpan, Math.min(360 - halfSpan, newCenterLon));

      debugPinch.distX = distX.toFixed(0);
      debugPinch.distY = distY.toFixed(0);
      debugPinch.ratioX = ratioX.toFixed(2);
      debugPinch.ratioY = ratioY.toFixed(2);
      debugPinch.lastEvent = 'move-pinch';
      debugPinch.moveCount++;
      debugPinch.t0x = t0.clientX.toFixed(0);
      debugPinch.t0y = t0.clientY.toFixed(0);
      debugPinch.t1x = t1.clientX.toFixed(0);
      debugPinch.t1y = t1.clientY.toFixed(0);
      updateDebugPinch();
      scheduleTimelineRender();
      ev.preventDefault();
    } else if (ev.touches.length === 1 && panStartClientX != null && !isPinching) {
      // Pan 1 doigt bi-axe (P1 2026-10-22) via Touch Events.
      const t0 = ev.touches[0];
      const range = timelineRange();
      const lr = lonRange();
      const dxSvg = svgXFromClient(t0.clientX) - svgXFromClient(panStartClientX);
      const dySvg = svgYFromClient(t0.clientY) - svgYFromClient(panStartClientY);
      const msPerSvg = (range.endMs - range.startMs) / TL_PLOT_W;
      const degPerSvg = lr.span / TL_PLOT_H;
      ensureTl();
      state.timeline.tlCenter = panStartCenter - dxSvg * msPerSvg;
      state.timeline.vCenter  = panStartVCenter - dySvg * degPerSvg;
      debugPinch.lastEvent = 'move-pan';
      updateDebugPinch();
      scheduleTimelineRender();
      ev.preventDefault();
    }
  }, { passive: false, capture: true });
  const endPinch = ev => {
    debugPinch.touches = ev.touches ? ev.touches.length : 0;
    debugPinch.lastEvent = 'end (' + ev.type + ')';
    updateDebugPinch();
    if (!ev.touches || ev.touches.length < 2) {
      // Pinch discret : si le ratio hypoténuse final/initial a dépassé un
      // seuil, appliquer un cran de palier et une seule fois.
      if (discretePinchStartHypot != null && discretePinchLastHypot != null) {
        const ratio = discretePinchLastHypot / discretePinchStartHypot;
        if (ratio >= DISCRETE_PINCH_UP) {
          setPalier(+1);
        } else if (ratio <= DISCRETE_PINCH_DOWN) {
          setPalier(-1);
        }
      }
      discretePinchStartHypot = null;
      discretePinchLastHypot  = null;
      pinchStartDistX  = null;
      pinchStartDistY  = null;
      pinchStartZoom   = null;
      pinchStartVZoom  = null;
      pinchAnchorMs    = null;
      pinchAnchorLon   = null;
      setTimeout(() => { isPinching = false; updateDebugPinch(); }, 100);
    }
    if (!ev.touches || ev.touches.length === 0) {
      panStartClientX = null;
      panStartClientY = null;
      panStartCenter  = null;
      panStartVCenter = null;
    }
  };
  // touchend/cancel sur window pour symétrie avec touchmove (sinon le state
  // reste bloqué si le doigt est relâché au-dessus d'un rect enfant).
  window.addEventListener('touchend',    endPinch);
  window.addEventListener('touchcancel', endPinch);

  // Boutons bascule palier (P1 2026-10-22). − = plus large, + = plus fin.
  const btnPrev = document.getElementById('timeline-palier-prev');
  const btnNext = document.getElementById('timeline-palier-next');
  if (btnPrev) btnPrev.addEventListener('click', () => setPalier(-1));
  if (btnNext) btnNext.addEventListener('click', () => setPalier(+1));
  updatePalierLabel();

  // Panneau debug : affiché quand ?debug=pinch dans l'URL. Permet à Perig
  // de voir en live ce qui se passe quand "ça rate" sur mobile. Bouton 📋
  // copie l'état courant dans le presse-papier (Perig fait son pinch, pose
  // les doigts, tape COPY, colle les valeurs dans le chat).
  const debugPinch = {
    touches: 0, startDistX: '-', startDistY: '-',
    distX: '-', distY: '-', ratioX: '-', ratioY: '-',
    lastEvent: '-', moveCount: 0, docMoveCount: 0,
    t0x: '-', t0y: '-', t1x: '-', t1y: '-',
    docTarget: '-',
    winAll: 0, winAllTouches: '-', winPassed: 0, winRejected: 0, lastReject: '-',
  };
  let debugTextEl = null;
  const debugEnabled = /[?&]debug=pinch\b/.test(location.search);
  if (debugEnabled) {
    // Listener global en capture pour compter TOUS les touchmove reçus
    // par le document, même ceux qui n'arrivent pas au svgEl. Permet de
    // distinguer : "le browser n'émet qu'un touchmove" (docMove=1 aussi)
    // vs "un autre handler les intercepte avant svgEl" (docMove > move).
    document.addEventListener('touchmove', (ev) => {
      debugPinch.docMoveCount++;
      debugPinch.docTarget = ev.target
        ? (ev.target.id || ev.target.tagName || '?')
        : '?';
      updateDebugPinch();
    }, { capture: true, passive: true });
  }
  if (debugEnabled) {
    const wrap = document.createElement('div');
    wrap.id = 'debug-pinch';
    debugTextEl = document.createElement('div');
    debugTextEl.id = 'debug-pinch-text';
    const copyBtn = document.createElement('button');
    copyBtn.id = 'debug-pinch-copy';
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', async () => {
      const txt = debugTextEl.textContent;
      let ok = false;
      // Clipboard API : refuse en contexte non-sécurisé (HTTP via Tailscale).
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(txt); ok = true; }
        catch (e) { ok = false; }
      }
      // Fallback : textarea invisible + execCommand('copy'). Deprecated mais
      // marche sur HTTP, nécessite que l'élément source soit focusable et
      // sélectionné dans la même tick synchrone que l'execCommand.
      if (!ok) {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.top = '0'; ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
      }
      copyBtn.textContent = ok ? '✓' : '✗';
      setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
    });
    wrap.appendChild(debugTextEl);
    wrap.appendChild(copyBtn);
    document.body.appendChild(wrap);
  }
  function updateDebugPinch() {
    if (!debugTextEl) return;
    const z  = state.timeline?.zoom  || 1;
    const vz = state.timeline?.vZoom || 1;
    const full = fullTimelineRange();
    const msPerPx = (full.endMs - full.startMs) / z / TL_PLOT_W;
    const dayPx  = (86400000 / msPerPx).toFixed(1);
    const hourPx = (3600000  / msPerPx).toFixed(1);
    // Format multi-ligne : chaque ligne tient sur un écran de téléphone.
    debugTextEl.textContent =
      'touches=' + debugPinch.touches
      + ' isPinch=' + (isPinching ? 'Y' : 'N')
      + ' panStart=' + (panStartClientX != null ? 'Y' : 'N')
      + '\nevent=' + debugPinch.lastEvent + ' moveN=' + debugPinch.moveCount
      + ' docMove=' + debugPinch.docMoveCount
      + '\ndocTarget=' + debugPinch.docTarget
      + '\nt0=(' + debugPinch.t0x + ',' + debugPinch.t0y + ')'
      + ' t1=(' + debugPinch.t1x + ',' + debugPinch.t1y + ')'
      + '\nzoom=' + z.toFixed(1) + ' vZoom=' + vz.toFixed(2)
      + '\ndX0=' + debugPinch.startDistX + ' dY0=' + debugPinch.startDistY
      + '\ndX=' + debugPinch.distX + ' dY=' + debugPinch.distY
      + '\nrX=' + debugPinch.ratioX + ' rY=' + debugPinch.ratioY
      + '\ndayPx=' + dayPx + ' hourPx=' + hourPx
      + '\nwinAll=' + debugPinch.winAll + ' winT=' + debugPinch.winAllTouches
      + ' pass=' + debugPinch.winPassed + ' rej=' + debugPinch.winRejected
      + '\nlastRej=' + debugPinch.lastReject;
  }
}

// Position de la poignée en CSS px dans son conteneur. Appelée depuis
// drawTimeline (après chaque re-render frise) et au resize fenêtre.
function updateTimelineHandlePosition() {
  const handleEl    = document.getElementById('timeline-handle');
  const containerEl = document.getElementById('timeline-container');
  if (!handleEl || !containerEl) return;
  const cursorMs = state.chartTime != null ? state.chartTime : Date.now();
  const range    = timelineRange();
  // La poignée reste visible même hors fenêtre : si on pan loin du présent
  // elle disparaît (sinon elle "pousse" visuellement sur le bord). On la
  // garde présente dans le DOM pour que la ref soit stable.
  if (cursorMs < range.startMs || cursorMs > range.endMs) {
    handleEl.classList.add('out-of-view');
  } else {
    handleEl.classList.remove('out-of-view');
    const cursorSvgX = tlX(cursorMs, range);
    const cssX = cursorSvgX * containerEl.clientWidth / TL_VB_W;
    handleEl.style.left = `${cssX}px`;
  }
}

// Drag de la poignée triangulaire. Pendant le drag, on met à jour chartTime
// mais on ne redessine QUE la frise (curseur + poignée) — la roue reste
// figée. Au relâchement, un unique render() complet recalcule la roue à la
// position finale : fini les cartes intermédiaires arbitraires, dixit Perig.
function wireTimelineHandle() {
  const handleEl    = document.getElementById('timeline-handle');
  const containerEl = document.getElementById('timeline-container');
  if (!handleEl || !containerEl) return;
  let dragging = false;
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
  const pickFromClientX = (clientX) => {
    const rect = containerEl.getBoundingClientRect();
    const relX = clientX - rect.left;
    const svgX = relX * TL_VB_W / rect.width;
    const t01 = (svgX - TL_MARGIN_L) / TL_PLOT_W;
    const range = timelineRange();
    return range.startMs + t01 * (range.endMs - range.startMs);
  };
  handleEl.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    dragging = true;
    handleEl.setPointerCapture(ev.pointerId);
    handleEl.classList.add('dragging');
  });
  handleEl.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const t = pickFromClientX(ev.clientX);
    // Drag libre : la poignée se pose exactement où elle est relâchée,
    // passé ou futur. Pour revenir au présent, cliquer sur la barre
    // "maintenant" verticale persistante dessinée dans drawTimeline().
    state.chartTime = t;
    scheduleTimelineRender();
  });
  const commit = () => {
    if (!dragging) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    scheduleFullRender();
  };
  handleEl.addEventListener('pointerup',     commit);
  handleEl.addEventListener('pointercancel', commit);
  // Resize : la poignée doit se repositionner. drawTimeline couvre déjà,
  // mais le resize ne déclenche pas de redraw naturellement — on l'ajoute.
  window.addEventListener('resize', () => {
    updateTimelineHandlePosition();
  });
}

// Bouton ⤢ : bascule la frise en plein écran (le cercle est masqué).
// Bouton ⤡ : revient à la vue cercle + frise petite. Le top de la frise
// agrandie est calqué sur la hauteur mesurée du header fixe (CSS var).
// Redessine la frise après chaque bascule pour que le SVG se re-dimensionne.
function wireTimelineExpandCollapse() {
  const expandBtn   = document.getElementById('timeline-expand');
  const collapseBtn = document.getElementById('timeline-collapse');
  const header      = document.getElementById('chart-header-fixed');
  if (!expandBtn || !collapseBtn) return;
  const applyHeaderHeight = () => {
    if (!header) return;
    document.documentElement.style.setProperty(
      '--chart-header-h', `${header.offsetHeight}px`,
    );
  };
  const redraw = () => {
    applyHeaderHeight();
    try { drawTimeline(); } catch (e) { showError('timeline error: ' + e.message); }
    updateTimelineHandlePosition();
  };
  expandBtn.addEventListener('click', () => {
    document.body.classList.add('timeline-fullscreen');
    collapseBtn.hidden = false;
    requestAnimationFrame(redraw);
  });
  collapseBtn.addEventListener('click', () => {
    document.body.classList.remove('timeline-fullscreen');
    collapseBtn.hidden = true;
    requestAnimationFrame(redraw);
  });
  window.addEventListener('resize', () => {
    if (document.body.classList.contains('timeline-fullscreen')) redraw();
  });
}

// Double-tap sur la frise agrandie → crée un item scrapbook au moment
// et au signe du tap, et ouvre un petit éditeur in-situ (overlay DOM
// par-dessus le SVG). Enter = commit, Escape ou blur-si-vide = annulation.
// Actif uniquement en mode plein écran (sinon la cible est trop petite
// pour un tap précis — consigne Perig 2026-10-19).
//
// Même garde-fou que sur le cercle (wireScrapbookGestures) : un tap doit être
// *propre* (pas de déplacement > TAP_SLOP_PX), sinon chaque début de pan
// comptait comme un tap et deux coups de doigt rapprochés déclenchaient la
// création. Validation au relâchement du 2e tap, pas au contact.
// Cloisonnement comme le reste de la frise : pointer events pour souris /
// stylet, touch events pour le tactile (le pan tactile de la frise est en
// touch events — on ne présume pas que pointerup arrive après un touchstart
// annulé).
function wireTimelineScrapbookGestures() {
  const svgEl       = document.getElementById('timeline');
  const containerEl = document.getElementById('timeline-container');
  if (!svgEl || !containerEl) return;
  const TAP_SLOP_PX     = 10;   // au-delà : c'est un pan, pas un tap
  const DOUBLE_TAP_MS   = 400;
  const DOUBLE_TAP_DIST = 40;
  let lastTap = 0;
  let lastPt  = null;
  let down    = null;   // { clientX, clientY, vbX, vbY, moved }

  const toSvgCoords = (clientX, clientY) => {
    // preserveAspectRatio="none" sur le SVG : la viewBox est étirée
    // indépendamment en x et y, pas de getScreenCTM piégeux.
    const rect = containerEl.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    return {
      x: relX * TL_VB_W / rect.width,
      y: relY * TL_VB_H / rect.height,
    };
  };
  const inPlot = (pt) => pt.x >= TL_MARGIN_L && pt.x <= TL_MARGIN_L + TL_PLOT_W
                       && pt.y >= TL_MARGIN_T && pt.y <= TL_MARGIN_T + TL_PLOT_H;
  // Ignorer les contrôles interactifs : items existants, courbes planétaires,
  // jalons, poignée temporelle, boutons expand/collapse.
  const onControl = (target) => !!(target && target.closest
    && target.closest(
      '.tl-scrap-seg, .tl-curve, .tl-curve-hit, .tl-jalon-hit, '
      + '#timeline-handle, .timeline-expand-btn, .timeline-collapse-btn, '
      + '.tl-scrap-editor'
    ));

  const beginTap = (clientX, clientY) => {
    // Actif seulement en mode plein écran : la frise petite n'offre pas
    // assez de surface au pouce pour un placement précis.
    if (!document.body.classList.contains('timeline-fullscreen')) return;
    const pt = toSvgCoords(clientX, clientY);
    // Hors zone de plot (marges gauche/droite/haut/bas) : ignorer.
    if (!inPlot(pt)) { lastTap = 0; lastPt = null; down = null; return; }
    down = { clientX, clientY, vbX: pt.x, vbY: pt.y, moved: false };
  };
  const moveTap = (clientX, clientY) => {
    if (!down || down.moved) return;
    if (Math.hypot(clientX - down.clientX, clientY - down.clientY) > TAP_SLOP_PX) {
      down.moved = true;
      lastTap = 0;
      lastPt  = null;
    }
  };
  const endTap = (clientX, clientY) => {
    if (!down) return;
    const wasTap = !down.moved;
    const vbX = down.vbX, vbY = down.vbY;
    down = null;
    if (!wasTap) return;
    const now = Date.now();
    if (now - lastTap < DOUBLE_TAP_MS && lastPt
        && Math.abs(vbX - lastPt.x) < DOUBLE_TAP_DIST
        && Math.abs(vbY - lastPt.y) < DOUBLE_TAP_DIST) {
      // Double-tap confirmé : moyenner et créer.
      const avgX = (vbX + lastPt.x) / 2;
      const avgY = (vbY + lastPt.y) / 2;
      lastTap = 0; lastPt = null;
      createScrapItemOnTimeline(avgX, avgY, clientX, clientY);
    } else {
      lastTap = now;
      lastPt  = { x: vbX, y: vbY };
    }
  };

  // Souris / stylet.
  svgEl.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'touch') return;
    if (ev.button !== 0) return;
    if (onControl(ev.target)) return;
    beginTap(ev.clientX, ev.clientY);
  });
  svgEl.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    moveTap(ev.clientX, ev.clientY);
  });
  svgEl.addEventListener('pointerup', ev => {
    if (ev.pointerType === 'touch') return;
    endTap(ev.clientX, ev.clientY);
  });
  svgEl.addEventListener('pointercancel', ev => {
    if (ev.pointerType === 'touch') return;
    down = null;
  });

  // Tactile.
  svgEl.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1) {
      down = null; lastTap = 0; lastPt = null;
      return;
    }
    if (onControl(ev.target)) return;
    const t = ev.touches[0];
    beginTap(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchmove', ev => {
    if (!down) return;
    const t = ev.touches[0];
    if (!t) return;
    moveTap(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', ev => {
    if (!down) return;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!t) { down = null; return; }
    endTap(t.clientX, t.clientY);
  });
  window.addEventListener('touchcancel', () => { down = null; });
}

// Crée un item scrapbook à partir d'un double-tap sur la frise. (svgX, svgY)
// sont les coords SVG utiles pour calculer (moment, lon). (clientX, clientY)
// positionnent l'overlay éditable DOM par-dessus le SVG.
function createScrapItemOnTimeline(svgX, svgY, clientX, clientY) {
  const range = timelineRange();
  const ms  = msFromTlX(svgX, range);
  const lon = lonFromTlY(svgY);
  const radius = (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const center = project(lon, ascLon, radius);
  const width = 160, height = 60;
  const item = {
    id: genId(),
    createdAt: ms,
    updatedAt: ms,
    // retiredAt = createdAt : inscription à un instant précis, pas une durée
    // vécue — évite le rendu « rectangle infini vers la droite » quand il n'y
    // a pas de retiredAt. Les items du cercle (ancien geste) continuent sans
    // retiredAt et s'étalent naturellement sur la frise.
    retiredAt: ms,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width, height,
    lon,
    radius,
    text: '',
    scope: 'timed',
  };
  state.scrapbook.push(item);
  if (!saveScrapbook()) {
    state.scrapbook = state.scrapbook.filter(x => x.id !== item.id);
    return;
  }
  openTimelineEditor(item, clientX, clientY);
  // Pas de render complet : la frise suffit (le cercle est masqué). On
  // appellera render() au commit pour tout re-synchroniser.
  try { drawTimeline(); } catch (e) { showError('timeline error: ' + e.message); }
}

// Overlay DOM contenteditable positionné en absolute dans #timeline-container
// à l'endroit du tap. Enter = commit, Escape = cancel (supprime l'item),
// blur sur vide = cancel aussi. Resté minimal : textarea simple pour l'instant,
// pas d'embeds médias ni redimensionnement — ces chantiers viendront quand
// l'usage les appellera.
function openTimelineEditor(item, clientX, clientY) {
  const containerEl = document.getElementById('timeline-container');
  if (!containerEl) return;
  // Nettoie un éventuel éditeur précédent.
  const prev = containerEl.querySelector('.tl-scrap-editor');
  if (prev) prev.remove();
  const rect = containerEl.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const editor = document.createElement('div');
  editor.className = 'tl-scrap-editor';
  editor.setAttribute('contenteditable', 'true');
  editor.setAttribute('spellcheck', 'true');
  editor.setAttribute('data-id', item.id);
  editor.style.left = `${relX}px`;
  editor.style.top  = `${relY}px`;
  // Pré-remplit le contenu si l'item existe déjà (re-édition via clic sur
  // le rect). Pour un item fraîchement créé, item.text est '' donc rien.
  if (item.text) editor.innerText = item.text;
  containerEl.appendChild(editor);
  // Focus immédiat pour taper sans friction. Place le curseur en fin de texte.
  setTimeout(() => {
    editor.focus();
    if (item.text) {
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }, 0);
  let cancelled = false;
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const text = editor.innerText.trim();
    editor.remove();
    if (!text || cancelled) {
      // Pas de contenu ou annulation explicite : on supprime l'item posé.
      state.scrapbook = state.scrapbook.filter(x => x.id !== item.id);
    } else {
      item.text = text;
      item.updatedAt = Date.now();
    }
    saveScrapbook();
    try { drawTimeline(); } catch (e) { showError('timeline error: ' + e.message); }
  };
  editor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      commit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancelled = true;
      commit();
    }
  });
  editor.addEventListener('blur', commit);
}

// Migration : les anciens items (texte, foreignObject, collapsed/expanded)
// sont des données de test sans valeur. On les purge. Ne garde que les items
// porteurs d'une image : legacy (imgDataUrl) OU Drive (imgSrc === 'drive').
function migrateScrapbookItems() {
  const before = state.scrapbook.length;
  state.scrapbook = state.scrapbook.filter(it => it.imgDataUrl || it.imgSrc === 'drive');
  if (state.scrapbook.length !== before) saveScrapbook();
}

// Migration des items existants : calcule it.lon à partir de (x+w/2, y+h/2)
// et de l'ascendant qui prévalait à createdAt. Appelée après swe est prêt.
// Pour les items déjà munis d'un lon, no-op.
function migrateScrapbookLon() {
  // No-op : les anciens items sans lon ont été purgés par migrateScrapbookItems.
  // Les nouveaux items image ont déjà un lon.
}

// ---------- État + persistance ----------
const STORAGE_KEY    = 'astrolab.asteroids';
const LAYERS_KEY     = 'astrolab.layers';
const HARMONICS_KEY  = 'astrolab.harmonics';
const ASPECT_STYLE_KEY = 'astrolab.aspectStyle';
// Les clés scrapbook et planet-notes sont scopées par natif pour que les
// contenus restent attachés au ciel qu'ils annotent. L'ancienne clé plate
// `astrolab.scrapbook` (resp. `astrolab.planet-notes`) est migrée vers le
// natif seed Perig au premier boot (voir migrateScopedKeys).
const SCRAPBOOK_KEY_PREFIX    = 'astrolab.scrapbook.';
const PLANET_NOTES_KEY_PREFIX = 'astrolab.planet-notes.';
function scrapbookKey()    { return SCRAPBOOK_KEY_PREFIX    + nativesState.currentId; }
function planetNotesKey()  { return PLANET_NOTES_KEY_PREFIX + nativesState.currentId; }

function migrateScopedKeys() {
  // Migration one-shot : si une clé plate existe et que la clé scopée pour
  // perig-seed est absente, on bascule. Idempotent.
  // try/catch : si la copie dépasse le quota, on garde l'ancienne clé plate
  // (elle reste lisible) plutôt que de perdre le contenu au removeItem.
  const legacyScrap = localStorage.getItem('astrolab.scrapbook');
  const scopedScrap = localStorage.getItem(SCRAPBOOK_KEY_PREFIX + PERIG_SEED.id);
  if (legacyScrap !== null && scopedScrap === null) {
    try {
      localStorage.setItem(SCRAPBOOK_KEY_PREFIX + PERIG_SEED.id, legacyScrap);
      localStorage.removeItem('astrolab.scrapbook');
    } catch (e) { /* quota : on laisse la clé plate en place */ }
  }
  const legacyNotes = localStorage.getItem('astrolab.planet-notes');
  const scopedNotes = localStorage.getItem(PLANET_NOTES_KEY_PREFIX + PERIG_SEED.id);
  if (legacyNotes !== null && scopedNotes === null) {
    try {
      localStorage.setItem(PLANET_NOTES_KEY_PREFIX + PERIG_SEED.id, legacyNotes);
      localStorage.removeItem('astrolab.planet-notes');
    } catch (e) { /* quota : on laisse la clé plate en place */ }
  }
}
migrateScopedKeys();
const DEFAULT_LAYERS = {
  signs: true, houses: true, planets: true, transits: true,
  midpoints: false, asteroids: true, scrapbook: true, timeline: true,
  jalons: false,  // dates fondatrices affichées sur la frise, off par défaut
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
  layers: loadStored(LAYERS_KEY, DEFAULT_LAYERS),
  harmonics: loadHarmonics(),
  aspectStyle: localStorage.getItem(ASPECT_STYLE_KEY) || 'lines',  // 'lines' | 'digits'
  asteroids: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  scrapbook: JSON.parse(localStorage.getItem(scrapbookKey()) || '[]'),
  jalons: [],  // chargé depuis content/jalons.json au boot — dates fondatrices
  chartTime: null,  // null = temps réel ; sinon ms epoch (slider temporel) — pilote l'anneau transit
  timeline: { palier: 'day' },  // zoom frise par paliers discrets (P1 2026-10-22) — v. TL_PALIER_SPEC
  chart: { zoom: 1.0, cx: 0, cy: 0 },  // zoom cercle via viewBox ; cx/cy = centre visible (viewBox initial = -520..520)
};

// Charge le répertoire de jalons depuis content/jalons.json. Chaque entrée
// garde le shape item scrapbook (scope: 'moment') mais vit dans state.jalons
// séparé — pas de persistance localStorage, c'est du contenu versionné.
async function loadJalons() {
  try {
    const res = await fetch('content/jalons.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const arr = await res.json();
    state.jalons = arr.map(j => ({
      ...j,
      createdAt: Date.parse(j.createdAt),
    })).filter(j => Number.isFinite(j.createdAt));
  } catch (e) {
    console.warn('loadJalons:', e.message);
  }
}
function saveAsteroids()   { localStorage.setItem(STORAGE_KEY,       JSON.stringify(state.asteroids)); }
function saveLayers()      { localStorage.setItem(LAYERS_KEY,        JSON.stringify(state.layers));    }
function saveHarmonics()   { localStorage.setItem(HARMONICS_KEY,     JSON.stringify([...state.harmonics].sort((a,b)=>a-b))); }
function saveAspectStyle() { localStorage.setItem(ASPECT_STYLE_KEY,  state.aspectStyle); }
// Les champs préfixés `_` sont RAM-only (ex. _expanded) : non persistés, pour
// que l'état d'ouverture ne survive pas aux reloads.
// Retourne true si la sauvegarde a abouti, false sinon (quota dépassé,
// stockage indisponible…). Les appelants qui viennent d'ajouter un item
// doivent le retirer de state.scrapbook en cas d'échec, sinon l'item reste
// en RAM et disparaît au reload — pire que l'erreur elle-même.
function scrapbookSavedAtKey(nativeId = nativesState.currentId) {
  return 'astrolab.scrapbook.' + nativeId + '.savedAt';
}
function saveScrapbook()   {
  const clean = state.scrapbook.map(it => {
    const out = {};
    for (const [k, v] of Object.entries(it)) if (!k.startsWith('_')) out[k] = v;
    return out;
  });
  const json = JSON.stringify(clean);
  try {
    localStorage.setItem(scrapbookKey(), json);
    const savedAt = Date.now();
    localStorage.setItem(scrapbookSavedAtKey(), String(savedAt));
    scheduleScrapbookSync(nativesState.currentId, clean, savedAt);
    return true;
  } catch (e) {
    const quota = e && (e.name === 'QuotaExceededError'
                     || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
                     || e.code === 22 || e.code === 1014);
    if (quota) {
      showError(`Scrapbook plein : ${(json.length / 1048576).toFixed(1)} Mo `
        + `pour ${clean.length} item(s) — quota du navigateur dépassé. `
        + `Retire des images (ou « vider ») avant d'en ajouter.`);
    } else {
      showError('Sauvegarde scrapbook impossible : ' + (e && (e.message || e)));
    }
    return false;
  }
}

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
  // Bi-wheel : natal = thème fixe (frame ASC/maisons), transit = instant courant
  // (null = maintenant, sinon chartTime du curseur frise).
  const natalCfg   = natalConfig();
  const transitCfg = nowConfig(MONTREAL, state.chartTime);
  document.getElementById('chart-title').textContent = natalCfg.title + ' × ' + transitCfg.title;
  document.getElementById('chart-info').textContent  = natalCfg.info + ' — transit : ' + transitCfg.info;

  const H = swe.houses(natalCfg.jd, natalCfg.latitude, natalCfg.longitude, sweMod.HouseSystem.Placidus);
  state.currentAscLon = H.ascendant;
  const natalBodies     = computeBodies(natalCfg.jd);
  const natalAsteroids  = computeAsteroids(natalCfg.jd);
  const transitBodies   = computeBodies(transitCfg.jd);
  const transitAsteroids = computeAsteroids(transitCfg.jd);
  // Contexte modale planète : natal par défaut. L'attribut data-ring sur le
  // glyphe cliqué dira plus tard quel body sélectionner (natal vs transit).
  currentChartContext = {
    cusps: H.cusps, ascendant: H.ascendant,
    bodies: natalBodies, transitBodies,
  };
  drawChart({
    natal:   { cusps: H.cusps, ascendant: H.ascendant, midheaven: H.midheaven,
               bodies: natalBodies, asteroids: natalAsteroids },
    transit: { bodies: transitBodies, asteroids: transitAsteroids },
  }, state.layers);
  drawDataTable({ ascendant: H.ascendant, midheaven: H.midheaven }, natalBodies, natalAsteroids);
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

// Bouton « vider » (sheet contrôles) — purge tout le scrapbook après
// confirmation. Utile en phase prototype où la data est jetable, et pour
// nettoyer avant tests sérieux.
function wireScrapPurge() {
  const btn = document.getElementById('scrap-purge-all');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const n = state.scrapbook.length;
    if (!n) return;
    if (!confirm(`Vider le scrapbook ? ${n} item(s) seront supprimés définitivement.`)) return;
    state.scrapbook = [];
    saveScrapbook();
    render().catch(e => showError('render error: ' + e.message));
  });
}

function createScrapItemAt(x, y) {
  // Ouvre un file picker pour choisir une image. L'item est ancré
  // à la longitude écliptique du point de tap, dans la bande zodiacale.
  // Deux modes de stockage selon connexion Drive :
  //  - Drive connecté : upload 2 variantes (thumb + full), item ne stocke que
  //    les fileIds. LocalStorage reste léger ; quota disparaît.
  //  - Drive non connecté : fallback historique (dataURL 512 px en localStorage).
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const lon    = xyToLon(x, y, ascLon);
  const radius = (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
  const stamp  = state.chartTime != null ? state.chartTime : Date.now();

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (Drive.isAuthenticated()) {
      // Pipeline Drive — 2 variantes blob uploadées en parallèle.
      let variants;
      try {
        variants = await prepareScrapImageVariants(file);
      } catch (e) {
        showError(`Image « ${file.name} » illisible : ${e.message}`);
        return;
      }
      const itemId = genId();
      const ext = variants.mimeType === 'image/webp' ? 'webp' : 'jpg';
      try {
        const nid = nativesState.currentId;
        const [thumbFileId, fullFileId] = await Promise.all([
          Drive.uploadScrapBlob(nid, `${itemId}-thumb.${ext}`, variants.thumb.blob, variants.mimeType),
          Drive.uploadScrapBlob(nid, `${itemId}-full.${ext}`,  variants.full.blob,  variants.mimeType),
        ]);
        const item = {
          id: itemId,
          lon, radius,
          imgSrc: 'drive',
          thumbFileId, fullFileId,
          imgMime: variants.mimeType,
          imgWidth:  variants.full.width,
          imgHeight: variants.full.height,
          createdAt: stamp,
          scope: 'timed',
        };
        // Pré-cache le thumb Blob fraîchement encodé : évite un aller-retour
        // Drive pour l'affichage immédiat.
        preloadThumbBlob(thumbFileId, variants.thumb.blob);
        state.scrapbook.push(item);
        saveScrapbook();
        render().catch(e => showError('render error: ' + e.message));
      } catch (e) {
        showError(`Upload Drive échoué : ${e.message}`);
      }
      return;
    }

    // Fallback localStorage (Drive non connecté).
    let prepared;
    try {
      prepared = await prepareScrapImage(file);
    } catch (e) {
      showError(`Image « ${file.name} » illisible : ${e.message}`);
      return;
    }
    const item = {
      id: genId(),
      lon, radius,
      imgDataUrl: prepared.dataUrl,
      imgWidth: prepared.width,
      imgHeight: prepared.height,
      imgV: SCRAP_IMG_VERSION,
      createdAt: stamp,
      scope: 'timed',
    };
    state.scrapbook.push(item);
    if (!saveScrapbook()) {
      state.scrapbook = state.scrapbook.filter(x => x.id !== item.id);
      return;
    }
    render().catch(e => showError('render error: ' + e.message));
  });
  input.click();
}

// Zoom cercle : viewBox dynamique, indépendant du zoom frise.
//   - molette (desktop) → zoom autour du curseur
//   - 2 doigts (mobile) → zoom (écart) + pan (milieu) simultanés, ancrés sur
//     le point viewBox qui était sous le milieu au début du geste
//   - clic milieu drag (desktop) → pan sans zoom
// 1 doigt reste libre pour le double-tap scrapbook (wireScrapbookGestures).
// Le viewBox initial 1040×1040 est centré en (0,0) ; on représente la fenêtre
// visible par (cx, cy, zoom) avec w = h = 1040 / zoom.
const CHART_VB_SIZE = 1040;
const CHART_VB_HALF = 520;
const CHART_ZOOM_MIN = 1.0;
// 400 = 8x l'ancien plafond (50). Calibre sur la taille d'un item scrapbook
// (SCRAP_IMG_BASE = 8 unites viewBox) : a 400 la fenetre visible fait
// 1040/400 = 2.6 unites, donc un item occupe ~3x la largeur de l'ecran.
// En longitude, 2.6 unites a r~316 valent ~0.47 deg : on lit le demi-degre.
// Les traits du cercle passent en `vector-effect: non-scaling-stroke`
// (style.css) pour rester lisibles a cette profondeur.
const CHART_ZOOM_MAX = 400;

function clampChartState() {
  const c = state.chart;
  c.zoom = Math.max(CHART_ZOOM_MIN, Math.min(CHART_ZOOM_MAX, c.zoom || 1));
  // Clamp cx/cy pour que la fenêtre visible reste à l'intérieur du viewBox
  // initial (évite les bords vides). Si zoom = 1, cx=cy=0 forcé.
  const halfVisible = CHART_VB_HALF / c.zoom;
  const maxOffset = CHART_VB_HALF - halfVisible;
  c.cx = Math.max(-maxOffset, Math.min(maxOffset, c.cx || 0));
  c.cy = Math.max(-maxOffset, Math.min(maxOffset, c.cy || 0));
}

function updateChartViewBox() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  clampChartState();
  const { zoom, cx, cy } = state.chart;
  const w = CHART_VB_SIZE / zoom;
  const x = cx - w / 2;
  const y = cy - w / 2;
  svgEl.setAttribute('viewBox', `${x} ${y} ${w} ${w}`);
}

function wireChartInteraction() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;

  // Position d'un event écran en coord viewBox courantes du cercle.
  const svgPt = (clientX, clientY) => {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  };

  // Molette : zoom autour du curseur. Le point viewBox sous la souris reste
  // sous la souris après zoom.
  svgEl.addEventListener('wheel', ev => {
    ev.preventDefault();
    const anchor = svgPt(ev.clientX, ev.clientY);
    const prev = state.chart.zoom || 1;
    const factor = Math.exp(-ev.deltaY * 0.0015);
    const next = Math.max(CHART_ZOOM_MIN, Math.min(CHART_ZOOM_MAX, prev * factor));
    if (next === prev) return;
    // cx_new tel que anchor reste au même point écran :
    //   anchor.x = cx_new + (fx - 0.5) * w_new   avec fx = position relative
    //   anchor.x = cx_old + (fx - 0.5) * w_old
    // Donc cx_new = anchor.x - (anchor.x - cx_old) * (w_new / w_old)
    //             = anchor.x - (anchor.x - cx_old) * (prev / next)
    const r = prev / next;
    state.chart.zoom = next;
    state.chart.cx = anchor.x - (anchor.x - (state.chart.cx || 0)) * r;
    state.chart.cy = anchor.y - (anchor.y - (state.chart.cy || 0)) * r;
    updateChartViewBox();
  }, { passive: false });

  // Pinch 2-doigts : zoom + pan combinés, ancrés sur le milieu.
  let pinchStartDist = null;
  let pinchStartZoom = null;
  let pinchAnchorVb  = null;  // (x,y) viewBox initial sous le milieu au start
  svgEl.addEventListener('touchstart', ev => {
    if (ev.touches.length >= 2) {
      ev.preventDefault();
      const t0 = ev.touches[0], t1 = ev.touches[1];
      pinchStartDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      pinchStartZoom = state.chart.zoom || 1;
      pinchAnchorVb  = svgPt((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
    }
  }, { passive: false });

  svgEl.addEventListener('touchmove', ev => {
    if (ev.touches.length >= 2 && pinchStartDist != null) {
      ev.preventDefault();
      const t0 = ev.touches[0], t1 = ev.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;
      const ratio = dist / pinchStartDist;
      const nextZoom = Math.max(CHART_ZOOM_MIN, Math.min(CHART_ZOOM_MAX, pinchStartZoom * ratio));
      state.chart.zoom = nextZoom;
      // Ancrage : on veut que pinchAnchorVb (point initial sous milieu) tombe
      // sous le milieu courant. Convertir le milieu courant en coord viewBox
      // via la CTM courante NE marche pas car la CTM dépend du viewBox qu'on
      // calcule. On raisonne en coord écran : la position écran du milieu doit
      // correspondre à pinchAnchorVb projeté par le nouveau viewBox.
      // Soit midScreen = (midX, midY) et rect = svgEl.getBoundingClientRect() ;
      // fraction écran fx = (midX - rect.left) / rect.width, idem fy.
      // Alors viewBox voulu : vbX = pinchAnchorVb.x - fx * w, vbY = pinchAnchorVb.y - fy * w
      // → cx = vbX + w/2, cy = vbY + w/2.
      const rect = svgEl.getBoundingClientRect();
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const fx = (midX - rect.left) / rect.width;
      const fy = (midY - rect.top) / rect.height;
      const w = CHART_VB_SIZE / nextZoom;
      state.chart.cx = pinchAnchorVb.x - (fx - 0.5) * w;
      state.chart.cy = pinchAnchorVb.y - (fy - 0.5) * w;
      updateChartViewBox();
    }
  }, { passive: false });

  const endPinch = () => {
    pinchStartDist = null;
    pinchStartZoom = null;
    pinchAnchorVb  = null;
  };
  svgEl.addEventListener('touchend',    endPinch);
  svgEl.addEventListener('touchcancel', endPinch);

  // Pan 1-doigt (mobile) : drag simple pour déplacer la vue.
  // Seuil de 5 px avant de démarrer le pan (pour ne pas confondre avec un tap).
  // Ignore les pointerdown sur des éléments scrapbook (disque, cadre, grip…).
  const PAN_THRESHOLD = 5;
  let oneFingerPan = null;  // { id, startX, startY, startCx, startCy, armed }
  svgEl.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;                     // bouton gauche seulement
    if (ev.pointerType === 'mouse') return;           // desktop : molette + clic milieu
    if (oneFingerPan != null) return;                 // déjà en cours
    if (ev.target.closest('.scrap-img-item, .planet-symbol, [data-scrap-handle]')) return;
    oneFingerPan = { id: ev.pointerId, startX: ev.clientX, startY: ev.clientY,
                     startCx: state.chart.cx || 0, startCy: state.chart.cy || 0, armed: false };
  });
  svgEl.addEventListener('pointermove', ev => {
    if (!oneFingerPan || ev.pointerId !== oneFingerPan.id) return;
    const dx = ev.clientX - oneFingerPan.startX;
    const dy = ev.clientY - oneFingerPan.startY;
    if (!oneFingerPan.armed) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      oneFingerPan.armed = true;
      svgEl.setPointerCapture(ev.pointerId);
    }
    const rect = svgEl.getBoundingClientRect();
    const w = CHART_VB_SIZE / (state.chart.zoom || 1);
    const kx = w / rect.width;
    const ky = w / rect.height;
    state.chart.cx = oneFingerPan.startCx - dx * kx;
    state.chart.cy = oneFingerPan.startCy - dy * ky;
    updateChartViewBox();
  });
  const endOneFingerPan = (ev) => {
    if (!oneFingerPan) return;
    if (ev && ev.pointerId !== oneFingerPan.id) return;
    oneFingerPan = null;
  };
  svgEl.addEventListener('pointerup',     endOneFingerPan);
  svgEl.addEventListener('pointercancel', endOneFingerPan);
  svgEl.addEventListener('lostpointercapture', endOneFingerPan);

  // Clic milieu desktop : pan sans zoom. On enregistre la position écran au
  // start et le centre viewBox, puis on soustrait le déplacement converti en
  // coord viewBox (via le ratio taille écran / taille viewBox visible).
  let mousePanStartX = null;
  let mousePanStartY = null;
  let mousePanStartCx = null;
  let mousePanStartCy = null;
  svgEl.addEventListener('pointerdown', ev => {
    if (ev.button !== 1) return;
    ev.preventDefault();
    svgEl.setPointerCapture(ev.pointerId);
    mousePanStartX  = ev.clientX;
    mousePanStartY  = ev.clientY;
    mousePanStartCx = state.chart.cx || 0;
    mousePanStartCy = state.chart.cy || 0;
  });
  svgEl.addEventListener('pointermove', ev => {
    if (mousePanStartX == null) return;
    const rect = svgEl.getBoundingClientRect();
    const w = CHART_VB_SIZE / (state.chart.zoom || 1);
    const kx = w / rect.width;
    const ky = w / rect.height;
    state.chart.cx = mousePanStartCx - (ev.clientX - mousePanStartX) * kx;
    state.chart.cy = mousePanStartCy - (ev.clientY - mousePanStartY) * ky;
    updateChartViewBox();
  });
  const stopPan = () => {
    mousePanStartX = null;
    mousePanStartY = null;
    mousePanStartCx = null;
    mousePanStartCy = null;
  };
  svgEl.addEventListener('pointerup',     stopPan);
  svgEl.addEventListener('pointercancel', stopPan);
  svgEl.addEventListener('auxclick', ev => { if (ev.button === 1) ev.preventDefault(); });
}

// Double-tap détection manuelle (dblclick natif est capricieux sur mobile).
// Deux taps *propres* (sans déplacement) sur le SVG à moins de 400 ms l'un de
// l'autre dans la bande zodiacale = ouvre un file picker pour déposer une
// image à cet endroit.
//
// Un « tap » = pointerdown → pointerup sans avoir bougé de plus de
// TAP_SLOP_PX. Sans ce filtre, chaque début de pan (pointerdown) comptait
// comme un tap : deux coups de doigt rapprochés pour panner la carte
// déclenchaient la création (bug signalé 2026-10-23). Le double-tap est
// validé au pointerup du 2e tap, pas au pointerdown — la surface ne réagit
// plus au simple contact.
function wireScrapbookGestures() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  const TAP_SLOP_PX     = 10;   // au-delà : c'est un pan, pas un tap
  const DOUBLE_TAP_MS   = 400;
  const DOUBLE_TAP_DIST = 40;   // unités viewBox
  let lastTap = 0;
  let lastPt  = null;
  let lastTouchPointerAt = 0;
  let down = null;              // { clientX, clientY, vbX, vbY, moved }

  const inZodiacBand = (pt) => {
    const r = Math.hypot(pt.x, pt.y);
    return r >= R_ZODIAC_IN && r <= R_ZODIAC_OUT;
  };

  svgEl.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;                      // contact / bouton gauche
    if (!ev.isPrimary) {                              // 2e doigt : pinch, pas tap
      down    = null;
      lastTap = 0;
      lastPt  = null;
      return;
    }
    if (ev.pointerType === 'mouse' && Date.now() - lastTouchPointerAt < 600) return;
    if (ev.pointerType === 'touch') lastTouchPointerAt = Date.now();

    // Ignorer si sur un item scrapbook image existant, un handle d'édition,
    // ou un glyphe planétaire (les glyphes tombent dans la bande zodiacale : r=315).
    if (ev.target.closest && ev.target.closest('.scrap-img-item, .planet-symbol, [data-scrap-handle]')) return;

    const pt = screenToSvg(svgEl, ev.clientX, ev.clientY);
    // Création uniquement si le tap tombe dans la bande zodiacale.
    if (!inZodiacBand(pt)) {
      lastTap = 0;
      lastPt  = null;
      down    = null;
      return;
    }
    down = { clientX: ev.clientX, clientY: ev.clientY, vbX: pt.x, vbY: pt.y, moved: false };
  });

  // Tout déplacement au-delà du seuil annule la séquence : c'est un pan.
  svgEl.addEventListener('pointermove', ev => {
    if (!down || down.moved) return;
    if (Math.hypot(ev.clientX - down.clientX, ev.clientY - down.clientY) > TAP_SLOP_PX) {
      down.moved = true;
      lastTap = 0;
      lastPt  = null;
    }
  });

  const endTap = () => {
    if (!down) return;
    const wasTap = !down.moved;
    const vbX = down.vbX, vbY = down.vbY;
    down = null;
    if (!wasTap) return;
    const now = Date.now();
    if (now - lastTap < DOUBLE_TAP_MS && lastPt
        && Math.hypot(vbX - lastPt.x, vbY - lastPt.y) < DOUBLE_TAP_DIST) {
      const avgX = (vbX + lastPt.x) / 2;
      const avgY = (vbY + lastPt.y) / 2;
      lastTap = 0;
      lastPt  = null;
      createScrapItemAt(avgX, avgY);
    } else {
      lastTap = now;
      lastPt  = { x: vbX, y: vbY };
    }
  };
  svgEl.addEventListener('pointerup', endTap);
  svgEl.addEventListener('pointercancel', () => { down = null; });
}

// ---------- Scrapbook : gestes sur items existants ----------
// Gestes sur un `.scrap-img-item`, en délégation sur le SVG racine :
//  - tap simple        → zoom chart sur l'item (anime cx/cy/zoom pour cadrer)
//  - double-tap        → entre en mode édition (overlay poignée + bouton ×)
//  - drag en édition   → déplace l'item (met à jour lon/radius)
// Le drag n'est actif QUE quand l'item est en mode édition (déclenché par
// double-tap). Hors édition, un drag sur item laisse le pan global prendre.
// Évite tout conflit avec les gestes système long-press Android.
const SCRAP_DOUBLE_TAP_MS = 320;
const SCRAP_TAP_SLOP_PX   = 10;

function exitScrapEditMode() {
  if (editingScrapId == null) return;
  editingScrapId = null;
  render().catch(e => showError('render error: ' + e.message));
}
function enterScrapEditMode(id) {
  editingScrapId = id;
  render().catch(e => showError('render error: ' + e.message));
}

// Anime le viewport chart vers le centre d'un item scrapbook. Zoom cible 100
// (au-dessus de SCRAP_LOD_FULL_ZOOM=80 → charge la variante full automatiquement).
function animateChartViewport(cx, cy, zoom, duration = 320) {
  const sCx = state.chart.cx || 0;
  const sCy = state.chart.cy || 0;
  const sZ  = state.chart.zoom || 1;
  const start = performance.now();
  function step(t) {
    const p = Math.min(1, (t - start) / duration);
    const e = 1 - Math.pow(1 - p, 3);  // easeOutCubic
    state.chart.zoom = sZ + (zoom - sZ) * e;
    state.chart.cx   = sCx + (cx  - sCx) * e;
    state.chart.cy   = sCy + (cy  - sCy) * e;
    updateChartViewBox();
    if (p < 1) requestAnimationFrame(step);
    else render().catch(err => showError('render error: ' + err.message));  // reload LOD final
  }
  requestAnimationFrame(step);
}

function zoomChartToItem(id) {
  const it = state.scrapbook.find(x => x.id === id);
  if (!it) return;
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const rawR = it.radius != null ? it.radius : (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
  const dotR = Math.max(R_ZODIAC_IN, Math.min(R_ZODIAC_OUT, rawR));
  const center = project(it.lon != null ? it.lon : 0, ascLon, dotR);
  animateChartViewport(center.x, center.y, 100);
}

function wireScrapItemGestures() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  let press = null;        // { id, startX, startY, pointerId, longTimer, mode }
  let lastTap = { id: null, at: 0 };
  let tapSingleTimer = null;

  // Bloque le menu contextuel système (long-press WebView Android →
  // « Enregistrer l'image ») qui intercepterait notre press long.
  svgEl.addEventListener('contextmenu', ev => {
    if (ev.target.closest && ev.target.closest('.scrap-img-item, [data-scrap-handle]')) {
      ev.preventDefault();
    }
  });

  // Bloque les gestes système sur un touchstart (sélecteur de texte, caret
  // bleu, highlight). preventDefault sur pointerdown ne suffit pas sur
  // WebView Android : il faut intervenir dès touchstart avec passive:false.
  // Portée restreinte aux items/handles pour ne pas casser le pinch global.
  svgEl.addEventListener('touchstart', ev => {
    if (!ev.target || !ev.target.closest) return;
    if (ev.target.closest('.scrap-img-item, [data-scrap-handle]')) {
      ev.preventDefault();
    }
  }, { passive: false });

  const clearSingleTap = () => {
    if (tapSingleTimer) { clearTimeout(tapSingleTimer); tapSingleTimer = null; }
  };

  svgEl.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || !ev.isPrimary) return;
    const img = ev.target.closest && ev.target.closest('.scrap-img-item');
    if (!img) return;
    // Les handles (resize/×) ont leur propre handler ; ne pas les intercepter ici.
    if (ev.target.closest('[data-scrap-handle]')) return;
    ev.stopPropagation();
    // Empêche le navigateur de déclencher ses propres gestes
    // (drag natif de l'image, menu « enregistrer », sélection de texte).
    if (ev.pointerType === 'touch') ev.preventDefault();
    const id = img.getAttribute('data-id');
    press = {
      id,
      startX: ev.clientX,
      startY: ev.clientY,
      pointerId: ev.pointerId,
      editing: editingScrapId === id,  // snapshot au moment du down
      mode: 'tap',                      // 'tap' | 'drag'
    };
  });

  svgEl.addEventListener('pointermove', ev => {
    if (!press || ev.pointerId !== press.pointerId) return;
    const dx = ev.clientX - press.startX;
    const dy = ev.clientY - press.startY;
    if (press.mode === 'tap') {
      if (Math.hypot(dx, dy) <= SCRAP_TAP_SLOP_PX) return;
      // Dépassement du slop :
      //  - item en mode édition → bascule en drag et capture le pointeur
      //  - sinon → abandonne, laisse le pan global prendre
      if (!press.editing) { press = null; return; }
      press.mode = 'drag';
      try { svgEl.setPointerCapture(press.pointerId); } catch (e) {}
    }
    if (press.mode === 'drag') {
      const pt = screenToSvg(svgEl, ev.clientX, ev.clientY);
      const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
      const lon = xyToLon(pt.x, pt.y, ascLon);
      const r = Math.max(R_ZODIAC_IN, Math.min(R_ZODIAC_OUT, Math.hypot(pt.x, pt.y)));
      updateScrapItem(press.id, { lon, radius: r });
    }
  });

  const endPress = ev => {
    if (!press) return;
    if (ev && ev.pointerId != null && ev.pointerId !== press.pointerId) return;
    const { id, mode, startX, startY } = press;
    press = null;
    if (mode === 'drag') return;  // position déjà sauvée pendant pointermove
    if (ev && Math.hypot(ev.clientX - startX, ev.clientY - startY) > SCRAP_TAP_SLOP_PX) return;
    // Tap propre. Distinguer simple vs double.
    const now = Date.now();
    if (lastTap.id === id && now - lastTap.at < SCRAP_DOUBLE_TAP_MS) {
      clearSingleTap();
      lastTap = { id: null, at: 0 };
      // Double-tap : entrer ou sortir du mode édition (toggle)
      if (editingScrapId === id) exitScrapEditMode();
      else enterScrapEditMode(id);
      return;
    }
    lastTap = { id, at: now };
    clearSingleTap();
    tapSingleTimer = setTimeout(() => {
      tapSingleTimer = null;
      lastTap = { id: null, at: 0 };
      // Si item en édition et tap simple dessus : on sort de l'édition
      // (comportement cohérent avec "tap ailleurs = exit")
      if (editingScrapId === id) { exitScrapEditMode(); return; }
      // Sinon : zoom sur l'item
      if (editingScrapId != null) exitScrapEditMode();
      zoomChartToItem(id);
    }, SCRAP_DOUBLE_TAP_MS);
  };
  svgEl.addEventListener('pointerup', endPress);
  svgEl.addEventListener('pointercancel', endPress);
  svgEl.addEventListener('lostpointercapture', endPress);
}

// Handles du mode édition : poignée resize (drag depuis le coin bas-droit,
// scale proportionnelle à la distance au centre) + bouton × (retire l'item,
// réversible via slider temporel).
function wireScrapEditHandles() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  let dragH = null;  // { id, pointerId, cx, cy, startDist, startScale }

  svgEl.addEventListener('pointerdown', ev => {
    const h = ev.target.closest && ev.target.closest('[data-scrap-handle]');
    if (!h) return;
    ev.stopPropagation();
    ev.preventDefault();
    const id = h.getAttribute('data-id');
    const kind = h.getAttribute('data-scrap-handle');
    if (kind === 'remove') {
      retireScrapItem(id);
      exitScrapEditMode();
      return;
    }
    if (kind === 'resize') {
      const it = state.scrapbook.find(x => x.id === id);
      if (!it) return;
      const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
      const rawR = it.radius != null ? it.radius : (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
      const dotR = Math.max(R_ZODIAC_IN, Math.min(R_ZODIAC_OUT, rawR));
      const c = project(it.lon != null ? it.lon : 0, ascLon, dotR);
      const pt = screenToSvg(svgEl, ev.clientX, ev.clientY);
      const d0 = Math.max(0.5, Math.hypot(pt.x - c.x, pt.y - c.y));
      dragH = {
        id, pointerId: ev.pointerId,
        cx: c.x, cy: c.y,
        startDist: d0,
        startScale: it.scale || 1,
      };
      try { svgEl.setPointerCapture(ev.pointerId); } catch (e) {}
    }
  });

  svgEl.addEventListener('pointermove', ev => {
    if (!dragH || ev.pointerId !== dragH.pointerId) return;
    const pt = screenToSvg(svgEl, ev.clientX, ev.clientY);
    const d = Math.hypot(pt.x - dragH.cx, pt.y - dragH.cy);
    const scale = Math.max(0.3, Math.min(20, dragH.startScale * (d / dragH.startDist)));
    updateScrapItem(dragH.id, { scale });
  });
  const endH = ev => {
    if (!dragH) return;
    if (ev && ev.pointerId != null && ev.pointerId !== dragH.pointerId) return;
    dragH = null;
  };
  svgEl.addEventListener('pointerup', endH);
  svgEl.addEventListener('pointercancel', endH);
  svgEl.addEventListener('lostpointercapture', endH);
}

// Sortie du mode édition quand on tape dans le vide (hors item, hors handles).
function wireScrapEditExitOnBlankTap() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  let down = null;
  svgEl.addEventListener('pointerdown', ev => {
    if (editingScrapId == null) return;
    if (!ev.isPrimary) return;
    if (ev.target.closest && ev.target.closest('.scrap-img-item, [data-scrap-handle]')) return;
    down = { x: ev.clientX, y: ev.clientY, pid: ev.pointerId };
  });
  svgEl.addEventListener('pointerup', ev => {
    if (!down || ev.pointerId !== down.pid) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved > SCRAP_TAP_SLOP_PX) return;  // c'était un pan, pas un tap
    if (editingScrapId != null) exitScrapEditMode();
  });
  svgEl.addEventListener('pointercancel', () => { down = null; });
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

// ---------- Modale planète (fiche pédagogique multi-sources) ----------
// S'ouvre au clic simple sur un glyphe planétaire du cercle. Contenu chargé
// depuis content/planets/<key>.json (archetype + inSign + inHouse, chaque
// entrée = liste de cartes-sources empilées). Observations personnelles
// contenteditable persistées par planète (localStorage). Slider de taille
// du glyphe migré depuis l'atelier (changements committés à la fermeture).
//
// Pipeline d'ingestion ultérieur : poser de nouveaux objets dans les tableaux
// `archetype`, `inSign[signe]`, `inHouse[maison]` suffit, aucune retouche code.
const PLANET_LABELS_FR = {
  sun: 'Soleil', moon: 'Lune', mercury: 'Mercure', venus: 'Vénus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturne', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluton',
};
const SIGN_KEYS = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const SIGN_LABELS_FR = ['Bélier','Taureau','Gémeaux','Cancer','Lion','Vierge','Balance','Scorpion','Sagittaire','Capricorne','Verseau','Poissons'];
const HOUSE_ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

const planetNotes = {};
function loadPlanetNotes() {
  // Repart de zéro à chaque chargement (utile lors d'une bascule de natif).
  for (const k of Object.keys(planetNotes)) delete planetNotes[k];
  try {
    const raw = localStorage.getItem(planetNotesKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') Object.assign(planetNotes, parsed);
  } catch (e) {}
}
function savePlanetNotes() {
  try { localStorage.setItem(planetNotesKey(), JSON.stringify(planetNotes)); } catch (e) {}
}

const planetInfoCache = new Map();
async function loadPlanetInfo(key) {
  if (planetInfoCache.has(key)) return planetInfoCache.get(key);
  let data = null;
  if (Drive.isAuthenticated()) {
    try { data = await Drive.loadPlanetFromDrive(key); }
    catch (e) { console.warn('Drive loadPlanet échec :', e.message); }
  }
  if (!data) {
    try {
      const res = await fetch(`content/planets/${key}.json`, { cache: 'no-cache' });
      if (res.ok) data = await res.json();
    } catch (e) {}
  }
  if (!data) data = {};
  planetInfoCache.set(key, data);
  return data;
}

// Contexte du chart courant stashé après chaque render() — permet à la modale
// de connaître signe et maison de la planète cliquée pour le moment affiché.
let currentChartContext = null;

function signIndexOf(lon) {
  const n = ((lon % 360) + 360) % 360;
  return Math.floor(n / 30);
}
function houseIndexOf(lon, cusps) {
  // Retourne 1..12. Parcourt les 12 secteurs cusp[i]→cusp[i+1] et trouve
  // celui qui contient `lon` (arcs normalisés modulo 360).
  const L = ((lon % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const start = ((cusps[i] % 360) + 360) % 360;
    const next  = ((cusps[(i + 1) % 12] % 360) + 360) % 360;
    const arc = ((next - start) % 360 + 360) % 360;
    const rel = ((L - start) % 360 + 360) % 360;
    if (rel < arc) return i + 1;
  }
  return 1;
}

// Libellés FR des champs sémantiques issus de l'ingestion Banzhaf & al.
// Clé absente ici → humanizeKey() en fallback.
const PI_FIELD_LABELS_FR = {
  title: 'Thèse', shadow: 'Ombre', principle: 'Principe',
  strength: 'Force', problem: 'Problème', goal: 'But',
  representatives: 'Représentants', physical: 'Corrélations physiques',
  mythology: 'Mythologie', image: 'Image', dignity: 'Dignité',
  resolution: 'Résolution', compulsion: 'Compulsion', danger: 'Danger',
  theme: 'Thème', aggression: 'Agressivité', outlets: 'Exutoires',
  fighting: 'Combativité', sexuality: 'Sexualité',
  as_a_child: 'Comme enfant', as_a_mother: 'Comme mère',
  key_principle: 'Principe-clé', style_of_living: 'Style de vie',
  symbol: 'Symbole', inner_mother_image: 'Image intérieure de la mère',
  learn: 'Apprentissage', threshold: 'Seuil', liberation: 'Libération',
  task: 'Tâche', objective: 'Objectif', date_range: 'Période',
  duality: 'Dualité', element: 'Élément', quality: 'Qualité',
  nature_summary: 'Nature', ruling_planet: 'Planète maîtresse',
  dominant_keyword: 'Mot-clé dominant',
  polarity_sign: 'Signe polaire', polarity_note: 'Note de polarité',
  body_part: 'Partie du corps', likeable_trait: 'Trait apprécié',
  likeable_trait_body: 'Trait physique apprécié',
  inhibition: 'Inhibition', ideal: 'Idéal', behavior: 'Comportement',
  speakingStyle: 'Façon de parler',
  attitude_toward_children: 'Attitude envers les enfants',
  working_style: 'Style de travail',
  finds_in_seclusion: 'Trouve dans la solitude',
  way_of_dealing_with_money: 'Rapport à l’argent',
  idea_of_partnership: 'Idée du partenariat',
  role_in_the_group: 'Rôle dans le groupe',
  prohibition: 'Interdit', eroticism: 'Érotisme',
  styleOfArt: 'Style artistique', problem_areas: 'Zones problématiques',
};
const PI_ATTRIB_KEYS = new Set(['source', 'author', 'work', 'year', 'url']);
function humanizeKey(k) {
  return k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

function renderSourceCard(src) {
  const card = document.createElement('article');
  card.className = 'pi-source pi-collapsed';
  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, textarea, iframe')) return;
    card.classList.toggle('pi-collapsed');
  });
  const attribBits = [];
  if (src.source) attribBits.push(`<strong>${escapeHtml(src.source)}</strong>`);
  if (src.author) attribBits.push(escapeHtml(src.author));
  if (src.work)   attribBits.push(`<em>${escapeHtml(src.work)}</em>`);
  if (src.year)   attribBits.push(String(src.year));
  if (src.url)    attribBits.push(`<a href="${encodeURI(src.url)}" target="_blank" rel="noopener">source ↗</a>`);
  if (attribBits.length) {
    const attrib = document.createElement('p');
    attrib.className = 'pi-source-attrib';
    attrib.innerHTML = attribBits.join(' · ');
    card.appendChild(attrib);
  }
  const content = document.createElement('div');
  content.className = 'pi-source-content';

  if (src.html) {
    content.innerHTML = src.html;
  } else {
    // Rendu structuré : parcourt les champs sémantiques dans l'ordre du JSON.
    // `title` → titre de carte, les autres → paire label FR + valeur.
    for (const key of Object.keys(src)) {
      if (PI_ATTRIB_KEYS.has(key) || key === 'html') continue;
      const raw = src[key];
      if (raw == null || raw === '') continue;
      const value = Array.isArray(raw) ? raw.join(', ')
                  : (typeof raw === 'object' ? JSON.stringify(raw) : String(raw));
      if (key === 'title') {
        const h = document.createElement('h4');
        h.className = 'pi-field-title';
        h.textContent = value;
        content.appendChild(h);
        continue;
      }
      const field = document.createElement('div');
      field.className = 'pi-field';
      const label = document.createElement('div');
      label.className = 'pi-field-label';
      label.textContent = PI_FIELD_LABELS_FR[key] || humanizeKey(key);
      const body = document.createElement('div');
      body.className = 'pi-field-value';
      body.textContent = value;
      field.appendChild(label);
      field.appendChild(body);
      content.appendChild(field);
    }
  }
  card.appendChild(content);
  return card;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSourcesInto(container, sources, emptyLabel) {
  if (!sources || !sources.length) {
    const empty = document.createElement('p');
    empty.className = 'pi-empty';
    empty.textContent = emptyLabel;
    container.appendChild(empty);
    return;
  }
  for (const src of sources) container.appendChild(renderSourceCard(src));
}

// ---------- Édition inline des cartes planète (modèle Drive) ----------
// Les cartes à format `html` sont éditables en WYSIWYG via contenteditable ;
// les cartes à champs sémantiques (ingestion Banzhaf : title, shadow,
// principle…) restent intactes pour préserver la structure. Les nouvelles
// cartes créées ici sont toujours au format `html`. Persistance : Drive.

function getCardsAt(data, path) {
  let node = data;
  for (let i = 0; i < path.length - 1; i++) {
    if (node[path[i]] == null) return [];
    node = node[path[i]];
  }
  const list = node[path[path.length - 1]];
  return Array.isArray(list) ? list : [];
}

function setCardsAt(data, path, list) {
  let node = data;
  for (let i = 0; i < path.length - 1; i++) {
    if (node[path[i]] == null || typeof node[path[i]] !== 'object') {
      node[path[i]] = {};
    }
    node = node[path[i]];
  }
  node[path[path.length - 1]] = list;
}

function isEditableCard(src) {
  return typeof src?.html === 'string';
}

async function persistPlanetData(planetKey, data, statusEl) {
  if (!Drive.isAuthenticated()) {
    if (statusEl) statusEl.textContent = 'Drive non connecté';
    return false;
  }
  try {
    if (statusEl) statusEl.textContent = '…';
    await Drive.savePlanetToDrive(planetKey, data);
    planetInfoCache.set(planetKey, data);
    if (statusEl) {
      statusEl.textContent = 'enregistré';
      setTimeout(() => { if (statusEl.textContent === 'enregistré') statusEl.textContent = ''; }, 1500);
    }
    return true;
  } catch (e) {
    if (statusEl) statusEl.textContent = 'erreur Drive : ' + e.message;
    return false;
  }
}

function renderEditForm(initial, { onSave, onCancel }) {
  const form = document.createElement('div');
  form.className = 'pi-edit-form';

  const attribDetails = document.createElement('details');
  attribDetails.className = 'pi-edit-attrib';
  const summary = document.createElement('summary');
  summary.textContent = 'Attribution (optionnel)';
  attribDetails.appendChild(summary);
  const attribFields = {};
  for (const field of ['source', 'author', 'work', 'year', 'url']) {
    const label = document.createElement('label');
    label.className = 'pi-edit-attrib-field';
    const span = document.createElement('span');
    span.textContent = field;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initial[field] || '';
    label.appendChild(span);
    label.appendChild(input);
    attribFields[field] = input;
    attribDetails.appendChild(label);
  }
  if (initial.source || initial.author || initial.work || initial.year || initial.url) {
    attribDetails.open = true;
  }
  form.appendChild(attribDetails);

  const content = document.createElement('div');
  content.className = 'pi-edit-content';
  content.contentEditable = 'true';
  content.setAttribute('data-placeholder', 'Contenu de la carte…');
  content.innerHTML = initial.html || '';
  form.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'pi-edit-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'pi-edit-save';
  saveBtn.textContent = 'Enregistrer';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'pi-edit-cancel';
  cancelBtn.textContent = 'Annuler';
  const status = document.createElement('span');
  status.className = 'pi-edit-status';
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(status);
  form.appendChild(actions);

  saveBtn.addEventListener('click', () => {
    const next = { html: content.innerHTML };
    for (const field of ['source', 'author', 'work', 'year', 'url']) {
      const v = attribFields[field].value.trim();
      if (v) next[field] = v;
    }
    onSave(next, status);
  });
  cancelBtn.addEventListener('click', () => onCancel());

  return form;
}

function renderEditableSection(sec, data, path, planetKey, emptyLabel) {
  const titleEl = sec.querySelector('.pi-section-title');
  sec.innerHTML = '';
  if (titleEl) sec.appendChild(titleEl);

  const cards = getCardsAt(data, path);
  const authed = Drive.isAuthenticated();

  if (cards.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'pi-empty';
    empty.textContent = emptyLabel;
    sec.appendChild(empty);
  } else {
    cards.forEach((src, idx) => {
      const card = renderSourceCard(src);
      if (authed && isEditableCard(src)) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'pi-source-edit';
        editBtn.title = 'Éditer cette carte';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const form = renderEditForm(src, {
            onSave: async (next, status) => {
              const list = getCardsAt(data, path).slice();
              list[idx] = next;
              setCardsAt(data, path, list);
              const ok = await persistPlanetData(planetKey, data, status);
              if (ok) renderEditableSection(sec, data, path, planetKey, emptyLabel);
            },
            onCancel: () => renderEditableSection(sec, data, path, planetKey, emptyLabel),
          });
          card.replaceWith(form);
        });
        card.appendChild(editBtn);
      }
      sec.appendChild(card);
    });
  }

  if (authed) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'pi-source-add';
    addBtn.textContent = '+ Carte';
    addBtn.addEventListener('click', () => {
      const form = renderEditForm({}, {
        onSave: async (next, status) => {
          const list = getCardsAt(data, path).slice();
          list.push(next);
          setCardsAt(data, path, list);
          const ok = await persistPlanetData(planetKey, data, status);
          if (ok) renderEditableSection(sec, data, path, planetKey, emptyLabel);
        },
        onCancel: () => renderEditableSection(sec, data, path, planetKey, emptyLabel),
      });
      addBtn.replaceWith(form);
    });
    sec.appendChild(addBtn);
  } else {
    const hint = document.createElement('p');
    hint.className = 'pi-source-add-hint';
    hint.textContent = 'Connecte-toi à Drive pour ajouter tes propres cartes';
    sec.appendChild(hint);
  }
}

async function openPlanetInfo(planetKey, ring = 'natal') {
  const modal = document.getElementById('planet-info');
  if (!modal) return;
  const headerGlyph    = modal.querySelector('.pi-glyph');
  const headerTitle    = modal.querySelector('.pi-title');
  const headerSubtitle = modal.querySelector('.pi-subtitle');
  const body           = modal.querySelector('.pi-body');

  // Contexte chart courant : signe + maison. En bi-wheel on choisit l'anneau
  // selon le glyphe cliqué (data-ring). Les maisons restent les maisons natal
  // dans les deux cas (frame commun).
  let planetBody = null, signIdx = null, houseNum = null;
  if (currentChartContext) {
    const pool = ring === 'transit'
      ? (currentChartContext.transitBodies || [])
      : currentChartContext.bodies;
    planetBody = pool.find(b => b.key === planetKey);
    if (planetBody) {
      signIdx  = signIndexOf(planetBody.lon);
      houseNum = houseIndexOf(planetBody.lon, currentChartContext.cusps);
    }
  }

  // Header
  const label = PLANET_LABELS_FR[planetKey] || planetKey;
  let data;
  try { data = await loadPlanetInfo(planetKey); }
  catch (e) { showError('Fiche planète : ' + e.message); return; }
  headerGlyph.textContent = data.glyph || '';
  headerTitle.textContent = label;
  const subBits = [];
  if (signIdx != null)  subBits.push(`en ${SIGN_LABELS_FR[signIdx]}`);
  if (houseNum != null) subBits.push(`maison ${HOUSE_ROMAN[houseNum - 1]}`);
  headerSubtitle.textContent = subBits.join(' · ');

  // Body — nettoyage puis sections
  body.innerHTML = '';

  const addSection = (title) => {
    const s = document.createElement('section');
    s.className = 'pi-section';
    const h = document.createElement('h3');
    h.className = 'pi-section-title';
    h.textContent = title;
    s.appendChild(h);
    body.appendChild(s);
    return s;
  };

  // 1 · Archétype
  {
    const sec = addSection('Archétype');
    renderEditableSection(sec, data, ['archetype'], planetKey, 'Aucune source pour l’archétype.');
  }

  // 2 · Planète en signe (si contexte dispo)
  if (signIdx != null) {
    const signKey = SIGN_KEYS[signIdx];
    const sec = addSection(`${label} en ${SIGN_LABELS_FR[signIdx]}`);
    renderEditableSection(sec, data, ['inSign', signKey], planetKey, `Aucune source pour ${label} en ${SIGN_LABELS_FR[signIdx]}.`);
  }

  // 3 · Planète en maison (si contexte dispo)
  if (houseNum != null) {
    const sec = addSection(`${label} en maison ${HOUSE_ROMAN[houseNum - 1]}`);
    renderEditableSection(sec, data, ['inHouse', String(houseNum)], planetKey, `Aucune source pour ${label} en maison ${HOUSE_ROMAN[houseNum - 1]}.`);
  }

  // 4 · Observations personnelles (contenteditable, persist localStorage)
  {
    const sec = addSection('Observations personnelles');
    const notes = document.createElement('div');
    notes.className = 'pi-notes';
    notes.contentEditable = 'true';
    notes.setAttribute('data-placeholder', 'Tes observations ici — mises en forme libre, persistées localement.');
    notes.innerHTML = planetNotes[planetKey] || '';
    const status = document.createElement('p');
    status.className = 'pi-notes-status';
    status.textContent = '';
    let saveTimer = null;
    notes.addEventListener('input', () => {
      status.textContent = '…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        planetNotes[planetKey] = notes.innerHTML;
        savePlanetNotes();
        status.textContent = 'enregistré';
        setTimeout(() => { if (status.textContent === 'enregistré') status.textContent = ''; }, 1200);
      }, 400);
    });
    sec.appendChild(notes);
    sec.appendChild(status);
  }

  // 5 · Taille du glyphe (migré de l'atelier)
  {
    const sec = addSection('Taille du glyphe');
    const row = document.createElement('div');
    row.className = 'pi-scale-row';
    const preview = document.createElement('span');
    preview.className = 'pi-scale-preview';
    preview.textContent = data.glyph || '';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0.5';
    slider.max = '2';
    slider.step = '0.05';
    slider.className = 'pi-scale-slider';
    const value = document.createElement('span');
    value.className = 'pi-scale-value';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'pi-scale-reset';
    resetBtn.textContent = '↻';
    resetBtn.title = 'Remettre à 1';
    const refreshScale = () => {
      const sc = PLANET_SCALES[planetKey] != null ? PLANET_SCALES[planetKey] : 1;
      slider.value = String(sc);
      value.textContent = sc.toFixed(2);
      preview.style.setProperty('--planet-scale', sc);
    };
    refreshScale();
    slider.addEventListener('input', () => {
      const sc = parseFloat(slider.value);
      PLANET_SCALES[planetKey] = sc;
      value.textContent = sc.toFixed(2);
      preview.style.setProperty('--planet-scale', sc);
    });
    resetBtn.addEventListener('click', () => {
      PLANET_SCALES[planetKey] = 1;
      refreshScale();
    });
    row.appendChild(preview);
    row.appendChild(slider);
    row.appendChild(value);
    row.appendChild(resetBtn);
    sec.appendChild(row);
  }

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('planet-info-open');
}

function closePlanetInfo() {
  const modal = document.getElementById('planet-info');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('planet-info-open');
  // Commit taille du glyphe (si modifiée) + re-render carte.
  savePlanetScales();
  render().catch(e => showError('render error: ' + e.message));
}

function wirePlanetInfo() {
  const modal = document.getElementById('planet-info');
  if (!modal) return;
  const closeBtn = modal.querySelector('.pi-close');
  closeBtn.addEventListener('click', closePlanetInfo);
  modal.addEventListener('click', ev => { if (ev.target === modal) closePlanetInfo(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !modal.hidden) closePlanetInfo();
  });

  // Délégation sur le SVG : click sur un .planet-symbol ouvre la modale.
  // Clic simple, pas pointerdown — on laisse le double-tap scrapbook intact
  // (les glyphes sont hors bande zodiacale où le scrapbook accepte la création).
  // data-ring (natal|transit) permet à la modale de pointer sur le bon corps.
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  svgEl.addEventListener('click', ev => {
    const target = ev.target.closest('.planet-symbol');
    if (!target) return;
    const key  = target.getAttribute('data-planet');
    const ring = target.getAttribute('data-ring') || 'natal';
    if (!key) return;
    openPlanetInfo(key, ring).catch(e => showError('planet modal: ' + e.message));
  });
}

function wireControls() {
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
  wireScrapItemGestures();
  wireScrapEditHandles();
  wireScrapEditExitOnBlankTap();
  wireScrapPurge();
  wireChartInteraction();
  updateChartViewBox();
  wireTimeSlider();
  wireDataExportImport();
  wireTimelineInteraction();
  wireTimelineHandle();
  wireTimelineExpandCollapse();
  wireTimelineScrapbookGestures();
  wireControlsSheet();
  wireGlyphWorkshop();
  wirePositionsModal();
  wirePlanetInfo();
  wireNatives();
  wireDrive();
  wirePullToRefresh();
}

// ---------- Pull-to-refresh (hard reload) ----------
// Workflow APK-only (OAuth navigateur bloqué sur TLD non-public) : chaque test
// = push vers prod GitHub Pages, donc il faut un geste rapide pour forcer la
// dernière version. Swipe vers le bas depuis la bande haute (y < 60 px) +
// scrollY === 0 + mono-doigt + aucune modale ouverte. Au seuil (80 px),
// unregister SW + clear caches + redirect avec ?r=timestamp (bypass cache HTTP
// du TWA).
function wirePullToRefresh() {
  const indicator = document.getElementById('pull-refresh-indicator');
  if (!indicator) return;

  const TOP_BAND = 60;
  const THRESHOLD = 80;
  const MAX_PULL = 130;

  let active = false;
  let startY = 0;
  let startX = 0;
  let readied = false;

  const isModalOpen = () => !!document.querySelector(
    '.natives-modal:not([hidden]), ' +
    '.positions-modal:not([hidden]), ' +
    '.planet-info-modal:not([hidden]), ' +
    '.glyph-workshop:not([hidden])'
  );

  const reset = () => {
    active = false;
    readied = false;
    indicator.classList.remove('ptr-ready');
    indicator.style.transition = 'transform 0.2s ease-out';
    indicator.style.transform = 'translate(-50%, -100%)';
  };

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (window.scrollY > 0) return;
    const t = e.touches[0];
    if (t.clientY > TOP_BAND) return;
    if (isModalOpen()) return;
    active = true;
    readied = false;
    startY = t.clientY;
    startX = t.clientX;
    indicator.style.transition = '';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!active) return;
    if (e.touches.length !== 1) { reset(); return; }
    const t = e.touches[0];
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;
    if (dy < 4) return;
    if (Math.abs(dx) > Math.abs(dy)) { reset(); return; }
    const pulled = dy < THRESHOLD ? dy : THRESHOLD + (dy - THRESHOLD) * 0.4;
    const yShift = Math.min(pulled, MAX_PULL) - 50;
    indicator.style.transform = `translate(-50%, ${yShift}px)`;
    const nowReady = dy >= THRESHOLD;
    if (nowReady !== readied) {
      readied = nowReady;
      indicator.classList.toggle('ptr-ready', readied);
    }
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!active) return;
    if (!readied) { reset(); return; }
    active = false;
    indicator.classList.add('ptr-spinning');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) { /* best-effort */ }
    const u = new URL(location.href);
    u.searchParams.set('r', Date.now().toString());
    location.replace(u.pathname + '?' + u.searchParams.toString() + u.hash);
  }, { passive: true });

  document.addEventListener('touchcancel', reset, { passive: true });
}

// ---------- Drive (fiches planètes sur Google Drive) ----------
// MVP ce soir : auth + sync upload des 15 fiches planètes vers astrolab/planets/
// dans le Drive du praticien. loadPlanetInfo essaie Drive d'abord, fiches vides sinon
// (sauf en dev local où content/planets/*.json gitignoré sert encore de fallback).
// Modèle salon (multi-utilisateurs, Picker, partage) à venir dans une session dédiée.

const PLANET_KEYS_FOR_SYNC = [
  'sun','moon','mercury','venus','mars','jupiter','saturn',
  'uranus','neptune','pluto','chiron','ceres','pallas','juno','node'
];

// ---------- Sync Drive : natifs + scrapbook ----------
// Modèle : Drive = source of truth dès que l'utilisateur est authentifié.
// À chaque save local, on pousse une copie sur Drive (debounced ~1,5 s pour
// absorber les rafales de drag/edit). Au boot authentifié, on compare les
// timestamps `savedAt` : si Drive est plus récent → local est remplacé par
// Drive + re-render ; sinon → Drive est écrasé par local. Pas de merge fin,
// last-write-wins — suffisant tant que Perig est seul contributeur.

let nativesSyncTimer = null;
function scheduleNativesSync(savedAt) {
  if (!Drive.isAuthenticated()) return;
  clearTimeout(nativesSyncTimer);
  nativesSyncTimer = setTimeout(async () => {
    try {
      await Drive.saveNativesToDrive({
        natives: nativesState.natives,
        currentId: nativesState.currentId,
        savedAt,
      });
    } catch (e) {
      console.warn('sync natives:', e.message);
    }
  }, 1500);
}

const scrapbookSyncTimers = new Map();  // nativeId → timeout handle
function scheduleScrapbookSync(nativeId, cleanItems, savedAt) {
  if (!Drive.isAuthenticated()) return;
  const prev = scrapbookSyncTimers.get(nativeId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(async () => {
    scrapbookSyncTimers.delete(nativeId);
    try {
      await Drive.saveScrapbookDataToDrive(nativeId, {
        items: cleanItems,
        savedAt,
      });
    } catch (e) {
      console.warn('sync scrapbook:', e.message);
    }
  }, 1500);
  scrapbookSyncTimers.set(nativeId, t);
}

// Pull depuis Drive au boot (après init auth confirmé). Compare timestamps
// et remplace local si Drive est plus récent. Si Drive n'a rien, push local
// pour amorcer le fichier distant. Re-render à la fin si le local a bougé.
async function syncFromDriveOnBoot() {
  if (!Drive.isAuthenticated()) return;
  let needRender = false;

  // --- Natifs ---
  try {
    const remote = await Drive.loadNativesFromDrive();
    const localSavedAt = parseInt(localStorage.getItem(NATIVES_SAVED_AT_KEY) || '0', 10);
    if (remote && Array.isArray(remote.natives) && remote.natives.length) {
      const remoteSavedAt = Number(remote.savedAt) || 0;
      if (remoteSavedAt > localSavedAt) {
        nativesState.natives = remote.natives;
        nativesState.currentId = remote.natives.find(n => n.id === remote.currentId)
          ? remote.currentId : remote.natives[0].id;
        localStorage.setItem(NATIVES_KEY, JSON.stringify({
          natives: nativesState.natives,
          currentId: nativesState.currentId,
        }));
        localStorage.setItem(NATIVES_SAVED_AT_KEY, String(remoteSavedAt));
        needRender = true;
      } else if (remoteSavedAt < localSavedAt) {
        scheduleNativesSync(localSavedAt);
      }
    } else {
      // Drive vide → amorce avec le local courant (même si pas encore marqué).
      const now = Date.now();
      localStorage.setItem(NATIVES_SAVED_AT_KEY, String(now));
      scheduleNativesSync(now);
    }
  } catch (e) {
    console.warn('boot sync natives:', e.message);
  }

  // --- Scrapbook du natif courant ---
  try {
    const nid = nativesState.currentId;
    const remote = await Drive.loadScrapbookDataFromDrive(nid);
    const localSavedAt = parseInt(localStorage.getItem(scrapbookSavedAtKey(nid)) || '0', 10);
    if (remote && Array.isArray(remote.items)) {
      const remoteSavedAt = Number(remote.savedAt) || 0;
      if (remoteSavedAt > localSavedAt) {
        state.scrapbook = remote.items;
        localStorage.setItem(scrapbookKey(), JSON.stringify(remote.items));
        localStorage.setItem(scrapbookSavedAtKey(nid), String(remoteSavedAt));
        needRender = true;
      } else if (remoteSavedAt < localSavedAt && state.scrapbook.length) {
        const clean = state.scrapbook.map(it => {
          const out = {};
          for (const [k, v] of Object.entries(it)) if (!k.startsWith('_')) out[k] = v;
          return out;
        });
        scheduleScrapbookSync(nid, clean, localSavedAt);
      }
    } else if (state.scrapbook.length) {
      const now = Date.now();
      const clean = state.scrapbook.map(it => {
        const out = {};
        for (const [k, v] of Object.entries(it)) if (!k.startsWith('_')) out[k] = v;
        return out;
      });
      localStorage.setItem(scrapbookSavedAtKey(nid), String(now));
      scheduleScrapbookSync(nid, clean, now);
    }
  } catch (e) {
    console.warn('boot sync scrapbook:', e.message);
  }

  if (needRender) {
    try { await render(); } catch (e) { showError('render after Drive sync: ' + e.message); }
  }
}

// Migration one-shot : les blobs scrapbook et l'ancien <nativeId>.json qui
// vivent à plat sous astrolab/scrapbook/ sont déplacés vers le sous-dossier
// astrolab/scrapbook/<nativeId>/. Posé après que syncFromDriveOnBoot a tiré
// les natifs distants (pour maximiser les chances d'avoir la map complète
// fileId→nativeId). Marqueur localStorage pour ne tenter qu'une fois par
// device une fois complété proprement.
const SCRAP_BLOBS_MIGRATED_KEY = 'astrolab.scrapbook.subfoldersMigrated';
async function migrateScrapbookToSubfolders() {
  if (!Drive.isAuthenticated()) return;
  if (localStorage.getItem(SCRAP_BLOBS_MIGRATED_KEY) === 'true') return;

  // Construit la map fileId → nativeId depuis TOUS les scrapbooks locaux
  // (le natif courant + les autres natifs via leurs clés localStorage scopées).
  const fileToNative = new Map();
  for (const n of nativesState.natives) {
    try {
      const raw = localStorage.getItem(SCRAPBOOK_KEY_PREFIX + n.id);
      if (!raw) continue;
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (it.thumbFileId) fileToNative.set(it.thumbFileId, n.id);
        if (it.fullFileId)  fileToNative.set(it.fullFileId,  n.id);
      }
    } catch {}
  }

  let listing;
  try {
    listing = await Drive.listScrapbookRootFiles();
  } catch (e) {
    console.warn('migration scrapbook : listing échoué :', e.message);
    return;
  }
  const { folderId: scrapRootId, files } = listing;
  if (!scrapRootId || !files.length) {
    localStorage.setItem(SCRAP_BLOBS_MIGRATED_KEY, 'true');
    return;
  }

  let allAccountedFor = true;
  let moved = 0;
  for (const f of files) {
    // Ancien JSON à plat : <nativeId>.json → bascule vers <nativeId>/data.json.
    const legacyJsonMatch = f.name.match(/^(.+)\.json$/);
    if (legacyJsonMatch && f.mimeType === 'application/json') {
      const nid = legacyJsonMatch[1];
      if (!nativesState.natives.find(n => n.id === nid)) {
        allAccountedFor = false;
        continue;
      }
      try {
        // loadScrapbookDataFromDrive retombe sur l'ancien emplacement via
        // fallback tant que data.json n'existe pas dans le sous-dossier.
        const data = await Drive.loadScrapbookDataFromDrive(nid);
        if (data) await Drive.saveScrapbookDataToDrive(nid, data);
        await Drive.deleteDriveFileStrict(f.id);
        moved++;
      } catch (e) {
        console.warn('migration JSON scrapbook', f.name, ':', e.message);
        allAccountedFor = false;
      }
      continue;
    }
    // Blob : on cherche son propriétaire via la map locale.
    const nid = fileToNative.get(f.id);
    if (!nid) { allAccountedFor = false; continue; }
    try {
      const subFolder = await Drive.ensureNativeScrapbookFolder(nid);
      await Drive.moveFile(f.id, subFolder, scrapRootId);
      moved++;
    } catch (e) {
      console.warn('migration blob', f.name, ':', e.message);
      allAccountedFor = false;
    }
  }
  if (allAccountedFor) {
    localStorage.setItem(SCRAP_BLOBS_MIGRATED_KEY, 'true');
  }
  if (moved) console.info(`migration scrapbook : ${moved} fichier(s) déplacé(s)`);
}

function wireDrive() {
  const toggleBtn = document.getElementById('drive-toggle');
  const menu = document.getElementById('drive-menu');
  const statusEl = document.getElementById('drive-menu-status');
  const signinBtn = document.getElementById('drive-signin');
  const syncBtn = document.getElementById('drive-sync');
  const signoutBtn = document.getElementById('drive-signout');
  if (!toggleBtn || !menu) return;

  function refreshUI(authed) {
    toggleBtn.classList.toggle('connected', authed);
    toggleBtn.textContent = authed ? '☁ drive ✓' : '☁ drive';
    statusEl.textContent = authed ? 'connecté — fiches lues depuis Drive' : 'non connecté — connecte-toi pour afficher tes fiches';
    signinBtn.hidden = authed;
    syncBtn.hidden = !authed;
    signoutBtn.hidden = !authed;
    // Vide le cache pour que les prochaines ouvertures de fiche relisent la source
    planetInfoCache.clear();
    if (authed) {
      syncFromDriveOnBoot()
        .then(() => migrateScrapbookToSubfolders())
        .catch(e => console.warn('Drive sync/migration:', e.message));
    }
  }

  Drive.initDrive(refreshUI).catch(e => {
    statusEl.textContent = 'Erreur init : ' + e.message;
  });

  toggleBtn.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
  });

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (menu.contains(e.target) || toggleBtn.contains(e.target)) return;
    menu.hidden = true;
  });

  signinBtn.addEventListener('click', async () => {
    try {
      statusEl.textContent = 'connexion…';
      await Drive.signIn();
    } catch (e) {
      statusEl.textContent = 'Erreur : ' + e.message;
    }
  });

  syncBtn.addEventListener('click', async () => {
    if (!confirm(`Uploader les ${PLANET_KEYS_FOR_SYNC.length} fiches planètes locales vers ton Drive ?\n\nCela remplacera les fiches existantes dans astrolab/planets/ si elles sont déjà là.`)) return;
    const fetchLocalRawText = async (key) => {
      const res = await fetch(`content/planets/${key}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${key}.json : HTTP ${res.status}`);
      return res.text();
    };
    try {
      syncBtn.disabled = true;
      await Drive.syncPlanetsToDrive(PLANET_KEYS_FOR_SYNC, fetchLocalRawText, (i, n, k) => {
        statusEl.textContent = `sync ${i}/${n} (${k})…`;
      });
      statusEl.textContent = 'sync terminée — fiches à présent sur Drive';
      planetInfoCache.clear();
    } catch (e) {
      statusEl.textContent = 'Erreur sync : ' + e.message;
    } finally {
      syncBtn.disabled = false;
    }
  });

  signoutBtn.addEventListener('click', () => {
    if (!confirm('Déconnecter Drive ? Les fiches planètes ne seront plus affichées.')) return;
    Drive.signOut();
  });
}

// Modale positions planétaires : extraite du sheet 2026-10-14 pour laisser
// place à la frise. Ouverte depuis #positions-open dans le header fixé en
// haut à gauche. Backdrop + ESC + bouton close. Même pattern que la glyph-
// workshop en plus simple (pas d'état à sauver).
function wirePositionsModal() {
  const openBtn  = document.getElementById('positions-open');
  const modal    = document.getElementById('positions-modal');
  if (!openBtn || !modal) return;
  const closeBtn = modal.querySelector('.positions-close');

  const close = () => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('positions-modal-open');
  };
  const open = () => {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('positions-modal-open');
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  // Clic sur backdrop (pas sur le panel) ferme aussi.
  modal.addEventListener('click', ev => { if (ev.target === modal) close(); });
  // ESC ferme si ouverte.
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !modal.hidden) close();
  });
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

  // Restaure dernier état (collapsed par défaut depuis 2026-10-14 : la frise
  // vit dans le sheet, l'état initial le laisse replié pour maximiser l'espace
  // consacré au cercle — Perig déplie à la demande pour naviguer entre moments).
  const saved = (() => { try { return localStorage.getItem('astrolab.sheet.state'); } catch (e) { return null; } })();
  setSheetState(sheet, SHEET_STATES.includes(saved) ? saved : 'collapsed');

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
      state.timeline.palier = 'day';
      state.timeline.tlCenter = null;
      state.timeline.vCenter = null;
      updatePalierLabel();
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
      '• Défaut : https://astrolab-ephe.periggouanvic.deno.net/\n' +
      '• Ton propre Deno Deploy : https://<toi>.deno.net/\n\n' +
      'Laisse vide pour restaurer le défaut.',
      current
    );
    if (next === null) return;
    if (next.trim() === '') localStorage.removeItem('astrolab.proxyUrl');
    else localStorage.setItem('astrolab.proxyUrl', next.trim());
    location.reload();
  });
}

// ---------- Natifs : bascule, CRUD, UI ----------
// Switch de natif : persiste l'état courant (déjà en autosave sur chaque
// mutation), bascule currentId, recharge scrapbook/planet-notes depuis les
// clés scopées du nouveau natif, re-remonte les astéroïdes (globaux donc
// inchangés) et re-render. chartTime (transit) et préférences utilisateur
// sont conservés.
async function switchNative(id) {
  const target = nativesState.natives.find(n => n.id === id);
  if (!target || id === nativesState.currentId) return;
  nativesState.currentId = id;
  saveNatives();
  state.scrapbook = JSON.parse(localStorage.getItem(scrapbookKey()) || '[]');
  loadPlanetNotes();
  // Les migrations de scrapbook sont scopées sur state.scrapbook ; sûres à
  // re-exécuter sur un nouveau tableau.
  migrateScrapbookItems();
  migrateScrapbookLon();
  await render();
  // Pull Drive en arrière-plan pour le scrapbook du nouveau natif (si plus
  // récent côté distant, remplacer local + re-render). Non bloquant.
  syncScrapbookForCurrentNative();
}

// Pull Drive pour le scrapbook du natif courant uniquement. Appelé au switch
// de natif pour s'assurer qu'on affiche la dernière version distante quand
// elle est plus récente.
async function syncScrapbookForCurrentNative() {
  if (!Drive.isAuthenticated()) return;
  const nid = nativesState.currentId;
  try {
    const remote = await Drive.loadScrapbookDataFromDrive(nid);
    if (!remote || !Array.isArray(remote.items)) return;
    const localSavedAt = parseInt(localStorage.getItem(scrapbookSavedAtKey(nid)) || '0', 10);
    const remoteSavedAt = Number(remote.savedAt) || 0;
    if (remoteSavedAt > localSavedAt && nid === nativesState.currentId) {
      state.scrapbook = remote.items;
      localStorage.setItem(scrapbookKey(), JSON.stringify(remote.items));
      localStorage.setItem(scrapbookSavedAtKey(nid), String(remoteSavedAt));
      await render();
    }
  } catch (e) {
    console.warn('syncScrapbookForCurrentNative:', e.message);
  }
}

function addNative(data) {
  const n = {
    id: genId(),
    name:       (data.name || '').trim() || 'Natif sans nom',
    date:       data.date,
    time:       data.time,
    tzOffset:   Number(data.tzOffset) || 0,
    latitude:   Number(data.latitude)  || 0,
    longitude:  Number(data.longitude) || 0,
    placeLabel: (data.placeLabel || '').trim() || 'Lieu inconnu',
  };
  nativesState.natives.push(n);
  saveNatives();
  return n;
}

function updateNative(id, patch) {
  const idx = nativesState.natives.findIndex(n => n.id === id);
  if (idx < 0) return;
  const prev = nativesState.natives[idx];
  nativesState.natives[idx] = {
    ...prev,
    ...patch,
    tzOffset:   patch.tzOffset  !== undefined ? Number(patch.tzOffset)  : prev.tzOffset,
    latitude:   patch.latitude  !== undefined ? Number(patch.latitude)  : prev.latitude,
    longitude:  patch.longitude !== undefined ? Number(patch.longitude) : prev.longitude,
  };
  saveNatives();
}

function deleteNative(id) {
  if (nativesState.natives.length <= 1) return false;  // garder au moins un natif
  // Nettoie les clés scopées de ce natif.
  localStorage.removeItem(SCRAPBOOK_KEY_PREFIX    + id);
  localStorage.removeItem(PLANET_NOTES_KEY_PREFIX + id);
  nativesState.natives = nativesState.natives.filter(n => n.id !== id);
  if (nativesState.currentId === id) {
    nativesState.currentId = nativesState.natives[0].id;
  }
  saveNatives();
  return true;
}

function wireNatives() {
  const title    = document.getElementById('chart-title');
  const modal    = document.getElementById('natives-modal');
  const closeBtn = modal && modal.querySelector('.natives-close');
  const listEl   = modal && modal.querySelector('.natives-list');
  const addBtn   = modal && modal.querySelector('.natives-add-btn');
  const formWrap = modal && modal.querySelector('.natives-form-wrap');
  const form     = modal && modal.querySelector('form.natives-form');
  const formTitle = modal && modal.querySelector('.natives-form-title');
  const cancelBtn = modal && modal.querySelector('.natives-form-cancel');
  const deleteBtn = modal && modal.querySelector('.natives-form-delete');
  if (!title || !modal || !listEl || !addBtn || !form) return;

  // Rend `#chart-title` cliquable comme switcher.
  title.classList.add('natives-switcher');
  title.setAttribute('role', 'button');
  title.setAttribute('tabindex', '0');
  title.setAttribute('aria-label', 'Choisir ou gérer un natif');

  let editingId = null;  // null = création, string = édition

  function renderList() {
    listEl.innerHTML = '';
    for (const n of nativesState.natives) {
      const row = document.createElement('div');
      row.className = 'natives-row';
      if (n.id === nativesState.currentId) row.classList.add('is-current');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'natives-row-pick';
      btn.innerHTML = `<span class="natives-row-name">${escapeHtml(n.name)}</span>
                       <span class="natives-row-info">${escapeHtml(formatNativeInfo(n))}</span>`;
      btn.addEventListener('click', async () => {
        await switchNative(n.id);
        close();
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'natives-row-edit';
      editBtn.setAttribute('aria-label', `Modifier ${n.name}`);
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => openForm(n.id));
      row.appendChild(btn);
      row.appendChild(editBtn);
      listEl.appendChild(row);
    }
  }

  function openForm(id) {
    editingId = id;
    const n = id ? nativesState.natives.find(x => x.id === id) : null;
    formTitle.textContent = n ? 'Modifier le natif' : 'Nouveau natif';
    form.name.value       = n ? n.name       : '';
    form.date.value       = n ? n.date       : '';
    form.time.value       = n ? n.time       : '';
    form.tzOffset.value   = n ? n.tzOffset   : 0;
    form.latitude.value   = n ? n.latitude   : '';
    form.longitude.value  = n ? n.longitude  : '';
    form.placeLabel.value = n ? n.placeLabel : '';
    deleteBtn.hidden = !n || nativesState.natives.length <= 1;
    formWrap.hidden = false;
    listEl.hidden   = true;
    addBtn.hidden   = true;
    form.name.focus();
  }

  function closeForm() {
    editingId = null;
    formWrap.hidden = true;
    listEl.hidden   = false;
    addBtn.hidden   = false;
  }

  function open() {
    renderList();
    closeForm();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }
  function close() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  title.addEventListener('click', open);
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  const sheetBtn = document.getElementById('natives-open');
  if (sheetBtn) sheetBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  addBtn.addEventListener('click', () => openForm(null));
  cancelBtn.addEventListener('click', closeForm);

  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    const n = nativesState.natives.find(x => x.id === editingId);
    if (!n) return;
    if (!confirm(`Supprimer « ${n.name} » et tout son scrapbook ? Irréversible.`)) return;
    const wasCurrent = editingId === nativesState.currentId;
    const ok = deleteNative(editingId);
    if (!ok) return;
    if (wasCurrent) {
      // Après suppression de l'actif, forcer rechargement des contenus scopés.
      state.scrapbook = JSON.parse(localStorage.getItem(scrapbookKey()) || '[]');
      loadPlanetNotes();
      migrateScrapbookItems();
      migrateScrapbookLon();
      await render();
      syncScrapbookForCurrentNative();
    }
    renderList();
    closeForm();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      name:       form.name.value,
      date:       form.date.value,
      time:       form.time.value,
      tzOffset:   form.tzOffset.value,
      latitude:   form.latitude.value,
      longitude:  form.longitude.value,
      placeLabel: form.placeLabel.value,
    };
    if (!data.date || !data.time) {
      alert('Date et heure sont requises.');
      return;
    }
    if (editingId) {
      updateNative(editingId, data);
      if (editingId === nativesState.currentId) await render();
    } else {
      const n = addNative(data);
      await switchNative(n.id);
    }
    renderList();
    closeForm();
    close();
  });
}

// Version JS dérivée du query param ?v=N de l'import HTML — source unique.
// Évite que le badge mente quand on bump index.html sans toucher cette constante.
const JS_V = new URL(import.meta.url).searchParams.get('v') || '?';

async function main() {
  const probe = document.getElementById('boot-probe');
  const setProbe = (txt, color) => {
    if (!probe) return;
    probe.textContent = txt;
    if (color) { probe.style.background = color; probe.style.color = '#fff'; }
  };
  setProbe(`astrolab v${JS_V} — chargement Swiss Ephemeris…`);
  await initSwe();
  setProbe(`astrolab v${JS_V} — Swiss Ephemeris OK, init…`);
  loadPlanetScales();
  loadPlanetNotes();
  migrateScrapbookItems();
  migrateScrapbookLon();
  wireControls();
  await loadJalons();
  await remountSavedAsteroids();
  await render();
  // Tâche de fond, après le premier render : libère le quota si des images ont
  // été importées avant le redimensionnement. N'attend pas — l'écran est déjà
  // peint, la recompression se fait en silence puis re-render si elle a gagné.
  recompressScrapbookImages().catch(e => console.warn('recompress:', e.message));
  if (probe) {
    // Transforme le probe en badge version permanent (coin bas-droit).
    // Affiche à la fois la version JS et CSS pour détecter les désynchros
    // de cache (Brave en particulier cache le CSS indépendamment du JS).
    const CSS_EXPECTED = 61;
    const cssVRaw = getComputedStyle(document.documentElement)
      .getPropertyValue('--css-version').trim().replace(/^"|"$/g, '');
    const cssV = cssVRaw || '?';
    const synced = String(CSS_EXPECTED) === cssV;
    probe.textContent = synced
      ? `v${JS_V} / css${cssV}`
      : `⚠ v${JS_V} / css${cssV} (attendu ${CSS_EXPECTED})`;
    probe.style.cssText = 'position:fixed;bottom:4px;right:6px;left:auto;top:auto;'
      + `z-index:9999;background:${synced ? 'rgba(0,0,0,0.35)' : 'rgba(180,40,40,0.85)'};color:#fff;`
      + 'padding:1px 5px;font-family:ui-monospace,monospace;font-size:10px;'
      + 'line-height:1.3;border-radius:2px;pointer-events:none;';
  }
}

main().catch(e => showError('main() error: ' + (e.stack || e.message || e)));
