# Session 2026-10-23 — scrapbook : quota, gestes, zoom profond

Rapport de session O+ (orchestrateur OpenRouter). Trois chantiers traités,
tous sur le scrapbook du cercle. Aucun commit de fond, aucun changement de
modèle de données.

---

## 1. Double-tap trop réactif — corrigé

**Symptôme** : en pannant la carte, deux contacts rapprochés ouvraient le
file picker de création d'item.

**Cause** : ce n'était pas le délai du double-tap (400 ms), c'était le
*point de mesure*. `wireScrapbookGestures` comptait un « tap » à chaque
`pointerdown` — donc chaque **début de pan** était enregistré comme un tap.
Deux coups de doigt pour panner = deux `pointerdown` à moins de 400 ms et à
moins de 40 unités = création déclenchée. Le délai n'était jamais en cause.

**Correctif** : un tap est maintenant un `pointerdown` **suivi d'un
`pointerup` sans déplacement** (seuil `TAP_SLOP_PX = 10 px`). Tout
déplacement au-delà annule la séquence. La création est validée au
relâchement du 2e tap, plus au contact.

Trois autres garde-fous ajoutés au passage :

- un 2e doigt (`!ev.isPrimary`) invalide la séquence — un pinch ne peut plus
  se terminer en création ;
- les glyphes planétaires sont exclus (`r = 315`, ils tombent **dans** la
  bande zodiacale 268–365 : un double-tap sur un glyphe ouvrait le picker) ;
- même traitement appliqué à `wireTimelineScrapbookGestures` (frise), qui
  avait exactement le même défaut.

**Vérifié** : 11 cas rejoués sur le code réel extrait d'`app.js` (pan,
double-tap propre, taps espacés, pinch pur, tap+pinch, tap+pan, hors bande,
glyphe, et les 3 équivalents frise). Tous verts.

---

## 2. `QuotaExceededError` sur les photos — corrigé

**Symptôme** : `Failed to execute 'setItem' on 'Storage'` sur
`astrolab.scrapbook.perig-seed`.

**Cause** : les images étaient stockées **telles quelles** en dataURL base64
dans `localStorage` (quota ~5 Mo par origine, base64 = +33 %). Une photo de
téléphone de 4 Mo devient ~5,3 Mo en base64 : **une seule photo sature le
quota**. Aucun redimensionnement, aucune gestion d'erreur — l'exception
remontait en `window.error`.

**Correctif, trois volets** :

1. **Redimensionnement à l'import** — côté le plus long ramené à 512 px,
   ré-encodage WebP q82 (JPEG q82 en repli si le navigateur ne fait pas de
   WebP), re-encodage q60 si ça dépasse encore 400 Ko.
2. **`saveScrapbook()` retourne `true`/`false`** et affiche un message
   explicite au lieu de laisser l'exception filer. L'item est retiré de
   `state.scrapbook` si la sauvegarde échoue — sinon l'écran mentirait sur
   ce qui est réellement stocké.
3. **Recompression one-shot au démarrage** — les images déjà stockées (donc
   celles qui saturent le quota en ce moment) sont ré-encodées en place, une
   seule fois, marquées `imgV: 2`. Atomique : le nouveau tableau n'est écrit
   que s'il tient dans le quota, sinon l'ancien contenu reste intact.
   Best-effort, non bloquant, après le premier render.

**Mesuré sur 4 vraies photos** (`poietic/uploads/`) :

| source | → 512 px WebP q82 | ratio |
|---|---|---|
| 4000×1848, 3,7 Mo | 76 Ko | 65× |
| 789×1254, 848 Ko | 61 Ko | 19× |
| 1811×1848, 623 Ko | 10 Ko | 81× |
| 2000×1500, 518 Ko | 61 Ko | 11× |

Moyenne ~52 Ko en base64, soit **~27× plus petit**. Capacité dans 5 Mo :
**~88 photos** au lieu de 1 à 6.

**Vérifié** : 11 cas sur le code réel (quota dépassé, succès, filtrage des
champs `_`, downscale 4000×3000 → 512×384, idempotence, image indécodable,
recompression qui ne gagne rien).

---

## 3. Zoom profond — plafond ×8

`CHART_ZOOM_MAX` : **50 → 400**.

Calibré sur la taille d'un item scrapbook (`SCRAP_IMG_BASE = 8` unités
viewBox) : à 400, la fenêtre visible fait 1040/400 = 2,6 unités, donc un
item occupe ~3× la largeur de l'écran. En longitude, 2,6 unités à r≈316
valent ~0,47° — on lit le demi-degré.

**Conséquence non anticipée, corrigée** : à cette profondeur, un trait de
1 unité viewBox devient une bande de 38 % de la largeur d'écran. Les traits
structurels du cercle (anneaux, ticks 1°, séparateurs 30°, cusps, axes,
ticks planètes, mi-points) passent donc en
`vector-effect: non-scaling-stroke` : épaisseur exprimée en pixels écran,
constante à toutes les profondeurs. Effet de bord assumé : à zoom 1 les
traits sont légèrement plus nets qu'avant.

---

## 4. À prendre en compte : Drive, pas localStorage

**Perig, cette session** : *« ce sera pas localstorage à l'avenir mais gdrive
(pas de limite) et que donc ce sera surtout une question de rendement
graphique »*.

Ça déplace le problème. Le redimensionnement à 512 px est calibré pour le
quota de 5 Mo — c'est un compromis de **stockage**. Quand le scrapbook vivra
sur Drive, la contrainte disparaît et la seule question qui reste est :
**quelle résolution faut-il pour que l'image soit nette au zoom maximal ?**

Or le zoom vient de passer à 400. Taille d'un item à l'écran :

```
px_écran = 8 × largeur_écran × zoom / 1040
```

| zoom | écran 400 px | écran 800 px |
|---|---|---|
| 50 (ancien max) | 154 px | 308 px |
| 100 | 308 px | 615 px |
| 200 | 615 px | 1231 px |
| **400 (nouveau max)** | **1231 px** | **2462 px** |

À 512 px de source, l'image est donc **déjà molle à l'ancien zoom max**, et
franchement floue au nouveau. Il faudrait ~1600–2048 px pour être net au
bout de la course.

Coût mesuré (WebP q85, base64) :

| résolution | moyenne/photo | photos dans 5 Mo |
|---|---|---|
| 512 px | 58 Ko | 88 |
| 1024 px | 212 Ko | 24 |
| 1600 px | 438 Ko | 11 |
| 2048 px | 603 Ko | 8 |

**Recommandation** : ne pas bumper maintenant — `localStorage` est encore le
stockage réel, et 1600 px ferait tomber la capacité à 11 photos, ce qui
casserait l'usage actuel. Mais **le jour où Drive est branché, bumper
`SCRAP_IMG_MAX_PX` à 1600 (ou 2048) est un changement d'une ligne**, et le
marqueur `imgV` déjà en place permet de re-encoder les images existantes
automatiquement au premier chargement suivant (il suffit d'incrémenter
`SCRAP_IMG_VERSION` à 3).

Autrement dit : la mécanique de recompression one-shot écrite aujourd'hui
pour libérer le quota est **exactement** celle qui servira à remonter la
résolution quand Drive arrivera. Elle est réutilisable telle quelle.

**Point à observer au test** : à zoom 400, les glyphes (signes, planètes)
grossissent aussi — un glyphe de signe occupe ~2150 px sur un écran de
400 px. C'est le comportement attendu d'un zoom, mais à voir si ça gêne la
lecture des items ou si c'est au contraire ce qu'on veut (le glyphe devient
un repère de fond pendant qu'on lit l'arc).

---

## Fichiers touchés

- `app.js` — gestes double-tap (cercle + frise), pipeline image, quota,
  recompression, `CHART_ZOOM_MAX`.
- `style.css` — `vector-effect: non-scaling-stroke` sur 7 classes de traits,
  `--css-version` 60 → 61.
- `index.html` — `app.js?v=82`, `style.css?v=66`.

## Non vérifié

Rien n'a été testé en navigateur — seulement la logique extraite et rejouée
sous Node. Les points à valider au premier test réel :

- le double-tap crée bien après le correctif (et le pan ne crée plus) ;
- le scrapbook existant repasse sous le quota tout seul au chargement ;
- le rendu à zoom 400 (traits fins, glyphes géants, netteté des images).
