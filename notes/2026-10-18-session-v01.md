# Prochaine session astrolab — à ouvrir en premier

**Contexte** : session soir 2026-10-17 (18h → 22h). Fondation PWA livrée et déployée (`https://periggouanvic.github.io/astrolab/` sert maintenant la 2D, plus la 3D). GitHub Pages basculé sur la branche `astrolab-2d`. Deux chantiers sont en file d'attente — **APK/TWA est prioritaire** (passage à l'action demandé explicitement par Perig en clôture), le travail sur la feuille de route publique est pour une autre session.

**Lecture préalable minimale** (toutes sessions à venir, pas que ces deux-ci) :
- `./CLAUDE.md` (contexte branche `astrolab-2d`)
- `./memory/MEMORY.md` (index local — notamment les deux fiches ⚡⚡ posées hier soir)
- `./memory/feedback_biais_recence_archeologie.md` + `./memory/feedback_discussions_astro_vs_logiciel.md` (deux biais LLM observés, applicables à tout agent frais)
- `./memory/feedback_push_sans_permission.md`

**Dernier commit publié** : `e2c9234` « Jour 7 : versionner content/ ». Trois commits poussés dans la soirée (`98d4625` fondation PWA, `d4c1270` jalons/frise + bump cache, `e2c9234` content/).

**Fichiers restés en untracked volontairement** : `ROADMAP.md` (draft à retravailler — voir chantier B), `_souffle/`, `dev-server.py`, `dist/` (sans changement depuis plusieurs sessions, laissés tranquilles).

---

## Chantier A — ⚡⚡ Générer la TWA/APK Android (PRIORITAIRE)

Objectif pratique : installer une « vraie » app sur mobile (icône Kepler sur l'écran d'accueil, lancement plein écran sans barre d'adresse), tout en gardant les mises à jour qui se propagent automatiquement par le web (pas de redistribution d'APK à chaque itération).

**Technologie choisie** : TWA (Trusted Web Activity) via **Bubblewrap** (CLI officielle Google). Pas de Capacitor, pas de Cordova — hors scope et contraire aux décisions v1.

**Prérequis déjà posés** (vérifiables sur `periggouanvic.github.io/astrolab/`) : `manifest.json`, `service-worker.js`, `icons/` (192/512 standard + maskable + favicon-32), balises `<link rel="manifest">` + theme-color + enregistrement SW dans `index.html`.

**Déroulé attendu, dans l'ordre :**

1. **Vérifier l'environnement** : `node --version`, `java -version`, `which bubblewrap`, détection Android SDK. Rendre compte de ce qui est installé et ce qui manque. **Avant** d'installer quoi que ce soit de lourd (Android SDK = plusieurs centaines de Mo, Java JDK si absent), demander confirmation à Perig.

2. **Décision du package name** avec Perig : un identifier Android est **permanent** (change = nouvelle app du point de vue système). Options plausibles : `info.clpp.astrolab`, `com.periggouanvic.astrolab`, `page.github.periggouanvic.astrolab`. En discuter, Perig tranche.

3. **Keystore de signature** : à générer avec `keytool`, à **sauvegarder précieusement** (perte = plus jamais de mise à jour signée du même app, les utilisateurs doivent désinstaller/réinstaller). Proposer un chemin de sauvegarde + rappel verbal avant de passer à la suite.

4. **Digital Asset Links** : pour que Chrome fasse confiance au couplage APK ↔ PWA (sinon barre d'adresse visible dans la TWA), il faut publier `./.well-known/assetlinks.json` sur `periggouanvic.github.io/astrolab/`. Préparer le fichier, l'expliquer à Perig, le commiter avec lui.

5. **Génération APK** via `bubblewrap init` puis `bubblewrap build`.

6. **Hébergement du fichier APK** : GitHub Releases du repo `astrolab`, un tag v0.1.0 ou similaire, APK en asset téléchargeable. En discuter avant.

7. **Test sur mobile** : URL de téléchargement directe du `.apk`, installation (il faudra activer « sources inconnues » temporairement), vérifier que l'icône Kepler apparaît et que l'app s'ouvre en standalone.

**Règles non négociables** :
- Pas de commit sans aval explicite.
- Pas de push sans aval explicite.
- Pas d'installation massive (SDK, JDK) sans demander avant.
- Si un prompt de permission Agora échoue, fournir la commande CLI exacte (claude-perso ou claude-travail selon la hiérarchie du jsonl) pour que Perig reprenne la session dans un terminal.

**Commencer par la vérification d'environnement (point 1) et rendre compte à Perig avant d'agir.**

---

## Chantier B — Retouche du ROADMAP.md public (pour une autre session, pas celle-ci sauf si Perig le demande explicitement)

Le fichier `./ROADMAP.md` existe en draft untracked à la racine, posé par un agent lors de la session du 2026-10-17 soir avec deux erreurs structurelles maintenant documentées dans `./memory/feedback_biais_recence_archeologie.md` et `./memory/feedback_discussions_astro_vs_logiciel.md`.

**Option éditoriale choisie (A) le 2026-10-17** : le repo astrolab reste public sur GitHub, on « plante un drapeau d'antériorité » avec un ROADMAP.md daté qui expose les angles distinctifs du projet. Le repo est public depuis août 2026 de toute façon — autant transformer la fuite potentielle en antériorité horodatée.

**Ce qu'on a découvert à la fin de la session fondatrice** : en appliquant le filtre « est-ce que cet angle a une traduction logicielle concrète prévue ou réalisée ? » à Saturne/Uranus (pourtant celui que la mémoire décrit comme « arrêté »), on trouve **zéro trace** dans le code — ni preset, ni vocabulaire verrou/clef, ni soustraction pré-réglée. Même constat (a fortiori) pour Jupiter/Neptune et Mars/Pluton. Donc, en toute rigueur, **les trois angles éditoriaux doivent sortir du ROADMAP actuel** (ou y figurer avec statut explicite « axe de recherche personnel en cours de maturation, pas encore reflété dans le logiciel »). Le ROADMAP honnête parlerait alors de ce qui est **effectivement dans le code** : méthode soustractive (strates activables indépendamment), mi-points, astéroïdes à la demande, scrapbook co-évolutif indexé sur positions/moments, multi-natifs. C'est déjà distinctif, c'est plus modeste, c'est vrai.

**Déroulé attendu si Perig ouvre ce chantier :**

1. **Lire d'abord les deux fiches feedback** (`./memory/feedback_biais_recence_archeologie.md` et `./memory/feedback_discussions_astro_vs_logiciel.md`) — c'est la boussole.

2. **Archéologie obligatoire** — lire ensuite et **rendre compte** avec citations/résumés précis (pas juste « lu, OK ») :
   - Les deux brassages jsonl originels : `~/.claude/projects/-home-perig-projects/19945d01-8aca-465f-932d-0654f37bd1fc.jsonl` (2026-07-31) et `~/.claude/projects/-home-perig-projects/2292c589-7cb6-4318-995b-7b762647d0ac.jsonl` (2026-08-01)
   - Tout le dossier `./notes/` du projet
   - L'historique `git log` complet des deux branches (`astrolab-2d` ET `main`)
   - Puis seulement : `./CLAUDE.md`, `./README.md`, `./memory/MEMORY.md` et les fiches qu'il référence
   - Enfin : `./ROADMAP.md` (le draft à retoucher)

3. **Rapport d'archéologie** avant toute proposition — quelles idées originelles retrouvées, lesquelles sont dans le code aujourd'hui, lesquelles sont restées dormantes, lesquelles sonnent toujours justes. Trier avec Perig.

4. **Filtre astro/logiciel** systématique — pour chaque élément candidat au ROADMAP, demander explicitement : « est-ce qu'il a une traduction logicielle concrète prévue ou réalisée ? ». Si non → sort du ROADMAP et retourne en matière personnelle. Si oui → retravailler la formulation avec Perig. **Attention** : appliqué rigoureusement, ce filtre risque de faire sortir TOUT ce qui est actuellement dans le draft.

5. **Petites itérations** — 2 paragraphes max à la fois sans retour de Perig.

6. **Vocabulaire** — si pas sûr d'une formulation, demander à Perig comment il le dirait avant d'écrire. Pas de reformulation « neutre » qui aplatit.

7. **NE PAS COMMITER** le ROADMAP.md sans aval explicite. Le commit final sera un geste rituel de « plantage de drapeau ».

**Commencer par les deux fiches feedback (point 1), puis l'archéologie (point 2), puis rendre compte (point 3) avant de poser quoi que ce soit.**

---

## Autres fils ouverts, non prioritaires

- **Bascule Google Drive** (J3-J5 du plan v1 — OAuth + API + Picker + migration scrapbook depuis `localStorage`). Nécessaire pour résoudre structurellement le problème constaté le 2026-10-17 soir : les préférences UI (tailles glyphes, toggle couches, scrapbook) sont enfermées dans le `localStorage` par origine, donc perdues à chaque changement d'URL. Deuxième priorité après l'APK si Perig veut enchaîner.
- **Jalons** : actuellement aucun moyen UI de créer/éditer des jalons (ils sont uniquement versionnés via `content/jalons.json`). Report au moment de la bascule Drive, où Perig réimportera ce qu'il veut.
- **Convivialité mobile** (toujours en file, voir CLAUDE.md).
- **Zoom SVG sur région** (`viewBox`).
- **Capture mobile directe** (caméra + audio MediaRecorder).
