# Prochaine session astrolab — à ouvrir en premier

**Contexte** : clôture 2026-10-12 soir, session étalée sur 3 jours (2026-10-09 → 2026-10-12) après annulation du rendez-vous consultation. Perig a résolu de **faire l'application pour lui-même d'abord**. Session s'est terminée par une **cristallisation majeure** : le scrapbook habite la bande zodiacale (pas le centre, pas la périphérie). Lire d'abord `memory/project_scrapbook_bande_zodiacale.md`.

## 1. ⚡⚡ Préparer l'implémentation « scrapbook dans la bande zodiacale »

**Prérequis** : trancher les questions ouvertes listées dans `project_scrapbook_bande_zodiacale.md`. Ne pas se lancer dans le code sans elles — toute la grammaire visuelle en dépend. Poser-les à Perig en début de session, chacune avec une option recommandée mais la case cocher-ouverte.

**Questions à trancher (ordre proposé)** :

1. **Signature visuelle d'un contenu en vue plein cercle** — teinte du fond du signe ? pastille unique ? heatmap de densité (plus de contenu = plus dense) ? semis de points ? mix ? Options proposables en tasklist GFM.
2. **Zoom par paliers ou continu** — paliers suggérés : vue signe (30°) / vue décan (10°) / vue degré (1°) / vue minute (1/60°). Pure continuité avec snap optionnel ? Important pour l'implémentation : si paliers, chaque palier peut avoir sa propre densité d'affichage.
3. **Persistance du glyphe canonique** quand on zoome dans un signe peuplé — disparaît (ton mythographie *remplace* l'universel) ou reste (ta mythographie *enrichit* l'universel) ?
4. **Co-évolution dans un arc** — une marque unique chargée qui résume la période ? Plusieurs marques individuelles éparpillées ? Un fil (plusieurs) + condensations (une) ?
5. **Rendu sur la frise** d'un item ancré en bande zodiacale — à la position du moment où une planète lente passe sur son degré ? À la date de création ? Les deux (plusieurs apparitions pour un même item) ?
6. **Scope natal (livré 2026-10-12)** — un item `scope: 'natal'` vit-il à sa position de longitude propre ou est-il « collé » à la position natale de Perig ? Articulation à poser.

**Après tranchage** : esquisser un plan d'implémentation. Prévoir que ça touche `renderScrapItem`, `project(lon, ascLon, radius)` (contraindre radius à la bande), `drawTimeline`, probablement le système de zoom existant (`state.chart`).

## 2. Tester les trois features livrées 2026-10-12

Non testées par Perig (pivot vers vision avant test). Rappel du cache-bust : `style.css?v=45`, `app.js?v=50`. Serveur dev probablement toujours up sur `http://perig:8787/`.

- **Scope natal** : créer item en mode natal → ne doit pas apparaître sur la frise ; cocher « voir aussi les observations datées » en natal → les items `timed` réapparaissent ; items `natal` cachés en mode `now`.
- **Frise étendue** : pan la frise vers le futur bien au-delà du présent (jusqu'à ~150 ans après natal) et vers le passé (jusqu'à ~50 ans avant natal). Vérifier que ça scrolle sans butée.
- **Poignée commit-on-release** : traîner la poignée triangulaire au-dessus de la frise → la frise seule bouge pendant le drag (chart figé) → au relâchement, un seul recalcul plein du cercle. Toucher le fond de la frise = pan uniquement, ne doit **plus** déplacer `chartTime`.

## 3. Fils différés

- **TikTok / vidéos embed** (point 4 de la liste 2026-10-09, jamais traité). Faisabilité technique dans `<foreignObject>` à investiguer uniquement si la vision bande zodiacale accepte des médias riches.
- **Marqueurs synastrie** (ancien urgent du brief 2026-10-07) → **mis en veille** : rencontre consultation annulée, Perig construit pour lui d'abord. À reprendre quand une rencontre réelle redevient probable.
- **Scrapbook fenêtres laides** (`project_scrapbook_fenetres_a_repenser.md`) : largement résolu par le pivot bande zodiacale — à relire pour voir si quelque chose reste pertinent.
- **Section configuration tailles + mode apprentissage + mode voyage planètes** : fiches à relire en lumière de la nouvelle vision.

## État technique à l'ouverture

- Branche `astrolab-2d`, dernier commit (à bumper quand les features du 2026-10-12 seront commitées).
- Cache-bust : `style.css?v=45`, `app.js?v=50`.
- Serveur dev : `http://perig:8787/` (python http.server).
- Nouveaux dans `state` : `state.showTimedInNatal` + `state.scrapItems[].scope`.
- Nouvelles constantes JS : `TL_PAST_YEARS = 50`, `TL_FUTURE_YEARS = 150`, `MS_PER_YEAR`.
- Clé localStorage ajoutée : `astrolab.showTimedInNatal`.
- Nouveau DOM : `#timeline-handle` (HTML, positionné par JS en CSS px) + `#natal-overlay-row` (checkbox).
- `wireTimelineInteraction` réécrite : 1-doigt sur fond frise = pan (ne touche plus `chartTime`).
- `wireTimelineHandle` : nouvelle fonction, drag commit-on-release ; écoute `window.resize`.

## À lire au premier tour

Dans l'ordre :
1. `memory/project_scrapbook_bande_zodiacale.md` — **lecture essentielle, elle structure toute la session à venir**
2. `notes/2026-10-12-session-v04-vision-crystallisation.md` — récit de la session de clôture (code livré + genèse de la vision)
3. `memory/project_marqueurs_typologie.md` + `memory/project_cercle_cristal_couches.md` — grammaire des marqueurs, toujours valides
4. `memory/project_feature_planetes_perles.md` — superseded mais historiquement important pour comprendre le chemin
