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
- **Séquençage du build (2026-08-06, actualisé 2026-09-05)** — construire en trois strates dans cet ordre :
  1. **Socle très épuré** : le cercle, les signes, les maisons, les planètes. ✓ Fait.
  2. **Densification** : mi-points, astéroïdes MPC à la demande, couches soustractives (moteur), aspects unifiés par harmonique H1..H9 (ligne ou chiffre). ✓ Fait pour l'essentiel — reste optionnel : mode zoom, fixed stars, parts arabes, TNOs.
  3. **Couches personnelles** — phase A′ amorcée (2026-09-05) : scrapbook double-tap avec cadres textuels/visuels foreignObject, édition inline, images (paste/file), drag/resize, temporalité (retrait vs effacement, slider). Prochaines phases identifiées mais non commencées :
     - **B** : superposition sélective de planètes natales (sienne + autres personnes) sur le thème du jour, avec style visuel distinct.
     - **C** : placement barycentrique dynamique (physique force-directed, éléments qui se repoussent, migration au fil des couches actives).
     - **D** : LLM assistant de placement thématique via OpenRouter (clé utilisateur, modèle au choix, fallback manuel obligatoire).
     - **E** : empaquetage Capacitor pour publication Play Store.
  Utiliser une lib de calcul existante (Swiss Ephemeris via `@kuntay/swisseph`) — ne pas réinventer le socle astronomique.

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
