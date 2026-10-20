# Session 2026-10-20 v02 (11h43 → 12h25) — Arrêt conceptuel

## Résultat de cette session

**Diagnostic du bug pinch terminé** par instrumentation progressive. Chaîne de compteurs ajoutés dans `app.js` (winT1/winT2, cond2touches/condPinchStart, insideIf/pSDX, tsAll/tsPinch/tsLast + try/catch) qui a abouti à la cause :
- Chrome Android émet **des touchstart intermédiaires 2-doigts** pendant un geste pinch (dump : `tsAll=20 tsPinch=10` pour un seul geste).
- Chacun ré-ancre `pinchStartDistX` à la valeur courante → ratio = 1.0 permanent → zoom gelé.
- Le compteur `moveN=1` trompeur venait du reset `debugPinch.moveCount=0` au touchstart.

**Fix tenté** (ne pas ré-ancrer si `pinchStartDistX != null`) → **a cassé le pinch** : réaction plus forte mais erratique, pinch H causant pinch V, incohérent. Reverté.

**Arrêt décidé par Perig** sur base d'une aporie conceptuelle plus profonde que le bug technique :
- Un élément scrapbook en case horaire devient tranche illisible dès qu'on dézoome d'un cran.
- Le zoom pinch continu multi-strates n'a pas d'utilité réelle sans transformation du mode d'affichage entre strates.
- Direction cible esquissée : **snap par crans H + drag H temporel + pinch V préservé** pour degrés/signes.
- Dette conceptuelle non technique : **étendue verticale véritable d'un élément scrapbook** (point / signe / multi-signes ?).

**État working tree au moment de la clôture** : toute l'instrumentation debug ajoutée pendant cette session a été retirée. Fix tenté reverté. On est revenu à l'état « frustrant mais logique » d'hier soir. Modifications non commitées depuis `f725e98` : tout le travail d'hier soir + les améliorations de pinch d'avant ce matin (window+capture, PINCH_AXIS_DEADZONE, panneau debug de base).

**Fiche mémoire créée** : `memory/project_zoom_continu_apories.md` (détaille l'aporie, la direction cible, la dette conceptuelle).

**Pointeur ⚡⚡ ajouté** dans `MEMORY.md`.

---

## Brief d'entrée de cette session (archive)

**Contexte** : la session précédente (2026-10-20 matin, 11h33 → 11h40, continuation d'une session qui a atteint 825k tokens) a été close après avoir isolé proprement le bug pinch. Son brief est archivé dans `./notes/2026-10-20-session-v01-pinch-debug.md`. État juste avant clôture ci-dessous.

## Fichiers modifiés non commités

`app.js`, `style.css`. **Aucun commit depuis `f725e98` (matin du 2026-10-19)**. Perig préfère un commit groupé par séance validée mais doit valider explicitement avant.

## Insight précieux obtenu juste avant la clôture

Après avoir ajouté 5 compteurs dans le panneau `?debug=pinch`, le dump :

```
touches=0 isPinch=Y panStart=N
event=end (touchend) moveN=1 docMove=352
docTarget=rect
t0=(266,374) t1=(123,457)
zoom=65.8 vZoom=1.28
dX0=143 dY0=84
dX=143 dY=84
rX=1.00 rY=1.00
dayPx=0.7 hourPx=0.0
winAll=352 winT=2 pass=339 rej=13
lastRej=no-start
```

**Ce qu'on apprend sans ambiguïté** :
- `winAll=352` : window reçoit bien 352 touchmove (le fix `capture: true` fonctionne). Ce n'est **pas** un problème de propagation.
- `pass=339` : le filtre `pinchStartDistX != null` laisse passer 339 events. Pas un problème d'état.
- `moveN=1` : **mais UN SEUL atteint le `moveCount++`** dans le bloc `if (ev.touches.length >= 2 && pinchStartDistX != null)`.
- Donc **338 touchmove passent le filtre MAIS échouent sur la condition `touches.length >= 2`**.

**Hypothèse à vérifier en premier à la reprise** : la plupart des touchmove ont probablement `ev.touches.length === 1` même pendant un pinch 2 doigts. `winT=2` est seulement la valeur du dernier event (écrasée à chaque tour). Cause probable : fragmentation des gestes multi-doigts par Chrome Android (ou interférence d'un rect enfant qui "absorbe" un doigt).

**Prochain geste de diagnostic** (3 lignes de code max) : ajouter dans `debugPinch` deux compteurs `winT1` et `winT2` qui comptent les touchmove avec exactement 1 ou 2 touches. On va voir immédiatement combien de chaque. Code à ajouter dans le handler window.touchmove ligne ~1680 :

```js
if (ev.touches.length === 1) debugPinch.winT1++;
if (ev.touches.length === 2) debugPinch.winT2++;
```

Et dans l'affichage ligne ~1862 ajouter `+ '\nwinT1=' + debugPinch.winT1 + ' winT2=' + debugPinch.winT2`.

Si `winT1 >> winT2` → confirmé, le browser émet beaucoup de touchmove 1-doigt pendant le pinch. Alors la solution est de **suivre le dernier état connu à 2 doigts** : stocker (t0, t1) du dernier touchmove 2-doigts, et quand on reçoit un touchmove 1-doigt, utiliser (newT, stored_other) pour recalculer les distances.

Si `winT1 ≈ winT2` → autre chose se passe. Investiguer le `if (ev.touches.length === 1 && panStartClientX != null && !isPinching)` plus bas qui pourrait détourner.

## État des modifs pendant la session en cours (2026-10-20)

Toutes dans `app.js` autour de `wireTimelineInteraction()` (ligne 1520+) :

1. **Pointer events filtrés** `pointerType === 'touch'` → les touch events gèrent le pinch, les pointer events gèrent la souris. Cloisonnement anti-Chrome-Android.
2. **Pan 1-doigt via touchstart/touchmove** (pas pointer events, cloisonnement).
3. **Listeners touch sur `window` (pas `svgEl`)** avec `capture: true` — pour recevoir les touchmove peu importe la target (évite le piège "touchmove sur rect enfant ne bubble pas").
4. **`PINCH_AXIS_DEADZONE = 20`** remplace l'ancien plancher `max(30, dist)` qui créait un `rX=1.00` permanent quand les doigts commençaient serrés.
5. **Panneau debug** `?debug=pinch` : 2 lignes multi-strates, bouton copie presse-papier avec fallback `document.execCommand` (Clipboard API refuse en non-secure context).
6. **Compteurs étendus** (ajoutés juste avant clôture) : `winAll`, `winT`, `pass`, `rej`, `lastRej`.

**Dans `style.css`** :
- Lignes de ticks (year/month/day/hour) : stroke-width + opacity + color renforcés (c'était trop pâle).
- `.tl-year-tick-strong` : 0.8/0.75/strong.
- `body.timeline-fullscreen #timeline-container { bottom: 32px }` — pour que la poignée du tiroir ne masque pas les labels bas.
- CSS `#debug-pinch` + `#debug-pinch-text` + `#debug-pinch-copy`.

**Constantes de zoom modifiées** :
- `TL_ZOOM_MAX` passé de 500 → 10 000 000 (pour laisser le zoom aller jusqu'aux heures).
- `TL_V_ZOOM_MAX = 24`.

## Code dupliqué repéré (à nettoyer à la fin)

Il y a un **second jeu de listeners pinch** sur `#chart` dans `wireChartInteraction()` (ligne 2457, pinch sur le cercle astrologique). Ce n'est **pas** la source du bug (SVG différent, `#chart` ≠ `#timeline`), mais le code est dupliqué dans l'esprit. À nettoyer un jour sans toucher à cette session.

## Autres chantiers hérités (toujours valides, à faire après que le pinch marche)

- **Lignes de jours visibles** — ticks renforcés en CSS, à re-vérifier.
- **Zoom infini** — plafonds à revoir si Perig les atteint.
- **Florilinks** — demander à agent poietic le mérite et le pattern.
- **Swipe-down → hard reload** — reporté à jeudi 2026-10-22.

## Décisions acquises (ne pas réouvrir)

- Un seul modèle de rect pour tous les items.
- Pinch H → temps, pinch V → zoomer dedans, les deux simultanés en diagonale.
- Titre (1ère ligne) + corps.
- "Tout se fera par zoom" — pas multiplier les shapes.

## Lecture préalable obligatoire (ordre)

1. `./CLAUDE.md`
2. `./memory/MEMORY.md`
3. `./memory/project_paradigme_frise_centrique.md`
4. `./memory/project_frise_horizontale_v1.md`
5. `./memory/feedback_pas_de_theorisation_predictive.md`
6. `./notes/2026-10-20-session-v01-pinch-debug.md` — brief complet de la session précédente avec historique du debugging

## Règles non négociables (rappel)

- Pas de commit sans aval explicite.
- Dev server systemd user `astrolab-dev` sur `http://perig:8787/`.
- Si prompt Agora échoue, fournir commande CLI exacte.
