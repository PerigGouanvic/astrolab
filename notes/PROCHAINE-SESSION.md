# Prochaine session astrolab — à ouvrir en premier

**Contexte** : session 2026-10-28 interrompue en soirée (20h43) après livraison de l'**étape 3 (bloc vidéo)** du chantier scrapbook composition riche. Perig n'a pas encore re-testé l'étape 3 nettoyée (commit `6753ea8`) sur APK.

## État du code à l'ouverture

- Branche `astrolab-2d`, working tree **propre**, poussé sur `origin/astrolab-2d`.
- HEAD : `6753ea8 [2D] scrapbook vidéo : nettoyage post-étape 3`
- Cache-bust courant : `style.css?v=69`, `app.js?v=103` (`--css-version: "63"`, `CSS_EXPECTED = 63`).

## Chantier en cours — scrapbook composition riche

Fiche mère : `./memory/project_scrapbook_composition_riche.md` (plan 5 étapes A/C/A, choix tranchés par Perig 2026-10-26).

**Étapes faites, pushées, commitées** :
- Étape 1 — modèle `blocks[]` + migration invisible (`d62429b`)
- Étape 2 — renderer compositif stack/overlay/mosaic (`c491d6d`)
- Étape 3 — bloc vidéo poster+Drive+tap plein-écran (`dfe0557`), + nettoyage (`6753ea8`)

**Étape 3 — ce que le nettoyage a fait** (commit `6753ea8`) :
- Supprime un **doublon** de `openVideoFullscreen` (deux définitions se chevauchaient dans `dfe0557` — la seconde gagnait au hoisting, la première async était orpheline).
- Ramène `SCRAP_VIDEO_MAX_BYTES` de **50 Mo → 5 Mo**. Raison : Google Drive `uploadType=multipart` plafonne à 5 Mo. Au-delà, il faut basculer en upload resumable — chantier séparé.

**Attendu au prochain tour** : Perig re-teste étape 3 sur APK fraîche (après fetch du v=103). Protocole :
1. Se connecter à Drive dans l'app.
2. Double-tap zone zodiacale vide → chooser 3 options (texte / image / 🎬 vidéo).
3. Choisir vidéo < 5 Mo (clip court — ~5-10 s en qualité normale rentre).
4. Vérifier : vignette = poster frame + picto play ; tap simple → plein-écran avec contrôles vidéo natifs ; × ou tap backdrop ou Escape ferment.

**Si régression** (vignette manquante, play ne s'ouvre pas, poster noir, upload échoue à 5 Mo pile) : fix d'abord, étape 4 ensuite.

**Si OK** : passer à **étape 4 — éditeur in-situ compositif**. Barre d'outils flottante au-dessus de l'item en mode édition (+ texte, + image, + vidéo, choisir layout stack/overlay/mosaic), blocs internes tap-éditables, commit par tap hors item. Le gros morceau du plan.

## Étapes restantes

- **Étape 4** — Éditeur in-situ compositif (voir fiche mère).
- **Étape 5** — Polish esthétique (guingois ±2-3°, ombre douce, fonds papier, polices serif/script).

## Pointeurs mémoire

- `./memory/project_scrapbook_composition_riche.md` — fiche mère chantier (plan 5 étapes, choix A/C/A).
- `./memory/project_objets_scrapbook_esthetique.md` — principe « pas de cadre ».
- `./memory/project_pattern_messager_du_ciel.md` — cas d'usage legitimant la co-évolution.
- `MEMORY.md` en haut : pointeur ⚡⚡ vers la fiche mère.

## Note de fin de journée

Journée dense : les trois premières étapes du plan 5-étapes ont été livrées en une journée (26 oct : fiche + étape 1 ; 28 oct matin+midi : étapes 2 et 3). Rythme à ne pas sur-interpréter — les étapes 1-3 étaient techniques et bien cadrées ; étape 4 (éditeur in-situ) est le gros morceau pensé-non-pensé, elle peut prendre plusieurs sessions.
