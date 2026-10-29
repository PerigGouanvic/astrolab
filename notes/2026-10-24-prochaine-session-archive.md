# Prochaine session astrolab — à ouvrir en premier

**Contexte** : la session précédente (nuit du 2026-10-24 au 2026-10-25, 12h30 → 00h14) a été ouverte sur un fix mi-points raté de DeepSeek et s'est déplacée vers une pensée ouverte sur l'articulation cercle↔frise + la durée des scraps. **Lecture obligatoire** avant toute suite : `./memory/project_articulation_cercle_frise.md`.

## État du code à l'ouverture

- Working tree **propre**, poussé sur `origin/astrolab-2d`.
- Dernier commit : `509e18f [2D] mi-points : revert anti-collision — la superposition est significative`.
- Les mi-points sont revenus à leur état avant `725e391` : ticks identiques, labels superposés sur clusters denses — c'est voulu.

## Ce qui a été acté dans la nuit du 24→25

- Les patchs anti-collision mi-points (de DeepSeek `725e391`, puis mitigation `aeaf0cd`) sont tous les deux **rejetés**. Revert complet appliqué.
- Diagnostic : la densité ~45 mi-points en 360° est intrinsèque. Étaler trahit la concentration réelle sur 1-2°. Les clusters sont des micro-univers de sens.
- Les mi-points n'étaient qu'un révélateur d'un problème plus large qui concernera aussi les aspects serrés et les scraps externes.

## Ce qui a été ouvert mais pas tranché

Voir fiche `project_articulation_cercle_frise.md` pour le détail. Résumé des pivots :

1. **Invariant 1° écliptique = 4 min temps terrestre** — zoom cercle et palier frise sont la même grandeur en deux unités.
2. **Deux régimes de cercle** (ASC-global vs sidéral-zoomé-fixe).
3. **Scraps = marqueurs lieu-moment** (coordonnée écliptique × date).
4. **Durée scraps = gestes utilisateur** (ne rien faire → atténuation / relâcher / sacrer) + vibration par rappels futurs des transits.
5. **Zoom out années/décennies** = seuls sacrés subsistent (« en arrière de la tête »).

**Apories ouvertes** (à ne pas trancher prématurément) : seuil de bascule entre régimes de cercle, comportement du cercle en vue années, pondération des rappels, couplage auto zoom↔palier ou non.

## Première chose à faire à l'ouverture

**NE PAS commencer par du code.** Perig a demandé explicitement « on recommence demain soir » et la session a été close sur « pas de code tant que l'usage n'a pas tranché les apories ».

À l'ouverture :
1. Lire `memory/project_articulation_cercle_frise.md` en entier.
2. Demander à Perig où il en est de la pensée (a-t-elle incubé pendant la nuit ? un angle s'est-il précisé ?).
3. Si Perig veut avancer sur un sous-chantier concret (ex. prototyper une maquette statique d'un cercle sidéral-fixe pour voir, ou implémenter le geste de « sacrer » manuel), tracer un plan court. Sinon, continuer à penser.

## Ne pas confondre avec les chantiers antérieurs encore vivants

Le `project_refondation_plan_v1.md` du 2026-10-21 reste la boussole pour la refondation frise + scrapbook si on y retourne sans passer par les pivots du 24. Les deux ne sont pas incompatibles — la pensée du 24 vient compléter, pas remplacer.

## Antidrift

- Ne pas lancer de web search auto-correctif sur l'astrologie, Scira/Perplexity sont le canal de Perig si besoin.
- Pas de modif de code sans plan validé.
- Si Perig dit « rien n'avance », rappel : c'est le domaine du 3e canal (consultation spirituelle), pas une invitation à produire des options.
