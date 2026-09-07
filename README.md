# astrolab

**Statut** : redémarrage from-scratch en Three.js + Vite (2026-09-06). Code SVG d'avant le pivot archivé via `git rm` (commit `3f87429`), récupérable dans l'historique.

**Intention** : point de rencontre astronomie ↔ astrologie. Une seule scène 3D — la Terre au centre, la sphère céleste autour, deux régimes de vue soustractifs (astrologue au-dessus du plan de l'écliptique, astronome au sommet Terre) qui ne sont que deux positions de caméra sur cette même scène. Visualisations soustractives (planètes×maisons sans signes ; aspects seuls) étendues au niveau des régimes de vue. Journal utilisateur biographique déposé sur points fixes du ciel (points natals, mi-points, étoiles, constellations personnelles) — chaque point devient portail vers une profondeur scrapbook. Constellations personnelles émergent des convergences de points natals de plusieurs personnes (familles, cercles), rendues comme amas ouverts avec nébulosité biographique par sommation.

**Pas de LLM pour l'analyse** — la valeur vient de la soustraction, du journal, et de la vraie 3D. LLM autorisé plus tard comme assistant de placement thématique (OpenRouter, clé utilisateur, fallback manuel obligatoire).

## Manifeste et décisions

- Manifeste principale : [`florilege-perig/astrolab/manifeste/2026-09-06_bifurcation-3d-native.md`](https://github.com/PerigGouanvic/florilege-perig/blob/main/astrolab/manifeste/2026-09-06_bifurcation-3d-native.md) — ontologie fixe/orbitant, constellations personnelles, scrapbook nébuleux, bifurcation 3D-native, stack retenue, transition astrologue↔astronome par la Terre au centre.
- Addendum placement Terre et échelles : [`2026-09-06_addendum-terre-camera-echelles.md`](https://github.com/PerigGouanvic/florilege-perig/blob/main/astrolab/manifeste/2026-09-06_addendum-terre-camera-echelles.md) — vue astrologue = caméra normale à l'écliptique ; R_CELESTE=100, R_TERRE=8 ; Terre orientée selon plan horizontal du lieu.
- Décisions consolidées et contexte de travail : `CLAUDE.md` voisin.

## Stack

- **Three.js** — rendu 3D unique, scène soustractive.
- **Astronomy Engine** (cosinekitty, MIT) — positions planétaires + transformations de coordonnées, côté client, sans contamination de licence.
- **HYG database** (mag<6 pour l'instant, extensible) — étoiles fixes.
- **Vite** — bundler / dev server. GitHub Pages via workflow Actions (`vite build` → publier `dist/`).

Pas de Swiss Ephemeris côté client (AGPL). Swiss Ephemeris peut rester utile pour des scripts build (astéroïdes) mais ne rentre jamais dans le bundle.

## Séquencement du build (post-pivot)

1. Historique SVG (2026-08 → 2026-09-05) — archivé via `git rm` ✓
2. Base 3D : scène Three.js, sphère céleste, Terre stylisée orientée, planètes vraies, étoiles HYG mag<6. Deux positions de caméra pré-réglées.
3. Signes, maisons, aspects rebâtis en 3D (cordes 3D dans la sphère céleste, cuspides Placidus).
4. Transition astrologue ↔ astronome animée, portail Terre.
5. Couches personnelles 3D natives — constellations personnelles (amas ouverts), scrapbook sur points fixes, nébulosité émergente, voyage temporel via planètes-poignées, rétrogradation-friction.
6. LLM assistant de placement thématique via OpenRouter.
7. Empaquetage Capacitor pour Play Store.

## Repo

[`PerigGouanvic/astrolab`](https://github.com/PerigGouanvic/astrolab). Ancien déploiement statique GitHub Pages à `https://periggouanvic.github.io/astrolab/` restera cassé jusqu'au premier rebuild via workflow Actions (à venir).
