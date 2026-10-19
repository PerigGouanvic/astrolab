# Feuille de route — astrolab

**Document horodaté — v1 initiale 2026-10-17.** Mise à jour au fur et à mesure des sédimentations. Les décisions ici engagent la direction du projet ; les angles éditoriaux listés sont la signature distinctive de cette application d'astrologie et ne sont pas interchangeables avec les logiciels concurrents.

> Repo public : <https://github.com/PerigGouanvic/astrolab> — version déployée : <https://periggouanvic.github.io/astrolab/>

---

## Angles éditoriaux structurants

L'astrologie telle qu'elle est pratiquée dans la plupart des logiciels existants reconduit un cadre « défi/opportunité » qui aplatit la singularité des couples planétaires transpersonnels. Astrolab construit un vocabulaire alternatif, systématique, autour de la triade **verrou/clef** appliquée aux trois couples saturnien/uranien, jupitérien/neptunien, martien/plutonien.

### Saturne/Uranus — verrou/clef (arrêté 2026-10-05)

Saturne diagnostique la cristallisation (ce qui a tenu, s'est verrouillé, demande rupture) ; Uranus résout par le collectif, l'invention, la circulation d'information. Infuse le vocabulaire, les soustractions pré-réglées (réseau verrous-clefs), la lecture des transits durs. Pas « défi/opportunité ».

### Jupiter/Neptune — doctrine/communion (ébauché 2026-10-09)

Jupiter diagnostique le sens institué (foi héritée, doctrine, structure de croyance qui organise la vie) ; Neptune résout par l'image partagée, l'art accessible, l'empathie, l'imaginaire commun. **La découverte de Neptune en 1846 enregistre cette bascule** — après le monothéisme institué, l'imaginaire collectif devient le lieu où le sens se fabrique.

### Mars/Pluton — désir individuel/puissance collective (ébauché 2026-10-09)

Mars diagnostique le désir individuel (combat solo, affirmation personnelle) ; Pluton résout par la puissance collective, l'inconscient partagé, la transformation structurelle. **La découverte de Pluton en 1930 enregistre cette bascule** — après l'ère de l'individu-héros, la puissance se révèle collective ou ne se révèle pas.

Ces trois formulations sont **à retoucher** mais le cadre est posé : chaque planète transpersonnelle (Uranus, Neptune, Pluton) opère comme résolution collective d'un verrou individuel diagnostiqué par sa jumelle personnelle (Saturne, Jupiter, Mars).

---

## Méthode de visualisation — soustraction

Chaque strate (signes, maisons, planètes, mi-points, astéroïdes, aspects) est **indépendamment activable/masquable**, et une couche masquée **n'ajoute aucun élément au DOM** (pas simplement `display:none`). La lecture astrologique dans astrolab est explicitement **soustractive** — on révèle une configuration en retirant tout ce qui n'est pas elle, pas en empilant tout d'un coup.

**Aspects par harmoniques H1..H9** — sélecteur + segmented ligne/chiffre. Permet d'explorer les familles d'aspects systématiquement, pas d'empiler les aspects majeurs par défaut.

**Mi-points et astéroïdes sont deux enrichissements distincts** — pas des mi-points d'astéroïdes. Toute reformulation qui les confond est une erreur à corriger.

---

## Infrastructure relationnelle — scrapbook co-évolutif + modèle salon

### Scrapbook (dès v1 — non négociable)

Journal partagé indexé sur positions/moments. Chaque cadre (textuel ou visuel) est accroché à une portion du chart et possède une temporalité (retrait vs effacement, slider temporel). **C'est l'infrastructure de la co-évolution Perig↔consulté dans la durée**, pas un supplément d'oracle génératif. L'application vaut par ce qu'elle **soustrait** à l'astrologie commerciale (pas de LLM analytique, pas de score, pas d'oracle) et par ce qu'elle **ajoute** comme possibilité relationnelle.

### Multi-natifs (livré 2026-10-16)

Plusieurs thèmes natals coexistent dans une instance, chacun avec son scrapbook propre. Les préférences utilisateur restent globales.

### Modèle salon — Google Drive scope `drive.file` + Google Picker

Chaque cycle de consultation ouvre un **dossier Drive partagé** entre Perig et le consulté. L'app lit/écrit le scrapbook dans ce dossier via le Picker (le scope `drive.file` ne donne pas accès au reste du Drive — garantie de confidentialité). **La fin d'un cycle est décidée conjointement** : Perig retire son partage quand c'est juste. Pas d'auto-expiration, pas de compteur de séances, pas de mécaniques SaaS. Le propre Drive du consulté reste intact dans tous les cas.

---

## Anti-scope (ce que l'app refuse d'être)

- **Pas d'oracle génératif.** Aucun LLM pour l'analyse interprétative. La valeur vient de la soustraction, du scrapbook, et de la co-évolution — pas de la génération de texte « inspiré ».
- **Pas d'auto-expiration de cycle, pas de scoring d'engagement, pas de mécaniques SaaS.** La relation Perig/consulté n'est pas une métrique.
- **Pas de 3D immersive dans cette branche.** La branche `main` du repo porte un chantier de recherche 3D (dôme Three.js) qui ne doit pas être confondu avec la v1 publiable (branche `astrolab-2d`).
- **Pas de bundler lourd.** HTML + SVG + JS pur, ESM via jsDelivr. Pas de Vite, pas de Capacitor en v1.

---

## Jalons livrés

- **2026-08-17** — Strate 1 déployée (cercle + signes + maisons Placidus + planètes) sur GitHub Pages.
- **2026-10-05** — Scission 2D/3D en branches distinctes. Stack v1 arrêtée (PWA + SVG + Google Drive).
- **2026-10-13** — Scrapbook phase A′ (cadres textuels/visuels foreignObject, édition inline, drag/resize, temporalité).
- **2026-10-14** — Fiche planète pédagogique + couche transits + frise dans sheet + modale positions.
- **2026-10-15** — Disque de signature + fo centré + grâce création + bouton vider.
- **2026-10-16** — Multi-natifs v0 (plusieurs thèmes natals).
- **2026-10-17** — Bascule proxy CORS astéroïdes vers Deno Deploy.

## Jalons v1 à venir

- **Convivialité mobile** — fluidifier l'accueil pour un consulté non-expert.
- **PWA + APK (TWA)** — manifeste + service worker + icônes + installation Android via Trusted Web Activity. Les mises à jour continuent de passer par le web (pas de redistribution d'APK à chaque itération).
- **Zoom SVG sur région** (`viewBox`) — critique mobile dès que la densité monte.
- **OAuth Google** (projet Cloud + API Drive + client ID).
- **Intégration Drive dans la PWA** (redirect flow + Google Picker).
- **Scrapbook sur Drive** (migration depuis `localStorage`).
- **Capture mobile directe** (caméra + audio MediaRecorder).

## Au-delà de v1 (horizon ouvert)

- Migration de la lib astronomique vers Astronomy Engine (MIT), remplaçant Swiss Ephemeris (AGPL) pour publication large.
- Clauses d'onboarding du consulté (ce qu'il voit, où il clique, ce qu'on lui explique sur le partage Drive).
- Corpus d'astéroïdes proposés par défaut (lequel, quelle taille, quelle source).

---

## Licence et antériorité

Code sous AGPL-3.0-or-later (hérité de Swiss Ephemeris tant que `@kuntay/swisseph` est embarqué côté client). Les **angles éditoriaux listés ci-dessus** (triade verrou/clef sur les trois couples personnel/transpersonnel, scrapbook co-évolutif comme infrastructure relationnelle, modèle salon avec fin de cycle conjointe, méthode soustractive comme signature) sont la signature distinctive du projet et sont horodatés par ce document et par l'historique git du repo <https://github.com/PerigGouanvic/astrolab>.
