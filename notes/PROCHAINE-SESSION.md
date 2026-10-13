# Prochaine session astrolab — à ouvrir en premier

**Contexte** : session nuit 2026-10-13 (00h25 → 02h51). Les 6 questions ouvertes laissées par la session de cristallisation 2026-10-12 ont été **tranchées** (4), **reportée** (1 : persistance glyphe canonique), **recadrée en toggle** (1 : rendu frise). Un **type d'objets scrapbook** complet a été dessiné. Un **modèle de données consolidé** et une **liste de 7 chantiers d'implémentation** sont posés. Lire d'abord `memory/project_scrapbook_bande_zodiacale.md` (fiche à jour).

## 1. ⚡⚡ Entrer dans le chantier d'implémentation « scrapbook dans la bande zodiacale »

**Les prérequis conceptuels sont levés.** On peut coder. Ordre proposé (à valider avec Perig en début de session, mais mon instinct dit que 1 est la bonne porte d'entrée parce qu'il déverrouille 2 et 3) :

1. **Contraindre `radius` à la bande zodiacale** à l'ajout d'un nouvel item. Pas de migration des items existants — les items actuels étaient des tests laids, à nettoyer. Fonction concernée : `createScrapItemAt` (ou équivalent) ; probablement toucher à `project(lon, ascLon, radius)` côté rendu pour clipper.
2. **Rendu continu minuscule → zoomé** uniformisé. Mêmes nodes SVG/foreignObject à toutes les échelles, juste à l'échelle. Skip du draw si taille rendue < 1 pixel. Pas de couche de synthèse (teinte/pastille/heatmap/semis) — continuité ontologique sur le zoom.
3. **`scale` persistée par item** + handle de resize UI. Déjà partiellement en place via le resize libre des `foreignObject` existants ? Vérifier.
4. **Toggle global** « voir items scrapbook sur la frise » (option UI, probablement dans la sheet / sidebar).
5. **Mécanique de pose triangulée** *(planète-de-référence, moment)* → `lon = position de cette planète à ce moment` → vignette ancrée au degré. **Chantier structurant du MVP** — c'est le geste principal d'inscription. Moment choisi = passé (souvenir) / présent / futur (projet). Exemples : *photo d'un événement survenu quand Pluton est entré à tel degré* ; *« quand Uranus sera rendu là j'aurai réalisé telle chose »*.
6. **Comportement tap à deux paliers** :
   - Palier 1 — tap : zoom-animation jusqu'à ce que le cadre remplisse ~l'écran dans son arc (ratio adapté au contenu : vidéo/image = taille optimale ; texte = zoom plus profond pour commencer à lire).
   - Palier 2 — re-tap : zoom profond, cadre seul remplit l'écran, lecture pleine page.
   - Scroll naturel interne après avoir touché le cadre pour continuer la lecture.
7. **Embeds YouTube/TikTok** dans `foreignObject`. Faisabilité technique à investiguer — probablement OK en iframe standard dans HTML intégré.

## 2. Tester les trois features livrées 2026-10-12 (non testées en navigateur)

Toujours en attente. Cache-bust : `style.css?v=45`, `app.js?v=50`. Serveur dev probablement toujours up sur `http://perig:8787/` (PID 1239797 au moment de la session de clôture 2026-10-12 — à vérifier).

- **Scope natal** : créer item en mode natal → ne doit pas apparaître sur la frise ; cocher « voir aussi les observations datées » en natal → les items `timed` réapparaissent ; items `natal` cachés en mode `now`.
- **Frise étendue** : pan la frise vers le futur bien au-delà du présent (jusqu'à ~150 ans après natal) et vers le passé (jusqu'à ~50 ans avant natal). Vérifier que ça scrolle sans butée.
- **Poignée commit-on-release** : traîner la poignée triangulaire au-dessus de la frise → la frise seule bouge pendant le drag (chart figé) → au relâchement, un seul recalcul plein du cercle. Toucher le fond de la frise = pan uniquement, ne doit **plus** déplacer `chartTime`.

**Hypothèse à vérifier** : si Perig teste et trouve l'interface bancale, c'est probablement parce que les items actuels (tests laids) encombrent — raison de plus pour entrer par le chantier 1 (contrainte radius + nettoyage).

## 3. Trancher ce qui reste ouvert

- **Persistance du glyphe canonique** quand un signe est peuplé — reportée jusqu'à ce qu'un premier rendu de cercle peuplé existe. Perig verra alors si le glyphe disparu lui manque ou non.
- **Épaisseur de bande vs débordement radial** — pas explicitement tranché. Mon instinct : la vignette ancre au `radius` dans la bande, mais le cadre peut déborder visuellement selon son `scale`. À reconfirmer au moment du chantier 1.
- **Interaction précise pinch / tap-animation** quand les deux arrivent en même temps — note implémentation : pinch interrompt l'animation comme tout autre geste. À coder proprement dans le chantier 6.

## 4. Fils différés inchangés

- **Marqueurs synastrie** (brief 2026-10-07) → **toujours en veille** : rencontre consultation annulée, Perig construit pour lui d'abord. À reprendre quand une rencontre réelle redevient probable.
- **Scrapbook fenêtres laides** (`project_scrapbook_fenetres_a_repenser.md`) : largement résolu par le pivot bande zodiacale.
- **Section configuration tailles + mode apprentissage + mode voyage planètes** : fiches à relire en lumière de la nouvelle vision, pas prioritaires.

## État technique à l'ouverture

- Branche `astrolab-2d`, dernier commit de cette session (tranchages nuit 2026-10-13).
- Cache-bust : `style.css?v=45`, `app.js?v=50` (pas de code livré cette session, uniquement sédimentation).
- Serveur dev : `http://perig:8787/` (python http.server) — à vérifier up.
- État `state` : inchangé depuis 2026-10-12. `showTimedInNatal`, `scrapItems[].scope`, `tlCenter` sans clamp.

## À lire au premier tour

Dans l'ordre :
1. `memory/project_scrapbook_bande_zodiacale.md` — **fiche à jour avec les 6 tranchages + type d'objets + modèle de données + chantiers**
2. `notes/2026-10-13-session-v05-tranchages-nuit.md` — brief précédent archivé (contient le détail des questions avant tranchage, utile si retour en arrière)
3. `notes/2026-10-12-session-v04-vision-crystallisation.md` — récit de la session fondatrice de la vision
4. `memory/project_marqueurs_typologie.md` + `memory/project_cercle_cristal_couches.md` — grammaire des marqueurs, toujours valides
