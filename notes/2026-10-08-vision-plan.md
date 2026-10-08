# Vision + plan astrolab-2d — nuit du 2026-10-07 au 2026-10-08

**Contexte d'écriture.** Nuit préparatoire à la 1ère rencontre exploratoire avec un consulté identifié (jeudi soir, ~18h après). Deux retournements majeurs posés dans la soirée (via le LSM de Perig puis dans la foulée) retournent la conception centrale d'astrolab. Ce document fait **bilan** (où on en était), **vision synthétique** (comment ça tient ensemble maintenant), et **plan** (étapes vers la 2e rencontre et au-delà).

La 1ère rencontre n'est pas une démonstration. C'est **apprendre du client**. Donc rien de ce qui est écrit ici n'a besoin d'être livré avant demain soir. Ce document est pour la **seconde** rencontre — pour que Perig arrive avec une vision tenue et un plan hiérarchisé.

---

## 1. Bilan — ce qui était posé au seuil de cette nuit

### 1.1 Posture conceptuelle

Astrolab n'est pas un calculateur de thème + un afficheur. Les fiches mémoire du projet (notamment `project_scrapbook_architecture.md` du 2026-09-05 et `project_feature_planetes_perles.md`) le disaient déjà, mais pas toujours dans ces termes :

- Astrolab est un **système d'accrétion biographique** — la carte est l'infrastructure d'un journal spatialisé personnel, pas une vue instantanée.
- Le **cercle astrologique est une interface de composition**, pas seulement de consultation. L'utilisateur va **puiser dans les matériaux accumulés** d'une planète ou d'une maison, en rassemble plusieurs, « juste pour voir, juste pour s'inspirer ».
- La logique est **soustractive** — chaque strate est indépendamment activable/masquable ; une couche masquée **n'ajoute aucun élément au DOM**, pas simplement `display:none`.
- Aucun **LLM analytique** — le LLM est au maximum un assistant de placement (routage thématique 12-classes maisons), jamais une voix interprétative. Fallback manuel toujours disponible.
- Astrolab reste **un logiciel d'astrologie**. Un sceptique peut s'en servir, mais c'est un effet secondaire heureux, pas un pivot de positionnement.

### 1.2 Modèle de données

Les items du scrapbook, posés sur le cercle, sont ancrés en **(longitude écliptique, rayon)** — pas en (x, y) absolus. Ils **suivent la rotation des signes** quand le temps bouge (c'est le fix du 2026-10-06/07). Les coordonnées XY ne sont qu'un cache de rendu, recalculé à chaque frame.

Le placement d'un item n'est **jamais univoque** — c'est un **barycentre pondéré** entre plusieurs facteurs : maisons activées, planètes activées, astéroïdes activés, déplacement manuel (qui prime), répulsion mutuelle. Possibilité de résolution XY puis Z (stacking).

Les **ancrages possibles** d'un item sont déjà conceptuellement multiples :
- Maison
- Planète du jour (transit actuel)
- Planète natale (de soi)
- **Planète d'autrui** — superposable par personne, planète par planète
- Astéroïde actif
- Coordonnée libre

### 1.3 Infrastructure sociale

Décisions du 2026-10-05 :

- **Destinataire = consultés co-évolutifs nommés**, pas Play Store. Les tests S23 Ultra via Tailscale sont internes.
- **Scrapbook = infrastructure de l'échange**, pas supplément. Non-négociable en v1. Doit migrer de `localStorage` à Google Drive partagé avant toute mise en main.
- **Fin de cycle décidée conjointement** — Perig retire son partage Drive quand c'est juste. Pas d'auto-expiration, pas de compteur de séances, pas de scoring. Le consulté garde son contenu propre.
- **Trois jalons avant mise en main** : convivialité mobile aboutie, intégration Drive opérationnelle, première proposition formalisée.

### 1.4 Angles éditoriaux

Le CLAUDE.md et une fiche dédiée nommaient **Saturne/Uranus = verrou/clef** comme angle éditorial de la v1 — à infuser dans vocabulaire (verrou, clef, cristallisation, fissure, libération), soustractions pré-réglées, lecture des transits durs.

**Correction nommée cette nuit** : S/U n'est pas la seule théorie importante pour Perig. Jupiter/Neptune et Mars/Pluton sont tout aussi structurants, et il y en a d'autres (détails passés). La fiche angle_saturne_uranus elle-même disait déjà « angle de v1, pas définitif, à réévaluer après les premières consultations ». Ce qui change dans la vision n'est pas S/U — c'est qu'astrolab doit être conçu pour **accueillir plusieurs angles éditoriaux**, pas pour en imposer un. S/U reste **un** angle important parmi d'autres. Le choix d'infuser un angle particulier dans l'UI (vocabulaire, présets) est un **geste réversible et pluriel**, pas une signature identitaire fixée.

### 1.5 Stack technique

PWA mobile-first + rendu SVG + Google Drive (scope `drive.file` + Picker). Pas de Capacitor en v1. Pas de bundler lourd. Flow OAuth redirect. Deux branches : `astrolab-2d` (v1 publiable, ici) et `main` (recherche 3D long terme, stash préservé).

### 1.6 Features déjà conçues en fiche

- **Synastrie intégrée** (depuis août) — planètes des proches superposées au natal+transits, granularité par planète. « N'existe nulle part ailleurs », argument de différenciation fort.
- **Métaphore de la perle** — chaque planète s'épaissit de dépôts astronomiques + biographiques ; clic planète ouvre son florilège daté ; mode scrapbook = sélection multi-planètes rassemble les matériaux, inspiration non-analytique.
- **Mode apprentissage** — bouton `?` toggle, popup descriptif sur clic (fiches rédigées par Perig, pas LLM, fallback propre).
- **Mode voyage temporel** — bouton frère, glisser planète cale `chartTime` sur la date où elle était effectivement à cette position.
- **Section configuration tailles** — sliders par type de glyphe, variables CSS, persistance.
- **Atelier de glyphes** (v1 livré 2026-10-07) — modale fullscreen pour harmoniser la taille des glyphes planétaires. **Zone « corps inventés » prévue** (bouton disabled) pour câbler l'upload SVG — c'est la porte d'entrée technique vers les marqueurs individués.

---

## 2. Les deux retournements de cette nuit

### 2.1 Retournement 1 — Le cercle est une archive peuplée interrogée

Nous sommes partis de « le praticien pose des marqueurs sur son cercle » (reçoit-et-épingle). Mais le LSM de Perig a montré que c'est le **mouvement inverse** qui domine en pratique.

**Formulation** : on arrive devant un point du zodiaque et on demande *qu'est-ce qu'il y a là ?* Et à ce point peuvent se trouver — pour qui a travaillé le ciel comme un territoire — le Mars de Mélanie, le Soleil de Clint Eastwood, le Pluton de Franz Kafka, la lune d'un événement, tel astéroïde peu connu. Le cercle est **déjà peuplé** d'une multitude de présences, et le geste premier du praticien, c'est **l'interrogation d'un lieu**.

Conséquences :

- Astrolab n'est pas seulement un outil de thème individuel. C'est une **cartographie zodiacale partagée** que ton thème personnel traverse. Ton Soleil est à côté du Pluton de Kafka — c'est une donnée du lieu, pas de toi seul.
- Le geste premier est le **pointage interrogateur** (« qu'est-ce qui vit à ce degré ? »), le second est l'épinglage par discernement.
- La **densité du ciel** devient matière : certains degrés sont peuplés, d'autres vides, et cette inégalité est lisible.
- C'est aussi puissant pour un chevronné que pour un apprenant. Pour l'apprenant surtout : faire de l'astrologie **par voisinage inattendu** plutôt que par théorie — un débutant qui pointe son Mercure et découvre qui d'autre l'a là apprend par la main, pas par la table.

### 2.2 Retournement 2 — Le cercle est un tuner de contenus vivants

Immédiatement après : il ne s'agit pas seulement d'une archive statique (personnes historiques, événements, astéroïdes connus). Le cercle doit aussi donner accès à **des contenus vivants** — comptes TikTok et autres plateformes qui publient régulièrement sur telle planète dans tel signe, telle maison, telle configuration.

**Analogie fondatrice** : le vieux bouton de radio ou de TV qu'on tourne pour syntoniser une station. On apprend la radio **en syntonisant**, pas en lisant la radio.

Conséquences :

- Le cercle devient un **cadran de syntonisation** — pas sur des stations mais sur des **régions zodiacales**.
- Trois couches se superposent alors dans un même geste de pointage :
  1. **Marqueurs épinglés** (par discernement du praticien) — ponctuels, décidés.
  2. **Peuplade de l'archive** — personnes historiques, événements, astéroïdes connus accumulés dans le temps.
  3. **Flux vivants externes** — créateurs qui publient en ce moment sur cette région.
- Astrolab devient un **portail d'accès au vivant astrologique**, pas seulement un logiciel qu'on installe pour voir son thème. Scope qui dépasse largement la v1 actuelle, mais la direction est posée.
- Pédagogie révolutionnée : **une main qui syntonise un territoire vivant**, découverte par sérendipité, apprentissage par la main et par le voisinage. L'astrologie se mange par l'oreille, pas par la définition.
- Statique et vivant **cohabitent** — certaines régions se tairont, d'autres naîtront. Le bouton ne garantit pas qu'il y a toujours une émission ; parfois c'est le silence qui est beau. L'app doit tolérer les régions muettes **sans les cacher**.

### 2.3 Nuance sur la typologie des marqueurs épinglés

En parallèle des deux retournements, Perig a énuméré la **typologie des marqueurs** qui l'intéressent en pratique :

- **Marqueur-trace** — événement passé qui a imprimé, « comme une étoile fixe ». Persistant.
- **Marqueur-transit figé** — épingle d'un moment où un transit a frappé. Figée là où il a frappé, même si la planète réelle poursuit. (La planète en mouvement en temps réel, c'est le mode « maintenant » du cercle, pas un marqueur.)
- **Marqueur-personne** — pas « les 10 planètes de X posées » mais **les points de l'autre qui comptent dans cette relation**. **Critère non-automatique** : parfois ce sont les planètes *sans aspect* avec les miennes qui sont les plus précieuses, parce qu'elles tombent dans mes zones vides et apportent quelque chose de pur, non mélangé. « Les aspects, on peut se mélanger avec l'autre. »
- **Marqueur-hypothèse** — zone vide activable (point focal d'une opposition en sextile/trigone, par ex.). Spéculatif. À poser, à retirer.
- **Marqueur-densité** — zone empiriquement chargée en synastries, nommée sans détailler. Flou volontaire.

Deux choses frappantes :
- Un marqueur **n'est pas forcément un point planétaire** — ça peut être une zone (cas hypothèse et densité). L'unité est **le lieu sur le cercle** (point ou arc) + **une origine typée**.
- L'économie est **soustractive à l'intérieur même du dispositif** — nommer une densité sans la détailler est un geste de ne-pas-afficher-tout qui est pleinement légitime.

Et pour le **rendu visuel** des marqueurs-personne : pas de glyphe custom par personne. Mars reste Mars (lecture astrologique préservée), avec **un médaillon** (initiales M, MC, MB) et **une teinte distinctive**. Au zoom-proche, la photo de la personne peut remplacer le médaillon. L'interface zoomable **devient le mécanisme d'adaptation** — pas besoin de palette fixe, pas besoin de légende au repos.

---

## 3. Vision synthétique

### 3.1 Astrolab = cercle-cristal

Le cercle d'astrolab n'est pas un diagramme astrologique. C'est un **cristal** à travers lequel on regarde plusieurs couches de réel. Un même degré du zodiaque, examiné attentivement, donne à voir simultanément :

- Ta position natale, si tu as quelque chose là
- Les positions actuelles des planètes qui y transitent
- Les positions natales de personnes qui comptent pour toi (si tu les as posées)
- Les figures historiques, mythiques, artistiques qui y ont leur Soleil, leur Pluton, leur Lune
- Les événements que tu as choisi d'y ancrer biographiquement
- Les créateurs qui s'y expriment en ce moment (publications régulières)
- Les hypothèses que tu y as posées (zone vide activable, point focal non activé)
- Les notes, images, et traces que tu y as déposées dans le scrapbook partagé

Un seul geste de pointage traverse toutes ces couches. **La soustraction** permet de n'en garder qu'une (ou qu'une sélection) selon ce qu'on cherche à voir. Chaque couche a sa propre présence visuelle, son propre statut temporel (fixe, mobile, flux), sa propre temporalité (persistant, en séance, cycle en cours).

### 3.2 Trois couches qui se superposent dans un même pointage

Pour clarifier la logique interne :

| Couche | Qu'est-ce qu'on y trouve | Qui l'alimente | Statut temporel |
|---|---|---|---|
| **Marqueurs épinglés** | Traces d'événements, transits figés, personnes choisies, hypothèses, densités | Toi, le consulté, à discernement | Persistants ; retirables |
| **Peuplade de l'archive** | Personnes historiques, événements marquants, astéroïdes avec leur signification | Base construite incrémentalement — publique partielle + privée partagée | Permanente |
| **Flux vivants** | Comptes de créateurs qui publient sur telle configuration | Curation (toi d'abord, collectif plus tard) + convention de taggage à inventer | Changeant, régénéré |

### 3.3 Posture : laboratoire d'hypothèses, pas instrument d'oracle

Astrolab **n'impose aucune théorie**. L'angle Saturne/Uranus est un angle important de Perig, qui informe certaines fonctionnalités (soustractions dédiées, vocabulaire). Jupiter/Neptune, Mars/Pluton, et d'autres sont tout aussi structurants et doivent pouvoir trouver leur place.

L'app est un **laboratoire** où le praticien :
- Teste des hypothèses (pose un marqueur-hypothèse, l'active, voit si ça parle, le retire)
- Compare des grilles de lecture (afficher le cercle avec les présets S/U, puis avec les présets J/N, voir ce que chaque angle révèle)
- Produit du vocabulaire infusable (un angle = un ensemble de présets soustractifs + un lexique de popup + éventuellement des glyphes/teintes dédiés)

Deux conséquences techniques :
- Les **présets de soustraction** doivent être pluriels, nommés, interchangeables (pas un seul « défaut » invisible). On doit pouvoir basculer d'une grille à l'autre.
- Le **vocabulaire d'interface** (popups du mode apprentissage, étiquettes de maisons/planètes) devrait pouvoir être **thématisé** selon le preset actif, dans la limite du raisonnable.

### 3.4 Posture : reçoit-et-épingle (vs calcule-et-propose)

Astrolab **ne propose jamais automatiquement** ce qui est significatif. Il **reçoit** ce que le praticien a décidé de mettre en évidence, et **épingle** à la position correcte. Le calcul (positions planétaires justes, aspects corrects, longitudes exactes) **reste disponible en coulisse**, mais ne devient pas en soi une suggestion déversée à l'écran.

Cette posture a une conséquence majeure pour la synastrie : **pas de bi-wheel standard**, pas de « voici les 10 planètes de ton consulté posées en anneau extérieur ». Si un jour on veut une **synastrie intégrale** classique, c'est une **invocation ponctuelle** (« montre-moi la synastrie classique avec X ») qui déverse temporairement puis se replie — pas le mode par défaut.

### 3.5 Pédagogie par voisinage et syntonisation

Les deux retournements convergent sur un modèle pédagogique très différent du manuel ou du tableau :

- **Voisinage** — l'apprenant pointe son Mercure, découvre que Kafka a aussi Pluton là, s'interroge sur le lien. Il apprend par **enquête topologique**, pas par définition.
- **Syntonisation** — l'apprenant tourne le cadran, écoute un créateur, continue si ça n'accroche pas, revient si ça résonne. Il apprend par la **main** et par la **durée**, pas par l'étude.

Cette pédagogie est aussi utile aux chevronnés : un praticien expérimenté qui scrute un transit en cours peut interroger « qu'est-ce qui s'active là en ce moment ? » et faire remonter à la fois des archives et des flux vivants. C'est **le même geste** à deux niveaux d'expertise différents.

### 3.6 Lien avec le scrapbook

Les retournements ne contredisent pas le scrapbook — ils **lui donnent son contexte complet**. Un item de scrapbook est déjà conceptuellement un marqueur épinglé à (lon, radius) ; il porte texte, image, dates, significations. L'extension est claire : les **marqueurs typés** (trace, transit figé, personne, hypothèse, densité) sont des **sous-types d'items de scrapbook**, avec des conventions de rendu propres et des provenances différentes. L'infrastructure est déjà prête.

Le scrapbook devient donc **la grammaire d'inscription unifiée** sur le cercle. Ce qui diffère entre « un cadre textuel qui raconte un événement de ta vie » et « un marqueur-personne qui pose Mélanie-Mars » n'est pas la structure (item ancré à lon/radius, portant du contenu) — c'est le **type** et la **convention de rendu**.

---

## 4. Plan

### 4.1 Horizon 1 — Avant la 1ère rencontre (dans ~18h, exploratoire)

**Rien à livrer techniquement.** La rencontre est pour apprendre du consulté, pas pour lui montrer un produit fini. L'app en état actuel (branche `astrolab-2d`, commit `7df1cea`) est utilisable et déjà porteuse de l'essentiel — scrapbook phase A′, modes commutables, aspects unifiés, zoom cercle indépendant.

**Ce qu'il faut préparer à la place** :

- Un petit **jeu de questions à poser au consulté** pour que la 1ère rencontre nourrisse la 2e (voir §5 ci-dessous).
- Une **lecture lente de la vision** (ce document, section 3) pour que Perig arrive avec les mots qui tiennent. Pas pour les réciter — pour qu'ils soient disponibles si une question du consulté les appelle.
- Un **arrière-plan serein** : pas de code cette nuit, pas de bump de cache, pas d'optimisation. La nuit uranienne a produit la vision ; il faut la laisser sédimenter.

### 4.2 Horizon 2 — Avant la 2e rencontre (dates à définir après la 1ère)

Trois chantiers techniques prioritaires, dans cet ordre :

**Chantier A — Marqueur-personne minimal (ex-synastrie)**
- Activer la zone « corps inventés » de l'atelier de glyphes pour y ajouter **des personnes** (pas des glyphes custom, juste nom + initiales + teinte + photo optionnelle).
- Ajouter un **registre de personnes** (persisté dans Drive quand J4-J5 seront prêts, en `localStorage` entretemps).
- Permettre d'épingler **une planète d'une personne** à sa longitude natale sur le cercle courant, avec rendu glyphe-planète-standard + médaillon.
- Granularité par planète (comme la fiche synastrie_integree le prévoit depuis août).
- Soustraction : la couche « planètes-de-X » est activable/masquable, et chaque personne séparément.

Ce chantier est **beaucoup moins cher** que l'upload SVG, mais il livre la pièce qui débloque la consultation réelle.

**Chantier B — Intégration Drive (J3/J4/J5 du plan hérité)**
- Setup OAuth Google (projet Cloud, consentement, client ID).
- Google Picker intégré pour que le consulté sélectionne le dossier partagé par Perig.
- Migration du scrapbook de `localStorage` à Drive.
- Flow OAuth redirect (pas popup).

**Chantier C — Convivialité mobile aboutie**
- Refonte interne du sheet (hiérarchie essentiel/avancé/rare).
- Introduction du cran mid-haut.
- Frise respirante.

### 4.3 Horizon 3 — Après la 2e rencontre (co-évolution lancée)

- **Marqueurs typés étendus** : trace, transit figé, hypothèse, densité (en plus du marqueur-personne). Chaque type a sa convention de rendu.
- **Mode apprentissage activé** avec les premières fiches rédigées par Perig (angles éditoriaux pluriels — S/U d'abord, puis J/N, puis M/P au fil de la rédaction).
- **Mode voyage** (feature mode_voyage_planetes).
- **Section configuration tailles** câblée.
- **Capture mobile directe** (photo caméra, audio MediaRecorder).

### 4.4 Horizon 4 — Laboratoire long terme

Les retournements majeurs ouvrent sur un scope qui déborde largement la consultation 1-à-1. Ce sont des **directions de recherche**, pas des features v1 :

- **Peuplade partagée du zodiaque** — base de données collaborative de personnes historiques, événements, astéroïdes, construite incrémentalement. Modèle économique à inventer (gratuit, libre, communautaire, versionné ?). Interroger plus tard : public vs privé, modération, qualité.
- **Tuner de contenus vivants** — mécanisme d'indexation des publications de créateurs par région zodiacale. Convention de hashtag ? Scraping ? Base curatée ? Probablement **par curation manuelle au départ** (toi tu épingles des liens à des régions, comme on épingle des marqueurs — même grammaire).
- **Thèmes multiples présetables** — un praticien qui veut faire S/U aujourd'hui et J/N demain doit pouvoir basculer sans friction. Vocabulaire thématisé, présets de soustraction thématisés.
- **Portail versus outil** — astrolab devient un portail d'accès au vivant astrologique. Pose la question de ce qu'on garde en local, ce qu'on va chercher en ligne, comment on gère la connectivité (PWA offline-capable mais flux nécessairement en ligne).

Ces directions ne doivent pas être livrées en v1, mais la **conception technique** de la v1 ne doit pas les rendre impossibles. En particulier : le modèle de données **items ancrés à (lon, radius) avec type + provenance** est déjà compatible avec tout ça. Ne pas s'enfermer dans un schéma qui n'autoriserait que le scrapbook actuel.

---

## 5. Questions à poser au consulté en 1ère rencontre

(Suggestions à amender selon ce que Perig connaît du consulté. L'idée n'est pas de poser une check-list — c'est d'avoir en tête les angles qui vont nourrir la 2e rencontre.)

**Sur sa relation à l'astrologie :**
- Qu'est-ce que l'astrologie représente pour lui/elle en ce moment ? Est-ce une pratique quotidienne, intermittente, une curiosité, une discipline ?
- A-t-il/elle déjà utilisé des logiciels d'astrologie ? Lesquels ? Qu'est-ce qui l'y a plu ou déçu(e) ?
- Y a-t-il des **auteurs, créateurs, voix** qu'il/elle suit (livres, chaînes, comptes TikTok, etc.) ? C'est précisément le gisement du tuner de contenus vivants.

**Sur son rapport au cercle :**
- Y a-t-il des **régions du zodiaque** qu'il/elle a l'impression de connaître bien, et d'autres qui lui restent étrangères ?
- A-t-il/elle déjà remarqué des **voisinages inattendus** dans son thème ou dans ceux de ses proches ?

**Sur sa relation à son propre thème :**
- Y a-t-il **des événements de sa vie** qu'il/elle a déjà associés à des positions planétaires précises ? (C'est l'amorce du scrapbook.)
- Y a-t-il des **personnes qui comptent** pour qui il/elle serait intéressé(e) à voir une planète posée dans son propre cercle ? (Amorce du marqueur-personne.)

**Sur son attente :**
- Qu'est-ce qu'il/elle **espère** de la consultation à travers l'app ?
- Et surtout : **qu'est-ce qu'il/elle ne veut PAS** ? (Horoscopes génériques, lectures oraculaires, prédictions, culpabilisation par les transits durs, langage new-age ? Nommer ce qui bloque est au moins aussi important que ce qui attire.)

---

## 6. Ce qui reste en question

- **Scope exact du marqueur-personne en v1** : granularité (toutes les planètes de la personne ou choix explicite planète par planète dès la création ?), nombre de personnes simultanées, teintes attribuées auto ou choisies.
- **Base de personnages historiques** : d'où vient la peuplade initiale ? Trois sources envisageables, non exclusives : (a) saisie manuelle incrémentale par Perig lui-même (le plus simple pour commencer), (b) import depuis une base publique (Astrotheme et équivalents, si licence le permet), (c) partage inter-praticiens (plus tard, après v1).
- **Indexation des flux vivants** : les créateurs ne taguent pas « Mars en Lion maison 7 ». La v1 réaliste serait : **Perig épingle des liens à des régions**, comme on épingle des marqueurs — même grammaire. L'indexation automatique ou participative est une direction long terme.
- **Confidentialité et partage** : « le Mars de Mélanie » n'est pas public, « le Soleil de Clint Eastwood » peut l'être. Il faut au moins deux statuts (public/privé) sur chaque marqueur-personne, articulés au scope Drive (public = base commune, privé = lié à un dossier partagé spécifique).
- **Densité d'affichage** : à certains degrés il y aura beaucoup. L'interface zoomable est une partie de la réponse (loin = densité agrégée, proche = détail déplié), mais il faudra probablement aussi des filtres par type.

---

## 7. Visualisations

Croquis textuels pour donner corps à la vision — à transposer en vrai SVG/HTML plus tard, pas en v1 avant la 1ère rencontre.

### 7.1 Un pointage sur un degré — ce qui se révèle

Imaginer qu'on pointe à **12° Lion** sur le cercle d'un consulté. Trois couches cohabitent simultanément à ce lieu :

```
                        ╭─────────────────────────────╮
                        │  12° LION — pointage         │
                        │  ───────────────────────      │
                        │                              │
                        │  ◆ MARQUEURS ÉPINGLÉS         │
                        │     • Soleil natal du        │
                        │       consulté (trace)       │
                        │     • Marqueur-densité       │
                        │       zone 10-15° Lion       │
                        │       (observation)          │
                        │                              │
                        │  ◇ ARCHIVE PEUPLÉE            │
                        │     • Soleil de Napoléon      │
                        │     • Jupiter de Simone W.   │
                        │     • Astéroïde (1864)       │
                        │       Daedalus natal         │
                        │                              │
                        │  ≋ FLUX VIVANTS               │
                        │     • @astrokali (TikTok)    │
                        │       vidéo du 2026-10-02   │
                        │     • Article Nadia Gilchrist│
                        │       (2024)                 │
                        │                              │
                        │  [tout afficher | filtrer]   │
                        ╰─────────────────────────────╯
```

Au repos (sans pointage), le cercle montre les positions planétaires du moment + les marqueurs épinglés visibles (soustractions actives). Le pointage est **l'invocation ponctuelle** qui déploie ce que le lieu contient. Au relâchement, le détail se replie. La densité reste visible comme halo ou nombre.

### 7.2 Rendu du marqueur-personne — vue mobile

Trois états visuels selon le niveau de zoom :

```
Zoom-loin (vue d'ensemble du cercle) :
   ♂   ← glyphe Mars standard, avec petit médaillon circulaire
    ⬤      en coin supérieur droit (initiales "M" sur fond teinté)

Zoom-moyen :
   ♂        glyphe plus grand, médaillon plus visible, teinte distincte
   ⬤─M      sur le pourtour du glyphe

Zoom-proche :
   ╭───╮    photo circulaire remplace le médaillon,
   │ ⚡  │   glyphe Mars reste visible mais plus discret
   ╰───╯    (le visage prend le relais quand on y regarde de près)
    ♂
```

Pour plusieurs personnes à la même position (ex. Mars de Mélanie + Mars de Clint à 15° Scorpion) : les médaillons se déploient en **grappe** quand on approche, pas en superposition confuse.

### 7.3 Flow de syntonisation — tourner le bouton de radio

Pas une action unique, mais un **geste prolongé** sur le cercle. Imaginer un doigt (ou une souris) qui glisse le long du cercle intérieur, sur une bande dédiée (ou directement sur le cercle en mode « syntonisation activée ») :

```
État 1 — approche du secteur
    Le doigt entre dans la zone 10° Lion.
    Un petit indicateur de densité monte : "3 contenus · 2 présences"
    Rien ne s'affiche encore en détail.

État 2 — maintien sur le secteur
    Le doigt reste quelques instants.
    Un panneau latéral (ou flottant) commence à peupler :
      ≋ @astrokali — « Le Soleil en Lion II » (3 min)
      ≋ Nadia Gilchrist — « Lion placements » (texte)
      ◇ Soleil de Napoléon (12°)
      ◇ Jupiter de Simone W. (14°)

État 3 — sélection
    Doigt tapote sur un item.
    Le contenu s'ouvre (vidéo embarquée, article en lecture,
    ou fiche biographique de la figure historique).

État 4 — relâchement
    Doigt sort du secteur ou passe à autre chose.
    Le panneau se replie en douceur.
    Rien n'est modifié dans le cercle.
```

**Note importante** : la syntonisation **ne consomme pas**, elle **révèle**. Elle ne modifie pas l'état des marqueurs. C'est un geste de **consultation**, pas d'**inscription**. (L'inscription, elle, passe par le scrapbook via double-tap, qui existe déjà.)

### 7.4 Soustractions multiples — basculer entre grilles

Imaginer un petit panneau de présets en bas du sheet (ou dans le menu config) :

```
Grilles éditoriales :
  ○ Nue (positions seules, sans angle)
  ● Saturne / Uranus — verrou / clef    [actif]
  ○ Jupiter / Neptune — expansion / dissolution
  ○ Mars / Pluton — rupture / transmutation
  ○ Lune / Mercure — langue maternelle (en construction)
  + nouvelle grille…
```

Chaque grille, quand activée, charge :
- Un **vocabulaire** (étiquettes de maisons/planètes, popups du mode apprentissage)
- Des **présets de soustraction** (quelles planètes/maisons mettre en avant, lesquelles masquer)
- Des **teintes** éventuelles pour les planètes-clefs de la grille

Le praticien peut basculer d'une grille à l'autre dans la même consultation. **Rien n'est perdu** quand on bascule — c'est juste un angle de lecture qui change, pas les données.

---

## 8. Sédimentation prévue

Après ce document, trois fiches mémoire à écrire pour que les concepts fondamentaux de la nuit ne soient pas rejoués en logiciel-classique à la prochaine session :

- `project_posture_recoit_et_epingle.md` — la posture conceptuelle, le contraste avec calcule-et-propose.
- `project_cercle_cristal_couches.md` — les trois couches qui se superposent (marqueurs épinglés, archive peuplée, flux vivants) et le cercle comme interface d'interrogation.
- `project_marqueurs_typologie.md` — la typologie des cinq types de marqueurs (trace, transit figé, personne, hypothèse, densité), avec les décisions de rendu (planète standard + médaillon + teinte pour les personnes).

Et une mise à jour :
- `project_angle_saturne_uranus.md` — recadrage : S/U est **un** angle parmi d'autres (J/N, M/P…), astrolab accueille plusieurs théories, le choix d'infuser un angle dans l'UI est pluriel et réversible.
