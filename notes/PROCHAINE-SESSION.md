# Prochaine session astrolab — à ouvrir en premier

**Contexte** : clôture 2026-10-07 midi, Perig teste mobile + laptop. Deux chantiers posés à chaud, à ouvrir **en entrée de session suivante**.

## 1. Atelier de création de glyphes — ouverture

Perig : *« il faut l'atelier en ouverture de session »*.

Fiche détaillée : `memory/project_feature_atelier_glyphes.md`.

Infra déjà en place :
- `const PLANET_SCALES = {}` dans `app.js` (ligne ~137) — vide, à alimenter par l'atelier
- `.planet-symbol { --planet-scale: 1; font-size: calc(30px * var(--planet-scale)) }` dans `style.css`
- Chaque `<text>` planète reçoit `data-planet="<key>"` + `style="--planet-scale: X"` au render

À concevoir avec Perig en entrée de session :
- Forme (page séparée ? modale ? panneau latéral ?)
- Cadre de référence (carré ? cercle ? taille cible visuelle)
- Pour chaque glyphe : affichage dans cadre + slider scale → écrit en localStorage, relu par `PLANET_SCALES` au boot
- Preview côte à côte de tous les glyphes alignés pour juger l'harmonie globale
- Prévoir dès le départ l'extension aux corps célestes **inventés** (astéroïdes sans glyphe Unicode, personnes synastrie, événements) — c'est l'argument principal pour l'atelier.

## 2. Drawer vue laptop — à droite, pas en bas

Perig : *« le drawer en bas c'est lamentable en vue laptop, faut que ce soit à droite »*.

État actuel (session 2026-10-07) : `@media (min-width: 900px)` dans `style.css` fait un sheet horizontal `flex-wrap` en bas. Perig trouve ça moche sur laptop.

Direction : panneau latéral droit (sidebar) au-dessus de 900px. Pas de bottom sheet du tout en desktop — réserver ce pattern au mobile.

À faire :
- Refondre le `@media (min-width: 900px)` dans `style.css` pour sortir `.sheet` du flux bottom et le poser en sidebar droite (position fixed right/top, largeur ~320-400px, hauteur plein viewport)
- Vérifier que le JS sheet (drag handle, snap states) se désactive proprement en desktop (pas de drag utile si la sidebar est fixe)
- Rééquilibrer `#chart-container` pour qu'il tienne compte de la sidebar à droite (viewport utilisable réduit)
- Repenser aussi `#timeline-container` : en bas, mais plus étroit (le viewport est réduit par la sidebar droite)

**Attention** : garder l'option mobile (bottom sheet) intacte — toute la logique 4-crans y est critique. Ne refonder que le chemin desktop.
