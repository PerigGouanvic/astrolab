# astrolab

**Statut** : actif — strate 2 en cours (Swiss Ephemeris + astéroïdes + mi-points + **couches soustractives** + **aspects majeurs**). Nom stabilisé 2026-08-17 (ex-`_astro/`).

**Intention** : Logiciel d'astrologie épuré avec deux enrichissements **distincts** — (a) calcul des **mi-points** entre corps, (b) intégration d'un large corpus d'**astéroïdes**. Visualisations soustractives (planètes×maisons sans signes ; aspects seuls, sans autre considération). Journal utilisateur pour indexer des événements vécus à des positions/moments.

**Pas de LLM pour l'analyse** dans un premier temps — on privilégie la soustraction et le journal.

## App

Fichiers à la racine du repo (contrainte GitHub Pages) : `index.html`, `style.css`, `app.js`. Version web statique HTML+SVG+JS pur, pas de build. Ouvrir `index.html` en local ou consulter la version déployée : https://periggouanvic.github.io/astrolab/

Lib de calcul : **Swiss Ephemeris 2.10.03** via [`@kuntay/swisseph`](https://www.npmjs.com/package/@kuntay/swisseph) chargée en ESM depuis jsDelivr (WASM 230 KB brotli, sans fichiers `.se1` en mode Moshier ; téléchargement des `.se1` via `FetchEphemeris` pour Chiron + astéroïdes majeurs). Deux modes commutables : **maintenant** (Montréal, temps réel) et **natal (Perig)**. Rétrogrades marqués ℞.

**Couches soustractives** : chaque strate visuelle est indépendamment activable / masquable — signes, maisons, planètes, mi-points, astéroïdes, aspects. Une couche masquée n'ajoute aucun élément au DOM (pas simplement `display:none`). Persistance localStorage. La soustraction est le moteur : on lit la carte en ne gardant que ce qu'on veut voir (par ex. planètes×maisons sans signes, ou aspects seuls).

**Aspects majeurs** : conjonction (8°), opposition (8°), trigone (6°), carré (6°), sextile (4°). Rendus en cordes traversant le cercle intérieur, couleurs sobres (tensions en accent brun, harmoniques en bleu discret).

**Astéroïdes à la demande** : recherche par nom ou n° MPC dans le catalogue de ~27 300 astéroïdes nommés (`asteroids.json`). Ajout dynamique → fetch du fichier `.se1` via proxy CORS → mount dans le WASM → position calculée. Liste persistée en localStorage. Voir [`proxy/README.md`](proxy/README.md) pour déployer le proxy (Deno Deploy gratuit, 5 min).

> **Licence** : Swiss Ephemeris est AGPL-3.0-or-later. Cette app, publiée en source ouverte sur GitHub Pages, hérite de la contrainte AGPL — à formaliser par un fichier `LICENSE` explicite (à venir).

## Séquencement du build

1. **Socle épuré** (fait) — cercle, signes, maisons Placidus, planètes. Priorité à l'esthétique sobre.
2. **Densification** (en cours) — mi-points ✓, astéroïdes majeurs ✓, migration Swiss Ephemeris ✓, astéroïdes arbitraires à la demande ✓, **couches soustractives** ✓, **aspects majeurs** ✓. À venir : mode zoom (SVG viewBox), fixed stars, parts arabes, harmoniques, TNOs.
3. **Couches personnelles** — accrétion par planète/maison, journal, scrapbook, synastrie intégrée.
