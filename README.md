# astrolab (branche `astrolab-2d`)

**Statut** : v1 en construction — substrat SVG, mobile-first, pour **consultations astrologiques co-évolutives** entre Perig et des consultés.

> Cette branche porte la v1 publiable. La branche `main` du même repo porte un chantier de recherche 3D (dôme immersif Three.js) sans vocation d'être publié à court terme. Les deux ne doivent pas être confondues.

## Intention

Logiciel d'astrologie épuré avec deux enrichissements **distincts** — (a) **mi-points** entre corps, (b) corpus d'**astéroïdes** à la demande. Visualisations soustractives (planètes×maisons sans signes ; aspects seuls, sans autre considération). **Scrapbook partagé** indexant des événements vécus à des positions/moments donnés, infrastructure d'une relation Perig/consulté dans la durée.

**Pas de LLM pour l'analyse** — la valeur vient de la soustraction, du scrapbook, et de la co-évolution de la lecture dans le temps.

**Angle éditorial Saturne/Uranus** — verrou / clef. Pas « défi / opportunité », mais la dialectique de la cristallisation et de la rupture. À infuser dans le vocabulaire, les soustractions pré-réglées, la lecture des transits durs.

## Stack v1 (arrêtée 2026-10-05)

- **PWA mobile-first** — pas de Capacitor en v1 ; manifeste + service worker + ajout à l'écran d'accueil.
- **Rendu SVG** — HTML + SVG + JS pur, pas de build. Fichiers à la racine (contrainte GitHub Pages).
- **Lib astronomique** — Swiss Ephemeris 2.10.03 via [`@kuntay/swisseph`](https://www.npmjs.com/package/@kuntay/swisseph) chargée en ESM depuis jsDelivr. WASM 230 KB brotli. Mode Moshier par défaut, téléchargement de `.se1` à la demande pour Chiron et astéroïdes.
- **Stockage** — Google Drive (scope `drive.file` + Google Picker), remplaçant `localStorage` pour permettre le partage Perig/consulté.

## App

Deux modes commutables : **maintenant** (Montréal, temps réel) et **natal (Perig)**. Rétrogrades marqués ℞. Ouvrir `index.html` en local, ou consulter la version déployée : <https://periggouanvic.github.io/astrolab/>.

**Couches soustractives** : chaque strate visuelle est indépendamment activable / masquable (signes, maisons, planètes, mi-points, astéroïdes, aspects). Une couche masquée n'ajoute aucun élément au DOM — pas simplement `display:none`. Persistance locale (migration Drive à venir).

**Aspects majeurs** : conjonction (8°), opposition (8°), trigone (6°), carré (6°), sextile (4°). Rendus en cordes traversant le cercle intérieur. **Aspects unifiés par harmonique H1..H9** (sélecteur + segmented ligne/chiffre).

**Astéroïdes à la demande** : recherche par nom ou n° MPC dans `asteroids.json` (~27 300 astéroïdes nommés). Ajout dynamique → fetch `.se1` via proxy CORS → mount dans le WASM → position calculée. Voir [`proxy/README.md`](proxy/README.md) pour déployer le proxy (Deno Deploy gratuit, 5 min).

**Scrapbook (phase A′)** : double-tap sur le chart → cadre textuel/visuel (foreignObject) éditable inline. Images collables (paste / file). Drag et resize. Temporalité (retrait vs effacement, slider temporel). Persistance actuelle en `localStorage`, migration Drive planifiée (J4-J5).

## Développement local (mobile Tailscale)

```bash
python3 -m http.server 8787 --bind 0.0.0.0
```

Puis sur mobile : `http://perig:8787/`. Le patch `genId()` (commit `83d728c`) gère l'absence de `crypto.randomUUID` hors contexte sécurisé — ne pas réintroduire d'appel direct à `crypto.randomUUID`.

## Plan v1 à venir

- **Convivialité mobile** (en cours) — fluidifier l'accueil pour un consulté non-expert.
- **J2** Zoom SVG sur région (`viewBox`) — critique mobile dès que la densité monte.
- **J3** OAuth Google (projet Cloud + API Drive + client ID).
- **J4** Intégration Drive dans la PWA (redirect flow + Google Picker).
- **J5** Scrapbook sur Drive (migration depuis `localStorage`).
- **J6** Capture mobile directe (caméra + audio).

## Clause de consultation (à transmettre au consulté quand pertinent)

Le dossier Drive partagé est propriété de Perig. Il peut en retirer le partage à tout moment pour clore un cycle de consultation. Les propres contenus du consulté (dans son propre Drive) restent intacts dans tous les cas. Pas d'auto-expiration, pas de compteur de séances — la fin d'un cycle se décide, elle ne se déclenche pas.

## Licence

Swiss Ephemeris est AGPL-3.0-or-later. Tant que `@kuntay/swisseph` est embarqué côté client, cette app hérite de la contrainte AGPL. **À migrer vers Astronomy Engine (MIT) avant toute publication large** — `LICENSE` explicite à poser au moment de la publication.
