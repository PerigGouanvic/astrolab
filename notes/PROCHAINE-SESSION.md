# Prochaine session astrolab — à ouvrir en premier

**Contexte** : clôture 2026-10-07 22h06, nuit après livraisons sidebar droite desktop + zoom cercle indépendant. Fil majeur ouvert : **marqueurs synastrie en urgence** (prérequis à une consultation réelle Perig↔consulté).

## 1. ⚡ URGENT — Marqueurs issus d'autres thèmes (synastrie)

**Pourquoi urgent** : sans ces marqueurs, une consultation co-évolutive n'a pas de forme pleine — on ne peut pas poser le ciel-du-moment sur le thème du consulté, ni mettre les planètes de Perig en regard des siennes. C'est le cœur du geste « circuit de retour au monde » pour ce projet (fiche `project_circuit_retour_au_monde.md`).

**Décisions déjà prises en clôture** :
- **Source du thème-autre en v1** = saisie manuelle date / heure / lieu (formulaire). Pas de JSON importable en v1.
- **Import JSON** = reporté, à garder dans les choses en suspens (format astrolab-export existe déjà via `wireDataExportImport`, mais c'est un snapshot d'app, pas un thème individuel — architecture à repenser).

**Décisions à trancher en ouverture** :
- **Rendu visuel** des marqueurs sur le cercle : options à discuter —
  - Bi-wheel (anneau extérieur dédié au thème-autre) ?
  - Marqueurs superposés sur le cercle courant avec couleur/forme distincte ?
  - Panneau latéral de légende ?
- **Granularité** : afficher les 10 planètes du thème-autre d'un bloc, ou activables une par une (comme la couche astéroïdes) ?
- **Nombre de thèmes-autres simultanés** : 1 seul (A posé sur B) ? Plusieurs ? Mécanisme de palette ?

**Fiche de référence déjà en mémoire** : `project_feature_synastrie_integree.md` — intention posée dès 2026-08. Granularité par planète déjà envisagée.

## 2. Pack triage mobile (loose ends restants)

- **Menu encombrant / sans hiérarchie** = refonte interne du sheet (essentiel visible / avancé repliable / rare dans un tiroir). V1-critique mobile. Déclenche aussi l'introduction du cran `mid-haut` noté dans `project_bottom_sheet_mobile_v1.md` et la section tailles personnalisables (`project_feature_section_configuration_tailles.md`).
- **Frise plus haute** = conséquence directe de la refonte du sheet (si chrome rétrécit, frise respire). Lié au #2 ci-dessus.

## 3. Mode voyage temporel en bougeant les planètes

Fiche détaillée : `memory/project_feature_mode_voyage_planetes.md`. À concevoir calmement, pas urgent.

## État technique à l'ouverture

- Branche `astrolab-2d`, commit à ouvrir = celui de "Jour 3 nuit" (sidebar + zoom cercle, 2026-10-07 22h).
- Cache-bust : `style.css?v=44`, `app.js?v=49`. À bumper au prochain changement.
- Serveur dev : `http://perig:8787/` (python http.server, probablement toujours up ; sinon `python3 -m http.server 8787` à la racine).
- Variables CSS introduites : `--sidebar-w: 360px` dans `:root`. Constantes JS : `CHART_ZOOM_MAX = 50`, `TL_ZOOM_MAX = 500` (ajustables si Perig trouve l'un ou l'autre trop plafonné).
- `state.chart = { zoom, cx, cy }` nouveau ; `state.timeline.zoom` existant. Les deux persistent en mémoire session mais **pas en localStorage** — rechargement = reset à zoom 1, centre 0,0.
