# Prochaine session astrolab — à ouvrir en premier

**Contexte** : session du lundi 2026-10-19 soir (16h17 → 21h18, étalée sur l'après-midi avec deux coupures). Travail dans la continuité du paradigme frise-centrique (commit `f725e98` du matin). Le brief précédent (ROADMAP + archéologie) est archivé dans `./notes/2026-10-18-session-v03-passation-roadmap.md` et reste valide — il attend son tour.

## État des modifications non commités

**Fichiers modifiés** (non commités, pas poussés) : `app.js`, `style.css`.

**Fonctionnalités ajoutées pendant cette session** (toutes testées côté Perig, validation partielle — voir ci-dessous) :

1. **Zoom vertical de la frise** (`state.timeline.vZoom` + `vCenter`) — pinch décomposé en composantes Δx/Δy, chacune pilotant un axe de zoom indépendamment. Diagonale applique les deux. Plancher de 30 px sur chaque axe pour éviter que le bruit sur l'axe faible explose en zoom sauvage.
2. **lonRange()** — fenêtre lon visible [startLon, endLon] basée sur vZoom/vCenter, clampée dans [0, 360]. tlY, lonFromTlY, bandes signes, courbes planètes lentes, items scrapbook : tous mis à jour pour la respecter.
3. **Rect visible et cliquable pour items ponctuels** (`retiredAt == createdAt`) — rect de ±15 jours autour de createdAt (largeur absolue en ms, pas fraction de fenêtre, pour que ça grossisse/rétrécisse avec le zoom H). Clic rouvre l'éditeur sur l'item avec texte pré-rempli, curseur en fin de texte.
4. **Contenu dans le rect** via `<foreignObject>` — première ligne du texte = titre (14px, bold), suite = corps (10px), overflow caché, pointer-events disabled pour que le clic traverse vers le rect.
5. **Graduation adaptative multi-strates** — années (existant, adapté), mois, jours, heures. Chaque strate s'active au-dessus d'un seuil pixel/pas (année >=50px, mois >=15px, jour >=8px, heure >=6px). Labels au-dessus de seuils plus hauts. Pas de doublon aux frontières (1er janvier → année seulement, 1er mois → mois seulement, 00h → jour seulement).
6. **Reset ↻ étendu** — reset aussi vZoom=1, vCenter=180.

## Ce que Perig a confirmé fonctionne

- **Mois visibles sur la graduation** à l'échelle appropriée (21h18 : "j'ai vu les mois").

## Ce qui reste à vérifier côté Perig

- **Lignes de jours** : "Pas de ligne" (21h18) — à ré-investiguer. Hypothèse à vérifier : au zoom où Perig testait, `dayPx` était peut-être sous le seuil de 8. Autre hypothèse : les lignes de jour s'affichent mais sont trop pâles (opacity 0.22 avec stroke-width 0.2, stroke color `var(--line-weak)`) pour être visibles sur son device/navigateur. **Première chose à investiguer en ouvrant la prochaine session** : lire `app.js` dans la zone "Strate JOURS" (vers `dayPx = 86400000 / msPerPx`) + CSS `.tl-day-tick` dans `style.css`. Instrumenter si besoin.
- **Lignes d'heures** : jamais testé (session courte).
- **Pinch V** : testé partiellement — Perig a signalé que la largeur ne variait pas avec le zoom (bug a corrigé), mais n'a pas re-confirmé que le zoom V lui-même fonctionne comme attendu.
- **Click sur rect pour re-édition** : jamais confirmé explicitement.

## Décisions de design acquises (ne pas réouvrir sans en reparler avec Perig)

- **Un seul modèle de rect** pour tous les items — pas de distinction visuelle entre ponctuels et durables, juste la largeur temporelle qui diffère.
- **Pinch horizontal → temps, pinch vertical → zoomer dedans, les deux simultanés en diagonale.**
- **Titre (1ère ligne) + corps** — convention de contenu : la 1ère ligne tient lieu de titre, plus gros pour être devinable à faible zoom.
- **Lecture : "tout se fera par zoom"** — on ne multiplie pas les shapes, on multiplie les niveaux de zoom. L'infini en Y et X de la frise contient tout, les rects se "déplient" en zoomant.

## Chantiers encore à venir sur la frise (dans l'ordre discuté avec Perig le 2026-10-19)

1. **Lignes de jours visibles** — fix après instrumentation (voir ci-dessus).
2. **Zoom infini** — pour l'instant TL_ZOOM_MAX=500 (H) et TL_V_ZOOM_MAX=24 (V). Perig mentionne "zoom infini" ; si on l'atteint, revoir ces plafonds + stratégies de rendu (foreignObject trop lourd à ces échelles ?).
3. **Florilinks** (liens graphiques bidirectionnels entre inscriptions, inspiré de poietic/florilège) — Perig a précisé : **demander à agent poietic le mérite et le pattern** avant de coder, pas improviser.
4. **Swipe-down → hard reload** — reporté à jeudi 2026-10-22 explicitement (mémoire `project_paradigme_frise_centrique.md`).

## Avant de commiter

**La session n'a pas commité**. Décision à prendre à l'ouverture : commit groupé (zoom V + graduation adaptative + fix largeur ponctuels + contenu dans rect + click pour édition) OU splitter. Perig préfère souvent un seul commit par séance validée — vérifier avec lui, puis `git add app.js style.css` et commit avec message résumant les 6 pièces.

## Lecture préalable obligatoire (ordre)

1. `./CLAUDE.md`
2. `./memory/MEMORY.md`
3. **`./memory/project_paradigme_frise_centrique.md`** — paradigme fondateur, principes à ne pas trahir
4. `./memory/project_frise_horizontale_v1.md` — décisions architecturales de la frise (segments vs points, tlCenter indépendant de chartTime, cache fullTimelineRange)
5. `./memory/feedback_pas_de_theorisation_predictive.md` — pas de sur-théorisation, laisser l'usage trancher les apories
6. `./notes/2026-10-18-session-v03-passation-roadmap.md` — brief précédent (ROADMAP + archéologie)

## Règles non négociables (rappel)

- Pas de commit sans aval explicite (push OK par convention projet).
- Dev server tourne via systemd user `astrolab-dev` sur `http://perig:8787/` (ou localhost:8787 sur poste).
- Si prompt de permission Agora échoue, fournir la commande CLI exacte.
- Rite de clôture : fiche mémoire + archivage brief + commit. Cette session : brief archivé (notes/2026-10-18-session-v03-passation-roadmap.md), fiche mémoire du paradigme frise-centrique déjà écrite ce matin, commit en attente de validation.
