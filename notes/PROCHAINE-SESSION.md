# Prochaine session astrolab — à ouvrir en premier

**Contexte** : la session précédente (2026-10-20 midi, 11h43 → 12h25) a été close après **arrêt conceptuel** décidé par Perig. Son brief est archivé dans `./notes/2026-10-20-session-v02-arret-conceptuel.md`. **Lecture obligatoire** avant de taper du code : `./memory/project_zoom_continu_apories.md`.

## Ce qui a été acté le 2026-10-20

- Le **pinch continu H+V multi-strates** est abandonné (impasse technique Chrome Android + distorsion images dans foreignObject + tranches illisibles aux hautes strates).
- Direction cible esquissée par Perig : **snap par crans H discrets** (année ↔ mois ↔ jour ↔ heure) + **drag H temporel** à l'intérieur du cran + **pinch V continu préservé** pour explorer les signes/degrés.
- **Dette conceptuelle** à traiter AVANT toute implémentation : *quelle étendue verticale a un élément scrapbook ?* (point du zodiaque = 1/360 ? signe = 1/12 ? multi-signes libres ?)

## Première chose à faire à l'ouverture

**NE PAS commencer par du code.** La prochaine session doit s'ouvrir par une **discussion de définition** avec Perig :

1. Est-ce que l'élément scrapbook a toujours une étendue verticale, ou peut-il être ponctuel (1 degré) ?
2. Si étendue : bornes libres (`lonStart`, `lonEnd`) ou snap sur signes (enum `scope`) ?
3. Quand on zoom V, les éléments doivent-ils **grossir avec le zoom** (distorsion image acceptée ? refusée ?), ou **garder une taille fixe en pixels** avec étendue sémantique indiquée séparément (ex. barre latérale) ?
4. Point d'entrée du re-engineering : partir de **l'élément lui-même** (le cadre texte riche + image, inaltérable) et laisser son invariant dicter l'interaction.

## État du working tree

**Rien n'a été commité depuis `f725e98` (matin du 2026-10-19).** Modifs non commitées dans `app.js` et `style.css` accumulent :
- Travail d'hier soir 2026-10-19 : zoom V, lonRange, graduation adaptative années/mois/jours/heures, rect visible pour items ponctuels, foreignObject titre+corps, click re-édition.
- Travail de la session matinale 2026-10-20 (préexistante à v02) : pointer events filtrés `pointerType==='touch'`, pan 1-doigt via touchstart, listeners `window` + `capture:true` pour touchmove, `PINCH_AXIS_DEADZONE=20`, panneau debug `?debug=pinch`.
- Toute l'instrumentation debug de la session v02 (midi) a été **retirée**. Le fix pinch tenté a été **reverté**.

**Décision à prendre à l'ouverture** :
- (A) **Commit « sédimentation 2026-10-19 + ajustements pinch » en l'état** (ce qu'on a marche, c'est frustrant mais pas pire que `f725e98`), puis partir du re-design proprement par-dessus.
- (B) **Revert complet à `f725e98`** (`git restore app.js style.css`) et repartir vraiment de zéro — on perd le zoom V, la graduation adaptative, les améliorations de pinch pré-session-matin. Cohérent si le re-design cran-par-cran impose un rendu différent.
- (C) **Commit l'état et créer une branche d'archive** `pre-redesign-2026-10-20` avant de bosser.

Mon avis d'orienteur (à challenger) : **(A)**. Les améliorations d'hier soir (graduation multi-strates, foreignObject titre+corps) seront réutilisables dans le nouveau paradigme. Le pinch cassé sera réécrit de toute façon.

## Chantiers à faire après que le re-design soit tranché conceptuellement

- Modèle de données élément scrapbook (champs `lonStart`, `lonEnd`, `crans[]` ou équivalent selon décision).
- Logique de rendu par cran (pleine géométrie / barre verticale / cadre vide).
- Interaction tap-pour-zoom-au-cran (bidirectionnelle).
- Snap H + drag H fluide (transition entre crans).
- Pinch V préservé (compatible avec étendue sémantique des éléments).

## Chantiers hérités toujours valides (après re-design)

- Florilinks — demander à agent poietic le mérite et le pattern.
- Swipe-down → hard reload — reporté à jeudi 2026-10-22.
- Lignes de jours visibles (si le re-design conserve une graduation fine).

## Lecture préalable obligatoire (ordre)

1. `./CLAUDE.md`
2. `./memory/MEMORY.md`
3. **`./memory/project_zoom_continu_apories.md`** — fiche fondatrice de la nouvelle direction
4. `./memory/project_paradigme_frise_centrique.md` — boussole non remise en cause
5. `./memory/feedback_pas_de_theorisation_predictive.md` — ne pas sur-théoriser le re-design non plus
6. `./notes/2026-10-20-session-v02-arret-conceptuel.md` — récit complet de l'arrêt

## Règles non négociables (rappel)

- Pas de commit sans aval explicite.
- Dev server systemd user `astrolab-dev` sur `http://perig:8787/`.
- Si prompt Agora échoue, fournir commande CLI exacte.
- **Nouvelle règle issue de cette session** : ne pas replonger dans le debug du pinch continu si une nouvelle session l'exhume. L'aporie n'est pas technique.
