# Prochaine session astrolab — à ouvrir en premier

**Contexte** : clôture 2026-10-07 20h15. Atelier de glyphes v1 livré (voir `memory/project_feature_atelier_glyphes.md`). Un chantier report + un pack mobile de triage de la nuit du 2026-10-07.

## 1. Drawer vue laptop — sidebar droite (reporté depuis session 12h41–20h07)

Perig : *« le drawer en bas c'est lamentable en vue laptop, faut que ce soit à droite »*.

État actuel : `@media (min-width: 900px)` dans `style.css` fait un sheet horizontal `flex-wrap` en bas (défauts hérités session 2026-10-07 matin). Pas touché en soirée.

Direction : panneau latéral droit (sidebar) au-dessus de 900px. Pas de bottom sheet du tout en desktop — réserver ce pattern au mobile.

À faire :
- Refondre le `@media (min-width: 900px)` dans `style.css` pour sortir `.sheet` du flux bottom et le poser en sidebar droite (position fixed right/top, largeur ~320-400px, hauteur plein viewport).
- Vérifier que le JS sheet (drag handle, snap states) se désactive proprement en desktop (pas de drag utile si la sidebar est fixe).
- Rééquilibrer `#chart-container` pour qu'il tienne compte de la sidebar à droite (viewport utilisable réduit).
- Repenser aussi `#timeline-container` : en bas, mais plus étroit (le viewport est réduit par la sidebar droite).

**Attention** : garder l'option mobile (bottom sheet) intacte — toute la logique 4-crans y est critique. Ne refondre que le chemin desktop.

## 2. Pack triage mobile (loose ends de la nuit 2026-10-07)

Rappel brief nuit (voir `notes/2026-10-07-session-suite.md`) — 5 doléances dictées, 2 déjà prises en compte dans d'autres chantiers, restent :

- **Menu encombrant / sans hiérarchie** = refonte interne du sheet (essentiel visible / avancé repliable / rare dans un tiroir). V1-critique mobile.
- **Zoom indépendant cercle vs frise** = chacun son viewport. Petit, autonome. V1-critique mobile.
- **Voyage temporel en bougeant les planètes** = branche design (long press + drag ? mode scrub ?). À concevoir calmement, pas urgent.
- **Frise plus haute** = conséquence directe de la refonte du sheet (si chrome rétrécit, frise respire).

Suggestion d'ordre : 1 (drawer laptop) → zoom indépendant cercle/frise → refonte interne sheet → design voyage planètes.

## État technique à l'ouverture

- Branche `astrolab-2d`, commit à ouvrir = celui de l'atelier de glyphes v1 (20h20 environ).
- Cache-bust actuels : `style.css?v=42`, `app.js?v=48`. À bumper au prochain changement.
- Serveur dev : `http://perig:8787/` (python http.server déjà up en arrière-plan sur la machine).
- `localStorage['astrolab.planet-scales']` contient peut-être déjà des valeurs posées par Perig le 2026-10-07 soir — relecture auto au boot.
