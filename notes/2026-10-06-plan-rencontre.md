# Plan de bataille — Rencontre dans 3 jours (préparé 2026-10-06)

Session de planification du **2026-10-05 soir / 2026-10-06 nuit** (minuit → 1h13), reprise 9h28. Pas de code touché ; cristallisation de scope pour la rencontre à venir.

## Contexte opérationnel

- **Rencontre** : première rencontre avec un consulté non-astrologue, **dans 3 jours** (≈ 2026-10-09).
- **Terrain** : ton laptop seul. Pas de deuxième écran, pas de téléphone. Rencontre face à face sur un même écran.
- **Objectifs explicites de la rencontre** :
  - Expliquer à la personne des **transits majeurs** qui la touchent.
  - **Prendre des notes à même le thème** pendant l'échange.
  - Lui permettre ensuite de **consulter ces notes et d'en ajouter** chez elle.
- **Distribution après rencontre** : app servie publiquement depuis **GitHub Pages** (`periggouanvic.github.io/astrolab/`). Pas de confidentialité par URL cachée — assumée publique, risque de reprise d'idées sous-développées accepté comme aiguillon. La personne consulte la même app publique, avec **ses données exportables** qu'elle a emportées chez elle.

## Décisions cristallisées pendant la nuit (hors scope technique)

- **Pas de pack téléchargeable autonome** — le casse-tête `file://` (CORS, modules ES, Service Worker inopérant, embarquer Swiss Ephemeris WASM, proxy astéroïdes bloqué) consommerait les 3 jours. Abandonné.
- **App servie depuis le web, publique** — GitHub Pages déjà en place.
- **Données portables via Export/Import JSON** — l'app a deux boutons symétriques. La personne emporte ses données, pas l'app.
- **Collaboration future Perig/consulté sur mêmes données** — repoussée après rencontre (nécessite Drive + gestion simple des conflits de version).
- **Mobile-first véritable repoussé** après rencontre. En 3 jours, on se concentre sur la rencontre laptop, pas sur un redesign mobile.

## Scope rencontre 🔴 — non négociable, 3 jours

### 1. Double-tap scrapbook qui marche
- Feature annoncée dans l'UI actuelle qui ne répond pas (régression silencieuse à diagnostiquer).
- **C'est l'outil de prise de notes pendant la rencontre.** Sans lui, pas de co-écriture possible.
- Travail : diagnostic d'abord (comprendre pourquoi ça ne marche pas), puis réparation.

### 2. Popups d'info sur planètes / signes / aspects / maisons
- **Contenu rédigé par Perig lui-même**, pas de contenu placeholder générique.
- **Liens vers ressources externes** (pas prétention à être « la » ressource ultime — contre-productif et anti-pédagogique).
- Structure à prévoir : fichier JSON (ou MD) par type d'entité (planètes, signes, aspects, maisons), chaque entrée `{ titre, mini-fiche-perig, liens-externes[] }`.
- Fallback propre si fiche manque : nom seul + « aucune note pour l'instant ». **Pas de placeholder-générique.**

### 3. Marqueurs unifiés (transits + planètes d'autrui)
- Un marqueur = `{ glyphe planétaire, propriétaire (soi / autre nommé / transit), position (fixe natale ou calculée par date), couche d'appartenance, nom + couleur distincts }`.
- Même infrastructure UI pour un transit (Saturne à la date X) et une synastrie (Soleil de sa femme à son degré natal).
- Persistance dans le scrapbook.

### 4. UI « importer des points »
- Workflow : **l'utilisateur choisit sa source** (date pour un transit / carte de naissance pour une personne) → **calcul de la carte** à ce moment → **sélection manuelle** des planètes à extraire → **ajout comme marqueurs** avec identité (nom, couleur, attribution).
- Pas de surlignage automatique des transits durs. Pas de prescription algorithmique. **On ajoute à la carte uniquement ce qu'on choisit volontairement d'ajouter.** Alignement avec l'esprit soustractif.

### 5. Frise du temps horizontale couplée à la roue
- **Axes** : horizontal = temps (passé à gauche, futur à droite, scroll possible) ; vertical = longitude écliptique (haut = 0° Bélier, bas = 359° Poissons, cercle déployé).
- **Corps affichés** : **uniquement les 5 planètes lentes** (Jupiter, Saturne, Uranus, Neptune, Pluton). Pas de luminaires, pas de rapides. « Sinon c'est le bordel. »
- Les lentes **tracent des courbes qui descendent vers le bas** (sens direct) avec **zigzags de rétrogradation**.
- **Items scrapbook** = points sur la frise, **taille subjective ajustée à la main**. Pas de filtrage par couche sur la frise, tout est là, hiérarchie visuelle par taille.
- **Correspondance exacte** : une tranche verticale de la frise à l'instant du curseur = projection exacte du cercle astrologique à cet instant, mais déployé en ligne.
- **Navigation croisée** = conséquence mécanique du curseur partagé. Cliquer sur un point de la frise déplace le curseur → la roue bouge. Et inversement.
- **Pas de zoom pincée/écartée en v1 rencontre** — échelle fixe suffit.

### 6. Export / Import JSON
- Deux boutons symétriques dans l'app.
- Export : sérialise `localStorage` courant → fichier JSON téléchargé.
- Import : prend un fichier JSON → recharge dans `localStorage`.
- (ZIP si on inclut les images collées dans le scrapbook — à décider selon volume. JSON seul avec images en base64 inline est aussi une option plus simple.)

## Scope reporté 🟡 — après la rencontre

- **Mobile-first véritable** : symboles plus gros, menu couches regroupé derrière bouton unique, graduation visible curseur temporel, zoom plus profond (`viewBox` étendu).
- **Google Drive + sync** : collaboration à distance Perig/consulté sur mêmes données. Nécessite OAuth Google (`drive.file` + Google Picker), **plus** gestion simple des conflits de version (append-only, horodatage par item, etc.).
- **Deux expériences mobile/desktop formalisées** : routing conditionnel ou CSS tranché. Décidé en principe (oui, deux), mais mise en œuvre reportée.
- **Zoom pincée/écartée sur la frise** : granularité adaptive (années ↔ mois ↔ semaines).
- **Vitesses variables du curseur selon planète empoignée** : partiellement absorbé par la frise (qui rend lisibles les vitesses différentes des lentes). Reste à voir si on garde la métaphore « poignée de planète » dans la roue aussi.
- **Astrocartographie** (globe texturé) : hors scope v1, c'est une v2.

## Ordre d'attaque proposé (3 jours)

Les 6 points 🔴 ne sont pas d'égale complexité ; voici un ordre qui minimise le risque de rester bloqué :

### Jour 1 — Débloquer le bloquant
1. **Point 1 — Double-tap scrapbook cassé**. Diagnostic + réparation. Si ça traîne, c'est le signal qu'on a un problème structurel plus large à régler. À faire en premier parce qu'on ne peut pas construire la suite sur un socle cassé.
2. **Point 6 — Export / Import JSON**. Simple techniquement, débloque la question « la personne repart avec ses données ». Pas besoin d'attendre d'avoir du contenu scrapbook pour écrire les deux boutons.

### Jour 2 — Infrastructure marqueurs + popups
3. **Point 3 — Marqueurs unifiés** (modèle de données + UI minimale pour en ajouter manuellement).
4. **Point 4 — UI « importer des points »** (bâtie sur l'infrastructure marqueurs).
5. **Point 2 — Popups d'info** (fichier structuré vide + mécanique d'affichage ; le contenu rédactionnel se remplit en parallèle).

### Jour 3 — Frise + préparation
6. **Point 5 — Frise horizontale couplée** (le plus ambitieux visuellement — à faire quand les 5 autres points sont posés).
7. **Préparation rencontre** : Perig rédige les mini-fiches popups qu'il juge utiles pour cette consultation précise. Pré-pose les marqueurs transits / synastrie qu'il sait vouloir utiliser.

## Risques et points de vigilance

- **Risque n°1 : la frise prend plus de temps que prévu.** C'est le point le plus ambitieux visuellement. Si le jour 3 déborde, on livre la frise minimale (bandes des 5 lentes sans items scrapbook) et on ajoute les points scrapbook pendant la rencontre si possible — ou on retire la frise du scope rencontre si vraiment bloqué. Les autres points doivent tenir sans elle.
- **Risque n°2 : le double-tap cassé révèle un problème structurel.** Si le diagnostic jour 1 montre un refactoring profond à faire, on priorise une solution tactique (ex. remplacer double-tap par un bouton explicite « ajouter une note ici » qui marche) plutôt qu'un vrai fix architectural qui mangerait les 3 jours.
- **Risque n°3 : contenu rédactionnel des popups mange du temps de Perig.** À éviter en traitant le rédactionnel comme un **chantier parallèle** (Perig écrit pendant les temps morts) et non comme un livrable bloquant. Fallback propre = fiche vide, mieux que placeholder-générique.
- **Point de vigilance : la persistance localStorage** doit survivre à un refresh de l'app. À vérifier dès jour 1 que les notes prises ne disparaissent pas si Perig recharge accidentellement la page pendant la rencontre.
- **Point de vigilance : AGPL de Swiss Ephemeris** — l'app est publique sur GitHub Pages, hérite de l'AGPL tant que `@kuntay/swisseph` est embarqué. Pas bloquant pour la rencontre mais à formaliser avec un `LICENSE` explicite avant de communiquer plus largement sur l'app. Migration vers Astronomy Engine (MIT) prévue en 🟡.

## Décisions d'architecture à ne pas prendre maintenant

À laisser émerger pendant le code, pas à trancher à froid :
- Format exact du JSON d'export (schéma versionné dès maintenant pour éviter les cassures futures).
- Structure du fichier popups (JSON unique vs plusieurs fichiers par type).
- Taille des items scrapbook sur la frise : poignée explicite ou slider de densité.
- Comportement du curseur en vue frise : scroll naturel ou drag ?

## État technique au moment de la rédaction (reprise session du 2026-10-06)

- Branche : `astrolab-2d` ✓
- `CLAUDE.md` + `README.md` sync 2D, non committés (option B convenue : commit en fin de session code).
- 5 fiches mémoire ⚡⚡/⚡ posées dans `memory/` le 2026-10-05 soir : scission 2D/3D, scrapbook v1, stack PWA+SVG+Drive, angle Saturne/Uranus, fin de cycle conjointe.
- Serveur dev Python toujours up sur `:8787` (bg).
- Code : commit `83d728c` (patch `genId()`), rien de plus depuis la session fondatrice.

## Prochaine session (code)

Attaquer **Jour 1 — diagnostic double-tap scrapbook**. Points d'entrée précis vérifiés dans `app.js` :

- **`wireScrapbookGestures()`** à la ligne **830** — fonction qui pose le listener `pointerdown` sur `#chart` (ligne 835).
- Logique double-tap : deux `pointerdown` < 400 ms et distance < 40 px → `createScrapItemAt(avgX, avgY)` à la ligne **846**.
- Exit anticipé ligne **837** si la cible est déjà un item scrapbook (`.scrap-fo, foreignObject`).
- `createScrapItemAt` à chercher (fonction appelée mais pas trouvée dans la fenêtre lue — probablement plus haut, autour des lignes 760-820 où vit le bloc scrapbook).
- `screenToSvg()` convertit les coords écran → coords SVG — vérifier qu'elle renvoie bien les bonnes valeurs.
- Migration des items phase-A → nouveau format à la ligne **859** (`migrateScrapbookItems()`) — tourne à l'init, à vérifier qu'elle ne casse rien.

**Pistes de diagnostic à instruire dans l'ordre** :
1. Vérifier que `wireScrapbookGestures()` est bien appelée (chercher où elle est invoquée dans le flux d'init).
2. Vérifier que `#chart` existe dans le DOM au moment de l'invocation.
3. Instrumenter avec `console.log` dans le handler ligne 835 pour voir si les `pointerdown` arrivent bien (parfois un ancêtre les capture avec `stopPropagation`).
4. Vérifier le seuil 400 ms / 40 px — sur mobile, le double-tap peut dépasser ces bornes.
5. Vérifier `createScrapItemAt` et la persistance localStorage (`SCRAPBOOK_KEY = 'astrolab.scrapbook'` ligne 686).

Perig teste sur mobile via Tailscale `http://perig:8787/` — le serveur dev tourne déjà en background.
