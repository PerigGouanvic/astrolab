// astrolab — strate 2 : Swiss Ephemeris + astéroïdes à la demande
//   - Sun→Pluto + Chiron + Ceres/Pallas/Juno/Vesta
//   - Astéroïdes MPC arbitraires (fetch à la demande via proxy CORS)
//   - Modes maintenant / natal
//   - Couches soustractives : signes, maisons, planètes, mi-points, astéroïdes, aspects
//   - Aspects majeurs (conjonction, opposition, trigone, carré, sextile)
//   - Rétrogrades ℞

// Source Google Drive pour les fiches planètes (modèle salon à venir).
// Fallback transparent vers content/planets/ bundled si pas connecté.
import * as Drive from './drive.js?v=1';

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

function saveNatives() {
  localStorage.setItem(NATIVES_KEY, JSON.stringify({
    natives: nativesState.natives,
    currentId: nativesState.currentId,
  }));
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
const R_MIDPOINT_IN  = R_ZODIAC_IN - 8;  // ticks mi-points côté natal
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

  // Mi-points natal (ticks fins côté intérieur de la bande, anneau natal only)
  if (layers.midpoints && layers.planets) {
    for (const m of computeMidpoints(natal.bodies)) {
      const t1 = project(m.lon, ascLon, R_ZODIAC_IN);
      const t2 = project(m.lon, ascLon, R_MIDPOINT_IN);
      container.appendChild(svg('line', { x1: t1.x, y1: t1.y, x2: t2.x, y2: t2.y, class: 'midpoint-tick' }));
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

// Rayon de base du disque "collapsed" avant application du scale par item.
const SCRAP_DOT_BASE_R = 6;
// Rayon où se place le centre du cadre quand l'item est déployé — à
// l'intérieur du cercle, assez éloigné de la bande pour que le cadre tienne
// sans mordre les signes. Le cadre reste axis-aligned (texte lisible), la
// pointe de la goutte s'oriente dynamiquement vers lui.
const SCRAP_FRAME_CENTER_R = 280;

// Un seul <path> SVG pour la "signature" de l'item : cercle quand collapsed,
// goutte avec pointe vers le cadre quand expanded. L'ouverture est un
// changement de forme, pas l'apparition d'un triangle séparé.
function drawScrapDot(container, it, dotRadius, dotCenter, expanded, pointDir) {
  let d;
  if (!expanded) {
    // Cercle plein via deux arcs semi-circulaires.
    const r = dotRadius;
    const cx = dotCenter.x, cy = dotCenter.y;
    d = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
  } else {
    // Goutte : cercle à l'arrière + deux tangentes qui se rejoignent en pointe
    // à `tailLen` au-delà du centre dans la direction du cadre. Formules
    // standard d'une "pin SVG" classique.
    const R = dotRadius;
    const tailLen = R * 3;  // pointe modérément allongée
    const D = R + tailLen;  // distance centre → apex
    const dx = pointDir.x, dy = pointDir.y;  // direction unitaire vers cadre
    const sinA = R / D;
    const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
    const pR = R * sinA;      // projection des points de tangence sur dx,dy
    const pP = R * cosA;      // sur la perpendiculaire
    const cx = dotCenter.x, cy = dotCenter.y;
    const apexX = cx + dx * D;
    const apexY = cy + dy * D;
    // Perpendiculaire à (dx, dy) : (-dy, dx).
    const tLx = cx + dx * pR + (-dy) * pP;
    const tLy = cy + dy * pR +  dx  * pP;
    const tRx = cx + dx * pR - (-dy) * pP;
    const tRy = cy + dy * pR -  dx  * pP;
    d = `M ${apexX} ${apexY} L ${tLx} ${tLy} A ${R} ${R} 0 1 1 ${tRx} ${tRy} Z`;
  }
  const dot = svg('path', {
    d,
    class: 'scrap-dot' + (expanded ? ' scrap-dot-active' : ''),
    'data-id': it.id,
  });
  container.appendChild(dot);
}

// ---------- Scrapbook : rendu d'un item ----------
function drawScrapItem(container, it) {
  // Position du disque toujours CLAMPÉE dans la bande, quel que soit le
  // radius persisté — anciens items (créés avant le pivot 2026-10-13) avaient
  // des radius variés ; au rendu on les ramène sur la couronne.
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const rawR   = it.radius != null ? it.radius : (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
  const dotR   = Math.max(R_ZODIAC_IN, Math.min(R_ZODIAC_OUT, rawR));
  const dotCenter = project(it.lon != null ? it.lon : 0, ascLon, dotR);
  const scale    = it.scale || 1;
  const dotPixR  = SCRAP_DOT_BASE_R * scale;

  // Direction unitaire du disque VERS LE CENTRE du cercle = direction de la
  // pointe de goutte quand expanded (le cadre est à l'intérieur).
  const centerDist = Math.hypot(dotCenter.x, dotCenter.y) || 1;
  const dirX = -dotCenter.x / centerDist;
  const dirY = -dotCenter.y / centerDist;

  // Disque toujours rendu — cercle en collapsed, goutte en expanded. Même
  // path qui change de forme, pas d'ajout d'un triangle séparé.
  drawScrapDot(container, it, dotPixR, dotCenter, !!it._expanded, { x: dirX, y: dirY });

  if (!it._expanded) return;

  // Cadre déployé : placé à l'intérieur du cercle, axis-aligned, sur le même
  // rayon que le disque mais à SCRAP_FRAME_CENTER_R du centre.
  const frameCenter = project(it.lon != null ? it.lon : 0, ascLon, SCRAP_FRAME_CENTER_R);
  it.x = frameCenter.x - it.width / 2;
  it.y = frameCenter.y - it.height / 2;

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
      if (Date.now() < (it._graceUntil || 0)) return;
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
const TL_ZOOM_MAX = 500;

// Fenêtre VISIBLE sur la frise, dérivée du zoom et du centre de pan. zoom=1 +
// pas de pan → fenêtre de référence (fullTimelineRange). Pas de clamp : pan
// et zoom peuvent amener la fenêtre où le natif veut, y compris hors de la
// fenêtre sondée (courbes finissent au bord des bornes de sampling).
function timelineRange() {
  const full = fullTimelineRange();
  const zoom = Math.max(TL_ZOOM_MIN, Math.min(TL_ZOOM_MAX, state.timeline?.zoom || 1));
  const fullSpan = full.endMs - full.startMs;
  const visibleSpan = fullSpan / zoom;
  // Centre : tlCenter (posé par pan) sinon chartTime sinon maintenant. Au
  // chargement initial (zoom=1, pas de pan, pas de chartTime), on vise
  // "maintenant" pour que l'utilisateur voie son présent au centre plutôt
  // que l'anchorage à mi-vie-de-référence.
  const center = state.timeline?.tlCenter != null
    ? state.timeline.tlCenter
    : (state.chartTime != null ? state.chartTime : Date.now());

  const startMs = center - visibleSpan / 2;
  const endMs   = center + visibleSpan / 2;

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
        x, y: TL_MARGIN_T + TL_PLOT_H + 20, class: 'tl-year-label',
      }, String(y)));
    }
  }

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
  if (state.layers.scrapbook) {
    for (const it of state.scrapbook) {
      // Items scope='natal' sont hors frise : lieu permanent du natal,
      // pas de dimension temporelle à afficher. Les items legacy sans scope
      // sont 'timed' par défaut (comportement d'avant la refonte préservé).
      if ((it.scope || 'timed') === 'natal') continue;
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
  const ensureTl = () => { if (!state.timeline) state.timeline = { zoom: 1 }; };

  // Pan : 1 doigt / clic gauche / clic milieu — tous font pareil (pan).
  let panStartClientX = null;
  let panStartCenter  = null;

  svgEl.addEventListener('pointerdown', ev => {
    if (isPinching) return;
    ev.preventDefault();
    svgEl.setPointerCapture(ev.pointerId);
    const range = timelineRange();
    panStartClientX = ev.clientX;
    panStartCenter  = state.timeline?.tlCenter != null
      ? state.timeline.tlCenter
      : (range.startMs + range.endMs) / 2;
  });
  svgEl.addEventListener('pointermove', ev => {
    if (panStartClientX == null || isPinching) return;
    const range = timelineRange();
    const dxSvg = svgXFromClient(ev.clientX) - svgXFromClient(panStartClientX);
    const msPerSvg = (range.endMs - range.startMs) / TL_PLOT_W;
    ensureTl();
    state.timeline.tlCenter = panStartCenter - dxSvg * msPerSvg;
    scheduleTimelineRender();
  });
  const stop = () => {
    panStartClientX = null;
    panStartCenter  = null;
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
      panStartClientX = null;
      panStartCenter  = null;
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
  const legacyScrap = localStorage.getItem('astrolab.scrapbook');
  const scopedScrap = localStorage.getItem(SCRAPBOOK_KEY_PREFIX + PERIG_SEED.id);
  if (legacyScrap !== null && scopedScrap === null) {
    localStorage.setItem(SCRAPBOOK_KEY_PREFIX + PERIG_SEED.id, legacyScrap);
    localStorage.removeItem('astrolab.scrapbook');
  }
  const legacyNotes = localStorage.getItem('astrolab.planet-notes');
  const scopedNotes = localStorage.getItem(PLANET_NOTES_KEY_PREFIX + PERIG_SEED.id);
  if (legacyNotes !== null && scopedNotes === null) {
    localStorage.setItem(PLANET_NOTES_KEY_PREFIX + PERIG_SEED.id, legacyNotes);
    localStorage.removeItem('astrolab.planet-notes');
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
  timeline: { zoom: 20 },  // zoom frise, 1 = toute la vie (200 ans), 20 = ~10 ans pleine largeur
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
function saveScrapbook()   {
  const clean = state.scrapbook.map(it => {
    const out = {};
    for (const [k, v] of Object.entries(it)) if (!k.startsWith('_')) out[k] = v;
    return out;
  });
  localStorage.setItem(scrapbookKey(), JSON.stringify(clean));
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
  // Dimensions par défaut modestes — la note démarre petite, l'utilisateur
  // étire via la poignée ⇲ (ratio libre, le texte scale avec la surface).
  const width = 120, height = 50;
  // Longitude écliptique dérivée de la position du tap et de l'ascendant
  // courant. Permet de placer l'item sur la frise à la hauteur du signe
  // correspondant à sa position angulaire dans la roue.
  const ascLon = state.currentAscLon != null ? state.currentAscLon : 0;
  const lon    = xyToLon(x, y, ascLon);
  // Pivot 2026-10-13 : l'item s'ancre dans la bande zodiacale, pas où le
  // tap a eu lieu. (lon, radius) deviennent primaires ; (x, y) sont
  // recalculés pour centrer le cadre sur la bande.
  const radius = (R_ZODIAC_IN + R_ZODIAC_OUT) / 2;
  const center = project(lon, ascLon, radius);
  x = center.x;
  y = center.y;
  // Horodatage = chartTime affiché (sinon maintenant). Permet de "revenir
  // dans le passé" via la frise ou le slider et déposer un item au moment
  // qu'on regarde, pas au moment du geste physique. Sans ça, les items
  // créés en mode scrubber s'accumulaient tous à "maintenant" et devenaient
  // invisibles tant qu'on restait dans le passé.
  const stamp = state.chartTime != null ? state.chartTime : Date.now();
  // Bi-wheel : par défaut l'item s'ancre au thème (scope 'natal'), lieu
  // permanent hors frise. Le ré-ancrage à un moment précis (scope 'timed')
  // reste possible via un futur geste dédié ; en v1 bi-wheel on privilégie
  // l'inscription dans le thème.
  const scope = 'natal';
  const item = {
    id: genId(),
    createdAt: stamp,
    updatedAt: stamp,
    x: x - width / 2,
    y: y - height / 2,
    width, height,
    lon,
    radius,
    scale: 1,
    text: '',
    scope,
    _expanded: true,     // RAM-only : nouveau né s'ouvre pour l'édition
    _graceUntil: Date.now() + 3000,  // RAM-only : empêche l'auto-suppression
                                     // par blur-sur-vide pendant 3s après
                                     // création (le focus() programmatique
                                     // sur contenteditable peut déclencher
                                     // un blur immédiat sur certains browsers).
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
const CHART_ZOOM_MAX = 50;

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
// Deux pointerdown sur le SVG à moins de 400 ms l'un de l'autre = créer un
// item à la position (moyennée pour lisser). Ignoré si la cible est un item
// existant ou un contrôle interactif à l'intérieur du chart.
function wireScrapbookGestures() {
  const svgEl = document.getElementById('chart');
  if (!svgEl) return;
  let lastTap = 0;
  let lastPt  = null;
  let lastTouchPointerAt = 0;  // dédup touch → mouse synthétique (~300 ms)
  svgEl.addEventListener('pointerdown', ev => {
    // Les navigateurs mobiles émettent un pointerdown "mouse" synthétique
    // ~300 ms après un pointerdown "touch", par compatibilité legacy. Ce
    // synthétique faisait disparaître les items fraîchement créés : il tombe
    // à côté du disque, entre dans la branche "collapse all" et replie
    // immédiatement l'item que le double-tap venait de déployer.
    if (ev.pointerType === 'mouse' && Date.now() - lastTouchPointerAt < 600) return;
    if (ev.pointerType === 'touch') lastTouchPointerAt = Date.now();
    // Clic sur un disque → toggle. Si l'item est déjà déployé, le disque
    // sert de bouton de fermeture ; sinon il déploie (et replie les autres).
    if (ev.target.classList && ev.target.classList.contains('scrap-dot')) {
      const id = ev.target.getAttribute('data-id');
      const target = state.scrapbook.find(x => x.id === id);
      const willExpand = !(target && target._expanded);
      for (const it of state.scrapbook) {
        it._expanded = willExpand && it.id === id;
      }
      render().catch(e => showError('render error: ' + e.message));
      lastTap = 0; lastPt = null;
      return;
    }
    // Ignorer si sur un item déjà déployé ou un contrôle intérieur au chart.
    if (ev.target.closest('.scrap-fo, foreignObject')) return;

    // Clic ailleurs sur le chart : replier tous les items ouverts. Le blur du
    // contenteditable (déclenché par la perte de focus) va sauver via
    // updateScrapItem(..., skipRender=true) avant que render() recrée le DOM.
    const hadExpanded = state.scrapbook.some(it => it._expanded);
    if (hadExpanded) {
      for (const it of state.scrapbook) it._expanded = false;
    }

    const now = Date.now();
    const pt  = screenToSvg(svgEl, ev.clientX, ev.clientY);
    // Création uniquement si le tap tombe dans la bande zodiacale. Ailleurs,
    // on ignore (pas de projection depuis le centre : le geste doit viser le
    // lieu d'inscription, c'est la bande qui est le support).
    const r = Math.hypot(pt.x, pt.y);
    if (r < R_ZODIAC_IN || r > R_ZODIAC_OUT) {
      lastTap = 0;
      lastPt  = null;
      if (hadExpanded) render().catch(e => showError('render error: ' + e.message));
      return;
    }
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
      if (hadExpanded) render().catch(e => showError('render error: ' + e.message));
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
    catch (e) { console.warn('Drive loadPlanet échec, fallback bundled :', e.message); }
  }
  if (!data) {
    const res = await fetch(`content/planets/${key}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`content/planets/${key}.json : HTTP ${res.status}`);
    data = await res.json();
  }
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
    renderSourcesInto(sec, data.archetype, 'Aucune source pour l’archétype — ajoute une entrée dans ' + `content/planets/${planetKey}.json → "archetype".`);
  }

  // 2 · Planète en signe (si contexte dispo)
  if (signIdx != null) {
    const signKey = SIGN_KEYS[signIdx];
    const sec = addSection(`${label} en ${SIGN_LABELS_FR[signIdx]}`);
    renderSourcesInto(sec, (data.inSign || {})[signKey], `Aucune source pour ${label} en ${SIGN_LABELS_FR[signIdx]} — ajoute une entrée dans ` + `content/planets/${planetKey}.json → "inSign.${signKey}".`);
  }

  // 3 · Planète en maison (si contexte dispo)
  if (houseNum != null) {
    const sec = addSection(`${label} en maison ${HOUSE_ROMAN[houseNum - 1]}`);
    renderSourcesInto(sec, (data.inHouse || {})[String(houseNum)], `Aucune source pour ${label} en maison ${HOUSE_ROMAN[houseNum - 1]} — ajoute une entrée dans ` + `content/planets/${planetKey}.json → "inHouse.${houseNum}".`);
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
  wireScrapPurge();
  wireChartInteraction();
  updateChartViewBox();
  wireTimeSlider();
  wireDataExportImport();
  wireTimelineInteraction();
  wireTimelineHandle();
  wireControlsSheet();
  wireGlyphWorkshop();
  wirePositionsModal();
  wirePlanetInfo();
  wireNatives();
  wireDrive();
}

// ---------- Drive (fiches planètes sur Google Drive) ----------
// MVP ce soir : auth + sync upload des 15 fiches planètes vers astrolab/planets/
// dans le Drive du praticien. loadPlanetInfo essaie Drive d'abord, fallback bundled.
// Modèle salon (multi-utilisateurs, Picker, partage) à venir dans une session dédiée.

const PLANET_KEYS_FOR_SYNC = [
  'sun','moon','mercury','venus','mars','jupiter','saturn',
  'uranus','neptune','pluto','chiron','ceres','pallas','juno','node'
];

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
    statusEl.textContent = authed ? 'connecté — fiches lues depuis Drive' : 'non connecté — fiches lues depuis bundled';
    signinBtn.hidden = authed;
    syncBtn.hidden = !authed;
    signoutBtn.hidden = !authed;
    // Vide le cache pour que les prochaines ouvertures de fiche relisent la source
    planetInfoCache.clear();
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
    if (!confirm('Déconnecter Drive ? L\'app repassera sur les fiches bundled.')) return;
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

async function main() {
  const probe = document.getElementById('boot-probe');
  const setProbe = (txt, color) => {
    if (!probe) return;
    probe.textContent = txt;
    if (color) { probe.style.background = color; probe.style.color = '#fff'; }
  };
  setProbe('astrolab v70 — chargement Swiss Ephemeris…');
  await initSwe();
  setProbe('astrolab v70 — Swiss Ephemeris OK, init…');
  loadPlanetScales();
  loadPlanetNotes();
  migrateScrapbookItems();
  migrateScrapbookLon();
  wireControls();
  await loadJalons();
  await remountSavedAsteroids();
  await render();
  if (probe) {
    // Transforme le probe en badge version permanent (coin bas-droit).
    // Affiche à la fois la version JS et CSS pour détecter les désynchros
    // de cache (Brave en particulier cache le CSS indépendamment du JS).
    const JS_V = 70;
    const CSS_EXPECTED = 58;
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
