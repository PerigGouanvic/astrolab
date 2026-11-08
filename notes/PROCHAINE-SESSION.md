# Prochaine session astrolab — à ouvrir en premier

**Contexte** : session 2026-11-07 soir — la feature phare « bandes d'ingress » a été livrée (étapes 2→5), poussée (commits 5ab45a7, 2271c25, 3a1c212, b656b35) et re-sanitisée en cache-bust (commit 3856a1a : `app.js?v=111` + boot-probe `astrolab v111`). Test d'acceptation passé : Perig a reconstitué à l'œil nu Chariklo ♒ 2021-24 sur son Soleil et son NN. Mais le trajet UX pour y arriver a été poussif, et Perig nomme : *« cette fonctionnalité révèle à quel point c'est mal foutu — un des meilleurs tests pour la refonte UX, pas le test ultime »*.

## État du code à l'ouverture

- Branche `astrolab-2d`, working tree **propre** côté dépôt. Commit `c45a6e6` (virage destinataire) pas encore poussé — le vérifier à l'ouverture (`git log origin/astrolab-2d..HEAD`).
- HEAD : `3856a1a [2D] cache-bust rattrapage : app.js v=107→111 + boot-probe v80→111`
- Cache-bust courant : `app.js?v=111`, boot-probe `astrolab v111`. **Tout nouveau commit touchant app.js doit continuer à bumper** (voir `feedback_bump_cache_bust_obligatoire.md`).

## Chantier à ouvrir — refonte UX guidée par la feature-révélateur

Fiche mère : **`./memory/project_chantier_ux_refonte.md`** (posée à la clôture de la session 2026-11-07 soir).

Elle contient :
- Pourquoi ce chantier (déclencheur du 2026-11-07 et ses mots)
- Les 6 ruptures UX rendues visibles par la feature d'ingress
- Un détail de plomberie (glyphes lents masqués par défaut au boot) à régler au passage
- La posture attendue (pas de code tout de suite, cartographier d'abord AVEC Perig)
- La liste des fiches à (re)charger — en particulier `project_bottom_sheet_mobile_v1.md` qui a laissé la refonte interne de la hiérarchie des contrôles **explicitement en attente** depuis le 2026-10-07. C'est le moment.
- Les anti-scopes
- Un critère de clôture possible (boussole, pas livrable)

## Comment ouvrir

1. Lire la fiche mère en entier.
2. Lire les 2 gisements : `project_frustrations_apps_astro.md` et `project_exigences_killer_app.md`.
3. Relire `project_bottom_sheet_mobile_v1.md` (défer explicite de la refonte interne).
4. **Ne pas foncer en code.** Demander à Perig de raconter un trajet mental concret (« quand je veux savoir où est passé X à l'époque Y, qu'est-ce que j'aimerais faire ? »), puis comparer à l'actuel.
5. Si Perig propose une piste, ancrer dans un cas concret tiré de sa pratique (ex. Chariklo sur NN, ou le cas « messager du ciel » → relancer un consulté).

## Suite possible

- Une ou plusieurs sessions sur le chantier, livrables commitables par étapes.
- Le chantier n'est pas obligé de s'achever vite. Fiche vivante.

## Pointeurs mémoire essentiels

- ⚡⚡ `./memory/project_chantier_ux_refonte.md` — fiche mère (nouvelle)
- ⚡⚡ `./memory/project_bottom_sheet_mobile_v1.md` — sheet v1 + refonte interne déférée
- ⚡⚡ `./memory/project_fonctionnalite_phare_bandes_ingress.md` — fiche phare qui a servi de révélateur
- ⚡⚡ `./memory/project_frustrations_apps_astro.md` — gisement négatif à rejouer contre chaque proposition
- ⚡⚡ `./memory/project_exigences_killer_app.md` — gisement positif à rejouer contre chaque proposition
- `./memory/project_articulation_cercle_frise.md` — invariant roue↔frise
- `./memory/project_pattern_messager_du_ciel.md` — cas d'usage légitimant la co-évolution

## Note de fin de journée (2026-11-07 soir)

Feature d'ingress livrée + poussée + testée. Cache-bust rattrapé. Virage destinataire posé ce matin (`c45a6e6`). Et maintenant : Perig lui-même nomme le besoin de session UX dédiée, pas moi qui le propose. C'est la bonne entrée : l'app est utilisable et exigeante au bon niveau pour que ses défauts se voient.
