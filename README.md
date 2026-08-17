# astrolab

**Statut** : actif — strate 1 (socle épuré) en ligne. Nom stabilisé 2026-08-17 (ex-`_astro/`).

**Intention** : Logiciel d'astrologie épuré avec deux enrichissements **distincts** — (a) calcul des **mi-points** entre corps, (b) intégration d'un large corpus d'**astéroïdes**. Visualisations soustractives (planètes×maisons sans signes ; aspects seuls, sans autre considération). Journal utilisateur pour indexer des événements vécus à des positions/moments.

**Pas de LLM pour l'analyse** dans un premier temps — on privilégie la soustraction et le journal.

## App

Fichiers à la racine du repo (contrainte GitHub Pages) : `index.html`, `style.css`, `app.js`. Version web statique HTML+SVG+JS pur, pas de build. Ouvrir `index.html` en local ou consulter la version déployée : https://periggouanvic.github.io/astrolab/

Lib de calcul : [`circular-natal-horoscope-js`](https://github.com/0xStarcat/CircularNatalHoroscopeJS) chargée via ESM CDN (planètes majeures + Placidus tropical, suffisant pour la strate 1). Migration vers Swiss Ephemeris (WASM) prévue à la strate 2 pour astéroïdes + mi-points fins.

## Séquencement du build

1. **Socle épuré** (en cours) — cercle, signes, maisons Placidus, planètes. Priorité à l'esthétique sobre.
2. **Densification** — mi-points, astéroïdes étendus, autres corps (fixed stars, parts arabes, harmoniques, TNOs…). La logique soustractive devient le moteur.
3. **Couches personnelles** — accrétion par planète/maison, journal, scrapbook, synastrie intégrée.
