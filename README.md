# astrolab

**Statut** : actif — strate 2 amorcée (Swiss Ephemeris + astéroïdes majeurs + mi-points). Nom stabilisé 2026-08-17 (ex-`_astro/`).

**Intention** : Logiciel d'astrologie épuré avec deux enrichissements **distincts** — (a) calcul des **mi-points** entre corps, (b) intégration d'un large corpus d'**astéroïdes**. Visualisations soustractives (planètes×maisons sans signes ; aspects seuls, sans autre considération). Journal utilisateur pour indexer des événements vécus à des positions/moments.

**Pas de LLM pour l'analyse** dans un premier temps — on privilégie la soustraction et le journal.

## App

Fichiers à la racine du repo (contrainte GitHub Pages) : `index.html`, `style.css`, `app.js`. Version web statique HTML+SVG+JS pur, pas de build. Ouvrir `index.html` en local ou consulter la version déployée : https://periggouanvic.github.io/astrolab/

Lib de calcul : **Swiss Ephemeris 2.10.03** via [`@kuntay/swisseph`](https://www.npmjs.com/package/@kuntay/swisseph) chargée en ESM depuis esm.sh (WASM 230 KB brotli, sans fichiers `.se1` en mode Moshier ; téléchargement des `.se1` via `FetchEphemeris` pour Chiron + astéroïdes majeurs). Deux modes commutables : **maintenant** (Montréal, temps réel) et **natal (Perig)**. Toggle mi-points. Rétrogrades marqués ℞.

> **Licence** : Swiss Ephemeris est AGPL-3.0-or-later. Cette app, publiée en source ouverte sur GitHub Pages, hérite de la contrainte AGPL — à formaliser par un fichier `LICENSE` explicite (à venir).

## Séquencement du build

1. **Socle épuré** (fait) — cercle, signes, maisons Placidus, planètes. Priorité à l'esthétique sobre.
2. **Densification** (en cours) — mi-points ✓, astéroïdes majeurs (Chiron, Ceres, Pallas, Juno, Vesta) ✓, migration Swiss Ephemeris ✓. À venir : astéroïdes étendus (Eris, Sedna…), fixed stars, parts arabes, harmoniques, TNOs. La logique soustractive doit devenir le moteur.
3. **Couches personnelles** — accrétion par planète/maison, journal, scrapbook, synastrie intégrée.
