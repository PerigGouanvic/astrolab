# CLAUDE.md — astrolab (branche `astrolab-2d`)

Ce fichier oriente les sessions Claude ouvertes **depuis ce dossier**, **sur la branche `astrolab-2d`**. Le `README.md` voisin décrit l'intention publique ; ici on collecte les décisions déjà prises, les arbitrages en attente et les pointeurs de contexte.

> **Branche en cours : `astrolab-2d`** — v1 publiable, substrat SVG, mobile-first. La branche `main` porte le chantier de recherche 3D (dôme immersif Three.js) — ne pas y toucher sans décision explicite. Vérifier `git branch --show-current` en début de session.

> **Écosystème** — Ce projet fait partie de `~/projects/` — voir **[`../INDEX.md`](../INDEX.md)** pour la vue d'ensemble et les recoupements avec d'autres projets.

## Intention (rappel)

Logiciel d'astrologie épuré, **mobile-first**, pour **consultations co-évolutives** entre Perig et des consultés. Pas d'oracle génératif : la valeur vient de la soustraction, du journal partagé (scrapbook) et de la relation dans la durée.

## Décisions structurantes (branche 2D v1)

### ⚡⚡ Fondatrices — session 2026-10-05

- **Scission 2D/3D** — deux branches dans ce repo. `astrolab-2d` = v1 publiable (ici). `main` = recherche 3D long terme. Nommage 2D/3D volontaire (pas praticien/cosmos). → `memory/project_scission_2d_3d.md`
- **Scrapbook en v1** — infrastructure de l'échange co-évolutif, pas supplément. Non négociable dans le scope v1. → `memory/project_scrapbook_v1.md`
- **Stack v1 arrêtée** : PWA mobile-first + rendu SVG (code existant conservé) + stockage Google Drive (scope `drive.file`, Google Picker non-contournable). → `memory/project_stack_v1_pwa_svg_drive.md`
- **Angle éditorial Saturne/Uranus** — verrou/clef, à infuser dans vocabulaire, soustractions pré-réglées, lecture des transits durs. → `memory/project_angle_saturne_uranus.md`
- **Fin de cycle décidée conjointement** — Perig retire son partage Drive quand c'est juste ; pas d'auto-expiration. → `memory/project_fin_de_cycle_conjointe.md`

### Décisions héritées (toujours valides)

- **Mi-points** et **astéroïdes** sont **deux enrichissements distincts** (pas des mi-points d'astéroïdes). Corriger toute reformulation qui les confond.
- Visualisations **soustractives** : chaque strate indépendamment activable/masquable (signes, maisons, planètes, mi-points, astéroïdes, aspects). Une couche masquée n'ajoute aucun élément au DOM, pas simplement `display:none`.
- **Pas de LLM pour l'analyse** interprétative. LLM autorisé en revanche comme **assistant de placement thématique** du scrapbook (routage 12-classes maisons via OpenRouter) — jamais autoritaire, fallback manuel toujours disponible.
- Journal / scrapbook : indexer des événements vécus à des positions/moments donnés.

### État technique (hérité du commit `fc9104e` + patch `83d728c`)

- Rendu : HTML + SVG + JS pur, pas de build. Fichiers à la racine (contrainte GitHub Pages).
- Lib de calcul : **Swiss Ephemeris 2.10.03** via `@kuntay/swisseph` chargée en ESM depuis jsDelivr. AGPL côté client — OK pour prototype pré-public, **à migrer vers Astronomy Engine avant toute publication**.
- **Modes commutables** : *maintenant* (Montréal, temps réel) et *natal (Perig)*.
- **Aspects majeurs** : conjonction (8°), opposition (8°), trigone (6°), carré (6°), sextile (4°). Rendus en cordes.
- **Aspects unifiés par harmonique H1..H9** : sélecteur + segmented ligne/chiffre.
- **Astéroïdes à la demande** : recherche nom/n° MPC dans `asteroids.json` (~27 300 nommés). Ajout dynamique → fetch `.se1` via proxy CORS → mount WASM. Liste persistée localStorage.
- **Scrapbook phase A′** : double-tap sur chart → cadres textuels/visuels foreignObject, édition inline, images (paste/file), drag/resize, temporalité (retrait vs effacement, slider).
- **Patch `genId()`** (commit `83d728c`) : `crypto.randomUUID` indisponible hors contexte sécurisé (HTTPS/localhost). Toujours passer par `genId()` dans ce code — Perig teste sur `http://perig:8787/` via Tailscale.

## Plan v1 à venir (post-sédimentation 2026-10-05)

Validé en fin de session fondatrice, à poursuivre dans cet ordre :

- **Convivialité mobile** (session en cours — prochain sujet) : l'app fonctionne mais n'est pas accueillante pour un non-expert.
- **J2 — Zoom SVG** sur région (v1-critique mobile, pas optionnel ; `viewBox` suffit).
- **J3 — Setup OAuth Google** : projet Cloud + API Drive + consentement + client ID. ~20-30 min, à faire en pair.
- **J4 — Intégration Drive** dans la PWA : auth redirect flow, Google Picker pour ouvrir le dossier partagé, lecture/écriture test.
- **J5 — Scrapbook sur Drive** : câblage de la phase A′ existante sur Drive au lieu de `localStorage`.
- **J6 — Capture mobile directe** : photo caméra, audio MediaRecorder.

## Anti-scope (branche 2D v1)

- Pas de rendu 3D, pas de Three.js, pas de dôme immersif — c'est l'autre branche.
- Pas de LLM analytique/interprétatif (pas d'oracle astrologique génératif).
- Pas d'auto-expiration de cycle, pas de scoring d'engagement, pas de mécaniques SaaS (voir `project_fin_de_cycle_conjointe.md`).
- Pas de bundler lourd (pas de Vite dans cette branche). On reste sur ESM via jsDelivr.
- Pas de Capacitor/Play Store en v1 — reporté à v2 si la traction le justifie.

## Questions ouvertes

- Format d'onboarding du consulté (ce qu'il voit, où il clique, ce qu'on lui explique sur le partage Drive et sur la clause de fin de cycle).
- Format d'entrée du journal / scrapbook (structure d'un événement, champs, tags).
- Corpus d'astéroïdes à proposer par défaut : lequel, quelle taille, quelle source.
- Formalisation de la licence (AGPL héritée tant qu'on garde `@kuntay/swisseph` côté client).

## Contexte transversal

Stub issu de la salve de brassage du **2026-07-31**. Nom stabilisé **astrolab** le 2026-08-17 (avant : `_astro/`). Repo public : `PerigGouanvic/astrolab`. Branche `astrolab-2d` créée depuis `fc9104e` le **2026-10-05**.

**Mémoire auto de ce projet** → `./memory/MEMORY.md`.

Mémoire racine `~/projects/` (préférences utilisateur transversales, langue, cadences, workflow mobile) → `~/.claude/projects/-home-perig-projects/memory/MEMORY.md`.

## Origine

- Brassage initial (2026-07-31) : `~/.claude/projects/-home-perig-projects/19945d01-8aca-465f-932d-0654f37bd1fc.jsonl`
- Création CLAUDE.md (2026-08-01) : `~/.claude/projects/-home-perig-projects/2292c589-7cb6-4318-995b-7b762647d0ac.jsonl`
- Session fondatrice branche 2D (2026-10-05) : voir `notes/2026-10-05-session-v01.md`
