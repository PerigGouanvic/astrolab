# CLAUDE.md — astrolab

Ce fichier oriente les sessions Claude ouvertes **depuis ce dossier**. Le `README.md` voisin décrit l'intention publique ; ici on collecte les décisions déjà prises, les arbitrages en attente et les pointeurs de contexte.

> **Écosystème** — Ce projet fait partie de `~/projects/` — voir **[`../INDEX.md`](../INDEX.md)** pour la vue d'ensemble et les recoupements avec d'autres projets. **Mettre à jour l'index** en cas de changement significatif (statut, reformulation de l'intention, nouveau recoupement identifié).

## Intention (rappel)
Logiciel d'astrologie épuré avec deux enrichissements distincts, visualisations soustractives, et journal utilisateur.

## Décisions prises
- **Mi-points** et **astéroïdes** sont **deux enrichissements distincts** (pas des mi-points d'astéroïdes). Corriger toute reformulation qui les confond.
- Visualisations **soustractives** : montrer les planètes dans les maisons **sans les signes** ; ou les aspects **seuls**, sans autre considération.
- Journal utilisateur : indexer des événements vécus à des positions/moments donnés.
- **Pas de LLM pour l'analyse** dans un premier temps — la valeur vient de la soustraction et du journal.
- **Séquençage du build (2026-08-06, actualisé 2026-09-06)** — construire en trois strates dans cet ordre :
  1. **Socle très épuré** : le cercle, les signes, les maisons, les planètes. ✓ Fait.
  2. **Densification** : mi-points, astéroïdes MPC à la demande, couches soustractives (moteur), aspects unifiés par harmonique H1..H9 (ligne ou chiffre). ✓ Fait pour l'essentiel — reste optionnel : fixed stars, parts arabes, TNOs. Le mode zoom est absorbé par la navigation immersive du dôme 3D (voir bifurcation ci-dessous).
  3. **Couches personnelles** — phase A′ amorcée (2026-09-05) : scrapbook double-tap avec cadres textuels/visuels foreignObject, édition inline, images (paste/file), drag/resize, temporalité (retrait vs effacement, slider). **Reste opérationnel comme MVP et référence, mais dépassé par la bifurcation 3D-native décidée le 2026-09-06** — la suite se construit directement en Three.js/WebGL sur un dôme immersif. Phases suivantes relues dans le cadre 3D :
     - **B** : superposition sélective de points natals (soi + proches) — devient un cas particulier des « constellations personnelles » (voir décision ontologique ci-dessous).
     - **C** : placement dynamique — dans le dôme, remplacé par la vraie 3D des positions célestes et la nébulosité émergente du scrapbook.
     - **D** : LLM assistant de placement thématique via OpenRouter (clé utilisateur, modèle au choix, fallback manuel obligatoire). Inchangé sur le principe.
     - **E** : empaquetage Capacitor pour publication Play Store. Inchangé.
  Utiliser une lib de calcul existante (Swiss Ephemeris via `@kuntay/swisseph`) — ne pas réinventer le socle astronomique.

- **Bifurcation 3D-native (2026-09-06)** — cristallisée dans `~/projects/florilege-perig/astrolab/manifeste/2026-09-06_bifurcation-3d-native.md`. Points clefs :
  - **Modèle de données 3D-native dès maintenant** (RA/Dec/distance pour étoiles fixes, longitude/latitude écliptique pour planètes, positions 3D pour tout élément) — coût minimal, découple tout rendu futur.
  - **Suite de la strate 3 en Three.js/WebGL sur dôme immersif**, pas en scrapbook 2D avancé.
  - **Vue 2D synoptique conservée** comme projection à la demande (irremplaçable pour lire tous les aspects d'un coup), mais n'est plus la vue primaire.
  - Justification : la vue synoptique 2D ampute (12 signes sur 88 constellations IAU, tout le circumpolaire effacé) et viole la perspective ; le scrapbook biographique appellera vite une surface sphérique plutôt qu'une bande écliptique.

- **Stack technique retenue (2026-09-06, après recherche Perplexity)** — from-scratch permissive, pas de substrat externe :
  - **Rendu 3D** : **Three.js** direct dans le projet Vite. Stellarium Web Engine écarté (AGPL viral + pas de plugin system + ADN observer-view rigide) ; Horoskopos écarté (Unity ≠ web + rendu inesthétique) ; astrology3d.app écarté (mal pensé sur le basculement des vues).
  - **Étoiles fixes** : **HYG database** (astronexus/HYG-Database), ~120 000 étoiles, licence permissive.
  - **Positions planétaires et transformations de coordonnées** : **Astronomy Engine** (cosinekitty, MIT, ~120 KB minifié, précision ~1 arcminute) — référence principale côté client. **XALEN** (@xalen/wasm, Apache-2.0) en réserve pour sous-arcsec plus tard.
  - **Swiss Ephemeris via `@kuntay/swisseph`** conservé pour usages ponctuels serveur/build uniquement, **jamais dans le bundle client** (contamination AGPL).
  - **Zéro contamination virale** — options futures préservées (commercial, PWA distribuée, publications multiples).

- **Originalité confirmée (2026-09-06)** — la recherche a explicitement conclu qu'**aucun précédent documenté ne combine astrologie + dôme immersif 3D + dépôt de contenu biographique personnel à des coordonnées célestes réelles**. Précédents artistiques adjacents : Chiharu Shiota (*Counting Memories*), Kiki Smith (*Constellation*) — mais purement métaphoriques, sans éphémérides. L'idée est inédite.

- **Transition astrologue ↔ astronome : une seule scène soustractive, Terre au centre (2026-09-06)** — voir §10 de la manifeste. Points essentiels :
  - **Une seule scène 3D**, jamais deux moteurs. Les deux vues sont des configurations de visibilité + position de caméra sur la même scène. Extension du principe « visualisations soustractives » au niveau des régimes de vue.
  - **Terre immobile au centre géométrique de l'écliptique** (référentiel géocentrique observateur — c'est le ciel qui tourne, pas la Terre). Surface supérieure alignée avec l'axe ASC-DSC. Transparence activable pour lire les maisons 1-6 invisibles au moment.
  - **Interaction avec la Terre = portail vers la vue astronome** (cohérent avec la grammaire portails circulaires).
  - **Projection écliptique naît de la caméra** : d'en haut, l'écliptique est un cercle simple ; depuis l'intérieur, une bande de ciel. Planètes snappées à la ceinture en vue astrologue, position vraie en vue astronome, dérive continue pendant la transition.
  - **Astrocartographie (globe texturé)** identifiée comme v2 séparée, à ne pas entamer avant que la v1 tienne debout.

- **Partage ontologique fixe / orbitant (2026-09-06)** — deux régimes d'être dans le zodiaque, unifiés pour la première fois :
  - **Fixe** : étoiles fixes, points natals (soi, proches), mi-points, degrés sensibles, cuspides, parts arabes, constellations personnelles. Inscrits sur la roue, grammaire d'inscription.
  - **Orbitant** : les transits, seuls. Passent sur la roue, grammaire d'orbite.
  - Le voyage temporel = *regarder la couche mobile glisser sur la constellation fixe personnelle*.
  - La profondeur scrapbook est une propriété de **tout point fixe**, pas seulement des constellations.

- **Constellations personnelles (2026-09-06)** — zones de convergence de points natals de plusieurs personnes :
  - Seuil : 2 points minimum, resserrement ≤ 5°.
  - Nature = amas ouvert (Pléiades, Ruche, Hyades), pas constellation figurative.
  - Glyphe canonique : cercle en pointillés (open cluster symbol de la cartographie astronomique) avec micro-points colorés par personne. Le glyphe est un **portail** : les tirets inscrivent l'invitation à entrer.
  - Expansion fractale : le petit cercle grandit continûment jusqu'à occuper tout le contenant, devenant micro-cosmos habitable.
  - Le scrapbook déposé dans la zone crée une **nébulosité émergente** par sommation (halo + blur + opacité additive), fidèle à l'analogie astronomique (amas ouverts embarqués dans leur gaz).

- **Voyage temporel — planètes comme poignées du temps (2026-09-06)** :
  - Le temps astrologique est le mouvement des astres. On saisit une planète, on la fait tourner, ça déplace le temps ; granularité par vitesse orbitale (Lune fine, Soleil = jour, Saturne = mois/an).
  - Mode dédié activé par un bouton (icône horloge/sablier) qui élargit les hitbox des cibles éligibles. Axes ASC/MC/DSC/IC = poignées de granularité minute.
  - **Rétrogradation = friction tactile** : le drag pousse toujours la planète dans le sens de son mouvement apparent réel ; pendant une rétrogradation, drag sens direct = rien (la planète refuse). Glyphe ℞ passif dès le début de la période, rougit sur persistance à contre-sens, pop-up explicatif au 3e palier. Halo bref aux stations.

## Questions ouvertes
- Spécifications détaillées à venir (Perig a annoncé « plus tard »).
- Corpus d'astéroïdes : lequel, quelle taille (centaines ou milliers), quelle source.
- Fonctionnalités « vraiment nouvelles » : à énumérer.
- Format d'entrée du journal (structure d'un événement, champs, tags).

## Features à venir (capté 2026-08-17)
- **Zoom sur une région du cercle** — nécessaire dès la strate 2 quand la densification (mi-points + astéroïdes) dégrade la lisibilité globale. SVG `viewBox` suffit techniquement, pas besoin de canvas.
- **Mode « lab »** — dans ce mode, ce qui apparaît dans le cercle ce sont les souvenirs, images, etc. déposés à des positions données. Cristallise la strate 3 : le cercle astrologique devient l'interface d'accès et de composition d'un journal intime spatialisé. « Mode lab » = nommage émergent, à laisser mûrir.
- Détails et ancrages : voir `florilege-perig/astrolab/manifeste/features-a-venir.md` (carnet de bord).

## Anti-scope
- Pas de LLM analytique/interprétatif (pas d'oracle astrologique génératif).
- LLM autorisé en revanche comme **assistant de placement thématique** (routage 12-classes maisons via OpenRouter, cf. mémoire `project_scrapbook_architecture.md` et `reference_llm_via_openrouter.md`) — jamais autoritaire, fallback manuel toujours disponible. Précision apportée le 2026-09-05.

## Contexte transversal
Stub issu de la salve de brassage du **2026-07-31**. Nom stabilisé **astrolab** le 2026-08-17 (avant : `_astro/`). Repo public créé le même jour : `PerigGouanvic/astrolab`.

**Mémoire auto de ce projet** — déplacée dans l'arborescence : lire `./memory/MEMORY.md`. Le chemin canonique post-renommage serait `~/.claude/projects/-home-perig-projects-astrolab/memory/` (ancien : `-home-perig-projects-_astro/`).

Pour hériter des préférences utilisateur transversales (langue, cadences, workflow mobile, etc.), lire aussi la mémoire racine des projets :

- `~/.claude/projects/-home-perig-projects/memory/MEMORY.md`

## Origine
- Conversation de brassage (2026-07-31) : `~/.claude/projects/-home-perig-projects/19945d01-8aca-465f-932d-0654f37bd1fc.jsonl`
- Session de suivi / création de ce CLAUDE.md (2026-08-01) : `~/.claude/projects/-home-perig-projects/2292c589-7cb6-4318-995b-7b762647d0ac.jsonl`
