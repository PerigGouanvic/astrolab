# Brief session suite — Convivialité mobile (préparé 2026-10-07 nuit)

Session nuit 2026-10-06 → 2026-10-07 (23h-1h), suite du Jour 2 rencontre. Lag frise résolu, ancrage zodiacal items scrapbook posé, bottom sheet mobile v1 (à vide) livré. Perig est allé dormir, ce brief rassemble les gênes mobiles qu'il a dictées pour triage.

## Les 5 doléances dictées par Perig (ordre d'apparition brute)

1. **Menu encombrant, sans hiérarchie** — tout de "moment choisi" (slider) à "astéroïde par nom" : trop gros, pas rangé, pas de distinction usage courant / rare. **Chantier v1-critique.**
2. **Voyage temporel en bougeant les planètes/axes** — feature **additive** (pas en remplacement du slider). Geste direct sur la roue pour scrubber le temps. Branche design non-triviale.
3. **Zoom indépendant cercle vs frise** — chacun son viewport. Techniquement propre (deux `<svg>` séparés déjà), machinerie zoom déjà écrite pour la frise à dupliquer pour le cercle.
4. **Frise plus haute** — conséquence directe de 1 (si le chrome rétrécit, la frise respire).
5. **Agacement mobile-first** — pas une tâche, un carburant. Note : Perig *fait* mobile-first (teste exclusivement sur mobile, porte les gênes mobiles comme priorité) — ce qu'il rationalise est l'héritage pré-mobile. Dépouillement en cours, pas faute.

## Triage proposé (à valider avec Perig)

### v1-critique mobile (chantier court terme)
- **1 + 4** = même chantier : refonte interne du bottom sheet. Modèle à cristalliser : *essentiel toujours visible / avancé repliable / rare dans un tiroir*.
  - Essentiel visible (dans peek) : mode now/natal, slider temporel, reset temps.
  - Avancé repliable : couches, aspects (déjà en popup), scrapbook hint.
  - Rare / dans un sous-tiroir : export/import, proxy, recherche astéroïde + chips.
- **3** = zoom indépendant cercle/frise. Petit, autonome. À faire aussi.

### Confort (à faire après v1-critique)
- Rendre la poignée du sheet plus découvrable (micro-animation au premier chargement ?).
- Vérifier que les gestes sheet n'interfèrent pas avec les gestes carte/frise.

### Branche design (ambition plus large)
- **2** = voyage temporel en tournant planètes/axes. À concevoir calmement :
  - Quelle planète pilote ? Soleil ? Lune ? Axes ascendant/MC ?
  - Mode d'engagement : long-press + drag ? Modal "mode scrub" ?
  - Articulation avec le slider existant (pas en remplacement).

## État des 3 chantiers livrés cette nuit

1. **Lag frise résolu** (split render + RAF) — fiche `memory/project_fix_lag_frise.md`.
2. **Ancrage zodiacal items scrapbook** (lon + radius, items suivent la rotation des signes au scrubbing) — fiche `memory/project_ancrage_zodiacal_scrapbook.md`.
3. **Bottom sheet mobile v1 à vide** (3 états draggable, contrôles déplacés sans refonte interne) — fiche `memory/project_bottom_sheet_mobile_v1.md`.

## À faire au prochain démarrage de session

- **Test du sheet par Perig sur mobile** : vérifier gestes drag, tap, snap, que l'état peek est utilisable, que les contrôles existants fonctionnent sans régression.
- Si feu vert → attaquer la **refonte interne du sheet** (hiérarchie essentiel/avancé/rare).
- Puis **viewports indépendants cercle vs frise**.
- Ensuite, respirer avant le chantier "voyage planètes" qui demande design posé.

## Rappels pour l'humanoïde qui ouvre la prochaine session

- Perig est en route vers une rencontre avec un consulté (date approchait au 2026-10-09 selon le plan rencontre). Vérifier où on en est de ce côté.
- Les deux fonds de scrapbook (ancrage zodiacal, lag frise) sont des **livraisons de nuit** — tester avant de retoucher. Les items existants dans localStorage de Perig auront reçu leur `radius` au premier reload (migration auto).
- Le sheet est en **v1 à vide**, pas la refonte finale. L'intérieur reste tel quel — ne pas s'offusquer de l'empilement actuel des contrôles dans le sheet expanded, c'est le chantier suivant.
